import { ArrowRight, Check, ChevronDown, FileImage, Film, Layers3, Play } from 'lucide-react';
import type { Creation, Plan } from '../domain';
import { canConfirm, currentPlan, fingerprint } from '../domain';
import { Button } from '../components';
import { ROLE_LABEL } from '../data';
import { assetLabel } from '../resources';
import { usePilot } from '../store';

export function PlanCard({ task, plan, workbench=false }: { task: Creation; plan: Plan; workbench?: boolean }) {
  const connected=usePilot(s=>s.connected);
  const revision=task.revisions.find(r=>r.id===plan.revisionId);
  if(!revision)return null;
  const used=task.runs.some(r=>r.planId===plan.id);
  const fresh=revision.fingerprint===fingerprint(task.draft)&&currentPlan(task)?.id===plan.id;
  const spec=revision.spec;
  return <section className="creation-plan" aria-label={`版本 ${revision.number} 的执行方案`}>
    <div className="creation-plan-heading"><span><Layers3 size={14}/>执行方案 · 版本 {revision.number}</span><small>{plan.source==='recorded'?'历史案例':plan.source==='live'?'服务端方案':'规则演示'} · {used?'已提交':!fresh?'历史方案':plan.source==='live'&&plan.runtimeValidation!=='passed'?'预检待通过':plan.blockers.length?'待补充':'可执行'}</small></div>
    <h3>{spec?.goal??revision.text.split('\n')[0]}</h3>
    {spec?.changes.length ? <p className="plan-change-summary">本轮调整：{spec.changes.join('；')}</p> : null}
    <div className="plan-output-summary">{revision.output==='video'?<Film size={14}/>:<FileImage size={14}/>}输出{revision.output==='video'?'视频':'图片'}{spec?.constraints.durationSeconds!==undefined?` · 目标 ${spec.constraints.durationSeconds} 秒`:''}{spec?.constraints.ratio?` · ${spec.constraints.ratio}`:''}</div>
    <div className="plan-input-summary"><span>采用输入</span><p>{revision.assets.length?revision.assets.map(a=>`${assetLabel(a)}（${ROLE_LABEL[a.role]}）`).join('、'):'文字描述'}</p></div>
    <ol className="readable-plan-steps">{plan.steps.map((step,i)=><li key={step.id}><span>{String(i+1).padStart(2,'0')}</span><div>{step.label}</div>{i<plan.steps.length-1&&<ArrowRight size={13}/>}</li>)}</ol>
    {!!plan.requirementChecks?.length&&<div className="plan-checks"><table><caption>需求与参数核对</caption><thead><tr><th>用户要求</th><th>方案参数</th><th>核验</th></tr></thead><tbody>{plan.requirementChecks.map(c=><tr key={c.key}><td><strong>{c.label}</strong><span>{c.requested}</span></td><td>{c.compiled??'等待编译'}<small>{c.detail}</small></td><td><span className={`plan-check-state ${c.status}`}>{c.status==='matched'?<Check size={12}/>:null}{c.status==='matched'?'一致':c.status==='mismatch'?'未满足':'待核验'}</span></td></tr>)}</tbody></table></div>}
    {!!plan.blockers.length&&<div className="plan-blockers"><strong>本轮尚未执行</strong>{plan.blockers.map(b=><p key={`${b.code}-${b.message}`}>{b.message.replace(/JEV\s*分类树/g,'自动规划')}</p>)}</div>}
    {plan.confirmationReason&&<p className="plan-confirmation-reason">需要确认：{plan.confirmationReason.replace(/JEV\s*分类树/g,'自动规划')}</p>}
    {!workbench&&!used&&fresh&&canConfirm(task)&&<div className="plan-actions"><Button disabled={!connected} onClick={()=>usePilot.getState().confirmRun(task.id,workbench?'workbench':'assistant',plan.id)}><Play size={13}/>确认生成</Button><span>执行此版本的方案与输入</span></div>}
    <details className="plan-evidence"><summary>查看技术依据<ChevronDown size={12}/></summary><p>{plan.retrieval?`已检索 ${plan.retrieval.queryCount} 次，Top-${plan.retrieval.topK}；${plan.retrieval.selectionReason}`:plan.source==='recorded'?'阶段与工作流来自团队提供的历史案例记录。':plan.source==='live'?'已根据创作需求选择处理流程。':'当前为规则演示，未返回真实检索与联合选择证据。'}</p>{plan.retrieval&&<p>候选：{plan.retrieval.candidateIds.join('、')}<br/>证据索引：{plan.retrieval.evidenceRef}</p>}<dl>{plan.steps.map(step=><div key={step.id}><dt>{step.label}</dt><dd><code>{step.workflow}</code><span>输入：{step.inputs.join('、')}</span><span>依赖：{step.dependsOn.join('、')||'无上游'}</span>{plan.workflowVersions?.find(w=>w.workflowId===step.workflow)&&<small>工作流 SHA256：{plan.workflowVersions.find(w=>w.workflowId===step.workflow)?.sha256}</small>}</dd></div>)}</dl><p>模型、依赖与节点槽位需由运行服务最终预检。模板哈希不代表环境已验证。</p></details>
  </section>;
}
