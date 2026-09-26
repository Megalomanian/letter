# 把这一页传到 URL 上

目标：拿到一个 **HTTPS 的公开地址**，手机浏览器打开就是这封信。

这个项目是纯静态的：`index.html` + `assets/`（CSS / JS / 两张图），
没有构建、没有依赖、没有后端，**任何静态托管都能直接放**。

---

## 0. 先说结论

| 方案 | 国内手机直连 | 免费 | 备案 | 默认域名长这样 | 上手难度 |
|---|---|---|---|---|---|
| **EdgeOne Pages（腾讯云）** | ✅ 好（国内 CDN） | ✅ | 默认域名不用 | `xxx.edgeone.app` | 低（可拖拽上传） |
| **GitHub Pages** | ⚠️ 一般，偶尔慢/不通 | ✅ | 不用 | `用户名.github.io/仓库名/` | 低（git push） |
| **Cloudflare Pages** | ⚠️ 一般 | ✅ | 不用 | `xxx.pages.dev` | 低（一条 CLI 命令） |
| **Vercel / Netlify** | ⚠️ 一般 | ✅ | 不用 | `xxx.vercel.app` / `xxx.netlify.app` | 低 |
| **Gitee Pages** | — | — | — | — | ❌ **目前停服** |
| 阿里云 OSS / 七牛 / 又拍 | ✅ 好 | 部分收费 | **要备案** | `xxx.你的域名.com` | 高 |

**首选：EdgeOne Pages**（国内手机贴开最快、默认域名不用备案、支持直接拖拽上传）。
**备选：GitHub Pages**（最通用，仓库 + `git push` 就完事）。

> ⚠️ 关于 Gitee Pages：它曾是最符合"类 Gitee 托管"直觉的方案，但 **Gitee Pages 因服务维护调整已暂停**，
> 官方没有给出恢复时间，客服口径是"服务已下线，是否恢复未知"。
> 参考：[Gitee Pages 服务关闭相关 issue](https://gitee.com/oschina/git-osc/issues/IA6DQ6)、
> [知乎讨论：Gitee Pages 下线后的替代品](https://www.zhihu.com/question/655233802/answer/3493504415)。
> 所以下面以 EdgeOne Pages / GitHub Pages 为主，Gitee 只用来放代码（不放 Pages）。

---

## 1. 首选：EdgeOne Pages（腾讯云，国内直连快）

`EdgeOne Pages` 是腾讯云 EdgeOne 的免费静态托管，默认域名带国内 CDN 加速，**自定义域名才需要备案**。

**方式 A｜拖拽上传（最省事，1 分钟）**

1. 打开 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages)（需登录腾讯云账号）。
2. 选 **Pages Drop / 直接上传**，把整个项目文件夹（或打包好的 zip）拖进去。
   - 注意：入口文件必须是根目录的 `index.html`，`assets/` 要和它同级。
3. 部署完成后会得到一个 `https://xxx.edgeone.app` 的地址，直接可用（HTTPS，无需备案）。

**方式 B｜关联 Git 仓库（以后改文案自动重新部署）**

1. 先把代码推到一个 Git 仓库（Gitee / GitHub / Coding 都行）：
   ```bash
   ./deploy.sh git@gitee.com:你的用户名/letter.git
   ```
2. EdgeOne Pages → 新建项目 → 选择 Git 仓库 → 框架选 **其他 / 静态**。
   - 构建命令：**留空**（没有构建步骤）
   - 输出目录：**留空** 或填 `.`（根目录）
3. 保存部署 → 得到 `https://xxx.edgeone.app`。

> 官方说明：[EdgeOne Pages 免费静态托管](https://pages.edgeone.ai/zh/resources/announcing-pages-drop-free-static-website-hosting)、
> [腾讯云开发者社区介绍](https://cloud.tencent.com/developer/article/2473972)。
> 国内站自定义域名需要 ICP 备案；**默认的 `*.edgeone.app` 域名不需要**。

---

## 2. 备选：GitHub Pages

1. 在 GitHub 建一个 **Public** 仓库（免费账号的 Pages 只对公开仓库开放），比如 `letter`。
2. 推送：
   ```bash
   ./deploy.sh https://github.com/你的用户名/letter.git
   # 或者用 gh： gh repo create letter --public --source=. --push
   ```
3. 仓库页面 → **Settings → Pages** → Source 选 `Deploy from a branch`，
   Branch 选 `main` / 根目录 `/ (root)` → Save。
4. 等 1~2 分钟，地址是：
   ```
   https://你的用户名.github.io/letter/
   ```

> 如果 `gh` 没登录：`gh auth login` 一次即可（本机已装 `gh` 2.67）。

---

## 3. 其它可选（都是一条命令）

```bash
# Cloudflare Pages（首次会打开浏览器登录）
npx wrangler pages deploy . --project-name=letter
# → https://letter.pages.dev

# Netlify
npx netlify-cli deploy --prod --dir=.
# → https://xxx.netlify.app

# Vercel
npx vercel --prod
# → https://xxx.vercel.app
```

> 参考：[Cloudflare Pages 官方文档](https://developers.cloudflare.com/pages/)、
> [Netlify 部署文档](https://docs.netlify.com/)、[Vercel 文档](https://vercel.com/docs)。

---

## 4. 部署之后要做的两件小事

1. **填上分享卡片信息**（微信 / Telegram 里发链接时会有预览图）。
   打开 `index.html`，把这两行的 `content` 换成你的真实地址：
   ```html
   <meta property="og:url" content="https://你的地址/">
   <meta property="og:image" content="https://你的地址/assets/og.png">
   ```
   `assets/og.png` 已经做好（1200×630 的分享卡片），直接引用即可。

2. **确认图片也一起传上去了**：`pic1.png`（姑娘那页）和 `pic2.jpg`（彩虹那页）必须和
   `index.html` 在**同一个目录**。用拖拽上传时别只拖 `index.html` 和 `assets/`，整个文件夹一起传。

3. **验证一下**：手机浏览器打开地址，确认：
   - 出现信封封面，点一下能展开；
   - **手指上滑 / 下滑都能翻页**（不只是点击），底部画布跟着换动画；
   - 翻到「姑娘」那页能看到照片由模糊变清晰；「彩虹」那页动画播完后画面会切换成另一张图；
   - 翻到最后一页，画布铺满整屏收尾。

---

## 5. 什么时候需要一个"短"地址

如果打算把地址写进 NFC 贴纸，地址越短越好（NTAG213 只有 144 字节可用空间，长地址会装不下，
而且贴纸读出来的链接越长，越容易在分享时被截断）。三个建议：

- **优先**：直接用平台给的短地址（`xxx.edgeone.app`、`xxx.pages.dev` 这类通常只有二三十个字符）。
- **仓库名取短一点**：`github.io/letter/` 比 `github.io/a-letter-for-someone/` 好。
- **不要用第三方短链服务**：短链服务商一旦停服，NFC 贴纸就永久失效了，烧之前务必用最终地址。

---

## 6. 本地先看一眼（可选）

```bash
cd 这个目录
python3 -m http.server 8000
# 手机连同一个 WiFi，打开 http://你电脑的局域网IP:8000
```

直接双击 `index.html` 也能看（全部资源都是相对路径、零外部请求），
但用本地服务器更接近真实线上环境。
