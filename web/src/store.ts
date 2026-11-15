import { ApiError, liveApi, liveMode, recordingMode } from './liveApi';
import { recordedCases } from './recordedCases';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Asset, AssetGroup, Benchmark, Creation, Draft, Plan, Run, Scenario, StageEdit } from './domain';
import { canConfirm, currentPlan, fingerprint, isActive, planIsFresh } from './domain';
import { CAPABILITIES, DEMO_BATCH, PROTOCOL, LIMITS, RUN_LABEL } from './data';
import { pilotAdapter } from './adapter';
import { uid } from './media';
import { pilotStorage } from './persistence';
import { collectAssets, validateGroupName } from './assetLibrary';
import { PALETTES, type PaletteId } from './themes';
import { classifyTurn, compileSpec, currentArtifact, initialSpec, requestsCurrentResult, resolveTurn, roleFromInstruction } from './creationIntent';

interface Store {
  tasks: Creation[]; batches: Benchmark[]; libraryAssets: Asset[]; assetGroups: AssetGroup[]; assetGroupById: Record<string, string>; theme: 'dark' | 'light'; palette: PaletteId; scenario: Scenario; connected: boolean;
  view: 'workbench' | 'chat'; sidebarCollapsed: boolean; toast: string | null;
  notify(message: string): void; setTheme(): void; setView(view: Store['view']): void; setTaskView(id:string,view:'assistant'|'workbench'):void; toggleSidebar(): void;
  setAppearance(theme: Store['theme']): void; setPalette(palette: PaletteId): void; resetAppearance(): void;
  setScenario(value: Scenario): void; setConnected(value: boolean): void;
  newTask(initial?: Partial<Draft>, origin?: Creation['origin']): string;
  updateDraft(id: string, patch: Partial<Draft>): void; archive(id: string): void;
  saveLibraryAsset(asset: Asset): void; addAsset(id: string, asset: Asset): void; removeAsset(id: string, assetId: string): void;
  createAssetGroup(name: string): string; renameAssetGroup(id: string, name: string): void;
  dissolveAssetGroup(id: string): void; moveAssets(ids: string[], groupId: string): void;
  setRole(id: string, assetId: string, role: Asset['role']): void;
  updateAsset(id: string, assetId: string, patch: Partial<Asset>): void;
  updateStage(id: string, stageId: string, patch: StageEdit): void;
  sendMessage(id: string, text: string, mode: 'append' | 'replace' | 'explain'): void;
  delegate(id: string, text: string, mode?: 'auto' | 'review'): Promise<void>; stopAssistant(id: string): void;
  generatePlan(id: string): Promise<Plan | undefined>; executeDraft(id: string): Promise<void>;
  confirmRun(id: string, source?: 'assistant' | 'workbench', expectedPlanId?: string): string | undefined;
  cancelRun(taskId: string, runId: string): void;
  feedback(taskId: string, runId: string, value: 'good' | 'improve', text: string): void;
  handoff(id: string): void; checkoutRevision(id: string, revisionId: string): void;
  selectArtifact(taskId: string, artifactId: string): void;
  continueFrom(taskId: string, source: 'original' | string, destination: 'assistant' | 'workbench'): string;
  addBatch(batch: Benchmark): void; startDemoBatch(): string; recover(): void; tick(): Promise<void>; syncLive(): Promise<void>;
}
const changeTask = (tasks: Creation[], id: string, change: (task: Creation) => Creation) => tasks.map(t => t.id === id ? change(t) : t);
const message = (role: 'user' | 'assistant', text: string) => ({ id: uid(), role, text, at: Date.now() });
const planningControllers=new Map<string,AbortController>();
let liveSyncing=false;
let toastTimer: ReturnType<typeof setTimeout>;
export const usePilot = create<Store>()(persist((set, get) => ({
  tasks: recordingMode ? structuredClone(recordedCases) : [], batches: liveMode ? [] : [DEMO_BATCH], libraryAssets: [], assetGroups: [], assetGroupById: {}, theme: 'light', palette: 'graphite', scenario: 'normal', connected: true,
  view: 'workbench', sidebarCollapsed: false, toast: null,
  notify(text) { clearTimeout(toastTimer); set({ toast: text }); toastTimer = setTimeout(() => set({ toast: null }), 4200); },
  setTheme: () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setAppearance: theme => set({ theme }),
  setPalette(palette) { if (PALETTES.some(p => p.id === palette)) set({ palette }); },
  resetAppearance: () => set({ theme: 'light', palette: 'graphite' }),
  setView: view => set({ view }), setTaskView(id,view){set(s=>({tasks:changeTask(s.tasks,id,t=>t.lastView===view?t:{...t,lastView:view})}));}, toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setScenario: scenario => set({ scenario }), setConnected: connected => set({ connected }),
  newTask(initial = {}, origin = 'workbench') {
    const id = uid(); const now = Date.now(); const draft: Draft = { text: '', assets: [], output: 'image', ...initial };
    set(s => ({ tasks: [{ id, title: draft.text.slice(0, 28) || (origin === 'assistant' ? '新对话' : '未命名工作流'), createdAt: now, updatedAt: now, archived: false, origin, lastView:origin, draft, revisions: [], plans: [], runs: [], messages: [] }, ...s.tasks] }));
    return id;
  },
  updateDraft(id, patch) {
    set(s=>({tasks:changeTask(s.tasks,id,t=>{
      const draft={...t.draft,...patch};
      if(t.draft.spec&&!('spec'in patch)&&(patch.text!==undefined||patch.output!==undefined)) {
        const spec=patch.text!==undefined?resolveTurn(t.draft,patch.text):structuredClone(t.draft.spec);
        spec.output=draft.output;if(spec.output==='image'){delete spec.constraints.durationSeconds;delete spec.constraints.fps;}
        draft.spec=spec;draft.text=compileSpec(spec);
      }
      if(draft.spec?.selectedResult&&!draft.assets.some(a=>a.id===draft.spec?.selectedResult?.artifactId))draft.spec={...draft.spec,selectedResult:undefined};
      return {...t,draft,updatedAt:Date.now(),title:draft.spec?.goal.slice(0,28)||(patch.text??t.draft.text).trim().slice(0,28)||'未命名创作'};
    })}));
  },
  archive(id) { set(s => ({ tasks: changeTask(s.tasks, id, t => ({ ...t, archived: !t.archived })) })); },
  saveLibraryAsset(asset) { set(s => ({ libraryAssets: [asset, ...s.libraryAssets.filter(a => a.id !== asset.id)] })); },
  createAssetGroup(name) {
    const value = validateGroupName(name, get().assetGroups); const id = uid();
    set(s => ({ assetGroups: [...s.assetGroups, { id, name: value, createdAt: Date.now() }] })); return id;
  },
  renameAssetGroup(id, name) {
    if (!get().assetGroups.some(g => g.id === id)) throw new Error('这个分组已不存在。');
    const value = validateGroupName(name, get().assetGroups, id);
    set(s => ({ assetGroups: s.assetGroups.map(g => g.id === id ? { ...g, name: value } : g) }));
  },
  dissolveAssetGroup(id) {
    set(s => ({ assetGroups: s.assetGroups.filter(g => g.id !== id), assetGroupById: Object.fromEntries(Object.entries(s.assetGroupById).filter(([, groupId]) => groupId !== id)) }));
  },
  moveAssets(ids, groupId) {
    if (groupId && !get().assetGroups.some(g => g.id === groupId)) throw new Error('目标分组已不存在，请重新选择。');
    const known = new Set(collectAssets(get().libraryAssets, get().tasks).map(a => a.id));
    if (ids.some(id => !known.has(id))) throw new Error('部分素材已不可用，请刷新列表后重试。');
    set(s => { const membership = { ...s.assetGroupById }; for (const id of ids) { if (groupId) membership[id] = groupId; else delete membership[id]; } return { assetGroupById: membership }; });
  },
  addAsset(id, asset) { const t = get().tasks.find(t => t.id === id); if (!t) return; if (t.draft.assets.length >= LIMITS.maxAssets) throw new Error('每个需求最多 8 份素材。'); if (t.draft.assets.some(a => a.id === asset.id)) return; get().updateDraft(id, { assets: [...t.draft.assets, asset] }); },
  removeAsset(id, assetId) { const t = get().tasks.find(t => t.id === id); if (t) get().updateDraft(id, { assets: t.draft.assets.filter(a => a.id !== assetId) }); },
  setRole(id, assetId, role) { get().updateAsset(id, assetId, { role, ...(role!=='mask'?{targetAssetId:undefined,maskMode:undefined}:{}) }); },
  updateAsset(id, assetId, patch) { const t = get().tasks.find(t => t.id === id); if (t) get().updateDraft(id, { assets: t.draft.assets.map(a => a.id === assetId ? { ...a, ...patch, id: a.id } : a) }); },
  updateStage(id, stageId, patch) { const t = get().tasks.find(t => t.id === id); if (t) get().updateDraft(id, { stageEdits: { ...t.draft.stageEdits, [stageId]: { ...t.draft.stageEdits?.[stageId], ...patch } } }); },
  sendMessage(id, text, mode) {
    const t = get().tasks.find(t => t.id === id); if (!t || !text.trim()) return;
    const next = mode === 'replace' ? text.trim() : [t.draft.text.trim(), text.trim()].filter(Boolean).join('\n修改要求：');
    const plan = currentPlan(t);
    const reply = mode === 'explain' ? plan ? `处理步骤：${plan.steps.map(s => s.label).join(' → ')}。${plan.blockers.length ? plan.blockers.map(b => b.message).join('；') : '输入已就绪，可确认生成或交给助手执行。'}` : '还没有方案。描述需求后，我会检查输入并安排执行。' : '需求已保存。';
    set(s => ({ tasks: changeTask(s.tasks, id, task => ({ ...task, ...(mode !== 'explain' ? { draft: { ...task.draft, text: next }, title: next.slice(0, 28) } : {}), messages: [...task.messages, message('user', text), message('assistant', reply)], updatedAt: Date.now() })) }));
  },
  async delegate(id, text, mode='auto') {
    let task=get().tasks.find(t=>t.id===id);if(!task)return;
    if(liveMode) {
      if(task.agentBusy||task.planning||task.runs.some(isActive))return;
      const prompt=text.trim()||task.draft.text.trim();if(!prompt)return;
      if(text.trim()&&classifyTurn(text)==='question') {
        set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,messages:[...t.messages,{...message('user',text),kind:'question'},{...message('assistant','描述创作目标并提供所需素材，我会使用已核验的工作流规划；也可在工作台调整。普通询问不会启动执行。'),kind:'question'}]}))}));return;
      }
      if(!get().connected){get().notify('连接已中断，请恢复后重试。');return;}
      const output=/视频|动画|动起来|\bvideo\b|\banimation\b/i.test(prompt)?'video':/图片|照片|图像|\bimage\b|\bphoto\b/i.test(prompt)?'image':task.draft.assets.some(a=>a.kind==='video')?'video':task.draft.output;
      const draft={...task.draft,text:prompt,output,spec:undefined,preferredWorkflow:undefined,stageEdits:{}};
      set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,lastView:'assistant',agentBusy:true,draft,title:prompt.slice(0,28),messages:[...t.messages,...(text.trim()?[{...message('user',text),kind:'request' as const}]:[])]}))}));
      try {
        const plan=await get().generatePlan(id);
        const after=get().tasks.find(t=>t.id===id);
        if(after?.agentBusy&&plan&&mode!=='review'&&classifyTurn(prompt)!=='plan_only'&&canConfirm(after))get().confirmRun(id,'assistant',plan.id);
      } finally {set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,agentBusy:false}))}));}
      return;
    }
    const classified=classifyTurn(text);const intent=classified==='execute'&&mode==='review'?'plan_only':classified;
    if(intent==='question') {
      const plan=currentPlan(task);const active=task.runs.find(isActive);
      const reply=active?`当前执行处于「${RUN_LABEL[active.status]}」阶段，已执行 ${active.attempt}/${active.maxAttempts} 次。询问不会创建新执行。`:plan?`${planIsFresh(task)?'当前方案':'最近一次方案（草稿已变化）'}：${plan.steps.map(s=>s.label).join(' → ')}。${plan.blockers.length?plan.blockers.map(b=>b.message).join('；'):'输入检查已完成。'}这次只解释方案，不运行。`:'你可以描述创作目标、上传素材，或选中已有成果继续调整。普通询问不会启动生成。';
      set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,lastView:'assistant',updatedAt:Date.now(),messages:[...t.messages,{...message('user',text),kind:'question'},{...message('assistant',reply),kind:'question'}]}))}));return;
    }
    if(task.agentBusy||task.planning||task.runs.some(isActive))return;
    if(requestsCurrentResult(text)) {
      const artifact=currentArtifact(task);
      if(artifact && task.continuedFrom?.artifactId!==artifact.id) { get().continueFrom(id,artifact.id,'assistant'); task=get().tasks.find(t=>t.id===id)!; }
    }
    const spec=text.trim()?resolveTurn(task.draft,text):initialSpec(task.draft);
    const next=compileSpec(spec);if(!spec.instruction.trim()&&!text.trim())return;
    if(!get().connected){get().updateDraft(id,{text:next,output:spec.output,spec});get().notify('连接已中断。需求已保留，恢复后可以继续。');return;}
    const assets=structuredClone(task.draft.assets);const unassigned=assets.filter(a=>a.role==='unassigned');
    let assignment='';
    if(unassigned.length===1&&assets.length===1&&!/蒙版|遮罩/.test(text)) {
      const role=roleFromInstruction(unassigned[0],text);
      if(role){unassigned[0].role=role;assignment=`「${unassigned[0].label||unassigned[0].name}」用作${role==='reference'?'风格参考':role==='source'?'待处理原图':'输入视频'}。`;}
    }
    const draft={...task.draft,text:next,output:spec.output,spec,assets,...(spec.output!==task.draft.output?{capabilityId:undefined,preferredWorkflow:undefined,stageEdits:{}}:{})};
    set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,lastView:'assistant',agentBusy:true,draft,title:spec.goal.slice(0,28),messages:[...t.messages,...(text.trim()?[{...message('user',text),kind:'request' as const}]:[]),message('assistant',`${assignment}${spec.changes.join('；')}。${intent==='plan_only'?'这次先整理方案，等待你确认后执行。':'我会核对本轮输入与方案，满足要求后执行。'}`)]}))}));
    const plan=await get().generatePlan(id);
    const after=get().tasks.find(t=>t.id===id);if(!after?.agentBusy)return;
    if(plan&&intent!=='plan_only'&&!plan.confirmationReason&&canConfirm(after))get().confirmRun(id,'assistant',plan.id);
    else if(plan?.blockers.length)set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,messages:[...t.messages,message('assistant',`本轮输入仍需处理，已有内容与对话保留：\n${plan.blockers.map(b=>`• ${b.message}`).join('\n')}`)]}))}));
    set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,agentBusy:false}))}));
  },
  stopAssistant(id) {
    const task=get().tasks.find(t=>t.id===id);if(!task)return;
    planningControllers.get(id)?.abort();planningControllers.delete(id);
    set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,agentBusy:false,planning:false,planningRequestId:undefined}))}));
    const active=task.runs.find(isActive);
    if(active)get().cancelRun(id,active.id);
    else set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,messages:[...t.messages,message('assistant','已停止接管。需求与方案保留，没有继续提交执行。')]}))}));
  },
  async generatePlan(id) {
    const task=get().tasks.find(t=>t.id===id);if(!task||task.planning)return;
    if(!task.draft.text.trim()){get().notify('请先填写提示词或创作需求。');return;}
    if(!get().connected){get().notify('连接已中断，请先恢复连接。');return;}
    const requestId=uid();const controller=new AbortController();planningControllers.set(id,controller);
    const revision={...structuredClone(task.draft),id:uid(),number:task.revisions.length+1,createdAt:Date.now(),fingerprint:fingerprint(task.draft)};
    set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,planning:true,planningRequestId:requestId,planningError:undefined,revisions:[...t.revisions,revision]}))}));
    try {
      const plan=await pilotAdapter.createPlan(revision,get().scenario,{requestId,signal:controller.signal});
      const latest=get().tasks.find(t=>t.id===id);
      if(controller.signal.aborted||latest?.planningRequestId!==requestId)return;
      if(plan.revisionId!==revision.id||fingerprint(latest.draft)!==revision.fingerprint)throw new Error('输入已变化，本次方案没有写入。请按当前需求重新规划。');
      set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,planning:false,planningRequestId:undefined,plans:[...t.plans,plan]}))}));
      return plan;
    } catch(error) {
      if(get().tasks.find(t=>t.id===id)?.planningRequestId===requestId)set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,planning:false,planningRequestId:undefined,planningError:error instanceof Error?error.message:'方案生成失败，请重试。'}))}));
    } finally { if(planningControllers.get(id)===controller)planningControllers.delete(id); }
  },
  async executeDraft(id) {
    const task=get().tasks.find(t=>t.id===id);if(!task||task.planning||task.agentBusy||task.runs.some(isActive))return;
    const plan=await get().generatePlan(id);if(plan)get().confirmRun(id,'workbench',plan.id);
  },
  confirmRun(id, source = 'workbench', expectedPlanId) {
    const task=get().tasks.find(t=>t.id===id);const plan=task&&currentPlan(task);
    if(!task||!plan||expectedPlanId&&plan.id!==expectedPlanId||!canConfirm(task)||!get().connected)return;
    const runId=uid();const now=Date.now();
    const run:Run={source:pilotAdapter.source,submitted:false,id:runId,planId:plan.id,revisionId:plan.revisionId,initiatedBy:source,status:'queued',startedAt:now,updatedAt:now,attempt:1,maxAttempts:3,stepIndex:0,scenario:get().scenario,events:[{at:now,title:'执行已提交',detail:`已锁定本次方案 ${plan.id} 与需求版本，${source==='assistant'?'助手委托':'人工编辑'}执行。`,attempt:1}],artifacts:[],quality:'not_evaluated'};
    set(s=>({tasks:changeTask(s.tasks,id,t=>({...t,runs:[...t.runs,run],messages:source==='assistant'?[...t.messages,message('assistant',liveMode?'已提交，正在生成。':'本轮输入检查完成，已开始执行。可以随时停止，或主动转到工作台编辑。')]:t.messages,updatedAt:now}))}));if(liveMode)void get().syncLive();return runId;
  },
  cancelRun(taskId, runId) { if(liveMode)void liveApi.cancel(runId).catch(error=>get().notify(String(error))); set(s => ({ tasks: changeTask(s.tasks, taskId, t => ({ ...t, runs: t.runs.map(r => r.id === runId && isActive(r) && r.status !== 'cancel_requested' ? { ...r, status: 'cancel_requested', cancelAt: Date.now(), events: [...r.events, { at: Date.now(), title: '已请求停止', detail: '等待执行器确认。', attempt: r.attempt }] } : r) })) })); },
  feedback(taskId, runId, value, text) { set(s => ({ tasks: changeTask(s.tasks, taskId, t => ({ ...t, runs: t.runs.map(r => r.id === runId ? { ...r, feedback: { value, text } } : r) })) })); get().notify('反馈已保存，与官方评价分别记录。'); },
  handoff(id) { set(s => ({ view: 'workbench', tasks: changeTask(s.tasks, id, t => ({ ...t, lastView:'workbench', handedOffAt: Date.now() })) })); },
  checkoutRevision(id, revisionId) { const task = get().tasks.find(t => t.id === id); const revision = task?.revisions.find(r => r.id === revisionId); if (!revision) return; const { id: _id, createdAt: _at, number: _number, fingerprint: _fingerprint, ...draft } = revision; get().updateDraft(id, structuredClone(draft)); get().notify('该版本已载入编辑区，历史执行记录不会改变。'); },
  selectArtifact(taskId,artifactId) {
    set(s=>({tasks:changeTask(s.tasks,taskId,t=>t.runs.some(r=>r.artifacts.some(a=>a.id===artifactId))?{...t,selectedArtifactId:artifactId}:t)}));
  },
  continueFrom(taskId, source, destination) {
    const task=get().tasks.find(t=>t.id===taskId);if(!task)throw new Error('来源创作已不存在，请重新选择。');
    if(source==='original') {
      const revision=task.revisions.at(-1)??task.draft;
      get().updateDraft(taskId,{text:revision.text,output:revision.output,assets:structuredClone(revision.assets),spec:revision.spec?structuredClone(revision.spec):undefined,preferredWorkflow:undefined,capabilityId:undefined,stageEdits:{}});
      return taskId;
    }
    const run=task.runs.find(r=>r.artifacts.some(a=>a.id===source));const artifact=run?.artifacts.find(a=>a.id===source);
    if(!run||!artifact)throw new Error('这份成果已不存在，请重新选择。');
    if(task.planning){planningControllers.get(taskId)?.abort();planningControllers.delete(taskId);}
    const inputSource={taskId,runId:run.id,revisionId:run.revisionId,artifactId:artifact.id};
    const asset:Asset={id:artifact.id,name:artifact.name,label:artifact.name,kind:artifact.kind,mime:artifact.mime,size:0,url:artifact.url,role:artifact.kind==='image'?'source':'video'};
    const spec=initialSpec(task.draft);spec.selectedResult=inputSource;spec.output=artifact.kind;spec.instruction='';spec.changes=[`将「${artifact.name}」设为下一轮输入`];
    if(artifact.kind==='image'){delete spec.constraints.durationSeconds;delete spec.constraints.fps;}
    const already=task.continuedFrom?.artifactId===artifact.id&&task.draft.assets.some(a=>a.id===artifact.id);
    const retained=task.draft.assets.filter(a=>a.id!==asset.id&&['reference','driving','unassigned'].includes(a.role));
    const draft:Draft={text:compileSpec(spec),output:artifact.kind,assets:[asset,...retained],negativePrompt:task.draft.negativePrompt,spec};
    set(s=>({tasks:changeTask(s.tasks,taskId,t=>({...t,...(t.planning?{planning:false,planningRequestId:undefined,agentBusy:false}:{}),draft:already?t.draft:draft,continuedFrom:inputSource,selectedArtifactId:artifact.id,lastView:destination,...(destination==='workbench'?{handedOffAt:Date.now()}:{}),updatedAt:Date.now(),messages:already?t.messages:[...t.messages,{...message('assistant',`下一轮使用「${artifact.name}」。继续描述修改要求即可，对话与历史版本保留。`),kind:'context',inputSource}]}))}));
    return taskId;
  },
  addBatch(batch) { set(s => ({ batches: [batch, ...s.batches] })); },
  startDemoBatch() { const id = uid(); get().addBatch({ id, name: '冻结协议 · 模拟评测批次', source: 'demo', status: 'running', createdAt: Date.now(), protocol: PROTOCOL, total: 200, cases: [] }); return id; },
  recover() { for(const controller of planningControllers.values())controller.abort();planningControllers.clear();set(s => ({ tasks: s.tasks.map(t => ({ ...t, agentBusy: false, planning: false, planningRequestId:undefined, planningError: t.planning ? '未完成的方案请求没有自动重发，请重新提交。' : t.planningError, runs: t.runs.map(r => ({ ...r, producing: false })) })) })); },
  async syncLive() {
    if (!liveMode || liveSyncing) return;
    liveSyncing = true;
    try {
      await fetch('/api/health', {cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('服务未连接');});
      set({connected:true});
      for (const task of get().tasks) for (const run of task.runs.filter(r=>r.source==='live'&&isActive(r))) {
        try {
          const revision = task.revisions.find(r=>r.id===run.revisionId);
          if(!revision)continue;
          // Retry the same server key after an uncertain submission, including refresh.
          const remote = run.submitted ? await liveApi.run(run.id) : await liveApi.submit(run, revision.fingerprint);
          if(run.status==='cancel_requested'&&isActive(remote))await liveApi.cancel(run.id);
          set(s=>({tasks:changeTask(s.tasks,task.id,t=>({...t,runs:t.runs.map(r=>r.id===run.id?{
            ...remote,source:'live',submitted:true,initiatedBy:r.initiatedBy,feedback:r.feedback,
            status:r.status==='cancel_requested'&&isActive(remote)?'cancel_requested':remote.status,
          }:r)}))}));
        } catch(error) {
          if(error instanceof ApiError && [400,404,409,422].includes(error.status)) {
            set(s=>({tasks:changeTask(s.tasks,task.id,t=>({...t,runs:t.runs.map(r=>r.id===run.id?{...r,status:'failed',updatedAt:Date.now(),error:error.message}:r)}))}));
            continue;
          }
          // Network failures keep the last authoritative state. Never fabricate failure/completion.
          get().notify(error instanceof Error?error.message:'运行同步失败');
          set({connected:false});
        }
      }
    } catch {set({connected:false});}
    finally {liveSyncing=false;}
  },
  async tick() {
    if (pilotAdapter.source!=='demo'||!get().connected) return;
    const now = Date.now(); let batchChanged = false;
    const batches = get().batches.map(b => {
      if (b.status !== 'running' || b.source !== 'demo') return b;
      const count = Math.min(b.total, Math.floor((now - b.createdAt) / 500)); if (count <= b.cases.length) return b;
      batchChanged = true; const cases = [...b.cases];
      for (let i = cases.length; i < count; i++) cases.push({ ...DEMO_BATCH.cases[i % 4], id: `sim-${String(i + 1).padStart(3, '0')}`, prompt: `[模拟案例 ${i + 1}] ${DEMO_BATCH.cases[i % 4].prompt}` });
      return { ...b, cases, status: count === b.total ? 'completed' as const : 'running' as const };
    });
    if (batchChanged) set({ batches });
    const queue = get().tasks.flatMap(t => t.runs.filter(isActive).map(r => ({ taskId: t.id, run: r }))).sort((a,b) => a.run.startedAt - b.run.startedAt);
    for (const item of queue) {
      const task = get().tasks.find(t => t.id === item.taskId)!; const r = task.runs.find(x => x.id === item.run.id)!; if (!isActive(r)) continue;
      const patch = (value: Partial<Run>, title?: string, detail = '') => {
        const at = Date.now();
        const doneText = r.initiatedBy === 'assistant' ? value.status === 'completed' ? '执行完成。可以下载结果、继续提出修改要求，或转到工作台编辑提示词、输入和参数后复跑。当前展示的是演示成果。' : value.status === 'failed' ? `这次执行未完成：${value.error}。输入与工作流已保留。` : value.status === 'cancelled' ? '执行器已确认停止。输入与记录保留。' : '' : '';
        set(s => ({ tasks: changeTask(s.tasks, task.id, t => ({ ...t, updatedAt: at, ...(value.artifacts?.length?{selectedArtifactId:value.artifacts[0].id}:{}), ...(doneText ? { messages: [...t.messages, message('assistant', doneText)] } : {}), runs: t.runs.map(run => run.id === r.id ? { ...run, ...value, updatedAt: at, events: title ? [...run.events, { at, title, detail, attempt: value.attempt ?? run.attempt }] : run.events } : run) })) }));
      };
      if (r.status === 'cancel_requested') { if (now - (r.cancelAt ?? now) > 800) patch({ status: 'cancelled', producing: false }, '执行器已确认停止'); continue; }
      if (now - r.updatedAt < 1200 || r.producing) continue;
      if (r.status === 'queued') { const other = get().tasks.flatMap(t => t.runs).some(x => x.id !== r.id && ['running','repairing','cancel_requested'].includes(x.status)); if (!other) patch({ status: 'running' }, '开始执行', '读取锁定的提示词、参数与输入绑定。'); continue; }
      if (r.status === 'repairing') { patch({ status: 'running', attempt: r.attempt + 1 }, `第 ${r.attempt + 1} 次执行`, '基于错误反馈修改后再运行。'); continue; }
      if (r.scenario === 'failure' || r.scenario === 'repair' && r.attempt === 1) {
        if (r.attempt < r.maxAttempts) patch({ status: 'repairing' }, '检查并修复执行问题', '模拟：节点配置与输入尺寸不兼容。');
        else patch({ status: 'failed', error: '已用尽三次执行尝试。可以修改输入或参数后新建执行。' }, '达到执行上限');
        continue;
      }
      const plan = task.plans.find(p => p.id === r.planId); const revision = task.revisions.find(v => v.id === r.revisionId);
      if (!plan || !revision) { patch({ status: 'failed', error: '缺少需求快照。' }); continue; }
      if (r.stepIndex < plan.steps.length - 1) { patch({ stepIndex: r.stepIndex + 1 }, `${plan.steps[r.stepIndex].label}完成`, '产物已传递至下一步。'); continue; }
      patch({ producing: true }, '准备演示成果', '不调用真实模型，示例内容不代表提示词生成效果。');
      try {
        const artifacts = await pilotAdapter.produceArtifacts(r, revision.output);
        const latest = get().tasks.find(t => t.id === task.id)?.runs.find(x => x.id === r.id);
        if (latest?.status === 'running') patch({ status: 'completed', producing: false, artifacts, quality: r.scenario === 'quality' ? 'failed' : 'not_evaluated' }, '执行完成');
      } catch (e) { const latest = get().tasks.find(t => t.id === task.id)?.runs.find(x => x.id === r.id); if (latest?.status === 'running') patch({ status: 'failed', producing: false, error: e instanceof Error ? e.message : '演示成果准备失败。' }, '成果准备失败'); }
    }
  },
}), {
  name: recordingMode ? 'comfytree-recording-cases-v1' : liveMode ? 'comfypilot-live-v1' : 'comfypilot-v1', version: 2, storage: pilotStorage,
  migrate: (saved) => ({ ...(saved as Partial<Store>), theme: 'light', sidebarCollapsed: false, tasks: ((saved as Partial<Store>)?.tasks ?? []).map(t => ({ ...t, origin: t.origin ?? 'workbench', agentBusy: false })) }),
  partialize: s => ({ tasks: s.tasks, batches: s.batches, libraryAssets: s.libraryAssets, assetGroups: s.assetGroups, assetGroupById: s.assetGroupById, theme: s.theme, palette: s.palette, view: s.view, scenario: s.scenario, sidebarCollapsed: s.sidebarCollapsed }),
}));
export function taskState(task: Creation) { const run = task.runs.at(-1); if (run && isActive(run)) return run.status; if (task.planning || task.agentBusy) return 'planning'; if(task.planningError)return 'planning_failed'; if(currentPlan(task)&&!planIsFresh(task))return 'draft'; if (currentPlan(task)?.blockers.length) return 'blocked'; if(currentPlan(task)&&!task.runs.some(r=>r.planId===currentPlan(task)?.id))return 'ready'; if (run) return run.status; return task.plans.length ? 'ready' : 'draft'; }
export function newCapabilityTask(id: string) { const c = CAPABILITIES.find(c => c.id === id)!; return usePilot.getState().newTask({ text: c.prompt, output: c.kind, capabilityId: c.id }); }
export function startMockEngine() {
  if(recordingMode)return()=>{};
  if(liveMode){void usePilot.getState().syncLive();const timer=setInterval(()=>void usePilot.getState().syncLive(),2000);return()=>clearInterval(timer);}
  const timer = setInterval(() => { void usePilot.getState().tick(); }, 400);
  const resume = () => { if (!document.hidden) void usePilot.getState().tick(); };
  document.addEventListener('visibilitychange', resume);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
}
