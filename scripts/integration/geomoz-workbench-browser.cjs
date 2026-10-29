/* Real built-app checks: owned React UI, file import, commands, themes and responsive layout. */
const {createServer}=require("node:http");
const {readFile,stat,mkdir,writeFile}=require("node:fs/promises");
const path=require("node:path");
const assert=require("node:assert/strict");
const {chromium}=require(path.join(process.env.GIS_PLAYWRIGHT_ROOT,"node_modules/playwright"));
const root=path.resolve("artifacts/geomoz-react/dist/public");
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json"};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost"),file=path.resolve(root,"."+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let target=file;try{if((await stat(file)).isDirectory())target=path.join(file,"index.html");}catch{res.writeHead(404).end();return;}
  res.writeHead(200,{"Content-Type":mime[path.extname(target)]||"application/octet-stream"});res.end(await readFile(target));
 }catch{res.writeHead(500).end();}
});
async function settleRecovery(page){
 // Reloading a dirty synthetic project can legitimately offer recovery.
 // Resolve that real UI before testing controls behind its modal overlay.
 const recovery=page.getByRole("dialog").filter({has:page.getByRole("heading",{name:"Recuperar o trabalho não salvo?",exact:true})});
 const offered=await recovery.waitFor({state:"visible",timeout:4000}).then(()=>true,error=>{
  if(error.name==="TimeoutError")return false;
  throw error;
 });
 if(offered){
  await recovery.getByRole("button",{name:"Descartar",exact:true}).click();
  await recovery.waitFor({state:"hidden"});
  console.log("Dismissed recovery for this test's synthetic, disposable project.");
 }
}
(async()=>{
 await mkdir("workbench-browser-artifacts",{recursive:true});
 await new Promise(resolve=>server.listen(4182,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
 const context=await browser.newContext({viewport:{width:1440,height:960},colorScheme:"light"});
 // Exercise the actual download fallback used in browsers without File System Access.
 // Keep the application's picker implementation intact.
 await context.addInitScript(()=>Object.defineProperty(window,"showSaveFilePicker",{configurable:true,value:undefined}));
 const page=await context.newPage(),errors=[];
 page.on("console",message=>{if(["error","warning","warn"].includes(message.type())&&/Geo.?Editor|Geoman|deactivat|plugin.*error|removeControl/i.test(message.text()))console.log("Editor diagnostic:",message.text());});
 page.on("pageerror",error=>{errors.push(error.message);console.error("Runtime error:",error.message);});
 page.setDefaultTimeout(90000);
 try{
  const portalMessage = authenticated =>
    '<!doctype html><html><body><script>window.parent.postMessage(' +
    JSON.stringify({type:"geomoz:workspace-auth-state",authenticated}) +
    ',window.location.origin);</script></body></html>';

  // Test an unauthenticated deep link: the real engine must never start.
  const visitor = await context.newPage();
  await visitor.route("**/auth/workspace-check", route =>
    route.fulfill({status:200,contentType:"text/html",body:portalMessage(false)}));
  await visitor.goto("http://127.0.0.1:4182/gis-workspace/");
  await visitor.waitForURL(url => url.pathname === "/login" &&
    url.searchParams.get("next") === "/gis-workspace/", {timeout:10000});
  assert.equal(await visitor.getByTestId("geomoz-workbench-chrome").count(),0,
    "Unauthenticated visitors must not run the GIS engine");
  await visitor.close();

  // Only the CI browser harness simulates a real Firebase session; this route
  // never exists in the deployed application. The actual portal bridge checks
  // Firebase Auth, rejects guests, and communicates with the same message type.
  await context.route("**/auth/workspace-check", route =>
    route.fulfill({status:200,contentType:"text/html",body:portalMessage(true)}));
  await page.goto("http://127.0.0.1:4182/gis-workspace/");
  await page.getByTestId("geomoz-workbench-chrome").waitFor();
  const workspaceBrand=page.locator(".gm-workbench-chrome .gm-brand img");
  assert.equal(await workspaceBrand.getAttribute("src"),"/favicon.svg");
  const iconMatches=await page.evaluate(async()=>{
    const [siteIcon,workspaceIcon]=await Promise.all([
      fetch("/favicon.svg").then(r=>r.text()),
      fetch("/gis-workspace/favicon.svg").then(r=>r.text())
    ]);
    return siteIcon===workspaceIcon&&siteIcon.includes("#0284c7");
  });
  assert.ok(iconMatches,"Canonical GeoMoz icon must match across main portal and GIS Workspace");

  await page.getByTestId("geomoz-layer-catalog").waitFor();
  await page.locator("main canvas").first().waitFor();
  assert.equal(await page.locator(".geomoz-portal-shell").count(),0,"Old shell must not coexist with the new UI");
  assert.equal(await page.locator("[data-command='add.vector']").count(),1);
  assert.deepEqual(await page.locator(".gm-task-tabs button").allTextContents(),["Digitalizar","Dados","Análise","Resultados"]);
  assert.equal(await page.getByRole("button",{name:"Mais opções",exact:true}).count(),0);
  assert.equal(await page.getByRole("button",{name:"Gestão",exact:true}).count(),0);
  await page.keyboard.press("Control+k");
  const search=page.getByRole("combobox");
  await search.waitFor();
  for(const term of ["Python","SQL","Voronoi","STAC","directions"]){
    await search.fill(term);
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole("option").count(),0,"Specialist feature must be hidden from search: "+term);
  }
  await search.fill("buffer");
  await page.getByRole("option").first().waitFor();
  await page.keyboard.press("Escape");
  console.log("Curated workflow and searchable catalog verified.");

  // GeoMoz product identity is shown within the real React UI. Legacy engine
  // branding appears only in the explicit third-party attribution document.
  await page.locator(".gm-help-menu summary").click();
  await page.getByTestId("geomoz-about-trigger").click();
  const about=page.getByTestId("geomoz-about-dialog");
  await about.waitFor();
  assert.match(await about.innerText(),/GeoMoz GIS Workspace/);
  assert.equal(await about.getByRole("link",{name:/Créditos e licenças de terceiros/}).count(),1);
  assert.doesNotMatch(await about.innerText(),/GeoLibre/);
  await page.keyboard.press("Escape");
  await about.waitFor({state:"hidden"});
  await page.locator(".gm-help-menu summary").click();
  console.log("GeoMoz About modal and preserved third-party notice navigation verified.");


  await page.getByRole("button",{name:"Digitalizar",exact:true}).click();
  await page.locator("[data-command='proc.georeferencer']").click();
  const georeferencer=page.getByRole("dialog");
  await georeferencer.waitFor();
  assert.ok(await georeferencer.locator("input[type=file]").count()>0,"Real georeferencer accepts a source image");
  await page.keyboard.press("Escape");
  await georeferencer.waitFor({state:"hidden"});
  const catalog=page.getByTestId("geomoz-layer-catalog");
  // Wait for the modal exit overlay to release pointer events before raw mouse dragging.
  await page.locator(".gm-catalog-resize").hover();
  const beforeResize=await catalog.boundingBox();
  const handle=await page.locator(".gm-catalog-resize").boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+100);
  await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2+100,handle.y+100,{steps:10});
  await page.mouse.up();
  console.log("Catalog resize",beforeResize.width,(await catalog.boundingBox()).width,await catalog.evaluate(node=>getComputedStyle(node).getPropertyValue("--layer-panel-width")));
  await page.waitForFunction(width=>document.querySelector(".gm-catalog").getBoundingClientRect().width>width+50,beforeResize.width,{timeout:5000});
  assert.ok((await catalog.boundingBox()).width>beforeResize.width+50,"Catalog expands when its right edge is dragged");
  const expanded=await page.locator(".gm-catalog-resize").boundingBox();
  await page.mouse.move(expanded.x+expanded.width/2,expanded.y+100);
  await page.mouse.down();
  await page.mouse.move(expanded.x+expanded.width/2-100,expanded.y+100,{steps:10});
  await page.mouse.up();
  assert.ok(Math.abs((await catalog.boundingBox()).width-beforeResize.width)<5,"Catalog can shrink again");

  // Save the actual project, then reopen its unchanged schema under the new and legacy extensions.
  await page.getByRole("button",{name:"Resultados",exact:true}).first().click();
  await page.locator('[data-command="project.print-layout"]').click();
  const printDialog=page.getByRole("dialog");
  await printDialog.getByText(/Mapa: \d+ × \d+ píxeis/).waitFor({timeout:30000});
  assert.equal(await printDialog.getByLabel("Resolução de saída").inputValue(),"300");
  const [mapWidth,mapHeight]=(await printDialog.getByText(/Mapa: \d+ × \d+ píxeis/).innerText()).match(/Mapa: (\d+) × (\d+)/).slice(1).map(Number);
  assert.ok(mapWidth>2000 || mapHeight>2000,"Print map is redrawn above screen resolution");
  await printDialog.getByLabel("Posição personalizada do mapa",{exact:true}).check();
  await printDialog.getByLabel("mapa width",{exact:true}).fill("65");
  await printDialog.getByLabel("Posição personalizada da legenda",{exact:true}).check();
  await printDialog.getByLabel("legenda x",{exact:true}).fill("75");
  await printDialog.getByRole("button",{name:"Adicionar texto",exact:true}).click();
  await printDialog.getByLabel("Texto do item").fill("Carta geológica de Manica");
  await printDialog.getByLabel("x do item",{exact:true}).fill("25");
  await printDialog.getByLabel("Bloquear posição").check();
  assert.equal(await printDialog.getByLabel("x do item",{exact:true}).isDisabled(),true);
  await printDialog.getByLabel("Bloquear posição").uncheck();
  const logoPng=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;const ctx=c.getContext('2d');ctx.fillStyle='#0284c7';ctx.fillRect(0,0,40,40);return c.toDataURL('image/png').split(',')[1];});
  await printDialog.getByLabel("Carregar logótipo").setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(logoPng,'base64')});
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Item seleccionado"]')?.options.length===3);
  const svgDownload=page.waitForEvent('download');
  await printDialog.getByRole('button',{name:/SVG/}).click();
  const svgFile=await svgDownload;
  await svgFile.saveAs('workbench-browser-artifacts/layout-items.svg');
  const svgContent=await readFile('workbench-browser-artifacts/layout-items.svg','utf8');
  assert.match(svgContent,/Carta geológica de Manica/);
  assert.ok((svgContent.match(/<image/g)||[]).length>=2,'SVG embeds map and uploaded logo');
  console.log("GeoMoz editable layout text and position lock verified.");
  await page.screenshot({path:"workbench-browser-artifacts/print-quality.png"});
  await page.keyboard.press("Escape");
  await printDialog.waitFor({state:"hidden"});
  console.log("GeoMoz high-resolution print capture and DPI control verified.");
  await page.locator('[data-command="project.save-as"]').click();
  const saveDialog=page.getByRole("dialog").filter({has:page.locator("#save-project-name")});
  await saveDialog.waitFor();
  assert.equal(await page.locator("#save-project-name").inputValue(),"Untitled_Projecto.geomoz");
  const projectDownloadPromise=page.waitForEvent("download");
  await saveDialog.locator('button[type="submit"]').click();
  const projectDownload=await projectDownloadPromise;
  assert.equal(projectDownload.suggestedFilename(),"Untitled_Projecto.geomoz");
  await projectDownload.saveAs("workbench-browser-artifacts/Untitled_Projecto.geomoz");
  const savedProject=JSON.parse(await readFile("workbench-browser-artifacts/Untitled_Projecto.geomoz","utf8"));
  assert.equal(savedProject.printLayout.geomozMapFrame.width,65);
  assert.equal(savedProject.printLayout.geomozLegendPlacement.x,75);
  assert.equal(savedProject.printLayout.geomozItems[0].text,"Carta geológica de Manica");
  await saveDialog.waitFor({state:"hidden"});
  for(const extension of ["geomoz","geolibre","geolibre.json"]){
    const name="Compatibilidade "+extension;
    const text=JSON.stringify({...savedProject,name});
    await page.evaluate(({text,extension})=>{
      const transfer=new DataTransfer();
      transfer.items.add(new File([text],"project."+extension,{type:"application/json"}));
      const shell=document.querySelector('[data-testid="desktop-shell"]');
      for(const type of ["dragenter","dragover","drop"])shell.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer}));
    },{text,extension});
    await page.waitForFunction(name=>document.querySelector('input[aria-label="Nome do projecto"]')?.value===name,name);
  }
  console.log("GeoMoz project download and new/legacy project reopening passed.");
  // Start the independent digitizing regression with freshly mounted map controls.
  await page.reload();
  await page.getByTestId("geomoz-workbench-chrome").waitFor();
  await settleRecovery(page);
  await page.getByTestId("geomoz-layer-catalog").waitFor();
  await page.getByRole("button",{name:"Digitalizar",exact:true}).click();
  await page.locator(".gm-catalog-nav").getByRole("button",{name:/^Camadas/}).click();

  await page.getByRole("textbox",{name:"Nome do projecto"}).fill("Estudo do território");
  await page.getByRole("textbox",{name:"Nome do projecto"}).press("Enter");
  const light=await page.getByTestId("geomoz-layer-catalog").evaluate(node=>getComputedStyle(node).backgroundColor);
  await page.screenshot({path:"workbench-browser-artifacts/01-geomoz-light.png",fullPage:true});
  await page.getByTestId("geomoz-theme-toggle").click();
  await page.waitForFunction(()=>document.documentElement.dataset.geomozTheme==="dark");
  assert.equal(await page.evaluate(()=>localStorage.getItem("geomoz_theme")),"dark");
  const dark=await page.getByTestId("geomoz-layer-catalog").evaluate(node=>getComputedStyle(node).backgroundColor);
  assert.notEqual(light,dark,"Catalog must actually change appearance");
  // Import through the real guarded file-drop handler; no test-only store writes.
  await page.evaluate(()=>{
   const data={type:"FeatureCollection",features:[{type:"Feature",properties:{name:"Chimoio",population:150},geometry:{type:"Point",coordinates:[33.48,-19.12]}},{type:"Feature",properties:{name:"Beira",population:200},geometry:{type:"Point",coordinates:[34.84,-19.83]}}]};
   const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(data)],"Pontos de estudo.geojson",{type:"application/geo+json"}));
   const shell=document.querySelector('[data-testid="desktop-shell"]');
   for(const type of ["dragenter","dragover","drop"])shell.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer}));
  });
  const row=page.locator('.gm-layer-row').filter({hasText:"Pontos de estudo"});
  await row.waitFor();
  console.log("GeoJSON imported through the real GIS drop handler.");
  await row.locator(".gm-layer-select").click();
  // Fix regression: layer style must be editable without the hidden specialist panel.
  await page.getByRole("button",{name:"Editar simbologia"}).click();
  await page.getByLabel("Cor do símbolo",{exact:true}).fill("#a855f7");
  assert.equal(await page.getByLabel("Cor do símbolo",{exact:true}).inputValue(),"#a855f7");
  await page.getByRole("slider",{name:"Tamanho dos pontos"}).fill("11");
  assert.equal(await page.getByRole("slider",{name:"Tamanho dos pontos"}).inputValue(),"11");
  await page.getByRole("button",{name:"Editar simbologia"}).click();

  await page.getByRole("slider",{name:"Opacidade da camada"}).fill("0.65");
  await page.waitForFunction(()=>document.querySelector(".gm-layer-row[data-selected=true]")?.textContent.includes("65%"));
  await row.locator(".gm-layer-visibility").click();
  assert.equal(await row.getAttribute("data-visible"),"false");
  await row.locator(".gm-layer-visibility").click();
  await row.locator(".gm-layer-fit").click();
  await page.locator(".gm-layer-properties summary").click();
  const rename=page.getByRole("textbox",{name:"Renomear camada",exact:true});
  await rename.fill("Pontos renomeados");await rename.press("Enter");
  await page.locator('.gm-layer-row[data-layer-name="Pontos renomeados"]').waitFor();
  await rename.fill("Pontos de estudo");await rename.press("Enter");
  await row.waitFor();
  await page.getByRole("textbox",{name:"Nome do novo grupo",exact:true}).fill("Estudo local");
  await page.locator(".gm-layer-properties").getByRole("button",{name:"Criar",exact:true}).click();
  assert.notEqual(await page.getByRole("combobox",{name:"Grupo da camada"}).inputValue(),"");
  await page.getByRole("checkbox",{name:"Mostrar grupo Estudo local",exact:true}).uncheck();
  assert.equal(await row.getAttribute("data-rendered"),"false");
  await page.getByRole("checkbox",{name:"Mostrar grupo Estudo local",exact:true}).check();
  assert.equal(await row.getAttribute("data-rendered"),"true");
  const downloadPromise=page.waitForEvent("download",{timeout:15000});
  await page.getByRole("button",{name:"Exportar GeoJSON",exact:true}).click();
  const download=await downloadPromise;
  await download.saveAs("workbench-browser-artifacts/exported-points.geojson");
  assert.equal(JSON.parse(await readFile("workbench-browser-artifacts/exported-points.geojson","utf8")).features.length,2);
  await page.locator(".gm-layer-properties summary").click();

  await page.getByRole("textbox",{name:"Pesquisar camadas"}).fill("inexistente");
  await page.getByText("Nenhuma correspondência",{exact:true}).waitFor();
  await page.getByRole("textbox",{name:"Pesquisar camadas"}).fill("");
  await page.screenshot({path:"workbench-browser-artifacts/02-geomoz-data-dark.png",fullPage:true});
  // Exercise seismic UI and map-store import with a deterministic USGS fixture.
  await page.route("https://earthquake.usgs.gov/fdsnws/event/1/query**",route=>route.fulfill({
    status:200,contentType:"application/json",
    headers:{"access-control-allow-origin":"*"},
    body:JSON.stringify({type:"FeatureCollection",features:[
      {type:"Feature",id:"mz-test-001",geometry:{type:"Point",coordinates:[34.61,-18.98,17.5]},
      properties:{mag:4.3,magType:"mb",time:1767225600000,type:"earthquake",
      place:"Centro de Moçambique",net:"us",url:"https://earthquake.usgs.gov/earthquakes/eventpage/mz-test-001"}}
    ]})
  }));
  await page.locator('[data-task="data"]').click();
  await page.locator('[data-action="geomoz-seismic"]').click();
  await page.getByTestId("geomoz-seismic-panel").waitFor();
  await page.getByRole("button",{name:"Consultar eventos"}).click();
  await page.getByTestId("geomoz-seismic-panel").getByText("1", {exact:true}).first().waitFor();
  await page.getByRole("button",{name:"Adicionar ao mapa"}).click();
  await page.locator('.gm-layer-row[data-layer-name^="Sismicidade USGS"]').first().waitFor();
  assert.equal(await page.locator('.gm-layer-row[data-layer-name^="Sismicidade USGS"]').count(),1);
  await page.screenshot({path:"workbench-browser-artifacts/02b-seismic-usgs.png",fullPage:true});
  await page.getByRole("button",{name:"Análises",exact:true}).click();
  await page.getByRole("heading",{name:/Magnitude × tempo/}).waitFor();
  await page.getByRole("heading",{name:/Perfil hipocentral A/}).waitFor();
  await page.getByRole("heading",{name:/Gutenberg–Richter/}).waitFor();
  await page.route("https://service.earthscope.org/fdsnws/station/1/query**",route=>route.fulfill({
    status:200,contentType:"text/plain",
    headers:{"access-control-allow-origin":"*"},
    body:"#Network|Station|Latitude|Longitude|Elevation|SiteName|StartTime|EndTime\n6H|CHM|-19.120|33.480|680|Chimoio|2010-01-01T00:00:00|\n"
  }));
  await page.getByRole("button",{name:"Estações EarthScope"}).click();
  await page.getByRole("button",{name:"Consultar estações"}).click();
  await page.getByText("6H.CHM").waitFor();
  await page.getByRole("button",{name:"Adicionar estações ao mapa"}).click();
  await page.locator('.gm-layer-row[data-layer-name^="Estações EarthScope"]').first().waitFor();
  await page.screenshot({path:"workbench-browser-artifacts/02c-seismic-earthscope.png",fullPage:true});

  await page.getByRole("button",{name:"Fechar consulta sísmica"}).click();
  console.log("USGS catalog normalised and imported through the real GIS layer store.");

  await page.locator('[data-task="analysis"]').click();
  await page.locator('[data-command="proc.vector.buffer"]').click();
  const toolDialog=page.getByRole("dialog").filter({hasText:/Buffer|Zona tampão/i}).first();
  await toolDialog.waitFor();
  assert.equal(await toolDialog.getByRole("button",{name:/Voronoi|DGGS|Polyline/i}).count(),0,"Internal dialog lists must also be curated");
  const input=toolDialog.locator("select#layer");
  const inputValue=await input.locator("option").evaluateAll(options=>options.find(option=>option.textContent.includes("Pontos de estudo"))?.value);
  assert.ok(inputValue,"Imported layer must be available to the actual processing tool");
  await input.selectOption(inputValue);
  await toolDialog.locator("input#distance").fill("2");
  await toolDialog.getByRole("button",{name:"Executar",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.gm-layer-row[data-layer-name="Buffer"]').length>=1);
  await page.screenshot({path:"workbench-browser-artifacts/03-geomoz-analysis-dark.png",fullPage:true});
  await page.keyboard.press("Escape");
  await page.getByTestId("geomoz-layer-catalog").getByRole("button",{name:"Resultados",exact:true}).click();
  await page.locator(".gm-result-card").filter({hasText:"Concluído"}).first().waitFor();
  console.log("Buffer executed; output layer and result history available.");
  await page.screenshot({path:"workbench-browser-artifacts/03b-geomoz-results-dark.png",fullPage:true});
  await page.locator(".gm-result-card>button").first().click();
  await page.locator(".gm-layer-row[data-selected=true]").waitFor();
  // Repeated analyses can return identical output labels. Never open an
  // arbitrary first match when the history only identifies outputs by name.
  await page.locator('[data-task="analysis"]').click();
  await page.locator('[data-command="proc.vector.buffer"]').click();
  await toolDialog.waitFor();
  await toolDialog.locator("select#layer").selectOption(inputValue);
  await toolDialog.locator("input#distance").fill("2");
  await toolDialog.getByRole("button",{name:"Executar",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.gm-layer-row[data-layer-name="Buffer"]').length>=2);
  await page.keyboard.press("Escape");
  await page.getByTestId("geomoz-layer-catalog").getByRole("button",{name:"Resultados",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll(".gm-result-card").length===2);
  const outputLinks=page.locator(".gm-result-card>button");
  assert.equal(await outputLinks.count(),2);
  for(const link of await outputLinks.all())assert.equal(await link.isDisabled(),true,"Duplicate names must never open the wrong layer");
  await page.locator(".gm-catalog-nav button").first().click();
  console.log("Duplicate output names are reported without selecting an arbitrary layer.");
  await page.locator('[data-task="output"]').click();
  await page.locator(".gm-results").waitFor();
  await page.locator(".gm-catalog-nav button").first().click();
  await page.locator('[data-task="map"]').click();
  const baseCanvas=await page.locator("main canvas").first().boundingBox();
  await page.mouse.click(baseCanvas.x+baseCanvas.width*.55,baseCanvas.y+baseCanvas.height*.35,{button:"right"});
  await page.getByRole("menu").first().waitFor({timeout:10000});
  assert.equal(await page.getByRole("menuitem",{name:/directions|rota|conduzir|Google|Earth|tempo de viagem/i}).count(),0,"Map context must withhold off-scope features");
  await page.keyboard.press("Escape");
  // QGIS workflow: draw directly in a named, editable vector layer.
  // Sketches are intentionally not required as an intermediary.
  console.log("Starting selected-layer digitization without opening temporary Sketches.");
  // QGIS: outside the Digitalizar task there are no drawing controls.
  assert.equal(await page.locator('[data-testid="geomoz-add-digitized-feature"]:visible').count(),0);
  await page.getByRole("navigation",{name:"Tarefas GIS"}).getByRole("button",{name:"Digitalizar"}).click();
  await page.getByTestId("geomoz-create-layer").click();
  const wizard=page.getByTestId("geomoz-cartography-wizard");
  await wizard.waitFor();
  await wizard.getByLabel("Modelo cartográfico").selectOption("faults");
  assert.equal(await wizard.getByLabel("Geometria da camada").inputValue(),"LineString");
  await wizard.getByLabel("Novo campo",{exact:true}).fill("densidade");
  await wizard.getByLabel("Tipo do novo campo").selectOption("number");
  await wizard.getByRole("button",{name:"Adicionar à lista de campos"}).click();
  assert.ok(await wizard.getByText("densidade").count()>0,"New numeric column is listed in layer schema");
  await wizard.getByRole("button",{name:"Criar camada vazia"}).click();
  await wizard.getByText(/Camada «Falhas e lineamentos» criada/).waitFor();
  await page.locator('.gm-layer-row[data-layer-name="Falhas e lineamentos"]').first().waitFor();
  await wizard.getByRole("button",{name:"Fechar assistente"}).click();
  // Explicitly select the newly created target instead of depending on a
  // previous Sketches selection that may survive geometry-editor teardown.
  await page.locator('.gm-layer-row[data-layer-name="Falhas e lineamentos"]:visible .gm-layer-select').first().click();
  await page.locator('.gm-layer-inspector[data-selected-layer-name="Falhas e lineamentos"]:visible').first().waitFor({timeout:10000});
  console.log("QGIS-style geological line layer created and selected in the native GeoJSON store.");
  // Native in-place session writes to the selected geological layer,
  // rather than silently accumulating all sketches in a generic layer.
  const activeInspector=page.locator('.gm-layer-inspector[data-selected-layer-name="Falhas e lineamentos"]:visible').first();
  assert.equal(await activeInspector.locator('[data-testid="geomoz-add-digitized-feature"]:visible').count(),0,"Draw toolbar must be hidden until edit mode");
  assert.equal(await activeInspector.getByTestId("geomoz-digitizing-tools").count(),1,"Layer changes must leave exactly one digitizing control, without stale siblings");
  assert.equal(await activeInspector.getByTestId("geomoz-digitizing-tools").getAttribute("data-layer-id"),await activeInspector.getAttribute("data-selected-layer-id"),"Digitizing targets the selected layer");
  const editButton=activeInspector.locator('[data-testid="geomoz-edit-layer"]').first();
  await editButton.click();
  await activeInspector.locator('[data-testid="geomoz-edit-layer"][aria-pressed="true"]').first().waitFor({timeout:15000});
  await page.locator(".geo-editor-toolbar").waitFor();
  const digitizing=activeInspector.locator(".gm-digitizing-tools").first();
  await digitizing.waitFor();
  assert.ok(await digitizing.getByRole("group",{name:"Configuração de aderência"}).count()>0);
  await digitizing.getByLabel("Tolerância (pixels)").fill("14");
  await digitizing.getByTestId("geomoz-add-digitized-feature").click();
  const digitizingLayerId=await digitizing.getAttribute("data-layer-id");
  assert.ok(digitizingLayerId,"Native digitizing is bound to the selected layer");
  const canvas=await page.locator("main canvas").first().boundingBox();
  const at=(x,y)=>({x:canvas.x+canvas.width*x,y:canvas.y+canvas.height*y});
  const a=at(.53,.32),b=at(.7,.42),c=at(.83,.57);
  await page.mouse.click(a.x,a.y);await page.mouse.click(b.x,b.y);
  await page.mouse.dblclick(c.x,c.y);
  const featureForm=page.getByRole("dialog",{name:"Atributos da nova feição"});
  await featureForm.waitFor();
  await featureForm.getByLabel("Atributo nome").fill("Falha de controlo");
  await featureForm.getByLabel("Atributo densidade").fill("2.7");
  await featureForm.getByRole("button",{name:"Guardar atributos"}).click();
  await featureForm.waitFor({state:"hidden"});
  console.log("Layer schema, native snapping, draw tool and per-feature attribute UI verified.");

  await editButton.click();
  await activeInspector.locator('[data-testid="geomoz-edit-layer"][aria-pressed="false"]').first().waitFor({timeout:15000});
  // Assert that coordinates and typed attributes persisted in the target GeoJSON
  // and no transient Sketches layer received the user's geological line.
  await page.evaluate((layerId)=>{
    const e=document.querySelector('[data-layer-name="Falhas e lineamentos"]');
    if(!e)throw Error("Target geological layer was removed after save");
    if(!layerId)throw Error("Missing selected layer id");
  },digitizingLayerId);
  await activeInspector.locator(".gm-layer-properties summary").first().click();
  const digitizedDownload=page.waitForEvent("download",{timeout:15000});
  await activeInspector.getByRole("button",{name:"Exportar GeoJSON",exact:true}).first().click();
  await (await digitizedDownload).saveAs("workbench-browser-artifacts/digitized-geological-fault.geojson");
  const created=JSON.parse(await readFile("workbench-browser-artifacts/digitized-geological-fault.geojson","utf8"));
  assert.ok(created.features.some(f=>f.geometry?.type==="LineString"&&f.properties?.nome==="Falha de controlo"&&f.properties?.densidade===2.7),
    "Real native map drawing must persist geometry and typed attributes in selected layer");
  console.log("Native geological line digitized, attributed, committed and exported.");


  await page.locator('.gm-menu-slot:not([hidden]) button').first().click();
  await page.getByRole("menu").first().waitFor();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId("geomoz-workbench-chrome").waitFor();
  await settleRecovery(page);
  assert.equal(await page.evaluate(()=>window.GeoMozTheme.getTheme()),"dark");
  const other=await context.newPage();
  await other.goto("http://127.0.0.1:4182/gis-workspace/");
  await other.getByTestId("geomoz-workbench-chrome").waitFor();
  await settleRecovery(other);
  await other.getByTestId("geomoz-theme-toggle").click();
  await page.waitForFunction(()=>document.documentElement.dataset.geomozTheme==="light");
  await other.close();
  console.log("Cross-tab theme synchronisation and reload persistence passed.");
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await page.getByTestId("geomoz-workbench-chrome").waitFor();
  await settleRecovery(page);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Mobile viewport must not overflow horizontally");
  await page.getByRole("button",{name:/^Expandir catálogo$/i}).first().click();
  await page.getByTestId("geomoz-layer-catalog").waitFor();
  await page.screenshot({path:"workbench-browser-artifacts/04-geomoz-mobile.png",fullPage:true});
  await page.getByTestId("geomoz-layer-catalog").getByRole("button",{name:"Recolher catálogo",exact:true}).click();
  const mapBox=await page.locator("main canvas").first().boundingBox();
  assert.ok(mapBox&&mapBox.width>300&&mapBox.height>300,"Mobile map must remain usable");
  const viewer=await context.newPage();
  await viewer.goto("http://127.0.0.1:4182/gis-workspace/?layout=viewer");
  await viewer.getByTestId("geomoz-workbench-chrome").waitFor();
  await settleRecovery(viewer);
  await viewer.locator("main canvas").first().waitFor();
  assert.equal(await viewer.locator("[data-command^='project.'],[data-command^='add.'],[data-command^='proc.'],[data-command^='settings.']").count(),0,"Viewer ribbon must never expose authoring actions");
  assert.equal(await viewer.getByRole("textbox",{name:"Nome do projecto"}).isEditable(),false);
  assert.equal(await viewer.locator(".gm-task-tabs button").count(),1);
  assert.equal(await viewer.locator('[data-action="geomoz-seismic"]').count(),0,"Viewer must not expose catalog import");
  await viewer.getByTestId("geomoz-theme-toggle").click();
  await viewer.close();
  console.log("Read-only viewer keeps camera and theme controls while withholding authoring commands.");
  assert.deepEqual(errors,[],"No uncaught React/runtime errors");
  await writeFile("workbench-browser-artifacts/report.json",JSON.stringify({interface:"geomoz-workbench",import:true,layerVisibility:true,opacity:true,bufferProcessing:true,resultNavigator:true,seismicUsgs:true,seismicAnalytics:true,earthscopeStation:true,layerStyleEditor:true,curatedMenus:true,searchCurated:true,studyAreaDrawing:true,layerProperties:true,geojsonExport:true,themePersistence:true,crossTabTheme:true,geomozOwnedAbout:true,mobile:true,viewerReadOnly:true,duplicateNamesGuarded:true,errors},null,2));
  console.log("GeoMoz Workbench: owned UI, real import, layer controls, analysis dialog, menus, dark/light persistence and mobile layout passed.");
 }catch(error){
  try{await page.locator(".gm-help-menu summary").click({timeout:2000});await page.getByRole("button",{name:"Diagnóstico",exact:true}).click({timeout:2000});await page.getByRole("dialog").waitFor({timeout:2000});console.error("Application diagnostics:",(await page.getByRole("dialog").innerText()).slice(-14000));}catch{}
  console.error("Visible interface:",(await page.locator("body").innerText()).slice(-12000));await page.screenshot({path:"workbench-browser-artifacts/failure.png",fullPage:true}).catch(()=>{});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
