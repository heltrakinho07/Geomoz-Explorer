/**
 * The engine's latest-value proxy supports reads/calls but cannot be enumerated.
 * PluginManager scopes an App API with object spread. Passing a deep proxy
 * loses getMap/removeMapControl and leaves an editor mounted after teardown.
 * Keep the memoized App API intact; other callbacks retain their live view.
 */
export function preserveCommandApi<T extends {appApi:object}>(view:T,getLatest:()=>T):T {
  return new Proxy(view,{
    get(target,key,receiver){
      return key==="appApi"?getLatest().appApi:Reflect.get(target,key,receiver);
    },
  });
}
