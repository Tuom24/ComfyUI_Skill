#!/usr/bin/env python3
"""Local ComfyTree frontend-to-Agent/Skill service. See references/agent-service.md."""
import argparse
import copy
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from run_plan import get_json, prepare, run
from validate_plan import validate
from planner_common import cli_available

ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$')
TERMINAL = {'completed', 'failed', 'cancelled'}
def now(): return int(time.time() * 1000)
def token(value):
    if not isinstance(value, str) or not ID.fullmatch(value): raise ValueError('无效的标识符')
    return value
def load(path): return json.loads(path.read_text(encoding='utf-8'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'); tmp.replace(path)

class Service:
    def __init__(self, library, state, comfy, command):
        self.library, self.state, self.comfy, self.command = library.resolve(), state.resolve(), comfy.rstrip('/'), command
        self.state.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock(); self.active = {}; self.cancel = {}
        self._planner_cache = (0, None)

    def path(self, kind, identifier): return self.state / kind / (token(identifier) + '.json')
    def get(self, kind, identifier):
        p = self.path(kind, identifier)
        return load(p) if p.is_file() else None
    def save(self, kind, identifier, data): write(self.path(kind, identifier), data)

    def planner_status(self, refresh=False):
        checked_at, cached = self._planner_cache
        if not refresh and cached is not None and time.monotonic()-checked_at < 15: return cached
        status = self._check_planner()
        self._planner_cache = (time.monotonic(), status)
        return status

    def _check_planner(self):
        if not self.command: return {'available':False, 'message':'未配置 Agent 规划器。', 'login':'unknown'}
        bundled = Path(__file__).resolve().parent
        adapters = {str((bundled / name).resolve()) for name in ('codex_planner.py','workbuddy_planner.py')}
        if len(self.command) == 2 and str(Path(self.command[1]).resolve()) in adapters:
            try:
                result = subprocess.run([*self.command, '--check'], capture_output=True, text=True, encoding='utf-8',
                                        errors='replace', timeout=10, env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'})
                info = json.loads(result.stdout)
                return {'available':info.get('available') is True and result.returncode == 0,
                        'message':str(info.get('message','规划器检查失败'))[:300], 'login':'unknown'}
            except (OSError, ValueError, subprocess.TimeoutExpired):
                return {'available':False, 'message':'无法检查规划器配置，请检查 Python 和 CLI 路径。', 'login':'unknown'}
        available, message = cli_available(self.command)
        return {'available':available, 'message':message, 'login':'unknown'}

    def cards(self):
        result = {}
        folder = self.library / 'cards'
        if not folder.is_dir(): return result
        for path in sorted(folder.glob('*.json')):
            card = load(path); wid = token(card.get('id'))
            if wid in result: raise ValueError('工作流 ID 重复: ' + wid)
            if card.get('execution', {}).get('verified') is True: result[wid] = card
        return result

    def catalog(self):
        result = []
        for wid, card in self.cards().items():
            graph_path = (self.library / card['api_graph']).resolve()
            if not graph_path.is_relative_to(self.library) or not graph_path.is_file() or sha(graph_path) != card.get('sha256'): continue
            graph = load(graph_path); slots = []
            for p in card.get('params', []):
                loc = card['execution'].get('params', {}).get(p.get('name'))
                if not isinstance(loc, dict): continue
                node, name = loc.get('node'), loc.get('field')
                if node not in graph or name not in graph[node].get('inputs', {}): continue
                value = graph[node]['inputs'][name]
                if not isinstance(value, (str, int, float, bool)): continue
                row = {'key': f'{node}.{name}', 'nodeId': node, 'name': name, 'value': p.get('default', value), 'type': 'boolean' if isinstance(value,bool) else 'number' if isinstance(value,(int,float)) else 'string', 'nodeType': graph[node]['class_type']}
                if p.get('type') in ('int','float') and isinstance(p.get('range'),list) and len(p['range'])==2: row.update(min=p['range'][0],max=p['range'][1],integer=p['type']=='int')
                slots.append(row)
            inputs = {x.get('type') for x in card.get('inputs', []) if x.get('required', True)}
            outputs = {x.get('type') for x in card.get('outputs', [])}
            modality = ('i' if inputs & {'image','mask'} else 't') + '2' + ('v' if 'video' in outputs else 'i')
            result.append({'id':wid,'description':card.get('summary',wid),'modality':modality,'operation':card.get('task_family',''),'sha256':card['sha256'],'nodeCount':len(graph),'parameters':slots})
        return result

    def upload(self, data, content_type):
        ctype = content_type.split(';')[0].lower()
        signatures = {'image/png':(b'\x89PNG\r\n\x1a\n','.png'),'image/jpeg':(b'\xff\xd8\xff','.jpg'),'image/webp':(b'RIFF','.webp')}
        if ctype not in signatures or not data.startswith(signatures[ctype][0]) or ctype == 'image/webp' and data[8:12] != b'WEBP': raise ValueError('仅支持 PNG、JPEG 或 WebP 图片，且类型必须与文件一致')
        ident = uuid.uuid4().hex; folder = self.state/'assets'; folder.mkdir(exist_ok=True)
        path = folder/(ident + signatures[ctype][1]); path.write_bytes(data)
        meta = {'id':ident,'file':path.name,'sha256':sha(path),'mime':ctype}; self.save('asset-meta',ident,meta)
        return {'id':ident,'url':'/api/assets/'+ident+'/content'}

    def asset(self, ident):
        meta = self.get('asset-meta', ident)
        if not meta:
            row = self.get('runs', ident)
            if not row or row.get('status') != 'completed': raise ValueError('素材不存在: ' + token(ident))
            root = (self.state/'outputs'/ident).resolve(); manifest = load(root/'run.json')
            result = Path(manifest['final_output']).resolve()
            if not result.is_relative_to(root) or not result.is_file(): raise ValueError('历史成果文件不可用')
            return {'id':ident,'sha256':sha(result),'mime':mimetypes.guess_type(result.name)[0] or 'application/octet-stream'}, result
        path = (self.state/'assets'/meta['file']).resolve()
        if not path.is_relative_to((self.state/'assets').resolve()) or not path.is_file() or sha(path) != meta['sha256']: raise ValueError('素材文件丢失或已变化')
        return meta, path

    def plan(self, revision):
        if not isinstance(revision,dict): raise ValueError('缺少需求版本')
        rid = token(revision.get('id')); prompt = revision.get('text')
        if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>10000: raise ValueError('需求不能为空，且不得超过 10000 字符')
        if not isinstance(revision.get('fingerprint'),str) or len(revision['fingerprint'])>100000: raise ValueError('需求指纹无效')
        if revision.get('output') not in ('image','video'): raise ValueError('输出类型无效')
        if not isinstance(revision.get('assets',[]),list) or len(revision.get('assets',[]))>8: raise ValueError('素材数量无效')
        if revision.get('spec',{}):
            constraints = revision['spec'].get('constraints',{})
            if constraints: raise ValueError('当前服务尚不能可靠编译尺寸、时长等硬约束，请改用已验证的参数或移除约束')
        cards = self.cards()
        if not cards: raise ValueError('没有已核验的工作流卡片；请先登记个人工作流并核验映射')
        assets = []
        for a in revision.get('assets',[]):
            if not isinstance(a,dict): raise ValueError('素材定义无效')
            ident = token(a.get('id')); meta, path = self.asset(ident)
            if any(x['id']==ident for x in assets): raise ValueError('素材重复')
            kind = 'mask' if a.get('role') == 'mask' else 'image'
            if kind == 'mask' and meta['mime'] != 'image/png': raise ValueError('遮罩必须是 PNG')
            if kind == 'mask' and (not a.get('targetAssetId') or a.get('maskMode') not in ('edit','preserve')): raise ValueError('遮罩需明确对应素材和白色区域含义')
            assets.append({'id':ident,'type':kind,'name':str(a.get('name','image'))[:200],'role':a.get('role','unassigned'),'mask_mode':a.get('maskMode'),'target':a.get('targetAssetId'),'meta':meta,'path':path})
        for a in assets:
            if a['type']=='mask' and not any(x['id']==a['target'] and x['type']=='image' for x in assets): raise ValueError('遮罩对应的图像不在本次素材中')
        agent_request = {'protocol':'comfytree-planner-v1','task':prompt,'output':revision['output'],
                         'negative_prompt':revision.get('negativePrompt',''),'preferred_workflow':revision.get('preferredWorkflow'),
                         'stage_edits':revision.get('stageEdits') or {},'materials':[{k:a[k] for k in ('id','type','name','role')} for a in assets],
                         'cards':list(cards.values())}
        status = self.planner_status(refresh=True)
        if not status['available']: raise RuntimeError(status['message'])
        env=os.environ.copy(); env['PYTHONUTF8']='1'; env['PYTHONIOENCODING']='utf-8'
        try:
            proc = subprocess.run(self.command, input=json.dumps(agent_request,ensure_ascii=False), text=True,encoding='utf-8',
                                  stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=360,cwd=self.state,env=env)
        except OSError as exc: raise RuntimeError('无法启动 Agent 规划器，请检查可执行文件路径。') from exc
        if proc.returncode:
            if '尚未登录或授权' in proc.stderr: raise RuntimeError('WorkBuddy/CodeBuddy CLI 尚未登录或授权；请在该 CLI 中完成登录。桌面客户端登录不保证 CLI 已登录。')
            if '规划超时' in proc.stderr: raise RuntimeError('WorkBuddy/CodeBuddy 规划超时，未提交 ComfyUI；请检查网络和模型状态。')
            if '未返回可解析的结构化方案' in proc.stderr: raise RuntimeError('WorkBuddy/CodeBuddy CLI 未返回可解析的结构化方案，请检查模型和 CLI 版本。')
            raise RuntimeError('Agent 规划失败；请检查 Agent 登录状态、模型权限及其命令配置。')
        if len(proc.stdout)>1_000_000: raise ValueError('Agent 响应过大')
        response = json.loads(proc.stdout)
        if not isinstance(response,dict) or response.get('kind') not in ('plan','clarification'): raise ValueError('Agent 响应格式不合法')
        ident = uuid.uuid4().hex
        if response['kind'] == 'clarification':
            message = str(response.get('message') or '需要补充工作流或素材')[:1000]
            visible = {'id':ident,'revisionId':rid,'summary':prompt,'steps':[],'blockers':[{'code':'clarification','message':message}],
                       'createdAt':now(),'source':'live','runtimeValidation':'failed','requirementChecks':[]}
            self.save('plans',ident,{'visible':visible,'revision':revision}); return visible
        stages = response.get('stages'); final = response.get('final_output')
        if not isinstance(stages,list) or not 1 <= len(stages) <= 10: raise ValueError('Agent 计划必须包含 1 至 10 个阶段')
        selected = set()
        for stage in stages:
            if not isinstance(stage,dict) or stage.get('workflow') not in cards: raise ValueError('Agent 选择了未核验的工作流')
            selected.add(stage['workflow'])
        if revision.get('preferredWorkflow') and stages[0]['workflow'] != revision['preferredWorkflow']: raise ValueError('Agent 未使用工作台指定的首个工作流')
        self.apply_edits(stages, cards, revision)
        for st in stages:
            for name, ref in st.get('bindings',{}).items():
                if isinstance(ref,str) and ref.startswith('material:'):
                    asset=next((x for x in assets if x['id']==ref[9:]),None)
                    if asset and asset['type']=='mask':
                        spec=next((x for x in cards[st['workflow']].get('inputs',[]) if x.get('slot')==name),{})
                        if spec.get('mask_mode')!=asset['mask_mode']: raise ValueError('遮罩槽未声明与素材一致的白色区域语义，无法安全执行')
        folder = self.state/'plan-data'/ident; frozen = folder/'library'; (frozen/'cards').mkdir(parents=True)
        (frozen/'workflows').mkdir(); (folder/'assets').mkdir()
        for wid in selected:
            card = copy.deepcopy(cards[wid]); source = (self.library/card['api_graph']).resolve()
            if not source.is_relative_to(self.library) or not source.is_file() or sha(source)!=card.get('sha256'): raise ValueError('工作流路径或 SHA256 无效: '+wid)
            target = frozen/'workflows'/(wid+'.json'); shutil.copyfile(source,target)
            card['api_graph'] = 'workflows/'+wid+'.json'; write(frozen/'cards'/(wid+'.json'),card)
        materials = {}
        for a in assets:
            target = folder/'assets'/(a['id']+a['path'].suffix); shutil.copyfile(a['path'],target)
            if sha(target) != a['meta']['sha256']: raise ValueError('复制素材时哈希不一致')
            materials[a['id']] = {'type':a['type'],'path':str(target.relative_to(folder)).replace('\\','/')}
        plan = {'task':prompt,'materials':materials,'stages':stages,'final_output':final}
        frozen_cards = {wid:load(frozen/'cards'/(wid+'.json')) for wid in selected}
        errors, _ = validate(plan,frozen_cards)
        if errors: raise ValueError('Agent 计划校验失败：'+'；'.join(errors[:8]))
        outputs = {}
        for stage in stages:
            for out in frozen_cards[stage['workflow']].get('outputs',[]):
                ref=f"stage{stage['stage']}.{out['slot']}"; outputs[ref]=out['type']
                alias=stage.get('outputs_to',{}).get(out['slot'])
                if alias: outputs[alias]=out['type']
        if outputs.get(final) != revision['output']: raise ValueError('计划最终产物与需求输出类型不一致')
        prepare(plan, frozen/'cards', folder, get_json(self.comfy,'/object_info'))
        write(folder/'plan.json',plan)
        steps=[]
        for st in stages:
            card=frozen_cards[st['workflow']]; sid=st['stage']; dependencies=[]; inputs=[]; bindings={}
            for name, ref in st.get('bindings',{}).items():
                slot=next((x for x in card.get('inputs',[]) if x.get('slot')==name),None)
                if not slot or slot.get('type')=='text': continue
                if ref.startswith('material:'):
                    aid=ref[9:]; inputs.append(aid); bindings[name]={'kind':'asset','assetId':aid}
                else:
                    match=re.match(r'^stage(\d+)\.',ref)
                    if match:
                        upstream='step-'+match.group(1); inputs.append(upstream); dependencies.append(upstream); bindings[name]={'kind':'stage','stageId':upstream}
            slots=[{'id':x['slot'],'label':x.get('desc') or x['slot'],'required':x.get('required',True),'kind':x['type'],'roles':['mask'] if x['type']=='mask' else ['source','reference','unassigned']} for x in card.get('inputs',[]) if x.get('type') in ('image','mask','video')]
            steps.append({'id':'step-'+str(sid),'label':card.get('name',st['workflow']),'description':card.get('summary',''),'workflow':st['workflow'],'inputs':inputs,'output':next((x['type'] for x in card['outputs'] if x['type'] in ('image','video')),'image'),'dependsOn':list(dict.fromkeys(dependencies)),'inputSlots':slots,'slotBindings':bindings,'contractStatus':'validated'})
        visible={'id':ident,'revisionId':rid,'summary':str(response.get('message') or prompt)[:1000],'steps':steps,'blockers':[],
                 'createdAt':now(),'source':'live','runtimeValidation':'passed','requirementChecks':[],
                 'workflowVersions':[{'workflowId':wid,'sha256':frozen_cards[wid]['sha256']} for wid in selected]}
        asset_hashes={v['path']:sha(folder/v['path']) for v in materials.values()}
        self.save('plans',ident,{'visible':visible,'revision':revision,'folder':str(folder),'assetHashes':asset_hashes}); return visible

    def apply_edits(self, stages, cards, revision):
        edits=revision.get('stageEdits') or {}
        if not isinstance(edits,dict): raise ValueError('阶段修改格式无效')
        by_id={f"step-{s.get('stage')}":s for s in stages}
        for sid, edit in edits.items():
            if sid not in by_id or not isinstance(edit,dict): raise ValueError('阶段修改引用不存在的阶段')
            st=by_id[sid]; card=cards[st['workflow']]
            if edit.get('workflowId') and edit['workflowId']!=st['workflow']: raise ValueError('Agent 未使用工作台指定的阶段工作流')
            if edit.get('prompt') is not None:
                if not any(x.get('slot')=='prompt' and x.get('type')=='text' for x in card.get('inputs',[])): raise ValueError('所选工作流不支持独立阶段提示词')
                st.setdefault('bindings',{})['prompt']=edit['prompt']
            if edit.get('parameters'):
                allowed={f"{v['node']}.{v['field']}":k for k,v in card['execution'].get('params',{}).items()}
                for key,value in edit['parameters'].items():
                    if key not in allowed: raise ValueError('工作台参数未被卡片声明: '+str(key))
                    st.setdefault('params',{})[allowed[key]]=value
            if 'slotBindings' in edit:
                if not isinstance(edit['slotBindings'],dict): raise ValueError('手动槽位绑定格式无效')
                for item in card.get('inputs',[]):
                    if item.get('type') in ('image','mask','video'): st.setdefault('bindings',{}).pop(item['slot'],None)
                for slot, source in edit['slotBindings'].items():
                    spec=next((x for x in card.get('inputs',[]) if x.get('slot')==slot),None)
                    if not spec or not isinstance(source,dict): raise ValueError('手动槽位绑定无效')
                    if source.get('kind')=='asset': st.setdefault('bindings',{})[slot]='material:'+token(source.get('assetId'))
                    elif source.get('kind')=='stage':
                        prev=by_id.get(source.get('stageId'))
                        if not prev: raise ValueError('上游阶段不存在')
                        matches=[o['slot'] for o in cards[prev['workflow']].get('outputs',[]) if o.get('type')==spec['type']]
                        if len(matches)!=1: raise ValueError('上游同类型输出不唯一，无法自动绑定')
                        st.setdefault('bindings',{})[slot]=f"stage{prev['stage']}.{matches[0]}"
                    else: raise ValueError('手动槽位来源无效')
                expected={source.get('assetId') if source.get('kind')=='asset' else source.get('stageId') for source in edit['slotBindings'].values()}
                if 'inputs' in edit and (not isinstance(edit['inputs'],list) or set(edit['inputs'])!=expected): raise ValueError('素材列表与槽位绑定不一致')
            elif edit.get('inputs'): raise ValueError('请通过明确的输入槽绑定素材')
        negative=revision.get('negativePrompt')
        if negative:
            found=False
            for st in stages:
                for x in cards[st['workflow']].get('inputs',[]):
                    if x.get('slot') in ('negative','negative_prompt') and x.get('type')=='text': st.setdefault('bindings',{})[x['slot']]=negative; found=True
            if not found: raise ValueError('所选工作流未声明反向提示词槽')

    def submit(self, body):
        ident=token(body.get('id')); pid=token(body.get('planId'))
        with self.lock:
            prior=self.get('runs',ident)
            if prior:
                if prior['planId']!=pid or prior['revisionId']!=body.get('revisionId'): raise ValueError('运行 ID 已用于其他方案')
                if prior['status'] not in TERMINAL and ident not in self.active:
                    prior.update(status='failed',error='服务重启，提交状态未知；请先核对 ComfyUI 队列和记录，未自动重试',updatedAt=now()); self.save('runs',ident,prior)
                return prior
            record=self.get('plans',pid)
            if not record or record['visible']['blockers'] or body.get('revisionId')!=record['revision']['id'] or body.get('fingerprint')!=record['revision'].get('fingerprint'): raise ValueError('方案与需求版本不一致或不可执行')
            if record.get('runId') and record['runId']!=ident: raise ValueError('此方案已提交，请创建新版本后再运行')
            if self.active: raise ValueError('已有任务运行，请等待完成')
            row={'id':ident,'planId':pid,'revisionId':body['revisionId'],'source':'live','submitted':True,'status':'queued','startedAt':now(),'updatedAt':now(),'attempt':1,'maxAttempts':1,'stepIndex':0,'scenario':'normal','events':[{'at':now(),'title':'已提交','detail':'执行已冻结的 Agent 方案','attempt':1}],'artifacts':[],'quality':'not_evaluated'}
            record['runId']=ident; self.save('plans',pid,record)
            self.save('runs',ident,row); self.cancel[ident]=threading.Event(); self.active[ident]=True
            threading.Thread(target=self.worker,args=(ident,record),daemon=True).start(); return row

    def worker(self, ident, record):
        folder=Path(record['folder']); plan=load(folder/'plan.json')
        def update_manifest(manifest):
            with self.lock:
                row=self.get('runs',ident)
                if row and row['status'] not in TERMINAL:
                    row['updatedAt']=now(); row['stepIndex']=max(0,len(manifest['stages'])-1)
                    if row['status']!='cancel_requested': row['status']='running'
                    self.save('runs',ident,row)
        try:
            for rel,digest in record.get('assetHashes',{}).items():
                path=(folder/rel).resolve()
                if not path.is_relative_to(folder.resolve()) or not path.is_file() or sha(path)!=digest: raise ValueError('冻结素材已变化，未提交执行')
            result=run(plan,folder/'library/cards',folder,self.comfy,self.state/'outputs'/ident,1800,
                       cancelled=self.cancel[ident].is_set,on_progress=update_manifest)
            with self.lock:
                row=self.get('runs',ident)
                if result['status']=='cancelled': row.update(status='cancelled',updatedAt=now())
                else:
                    output=Path(result['final_output']); mime=mimetypes.guess_type(output.name)[0] or 'application/octet-stream'
                    url='/api/artifacts/'+ident; row.update(status='completed',updatedAt=now(),artifacts=[{'id':ident,'name':'ComfyTree-result'+output.suffix,'kind':'image','url':url,'poster':url,'mime':mime,'runId':ident}])
                row['events'].append({'at':now(),'title':'执行完成' if row['status']=='completed' else '已停止','detail':'真实 ComfyUI 执行记录保存在服务端','attempt':1}); self.save('runs',ident,row)
        except Exception as exc:
            with self.lock:
                row=self.get('runs',ident); row.update(status='failed',error=str(exc)[:2000],updatedAt=now()); self.save('runs',ident,row)
        finally:
            with self.lock: self.active.pop(ident,None); self.cancel.pop(ident,None)

class Handler(BaseHTTPRequestHandler):
    service = None
    def log_message(self, fmt, *args): pass
    def reply(self, status, obj):
        body=json.dumps(obj,ensure_ascii=False).encode('utf-8'); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
    def local_request(self):
        host=self.headers.get('Host','').split(':')[0].lower()
        if host not in ('localhost','127.0.0.1'): raise ValueError('仅允许本机访问')
        origin=self.headers.get('Origin')
        if origin and urlsplit(origin).hostname not in ('localhost','127.0.0.1'): raise ValueError('仅允许本机页面访问')
    def body(self, limit=100000):
        size=int(self.headers.get('Content-Length','0'))
        if not 0<size<=limit: raise ValueError('请求大小不合法')
        return self.rfile.read(size)
    def body_json(self):
        if self.headers.get('Content-Type','').split(';')[0]!='application/json': raise ValueError('需要 JSON 请求')
        data=json.loads(self.body())
        if not isinstance(data,dict): raise ValueError('请求格式无效')
        return data
    def file(self,path,ctype):
        data=path.read_bytes(); self.send_response(200); self.send_header('Content-Type',ctype); self.send_header('Content-Length',str(len(data))); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        try:
            self.local_request(); path=urlsplit(self.path).path; svc=self.service
            if path=='/api/health':
                planner = svc.planner_status()
                library_available = (svc.library/'cards').is_dir()
                library = {'available':library_available, 'message':'工作流库目录可访问；可执行卡片仍需核验。' if library_available else '工作流库 cards 目录不存在，请检查 --library 路径。'}
                try: get_json(svc.comfy,'/system_stats')
                except Exception:
                    message='无法连接 ComfyUI，请检查服务是否启动及 --comfy-url 地址。'
                    return self.reply(503,{'ok':False,'error':message,'comfyui':{'available':False,'message':message},'planner':planner,'library':library})
                return self.reply(200,{'ok':True,'plannerConfigured':bool(svc.command),'comfyui':{'available':True,'message':'ComfyUI 服务可访问。'},'planner':planner,'library':library})
            if path=='/api/catalog': return self.reply(200,svc.catalog())
            if path.startswith('/api/workflows/'):
                wid=token(path.split('/')[-1]); card=svc.cards().get(wid)
                if not card: return self.reply(404,{'error':'工作流不存在或尚未核验'})
                p=(svc.library/card['api_graph']).resolve()
                if not p.is_relative_to(svc.library) or sha(p)!=card['sha256']: raise ValueError('工作流哈希不一致')
                return self.reply(200,load(p))
            if path.startswith('/api/assets/') and path.endswith('/content'):
                ident=path.split('/')[-2]; meta,p=svc.asset(ident); return self.file(p,meta['mime'])
            if path.startswith('/api/runs/'):
                ident=token(path.split('/')[-1])
                with svc.lock:
                    row=svc.get('runs',ident)
                    if not row: return self.reply(404,{'error':'运行不存在'})
                    if row['status'] not in TERMINAL and ident not in svc.active:
                        row.update(status='failed',error='服务重启，状态未知；请先检查队列，未自动重试',updatedAt=now()); svc.save('runs',ident,row)
                return self.reply(200,row)
            if path.startswith('/api/artifacts/'):
                ident=token(path.split('/')[-1]); row=svc.get('runs',ident)
                if not row or row['status']!='completed': return self.reply(404,{'error':'成果不存在'})
                manifest=load(svc.state/'outputs'/ident/'run.json'); result=Path(manifest['final_output']).resolve(); root=(svc.state/'outputs'/ident).resolve()
                if not result.is_relative_to(root): raise ValueError('成果路径无效')
                return self.file(result,mimetypes.guess_type(result.name)[0] or 'application/octet-stream')
            return self.reply(404,{'error':'接口不存在'})
        except ValueError as exc: return self.reply(400,{'error':str(exc)})
        except Exception as exc: return self.reply(503,{'error':str(exc)[:1000]})
    def do_POST(self):
        try:
            self.local_request(); path=urlsplit(self.path).path; svc=self.service
            if path=='/api/assets': return self.reply(200,svc.upload(self.body(20*1024*1024),self.headers.get('Content-Type','')))
            if path=='/api/plans': return self.reply(200,svc.plan(self.body_json().get('revision')))
            if path=='/api/runs': return self.reply(200,svc.submit(self.body_json()))
            if path.startswith('/api/runs/') and path.endswith('/cancel'):
                ident=token(path.split('/')[-2])
                with svc.lock:
                    row=svc.get('runs',ident)
                    if not row: return self.reply(404,{'error':'运行不存在'})
                    if ident in svc.cancel:
                        svc.cancel[ident].set(); row.update(status='cancel_requested',updatedAt=now()); svc.save('runs',ident,row)
                return self.reply(200,{'status':row['status']})
            return self.reply(404,{'error':'接口不存在'})
        except (ValueError,TypeError,KeyError,json.JSONDecodeError) as exc: return self.reply(400,{'error':str(exc)[:1000]})
        except subprocess.TimeoutExpired: return self.reply(504,{'error':'Agent 规划超时；未提交 ComfyUI'})
        except Exception as exc: return self.reply(503,{'error':str(exc)[:1000]})

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--library',type=Path,required=True); ap.add_argument('--state',type=Path,required=True)
    ap.add_argument('--comfy-url',default='http://127.0.0.1:8188'); ap.add_argument('--port',type=int,default=8090)
    ap.add_argument('--planner-command-json',help='JSON argument array for another planner; default is bundled Codex adapter')
    ap.add_argument('--planner',choices=['codex','workbuddy'],default='codex',help='Built-in planner adapter; WorkBuddy uses CodeBuddy CLI')
    ap.add_argument('--planner-executable',help='Alternative planner executable; no shell is used')
    ap.add_argument('--planner-arg',action='append',default=[],help='Repeat for each argument to the planner executable')
    args=ap.parse_args()
    if args.planner_command_json and (args.planner_executable or args.planner_arg): raise ValueError('choose one planner command form')
    if args.planner_arg and not args.planner_executable: raise ValueError('--planner-arg requires --planner-executable')
    if args.planner != 'codex' and (args.planner_command_json or args.planner_executable): raise ValueError('choose built-in planner or custom planner command')
    command=json.loads(args.planner_command_json) if args.planner_command_json else [args.planner_executable,*args.planner_arg] if args.planner_executable else [sys.executable,str(Path(__file__).with_name(args.planner+'_planner.py'))]
    if not isinstance(command,list) or not command or not all(isinstance(x,str) and x for x in command): raise ValueError('planner command must be a nonempty JSON string array')
    Handler.service=Service(args.library,args.state,args.comfy_url,command)
    print(f'ComfyTree agent service http://127.0.0.1:{args.port}',flush=True)
    status = Handler.service.planner_status()
    print('规划器检查：' + status['message'],flush=True)
    if not (args.library / 'cards').is_dir(): print('工作流库 cards 目录不存在，请检查 --library 路径。',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
if __name__=='__main__': main()
