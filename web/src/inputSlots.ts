import type { InputBinding, InputSlot, Plan, Revision, Step } from './domain';
import type { WorkflowDefinition } from './catalog';

/** Provisional semantic slots for local previews; runtime node mappings come from the service. */
export function draftSlots(definition: WorkflowDefinition | undefined, step: Step, revision: Revision): InputSlot[] {
  if(definition?.modality.startsWith('t')||!definition&&!revision.assets.length&&!step.dependsOn.length)return [];
  const slot=(id:string,label:string,kind:InputSlot['kind'],roles:InputSlot['roles']):InputSlot=>({id,label,kind,roles,required:true});
  if(definition?.operation==='Generation/keyframe_interpolation')return [slot('start_frame','起始画面','image',['start_frame']),slot('end_frame','结束画面','image',['end_frame'])];
  const inputs=definition?.description.split('输入：')[1]?.split('输出：')[0]??'';
  const video=definition?.modality==='v2v'||!definition&&revision.assets.some(a=>a.kind==='video'&&a.role==='video');
  const reference=definition?.operation==='Style_Editing/style_cloning'||!definition&&step.workflow==='W15a0d5db12';
  const slots=[video?slot('source_video','待处理视频','video',['video']):reference?slot('style_reference','风格参考图','image',['reference']):slot('source_image',step.dependsOn.length?'上一步画面':'待处理图片','image',['source','start_frame'])];
  if(video&&/两个视频|两段视频|两路视频/.test(inputs)){slots[0].label='第一个视频片段';slots.push(slot('second_video','第二个视频片段','video',['video']));}
  if(/蒙版|遮罩/.test(inputs)||!definition&&revision.assets.some(a=>a.role==='mask'))slots.push(slot('mask','对应的区域遮罩','mask',['mask']));
  return slots;
}

export function bindProvisionalSlots(step: Step, revision: Revision, steps: Step[], explicit?: Record<string,InputBinding>) {
  const bindings:Record<string,InputBinding>={};
  const issues:Plan['blockers']=[];
  const used=new Set<string>();
  for(const slot of step.inputSlots??[]) {
    const candidates:InputBinding[]=[...revision.assets.filter(a=>step.inputs.includes(a.id)&&slot.roles.includes(a.role)&&(slot.kind==='mask'?a.role==='mask':a.kind===slot.kind)).map(a=>({kind:'asset' as const,assetId:a.id})),...steps.filter(s=>step.dependsOn.includes(s.id)&&step.inputs.includes(s.id)&&slot.kind!=='mask'&&s.output===slot.kind).map(s=>({kind:'stage' as const,stageId:s.id}))];
    const identity=(b:InputBinding)=>b.kind==='asset'?b.assetId:b.stageId;
    const selected=explicit?.[slot.id]??(candidates.length===1&&!used.has(identity(candidates[0]))?candidates[0]:undefined);
    if(selected) {
      if(!candidates.some(b=>b.kind===selected.kind&&identity(b)===identity(selected))||used.has(identity(selected)))issues.push({code:'invalid_slot_binding',message:`「${slot.label}」需要不同且类型、用途相符的输入。`});
      else {bindings[slot.id]=selected;used.add(identity(selected));}
    } else if(slot.required)issues.push({code:'missing_slot_binding',message:candidates.length>1?`请为「${slot.label}」明确选择一份素材。`:`请补充并绑定「${slot.label}」。`});
  }
  return {bindings,issues};
}
