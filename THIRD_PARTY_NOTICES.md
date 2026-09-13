# 第三方素材与参考记录

本文件记录当前项目实际包含的外部素材、依赖及参考来源。各来源的许可分别适用；本文件没有把刘看山、知乎内容或所有项目文件统一改为开源许可。

## 团队影片授权局部修补（2026-09-13）

用户明确允许本地逐帧修补，并确认有权移除第8格原片水印。`public/cinematics/team-20260912-repaired-20260913/` 仅包含第8、31格的新副本与实际帧封面：第8格局部修补水印背景；第31格替换纸面错误标题为“协商方案”并匹配移动纸面的透视。原片与原集成视频保留，已有AIGC来源元数据未删除；本轮未调用生成API，不改变原素材其余权利边界。

第31格标题由本机微软雅黑粗体栅格化进视频，仅包含文字像素，不在项目中复制或分发字体文件。复现与验证记录见 `docs/影片局部修补-2026-09-13.md`。

## 完整3D环境（2026-09-11）

用户本轮提供的MP4仅用于观察中心设施、外围树林、起伏地形和远景的空间关系。本地抽帧留作验收参考，不用于运行时，不复制视频的模型、贴图、文字标识或音轨。新增连续地形、山坡、树林、村舍、果园、田地等均由本项目程序构建，复用的程序化像素纹理来自本项目。原始参考视频未上传外部服务。

## 当前3D田园美术（2026-09-10）

当前默认入口采用本项目程序化3D模型和像素纹理。图书馆、体育馆、城中村、咖啡书摊参考既有四建筑设计稿制作了有侧墙、屋顶与纵深的实体，其他木屋/店铺/工作坊也做了统一处理；不是对官方《星露谷物语》素材或模型的提取。刘看山仍为参考用户形象制作的本项目模型，相关IP不重新授权。

经用户明确许可，`tools/prepare-landmark-cutouts.py` 对 `docs/art-drafts/life-landmarks-opaque-v2.png` 进行本地边缘连通背景去除。原文件未改变，输出 `public/art/life-landmarks-v1.png` 为带真实alpha的四格设计图集，供可选图册使用；不是模型贴片，也没有再次调用生图服务。前一轮两份不透明生成稿均保留。

## 前一轮像素美术记录（2026-09-09）

六张新增参考图仅用于美术方向与角色识别。程序绘制的刘看山更新了黑白造型、四向视图与待机动作；形象权利边界仍按下文处理。内置 image_gen 新生成的四建筑候选图保存在 `docs/art-drafts/life-landmarks-opaque-v1.png`、`life-landmarks-opaque-v2.png`，尚未作为地图素材启用，因为输出没有真实透明通道。生成方式、提示词与待处理事项见 `docs/参考图美术迭代-2026-09-09.md`；不宣称来自《星露谷物语》官方素材包或获得其授权。

地形、房屋、道具、像素角色等由本项目程序绘制。`public/art/season-trees-v2.png` 使用内置 image_gen 按用户的风格参考生成并修正为透明图集；不是《星露谷物语》原版素材，也不是其官方授权联名。生成提示词和处理记录见 `docs/像素美术与盲选迭代-2026-09-09.md`。刘看山身份与参考内容的权利边界仍按下文单独处理。

以下第三方3D模型仍保留在项目内；本轮程序化3D场景不再等待或载入这些GLTF文件。历史“当前载入清单”均指此前3D版本。

## 四季配乐（2026-09-09）

`src/season-music.js` 包含本项目编写的4段16小节曲谱及 Web Audio 合成器：初芽来信、向阳赶路、收好来时路、雪落仍有光。以振荡器和增益包络合成旋律、和声、低音与轻节奏，没有采样第三方歌曲、复制《星露谷物语》配乐或包含其游戏音频。短笛、拨弦、钢琴、木琴和钟声等是合成音色描述，不是实录乐器演奏。测试输出的WAV是曲谱渲染预览，不作为额外外部音乐素材。

## 已包含的模型素材

### KayKit: City Builder Bits 1.0

作者：Kay Lousberg / KayKit。来源：[官方素材仓库](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0)。原包许可证标注 CC0，随项目保留在 `public/models/city/LICENSE.txt`。

本地目录 `public/models/city/` 包含 13 个 glTF 模型及其 `.bin`、共享纹理 `citybits_texture.png`：

`building_A`、`building_B`、`building_C`、`building_D`、`building_E`、`building_G`、`car_hatchback`、`car_taxi`、`bench`、`streetlight`、`firehydrant`、`bush`、`watertower`。

当前场景载入清单包含前 12 个，`watertower` 为备用。场景会按位置与季节选择实例，不意味着每个加载模型都一定出现在每个镜头。

### Kenney: Nature Kit 2.1

作者：Kenney。来源：[官方素材页面](https://kenney.nl/assets/nature-kit)。原包许可证标注 CC0，随项目保留在 `public/models/nature/LICENSE.txt`。

本地目录包含 15 个 GLB：

`tree_oak`、`tree_oak_fall`、`tree_pineTallA_detailed`、`plant_bushDetailed`、`flower_purpleA`、`flower_yellowA`、`flower_redA`、`rock_largeA`、`rock_largeB`、`lily_small`、`mushroom_redGroup`、`tree_detailed`、`rock_smallA`、`grass_leafsLarge`、`fence_simple`。

当前载入清单包含前 11 个，最后 4 个为备用。两套素材的完整原始许可文件随资源保留；上面的名单是本地选取范围，而非完整素材包清单。

## 刘看山与知乎内容

刘看山原始素材由用户提供，原目录为 `D:\知乎黑客松\刘看山素材图`，包括三视图图片与透明 GIF。`public/characters/` 保存选用 GIF 的直接副本；程序制作的 3D 棋子以提供的形象为参考，不是官方提供的绑定模型。当前原始目录没有额外附带可供本项目重新授权整个 IP 的开源许可证；使用范围应遵循素材提供方和比赛的适用说明。

知乎文章与回答由 `src/sources.js` 逐项保存作者、标题、原链接和摘要。事件是综合改编，作者未对虚构情节、结算数值或 AI 台词提供背书。原文内容及商标不因本项目的代码许可而被重新授权。

## 只用于学习的代码项目

| 来源 | 所见许可证 | 本项目参考内容 | 是否复制代码或素材 |
| --- | --- | --- | --- |
| [Bruno Simon / folio-2025](https://github.com/brunosimon/folio-2025) | [MIT，Copyright 2025 Bruno Simon](https://github.com/brunosimon/folio-2025/blob/main/license.md) | `Foliage.js` 的实例叶片、遮挡思路，以及 `Time.js` 的分阶段更新时间思路 | 未复制源码、贴图或场景模型 |
| [3D Dice / dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) | [MIT，Copyright 2022 3D Dice](https://github.com/3d-dice/dice-box-threejs/blob/main/LICENSE) | 骰子投掷过程与最终点数显示的联系 | 仅参考，未包含该库代码 |
| [byWulf / threejs-dice](https://github.com/byWulf/threejs-dice) | [MIT，Copyright 2017 Michael Wolf](https://github.com/byWulf/threejs-dice/blob/master/LICENSE) | 面向最终点数的骰面方向检查 | 仅参考，未包含该库代码 |

当前骰子由本项目代码驱动视觉动画，没有宣称采用上述库的刚体物理实现。用户提供的参考视频只用于讨论镜头、空间与视觉效果；本项目没有从视频提取贴图或角色分发。

## JavaScript 依赖

当前默认3D渲染使用 Three.js / WebGL，开发与构建使用 Vite。它们的原始许可位于安装包中，版本以 `package-lock.json` 为准。

- Three.js：MIT，Copyright © 2010–2026 three.js authors；本地 `node_modules/three/LICENSE`。
- Vite：MIT，Copyright (c) 2019-present, VoidZero Inc. and Vite contributors；本地 `node_modules/vite/LICENSE.md`，该文件还记录其所含第三方代码的许可。

以下为已使用 Three.js 与 Vite 核心代码的 MIT 许可正文；依赖中另行标注的第三方许可仍保留并适用：

```text
The MIT License

Copyright © 2010-2026 three.js authors
Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
# Sharing card dependencies (2026-09-11)

The local portrait card uses `qrcode` 1.5.4 and its `dijkstrajs` dependency under the MIT license. Their complete notices are included in `public/share-card-licenses.txt` and shipped with the production build. The card illustration and companion UI portrait are native code drawings authored for this game; neither is represented as official Zhihu character art.
