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
 const page=await context.newPage(),errors=[];
 page.on("pageerror",error=>{errors.push(error.message);console.error("Runtime error:",error.message);});
 page.setDefaultTimeout(90000);
 try{
  await page.goto("http://127.0.0.1:4182/gis-workspace/");
  await page.getByTestId("geomoz-workbench-chrome").waitFor();
  await page.getByTestId("geomoz-layer-catalog").waitFor();
  await page.locator("main canvas").first().waitFor();
  assert.equal(await page.locator(".geomoz-portal-shell").count(),0,"Old shell must not coexist with the new UI");
  assert.equal(await page.locator("[data-command='add.vector']").count(),1);
  assert.deepEqual(await page.locator(".gm-task-tabs button").allTextContents(),["Área de estudo","Dados","Análise","Resultados"]);
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
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Exportar GeoJSON",exact:true}).click();
  const download=await downloadPromise;
  await download.saveAs("workbench-browser-artifacts/exported-points.geojson");
  assert.equal(JSON.parse(await readFile("workbench-browser-artifacts/exported-points.geojson","utf8")).features.length,2);
  await page.locator(".gm-layer-properties summary").click();

  await page.getByRole("textbox",{name:"Pesquisar camadas"}).fill("inexistente");
  await page.getByText("Nenhuma correspondência",{exact:true}).waitFor();
  await page.getByRole("textbox",{name:"Pesquisar camadas"}).fill("");
  await page.screenshot({path:"workbench-browser-artifacts/02-geomoz-data-dark.png",fullPage:true});
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
  await page.waitForFunction(()=>document.querySelectorAll(".gm-layer-row").length>=2);
  await page.screenshot({path:"workbench-browser-artifacts/03-geomoz-analysis-dark.png",fullPage:true});
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Resultados",exact:true}).click();
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
  await page.waitForFunction(()=>document.querySelectorAll(".gm-layer-row").length>=3);
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Resultados",exact:true}).click();
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
  await page.locator('[data-command="plugin.maplibre-gl-geo-editor"]').click();
  const editor=page.locator(".geo-editor-toolbar");
  await editor.waitFor();
  await editor.locator('button[data-mode="polygon"]').click();
  const canvas=await page.locator("main canvas").first().boundingBox();
  const at=(x,y)=>({x:canvas.x+canvas.width*x,y:canvas.y+canvas.height*y});
  const a=at(.55,.35),b=at(.8,.35),c=at(.8,.65),d=at(.55,.65);
  await page.mouse.click(a.x,a.y);await page.mouse.click(b.x,b.y);await page.mouse.click(c.x,c.y);await page.mouse.dblclick(d.x,d.y);
  await page.locator('.gm-layer-row[data-layer-name="Sketches"]').waitFor();
  const attributeClose=page.locator(".geo-editor-attribute-panel:not(.attribute-panel--hidden) .geo-editor-attribute-panel-close");
  if(await attributeClose.isVisible())await attributeClose.click();
  await page.screenshot({path:"workbench-browser-artifacts/03c-geomoz-study-area.png",fullPage:true});
  await page.locator('[data-command="plugin.maplibre-gl-geo-editor"]').click();
  await page.mouse.click(a.x,a.y,{button:"right"});
  await page.getByRole("menu").first().waitFor();
  assert.equal(await page.getByRole("menuitem",{name:/directions|rota|conduzir|Google|Earth|tempo de viagem/i}).count(),0,"Map context must withhold off-scope features");
  await page.keyboard.press("Escape");

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
  await viewer.getByTestId("geomoz-theme-toggle").click();
  await viewer.close();
  console.log("Read-only viewer keeps camera and theme controls while withholding authoring commands.");
  assert.deepEqual(errors,[],"No uncaught React/runtime errors");
  await writeFile("workbench-browser-artifacts/report.json",JSON.stringify({interface:"geomoz-workbench",import:true,layerVisibility:true,opacity:true,bufferProcessing:true,resultNavigator:true,curatedMenus:true,searchCurated:true,studyAreaDrawing:true,layerProperties:true,geojsonExport:true,themePersistence:true,crossTabTheme:true,mobile:true,viewerReadOnly:true,duplicateNamesGuarded:true,errors},null,2));
  console.log("GeoMoz Workbench: owned UI, real import, layer controls, analysis dialog, menus, dark/light persistence and mobile layout passed.");
 }catch(error){console.error("Visible interface:",(await page.locator("body").innerText()).slice(-12000));await page.screenshot({path:"workbench-browser-artifacts/failure.png",fullPage:true}).catch(()=>{});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
