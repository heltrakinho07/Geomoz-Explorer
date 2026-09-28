"""HTML report renderer for durable GeoMoz project outputs.

No external templating dependency is required. The renderer only consumes
sanitized project outputs and escapes every user/data value before rendering.
"""

from __future__ import annotations

from datetime import datetime
from html import escape
import json
from typing import Any


def _fmt_date(value: Any) -> str:
    if not value:
        return "—"
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(value)


def _scalar(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Sim" if value else "Não"
    if isinstance(value, float):
        return f"{value:,.4f}".replace(",", " ").replace(".", ",")
    if isinstance(value, (int, str)):
        return str(value)
    return json.dumps(value, ensure_ascii=False, default=str)


def _render_mapping(data: dict[str, Any], depth: int = 0) -> str:
    if not data:
        return '<p class="muted">Sem dados adicionais.</p>'

    rows: list[str] = []
    for key, value in data.items():
        label = escape(str(key).replace("_", " ").title())
        if isinstance(value, dict) and depth < 2:
            rendered = _render_mapping(value, depth + 1)
            rows.append(
                f'<div class="nested"><div class="nested-title">{label}</div>{rendered}</div>'
            )
        elif isinstance(value, list):
            rendered = _render_list(value, depth + 1)
            rows.append(
                f'<div class="nested"><div class="nested-title">{label}</div>{rendered}</div>'
            )
        else:
            rows.append(
                '<div class="kv">'
                f'<div class="key">{label}</div>'
                f'<div class="value">{escape(_scalar(value))}</div>'
                '</div>'
            )
    return "".join(rows)


def _render_list(items: list[Any], depth: int = 0) -> str:
    if not items:
        return '<p class="muted">Sem itens.</p>'

    rendered: list[str] = []
    for index, item in enumerate(items[:50], start=1):
        if isinstance(item, dict):
            rendered.append(
                '<div class="list-card">'
                f'<div class="list-index">{index:02d}</div>'
                f'<div class="list-body">{_render_mapping(item, depth + 1)}</div>'
                '</div>'
            )
        else:
            rendered.append(
                f'<div class="list-simple">{escape(_scalar(item))}</div>'
            )
    return "".join(rendered)


def _analysis_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}
    explanation = content.get("explanation")
    job = content.get("job") or {}

    interpretation = ""
    if explanation:
        interpretation = (
            '<section>'
            '<h2>Interpretação</h2>'
            f'<div class="narrative">{escape(str(explanation)).replace(chr(10), "<br>")}</div>'
            '</section>'
        )

    return (
        '<section>'
        '<h2>Identificação da análise</h2>'
        '<div class="summary-grid">'
        f'<div class="metric"><span>Tipo</span><strong>{escape(str(content.get("analysis_type") or "—"))}</strong></div>'
        f'<div class="metric"><span>Concluída</span><strong>{escape(_fmt_date(job.get("completed_at")))}</strong></div>'
        f'<div class="metric"><span>Executor</span><strong>{escape(str(job.get("execution_mode") or "—"))}</strong></div>'
        '</div>'
        '</section>'
        '<section>'
        '<h2>Parâmetros</h2>'
        f'{_render_mapping(params if isinstance(params, dict) else {})}'
        '</section>'
        '<section>'
        '<h2>Resultados</h2>'
        f'{_render_mapping(result if isinstance(result, dict) else {})}'
        '</section>'
        f'{interpretation}'
    )


def _plan_report(content: dict[str, Any]) -> str:
    plan = content.get("plan") or {}
    analyses = content.get("analyses") or []
    explanation = content.get("explanation")

    cards = []
    for analysis in analyses[:20] if isinstance(analyses, list) else []:
        if not isinstance(analysis, dict):
            continue
        cards.append(
            '<article class="analysis-card">'
            '<div class="analysis-head">'
            f'<span>Etapa {escape(_scalar(analysis.get("order")))}</span>'
            f'<strong>{escape(str(analysis.get("tool_name") or analysis.get("tool_id") or "Análise"))}</strong>'
            '</div>'
            f'<p class="purpose">{escape(str(analysis.get("purpose") or ""))}</p>'
            '<h3>Parâmetros</h3>'
            f'{_render_mapping(analysis.get("parameters") or {})}'
            '<h3>Resultado</h3>'
            f'{_render_mapping(analysis.get("result") or {})}'
            '</article>'
        )

    interpretation = ""
    if explanation:
        interpretation = (
            '<section>'
            '<h2>Síntese integrada</h2>'
            f'<div class="narrative">{escape(str(explanation)).replace(chr(10), "<br>")}</div>'
            '</section>'
        )

    return (
        '<section>'
        '<h2>Objectivo</h2>'
        f'<div class="narrative">{escape(str(plan.get("goal") or "—"))}</div>'
        '</section>'
        '<section>'
        '<h2>Análises executadas</h2>'
        f'{"".join(cards) or "<p class=\"muted\">Sem análises registadas.</p>"}'
        '</section>'
        f'{interpretation}'
    )


def render_output_html(output: dict[str, Any], project: dict[str, Any]) -> str:
    """Render one sanitized output as a self-contained printable HTML report."""
    title = escape(str(output.get("title") or "Relatório GeoMoz"))
    project_name = escape(str(project.get("name") or "Projecto GeoMoz"))
    description = escape(str(output.get("description") or ""))
    output_type = output.get("type")
    content = output.get("content") or {}

    if output_type == "plan_report":
        body = _plan_report(content)
        type_label = "Relatório Integrado"
    else:
        body = _analysis_report(content)
        type_label = "Relatório de Análise"

    return f"""<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: light; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --accent:#0284c7; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:Inter,Arial,sans-serif; color:var(--ink); background:#f8fafc; }}
  .page {{ width:min(100%, 960px); margin:24px auto; background:white; border:1px solid var(--line); box-shadow:0 12px 40px rgba(15,23,42,.08); }}
  header {{ padding:36px 44px 28px; background:linear-gradient(135deg,#07111f,#0d2740); color:white; }}
  .brand {{ font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:#7dd3fc; font-weight:700; }}
  h1 {{ margin:12px 0 6px; font-size:28px; line-height:1.15; }}
  .subtitle {{ color:#cbd5e1; font-size:13px; }}
  .project {{ margin-top:18px; display:flex; gap:8px; flex-wrap:wrap; }}
  .chip {{ border:1px solid rgba(255,255,255,.18); border-radius:999px; padding:6px 10px; font-size:11px; color:#e2e8f0; }}
  main {{ padding:32px 44px 44px; }}
  section {{ margin:0 0 28px; break-inside:avoid; }}
  h2 {{ font-size:14px; text-transform:uppercase; letter-spacing:.08em; color:#334155; border-bottom:1px solid var(--line); padding-bottom:8px; margin:0 0 14px; }}
  h3 {{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin:16px 0 8px; }}
  .summary-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }}
  .metric {{ background:#f8fafc; border:1px solid var(--line); border-radius:10px; padding:12px; }}
  .metric span {{ display:block; color:var(--muted); font-size:10px; text-transform:uppercase; }}
  .metric strong {{ display:block; margin-top:5px; font-size:13px; }}
  .kv {{ display:grid; grid-template-columns:minmax(140px, .7fr) 1.3fr; gap:16px; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }}
  .key {{ color:var(--muted); }}
  .value {{ font-weight:600; overflow-wrap:anywhere; }}
  .nested {{ border:1px solid var(--line); border-radius:10px; padding:12px; margin:8px 0; }}
  .nested-title {{ font-size:11px; font-weight:700; color:#334155; margin-bottom:6px; }}
  .list-card,.analysis-card {{ border:1px solid var(--line); border-radius:12px; padding:14px; margin:10px 0; break-inside:avoid; }}
  .list-card {{ display:flex; gap:12px; }}
  .list-index {{ color:var(--accent); font-weight:800; font-size:11px; }}
  .list-body {{ flex:1; min-width:0; }}
  .list-simple {{ padding:7px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }}
  .analysis-head {{ display:flex; gap:10px; align-items:center; justify-content:space-between; }}
  .analysis-head span {{ color:var(--accent); font-size:10px; font-weight:700; text-transform:uppercase; }}
  .analysis-head strong {{ font-size:13px; }}
  .purpose,.muted {{ color:var(--muted); font-size:12px; line-height:1.6; }}
  .narrative {{ background:#f8fafc; border-left:3px solid var(--accent); padding:14px 16px; font-size:12px; line-height:1.7; }}
  footer {{ padding:16px 44px 24px; color:#94a3b8; font-size:10px; border-top:1px solid var(--line); }}
  @media (max-width:700px) {{ .page{{margin:0;border:0;}} header,main,footer{{padding-left:22px;padding-right:22px;}} .summary-grid{{grid-template-columns:1fr;}} .kv{{grid-template-columns:1fr;gap:3px;}} }}
  @media print {{ body{{background:white;}} .page{{width:100%;margin:0;border:0;box-shadow:none;}} @page{{size:A4;margin:12mm;}} }}
</style>
</head>
<body>
<div class="page">
<header>
  <div class="brand">GeoMoz Explorer · Geolithica</div>
  <h1>{title}</h1>
  <div class="subtitle">{type_label}{f" · {description}" if description else ""}</div>
  <div class="project">
    <span class="chip">{project_name}</span>
    <span class="chip">Gerado em {_fmt_date(output.get("created_at"))}</span>
    <span class="chip">ID {escape(str(output.get("id") or "")[:12])}</span>
  </div>
</header>
<main>{body}</main>
<footer>
  GeoMoz Explorer · Relatório gerado a partir de evidência persistida no Project.
  Indicadores de sensoriamento remoto, favorabilidade e risco requerem interpretação técnica e, quando aplicável, validação de campo.
</footer>
</div>
</body>
</html>"""
