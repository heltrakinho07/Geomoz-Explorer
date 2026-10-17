/* Real browser regression: guest workspace, visible drawing, HGT import, WASM slope. */
const {createServer} = require("node:http");
const {readFile, stat, mkdir} = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require(path.join(process.env.GIS_PLAYWRIGHT_ROOT, "node_modules/playwright"));
const root = path.resolve("artifacts/geomoz-react/dist/public");
const mime = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg"};
const {deflateSync}=require("node:zlib");
function pngChunk(type,data){
  const name=Buffer.from(type),body=Buffer.concat([name,data]),out=Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length,0);body.copy(out,4);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
const testTile=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk("IHDR",ihdr),pngChunk("IDAT",deflateSync(Buffer.from([0,37,99,235,80]))),pngChunk("IEND",Buffer.alloc(0))]);
const tileRequests=[],wmsRequests=[];
async function waitForServer(predicate){
  const end=Date.now()+20000;
  while(!predicate()&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,200));
}
const server = createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, "http://localhost");
    if(parsed.pathname.startsWith("/test-tiles/")){tileRequests.push(parsed.pathname);res.writeHead(200,{"Content-Type":"image/png"});res.end(testTile);return;}
    if(parsed.pathname==="/test-wms"){
      if((parsed.searchParams.get("REQUEST")||"").toLowerCase()==="getcapabilities"){
        res.writeHead(200,{"Content-Type":"application/xml"});
        res.end('<?xml version="1.0"?><WMS_Capabilities version="1.3.0"><Service><Title>Cesium test WMS</Title></Service><Capability><Layer><Title>Fixtures</Title><CRS>EPSG:3857</CRS><Layer><Name>fixture</Name><Title>Test imagery</Title></Layer></Layer></Capability></WMS_Capabilities>');
      }else{wmsRequests.push(Object.fromEntries(parsed.searchParams));res.writeHead(200,{"Content-Type":"image/png"});res.end(testTile);}
      return;
    }
    let file = path.resolve(root, "." + decodeURIComponent(parsed.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) {res.writeHead(403);res.end();return;}
    try {if (!(await stat(file)).isFile()) file = path.join(root,"index.html");}
    catch {file = path.join(root,"index.html");}
    const data = await readFile(file);
    res.writeHead(200, {"Content-Type":mime[path.extname(file)] || "application/octet-stream"});
    res.end(data);
  } catch {res.writeHead(500);res.end();}
});
(async () => {
  await mkdir("workspace-browser-artifacts",{recursive:true});
  await new Promise(resolve=>server.listen(4178,"127.0.0.1",resolve));
  const browser = await chromium.launch({headless:true,args:["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(120000);
  page.on("pageerror",error=>console.error("Browser runtime error:",error.message));
  try {
    await page.goto("http://127.0.0.1:4178/");
    await page.getByRole("button",{name:"Explorar",exact:true}).click();
    await page.getByRole("button",{name:"Continuar como Convidado (Explorar sem conta)",exact:true}).click();
    await page.getByRole("button",{name:"GIS Workspace",exact:true}).click();
    await page.getByRole("heading",{name:"Da área de estudo ao resultado.",exact:true}).waitFor();
    await page.locator('[data-testid="cesium-workspace"] .cesium-widget canvas').waitFor();
    await page.getByText("CesiumJS · 2D",{exact:true}).waitFor();
    if(await page.locator("canvas.maplibregl-canvas").count()) throw Error("Legacy renderer still mounted.");
    await page.screenshot({path:"workspace-browser-artifacts/01-workspace.png",fullPage:true});
    await page.getByRole("button",{name:/01 · ÁREA/}).click();
    const map = page.locator('[data-testid="cesium-workspace"] .cesium-widget canvas');
    const box = await map.boundingBox();
    if (!box) throw Error("Map canvas has no visible bounds.");
    for (const [x,y] of [[0.40,0.42],[0.60,0.42],[0.60,0.62]])
      await map.click({position:{x:box.width*x,y:box.height*y}});
    await page.getByRole("button",{name:"Concluir área",exact:true}).waitFor({state:"visible"});
    if (!(await page.getByTestId("gis-aoi-drawing-path").isVisible())) throw Error("AOI line is not visible.");
    await page.screenshot({path:"workspace-browser-artifacts/02-drawing.png",fullPage:true});
    await page.getByRole("button",{name:"Concluir área",exact:true}).click();
    // Synthetic SRTM sample; it is not the user's original DEM.
    const side=1201, hgt=Buffer.alloc(side*side*2);
    for(let y=0;y<side;y++) for(let x=0;x<side;x++) hgt.writeInt16BE(1500-Math.floor(x/4)-Math.floor(y/8),(y*side+x)*2);
    await page.locator('.geomoz-workspace input[type="file"][multiple][accept*=".hgt"]').setInputFiles({name:"S20E035.hgt",mimeType:"application/octet-stream",buffer:hgt});
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="cesium-workspace"]')?.dataset.rasterCount)>0);
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="cesium-workspace"]')?.dataset.rasterTiles)>0);
    console.log("HGT imported and rendered as Cesium imagery; opening processing");
    await page.getByRole("button",{name:"Processamento",exact:true}).click();
    await page.getByText("Declive (Slope)",{exact:true}).first().click();
    console.log("Slope selected; starting WASM");
    await page.getByRole("button",{name:"Executar no browser",exact:true}).click();
    await page.getByText("Whitebox Raster concluído",{exact:true}).waitFor();
    await page.getByRole("button",{name:/1 resultado\(s\)/}).waitFor();
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="cesium-workspace"]')?.dataset.rasterCount)>=2);
    await page.waitForFunction(()=>window.Cesium?.VERSION==="1.127");
    await page.waitForFunction(()=>document.querySelector('[data-testid="cesium-workspace"]')?.dataset.sceneMode===String(window.Cesium.SceneMode.SCENE2D));
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="cesium-workspace"]')?.dataset.resultTiles)>0);
    await page.waitForFunction(()=>document.querySelector('[data-testid="cesium-workspace"]')?.dataset.activeRasterOnTop==="true");
    await page.screenshot({path:"workspace-browser-artifacts/03-result.png",fullPage:true});
    await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(button=>button.textContent.includes("Auto stretch 2–98%")&&!button.disabled));
    const selected = await page.locator(".gw-input-card strong").innerText();
    if (!selected.includes("Declive")) throw Error("The output raster was not automatically selected: "+selected);
    // Real GeoJSON loading and feature identification in the Cesium map.
    const polygon={type:"FeatureCollection",features:[{type:"Feature",properties:{fixture:"Cesium vector"},geometry:{type:"Polygon",coordinates:[[[35,-20],[36,-20],[36,-19],[35,-19],[35,-20]]]}}]};
    await page.locator('.geomoz-workspace input[type="file"][multiple][accept*=".hgt"]').setInputFiles({name:"cesium-fixture.geojson",mimeType:"application/geo+json",buffer:Buffer.from(JSON.stringify(polygon))});
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="cesium-workspace"]')?.dataset.vectorReady)>=2);
    const vectorBox=await map.boundingBox();
    await map.click({position:{x:vectorBox.width/2,y:vectorBox.height/2}});
    await page.getByRole("button",{name:"Fechar atributos",exact:true}).waitFor();
    await page.getByText("Cesium vector",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Fechar atributos",exact:true}).click();
    // Deterministic local services verify real Cesium requests without an external provider.
    await page.getByRole("button",{name:"Dados",exact:true}).click();
    await page.getByPlaceholder("https://.../{z}/{x}/{y}.png",{exact:true}).fill("http://127.0.0.1:4178/test-tiles/{z}/{x}/{y}.png");
    await page.getByRole("button",{name:"Adicionar serviço de tiles à sessão",exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="cesium-workspace"]')?.dataset.serviceCount)>0);
    await waitForServer(()=>tileRequests.length>0);
    if(!tileRequests.length)throw Error("Cesium did not request XYZ imagery.");
    const wmsEndpoint=page.getByPlaceholder("https://.../wms",{exact:true});
    await wmsEndpoint.fill("http://127.0.0.1:4178/test-wms");
    await wmsEndpoint.locator("..").getByRole("button",{name:"Listar",exact:true}).click();
    await page.getByRole("button",{name:"Adicionar WMS ao mapa",exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="cesium-workspace"]')?.dataset.serviceCount)>=2);
    await waitForServer(()=>wmsRequests.length>0);
    const wms=wmsRequests.find(r=>r.REQUEST==="GetMap"),coords=(wms?.BBOX??"").split(",").map(Number);
    if(!wms||coords.length!==4||!coords.every(Number.isFinite)||coords[0]>=coords[2]||coords[1]>=coords[3]||wms.CRS!=="EPSG:3857")throw Error("Invalid projected WMS request: "+JSON.stringify(wmsRequests));
    await page.screenshot({path:"workspace-browser-artifacts/04-vectors-services.png",fullPage:true});
    console.log("Cesium vector picking, XYZ and WMS passed",JSON.stringify({xyz:tileRequests.length,wms:wmsRequests.length,bbox:wms.BBOX}));
    console.log(JSON.stringify({engine:"CesiumJS 1.127 in 2D",drawing:"visible",hgt:"imported and rendered",slope:"completed",selected}));
  } catch (error) {
    console.error("Rendered workspace state:", (await page.locator("body").innerText()).slice(-14000));
    throw error;
  } finally {
    await page.screenshot({path:"workspace-browser-artifacts/final-state.png",fullPage:true}).catch(()=>{});
    await browser.close(); await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
