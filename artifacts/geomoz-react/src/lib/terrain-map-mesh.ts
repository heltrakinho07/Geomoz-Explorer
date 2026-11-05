/**
 * Geo-referenced DEM mesh drawn inside MapLibre's 3D map and global terrain.
 * Unlike raster-dem replacement, outside cells are never flattened: NoData
 * triangles are absent, while the world terrain remains underneath.
 */
import * as maplibregl from "maplibre-gl";
import proj4 from "proj4";
import type { TerrainMeshData, TerrainVisualStyle } from "@/lib/terrain-webgl";
import { terrainProjection, validTerrainGeography } from "@/lib/terrain-map-geo";

export const LOCAL_MODEL_ID = "geomoz-local-dem-3d-surface";
export interface ModelAppearance {
  exaggeration: number;
  offsetMeters: number;
  opacity: number;
  style: TerrainVisualStyle;
  vectors: string | null;
  raster: string | null;
  rasterOpacity: number;
  visible: boolean;
}
export interface TerrainMapMesh extends maplibregl.CustomLayerInterface {
  update(appearance: ModelAppearance): void;
}

const VS = [
  "#version 300 es",
  "precision highp float;",
  "layout(location=0) in vec3 a_xyz;",
  "layout(location=1) in vec2 a_uv;",
  "layout(location=2) in vec2 a_visual;",
  "uniform mat4 u_matrix;",
  "out vec2 v_uv; out float v_height; out float v_shade;",
  "void main(){ gl_Position=u_matrix*vec4(a_xyz,1.0);",
  "v_uv=a_uv; v_height=a_visual.x; v_shade=a_visual.y; }"
].join("\n");
const FS = [
  "#version 300 es",
  "precision highp float;",
  "in vec2 v_uv; in float v_height; in float v_shade;",
  "uniform float u_opacity; uniform float u_raster_opacity;",
  "uniform bool u_gray; uniform bool u_vectors; uniform bool u_raster;",
  "uniform sampler2D u_vector_texture; uniform sampler2D u_raster_texture;",
  "out vec4 colour;",
  "void main(){",
  "vec3 base;",
  "if(u_gray){base=vec3(0.24+0.70*v_height);}",
  "else if(v_height<0.30){base=mix(vec3(.12,.36,.36),vec3(.27,.60,.37),v_height/.30);}",
  "else if(v_height<0.68){base=mix(vec3(.27,.60,.37),vec3(.76,.63,.35),(v_height-.30)/.38);}",
  "else{base=mix(vec3(.76,.63,.35),vec3(.96,.96,.90),(v_height-.68)/.32);}",
  "base*=mix(.58,1.05,v_shade);",
  "if(u_raster){vec4 r=texture(u_raster_texture,v_uv);",
  "base=mix(base,r.rgb,r.a*u_raster_opacity);}",
  "if(u_vectors){vec4 v=texture(u_vector_texture,v_uv);base=mix(base,v.rgb,v.a);}",
  "colour=vec4(base,u_opacity);",
  "}"
].join("\n");

function shader(gl:WebGL2RenderingContext,type:number,source:string):WebGLShader{
  const s=gl.createShader(type);if(!s)throw Error("Sem shader WebGL.");
  gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    const err=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error("Shader DEM: "+err);
  }
  return s;
}

export function modelVertices(terrain:TerrainMeshData,exaggeration:number,offsetMeters:number){
  if(!validTerrainGeography(terrain))throw Error("O DEM não possui georreferenciação válida.");
  // Defines the DEM's UTM projection before geographic conversion.
  terrainProjection(terrain);
  const {width,height,heights}=terrain;
  const [left,bottom,right,top]=terrain.boundsMeters;
  const vertices=new Float32Array(width*height*7);
  const valid=new Uint8Array(width*height);
  const delta=Math.max(1,terrain.maxElevation-terrain.minElevation);
  const dx=(right-left)/(width-1),dy=(top-bottom)/(height-1);
  const get=(row:number,col:number,fallback:number)=>{
    const v=heights[Math.max(0,Math.min(height-1,row))*width+Math.max(0,Math.min(width-1,col))];
    return typeof v==="number"&&Number.isFinite(v)?v:fallback;
  };
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const index=row*width+col,value=heights[index];
    if(typeof value!=="number"||!Number.isFinite(value))continue;
    const [lon,lat]=proj4(terrain.crs,"EPSG:4326",[left+col*dx,top-row*dy]);
    if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
    const displayHeight=terrain.meanElevation+(value-terrain.meanElevation)*exaggeration+offsetMeters;
    const xyz=maplibregl.MercatorCoordinate.fromLngLat([lon,lat],displayHeight);
    const slopeX=(get(row,col+1,value)-get(row,col-1,value))/(2*dx);
    const slopeY=(get(row-1,col,value)-get(row+1,col,value))/(2*dy);
    const light=Math.max(.25,Math.min(1,.77+(-slopeX*.55+slopeY*.4)*exaggeration));
    const p=index*7;
    vertices.set([xyz.x,xyz.y,xyz.z,col/(width-1),1-row/(height-1),
      (value-terrain.minElevation)/delta,light],p);
    valid[index]=1;
  }
  const triangles:number[]=[];
  for(let row=0;row<height-1;row++)for(let col=0;col<width-1;col++){
    const a=row*width+col,b=a+1,c=a+width,d=c+1;
    if(valid[a]&&valid[c]&&valid[b])triangles.push(a,c,b);
    if(valid[b]&&valid[c]&&valid[d])triangles.push(b,c,d);
  }
  if(!triangles.length)throw Error("O DEM não possui triângulos válidos para a sobreposição.");
  return {vertices,indices:new Uint32Array(triangles)};
}

export function createTerrainMapMesh(terrain:TerrainMeshData,initial:ModelAppearance):TerrainMapMesh{
  let props=initial;
  let map:maplibregl.Map|null=null,gl:WebGL2RenderingContext|null=null;
  let program:WebGLProgram|null=null,vao:WebGLVertexArrayObject|null=null;
  let vbo:WebGLBuffer|null=null,ebo:WebGLBuffer|null=null;
  let count=0,disposed=false,generation=0;
  const textures:(WebGLTexture|null)[]=[null,null];
  const ready=[false,false];
  const upload=()=>{
    if(!gl||!vbo||!ebo)return;
    const mesh=modelVertices(terrain,props.exaggeration,props.offsetMeters);
    gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    count=mesh.indices.length;
  };
  const load=(url:string|null,slot:number,token:number)=>{
    ready[slot]=false;
    if(!url||!gl||!textures[slot])return;
    const img=new Image();
    img.onload=()=>{
      if(disposed||generation!==token||!gl||!textures[slot])return;
      gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,textures[slot]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);
      ready[slot]=true;map?.triggerRepaint();
    };
    img.onerror=()=>{if(generation===token)ready[slot]=false;};
    img.src=url;
  };
  const updateTextures=()=>{
    const token=++generation;
    load(props.vectors,0,token);load(props.raster,1,token);
  };
  return {
    id:LOCAL_MODEL_ID,type:"custom",renderingMode:"3d",
    onAdd(instance,context){
      map=instance;gl=context;disposed=false;
      const vs=shader(gl,gl.VERTEX_SHADER,VS),fs=shader(gl,gl.FRAGMENT_SHADER,FS);
      program=gl.createProgram();if(!program)throw Error("GPU indisponível para o DEM.");
      gl.attachShader(program,vs);gl.attachShader(program,fs);
      gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))
        throw Error("Falha WebGL: "+gl.getProgramInfoLog(program));
      vao=gl.createVertexArray();vbo=gl.createBuffer();ebo=gl.createBuffer();
      if(!vao||!vbo||!ebo)throw Error("Memória GPU insuficiente.");
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,28,12);
      gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,28,20);
      gl.bindVertexArray(null);
      textures[0]=gl.createTexture();textures[1]=gl.createTexture();
      upload();updateTextures();
    },
    render(context,args){
      if(!program||!vao||!count||!props.visible)return;
      context.useProgram(program);
      context.uniformMatrix4fv(context.getUniformLocation(program,"u_matrix"),false,args.defaultProjectionData.mainMatrix);
      context.uniform1f(context.getUniformLocation(program,"u_opacity"),props.opacity);
      context.uniform1f(context.getUniformLocation(program,"u_raster_opacity"),props.rasterOpacity);
      context.uniform1i(context.getUniformLocation(program,"u_gray"),props.style==="grayscale"?1:0);
      context.uniform1i(context.getUniformLocation(program,"u_vectors"),ready[0]?1:0);
      context.uniform1i(context.getUniformLocation(program,"u_raster"),ready[1]?1:0);
      for(let k=0;k<2;k++){
        context.activeTexture(context.TEXTURE0+k);
        context.bindTexture(context.TEXTURE_2D,textures[k]);
      }
      context.uniform1i(context.getUniformLocation(program,"u_vector_texture"),0);
      context.uniform1i(context.getUniformLocation(program,"u_raster_texture"),1);
      context.enable(context.DEPTH_TEST);context.enable(context.BLEND);
      context.blendFunc(context.SRC_ALPHA,context.ONE_MINUS_SRC_ALPHA);
      context.depthMask(false);
      context.bindVertexArray(vao);
      context.drawElements(context.TRIANGLES,count,context.UNSIGNED_INT,0);
      context.bindVertexArray(null);context.depthMask(true);context.disable(context.BLEND);
      context.activeTexture(context.TEXTURE0);
    },
    onRemove(_map,context){
      disposed=true;++generation;
      if(vao)context.deleteVertexArray(vao);
      if(vbo)context.deleteBuffer(vbo);
      if(ebo)context.deleteBuffer(ebo);
      for(const tex of textures)if(tex)context.deleteTexture(tex);
      if(program)context.deleteProgram(program);
      textures[0]=null;textures[1]=null;program=null;vao=null;vbo=null;ebo=null;
      gl=null;map=null;count=0;
    },
    update(next){
      const recalc=next.exaggeration!==props.exaggeration||next.offsetMeters!==props.offsetMeters;
      const changed=next.vectors!==props.vectors||next.raster!==props.raster;
      props=next;
      if(recalc)upload();
      if(changed)updateTextures();
      map?.triggerRepaint();
    }
  };
}
