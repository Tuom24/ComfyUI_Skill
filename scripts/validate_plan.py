#!/usr/bin/env python3
"""校验 ComfyFlow 组合计划：卡片引用、槽类型契约、依赖顺序、参数范围。

用法:
    python validate_plan.py <plan.json> --cards <cards目录>

输出 JSON: {"passed": bool, "errors": [...], "warnings": [...]}
退出码: 0 = 通过, 1 = 未通过, 2 = 用法/文件错误
"""

import argparse
import json
import sys
from pathlib import Path

MEDIA_TYPES = {"image", "mask", "video", "audio", "text", "latent"}


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def check_types(value, p, errors):
    t = p.get("type")
    if t == "int" and not isinstance(value, int):
        errors.append(f"参数 {p['name']} 应为 int，实际 {value!r}")
    elif t == "float" and not isinstance(value, (int, float)):
        errors.append(f"参数 {p['name']} 应为 float，实际 {value!r}")
    elif t == "bool" and not isinstance(value, bool):
        errors.append(f"参数 {p['name']} 应为 bool，实际 {value!r}")
    elif t == "string" and not isinstance(value, str):
        errors.append(f"参数 {p['name']} 应为 string，实际 {value!r}")
    rng = p.get("range")
    if rng and isinstance(value, (int, float)) and len(rng) == 2 and not (rng[0] <= value <= rng[1]):
        errors.append(f"参数 {p['name']}={value} 超出范围 {rng}")
    if rng and isinstance(value, str) and rng and value not in rng:
        errors.append(f"参数 {p['name']}={value!r} 不在枚举 {rng} 中")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("plan", type=Path)
    ap.add_argument("--cards", type=Path, required=True, help="语义卡片目录")
    args = ap.parse_args()

    errors, warnings = [], []
    try:
        plan = load_json(args.plan)
    except Exception as e:
        print(json.dumps({"passed": False, "errors": [f"计划文件读取失败: {e}"], "warnings": []}))
        return 2

    cards = {}
    if args.cards.is_dir():
        for f in sorted(args.cards.glob("*.json")):
            try:
                c = load_json(f)
                cards[c.get("id", f.stem)] = c
            except Exception as e:
                warnings.append(f"卡片 {f.name} 解析失败: {e}")
    else:
        errors.append(f"卡片目录不存在: {args.cards}")

    stages = plan.get("stages")
    if not isinstance(stages, list) or not stages:
        errors.append("stages 缺失或为空")
        print(json.dumps({"passed": False, "errors": errors, "warnings": warnings}, ensure_ascii=False))
        return 1

    outputs_index = {}   # "stageN.slot" -> media type
    declared_finals = set()
    seen_ids = set()

    for st in stages:
        sid = st.get("stage")
        if not isinstance(sid, int) or sid < 1:
            errors.append(f"阶段编号非法: {sid!r}")
            continue
        if sid in seen_ids:
            errors.append(f"阶段编号重复: {sid}")
        seen_ids.add(sid)

        wid = st.get("workflow")
        card = cards.get(wid)
        if card is None:
            errors.append(f"阶段 {sid}: 工作流卡片不存在: {wid!r}")
            continue

        bindings = st.get("bindings", {})
        for slot_spec in card.get("inputs", []):
            name, typ, req = slot_spec["slot"], slot_spec["type"], slot_spec.get("required", True)
            src = bindings.get(name)
            if src is None:
                if req:
                    errors.append(f"阶段 {sid}: 必填输入槽未绑定: {name}")
                else:
                    warnings.append(f"阶段 {sid}: 可选槽 {name} 未绑定，按卡片默认行为处理")
                continue
            if src.startswith("material:"):
                key = src[len("material:"):]
                if key not in (plan.get("materials") or {}):
                    errors.append(f"阶段 {sid}: 槽 {name} 绑定的素材不存在: {src}")
                continue
            if src.startswith("stage"):
                ref_sid, _, ref_slot = src.partition(".")
                try:
                    ref_n = int(ref_sid[len("stage"):])
                except ValueError:
                    errors.append(f"阶段 {sid}: 绑定引用格式非法: {src}")
                    continue
                if ref_n >= sid:
                    errors.append(f"阶段 {sid}: 依赖了非上游阶段 {src}（依赖必须单向向前）")
                    continue
                src_type = outputs_index.get(src)
                if src_type is None:
                    errors.append(f"阶段 {sid}: 上游 {src} 不是已声明的输出槽")
                elif src_type != typ:
                    errors.append(f"阶段 {sid}: 类型不匹配 — {src}({src_type}) → {name}({typ})")
                continue
            if typ == "text":
                continue  # text 槽允许直接绑定字面量提示词
            errors.append(f"阶段 {sid}: 绑定来源非法: {src}（非 text 槽须用 material: 或 stage 引用）")

        for param_spec in card.get("params", []):
            name = param_spec["name"]
            vals = dict(st.get("params", {}))
            # bindings 中与参数同名的字面量视为参数取值（便于直接写 prompt 等）
            for k, v in (st.get("bindings") or {}).items():
                if k == name and k not in vals and isinstance(v, (str, int, float, bool)):
                    vals[k] = v
            if name in vals:
                check_types(vals[name], param_spec, errors)
            elif param_spec.get("required"):
                if "default" not in param_spec:
                    errors.append(f"阶段 {sid}: 必填参数 {name} 缺失且卡片无默认值")
                else:
                    warnings.append(f"阶段 {sid}: 参数 {name} 使用默认值 {param_spec['default']}")
            elif name in vals:
                pass
        extra = set(st.get("params", {})) - {p["name"] for p in card.get("params", [])}
        if extra:
            errors.append(f"阶段 {sid}: 参数不在卡片声明中: {sorted(extra)}")

        out_map = st.get("outputs_to", {})
        declared = {o["slot"]: o["type"] for o in card.get("outputs", [])}
        for slot, target in out_map.items():
            if slot not in declared:
                errors.append(f"阶段 {sid}: outputs_to 引用了未声明的输出槽 {slot}")
                continue
            outputs_index[f"stage{sid}.{slot}"] = declared[slot]
            if isinstance(target, str) and target != "final":
                outputs_index[target] = declared[slot]  # 别名同样可供下游引用
            if target == plan.get("final_output") or (isinstance(target, str) and target.startswith("final")):
                declared_finals.add(target)
        for slot in declared:
            if slot not in out_map:
                warnings.append(f"阶段 {sid}: 输出槽 {slot} 未接入 outputs_to（将被丢弃）")

    final = plan.get("final_output")
    if not final:
        errors.append("缺少 final_output")
    elif final not in declared_finals:
        errors.append(f"final_output={final!r} 未被任何阶段的 outputs_to 指向")

    report = {"passed": not errors, "errors": errors, "warnings": warnings}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
