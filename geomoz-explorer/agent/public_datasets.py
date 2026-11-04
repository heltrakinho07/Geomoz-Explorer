"""Reviewed public global sources. A catalogue entry does not imply a live connection."""
from copy import deepcopy

CATALOGUE = [
    {"id": "WM/geoLab/geoBoundaries/600/ADM0", "name": "geoBoundaries ADM0 v6", "resolutionM": [],
     "coverage": "199 entidades administrativas; verificar presença do país", "period": "Edição 6.0.0, 2023",
     "license": "CC BY 4.0", "connection": "implemented", "uses": ["Limite nacional real para os novos motores públicos"],
     "limitations": "Limites cartográficos não cadastrais; nomenclatura/disputas segundo definições do produto."},
    {"id": "COPERNICUS/S2_SR_HARMONIZED", "name": "Sentinel-2 SR Harmonized", "resolutionM": [10, 20, 60],
     "coverage": "Terras emersas e zonas costeiras; sem garantia de observação válida em toda a AOI.",
     "period": "Desde 2017-03-28; cobertura 2017–2018 incompleta.",
     "license": "Copernicus Sentinel Data Terms", "connection": "implemented",
     "uses": ["Índices", "Estatísticas por área e limiar", "Diferença entre dois períodos"],
     "limitations": "Nuvens, sombras, neve, sazonalidade e resolução das bandas limitam a interpretação."},
    {"id": "ESA/WorldCover/v200", "name": "ESA WorldCover 2021", "resolutionM": [10],
     "coverage": "Cobertura terrestre global", "period": "2021 (produto estático)",
     "license": "CC BY 4.0", "connection": "implemented", "uses": ["Áreas por classe de cobertura"],
     "limitations": "Não representa a cobertura actual; não comparar v100 e v200 como mudança pura."},
    {"id": "ECMWF/ERA5_LAND/DAILY_AGGR", "name": "ERA5-Land Daily", "resolutionM": [11132],
     "coverage": "Superfícies terrestres globais", "period": "Desde 1950; verificar disponibilidade efectiva no pedido.",
     "license": "Copernicus C3S — atribuição requerida", "connection": "implemented",
     "uses": ["Precipitação acumulada", "Temperatura média do ar"],
     "limitations": "Reanálise modelada, não estação meteorológica nem previsão. Grelha grosseira para decisões locais."},
    {"id": "UCSB-CHG/CHIRPS/DAILY", "name": "CHIRPS v2 Daily", "resolutionM": [5566],
     "coverage": "Terra entre 50°S e 50°N", "period": "Desde 1981; verificar últimas datas disponíveis.",
     "license": "Domínio público — citar CHC/UCSB", "connection": "existing",
     "uses": ["Precipitação"], "limitations": "Cobertura quase global; usar outra fonte fora dos limites."},
    {"id": "GOOGLE/DYNAMICWORLD/V1", "name": "Dynamic World", "resolutionM": [10],
     "coverage": "Observações terrestres Sentinel-2", "period": "Desde 2015-06-27",
     "license": "CC BY 4.0", "connection": "catalogue_only", "uses": ["Classes e probabilidades de cobertura"],
     "limitations": "Modelo probabilístico; requer limiar e análise de cobertura válida antes de quantificar mudanças."},
    {"id": "COPERNICUS/DEM/GLO30_2024_1", "name": "Copernicus GLO-30 2024_1", "resolutionM": [30],
     "coverage": "Superfície terrestre; consultar termos e cobertura do fornecedor", "period": "Aquisições 2010–2020; edição 2024_1",
     "license": "Copernicus DEM licence", "connection": "catalogue_only",
     "uses": ["Relevo", "Declive", "Drenagem"],
     "limitations": "Modelo de superfície (DSM), não terreno nu. O motor de terreno existente ainda usa a edição anterior."},
    {"id": "JRC/GSW1_4/GlobalSurfaceWater", "name": "JRC Global Surface Water v1.4", "resolutionM": [30],
     "coverage": "Global, sujeita à cobertura Landsat", "period": "1984–2021",
     "license": "Copernicus — atribuição requerida", "connection": "catalogue_only",
     "uses": ["Ocorrência histórica de água superficial"],
     "limitations": "Não representa uma cheia actual nem água subterrânea. Máscaras e ausência de observação exigem tratamento."},
    {"id": "LANDSAT/LC08/C02/T1_L2", "name": "Landsat 8 Collection 2 L2", "resolutionM": [30],
     "coverage": "Cobertura terrestre mundial por cenas", "period": "Desde 2013",
     "license": "Domínio público USGS", "connection": "existing",
     "uses": ["Reflectância", "Índices espectrais"],
     "limitations": "Factores de escala e QA obrigatórios; temperatura pode não estar disponível em todas as cenas."},
]
for _dataset in CATALOGUE:
    _dataset["catalogUrl"] = "https://developers.google.com/earth-engine/datasets/catalog/" + _dataset["id"].replace("/", "_")


def source(asset):
    return deepcopy(next(row for row in CATALOGUE if row["id"] == asset))


def public_catalogue():
    return {"status": "success", "datasets": deepcopy(CATALOGUE),
            "source": "Catálogo público Earth Engine; metadados revistos em 2026-11-04",
            "summary": "Fontes públicas mundiais:\n" + "\n".join(
                f"- {row['name']}: {row['period']}; {row['coverage']} ({row['connection']})." for row in CATALOGUE),
            "warning": "Dados públicos não significam processamento Earth Engine sem custos. O acesso exige projecto GEE autorizado e cumprimento dos termos de cada fonte."}
