import { recordedCases } from '../recordedCases';
import { liveMode, recordingMode } from '../liveApi';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArrowRight, ArrowUpRight, ArrowUp, Check, ChevronRight, Code2, Copy, Download, FileImage, Film, FolderOpen, Image, MessageSquare, Paperclip, Plus, Search, SlidersHorizontal, Upload, Workflow } from 'lucide-react';
import { Badge, Button, Empty, IconButton, Media, Modal, Notice, SectionTitle, formatDate, formatSize } from '../components';
import { CAPABILITIES, LIMITS, ROLE_LABEL, RUN_LABEL } from '../data';
import type { Asset, Capability } from '../domain';
import { assertUploadBatch, downloadJSON, saveUpload, uid } from '../media';
import { taskState, usePilot } from '../store';
import { MODALITIES, PARAMETER_NAMES, workflowTitle, type WorkflowDefinition } from '../catalog';
import { useCatalog } from '../hooks';
import { assetLabel } from '../resources';
import { WorkflowBrowser } from './WorkflowGallery';
import { recentCreations, uniqueCreations } from '../recentCreations';

export function launchExample(c:Capability,withDemo=true){const id=usePilot.getState().newTask({text:c.prompt,output:c.kind,capabilityId:c.id},'assistant');if(withDemo&&c.required.includes('source'))usePilot.getState().addAsset(id,{id:uid(),name:'coast-demo.svg',label:'海岸建筑原图',description:'用作构图与主体输入的原创示例插画',mime:'image/svg+xml',kind:'image',role:'source',size:0,url:'/art/coast.svg'});return id;}
const stateLabel=(state:string)=>({draft:'草稿',ready:'已规划',blocked:'等待补充',planning:'正在规划',planning_failed:'规划失败',...RUN_LABEL}[state]??state);

export function Home(){
  const navigate=useNavigate();const [mode,setMode]=useState<'assistant'|'workbench'>('assistant');const [text,setText]=useState(()=>{const id=recordingMode?new URLSearchParams(location.hash.split('?')[1]??'').get('prompt'):null;return recordedCases.find(c=>c.id==='recorded-'+id)?.draft.text??''});const [assets,setAssets]=useState<Asset[]>([]);const [busy,setBusy]=useState(false);const input=useRef<HTMLInputElement>(null);const tasks=recentCreations(usePilot(s=>s.tasks));
  function start(){if(!text.trim())return;const id=usePilot.getState().newTask({text,assets},mode);navigate(`/${mode}/${id}`);if(mode==='assistant')void usePilot.getState().delegate(id,text);}
  async function upload(files:FileList|null){if(!files?.length)return;setBusy(true);try{assertUploadBatch(files,assets.length);for(const f of Array.from(files)){const asset=await saveUpload(f);setAssets(a=>[...a,asset]);}}catch(e){usePilot.getState().notify(e instanceof Error?e.message:'素材保存失败');}finally{setBusy(false);if(input.current)input.current.value='';}}
  return <div className="page home-page"><div className="home-introduction"><span className="home-kicker">ComfyTree / 创作空间</span><h1>从想法开始，按你的方式完成。</h1><p>交给助手安排全部步骤，或进入工作台，亲自调整每一个细节。</p></div><div className="entry-mode" role="tablist" aria-label="选择创作方式"><button role="tab" aria-selected={mode==='assistant'} onClick={()=>setMode('assistant')}><MessageSquare size={17}/><span>快速生成<small>描述需求，让 AI 接管</small></span></button><button role="tab" aria-selected={mode==='workbench'} onClick={()=>setMode('workbench')}><SlidersHorizontal size={17}/><span>人工工作台<small>编辑提示词、输入和参数</small></span></button></div><div className="home-prompt"><textarea aria-label="创作需求或提示词" placeholder={mode==='assistant'?'描述想生成的图片、已有素材与希望保留的内容……':'输入正向提示词，例如：极简建筑摄影，落日余晖，平静的蓝绿色海面……'} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')start();}}/><div className="home-attached">{assets.map(a=><span key={a.id}><Paperclip size={12}/>{a.name}<button aria-label={`移除 ${a.name}`} onClick={()=>setAssets(list=>list.filter(x=>x.id!==a.id))}>×</button></span>)}</div><div className="home-prompt-toolbar"><input type="file" ref={input} hidden multiple accept={LIMITS.accepted.join(',')} onChange={e=>void upload(e.target.files)} aria-label="首页添加素材"/><button className="text-button" disabled={busy} onClick={()=>input.current?.click()}><Plus size={16}/>{busy?'正在保存':liveMode?'添加图片':'添加图片或视频'}</button><span>{mode==='assistant'?'发送后自动处理，缺少信息时再询问':'打开编辑区，不会自动运行'}</span><Button disabled={recordingMode||!text.trim()||busy} onClick={start}>{mode==='assistant'?'交给助手':'进入工作台'}<ArrowUpRight size={16}/></Button></div></div>
    <section className="home-examples"><div className="section-row"><h2>不确定从哪里开始？</h2><Link className="inline-link" to="/capabilities">浏览工作流 <ArrowRight size={14}/></Link></div><div className="example-strip">{[CAPABILITIES[0],CAPABILITIES[1],liveMode?CAPABILITIES[4]:CAPABILITIES[3]].map((c,i)=><button key={c.id} onClick={()=>{const id=launchExample(c,!liveMode);navigate(`/assistant/${id}`);}}><img src={c.cover} alt="原创示例插画"/><div><span>0{i+1} / {c.subtitle}</span><h3>{c.name}</h3><p>{i===0?'从描述生成图片':i===1?'带着原图尝试新风格':liveMode?'使用原图和遮罩编辑':'先编辑，再生成视频'}</p></div><ArrowUpRight size={16}/></button>)}</div><p className="micro-copy">{recordingMode?'从左侧创作记录查看团队已有案例。':'示例只用于填写需求；可用能力取决于个人工作流库和本机环境。'}</p></section>
    <section className="home-recents"><div className="section-row"><h2>继续最近的创作</h2><Link className="inline-link" to="/creations">全部记录 <ArrowRight size={14}/></Link></div>{tasks.length?<div className="creation-list">{tasks.map(t=><Link key={t.id} to={`/${t.lastView??t.origin??'workbench'}/${t.id}`}><span className="creation-list-icon">{t.origin==='assistant'?<MessageSquare size={17}/>:<Workflow size={17}/>}</span><div><strong>{t.title}</strong><small>{t.origin==='assistant'?'助手创作':'人工工作台'} · {t.revisions.length} 个版本</small></div><span>{stateLabel(taskState(t))}</span><time>{formatDate(t.updatedAt)}</time><ChevronRight size={14}/></Link>)}</div>:<div className="quiet-empty"><FolderOpen size={18}/><span>还没有创作记录。写下一个想法，或直接打开工作台。</span><Link to="/workbench">打开工作台 <ArrowUpRight size={13}/></Link></div>}</section>
  </div>;
}

export function History(){const tasks=usePilot(s=>s.tasks);const navigate=useNavigate();const [query,setQuery]=useState('');const [mode,setMode]=useState('all');const [archived,setArchived]=useState(false);const shown=uniqueCreations(tasks).filter(t=>t.archived===archived&&`${t.title}${t.draft.text}`.includes(query)&&(mode==='all'||mode===t.origin||mode==='needs'&&['failed','blocked','planning_failed'].includes(taskState(t))));return <div className="page"><SectionTitle title="创作记录" description="同一项创作，可以由助手开始，也可以在工作台继续。" action={<Link className="button button-primary" to="/assistant"><Plus size={14}/>新对话</Link>}/><div className="directory-filters"><label className="search-field"><Search size={16}/><input aria-label="搜索创作" value={query} onChange={e=>setQuery(e.target.value)} placeholder="名称、需求或提示词"/></label><div className="filter-tabs">{[['all','全部'],['assistant','助手创作'],['workbench','人工工作台'],['needs','需要处理']].map(([v,t])=><button key={v} className={mode===v?'selected':''} onClick={()=>setMode(v)}>{t}</button>)}</div><button className="text-button" onClick={()=>setArchived(!archived)}><Archive size={13}/>{archived?'返回未归档':'已归档'}</button></div><div className="record-table"><div className="record-table-header"><span>创作 / 最近修改</span><span>版本</span><span>状态</span><span>继续创作</span></div>{shown.map(t=><div className="record-row" key={t.id}><div><h3>{t.title}</h3><p>{formatDate(t.updatedAt)} · {t.origin==='assistant'?'由助手开始':'由工作台开始'} · {t.draft.output==='image'?'图片':'视频'}</p></div><span>{t.revisions.length}</span><Badge tone={taskState(t)==='completed'?'green':['failed','blocked','planning_failed'].includes(taskState(t))?'amber':'muted'}>{stateLabel(taskState(t))}</Badge><div className="record-actions"><Link to={`/assistant/${t.id}`} title="在助手中继续"><MessageSquare size={15}/><span>对话</span></Link><Link to={`/workbench/${t.id}`} title="在工作台编辑"><SlidersHorizontal size={15}/><span>编辑</span></Link><IconButton label="复制创作" onClick={()=>navigate(`/workbench/${usePilot.getState().newTask(structuredClone(t.draft),'workbench')}`)}><Copy size={14}/></IconButton><IconButton label={t.archived?'取消归档':'归档'} onClick={()=>usePilot.getState().archive(t.id)}><Archive size={14}/></IconButton></div></div>)}</div>{!shown.length&&<Empty title="没有符合条件的创作" description="调整搜索条件，或开始一项新的创作。"/>}</div>;}

export function Capabilities() {
  const {rows,error}=useCatalog(); const navigate=useNavigate();
  function open(row:WorkflowDefinition,mode:'assistant'|'workbench') {
    const id=usePilot.getState().newTask({text:'',preferredWorkflow:row.id,output:row.modality.endsWith('v')?'video':'image'},mode);
    navigate(`/${mode}/${id}`);
  }
  return <div className="page catalog-page"><SectionTitle title="工作流目录" description="按处理方向挑选模板，查看输入要求后开始创作。"/><WorkflowBrowser rows={rows} error={error} onUse={w=>open(w,'workbench')} secondaryAction={w=><button className="text-button" onClick={()=>open(w,'assistant')}><MessageSquare size={14}/>交给快速生成<ArrowUpRight size={13}/></button>}/></div>;
}

export function Help(){
  const [tab,setTab]=useState('usage');
  return <div className="page help-page"><SectionTitle title="使用与开放说明" description="了解创作方式、当前接入范围与资源使用边界。"/>
    <div className="document-tabs">{[['usage','使用说明'],['architecture','实现与接入'],['resources','资源与开放']].map(([v,t])=><button className={tab===v?'active':''} key={v} onClick={()=>setTab(v)}>{t}</button>)}</div>
    <article className="help-document">{tab==='usage'?<>
      <h2>快速生成与工作台</h2><p>快速生成将需求交给已配置的 Agent 规划。选择「先看方案」可以在运行前检查；信息不足时需要补充。工作台可编辑已声明的提示词、参数和输入槽，也可从快速生成转入。</p>
      <h2>结果与记录</h2><p>连接实际 Agent 服务、已核验的工作流库和 ComfyUI 后，结果来自实际运行；页面中的示意插画并非生成结果。浏览器保存任务草稿，本机服务目录保存计划、素材和结果，请自行保护这些数据。</p>
      <h2>素材与遮罩</h2><p>请说明素材用途；遮罩还需指定目标和白色区域含义，且须与工作流声明一致。实际支持的输入由个人工作流及执行器决定。</p>
    </>:tab==='architecture'?<>
      <h2>当前接入</h2><p>前端通过本机服务调用可替换的 Agent 规划器；Skill 校验方案、冻结工作流与素材，再调用 ComfyUI。默认规划器使用已登录的 Codex CLI，其他 Agent 可实现标准输入输出协议。</p>
      <h2>工作流与限制</h2><p>目录只显示用户库中标记已核验且图哈希匹配的工作流。随仓库提供的参考卡片需要补齐执行映射后才能运行。当前执行器支持单图输出的图像工作流；视频、音频、多图与其他媒体节点需要额外执行器。</p>
      <p>预检不能保证画面质量或覆盖所有依赖；取消会在当前阶段结束后停止后续阶段。具体安装与协议请查看仓库 README 和 references/agent-service.md。</p>
    </>:<>
      <h2>资源与权利</h2><p>仓库不包含模型权重和用户素材。团队自研代码暂未指定许可证；历史工作流及第三方依赖的来源和再分发权利仍需逐项核验。资源清单见仓库 OPEN_SOURCE_INVENTORY.md。</p>
      <h2>个人数据</h2><p>工作流、素材和生成结果保存在用户配置的目录，请按需备份和管理。</p>
    </>}</article></div>;
}
