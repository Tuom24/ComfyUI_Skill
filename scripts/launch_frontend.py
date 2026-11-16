#!/usr/bin/env python3
"""Launch a user-specified ComfyTree Vite checkout in live-service mode."""
import argparse
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request
import webbrowser
from pathlib import Path

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--frontend', type=Path, default=Path(__file__).resolve().parents[1]/'web'); ap.add_argument('--port', type=int, default=5174); ap.add_argument('--api-url',default='http://127.0.0.1:8090'); ap.add_argument('--no-browser', action='store_true')
    args = ap.parse_args(); root = args.frontend.resolve(); url = f'http://127.0.0.1:{args.port}/'
    if not (root / 'package.json').is_file() or not (root / 'node_modules' / 'vite').is_dir():
        print('未找到前端或 Vite 依赖；请确认路径并在该目录安装依赖。'); return 1
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', args.port)) == 0:
            print(f'端口 {args.port} 已占用，无法确认现有服务身份；请指定其他端口。'); return 1
    env = os.environ.copy(); env['VITE_RECORDING_MODE'] = '0'; env['VITE_PILOT_MODE'] = 'live'; env['COMFYTREE_API_URL'] = args.api_url
    node = shutil.which('node')
    if not node: print('找不到 Node.js；请先安装 Node.js 22.12 或更高版本。'); return 1
    try:
        proc = subprocess.Popen([node, str(root / 'node_modules' / 'vite' / 'bin' / 'vite.js'), '--host', '127.0.0.1', '--port', str(args.port), '--strictPort'], cwd=root, env=env)
    except OSError as exc:
        print('无法启动前端，请检查 Node.js：' + str(exc)); return 1
    try:
        for _ in range(100):
            if proc.poll() is not None: print('前端进程提前退出，请检查上方错误。'); return 1
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    if response.status == 200: break
            except OSError: time.sleep(.1)
        else:
            print('前端启动超时。'); return 1
        try:
            with urllib.request.urlopen(args.api_url.rstrip('/') + '/api/health', timeout=3) as response:
                health = json.load(response)
            backend = bool(health.get('ok'))
            planner = health.get('planner', {})
        except (OSError, ValueError): backend, planner = False, {}
        if not args.no_browser: webbrowser.open(url)
        print(json.dumps({'url': url, 'pid': proc.pid, 'frontend': str(root), 'mode': 'live', 'backend': args.api_url,
                          'backend_reachable':backend, 'planner':planner}, ensure_ascii=False), flush=True)
        print('前端正在当前终端运行；保持终端开启，按 Ctrl+C 停止。Agent 服务和 ComfyUI 需分别启动。', flush=True)
        if not backend: print('提示：Agent 服务或 ComfyUI 未就绪，前端当前无法生成。', flush=True)
        elif planner.get('available') is False: print('提示：规划器不可用：' + planner.get('message','请检查配置'), flush=True)
        return proc.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
if __name__ == '__main__': raise SystemExit(main())
