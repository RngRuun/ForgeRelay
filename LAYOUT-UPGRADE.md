# ForgeRelay 布局升级 · 2026-10-25

保持现有 JavaScript、Vue 3 和 CSS 实现，沿用 Data terminal（seed 1819774974），设计预设为 DESIGN_VARIANCE=7、MOTION_INTENSITY=6、VISUAL_DENSITY=5。磨砂玻璃、按钮反光和局部光效按用户要求保留。

## 页面各自先回答一个问题

- 三方会谈：现在说了什么、我下一句要说什么。正文和输入框占主区，长审查细节默认折叠，数据分析留在独立分区和底部折叠区。
- 任务控制：正在执行什么、下一步能控制什么。保留实际协作画布，将右侧任务面板与画布对齐，执行记录、文件和用量分开。
- 模型实验室：我在调整哪个配置、哪个模型的哪一类设置。配置操作收进菜单，模型选择与编辑分区在宽屏共用一行，减少重复标题。

三项主要入口始终在左侧。对象列表是第二层：宽屏可收起，1100px 以下使用抽屉，不再将整个列表堆在正文上方。88px 主导航 + 224px 对象列表 + 28px 两侧内边距，在 1440px 窗口留下 1072px 工作区；列表收起后增加 224px。

## 交互

- 对象抽屉提供关闭按钮、Escape、Tab 焦点循环、关闭后返回展开按钮；打开时正文为 inert。
- 抽屉与遮罩放在相同堆叠上下文，修复遮罩反盖住列表的问题。真正的确认弹窗优先。
- 顶部导航支持左右方向键和 Home / End，窄屏仅导航内部横向滚动。
- 输入区合并为一个面板，保留附件、会谈设置、快捷键和自动保存提示；内容区根据窗口和控件高度计算可用阅读高度。
- 配置菜单包含复制、导出、导入、移入回收站；保存和启用仍使用原来的数据流程。
- 窄屏参数改为单列，新建会谈的底部按钮限制在正文区域，避免覆盖固定主导航。
- 原来的反光与平滑灯带悬停继续使用同一套实现；抽屉遮罩不参与光效计算，没有增加持续动画循环。

## 前后检查

| 页面 | 调整前 | 调整后 |
| --- | --- | --- |
| 会谈 | 0 FAIL / 3 WARN；768px 列表占顶部 165px，390px 占 232px | 0 FAIL / 2 WARN；列表默认收进抽屉，正文直接从顶部开始 |
| 实验室 | 0 FAIL / 3 WARN；768px 配置列表占顶部 214px | 0 FAIL / 0 WARN；配置列表改为抽屉，标题与编辑器上移 |
| 新会谈 | 原表单和数据区 | 0 FAIL / 2 WARN；表单在前、真实数据在后，底部操作不遮挡导航 |
| 任务控制 | 原任务与画布布局 | 0 FAIL / 3 WARN；宽屏同底对齐，窄窗口纵向排布 |

检查覆盖 1440×900、768×1024、390×844，浏览器控制台无错误。最终会谈手机报告单独记录最后一次标题修复。192 项既有回归测试通过。原生桌面还验证了固定三入口、配置列表展开/收起、窄窗口对象抽屉与 Escape 返回。

检查例外：用户指定的玻璃、渐变反光和悬停光效，使用 gradient、button-fx、heavy-shadow 三项白名单。其余警告保留：头像图标表示真实模型身份；部分半透明边框由检查器按不透明色读取；协作图中的少量辅助标注仍较小；空闲图不伪造带色活动；新会谈中的少量图形标签仍使用通用 sans-serif。警告不是功能通过的替代品。

## 视觉复盘

ROUND 1
Seen in one second: 顶部的列表与重复导航抢占正文。
Idea (one sentence): 把三方会谈、执行控制、模型调试放进同一套可收起的工作空间。
Live thing: 原始会话、实际模型接入和真实调用数据。
Layout words by section: shell=rail / conversation=feed-composer / models=form / workbench=canvas-control。
Scores: design 6.5 · usability 6.5 · creativity 7 · content 8 → overall 6.8。
Caps applied: 应用屏幕采用 app-screens 规则；不采用营销页照片数量约束。
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. before-chat/tablet-fold.jpg：对象列表推低对话，改为抽屉。
2. before-models/tablet-fold.jpg：导航与配置操作分成多排，合并模型编辑导航，将低频操作收进菜单。
3. before-chat/mobile-fold.jpg：正文、输入和控制争夺高度，重算阅读区并整合输入面板。

ROUND 2
Seen in one second: 页面标题、主操作和当前工作内容。
Idea (one sentence): 让内容拥有窗口，把导航限制在稳定边界内。
Live thing: 可恢复的真实配置、会话阅读与实时状态。
Layout words by section: shell=rail-drawer / conversation=feed-composer / models=form-toolbar / workbench=canvas-control。
Scores: design 7.5 · usability 8 · creativity 7 · content 8 → overall 7.6。
Caps applied: 沿用用户明确要求的玻璃与局部光效；手机侧栏固定是用户要求的布局取舍。
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. final-models/mobile-fold.jpg：两个参数并列时下拉文字拥挤，已改为单列并重新截图。
2. final-new/mobile-fold.jpg：旧底部操作条跨过侧栏，已限制到正文宽度并贴近窗口底部。
3. final-workbench/mobile-fold.jpg：协作图在极窄屏仍较长；保持图节点、连线和完整信息，使用纵向滚动。桌面原生窗口采用更宽的最小尺寸。

## 范围与证据

本轮不更改用户配置、模型参数、推理上下文、预算或调度策略，不产生模型推理调用。既有会话、任务和配置与本轮前备份逐一比较。前端不会伪造缓存、用量或调用状态。

截图与检查报告在工作目录的 `work/layout-before-*`、`work/layout-final-*`；原生截图、数据保全检查和发行包校验在 `outputs/ForgeRelay-App/verification/layout-*` 与 `release.json`。
