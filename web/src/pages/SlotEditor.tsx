import type { Creation, InputBinding, Step } from '../domain';
import { assetLabel } from '../resources';
import { usePilot } from '../store';

export function SlotEditor({ task, step }: { task: Creation; step: Step }) {
  const edit=task.draft.stageEdits?.[step.id];
  const bindings=edit?.slotBindings??step.slotBindings??{};
  function change(slotId:string,value:string) {
    const next={...bindings};
    if(!value)delete next[slotId];
    else {const kind=value.startsWith('asset:')?'asset':'stage';const id=value.slice(value.indexOf(':')+1);next[slotId]=kind==='asset'?{kind,assetId:id}:{kind,stageId:id};}
    const inputs=[...new Set(Object.values(next).map(b=>b.kind==='asset'?b.assetId:b.stageId))];
    usePilot.getState().updateStage(task.id,step.id,{slotBindings:next,inputs});
  }
  function valueOf(binding:InputBinding|undefined){return binding?binding.kind==='asset'?`asset:${binding.assetId}`:`stage:${binding.stageId}`:'';}
  return <div className="semantic-slot-editor"><p>{step.contractStatus==='validated'?'槽位已通过运行服务预检。':'按用途绑定；以下为语义槽位预设，具体节点映射待运行服务核验。'}</p>{step.inputSlots?.map(slot=><label key={slot.id}><span>{slot.label}{slot.required&&<small>必填</small>}</span><select aria-label={`${step.id} ${slot.label}`} value={valueOf(bindings[slot.id])} onChange={e=>change(slot.id,e.target.value)}><option value="">请选择对应输入</option>{task.draft.assets.filter(a=>slot.roles.includes(a.role)&&(slot.kind==='mask'?a.role==='mask':a.kind===slot.kind)).map(a=><option key={a.id} value={`asset:${a.id}`}>{assetLabel(a)}</option>)}{slot.kind!=='mask'&&step.dependsOn.map(id=><option key={id} value={`stage:${id}`}>上一步输出 · {id}</option>)}</select></label>)}</div>;
}
