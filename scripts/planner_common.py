"""Shared, conservative handling of structured planner responses."""
import json
import math
import shutil
from pathlib import Path


def executable(command):
    if not command or not isinstance(command, list) or not all(isinstance(x, str) and x for x in command):
        return None
    return shutil.which(command[0])


def convert(response):
    if not isinstance(response, dict) or response.get('kind') not in ('plan', 'clarification'):
        raise ValueError('规划器未返回合法的方案或澄清')
    if not isinstance(response.get('message'), str) or not isinstance(response.get('final_output'), str):
        raise ValueError('规划器响应缺少必要字段')
    if not isinstance(response.get('stages'), list):
        raise ValueError('规划器阶段格式无效')
    for stage in response['stages']:
        if not isinstance(stage, dict): raise ValueError('规划器阶段格式无效')
        bindings = {}
        for item in stage['bindings']:
            if item['slot'] in bindings: raise ValueError('规划器返回重复输入槽')
            bindings[item['slot']] = item['source']
        params = {}
        for item in stage['params']:
            if item['name'] in params: raise ValueError('规划器返回重复参数')
            value = json.loads(item['value_json'])
            if not isinstance(value, (str, int, float, bool)) or (isinstance(value, float) and not math.isfinite(value)):
                raise ValueError('规划器参数必须为有限 JSON 标量')
            params[item['name']] = value
        stage.update(bindings=bindings, params=params, outputs_to={})
    return response


def command_json(value, fallback):
    if not value: return fallback
    result = json.loads(value)
    if not isinstance(result, list) or not result or not all(isinstance(x, str) and x for x in result):
        raise ValueError('规划器 CLI 命令必须是非空 JSON 字符串数组')
    return result


def cli_available(command):
    resolved = executable(command)
    if not resolved: return False, '找不到规划器 CLI，请安装或配置其可执行文件。'
    if Path(resolved).suffix.lower() in ('.cmd', '.bat'):
        return False, 'Windows 批处理入口不能直接安全调用；请配置实际的可执行文件或 node 与 CLI 脚本。'
    if len(command) > 1 and Path(command[1]).is_absolute() and not Path(command[1]).is_file():
        return False, '规划器 CLI 脚本不存在，请检查配置的路径。'
    return True, 'CLI 可执行文件存在；登录状态和模型可用性尚未验证。'
