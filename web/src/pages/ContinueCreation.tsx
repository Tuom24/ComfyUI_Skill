import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Image, Film, MessageSquare, SlidersHorizontal } from 'lucide-react';
import type { Artifact, Creation } from '../domain';
import { Media, Modal } from '../components';
import { usePilot } from '../store';
import { ensureCurrentBuild } from '../buildGuard';

export function ContinueCreationDialog({ task, artifact, onClose }: { task: Creation; artifact: Artifact; onClose():void }) {
  const navigate=useNavigate();
  const opening=useRef(false);
  const [busy,setBusy]=useState(false);
  const run=task.runs.find(r=>r.id===artifact.runId);
  const revision=task.revisions.find(v=>v.id===run?.revisionId);
  async function proceed(destination:'assistant'|'workbench') {
    if(opening.current)return;
    opening.current=true;setBusy(true);
    try {
      if(!await ensureCurrentBuild()){onClose();return;}
      const id=usePilot.getState().continueFrom(task.id,artifact.id,destination);
      onClose();
      if(destination==='workbench')navigate(`/workbench/${id}`);
      else if(!window.location.hash.startsWith(`/assistant/${id}`,1))navigate(`/assistant/${id}`);
    } catch(error) {
      opening.current=false;setBusy(false);
      usePilot.getState().notify(error instanceof Error?error.message:'无法带入这份结果，请重试。');
    }
  }
  return <Modal title="作为新输入继续创作" className="continue-creation-modal" onClose={onClose}>
    <div className="continue-source-preview"><div><Media media={artifact}/></div><div><span>{artifact.kind==='video'?<Film size={12}/>:<Image size={12}/>}所选{artifact.kind==='video'?'视频':'图片'}{revision?` · 版本 ${revision.number}`:''}</span><strong>{artifact.name}</strong><p>设为本轮输入，沿用当前创作上下文。</p></div></div>
    <p className="continue-destination-label">接下来，想用哪种方式？</p>
    <div className="continue-destinations">
      <button disabled={busy} onClick={()=>proceed('assistant')} aria-label="继续在快速生成中"><MessageSquare size={21}/><span><strong>继续在快速生成中</strong><small>保留这段对话，通过新要求继续调整</small></span><ArrowRight size={17}/></button>
      <button disabled={busy} onClick={()=>proceed('workbench')} aria-label="进入工作台调整"><SlidersHorizontal size={21}/><span><strong>进入工作台调整</strong><small>亲手编辑提示词、素材绑定和参数</small></span><ArrowRight size={17}/></button>
    </div>
    <p className="continue-footnote">在当前创作内准备下一轮输入，保留对话与各版成果。补充要求后再运行。</p>
  </Modal>;
}

export function ContinuationContext({ task }: { task: Creation }) {
  const source=usePilot(s=>s.tasks.find(t=>t.id===task.continuedFrom?.taskId));
  const run=source?.runs.find(r=>r.id===task.continuedFrom?.runId);
  const artifact=run?.artifacts.find(a=>a.id===task.continuedFrom?.artifactId);
  if(!artifact||!source)return null;
  const included=task.draft.assets.some(a=>a.id===artifact.id);
  const revision=source.revisions.find(v=>v.id===run?.revisionId);
  return <div className="continuation-context"><div className="continuation-context-media"><Media media={artifact}/></div><div><span>从生成结果继续{revision?` · 版本 ${revision.number}`:''}</span><strong>{artifact.name}</strong><small>{included?'已带入本次输入':'已从本次输入移除'}</small></div>{source.id===task.id?<button className="text-button" onClick={()=>document.getElementById(`run-${run?.id}`)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'center'})}>定位来源<ArrowUpRight size={12}/></button>:<Link to={`/${source.origin==='assistant'?'assistant':'workbench'}/${source.id}`} className="text-button">查看来源<ArrowUpRight size={12}/></Link>}</div>;
}
