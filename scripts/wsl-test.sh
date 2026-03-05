#!/bin/bash
# WSL 测试脚本 - 配置 Node 并运行 OpenClaw Shell
mkdir -p ~/.local/bin
ln -sf /mnt/d/Nodejs/node.exe ~/.local/bin/node 2>/dev/null || true
export PATH="$HOME/.local/bin:/mnt/d/Nodejs:$PATH"

cd /mnt/c/Users/Administrator/Desktop/openclow
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

echo "=== 环境检查 ==="
node -v
npm -v 2>/dev/null || /mnt/d/Nodejs/npm -v
echo ""

echo "=== 测试 1: status ==="
bash scripts/OpenClaw_Shell.sh status 2>&1 || true
echo ""

echo "=== 测试 2: doctor ==="
bash scripts/OpenClaw_Shell.sh doctor 2>&1 || true
echo ""

echo "=== 测试 3: minimal-repair ==="
bash scripts/OpenClaw_Shell.sh minimal-repair 2>&1 || true
echo ""

echo "=== 测试 4: gateway-start ==="
bash scripts/OpenClaw_Shell.sh gateway-start 2>&1 || true
echo ""

echo "=== 测试完成 ==="
