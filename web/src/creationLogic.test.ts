import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockAdapter, buildMockPlan } from './adapter';
import { classifyTurn, compileSpec, resolveTurn, roleFromInstruction } from './creationIntent';
import { canConfirm, fingerprint } from './domain';
import type { Artifact, Asset, Draft, Plan, Revision, Run } from './domain';
import { usePilot } from './store';
import { requestManifest } from './resources';
import { assertUploadBatch } from './media';

const image:Asset={id:'picture',name:'picture.png',kind:'image',role:'source',mime:'image/png',size:1};
const task=(id:string)=>usePilot.getState().tasks.find(t=>t.id===id)!;
const revision=(draft:Draft):Revision=>({...draft,id:'revision',number:1,createdAt:1,fingerprint:fingerprint(draft)});
async function planned(id:string){const pending=usePilot.getState().generatePlan(id);await vi.advanceTimersByTimeAsync(850);return pending;}
beforeEach(()=>{vi.useFakeTimers();usePilot.setState({tasks:[],libraryAssets:[],scenario:'normal',connected:true});});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

describe('latest structured intent and conversation',()=>{
  it('can change video back to image and remove obsolete video constraints',()=>{
    let draft:Draft={text:'海岸建筑',output:'image',assets:[image]};
    const video=resolveTurn(draft,'把它改成5秒横版视频');
    expect(video.output).toBe('video');expect(video.constraints.durationSeconds).toBe(5);expect(video.constraints.ratio).toBe('横版');
    draft={...draft,spec:video,text:compileSpec(video),output:video.output};
    const still=resolveTurn(draft,'不要视频，还是图片');
    expect(still.output).toBe('image');expect(still.constraints.durationSeconds).toBeUndefined();expect(still.constraints.fps).toBeUndefined();
    expect(compileSpec(still)).not.toContain('5 秒');expect(still.goal).toBe(video.goal);
  });
  it('does not confuse preserving image details with requesting image output',()=>{
    expect(resolveTurn({text:'海岸建筑',output:'image',assets:[image]},'生成5秒视频，保留图片细节').output).toBe('video');
  });
  it('updates constraints instead of appending conflicting historical requests',()=>{
    const first=resolveTurn({text:'海岸',output:'video',assets:[image]},'生成5秒16:9视频');
    const second=resolveTurn({text:compileSpec(first),output:'video',assets:[image],spec:first},'改成8秒9:16视频');
    expect(second.constraints.durationSeconds).toBe(8);expect(second.constraints.ratio).toBe('9:16');expect(second.instruction).toBe('改成8秒9:16视频');
    expect(compileSpec(second)).not.toContain('5秒16:9');
  });
  it('answers a question without changing the request or creating a revision',async()=>{
    const id=usePilot.getState().newTask({text:'海岸建筑'});const before=structuredClone(task(id).draft);
    await usePilot.getState().delegate(id,'为什么选择这个工作流？');
    expect(task(id).draft).toEqual(before);expect(task(id).revisions).toHaveLength(0);expect(task(id).runs).toHaveLength(0);
    expect(task(id).messages[0].kind).toBe('question');
  });
  it('supports review before execution as an explicit per-turn choice',async()=>{
    const id=usePilot.getState().newTask({},'assistant');const pending=usePilot.getState().delegate(id,'生成海岸建筑图片','review');
    await vi.advanceTimersByTimeAsync(850);await pending;
    expect(task(id).plans).toHaveLength(1);expect(task(id).runs).toHaveLength(0);
    expect(usePilot.getState().confirmRun(id,'assistant',task(id).plans[0].id)).toBeTruthy();
  });
  it('keeps style reference distinct from editable source and leaves ambiguous roles undecided',()=>{
    expect(roleFromInstruction({...image,role:'unassigned'},'只参考它的风格')).toBe('reference');
    expect(roleFromInstruction({...image,role:'unassigned'},'帮我看看这张')).toBeUndefined();
    const plan=buildMockPlan(revision({text:'参考它的风格画一座建筑',output:'image',assets:[{...image,role:'reference'}]}),'normal');
    expect(plan.steps[0].workflow).toBe('W15a0d5db12');expect(plan.blockers).toEqual([]);
  });
  it('keeps question and plan-only language away from automatic execution',()=>{
    expect(classifyTurn('解释一下当前方案')).toBe('question');expect(classifyTurn('先给我方案，不要执行')).toBe('plan_only');
    expect(classifyTurn('把它改成5秒视频')).toBe('execute');
  });
});

describe('planning and submission integrity',()=>{
  it('never executes an old plan after a fresh planning request fails',async()=>{
    const id=usePilot.getState().newTask({text:'海岸建筑'});await planned(id);expect(canConfirm(task(id))).toBe(true);
    vi.spyOn(mockAdapter,'createPlan').mockRejectedValueOnce(new Error('planner unavailable'));
    await usePilot.getState().executeDraft(id);
    expect(task(id).runs).toHaveLength(0);expect(task(id).planningError).toContain('unavailable');expect(canConfirm(task(id))).toBe(false);
  });
  it('ignores a late response from a stopped planning request',async()=>{
    let resolve!:(value:Plan)=>void;
    vi.spyOn(mockAdapter,'createPlan').mockImplementationOnce(()=>new Promise<Plan>(r=>{resolve=r;}));
    const id=usePilot.getState().newTask({text:'海岸建筑'});const pending=usePilot.getState().generatePlan(id);
    const frozen=task(id).revisions[0];usePilot.getState().stopAssistant(id);
    resolve(buildMockPlan(frozen,'normal'));await pending;
    expect(task(id).plans).toHaveLength(0);expect(task(id).runs).toHaveLength(0);expect(task(id).planning).toBe(false);
  });
  it('does not write a response against a changed input snapshot',async()=>{
    const id=usePilot.getState().newTask({text:'海岸建筑'});const pending=usePilot.getState().executeDraft(id);
    usePilot.getState().updateDraft(id,{text:'森林建筑'});await vi.advanceTimersByTimeAsync(850);await pending;
    expect(task(id).plans).toHaveLength(0);expect(task(id).runs).toHaveLength(0);expect(task(id).planningError).toContain('输入已变化');
  });
  it('only confirms the exact expected plan id',async()=>{
    const id=usePilot.getState().newTask({text:'海岸建筑'});const plan=await planned(id);
    expect(usePilot.getState().confirmRun(id,'assistant','unrelated-plan')).toBeUndefined();
    expect(usePilot.getState().confirmRun(id,'assistant',plan!.id)).toBeTruthy();
  });
  it('does not let an older response replace a newer plan',async()=>{
    let finishOld!:(value:Plan)=>void;
    vi.spyOn(mockAdapter,'createPlan').mockImplementationOnce(()=>new Promise<Plan>(resolve=>{finishOld=resolve;}));
    const id=usePilot.getState().newTask({text:'海岸建筑'});const oldPending=usePilot.getState().generatePlan(id);const oldRevision=task(id).revisions[0];
    usePilot.getState().stopAssistant(id);usePilot.getState().updateDraft(id,{text:'森林建筑'});
    const newPlan=await planned(id);finishOld(buildMockPlan(oldRevision,'normal'));await oldPending;
    expect(task(id).plans.map(p=>p.id)).toEqual([newPlan!.id]);expect(task(id).draft.text).toBe('森林建筑');
  });
  it('blocks live submission until the service confirms runtime validation',async()=>{
    const id=usePilot.getState().newTask({text:'海岸建筑'});await planned(id);
    usePilot.setState({tasks:[{...task(id),plans:task(id).plans.map(p=>({...p,source:'live',runtimeValidation:'pending'}))}]});
    expect(canConfirm(task(id))).toBe(false);
    usePilot.setState({tasks:[{...task(id),plans:task(id).plans.map(p=>({...p,runtimeValidation:'passed'}))}]});
    expect(canConfirm(task(id))).toBe(true);
  });
});

describe('conversation input continuity',()=>{
  it('retains history and supplementary assets without creating duplicate context entries',()=>{
    const reference={...image,id:'reference',name:'reference.png',role:'reference' as const};
    const id=usePilot.getState().newTask({text:'海岸建筑',assets:[image,reference]},'assistant');
    const frozen=revision(task(id).draft);
    const artifact:Artifact={id:'result',name:'result.svg',kind:'image',mime:'image/svg+xml',url:'/art/desert.svg',poster:'/art/desert.svg',runId:'run'};
    const run:Run={id:'run',planId:'plan',revisionId:frozen.id,status:'completed',startedAt:1,updatedAt:2,attempt:1,maxAttempts:3,stepIndex:0,scenario:'normal',events:[],artifacts:[artifact],quality:'not_evaluated'};
    usePilot.setState({tasks:[{...task(id),revisions:[frozen],runs:[run],messages:[{id:'request',role:'user',text:'海岸建筑',at:1}]}]});
    const originalRun=structuredClone(run);
    expect(usePilot.getState().continueFrom(id,artifact.id,'assistant')).toBe(id);
    expect(usePilot.getState().tasks).toHaveLength(1);expect(task(id).draft.assets.map(a=>a.id)).toEqual(['result','reference']);
    const messageCount=task(id).messages.length;usePilot.getState().continueFrom(id,artifact.id,'assistant');
    expect(task(id).messages).toHaveLength(messageCount);expect(task(id).messages[0].id).toBe('request');expect(task(id).runs).toEqual([originalRun]);expect(task(id).revisions).toEqual([frozen]);
  });
});

describe('media contracts and compiled requirements',()=>{
  it('clears mask-specific fields on role change and does not serialize stale ones',()=>{
    const mask:Asset={...image,id:'mask',role:'mask',targetAssetId:image.id,maskMode:'edit'};
    const id=usePilot.getState().newTask({assets:[image,mask]});usePilot.getState().setRole(id,'mask','reference');
    const changed=task(id).draft.assets[1];expect(changed.targetAssetId).toBeUndefined();expect(changed.maskMode).toBeUndefined();
    const manifest=requestManifest({text:'参考',output:'image',assets:[{...mask,role:'reference'}]});
    expect(manifest.bindings[0].mask_for).toBeNull();expect(manifest.bindings[0].mask_role).toBeNull();
  });
  it('blocks a known template-duration mismatch rather than claiming five seconds',()=>{
    const draft:Draft={text:'海岸建筑',output:'video',assets:[image]};draft.spec=resolveTurn(draft,'生成5秒视频');
    const definition={id:'We9ebcd7c4b',description:'功能：图生视频。\n\n输入：图片。\n\n输出：视频。',modality:'i2v',operation:'Generation/image_to_video',sha256:'sha',nodeCount:3,parameters:[{key:'6.length',nodeId:'6',name:'length',value:49,type:'number',nodeType:'Wan22ImageToVideoLatent'},{key:'10.fps',nodeId:'10',name:'fps',value:24,type:'number',nodeType:'VideoCombine'}]};
    const plan=buildMockPlan(revision(draft),'normal',[definition]);
    expect(plan.requirementChecks?.find(c=>c.key==='duration')?.status).toBe('mismatch');
    expect(plan.blockers.some(b=>b.code==='constraint_duration')).toBe(true);
    expect(plan.workflowVersions).toEqual([{workflowId:definition.id,sha256:'sha'}]);
  });
  it('requires explicit slot choices when more than one source can fill a single input',()=>{
    const draft:Draft={text:'修改原图',output:'image',assets:[image,{...image,id:'second',name:'second.png'}]};
    const plan=buildMockPlan(revision(draft),'normal');
    expect(plan.blockers.some(b=>b.code==='missing_slot_binding')).toBe(true);
    draft.stageEdits={'step-1':{inputs:[image.id],slotBindings:{source_image:{kind:'asset',assetId:image.id}}}};
    const bound=buildMockPlan(revision(draft),'normal');
    expect(bound.steps[0].slotBindings?.source_image).toEqual({kind:'asset',assetId:image.id});expect(bound.blockers).toEqual([]);
  });
  it('checks whole upload batches before saving any selected files',()=>{
    const files=Array.from({length:4},(_,i)=>new File(['bytes'],`${i}.png`,{type:'image/png'}));
    expect(()=>assertUploadBatch(files,5)).toThrow('最多 8');expect(()=>assertUploadBatch(files,4)).not.toThrow();
    expect(()=>assertUploadBatch([new File(['bytes'],'bad.svg',{type:'image/svg+xml'})],0)).toThrow('bad.svg');
  });
  it('uses supplied numeric schema constraints rather than accepting any finite number',()=>{
    const workflow={id:'W404dc3bdaa',description:'功能：生成图片。',modality:'t2i',operation:'Generation/text_to_image',sha256:'hash',nodeCount:1,parameters:[{key:'1.steps',nodeId:'1',name:'steps',value:8,type:'number',nodeType:'Sampler',min:1,max:10,integer:true}]};
    const draft:Draft={text:'海岸建筑',output:'image',assets:[],preferredWorkflow:workflow.id,stageEdits:{'step-1':{parameters:{'1.steps':11}}}};
    expect(buildMockPlan(revision(draft),'normal',[workflow]).blockers.some(b=>b.code==='invalid_parameter')).toBe(true);
    draft.stageEdits!['step-1'].parameters!['1.steps']=3.5;expect(buildMockPlan(revision(draft),'normal',[workflow]).blockers.some(b=>b.code==='invalid_parameter')).toBe(true);
    draft.stageEdits!['step-1'].parameters!['1.steps']=3;expect(buildMockPlan(revision(draft),'normal',[workflow]).blockers).toEqual([]);
  });
});
