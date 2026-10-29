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
  await page.locator('[data-task="data"]').click();
  const card=page.locator(".gm-ribbon-accordion").filter({has:page.locator("summary").filter({hasText:/^\s*Raster\s*$/})});
  if(await card.getAttribute("open")===null)await card.locator("summary").click();
  await card.locator('[data-command="proc.raster.'+id+'"]').click();
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
 console.log("Real browser DEM slope, hillshade, reprojection and polygon cutline outputs validated.");
};
