# 免费公网部署与验收（2026-09-13）

## 当前状态

**固定 Pages 入口已上线，公网真实 AI 专项全部通过，并已完成 1 局随机骰子完整试玩。** 用户确认邮箱已验证、套餐为 Free；本次没有开通付费订阅、购买域名或服务器，没有申请账单读取权限。托管与 API 用量受免费额度和应用限额约束，不代表无限使用。

当前架构：Pages 静态资源与同源入口 → Service Binding → 原 Worker → SQLite Durable Object → 知乎官方 HTTP 接口。浏览器不访问当前网络不通的 workers.dev 域名，也不跨域携带凭证。原本机 `server.mjs` / 4173 服务不变。

最终发布版本：

- 稳定生产入口：`https://zhihu-four-seasons.pages.dev/`。
- Pages 生产部署：`90b294e8`；**不要分享带版本号的预览地址**。
- 后端活动版本：`dc0fdfd6-bf2f-4dee-890a-8bfd8d0edb78`。
- Worker 资源包：`674f4001cbf5049149164ce9ce39a11b6be543927b9d3bfe5ea9635923e5577f`，193 个文件。
- Pages 资源包：`3302210b74e91b5759cc6a668a6a6e784e7d9bc8ac26891dd1263f32ed5efc30`，含控制文件共 196 个文件。
- 当前版本按用户要求改为**必须先登录知乎才能开始或继续游戏**，沿用 App ID `448`、独立 Worker Secret、已确认的精确回调，`ZHIHU_OAUTH_REGISTERED` 为 `true`。用户在之前开启登录后亲自回复“已登录”；本轮不替用户授权。前后端均已发布：唯一主入口负责发起登录，匿名业务 API 也校验会话。六类称号、3D 画面、游戏内容及 AI 凭证不变，保留前版 15 个哈希分块，不消耗真实模型额度。细节见 [必须知乎登录](./必须知乎登录-2026-09-13.md)。前一可选登录版为 Pages `36c8be63` / Worker `4d4758ff-bd95-49b4-bc78-168b3ea58466`；首次真实 AI 验收版为 Pages `b141d21d` / Worker `1a7c5eb7-3c38-40d1-861d-b4edb6966001`。
- Cloudflare 授权已补全 Pages 写权限，凭据由系统凭证管理器保护；不需要再次登录或提供密码。
- `ZHIHU_ACCESS_SECRET`、随机 `VISITOR_SIGNING_KEY` 与新增 `ZHIHU_OAUTH_APP_KEY` 仅保存在原 Worker Secrets。新增 App Key 经标准输入提交，禁用该配置进程的磁盘日志；发布后仅按名称验证三项 Secret 均保留，不读取或输出值。Pages 无重复密钥，前端与发布包不含密钥。后续发布使用 `--keep-vars` 保留现有配置。
- 分享页旧“访问口令另行告知”已改成“扫码打开游戏，走进你的四季。”。
- 最终状态请求兼容补丁：只对身份 GET 加非隐私、每次不同的 `check` 参数，解决本机 Chrome 默认 HTTP/2 对重复相同状态 URL 的正文超时复现，不延长 8 秒超时、不减少登录验证、不改回调和授权参数。最终保留前版 18 个哈希分块；691 项单测（690 通过、1 原有跳过）与 12 项浏览器模拟验收通过。协议对照及原始失败不删除，见必须登录说明。

**网络边界：** Node 直接访问 Pages 成功；本机默认 Chrome 使用系统代理时曾超时，隔离测试 Chrome 仅增加 `--no-proxy-server` 后可完整游玩。没有修改系统代理、DNS、hosts，没有绕过证书验证。这不能证明所有国内网络都能访问；广泛分发前仍需真实手机流量与 Wi-Fi 各验证一次。

原 workers.dev 发布成功但网络访问未通过，因此改用 Pages；原失败记录保留，不计为完成局数。最初 Pages token 交换直接连接超时，使用已有本地代理仅对 Wrangler 进程生效后授权成功。没有新增代理服务或付费产品。

## 固定地址与 OAuth 边界

固定地址如下。日常更新沿用同一 Pages 项目与生产分支，不使用每次变化的预览 URL：

```text
https://zhihu-four-seasons.pages.dev/
https://zhihu-four-seasons.pages.dev/api/auth/zhihu/callback
```

后端 `PUBLIC_ORIGIN` 已设为 `https://zhihu-four-seasons.pages.dev`。Pages 首页与 API 原样通过 Service Binding 转发，保留原始 URL、Cookie 与响应安全头；不通过公网反向请求 workers.dev。非生产域名的首页/API 返回 421；预览静态素材可能仍公开，不应将此描述成全预览鉴权。

- 游戏入口：该 HTTPS 域名的 `/`。
- 用户已确认登记的回调：该 HTTPS 域名的 `/api/auth/zhihu/callback`。
- 部署时将 `PUBLIC_ORIGIN` 固定为实际 HTTPS origin，不带末尾斜线。
- 登记后不改 Pages 项目名；不将版本预览地址登记为回调。
- 按知乎 skill 的 OAuth 要求，登记值与实际回调必须完全一致。

**当前正式版强制知乎登录**：登录状态以服务器会话为准，不接受本地登录标记；随机浏览器绑定 state、原子消费、后端 token 交换、最小身份、持久化会话与退出均已实现。App ID / App Key 与固定回调已配置，用户已亲自确认“已登录”。主入口、恢复、退出、到期、失败重试均重新按必须登录要求测试。登录不等于云存档；新设备不会自动读取另一设备的旅程。用户确认的真实授权与自动化模拟结果分开记录。详见 [OAuth 接入说明](./知乎OAuth接入-2026-09-13.md)。

## 发布前检查

1. Wrangler 授权、用户邮箱验证与用户确认 Workers Free 已完成。后续不要求密码或验证码，不开通付费套餐。
2. 核对授权账号与 Workers Free 套餐；确认 `zhihu-four-seasons` 不会覆盖另一作品。未核对前不直接部署。
3. 运行生产构建及 `node --test tests/*.test.mjs`。
4. 若已有公开版本，构建后先运行 `node scripts/retain-published-chunks.mjs` 校验并保留上一版本 JS/CSS；此时不要先改 Pages 配置。运行 `node scripts/prepare-pages-release.mjs`，内部先构造并校验 Worker 审计包，再生成 Pages 控制文件与不可变版本。只上传它们输出的完成目录。
5. Wrangler `deploy --dry-run --assets <已校验目录> --minify` 检查打包。默认配置故意指向不存在的 `.cloud-release/unprepared`，避免误发整个项目或未筛选的 dist。
6. 部署 Worker、Static Assets 与 SQLite DO，后续发布带 `--keep-vars`。机密只用平台 Secrets：`ZHIHU_ACCESS_SECRET` 和随机生成的 `VISITOR_SIGNING_KEY`（至少 32 字符）。CLI `secret bulk` 支持标准输入，不应把真实值写入命令参数、代码、发布包或 Git。
7. `tests/fixtures/cloud-local.env` 仅用于离线本机测试；其中空 API secret 和公开测试签名 key **绝不能用于公网**。

静态包保留当前 8 段影片及封面、40 张回忆图、5 张独立结局画面、55 张参考图、3D 模型与许可证。旧片和说明文档只从发布包排除，原始 `public` 文件未删除。

将 `deploy/pages/wrangler.jsonc` 的 `pages_build_output_dir` 更新到新 Pages 审计包路径，再在项目根运行本地 Wrangler：

```text
node node_modules/wrangler/bin/wrangler.js pages deploy --project-name zhihu-four-seasons --branch main --commit-dirty=true --cwd deploy/pages
node node_modules/wrangler/bin/wrangler.js deploy --assets <Worker 审计包 assets 目录> --minify --keep-vars --strict
```

Pages 账号用进程级 `CLOUDFLARE_ACCOUNT_ID`，不在 Pages 配置中添加不支持的 `account_id`。Pages 首页来自 Worker Assets，静态分块来自 Pages，**两边必须发布相同前端版本**；此流程不是跨产品原子发布。当前两边已匹配。Pages `404.html` 防止私密路径被 SPA fallback 误返回首页；只有首页与 `/api/*` 走函数。

本次为减少更新窗口的缺图／缺脚本风险，在当前 dist 中保留了上一已发布审计包的 4 个内容哈希分块（先校验前包清单哈希、逐文件哈希和白名单，不覆盖同名不同内容），再重新生成审计包。**先发布含新旧分块的 Pages，再发布 Worker 首页**；旧页面仍能取旧分块，新首页上线时也已有新分块与新图片。更新完成后确认 5 张新图与旧主脚本均返回 200。后续构建会清除 dist，需按当时上一线上版本重新核对兼容分块，不能机械重复旧版本号。

## 云端安全与备用策略

- 官方知乎 HTTP 接口只在后端调用；不会回退到 OpenAI 或其他个人模型账号。
- 上游请求使用 `redirect:'manual'`，拒绝所有 3xx，不跟随跳转，不将 Bearer 凭证发给重定向目标。workerd 不支持旧 `redirect:'error'`，旧实现会在发送请求前失败；已通过真实本机 workerd 零外网测试复现并修复。
- 访客 cookie 签名、HttpOnly、Secure、SameSite=Lax；首次 HTML 建立身份，再发 API 请求。
- POST 必须精确同源；客户端伪造的内部身份头和 Authorization 不转发。
- 模型最多 80 次/UTC 日、单访客 20 次/日；搜索独立最多 80 次/日；同 IP 短期最多 8 次/分钟。这是应用保护上限，**不是知乎实际剩余额度**。
- 会话与限额经事务持久化；重复提交不重新计费；中断中的请求不盲目重发。陪练最多两轮，不改游戏资源。
- 最多 3 个在途/等待请求，排队最多 2 秒；过期或排队期间取消的请求不再调用上游。超载时使用明确的备用内容。
- 陪练文字在最后有效轮次后 10 分钟到期；DO alarm 删除过期记录，实际触发可能略有延迟。叙事成功缓存 24 小时，搜索成功缓存 15 分钟，失败缓存 60 秒。
- 日志/观测默认关闭，不记录玩家对话、原始 IP、Cookie 或 API key。
- 状态接口若报告失败，只保留调用类别、允许列表中的错误码及合法 HTTP 错误状态，不回显异常原文、密钥、对话或上游响应。

## 验收结果与边界

### 公网真实 API：全部通过

首次免费入口与 AI 修复发布后执行 `tests/cloud-public-live.mjs --pages --direct --live --review-text`（2026-09-13 09:03～09:04 北京时间），报告 `test-results/cloud-pages-public/live-direct.json`。使用独立浏览器、合成游戏经历，未伪造 API、未读取真实玩家存档，最多四次真实模型调用和一次搜索，无未知结果 POST 自动重试。之后的结局换图发布不改 AI 逻辑，本轮不重复消耗真实模型额度。

| 项目 | 最终结果 | 本次响应时间 |
|---|---|---|
| 事件点评 | `live`，96 字 | 3.672 秒 |
| 结局总结 | `live`，201 字 | 3.649 秒 |
| 第 1 轮陪练 | `live`，NPC 回应、未提前总结 | 2.007 秒 |
| 第 2 轮陪练 | `live`，NPC 回应与一条方法 | 3.340 秒 |
| 知乎搜索 | `live`，3 条带链接结果 | 1.018 秒 |
| 事件与总结重复提交 | `cache`，内容相同 | 0.279～0.303 秒 |
| 跨访客复用陪练 | 400 拒绝，不返回他人对话 | 通过 |
| 第 3 轮提交 | 400 拒绝 | 通过 |

模型为现有官方知乎 `zhida-fast-1p5`。搜索结果是摘要，不冒充完整原文。检查了生成内容与合成经历的对应性，两轮回答回应实际输入、不给资源改值，未把未发生的旅程补写为经历。

同时通过：首页 HTTPS/CSP/安全访客 Cookie、8 段影片与封面、40 张回忆图、私密路径 404、OAuth 显式未开放、回调不回显 code。影片 Range 请求均返回 200 整片，**未获得 206 分段下载**；最大约 2.3 MB，已验证遇到的影片可正常完整播放。

修复前的快速备用响应记录保存在 `test-results/cloud-pages-public/live-direct-before-redirect-fix.json`；不能与最终全部 live 结果混用。此前本机 workerd 控制组证明旧 redirect 参数在出站前抛错，本次成功是真实重新发布后的验证，不是用模拟响应替代。

### 画面、完整局与备用流程

- 公网双视口专项：1440×900、844×390；验证 3D 40 格、首事件、第 6 格完整影片、三选项、两轮陪练/搜索/总结备用、8 页回忆与 1000×2250 分享图。业务 API 在此专项明确模拟 503，**零真实模型调用**；陪练和结局用合法存档夹具，不称为两局完整试玩。报告 `test-results/cloud-pages-public/browser-direct.json`。
- 公网完整局：原生随机骰子未修改，真实新局走完 14 回合到第 40 格；自动操作含截图耗时 207.8 秒（约 3 分 28 秒），不是真人阅读时长。首次场景约 5.2 秒，情绪最低 30、最终 80，无提前结束；四季转换、实际遇到的第 11/15/27 格影片、8 页回忆与分享下载通过。该局未进入可选 AI，业务请求为 0。报告 `test-results/cloud-pages-public/full-game-direct.json`。没有宣称自然遇到全部 8 段影片。
- 之前本机实际 workerd 验证了缺凭证备用、跨域拒绝、两轮会话与重复提交等，报告 `test-results/cloud-local/runtime.json` 与 `browser.json`。公网浏览器模拟失败用于交互测试，本机真实后端缺凭证用于备用协议验证，二者与公网真实 AI 分开记录。
- 结局换图后的完整单测：585 项，584 通过、0 失败、1 项原有跳过。包含 10 项实际 workerd HTTP 兼容回归；模拟传输不访问外网，覆盖 301/302/303/307/308 不跟随和取消请求。
- 结局换图本机专项：58 个页面状态、8 次实际分享下载全部通过；新增医院配图去重与插画失败降级测试，未更改玩家存档。详见 `docs/结局独立画面与同风格渲染-2026-09-13.md`。
- 后续两层称号版：616 项单测，615 通过、0 失败、1 项原有跳过；原 20 局 230 次选择同历史重算得到 5 类日常称号，原状态不变。本机及稳定公网各通过 58 个页面状态、8 次分享下载，真实模型调用均为 0。混合、特殊纪念、医院和提前结束用合法存档案例定位验收，不计为新试玩局。详见 `docs/日常称号与经历纪念-2026-09-13.md`。
- OAuth 代码版：670 项单测，669 通过、0 失败、1 项原有跳过；14 项登录 UI 模拟浏览器检查通过。实际 workerd + Pages Service Binding + SQLite DO 验证使用合成上游，修复内部跟随 303 导致登录 Cookie 丢失的问题。发布后固定公网主页/新版脚本、未启用登录状态、预期未开放回调通过；1280×800、844×390 游客首事件均正常且三选项可见，0 页面/资源错误，没有新完整通关或真实 OAuth 授权的声明。报告 `test-results/zhihu-oauth-public/report.json`。

默认网络失败报告仍保留在 `test-results/cloud-public/`、`test-results/cloud-pages-public/browser.json` 与 `full-game.json`，不计完成局数。本次成功报告均明确标记：仅测试浏览器禁用代理，未更改系统设置，也未验证所有手机或国内运营商线路。

此前 OAuth 凭证配置复验：指定四个 OAuth 测试文件 50 项全部通过（上游模拟），Worker dry-run 和仅后端部署成功，未上传变化的静态资源。该阶段公网首页、原入口脚本、`/api/health` 均为 200；`/api/auth/status` 为 200 且明确 `enabled:false` / `oauth_registration_pending`，固定回调未变。没有发起真实知乎授权或业务 API 请求。

用户确认回调后的开启复验：仅将登记开关设为 `true` 后发布 Worker，dry-run 与部署均成功，没有更新任何静态文件。线上主页 200、健康状态 `ok:true`、匿名登录状态 `enabled:true` / `authenticated:false`，回调精确匹配；四个 OAuth 测试文件再次 50 项全部通过，上游仍使用模拟。尚不宣称用户真实授权完成。

剩余交付检查：请实际 Wi-Fi 与手机移动网络各打开稳定入口试玩；免费域名若在目标网络持续不可达，再按 DNS、TLS、域名与资源请求逐项排查，必要时与用户讨论域名/其他托管/服务器，**不得自动购买**。当前不再提供游客试玩；新玩家从主入口完成本人授权后开始。用户已经确认过真实登录，但本轮自动化不读取其会话，也不冒充新的真实账号完整游玩验收。

## 方案依据

- [Cloudflare Workers 免费额度](https://developers.cloudflare.com/workers/platform/pricing/)
- [Static Assets 文件数与单文件限制](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [workers.dev 地址](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Durable Objects 免费 SQLite 额度](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Pages Service Binding](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Pages 函数路由](https://developers.cloudflare.com/pages/functions/routing/)

托管免费不等于模型无限使用；模型和搜索仍消耗用户的知乎额度。也不能保证某个免费域名在所有国内网络上可达。
