import { liveMode } from '../liveApi';
import { useEffect, useId, useState } from 'react';
import { Check, Clock3, FileImage, Film, Pause, Radio, Wrench } from 'lucide-react';
import type { Creation, Run } from '../domain';
import { generationPresentation, elapsedLabel } from '../generation';
import { usePilot } from '../store';

export function GenerationPreview({ task, run, compact=false }: { task: Creation; run?: Run; compact?: boolean }) {
  const connected=usePilot(s=>s.connected);
  const [now,setNow]=useState(Date.now());
  const id=useId();
  useEffect(()=>{if(!run)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[run?.id]);
  const view=generationPresentation(run,connected);
  const revision=task.revisions.find(r=>r.id===run?.revisionId);
  const plan=task.plans.find(p=>p.id===run?.planId);
  const output=revision?.output??task.draft.output;
  const steps=plan?.steps??[];
  const step=steps[run?.stepIndex??0];
  return <section className={`generation-preview ${compact?'generation-compact':''} ${view.moving?'is-moving':'is-paused'}`} data-phase={view.phase} aria-label="生成展示区" aria-busy="true">
    <div className="generation-canvas">
      <div className="generation-canvas-heading"><span>{output==='video'?<Film size={13}/>:<FileImage size={13}/>} {output==='video'?'视频':'图片'}创作</span><span>{liveMode?'生成中':'模拟运行'}</span></div>
      <div className="generation-art" aria-hidden="true">
        <div className="generation-sheet sheet-back"/><div className="generation-sheet sheet-middle"/>
        <div className="generation-sheet sheet-front"><svg viewBox="0 0 240 280"><defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--art-soft)"/><stop offset="1" stopColor="var(--art-base)"/></linearGradient></defs><rect x="14" y="14" width="212" height="252" rx="2" fill={`url(#${id})`}/><circle className="generation-sun" cx="167" cy="83" r="28" fill="var(--art-warm)"/><path d="M14 205Q70 138 131 198T226 187V266H14Z" fill="var(--art-ink)" opacity=".28"/><path className="generation-contour" d="M70 235V126Q70 60 121 60Q172 60 172 126V235M86 235V127Q86 80 121 80Q156 80 156 127V235M104 235V131Q104 104 121 104Q138 104 138 131V235" fill="none" stroke="var(--art-ink)" strokeWidth="1.5"/><path d="M30 244H207" stroke="var(--art-ink)" opacity=".5"/></svg><div className="generation-scan"/></div>
        <div className="generation-orbit"><i/><i/><i/></div>
        <span className="generation-center-state">{!view.moving?<Pause size={17}/>:view.phase==='repairing'?<Wrench size={17}/>:<Radio size={18}/>}</span>
      </div>
      <p className="generation-visual-note">动态状态示意 · 非生成中间画面</p>
    </div>
    <div className="generation-caption"><div className="generation-status" role="status" aria-live="polite"><span className={`generation-dot ${view.moving?'':'paused'}`}/><h3>{view.title}</h3></div><p>{view.detail}</p>
      <div className="generation-indeterminate" role="progressbar" aria-label="生成阶段" aria-valuetext={view.title}><span/></div>
      {run && <div className="generation-metadata"><span><Clock3 size={12}/>已用时 <time aria-live="off">{elapsedLabel(run.startedAt,now)}</time></span><span>版本 {revision?.number??'—'} · 尝试 {run.attempt}/{run.maxAttempts}</span></div>}
      {!!steps.length && <ol className="generation-steps" aria-label="执行步骤">{steps.map((s,i)=>{
        const done=i<(run?.stepIndex??0);
        const current=i===(run?.stepIndex??0)&&run?.status!=='queued';
        return <li key={s.id} className={done?'done':current?'current':''} aria-current={current?'step':undefined}><span>{done?<Check size={11}/>:String(i+1).padStart(2,'0')}</span><div>{s.label}<small>{done?'已完成':current?view.phase==='restoring'?'最后确认阶段':view.phase==='stopping'?'等待停止':view.phase==='repairing'?'正在修复':run?.producing?'准备成果':'正在处理':'等待处理'}</small></div></li>;
      })}</ol>}
      {step && <p className="generation-stage-source">当前模板 {step.workflow}</p>}
    </div>
  </section>;
}
