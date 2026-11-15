# ComfyTree 执行契约

技能安装目录的 `cards/` 和 `workflows/` 是随仓库分发的参考库；个人库使用独立目录，结构为 `cards/<id>.json` 与 `workflows/`。`register_workflow.py` 复制 API 图并建立未核验草稿，保留原字节和 SHA256，不覆盖现有文件。卡片通用字段见 [semantic-schema.md](semantic-schema.md)。

`execution` 显式绑定每个声明的槽和参数到 API 图中的标量字段，并绑定每个输出槽到保存节点。例如：

```json
"execution": {
  "verified": true,
  "inputs": {"image": {"node": "1", "field": "image"}, "prompt": {"node": "2", "field": "text"}},
  "params": {"steps": {"node": "3", "field": "steps"}},
  "outputs": {"result": "4"}
}
```

`verified` 代表维护者已经核实卡片覆盖图的所有素材和语义输入、节点映射及输出；不是脚本自动推断的质量认证。必须检查模型名称与自定义节点、正负提示词、多个 LoadImage、遮罩用途及默认值。当前实现只传递文本、LoadImage 图像/遮罩和恰好一张 SaveImage 图片；不能把 mask 当作 image、不能自动推断遮罩语义，也不检查文件解码、图像尺寸、模型文件和实际效果。只支持可信的本机或用户指定 ComfyUI 服务。

计划的 `materials` 项为 `{"type":"image", "path":"input.png"}`；路径相对于计划文件。`bindings` 是 `material:<名称>`、已执行阶段的 `stage<编号>.<输出槽>`、或文本字面量。阶段输出也可通过 `outputs_to` 建立当前阶段别名。各阶段 `params` 为卡片中声明的值；省略时使用卡片默认值。`final_output` 引用最终输出。

`--check` 访问 `/object_info`，检查所用节点是否注册、工作流哈希与节点映射；它不排队、不验证模型是否存在、也不能保证执行成功。真实运行依次提交 `/prompt`，记录 prompt ID，等待 `/history`，从 `/view` 取结果，并把下一阶段图片上传到 `/upload/image`。每次只能创建新的输出目录；若请求超时或连接中断，运行状态可能未知，检查队列及输出目录中的 `run.json` 后再决定是否重试。

前端启动器只负责启动用户指定的 Vite 项目并关闭录制模式。前端本身、后端以及本技能是不同组件：后端 API 与技能的计划格式目前尚无自动同步；连接健康、计划共享和真实执行需要单独联调。
