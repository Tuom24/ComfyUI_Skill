import { liveMode, recordingMode } from '../liveApi';
import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Download, Expand, FileImage, Film, Link2, LoaderCircle, Plus, RotateCcw, Square, ThumbsDown, ThumbsUp, Upload, X } from 'lucide-react';
import type { Artifact, Asset, Creation, Run } from '../domain';
import { isActive } from '../domain';
import { LIMITS, ROLE_LABEL, RUN_LABEL } from '../data';
import { assetLabel, resourceIssues } from '../resources';
import { assertUploadBatch, downloadMedia, saveUpload } from '../media';
import { usePilot } from '../store';
import { Badge, Button, Empty, IconButton, Media, Modal, Notice, formatDate, formatSize } from '../components';
import { AssetPicker } from './AssetPicker';
import { GenerationPreview } from './GenerationPreview';
import { ContinueCreationDialog } from './ContinueCreation';
import { ensureCurrentBuild } from '../buildGuard';

export function ResourceEditor(props: {task:Creation;compact?:boolean}) {
  return <DetailedResourceEditor {...props}/>;
}
function SimpleResourceEditor({task,compact=false}:{task:Creation;compact?:boolean}) {
  const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function upload(files:FileList|null) {
    if(!files?.length||busy)return;setBusy(true);setError('');
    try {assertUploadBatch(files,task.draft.assets.length);for(const file of Array.from(files))usePilot.getState().addAsset(task.id,await saveUpload(file));}
    catch(e){setError(e instanceof Error?e.message:'上传失败');}finally{setBusy(false);if(input.current)input.current.value='';}
  }
  return <div className={`resource-editor ${compact?'resource-compact':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void upload(e.dataTransfer.files);}}>
    <div className="resource-title"><h3>附件</h3><div><input ref={input} type="file" multiple hidden accept={LIMITS.accepted.join(',')} aria-label="添加附件" onChange={e=>void upload(e.target.files)}/><Button variant="secondary" disabled={busy||task.draft.assets.length>=LIMITS.maxAssets} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={14} className="spin"/>:<Plus size={14}/>}添加文件</Button></div></div>
    {error&&<Notice tone="error">{error}</Notice>}
    <div className="resource-rows">{task.draft.assets.map(a=><div className="resource-row" key={a.id}><div className="resource-preview"><Media media={a}/></div><div className="resource-name"><strong>{a.name}</strong><small>{formatSize(a.size)}</small></div><IconButton label={`移除 ${a.name}`} onClick={()=>usePilot.getState().removeAsset(task.id,a.id)}><X size={14}/></IconButton></div>)}</div>
  </div>;
}

function DetailedResourceEditor({ task, compact = false }: { task: Creation; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null); const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [editing,setEditing] = useState<string>(); const [picker,setPicker] = useState(false);
  async function upload(files: FileList | null) { if (!files?.length || busy) return; setBusy(true);setError(''); try { assertUploadBatch(files,task.draft.assets.length); for (const file of Array.from(files)) { const asset = await saveUpload(file); usePilot.getState().addAsset(task.id,asset); setEditing(asset.id); } } catch(e) { setError(e instanceof Error ? e.message : '保存素材失败'); } finally { setBusy(false); if(input.current)input.current.value=''; } }
  const issues = resourceIssues(task.draft.assets);
  return <div className={`resource-editor ${compact ? 'resource-compact' : ''}`}><div className="resource-title"><div><h3>输入素材</h3><p>{compact ? '助手会核对素材用途；多份素材需要区分。' : '先定义每份素材是什么，再把它绑定到执行步骤。'}</p></div><div><input ref={input} type="file" hidden multiple accept={LIMITS.accepted.join(',')} aria-label="添加素材文件" onChange={e=>void upload(e.target.files)}/><Button variant="secondary" disabled={busy || task.draft.assets.length>=LIMITS.maxAssets} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={14} className="spin"/>:<Plus size={14}/>}添加素材</Button><IconButton label="从素材库选择" onClick={()=>setPicker(true)}><FileImage size={17}/></IconButton></div></div>
    {error && <Notice tone="error">{error}</Notice>}
    {!task.draft.assets.length ? <div className="resource-empty" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void upload(e.dataTransfer.files);}}><Upload size={17}/><span>{liveMode?'图片可拖入此处；视频尚未接入。':'图片或视频可拖入此处。'}纯文字生成无需素材。</span><small>{liveMode?'图片 ≤ 20 MB':'图片 ≤ 20 MB · 视频 ≤ 200 MB'}</small></div> : <div className="resource-rows">{task.draft.assets.map((a,i)=><div className="resource-record" key={a.id}><div className="resource-row"><span className="resource-number">{String(i+1).padStart(2,'0')}</span><div className="resource-preview"><Media media={a}/></div><button className="resource-name" onClick={()=>setEditing(editing===a.id?undefined:a.id)}><strong>{assetLabel(a)}</strong><small>{a.name} · {formatSize(a.size)}{a.width ? ` · ${a.width} × ${a.height}` : ''}</small></button><Badge tone={a.role==='unassigned'?'amber':'muted'}>{ROLE_LABEL[a.role]}</Badge><button className="text-button" onClick={()=>setEditing(editing===a.id?undefined:a.id)}>{editing===a.id?'收起':'定义'}<ChevronDown size={12}/></button><IconButton label={`移除 ${assetLabel(a)}`} onClick={()=>usePilot.getState().removeAsset(task.id,a.id)}><X size={14}/></IconButton></div>
      {a.role==='unassigned'&&<div className="resource-purpose-choice"><span>这份素材用作：</span><button className="text-button" onClick={()=>usePilot.getState().setRole(task.id,a.id,a.kind==='image'?'source':'video')}>{a.kind==='image'?'待编辑原图':'待处理视频'}</button><button className="text-button" onClick={()=>usePilot.getState().setRole(task.id,a.id,a.kind==='image'?'reference':'driving')}>{a.kind==='image'?'只参考风格':'动作驱动参考'}</button></div>}{editing===a.id&&<div className="resource-definition"><label>在需求中如何称呼它<input aria-label={`素材${i+1}名称`} value={a.label??a.name} onChange={e=>usePilot.getState().updateAsset(task.id,a.id,{label:e.target.value})} placeholder="例如：人物原图、建筑参考、背景片段"/></label><label>素材用途<select aria-label={`素材${i+1}用途`} value={a.role} onChange={e=>usePilot.getState().setRole(task.id,a.id,e.target.value as Asset['role'])}>{Object.entries(ROLE_LABEL).map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label><label className="full-field">补充说明<input aria-label={`素材${i+1}说明`} value={a.description??''} onChange={e=>usePilot.getState().updateAsset(task.id,a.id,{description:e.target.value})} placeholder="例如：只参考色调，不要替换人物身份"/></label>{a.role==='mask'&&<><label>遮罩对应的素材<select aria-label={`遮罩${i+1}目标`} value={a.targetAssetId??''} onChange={e=>usePilot.getState().updateAsset(task.id,a.id,{targetAssetId:e.target.value})}><option value="">选择对应的原图或视频</option>{task.draft.assets.filter(b=>b.id!==a.id&&b.role!=='mask'&&b.kind===a.kind).map(b=><option value={b.id} key={b.id}>{assetLabel(b)}</option>)}</select></label><label>白色区域表示<select aria-label={`遮罩${i+1}含义`} value={a.maskMode??''} onChange={e=>usePilot.getState().updateAsset(task.id,a.id,{maskMode:e.target.value as Asset['maskMode']})}><option value="">明确遮罩语义</option><option value="edit">允许修改的区域</option><option value="preserve">必须保留的区域</option></select></label></>}</div>}
    </div>)}</div>}
    {!!issues.length&&<p className="resource-validation"><span className="status-dot offline"/>{issues.length} 项素材定义需要确认。{compact?'可以展开「定义」补充后继续对话。':'运行前会检查未定义用途、遮罩关联与输入类型。'}</p>}
    {picker&&<AssetPicker excludedIds={task.draft.assets.map(a=>a.id)} onClose={()=>setPicker(false)} onSelect={a=>{usePilot.getState().addAsset(task.id,a);setEditing(a.id);}}/>}
  </div>;
}

export function RunLog({ task, run, compact = false }: { task: Creation; run: Run; compact?: boolean }) {
  const connected = usePilot(s => s.connected);
  const revision = task.revisions.find(r => r.id === run.revisionId);
  const plan = task.plans.find(p => p.id === run.planId);
  const origin = run.initiatedBy === 'workbench' ? '工作台 · ' : run.initiatedBy === 'assistant' ? '助手 · ' : '';
  return <div className={compact ? 'run-log compact-log' : 'run-log'}>
    <div className="run-status-line">
      <span className={`status-dot ${run.status === 'failed' ? 'offline' : ''}`}/>
      <strong>{RUN_LABEL[run.status]}</strong>
      <span>{run.source==='recorded'?'历史记录 · ':origin}版本 {revision?.number}{run.source==='recorded'?'':` · 尝试 ${run.attempt}/${run.maxAttempts}`}</span>
      {isActive(run) && <button className="text-button" disabled={run.status === 'cancel_requested' || !connected} onClick={() => usePilot.getState().cancelRun(task.id, run.id)}><Square size={11}/>{run.status === 'cancel_requested' ? '等待停止确认' : '停止'}</button>}
    </div>
    {['running', 'repairing'].includes(run.status) && plan && <p className="run-current-step">当前阶段 {run.stepIndex + 1}/{plan.steps.length} · {plan.steps[run.stepIndex]?.label}</p>}
    {!connected && <Notice>连接中断，等待恢复后核对状态；不会重新提交任务。</Notice>}
    <details open={!compact}><summary>执行记录 <ChevronDown size={12}/></summary><ol>{run.events.map((e, i) => <li key={`${e.at}-${i}`}><Check size={12}/><div><strong>{e.title}</strong>{e.detail && <p>{e.detail}</p>}</div><time>{formatDate(e.at)}</time></li>)}</ol></details>
    {run.error && <Notice tone="error">{run.error}</Notice>}
  </div>;
}

export function ResultGallery({ task, run, compact = false, pending = false }: { task: Creation; run?: Run; compact?: boolean; pending?: boolean }) {
  const active = run && isActive(run);
  return <>{(active || pending) && <GenerationPreview task={task} run={active ? run : undefined} compact={compact}/>}{(!active && !pending || !!run?.artifacts.length) && <ArtifactGallery task={task} run={run} compact={compact}/>}</>;
}

function ArtifactGallery({ task, run, compact = false }: { task: Creation; run?: Run; compact?: boolean }) {
  const [selected,setSelected] = useState(()=>{const q=recordingMode?new URLSearchParams(location.hash.split('?')[1]??'').get('result'):null;return q!==null?Math.max(0,Math.min(Number(q)||0,(run?.artifacts.length??1)-1)):Math.max(0,run?.artifacts.findIndex(a=>a.id===task.selectedArtifactId)??0)}); const [expanded,setExpanded] = useState<Artifact>(); const [compare,setCompare] = useState(()=>recordingMode&&new URLSearchParams(location.hash.split('?')[1]??'').get('compare')==='1'); const [note,setNote] = useState(run?.feedback?.text??''); const [continuing,setContinuing] = useState<Artifact|undefined>(()=>recordingMode&&new URLSearchParams(location.hash.split('?')[1]??'').get('continue')==='1'?run?.artifacts[selected]:undefined);const notify=usePilot(s=>s.notify);
  const artifact=run?.artifacts[selected]??run?.artifacts[0]; const revision=task.revisions.find(r=>r.id===run?.revisionId);const original=revision?.assets.find(a=>a.role==='source');
  async function download(a:Artifact){try{await downloadMedia(a);}catch(e){notify(e instanceof Error?e.message:'下载失败');}}
  if(!artifact)return <div className="result-wait"><div className="empty-media-outline"><FileImage size={27}/></div><h3>{run?.status==='failed'?'这次生成未完成':run?.status==='cancelled'?'已停止生成':'结果预览'}</h3><p>{run?.status==='failed'?'输入与运行记录已保留。查看失败原因，调整后可以再次运行。':run?.status==='cancelled'?'输入与编辑内容已保留，准备好后可以再次运行。':'执行后，作品与对应的版本会出现在这里。'}</p></div>;
  return <div className={`artifact-viewer ${compact?'compact-artifacts':''}`}><div className={`artifact-main ${compare&&original?'with-comparison':''}`}>{compare&&original&&<div><span>原始输入</span><Media media={original} controls/></div>}<div><span>{run?.source==='recorded'?'历史阶段结果':run?.source==='live'?(artifact.kind==='video'?'生成视频':'生成结果'):(artifact.kind==='video'?'示例视频':'示例结果')}</span><Media media={artifact} controls/>{artifact.kind==='image'&&<IconButton label="放大结果" className="artifact-expand" onClick={()=>setExpanded(artifact)}><Expand size={15}/></IconButton>}</div></div>{run!.artifacts.length>1&&<div className="artifact-switch">{run!.artifacts.map((a,i)=><button className={i===selected?'active':''} key={a.id} onClick={()=>{setSelected(i);usePilot.getState().selectArtifact(task.id,a.id);}}><img src={a.poster} alt={`结果${i+1}`}/></button>)}</div>}<div className="artifact-caption"><strong>{artifact.name}</strong><span>{run?.source==='recorded'?'团队提供的历史成果':run?.source==='live'?'生成成果':'原创插画 / 动画演示，未连接模型'}</span></div><div className="artifact-actions"><Button variant="secondary" onClick={()=>void download(artifact)}><Download size={14}/>下载{artifact.kind==='video'?'视频':'图片'}</Button>{original&&artifact.kind==='image'&&<button className="text-button" onClick={()=>setCompare(!compare)}>{compare?'关闭原图对比':'对比原图'}</button>}<button className="text-button" aria-haspopup="dialog" aria-expanded={!!continuing} onClick={async()=>{if(await ensureCurrentBuild())setContinuing(artifact);}}>作为新输入 <ChevronDown size={13}/></button></div>{run?.source!=='live'&&run?.source!=='recorded'&&<p className="quality-note">{run!.quality==='failed'?'模拟质量评价未通过。保留产物供检查。':'官方质量：未评测。执行完成与质量通过分开记录。'}</p>}{run?.feedback&&<p className="saved-feedback">已记录：{run.feedback.value==='good'?'符合预期':'需要改进'}{run.feedback.text?` · ${run.feedback.text}`:''}</p>}{<details className="feedback-section"><summary>记录反馈</summary><textarea aria-label="结果反馈" value={note} onChange={e=>setNote(e.target.value)} placeholder="哪些符合预期，哪些还需要修改？"/><div><button className="text-button" onClick={()=>usePilot.getState().feedback(task.id,run!.id,'good',note)}><ThumbsUp size={13}/>符合预期</button><button className="text-button" onClick={()=>usePilot.getState().feedback(task.id,run!.id,'improve',note)}><ThumbsDown size={13}/>需要改进</button></div></details>}{continuing&&<ContinueCreationDialog task={task} artifact={continuing} onClose={()=>setContinuing(undefined)}/>}{expanded&&<Modal title={artifact.name} wide onClose={()=>setExpanded(undefined)}><div className="expanded-media"><Media media={expanded}/></div></Modal>}</div>;
}
