import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from validate_plan import validate
from run_plan import prepare, run

GRAPH = {'1': {'class_type': 'LoadImage', 'inputs': {'image': 'placeholder.png'}}, '2': {'class_type': 'CLIPTextEncode', 'inputs': {'text': 'old'}}, '3': {'class_type': 'SaveImage', 'inputs': {'images': ['1', 0]}}}
CARD = {'id': 'edit', 'inputs': [{'slot': 'image', 'type': 'image'}, {'slot': 'prompt', 'type': 'text'}], 'outputs': [{'slot': 'result', 'type': 'image'}], 'params': [{'name': 'steps', 'type': 'int', 'range': [1, 10], 'default': 3}], 'api_graph': 'workflows/edit.json', 'execution': {'verified': True, 'inputs': {'image': {'node': '1', 'field': 'image'}, 'prompt': {'node': '2', 'field': 'text'}}, 'params': {'steps': {'node': '2', 'field': 'text'}}, 'outputs': {'result': '3'}}}
PLAN = {'materials': {'photo': {'type': 'image', 'path': 'photo.png'}}, 'stages': [{'stage': 1, 'workflow': 'edit', 'bindings': {'image': 'material:photo', 'prompt': 'first'}, 'params': {}, 'outputs_to': {}}, {'stage': 2, 'workflow': 'edit', 'bindings': {'image': 'stage1.result', 'prompt': 'second'}, 'params': {}, 'outputs_to': {}}], 'final_output': 'stage2.result'}

class Handler(BaseHTTPRequestHandler):
    prompts = []
    uploads = []
    def log_message(self, *args): pass
    def send(self, content, kind='application/json'):
        if not isinstance(content, bytes): content = json.dumps(content).encode()
        self.send_response(200); self.send_header('Content-Type', kind); self.end_headers(); self.wfile.write(content)
    def do_GET(self):
        if self.path == '/object_info': self.send({name: {} for name in ('LoadImage', 'CLIPTextEncode', 'SaveImage')})
        elif self.path.startswith('/history/'):
            pid = self.path.split('/')[-1]; saved = {'images': [{'filename': pid + '.png', 'subfolder': '', 'type': 'output'}]}; self.send({pid: {'status': {'status_str': 'success', 'completed': True}, 'outputs': {'2': saved, '3': saved}}})
        elif self.path.startswith('/view?'): self.send(b'generated-image', 'image/png')
        else: self.send_error(404)
    def do_POST(self):
        data = self.rfile.read(int(self.headers['Content-Length']))
        if self.path == '/upload/image':
            self.uploads.append(data); self.send({'name': f'upload{len(self.uploads)}.png', 'subfolder': ''})
        elif self.path == '/prompt':
            self.prompts.append(json.loads(data)); self.send({'prompt_id': str(len(self.prompts))})
        else: self.send_error(404)

class Tests(unittest.TestCase):
    def test_validation_rejects_type_alias_and_bool(self):
        card = copy.deepcopy(CARD); cards = {'edit': card}
        plan = copy.deepcopy(PLAN); self.assertEqual(validate(plan, cards)[0], [])
        plan['materials']['photo']['type'] = 'mask'; self.assertTrue(validate(plan, cards)[0])
        plan = copy.deepcopy(PLAN); plan['stages'][0]['outputs_to'] = {'result': 'stage2.result'}; self.assertTrue(validate(plan, cards)[0])
        plan = copy.deepcopy(PLAN); plan['stages'][1]['bindings']['image'] = 'stage1.missing'; self.assertTrue(validate(plan, cards)[0])
        plan = copy.deepcopy(PLAN); plan['stages'][0]['params']['steps'] = True; self.assertTrue(validate(plan, cards)[0])
        plan = copy.deepcopy(PLAN); plan['stages'][0]['bindings']['image'] = 4; self.assertTrue(validate(plan, cards)[0])

    def test_registration_and_two_stage_http(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); original = root / 'original.json'; raw = json.dumps(GRAPH).encode(); original.write_bytes(raw)
            library = root / 'library'
            command = [sys.executable, str(ROOT / 'scripts/register_workflow.py'), str(original), '--library', str(library), '--id', 'edit']
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            card = copy.deepcopy(CARD); card['sha256'] = hashlib.sha256(raw).hexdigest()
            # No duplicate input mapping: this fixture needs no configurable parameter.
            card['params'] = []; card['execution']['params'] = {}
            (library / 'cards/edit.json').write_text(json.dumps(card), encoding='utf-8')
            (root / 'photo.png').write_bytes(b'user-image'); (root / 'plan.json').write_text(json.dumps(PLAN), encoding='utf-8')
            Handler.prompts, Handler.uploads = [], []
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler); thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            try:
                cmd = [sys.executable, str(ROOT / 'scripts/run_plan.py'), str(root / 'plan.json'), '--cards', str(library / 'cards'), '--server', f'http://127.0.0.1:{server.server_port}', '--output', str(root / 'result')]
                checked = subprocess.run(cmd + ['--check'], capture_output=True); self.assertEqual(checked.returncode, 0, checked.stdout); self.assertEqual(len(Handler.prompts), 0)
                completed = subprocess.run(cmd, capture_output=True); self.assertEqual(completed.returncode, 0, completed.stdout)
                self.assertEqual(len(Handler.prompts), 2); self.assertIn(b'user-image', Handler.uploads[0]); self.assertIn(b'generated-image', Handler.uploads[1]); self.assertEqual(Handler.prompts[1]['prompt']['2']['inputs']['text'], 'second')
                self.assertEqual(json.loads((root / 'result/run.json').read_text(encoding='utf-8'))['status'], 'completed')
                self.assertEqual((root / 'result/stage2_result.png').read_bytes(), b'generated-image')
                self.assertNotEqual(subprocess.run(cmd, capture_output=True).returncode, 0)
                card['execution']['verified'] = False; (library / 'cards/edit.json').write_text(json.dumps(card), encoding='utf-8')
                self.assertNotEqual(subprocess.run(cmd + ['--check'], capture_output=True).returncode, 0)
                self.assertEqual(len(Handler.prompts), 2)
            finally: server.shutdown(); server.server_close(); thread.join()

    def test_shipped_smoke_example(self):
        with tempfile.TemporaryDirectory() as tmp:
            example = Path(tmp) / 'smoke'; shutil.copytree(ROOT / 'examples/smoke', example)
            (example / 'input.png').write_bytes(b'input-image')
            Handler.prompts, Handler.uploads = [], []
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler); thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            try:
                cmd = [sys.executable, str(ROOT / 'scripts/run_plan.py'), str(example / 'plan.json'), '--cards', str(example / 'library/cards'), '--server', f'http://127.0.0.1:{server.server_port}', '--output', str(example / 'result')]
                result = subprocess.run(cmd, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertEqual((example / 'result/stage1_result.png').read_bytes(), b'generated-image')
                self.assertEqual(len(Handler.prompts), 1)
            finally: server.shutdown(); server.server_close(); thread.join()

    def test_cancellation_prevents_submission_and_missing_model_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            example=Path(tmp)/'smoke'; shutil.copytree(ROOT/'examples/smoke',example)
            (example/'input.png').write_bytes(b'input-image')
            plan=json.loads((example/'plan.json').read_text(encoding='utf-8'))
            Handler.prompts,Handler.uploads=[],[]
            server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                base=f'http://127.0.0.1:{server.server_port}'
                result=run(plan,example/'library/cards',example,base,example/'cancelled',30,cancelled=lambda:True)
                self.assertEqual(result['status'],'cancelled');self.assertEqual(Handler.prompts,[]);self.assertEqual(Handler.uploads,[])
            finally: server.shutdown();server.server_close();thread.join()
            generation=ROOT/'examples/text-to-image/library'
            t2i={'materials':{},'stages':[{'stage':1,'workflow':'sd15-text-image','bindings':{'prompt':'test','negative':''},'params':{},'outputs_to':{}}],'final_output':'stage1.result'}
            graph=json.loads((generation/'workflows/sd15-text-image.json').read_text(encoding='utf-8'))
            registry={node['class_type']:{} for node in graph.values()}
            registry['CheckpointLoaderSimple']={'input':{'required':{'ckpt_name':[[]]}}}
            with self.assertRaisesRegex(ValueError,'模型'): prepare(t2i,generation/'cards',example,registry)

if __name__ == '__main__': unittest.main()
