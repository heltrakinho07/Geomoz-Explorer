const fs=require("node:fs"),path=require("node:path"),{createRequire}=require("node:module");
const requireLocal=createRequire(path.resolve("artifacts/geomoz-react/package.json"));
for(const name of ["@maplibre/mlt","cesium"]) {
  const entry=requireLocal.resolve(name);
  console.log("DEPENDENCY",name,entry);
  let dir=path.dirname(entry);
  while(!fs.existsSync(path.join(dir,"package.json")))dir=path.dirname(dir);
  console.log(fs.readFileSync(path.join(dir,"package.json"),"utf8"));
  if(name==="@maplibre/mlt"){
    function scan(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){
      const p=path.join(dir,f.name);
      if(f.isDirectory()&&f.name!=="node_modules")scan(p);
      else if(f.name.endsWith(".d.ts")&&/index|[Ff]eature[Tt]able|[Dd]ecoder|[Vv]ector[Tt]ile/.test(f.name))console.log("DECODER_TYPE",p,fs.readFileSync(p,"utf8").slice(0,18000));
    }}scan(dir);
  }
}
