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
  await row.locator(".gm-layer-select").click();
  await page.getByRole("slider",{name:"Opacidade da camada"}).fill("0.65");
  await page.waitForFunction(()=>document.querySelector(".gm-layer-row[data-selected=true]")?.textContent.includes("65%"));
  await row.locator(".gm-layer-visibility").click();
  assert.equal(await row.getAttribute("data-visible"),"false");
  await row.locator(".gm-layer-visibility").click();
  await row.locator(".gm-layer-fit").click();
  await page.getByRole("textbox",{name:"Pesquisar camadas"}).fill("inexistente");
  await page.getByText("Nenhuma correspondência",{exact:true}).waitFor();
  await page.getByRole("textbox",{name:"Pesquisar camadas"}).fill("");
  await page.screenshot({path:"workbench-browser-artifacts/02-geomoz-data-dark.png",fullPage:true});
  await page.locator('[data-task="analysis"]').click();
  await page.locator('[data-command="proc.vector.buffer"]').click();
  await page.locator('[role="dialog"]').filter({hasText:/Buffer|Zona tampão/i}).first().waitFor();
  await page.screenshot({path:"workbench-browser-artifacts/03-geomoz-analysis-dark.png",fullPage:true});
  await page.keyboard.press("Escape");
  await page.locator('[data-task="project"]').click();
  await page.getByRole("button",{name:"Mais opções",exact:true}).click();
  await page.locator('.gm-menu-slot:not([hidden]) button').first().click();
  await page.getByRole("menu").first().waitFor();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId("geomoz-workbench-chrome").waitFor();
  assert.equal(await page.evaluate(()=>window.GeoMozTheme.getTheme()),"dark");
  const other=await context.newPage();
  await other.goto("http://127.0.0.1:4182/gis-workspace/");
  await other.getByTestId("geomoz-workbench-chrome").waitFor();
  await other.getByTestId("geomoz-theme-toggle").click();
  await page.waitForFunction(()=>document.documentElement.dataset.geomozTheme==="light");
  await other.close();
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await page.getByTestId("geomoz-workbench-chrome").waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Mobile viewport must not overflow horizontally");
  await page.getByRole("button",{name:"Expandir catálogo"}).click();
  await page.getByTestId("geomoz-layer-catalog").waitFor();
  await page.screenshot({path:"workbench-browser-artifacts/04-geomoz-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Recolher catálogo"}).click();
  const mapBox=await page.locator("main canvas").first().boundingBox();
  assert.ok(mapBox&&mapBox.width>300&&mapBox.height>300,"Mobile map must remain usable");
  assert.deepEqual(errors,[],"No uncaught React/runtime errors");
  await writeFile("workbench-browser-artifacts/report.json",JSON.stringify({interface:"geomoz-workbench",import:true,layerVisibility:true,opacity:true,bufferDialog:true,fullMenus:true,themePersistence:true,crossTabTheme:true,mobile:true,errors},null,2));
  console.log("GeoMoz Workbench: owned UI, real import, layer controls, analysis dialog, menus, dark/light persistence and mobile layout passed.");
 }catch(error){await page.screenshot({path:"workbench-browser-artifacts/failure.png",fullPage:true}).catch(()=>{});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
