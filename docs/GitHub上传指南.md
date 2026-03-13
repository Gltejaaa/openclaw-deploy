# GitHub 上传与发布指南

这份指南对应当前项目 `openclow` 的实际结构，适合在 Windows 上把桌面版打包后上传到 GitHub。

## 1. 上传前先检查

在项目根目录先确认这几件事：

1. `npm run build` 通过
2. `src-tauri` 下 `cargo check` 通过
3. `package.json` 和 `src-tauri/tauri.conf.json` 中版本号一致
4. `使用文档.md` 已更新为当前版本

如果这四项都没问题，再开始打包。

## 2. 一键打包

项目已经准备好了发布命令：

```bash
npm run release
```

它会做两件事：

1. 先执行 `tauri build`
2. 再执行 `scripts/build-release.ps1`

打包完成后，你会得到：

- `release/` 目录
- 根目录的 `OpenClaw-Deploy-v<版本号>-Windows.zip`
- NSIS 安装包
- 绿色版 exe
- 附带脚本
- `使用文档.md`

当前发布脚本会显式把根目录的 `使用文档.md` 复制到发布目录，避免误带其他 Markdown 文件。

如果当前版本包含 QQ / 飞书 / Discord 这类插件渠道，还要额外注意：

1. `npm run release` 前会先执行 `scripts/prepare-bundled-extensions.ps1`
2. QQ 插件运行时来源固定是 `@sliverp/qqbot`
3. 该脚本会优先从当前机器可用的 `extensions/qqbot` 收集插件目录
4. 然后写入 `src-tauri/resources/bundled-extensions/qqbot`
5. 最终随安装包一起发布，避免换机器后 QQ 渠道缺少本地插件目录

如果当前版本包含“测试机已验证、准备同步主设备”的改动，建议在主设备完成下面动作后再发包：

1. 对照 `docs/主Cursor同步说明-2026-03-09.md`
2. 重新跑一遍 `npm run build`
3. 重新跑一遍 `cargo check`
4. 再执行 `npm run release`

## 3. 建议上传哪些文件

如果你发 GitHub Release，推荐上传这几类：

- 安装包 `.exe`
- 绿色版压缩包 `.zip`
- 如果你需要，附带 `release/` 目录中的脚本文件

最常见的做法是：

1. 上传安装包给普通用户
2. 上传 zip 给想要绿色版的人

## 4. 首次推送到 GitHub

如果这是第一次把项目推到 GitHub：

1. 在 GitHub 新建仓库
2. 仓库名建议使用 `openclaw-deploy`
3. 仓库创建后，在本地项目根目录执行：

```bash
git add .
git commit -m "feat: 发布 OpenClaw 桌面版"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/openclaw-deploy.git
git push -u origin main
```

如果仓库已经初始化过，只需要正常 `git add`、`git commit`、`git push` 即可。

## 5. 创建 GitHub Release

代码推送完成后：

1. 打开仓库页面
2. 进入 `Releases`
3. 点击 `Create a new release`
4. 新建标签，例如 `v2.0.0`
5. Release 标题可以写：`v2.0.0 - OpenClaw 一键部署桌面版`
6. 上传打包好的安装包和 zip
7. 点击 `Publish release`

## 6. 发布说明模板

可以直接参考这个模板：

```markdown
## 本次版本
- 优化聊天与多 Agent 切换体验
- 聊天页暂时收口为单个 Gateway 启动按钮
- 调整渠道配置为更适合小白的保存流程
- 安装/卸载 OpenClaw 改为后台任务与进度回填
- 安装自动尝试默认源、npmmirror、腾讯云镜像
- 修复中心支持后台体检与后台状态刷新
- 完善使用说明与发布包内容

## 下载说明
- 安装版：适合普通用户直接安装
- ZIP 绿色版：适合不想安装的人

## 首次使用建议
1. 先配置 AI 服务
2. 先本地聊天跑通
3. 再接 Telegram / QQ / 飞书
```

## 7. 版本更新时要改哪里

每次发新版，至少检查这两个文件：

- `package.json`
- `src-tauri/tauri.conf.json`

版本号建议保持一致。

## 8. .gitignore 建议

项目根目录建议至少包含这些忽略项：

```gitignore
node_modules/
dist/
src-tauri/target/
release/
*.zip
.DS_Store
Thumbs.db
```
