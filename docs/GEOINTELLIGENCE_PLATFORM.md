# GeoMoz Geointeligência — base de execução verificável

O GeoMoz AI Agent transforma pedidos em ferramentas espaciais e resultados no mapa. Esta entrega estabelece a base de confiança da plataforma; não representa a conclusão de todos os módulos de geointeligência.

## Implementado

- Um único percurso de execução para chat e fluxos rápidos, com períodos editáveis.
- Validação dos parâmetros declarados, datas, coordenadas e limite de 16 chamadas por pedido.
- Contexto espacial isolado por pedido; resolução de uma nova província elimina o distrito e a geometria anteriores. Uma geometria desenhada mantém-se enquanto não for pedida outra província.
- Registo de evidências produzido pelo executor: ferramenta, parâmetros, área, período, duração, fonte quando comunicada e resultados efectivamente devolvidos.
- Dossiê JSON por resposta, com identificador, estados concluído/parcial/erro/sem cálculo e limitações. As credenciais e URLs de tiles são omitidas da exportação.
- Valores zero preservados em NDVI e humidade; precipitação deriva das estatísticas, respeitando o ano explicitamente pedido.
- Modelos OpenAI e Gemini usam o mesmo executor. Todas as chamadas de ferramentas numa resposta Gemini são processadas.
- Remoção das áreas zonais e precipitação fixas. Sem raster/máscara integrado, a ferramenta zonal declara indisponibilidade.
- A ferramenta de alteração temporal declara indisponibilidade: a implementação anterior mostrava apenas o segundo período.
- Potencial hidrogeológico usa o motor existente de seis factores, devolvendo classes e pesos. É apresentado como sobreposição ponderada exploratória; não como AHP validado nem confirmação de água.
- Triagem de cheias identifica apenas classes topográficas. Não afirma modelar a probabilidade de inundação nem a exposição.

## Limites de validação

Os testes offline verificam contratos de execução, propagação espacial, falhas, valores nulos/zero e ausência de credenciais no dossiê. Não certificam exactidão científica nem comprovam acesso ao Earth Engine. A validação em produção exige GEE autenticado e comparação com dados de referência.

Uma resposta de modelo sem ferramenta analítica fica marcada como sem cálculo. A síntese textual de um LLM pode ainda conter inferências incorrectas; as evidências determinísticas são a referência verificável. Fontes não comunicadas por uma ferramenta são apresentadas como ausentes, nunca preenchidas por suposição.

Os dossiês ficam na conversa da sessão e podem ser descarregados; ainda não existe um arquivo persistente e pesquisável de dossiês. Interromper o pedido no browser não garante cancelamento do processamento no servidor.

## Próximas entregas para a plataforma completa

1. Registo de fontes por versão, resolução, CRS, licença, data de aquisição, cobertura e qualidade; identificadores estáveis de rasters/feições. Estatísticas zonais e diferenças temporais sobre esses produtos reais.
2. Plano de análise visível antes da execução, orçamento por ferramenta, jobs persistentes, progresso, cancelamento no servidor e reexecução pelo dossiê. Ligação explícita entre critérios, pesos, resultados e conclusões.
3. Biblioteca de estudos por projecto, permissões, histórico e exportação GeoTIFF/GeoPackage/PDF com metodologia e proveniência completas. Reutilizar o GIS Workspace para cartografia e edição.
4. Fluxos temáticos validados para geologia/minerais, água, agricultura/florestas, geoperigos e planeamento territorial. Cada fluxo exige dados adequados e validação; índices isolados não bastam.
5. Séries temporais, cruzamento de camadas, comparação de cenários e monitorização com critérios definidos pelo utilizador. Integrações USGS/ISC/EarthScope devem informar cobertura e incerteza.
6. Avaliação científica com áreas e períodos de referência de Moçambique, testes de regressão espacial e revisão de terminologia antes de declarar prontidão operacional.

## Verificação

```bash
PYTHONPATH=geomoz-explorer python -m unittest discover -s geomoz-explorer/tests -p test_agent_intelligence.py -v
PYTHONPATH=geomoz-explorer python -m unittest discover -s geomoz-explorer/tests -p test_agent_tools.py -v
pnpm --dir artifacts/geomoz-react exec vitest run src/components/__tests__/GeoIntelligenceDossier.test.tsx
pnpm run typecheck
```
