# Relatórios GeoMoz — Segurança e integridade cartográfica (P2)

## Incidentes evitados

1. **HTML autónomo**: campos do projecto, análise e sensor passam a ser escapados contra HTML activo; o relatório inclui uma CSP restritiva. Os rótulos métricos agora dizem "Mínimo" e "Máximo", sem presumir quantis P10/P90.
2. **CSV**: todas as células são serializadas com aspas correctamente duplicadas e prefixo de protecção quando texto do utilizador pode ser interpretado como fórmula pelo Excel/LibreOffice. Valores numéricos negativos continuam numéricos.
3. **GeoJSON AOI**: nunca se exporta um ponto artificial ([35, -18]) como substituto de um limite administrativo desconhecido. Só a geometria real guardada é descarregada, preservando FeatureCollections.
4. **Proveniência científica**: os relatórios não afirmam implicitamente que todas as análises usam Sentinel-2, GLO30 ou um recorte vectorial exacto. Os metadados são descritos como registos guardados, a validar cientificamente.
5. **Mapa no PDF**: acrescenta-se página cartográfica de localização da AOI quando existe geometria ou limites e o backend de mapa está disponível. A razão width/height da imagem corresponde à resolução solicitada. A ausência de mapa não bloqueia a descarga do dossiê: o utilizador recebe uma mensagem explícita.
6. **Quebra de página**: notas metodológicas longas continuam na página seguinte, sem ultrapassar o rodapé.

## Cenários de aceitação

- Projecto `name=<script>alert(1)</script>` → HTML apresenta o texto, não executa JavaScript.
- Nome de análise `=HYPERLINK(...)` → CSV não executa fórmulas.
- AOI de província sem polígono → exportação SIG indisponível, sem ponto sintético.
- AOI desenhada como Polígono → GeoJSON conserva coordenadas.
- AOI real e renderizador de mapa acessível → PDF contém mapa de localização; caso contrário, PDF continua exportável com aviso.
- Testes Vitest dedicados, TypeScript e build verificam regressões.

## Fora de âmbito

- Não certifica exactidão científica nem precisão de indicadores geoespaciais.
- Não cria geometrias para províncias/distritos de Moçambique.
- Não modifica algoritmos Earth Engine nem o deploy `main`.
