const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const {readFile}=require("node:fs/promises");

module.exports=async function validateRasterProcessing(page){
 const {writeArrayBuffer,fromArrayBuffer}=await import(pathToFileURL(path.resolve(".geolibre-upstream/node_modules/geotiff/dist-module/geotiff.js")).href);
 const samples=Float32Array.from({length:256},(_,i)=>100+(i%16)*2+Math.floor(i/16)*3);
 const input=Buffer.from(writeArrayBuffer(samples,{
  width:16,height:16,ModelPixelScale:[30,30,0],ModelTiepoint:[0,0,0,500000,7200000,0],
  GTModelTypeGeoKey:1,GTRasterTypeGeoKey:1,ProjectedCSTypeGeoKey:32736,
 }));
 async function run(id,params,maskId){
  console.log("Raster control operation:",id);
  // Raster is a top-level category in the compact, single-row GIS header.
  const card=page.locator(".gm-ribbon-accordion").filter({has:page.locator(".gm-ribbon-trigger").filter({hasText:/^\s*Raster\s*$/})});
  const trigger=card.locator(".gm-ribbon-trigger");
  if(await trigger.getAttribute("aria-expanded")==="false")await trigger.click();
  await page.getByTestId("geomoz-tools-flyout").locator('[data-command="proc.raster.'+id+'"]').click();
  const dialog=page.getByRole("dialog").filter({has:page.locator("#raster-input")});
  await dialog.waitFor();
  const chooser=page.waitForEvent("filechooser");
  await dialog.locator("#raster-input").locator("..").getByRole("button").click();
  await (await chooser).setFiles({name:"dem-controlo.tif",mimeType:"image/tiff",buffer:input});
  for(const [key,value] of Object.entries(params))await dialog.locator("#"+key).fill(String(value));
  if(maskId)await dialog.locator("#mask_path").selectOption({label:maskId});
  await dialog.getByRole("button",{name:/^(Run|Executar)$/}).click();
  const name={slope:"slope",hillshade:"hillshade",reproject:"reprojected","clip-mask":"masked"}[id];
  await page.locator('.gm-layer-row[data-layer-name="'+name+'"]').waitFor({timeout:180000});
  const download=page.waitForEvent("download");
  await dialog.getByRole("button",{name:/GeoTIFF/}).click();
  const target="workbench-browser-artifacts/"+name+".tif";
  await (await download).saveAs(target);
  const bytes=await readFile(target);
  const tif=await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const image=await tif.getImage();
  await page.keyboard.press("Escape");
  return image;
 }
 const slope=await run("slope",{});
 const slopePixels=await slope.readRasters();
 const expected=Math.atan(Math.hypot(2/30,3/30))*180/Math.PI;
 assert.ok(Math.abs(slopePixels[0][8*16+8]-expected)<0.02,"Projected DEM slope must match analytical plane");
 const shade=await run("hillshade",{});
 const shadePixels=await shade.readRasters();
 assert.ok(shadePixels[0][8*16+8]>0&&shadePixels[0][8*16+8]<=255);
 const projected=await run("reproject",{dst_crs:"EPSG:4326"});
 assert.equal(projected.getGeoKeys().GeographicTypeGeoKey,4326,"Output CRS must actually change");
 assert.ok(projected.getBoundingBox()[0]>32&&projected.getBoundingBox()[2]<34);
 const [west,south,east,north]=projected.getBoundingBox();
 const dx=(east-west)/4,dy=(north-south)/4;
 const coordinates=[[[west+dx,south+dy],[east-dx,south+dy],[east-dx,north-dy],[west+dx,north-dy],[west+dx,south+dy]]];
 const mask={type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates}}]};
 await page.evaluate(text=>{
  const data=new DataTransfer();
  data.items.add(new File([text],"Mascara-controlo.geojson",{type:"application/geo+json"}));
  const shell=document.querySelector('[data-testid="desktop-shell"]');
  for(const type of ["dragenter","dragover","drop"])shell.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data}));
 },JSON.stringify(mask));
 const maskRow=page.locator('.gm-layer-row[data-layer-name="Mascara-controlo"]');
 await maskRow.waitFor();
 const clipped=await run("clip-mask",{},"Mascara-controlo");
 assert.equal(clipped.getGeoKeys().ProjectedCSTypeGeoKey,32736);
 assert.ok(clipped.getWidth()<16&&clipped.getHeight()<16,"Cutline must crop the DEM");
 assert.ok(clipped.getSamplesPerPixel()>=2,"Cutline output must include transparency");

 // Exercise the topographic profile against a real GDAL-reprojected DEM output.
 // This must read actual COG pixel values, not a synthetic elevation function.
 const realDem=page.locator('.gm-layer-row[data-layer-name="reprojected"]');
 await realDem.getByRole("button",{name:"Enquadrar reprojected"}).click();
 await page.waitForTimeout(650);
 const rasterCategory=page.locator(".gm-compact-tool-list .gm-ribbon-trigger").filter({hasText:/^Raster$/});
 await rasterCategory.click();
 await page.getByTestId("geomoz-tools-flyout").locator('[data-action="geomoz-topographic-profile"]').click();
 const topo=page.getByTestId("geomoz-topographic-profile");
 await topo.waitFor({state:"visible"});
 await topo.getByLabel("DEM de entrada").selectOption({label:"reprojected"});
 await topo.getByLabel("Número de amostras do perfil").fill("20");
 await topo.getByRole("button",{name:"Traçar linha no mapa"}).click();
 const mapCanvas=await page.locator("main canvas").first().boundingBox();
 assert.ok(mapCanvas?.width>200 && mapCanvas.height>200);
 const mapSurface=page.locator("main canvas").first();
 // The trace must render ABOVE raster tiles, not simply exist in the layer tree.
 // Compare the actual WebGL canvas before and after drawing A -> B.
 await page.waitForTimeout(350);
 const beforeTrace=await mapSurface.screenshot();
 await page.mouse.click(mapCanvas.x+mapCanvas.width*.45,mapCanvas.y+mapCanvas.height*.48);
 await page.mouse.click(mapCanvas.x+mapCanvas.width*.53,mapCanvas.y+mapCanvas.height*.52);
 await topo.getByRole("button",{name:"Terminar traçado"}).click();
 await page.waitForTimeout(350);
 const afterTrace=await mapSurface.screenshot();
 async function cyanTracePixels(buffer) {
   const base64=buffer.toString("base64");
   return page.evaluate(async base64=>{
     const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
     const bitmap=await createImageBitmap(new Blob([bytes],{type:"image/png"}));
     const canvas=document.createElement("canvas");
     canvas.width=bitmap.width;canvas.height=bitmap.height;
     const context=canvas.getContext("2d",{willReadFrequently:true});
     context.drawImage(bitmap,0,0);
     const px=context.getImageData(0,0,canvas.width,canvas.height).data;
     let cyan=0;
     for(let y=Math.floor(canvas.height*.45);y<canvas.height*.55;y++){
       for(let x=Math.floor(canvas.width*.44);x<canvas.width*.54;x++){
         const p=(y*canvas.width+x)*4;
         if(px[p]<85 && px[p+1]>95 && px[p+1]<205 &&
           px[p+2]>165 && px[p+2]>px[p+1]+30)cyan++;
       }
     }
     bitmap.close();
     return cyan;
   },base64);
 }
 const cyanBefore=await cyanTracePixels(beforeTrace),cyanAfter=await cyanTracePixels(afterTrace);
 assert.ok(cyanAfter>cyanBefore+20,
   "Profile A–B must be visibly painted over the loaded DEM raster (cyan "+cyanBefore+" → "+cyanAfter+")");
 console.log("MapLibre screenshot confirms the profile trace is visible ABOVE raster pixels.");
 await topo.getByRole("button",{name:"Calcular perfil"}).click();
 await topo.getByRole("group",{name:/Gráfico de elevação/}).waitFor({timeout:90000});
 assert.match(await topo.innerText(),/amostras válidas/);
 const csvPromise=page.waitForEvent("download");
 await topo.getByRole("button",{name:"Exportar CSV"}).click();
 const csv=await csvPromise;
 assert.equal(csv.suggestedFilename(),"geomoz_perfil_topografico.csv");
 await csv.saveAs("workbench-browser-artifacts/geomoz_perfil_topografico.csv");
 for (const [format,expectedMime] of [["png",[0x89,0x50,0x4e,0x47]],["pdf",[0x25,0x50,0x44,0x46]]]) {
   const downloadPromise=page.waitForEvent("download");
   await topo.getByTestId("geomoz-topo-export-"+format).click();
   const file=await downloadPromise;
   assert.equal(file.suggestedFilename(),"geomoz_perfil_topografico."+format);
   const name="workbench-browser-artifacts/geomoz_perfil_topografico."+format;
   await file.saveAs(name);
   const bytes=await readFile(name);
   assert.deepEqual([...bytes.subarray(0,4)],expectedMime,"Exported "+format+" must be a real image/document");
   if(format==="pdf"){
     const pdf=bytes.toString("latin1");
     assert.match(pdf,/\/Width 1800 \/Height 1000/,"PDF must embed the full-resolution 1800 × 1000 figure");
     const start=/startxref\n(\d+)\n%%EOF/.exec(pdf);
     assert.ok(start,"PDF must have a cross-reference pointer");
     assert.equal(bytes.subarray(Number(start[1]),Number(start[1])+4).toString(),"xref",
       "PDF cross-reference offset must point to the actual table");
   }else{
     const raster=await page.evaluate(async base64=>{
       const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
       const bitmap=await createImageBitmap(new Blob([bytes],{type:"image/png"}));
       const canvas=document.createElement("canvas");
       canvas.width=bitmap.width;canvas.height=bitmap.height;
       const context=canvas.getContext("2d",{willReadFrequently:true});
       context.drawImage(bitmap,0,0);
       const data=context.getImageData(100,400,1600,510).data;
       let blue=0;
       for(let i=0;i<data.length;i+=4){
         if(data[i]<85&&data[i+1]>95&&data[i+1]<205&&
           data[i+2]>165&&data[i+2]>data[i+1]+30)blue++;
       }
       const result={width:bitmap.width,height:bitmap.height,blue};
       bitmap.close();
       return result;
     },bytes.toString("base64"));
     assert.equal(raster.width,1800,"PNG width must use the report's high-resolution canvas");
     assert.equal(raster.height,1000,"PNG height must use the report's high-resolution canvas");
     assert.ok(raster.blue>75,"Exported PNG must contain real blue profile curve pixels, not just a blank report: "+raster.blue);
   }
 }
 const csvText=await readFile("workbench-browser-artifacts/geomoz_perfil_topografico.csv","utf8");
 assert.ok(csvText.includes("Distancia_km,Elevacao_m"));
 const validRows=csvText.trim().split(/\r?\n/).slice(2).filter(row=>{
  const fields=row.split(",");
  return fields.length===5 && Number.isFinite(Number(fields[2])) && fields[2].length>0;
 });
 assert.ok(validRows.length>0,"The profile must read genuine numeric elevation pixels from reprojected DEM");
 await topo.getByRole("button",{name:"Fechar perfil topográfico"}).click();
 console.log("Real raster profile sampled, plotted and exported from DEM COG.");

 // Test the real native renderer against an existing GeoTIFF in the project.
 // No iframe, no postMessage and no file chooser: source bytes come directly
 // from the existing local COG's layer metadata and are reprojected in-browser.
 const layerCountBefore=await page.locator(".gm-layer-row").count();
 await realDem.locator(".gm-layer-select").click();
 await page.getByTestId("geomoz-layer-open-terrain").click();
 const terrain=page.getByTestId("geomoz-workbench-terrain");
 await terrain.waitFor({state:"visible"});
 assert.equal(await terrain.locator("iframe").count(),0,"3D must be native to GIS Workspace");
 await terrain.getByLabel("Seleccionar DEM do GIS Workspace").selectOption({label:"reprojected"});
 await terrain.getByTestId("geomoz-workbench-terrain-import").click();
 const canvas=terrain.getByTestId("geomoz-native-terrain-canvas");
 await canvas.waitFor({state:"visible",timeout:25000});
 await page.waitForFunction(()=>{
   const c=document.querySelector('[data-testid="geomoz-native-terrain-canvas"]');
   return c instanceof HTMLCanvasElement&&c.width>50&&c.height>50;
 },{timeout:12000});
 assert.match(await terrain.innerText(),/EPSG:4326 → EPSG:32736/);

 // The upstream Terrain Studio feature set must survive localization merges.
 const lod=terrain.getByLabel("Detalhe do terreno 3D");
 await lod.selectOption("low");
 await lod.selectOption("medium");
 await lod.selectOption("auto");
 await terrain.getByTestId("geomoz-terrain-tab-export").click();
 const binaryDownload=page.waitForEvent("download");
 await terrain.getByTestId("geomoz-terrain-export-glb").click();
 const glbFile="workbench-browser-artifacts/terrain-native-manica.glb";
 await (await binaryDownload).saveAs(glbFile);
 const glb=await readFile(glbFile);
 assert.equal(glb.toString("ascii",0,4),"glTF","Export must contain a real glTF 2.0 GLB header");
 assert.equal(glb.readUInt32LE(4),2,"GLB export must be version 2");
 assert.equal(glb.readUInt32LE(8),glb.byteLength,"GLB binary length must match the header");
 await terrain.getByTestId("geomoz-terrain-tab-analysis").click();

 assert.equal(await page.locator(".gm-layer-row").count(),layerCountBefore,
   "Opening DEM 3D must preserve the same GIS layers");

 // Shared GeoMoz preference -> GeoLibre i18next must translate an already open
 // 3D studio and its scientific panel without losing the DEM or map project.
 for(const {code,heading,science,source} of [
   {code:"en",heading:"Terrain layers",science:"Scientific DEM analysis",source:"Project DEM"},
   {code:"es",heading:"Capas del terreno",science:"Análisis científico del MDE",source:"MDE del proyecto"},
   {code:"fr",heading:"Couches du terrain",science:"Analyse scientifique du MNT",source:"MNT du projet"},
   {code:"pt",heading:"Camadas do terreno",science:"Análise científica do DEM",source:"DEM do projecto"},
 ]) {
   const accepted=await page.evaluate(code=>window.GeoMozPreferences?.setLanguage(code),code);
   assert.equal(accepted,true,"Cross-module preference bridge must accept "+code);
   await page.waitForFunction(({code,heading,science,source})=>{
     const root=document.querySelector('[data-testid="geomoz-workbench-terrain"]');
     return document.documentElement.lang===code &&
       root?.querySelector(".gm-terrain-panel-head span:first-child")?.textContent?.trim()===heading &&
       root?.querySelector(".gm-terrain-inspector-section h3")?.textContent===science &&
       root?.querySelector(".gm-terrain-workspace-selector span")?.textContent===source;
   },{code,heading,science,source},{timeout:12000});
   assert.equal(await canvas.count(),1,"Changing language must not remount or lose native DEM canvas");
 }
 console.log("GeoLibre i18next and GeoMoz shared preferences translated 3D studio and scientific panel live in PT/EN/ES/FR.");

 // Picking at A and B uses hit-testing on real projected WebGL triangles.
 const view=await canvas.boundingBox();
 assert.ok(view?.width>200&&view.height>180,"WebGL terrain has usable dimensions");
 const clickVisible=async (target,pts)=>{
   await terrain.getByRole("button",{name:new RegExp("(Escolher "+target+" no terreno|Clique no terreno para "+target+")")}).click();
   for(const [x,y] of pts){
     await page.mouse.click(view.x+view.width*x,view.y+view.height*y);
     if(await terrain.getByText(new RegExp("Ponto "+target+":")).count())return;
   }
   throw Error("Click-to-elevation failed to select point "+target);
 };
 await clickVisible("A",[[.5,.5],[.48,.53],[.52,.49],[.45,.55]]);
 await clickVisible("B",[[.55,.5],[.5,.55],[.6,.5],[.51,.48]]);
 const profile=terrain.getByRole("img",{name:"Perfil altimétrico A para B"});
 await profile.waitFor({state:"visible"});
 await terrain.getByRole("button",{name:"Adicionar perfil ao projecto SIG"}).click();
 await page.locator('.gm-layer-row[data-layer-name="Perfil A→B · Terreno 3D"]').waitFor();
 assert.equal(await page.locator(".gm-layer-row").count(),layerCountBefore+1,
   "Profile must be added to the same GIS layer catalog");
 const terrainCsvPromise=page.waitForEvent("download");
 await terrain.getByRole("button",{name:"CSV",exact:true}).click();
 await (await terrainCsvPromise).saveAs("workbench-browser-artifacts/terrain-native-profile.csv");
 await terrain.getByLabel("Equidistância das curvas de nível").fill("20");
 await terrain.getByRole("button",{name:"Gerar curvas de nível (pré-visualização)"}).click();
 await terrain.getByRole("button",{name:"Adicionar curvas ao catálogo SIG"}).click();
 await page.locator('.gm-layer-row[data-layer-name="Curvas de nível · Terreno 3D"]').waitFor();
 assert.equal(await page.locator(".gm-layer-row").count(),layerCountBefore+2);
 // Import a geological vector into the SAME project and automatically drape it.
 await terrain.getByRole("button",{name:"Adicionar camada"}).click();
 const polygon={type:"FeatureCollection",features:[{type:"Feature",
   properties:{litologia:"Basalto",formacao:"Unidade de teste"},
   geometry:{type:"Polygon",coordinates:[[
     [32,-27],[34,-27],[34,-24],[32,-24],[32,-27]
   ]]}}]};
 await terrain.getByLabel("Carregar camada GeoJSON ou GeoTIFF para o terreno 3D")
   .setInputFiles({name:"geologia_teste.geojson",mimeType:"application/geo+json",
     buffer:Buffer.from(JSON.stringify(polygon))});
 const overlay=terrain.getByTestId("geomoz-3d-layer-row");
 await overlay.waitFor({state:"visible"});
 assert.match(await overlay.innerText(),/geologia_teste\.geojson/);
 await terrain.getByTestId("geomoz-terrain-tab-symbols").click();
 await terrain.getByLabel("Tipo de simbologia 3D").selectOption("categorized");
 await terrain.getByLabel("Cor da classe Basalto").fill("#e11d48");
 await terrain.getByLabel("Transparência da camada 3D").fill("45");
 assert.equal(await terrain.getByLabel("Transparência da camada 3D").inputValue(),"45");
 await terrain.getByLabel("Mostrar classe Basalto").uncheck();
 await terrain.getByLabel("Mostrar classe Basalto").check();
 // Clicking the same georeferenced mesh queries overlapping vector attributes.
 await page.mouse.click(view.x+view.width*.49,view.y+view.height*.50);
 await terrain.getByTestId("geomoz-3d-identify").waitFor({state:"visible"});
 assert.match(await terrain.getByTestId("geomoz-3d-identify").innerText(),/Basalto/);
 await terrain.getByTestId("geomoz-terrain-tab-export").click();
 const overlayGLB=page.waitForEvent("download");
 await terrain.getByTestId("geomoz-terrain-export-glb").click();
 const drapedFile="workbench-browser-artifacts/terrain-geology-draped.glb";
 await (await overlayGLB).saveAs(drapedFile);
 const textured=await readFile(drapedFile);
 const jsonLength=textured.readUInt32LE(12);
 const gltfJson=JSON.parse(textured.subarray(20,20+jsonLength).toString("utf8").trim());
 assert.equal(gltfJson.images?.[0]?.mimeType,"image/png",
   "GLB must contain georeferenced overlay texture");
 assert.equal(gltfJson.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index,0);
 assert.equal(await page.locator(".gm-layer-row").count(),layerCountBefore+3,
   "Direct 3D GeoJSON imports must remain in the same original GIS project");
 console.log("Real geologic polygon draped/clipped, styled categorically, queried and GLB-textured.");

 await terrain.getByRole("button",{name:"Voltar ao mapa GIS"}).click();
 await terrain.waitFor({state:"hidden"});
 assert.equal(await realDem.count(),1,"Closing native 3D must retain the original raster");
 console.log("Real DEM rendered natively; A/B selected on WebGL surface; profile and contours stored in original GIS project.");

 console.log("Real browser DEM slope, hillshade, reprojection and polygon cutline outputs validated.");
};
