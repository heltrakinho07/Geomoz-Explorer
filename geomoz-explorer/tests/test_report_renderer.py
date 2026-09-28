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
                "result": {
                    "year": 2024,
                    "classes": [
                        {"id": 1, "label": "Muito Baixo", "color": "#d73027", "areaKm2": 10},
                        {"id": 2, "label": "Baixo", "color": "#fc8d59", "areaKm2": 15},
                        {"id": 3, "label": "Moderado", "color": "#fee08b", "areaKm2": 25},
                        {"id": 4, "label": "Alto", "color": "#91cf60", "areaKm2": 30},
                        {"id": 5, "label": "Muito Alto", "color": "#1a9850", "areaKm2": 20},
                    ],
                    "weights": [
                        {"key": "rainfall", "label": "Precipitação", "weight": 0.2, "favours": "alto"},
                    ],
                },
            }],
            "explanation": "Síntese final.",
        },
    }
    project = {"name": "Projecto Água"}

    html = render_output_html(output, project)

    assert "Identificar áreas prioritárias" in html
    assert "Potencial de água subterrânea" in html
    assert "50,0 km²" in html
    assert "50,0%" in html
    assert "Síntese final." in html



def test_groundwater_template_derives_priority_metrics() -> None:
    from report_renderer import render_output_html

    output = {
        "id": "gw-output",
        "type": "analysis_report",
        "title": "Potencial de Água Subterrânea",
        "description": "",
        "created_at": "2026-09-28T10:00:00+00:00",
        "content": {
            "analysis_type": "gee.groundwater",
            "parameters": {"year": 2024},
            "result": {
                "year": 2024,
                "source": "AHP · lineamentos+chuva+declive+drenagem+TWI+cobertura",
                "classes": [
                    {"id": 1, "label": "Muito Baixo", "color": "#d73027", "areaKm2": 10},
                    {"id": 2, "label": "Baixo", "color": "#fc8d59", "areaKm2": 20},
                    {"id": 3, "label": "Moderado", "color": "#fee08b", "areaKm2": 30},
                    {"id": 4, "label": "Alto", "color": "#91cf60", "areaKm2": 25},
                    {"id": 5, "label": "Muito Alto", "color": "#1a9850", "areaKm2": 15},
                ],
                "weights": [
                    {"key": "rainfall", "label": "Precipitação", "weight": 0.2, "favours": "alto"},
                ],
            },
            "job": {"completed_at": "2026-09-28T10:01:00+00:00"},
        },
    }

    html = render_output_html(output, {"name": "Projecto Água"})

    assert "Relatório de Potencial de Água Subterrânea" in html
    assert "40,0 km²" in html
    assert "40,0%" in html
    assert "Factores e pesos AHP" in html
    assert "favorabilidade hidrogeológica modelada" in html


def test_flood_template_uses_real_sar_metrics() -> None:
    from report_renderer import render_output_html

    output = {
        "id": "flood-output",
        "type": "analysis_report",
        "title": "Cheias",
        "description": "",
        "created_at": "2026-09-28T10:00:00+00:00",
        "content": {
            "analysis_type": "gee.flood",
            "parameters": {
                "event_start": "2026-01-10",
                "event_end": "2026-01-20",
            },
            "result": {
                "areaKm2": 123.45,
                "scenesEvent": 4,
                "scenesBaseline": 7,
                "eventStart": "2026-01-10",
                "eventEnd": "2026-01-20",
                "source": "sentinel-1",
            },
            "job": {"completed_at": "2026-01-21T10:00:00+00:00"},
        },
    }

    html = render_output_html(output, {"name": "Projecto Cheias"})

    assert "Relatório de Inundação Sentinel-1" in html
    assert "123,45 km²" in html
    assert "Cenas do evento" in html
    assert "exclusão de água" in html
    assert "estimativa por sensoriamento remoto" in html


def test_targeting_template_reports_favorability_not_discovery() -> None:
    from report_renderer import render_output_html

    output = {
        "id": "target-output",
        "type": "analysis_report",
        "title": "Targeting Ouro",
        "description": "",
        "created_at": "2026-09-28T10:00:00+00:00",
        "content": {
            "analysis_type": "gee.targeting",
            "parameters": {"mineral": "gold"},
            "result": {
                "mineral": "gold",
                "mineralName": "Ouro",
                "sceneCount": 9,
                "scoreThreshold": 0.7,
                "dateRange": "2023-01-01 → 2023-12-31",
                "formula": "0.40×a + 0.60×b",
                "weights": {"a": 0.4, "b": 0.6},
                "inverted": ["b"],
                "stats": {
                    "meanScore": 0.51,
                    "p95": 0.83,
                    "p99": 0.91,
                    "favorableKm2": 88.5,
                },
            },
            "job": {"completed_at": "2026-09-28T10:01:00+00:00"},
        },
    }

    html = render_output_html(output, {"name": "Projecto Mineração"})

    assert "Relatório de Targeting Mineral" in html
    assert "88,5 km²" in html
    assert "70%" in html
    assert "Favorabilidade mineral" in html
    assert "não evidência de ocorrência económica" in html


def test_watershed_template_identifies_hydrobasins_method() -> None:
    from report_renderer import render_output_html

    output = {
        "id": "basin-output",
        "type": "analysis_report",
        "title": "Bacia",
        "description": "",
        "created_at": "2026-09-28T10:00:00+00:00",
        "content": {
            "analysis_type": "gee.watershed",
            "parameters": {"lat": -17.8, "lon": 35.1, "level": 10},
            "result": {
                "areaKm2": 654.32,
                "pourPoint": [-17.8, 35.1],
                "level": 10,
                "source": "hydrobasins",
                "maxIter": 0,
            },
            "job": {"completed_at": "2026-09-28T10:01:00+00:00"},
        },
    }

    html = render_output_html(output, {"name": "Projecto Bacia"})

    assert "Relatório de Bacia Hidrográfica" in html
    assert "654,32 km²" in html
    assert "HydroBASINS" in html
    assert "Ponto de saída" in html
    assert "delimitação hidrológica" in html
