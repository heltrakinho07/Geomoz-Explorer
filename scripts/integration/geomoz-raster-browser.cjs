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
 // A sobreposição georreferenciada deve existir na própria cena MapLibre.
 await terrain.getByTestId("terrain-view-map").waitFor({state:"visible",timeout:25000});
 await terrain.getByTestId("geomoz-georeferenced-model-map").waitFor({state:"visible",timeout:25000});
 assert.equal(await terrain.getByLabel("Sobrepor modelo 3D").isChecked(),true);
 await terrain.getByTestId("terrain-view-model").click();
 const canvas=terrain.getByTestId("geomoz-native-terrain-canvas");
 await canvas.waitFor({state:"visible",timeout:25000});
 await page.waitForFunction(()=>{
   const c=document.querySelector('[data-testid="geomoz-native-terrain-canvas"]');
   return c instanceof HTMLCanvasElement&&c.width>50&&c.height>50;
 },{timeout:12000});
 await terrain.getByTestId("terrain-tab-export").click();
 // Allow React to commit the newly selected Export tab before checking its metadata.
 await terrain.getByText("EPSG:4326 → EPSG:32736",{exact:false}).waitFor({state:"visible",timeout:15000});

 // The upstream Terrain Studio feature set must survive localization merges.
 await terrain.locator(".gm-terrain-display-options summary").click();
 const lod=terrain.getByLabel("Detalhe do terreno 3D");
 await lod.selectOption("low");
 await lod.selectOption("medium");
 await lod.selectOption("auto");
 await terrain.getByTestId("terrain-tab-export").click();
 const binaryDownload=page.waitForEvent("download");
 await terrain.getByTestId("geomoz-terrain-export-glb").click();
 const glbFile="workbench-browser-artifacts/terrain-native-manica.glb";
 await (await binaryDownload).saveAs(glbFile);
 const glb=await readFile(glbFile);
 assert.equal(glb.toString("ascii",0,4),"glTF","Export must contain a real glTF 2.0 GLB header");
 assert.equal(glb.readUInt32LE(4),2,"GLB export must be version 2");
 assert.equal(glb.readUInt32LE(8),glb.byteLength,"GLB binary length must match the header");

 assert.equal(await page.locator(".gm-layer-row").count(),layerCountBefore,
   "Opening DEM 3D must preserve the same GIS layers");

 // Test fully native 3D layer manager with a geological GeoJSON overlay.
 await terrain.getByTestId("terrain-tab-layers").click();
 const overlayGeoJSON={type:"FeatureCollection",features:[
   {type:"Feature",properties:{lito:"Arenito"},geometry:{type:"Polygon",coordinates:[
     [[29,-27],[42,-27],[42,-9],[29,-9],[29,-27]]]}}
 ]};
 await terrain.getByLabel("Importar GeoJSON para terreno 3D").setInputFiles({
   name:"geologia_controlo.geojson",mimeType:"application/geo+json",
   buffer:Buffer.from(JSON.stringify(overlayGeoJSON))
 });
 await terrain.getByText("geologia_controlo.geojson").waitFor();
 // Classified thematic GeoTIFF: actual georeferencing, clipping and legend.
 const thematicValues=Uint8Array.from({length:256},(_,i)=>i%2?1:2);
 const thematic=Buffer.from(writeArrayBuffer(thematicValues,{
   width:16,height:16,ModelPixelScale:[30,30,0],
   ModelTiepoint:[0,0,0,500000,7200000,0],
   GTModelTypeGeoKey:1,GTRasterTypeGeoKey:1,ProjectedCSTypeGeoKey:32736
 }));
 // Verify the fixture really carries georeferencing under GeoTIFF.js v3.
 // A direct fileDirectory.ModelPixelScale lookup is not valid in v3 and
 // previously caused a false "rotated raster" error for this valid file.
 const thematicTiff=await fromArrayBuffer(thematic.buffer.slice(
   thematic.byteOffset,thematic.byteOffset+thematic.byteLength
 ));
 try {
   const image=await thematicTiff.getImage();
   const meta=image.fileDirectory;
   const scale=typeof meta.getValue==="function"
     ?meta.getValue("ModelPixelScale"):meta.ModelPixelScale;
   const tiepoint=typeof meta.getValue==="function"
     ?meta.getValue("ModelTiepoint"):meta.ModelTiepoint;
   assert.ok(scale&&tiepoint,"Test fixture must be a georeferenced north-up GeoTIFF");
   assert.deepEqual([...image.getBoundingBox()].map(Math.round),
     [500000,7199520,500480,7200000],
     "Fixture extent must be expressed in metres in UTM 36S");
 } finally {await thematicTiff.close();}
 // Delay this one local file stream so the UI's Cancel action is exercised
 // while bytes are actually being read (no large or external test fixture).
 await page.evaluate(()=>{
   const original=File.prototype.stream;
   window.__undoGeoMozFileStream=()=>{File.prototype.stream=original;};
   File.prototype.stream=function(...args){
     const base=original.apply(this,args);
     if(this.name!=="cancelar_solo.tif")return base;
     const reader=base.getReader();
     return new ReadableStream({
       async pull(controller){
         await new Promise(resolve=>setTimeout(resolve,800));
         const {done,value}=await reader.read();
         if(done)controller.close();else controller.enqueue(value);
       },
       cancel(reason){return reader.cancel(reason);}
     });
   };
 });
 await terrain.getByLabel("Importar GeoTIFF temático").setInputFiles({
   name:"cancelar_solo.tif",mimeType:"image/tiff",buffer:thematic
 });
 const cancelRaster=terrain.getByTestId("geomoz-terrain-raster-cancel");
 await cancelRaster.waitFor({state:"visible",timeout:8000});
 assert.equal(await terrain.getByTestId("geomoz-terrain-raster-progress").count(),1,
   "Raster loading should show an accessible progress panel");
 await cancelRaster.click();
 await terrain.getByText("Importação do raster cancelada.",{exact:false}).waitFor();
 await terrain.getByTestId("geomoz-terrain-raster-progress").waitFor({state:"hidden"});
 assert.equal(await terrain.locator(".gm-terrain-layer-raster").count(),0,
   "Cancelled import must not replace an existing raster or add a new one");
 assert.equal(await terrain.getByTestId("geomoz-native-terrain-canvas").count(),1,
   "Cancelling a thematic import must preserve the existing 3D DEM");
 await page.evaluate(()=>window.__undoGeoMozFileStream?.());
 // A valid import must still work after cancellation of the previous request.
 await terrain.getByLabel("Importar GeoTIFF temático").setInputFiles({
   name:"solo_classes.tif",mimeType:"image/tiff",buffer:thematic
 });
 // Preserve failure details from a real unsuccessful georeferenced raster import.
 await terrain.getByText("solo_classes.tif").waitFor({timeout:25000}).catch(async cause=>{
   const message=await terrain.locator(".gm-terrain-workspace-error").allInnerTexts();
   const inline=await terrain.locator(".gm-terrain-layer-error").allInnerTexts();
   throw new Error("Raster thematic import failed: "+[...message,...inline].join(" | ")+
     "; original: "+String(cause));
 });
 assert.match(await terrain.innerText(),/Raster categorizado/);
 await terrain.getByText("Classes identificadas (2)").waitFor();
 await terrain.getByText("Textura 1 (1)",{exact:true}).waitFor();
 await terrain.getByText("Textura 2 (2)",{exact:true}).waitFor();
 assert.equal(await terrain.locator(".gm-terrain-layer-error:visible").count(),0,
   "A valid georeferenced thematic raster must not leave an import error");
 await terrain.getByLabel("Transparência do raster").evaluate((el)=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
   setter.call(el,"35");el.dispatchEvent(new Event("input",{bubbles:true}));
   el.dispatchEvent(new Event("change",{bubbles:true}));
 });
 assert.equal(await terrain.getByLabel("Transparência do raster").inputValue(),"35");
 await terrain.getByTestId("terrain-tab-style").click();
 await terrain.getByLabel("Modo de simbologia").selectOption("categorized");
 await terrain.getByLabel("Campo para categorização").selectOption("lito");
 await terrain.getByLabel("Cor da categoria Arenito").fill("#aa7733");
 await terrain.getByLabel("Transparência da camada no terreno").evaluate((el)=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
   setter.call(el,"45");el.dispatchEvent(new Event("input",{bubbles:true}));
   el.dispatchEvent(new Event("change",{bubbles:true}));
 });
 assert.equal(await terrain.getByLabel("Transparência da camada no terreno").inputValue(),"45");
 assert.equal(await canvas.count(),1,"Overlay symbology must not remove terrain canvas");
 await terrain.getByTestId("terrain-view-map").click();
 await terrain.getByTestId("geomoz-georeferenced-model-map").waitFor({state:"visible"});
 await terrain.getByTestId("terrain-view-model").click();

 // Shared language preferences still translate the DEM selector and analysis.
 await terrain.getByTestId("terrain-tab-analysis").click();
 for(const {code,science,source} of [
   {code:"en",science:"Scientific DEM analysis",source:"Project DEM"},
   {code:"es",science:"Análisis científico del MDE",source:"MDE del proyecto"},
   {code:"fr",science:"Analyse scientifique du MNT",source:"MNT du projet"},
   {code:"pt",science:"Análise científica do DEM",source:"DEM do projecto"},
 ]) {
   const accepted=await page.evaluate(code=>window.GeoMozPreferences?.setLanguage(code),code);
   assert.equal(accepted,true,"Language preference must accept "+code);
   await page.waitForFunction(({code,science,source})=>{
     const root=document.querySelector('[data-testid="geomoz-workbench-terrain"]');
     return document.documentElement.lang===code &&
       root?.querySelector(".gm-terrain-tab-content h3")?.textContent===science &&
       root?.querySelector(".gm-terrain-workspace-selector span")?.textContent===source;
   },{code,science,source},{timeout:12000});
   assert.equal(await canvas.count(),1,"Switching language must preserve the DEM");
 }
 console.log("3D GeoJSON overlay, categorized geology symbology, transparency and languages verified.");
 
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
 await terrain.getByRole("button",{name:"Voltar ao mapa GIS"}).click();
 await terrain.waitFor({state:"hidden"});
 assert.equal(await realDem.count(),1,"Closing native 3D must retain the original raster");
 console.log("Real DEM rendered natively; A/B selected on WebGL surface; profile and contours stored in original GIS project.");

 console.log("Real browser DEM slope, hillshade, reprojection and polygon cutline outputs validated.");
};
