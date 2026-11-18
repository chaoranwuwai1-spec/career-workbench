# 第三方授权说明

本项目源码的 GNU AGPL-3.0 全文见 [LICENSE](LICENSE)。第三方组件保留各自的许可与版权声明。项目通过 CDN 加载浏览器 OCR 资源，通过 npm 安装开发依赖，通过 Playwright 或操作系统取得测试浏览器。项目源码目录未随附这些第三方二进制文件。

## npm 锁定依赖

核对了 [package.json](package.json) 和 [package-lock.json](package-lock.json) 的全部 19 个包条目，其中 5 个是直接开发依赖，14 个是间接开发依赖。每个包的 npm 下载地址和完整性摘要见锁文件的 `resolved` 与 `integrity`。表中的许可证来自相应版本的发布包声明和随包许可文件（如有），或对应的上游文档。

| 包 | 锁定版本 | 引入方 | 许可证或发布声明 | 来源与核对依据 |
| --- | --- | --- | --- | --- |
| `@tesseract.js-data/chi_sim` | `1.0.0` | 直接 | MIT（包元数据） | [Project Naptha](https://github.com/naptha/tessdata/tree/gh-pages)，发布包 `package.json`。模型本体见下文。 |
| `@tesseract.js-data/eng` | `1.0.0` | 直接 | MIT（包元数据） | [Project Naptha](https://github.com/naptha/tessdata/tree/gh-pages)，发布包 `package.json`。模型本体见下文。 |
| `playwright` | `1.56.1` | 直接 | Apache-2.0 | [Microsoft Playwright v1.56.1](https://github.com/microsoft/playwright/blob/v1.56.1/LICENSE)，发布包 `LICENSE`、`NOTICE`、`ThirdPartyNotices.txt` |
| `tesseract.js` | `5.1.1` | 直接 | Apache-2.0 | [Project Naptha v5.1.1](https://github.com/naptha/tesseract.js/blob/v5.1.1/LICENSE.md)，发布包 `LICENSE.md` |
| `tesseract.js-core` | `5.1.1` | 直接，亦由 `tesseract.js` 引用 | Apache-2.0 | [Project Naptha Core v5.1.1](https://github.com/naptha/tesseract.js-core/blob/v5.1.1/LICENSE)，发布包 `LICENSE` |
| `bmp-js` | `0.1.0` | `tesseract.js` | MIT | [shaozilee/bmp-js](https://github.com/shaozilee/bmp-js)，发布包 `LICENSE` |
| `fsevents` | `2.3.2` | `playwright`，仅 macOS 的可选依赖 | MIT | [fsevents v2.3.2](https://github.com/fsevents/fsevents/blob/v2.3.2/LICENSE)，当前 Windows 环境未安装 |
| `idb-keyval` | `6.3.0` | `tesseract.js` | Apache-2.0 | [Jake Archibald，v6.3.0](https://github.com/jakearchibald/idb-keyval/blob/v6.3.0/LICENCE)，发布包 `LICENCE` |
| `is-electron` | `2.2.2` | `tesseract.js` | MIT | [cheton/is-electron](https://github.com/cheton/is-electron)，发布包 `LICENSE` |
| `is-url` | `1.2.4` | `tesseract.js` | MIT | [segmentio/is-url](https://github.com/segmentio/is-url)，发布包 `LICENSE-MIT` |
| `node-fetch` | `2.7.0` | `tesseract.js` | MIT | [node-fetch](https://github.com/node-fetch/node-fetch)，发布包 `LICENSE.md` |
| `opencollective-postinstall` | `2.0.3` | `tesseract.js` | MIT | [Open Collective](https://github.com/opencollective/opencollective-postinstall)，发布包 `LICENSE` |
| `playwright-core` | `1.56.1` | `playwright` | Apache-2.0 | [Microsoft Playwright v1.56.1](https://github.com/microsoft/playwright/blob/v1.56.1/LICENSE)，发布包 `LICENSE`、`NOTICE`、`ThirdPartyNotices.txt` |
| `regenerator-runtime` | `0.13.11` | `tesseract.js` | MIT | [Meta Regenerator](https://github.com/facebook/regenerator/tree/main/packages/runtime)，发布包 `LICENSE` |
| `tr46` | `0.0.3` | `whatwg-url` | MIT（代码） | 发布包 `package.json` 与 [jsdom/tr46 上游许可证](https://github.com/jsdom/tr46/blob/main/LICENSE.md)。内含映射数据的授权见待核实事项。 |
| `wasm-feature-detect` | `1.10.1` | `tesseract.js` | Apache-2.0 | [GoogleChromeLabs](https://github.com/GoogleChromeLabs/wasm-feature-detect)，发布包 `LICENSE` |
| `webidl-conversions` | `3.0.1` | `whatwg-url` | BSD-2-Clause | [jsdom/webidl-conversions](https://github.com/jsdom/webidl-conversions)，发布包 `LICENSE.md` |
| `whatwg-url` | `5.0.0` | `node-fetch` | MIT | [jsdom/whatwg-url](https://github.com/jsdom/whatwg-url)，发布包 `LICENSE.txt` |
| `zlibjs` | `0.3.1` | `tesseract.js` | MIT | [imaya/zlib.js](https://github.com/imaya/zlib.js)，发布包 `LICENSE` |

`node-fetch` 还声明了可选对等依赖 `encoding`。当前锁文件未解析该包，项目不安装它。Playwright 的两个发布包均自带 `NOTICE` 和 `ThirdPartyNotices.txt`，记录 Puppeteer 衍生代码及其余内嵌组件的来源和许可。

## 浏览器 OCR 与语言模型

| 资源 | 当前默认加载方式 | 许可证或发布声明 |
| --- | --- | --- |
| Tesseract.js 浏览器脚本与 Worker | jsDelivr 镜像 npm 的 `tesseract.js@5.1.1/dist/tesseract.min.js` 及 `tesseract.js@v5.1.1/dist/worker.min.js`。见 [页面入口](index.html)和 [v5.1.1 Worker 默认配置](https://github.com/naptha/tesseract.js/blob/v5.1.1/src/worker/browser/defaultOptions.js)。 | [Apache-2.0](https://github.com/naptha/tesseract.js/blob/v5.1.1/LICENSE.md)。浏览器构建的随包许可声明见下文。 |
| OCR 核心 | jsDelivr 镜像 `tesseract.js-core@v5.1.1`。LSTM 模式根据 WebAssembly SIMD 支持加载 `tesseract-core-simd-lstm.wasm.js` 或 `tesseract-core-lstm.wasm.js`。见 [v5.1.1 核心加载代码](https://github.com/naptha/tesseract.js/blob/v5.1.1/src/worker-script/browser/getCore.js)。 | 核心包为 [Apache-2.0](https://github.com/naptha/tesseract.js-core/blob/v5.1.1/LICENSE)。WASM 内部组件单独适用其许可，完整分发清单见待核实事项。 |
| 简体中文 `chi_sim` | jsDelivr 路径 `@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz`。核对的 npm 发布包为 [`@tesseract.js-data/chi_sim@1.0.0`](https://www.jsdelivr.com/package/npm/%40tesseract.js-data/chi_sim)。 | npm 元数据声明 MIT。上游模型及具体文件的许可状态见下文。 |
| 英文 `eng` | jsDelivr 路径 `@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz`。核对的 npm 发布包为 [`@tesseract.js-data/eng@1.0.0`](https://www.jsdelivr.com/package/npm/%40tesseract.js-data/eng)。 | npm 元数据声明 MIT。上游模型及具体文件的许可状态见下文。 |

页面选择 LSTM 模式，未覆盖核心、Worker 或语言路径。[v5.1.1 的模型加载代码](https://github.com/naptha/tesseract.js/blob/v5.1.1/src/worker-script/index.js)生成的语言包 CDN URL 未固定 npm 包版本。`4.0.0_best_int` 是包内模型变体目录。本机自动测试使用锁定到 `1.0.0` 的两份 npm 包，并由本机测试服务器提供相同模型变体。

[Naptha 的模型说明](https://github.com/naptha/tessdata/blob/gh-pages/README.md#language-data) 将 `4.0.0_best_int` 描述为 Tessdata Best 的整数量化版。两份 npm 包还携带当前 LSTM 路径不使用的 `4.0.0` 变体，其上游是 Tesseract 的 `tessdata`。上游 [tessdata_best](https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE)、[tessdata](https://github.com/tesseract-ocr/tessdata/blob/main/LICENSE) 及 [Naptha 模型仓库](https://github.com/naptha/tessdata/blob/gh-pages/LICENSE) 的仓库许可证均为 Apache-2.0。两份 npm 包各自的 MIT 声明与这些上游许可证需分别保留在记录中。

Tesseract.js 5.1.1 发布包的 `dist/tesseract.min.js.LICENSE.txt` 和 `dist/worker.min.js.LICENSE.txt` 记录浏览器构建内置的许可声明，包括 `regenerator-runtime`（MIT）、浏览器 `buffer` 实现（MIT）、`ieee754`（BSD-3-Clause）及 `zlib.js`（MIT）。这些文件是核对浏览器构建附带声明的依据，npm 锁文件仅描述本机安装的依赖树。

## 其他外部资源

| 资源 | 版本、来源与授权边界 |
| --- | --- |
| jsDelivr | 页面加载 OCR 文件使用的 CDN，见 [jsDelivr 服务条款](https://www.jsdelivr.com/terms)。文件自身仍适用各组件的许可。 |
| Node.js 与 npm | Node.js 要求 `>=22`，npm 无项目固定版本。两者由开发者单独安装。Node.js 自身为 MIT，随其发行的其他组件见 [Node.js 许可文件](https://github.com/nodejs/node/blob/v24.22.1/LICENSE)。npm CLI 本身为 Artistic-2.0，随附组件各自授权，见 [npm CLI 许可文件](https://github.com/npm/cli/blob/v11.21.2/LICENSE)。 |
| Playwright 下载的浏览器与工具 | `npx playwright install chromium` 从 Playwright 的 CDN 或微软镜像取得 Chromium 和 Chromium Headless Shell `141.0.7390.37`（修订 `1194`），并按平台取得 FFmpeg（修订 `1011`，部分 macOS 使用 `1010`）及 Windows `winldd`（修订 `1007`）。见 [Playwright v1.56.1 构建清单](https://github.com/microsoft/playwright/blob/v1.56.1/packages/playwright-core/browsers.json)和[下载配置](https://github.com/microsoft/playwright/blob/v1.56.1/packages/playwright-core/src/server/registry/index.ts)。Chromium 主体采用 [BSD-3-Clause](https://github.com/chromium/chromium/blob/141.0.7390.37/LICENSE)。发行二进制所含的第三方组件与工具授权见待核实事项。 |
| Microsoft Edge | 可选测试浏览器，使用用户设备上已安装的版本。适用该安装版本所附的微软软件条款。项目不固定版本，也不分发 Edge。 |
| 系统字体 | 样式和测试画布使用操作系统或浏览器可用的字体（例如 Arial、微软雅黑、苹方）。项目未固定字体版本、联网下载字体或随附字体文件。 |
| 用户自行配置的 AI 代理与模型 | 客户端调用本机 `127.0.0.1:4318`。本项目未提供或指定代理实现、模型、服务商或版本，测试使用模拟响应。**待核实**，以使用者实际选定的实现、模型和服务条款为准。 |

## 待核实的再分发事项

- **中英文模型文件**：已确认 npm 包的 MIT 声明与上游模型仓库的 Apache-2.0。两份 `1.0.0` 发布包均没有独立的 `LICENSE` 文件，仍需核对确切模型文件的原始修订、量化来源和适用声明，再决定离线副本如何保留完整许可文本和署名。
- **OCR 核心 WASM**：核心包的 Apache-2.0 已确认。[v5.1.1 构建脚本](https://github.com/naptha/tesseract.js-core/blob/v5.1.1/build.sh)和[子模块声明](https://github.com/naptha/tesseract.js-core/blob/v5.1.1/.gitmodules)列有 Tesseract 分支、Leptonica、libjpeg、giflib、libpng、libtiff、libwebp、zlib、OpenLibm，并使用 [Emscripten 3.1.38](https://github.com/naptha/tesseract.js-core/blob/v5.1.1/build-with-docker.sh) 构建。发布的各个 WASM 变体实际链接的版本、许可证和需保留的声明尚未逐项核实。
- **浏览器预编译文件**：Tesseract.js 主脚本和 Worker 已有随包声明。若镜像发布的构建，还需按该构建核对内嵌组件的确切版本及对应声明。`tr46@0.0.3` 的代码声明为 MIT，旧发行包内 Unicode 映射表的来源修订及单独适用的声明待核实。
- **Playwright 下载的构建**：Chromium 主体许可证已确认，具体 Chromium / Headless Shell 构建的完整第三方声明、FFmpeg 修订 `1011` / `1010` 的配置与对应许可、Windows `winldd` 修订 `1007` 的独立分发声明均待核实。[FFmpeg 上游](https://ffmpeg.org/legal.html)说明其有效许可随构建选项变化。

如果后续将依赖、模型、WASM 或测试浏览器打包到发行物中，应按实际发布的文件保留适用的原始许可证、版权声明及 `NOTICE`，并核对上述待办。本说明是当前来源与许可证记录，不替代随附的原始声明，也不代表已取得额外的再分发许可。
