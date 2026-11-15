import { liveApi, liveMode } from './liveApi';
import type { Artifact, Benchmark, Capability, Draft, Plan, Revision, Run, Scenario, Step } from './domain';
import { CAPABILITIES, PROTOCOL } from './data';
import { makeDemoArtifacts, uid } from './media';
import { resourceIssues } from './resources';
import { loadCatalog, type WorkflowDefinition } from './catalog';
import { bindProvisionalSlots, draftSlots } from './inputSlots';

/** Backend boundary: UI never depends on ComfyUI or experiment filesystem paths. */
export interface PilotAdapter {
  readonly source: 'demo' | 'live';
  createPlan(revision: Revision, scenario: Scenario, options?: { requestId: string; signal?: AbortSignal }): Promise<Plan>;
  produceArtifacts(run: Run, output: Draft['output']): Promise<Artifact[]>;
  capabilities(): Promise<Capability[]>;
}
export function inferCapability(draft: Draft): Capability {
  const explicit = CAPABILITIES.find(c => c.id === draft.capabilityId); if (explicit) return explicit;
  const text = draft.spec?.instruction || draft.text;
  if (draft.output==='image' && draft.assets.some(a=>a.role==='reference') && !draft.assets.some(a=>a.role==='source')) return { ...CAPABILITIES[1], id:'style-reference', name:'参考画风生成新画面', required:['reference'], workflow:'W15a0d5db12', description:'参考输入图片的视觉风格，为本轮描述生成新画面。' };
  const id = /遮罩|局部|肤色/.test(text) ? 'local-edit' : draft.output === 'video' ? /先.*再|组合/.test(text) ? 'chain' : 'image-video' : (/修改|编辑|原图|输入图片|转换.*风格/.test(text) || draft.assets.some(a=>a.kind==='image'&&a.role==='source')) ? 'image-edit' : 'text-image';
  return CAPABILITIES.find(c => c.id === id)!;
}
export function buildMockPlan(revision: Revision, scenario: Scenario, catalog: WorkflowDefinition[] = []): Plan {
  const capability = inferCapability(revision);
  const blockers: Plan['blockers'] = resourceIssues(revision.assets);
  const roles = revision.assets.map(a => a.role);
  const names = { source: '待处理图片', mask: '区域遮罩', video: '输入视频', reference: '参考图片', start_frame: '起始帧', end_frame: '结束帧', driving: '动作驱动视频', unassigned: '明确用途的素材' };
  for (const role of revision.preferredWorkflow ? [] : capability.required) if (!roles.includes(role)) blockers.push({ code: `missing_${role}`, message: `需要补充${names[role]}，或将已有素材的用途设为${names[role]}。` });
  for (const a of revision.assets) {
    if ((a.role === 'source' || a.role === 'reference') && a.kind !== 'image') blockers.push({ code: 'media_contract', message: `${a.name} 的文件类型与用途不兼容。` });
    if (a.role === 'video' && a.kind !== 'video') blockers.push({ code: 'media_contract', message: `${a.name} 不是视频，请修改用途。` });
  }
  if (scenario === 'dependency' || capability.state !== 'available') blockers.push({ code: 'dependency_missing', message: '所需模型或插件在当前演示环境不可用，请在团队工具查看依赖。' });
  if (scenario === 'no_match') blockers.push({ code: 'routing_failed', message: '本次候选中没有覆盖完整需求的可执行组合。已保留输入，可修改需求后创建新方案。' });
  if (!revision.preferredWorkflow && revision.output !== capability.kind) blockers.push({ code: 'output_mismatch', message: `当前选择的能力输出${capability.kind === 'image' ? '图片' : '视频'}，请调整输出形式或重新选择能力。` });
  const chosen = catalog.find(w => w.id === revision.preferredWorkflow);
  if (revision.preferredWorkflow && !chosen) blockers.push({ code: 'workflow_missing', message: '选定模板未在当前目录中找到，请重新选择。' });
  const first: Step = { id: 'step-1', label: chosen ? chosen.description.split('\n')[0].replace('功能：','').replace('。','') : capability.id === 'chain' ? '调整画面风格' : capability.name, description: chosen?.description ?? (capability.id === 'chain' ? '保留主体，调整输入图片的风格与色调。' : capability.description), workflow: chosen?.id ?? capability.workflow.split(' → ')[0], inputs: revision.assets.length ? revision.assets.map(a => a.id) : ['文本需求'], output: capability.id === 'chain' && !chosen ? 'image' as const : revision.output, dependsOn: [], prompt: revision.text };
  const steps: Step[] = capability.id === 'chain' && !chosen ? [first, { id: 'step-2', label: '让画面动起来', description: '将上一步的图片作为输入，生成缓慢推进的视频。', workflow: 'We9ebcd7c4b', inputs: ['step-1'], output: 'video' as const, dependsOn: ['step-1'], prompt: revision.text }] : [first];
  for (const step of steps) {
    const edit = revision.stageEdits?.[step.id]; if (!edit) continue;
    if (edit.workflowId && !catalog.some(w => w.id === edit.workflowId)) blockers.push({ code: 'workflow_missing', message: `步骤 ${step.id} 的模板不存在。` });
    if (edit.inputs?.some(id => !revision.assets.some(a => a.id === id) && !step.dependsOn.includes(id))) blockers.push({ code: 'binding_missing', message: `步骤 ${step.id} 引用了不存在的输入。` });
    const definition = catalog.find(w => w.id === (edit.workflowId ?? step.workflow));
    if (edit.inputs?.length === 0 && (definition ? !definition.modality.startsWith('t') : capability.required.length > 0)) blockers.push({ code: 'empty_binding', message: `步骤 ${step.id} 缺少必要的素材绑定。` });
    if (definition) {
      for (const [key,value] of Object.entries(edit.parameters ?? {})) {
        const slot = definition.parameters.find(p => p.key === key);
        if (!slot || typeof value !== slot.type || typeof value === 'number' && (!Number.isFinite(value)||slot.integer&&!Number.isInteger(value)||slot.min!==undefined&&value<slot.min||slot.max!==undefined&&value>slot.max)||slot.options&&!slot.options.includes(value)) blockers.push({ code: 'invalid_parameter', message: `步骤 ${step.id} 的参数 ${key} 与当前模板不兼容。请在「流程与参数」恢复模板参数，或重新选择模板。` });
      }
    }
    Object.assign(step, { workflow: edit.workflowId ?? step.workflow, prompt: edit.prompt ?? step.prompt, inputs: edit.inputs ?? step.inputs, parameters: edit.parameters ?? {} });
  }
  for (const step of steps) {
    const definition = catalog.find(w => w.id === step.workflow); if (!definition) continue;
    const bound = revision.assets.filter(a => step.inputs.includes(a.id));
    const upstream = steps.filter(s => step.dependsOn.includes(s.id) && step.inputs.includes(s.id));
    const inputDescription = definition.description.split('输入：')[1]?.split('输出：')[0] ?? '';
    const imageRoles=definition.operation==='Style_Editing/style_cloning'?['reference']:['source','start_frame'];
    if (['i2i','i2v'].includes(definition.modality) && !bound.some(a => a.kind === 'image' && imageRoles.includes(a.role)) && !upstream.some(s => s.output === 'image')) blockers.push({ code: 'missing_stage_source', message: `步骤 ${step.id} 需要绑定${imageRoles.includes('reference')?'风格参考图':'原图、起始帧或上游图片'}。` });
    const videos = bound.filter(a => a.kind === 'video' && a.role !== 'mask').length + upstream.filter(s => s.output === 'video').length;
    if (definition.modality === 'v2v' && !videos) blockers.push({ code: 'missing_stage_video', message: `步骤 ${step.id} 需要绑定输入视频或上游视频。` });
    if (/蒙版|遮罩/.test(inputDescription) && !bound.some(a => a.role === 'mask')) blockers.push({ code: 'missing_stage_mask', message: `步骤 ${step.id} 的模板需要遮罩；仅上传遮罩还需要绑定到这个阶段。` });
    for (const mask of bound.filter(a => a.role === 'mask')) if (!bound.some(a => a.id === mask.targetAssetId)) blockers.push({ code: 'mask_target_binding', message: `步骤 ${step.id} 绑定了遮罩，但没有绑定它对应的目标素材。` });
    if (definition.operation === 'Generation/keyframe_interpolation') for (const role of ['start_frame','end_frame'] as const) if (!bound.some(a => a.role === role)) blockers.push({ code: `missing_${role}`, message: `步骤 ${step.id} 需要分别绑定起始帧与结束帧。` });
    if (/两个视频|两段视频|两路视频/.test(inputDescription) && videos < 2) blockers.push({ code: 'missing_second_video', message: `步骤 ${step.id} 需要分别绑定两个视频片段。` });
    if ((definition.modality.endsWith('v') ? 'video' : 'image') !== step.output) blockers.push({ code: 'output_mismatch', message: `步骤 ${step.id} 的模板输出与当前阶段不一致，请重新选择模板。` });
  }
  for(const step of steps) {
    const definition=catalog.find(w=>w.id===step.workflow);
    step.inputSlots=draftSlots(definition,step,revision);step.contractStatus='provisional';
    const {bindings,issues}=bindProvisionalSlots(step,revision,steps,revision.stageEdits?.[step.id]?.slotBindings);
    step.slotBindings=bindings;blockers.push(...issues);
  }
  const requirementChecks: NonNullable<Plan['requirementChecks']> = [];
  const constraints=revision.spec?.constraints;
  const finalStep=steps.at(-1)!;
  const finalDefinition=catalog.find(w=>w.id===finalStep.workflow);
  function effective(names:string[]) { const field=finalDefinition?.parameters.find(p=>names.includes(p.name));return field ? Number(finalStep.parameters?.[field.key]??field.value) : undefined; }
  function check(key:string,label:string,requested:string,compiled:string|undefined,matched:boolean|undefined,detail:string) {
    const status=matched===undefined?'unverified':matched?'matched':'mismatch';
    requirementChecks.push({key,label,requested,compiled,status,detail});
    if(status==='mismatch')blockers.push({code:`constraint_${key}`,message:`${label}尚未满足：${detail}`});
  }
  if(constraints) {
    for(const [key,value]of Object.entries(constraints))if(typeof value==='number'&&(!Number.isFinite(value)||value<=0||['count','width','height'].includes(key)&&!Number.isInteger(value)))blockers.push({code:'invalid_requirement',message:`数值要求 ${key} 需要为有效正数；尺寸与数量需为整数。`});
    const fps=effective(['fps','frame_rate']);const frames=effective(['length','num_frames']);
    const width=effective(['width']);const height=effective(['height']);
    if(constraints.durationSeconds!==undefined) {
      const duration=fps&&frames?frames/fps:undefined;
      check('duration','成片时长',`${constraints.durationSeconds} 秒`,duration?`${frames} 帧 / ${fps} fps ≈ ${duration.toFixed(2)} 秒`:undefined,duration===undefined?undefined:Math.abs(duration-constraints.durationSeconds)<.001,duration===undefined?'等待运行服务返回帧数、编码与裁剪校验。':`当前模板约 ${duration.toFixed(2)} 秒，目标 ${constraints.durationSeconds} 秒；需核对模型帧数规则与最终成片时长。`);
    }
    if(constraints.fps!==undefined)check('fps','帧率',`${constraints.fps} fps`,fps?`${fps} fps`:undefined,fps===undefined?undefined:fps===constraints.fps,'模板帧率须与需求一致。');
    if(constraints.width&&constraints.height)check('size','输出尺寸',`${constraints.width} × ${constraints.height}`,width&&height?`${width} × ${height}`:undefined,width&&height?width===constraints.width&&height===constraints.height:undefined,'需要核对实际宽高与节点允许的尺寸步长。');
    if(constraints.ratio) {
      const parts=constraints.ratio.split(':').map(Number);const wanted=parts.length===2?parts[0]/parts[1]:undefined;
      const matched=width&&height?(constraints.ratio==='横版'?width>height:constraints.ratio==='竖版'?height>width:wanted?Math.abs(width/height-wanted)<.01:undefined):undefined;
      check('ratio','画面比例',constraints.ratio,width&&height?`${width} × ${height}`:undefined,matched,'模板尺寸与目标画面比例须一致。');
    }
    if(constraints.count)check('count','成果数量',`${constraints.count} 份`,undefined,undefined,'等待执行服务确认批次大小与实际成果数量。');
  }
  return { id: uid(), revisionId: revision.id, summary: revision.text, steps, blockers, createdAt: Date.now(), source:'demo', requirementChecks, workflowVersions: steps.flatMap(step=>{const w=catalog.find(row=>row.id===step.workflow);return w?[{workflowId:w.id,sha256:w.sha256}]:[];}) };
}
export const mockAdapter: PilotAdapter = {
  source: 'demo',
  async createPlan(revision, scenario, options) {
    await new Promise<void>((resolve,reject)=>{
      const signal=options?.signal;
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Planning cancelled','AbortError'));};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},800);
      if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    });
    let catalog: WorkflowDefinition[] = []; if (typeof window !== 'undefined') catalog = await loadCatalog();
    options?.signal?.throwIfAborted();return buildMockPlan(revision, scenario, catalog);
  },
  produceArtifacts: (run, output) => makeDemoArtifacts(run.id, output),
  capabilities: async () => CAPABILITIES,
};
export const pilotAdapter: PilotAdapter = liveMode ? {
  source: 'live',
  createPlan: (revision, _scenario, options) => liveApi.plan(revision, options?.signal),
  produceArtifacts: async () => { throw new Error('真实成果由执行服务返回。'); },
  capabilities: async () => CAPABILITIES,
} : mockAdapter;

function object(x: unknown): x is Record<string, unknown> { return !!x && typeof x === 'object' && !Array.isArray(x); }
export function parseBenchmark(input: unknown): Benchmark {
  if (!object(input) || input.schemaVersion !== 1 || !object(input.protocol) || !Array.isArray(input.cases)) throw new Error('请导入 schemaVersion: 1 的评测 JSON，包含 protocol 和 cases。');
  if (input.source !== 'imported' && input.source !== 'demo') throw new Error('source 必须是 imported 或 demo；演示数据不能声明为真实导入。');
  if (typeof input.name !== 'string' || !input.name.trim() || !Number.isInteger(input.total) || Number(input.total) < 1 || input.cases.length > Number(input.total)) throw new Error('名称、总样本数或案例数量不合法。');
  const p = input.protocol;
  for (const key of Object.keys(PROTOCOL)) if (typeof p[key] !== typeof PROTOCOL[key as keyof typeof PROTOCOL]) throw new Error(`协议字段 ${key} 缺失或类型不正确。`);
  for (const key of ['workflowCount', 'topK', 'queryLimit', 'maxAttempts']) if (!Number.isInteger(p[key]) || Number(p[key]) < 1) throw new Error(`协议字段 ${key} 必须为正整数。`);
  if (Number(p.topK) > Number(p.workflowCount)) throw new Error('检索 Top-K 不能超过工作流总数。');
  const ids = new Set<string>();
  for (const c of input.cases) {
    if (!object(c) || typeof c.id !== 'string' || !c.id || ids.has(c.id) || typeof c.prompt !== 'string' || !['passed', 'failed', 'pending'].includes(String(c.routing)) || !['completed', 'failed', 'pending', 'not_run'].includes(String(c.execution)) || !['passed', 'failed', 'pending', 'not_evaluated'].includes(String(c.quality)) || !Number.isInteger(c.attempts) || Number(c.attempts) < 0 || Number(c.attempts) > Number(p.maxAttempts) || !Array.isArray(c.evidence) || !c.evidence.every((e: unknown) => typeof e === 'string')) throw new Error('案例字段无效、ID 重复或执行次数超出协议限制。');
    if ((c.routing !== 'passed' && !['pending', 'not_run'].includes(String(c.execution))) || (c.execution !== 'completed' && ['passed', 'failed'].includes(String(c.quality))) || (c.execution === 'completed' && Number(c.attempts) === 0)) throw new Error(`案例 ${c.id} 的路由、执行与评价状态互相矛盾。`);
    if (c.routing === 'failed' && (c.execution !== 'not_run' || c.quality !== 'not_evaluated' || c.attempts !== 0) || c.routing === 'pending' && (c.execution !== 'pending' || !['pending', 'not_evaluated'].includes(String(c.quality)) || c.attempts !== 0) || c.execution === 'failed' && (Number(c.attempts) === 0 || c.quality !== 'not_evaluated')) throw new Error(`案例 ${c.id} 的失败、待处理或尝试次数不一致。`);
    if (c.artifact !== undefined && (typeof c.artifact !== 'string' || !c.artifact.startsWith('/art/'))) throw new Error('导入文件不接受远程产物地址；请通过后端素材服务接入产物。');
    ids.add(c.id);
  }
  if (!['running', 'completed'].includes(String(input.status))) throw new Error('批次状态必须是 running 或 completed。');
  if (input.status === 'completed' && (input.cases.length !== input.total || input.cases.some(c => c.routing === 'pending' || c.execution === 'pending' || c.quality === 'pending'))) throw new Error('已完成批次必须覆盖全部案例且没有待处理状态。');
  return { id: uid(), name: input.name.trim(), total: Number(input.total), protocol: p as unknown as Benchmark['protocol'], cases: input.cases as Benchmark['cases'], createdAt: Date.now(), status: input.status as Benchmark['status'], source: input.source };
}
