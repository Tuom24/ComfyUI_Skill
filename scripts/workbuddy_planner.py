#!/usr/bin/env python3
"""CodeBuddy CLI adapter for comfytree-planner-v1; never a rule-based planner."""
import json
import os
import subprocess
import sys
from pathlib import Path
from codex_planner import INSTRUCTION, SKILL
from planner_common import cli_available, command_json, convert


def cli_command():
    return command_json(os.environ.get('COMFYTREE_WORKBUDDY_CLI_JSON'), ['codebuddy'])


def check():
    return cli_available(cli_command())


def main():
    if hasattr(sys.stdin, 'reconfigure'): sys.stdin.reconfigure(encoding='utf-8')
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) > 1 and sys.argv[1] == '--check':
        ok, message = check(); print(json.dumps({'available':ok,'message':message}, ensure_ascii=False)); return 0 if ok else 1
    request = json.load(sys.stdin)
    if not isinstance(request, dict): raise ValueError('规划请求必须是 JSON 对象')
    ok, message = check()
    if not ok: raise RuntimeError(message)
    schema = (SKILL/'assets/planner-response.schema.json').read_text(encoding='utf-8')
    args = cli_command() + ['--print', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
                            '--no-session-persistence', '--output-format', 'json', '--json-schema', schema]
    proc = subprocess.run(args, input=INSTRUCTION+json.dumps(request, ensure_ascii=False), text=True,
                          encoding='utf-8', errors='replace', stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=300, cwd=str(SKILL), shell=False)
    out = proc.stdout.strip()
    diagnostic = (out[:2000] + ' ' + proc.stderr[:2000]).lower()
    if any(s in diagnostic for s in ('authentication required', 'please use /login', 'not logged in', 'unauthorized', '未登录', '请先登录')):
        raise RuntimeError('WorkBuddy/CodeBuddy CLI 尚未登录或授权；请在该 CLI 中完成登录。桌面客户端登录不保证 CLI 已登录。')
    if proc.returncode: raise RuntimeError('WorkBuddy/CodeBuddy CLI 运行失败；请检查登录、模型权限及 CLI 配置。')
    if len(out) > 1000000: raise ValueError('规划器响应过大')
    try:
        envelope = json.loads(out)
        if isinstance(envelope, dict) and envelope.get('is_error'): raise ValueError('CLI 返回错误')
        response = envelope.get('structured_output') or envelope.get('result') if isinstance(envelope, dict) else None
        if response is None: response = envelope
        if isinstance(response, str): response = json.loads(response)
        response = convert(response)
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError('WorkBuddy/CodeBuddy CLI 未返回可解析的结构化方案；请检查所选模型和 CLI 版本。') from exc
    print(json.dumps(response, ensure_ascii=False)); return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except subprocess.TimeoutExpired: print('WorkBuddy/CodeBuddy 规划超时；未提交 ComfyUI。', file=sys.stderr); sys.exit(1)
    except Exception as exc: print(str(exc), file=sys.stderr); sys.exit(1)
