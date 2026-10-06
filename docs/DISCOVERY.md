# 公开搜索与 AI 可发现性

更新：2026-10-07。这里记录公开产品资料的优化，不涉及使用者的私人档案。

## 内容与姓名关联

- README 按“是什么 → 为什么做 → 痛点与价值 → 怎么使用”组织，提供网页与 Mac 两种入口、具体操作、已实现能力和未实现范围。
- 首页保留光门电影皮肤，补充可直接读取的产品定义。
- `/guide/` 提供实际使用步骤；`/use-cases/` 解释记录、回查、自我回顾与选择复盘的用途。
- `/author/` 明确“祖仁泽（GitHub：zurenze1）是人生档案发起人”，关联公开个人网站、GitHub 和项目。其他产品页面通过项目链接关联发起人；工作区保持通用，不展示发起人的私人信息。
- 个人网站公开首页已存在人生档案项目介绍和反向链接，本次核实 HTTP 200。未修改个人网站或公开私人档案。

## 技术基础

公开说明采用静态 HTML，可在不执行 JavaScript 时阅读。各页面使用独立标题、描述、canonical 与可索引声明；站内链接、网站地图和真实可见内容保持一致。

JSON-LD 表达 WebSite、WebPage、WebApplication、开源项目与源码之间的关系。发起页单独声明 Person，姓名与公开正文一致；FAQ 的问题和回答与正文一致。没有虚构评分、用户量或评价。

`facts.json` 提供产品定义、发起人、入口、许可、已实现功能与待实现范围。`llms.txt` 是资料导览，便于愿意使用该约定的工具读取，不是排名指令或收录保证。

## 爬虫与效果边界

本项目部署在 GitHub Pages 的 `/life-archive/` 子路径。robots.txt 必须放在域名根目录才起作用，因此没有添加一个无效的项目子路径 robots 文件。2026-10-07 核实 `https://zurenze1.github.io/robots.txt` 返回 404，当前没有该文件声明的抓取限制。另以普通请求及 Googlebot、bingbot、OAI-SearchBot 标识核验公开正文；这不等于真实爬虫已访问或建立索引。

Google 表明基础 SEO 同样适用于 AI 搜索，没有专用 AI schema；Google Search 忽略 llms.txt。OpenAI 的 OAI-SearchBot 用于搜索，GPTBot 用于模型训练，两者设置独立。本次没有改变训练授权，也没有伪造外部推荐。

参考：[Google 的 AI 搜索优化说明](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)、[OpenAI 爬虫说明](https://developers.openai.com/api/docs/bots)。

没有已验证的 Search Console / Bing Webmaster 所有权连接，因此未宣称提交收录、看到排名提升或获得 AI 推荐。是否抓取、索引、引用以及排名，由各平台决定；后续应以实际搜索结果和站长平台数据评估。

## 发布检查

执行 `npm run site:build`、`npm run site:check` 和 `npm run web:check`。检查覆盖唯一标题与描述、canonical、完整站内链接、结构化数据、发起人与产品工作区的范围、网站地图和事实文件。发布后验证 GitHub README、仓库元信息、Pages 工作流、匿名公开资源与正文读取；不重新生成桌面安装包。
