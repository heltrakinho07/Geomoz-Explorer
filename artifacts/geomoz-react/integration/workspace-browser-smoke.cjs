/* Real browser regression: guest workspace, visible drawing, HGT import, WASM slope. */
const {createServer} = require("node:http");
const {readFile, stat, mkdir} = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require(path.join(process.env.GIS_PLAYWRIGHT_ROOT, "node_modules/playwright"));
const root = path.resolve("artifacts/geomoz-react/dist/public");
const mime = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg"};
const server = createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, "http://localhost");
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
  try {
    await page.goto("http://127.0.0.1:4178/");
    await page.getByRole("button",{name:"Explorar",exact:true}).click();
    await page.getByRole("button",{name:"Continuar como Convidado (Explorar sem conta)",exact:true}).click();
    await page.getByRole("button",{name:"GIS Workspace",exact:true}).click();
    await page.getByRole("heading",{name:"Da área de estudo ao resultado.",exact:true}).waitFor();
    await page.locator("canvas.maplibregl-canvas").waitFor();
    await page.screenshot({path:"workspace-browser-artifacts/01-workspace.png",fullPage:true});
    await page.getByRole("button",{name:/01 · ÁREA/}).click();
    const map = page.locator("canvas.maplibregl-canvas");
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
    await page.locator('input[type="file"][multiple]').setInputFiles({name:"S20E035.hgt",mimeType:"application/octet-stream",buffer:hgt});
    await page.getByRole("button",{name:"Processamento",exact:true}).click();
    await page.getByText("Declive (Slope)",{exact:true}).first().click();
    await page.getByRole("button",{name:"Executar no browser",exact:true}).click();
    await page.getByText("Whitebox Raster concluído",{exact:true}).waitFor();
    await page.getByRole("button",{name:/1 resultado\(s\)/}).waitFor();
    await page.screenshot({path:"workspace-browser-artifacts/03-result.png",fullPage:true});
    const selected = await page.locator(".gw-input-card strong").innerText();
    if (!selected.includes("Declive")) throw Error("The output raster was not automatically selected: "+selected);
    console.log(JSON.stringify({drawing:"visible",hgt:"imported",slope:"completed",selected}));
  } finally {
    await page.screenshot({path:"workspace-browser-artifacts/final-state.png",fullPage:true}).catch(()=>{});
    await browser.close(); await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
