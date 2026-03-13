# OpenClaw 一键部署

> 面向 Windows 的 OpenClaw 图形化部署工具，帮助你更快完成安装、配置、启动与多渠道接入

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 简介

**OpenClaw 一键部署** 是一个面向普通用户的 Windows 桌面工具，用来简化 OpenClaw 的安装、模型配置、Gateway 启动和渠道接入流程。  
你不需要手改配置文件，也不需要先熟悉命令行，按页面引导即可完成首轮部署。

- **上手快**：图形界面引导，适合第一次接触 OpenClaw 的用户
- **部署省心**：自动检测环境并优先使用内置资源完成安装准备
- **配置直观**：支持 Claude、GPT、DeepSeek、Kimi、阿里云百炼以及兼容 OpenAI 的自定义接口
- **多渠道接入**：支持 Telegram、飞书、QQ、Discord、钉钉等渠道的图形化配置与配对
- **适合受限网络环境**：可先下载发布包，再在无外网环境中完成安装阶段的主要操作

## 适用场景

- 第一次部署 OpenClaw，希望尽量少碰命令行
- 需要统一管理模型配置、Agent、Gateway 和常用渠道
- 机器处于受限网络环境，希望先下载好安装包再带到目标机器使用
- 希望先快速跑通本地对话，再逐步接 Telegram、QQ、飞书等外部入口

## 功能概览

| 功能 | 说明 |
|------|------|
| 环境检测 | 自动检测 Node.js、npm、OpenClaw 安装状态 |
| 安装准备 | 优先使用内置运行资源，失败时再回退在线安装 |
| 配置向导 | AI 模型、API Key、自定义 API 地址 |
| 启动服务 | 启动 Gateway 并自动打开对话网页 |
| 渠道配置 | Telegram、飞书、QQ、Discord、钉钉等渠道配对 |
| 修复排障 | 提供常见环境问题、依赖问题和运行状态排查入口 |

## 下载与安装

### 方式一：安装版（推荐）

1. 前往 [Releases](https://github.com/3445286649/openclaw-deploy/releases) 下载最新版本
2. 选择 Windows 安装包（`.exe`）
3. 运行安装程序，按提示完成安装

### 方式二：绿色版（免安装）

1. 下载 `OpenClaw-Deploy-vX.X.X-Windows.zip`
2. 解压到任意目录
3. 双击 `openclaw-deploy.exe` 运行

压缩包内通常包含：
- `openclaw-deploy.exe`：主程序
- `OpenClaw_Shell_Install.cmd`：命令行安装/启动脚本
- `使用文档.md`：详细使用说明与常见问题

## 使用流程

1. **安装 Node.js**（建议 v22 及以上）  
   若未安装，请先从 [Node.js 官网](https://nodejs.org/) 下载并安装。

2. **打开本工具**，按向导完成：
   - 步骤 1：安装 OpenClaw
   - 步骤 2：配置 AI 模型（选择提供商、填入 API Key）
   - 步骤 3：点击「启动 Gateway 并自动打开对话网页」，浏览器会自动打开对话界面

3. 如需 Telegram、QQ、飞书等渠道，在对应页面完成凭据填写、测试连通与首次配对。

## Linux / macOS 一键脚本

如果你需要在 Linux 或 macOS 上直接拉取并执行安装脚本，可以使用：

```bash
curl -fsSL https://raw.githubusercontent.com/3445286649/openclaw-deploy/main/install.sh | bash
```

如果希望进入交互式菜单模式，可以使用：

```bash
curl -fsSL https://raw.githubusercontent.com/3445286649/openclaw-deploy/main/install.sh | bash -s menu
```

- 第一条：直接执行一键安装
- 第二条：进入交互式菜单后再选择操作

## Shell 脚本

除图形界面外，还提供 `OpenClaw_Shell_Install.cmd` 脚本，用于在命令行中安装并启动 OpenClaw：

- **功能**：检测 openclaw 是否已安装，未安装则执行 `npm install -g openclaw`，然后启动服务
- **使用**：双击运行，或在 CMD 中执行
- **前置条件**：已安装 Node.js（含 npm）

## 从源码构建

### 环境要求

- Node.js >= 18
- Rust（建议通过 `rustup` 安装）
- Windows：Visual Studio 2022 Build Tools（含 C++ tools 与 Windows SDK）
- WebView2 Runtime

### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/3445286649/openclaw-deploy.git
cd openclaw-deploy

# 安装依赖
npm install

# 开发模式（热重载）
npm run tauri dev

# 打包发布（生成 exe + 压缩包，含 Shell 脚本）
npm run tauri build
# 或双击根目录 build-release.bat
```

打包完成后：
- 可执行文件：`src-tauri/target/release/openclaw-deploy.exe`
- 发布文件夹：`release/`（含 exe、安装包、Shell 脚本、使用文档）
- 压缩包：`OpenClaw-Deploy-v0.1.0-Windows.zip`

## 常见问题

详见 [使用文档.md](使用文档.md)，包括：

- 启动后浏览器打开错误页面
- openclaw.cmd 找不到
- 内存资源不足
- 404 错误
- WebChat 连接断开
- 未检测到 npm

## 技术栈

- [Tauri 2](https://tauri.app/) - 跨平台桌面应用框架
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) - 样式
- [Lucide React](https://lucide.dev/) - 图标

## 开源协议

[MIT](LICENSE)

## 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 私人 AI 助手项目
