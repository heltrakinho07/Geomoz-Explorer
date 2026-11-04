/** Lightweight, dependency-free WebGL2 DEM mesh. NoData triangles are omitted. */
export interface TerrainMeshData {
  name: string;
  width: number;
  height: number;
  heights: (number | null)[];
  bounds4326: number[];
  boundsMeters: number[];
  crs: string;
  sourceCrs: string;
  minElevation: number;
  maxElevation: number;
  meanElevation: number;
  validFraction: number;
  cellSizeMeters: number[];
  sourceWidth: number;
  sourceHeight: number;
}

export type TerrainVisualStyle = "hypsometric" | "grayscale" | "imagery";

export interface TerrainPick {
  xMeters: number;
  yMeters: number;
  elevationMeters: number;
}
export interface TerrainProfileOverlay {
  start: [number, number];
  end: [number, number];
}
export interface TerrainRenderOptions {
  exaggeration: number;
  style: TerrainVisualStyle;
  textureUrl?: string | null;
  /** Rendering-only LOD; scientific sample grid and coordinates never change. */
  detailLevel?: "auto" | "full" | "medium" | "low";
  /** Surface picking is active only when the user explicitly enables it. */
  pickEnabled?: boolean;
  onPick?: (point: TerrainPick) => void;
  /** Profile A→B is rendered just above the DEM, not behind raster pixels. */
  profileOverlay?: TerrainProfileOverlay | null;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Não foi possível criar o shader WebGL.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Falha ao compilar o shader 3D: " + log);
  }
  return shader;
}

function normalize(v: number[]): number[] {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return v.map(x => x / n);
}
function cross(a: number[], b: number[]): number[] {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function subtract(a: number[], b: number[]): number[] {
  return a.map((v,i) => v-b[i]);
}
function lookAt(eye: number[], target: number[]): Float32Array {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross([0,1,0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -x.reduce((s,v,i)=>s+v*eye[i],0),
    -y.reduce((s,v,i)=>s+v*eye[i],0),
    -z.reduce((s,v,i)=>s+v*eye[i],0),1
  ]);
}
function perspective(fov: number, aspect: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const near = 0.01, far = 100;
  return new Float32Array([
    f/aspect,0,0,0, 0,f,0,0,
    0,0,(far+near)/(near-far),-1,
    0,0,(2*far*near)/(near-far),0
  ]);
}
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for(let col=0;col<4;col++) for(let row=0;row<4;row++)
    for(let k=0;k<4;k++) o[col*4+row] += a[k*4+row]*b[col*4+k];
  return o;
}

/**
 * Build a lower-detail index buffer from the same DEM vertices.
 * For coarser cells, any hidden NoData inside the cell suppresses the whole
 * cell: an LOD NEVER invents terrain over missing source pixels.
 */
export function buildTerrainLodIndices(
  heights: readonly (number | null)[], width: number, height: number, stride: 1 | 2 | 4
): Uint16Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 2 || height < 2 || width * height > 65535 ||
      heights.length !== width * height) {
    throw new Error("Grelha de terreno inválida para LOD.");
  }
  const isValid = (i: number) => heights[i] !== null && Number.isFinite(heights[i]);
  const triangles: number[] = [];
  for(let r=0;r<height-1;r+=stride)for(let c=0;c<width-1;c+=stride) {
    const re=Math.min(height-1,r+stride),ce=Math.min(width-1,c+stride);
    const a=r*width+c,b=r*width+ce,d=re*width+c,e=re*width+ce;
    if (stride > 1) {
      let clean=true;
      for(let y=r;y<=re && clean;y++)for(let x=c;x<=ce;x++) {
        if(!isValid(y*width+x)){clean=false;break;}
      }
      if(!clean)continue;
    }
    if(isValid(a)&&isValid(b)&&isValid(d))triangles.push(a,b,d);
    if(isValid(b)&&isValid(e)&&isValid(d))triangles.push(b,e,d);
  }
  return new Uint16Array(triangles);
}

/**
 * CPU screen-space triangle pick against the EXACT vertices submitted to WebGL.
 * Selects the nearest visible triangle and perspective-correct interpolates
 * world coordinates; unlike map-plane ray casting this respects terrain relief.
 */
export function pickTerrainTriangle(
  vertices: Float32Array, indices: ArrayLike<number>, matrix: Float32Array,
  xPx: number, yPx: number, widthPx: number, heightPx: number
): [number, number, number] | null {
  if (widthPx<=0 || heightPx<=0 || !Number.isFinite(xPx) || !Number.isFinite(yPx)) return null;
  const count=vertices.length/9;
  const screen=new Float64Array(count*4);
  for(let i=0;i<count;i++){
    const v=i*9, x=vertices[v], y=vertices[v+1], z=vertices[v+2];
    const cx=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
    const cy=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
    const cz=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
    const cw=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
    screen[i*4]=cw>0?(cx/cw+1)*0.5*widthPx:NaN;
    screen[i*4+1]=cw>0?(1-cy/cw)*0.5*heightPx:NaN;
    screen[i*4+2]=cw>0?cz/cw:Infinity;
    screen[i*4+3]=cw;
  }
  let nearest=Infinity,found:[number,number,number]|null=null;
  for(let i=0;i<indices.length;i+=3){
    const ai=indices[i],bi=indices[i+1],ci=indices[i+2];
    const a=ai*4,b=bi*4,c=ci*4;
    const ax=screen[a],ay=screen[a+1],bx=screen[b],by=screen[b+1],cx=screen[c],cy=screen[c+1];
    if(![ax,ay,bx,by,cx,cy].every(Number.isFinite))continue;
    const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
    if(Math.abs(det)<1e-9)continue;
    const wa=((by-cy)*(xPx-cx)+(cx-bx)*(yPx-cy))/det;
    const wb=((cy-ay)*(xPx-cx)+(ax-cx)*(yPx-cy))/det;
    const wc=1-wa-wb;
    if(wa < -1e-5 || wb < -1e-5 || wc < -1e-5)continue;
    const depth=wa*screen[a+2]+wb*screen[b+2]+wc*screen[c+2];
    if(depth>=nearest || depth < -1 || depth > 1)continue;
    const pa=wa/screen[a+3],pb=wb/screen[b+3],pc=wc/screen[c+3];
    const total=pa+pb+pc;
    if(!Number.isFinite(total)||total<=0)continue;
    const o=ai*9,p=bi*9,q=ci*9;
    const interpolate=(axis:number)=>
      (pa*vertices[o+axis]+pb*vertices[p+axis]+pc*vertices[q+axis])/total;
    found=[interpolate(0),interpolate(1),interpolate(2)];
    nearest=depth;
  }
  return found;
}

const VERTEX_SOURCE = [
  "#version 300 es",
  "in vec3 aPosition;",
  "in vec3 aNormal;",
  "in float aAltitude;",
  "in vec2 aUv;",
  "uniform mat4 uViewProjection;",
  "uniform int uOverlay;",
  "out vec3 vNormal;",
  "out float vHeight;",
  "out vec2 vUv;",
  "void main() {",
  " vNormal=aNormal; vHeight=aAltitude; vUv=aUv;",
  " gl_Position=uViewProjection*vec4(aPosition,1.0);",
  " gl_PointSize=uOverlay==1 ? 12.0 : 1.0;",
  "}"
].join("\n");

const FRAGMENT_SOURCE = [
  "#version 300 es",
  "precision highp float;",
  "precision highp int;",
  "in vec3 vNormal;",
  "in float vHeight;",
  "in vec2 vUv;",
  "uniform int uStyle;",
  "uniform int uOverlay;",
  "uniform sampler2D uTexture;",
  "out vec4 fragColor;",
  "vec3 relief(float h) {",
  " if(h<0.30) return mix(vec3(0.12,0.34,0.22),vec3(0.32,0.54,0.29),h/0.30);",
  " if(h<0.64) return mix(vec3(0.32,0.54,0.29),vec3(0.67,0.58,0.36),(h-0.30)/0.34);",
  " return mix(vec3(0.67,0.58,0.36),vec3(0.95,0.95,0.92),(h-0.64)/0.36);",
  "}",
  "void main() {",
  " if(uOverlay==1) {fragColor=vec4(0.08,0.85,0.98,1.0);return;}",
  " float illumination=max(dot(normalize(vNormal),normalize(vec3(0.4,0.88,0.52))),0.0);",
  " vec4 imagery=texture(uTexture,vUv);",
  " vec3 base=(uStyle==2 || uStyle==3) ? mix(uStyle==3 ? vec3(0.29+0.63*vHeight) : relief(vHeight),imagery.rgb,imagery.a) :",
  "   uStyle==1 ? vec3(0.29+0.63*vHeight) : relief(vHeight);",
  " fragColor=vec4(base*(uStyle>=2 ? (0.75+0.25*illumination) : (0.45+0.55*illumination)),1.0);",
  "}"
].join("\n");

/** Preserve orbit camera per canvas across texture/legend/opacity changes. */
const cameraStates=new WeakMap<HTMLCanvasElement,{
  source:TerrainMeshData;yaw:number;pitch:number;distance:number
}>();

/** Return a cleanup function. All GL allocations and event handlers are reclaimed. */
export function createTerrainRenderer(
  canvas: HTMLCanvasElement,
  data: TerrainMeshData,
  options: TerrainRenderOptions
): () => void {
  const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error("Este navegador não disponibiliza WebGL2.");
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  if (!program) throw new Error("Não foi possível iniciar o motor gráfico.");
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Falha de ligação WebGL: "+gl.getProgramInfoLog(program));
  }
  const buffer = gl.createBuffer(), elementBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !elementBuffer || !texture) throw new Error("Sem memória GPU para a malha.");
  const [left,bottom,right,top] = data.boundsMeters;
  const extentX = right-left, extentZ = top-bottom;
  const extent = Math.max(extentX, extentZ, 1);
  const {width,height} = data;
  if (data.heights.length !== width*height || width > 255 || height > 255) {
    throw new Error("Grelha DEM inválida ou demasiado grande para o visualizador.");
  }
  const isValid = (index: number) => Number.isFinite(data.heights[index]);
  const elevation = (index: number) => data.heights[index] ?? data.minElevation;
  const normalizedHeight = Math.max(data.maxElevation-data.minElevation, 1);
  const spacingX = extentX/(width-1), spacingZ = extentZ/(height-1);
  const vertices = new Float32Array(width*height*9);
  for(let row=0;row<height;row++) {
    for(let col=0;col<width;col++) {
      const i=row*width+col, o=i*9;
      const c0=Math.max(col-1,0), c1=Math.min(col+1,width-1);
      const r0=Math.max(row-1,0), r1=Math.min(row+1,height-1);
      const sx=(elevation(row*width+c1)-elevation(row*width+c0))
        *options.exaggeration / Math.max((c1-c0)*spacingX,0.001);
      const sz=(elevation(r0*width+col)-elevation(r1*width+col))
        *options.exaggeration / Math.max((r1-r0)*spacingZ,0.001);
      const normal=normalize([-sx,1,-sz]);
      vertices[o]=(col/(width-1)-0.5)*extentX/extent;
      vertices[o+1]=(elevation(i)-data.minElevation)*options.exaggeration/extent;
      vertices[o+2]=(0.5-row/(height-1))*extentZ/extent;
      vertices[o+3]=normal[0];vertices[o+4]=normal[1];vertices[o+5]=normal[2];
      vertices[o+6]=(elevation(i)-data.minElevation)/normalizedHeight;
      vertices[o+7]=col/(width-1);vertices[o+8]=1-row/(height-1);
    }
  }
  const fullIndices = buildTerrainLodIndices(data.heights,width,height,1);
  if (fullIndices.length===0) throw new Error("O DEM não contém uma superfície contínua utilizável.");
  const levels: Record<"full" | "medium" | "low", { data: Uint16Array; buffer: WebGLBuffer }> = {
    full: {data: fullIndices, buffer: elementBuffer},
    medium: {data: buildTerrainLodIndices(data.heights,width,height,2), buffer: gl.createBuffer()!},
    low: {data: buildTerrainLodIndices(data.heights,width,height,4), buffer: gl.createBuffer()!}
  };
  if(!levels.medium.buffer || !levels.low.buffer) {
    throw new Error("Sem memória GPU para níveis de detalhe do DEM.");
  }
  let pickedIndices: Uint16Array=fullIndices;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
  for(const level of [levels.full,levels.medium,levels.low]) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,level.buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,level.data,gl.STATIC_DRAW);
  }
  const stride=9*4;
  const bindAttributes=(source:WebGLBuffer)=>{
    gl.bindBuffer(gl.ARRAY_BUFFER,source);
    for(const [name,sz,offset] of [
      ["aPosition",3,0],["aNormal",3,12],["aAltitude",1,24],["aUv",2,28]
    ] as [string,number,number][]) {
      const loc=gl.getAttribLocation(program,name);
      if(loc>=0) {gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,sz,gl.FLOAT,false,stride,offset);}
    }
  };
  bindAttributes(buffer);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([150,170,140,255]));

  // Add a georeferenced A→B profile overlay directly to the 3D renderer.
  // Only valid DEM samples are joined; NoData areas remain disconnected.
  const overlayLines:number[]=[];
  const overlayPoints:number[]=[];
  const overlaySample=(x:number,y:number):number[]|null=>{
    const u=(x-left)/extentX*(width-1);
    const v=(top-y)/extentZ*(height-1);
    if(u<0||v<0||u>width-1||v>height-1)return null;
    const x0=Math.floor(u),y0=Math.floor(v),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1);
    const a=y0*width+x0,b=y0*width+x1,c=y1*width+x0,d=y1*width+x1;
    if(![a,b,c,d].every(isValid))return null;
    const dx=u-x0,dy=v-y0;
    const z=(elevation(a)*(1-dx)+elevation(b)*dx)*(1-dy)+
      (elevation(c)*(1-dx)+elevation(d)*dx)*dy;
    return [(x-(left+right)/2)/extent, (z-data.minElevation)*options.exaggeration/extent+0.003,
      (y-(bottom+top)/2)/extent];
  };
  const overlayVertex=(xyz:number[])=>[xyz[0],xyz[1],xyz[2],0,1,0,1,0,0];
  if(options.profileOverlay){
    const start=options.profileOverlay.start,end=options.profileOverlay.end;
    let previous:number[]|null=null;
    for(let i=0;i<=128;i++){
      const t=i/128;
      const point=overlaySample(start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t);
      if(point&&previous)overlayLines.push(...overlayVertex(previous),...overlayVertex(point));
      previous=point;
    }
    for(const point of [start,end]){
      const vertex=overlaySample(...point);
      if(vertex)overlayPoints.push(...overlayVertex(vertex));
    }
  }
  const overlayLineBuffer=overlayLines.length?gl.createBuffer():null;
  const overlayPointBuffer=overlayPoints.length?gl.createBuffer():null;
  if(overlayLineBuffer){gl.bindBuffer(gl.ARRAY_BUFFER,overlayLineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(overlayLines),gl.STATIC_DRAW);}
  if(overlayPointBuffer){gl.bindBuffer(gl.ARRAY_BUFFER,overlayPointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(overlayPoints),gl.STATIC_DRAW);}
  let lastMatrix:Float32Array|null=null;

  let destroyed=false, imageLoaded=false, frame=0;
  // Rebuilding a GL texture for symbology MUST NOT reset the user's camera.
  const saved=cameraStates.get(canvas);
  let yaw=saved?.source===data?saved.yaw:0.72;
  let pitch=saved?.source===data?saved.pitch:0.90;
  let distance=saved?.source===data?saved.distance:2.0;
  const draw=()=>{
    if(destroyed)return;
    const rect=canvas.getBoundingClientRect();
    if(rect.width<1||rect.height<1)return;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(2,Math.round(rect.width*dpr)),h=Math.max(2,Math.round(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);
    gl.clearColor(0.055,0.105,0.17,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const targetY=((data.meanElevation-data.minElevation)*options.exaggeration)/extent;
    const eye=[
      Math.sin(yaw)*Math.cos(pitch)*distance,
      targetY+Math.sin(pitch)*distance,
      Math.cos(yaw)*Math.cos(pitch)*distance
    ];
    const matrix=multiply(perspective(Math.PI/4,w/h),lookAt(eye,[0,targetY,0]));
    lastMatrix=matrix;
    gl.useProgram(program);
    bindAttributes(buffer);
    gl.uniform1i(gl.getUniformLocation(program,"uOverlay"),0);
    gl.uniformMatrix4fv(gl.getUniformLocation(program,"uViewProjection"),false,matrix);
    gl.uniform1i(gl.getUniformLocation(program,"uStyle"),
      options.style==="imagery"&&imageLoaded ? 2 :
      options.style==="grayscale" ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program,"uTexture"),0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    const selectedDetail = options.detailLevel && options.detailLevel !== "auto"
      ? options.detailLevel : distance > 4.1 ? "low" : distance > 2.8 ? "medium" : "full";
    const requested = levels[selectedDetail];
    const visibleLod = requested.data.length ? requested : levels.full;
    pickedIndices = visibleLod.data;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,visibleLod.buffer);
    gl.drawElements(gl.TRIANGLES,visibleLod.data.length,gl.UNSIGNED_SHORT,0);
    if(overlayLineBuffer||overlayPointBuffer){
      gl.uniform1i(gl.getUniformLocation(program,"uOverlay"),1);
      if(overlayLineBuffer){bindAttributes(overlayLineBuffer);
        gl.drawArrays(gl.LINES,0,overlayLines.length/9);}
      if(overlayPointBuffer){bindAttributes(overlayPointBuffer);
        gl.drawArrays(gl.POINTS,0,overlayPoints.length/9);}
      gl.uniform1i(gl.getUniformLocation(program,"uOverlay"),0);
    }
  };
  const requestDraw=()=>{
    if(!frame&&!destroyed)frame=requestAnimationFrame(()=>{frame=0;draw();});
  };
  const image=new Image();
  if(options.textureUrl) {
    image.onload=()=>{if(destroyed)return;imageLoaded=true;gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      requestDraw();
    };
    image.src=options.textureUrl;
  }
  let down: {x:number;y:number;initialX:number;initialY:number;dragged:boolean}|null=null;
  const pointerDown=(event: PointerEvent)=>{
    down={x:event.clientX,y:event.clientY,initialX:event.clientX,initialY:event.clientY,dragged:false};canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove=(event: PointerEvent)=>{
    if(!down)return;
    if(Math.hypot(event.clientX-down.initialX,event.clientY-down.initialY)>5) down.dragged=true;
    yaw+=(event.clientX-down.x)*0.008;
    pitch=Math.min(1.48,Math.max(0.12,pitch+(event.clientY-down.y)*0.008));
    down.x=event.clientX;down.y=event.clientY;requestDraw();
  };
  const pointerUp=(event:PointerEvent)=>{
    const clicked=down&&!down.dragged&&options.pickEnabled&&!!options.onPick;
    down=null;
    if(!clicked||!lastMatrix)return;
    const rect=canvas.getBoundingClientRect();
    const hit=pickTerrainTriangle(vertices,pickedIndices,lastMatrix,
      event.clientX-rect.left,event.clientY-rect.top,rect.width,rect.height);
    if(!hit)return;
    options.onPick?.({
      xMeters:(left+right)/2+hit[0]*extent,
      yMeters:(bottom+top)/2+hit[2]*extent,
      elevationMeters:data.minElevation+hit[1]*extent/options.exaggeration
    });
  };
  const wheel=(event: WheelEvent)=>{
    event.preventDefault();distance=Math.min(7,Math.max(0.75,distance*Math.exp(event.deltaY*0.001)));
    requestDraw();
  };
  canvas.addEventListener("pointerdown",pointerDown);
  canvas.addEventListener("pointermove",pointerMove);
  canvas.addEventListener("pointerup",pointerUp);
  canvas.addEventListener("pointercancel",pointerUp);
  canvas.addEventListener("wheel",wheel,{passive:false});
  const resize=new ResizeObserver(requestDraw);resize.observe(canvas);
  draw();
  return ()=>{
    cameraStates.set(canvas,{source:data,yaw,pitch,distance});
    destroyed=true; if(frame)cancelAnimationFrame(frame);resize.disconnect();
    image.onload=null;image.src="";
    canvas.removeEventListener("pointerdown",pointerDown);
    canvas.removeEventListener("pointermove",pointerMove);
    canvas.removeEventListener("pointerup",pointerUp);
    canvas.removeEventListener("pointercancel",pointerUp);
    canvas.removeEventListener("wheel",wheel);
    gl.deleteBuffer(buffer);gl.deleteBuffer(elementBuffer);
    gl.deleteBuffer(levels.medium.buffer);gl.deleteBuffer(levels.low.buffer);
    if(overlayLineBuffer)gl.deleteBuffer(overlayLineBuffer);
    if(overlayPointBuffer)gl.deleteBuffer(overlayPointBuffer);
    gl.deleteTexture(texture);
    gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
  };
}
