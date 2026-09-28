"""Professional HTML report renderer for durable GeoMoz project outputs.

The renderer consumes only sanitized persistent outputs. It never requires a
live GEE tile and escapes every user/data value before rendering.
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


def _number(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _fmt_number(value: Any, decimals: int = 1, suffix: str = "") -> str:
    number = _number(value)
    if number is None:
        return "—"
    text = f"{number:,.{decimals}f}".replace(",", " ").replace(".", ",")
    return f"{text}{suffix}"


def _metric(label: str, value: Any, hint: str = "") -> str:
    hint_html = f'<small>{escape(hint)}</small>' if hint else ""
    return (
        '<div class="metric">'
        f'<span>{escape(label)}</span>'
        f'<strong>{escape(_scalar(value))}</strong>'
        f'{hint_html}'
        '</div>'
    )


def _section(title: str, body: str, css_class: str = "") -> str:
    cls = f' class="{escape(css_class)}"' if css_class else ""
    return f'<section{cls}><h2>{escape(title)}</h2>{body}</section>'


def _notice(text: str, kind: str = "info") -> str:
    return f'<div class="notice {escape(kind)}">{escape(text)}</div>'


def _narrative(text: Any) -> str:
    if not text:
        return '<p class="muted">Sem interpretação adicional guardada.</p>'
    safe = escape(str(text)).replace(chr(10), "<br>")
    return f'<div class="narrative">{safe}</div>'


def _render_mapping(data: dict[str, Any], depth: int = 0) -> str:
    if not data:
        return '<p class="muted">Sem dados adicionais.</p>'

    rows: list[str] = []
    for key, value in data.items():
        label = escape(str(key).replace("_", " ").title())
        if isinstance(value, dict) and depth < 2:
            rows.append(
                '<div class="nested">'
                f'<div class="nested-title">{label}</div>'
                f'{_render_mapping(value, depth + 1)}'
                '</div>'
            )
        elif isinstance(value, list):
            rows.append(
                '<div class="nested">'
                f'<div class="nested-title">{label}</div>'
                f'{_render_list(value, depth + 1)}'
                '</div>'
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


def _class_table(classes: list[dict[str, Any]], *, include_range: bool = False) -> str:
    if not classes:
        return '<p class="muted">Sem classes calculadas.</p>'

    headers = "<th>Classe</th><th>Área (km²)</th>"
    if include_range:
        headers += "<th>Intervalo</th>"

    rows: list[str] = []
    for item in classes:
        color = str(item.get("color") or "#94a3b8")
        label = escape(str(item.get("label") or item.get("id") or "—"))
        area = escape(_fmt_number(item.get("areaKm2"), 1))
        range_cell = (
            f'<td>{escape(str(item.get("range") or "—"))}</td>'
            if include_range else ""
        )
        rows.append(
            "<tr>"
            f'<td><span class="swatch" style="background:{escape(color)}"></span>{label}</td>'
            f"<td>{area}</td>"
            f"{range_cell}"
            "</tr>"
        )
    return (
        '<div class="table-wrap"><table>'
        f"<thead><tr>{headers}</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table></div>"
    )


def _weights_table(weights: Any) -> str:
    if not weights:
        return '<p class="muted">Sem pesos persistidos.</p>'

    rows: list[str] = []
    if isinstance(weights, dict):
        iterable = [
            {"key": key, "label": key, "weight": value}
            for key, value in weights.items()
        ]
    elif isinstance(weights, list):
        iterable = [item for item in weights if isinstance(item, dict)]
    else:
        iterable = []

    for item in iterable:
        weight = _number(item.get("weight"))
        pct = f"{weight * 100:.1f}%" if weight is not None else "—"
        rows.append(
            "<tr>"
            f"<td>{escape(str(item.get('label') or item.get('key') or '—'))}</td>"
            f"<td>{escape(pct)}</td>"
            f"<td>{escape(str(item.get('favours') or '—'))}</td>"
            "</tr>"
        )

    if not rows:
        return '<p class="muted">Sem pesos persistidos.</p>'
    return (
        '<div class="table-wrap"><table>'
        "<thead><tr><th>Factor</th><th>Peso</th><th>Favorece</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table></div>"
    )


def _study_area_section(content: dict[str, Any]) -> str:
    area = content.get("study_area") or {}
    if not isinstance(area, dict) or not any(area.values()):
        return ""

    location_parts = [
        str(value)
        for value in (area.get("district"), area.get("province"))
        if value
    ]
    location = " · ".join(location_parts) if location_parts else "—"

    return _section(
        "Área de estudo",
        '<div class="summary-grid">'
        + _metric("Designação", area.get("label") or "Área de estudo")
        + _metric("Tipo", area.get("kind") or "project")
        + _metric("Localização", location)
        + "</div>",
    )


def _job_identity(content: dict[str, Any]) -> str:
    job = content.get("job") or {}
    return _section(
        "Rastreabilidade",
        '<div class="summary-grid">'
        + _metric("Tipo", content.get("analysis_type") or "—")
        + _metric("Concluída", _fmt_date(job.get("completed_at")))
        + _metric("Executor", job.get("execution_mode") or "—")
        + "</div>",
    )


def _interpretation(content: dict[str, Any]) -> str:
    explanation = content.get("explanation")
    return _section("Interpretação técnica", _narrative(explanation)) if explanation else ""


def _groundwater_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}
    classes = [
        item for item in (result.get("classes") or [])
        if isinstance(item, dict)
    ]
    weights = result.get("weights") or []

    total_area = sum((_number(item.get("areaKm2")) or 0) for item in classes)
    high_area = sum(
        (_number(item.get("areaKm2")) or 0)
        for item in classes
        if int(item.get("id") or 0) in {4, 5}
    )
    high_pct = (high_area / total_area * 100) if total_area > 0 else None
    dominant = max(
        classes,
        key=lambda item: _number(item.get("areaKm2")) or 0,
        default=None,
    )

    body = _job_identity(content) + _study_area_section(content)
    body += _section(
        "Resumo executivo",
        '<div class="summary-grid four">'
        + _metric("Ano", result.get("year") or params.get("year") or "—")
        + _metric("Área analisada", _fmt_number(total_area, 1, " km²"))
        + _metric("Alta + Muito Alta", _fmt_number(high_area, 1, " km²"))
        + _metric(
            "Prioritária",
            _fmt_number(high_pct, 1, "%"),
            "classes 4 e 5 do modelo",
        )
        + "</div>"
        + (
            f'<p class="lead">A classe dominante no território analisado é '
            f'<strong>{escape(str(dominant.get("label")))}</strong>.</p>'
            if dominant else ""
        ),
    )
    body += _section("Distribuição do potencial", _class_table(classes))
    body += _section("Factores e pesos AHP", _weights_table(weights))
    body += _section(
        "Metodologia",
        '<p class="method">O GeoMoz combina seis factores hidrogeológicos: '
        'densidade de lineamentos, precipitação, declive, proximidade/densidade '
        'de drenagem, índice topográfico de humidade (TWI) e cobertura do solo. '
        'Cada factor é normalizado na área de estudo e agregado por sobreposição '
        'ponderada AHP; o índice final é classificado em cinco classes.</p>'
        f'<div class="source">Fonte do modelo: {escape(str(result.get("source") or "AHP GeoMoz"))}</div>',
    )
    body += _section("Parâmetros de execução", _render_mapping(params))
    body += _interpretation(content)
    body += _notice(
        "O resultado representa favorabilidade hidrogeológica modelada, não a "
        "confirmação de água subterrânea nem a profundidade/vazão de um furo. "
        "A selecção final de locais requer validação hidrogeológica e de campo.",
        "warning",
    )
    return body


def _flood_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}

    body = _job_identity(content) + _study_area_section(content)
    body += _section(
        "Resumo do evento",
        '<div class="summary-grid four">'
        + _metric("Área detectada", _fmt_number(result.get("areaKm2"), 2, " km²"))
        + _metric("Cenas do evento", result.get("scenesEvent") or 0)
        + _metric("Cenas baseline", result.get("scenesBaseline") or 0)
        + _metric("Sensor", "Sentinel-1 SAR")
        + "</div>"
        '<div class="period">'
        f'<strong>Período:</strong> {escape(str(result.get("eventStart") or params.get("event_start") or "—"))}'
        ' → '
        f'{escape(str(result.get("eventEnd") or params.get("event_end") or "—"))}'
        '</div>',
    )
    body += _section(
        "Metodologia",
        '<p class="method">A detecção usa mudança no retroespalhamento VV do '
        'Sentinel-1 entre uma linha de base e o período do evento. O processamento '
        'aplica suavização espacial, limiar de mudança SAR, exclusão de água '
        'permanente JRC, filtro de declive inferior a 5° e conectividade mínima '
        'para reduzir ruído isolado.</p>'
        f'<div class="source">Fonte: {escape(str(result.get("source") or "sentinel-1"))}</div>',
    )
    body += _section("Parâmetros de execução", _render_mapping(params))
    body += _interpretation(content)
    body += _notice(
        "A área detectada é uma estimativa por sensoriamento remoto. Vegetação "
        "densa, geometria SAR, ausência de cenas adequadas e alterações de "
        "superfície podem afectar a classificação; resultados críticos devem "
        "ser verificados com observações locais ou fontes independentes.",
        "warning",
    )
    return body


def _targeting_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}
    stats = result.get("stats") or {}
    threshold = _number(result.get("scoreThreshold"))
    threshold_pct = threshold * 100 if threshold is not None else None
    weights = result.get("weights") or {}

    body = _job_identity(content) + _study_area_section(content)
    body += _section(
        "Resumo de favorabilidade",
        '<div class="summary-grid four">'
        + _metric("Alvo", result.get("mineralName") or result.get("mineral") or "—")
        + _metric("Cenas utilizadas", result.get("sceneCount") or 0)
        + _metric("Limiar", _fmt_number(threshold_pct, 0, "%"))
        + _metric("Área favorável", _fmt_number(stats.get("favorableKm2"), 1, " km²"))
        + "</div>"
        '<div class="summary-grid">'
        + _metric("Score médio", _fmt_number((_number(stats.get("meanScore")) or 0) * 100, 1, "%") if stats.get("meanScore") is not None else "—")
        + _metric("P95", _fmt_number((_number(stats.get("p95")) or 0) * 100, 1, "%") if stats.get("p95") is not None else "—")
        + _metric("P99", _fmt_number((_number(stats.get("p99")) or 0) * 100, 1, "%") if stats.get("p99") is not None else "—")
        + "</div>",
    )
    body += _section("Pesos do modelo", _weights_table(weights))
    inverted = result.get("inverted") or []
    if inverted:
        body += _section(
            "Critérios invertidos",
            '<div class="tags">'
            + "".join(f'<span class="tag">{escape(str(item))}</span>' for item in inverted)
            + "</div>",
        )
    body += _section(
        "Metodologia",
        '<p class="method">O targeting mineral combina critérios espectrais, '
        'topográficos e/ou estruturais normalizados numa superfície de score '
        'ponderado. O preset do mineral define os pesos e quais critérios são '
        'invertidos. A área favorável corresponde aos pixels cujo score excede '
        'o limiar configurado.</p>'
        f'<div class="source">Fórmula persistida: {escape(str(result.get("formula") or "—"))}</div>'
        f'<div class="source">Período: {escape(str(result.get("dateRange") or "—"))}</div>',
    )
    body += _section("Parâmetros de execução", _render_mapping(params))
    body += _interpretation(content)
    body += _notice(
        "Favorabilidade mineral é um indicador de priorização de alvos, não "
        "evidência de ocorrência económica. A interpretação deve ser integrada "
        "com geologia, geoquímica, geofísica e verificação de campo.",
        "warning",
    )
    return body


def _watershed_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}
    source = str(result.get("source") or ("d8" if result.get("maxIter") else "hydrobasins"))
    pour = result.get("pourPoint") or []
    point_label = "—"
    if isinstance(pour, list) and len(pour) >= 2:
        point_label = f"{pour[0]}, {pour[1]}"

    method = (
        "HydroBASINS/HydroATLAS: selecção da sub-bacia que contém o ponto de saída."
        if source == "hydrobasins"
        else (
            "Delineação D8 com HydroSHEDS: o ponto é ajustado a um canal próximo "
            "e a contribuição a montante é propagada iterativamente pela direcção de fluxo."
        )
    )

    body = _job_identity(content) + _study_area_section(content)
    body += _section(
        "Resumo da bacia",
        '<div class="summary-grid four">'
        + _metric("Área", _fmt_number(result.get("areaKm2"), 2, " km²"))
        + _metric("Ponto de saída", point_label)
        + _metric("Método", "HydroBASINS" if source == "hydrobasins" else "D8 HydroSHEDS")
        + _metric("Nível", result.get("level") or params.get("level") or "—")
        + "</div>",
    )
    body += _section(
        "Metodologia",
        f'<p class="method">{escape(method)}</p>'
        + (
            f'<div class="source">Iterações D8: {escape(_scalar(result.get("maxIter")))}</div>'
            if source != "hydrobasins" else ""
        ),
    )
    body += _section("Parâmetros de execução", _render_mapping(params))
    body += _interpretation(content)
    body += _notice(
        "O limite representa uma delimitação hidrológica baseada na base de dados "
        "seleccionada e na resolução do modelo. Aplicações de engenharia ou "
        "dimensionamento hidráulico exigem DEM/drenagem adequados à escala do projecto.",
        "warning",
    )
    return body


def _erosion_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}
    classes = [
        item for item in (result.get("classes") or [])
        if isinstance(item, dict)
    ]

    total_area = sum((_number(item.get("areaKm2")) or 0) for item in classes)
    high_area = sum(
        (_number(item.get("areaKm2")) or 0)
        for item in classes
        if int(item.get("id") or 0) in {4, 5}
    )
    high_pct = (high_area / total_area * 100) if total_area > 0 else None

    body = _job_identity(content) + _study_area_section(content)
    body += _section(
        "Resumo de risco de erosão",
        '<div class="summary-grid four">'
        + _metric("Ano", result.get("year") or params.get("year") or "—")
        + _metric("Perda média", _fmt_number(result.get("meanTPerHa"), 2, " t/ha/ano"))
        + _metric("Área analisada", _fmt_number(total_area, 1, " km²"))
        + _metric("Alta + Muito Alta", _fmt_number(high_pct, 1, "%"))
        + "</div>",
    )
    body += _section(
        "Distribuição das classes",
        _class_table(classes, include_range=True),
    )
    body += _section(
        "Metodologia",
        '<p class="method">O GeoMoz aplica a equação RUSLE '
        '<strong>A = R × K × LS × C × P</strong> para estimar perda potencial '
        'de solo. Nesta implementação, a erosividade da chuva (R) deriva de '
        'CHIRPS, a erodibilidade do solo (K) usa um valor de referência constante, '
        'o factor LS deriva do relevo Copernicus DEM e o factor C é estimado a '
        'partir de NDVI MODIS. O resultado é classificado em cinco classes de risco.</p>'
        f'<div class="source">Fonte do modelo: {escape(str(result.get("source") or "RUSLE GeoMoz"))}</div>',
    )
    body += _section("Parâmetros de execução", _render_mapping(params))
    body += _interpretation(content)
    body += _notice(
        "RUSLE estima perda potencial média de solo e não substitui medições "
        "locais. O uso de K constante e a ausência de práticas de conservação "
        "espacialmente detalhadas podem introduzir incerteza; aplicações de "
        "engenharia devem calibrar factores com dados locais.",
        "warning",
    )
    return body


def _index_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}
    group = str(result.get("group") or "index")

    body = _job_identity(content) + _study_area_section(content)
    body += _section(
        "Resumo do índice",
        '<div class="summary-grid four">'
        + _metric("Índice", result.get("name") or params.get("index") or "—")
        + _metric("Grupo", group)
        + _metric("Cenas", result.get("sceneCount") or 0)
        + _metric("Período", result.get("dateRange") or "—")
        + "</div>",
    )
    body += _section(
        "Definição técnica",
        '<div class="summary-grid">'
        + _metric("Fórmula", result.get("formula") or "—")
        + _metric("Bandas", result.get("bands") or "—")
        + _metric(
            "Classificação",
            "Disponível" if result.get("classNames") else "Contínua",
        )
        + "</div>"
        + (
            _section(
                "Classes",
                _render_list(result.get("classNames") or []),
            )
            if result.get("classNames")
            else ""
        ),
    )
    stats = result.get("stats")
    if isinstance(stats, dict) and stats:
        body += _section("Estatísticas", _render_mapping(stats))

    body += _section("Parâmetros de execução", _render_mapping(params))
    body += _interpretation(content)
    body += _notice(
        "Índices espectrais e derivados são indicadores biofísicos ou temáticos. "
        "A interpretação depende do sensor, período, cobertura de nuvens, "
        "resolução espacial, condições atmosféricas e contexto local. "
        "Valores semelhantes podem representar processos diferentes.",
        "warning",
    )
    return body


def _generic_analysis_report(content: dict[str, Any]) -> str:
    params = content.get("parameters") or {}
    result = content.get("result") or {}

    return (
        _job_identity(content)
        + _study_area_section(content)
        + _section("Parâmetros", _render_mapping(params if isinstance(params, dict) else {}))
        + _section("Resultados", _render_mapping(result if isinstance(result, dict) else {}))
        + _interpretation(content)
    )


def _analysis_type_from_tool(tool_id: Any) -> str:
    mapping = {
        "run_groundwater_ahp": "gee.groundwater",
        "detect_flood": "gee.flood",
        "run_mineral_targeting": "gee.targeting",
        "delineate_watershed": "gee.watershed",
        "calculate_erosion_risk": "gee.erosion",
        "calculate_index": "gee.index",
    }
    return mapping.get(str(tool_id), str(tool_id or ""))


def _analysis_body(content: dict[str, Any]) -> str:
    analysis_type = str(content.get("analysis_type") or "")
    if analysis_type == "gee.groundwater":
        return _groundwater_report(content)
    if analysis_type == "gee.flood":
        return _flood_report(content)
    if analysis_type == "gee.targeting":
        return _targeting_report(content)
    if analysis_type == "gee.watershed":
        return _watershed_report(content)
    if analysis_type == "gee.erosion":
        return _erosion_report(content)
    if analysis_type == "gee.index":
        return _index_report(content)
    return _generic_analysis_report(content)


def _plan_report(content: dict[str, Any]) -> str:
    plan = content.get("plan") or {}
    analyses = content.get("analyses") or []
    explanation = content.get("explanation")

    overview = _study_area_section(content) + _section(
        "Objectivo",
        _narrative(plan.get("goal") or "—")
        + '<div class="summary-grid">'
        + _metric("Etapas", len(analyses) if isinstance(analyses, list) else 0)
        + _metric("Criado", _fmt_date(plan.get("created_at")))
        + _metric("Concluído", _fmt_date(plan.get("completed_at")))
        + "</div>",
    )

    cards: list[str] = []
    for analysis in analyses[:20] if isinstance(analyses, list) else []:
        if not isinstance(analysis, dict):
            continue

        nested_content = {
            "analysis_type": _analysis_type_from_tool(analysis.get("tool_id")),
            "parameters": analysis.get("parameters") or {},
            "result": analysis.get("result") or {},
            "job": {
                "completed_at": analysis.get("completed_at"),
                "execution_mode": "analysis_plan",
            },
        }
        cards.append(
            '<article class="analysis-card plan-step">'
            '<div class="analysis-head">'
            f'<span>Etapa {escape(_scalar(analysis.get("order")))}</span>'
            f'<strong>{escape(str(analysis.get("tool_name") or analysis.get("tool_id") or "Análise"))}</strong>'
            '</div>'
            f'<p class="purpose">{escape(str(analysis.get("purpose") or ""))}</p>'
            f'{_analysis_body(nested_content)}'
            '</article>'
        )

    synthesis = (
        _section("Síntese integrada", _narrative(explanation))
        if explanation else ""
    )
    return (
        overview
        + _section(
            "Análises executadas",
            "".join(cards) or '<p class="muted">Sem análises registadas.</p>',
        )
        + synthesis
        + _notice(
            "A síntese de um plano integra outputs de modelos diferentes. "
            "Resultados só devem ser comparados quando as suas escalas, datas, "
            "fontes e pressupostos forem compatíveis.",
            "info",
        )
    )


def _report_label(output_type: Any, content: dict[str, Any]) -> str:
    if output_type == "plan_report":
        return "Relatório Integrado GeoMoz"
    mapping = {
        "gee.groundwater": "Relatório de Potencial de Água Subterrânea",
        "gee.flood": "Relatório de Inundação Sentinel-1",
        "gee.targeting": "Relatório de Targeting Mineral",
        "gee.watershed": "Relatório de Bacia Hidrográfica",
        "gee.erosion": "Relatório de Risco de Erosão RUSLE",
        "gee.index": "Relatório de Índice Geoespacial",
    }
    return mapping.get(str(content.get("analysis_type") or ""), "Relatório de Análise")


def render_output_html(output: dict[str, Any], project: dict[str, Any]) -> str:
    """Render one sanitized output as a self-contained printable HTML report."""
    title = escape(str(output.get("title") or "Relatório GeoMoz"))
    project_name = escape(str(project.get("name") or "Projecto GeoMoz"))
    description = escape(str(output.get("description") or ""))
    output_type = output.get("type")
    content = output.get("content") or {}

    if output_type == "plan_report":
        body = _plan_report(content)
    else:
        body = _analysis_body(content)

    type_label = _report_label(output_type, content)

    return f"""<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: light; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --accent:#0284c7; --navy:#07111f; }}
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
  .analysis-card section {{ margin-bottom:18px; }}
  h2 {{ font-size:14px; text-transform:uppercase; letter-spacing:.08em; color:#334155; border-bottom:1px solid var(--line); padding-bottom:8px; margin:0 0 14px; }}
  .analysis-card h2 {{ font-size:11px; }}
  h3 {{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin:16px 0 8px; }}
  .summary-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px; }}
  .summary-grid.four {{ grid-template-columns:repeat(4,1fr); }}
  .metric {{ background:#f8fafc; border:1px solid var(--line); border-radius:10px; padding:12px; }}
  .metric span {{ display:block; color:var(--muted); font-size:10px; text-transform:uppercase; }}
  .metric strong {{ display:block; margin-top:5px; font-size:14px; }}
  .metric small {{ display:block; margin-top:3px; color:#94a3b8; font-size:9px; line-height:1.35; }}
  .lead {{ font-size:13px; line-height:1.7; color:#475569; }}
  .kv {{ display:grid; grid-template-columns:minmax(140px,.7fr) 1.3fr; gap:16px; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }}
  .key {{ color:var(--muted); }}
  .value {{ font-weight:600; overflow-wrap:anywhere; }}
  .nested {{ border:1px solid var(--line); border-radius:10px; padding:12px; margin:8px 0; }}
  .nested-title {{ font-size:11px; font-weight:700; color:#334155; margin-bottom:6px; }}
  .list-card,.analysis-card {{ border:1px solid var(--line); border-radius:12px; padding:14px; margin:10px 0; break-inside:avoid; }}
  .plan-step {{ border-left:3px solid #8b5cf6; }}
  .list-card {{ display:flex; gap:12px; }}
  .list-index {{ color:var(--accent); font-weight:800; font-size:11px; }}
  .list-body {{ flex:1; min-width:0; }}
  .list-simple {{ padding:7px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }}
  .analysis-head {{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:6px; }}
  .analysis-head span {{ color:#7c3aed; font-size:10px; font-weight:700; text-transform:uppercase; }}
  .analysis-head strong {{ font-size:13px; }}
  .purpose,.muted,.method {{ color:var(--muted); font-size:12px; line-height:1.65; }}
  .method {{ color:#475569; }}
  .source {{ margin-top:8px; padding:8px 10px; background:#f8fafc; border-radius:8px; color:#64748b; font-size:10px; overflow-wrap:anywhere; }}
  .narrative {{ background:#f8fafc; border-left:3px solid var(--accent); padding:14px 16px; font-size:12px; line-height:1.7; }}
  .period {{ margin-top:8px; color:#475569; font-size:12px; }}
  .notice {{ margin:18px 0 28px; border-radius:10px; padding:12px 14px; font-size:11px; line-height:1.6; break-inside:avoid; }}
  .notice.warning {{ background:#fffbeb; border:1px solid #fde68a; color:#92400e; }}
  .notice.info {{ background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; }}
  .table-wrap {{ overflow-x:auto; border:1px solid var(--line); border-radius:10px; }}
  table {{ width:100%; border-collapse:collapse; font-size:11px; }}
  th {{ text-align:left; color:#64748b; background:#f8fafc; font-size:9px; text-transform:uppercase; letter-spacing:.06em; padding:9px 10px; }}
  td {{ padding:9px 10px; border-top:1px solid #f1f5f9; vertical-align:top; }}
  .swatch {{ display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:7px; vertical-align:middle; border:1px solid rgba(15,23,42,.12); }}
  .tags {{ display:flex; flex-wrap:wrap; gap:6px; }}
  .tag {{ border-radius:999px; background:#f1f5f9; padding:5px 8px; font-size:10px; color:#475569; }}
  footer {{ padding:16px 44px 24px; color:#94a3b8; font-size:10px; border-top:1px solid var(--line); line-height:1.5; }}
  @media (max-width:700px) {{ .page{{margin:0;border:0;}} header,main,footer{{padding-left:22px;padding-right:22px;}} .summary-grid,.summary-grid.four{{grid-template-columns:1fr 1fr;}} .kv{{grid-template-columns:1fr;gap:3px;}} }}
  @media print {{ body{{background:white;}} .page{{width:100%;margin:0;border:0;box-shadow:none;}} header{{-webkit-print-color-adjust:exact;print-color-adjust:exact;}} .notice,.metric,.swatch{{-webkit-print-color-adjust:exact;print-color-adjust:exact;}} @page{{size:A4;margin:12mm;}} }}
</style>
</head>
<body>
<div class="page">
<header>
  <div class="brand">GeoMoz Explorer · Geolithica</div>
  <h1>{title}</h1>
  <div class="subtitle">{escape(type_label)}{f" · {description}" if description else ""}</div>
  <div class="project">
    <span class="chip">{project_name}</span>
    <span class="chip">Gerado em {_fmt_date(output.get("created_at"))}</span>
    <span class="chip">ID {escape(str(output.get("id") or "")[:12])}</span>
  </div>
</header>
<main>{body}</main>
<footer>
  GeoMoz Explorer · Relatório gerado a partir de evidência persistida no Project.
  Os resultados devem ser interpretados de acordo com a resolução, fonte, período,
  pressupostos do modelo e objectivo da análise. Quando aplicável, recomenda-se validação de campo.
</footer>
</div>
</body>
</html>"""
