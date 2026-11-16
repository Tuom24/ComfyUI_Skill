#!/usr/bin/env python3
"""CodeBuddy CLI adapter for comfytree-planner-v1; never a rule-based planner."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from codex_planner import INSTRUCTION, SKILL
from planner_common import cli_available, command_json, convert


def cli_command():
    configured = os.environ.get('COMFYTREE_WORKBUDDY_CLI_JSON')
    if configured: return command_json(configured, ['codebuddy'])
    if os.name == 'nt':
        found = shutil.which('codebuddy')
        if not found or Path(found).suffix.lower() in ('.cmd', '.bat'):
            # Official npm global install on Windows: execute its JS entry directly,
            # never pass prompts through a shell or interpolate a .cmd wrapper.
            entry = Path(os.environ.get('APPDATA', ''))/'npm/node_modules/@tencent-ai/codebuddy-code/bin/codebuddy'
            node = shutil.which('node')
            if node and entry.is_absolute() and entry.is_file(): return [node, str(entry)]
    return ['codebuddy']


def check():
    return cli_available(cli_command())


def child_environment():
    mode = os.environ.get('COMFYTREE_WORKBUDDY_ENV', 'clean').lower()
    if mode not in ('clean', 'inherit'): raise ValueError('COMFYTREE_WORKBUDDY_ENV 必须为 clean 或 inherit')
    if mode == 'inherit': return os.environ.copy()
    # Keep safety and approval settings from the parent. Discard desktop session
    # and account selectors so the standalone CLI uses its own logged-in account.
    protected = ('SANDBOX', 'SECURITY', 'APPROVAL', 'PERMISSION', 'PROTECTION', 'SAFE_DELETE')
    return {k:v for k,v in os.environ.items()
            if not k.upper().startswith(('WORKBUDDY_', 'CODEBUDDY_'))
            or any(word in k.upper() for word in protected)}


def parse_response(envelope):
    if isinstance(envelope, list):
        results = [item for item in envelope if isinstance(item, dict) and item.get('type') == 'result']
        if not results or any(item.get('is_error') for item in results): raise ValueError('CLI 未正常完成')
        # Prefer a structured final result. Some CLI versions instead place JSON
        # in assistant output_text messages while result is only a status sentence.
        candidates = []
        for item in envelope:
            if not isinstance(item, dict): continue
            if item.get('type') == 'message' and item.get('role') == 'assistant':
                for part in item.get('content') or []:
                    if isinstance(part, dict) and part.get('type') in ('text', 'output_text'):
                        candidates.append(part.get('text'))
            elif item.get('type') == 'result':
                candidates.extend([item.get('structured_output'), item.get('result')])
        for candidate in reversed(candidates):
            if isinstance(candidate, str):
                try: candidate = json.loads(candidate)
                except ValueError: continue
            if isinstance(candidate, dict) and candidate.get('kind') in ('plan','clarification'):
                return convert(candidate)
        raise ValueError('CLI 没有返回方案')
    if not isinstance(envelope, dict) or envelope.get('is_error'): raise ValueError('CLI 返回错误')
    response = envelope.get('structured_output') or envelope.get('result') or envelope
    if isinstance(response, str): response = json.loads(response)
    return convert(response)


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
                          timeout=300, cwd=str(SKILL), shell=False, env=child_environment())
    out = proc.stdout.strip()
    # JSON output can echo the user's task; do not treat words in that data as
    # authentication errors. CLI login failures are emitted as plain text.
    diagnostic = (('' if out.startswith(('{','[')) else out[:2000]) + ' ' + proc.stderr[:2000]).lower()
    if any(s in diagnostic for s in ('authentication required', 'please use /login', 'not logged in', 'unauthorized', '未登录', '请先登录')):
        raise RuntimeError('WorkBuddy/CodeBuddy CLI 尚未登录或授权；请在该 CLI 中完成登录。桌面客户端登录不保证 CLI 已登录。')
    if proc.returncode: raise RuntimeError('WorkBuddy/CodeBuddy CLI 运行失败；请检查登录、模型权限及 CLI 配置。')
    if len(out) > 1000000: raise ValueError('规划器响应过大')
    try:
        response = parse_response(json.loads(out))
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError('WorkBuddy/CodeBuddy CLI 未返回可解析的结构化方案；请检查所选模型和 CLI 版本。') from exc
    print(json.dumps(response, ensure_ascii=False)); return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except subprocess.TimeoutExpired: print('WorkBuddy/CodeBuddy 规划超时；未提交 ComfyUI。', file=sys.stderr); sys.exit(1)
    except Exception as exc: print(str(exc), file=sys.stderr); sys.exit(1)
