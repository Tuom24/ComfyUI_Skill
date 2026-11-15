# 语义卡片

卡片记录 `id`、`name`、`modality`、`task_family`、可核实的 `summary`、`inputs`、`outputs`、`params`、相对用户库根目录的 `api_graph` 及图文件 `sha256`。输入和输出用 `{ "slot": "image", "type": "image", "required": true }`；参数用 `{ "name": "steps", "type": "int", "range": [1, 100], "default": 20 }`。类型为 image、mask、video、audio、text 或 latent；参数类型为 string、int、float、bool、enum。image 和 mask 不可互换。`execution` 的节点映射及当前执行器限制见 [execution.md](execution.md)。

草稿只表达待核验的信息；检查所有输入、输出、节点和依赖后再投入执行。图更新后必须重新计算哈希并复核契约。
