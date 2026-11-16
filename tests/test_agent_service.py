import json
import shutil
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from agent_service import Service, Handler as ApiHandler
from test_comfytree import Handler

class ServiceTests(unittest.TestCase):
    def test_health_reports_missing_planner_and_comfy_failure_separately(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); lib=root/'library'; shutil.copytree(ROOT/'examples/smoke/library',lib)
            ApiHandler.service=Service(lib,root/'state','http://127.0.0.1:1',[str(root/'missing-executable')])
            server=ThreadingHTTPServer(('127.0.0.1',0),ApiHandler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}/api/health'
            try:
                with patch('agent_service.get_json', return_value={}):
                    with urllib.request.urlopen(url,timeout=3) as response: health=json.load(response)
                self.assertTrue(health['ok']); self.assertFalse(health['planner']['available'])
                self.assertEqual(health['planner']['login'],'unknown');self.assertTrue(health['library']['available'])
                self.assertNotIn('不存在',health['library']['message']);self.assertTrue(health['comfyui']['available'])
                with patch('agent_service.get_json', side_effect=OSError('connection')):
                    with self.assertRaises(urllib.error.HTTPError) as caught: urllib.request.urlopen(url,timeout=3)
                    self.assertEqual(caught.exception.code,503)
                    failure=json.load(caught.exception)
                    self.assertIn('无法连接 ComfyUI',failure['error']); self.assertFalse(failure['comfyui']['available'])
            finally:
                server.shutdown();server.server_close();thread.join()

    def test_missing_planner_is_reported_without_claiming_login(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); lib=root/'library'; shutil.copytree(ROOT/'examples/smoke/library',lib)
            service=Service(lib,root/'state','http://127.0.0.1:1',[str(root/'missing-executable')])
            status=service.planner_status()
            self.assertFalse(status['available']); self.assertEqual(status['login'],'unknown')
            with self.assertRaisesRegex(RuntimeError, '找不到规划器'):
                service.plan({'id':'revision','text':'copy','output':'image','assets':[],'fingerprint':'f'})

    def test_external_planner_freezes_inputs_and_executes_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); lib=root/'library'; shutil.copytree(ROOT/'examples/smoke/library',lib)
            # A separate executable implements the documented, agent-neutral JSON protocol.
            planner=root/'planner.py'
            planner.write_text('''import json,sys\nr=json.load(sys.stdin)\na=r["materials"][0]["id"]\nprint(json.dumps({"kind":"plan","message":"copy image","stages":[{"stage":1,"workflow":"image-copy","bindings":{"image":"material:"+a},"params":{},"outputs_to":{}}],"final_output":"stage1.result"}))\n''',encoding='utf-8')
            Handler.prompts,Handler.uploads=[],[]
            server=ThreadingHTTPServer(('127.0.0.1',0),Handler); thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                service=Service(lib,root/'state',f'http://127.0.0.1:{server.server_port}',[sys.executable,str(planner)])
                self.assertEqual(service.catalog()[0]['modality'], 'i2i')
                original=b'\x89PNG\r\n\x1a\nfixture-bytes'; asset=service.upload(original,'image/png')
                revision={'id':'revision-1','text':'copy my image','output':'image','assets':[{'id':asset['id'],'name':'a.png','role':'source'}],'fingerprint':'original'}
                visible=service.plan(revision)
                self.assertEqual(visible['runtimeValidation'],'passed')
                # Subsequent source changes cannot alter an already approved plan.
                (lib/'workflows/image-copy.json').write_text('{}',encoding='utf-8')
                (root/'state/assets'/f"{asset['id']}.png").write_bytes(b'changed')
                request={'id':'run-1','planId':visible['id'],'revisionId':'revision-1','fingerprint':'original'}
                service.submit(request)
                deadline=time.monotonic()+10
                while time.monotonic()<deadline:
                    row=service.get('runs','run-1')
                    if row['status'] in ('completed','failed','cancelled'): break
                    time.sleep(.05)
                self.assertEqual(row['status'],'completed',row.get('error'))
                self.assertIn(original,Handler.uploads[0]); self.assertEqual(len(Handler.prompts),1)
                self.assertEqual(service.submit(request)['status'],'completed'); self.assertEqual(len(Handler.prompts),1)
                self.assertEqual((root/'state/outputs/run-1/stage1_result.png').read_bytes(),b'generated-image')
                with self.assertRaises(ValueError): service.submit({**request,'revisionId':'different'})
                with self.assertRaises(ValueError): service.submit({**request,'id':'run-2'})
            finally:
                server.shutdown();server.server_close();thread.join()

    def test_clarification_does_not_submit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); lib=root/'library';shutil.copytree(ROOT/'examples/smoke/library',lib)
            planner=root/'planner.py';planner.write_text('import json,sys\njson.load(sys.stdin)\nprint(json.dumps({"kind":"clarification","message":"need image","stages":[],"final_output":""}))\n',encoding='utf-8')
            service=Service(lib,root/'state','http://127.0.0.1:1',[sys.executable,str(planner)])
            plan=service.plan({'id':'r','text':'improve image','output':'image','assets':[],'fingerprint':'f'})
            self.assertTrue(plan['blockers']);self.assertEqual(plan['runtimeValidation'],'failed')
            with self.assertRaises(ValueError): service.submit({'id':'x','planId':plan['id'],'revisionId':'r','fingerprint':'f'})

if __name__=='__main__': unittest.main()
