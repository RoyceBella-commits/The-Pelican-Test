# 《鹈鹕测试》The Pelican Test

> 人类自古以来就痴迷于画鹈鹕骑自行车。——早在自行车被发明之前。

## 简介

一只白鹈鹕骑着一辆现代自行车，沿着一条连续的路，穿过二十幅不同时代的画。每过一道画框，世界就换一种画法，鹈鹕自己也跟着变成那个时代的样子：岩壁上的赭石剪影、汉画像石上的拓片、宋人笔下的水墨、浮世绘里的版画、梵高的厚涂、示波器上的绿色光线、8-bit 游戏里的像素……直到最后，在大模型时代的代码编辑器里，它被一行行 SVG 重新画了出来。

结尾，二十幅画折成一面展墙，第二十一格留给了一张空着的发布会席位——席卡上写着「鹈鹕（本人）」。

截至目前，人类共提交了 20 份答卷。鹈鹕本人对此尚未发表评论。

**二十个时代：** 撒哈拉岩画 · 埃及壁画 · 汉画像石拓片 · 唐代白描 · 宋代山水 · 清明上河图 · 玛雅抄本 · 莫卧儿细密画 · 八大山人 · 爪哇皮影戏 · 浮世绘 · 星月夜 · 呐喊 · 诺斯费拉图 · 示波器矢量图 · 8-bit 像素游戏 · 早期聊天窗口 · 蒸汽波 · 竖屏短视频 · 代码美学

## 怎么做的

- 每一帧都由代码实时画出：p5.js + p5.brush + Canvas2D，画面是时间的纯函数，同一时刻无论渲染多少次都完全一样。
- 音乐全部用 Web Audio 程序合成，没有采样：每个时代用自己的乐器演奏同一段原创主旋律，过画框的强拍上响一声车铃。蒸汽波一段是先合成一卷 80 年代商场磁带，再放慢到 0.79 倍播放。
- 二十幅画都是向公有领域作品的致敬，构图与笑点均为原创；片中的聊天软件、短视频平台等全部是虚构的。
- 2 分 17 秒 · 1080p60 · 120 BPM。

## 致谢

本片的制作方法参考了 **Tunai-0511** 的开源项目 **meme67-art-history**（代码以 MIT 协议开源）：
https://github.com/Tunai-0511/meme67-art-history

「共享绘图工具包 + 每幅画一个场景文件 + 按时间逐帧渲染 + 无头浏览器截帧 + 接触表自查」这套工作方式，就是从这个项目学来的。本片没有使用它的任何代码、画面、构图或笑点，在此衷心感谢作者的开源分享。

同时感谢 p5.js 与 p5.brush（Alejandro Campos Uribe），以及那些早已进入公有领域、至今仍在启发我们的艺术家与作品。

---

## English

> Since time immemorial, humankind has been obsessed with drawing pelicans riding bicycles — long before the bicycle was invented.

A white pelican rides one modern bicycle along a single continuous road through twenty framed paintings from twenty eras. At every frame it crosses, the world changes its medium, and so does the pelican: ochre on Saharan rock, a Han stone rubbing, Song ink, a woodblock print, Van Gogh's impasto, green phosphor on an oscilloscope, 8-bit pixels… until, in the LLM era, it is written back into being, line by line, as SVG. At the end the twenty paintings fold into a gallery wall whose 21st cell is an empty press-conference seat labelled "The Pelican (in person)".

To date, humankind has handed in 20 answers. The pelican itself has yet to comment.

Every frame is drawn by code (p5.js + p5.brush + Canvas2D) as a pure function of time; all music is synthesised with Web Audio. The panels are original homages to public-domain works; all apps shown are fictional. 2:17 · 1080p60.

**Thanks** to **Tunai-0511** and the open-source project **meme67-art-history** (MIT), whose working method — a shared drawing kit, one file per panel, frame-by-frame rendering as a function of time, headless capture and contact sheets — this film learned from: https://github.com/Tunai-0511/meme67-art-history. No code, imagery, compositions or jokes from that project are used. Thanks also to p5.js and p5.brush (Alejandro Campos Uribe).
