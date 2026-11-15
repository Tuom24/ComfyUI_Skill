#!/usr/bin/env python3
"""Copy an API-format workflow into a separate library and create an unverified card draft."""
import argparse
import hashlib
import json
import re
from pathlib import Path

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('graph', type=Path); ap.add_argument('--library', type=Path, required=True); ap.add_argument('--id', required=True)
    args = ap.parse_args()
    try:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', args.id): raise ValueError('ID 只能包含字母、数字、下划线和连字符')
        raw = args.graph.read_bytes(); graph = json.loads(raw)
        if not isinstance(graph, dict) or not graph or any(not isinstance(n, dict) or not isinstance(n.get('class_type'), str) or not isinstance(n.get('inputs'), dict) for n in graph.values()): raise ValueError('需要 ComfyUI 导出的 API 格式图，不能直接使用普通 UI 格式')
        root = args.library.resolve(); graph_path = root / 'workflows' / (args.id + '.json'); card_path = root / 'cards' / (args.id + '.json')
        if graph_path.exists() or card_path.exists(): raise ValueError('ID 已存在，不会覆盖')
        graph_path.parent.mkdir(parents=True, exist_ok=True); card_path.parent.mkdir(parents=True, exist_ok=True)
        card = {'id': args.id, 'name': args.id, 'modality': 'multi', 'task_family': '待核验', 'summary': '待依据工作流和用户说明填写', 'inputs': [], 'outputs': [], 'params': [], 'api_graph': 'workflows/' + args.id + '.json', 'sha256': hashlib.sha256(raw).hexdigest(), 'execution': {'verified': False, 'inputs': {}, 'params': {}, 'outputs': {}}, 'notes': '草稿；需要检查全部输入、输出和模型后才可执行'}
        with graph_path.open('xb') as f: f.write(raw)
        try:
            with card_path.open('x', encoding='utf-8') as f: json.dump(card, f, ensure_ascii=False, indent=2)
        except Exception:
            graph_path.unlink(); raise
        print(json.dumps({'card': str(card_path), 'graph': str(graph_path), 'nodes': [{'id': node, 'class_type': n['class_type'], 'fields': list(n['inputs'])} for node, n in graph.items()]}, ensure_ascii=False, indent=2))
    except (OSError, ValueError, TypeError) as exc:
        print(f'登记失败: {exc}'); return 1
    return 0
if __name__ == '__main__': raise SystemExit(main())
