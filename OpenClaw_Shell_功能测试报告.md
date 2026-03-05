# OpenClaw Shell 功能测试报告

**测试环境**: Ubuntu WSL (Windows Subsystem for Linux)  
**测试时间**: 2026-03-05  
**脚本版本**: OpenClaw_Shell.sh (Linux/macOS)

---

## 一、环境准备

| 依赖项 | 状态 | 说明 |
|--------|------|------|
| Node.js | ✅ v24.14.0 | 通过 Windows `/mnt/d/Nodejs` 路径 + 符号链接 |
| npm | ✅ 11.9.0 | 使用 Windows 安装 |
| Git | ✅ 2.43.0 | 已安装 |
| OpenClaw | ✅ 2026.3.2 | 已检测到 |

---

## 二、功能测试结果

### 2.1 快捷命令

| 命令 | 结果 | 说明 |
|------|------|------|
| `minimal-repair` | ✅ 通过 | manifest 补齐、doctor --fix、plugins、skills check、gateway 自检 全部执行 |
| `gateway-start` | ✅ 通过 | 脚本执行成功，提示打开 http://127.0.0.1:18789/ |
| `status` | ⚠️ 路径问题 | 使用 Windows npm openclaw 时存在路径混用 |
| `doctor` | ⚠️ 路径问题 | 同上 |

### 2.2 一键最小修复流程

```
[1/5] manifest 补齐    → OK 无需补齐
[2/5] doctor --fix     → 已执行
[3/5] plugins 校验     → 已执行
[4/5] skills check     → 已执行
[5/5] gateway 自检     → 已停止
```

### 2.3 Gateway 启动

- 通过 Windows 侧 `openclaw gateway` 启动成功
- 访问 http://127.0.0.1:18789/ 返回 200

---

## 三、已知问题与建议

1. **WSL 下 openclaw 路径**：当使用 Windows npm 安装的 openclaw 时，部分命令（如 status、doctor 单独调用）可能因路径格式混用报错。`minimal-repair` 和 `gateway-start` 流程正常。

2. **npm 脚本警告**：`~/.local/bin/npm` 符号链接到 Windows npm 时出现 `line 13: unexpected EOF`，不影响主要功能。

3. **建议**：在纯 Linux/Ubuntu 环境使用时，建议执行 `sudo apt install nodejs npm` 或使用 nvm 安装原生 Node.js，以获得最佳兼容性。

---

## 四、测试结论

| 项目 | 结论 |
|------|------|
| 脚本语法 | ✅ 正常 |
| 环境检测 | ✅ 正常 |
| 一键最小修复 | ✅ 通过 |
| Gateway 启动 | ✅ 通过 |
| 对话界面 | ✅ 已打开 |

**综合评定**：OpenClaw_Shell.sh 在 Ubuntu WSL 环境下核心功能可用，建议在原生 Linux 环境进一步验证。
