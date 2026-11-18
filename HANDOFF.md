# Claude 接手说明

先读 [README](README.md) 了解用户从哪里进入，再读 [测试说明](TESTING.md) 并运行基线。这个目录就是独立产品的维护范围，运行和测试均无需另一个工作台。

## 文件地图

| 位置 | 职责 |
|---|---|
| `index.html` | 首页、找工作、工作与面试及弹窗。按钮 ID、表单字段和脚本加载顺序连接各模块。 |
| `styles.css`、`collapsible.js` | 全站布局、控件样式和折叠交互。 |
| `script.js` | 主导航，岗位的读取、编辑、筛选、保存与页面刷新。 |
| `jobs-advanced.js` | 求职档案、岗位分析／初筛、截图与 AI 流程、面试准备、导入恢复及操作保护的主要衔接点。 |
| `job-directions.js` | 职业方向管理与岗位方向关联。 |
| `job-resumes.js` | 方向母版、岗位定制版本、岗位关联与投递材料。 |
| `job-project-facts.js` | 将求职档案中新旧项目字段整理成统一的读取视图。独立面试库中的视频项目案例由 interview.js 管理。 |
| `job-screenshot-import.js`、`job-duplicate-detection.js` | 截图识别文字的本地整理、岗位分组工具，以及岗位重复候选判断。 |
| `job-batch-store.js` | 截图数据库、批次与图片事务、识别缓存及底层数据替换。 |
| `job-ai-service.js` | 岗位事实与初筛辅助，以及本地 AI 代理客户端。 |
| `interview.js` | 独立经历库、工作流程、项目案例、STAR、面试问题、回答提示词及复盘。 |
| `job-interview-core.js` | 求职中心内的面试材料筛选、题目队列、模拟练习和复盘规则。 |
| `package.json`、`package-lock.json` | Node 版本、测试命令和依赖锁定。 |
| `tools/verify.cjs` | 唯一必跑用例清单和统一入口。 |
| `tests/isolated-browser.cjs` | 临时浏览器、网络拦截、存储访问检查、控制台与页面异常检查。 |
| `tests/storage-restore.cjs`、`tests/career-flows.cjs` | 存储隔离与导入回滚；岗位到投递的页面闭环。 |
| `tests/screenshot-ocr.cjs`、`tests/interview-flows.cjs` | 截图批次、模拟 OCR 和发送确认；经历、项目关联、模拟面试与真实性。 |
| `tests/real-ocr-init.cjs` | 本机测试服务器提供真实 OCR 资源，验证初始化故障和恢复。 |
| `README.md`、`HANDOFF.md`、`TESTING.md` | 使用入口、维护说明及测试方法。 |
| `LICENSE`、`THIRD_PARTY_NOTICES.md` | 项目 AGPL-3.0 许可证全文，以及第三方依赖和外部资源的授权说明。 |
| `node_modules/` | 本机安装的测试依赖，由 npm ci 根据锁文件生成。 |

## 从用户操作追到保存位置

- **岗位到投递**：建立岗位 → 建立简历版本 → 关联岗位 → 保存投递记录 → 修改岗位状态。岗位、简历版本和当时投递的正文各有用途；编辑当前简历时要保留已投递的历史内容。
- **截图到岗位**：选择截图 → OCR 或复用已有文字 → 本地整理／分组 → 用户核对。发送至外部 AI 前逐次确认预览；更换批次或修改分组依据后，旧预览失效。批次与图片组合提交，同一批次的写入串行执行。仅更新文字须保留原图；写入失败保留待保存内容供手动重试。
- **经历到面试**：保存经历 → 项目可通过可选的 `experienceId` 关联经历；STAR 保有自己的来源，面试问题分别用 `experienceIds`、`projectCaseIds` 引用材料。项目改绑不会改变问题的选择。保存成功后才提交新的项目关联；删除经历时同时解除项目引用。
- **导入与恢复**：验证用户选择的文件与版本 → 明确恢复范围 → 写入并核验保护副本、记录恢复状态 → 恢复岗位及工具库。部分失败要尝试回滚；中断或回滚失败保留保护资料并提示。旧版纯岗位数组仅恢复岗位；缺字段与明确空数组必须区分。

## 八个存储名称

实际为 **7 个 localStorage 键和 1 个 IndexedDB 数据库**。保护键可以按操作需要出现。新产品从自己的空存储启动，禁止回退到旧产品的键。

| 类型 | 完整名称 | 用途 |
|---|---|---|
| 正式 | `careerWorkbench.jobs.v1` | 岗位记录及其关联、投递数据 |
| 正式 | `careerWorkbench.jobsToolkit.v1` | 求职档案、方向、简历版本、工具库分析和面试历史等 |
| 正式 | `careerWorkbench.interview.v1` | 独立的经历、项目、STAR、问题、复盘和工作流程 |
| 操作恢复点 | `careerWorkbench.jobsAiRecovery.v1` | AI 操作涉及的数据 |
| 操作恢复点 | `careerWorkbench.jobsResumeRecovery.v1` | 简历相关操作涉及的数据 |
| 导入保护 | `careerWorkbench.jobsRestoreProtection.v1` | 正式恢复前保留的原数据 |
| 导入状态 | `careerWorkbench.jobsRestoreState.v1` | 识别恢复是否完成及是否需要处理回滚 |
| IndexedDB | `careerWorkbench.jobBatchAssets.v1` | 数据库版本 **2**。batches 以 id 标识批次；screenshots 以 id 标识图片、按 batchId 关联批次；recognitionCache 以 contentHash 查找识别文字。 |

对外导出范围以 README 中的「数据与备份」为准。底层截图库有读写／替换接口，当前用户可见的部分导出仍只覆盖岗位与工具库。恢复点用于操作失败后的保护，不承担整库导出职责。

## 维护时必须保持的边界

- 读不到、JSON 损坏与真正空库需要分别处理。读取异常后不能用空数据覆盖已有内容。写入失败要报告；保存成功但刷新或后续关联失败，要区分已经完成的部分。
- 保留稳定 ID、原有引用、确认状态和历史字段。验证仍使用现有存储允许名单。旧备份只能在用户选择文件并明确确认后导入，取消不得写入。
- 只有明确标记 `confirmedByUser === true` 且未标记合成或演示的经历，才能作为真实材料。`isSynthetic === true` 或 `isDemo === true` 优先排除；`sourceType: "jobInterviewSimulation"` 本身不表示虚构。关联项目、历史 STAR、旧回答或 AI 提取候选都不能替用户确认。
- AI 客户端以连接令牌请求本机代理的 GET /health 和 POST /run。测试一律模拟；不得把真实令牌或用户材料写入代码、文档或测试。
- 保留 file:// 页面、脚本加载顺序、数据库版本、组合事务和恢复保护。修改这些约定前先核对现有数据、旧导入格式及对应测试。

## 接手顺序与待办

1. 先运行 `npm run verify`，当前基线为 36 项通过、0 项失败。套件包括 33 项隔离回归和 3 项使用本机资源的真实 OCR 故障与恢复测试。在新电脑上单独记录 Node、浏览器和安装结果。
2. 从 tests/career-flows.cjs 跟一次真实按钮操作，然后对照 index.html、script.js 和 jobs-advanced.js 定位页面与存储。处理简历再读 job-resumes.js；处理截图先读 job-batch-store.js；处理面试先对照两条面试入口的真实性检查。
3. 用一个最小合成案例复现问题，再修改对应模块。先跑受影响的场景，最后完整运行 npm run verify。保留现有断言、旧数据兼容和刷新后的复查。
4. 默认 jsDelivr OCR 已完成一次真实识别验收。这项验收单独记录，不纳入自动测试计数。识别准确率、网络和设备覆盖仍需进一步验证，具体边界见 [测试说明](TESTING.md)。
5. 完整用户备份尚未实现，离线 OCR 资源及 AI 代理服务端尚未随项目提供。真实代理鉴权、真实模型效果和干净电脑安装仍待独立验收。第三方资源再分发的待核实事项见 [第三方授权说明](THIRD_PARTY_NOTICES.md)。
