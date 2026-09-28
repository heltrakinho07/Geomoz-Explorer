"""Tests for the printable GeoMoz HTML report renderer."""

from __future__ import annotations


def test_render_analysis_report_escapes_user_content() -> None:
    from report_renderer import render_output_html

    output = {
        "id": "output-1",
        "type": "analysis_report",
        "title": "<script>alert(1)</script>",
        "description": "Descrição <b>não confiável</b>",
        "created_at": "2026-09-28T10:00:00+00:00",
        "content": {
            "analysis_type": "gee.index",
            "parameters": {"index": "ndvi"},
            "result": {"mean": 0.42},
            "explanation": "Resultado <img src=x onerror=alert(1)>",
            "job": {"completed_at": "2026-09-28T10:01:00+00:00"},
        },
    }
    project = {"name": "Projecto <Admin>"}

    html = render_output_html(output, project)

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<img src=x onerror=alert(1)>" not in html
    assert "&lt;img src=x onerror=alert(1)&gt;" in html
    assert "NDVI" in html or "ndvi" in html
    assert "0,4200" in html


def test_render_plan_report_contains_steps_and_goal() -> None:
    from report_renderer import render_output_html

    output = {
        "id": "output-plan-1",
        "type": "plan_report",
        "title": "Relatório Integrado",
        "description": "",
        "created_at": "2026-09-28T10:00:00+00:00",
        "content": {
            "plan": {
                "title": "Plano Água",
                "goal": "Identificar áreas prioritárias",
            },
            "analyses": [{
                "order": 1,
                "tool_id": "run_groundwater_ahp",
                "tool_name": "Potencial de água subterrânea",
                "purpose": "Classificar favorabilidade",
                "parameters": {"year": 2024},
                "result": {"high_pct": 18.2},
            }],
            "explanation": "Síntese final.",
        },
    }
    project = {"name": "Projecto Água"}

    html = render_output_html(output, project)

    assert "Identificar áreas prioritárias" in html
    assert "Potencial de água subterrânea" in html
    assert "18,2000" in html
    assert "Síntese final." in html
