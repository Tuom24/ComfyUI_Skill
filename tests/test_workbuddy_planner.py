import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class WorkBuddyPlannerTests(unittest.TestCase):
    def invoke(self, cli_source, request):
        with tempfile.TemporaryDirectory() as directory:
            cli = Path(directory)/'fake_cli.py'
            cli.write_text(cli_source, encoding='utf-8')
            env = {**os.environ, 'PYTHONUTF8':'1', 'COMFYTREE_WORKBUDDY_CLI_JSON':json.dumps([sys.executable, str(cli)])}
            return subprocess.run([sys.executable, str(ROOT/'scripts/workbuddy_planner.py')], input=json.dumps(request),
                                  capture_output=True, text=True, encoding='utf-8', env=env, timeout=15)

    def test_cli_receives_data_and_returns_valid_protocol(self):
        cli = '''import json,sys\nargs=sys.argv[1:]\nassert args[args.index("--tools")+1]==""\nassert "--strict-mcp-config" in args and "--no-session-persistence" in args\nprompt=sys.stdin.read()\nassert "a red apple" in prompt\nresponse={"kind":"plan","message":"ok","stages":[{"stage":1,"workflow":"sd15-text-image","bindings":[{"slot":"prompt","source":"a red apple"}],"params":[{"name":"steps","value_json":"12"}]}],"final_output":"stage1.result"}\nprint(json.dumps({"result":json.dumps(response)}))\n'''
        proc = self.invoke(cli, {'task':'a red apple','cards':[]})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        stage = json.loads(proc.stdout)['stages'][0]
        self.assertEqual(stage['bindings'], {'prompt':'a red apple'})
        self.assertEqual(stage['params'], {'steps':12})

    def test_login_failure_is_detected_even_with_zero_exit(self):
        proc = self.invoke('print("Authentication required. Please use /login command to sign in")', {'task':'x'})
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn('尚未登录或授权', proc.stderr)
        self.assertFalse(proc.stdout.strip())

    def test_duplicate_slots_are_rejected(self):
        response = {'kind':'plan','message':'ok','stages':[{'stage':1,'workflow':'x','bindings':[{'slot':'x','source':'a'},{'slot':'x','source':'b'}],'params':[]}],'final_output':'stage1.result'}
        proc = self.invoke('import json\nprint(json.dumps('+repr({'result':json.dumps(response)})+'))', {'task':'x'})
        self.assertNotEqual(proc.returncode, 0)
        self.assertFalse(proc.stdout.strip())


if __name__ == '__main__': unittest.main()
