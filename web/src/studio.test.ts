import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { usePilot } from './store';
import type { Artifact, Asset, Draft, Revision, Run } from './domain';
import { fingerprint } from './domain';
import { resourceIssues, requestManifest } from './resources';
import { buildMockPlan } from './adapter';
import type { WorkflowDefinition } from './catalog';

const source:Asset={id:'image',name:'source.png',label:'人物原图',mime:'image/png',kind:'image',role:'source',size:3};
const rev=(draft:Draft):Revision=>({...draft,id:'revision',number:1,createdAt:1,fingerprint:fingerprint(draft)});
const template:WorkflowDefinition={id:'W404dc3bdaa',description:'功能：根据描述生成图片。\n\n输入：文本。\n\n输出：图像。',modality:'t2i',operation:'Generation/text_to_image',sha256:'hash',nodeCount:3,parameters:[{key:'1.seed',nodeId:'1',name:'seed',type:'number',value:42,nodeType:'KSampler'}]};
beforeEach(()=>{vi.useFakeTimers();usePilot.setState({tasks:[],libraryAssets:[],connected:true,scenario:'normal',sidebarCollapsed:false});});
afterEach(()=>{vi.useRealTimers();});

describe('structured material definitions',()=>{
  it('does not consider an uploaded but undefined image a bound input',()=>{const issues=resourceIssues([{...source,role:'unassigned'}]);expect(issues.some(i=>i.code==='undefined_role')).toBe(true);});
  it('requires both mask target and white-region semantics',()=>{const mask:Asset={...source,id:'mask',name:'mask.png',label:'修改范围',role:'mask'};expect(resourceIssues([source,mask]).map(i=>i.code)).toEqual(['mask_target','mask_semantics']);expect(resourceIssues([source,{...mask,targetAssetId:source.id,maskMode:'edit'}])).toEqual([]);});
  it('does not accept duplicate aliases or cross-type mask pairing',()=>{expect(resourceIssues([source,{...source,id:'other'}]).some(i=>i.code==='duplicate_label')).toBe(true);const video:Asset={...source,id:'vid',label:'原视频',kind:'video',role:'video',mime:'video/mp4'};expect(resourceIssues([video,{...source,id:'mask',label:'遮罩',role:'mask',targetAssetId:'vid',maskMode:'preserve'}]).some(i=>i.code==='mask_pairing')).toBe(true);});
  it('exports resources and input_types in exactly the same order',()=>{const mask:Asset={...source,id:'mask',name:'mask.png',label:'保护范围',role:'mask',targetAssetId:source.id,maskMode:'preserve'};const manifest=requestManifest({text:'仅修改背景',output:'image',assets:[source,mask]});expect(manifest.task.resources).toHaveLength(2);expect(manifest.task.input_types).toEqual(['image','mask']);expect(manifest.bindings[1].mask_for).toBe(source.id);expect(manifest.bindings[1].mask_role).toBe('preserve_region');expect(manifest.resourceFilesIncluded).toBe(false);});
  it('preserves MP4 resources without silently relabeling their container',()=>{const manifest=requestManifest({text:'修改视频',output:'video',assets:[{...source,kind:'video',role:'video',name:'原片.mp4',mime:'video/mp4'}]});expect(manifest.task.resources[0]).toBe('01_原片.mp4');expect(manifest.task.input_types).toEqual(['video']);});
  it('invalidates execution snapshots when purpose, pairing, prompts or parameters change',()=>{const draft:Draft={text:'生成图片',output:'image',assets:[source]};const base=fingerprint(draft);expect(fingerprint({...draft,assets:[{...source,description:'保留身份'}]})).not.toBe(base);expect(fingerprint({...draft,negativePrompt:'不要文字'})).not.toBe(base);expect(fingerprint({...draft,stageEdits:{'step-1':{parameters:{'1.seed':100}}}})).not.toBe(base);});
});

describe('assistant delegation and workbench ownership',()=>{
  it('retains a delegated description while offline without submitting a run',async()=>{
    const id=usePilot.getState().newTask({},'assistant');
    usePilot.getState().setConnected(false);
    await usePilot.getState().delegate(id,'生成海岸建筑图片');
    const task=usePilot.getState().tasks[0];
    expect(task.draft.spec?.instruction).toBe('生成海岸建筑图片');
    expect(task.runs).toHaveLength(0);
    expect(task.messages).toHaveLength(0);
  });
  it('plans and submits automatically after one user delegation',async()=>{const id=usePilot.getState().newTask({},'assistant');const pending=usePilot.getState().delegate(id,'生成海岸建筑图片');await vi.advanceTimersByTimeAsync(850);await pending;const t=usePilot.getState().tasks[0];expect(t.runs).toHaveLength(1);expect(t.runs[0].initiatedBy).toBe('assistant');expect(t.runs[0].status).toBe('queued');expect(t.agentBusy).toBe(false);});
  it('asks for missing media in the same conversation without executing',async()=>{const id=usePilot.getState().newTask({},'assistant');const pending=usePilot.getState().delegate(id,'修改原图的风格');await vi.advanceTimersByTimeAsync(850);await pending;const t=usePilot.getState().tasks[0];expect(t.runs).toHaveLength(0);expect(t.messages.at(-1)?.text).toContain('输入');expect(t.plans[0].blockers.length).toBeGreaterThan(0);});
  it('stopping during planning prevents the later automatic submission',async()=>{const id=usePilot.getState().newTask({},'assistant');const pending=usePilot.getState().delegate(id,'生成海岸建筑');usePilot.getState().stopAssistant(id);await vi.advanceTimersByTimeAsync(850);await pending;expect(usePilot.getState().tasks[0].runs).toHaveLength(0);});
  it('handoff preserves the exact task, plan, assets and previous run',async()=>{const id=usePilot.getState().newTask({assets:[source]},'assistant');const pending=usePilot.getState().delegate(id,'修改原图的风格');await vi.advanceTimersByTimeAsync(850);await pending;const before=structuredClone(usePilot.getState().tasks[0]);usePilot.getState().handoff(id);const after=usePilot.getState().tasks[0];expect(after.id).toBe(before.id);expect(after.plans).toEqual(before.plans);expect(after.runs).toEqual(before.runs);expect(after.draft).toEqual(before.draft);expect(usePilot.getState().view).toBe('workbench');});
  it('keeps manual parameters in a new plan and rejects wrong types',()=>{const draft:Draft={text:'生成建筑',output:'image',assets:[],preferredWorkflow:template.id,stageEdits:{'step-1':{parameters:{'1.seed':123}}}};const plan=buildMockPlan(rev(draft),'normal',[template]);expect(plan.blockers).toEqual([]);expect(plan.steps[0].parameters).toEqual({'1.seed':123});draft.stageEdits!['step-1'].parameters!['1.seed']='wrong';expect(buildMockPlan(rev(draft),'normal',[template]).blockers.some(b=>b.code==='invalid_parameter')).toBe(true);});
  it('does not demand an image for a manually selected text-to-video template',()=>{const video={...template,id:'W71051a0184',modality:'t2v',operation:'Generation/text_to_video'};expect(buildMockPlan(rev({text:'生成海面视频',output:'video',assets:[],preferredWorkflow:video.id}),'normal',[video]).blockers).toEqual([]);});
  it('validates the effective stage template after a manual swap',()=>{const video={...template,id:'W111',modality:'v2v',operation:'Video/edit',description:'功能：修改视频。\n\n输入：视频。\n\n输出：视频。'};const textVideo={...template,id:'W222',modality:'t2v',operation:'Generation/text_to_video'};const draft:Draft={text:'生成海面视频',output:'video',assets:[],preferredWorkflow:textVideo.id,stageEdits:{'step-1':{workflowId:video.id}}};expect(buildMockPlan(rev(draft),'normal',[video,textVideo]).blockers.some(b=>b.code==='missing_stage_video')).toBe(true);});
  it('requires a declared mask and its target in the same stage binding',()=>{const edit={...template,id:'W333',modality:'i2i',description:'功能：局部编辑。\n\n输入：图片、遮罩。\n\n输出：图片。'};const mask:Asset={...source,id:'mask',label:'修改范围',role:'mask',targetAssetId:source.id,maskMode:'edit'};const draft:Draft={text:'修改背景',output:'image',assets:[source,mask],preferredWorkflow:edit.id,stageEdits:{'step-1':{inputs:[source.id]}}};expect(buildMockPlan(rev(draft),'normal',[edit]).blockers.some(b=>b.code==='missing_stage_mask')).toBe(true);draft.stageEdits!['step-1'].inputs=[mask.id];expect(buildMockPlan(rev(draft),'normal',[edit]).blockers.some(b=>b.code==='mask_target_binding')).toBe(true);});
  it('sidebar collapse is actionable and persisted with the rest of the app',()=>{usePilot.getState().toggleSidebar();expect(usePilot.getState().sidebarCollapsed).toBe(true);const stored=JSON.parse(localStorage.getItem('comfypilot-v1')!);expect(stored.state.sidebarCollapsed).toBe(true);expect(stored.version).toBe(2);});
  it('restoring a snapshot cannot overwrite the original run input',async()=>{const id=usePilot.getState().newTask({text:'第一个提示词'});let p=usePilot.getState().generatePlan(id);await vi.advanceTimersByTimeAsync(850);await p;usePilot.getState().confirmRun(id);const original=usePilot.getState().tasks[0].revisions[0];usePilot.getState().updateDraft(id,{text:'第二个提示词'});usePilot.getState().checkoutRevision(id,original.id);expect(usePilot.getState().tasks[0].draft.text).toBe('第一个提示词');expect(usePilot.getState().tasks[0].runs[0].revisionId).toBe(original.id);});
});


describe('continuing from a selected result',()=>{
  function prepare(kind:'image'|'video'='image') {
    const id=usePilot.getState().newTask({text:'原始生成要求',output:'image',assets:[source],preferredWorkflow:template.id,stageEdits:{'step-1':{parameters:{'1.seed':123}}}},'assistant');
    const original=usePilot.getState().tasks[0];
    const revision=rev(original.draft);
    const artifact:Artifact={id:'chosen-result',name:kind==='image'?'result-2.svg':'clip.webm',kind,mime:kind==='image'?'image/svg+xml':'video/webm',poster:'/art/desert.svg',runId:'old-run',...(kind==='image'?{url:'/art/desert.svg'}:{})};
    const run:Run={id:'old-run',planId:'plan',revisionId:revision.id,status:'completed',startedAt:1,updatedAt:2,attempt:1,maxAttempts:3,stepIndex:0,scenario:'normal',events:[],quality:'not_evaluated',artifacts:[{...artifact,id:'other-result',url:'/art/coast.svg'},artifact]};
    usePilot.setState({tasks:[{...original,revisions:[revision],runs:[run],draft:{...original.draft,text:'后来改过的草稿',output:kind==='image'?'video':'image'}}]});
    return {id,artifact};
  }
  it('continues in the same conversation using the selected artifact without running it',()=>{
    const {id,artifact}=prepare();const before=structuredClone(usePilot.getState().tasks[0]);
    const nextId=usePilot.getState().continueFrom(id,artifact.id,'assistant');
    const next=usePilot.getState().tasks.find(t=>t.id===nextId)!;
    expect(nextId).toBe(id);expect(usePilot.getState().tasks).toHaveLength(1);expect(next.origin).toBe('assistant');expect(next.draft.spec?.instruction).toBe('');expect(next.draft.output).toBe('image');
    expect(next.draft.assets).toHaveLength(1);expect(next.draft.assets[0]).toMatchObject({id:artifact.id,url:artifact.url,role:'source'});
    expect(next.draft.preferredWorkflow).toBeUndefined();expect(next.draft.stageEdits).toBeUndefined();
    expect(next.runs).toEqual(before.runs);expect(next.revisions).toEqual(before.revisions);expect(next.plans).toEqual(before.plans);expect(next.messages.slice(0,before.messages.length)).toEqual(before.messages);
    expect(next.continuedFrom).toEqual({taskId:id,runId:'old-run',revisionId:'revision',artifactId:artifact.id});
    expect(usePilot.getState().tasks.find(t=>t.id===id)?.runs).toEqual(before.runs);
  });
  it('opens the same creation in workbench only when explicitly chosen',()=>{
    const {id,artifact}=prepare();const nextId=usePilot.getState().continueFrom(id,artifact.id,'workbench');
    const next=usePilot.getState().tasks.find(t=>t.id===nextId)!;
    expect(nextId).toBe(id);expect(next.lastView).toBe('workbench');expect(next.origin).toBe('assistant');expect(next.runs).toHaveLength(1);expect(usePilot.getState().tasks).toHaveLength(1);
  });
  it('preserves video blob identity and its actual media type regardless of the edited source draft',()=>{
    const {id,artifact}=prepare('video');const nextId=usePilot.getState().continueFrom(id,artifact.id,'assistant');
    const next=usePilot.getState().tasks.find(t=>t.id===nextId)!;
    expect(next.draft.output).toBe('video');expect(next.draft.assets[0]).toMatchObject({id:artifact.id,mime:'video/webm',role:'video',url:undefined});
  });
  it('rejects a missing artifact without silently creating an empty task',()=>{
    const {id}=prepare();expect(()=>usePilot.getState().continueFrom(id,'missing','assistant')).toThrow('成果');
    expect(usePilot.getState().tasks).toHaveLength(1);
    expect(()=>usePilot.getState().continueFrom('missing','chosen-result','assistant')).toThrow('来源');
    expect(usePilot.getState().tasks).toHaveLength(1);
  });
  it('treats a brief adjustment as editing the carried image',()=>{
    const {id,artifact}=prepare();const nextId=usePilot.getState().continueFrom(id,artifact.id,'assistant');
    const next=usePilot.getState().tasks.find(t=>t.id===nextId)!;
    const plan=buildMockPlan(rev({...next.draft,text:'让画面暖一点'}),'normal');
    expect(plan.steps[0].workflow).toBe('Wfaf115c6c9');expect(plan.steps[0].inputs).toEqual([artifact.id]);expect(plan.blockers).toEqual([]);
  });
});
