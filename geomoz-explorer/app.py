"""
GeoMoz Explorer — WebGIS platform for Mozambique.
Run with: streamlit run app.py
"""

import streamlit as st
from streamlit_folium import st_folium
import folium
import geopandas as gpd
import pandas as pd

from utils.data_loader import (
    load_provinces,
    load_districts,
    load_admin_posts,
    load_villages,
    load_geology,
    get_province_names,
    get_districts_for_province,
    get_district_names,
    filter_geology_by_area,
    _find_col,
)
from utils.mapping import (
    create_base_map,
    add_province_layer,
    add_district_layer,
    add_admin_post_layer,
    add_village_layer,
    add_geology_layer,
    add_selected_area_layer,
    build_geology_legend,
)
from utils.analysis import calculate_geology_stats, summarise_geology
from utils.export import map_to_html, dataframe_to_csv, geodataframe_to_geojson

# ── page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="GeoMoz Explorer",
    page_icon="🌍",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── header ─────────────────────────────────────────────────────────────────────
st.title("🌍 GeoMoz Explorer")
st.markdown(
    "Plataforma WebGIS para visualização e análise de dados geoespaciais de **Moçambique**. "
    "Explore camadas administrativas e geológicas, selecione áreas e exporte resultados."
)

# ── sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Configurações")

    # Basemap selection
    basemap = st.selectbox(
        "Mapa base",
        ["CartoDB Positron", "OpenStreetMap", "CartoDB Dark Matter"],
        index=0,
    )

    st.divider()
    st.subheader("🗂️ Camadas")

    show_provinces = st.checkbox("Províncias", value=True)
    show_districts = st.checkbox("Distritos", value=False)
    show_admin_posts = st.checkbox("Postos Administrativos", value=False)
    show_villages = st.checkbox("Aldeias", value=False)
    show_geology = st.checkbox("Geologia", value=True)

    geology_color_by = "code2006"
    if show_geology:
        geology_color_by = st.selectbox(
            "Colorir geologia por",
            ["code2006", "Legend", "ERA", "PERIOD"],
            index=0,
        )

    st.divider()
    st.subheader("📍 Seleção de Área")

    filter_mode = st.radio(
        "Filtrar por",
        ["Nenhum", "Província", "Distrito"],
        index=0,
    )

    selected_province = None
    selected_district = None
    province_gdf = None
    district_filter_gdf = None

# ── load data ──────────────────────────────────────────────────────────────────
with st.spinner("A carregar dados geoespaciais..."):
    provinces_gdf = load_provinces() if show_provinces or filter_mode != "Nenhum" else None
    districts_gdf = load_districts() if show_districts or filter_mode == "Distrito" else None
    admin_posts_gdf = load_admin_posts() if show_admin_posts else None
    villages_gdf = load_villages() if show_villages else None
    geology_gdf = load_geology() if show_geology or filter_mode != "Nenhum" else None

# ── area selection (sidebar continuation) ─────────────────────────────────────
with st.sidebar:
    if filter_mode == "Província":
        province_names = get_province_names(provinces_gdf)
        if province_names:
            selected_province = st.selectbox("Selecionar Província", province_names)
            if selected_province and provinces_gdf is not None:
                prov_col = _find_col(provinces_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name", "NAME"])
                if prov_col:
                    province_gdf = provinces_gdf[provinces_gdf[prov_col] == selected_province]
        else:
            st.info("Províncias não disponíveis.")

    elif filter_mode == "Distrito":
        province_names = get_province_names(provinces_gdf)
        if province_names:
            selected_province = st.selectbox("Selecionar Província", province_names)
            if selected_province and districts_gdf is not None:
                filtered_districts = get_districts_for_province(
                    districts_gdf, provinces_gdf, selected_province
                )
                district_names = get_district_names(filtered_districts)
                if district_names:
                    selected_district = st.selectbox("Selecionar Distrito", district_names)
                    if selected_district and filtered_districts is not None:
                        dist_col = _find_col(
                            filtered_districts,
                            ["Distrito", "DISTRITO", "NAME_2", "name", "NAME"]
                        )
                        if dist_col:
                            district_filter_gdf = filtered_districts[
                                filtered_districts[dist_col] == selected_district
                            ]

# ── compute filtered geology ───────────────────────────────────────────────────
filtered_geology = None
area_label = ""
area_boundary_gdf = None

if filter_mode == "Província" and province_gdf is not None and len(province_gdf) > 0:
    filtered_geology = filter_geology_by_area(geology_gdf, province_gdf)
    area_label = f"Geologia — {selected_province}"
    area_boundary_gdf = province_gdf

elif filter_mode == "Distrito" and district_filter_gdf is not None and len(district_filter_gdf) > 0:
    filtered_geology = filter_geology_by_area(geology_gdf, district_filter_gdf)
    area_label = f"Geologia — {selected_district}"
    area_boundary_gdf = district_filter_gdf

# Geology to display on map
geology_to_display = filtered_geology if filtered_geology is not None else geology_gdf

# ── build map ──────────────────────────────────────────────────────────────────
m = create_base_map(basemap)

if show_provinces and provinces_gdf is not None:
    m = add_province_layer(m, provinces_gdf)

if show_districts and districts_gdf is not None:
    m = add_district_layer(m, districts_gdf)

if show_admin_posts and admin_posts_gdf is not None:
    m = add_admin_post_layer(m, admin_posts_gdf)

if show_villages and villages_gdf is not None:
    m = add_village_layer(m, villages_gdf)

if show_geology and geology_to_display is not None:
    layer_name = area_label if area_label else "Geologia"
    m = add_geology_layer(m, geology_to_display, color_by=geology_color_by, name=layer_name)

if area_boundary_gdf is not None:
    m = add_selected_area_layer(m, area_boundary_gdf, label="Área selecionada")

# Always add layer control
folium.LayerControl(collapsed=False).add_to(m)

# ── render map ─────────────────────────────────────────────────────────────────
col_map, col_legend = st.columns([3, 1])

with col_map:
    st.subheader("🗺️ Mapa Interativo")
    map_output = st_folium(m, width="100%", height=600, returned_objects=[])

with col_legend:
    if show_geology and geology_to_display is not None:
        st.subheader("🎨 Legenda — Geologia")
        legend_html = build_geology_legend(geology_to_display, color_by=geology_color_by)
        if legend_html:
            st.markdown(legend_html, unsafe_allow_html=True)
        else:
            st.info("Legenda indisponível para a coluna selecionada.")
    else:
        st.info("Ative a camada de geologia para ver a legenda.")

# ── analysis panel ─────────────────────────────────────────────────────────────
if filter_mode != "Nenhum" and filtered_geology is not None and len(filtered_geology) > 0:
    st.divider()
    st.subheader(f"📊 Análise Geológica — {area_label}")

    summary = summarise_geology(filtered_geology)

    metric_cols = st.columns(4)
    metric_cols[0].metric("Feições geológicas", summary.get("total_features", 0))
    metric_cols[1].metric("Unidades distintas", summary.get("total_units", 0))
    metric_cols[2].metric("Área total (km²)", f"{summary.get('total_area_km2', 0):,.2f}")
    metric_cols[3].metric("Litologia dominante", summary.get("dominant_lithology", "N/A"))

    stats_df = calculate_geology_stats(filtered_geology)
    if not stats_df.empty:
        st.markdown("**Tabela de litologias por área:**")
        st.dataframe(stats_df, use_container_width=True, hide_index=True)
    else:
        st.info("Não foi possível calcular as estatísticas para a área selecionada.")

elif filter_mode != "Nenhum":
    st.info(
        "Selecione uma área válida com geologia disponível para ver a análise."
    )

# ── export panel ───────────────────────────────────────────────────────────────
st.divider()
st.subheader("💾 Exportação")

exp_col1, exp_col2, exp_col3 = st.columns(3)

with exp_col1:
    if st.button("🗺️ Exportar Mapa HTML"):
        html_bytes = map_to_html(m)
        filename = f"geomoz_mapa_{(selected_province or selected_district or 'mozambique').replace(' ', '_').lower()}.html"
        st.download_button(
            label="⬇️ Baixar mapa HTML",
            data=html_bytes,
            file_name=filename,
            mime="text/html",
        )

with exp_col2:
    geo_for_export = filtered_geology if filtered_geology is not None else geology_gdf
    if geo_for_export is not None and len(geo_for_export) > 0:
        if st.button("📋 Exportar Tabela CSV"):
            stats_df = calculate_geology_stats(geo_for_export)
            if not stats_df.empty:
                csv_bytes = dataframe_to_csv(stats_df)
                fname = f"geomoz_estatisticas_{(selected_province or selected_district or 'mozambique').replace(' ', '_').lower()}.csv"
                st.download_button(
                    label="⬇️ Baixar CSV",
                    data=csv_bytes,
                    file_name=fname,
                    mime="text/csv",
                )
            else:
                st.warning("Sem estatísticas para exportar.")
    else:
        st.button("📋 Exportar Tabela CSV", disabled=True)
        st.caption("Ative a camada de geologia.")

with exp_col3:
    if filtered_geology is not None and len(filtered_geology) > 0:
        if st.button("🌐 Exportar GeoJSON"):
            geojson_bytes = geodataframe_to_geojson(filtered_geology)
            fname = f"geomoz_geologia_{(selected_province or selected_district or 'area').replace(' ', '_').lower()}.geojson"
            st.download_button(
                label="⬇️ Baixar GeoJSON",
                data=geojson_bytes,
                file_name=fname,
                mime="application/geo+json",
            )
    else:
        st.button("🌐 Exportar GeoJSON", disabled=True)
        st.caption("Selecione uma área para exportar.")

# ── future modules ─────────────────────────────────────────────────────────────
st.divider()

tab_satellite, tab_ai = st.tabs([
    "🛰️ Satellite Analysis (Future Module)",
    "🤖 GeoMoz AI (Future Module)",
])

with tab_satellite:
    st.info(
        "Esta secção está reservada para integração futura com **Google Earth Engine** e imagens **Sentinel-2**."
    )

    col_s1, col_s2 = st.columns(2)
    with col_s1:
        st.markdown("#### 📡 Carregamento de Imagens")
        st.code(
            """
# Future: Load Sentinel-2 imagery via GEE
# import ee
# ee.Initialize()
# sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR')
#     .filterBounds(aoi)
#     .filterDate('2023-01-01', '2023-12-31')
#     .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
#     .median()
""",
            language="python",
        )

        st.markdown("#### 🌿 NDVI — Índice de Vegetação")
        st.code(
            """
# Future: Calculate NDVI
# def calculate_ndvi(image):
#     nir = image.select('B8')
#     red = image.select('B4')
#     ndvi = nir.subtract(red).divide(nir.add(red))
#     return ndvi.rename('NDVI')
""",
            language="python",
        )

    with col_s2:
        st.markdown("#### 🔴 Índice de Óxidos de Ferro")
        st.code(
            """
# Future: Iron oxide index (Sentinel-2)
# def iron_oxide_index(image):
#     red = image.select('B4')   # ~665 nm
#     blue = image.select('B2')  # ~490 nm
#     return red.divide(blue).rename('FeOx')
""",
            language="python",
        )

        st.markdown("#### 🏔️ Índice de Argilas / Alteração Hidrotermal")
        st.code(
            """
# Future: Clay / hydrothermal alteration index
# def clay_index(image):
#     swir1 = image.select('B11')  # ~1610 nm
#     swir2 = image.select('B12')  # ~2190 nm
#     return swir1.divide(swir2).rename('ClayIdx')
""",
            language="python",
        )

    st.markdown(
        """
        **Como ativar este módulo:**
        1. Instalar `earthengine-api`: `pip install earthengine-api`
        2. Autenticar: `earthengine authenticate`
        3. Descomentar e adaptar o código acima em `utils/satellite.py`
        """
    )

with tab_ai:
    st.info(
        "Esta secção está reservada para **GeoMoz AI** — módulos de machine learning para exploração mineral."
    )

    col_a1, col_a2 = st.columns(2)
    with col_a1:
        st.markdown("#### 🔵 Clustering Geológico")
        st.code(
            """
# Future: Geological clustering
# from sklearn.cluster import KMeans
# from sklearn.preprocessing import StandardScaler
#
# features = geology_gdf[['ERA_code', 'PERIOD_code', 'area_km2']]
# scaler = StandardScaler()
# X = scaler.fit_transform(features.fillna(0))
# kmeans = KMeans(n_clusters=5, random_state=42)
# geology_gdf['cluster'] = kmeans.fit_predict(X)
""",
            language="python",
        )

        st.markdown("#### 🎯 Mineral Targeting")
        st.code(
            """
# Future: Mineral favourability model
# from sklearn.ensemble import RandomForestClassifier
#
# X_train = features[known_deposits]
# y_train = deposit_labels
# rf = RandomForestClassifier(n_estimators=200, random_state=42)
# rf.fit(X_train, y_train)
# geology_gdf['favorability'] = rf.predict_proba(X_all)[:, 1]
""",
            language="python",
        )

    with col_a2:
        st.markdown("#### 📈 Modelos Preditivos")
        st.code(
            """
# Future: XGBoost predictive model
# import xgboost as xgb
#
# dtrain = xgb.DMatrix(X_train, label=y_train)
# params = {'max_depth': 6, 'eta': 0.1,
#           'objective': 'binary:logistic'}
# model = xgb.train(params, dtrain, num_boost_round=100)
# probs = model.predict(xgb.DMatrix(X_all))
""",
            language="python",
        )

        st.markdown("#### 🗺️ Mapa de Favorabilidade Mineral")
        st.code(
            """
# Future: Mineral favourability map
# geology_gdf['favourability_class'] = pd.cut(
#     geology_gdf['favorability'],
#     bins=[0, 0.3, 0.6, 1.0],
#     labels=['Baixa', 'Média', 'Alta']
# )
# Plot with folium using favourability colours
""",
            language="python",
        )

    st.markdown(
        """
        **Como ativar este módulo:**
        1. Instalar dependências: `pip install scikit-learn xgboost`
        2. Preparar dados de treino (depósitos conhecidos + variáveis geológicas)
        3. Implementar `utils/ml_models.py` com as funções acima
        4. Integrar resultados como nova camada no mapa
        """
    )

# ── footer ─────────────────────────────────────────────────────────────────────
st.divider()
st.caption(
    "GeoMoz Explorer v1.0 MVP — Dados: [geomoz](https://github.com/segemar/geomoz) · "
    "Mapa base: OpenStreetMap / CartoDB · "
    "Desenvolvido com Streamlit + Folium + GeoPandas"
)
