import { UI_BUILD_ID } from './buildInfo.generated';

let availableBuild:string|null=null;
let pending:Promise<boolean>|undefined;
const listeners=new Set<()=>void>();
export const subscribeBuild=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const buildSnapshot=()=>availableBuild;
function update(value:string|null) {
  if(value===availableBuild)return;
  availableBuild=value;listeners.forEach(listener=>listener());
}

/** Independent of the development WebSocket: an outdated tab cannot mutate continuation state. */
export function ensureCurrentBuild():Promise<boolean> {
  if(pending)return pending;
  pending=(async()=>{
    try {
      const response=await fetch('/build-info.json',{cache:'no-store'});
      if(!response.ok)return availableBuild===null;
      const info:unknown=await response.json();
      if(!info||typeof info!=='object'||!('buildId'in info)||typeof info.buildId!=='string'||!/^ui-[a-f0-9]{16}$/.test(info.buildId))return availableBuild===null;
      update(info.buildId===UI_BUILD_ID?null:info.buildId);
      return availableBuild===null;
    } catch { return availableBuild===null; }
    finally { pending=undefined; }
  })();
  return pending;
}

export function watchBuild() {
  const check=()=>{void ensureCurrentBuild();};
  const visible=()=>{if(!document.hidden)check();};
  check();
  const timer=setInterval(visible,15000);
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',visible);
  return ()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',visible);};
}
