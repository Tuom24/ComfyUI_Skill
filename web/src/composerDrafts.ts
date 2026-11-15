const key=(taskId?:string)=>`comfypilot-composer:${taskId??'new'}`;
export function readComposerDraft(taskId?:string):string|null { try{return sessionStorage.getItem(key(taskId));}catch{return null;} }
export function saveComposerDraft(taskId:string|undefined,text:string):boolean { try{sessionStorage.setItem(key(taskId),text);return true;}catch{return false;} }
export function clearComposerDraft(taskId?:string) { try{sessionStorage.removeItem(key(taskId));}catch{} }
export function preserveVisibleComposer():boolean {
  const field=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="发送创作需求"]');
  if(!field?.value)return true;
  const route=window.location.hash.match(/^#\/assistant(?:\/([^/?]+))?/);
  return saveComposerDraft(route?.[1],field.value);
}
