# GIS Workspace — nível 1

Implementação em heltrakinho07/Geomoz-Explorer, a partir de main.

Em **Dados**, os cartões expansíveis agrupam:
- **Raster**: importar raster/DEM, georreferenciar, reprojectar, recortar por extensão ou máscara, declive, relevo sombreado e curvas de nível.
- **Vector**: importar ficheiros e CSV, buffer, recorte, intersecção, dissolução e reprojecção.
- **Serviços de mapas**: WMS, WFS, XYZ/TMS, WMTS, NextGIS QMS e NextGIS Web.
- **Hidrologia**: ligações aos módulos existentes de bacias, água subterrânea e terreno/hidrologia.
- **Cartografia**: layout, legenda, escala de cores e medição.

As ligações de hidrologia abrem outra janela para preservar o projecto em memória.
Esta fase não transfere automaticamente as camadas do Workspace para esses módulos.
As ferramentas só são mostradas se existirem no registo de comandos; mantêm os
callbacks, motivos de indisponibilidade e restrições de leitura originais.
Os menus, digitalização, sismicidade e exportação existentes são preservados.

## NextGIS e licenças

Este nível reorganiza os conectores QMS/Web existentes, sem copiar código adicional
dos repositórios NextGIS nem alterar atribuições, licenças ou metadados das camadas.
A integração gradual continua descrita em NEXTGIS_WEB_INTEGRATION.md.
Processamento novo e infraestrutura NextGIS pertencem aos níveis seguintes.

## Validação

- 67 testes Node passaram com o motor GeoLibre fixado em
  f69688ed5be750c496b51b865cee513d910a433f, antes da preparação do motor.
- A preparação do motor terminou com sucesso.
- O teste Chromium existente foi ampliado para abrir/fechar os cinco cartões pelo
  teclado, verificar ferramentas raster, abrir QMS e verificar ligações de hidrologia.
- O workflow Workbench existente já cobre scripts/** e executa esse teste.
- Compilação completa e Chromium devem ficar verdes antes de merge.
- PRs relacionados #125 e #126 não são substituídos nem integrados automaticamente.

No Windows, conservar os bytes LF do favicon ao executar o teste de hash.
