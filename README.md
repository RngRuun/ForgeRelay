# ForgeRelay 0.6.1 · 智能体协作桌面应用

一个本地运行的「人 + Codex + DeepSeek」CLI 和可视化协作应用。人确定方向，Codex 拆分工作、主持整合并验收，DeepSeek 既能执行明确派工，也保留独立质疑权。没有真实模型接入就不会生成模型发言或工具成果。

## 启动

Windows 免安装版在 [GitHub Releases](https://github.com/RngRuun/ForgeRelay/releases/latest) 下载 `ForgeRelay-0.6.1-Windows-x64.exe`，双击即可启动。内置 Electron 和 Node.js 22.23.4，无须安装浏览器或 Node.js，也不需要管理员权限。私有仓库的下载需要有权限的 GitHub 账号。

Release 同时提供 SHA-256 校验文件。应用尚未做代码签名，Windows 可能显示发行者验证提示。本机开发目录的打包结果仍位于相邻目录 `ForgeRelay-App/`；使用 `win-unpacked/ForgeRelay.exe` 时须保留完整目录。

实际模型执行需为参与的供应商配置接入：Codex 需要安装并登录本机 CLI，DeepSeek 需要有效 API Key。也支持仅一个模型参与。外部技能、Python 文档解析和 Computer Use 依赖按下文配置。发行包不包含任何用户凭证、会话或项目文件。

- 双击 `打开应用.cmd` 启动真正的桌面程序；三方会谈为默认首页。应用会自动启动或复用本机协作引擎。
- 双击 `三方对话.cmd`，或在本目录运行 `npm run chat`。
- 双击 `启动ForgeRelay.cmd` 同样打开桌面应用。`start.ps1` 保留为 CLI / 浏览器调试入口。
- CLI 输入 `/key` 隐藏输入密钥，再用 `/check` 验证；也可在应用「模型接入」中配置。
- 密钥仅保存在当前后台服务内存；服务重启需要重新输入。不会保存到浏览器存储、任务文件或源码。
- CLI 与桌面共享同一后台与会话。`/quit` 暂停讨论并退出终端；`stop.ps1` 停止后台。

## 从源码运行与构建

基础服务只使用 Node.js 内置模块。使用 Node.js 22 或更新版本，在仓库根目录运行 `npm start`，或通过 `npm run chat` 使用 CLI。运行回归测试使用 `npm test`；文档解析相关测试需要 Python 3，可通过 `RELAY_PYTHON` 指定解释器；独立浏览器测试需要 Playwright 1.62.1 和 Microsoft Edge，可用 `npm install --no-save --package-lock=false playwright@1.62.1` 准备。测试不会调用真实付费模型，也不要求已有 Codex 登录。

Windows 构建：

```powershell
npm ci --prefix desktop --registry https://registry.npmjs.org
npm run desktop:dist
```

构建脚本从 Node.js 官方站点下载固定版本的 Windows x64 运行时并验证 SHA-256。程序生成在仓库相邻的 `ForgeRelay-App/` 目录。源码不提交运行时二进制、开发依赖、用户数据或本机侧边配置。GitHub Actions 提供回归检查及手动 Windows 构建。检查说明见 [RELEASE-CHECKS.md](RELEASE-CHECKS.md)。

桌面菜单支持新建会谈（Ctrl+N）、添加附件（Ctrl+O）、切换三方会谈 / 任务控制 / 模型实验室（Ctrl+1/2/3）、缩放和打开数据目录。项目输入框旁可调用原生文件夹选择；附件可直接拖入会谈。关闭由应用管理的执行中窗口时，可选择托盘继续或停止并退出。复用 CLI 已启动的引擎时，退出桌面窗口会保留该引擎。

首次在其他机器运行时，数据保存到 `%APPDATA%/ForgeRelay/data`。本机发行目录旁的 `ForgeRelay.config.json` 指向现有源码数据目录，保留全部原有记录。该文件只含 `dataDir` 和 `port`，没有密钥；移动应用时可移除此文件使用默认目录，或指定一个本机绝对路径。请勿同时启动两个引擎写入同一个数据目录。

源码桌面构建：在 `desktop/` 执行 `npm ci`，把 Node.js 22+ 的 `node.exe` 和对应许可证放入 `desktop/runtime/`，然后执行 `npm run dist`。`npm run pack` 生成解压目录版。

例如先在 CLI 输入：

```text
/project "C:\Projects\my-app"
/attach "C:\Docs\需求.docx"
/attach "C:\Images\界面.png"
/mode work
/skill design-taste-frontend
请实现这个需求。Codex 拆分并分派调查和实现任务给 DeepSeek，双方检查实际交付，有问题退回重做，再充分讨论剩余分歧。
```

也可启动时指定：

```text
npm run chat -- --project "C:\Projects\my-app" --attach "C:\Docs\需求.docx" --mode work --direction "实现这个需求并分别检查交付"
```

## 派工与深度协作

Codex 主代理可以实际调用 `delegate_task`，给 DeepSeek 一份合同：目标、明确文件范围、验收标准、约束。DeepSeek 在自己的真实 API 工具回路里规划、读取、修改、运行命令、加载技能和调用自己的子代理。它返回的是带实际请求、工具记录和文件哈希的交付。

`submitted` 只是待验收。Codex 必须先 `inspect_task` 查看，再亲自读取文件或运行验证，以真实复核工具 ID 调用 `review_task`。不合格时 `changes_requested`，后续审议也能将已验收的原任务退回；再 `retry_task` 把原合同和意见交回 DeepSeek；最多四次执行。DeepSeek 和子代理不能自我验收。调查任务可以不写文件；实施范围用明确文件路径，`write_file` 强制校验范围和旧内容哈希。Shell 命令以当前用户权限运行，文件范围与 cwd 不构成操作系统沙箱。

网页「派工」页签和 CLI `/tasks`、`/task ID` 显示合同、历次交付、独立验收和返工。未验收、失败或受阻的当前方向任务会阻止最终共识；验收后的交付文件被修改也会阻止共识。

双方先确认同一份 Grounding 协议与哈希。Codex 提案后，DeepSeek 提出具体质疑、替代方案和异议，Codex 给出反方回应与修订，构成一轮。默认至少三轮，然后双方对同一方案、人工方向、规则、运行时和实际文件版本独立投票。异议只有提出者能关闭。到限、失败、等待人答复都不会算作一致。

人随时插话，会中断过时请求、使旧票和旧派工失效，双方按新方向重新审查。重启不会自动产生付费推理。恢复旧协议会话时，保留历史并要求双方重新确认当前协议。

## 实际能力

默认会谈由当前 lead 直接回应，每次回复后等待用户。用户明确要求讨论、点击「发起讨论」或接受 lead 的讨论邀请后，才启动完整团队互审。复杂度由 lead 按 1–5 判断，默认阈值为 4；达到阈值时先询问，用户可选择讨论或由 lead 直接处理。普通聊天没有最低互审轮次，不再为角色确认单独产生多次空调用。

会谈顶部与输入区的「会谈设置」可随时修改双方叛逆值、最低/最多互审轮数（含不限）、复杂度阈值与 lead。设置只应用于当前会谈，保留记录和成果；运行中的过期请求被中断，后续使用新设置，旧表决失效。只改设置不会启动新推理；原来正在运行时才按新配置继续。用户的停止、暂停指令直接进入调度层，不会触发一轮轮停止声明。

CLI 同步支持 `/discuss`、`/direct`、`/lead 角色ID`、`/rebellion codex|deepseek 数值` 和 `/rounds 最低轮数 上限`，上限可填写 `unlimited`。普通输入按自然对话发送，lead 发出讨论邀请后也可以直接回复「好的」或「不用」。

模型实验室的「互审流程」可以分别把最多互审轮数、默认调用次数和默认 Token 预算设为「不限」。新会谈可以覆盖这些默认值；已有会谈可在「调用与数据 → 调整运行上限」中切换，确认后继续运行。任务控制的新建和复制任务也支持三项独立设置。CLI 的 `--max-rounds`、`--max-calls`、`--tokens` 以及 `/continue` 参数可填写 `unlimited`。不限只取消应用累计上限，仍保留最低互审轮数、独立表决、暂停与停止；实际调用量和缓存命中率继续记录。供应商自身的单次上下文、输出和账户限制仍然适用。

- 附件：图片、文档、代码和任意原始文件；最多 40 个，每个 25 MiB。文件复制并保存原始哈希。
- 原生图像：PNG/JPEG/GIF/WebP。双方实际接收图片；自动输入最多 6 张、合计 16 MiB，其余可用工具读取。
- 文本与代码：按 UTF-8 提取；大型文本有明确截断标记。DOCX/PPTX/XLSX/ODF 使用实际文件解析，不执行宏、不重新计算公式。
- PDF：通过 Python/pypdf 提取文本；扫描件与图表需要先实际渲染或 OCR，再读图片。未知二进制只保留原件与元数据，不声称已理解。
- 项目：共享真实目录，读取适用 AGENTS.md；文件读写、检索、哈希冲突检查、命令退出码与标准输出/错误。
- 技能：发现本机和应用内实际 SKILL.md，读取完整指令和支持文件；人指定的技能必须加载。加载不等于执行完工作流。
- Agent：Codex 使用真实 CLI 原生配置与 Relay MCP；DeepSeek 使用 Relay 承载的执行代理和独立 DeepSeek 子代理。每会话子代理最多 8 个、深度最多两层，共享预算。CLI 不会自动拥有桌面应用专属的连接器；缺失能力会明确报错。
- 后台服务：`start_process` 启动，`read_process` 观察日志，`stop_process` 停止已知会话。每会话最多三个。暂停、停止和服务退出会清理实际进程树。Windows Job Object 与父进程监视器防止工具进程遗留。
- Computer Use：默认关闭。`/computer browser` 为双方各开独立浏览器上下文；`/computer desktop` 允许实际 Windows 桌面截图、点击和输入，操作串行。桌面交互同时要求工作模式。截图会发送给参与操作的模型。桌面实体操作尚未在用户桌面联调；测试只检查脚本解析与默认关闭。

独立浏览器需要 Playwright 和浏览器；本机会使用现有依赖和 Edge。其他机器可在应用目录安装 `playwright`。文档提取需要 Python，PDF 文本需要 `pypdf`，可通过 `RELAY_PYTHON` 指定解释器。技能依赖的外部服务仍需各自接入。

## CLI 常用命令

| 命令 | 用途 |
| --- | --- |
| `/new 方向`、`/start` | 新建 / 开始讨论 |
| `/attach 路径`、`/project 路径`、`/files` | 添加文件 / 挂载项目 / 查看资源 |
| `/mode read`、`/mode work` | 只读调查 / 实际实施 |
| `/computer off`、`/computer browser`、`/computer desktop` | 关闭 / 独立浏览器 / Windows 桌面 |
| `/skills`、`/skill 名称`、`/tools` | 技能与工具 |
| `/tasks`、`/task ID`、`/agents` | 派工 / 详情 / 实际子代理 |
| `/processes`、`/kill ID` | 后台进程和停止 |
| `/pause`、`/stop`、`/quit` | 暂停 / 停止 / 退出终端 |
| `/status`、`/rules`、`/save` | 当前方案与异议 / Grounding / 导出完整记录 |
| `/list`、`/resume ID`、`/web` | 历史 / 切换会话 / 网页地址 |
| `/continue 轮数 调用数 tokens` | 显式增加总预算后继续 |

默认最低 3 轮、最高 12 轮、100 次调用、1,000,000 个已返回 tokens。上限检查单位为 DeepSeek HTTP 请求或 Codex CLI 回合；一个 CLI 回合可能包含多次模型和工具请求，因此末次回合可能超额，不能把它当精确费用硬上限。取消的请求可能没有返回用量，会显示「用量未返回」。Codex 会话累计用量按差分记录，避免重复累计。模型价格与真实账单以提供商为准。

## 文件和验证

`npm test` 运行协议、调度、附件、派工、进程生命周期、MCP 和 HTTP 测试。`VALIDATION.md` 区分自动化测试与实际模型联调。默认数据在 `data/`，导出记录在 `outputs/discussions/`。不要把包含个人项目资料的运行目录随源码打包。

界面沿用 taste-skill 的 Data terminal 方向（seed 1819774974），使用 Public Sans 与 IBM Plex Mono。字体随包本地加载，许可在 `public/fonts/*-OFL.txt`，避免外部字体阻塞应用启动。Glass 版增加磨砂面板、光标缓动光池、局部高光、交互反馈和可保存的光效开关；触屏与系统减少动态效果时自动降级。设计细节和验证范围见 `DESIGN.md`。

## 模型实验室 · 0.5

打开 http://127.0.0.1:4317/models 。新页面使用本地 Vue 3、JavaScript 和 CSS；Node.js 提供调度服务。Python 仅用于既有文档提取，不负责前端。

分别设置 Codex 和 DeepSeek 的模型 ID、角色提示词、推理参数与共享 Harness 工具开关。可复制、命名、保存、切换、导入与导出配置。预览使用后端真实适配器的参数转换逻辑，不产生推理费用。DeepSeek 思考模式不发送 temperature，Top P 仅在已确认支持的模型与模式下发送。未知模型由提供商确认能力。

配置文件为 data/model-profiles.json，不保存接入密钥。API Key 只在服务进程内存中，重启后需重新输入。新会话固定配置快照，派工与子代理继承；无快照的旧会话首次继续时采用当前配置，并重新确认角色与协议。Codex 留空参数仍继承 CLI 当前本机设置，需完全固定时请显式填写。

CLI：/models 查看页面地址；/profiles 列出配置；/profile ID 为新会话切换配置。工具开关只限制 ForgeRelay 共享 Harness；Codex 原生技能、工具和连接器仍由本机 CLI 配置管理。

设计预设：DESIGN_VARIANCE=7、MOTION_INTENSITY=6、VISUAL_DENSITY=5。已移除独立光标圆环与全屏跟随层；仅保留面板内高光，动效可关闭，并尊重减少动态效果的系统偏好。旧启动入口保留兼容。


## 动态协作画布

执行工作台 /workbench#control 使用 JavaScript 实时绘制三维玻璃结构，并支持卡片选择、缩放、重置、拖动、方向键平移、展开画布和 Escape 返回。光效开关同时控制连续绘制；支持系统减少动态效果偏好。详情见 SCENE-DESIGN.md。
# 上下文缓存

讨论上下文已改为固定协议与增量日志，避免变化字段破坏大段共享前缀。讨论页“调用”、工作台“调用凭据”和 CLI `/cache` 展示服务端真实缓存计量，并区分历史与升级后样本。99% 为监测目标，不能保证首次请求或持续变化的任务达到该值。实现、计量口径和验证边界见 [CACHE-DESIGN.md](CACHE-DESIGN.md)。

聊天执行还包括完整工具历史续接、INITIAL 前提传递、无损上下文去重、独立只读工具并发、消息重试去重和状态更新合并。模型能力参数由用户决定。实现与验证边界见 [CHAT-EFFICIENCY.md](CHAT-EFFICIENCY.md)；离线对照命令为 `node tools/chat-efficiency-benchmark.mjs`。

桌面布局升级提供固定三入口、可收起对象列表、窄窗口抽屉、统一顶部导航和更集中的聊天输入区。设计对比与验证见 [LAYOUT-UPGRADE.md](LAYOUT-UPGRADE.md)。

## 审议风格与交互升级

双方可在模型实验室分别调节 0–100 的叛逆值，并在暂停后明确应用到现有会话；CLI 支持 `/apply-profile 配置ID`。Codex 同时承担复杂代码、算法修改和独立复核。见 [PERSONALITY.md](PERSONALITY.md)。玻璃实体、鼠标联动、滑杆与模式选择的说明见 [INTERACTION-DESIGN.md](INTERACTION-DESIGN.md)；缓存的真实诊断与边界见 [CACHE-DESIGN.md](CACHE-DESIGN.md)。
