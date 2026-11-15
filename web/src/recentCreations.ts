import type { Creation } from './domain';

/** A creation has one identity; its latest view does not create another history entry. */
export function uniqueCreations(tasks: Creation[]) {
  const records=new Map<string,Creation>();
  for(const task of [...tasks].sort((a,b)=>b.updatedAt-a.updatedAt))if(!records.has(task.id))records.set(task.id,task);
  return [...records.values()];
}
export function recentCreations(tasks: Creation[], limit=4, view?:'assistant'|'workbench') {
  return uniqueCreations(tasks).filter(t=>!t.archived&&(!view||(t.lastView??t.origin??'workbench')===view)).slice(0,limit);
}
