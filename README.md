# 人生档案 · 祖仁泽发起的个人生活记录工具

在自己的电脑上，留住生活线索，找回过去，逐渐看懂自己。

**发起人：祖仁泽。** [公开工具介绍](https://zurenze1.github.io/life-archive/) · [祖仁泽作者页](https://zurenze1.github.io/life-archive/author/) · [祖仁泽个人网站](https://zurenze1.github.io/zurenze-personal-site/)

人生档案提供免费通用网页版和 Mac 自动采集端。通用版让手机与电脑用户都能开始记录；Mac 端将能够正常读取、并经使用者授权的电脑活动和已有材料整理到本机档案中。每个人使用自己的设备和数据。

## 每个人都能用的免费通用版

[打开人生档案通用版](https://zurenze1.github.io/life-archive/app/)：iPhone、iPad、安卓、Mac（含 Intel）、Windows 和 Linux 可通过现代浏览器使用，无需注册。无需下载 Mac 安装包，也可以记录文字、导入照片/视频/录音原件，提取 DOCX / XLSX / PDF 可读文字，搜索时间线、录音、完整备份与迁移。

档案保存在当前设备浏览器，不自动上传。浏览器需要支持 JavaScript 与 IndexedDB；录音、拍照、媒体播放、安装和存储能力会因浏览器而异。首次联网完成离线准备后，可使用核心功能。支持的浏览器可以添加到桌面；iPhone / iPad 在 Safari 的分享菜单选择“添加到主屏幕”。

请定期导出包含文字和原件的完整备份。换设备可以传输备份后导入，当前没有自动云同步；不同浏览器及桌面模式可能各自存储。清除网站数据或系统回收存储可能丢失档案。共用浏览器没有独立的登录锁，使用者应自行管理设备访问。

通用网页不自动读取其他 App 的聊天或订单。Mac 自动采集端另行提供；其他平台原生采集、应用商店安装包和实时同步尚未上线。详见[通用版说明](https://zurenze1.github.io/life-archive/releases/universal/)。

## 下载安装

1. 打开 [安装包下载页](https://github.com/zurenze1/life-archive/releases/tag/v1.0.0)，下载 `LifeArchive-1.0.0-arm64.dmg`。
2. 打开 DMG，将「人生档案」拖入「应用程序」。
3. 打开应用，在「采集来源」查看实际读取状态，在「设置与数据」调整采集目录。

**首版安装包需要 macOS 13+，适用于 Apple 芯片 Mac（M1 / M2 / M3 / M4 等 arm64 设备）。** Intel Mac、Windows、安卓和 iPhone 独立安装包尚未发布。

1.0 是首次公开测试版本，尚未经过 Apple Developer ID 签名和公证。下载后可能被系统拦截；请按 [Apple 官方说明](https://support.apple.com/en-us/102445) 判断是否信任并打开。

## 可以做什么

- **自动留下线索**：记录前台应用使用，整理已支持的浏览记录、文档与媒体原件索引。
- **找回过去**：按关键词、类型和日期搜索时间线，打开原始来源。
- **少打字**：导入已有材料，或主动录一段声音。
- **自己掌握档案**：暂停来源、调整文件夹、导出 JSON，数据保存在本机。

应用运行期间每 15 秒采样一次前台应用，每 30 分钟重新整理。关闭窗口后留在菜单栏；选择菜单栏「退出并停止采集」结束运行。锁屏、空闲超过 2 分钟或睡眠时停止前台应用采样。

首次运行检查桌面、文稿、下载、图片、影片和音乐文件夹，以及已适配的应用来源。遇到系统权限提示，由使用者决定是否授权。录音在主动点击后单独申请麦克风权限。

## 数据与使用边界

- 软件源码和安装包可以分享；个人档案存放在使用者自己的电脑。
- 使用者决定允许读取哪些来源。系统权限、未连接的设备和应用保护可能限制读取范围。
- 自动采集的是线索。浏览过网页、安排过日程或产生过订单，不代表完成了某个行为；请在回顾时补充或确认。
- 不承诺读取所有 App 的完整内容，也不绕过应用加密或系统保护。
- 数据库位于 `~/Library/Application Support/人生档案/data/archive.sqlite`，录音原件位于同目录的 `recordings/`。也可在应用中点击「查看本地数据」。
- JSON 导出包含文字线索与清理后的链接，不包含媒体原件、源文件路径和联系人字段。媒体原件仍在原处；备份完整本机档案时，请在退出应用后保留整个 `data/` 目录。

支持的来源与限制见 [功能范围](docs/CAPABILITIES.md)。网页版地址由使用者自行设置；每台电脑的本机档案独立保存。

## 源码运行

需要 Node.js 24+、npm 和 Mac。

```sh
git clone https://github.com/zurenze1/life-archive.git
cd life-archive
npm ci
npm test
npm start
```

如果安装环境跳过了 Electron 下载脚本，运行 `node node_modules/electron/install.js` 后再启动。执行 `npm run package` 构建 arm64 的 DMG 与 ZIP。

测试使用临时数据库和合成材料，不修改真实浏览器资料库。验证结果见 [测试记录](docs/TESTING.md)。

## 项目状态

这是本机采集端 1.0。自动采集的线索用于回顾与整理，人物性格结论、影音识别和所有 App 内容的全量读取仍需进一步接入。

## 公开介绍网站

`site/` 只发布产品说明、作者资料和下载入口，不包含使用者的个人档案。运行 `npm run site:build` 生成静态 HTML，`npm run site:check` 检查页面、站内链接、结构化数据和网站地图；合并到 main 后由 GitHub Pages 工作流发布。

`sitemap.xml` 列出公开页面，`llms.txt` 和 `facts.json` 提供公开内容导览。它们不保证搜索引擎或 AI 收录与排名。GitHub 项目站位于子路径，爬虫的 robots.txt 规则由主机根目录决定，不能用项目目录中的同名文件替代。

`web/` 是通用版源代码。`npm run site:build` 会将它复制到 `site/app/` 并为离线缓存生成版本。`node scripts/preview-site.cjs` 在 `http://127.0.0.1:5197/life-archive/app/` 提供本地预览。`web/vendor/` 包含 fflate / PDF.js 的浏览器发行文件和许可证，从锁定的 npm 依赖复制，不使用外部 CDN。手机原生系统、麦克风实机和不同浏览器仍需分别验证，不能以手机尺寸预览冒充实机测试。
