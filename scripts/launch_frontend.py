#!/usr/bin/env python3
"""Launch a user-specified ComfyTree Vite checkout in live-service mode."""
import argparse
import json
import os
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
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    proc = subprocess.Popen(['node', str(root / 'node_modules' / 'vite' / 'bin' / 'vite.js'), '--host', '127.0.0.1', '--port', str(args.port), '--strictPort'], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags, start_new_session=os.name != 'nt')
    for _ in range(100):
        if proc.poll() is not None: print('前端进程提前退出，请手动运行 npm run dev 查看错误。'); return 1
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200: break
        except OSError: time.sleep(.1)
    else:
        proc.terminate(); print('前端启动超时。'); return 1
    if not args.no_browser: webbrowser.open(url)
    print(json.dumps({'url': url, 'pid': proc.pid, 'frontend': str(root), 'mode': 'live', 'backend': args.api_url, 'backend_checked': False}, ensure_ascii=True)); return 0
if __name__ == '__main__': raise SystemExit(main())
