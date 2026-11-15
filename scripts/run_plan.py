#!/usr/bin/env python3
"""Run explicitly mapped image workflows on a ComfyUI server, one submission per stage."""
import argparse
import copy
import hashlib
import json
import mimetypes
import re
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from validate_plan import validate

def read(path): return json.loads(path.read_text(encoding='utf-8'))
def request(base, path, data=None, headers=None, timeout=15):
    req = urllib.request.Request(base.rstrip('/') + path, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as response: return response.read()
def get_json(base, path): return json.loads(request(base, path))
def upload(base, path):
    boundary = '----ComfyTree' + uuid.uuid4().hex
    data = path.read_bytes()
    filename = uuid.uuid4().hex + path.suffix.lower()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{filename}"\r\nContent-Type: {mimetypes.guess_type(filename)[0] or "application/octet-stream"}\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
    result = json.loads(request(base, '/upload/image', body, {'Content-Type': 'multipart/form-data; boundary=' + boundary}))
    return (result.get('subfolder', '') + '/' if result.get('subfolder') else '') + result['name']

def prepare(plan, cards_dir, plan_dir, registry):
    cards = {c['id']: c for p in cards_dir.glob('*.json') for c in [read(p)]}
    errors, _ = validate(plan, cards)
    if errors: raise ValueError('; '.join(errors))
    prepared = []
    for st in plan['stages']:
        card = cards[st['workflow']]; root = cards_dir.parent.resolve()
        graph_path = (root / card['api_graph']).resolve()
        if not graph_path.is_relative_to(root) or not graph_path.is_file(): raise ValueError(f'{card["id"]}: API 图不可达')
        raw = graph_path.read_bytes()
        if card.get('sha256') != hashlib.sha256(raw).hexdigest(): raise ValueError(f'{card["id"]}: 工作流 SHA256 缺失或不匹配')
        graph = json.loads(raw)
        if not isinstance(graph, dict) or any(not isinstance(n, dict) or 'class_type' not in n or not isinstance(n.get('inputs'), dict) for n in graph.values()): raise ValueError(f'{card["id"]}: 不是 API 格式图')
        missing = sorted({n['class_type'] for n in graph.values()} - registry.keys())
        if missing: raise ValueError(f'{card["id"]}: 服务缺少节点 {missing}')
        mapping = card.get('execution')
        if not isinstance(mapping, dict) or mapping.get('verified') is not True: raise ValueError(f'{card["id"]}: 尚未核验节点映射与完整输入，不允许执行')
        used = set()
        for group, declarations, key in [('inputs', card.get('inputs', []), 'slot'), ('params', card.get('params', []), 'name')]:
            maps = mapping.get(group, {})
            if not isinstance(maps, dict): raise ValueError(f'{card["id"]}: {group} 映射非法')
            for item in declarations:
                name = item[key]; loc = maps.get(name)
                if not isinstance(loc, dict) or not isinstance(loc.get('node'), str) or not isinstance(loc.get('field'), str): raise ValueError(f'{card["id"]}: 缺少 {group}.{name} 节点映射')
                node, field = loc['node'], loc['field']
                if node not in graph or field not in graph[node]['inputs'] or isinstance(graph[node]['inputs'][field], list): raise ValueError(f'{card["id"]}: {group}.{name} 不指向可编辑标量')
                if (node, field) in used: raise ValueError(f'{card["id"]}: 节点字段被重复绑定')
                used.add((node, field))
                if group == 'inputs' and item['type'] not in ('text', 'image', 'mask'): raise ValueError('当前执行器仅支持 text、image、mask 输入')
                if group == 'inputs' and item['type'] in ('image', 'mask') and graph[node]['class_type'] != 'LoadImage': raise ValueError('当前媒体上传仅支持 LoadImage 节点')
        outmaps = mapping.get('outputs', {})
        for item in card.get('outputs', []):
            node = outmaps.get(item['slot']) if isinstance(outmaps, dict) else None
            if item['type'] != 'image' or node not in graph or graph[node]['class_type'] != 'SaveImage': raise ValueError(f'{card["id"]}: 当前仅支持 SaveImage 图像输出')
        # Built-in loader dropdowns expose the server's currently available model files.
        # Do not claim this validates arbitrary custom nodes or that a model will load successfully.
        for node_id, node in graph.items():
            schema = registry.get(node['class_type'], {}).get('input', {})
            choices = {**schema.get('required', {}), **schema.get('optional', {})}
            for field, value in node['inputs'].items():
                if field not in {'ckpt_name','unet_name','vae_name','clip_name','clip_name1','clip_name2','lora_name','model_name'}: continue
                for spec in card.get('params', []):
                    loc=mapping.get('params',{}).get(spec['name'],{})
                    if loc.get('node')==node_id and loc.get('field')==field:
                        value=st.get('params',{}).get(spec['name'],spec.get('default',value))
                definition = choices.get(field)
                if isinstance(value, str) and isinstance(definition, list) and definition and isinstance(definition[0], list) and value not in definition[0]:
                    raise ValueError(f'{card["id"]}: 节点 {node_id} 的模型 {field}={value!r} 不在 ComfyUI 可用列表中')
        prepared.append((st, card, graph))
    for key, material in plan.get('materials', {}).items():
        if not (plan_dir / material['path']).is_file(): raise ValueError(f'素材不存在: {key}')
    return prepared

def run(plan, cards_dir, plan_dir, base, output, timeout, *, cancelled=None, on_progress=None):
    registry = get_json(base, '/object_info')
    stages = prepare(plan, cards_dir, plan_dir, registry)
    output.mkdir(parents=True, exist_ok=False)
    manifest = {'stages': [], 'status': 'running'}
    def save():
        (output / 'run.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        if on_progress: on_progress(copy.deepcopy(manifest))
    save(); artifacts = {}
    try:
        for st, card, source in stages:
            if cancelled and cancelled():
                manifest['status'] = 'cancelled'; save(); return manifest
            graph = copy.deepcopy(source); maps = card['execution']
            for name, value in st.get('bindings', {}).items():
                spec = next(s for s in card['inputs'] if s['slot'] == name)
                if value.startswith('material:'):
                    value = plan_dir / plan['materials'][value[9:]]['path']
                    if spec['type'] == 'text': value = value.read_text(encoding='utf-8')
                elif re.fullmatch(r'stage\d+\..+', value): value = artifacts[value]
                if spec['type'] in ('image', 'mask'): value = upload(base, Path(value))
                loc = maps['inputs'][name]; graph[loc['node']]['inputs'][loc['field']] = value
            for spec in card.get('params', []):
                name = spec['name']; value = st.get('params', {}).get(name, spec.get('default'))
                if value is not None:
                    loc = maps['params'][name]; graph[loc['node']]['inputs'][loc['field']] = value
            row = {'stage': st['stage'], 'workflow': card['id'], 'status': 'submitting'}; manifest['stages'].append(row); save()
            payload = json.dumps({'prompt': graph, 'client_id': uuid.uuid4().hex}).encode()
            try: response = json.loads(request(base, '/prompt', payload, {'Content-Type': 'application/json'}))
            except Exception:
                row['status'] = 'submission_unknown'; save(); raise RuntimeError('提交结果未知；请检查 ComfyUI 队列，禁止自动重试')
            prompt_id = response['prompt_id']; row.update(status='submitted', prompt_id=prompt_id); save()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                history = get_json(base, '/history/' + urllib.parse.quote(prompt_id)).get(prompt_id)
                if history:
                    status = history.get('status', {})
                    if status.get('status_str') == 'error': raise RuntimeError(f'阶段 {st["stage"]} 执行失败: {status.get("messages")}')
                    if status.get('completed') or status.get('status_str') == 'success': break
                time.sleep(1)
            else: raise TimeoutError(f'阶段 {st["stage"]} 等待超时；任务可能仍在运行，prompt_id={prompt_id}')
            for spec in card['outputs']:
                files = history.get('outputs', {}).get(maps['outputs'][spec['slot']], {}).get('images', [])
                if len(files) != 1: raise RuntimeError(f'输出 {spec["slot"]} 需要恰好一张图，实际 {len(files)}')
                file = files[0]; query = urllib.parse.urlencode({k: file.get(k, '') for k in ('filename', 'subfolder', 'type')})
                suffix = Path(file['filename']).suffix or '.png'
                if not re.fullmatch(r'\.[A-Za-z0-9]{1,8}', suffix) or not re.fullmatch(r'[A-Za-z0-9_-]+', spec['slot']): raise ValueError('输出文件名或槽名无效')
                dest = output / f'stage{st["stage"]}_{spec["slot"]}{suffix}'
                dest.write_bytes(request(base, '/view?' + query)); artifacts[f'stage{st["stage"]}.{spec["slot"]}'] = dest
                alias = st.get('outputs_to', {}).get(spec['slot'])
                if alias: artifacts[alias] = dest
            row['status'] = 'completed'; save()
        manifest.update(status='completed', final_output=str(artifacts[plan['final_output']].resolve())); save()
        return manifest
    except Exception as exc:
        manifest.update(status='failed_or_unknown', error=str(exc)); save(); raise

def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('plan', type=Path); ap.add_argument('--cards', required=True, type=Path); ap.add_argument('--server', default='http://127.0.0.1:8188'); ap.add_argument('--output', required=True, type=Path); ap.add_argument('--timeout', type=int, default=1800); ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    try:
        plan = read(args.plan); base = args.server.rstrip('/')
        if args.timeout <= 0: raise ValueError('timeout 必须大于 0')
        if args.check:
            prepare(plan, args.cards.resolve(), args.plan.resolve().parent, get_json(base, '/object_info')); print('预检通过；未提交任务')
        else: print(json.dumps(run(plan, args.cards.resolve(), args.plan.resolve().parent, base, args.output.resolve(), args.timeout), ensure_ascii=False, indent=2))
    except Exception as exc:
        print(f'失败: {exc}'); return 1
    return 0
if __name__ == '__main__': raise SystemExit(main())
