# 测试入口与验证范围

## 最新：2026-09-11 美术精修与来源补强

- 全量314项，313通过、1项原有条件跳过、0失败；生产构建通过，保留大包提示。
- 新材质物理比例UV、mipmap、合批位置/UV/三角形和资源释放回归通过。40建筑×4季节足迹约束通过。
- `reference-integration-browser.mjs`：全部40处事件空间与40处建筑外观、旋转/地图定位/返回/存档/三选一/结算/横屏/竖屏暂停通过，0页面错误。
- 8段新视频已重新渲染，逐帧解码和 `cinematics-browser.mjs` 播放/暂停/跳过/取消/失败备用通过。
- `source-evidence-browser.mjs`：最终生产包33条当前独立来源、无缺作者、链接对应映射、核对原句展开、横屏无溢出，0页面错误。片段证据不等于全文已核验。
- 最终截图和说明见 `docs/美术与来源改进-2026-09-11.md`；浏览器业务请求隔离，来源搜索为真实调用；没有公网发布。下方记录保留历史含义。

## 最新：2026-09-11 完整环境与总览优化

- `npm test`：228项，227通过、1项默认跳过；生产构建通过，仍保留大包提示。
- `world-terrain.test.mjs`：玩法地面高度不变，四季权重归一，连续LOD无内部开放边，外围摆放采样与真实三角面一致。
- `world-woodlands.test.mjs`、`town-outskirts.test.mjs`：外围树林覆盖四象限，20片生活组景不侵入道路／河道／原建筑，实例全部有真实体积且位于预留占地。
- `overview-batch.test.mjs`：世界矩阵、法线/UV/颜色、多材质、负缩放、重复开关与游戏对象隔离，原几何不改变。
- `node tests/world-terrain-browser.mjs`：真实WebGL桌面/手机，默认/最远缩放/正反低角度/高俯视，共10种视角；无外围地板边、天空错位、黑边或WebGL错误，游戏状态不变。
- `node tests/journey-3d-browser.mjs`：扩展环境下地标完整取景、角色/骰子/滚轮/暂停/重开回归通过。
- `node tests/town-3d-browser.mjs`：正式入口1440×900、844×390及四地标，真实WebGL、预览与返回、昵称/天赋草稿、存档、三选盲选、结算与无WebGL备用通过，0页面错误。
- `node tests/season-journey-browser.mjs`：本轮生产构建的7组四季转场／音乐／三选／存档／结算来源联动通过，8次真实WebGL检查、0页面错误、0外部请求。默认测试服务器改为生产模式，防止开发热更新打断长流程；运行前需构建。使用减少动态效果，不代表真人完整游戏时长。
- 合批对照：同镜头桌面1619→833、手机1620→834次绘制；48次即时视角切换未出现代理／原建筑重复绘制，近景正确恢复。提交三角形约增加11.7%，不将绘制次数减少等同于帧率提升。

截图 `test-results/world-expanded-*.png` 和 `town-live-overview-*.png`。这些为本地隔离服务，不是公网试玩；所有业务API拦截，未调用真实模型。下列历史结果不覆盖本节；最终局部性能对照记录在 `test-results/world-environment-render.json`，绘制批次不等于帧率。

## 前一轮：2026-09-10 真3D田园与地标接入

- `npm test`：215项，214通过、1项默认跳过；生产构建通过，仍提示主包超过500kB。该提示未被隐藏，低端实体设备长期帧率未验收。
- `node tests/journey-3d-browser.mjs`：真实WebGL2、40站、立体刘看山待机、弹窗/竖屏/减少动态效果、行动取消、骰子生命周期、拖拽/滚轮和资源清理。全图及4地标在1440×900、844×390均通过真实包围盒投影不裁切断言。
- `node tests/town-3d-browser.mjs`：正式main入口；四张真透明设计卡到对应3D镜头、8个地标/尺寸组合、昵称和天赋草稿保留、存档不变、观光暂停自动出发、恢复游玩后三选无预告、正常结算，以及明确的无WebGL备用。0页面错误，0真实模型调用。
- `node tests/season-journey-browser.mjs`：正式3D入口下7组季节/音乐/存档/来源联动，8次真实WebGL检查，全部通过。
- `node tests/share-production-browser.mjs`：本地生产构建经口令网关加载真正WebGL，地标和三选正常；继续保留匿名/已登录资源鉴权、HEAD、空分块请求及PNG原字节断言。不是公网测试或新部署。
- `node tests/sample-browser.mjs`：重新用3D生产页面验证两轮模拟陪练、跳过、离线、方法卡/原存档不变、844及667横屏；全部通过，0真实模型调用。
- `node tests/boot-browser.mjs`：3D生产包下8组首次加载/慢载/异常/重试/CSP/存档保护回归全部通过。
- `tools/prepare-landmark-cutouts.py`：用户授权的本地去底；原稿SHA不变，RGBA/四格占比/空边框/体育馆白屋顶保留检查通过，奶油色与深底预览已目检。

所有服务均为测试新建的私有loopback进程，测试结束关闭；未停止用户4173游戏服务。业务API拦截或服务端CLI禁用。视觉截图和报告为 `test-results/town-*`、`journey-3d-*`、`landmark-cutout-*` 等。场景使用真实程序化模型；去底图册只是设计参考，不冒充模型。

历史 `pixel-world-browser.mjs`、`pastoral-browser.mjs`、`landmark-reference-browser.mjs` 中的Canvas2D断言仅代表旧版，不是当前3D入口验收。以下保留历史结果，不能用旧“默认2D”描述覆盖本节。

## 前一轮：2026-09-10 评委样板关与加载恢复

- `npm test`：203项，202通过、1项默认跳过；构建通过。新增 `sample-scenario.test.mjs`、`method-cards.test.mjs`、`practice-grounding.test.mjs`、`seasonal-art-loading.test.mjs` 及外部启动脚本网关白名单断言。
- `node tests/sample-browser.mjs`：真实生产页面三选一、可选两轮、先经验后方法卡、明确收下及刷新重看、原存档字节不变、两个窄横屏、跳过、离线和取消；接口全模拟。
- `node tests/practice-browser.mjs`：正式两场景回归；首轮请求中关闭后重开修改台词，使用真实服务端会话规则和模拟执行器验证恢复，不把400误报成模型断网。
- `node tests/boot-browser.mjs`：8组正常/慢加载/脚本404/运行失败/手动重试/守护脚本缺失/严格CSP；不损坏存档，0业务请求。
- `node tests/seasonal-art-loading-browser.mjs`：真实画布在约3秒切备用，延迟PNG到达后43棵树被补载，路线不变；图片错误及超时前后销毁无回填。10项单元测试覆盖最终30秒清理；不延长首次可玩等待。
- `node tests/share-production-browser.mjs`：独立本地生产服务+口令网关原生图片下载与真实像素场景，0真实模型请求。
- `sample-live-check.mjs` 默认拒绝执行，显式 `RUN_LIVE_SAMPLE=1` 后启动自有临时本机生产进程，至多两次虚构台词请求、非live即停、不重试；其他业务接口禁用。08:05北京时间真实两轮均live，约2.56秒和2.76秒，报告 `sample-live-check-guarded.json`。早一组样板调用发现虚构记录细节，已单独保留历史报告；不能称为所有模型输出都已无幻觉。
- `share-public-browser.mjs` 仅显式 `RUN_PUBLIC_SHARE_CHECK=1` 测已有隧道。全程隔离业务调用，只有健康检查和确定无效输入抵达后端；测试口令、原生素材、独立样板、来源、收集、CSP和退出。最新 `share-public-browser.json` 是公网状态依据，不把只通过本机测试称为外网可用。

本轮未补齐第18格经验和第31格作者，也没有执行真人时长测试。以下保留前轮结果。

## 前一轮：2026-09-10 两轮沟通陪练与八格来源梳理

- `npm test`：177项，176通过、1项默认跳过；构建通过。
- `tests/practice.test.mjs`、`practice-ui.test.mjs`、`practice-http.test.mjs`：规范重放、两轮会话、同句第二轮、幂等、自动过期、退出保护、共享模型门控、输入与响应校验、HTTP/口令网关。
- `node tests/practice-browser.mjs`：独立生产服务、真实PixelWorld，业务API模拟；两场景、可跳过、不改资源/存档、不保存练习文字、安全显示、断网预设、取消后不回填其他窗口、重开完成记录、667/844横屏与竖屏恢复通过。
- `tests/event-grounding.test.mjs`、`zhihu-context.test.mjs`：八格映射、逐项适用条件、默认折叠、缺少作者与只有提问的明确标记；测试通过不代表缺失来源已补核。
- 本轮重新运行 `node tests/season-journey-browser.mjs`、`node tests/share-production-browser.mjs` 均通过，业务API全部模拟；覆盖四季声音/画面/章卡及实际来源去重，不代表公网已发布。
- `practice-live-check.mjs` 不属于自动测试，默认拒绝执行，显式 `RUN_LIVE_PRACTICE=1` 后最多两次请求、失败即停。本轮只运行一次，2026-09-10约00:18北京时间两轮均live，使用完全虚构台词；去除会话标识的结果在 `test-results/practice-live-check.json`。不把浏览器截图里的模拟文案称为实际模型输出。

当前源码增加14条来源记录，其中第18格经验未补核，第31格作者待核对，完整限制见 `references/practice-source-audit-2026-09-10.md`。以下为历史版本结果，不能覆盖本节。

## 最新：2026-09-09 六张参考图与角色精修

- `npm test`：138项，137通过、1项默认跳过；构建通过。
- `node tests/mascot-reference-browser.mjs`：四个朝向、八种动作、地图内角色与减少动态效果通过。
- `node tests/pixel-world-browser.mjs`、`node tests/pastoral-browser.mjs`：角色变更后真实地图、桌面与手机横屏、三选盲选和图片失败备用通过，业务接口模拟。
- `node --test tests/landmark-art.test.mjs`：15项通过，使用合成透明图集和模拟Canvas，覆盖校验、道路与水域避让、加载失败与无变异备用。
- `node tests/landmark-reference-browser.mjs`：新增的实际图集验收入口，必须先交付 `public/art/life-landmarks-v1.png` 并启用 `LANDMARK_ART_READY`。目前生成图仍无真实alpha，开关关闭，此项尚未运行通过，不能称新建筑已完成。

## 最新：2026-09-09 知乎经验册与四季声景版 v4

- `npm test`：118项，117通过、1项默认跳过（真实Chrome网关项）；构建通过。
- `node tests/season-journey-browser.mjs`：真实main、PixelWorld及AudioContext联动。首章、三个完整路线跨季边界、一骰跨两季、章卡后才出现三个盲选、天气／阶段／音乐同步、静音跨季和刷新、弹窗／竖屏暂停恢复、结束停播，以及实际历史来源去重；0外部请求，业务接口全模拟。使用减少动态效果快速路径，不代表正常速度的真人时长测量。
- `node tests/season-chapters-browser.mjs`：独立四季画布与章卡、跳过／取消、暂停／后台门控、减少动态效果，截图已目视检查。
- `node tests/season-music-browser.mjs`：真实Web Audio生命周期、四首完整曲谱离线渲染、无NaN或削波。输出48秒试听预览，不将程序波形验收视为真人音质评价。
- `node tests/experience-browser.mjs`、`node tests/ai-browser.mjs`、`node tests/save-browser.mjs`：当前新文案／来源入口的7组流程、6组AI模拟及4组存档回归通过。
- `node tests/pastoral-browser.mjs`、`node tests/meeting-browser.mjs`：当前画布、40站三选、生成树、待机、反馈、667／844横屏及通关总结通过。
- `node tests/share-production-browser.mjs`：当前生产打包、口令网关、原生静态资源和三选界面通过，0资源／页面错误；不代表公网部署。

以上均隔离业务接口。首章解锁音频竞态已通过调整“先解除欢迎页暂停、再于同一用户手势解锁音频”修复，实际联动测试要求首章开始即有playing状态，不用手工多点一次来掩盖该问题。

## 前一轮：2026-09-09 田园三选版 v4

- `npm test`：99 项，98 通过、1 跳过；跳过的真实 Chrome 网关项已通过 `RUN_SHARE_BROWSER=1` 单独启用验收。
- `npm run build`：通过，默认前端是 Canvas 2D，不再加载 Three.js 场景。
- `node tests/pastoral-browser.mjs`：真实像素画布、透明树木素材、三个无数值后果选项、选择后资源反馈、桌面与小横屏、待机动作、暂停、减少动态效果、素材缺失备用。
- `node tests/pixel-world-browser.mjs`：真实像素地图、40站/12节点、骰子、移动、暂停、取消及资源释放。
- `node tests/meeting-browser.mjs`：独立生产服务的三选界面、资源反馈、横屏/竖屏、40回合总结；服务端CLI禁用。
- `node tests/share-production-browser.mjs`：真实生产打包和口令网关，新树木PNG成功加载、三个无剧透选项、无静态资源错误；不代表公网部署完成。
- `node tests/save-browser.mjs`：v4存档各阶段刷新、旧版保护与误用旧键的v4记录复制迁移。
- `node tests/ai-browser.mjs`、`node tests/experience-browser.mjs`：模拟响应、完整流程、三选无剧透、保存恢复等；不调用真实知乎模型。

浏览器回归全部隔离业务API。美术生成使用过内置 image_gen，运行时只加载本地 PNG，不进行现场生图。`pastoral-browser.mjs` 默认4189，其他需要已有服务器的脚本可显式设置 `TEST_BASE_URL`。

以下为先前会议版验收历史，含双选、v3、3D等旧术语，不能作为当前默认版本的说明；当前入口和结果以上节为准。

先切到项目根目录 `D:\知乎黑客松\four-seasons-life`。日常规则、模型适配及HTTP回归不调用真实知乎模型，也不应通过实际模型请求来检验游戏逻辑。

## 本轮已记录结果（2026-09-09）

- `npm test`：共84项，83通过、1跳过；覆盖40格、版本3、三资源、天赋、动画清单、场景合同及已有分享组件等。
- `npm run build`：通过；仍有大于500 kB的第三方3D依赖分块体积警告，不等于功能测试失败，也不是性能已达标的保证。
- 存档、AI、完整流程与骰子浏览器回归：通过；模型接口均拦截，没有重新验证实际知乎模型账户、网络或计费。
- 真实WebGL会议版界面：通过，包括桌面地图、双选、资源动效清理、横屏卡片、手机／宽竖屏平板暂停与弹窗恢复、40段经历及110情绪上限手记；对应截图已目视检查。
- 独立分镜与四季世界检查：通过，包括8个临时分镜、视频失败备用、跳过取消、40站相机与脚底接触。正式视频仍待交付。
- 本地生产构建＋口令网关浏览器验收：通过，23个模型就绪、51次静态请求、页面与资源错误均为0，叙事使用1次模拟响应。测试通过页面fetch替身隔离API，保留静态网络原生行为；不代表已经部署公网。
- 固定种子规则模拟：每模式4种策略，每策略5000局。完整随机策略通关约99.9%，平均约11.9停靠；快速约3.9停靠。它们不是真人时长和真人通关率。

以下表格说明各脚本的用途，**不是声称表中每一项在本次会话都已重新运行通过**。实际3D画面、移动舒适度和移动端可读性仍需结合截图与真人试玩验收。

## 规则、浏览器与场景入口

| 入口 | 覆盖范围 | 浏览器／已有服务 | 真实模型 |
| --- | --- | --- | --- |
| `npm test` | 40地点、全部骰点落点、唯一情绪结束条件、三资源预览与账本、天赋、费用可选性、v3重放、叙事缓存／队列／超时／安全、HTTP校验；亦包含现有其他单元测试 | 无浏览器；HTTP测试自行启动隔离服务 | 否：模拟执行器或禁用CLI |
| `node tests/balance.mjs` | full／demo路线，随机／追钱／护情绪／均衡策略；固定种子、可负担选项、进度与资源不变量 | 否 | 否 |
| `node tests/experience-browser.mjs` | 自动出发、行走后事件、转场与选项顺序、弹窗门控、横屏／竖屏、终点与手记 | 是；默认假场景，需要已有服务 | 否，接口拦截 |
| `node tests/save-browser.mjs` | 旧v1／v2键保留、v3各阶段刷新后连续性、角色与天赋 | 是；假场景，需要已有服务 | 否，接口拦截 |
| `node tests/ai-browser.mjs` | 实时／缓存／备用状态，过期响应，恶意文字安全显示，重开与文字手记下载 | 是；假场景，需要已有服务 | 否，接口拦截 |
| `node tests/meeting-browser.mjs` | 整体真实3D与会议版UI、角色天赋、资源动效、横屏／竖屏暂停、40段手记 | 是；真实WebGL，需要已有服务 | 否，全部API模拟 |
| `node tests/cinematics-browser.mjs` | 临时分镜、视频加载失败备用、跳过、暂停、取消、减少动态效果 | 是；自行启动隔离静态测试页面 | 否，不启动游戏模型服务 |
| `node tests/world-polish-browser.mjs` | 40格宽幅场景、8个动画路牌、花木木栏河桥、路牌编号、脚底接触、河床及四季截图 | 是；真实WebGL隔离小镇，需要已有服务 | 否，API全部阻断 |
| `node tests/dice-browser.mjs` | 六面朝向和真实WebGL骰子表现 | 是，需要已有服务 | 否，不进入叙事流程 |
| `node tests/dice-integration-browser.mjs` | 握骰、飞行、弹跳、读数镜头、六面与取消清理 | 是；隔离小镇，需要已有服务 | 否，不进入叙事流程 |
| `node tests/share-production-browser.mjs` | 打包产物、口令入口、原生资源下载、完整空分块请求、中央选项和模拟回响 | 是；自行启动独立生产服务与网关 | 否，后端CLI禁用且页面API模拟 |

默认地址是 `http://127.0.0.1:4173/`。支持自定义地址的脚本使用 `TEST_BASE_URL`；使用本机Chrome和Playwright，模块可通过 `PLAYWRIGHT_PATH` 指定。未安装或路径不匹配时应先修正测试依赖，不能把启动失败算作通过。

```powershell
npm test
node tests/balance.mjs
npm run build

# 先启动本地游戏服务，再运行这些浏览器入口
node tests/save-browser.mjs
node tests/ai-browser.mjs
node tests/experience-browser.mjs

# 动画测试会自行创建隔离静态服务
node tests/cinematics-browser.mjs
```

设置 `TEST_REAL_WORLD=1` 后运行 `experience-browser.mjs` 可进入真实3D分支，仍拦截知乎接口。设置 `TEST_WORLD_MOTION=1` 后运行 `world-polish-browser.mjs` 可检查两站正常速度行走；测试机上的宽松时长回归不保证所有设备的帧率。

## 版本3的必要断言

- 完整40格、每季10格；快速12个映射节点。骰子依然公平，快速模式不会保证停靠所有关键格。
- 初始资金5000、情绪100、专业10。没有旧版每步统一生活费与疲劳；只有情绪归零提前结束，资金归零继续。
- 普通叙事一个继续选项，选择事件两个选项；第18／33／37格付费方案须检查余额，另有无需预付的出口。
- 专业门槛展示实际分支，三种天赋反映在净变化中；情绪上限可到110，专业无硬上限。
- 仅接受 `version:3` 的合法日志，拒绝v1／v2旧日志、无效骰点、无效选项、结束后的追加操作；服务端不信任伪造余额或叙事。
- 第30格两个正常可用的选项都不扣款，看房规划不得被渲染成已购买房屋。
- 8个动画挂钩为第6／11／13／15／18／22／27／31格，第8格双选但没有本轮视频。

## 其他与旧入口

`browser-check.mjs`、`routes-browser.mjs` 是带提示的兼容转发，进入当前 `experience-browser.mjs`；`world-browser.mjs` 转入真实WebGL分支。无需与新入口重复执行。

已有 `share-*.test.mjs` 和分享浏览器工具检验口令、网关、生命周期或生产页面的技术行为。组件测试通过不证明公网隧道存在、不证明队友可访问，也不构成本轮部署交付。

`live-model-check.mjs` 是单独的手工真实模型工具，不属于本轮回归；只有显式 `RUN_LIVE_MODEL=1` 才允许调用，可能产生真实费用。工具已离线迁移v3存储键与可负担选项筛选，本轮没有运行，不以它声称官方模型已重新验收。

`inspect-reference.mjs` 用于辅助读取原参考视频，依赖用户原文件位置，不是游戏自动验收结论。

测试截图、下载手记等产物写入项目 `test-results/`。HTTP测试只关闭自己创建的子进程，不停止现有游戏服务；刻意指定不存在的CLI路径，防止继承本机凭据后意外请求真实模型。正式视频尚未交付，临时分镜测试通过也不等于最终成片验收。

## 2026-09-12：四季回忆册

- `memory-album.test.mjs` 覆盖实际记录、早退留白、短路线场景映射、原始选择不重算、来源匹配、隐私白名单、二维码边界及缺图降级。
- 先执行 `npm run build`，再执行 `node tests/memory-browser.mjs`：使用自己创建的生产测试进程和隔离存档，检查完整/提前结束/快速模式、四种横屏尺寸、连续键盘导航、详细报告返回、PNG/文字下载、图片失败和异步取消。
- 默认结局现为回忆册，固定十点与原报告需点击“详细手记”。`life-ui-browser.mjs` 和 `journey-complete-browser.mjs` 已调整这一入口，旧断言不删除。
- `rhythm-browser.mjs` 的默认结局请求数预期改为 0：翻阅确定性回忆不请求 AI，详细手记保留原有总结功能。
- 当前规则和视觉验收以日期较新的文档为准，前面的 v3 章节属于历史说明。

## 2026-09-12：早晨与日落全图外观

- `world-daylight.test.mjs` 检查双模式回退、独立于游戏的颜色变化、精确恢复、反向渐变、减少动态效果、材质隔离、全景和淡出同步、暂停缓存、存储拒绝和 WebGL 降级。
- 先 `npm run build`，再 `node tests/daylight-browser.mjs --production`：隔离生产服务和浏览器，检查桌面/手机横屏、四季地标、跟随/全图、真实平滑过渡、键盘与刷新、导航避让、竖屏保护、存档不变与反复切换不增加纹理/几何体。
- 测试中的世界检查句柄仅注入浏览器响应，不写入发给玩家的代码；所有外网和模型接口均被拦截。

## 2026-09-12：正式首页单入口

- 首页只提供 `#start-full`（走进我的四季）。不再提供独立样板、短程试玩、预览小镇和方法卡等并列首页动作；地图仍由底部“小镇地标”打开，方法卡移至顶部“手记”中。
- 有合法存档时，先点击 `#start-full`，再在确认弹窗点击 `#resume` 或 `#start-new-journey`。取消不得写盘，继续不得重算经历；明确新开后才替换存档，且新局为完整 40 站。
- `single-entry-browser.mjs` 使用隔离生产服务和存档检查桌面/横屏首页、旧 full/demo 的取消与继续、明确新开、已结束存档回忆入口。运行前先构建。
- 当前 `player-name-browser.mjs`、`practice-invitation-browser.mjs`、`share-preview-browser.mjs` 已适配新进入流程。旧版浏览器脚本若仍直接操作首页 `#resume`、`#start-demo`、`#start-sample`，属于历史入口假设，需迁移后再使用，不能拿旧报告宣称新版验收完成。
- 本次前端调整不改引擎的 demo 存档格式或已有数据，不请求真实模型，不构成公网部署交付。

## 2026-09-12：文字写回路牌

- `board-sign.test.mjs` 检查完整中文实际绘制、牌面比例、字体过滤、正反面朝向、深度遮挡，以及编号变更时共享材质和旧纹理释放。
- 40 个地点牌、3 个季节路牌及起终点门牌采用实体牌面文字；`WorldSignage` 仅保留建筑名称和总览季节标签，不再创建路牌悬浮标签及其引线。
- `board-sign-browser.mjs` 使用隔离服务加载真实 3D 世界，检查实际 Canvas 绘制、短程/完整路线编号及不同视角。`world-signage-browser.mjs` 检查实际首页进入、建筑/四季标注和地图交互。这些测试拦截外网与模型接口，不修改玩家存档或关闭玩家服务。

## 2026-09-12：到站转场按四季变化

- `arrivalTheme(kind, season)` 由实际落点季节决定花/光/叶/雪及人生阶段，五种事件类型决定短句与细节；不再把所有治愈事件都画成绿叶。不改变引擎、数值、掷骰、选项或已有存档。
- `arrival-seasons.test.mjs` 覆盖40个落点、20种季节/事件组合、1120ms普通转场、360ms减少动态效果、弹窗/页面隐藏暂停、过期旅程取消、重复进入及粒子/监听器清理。
- `arrival-seasons-browser.mjs` 拦截API和外网，用隔离存档及真实WebGL页面检查四季、桌面/短横屏、正文可见性、减少动态效果和后续三选项。报告区分真实掷骰到站与仅测试注入的视觉样本，不将视觉样本视为完整试玩。
