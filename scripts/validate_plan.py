#!/usr/bin/env python3
"""Validate a ComfyTree composition plan. Exit 0 on success, 1 on validation error, 2 on input error."""
import argparse
import json
import math
import re
import sys
from pathlib import Path

TYPES = {'image', 'mask', 'video', 'audio', 'text', 'latent'}

def validate(plan, cards):
    errors, warnings = [], []
    if not isinstance(plan, dict):
        return ['计划必须是对象'], warnings
    materials = plan.get('materials', {})
    stages = plan.get('stages')
    if not isinstance(materials, dict):
        errors.append('materials 必须是对象'); materials = {}
    if not isinstance(stages, list) or not stages:
        return errors + ['stages 缺失或为空'], warnings
    outputs, aliases, seen = {}, {}, set()
    for i, st in enumerate(stages):
        if not isinstance(st, dict):
            errors.append(f'阶段 {i+1} 必须是对象'); continue
        sid = st.get('stage')
        if type(sid) is not int or sid < 1 or sid in seen:
            errors.append(f'阶段编号非法或重复: {sid!r}'); continue
        if seen and sid <= max(seen): errors.append(f'阶段 {sid}: 阶段必须按编号递增')
        seen.add(sid)
        card = cards.get(st.get('workflow'))
        if not isinstance(card, dict):
            errors.append(f'阶段 {sid}: 工作流卡片不存在: {st.get("workflow")!r}'); continue
        bindings, params, out_map = st.get('bindings', {}), st.get('params', {}), st.get('outputs_to', {})
        if not all(isinstance(x, dict) for x in (bindings, params, out_map)):
            errors.append(f'阶段 {sid}: bindings、params、outputs_to 必须是对象'); continue
        inputs = {x.get('slot'): x for x in card.get('inputs', []) if isinstance(x, dict)}
        specs = {x.get('name'): x for x in card.get('params', []) if isinstance(x, dict)}
        declared = {x.get('slot'): x for x in card.get('outputs', []) if isinstance(x, dict)}
        for name in bindings.keys() - inputs.keys(): errors.append(f'阶段 {sid}: 未声明的输入槽 {name}')
        for name, spec in inputs.items():
            typ, src = spec.get('type'), bindings.get(name)
            if typ not in TYPES: errors.append(f'阶段 {sid}: 输入槽 {name} 类型无效'); continue
            if src is None:
                if spec.get('required', True): errors.append(f'阶段 {sid}: 必填输入槽未绑定: {name}')
                continue
            if not isinstance(src, str): errors.append(f'阶段 {sid}: 输入槽 {name} 的绑定必须是字符串'); continue
            if src.startswith('material:'):
                material = materials.get(src[9:])
                if not isinstance(material, dict) or material.get('type') not in TYPES or not isinstance(material.get('path'), str) or not material.get('path'):
                    errors.append(f'阶段 {sid}: 素材 {src} 必须提供 type 和 path'); continue
                if material['type'] != typ: errors.append(f'阶段 {sid}: 素材 {src} 类型 {material["type"]} 与 {name}({typ}) 不匹配')
            elif re.fullmatch(r'stage\d+\..+', src):
                actual = outputs.get(src) or aliases.get(src)
                if actual is None: errors.append(f'阶段 {sid}: 上游输出不存在或尚未执行: {src}')
                elif actual != typ: errors.append(f'阶段 {sid}: {src}({actual}) 与 {name}({typ}) 类型不匹配')
            elif typ != 'text': errors.append(f'阶段 {sid}: 输入槽 {name} 来源非法: {src}')
        for name in params.keys() - specs.keys(): errors.append(f'阶段 {sid}: 参数未声明: {name}')
        for name, spec in specs.items():
            if name not in params:
                if spec.get('required') and 'default' not in spec: errors.append(f'阶段 {sid}: 必填参数 {name} 缺失')
                if 'default' not in spec: continue
            value, typ, rng = params.get(name, spec.get('default')), spec.get('type'), spec.get('range')
            valid = {'int': lambda: type(value) is int, 'float': lambda: type(value) in (int, float) and math.isfinite(value), 'bool': lambda: type(value) is bool, 'string': lambda: isinstance(value, str), 'enum': lambda: isinstance(rng, list) and value in rng}
            if typ not in valid or not valid[typ](): errors.append(f'阶段 {sid}: 参数 {name} 类型或枚举值非法'); continue
            if typ in ('int', 'float') and rng is not None:
                if not isinstance(rng, list) or len(rng) != 2 or any(type(v) not in (int, float) for v in rng) or not rng[0] <= value <= rng[1]: errors.append(f'阶段 {sid}: 参数 {name} 超出有效范围')
        for name, spec in declared.items():
            typ = spec.get('type')
            if typ not in TYPES: errors.append(f'阶段 {sid}: 输出槽 {name} 类型无效'); continue
            outputs[f'stage{sid}.{name}'] = typ
        for name, target in out_map.items():
            if name not in declared: errors.append(f'阶段 {sid}: 输出槽未声明: {name}'); continue
            if not isinstance(target, str) or not target: errors.append(f'阶段 {sid}: 输出映射无效'); continue
            if target.startswith('stage') and not target.startswith(f'stage{sid}.'):
                errors.append(f'阶段 {sid}: 输出别名不能伪装成其他阶段: {target}'); continue
            if target in aliases or target in outputs: errors.append(f'阶段 {sid}: 输出别名重复或与标准输出冲突: {target}'); continue
            aliases[target] = declared[name].get('type')
    final = plan.get('final_output')
    if not isinstance(final, str) or final not in outputs and final not in aliases: errors.append(f'final_output 未指向已声明输出: {final!r}')
    return errors, warnings

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('plan', type=Path); ap.add_argument('--cards', type=Path, required=True)
    args = ap.parse_args()
    try:
        plan = json.loads(args.plan.read_text(encoding='utf-8'))
        if not args.cards.is_dir(): raise ValueError(f'卡片目录不存在: {args.cards}')
        cards = {}
        for path in sorted(args.cards.glob('*.json')):
            card = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(card, dict) or not isinstance(card.get('id'), str) or card['id'] in cards: raise ValueError(f'卡片 ID 无效或重复: {path}')
            cards[card['id']] = card
        errors, warnings = validate(plan, cards)
    except (OSError, ValueError, TypeError) as exc:
        print(json.dumps({'passed': False, 'errors': [str(exc)], 'warnings': []}, ensure_ascii=False)); return 2
    print(json.dumps({'passed': not errors, 'errors': errors, 'warnings': warnings}, ensure_ascii=False, indent=2))
    return int(bool(errors))

if __name__ == '__main__': sys.exit(main())
