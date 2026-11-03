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

export interface TerrainRenderOptions {
  exaggeration: number;
  style: TerrainVisualStyle;
  textureUrl?: string | null;
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

const VERTEX_SOURCE = [
  "#version 300 es",
  "in vec3 aPosition;",
  "in vec3 aNormal;",
  "in float aAltitude;",
  "in vec2 aUv;",
  "uniform mat4 uViewProjection;",
  "out vec3 vNormal;",
  "out float vHeight;",
  "out vec2 vUv;",
  "void main() {",
  " vNormal=aNormal; vHeight=aAltitude; vUv=aUv;",
  " gl_Position=uViewProjection*vec4(aPosition,1.0);",
  "}"
].join("\n");

const FRAGMENT_SOURCE = [
  "#version 300 es",
  "precision highp float;",
  "in vec3 vNormal;",
  "in float vHeight;",
  "in vec2 vUv;",
  "uniform int uStyle;",
  "uniform sampler2D uTexture;",
  "out vec4 fragColor;",
  "vec3 relief(float h) {",
  " if(h<0.30) return mix(vec3(0.12,0.34,0.22),vec3(0.32,0.54,0.29),h/0.30);",
  " if(h<0.64) return mix(vec3(0.32,0.54,0.29),vec3(0.67,0.58,0.36),(h-0.30)/0.34);",
  " return mix(vec3(0.67,0.58,0.36),vec3(0.95,0.95,0.92),(h-0.64)/0.36);",
  "}",
  "void main() {",
  " float illumination=max(dot(normalize(vNormal),normalize(vec3(0.4,0.88,0.52))),0.0);",
  " vec4 imagery=texture(uTexture,vUv);",
  " vec3 base=uStyle==2 ? mix(relief(vHeight),imagery.rgb,imagery.a) :",
  "   uStyle==1 ? vec3(0.29+0.63*vHeight) : relief(vHeight);",
  " fragColor=vec4(base*(0.45+0.55*illumination),1.0);",
  "}"
].join("\n");

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
  const indices: number[]=[];
  for(let row=0;row<height-1;row++) for(let col=0;col<width-1;col++) {
    const a=row*width+col,b=a+1,c=a+width,d=c+1;
    if(isValid(a)&&isValid(b)&&isValid(c)) indices.push(a,b,c);
    if(isValid(b)&&isValid(d)&&isValid(c)) indices.push(b,d,c);
  }
  if(indices.length===0) throw new Error("O DEM não contém uma superfície contínua utilizável.");
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elementBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  const stride=9*4;
  for(const [name,sz,offset] of [
    ["aPosition",3,0],["aNormal",3,12],["aAltitude",1,24],["aUv",2,28]
  ] as [string,number,number][]) {
    const loc=gl.getAttribLocation(program,name);
    if(loc>=0) {gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,sz,gl.FLOAT,false,stride,offset);}
  }
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([150,170,140,255]));

  let destroyed=false, imageLoaded=false, frame=0;
  let yaw=0.72, pitch=0.90, distance=2.0;
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
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program,"uViewProjection"),false,matrix);
    gl.uniform1i(gl.getUniformLocation(program,"uStyle"),
      options.style==="imagery"&&imageLoaded ? 2 : options.style==="grayscale" ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program,"uTexture"),0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elementBuffer);
    gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
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
  let down: {x:number;y:number}|null=null;
  const pointerDown=(event: PointerEvent)=>{
    down={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove=(event: PointerEvent)=>{
    if(!down)return;
    yaw+=(event.clientX-down.x)*0.008;
    pitch=Math.min(1.48,Math.max(0.12,pitch+(event.clientY-down.y)*0.008));
    down={x:event.clientX,y:event.clientY};requestDraw();
  };
  const pointerUp=()=>{down=null;};
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
    destroyed=true; if(frame)cancelAnimationFrame(frame);resize.disconnect();
    image.onload=null;image.src="";
    canvas.removeEventListener("pointerdown",pointerDown);
    canvas.removeEventListener("pointermove",pointerMove);
    canvas.removeEventListener("pointerup",pointerUp);
    canvas.removeEventListener("pointercancel",pointerUp);
    canvas.removeEventListener("wheel",wheel);
    gl.deleteBuffer(buffer);gl.deleteBuffer(elementBuffer);gl.deleteTexture(texture);
    gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
  };
}
