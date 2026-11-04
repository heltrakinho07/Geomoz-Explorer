/** Reviewed product translations for GeoMoz specialist tools.
 * GIS engine's existing 20 upstream locales remain authoritative for native commands.
 * For additional languages, custom labels fall back to English, not Portuguese.
 */
const entries: Record<string, {en:string;es:string;fr:string}> = {
  "Camadas do terreno": {en:"Terrain layers",es:"Capas del terreno",fr:"Couches du terrain"},
  "Sobreponha geologia, solos e cobertura do solo. As camadas são recortadas aos limites do DEM.": {en:"Overlay geology, soils and land cover. Layers are clipped to the DEM extent.",es:"Superponga geología, suelos y cobertura terrestre. Las capas se recortan al MDE.",fr:"Superposez géologie, sols et couverture terrestre. Les couches sont découpées à l'étendue du MNT."},
  "Adicionar camada": {en:"Add layer",es:"Añadir capa",fr:"Ajouter une couche"},
  "Importar GeoJSON / GeoTIFF": {en:"Import GeoJSON / GeoTIFF",es:"Importar GeoJSON / GeoTIFF",fr:"Importer GeoJSON / GeoTIFF"},
  "Camada existente no projecto…": {en:"Existing project layer…",es:"Capa existente del proyecto…",fr:"Couche existante du projet…"},
  "A consultar Earth Engine…": {en:"Querying Earth Engine…",es:"Consultando Earth Engine…",fr:"Interrogation d'Earth Engine…"},
  "ESA WorldCover 2021 · GEE": {en:"ESA WorldCover 2021 · GEE",es:"ESA WorldCover 2021 · GEE",fr:"ESA WorldCover 2021 · GEE"},
  "WorldCover representa cobertura do solo em 2021, não o uso actual. Requer GEE autenticado.": {en:"WorldCover maps land cover in 2021, not current land use. Requires authenticated GEE.",es:"WorldCover representa la cobertura terrestre de 2021, no el uso actual. Requiere GEE autenticado.",fr:"WorldCover représente la couverture terrestre de 2021, pas l'usage actuel. Connexion GEE requise."},
  "Ordem de sobreposição": {en:"Layer order",es:"Orden de capas",fr:"Ordre des couches"},
  "Base → topo": {en:"Bottom → top",es:"Base → arriba",fr:"Bas → haut"},
  "Sem camadas temáticas": {en:"No thematic layers",es:"Sin capas temáticas",fr:"Aucune couche thématique"},
  "Adicione geologia, solos ou WorldCover para visualizar no relevo.": {en:"Add geology, soils or WorldCover to drape on terrain.",es:"Añada geología, suelos o WorldCover al relieve.",fr:"Ajoutez géologie, sols ou WorldCover au relief."},
  "DEM original preservado": {en:"Original DEM preserved",es:"MDE original preservado",fr:"MNT d'origine conservé"},
  "Camadas 3D": {en:"3D layers",es:"Capas 3D",fr:"Couches 3D"},
  "Seleccione uma camada": {en:"Select a layer",es:"Seleccione una capa",fr:"Sélectionnez une couche"},
  "Defina classificação, cores, visibilidade e transparência.": {en:"Set classification, colors, visibility and transparency.",es:"Defina clases, colores, visibilidad y transparencia.",fr:"Définissez classification, couleurs, visibilité et transparence."},
  "As alterações são aplicadas à superfície 3D, mantendo a escala métrica.": {en:"Changes apply to the 3D surface while retaining metric scale.",es:"Los cambios se aplican a la superficie 3D conservando la escala métrica.",fr:"Les modifications s'appliquent à la surface 3D tout en conservant l'échelle métrique."},
  "Categorizada por atributo/classe": {en:"Categorized by attribute/class",es:"Categorizada por atributo/clase",fr:"Catégorisé par attribut/classe"},
  "Cor única": {en:"Single color",es:"Color único",fr:"Couleur unique"},
  "Atributo de categorização": {en:"Classification attribute",es:"Atributo de clasificación",fr:"Attribut de classification"},
  "Cor da camada": {en:"Layer color",es:"Color de capa",fr:"Couleur de la couche"},
  "Transparência": {en:"Transparency",es:"Transparencia",fr:"Transparence"},
  "Camada visível": {en:"Layer visible",es:"Capa visible",fr:"Couche visible"},
  "Legenda": {en:"Legend",es:"Leyenda",fr:"Légende"},
  "classes": {en:"classes",es:"clases",fr:"classes"},
  "Recorte visual automático ao DEM. O ficheiro original não é alterado.": {en:"Visual clipping to DEM; the source file is unchanged.",es:"Recorte visual al MDE; el archivo original no se modifica.",fr:"Découpage visuel au MNT ; le fichier source reste inchangé."},
  "Análise": {en:"Analysis",es:"Análisis",fr:"Analyse"},
  "Terreno": {en:"Terrain",es:"Terreno",fr:"Terrain"},
  "Exportar": {en:"Export",es:"Exportar",fr:"Exporter"},
  "Visualização do relevo": {en:"Terrain display",es:"Visualización del relieve",fr:"Visualisation du relief"},
  "Exportação cartográfica 3D": {en:"3D map export",es:"Exportación cartográfica 3D",fr:"Export cartographique 3D"},
  "Catálogo GeoMoz de mapas-base": {
    "en": "GeoMoz basemap catalog",
    "es": "Catálogo GeoMoz de mapas base",
    "fr": "Catalogue GeoMoz des fonds de carte"
  },
  "Catálogo de mapas-base": {
    "en": "Basemap catalog",
    "es": "Catálogo de mapas base",
    "fr": "Catalogue des fonds de carte"
  },
  "Fechar catálogo de mapas-base": {
    "en": "Close basemap catalog",
    "es": "Cerrar catálogo de mapas base",
    "fr": "Fermer le catalogue des fonds de carte"
  },
  "Pesquisar mapas-base GeoMoz": {
    "en": "Search GeoMoz basemaps",
    "es": "Buscar mapas base GeoMoz",
    "fr": "Rechercher des fonds de carte GeoMoz"
  },
  "Pesquisar OpenStreetMap, relevo, satélite…": {
    "en": "Search OpenStreetMap, terrain, satellite…",
    "es": "Buscar OpenStreetMap, relieve, satélite…",
    "fr": "Rechercher OpenStreetMap, relief, satellite…"
  },
  "Cobertura geográfica": {
    "en": "Geographic coverage",
    "es": "Cobertura geográfica",
    "fr": "Couverture géographique"
  },
  "Filtrar serviços por região": {
    "en": "Filter services by region",
    "es": "Filtrar servicios por región",
    "fr": "Filtrer les services par région"
  },
  "Moçambique (recomendado)": {
    "en": "Mozambique (recommended)",
    "es": "Mozambique (recomendado)",
    "fr": "Mozambique (recommandé)"
  },
  "África": {
    "en": "Africa",
    "es": "África",
    "fr": "Afrique"
  },
  "Todas as regiões (inclui serviços globais)": {
    "en": "All regions (including global services)",
    "es": "Todas las regiones (incluye servicios globales)",
    "fr": "Toutes les régions (y compris les services mondiaux)"
  },
  "Escolha uma região para evitar ortofotos sem cobertura; a opção global mantém o catálogo completo.": {
    "en": "Choose a region to avoid imagery without coverage; the global option keeps the complete catalog.",
    "es": "Elija una región para evitar imágenes sin cobertura; la opción global mantiene el catálogo completo.",
    "fr": "Choisissez une région pour éviter les images hors couverture ; l'option mondiale conserve le catalogue entier."
  },
  "Serviços externos podem apresentar imagens vazias; ajuste a opacidade no catálogo de camadas.": {
    "en": "External services may display blank images; adjust opacity in the layer catalog.",
    "es": "Los servicios externos pueden mostrar imágenes vacías; ajuste la opacidad en el catálogo de capas.",
    "fr": "Des services externes peuvent afficher des images vides ; réglez l'opacité dans le catalogue de couches."
  },
  "A sua sessão não permite adicionar camadas ao projecto.": {
    "en": "Your session cannot add layers to the project.",
    "es": "Su sesión no permite añadir capas al proyecto.",
    "fr": "Votre session ne permet pas d'ajouter des couches au projet."
  },
  "A pesquisar…": {
    "en": "Searching…",
    "es": "Buscando…",
    "fr": "Recherche en cours…"
  },
  "Camada": {
    "en": "Layer",
    "es": "Capa",
    "fr": "Couche"
  },
  "adicionada ao projecto com 72% de opacidade. Pode ajustá-la no catálogo.": {
    "en": "added to the project at 72% opacity. You can change it in the catalog.",
    "es": "añadida al proyecto con un 72 % de opacidad. Puede ajustarla en el catálogo.",
    "fr": "ajoutée au projet avec une opacité de 72 %. Vous pouvez la régler dans le catalogue."
  },
  "Nenhum serviço XYZ/TMS compatível encontrado.": {
    "en": "No compatible XYZ/TMS service found.",
    "es": "No se encontró ningún servicio XYZ/TMS compatible.",
    "fr": "Aucun service XYZ/TMS compatible trouvé."
  },
  "Serviço cartográfico remoto": {
    "en": "Remote map service",
    "es": "Servicio cartográfico remoto",
    "fr": "Service cartographique distant"
  },
  "Verificar mosaico de ": {
    "en": "Inspect tile for ",
    "es": "Verificar mosaico de ",
    "fr": "Vérifier la tuile de "
  },
  "Verificar": {
    "en": "Inspect",
    "es": "Verificar",
    "fr": "Vérifier"
  },
  "Adicionar ": {
    "en": "Add ",
    "es": "Añadir ",
    "fr": "Ajouter "
  },
  "Adicionar": {
    "en": "Add",
    "es": "Añadir",
    "fr": "Ajouter"
  },
  "Diagnóstico visual do serviço": {
    "en": "Service visual diagnostics",
    "es": "Diagnóstico visual del servicio",
    "fr": "Diagnostic visuel du service"
  },
  "Pré-visualização": {
    "en": "Preview",
    "es": "Vista previa",
    "fr": "Aperçu"
  },
  "A cobertura declarada do fornecedor não inclui Moçambique.": {
    "en": "The provider's declared coverage does not include Mozambique.",
    "es": "La cobertura declarada por el proveedor no incluye Mozambique.",
    "fr": "La couverture déclarée du fournisseur ne comprend pas le Mozambique."
  },
  "Navegue até à região do serviço antes de o utilizar no mapa.": {
    "en": "Navigate to the service region before using it on the map.",
    "es": "Vaya a la región del servicio antes de utilizarlo en el mapa.",
    "fr": "Naviguez vers la région du service avant de l'utiliser sur la carte."
  },
  "A cobertura declarada não intersecta a região seleccionada.": {
    "en": "The declared coverage does not intersect the selected region.",
    "es": "La cobertura declarada no intersecta la región seleccionada.",
    "fr": "La couverture déclarée ne recoupe pas la région sélectionnée."
  },
  "Escolha outra região no filtro ou seleccione outro serviço.": {
    "en": "Choose another region or another service.",
    "es": "Seleccione otra región u otro servicio.",
    "fr": "Choisissez une autre région ou un autre service."
  },
  "Mosaico de verificação: ": {
    "en": "Verification tile: ",
    "es": "Mosaico de verificación: ",
    "fr": "Tuile de vérification : "
  },
  "A carregar um mosaico de amostra…": {
    "en": "Loading a sample tile…",
    "es": "Cargando un mosaico de muestra…",
    "fr": "Chargement d'une tuile d'échantillon…"
  },
  "Mosaico recebido. Confirme visualmente se contém dados válidos;": {
    "en": "Tile received. Visually confirm that it contains valid data;",
    "es": "Mosaico recibido. Compruebe visualmente que contiene datos válidos;",
    "fr": "Tuile reçue. Vérifiez visuellement qu'elle contient des données valides ;"
  },
  "uma imagem preta pode indicar ausência de cobertura, mesmo sem erro de rede.": {
    "en": "a black tile may indicate lack of coverage even without a network error.",
    "es": "una imagen negra puede indicar falta de cobertura incluso sin error de red.",
    "fr": "une image noire peut signaler une absence de couverture, même sans erreur réseau."
  },
  "O mosaico de amostra falhou.": {
    "en": "The sample tile failed.",
    "es": "Falló el mosaico de muestra.",
    "fr": "Échec du chargement de la tuile."
  },
  "Verifique a disponibilidade, cobertura, zoom e acesso à rede antes de adicionar a camada.": {
    "en": "Check availability, coverage, zoom and network access before adding the layer.",
    "es": "Compruebe disponibilidad, cobertura, zoom y conexión antes de añadir la capa.",
    "fr": "Vérifiez la disponibilité, la couverture, le zoom et l'accès réseau avant d'ajouter la couche."
  },
  "Nível ": {
    "en": "Zoom ",
    "es": "Nivel ",
    "fr": "Niveau "
  },
  " · localização de teste ": {
    "en": " · test location ",
    "es": " · ubicación de prueba ",
    "fr": " · emplacement du test "
  },
  "Este teste não garante que o serviço permita WebGL/CORS em todos os mosaicos.": {
    "en": "This test does not guarantee WebGL/CORS support for every tile.",
    "es": "Esta prueba no garantiza que todas las teselas admitan WebGL/CORS.",
    "fr": "Ce test ne garantit pas la compatibilité WebGL/CORS de toutes les tuiles."
  },
  "As fontes são externas e conservam os termos de utilização dos fornecedores.": {
    "en": "Data sources are external and retain each provider's terms of use.",
    "es": "Las fuentes son externas y mantienen las condiciones de uso de cada proveedor.",
    "fr": "Les sources sont externes et conservent les conditions d'utilisation de chaque fournisseur."
  },
  "Antes de exportar mapas ou dados, confirme as respectivas licenças.": {
    "en": "Check the applicable licences before exporting maps or data.",
    "es": "Compruebe las licencias antes de exportar mapas o datos.",
    "fr": "Vérifiez les licences avant d'exporter des cartes ou des données."
  },
  "O catálogo QMS não respondeu.": {
    "en": "The QMS catalog did not respond.",
    "es": "El catálogo QMS no respondió.",
    "fr": "Le catalogue QMS n'a pas répondu."
  },
  "Não foi possível inspeccionar o serviço.": {
    "en": "Could not inspect the service.",
    "es": "No se pudo inspeccionar el servicio.",
    "fr": "Impossible d'inspecter le service."
  },
  "O motor SIG não confirmou a criação da camada.": {
    "en": "The GIS engine did not confirm layer creation.",
    "es": "El motor SIG no confirmó la creación de la capa.",
    "fr": "Le moteur SIG n'a pas confirmé la création de la couche."
  },
  "Falha ao adicionar o serviço.": {
    "en": "Could not add the service.",
    "es": "No se pudo añadir el servicio.",
    "fr": "Impossible d'ajouter le service."
  },
  "Exportação cartográfica QGIS": {
    "en": "QGIS cartographic export",
    "es": "Exportación cartográfica QGIS",
    "fr": "Export cartographique QGIS"
  },
  "Impressão QGIS vectorial": {
    "en": "QGIS vector print",
    "es": "Impresión vectorial QGIS",
    "fr": "Impression vectorielle QGIS"
  },
  "Exportação preparada para o motor cartográfico dedicado": {
    "en": "Export prepared for the dedicated cartographic engine",
    "es": "Exportación preparada para el motor cartográfico especializado",
    "fr": "Export préparé pour le moteur cartographique dédié"
  },
  "Fechar exportação QGIS": {
    "en": "Close QGIS export",
    "es": "Cerrar exportación QGIS",
    "fr": "Fermer l'export QGIS"
  },
  "Este comando cria um pacote local de camadas GeoJSON para o serviço PyQGIS.": {
    "en": "This command creates a local GeoJSON layer package for PyQGIS.",
    "es": "Este comando crea un paquete local de capas GeoJSON para PyQGIS.",
    "fr": "Cette commande crée un paquet local de couches GeoJSON pour PyQGIS."
  },
  "O PDF não é gerado no navegador. Para impressão imediata em PDF, utilize «Layout de impressão».": {
    "en": "The PDF is not generated in your browser. For immediate PDF output, use Print Layout.",
    "es": "El PDF no se genera en el navegador. Para imprimir en PDF utilice Diseño de impresión.",
    "fr": "Le PDF n'est pas généré dans le navigateur. Pour un PDF immédiat, utilisez Mise en page."
  },
  "Título do mapa": {
    "en": "Map title",
    "es": "Título del mapa",
    "fr": "Titre de la carte"
  },
  "Formato": {
    "en": "Format",
    "es": "Formato",
    "fr": "Format"
  },
  "Orientação": {
    "en": "Orientation",
    "es": "Orientación",
    "fr": "Orientation"
  },
  "Horizontal": {
    "en": "Landscape",
    "es": "Horizontal",
    "fr": "Paysage"
  },
  "Vertical": {
    "en": "Portrait",
    "es": "Vertical",
    "fr": "Portrait"
  },
  "Resolução": {
    "en": "Resolution",
    "es": "Resolución",
    "fr": "Résolution"
  },
  "Camadas vectoriais a incluir (máximo 12)": {
    "en": "Vector layers to include (maximum 12)",
    "es": "Capas vectoriales que incluir (máximo 12)",
    "fr": "Couches vectorielles à inclure (12 maximum)"
  },
  "Adicione uma camada GeoJSON com feições para preparar um PDF vectorial.": {
    "en": "Add a GeoJSON layer with features to prepare a vector PDF.",
    "es": "Añada una capa GeoJSON con entidades para preparar un PDF vectorial.",
    "fr": "Ajoutez une couche GeoJSON avec des entités pour préparer un PDF vectoriel."
  },
  " feições": {
    "en": " features",
    "es": " entidades",
    "fr": " entités"
  },
  "Exportar pacote (.json)": {
    "en": "Export package (.json)",
    "es": "Exportar paquete (.json)",
    "fr": "Exporter le paquet (.json)"
  },
  "Pacote de impressão criado. O motor PyQGIS processa este ficheiro para gerar PDF vectorial.": {
    "en": "Print package created. PyQGIS processes this file into a vector PDF.",
    "es": "Paquete de impresión creado. PyQGIS convierte este archivo en un PDF vectorial.",
    "fr": "Paquet d'impression créé. PyQGIS transforme ce fichier en PDF vectoriel."
  },
  "Não foi possível preparar o pacote.": {
    "en": "Could not prepare the package.",
    "es": "No se pudo preparar el paquete.",
    "fr": "Impossible de préparer le paquet."
  },
  "Catálogo recolhido": {
    "en": "Collapsed catalog",
    "es": "Catálogo contraído",
    "fr": "Catalogue réduit"
  },
  "Expandir catálogo": {
    "en": "Expand catalog",
    "es": "Expandir catálogo",
    "fr": "Développer le catalogue"
  },
  "CATÁLOGO": {
    "en": "CATALOG",
    "es": "CATÁLOGO",
    "fr": "CATALOGUE"
  },
  "Catálogo de camadas": {
    "en": "Layer catalog",
    "es": "Catálogo de capas",
    "fr": "Catalogue des couches"
  },
  "ÁREA DE TRABALHO": {
    "en": "WORKSPACE",
    "es": "ÁREA DE TRABAJO",
    "fr": "ESPACE DE TRAVAIL"
  },
  "Catálogo": {
    "en": "Catalog",
    "es": "Catálogo",
    "fr": "Catalogue"
  },
  "Recolher catálogo": {
    "en": "Collapse catalog",
    "es": "Contraer catálogo",
    "fr": "Réduire le catalogue"
  },
  "Camadas": {
    "en": "Layers",
    "es": "Capas",
    "fr": "Couches"
  },
  "Resultados": {
    "en": "Results",
    "es": "Resultados",
    "fr": "Résultats"
  },
  "Gestão": {
    "en": "Management",
    "es": "Gestión",
    "fr": "Gestion"
  },
  "Pesquisar camadas": {
    "en": "Search layers",
    "es": "Buscar capas",
    "fr": "Rechercher des couches"
  },
  "Pesquisar neste projecto…": {
    "en": "Search in this project…",
    "es": "Buscar en este proyecto…",
    "fr": "Rechercher dans ce projet…"
  },
  "Todas": {
    "en": "All",
    "es": "Todas",
    "fr": "Toutes"
  },
  "Visíveis": {
    "en": "Visible",
    "es": "Visibles",
    "fr": "Visibles"
  },
  "ORDEM DO MAPA": {
    "en": "MAP DRAW ORDER",
    "es": "ORDEN DEL MAPA",
    "fr": "ORDRE DES COUCHES"
  },
  "Ocultar ": {
    "en": "Hide ",
    "es": "Ocultar ",
    "fr": "Masquer "
  },
  "Mostrar ": {
    "en": "Show ",
    "es": "Mostrar ",
    "fr": "Afficher "
  },
  "Oculta pelo grupo": {
    "en": "Hidden by group",
    "es": "Oculta por el grupo",
    "fr": "Masquée par le groupe"
  },
  " opacidade": {
    "en": " opacity",
    "es": " opacidad",
    "fr": " opacité"
  },
  "Enquadrar ": {
    "en": "Zoom to ",
    "es": "Encuadrar ",
    "fr": "Cadrer "
  },
  "Enquadrar camada": {
    "en": "Zoom to layer",
    "es": "Encuadrar capa",
    "fr": "Cadrer la couche"
  },
  "A extensão desta camada ainda não está disponível.": {
    "en": "This layer's extent is not available yet.",
    "es": "La extensión de esta capa todavía no está disponible.",
    "fr": "L'emprise de cette couche n'est pas encore disponible."
  },
  "Nenhuma correspondência": {
    "en": "No matches",
    "es": "Sin resultados",
    "fr": "Aucune correspondance"
  },
  "O seu mapa começa aqui": {
    "en": "Your map starts here",
    "es": "Su mapa empieza aquí",
    "fr": "Votre carte commence ici"
  },
  "Experimente outro nome ou mostre todas as camadas.": {
    "en": "Try another name or show all layers.",
    "es": "Pruebe otro nombre o muestre todas las capas.",
    "fr": "Essayez un autre nom ou affichez toutes les couches."
  },
  "Adicione dados na faixa superior. As camadas e os resultados ficam organizados neste catálogo.": {
    "en": "Add data from the top toolbar. Layers and outputs are organized in this catalog.",
    "es": "Añada datos desde la barra superior. Las capas y los resultados se organizan en este catálogo.",
    "fr": "Ajoutez des données depuis la barre supérieure. Les couches et les résultats sont organisés ici."
  },
  "CAMADA SELECCIONADA": {
    "en": "SELECTED LAYER",
    "es": "CAPA SELECCIONADA",
    "fr": "COUCHE SÉLECTIONNÉE"
  },
  "Camada seleccionada": {
    "en": "Selected layer",
    "es": "Capa seleccionada",
    "fr": "Couche sélectionnée"
  },
  "Opacidade": {
    "en": "Opacity",
    "es": "Opacidad",
    "fr": "Opacité"
  },
  "Opacidade da camada": {
    "en": "Layer opacity",
    "es": "Opacidad de capa",
    "fr": "Opacité de la couche"
  },
  "Tabela": {
    "en": "Table",
    "es": "Tabla",
    "fr": "Table"
  },
  "Editar simbologia": {
    "en": "Edit symbology",
    "es": "Editar simbología",
    "fr": "Modifier la symbologie"
  },
  "Simbologia": {
    "en": "Symbology",
    "es": "Simbología",
    "fr": "Symbologie"
  },
  "Estilos avançados": {
    "en": "Advanced styles",
    "es": "Estilos avanzados",
    "fr": "Styles avancés"
  },
  "Propriedades": {
    "en": "Properties",
    "es": "Propiedades",
    "fr": "Propriétés"
  },
  "Estilo rápido da camada": {
    "en": "Quick layer styling",
    "es": "Estilo rápido de capa",
    "fr": "Style rapide de la couche"
  },
  "Cor do símbolo": {
    "en": "Symbol color",
    "es": "Color del símbolo",
    "fr": "Couleur du symbole"
  },
  "Cor do contorno": {
    "en": "Outline color",
    "es": "Color del contorno",
    "fr": "Couleur du contour"
  },
  "Tamanho dos pontos": {
    "en": "Point size",
    "es": "Tamaño de los puntos",
    "fr": "Taille des points"
  },
  "Alterações aplicadas ao renderer original. Para classes, regras ou tamanho proporcional, use os estilos avançados.": {
    "en": "Changes apply to the original renderer. For classes, rules or proportional symbols, use advanced styles.",
    "es": "Los cambios se aplican al renderizador original. Para clases, reglas o símbolos proporcionales, utilice los estilos avanzados.",
    "fr": "Les modifications s'appliquent au moteur de rendu d'origine. Pour les classes, règles et symboles proportionnels, utilisez les styles avancés."
  },
  "A edição da camada continua activa. Abra «Vector» para guardar ou descartar as alterações.": {
    "en": "Layer editing is still active. Open Vector to save or discard changes.",
    "es": "La edición sigue activa. Abra Vector para guardar o descartar los cambios.",
    "fr": "L'édition est toujours active. Ouvrez Vecteur pour enregistrer ou annuler les modifications."
  },
  " visíveis de ": {
    "en": " visible out of ",
    "es": " visibles de ",
    "fr": " visibles sur "
  },
  "Altere a ordem e os grupos nas propriedades da camada": {
    "en": "Change layer order and groups in layer properties",
    "es": "Cambie el orden y los grupos en las propiedades de capa",
    "fr": "Modifiez l'ordre et les groupes dans les propriétés de la couche"
  },
  "Resultados do processamento": {
    "en": "Processing results",
    "es": "Resultados del procesamiento",
    "fr": "Résultats du traitement"
  },
  "execução": {
    "en": "execution",
    "es": "ejecución",
    "fr": "exécution"
  },
  "execuções": {
    "en": "executions",
    "es": "ejecuciones",
    "fr": "exécutions"
  },
  "Histórico completo": {
    "en": "Full history",
    "es": "Historial completo",
    "fr": "Historique complet"
  },
  "Da análise à decisão": {
    "en": "From analysis to decision",
    "es": "Del análisis a la decisión",
    "fr": "De l'analyse à la décision"
  },
  "Execute uma ferramenta na tarefa Análise. Aqui poderá acompanhar o estado e localizar as saídas produzidas.": {
    "en": "Run a tool from Analysis. Monitor its status and find generated outputs here.",
    "es": "Ejecute una herramienta de Análisis. Consulte su estado y los resultados aquí.",
    "fr": "Exécutez un outil dans Analyse. Suivez son état et retrouvez ses résultats ici."
  },
  "Falhou": {
    "en": "Failed",
    "es": "Fallido",
    "fr": "Échec"
  },
  "Concluído": {
    "en": "Completed",
    "es": "Completado",
    "fr": "Terminé"
  },
  "Seleccionar e enquadrar saída": {
    "en": "Select and zoom to output",
    "es": "Seleccionar y encuadrar resultado",
    "fr": "Sélectionner et cadrer le résultat"
  },
  "Existem várias camadas com este nome. Seleccione a saída no catálogo.": {
    "en": "Several layers have this name. Choose the output in the catalog.",
    "es": "Hay varias capas con este nombre. Seleccione el resultado en el catálogo.",
    "fr": "Plusieurs couches portent ce nom. Sélectionnez le résultat dans le catalogue."
  },
  "Camada não encontrada com este nome no mapa.": {
    "en": "No layer with this name was found on the map.",
    "es": "No se encontró ninguna capa con este nombre en el mapa.",
    "fr": "Aucune couche portant ce nom n'a été trouvée sur la carte."
  },
  "Redimensionar catálogo": {
    "en": "Resize catalog",
    "es": "Cambiar tamaño del catálogo",
    "fr": "Redimensionner le catalogue"
  },
  "Arraste para alargar ou reduzir o catálogo": {
    "en": "Drag to widen or narrow the catalog",
    "es": "Arrastre para ampliar o reducir el catálogo",
    "fr": "Faites glisser pour élargir ou rétrécir le catalogue"
  },
  "Recursos": {
    "en": "Resources",
    "es": "Recursos",
    "fr": "Ressources"
  },
  "O grupo não contém estilos ou mapas públicos compatíveis.": {
    "en": "This group contains no compatible public styles or maps.",
    "es": "Este grupo no contiene estilos ni mapas públicos compatibles.",
    "fr": "Ce groupe ne contient pas de styles ou de cartes publiques compatibles."
  },
  "Não foi possível consultar o servidor. Verifique a rede e se a API permite CORS nesta origem.": {
    "en": "Could not query the server. Check network access and whether its API permits CORS.",
    "es": "No se pudo consultar el servidor. Compruebe la red y si la API permite CORS.",
    "fr": "Impossible d'interroger le serveur. Vérifiez le réseau et les autorisations CORS de l'API."
  },
  "O servidor NextGIS Web não respondeu.": {
    "en": "The NextGIS Web server did not respond.",
    "es": "El servidor NextGIS Web no respondió.",
    "fr": "Le serveur NextGIS Web n'a pas répondu."
  },
  "O motor SIG não confirmou a importação vectorial.": {
    "en": "The GIS engine did not confirm vector import.",
    "es": "El motor SIG no confirmó la importación vectorial.",
    "fr": "Le moteur SIG n'a pas confirmé l'import vectoriel."
  },
  " feições vectoriais.": {
    "en": " vector features.",
    "es": " entidades vectoriales.",
    "fr": " entités vectorielles."
  },
  " importada: ": {
    "en": " imported: ",
    "es": " importada: ",
    "fr": " importée : "
  },
  " adicionada ao catálogo do projecto.": {
    "en": " added to the project catalog.",
    "es": " añadida al catálogo del proyecto.",
    "fr": " ajoutée au catalogue du projet."
  },
  "Não foi possível adicionar a camada.": {
    "en": "Could not add the layer.",
    "es": "No se pudo añadir la capa.",
    "fr": "Impossible d'ajouter la couche."
  },
  "NextGIS Web — recursos remotos": {
    "en": "NextGIS Web — remote resources",
    "es": "NextGIS Web — recursos remotos",
    "fr": "NextGIS Web — ressources distantes"
  },
  "Servidor NextGIS Web": {
    "en": "NextGIS Web server",
    "es": "Servidor NextGIS Web",
    "fr": "Serveur NextGIS Web"
  },
  "Recursos públicos · Importação como camadas SIG nativas": {
    "en": "Public resources · import as native GIS layers",
    "es": "Recursos públicos · importar como capas SIG nativas",
    "fr": "Ressources publiques · import comme couches SIG natives"
  },
  "Fechar NextGIS Web": {
    "en": "Close NextGIS Web",
    "es": "Cerrar NextGIS Web",
    "fr": "Fermer NextGIS Web"
  },
  "Endereço do servidor": {
    "en": "Server address",
    "es": "Dirección del servidor",
    "fr": "Adresse du serveur"
  },
  "Ligar": {
    "en": "Connect",
    "es": "Conectar",
    "fr": "Connexion"
  },
  "Navegação de recursos": {
    "en": "Resource navigation",
    "es": "Navegación de recursos",
    "fr": "Navigation des ressources"
  },
  "Voltar ao grupo anterior": {
    "en": "Return to previous group",
    "es": "Volver al grupo anterior",
    "fr": "Retour au groupe précédent"
  },
  "Voltar": {
    "en": "Back",
    "es": "Volver",
    "fr": "Retour"
  },
  "Filtrar recursos do grupo": {
    "en": "Filter group resources",
    "es": "Filtrar recursos del grupo",
    "fr": "Filtrer les ressources du groupe"
  },
  "Nome do mapa, estilo ou pasta…": {
    "en": "Map, style or folder name…",
    "es": "Nombre de mapa, estilo o carpeta…",
    "fr": "Nom de carte, style ou dossier…"
  },
  "A consultar catálogo…": {
    "en": "Loading catalog…",
    "es": "Consultando catálogo…",
    "fr": "Chargement du catalogue…"
  },
  "Esta sessão não permite adicionar camadas; a consulta é de leitura.": {
    "en": "This session cannot add layers; browsing is read-only.",
    "es": "Esta sesión no puede añadir capas; la consulta es de solo lectura.",
    "fr": "Cette session ne permet pas d'ajouter des couches ; consultation en lecture seule."
  },
  "Grupo de recursos": {
    "en": "Resource group",
    "es": "Grupo de recursos",
    "fr": "Groupe de ressources"
  },
  "Camada vectorial · importação local": {
    "en": "Vector layer · local import",
    "es": "Capa vectorial · importación local",
    "fr": "Couche vectorielle · import local"
  },
  "Abrir": {
    "en": "Open",
    "es": "Abrir",
    "fr": "Ouvrir"
  },
  "A importar…": {
    "en": "Importing…",
    "es": "Importando…",
    "fr": "Importation…"
  },
  "Importar": {
    "en": "Import",
    "es": "Importar",
    "fr": "Importer"
  },
  "Abrir servidor de origem": {
    "en": "Open source server",
    "es": "Abrir servidor de origen",
    "fr": "Ouvrir le serveur source"
  },
  "As camadas vectoriais são exportadas em EPSG:4326 (máximo 8 MB / 5 000 feições) e ficam disponíveis para análise local. A ligação utiliza apenas a API pública e não envia credenciais.": {
    "en": "Vector layers are exported in EPSG:4326 (up to 8 MB / 5,000 features) for local analysis. Only the public API is used, and no credentials are sent.",
    "es": "Las capas vectoriales se exportan en EPSG:4326 (hasta 8 MB / 5.000 entidades) para análisis local. Solo se utiliza la API pública y no se envían credenciales.",
    "fr": "Les couches vectorielles sont exportées en EPSG:4326 (8 Mo / 5 000 entités maximum) pour l'analyse locale. Seule l'API publique est utilisée, sans transmission d'identifiants."
  },
  "Recursos privados precisam de autorização no próprio NextGIS Web. A disponibilidade, CORS e os direitos de reutilização dependem do servidor de origem.": {
    "en": "Private resources require authorization in NextGIS Web. Availability, CORS and reuse rights depend on the source server.",
    "es": "Los recursos privados requieren autorización en NextGIS Web. La disponibilidad, CORS y los derechos de reutilización dependen del servidor de origen.",
    "fr": "Les ressources privées nécessitent une autorisation dans NextGIS Web. La disponibilité, CORS et les droits de réutilisation dépendent du serveur source."
  },
  "Consulta de catálogos sísmicos": {
    "en": "Seismic catalog queries",
    "es": "Consulta de catálogos sísmicos",
    "fr": "Consultation des catalogues sismiques"
  },
  "DADOS CIENTÍFICOS / FDSN": {
    "en": "SCIENTIFIC DATA / FDSN",
    "es": "DATOS CIENTÍFICOS / FDSN",
    "fr": "DONNÉES SCIENTIFIQUES / FDSN"
  },
  "Eventos sísmicos": {
    "en": "Earthquake events",
    "es": "Eventos sísmicos",
    "fr": "Événements sismiques"
  },
  "Catálogos oficiais em tempo real ou históricos, carregados no navegador.": {
    "en": "Official real-time or historical catalogs loaded in your browser.",
    "es": "Catálogos oficiales en tiempo real o históricos, cargados en el navegador.",
    "fr": "Catalogues officiels en temps réel ou historiques, chargés dans votre navigateur."
  },
  "Fechar consulta sísmica": {
    "en": "Close seismic query",
    "es": "Cerrar consulta sísmica",
    "fr": "Fermer la consultation sismique"
  },
  "Módulos sísmicos": {
    "en": "Seismic modules",
    "es": "Módulos sísmicos",
    "fr": "Modules sismiques"
  },
  "Eventos": {
    "en": "Events",
    "es": "Eventos",
    "fr": "Événements"
  },
  "Análises": {
    "en": "Analyses",
    "es": "Análisis",
    "fr": "Analyses"
  },
  "Estações EarthScope": {
    "en": "EarthScope stations",
    "es": "Estaciones EarthScope",
    "fr": "Stations EarthScope"
  },
  "Catálogo sísmico": {
    "en": "Seismic catalog",
    "es": "Catálogo sísmico",
    "fr": "Catalogue sismique"
  },
  "Área de estudo": {
    "en": "Study area",
    "es": "Área de estudio",
    "fr": "Zone d'étude"
  },
  "Área sísmica": {
    "en": "Seismic region",
    "es": "Área sísmica",
    "fr": "Région sismique"
  },
  "ISC — FDSN (texto)": {
    "en": "ISC — FDSN (text)",
    "es": "ISC — FDSN (texto)",
    "fr": "ISC — FDSN (texte)"
  },
  "Extensão personalizada (W,S,E,N)": {
    "en": "Custom extent (W,S,E,N)",
    "es": "Extensión personalizada (O,S,E,N)",
    "fr": "Étendue personnalisée (O,S,E,N)"
  },
  "Bounding box — oeste, sul, este, norte": {
    "en": "Bounding box — west, south, east, north",
    "es": "Caja envolvente — oeste, sur, este, norte",
    "fr": "Emprise — ouest, sud, est, nord"
  },
  "Limites sísmicos": {
    "en": "Seismic bounds",
    "es": "Límites sísmicos",
    "fr": "Limites sismiques"
  },
  "Início (UTC)": {
    "en": "Start (UTC)",
    "es": "Inicio (UTC)",
    "fr": "Début (UTC)"
  },
  "Início sísmico": {
    "en": "Seismic start date",
    "es": "Fecha inicial sísmica",
    "fr": "Date initiale des événements"
  },
  "Fim (UTC)": {
    "en": "End (UTC)",
    "es": "Fin (UTC)",
    "fr": "Fin (UTC)"
  },
  "Fim sísmico": {
    "en": "Seismic end date",
    "es": "Fecha final sísmica",
    "fr": "Date finale des événements"
  },
  "Magnitude mínima": {
    "en": "Minimum magnitude",
    "es": "Magnitud mínima",
    "fr": "Magnitude minimale"
  },
  "Magnitude mínima sísmica": {
    "en": "Minimum earthquake magnitude",
    "es": "Magnitud sísmica mínima",
    "fr": "Magnitude sismique minimale"
  },
  "Profundidade mínima (km)": {
    "en": "Minimum depth (km)",
    "es": "Profundidad mínima (km)",
    "fr": "Profondeur minimale (km)"
  },
  "Profundidade máxima (km)": {
    "en": "Maximum depth (km)",
    "es": "Profundidad máxima (km)",
    "fr": "Profondeur maximale (km)"
  },
  "Profundidade sísmica mínima": {
    "en": "Minimum seismic depth",
    "es": "Profundidad sísmica mínima",
    "fr": "Profondeur sismique minimale"
  },
  "Profundidade sísmica máxima": {
    "en": "Maximum seismic depth",
    "es": "Profundidad sísmica máxima",
    "fr": "Profondeur sismique maximale"
  },
  "Máximo de eventos": {
    "en": "Maximum events",
    "es": "Número máximo de eventos",
    "fr": "Nombre maximal d'événements"
  },
  "Limite sísmico": {
    "en": "Seismic result limit",
    "es": "Límite de resultados sísmicos",
    "fr": "Limite de résultats sismiques"
  },
  "A consultar…": {
    "en": "Querying…",
    "es": "Consultando…",
    "fr": "Consultation en cours…"
  },
  "Consultar eventos": {
    "en": "Query events",
    "es": "Consultar eventos",
    "fr": "Consulter les événements"
  },
  "Cancelar": {
    "en": "Cancel",
    "es": "Cancelar",
    "fr": "Annuler"
  },
  "Abrir consulta oficial em nova janela": {
    "en": "Open official query in a new window",
    "es": "Abrir consulta oficial en nueva ventana",
    "fr": "Ouvrir la requête officielle dans une nouvelle fenêtre"
  },
  "Ver pedido no serviço": {
    "en": "View service request",
    "es": "Ver petición al servicio",
    "fr": "Voir la requête au service"
  },
  "A obter eventos da fonte oficial…": {
    "en": "Fetching events from the official source…",
    "es": "Obteniendo eventos de la fuente oficial…",
    "fr": "Récupération des événements depuis la source officielle…"
  },
  "Consulta cancelada.": {
    "en": "Query cancelled.",
    "es": "Consulta cancelada.",
    "fr": "Requête annulée."
  },
  "Use 4 coordenadas: oeste, sul, este, norte.": {
    "en": "Enter four coordinates: west, south, east, north.",
    "es": "Introduzca cuatro coordenadas: oeste, sur, este, norte.",
    "fr": "Saisissez quatre coordonnées : ouest, sud, est, nord."
  },
  "Eventos consultados. Pode adicionar a camada ao mapa.": {
    "en": "Events retrieved. You can add the layer to the map.",
    "es": "Eventos consultados. Puede añadir la capa al mapa.",
    "fr": "Événements récupérés. Vous pouvez ajouter la couche à la carte."
  },
  "O catálogo não devolveu eventos para estes filtros.": {
    "en": "No events matched these filters.",
    "es": "El catálogo no devolvió eventos para estos filtros.",
    "fr": "Aucun événement ne correspond à ces filtres."
  },
  "Erro ao consultar os eventos sísmicos.": {
    "en": "Could not query seismic events.",
    "es": "Error al consultar eventos sísmicos.",
    "fr": "Échec de la consultation des événements sismiques."
  },
  "Sismicidade ": {
    "en": "Seismicity ",
    "es": "Sismicidad ",
    "fr": "Sismicité "
  },
  "Camada «": {
    "en": "Layer «",
    "es": "Capa «",
    "fr": "Couche «"
  },
  "» adicionada ao catálogo de camadas. Guarde o projecto para conservar o trabalho.": {
    "en": "» added to the layer catalog. Save your project to preserve your work.",
    "es": "» añadida al catálogo de capas. Guarde el proyecto para conservar el trabajo.",
    "fr": "» ajoutée au catalogue de couches. Enregistrez votre projet pour conserver le travail."
  },
  " eventos devolvidos por ": {
    "en": " events returned by ",
    "es": " eventos devueltos por ",
    "fr": " événements renvoyés par "
  },
  "Atenção: limite atingido; reduza a área/período para obter um catálogo completo.": {
    "en": "Warning: result limit reached; reduce the region/time window for a complete catalog.",
    "es": "Atención: se alcanzó el límite; reduzca el área o período para obtener un catálogo completo.",
    "fr": "Attention : limite atteinte ; réduisez la zone ou la période pour obtenir un catalogue complet."
  },
  "Adicionar ao mapa": {
    "en": "Add to map",
    "es": "Añadir al mapa",
    "fr": "Ajouter à la carte"
  },
  "A edição de camadas está desactivada neste modo de leitura. A exportação continua disponível.": {
    "en": "Layer editing is disabled in read-only mode. Export is still available.",
    "es": "La edición de capas está desactivada en modo de lectura. La exportación sigue disponible.",
    "fr": "La modification des couches est désactivée en lecture seule. L'export reste disponible."
  },
  "Pré-visualização dos eventos": {
    "en": "Event preview",
    "es": "Vista previa de eventos",
    "fr": "Aperçu des événements"
  },
  "Profundidade desconhecida": {
    "en": "Unknown depth",
    "es": "Profundidad desconocida",
    "fr": "Profondeur inconnue"
  },
  "Tipo M não especificado": {
    "en": "Magnitude type not specified",
    "es": "Tipo de magnitud no especificado",
    "fr": "Type de magnitude non précisé"
  },
  "Mostram-se apenas os primeiros 25 eventos. Todos os ": {
    "en": "Only the first 25 events are shown. All ",
    "es": "Solo se muestran los primeros 25 eventos. Los ",
    "fr": "Seuls les 25 premiers événements sont affichés. Les "
  },
  " registos podem ser exportados ou adicionados ao mapa.": {
    "en": " records can be exported or added to the map.",
    "es": " registros pueden exportarse o añadirse al mapa.",
    "fr": " enregistrements peuvent être exportés ou ajoutés à la carte."
  },
  "Consulte primeiro um catálogo de eventos no separador Eventos para activar os gráficos e perfis.": {
    "en": "Query an event catalog in the Events tab before opening charts and profiles.",
    "es": "Consulte primero un catálogo en la pestaña Eventos para activar gráficos y perfiles.",
    "fr": "Interrogez d'abord un catalogue dans l'onglet Événements pour activer les graphiques et profils."
  },
  "Fonte: ": {
    "en": "Source: ",
    "es": "Fuente: ",
    "fr": "Source : "
  },
  "Dados consultados directamente, sem armazenamento automático no Firebase. Eventos podem ser revistos pelas agências.": {
    "en": "Data is retrieved directly without automatic Firebase storage. Agencies may revise event records.",
    "es": "Datos consultados directamente, sin almacenamiento automático en Firebase. Las agencias pueden revisar los eventos.",
    "fr": "Données consultées directement sans stockage automatique sur Firebase. Les agences peuvent réviser les événements."
  },
  "Coordenadas A/B inválidas. Use longitude, latitude.": {
    "en": "Invalid A/B coordinates. Use longitude, latitude.",
    "es": "Coordenadas A/B no válidas. Use longitud, latitud.",
    "fr": "Coordonnées A/B invalides. Saisissez longitude, latitude."
  },
  "Perfil inválido.": {
    "en": "Invalid profile.",
    "es": "Perfil no válido.",
    "fr": "Profil invalide."
  },
  "Análises sísmicas": {
    "en": "Seismic analyses",
    "es": "Análisis sísmicos",
    "fr": "Analyses sismiques"
  },
  "Análise do catálogo": {
    "en": "Catalog analysis",
    "es": "Análisis del catálogo",
    "fr": "Analyse du catalogue"
  },
  " eventos · WGS 84 · UTC": {
    "en": " events · WGS 84 · UTC",
    "es": " eventos · WGS 84 · UTC",
    "fr": " événements · WGS 84 · UTC"
  },
  "Catálogo truncado: as estatísticas não são representativas.": {
    "en": "Truncated catalog: statistics are not representative.",
    "es": "Catálogo truncado: las estadísticas no son representativas.",
    "fr": "Catalogue tronqué : les statistiques ne sont pas représentatives."
  },
  "Magnitude × tempo": {
    "en": "Magnitude × time",
    "es": "Magnitud × tiempo",
    "fr": "Magnitude × temps"
  },
  "Magnitude por data UTC": {
    "en": "Magnitude by UTC date",
    "es": "Magnitud por fecha UTC",
    "fr": "Magnitude selon la date UTC"
  },
  "Data/hora UTC (esquerda → direita)": {
    "en": "UTC date/time (left → right)",
    "es": "Fecha/hora UTC (izquierda → derecha)",
    "fr": "Date/heure UTC (gauche → droite)"
  },
  "Eventos por dia": {
    "en": "Events per day",
    "es": "Eventos por día",
    "fr": "Événements par jour"
  },
  "Número de eventos por dia UTC": {
    "en": "Number of events per UTC day",
    "es": "Número de eventos por día UTC",
    "fr": "Nombre d'événements par jour UTC"
  },
  " eventos": {
    "en": " events",
    "es": " eventos",
    "fr": " événements"
  },
  "Dias com registos (": {
    "en": "Days with records (",
    "es": "Días con registros (",
    "fr": "Jours avec des enregistrements ("
  },
  "Perfil A (lon, lat)": {
    "en": "Profile A (lon, lat)",
    "es": "Perfil A (lon, lat)",
    "fr": "Profil A (lon, lat)"
  },
  "Perfil B (lon, lat)": {
    "en": "Profile B (lon, lat)",
    "es": "Perfil B (lon, lat)",
    "fr": "Profil B (lon, lat)"
  },
  "Semilargura (km)": {
    "en": "Half-width (km)",
    "es": "Semiancho (km)",
    "fr": "Demi-largeur (km)"
  },
  "Semilargura do perfil": {
    "en": "Profile half-width",
    "es": "Semiancho del perfil",
    "fr": "Demi-largeur du profil"
  },
  "Perfil hipocentral A–B": {
    "en": "A–B hypocentral profile",
    "es": "Perfil hipocentral A–B",
    "fr": "Profil hypocentral A–B"
  },
  "Profundidade sísmica ao longo do perfil AB": {
    "en": "Seismic depth along A–B profile",
    "es": "Profundidad sísmica a lo largo del perfil AB",
    "fr": "Profondeur sismique le long du profil AB"
  },
  "Distância de A (km) · profundidade aumenta para baixo": {
    "en": "Distance from A (km) · depth increases downward",
    "es": "Distancia desde A (km) · la profundidad aumenta hacia abajo",
    "fr": "Distance depuis A (km) · profondeur croissante vers le bas"
  },
  "Projecção regional; apenas eventos dentro da largura escolhida. Sem correcção topográfica.": {
    "en": "Regional projection; only events inside the selected corridor. No topographic correction.",
    "es": "Proyección regional; solo eventos dentro de la franja seleccionada. Sin corrección topográfica.",
    "fr": "Projection régionale ; seuls les événements dans le couloir sélectionné sont inclus. Sans correction topographique."
  },
  "Magnitude de completude assumida (Mc)": {
    "en": "Assumed completeness magnitude (Mc)",
    "es": "Magnitud de completitud asumida (Mc)",
    "fr": "Magnitude de complétude supposée (Mc)"
  },
  "Magnitude de completude": {
    "en": "Completeness magnitude",
    "es": "Magnitud de completitud",
    "fr": "Magnitude de complétude"
  },
  "Gutenberg–Richter · ajuste MLE": {
    "en": "Gutenberg–Richter · MLE fit",
    "es": "Gutenberg–Richter · ajuste MLE",
    "fr": "Gutenberg–Richter · ajustement MLE"
  },
  "b não estimável": {
    "en": "b not estimable",
    "es": "b no estimable",
    "fr": "b non estimable"
  },
  "Catálogo truncado; não interpretar. ": {
    "en": "Truncated catalog; do not interpret. ",
    "es": "Catálogo truncado; no interpretar. ",
    "fr": "Catalogue tronqué ; ne pas interpréter. "
  },
  "Redes FDSN": {
    "en": "FDSN networks",
    "es": "Redes FDSN",
    "fr": "Réseaux FDSN"
  },
  "Redes sísmicas EarthScope": {
    "en": "EarthScope seismic networks",
    "es": "Redes sísmicas EarthScope",
    "fr": "Réseaux sismiques EarthScope"
  },
  "Metadados de redes, localização e elevação. Não são formas de onda miniSEED nem prova de disponibilidade de dados.": {
    "en": "Network, location and elevation metadata. These are not miniSEED waveforms or evidence that waveform data are available.",
    "es": "Metadatos de red, ubicación y elevación. No son formas de onda miniSEED ni prueba de disponibilidad de datos.",
    "fr": "Métadonnées des réseaux, emplacements et altitudes. Il ne s'agit pas de formes d'onde miniSEED ni d'une preuve de disponibilité des données."
  },
  "Consultar estações": {
    "en": "Query stations",
    "es": "Consultar estaciones",
    "fr": "Consulter les stations"
  },
  "Adicionar estações ao mapa": {
    "en": "Add stations to map",
    "es": "Añadir estaciones al mapa",
    "fr": "Ajouter les stations à la carte"
  },
  " estações devolvidas pela EarthScope.": {
    "en": " stations returned by EarthScope.",
    "es": " estaciones devueltas por EarthScope.",
    "fr": " stations renvoyées par EarthScope."
  },
  "Falha ao consultar estações.": {
    "en": "Could not query stations.",
    "es": "No se pudieron consultar las estaciones.",
    "fr": "Impossible de consulter les stations."
  },
  "Estações EarthScope · ": {
    "en": "EarthScope stations · ",
    "es": "Estaciones EarthScope · ",
    "fr": "Stations EarthScope · "
  },
  "Camada de estações adicionada. Guarde o projecto para persistir os dados.": {
    "en": "Station layer added. Save your project to preserve the data.",
    "es": "Capa de estaciones añadida. Guarde el proyecto para conservar los datos.",
    "fr": "Couche de stations ajoutée. Enregistrez votre projet pour conserver les données."
  },
  "Resultado limitado: refine redes e extensão antes de utilizar em análises de cobertura instrumental.": {
    "en": "Limited result: refine networks and extent before using for instrumental coverage analysis.",
    "es": "Resultado limitado: refine redes y extensión antes de analizar la cobertura instrumental.",
    "fr": "Résultat limité : affinez les réseaux et l'emprise avant une analyse de couverture instrumentale."
  },
  "Pré-visualização das estações": {
    "en": "Station preview",
    "es": "Vista previa de estaciones",
    "fr": "Aperçu des stations"
  },
  "Mostram-se as primeiras 30 estações.": {
    "en": "Only the first 30 stations are shown.",
    "es": "Solo se muestran las primeras 30 estaciones.",
    "fr": "Seules les 30 premières stations sont affichées."
  },
  "Criar camada cartográfica": {
    "en": "Create cartographic layer",
    "es": "Crear capa cartográfica",
    "fr": "Créer une couche cartographique"
  },
  "Nova camada vectorial": {
    "en": "New vector layer",
    "es": "Nueva capa vectorial",
    "fr": "Nouvelle couche vectorielle"
  },
  "Fechar assistente": {
    "en": "Close wizard",
    "es": "Cerrar asistente",
    "fr": "Fermer l'assistant"
  },
  "Etapa 2 · Camada e atributos.": {
    "en": "Step 2 · Layer and attributes.",
    "es": "Paso 2 · Capa y atributos.",
    "fr": "Étape 2 · Couche et attributs."
  },
  "Crie uma camada vazia e configure os campos antes de desenhar. O ficheiro do projecto é guardado localmente quando utilizar «Guardar como».": {
    "en": "Create an empty layer and configure fields before drawing. The project file is stored locally when you use Save as.",
    "es": "Cree una capa vacía y configure los campos antes de dibujar. El archivo del proyecto se guarda localmente al usar Guardar como.",
    "fr": "Créez une couche vide et configurez les champs avant de dessiner. Le fichier du projet est enregistré localement avec Enregistrer sous."
  },
  "Modelo cartográfico": {
    "en": "Cartographic template",
    "es": "Plantilla cartográfica",
    "fr": "Modèle cartographique"
  },
  "Nome da camada": {
    "en": "Layer name",
    "es": "Nombre de la capa",
    "fr": "Nom de la couche"
  },
  "Nome da nova camada": {
    "en": "New layer name",
    "es": "Nombre de la nueva capa",
    "fr": "Nom de la nouvelle couche"
  },
  "Tipo de geometria": {
    "en": "Geometry type",
    "es": "Tipo de geometría",
    "fr": "Type de géométrie"
  },
  "Geometria da camada": {
    "en": "Layer geometry",
    "es": "Geometría de la capa",
    "fr": "Géométrie de la couche"
  },
  "Ponto": {
    "en": "Point",
    "es": "Punto",
    "fr": "Point"
  },
  "Linha": {
    "en": "Line",
    "es": "Línea",
    "fr": "Ligne"
  },
  "Polígono": {
    "en": "Polygon",
    "es": "Polígono",
    "fr": "Polygone"
  },
  "SRC de referência para resultados": {
    "en": "Target CRS for outputs",
    "es": "SRC de referencia para resultados",
    "fr": "SCR de référence pour les résultats"
  },
  "SRC pretendido da camada": {
    "en": "Intended layer CRS",
    "es": "SRC previsto de la capa",
    "fr": "SCR prévu de la couche"
  },
  "(geográfico)": {
    "en": "(geographic)",
    "es": "(geográfico)",
    "fr": "(géographique)"
  },
  "zona": {
    "en": "zone",
    "es": "zona",
    "fr": "zone"
  },
  "O motor WebGIS desenha e guarda GeoJSON em WGS 84 (longitude/latitude). Uma preferência UTM não reprojeta automaticamente o GeoJSON: utilize «Reprojectar» antes de exportar para um SRC métrico.": {
    "en": "WebGIS draws and stores GeoJSON in WGS 84 (longitude/latitude). Selecting a UTM preference does not reproject GeoJSON automatically: use Reproject before exporting to a metric CRS.",
    "es": "WebGIS dibuja y guarda GeoJSON en WGS 84 (longitud/latitud). Elegir UTM no reproyecta automáticamente el GeoJSON: utilice Reproyectar antes de exportar a un SRC métrico.",
    "fr": "WebGIS dessine et stocke le GeoJSON en WGS 84 (longitude/latitude). Choisir UTM ne reprojette pas automatiquement le GeoJSON : utilisez Reprojeter avant l'export dans un SCR métrique."
  },
  "Campos da tabela de atributos": {
    "en": "Attribute table fields",
    "es": "Campos de la tabla de atributos",
    "fr": "Champs de la table attributaire"
  },
  "Número decimal": {
    "en": "Decimal number",
    "es": "Número decimal",
    "fr": "Nombre décimal"
  },
  "Texto": {
    "en": "Text",
    "es": "Texto",
    "fr": "Texte"
  },
  "Remover campo ": {
    "en": "Remove field ",
    "es": "Eliminar campo ",
    "fr": "Supprimer le champ "
  },
  "Novo campo": {
    "en": "New field",
    "es": "Nuevo campo",
    "fr": "Nouveau champ"
  },
  "Tipo do novo campo": {
    "en": "New field type",
    "es": "Tipo del nuevo campo",
    "fr": "Type du nouveau champ"
  },
  "Decimal": {
    "en": "Decimal",
    "es": "Decimal",
    "fr": "Décimal"
  },
  "Adicionar à lista de campos": {
    "en": "Add to field list",
    "es": "Añadir a la lista de campos",
    "fr": "Ajouter à la liste des champs"
  },
  "Após criar, seleccione a camada no catálogo, active «Edição» e use «Adicionar ponto», «Adicionar linha» ou «Adicionar polígono» conforme a geometria. Cada feição abre um formulário de atributos. Termine guardando as edições e o projecto.": {
    "en": "After creation, select the layer in the catalog, enable Editing and use Add point, Add line or Add polygon for its geometry. Each feature opens an attribute form. Finish by saving edits and the project.",
    "es": "Tras crearla, seleccione la capa, active Edición y utilice Añadir punto, Añadir línea o Añadir polígono según la geometría. Cada entidad abre un formulario de atributos. Termine guardando las ediciones y el proyecto.",
    "fr": "Après création, sélectionnez la couche, activez Édition et utilisez Ajouter un point, une ligne ou un polygone selon la géométrie. Chaque entité ouvre un formulaire attributaire. Enregistrez ensuite les modifications et le projet."
  },
  "» criada e seleccionada. Abra «Vector» no cabeçalho para iniciar a digitalização.": {
    "en": "» created and selected. Open Vector in the toolbar to start digitizing.",
    "es": "» creada y seleccionada. Abra Vector en la barra para empezar a digitalizar.",
    "fr": "» créée et sélectionnée. Ouvrez Vecteur dans la barre pour commencer la numérisation."
  },
  "Criar camada vazia": {
    "en": "Create empty layer",
    "es": "Crear capa vacía",
    "fr": "Créer une couche vide"
  },
  "O nome do campo deve começar por letra ou _ e conter apenas letras, números ou _.": {
    "en": "Field names must start with a letter or _ and only contain letters, numbers or _.",
    "es": "El nombre del campo debe empezar por una letra o _ y contener solo letras, números o _.",
    "fr": "Le nom de champ doit commencer par une lettre ou _ et ne contenir que lettres, chiffres ou _."
  },
  "Já existe um campo com este nome.": {
    "en": "A field with this name already exists.",
    "es": "Ya existe un campo con este nombre.",
    "fr": "Un champ portant ce nom existe déjà."
  },
  "O seu perfil não permite criar camadas.": {
    "en": "Your account cannot create layers.",
    "es": "Su cuenta no permite crear capas.",
    "fr": "Votre compte ne permet pas de créer des couches."
  },
  "Adicione o campo pendente à lista antes de criar a camada.": {
    "en": "Add the pending field to the list before creating the layer.",
    "es": "Añada el campo pendiente antes de crear la capa.",
    "fr": "Ajoutez le champ en attente avant de créer la couche."
  },
  "Corrija os nomes ou a duplicação de campos.": {
    "en": "Fix invalid or duplicate field names.",
    "es": "Corrija los nombres de campo no válidos o duplicados.",
    "fr": "Corrigez les noms de champs invalides ou en double."
  },
  "Não foi possível criar a camada.": {
    "en": "Unable to create layer.",
    "es": "No se pudo crear la capa.",
    "fr": "Impossible de créer la couche."
  },
  "Propriedades da camada": {
    "en": "Layer properties",
    "es": "Propiedades de la capa",
    "fr": "Propriétés de la couche"
  },
  "Nome": {
    "en": "Name",
    "es": "Nombre",
    "fr": "Nom"
  },
  "Renomear camada": {
    "en": "Rename layer",
    "es": "Renombrar capa",
    "fr": "Renommer la couche"
  },
  "Grupo": {
    "en": "Group",
    "es": "Grupo",
    "fr": "Groupe"
  },
  "Grupo da camada": {
    "en": "Layer group",
    "es": "Grupo de la capa",
    "fr": "Groupe de la couche"
  },
  "Sem grupo": {
    "en": "No group",
    "es": "Sin grupo",
    "fr": "Sans groupe"
  },
  "Mostrar grupo ": {
    "en": "Show group ",
    "es": "Mostrar grupo ",
    "fr": "Afficher le groupe "
  },
  "Nome do novo grupo": {
    "en": "New group name",
    "es": "Nombre del nuevo grupo",
    "fr": "Nom du nouveau groupe"
  },
  "Novo grupo": {
    "en": "New group",
    "es": "Nuevo grupo",
    "fr": "Nouveau groupe"
  },
  "Criar": {
    "en": "Create",
    "es": "Crear",
    "fr": "Créer"
  },
  "Subir": {
    "en": "Move up",
    "es": "Subir",
    "fr": "Monter"
  },
  "Descer": {
    "en": "Move down",
    "es": "Bajar",
    "fr": "Descendre"
  },
  "Exportar GeoJSON": {
    "en": "Export GeoJSON",
    "es": "Exportar GeoJSON",
    "fr": "Exporter GeoJSON"
  },
  "As propriedades estão disponíveis para consulta nesta sessão.": {
    "en": "Layer properties are read-only in this session.",
    "es": "Las propiedades son de solo lectura en esta sesión.",
    "fr": "Les propriétés sont consultables en lecture seule dans cette session."
  },
  "Fluxo de digitalização": {
    "en": "Digitizing workflow",
    "es": "Flujo de digitalización",
    "fr": "Flux de numérisation"
  },
  "Edição activa": {
    "en": "Editing active",
    "es": "Edición activa",
    "fr": "Édition active"
  },
  "Preparação": {
    "en": "Preparation",
    "es": "Preparación",
    "fr": "Préparation"
  },
  "Concluir e guardar edição": {
    "en": "Finish and save edits",
    "es": "Terminar y guardar edición",
    "fr": "Terminer et enregistrer les modifications"
  },
  "Digitalizar nesta camada": {
    "en": "Digitize this layer",
    "es": "Digitalizar esta capa",
    "fr": "Numériser cette couche"
  },
  "Descartar": {
    "en": "Discard",
    "es": "Descartar",
    "fr": "Annuler"
  },
  "Configuração de aderência": {
    "en": "Snapping settings",
    "es": "Configuración de ajuste",
    "fr": "Paramètres d'accrochage"
  },
  "Aderência (snapping)": {
    "en": "Snapping",
    "es": "Ajuste (snapping)",
    "fr": "Accrochage"
  },
  "Tolerância (pixels)": {
    "en": "Tolerance (pixels)",
    "es": "Tolerancia (píxeles)",
    "fr": "Tolérance (pixels)"
  },
  "Ferramentas de desenho": {
    "en": "Drawing tools",
    "es": "Herramientas de dibujo",
    "fr": "Outils de dessin"
  },
  "Adicionar ponto": {
    "en": "Add point",
    "es": "Añadir punto",
    "fr": "Ajouter un point"
  },
  "Adicionar linha": {
    "en": "Add line",
    "es": "Añadir línea",
    "fr": "Ajouter une ligne"
  },
  "Adicionar polígono": {
    "en": "Add polygon",
    "es": "Añadir polígono",
    "fr": "Ajouter un polygone"
  },
  "Tabela de atributos": {
    "en": "Attribute table",
    "es": "Tabla de atributos",
    "fr": "Table attributaire"
  },
  "Como digitalizar esta camada": {
    "en": "How to digitize this layer",
    "es": "Cómo digitalizar esta capa",
    "fr": "Comment numériser cette couche"
  },
  "Carregue a carta georreferenciada ou um mapa base em «Dados».": {
    "en": "Load a georeferenced image or basemap under Data.",
    "es": "Cargue una imagen georreferenciada o un mapa base desde Datos.",
    "fr": "Chargez une carte géoréférencée ou un fond de carte sous Données."
  },
  "Seleccione a camada e active a edição.": {
    "en": "Select the layer and enable editing.",
    "es": "Seleccione la capa y active la edición.",
    "fr": "Sélectionnez la couche et activez l'édition."
  },
  "Configure a aderência e desenhe no mapa.": {
    "en": "Configure snapping and draw on the map.",
    "es": "Configure el ajuste y dibuje en el mapa.",
    "fr": "Configurez l'accrochage et dessinez sur la carte."
  },
  "Preencha os atributos quando concluir a feição.": {
    "en": "Fill the attributes after creating the feature.",
    "es": "Rellene los atributos al terminar la entidad.",
    "fr": "Renseignez les attributs après avoir créé l'entité."
  },
  "Guarde as edições da camada e depois guarde ou exporte o projecto.": {
    "en": "Save layer edits, then save or export the project.",
    "es": "Guarde las ediciones de la capa y luego guarde o exporte el proyecto.",
    "fr": "Enregistrez les modifications de la couche, puis enregistrez ou exportez le projet."
  },
  "Atributos da nova feição": {
    "en": "New feature attributes",
    "es": "Atributos de la nueva entidad",
    "fr": "Attributs de la nouvelle entité"
  },
  "Fechar formulário de atributos": {
    "en": "Close attribute form",
    "es": "Cerrar formulario de atributos",
    "fr": "Fermer le formulaire d'attributs"
  },
  "Feição criada sem atributos. Pode preenchê-los após guardar a edição, na tabela.": {
    "en": "Feature created without attributes. You can fill them in the table after saving edits.",
    "es": "Entidad creada sin atributos. Puede rellenarlos en la tabla tras guardar.",
    "fr": "Entité créée sans attributs. Vous pourrez les renseigner dans la table après enregistrement."
  },
  "Geometria criada na camada «": {
    "en": "Geometry created in layer «",
    "es": "Geometría creada en la capa «",
    "fr": "Géométrie créée dans la couche «"
  },
  "». Preencha os campos antes de guardar as edições.": {
    "en": "». Fill in the fields before saving edits.",
    "es": "». Rellene los campos antes de guardar las ediciones.",
    "fr": "». Renseignez les champs avant d'enregistrer les modifications."
  },
  "Esta camada não tem campos definidos. Pode guardá-la e configurar a tabela depois.": {
    "en": "This layer has no defined fields. You can save it and configure its table later.",
    "es": "Esta capa no tiene campos definidos. Puede guardarla y configurar la tabla después.",
    "fr": "Cette couche ne contient pas de champs définis. Vous pourrez les configurer après l'avoir enregistrée."
  },
  "Atributo ": {
    "en": "Attribute ",
    "es": "Atributo ",
    "fr": "Attribut "
  },
  "Feição criada sem atributos. Utilize a tabela depois.": {
    "en": "Feature created without attributes. Use the table later.",
    "es": "Entidad creada sin atributos. Utilice la tabla después.",
    "fr": "Entité créée sans attributs. Utilisez la table ensuite."
  },
  "Sem atributos": {
    "en": "Without attributes",
    "es": "Sin atributos",
    "fr": "Sans attributs"
  },
  "Guardar atributos": {
    "en": "Save attributes",
    "es": "Guardar atributos",
    "fr": "Enregistrer les attributs"
  },
  "Clique no mapa para definir os vértices. Conclua a linha com duplo clique ou feche o polígono no primeiro vértice. Depois preencha os atributos da feição.": {
    "en": "Click on the map to place vertices. Double-click to finish a line, or close a polygon at its first vertex. Then fill in the feature attributes.",
    "es": "Haga clic en el mapa para definir vértices. Termine la línea con doble clic o cierre el polígono en el primer vértice. Después rellene los atributos.",
    "fr": "Cliquez sur la carte pour placer les sommets. Double-cliquez pour terminer une ligne ou fermez le polygone sur son premier sommet. Renseignez ensuite les attributs."
  },
  "O campo ": {
    "en": "Field ",
    "es": "El campo ",
    "fr": "Le champ "
  },
  " deve conter um número decimal válido.": {
    "en": " must contain a valid decimal number.",
    "es": " debe contener un número decimal válido.",
    "fr": " doit contenir un nombre décimal valide."
  },
  "Atributos atribuídos à feição. Guarde as edições da camada para os conservar.": {
    "en": "Attributes assigned to the feature. Save the layer edits to preserve them.",
    "es": "Atributos asignados a la entidad. Guarde las ediciones de la capa.",
    "fr": "Attributs attribués à l'entité. Enregistrez les modifications pour les conserver."
  },
  "Unidades geológicas": {
    "en": "Geological units",
    "es": "Unidades geológicas",
    "fr": "Unités géologiques"
  },
  "Falhas e lineamentos": {
    "en": "Faults and lineaments",
    "es": "Fallas y lineamientos",
    "fr": "Failles et linéaments"
  },
  "Medidas estruturais": {
    "en": "Structural measurements",
    "es": "Mediciones estructurales",
    "fr": "Mesures structurales"
  },
  "Ocorrências minerais": {
    "en": "Mineral occurrences",
    "es": "Ocurrencias minerales",
    "fr": "Indices minéraux"
  },
  "Afloramentos e amostras": {
    "en": "Outcrops and samples",
    "es": "Afloramientos y muestras",
    "fr": "Affleurements et échantillons"
  },
  "Uso e cobertura do solo": {
    "en": "Land use and land cover",
    "es": "Uso y cobertura del suelo",
    "fr": "Occupation et couverture du sol"
  },
  "Nova camada personalizada": {
    "en": "New custom layer",
    "es": "Nueva capa personalizada",
    "fr": "Nouvelle couche personnalisée"
  },
  "Código da unidade geológica": {
    "en": "Geological unit code",
    "es": "Código de unidad geológica",
    "fr": "Code de l'unité géologique"
  },
  "Litologia dominante": {
    "en": "Dominant lithology",
    "es": "Litología dominante",
    "fr": "Lithologie dominante"
  },
  "Idade geológica": {
    "en": "Geological age",
    "es": "Edad geológica",
    "fr": "Âge géologique"
  },
  "Formação geológica": {
    "en": "Geological formation",
    "es": "Formación geológica",
    "fr": "Formation géologique"
  },
  "Observações de campo": {
    "en": "Field observations",
    "es": "Observaciones de campo",
    "fr": "Observations de terrain"
  },
  "Referência/cartografia": {
    "en": "Map reference/source",
    "es": "Referencia cartográfica",
    "fr": "Référence cartographique"
  },
  "Nome/identificador": {
    "en": "Name/identifier",
    "es": "Nombre/identificador",
    "fr": "Nom/identifiant"
  },
  "Falha normal, inversa, desligamento, etc.": {
    "en": "Normal, reverse or strike-slip fault, etc.",
    "es": "Falla normal, inversa o de desgarre, etc.",
    "fr": "Faille normale, inverse ou décrochante, etc."
  },
  "Direcção em graus (se medida)": {
    "en": "Strike in degrees (if measured)",
    "es": "Dirección en grados (si se midió)",
    "fr": "Direction en degrés (si mesurée)"
  },
  "Mergulho em graus (se medido)": {
    "en": "Dip in degrees (if measured)",
    "es": "Buzamiento en grados (si se midió)",
    "fr": "Pendage en degrés (si mesuré)"
  },
  "Interpretada, inferida ou observada": {
    "en": "Interpreted, inferred or observed",
    "es": "Interpretada, inferida u observada",
    "fr": "Interprétée, inférée ou observée"
  },
  "Fonte": {
    "en": "Source",
    "es": "Fuente",
    "fr": "Source"
  },
  "Identificador da medida": {
    "en": "Measurement identifier",
    "es": "Identificador de la medida",
    "fr": "Identifiant de mesure"
  },
  "Acamamento, foliação, fractura": {
    "en": "Bedding, foliation, fracture",
    "es": "Estratificación, foliación, fractura",
    "fr": "Stratification, foliation, fracture"
  },
  "Strike em graus": {
    "en": "Strike in degrees",
    "es": "Rumbo en grados",
    "fr": "Direction en degrés"
  },
  "Dip em graus": {
    "en": "Dip in degrees",
    "es": "Buzamiento en grados",
    "fr": "Pendage en degrés"
  },
  "Rake em graus": {
    "en": "Rake in degrees",
    "es": "Rake en grados",
    "fr": "Pitch en degrés"
  },
  "Mineral ou elemento": {
    "en": "Mineral or element",
    "es": "Mineral o elemento",
    "fr": "Minéral ou élément"
  },
  "Tipo de depósito": {
    "en": "Deposit type",
    "es": "Tipo de yacimiento",
    "fr": "Type de gisement"
  },
  "Rocha hospedeira": {
    "en": "Host rock",
    "es": "Roca encajante",
    "fr": "Roche encaissante"
  },
  "Estado da ocorrência": {
    "en": "Occurrence status",
    "es": "Estado de la ocurrencia",
    "fr": "État de l'indice"
  },
  "Código do ponto": {
    "en": "Point code",
    "es": "Código del punto",
    "fr": "Code du point"
  },
  "Litologia": {
    "en": "Lithology",
    "es": "Litología",
    "fr": "Lithologie"
  },
  "Descrição de afloramento": {
    "en": "Outcrop description",
    "es": "Descripción del afloramiento",
    "fr": "Description de l'affleurement"
  },
  "Código da amostra": {
    "en": "Sample ID",
    "es": "Código de la muestra",
    "fr": "Code de l'échantillon"
  },
  "Classe temática": {
    "en": "Thematic class",
    "es": "Clase temática",
    "fr": "Classe thématique"
  },
  "Subclasse": {
    "en": "Subclass",
    "es": "Subclase",
    "fr": "Sous-classe"
  },
  "Ano de referência": {
    "en": "Reference year",
    "es": "Año de referencia",
    "fr": "Année de référence"
  },
  "Origem dos dados": {
    "en": "Data source",
    "es": "Origen de los datos",
    "fr": "Source des données"
  },
  "Identificador da feição": {
    "en": "Feature identifier",
    "es": "Identificador de la entidad",
    "fr": "Identifiant de l'entité"
  },
  "Descrição": {
    "en": "Description",
    "es": "Descripción",
    "fr": "Description"
  },
  "WGS 84 (geográfico)": {
    "en": "WGS 84 (geographic)",
    "es": "WGS 84 (geográfico)",
    "fr": "WGS 84 (géographique)"
  },
  "UTM zona ": {
    "en": "UTM zone ",
    "es": "UTM zona ",
    "fr": "Zone UTM "
  },
  "Sobre o GeoMoz GIS Workspace": {
    "en": "About GeoMoz GIS Workspace",
    "es": "Acerca de GeoMoz GIS Workspace",
    "fr": "À propos de GeoMoz GIS Workspace"
  },
  "Sobre": {
    "en": "About",
    "es": "Acerca de",
    "fr": "À propos"
  },
  "Ambiente SIG profissional integrado no GeoMoz Explorer.": {
    "en": "Professional GIS environment integrated into GeoMoz Explorer.",
    "es": "Entorno SIG profesional integrado en GeoMoz Explorer.",
    "fr": "Environnement SIG professionnel intégré à GeoMoz Explorer."
  },
  "Explore, visualize e analise informação geoespacial com ferramentas vectoriais, raster, DEM e serviços científicos, no navegador.": {
    "en": "Explore, visualize and analyze geospatial information in your browser with vector, raster, DEM and scientific services.",
    "es": "Explore, visualice y analice información geoespacial en el navegador con herramientas vectoriales, ráster, MDE y servicios científicos.",
    "fr": "Explorez, visualisez et analysez des données géospatiales dans votre navigateur grâce aux outils vecteur, raster, MNT et services scientifiques."
  },
  "Os seus ficheiros não são enviados automaticamente à nuvem GeoMoz.": {
    "en": "Your files are not automatically uploaded to GeoMoz cloud.",
    "es": "Sus archivos no se cargan automáticamente en la nube de GeoMoz.",
    "fr": "Vos fichiers ne sont pas automatiquement transférés vers le cloud GeoMoz."
  },
  "Guarde ou exporte o projecto para conservar o trabalho. Os serviços de mapas e catálogos públicos podem efectuar pedidos a terceiros.": {
    "en": "Save or export your project to preserve your work. Map services and public catalogs may contact third parties.",
    "es": "Guarde o exporte el proyecto para conservar su trabajo. Los servicios de mapas y catálogos públicos pueden contactar con terceros.",
    "fr": "Enregistrez ou exportez votre projet pour conserver votre travail. Les services cartographiques et catalogues publics peuvent contacter des tiers."
  },
  "Explorador de mapas GeoMoz": {
    "en": "GeoMoz map explorer",
    "es": "Explorador de mapas GeoMoz",
    "fr": "Explorateur cartographique GeoMoz"
  },
  "Documentação GeoMoz": {
    "en": "GeoMoz documentation",
    "es": "Documentación GeoMoz",
    "fr": "Documentation GeoMoz"
  },
  "Política de privacidade": {
    "en": "Privacy policy",
    "es": "Política de privacidad",
    "fr": "Politique de confidentialité"
  },
  "Termos de utilização": {
    "en": "Terms of use",
    "es": "Términos de uso",
    "fr": "Conditions d'utilisation"
  },
  "Créditos e licenças de terceiros": {
    "en": "Third-party credits and licences",
    "es": "Créditos y licencias de terceros",
    "fr": "Crédits et licences de tiers"
  },
  "GeoMoz GIS Workspace · GEOLÍTHICA. Base tecnológica de código aberto sob as respectivas licenças, identificadas nos avisos de terceiros.": {
    "en": "GeoMoz GIS Workspace · GEOLÍTHICA. Built on open-source technology under the respective licences listed in third-party notices.",
    "es": "GeoMoz GIS Workspace · GEOLÍTHICA. Basado en tecnología de código abierto bajo las licencias indicadas en los avisos de terceros.",
    "fr": "GeoMoz GIS Workspace · GEOLÍTHICA. Basé sur des technologies open source sous les licences mentionnées dans les notices de tiers."
  },
  "Elementos livres": {
    "en": "Free layout elements",
    "es": "Elementos libres",
    "fr": "Éléments libres"
  },
  "Adicionar texto": {
    "en": "Add text",
    "es": "Añadir texto",
    "fr": "Ajouter du texte"
  },
  "Adicionar moldura": {
    "en": "Add frame",
    "es": "Añadir marco",
    "fr": "Ajouter un cadre"
  },
  "Logótipo / imagem": {
    "en": "Logo / image",
    "es": "Logotipo / imagen",
    "fr": "Logo / image"
  },
  "Carregar logótipo": {
    "en": "Upload logo",
    "es": "Cargar logotipo",
    "fr": "Importer un logo"
  },
  "Use uma imagem até 2 MB.": {
    "en": "Use an image up to 2 MB.",
    "es": "Utilice una imagen de hasta 2 MB.",
    "fr": "Utilisez une image de 2 Mo maximum."
  },
  "Limite de imagens do layout atingido.": {
    "en": "Layout image size limit reached.",
    "es": "Se alcanzó el límite de imágenes del diseño.",
    "fr": "Limite d’images de la mise en page atteinte."
  },
  "Use uma imagem até 16 milhões de píxeis.": {
    "en": "Use an image with up to 16 million pixels.",
    "es": "Utilice una imagen de hasta 16 millones de píxeles.",
    "fr": "Utilisez une image de 16 millions de pixels maximum."
  },
  "Formato não suportado": {
    "en": "Unsupported format",
    "es": "Formato no admitido",
    "fr": "Format non pris en charge"
  },
  "Arraste um item na página para mover. Shift + arrastar redimensiona. As posições são percentagens da página.": {
    "en": "Drag an element to move it. Shift + drag to resize. Positions are percentages of the page.",
    "es": "Arrastre un elemento para moverlo. Mayús + arrastrar para redimensionar. Las posiciones son porcentajes de la página.",
    "fr": "Faites glisser un élément pour le déplacer. Maj + glisser pour redimensionner. Les positions sont des pourcentages de la page."
  },
  "Item seleccionado": {
    "en": "Selected element",
    "es": "Elemento seleccionado",
    "fr": "Élément sélectionné"
  },
  "Seleccionar item": {
    "en": "Select element",
    "es": "Seleccionar elemento",
    "fr": "Sélectionner un élément"
  },
  "Imagem": {
    "en": "Image",
    "es": "Imagen",
    "fr": "Image"
  },
  "Moldura": {
    "en": "Frame",
    "es": "Marco",
    "fr": "Cadre"
  },
  "Bloquear posição": {
    "en": "Lock position",
    "es": "Bloquear posición",
    "fr": "Verrouiller la position"
  },
  "Visível": {
    "en": "Visible",
    "es": "Visible",
    "fr": "Visible"
  },
  "Largura (%)": {
    "en": "Width (%)",
    "es": "Anchura (%)",
    "fr": "Largeur (%)"
  },
  "Altura (%)": {
    "en": "Height (%)",
    "es": "Altura (%)",
    "fr": "Hauteur (%)"
  },
  "Texto do item": {
    "en": "Element text",
    "es": "Texto del elemento",
    "fr": "Texte de l’élément"
  },
  "Tamanho (pt)": {
    "en": "Size (pt)",
    "es": "Tamaño (pt)",
    "fr": "Taille (pt)"
  },
  "Cor": {
    "en": "Colour",
    "es": "Color",
    "fr": "Couleur"
  },
  "Fundo": {
    "en": "Background",
    "es": "Fondo",
    "fr": "Arrière-plan"
  },
  "Remover item": {
    "en": "Remove element",
    "es": "Eliminar elemento",
    "fr": "Supprimer l’élément"
  },
  "Posição do mapa e da legenda": {
    "en": "Map and legend placement",
    "es": "Posición del mapa y la leyenda",
    "fr": "Position de la carte et de la légende"
  },
  "Mapa e legenda na página": {
    "en": "Map and legend on the page",
    "es": "Mapa y leyenda en la página",
    "fr": "Carte et légende sur la page"
  },
  "Posição personalizada do mapa": {
    "en": "Custom map placement",
    "es": "Posición personalizada del mapa",
    "fr": "Position personnalisée de la carte"
  },
  "Posição personalizada da legenda": {
    "en": "Custom legend placement",
    "es": "Posición personalizada de la leyenda",
    "fr": "Position personnalisée de la légende"
  },
  "Tamanho relativo": {
    "en": "Relative size",
    "es": "Tamaño relativo",
    "fr": "Taille relative"
  },
  "As posições usam a página como referência. A escala cartográfica acompanha o tamanho do mapa. Active «Legenda» para a apresentar; confirme que cabe na página antes de exportar.": {
    "en": "Positions are relative to the page. Map scale follows the map frame size. Enable “Legend” to display it; check that it fits before exporting.",
    "es": "Las posiciones son relativas a la página. La escala depende del tamaño del mapa. Active «Leyenda» para mostrarla y compruebe que cabe antes de exportar.",
    "fr": "Les positions sont relatives à la page. L’échelle dépend de la taille du cadre de carte. Activez «Légende» pour l’afficher et vérifiez qu’elle tient avant l’export."
  },
  "mapa": {
    "en": "map",
    "es": "mapa",
    "fr": "carte"
  },
  "legenda": {
    "en": "legend",
    "es": "leyenda",
    "fr": "légende"
  },
  "Novo texto": {
    "en": "New text",
    "es": "Texto nuevo",
    "fr": "Nouveau texte"
  },
  "x do item": {
    "en": "element x",
    "es": "x del elemento",
    "fr": "x de l’élément"
  },
  "y do item": {
    "en": "element y",
    "es": "y del elemento",
    "fr": "y de l’élément"
  },
  "width do item": {
    "en": "element width",
    "es": "anchura del elemento",
    "fr": "largeur de l’élément"
  },
  "height do item": {
    "en": "element height",
    "es": "altura del elemento",
    "fr": "hauteur de l’élément"
  },
  "Terreno 3D do GIS Workspace": {
    "en": "3D terrain in GIS Workspace",
    "es": "Terreno 3D del espacio SIG",
    "fr": "Terrain 3D de l’espace SIG"
  },
  "Terreno 3D": {
    "en": "3D terrain",
    "es": "Terreno 3D",
    "fr": "Terrain 3D"
  },
  "Projecto actual": {
    "en": "Current project",
    "es": "Proyecto actual",
    "fr": "Projet actuel"
  },
  "DEM do projecto": {
    "en": "Project DEM",
    "es": "MDE del proyecto",
    "fr": "MNT du projet"
  },
  "Seleccionar DEM do GIS Workspace": {
    "en": "Select GIS Workspace DEM",
    "es": "Seleccionar MDE del espacio SIG",
    "fr": "Sélectionner le MNT de l’espace SIG"
  },
  "Nenhuma camada GeoTIFF disponível": {
    "en": "No GeoTIFF layer available",
    "es": "No hay capas GeoTIFF disponibles",
    "fr": "Aucune couche GeoTIFF disponible"
  },
  "A processar DEM…": {
    "en": "Processing DEM…",
    "es": "Procesando MDE…",
    "fr": "Traitement du MNT…"
  },
  "Visualizar camada em 3D": {
    "en": "View layer in 3D",
    "es": "Visualizar capa en 3D",
    "fr": "Afficher la couche en 3D"
  },
  "Voltar ao mapa GIS": {
    "en": "Return to GIS map",
    "es": "Volver al mapa SIG",
    "fr": "Retour à la carte SIG"
  },
  "Voltar ao mapa": {
    "en": "Back to map",
    "es": "Volver al mapa",
    "fr": "Retour à la carte"
  },
  "Dados, relevo e análise": {
    "en": "Data, terrain and analysis",
    "es": "Datos, relieve y análisis",
    "fr": "Données, relief et analyse"
  },
  "Modelo gerado a partir de uma camada do projecto GIS, sem reimportar o raster.": {
    "en": "Model created from a GIS project layer, without reimporting the raster.",
    "es": "Modelo creado a partir de una capa del proyecto SIG, sin volver a importar el ráster.",
    "fr": "Modèle créé à partir d’une couche du projet SIG, sans réimporter le raster."
  },
  "Guardar .geomoz": {
    "en": "Save .geomoz",
    "es": "Guardar .geomoz",
    "fr": "Enregistrer .geomoz"
  },
  "Reabrir cena do terreno": {
    "en": "Reopen terrain scene",
    "es": "Volver a abrir escena del terreno",
    "fr": "Rouvrir la scène du terrain"
  },
  "Reabrir cena": {
    "en": "Reopen scene",
    "es": "Reabrir escena",
    "fr": "Rouvrir la scène"
  },
  "pré-visualização": {
    "en": "preview",
    "es": "vista previa",
    "fr": "aperçu"
  },
  "Estilo de relevo": {
    "en": "Terrain style",
    "es": "Estilo del relieve",
    "fr": "Style du relief"
  },
  "Hipsometria · relevo sombreado": {
    "en": "Hypsometry · hillshade",
    "es": "Hipsometría · sombreado del relieve",
    "fr": "Hypsométrie · ombrage du relief"
  },
  "Relevo em escala de cinzentos": {
    "en": "Grayscale terrain",
    "es": "Relieve en escala de grises",
    "fr": "Relief en niveaux de gris"
  },
  "Exagero vertical": {
    "en": "Vertical exaggeration",
    "es": "Exageración vertical",
    "fr": "Exagération verticale"
  },
  "Restaurar estilo": {
    "en": "Reset style",
    "es": "Restablecer estilo",
    "fr": "Réinitialiser le style"
  },
  "Os resultados científicos provêm da malha simplificada. Para cálculos finais, execute as ferramentas de geoprocessamento sobre o GeoTIFF original.": {
    "en": "Scientific results are derived from a simplified mesh. For final calculations, run geoprocessing tools on the original GeoTIFF.",
    "es": "Los resultados científicos proceden de una malla simplificada. Para los cálculos definitivos, procese el GeoTIFF original.",
    "fr": "Les résultats scientifiques proviennent d’un maillage simplifié. Pour les calculs définitifs, utilisez le GeoTIFF d’origine."
  },
  "Visualizador tridimensional": {
    "en": "3D viewer",
    "es": "Visor tridimensional",
    "fr": "Visionneuse 3D"
  },
  "Modelo 3D do terreno. Clique para seleccionar um ponto do perfil.": {
    "en": "3D terrain model. Click to select a profile point.",
    "es": "Modelo 3D del terreno. Haga clic para seleccionar un punto del perfil.",
    "fr": "Modèle 3D du terrain. Cliquez pour sélectionner un point du profil."
  },
  "Terreno 3D do projecto SIG": {
    "en": "3D terrain from the GIS project",
    "es": "Terreno 3D del proyecto SIG",
    "fr": "Terrain 3D du projet SIG"
  },
  "Seleccione uma camada DEM GeoTIFF existente e clique em «Visualizar camada em 3D».": {
    "en": "Select an existing GeoTIFF DEM layer and click “View layer in 3D”.",
    "es": "Seleccione una capa MDE GeoTIFF y pulse «Visualizar capa en 3D».",
    "fr": "Sélectionnez une couche MNT GeoTIFF et cliquez sur «Afficher la couche en 3D»."
  },
  "Clique na superfície para definir o ponto ": {
    "en": "Click the surface to set point ",
    "es": "Haga clic en la superficie para definir el punto ",
    "fr": "Cliquez sur la surface pour définir le point "
  },
  "Arrastar: rodar · Roda: aproximar · Escolher A/B: consultar elevação": {
    "en": "Drag: rotate · Wheel: zoom · Choose A/B: inspect elevation",
    "es": "Arrastrar: girar · Rueda: ampliar · Elegir A/B: consultar elevación",
    "fr": "Glisser : tourner · Molette : zoomer · Choisir A/B : relever l’altitude"
  },
  "Esta camada não tem uma origem GeoTIFF acessível.": {
    "en": "This layer has no accessible GeoTIFF source.",
    "es": "Esta capa no tiene una fuente GeoTIFF accesible.",
    "fr": "Cette couche ne dispose pas d’une source GeoTIFF accessible."
  },
  "A origem do raster deve utilizar HTTPS.": {
    "en": "The raster source must use HTTPS.",
    "es": "La fuente del ráster debe utilizar HTTPS.",
    "fr": "La source raster doit utiliser HTTPS."
  },
  "Não foi possível ler o GeoTIFF seleccionado.": {
    "en": "Could not read the selected GeoTIFF.",
    "es": "No se pudo leer el GeoTIFF seleccionado.",
    "fr": "Impossible de lire le GeoTIFF sélectionné."
  },
  "Este DEM excede 32 MB. Recorte-o no GIS Workspace.": {
    "en": "This DEM exceeds 32 MB. Clip it in GIS Workspace.",
    "es": "Este MDE supera los 32 MB. Recórtelo en el espacio SIG.",
    "fr": "Ce MNT dépasse 32 Mo. Découpez-le dans l’espace SIG."
  },
  "A origem do raster não disponibilizou dados.": {
    "en": "The raster source returned no data.",
    "es": "La fuente del ráster no proporcionó datos.",
    "fr": "La source raster n’a renvoyé aucune donnée."
  },
  "Leitura do DEM cancelada.": {
    "en": "DEM read cancelled.",
    "es": "Lectura del MDE cancelada.",
    "fr": "Lecture du MNT annulée."
  },
  "A origem do DEM está vazia.": {
    "en": "The DEM source is empty.",
    "es": "La fuente del MDE está vacía.",
    "fr": "La source du MNT est vide."
  },
  "Falha na consulta altimétrica.": {
    "en": "Could not retrieve elevation.",
    "es": "Error al consultar la elevación.",
    "fr": "Échec de la lecture altimétrique."
  },
  "O WebGL2 não pôde carregar o modelo.": {
    "en": "WebGL2 could not load the model.",
    "es": "WebGL2 no pudo cargar el modelo.",
    "fr": "WebGL2 n’a pas pu charger le modèle."
  },
  "Seleccione um DEM GeoTIFF no catálogo do projecto.": {
    "en": "Select a GeoTIFF DEM in the project catalog.",
    "es": "Seleccione un MDE GeoTIFF del catálogo del proyecto.",
    "fr": "Sélectionnez un MNT GeoTIFF dans le catalogue du projet."
  },
  "A processar o DEM seleccionado…": {
    "en": "Processing the selected DEM…",
    "es": "Procesando el MDE seleccionado…",
    "fr": "Traitement du MNT sélectionné…"
  },
  "Não foi possível preparar o DEM.": {
    "en": "Could not prepare the DEM.",
    "es": "No se pudo preparar el MDE.",
    "fr": "Impossible de préparer le MNT."
  },
  "Não foi possível guardar a cena.": {
    "en": "Could not save the scene.",
    "es": "No se pudo guardar la escena.",
    "fr": "Impossible d’enregistrer la scène."
  },
  "Cena .geomoz inválida (máximo 4 MB).": {
    "en": "Invalid .geomoz scene (maximum 4 MB).",
    "es": "Escena .geomoz no válida (máximo 4 MB).",
    "fr": "Scène .geomoz invalide (4 Mo maximum)."
  },
  "Cena 3D reaberta. A camada raster original permanece no projecto SIG.": {
    "en": "3D scene reopened. The original raster remains in the GIS project.",
    "es": "Escena 3D reabierta. El ráster original permanece en el proyecto SIG.",
    "fr": "Scène 3D rouverte. Le raster d’origine reste dans le projet SIG."
  },
  "Cena .geomoz inválida.": {
    "en": "Invalid .geomoz scene.",
    "es": "Escena .geomoz no válida.",
    "fr": "Scène .geomoz invalide."
  },
  "Não foi possível exportar a vista 3D.": {
    "en": "Could not export the 3D view.",
    "es": "No se pudo exportar la vista 3D.",
    "fr": "Impossible d’exporter la vue 3D."
  },
  "Terreno 3D · GeoMoz": {
    "en": "3D terrain · GeoMoz",
    "es": "Terreno 3D · GeoMoz",
    "fr": "Terrain 3D · GeoMoz"
  },
  "Pré-visualização do DEM. A perspectiva não tem escala constante.": {
    "en": "DEM preview. Perspective does not have a constant scale.",
    "es": "Vista previa del MDE. La perspectiva no tiene escala constante.",
    "fr": "Aperçu du MNT. La perspective ne possède pas d’échelle constante."
  },
  "Falha na exportação do mapa 3D para PDF.": {
    "en": "Could not export the 3D map to PDF.",
    "es": "No se pudo exportar el mapa 3D a PDF.",
    "fr": "Échec de l’exportation de la carte 3D en PDF."
  },
  "Não existem curvas de nível para adicionar.": {
    "en": "No contour lines to add.",
    "es": "No hay curvas de nivel para añadir.",
    "fr": "Aucune courbe de niveau à ajouter."
  },
  "O perfil não tem segmentos válidos.": {
    "en": "The profile has no valid segments.",
    "es": "El perfil no tiene segmentos válidos.",
    "fr": "Le profil n’a aucun segment valide."
  },
  "Curvas de nível adicionadas ao catálogo SIG (": {
    "en": "Contour lines added to the GIS catalog (",
    "es": "Curvas de nivel añadidas al catálogo SIG (",
    "fr": "Courbes de niveau ajoutées au catalogue SIG ("
  },
  "Perfil topográfico adicionado ao projecto (": {
    "en": "Topographic profile added to the project (",
    "es": "Perfil topográfico añadido al proyecto (",
    "fr": "Profil topographique ajouté au projet ("
  },
  "Modelo 3D do projecto: ": {
    "en": "Project 3D model: ",
    "es": "Modelo 3D del proyecto: ",
    "fr": "Modèle 3D du projet : "
  },
  " válido": {
    "en": " valid",
    "es": " válido",
    "fr": " valide"
  },
  "Curvas de nível · Terreno 3D": {
    "en": "Contour lines · 3D terrain",
    "es": "Curvas de nivel · Terreno 3D",
    "fr": "Courbes de niveau · Terrain 3D"
  },
  "Perfil A→B · Terreno 3D": {
    "en": "Profile A→B · 3D terrain",
    "es": "Perfil A→B · Terreno 3D",
    "fr": "Profil A→B · Terrain 3D"
  },
  "GeoMoz · Terreno 3D": {
    "en": "GeoMoz · 3D terrain",
    "es": "GeoMoz · Terreno 3D",
    "fr": "GeoMoz · Terrain 3D"
  },
  "Análise científica do DEM": {
    "en": "Scientific DEM analysis",
    "es": "Análisis científico del MDE",
    "fr": "Analyse scientifique du MNT"
  },
  "Medições estimadas a partir da grelha simplificada (": {
    "en": "Measurements estimated from a simplified grid (",
    "es": "Mediciones estimadas a partir de la malla simplificada (",
    "fr": "Mesures estimées à partir d’une grille simplifiée ("
  },
  "Para cálculos finais utilize o raster original nas ferramentas SIG.": {
    "en": "For final calculations, use the original raster in GIS tools.",
    "es": "Para los cálculos definitivos, utilice el ráster original en las herramientas SIG.",
    "fr": "Pour les calculs définitifs, utilisez le raster d’origine dans les outils SIG."
  },
  "Declive médio": {
    "en": "Mean slope",
    "es": "Pendiente media",
    "fr": "Pente moyenne"
  },
  "Declive máximo": {
    "en": "Maximum slope",
    "es": "Pendiente máxima",
    "fr": "Pente maximale"
  },
  "Perfil A → B": {
    "en": "Profile A → B",
    "es": "Perfil A → B",
    "fr": "Profil A → B"
  },
  "Clique no terreno para A": {
    "en": "Click terrain to set A",
    "es": "Haga clic en el terreno para A",
    "fr": "Cliquez sur le terrain pour A"
  },
  "Escolher A no terreno": {
    "en": "Choose A on terrain",
    "es": "Elegir A en el terreno",
    "fr": "Choisir A sur le terrain"
  },
  "Clique no terreno para B": {
    "en": "Click terrain to set B",
    "es": "Haga clic en el terreno para B",
    "fr": "Cliquez sur le terrain pour B"
  },
  "Escolher B no terreno": {
    "en": "Choose B on terrain",
    "es": "Elegir B en el terreno",
    "fr": "Choisir B sur le terrain"
  },
  "Ponto A · longitude": {
    "en": "Point A · longitude",
    "es": "Punto A · longitud",
    "fr": "Point A · longitude"
  },
  "Ponto A · latitude": {
    "en": "Point A · latitude",
    "es": "Punto A · latitud",
    "fr": "Point A · latitude"
  },
  "Ponto B · longitude": {
    "en": "Point B · longitude",
    "es": "Punto B · longitud",
    "fr": "Point B · longitude"
  },
  "Ponto B · latitude": {
    "en": "Point B · latitude",
    "es": "Punto B · latitud",
    "fr": "Point B · latitude"
  },
  "Longitude do ponto A": {
    "en": "Point A longitude",
    "es": "Longitud del punto A",
    "fr": "Longitude du point A"
  },
  "Latitude do ponto A": {
    "en": "Point A latitude",
    "es": "Latitud del punto A",
    "fr": "Latitude du point A"
  },
  "Longitude do ponto B": {
    "en": "Point B longitude",
    "es": "Longitud del punto B",
    "fr": "Longitude du point B"
  },
  "Latitude do ponto B": {
    "en": "Point B latitude",
    "es": "Latitud del punto B",
    "fr": "Latitude du point B"
  },
  "Perfil altimétrico A para B": {
    "en": "Elevation profile A to B",
    "es": "Perfil altimétrico A a B",
    "fr": "Profil altimétrique de A à B"
  },
  "Elevação mínima:": {
    "en": "Minimum elevation:",
    "es": "Elevación mínima:",
    "fr": "Altitude minimale :"
  },
  "Elevação máxima:": {
    "en": "Maximum elevation:",
    "es": "Elevación máxima:",
    "fr": "Altitude maximale :"
  },
  "Desnível acumulado ↑": {
    "en": "Cumulative gain ↑",
    "es": "Desnivel acumulado ↑",
    "fr": "Dénivelé cumulé ↑"
  },
  "Declive A→B:": {
    "en": "Slope A→B:",
    "es": "Pendiente A→B:",
    "fr": "Pente A→B :"
  },
  "Adicionar perfil ao projecto SIG": {
    "en": "Add profile to GIS project",
    "es": "Añadir perfil al proyecto SIG",
    "fr": "Ajouter le profil au projet SIG"
  },
  "Defina pontos válidos dentro do DEM e fora das células NoData.": {
    "en": "Set valid points inside the DEM and outside NoData cells.",
    "es": "Defina puntos válidos dentro del MDE y fuera de las celdas NoData.",
    "fr": "Définissez des points valides dans le MNT et hors des cellules NoData."
  },
  "Curvas de nível · equidistância (m)": {
    "en": "Contour lines · interval (m)",
    "es": "Curvas de nivel · equidistancia (m)",
    "fr": "Courbes de niveau · équidistance (m)"
  },
  "Equidistância das curvas de nível": {
    "en": "Contour interval",
    "es": "Equidistancia de curvas de nivel",
    "fr": "Équidistance des courbes de niveau"
  },
  "Gerar curvas de nível (pré-visualização)": {
    "en": "Generate contour lines (preview)",
    "es": "Generar curvas de nivel (vista previa)",
    "fr": "Générer des courbes de niveau (aperçu)"
  },
  "segmentos calculados · GeoJSON WGS84": {
    "en": "segments calculated · GeoJSON WGS84",
    "es": "segmentos calculados · GeoJSON WGS84",
    "fr": "segments calculés · GeoJSON WGS84"
  },
  "Adicionar curvas ao catálogo SIG": {
    "en": "Add contours to GIS catalog",
    "es": "Añadir curvas al catálogo SIG",
    "fr": "Ajouter les courbes au catalogue SIG"
  },
  "Falha ao desenhar o gráfico.": {
    "en": "Could not render the chart.",
    "es": "No se pudo dibujar el gráfico.",
    "fr": "Impossible de tracer le graphique."
  },
  "Não foi possível criar o gráfico de exportação.": {
    "en": "Could not create the export chart.",
    "es": "No se pudo crear el gráfico de exportación.",
    "fr": "Impossible de créer le graphique d’export."
  },
  "Falha ao exportar o gráfico.": {
    "en": "Could not export chart.",
    "es": "No se pudo exportar el gráfico.",
    "fr": "Échec de l’exportation du graphique."
  },
  "Falha ao gerar curvas de nível.": {
    "en": "Could not generate contours.",
    "es": "No se pudieron generar curvas de nivel.",
    "fr": "Échec de la génération des courbes de niveau."
  },
  "GeoMoz · Perfil topográfico A → B": {
    "en": "GeoMoz · Topographic profile A → B",
    "es": "GeoMoz · Perfil topográfico A → B",
    "fr": "GeoMoz · Profil topographique A → B"
  },
  "Distância: ": {
    "en": "Distance: ",
    "es": "Distancia: ",
    "fr": "Distance : "
  },
  "Elevação: ": {
    "en": "Elevation: ",
    "es": "Elevación: ",
    "fr": "Altitude : "
  },
  "Estimativa da malha 3D simplificada. Não substitui a análise do DEM original.": {
    "en": "Simplified 3D mesh estimate. Not a substitute for original DEM analysis.",
    "es": "Estimación de la malla 3D simplificada. No sustituye al análisis del MDE original.",
    "fr": "Estimation du maillage 3D simplifié. Ne remplace pas l’analyse du MNT d’origine."
  },
  "Modelo GLB exportado em metros com metadados do CRS do projecto.": {
    "en": "GLB model exported in metres with project CRS metadata.",
    "es": "Modelo GLB exportado en metros con metadatos del SRC del proyecto.",
    "fr": "Modèle GLB exporté en mètres avec les métadonnées du SCR du projet."
  },
  "Falha ao exportar GLB.": {
    "en": "Could not export GLB.",
    "es": "No se pudo exportar el GLB.",
    "fr": "Impossible d’exporter le GLB."
  },
  "Nível de detalhe do relevo": {
    "en": "Terrain level of detail",
    "es": "Nivel de detalle del relieve",
    "fr": "Niveau de détail du relief"
  },
  "Detalhe do terreno 3D": {
    "en": "3D terrain detail",
    "es": "Detalle del terreno 3D",
    "fr": "Détail du terrain 3D"
  },
  "Automático com o zoom": {
    "en": "Automatic with zoom",
    "es": "Automático según el zoom",
    "fr": "Automatique selon le zoom"
  },
  "Detalhe máximo": {
    "en": "Maximum detail",
    "es": "Detalle máximo",
    "fr": "Détail maximal"
  },
  "LOD 2 · equilibrado": {
    "en": "LOD 2 · balanced",
    "es": "LOD 2 · equilibrado",
    "fr": "LOD 2 · équilibré"
  },
  "LOD 4 · rápido": {
    "en": "LOD 4 · fast",
    "es": "LOD 4 · rápido",
    "fr": "LOD 4 · rapide"
  },
  "A rectificar o raster com GDAL e a adicionar o GeoTIFF ao mapa…": {
    "en": "Rectifying raster with GDAL and adding GeoTIFF to the map…",
    "es": "Rectificando el ráster con GDAL y añadiendo GeoTIFF al mapa…",
    "fr": "Rectification du raster avec GDAL et ajout du GeoTIFF à la carte…"
  },
  "O GDAL gerou um raster vazio.": {
    "en": "GDAL produced an empty raster.",
    "es": "GDAL generó un ráster vacío.",
    "fr": "GDAL a produit un raster vide."
  },
  "Não foi possível rectificar e adicionar o GeoTIFF. ": {
    "en": "Could not rectify and add GeoTIFF. ",
    "es": "No se pudo rectificar ni añadir el GeoTIFF. ",
    "fr": "Impossible de rectifier et d’ajouter le GeoTIFF. "
  },
  "Verifique os GCPs e a ligação ao motor GDAL.": {
    "en": "Check GCPs and the connection to the GDAL engine.",
    "es": "Compruebe los GCP y la conexión al motor GDAL.",
    "fr": "Vérifiez les points d’appui et la connexion au moteur GDAL."
  },
  "A processar raster…": {
    "en": "Processing raster…",
    "es": "Procesando ráster…",
    "fr": "Traitement du raster…"
  },
  "Também pode clicar em «Associar no mapa». As coordenadas UTM são convertidas para WGS 84. Distribua pelo menos quatro GCPs, preferencialmente perto dos quatro cantos da carta, e confira o RMS.": {
    "en": "You can also click “Link on map”. UTM coordinates are converted to WGS 84. Distribute at least four GCPs, preferably near the four map corners, and check the RMS.",
    "es": "También puede pulsar «Vincular en el mapa». Las coordenadas UTM se convierten a WGS 84. Distribuya al menos cuatro GCP, preferiblemente cerca de las esquinas del mapa, y compruebe el RMS.",
    "fr": "Vous pouvez également cliquer sur « Associer sur la carte ». Les coordonnées UTM sont converties en WGS 84. Répartissez au moins quatre points d’appui près des coins de la carte et vérifiez le RMS."
  },
  "RMSE afim (referência): ": {
    "en": "Affine RMSE (reference): ",
    "es": "RMSE afín (referencia): ",
    "fr": "RMSE affine (référence) : "
  },
  "«Adicionar ao mapa» rectifica com o método escolhido e cria um GeoTIFF WGS 84. O SRC de saída acima é usado apenas no ficheiro descarregado. A precisão depende dos GCPs.": {
    "en": "“Add to map” rectifies using the selected method and creates a WGS 84 GeoTIFF. The output CRS above only affects the downloaded file. Accuracy depends on the GCPs.",
    "es": "«Añadir al mapa» rectifica mediante el método seleccionado y crea un GeoTIFF WGS 84. El SRC de salida anterior solo afecta al archivo descargado. La precisión depende de los GCP.",
    "fr": "« Ajouter à la carte » effectue le redressement choisi et crée un GeoTIFF WGS 84. Le SCR de sortie ci-dessus s’applique uniquement au fichier téléchargé. La précision dépend des points d’appui."
  }
};
export function geoMozSpecialistText(language:string, portuguese:string):string {
  if(language==="pt")return portuguese;
  const translations=entries[portuguese];
  return translations?.[language as "en"|"es"|"fr"]??translations?.en??portuguese;
}
export const specialistTranslationKeys=Object.freeze(Object.keys(entries));
