# OpenClaw 仅安装 - 无菜单，用于 CMD fallback
# 第一页检测 -> 第二页安装选项 -> 安装进度
$ErrorActionPreference = "Continue"
try { chcp 65001 | Out-Null } catch {}
$utf8 = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = $utf8
[Console]::InputEncoding = $utf8
$OutputEncoding = $utf8

$NPM_GLOBAL = "$env:APPDATA\npm"
$env:PATH = "$NPM_GLOBAL;$env:PATH"

Write-Host ""
Write-Host "[第一页] 环境检测" -ForegroundColor Yellow
Write-Host "----------------------------------------"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[失败] 未检测到 Node.js" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}
Write-Host ("[OK] Node.js " + (node -v 2>$null)) -ForegroundColor Green
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "[失败] 未检测到 npm" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}
Write-Host ("[OK] npm " + (npm -v 2>$null)) -ForegroundColor Green
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[警告] 未检测到 Git。安装 OpenClaw 可能需要 Git，建议先安装: https://git-scm.com/download/win" -ForegroundColor Yellow
} else {
  Write-Host ("[OK] Git " + (git --version 2>$null)) -ForegroundColor Green
}
Write-Host ""

Write-Host "[第二页] OpenClaw 安装检测" -ForegroundColor Yellow
Write-Host "----------------------------------------"
$ocCmd = "$NPM_GLOBAL\openclaw.cmd"
if (Test-Path $ocCmd) {
  Write-Host "[完成] OpenClaw 已安装" -ForegroundColor Green
  & $ocCmd @args
  Read-Host "按回车退出"
  exit 0
}

Write-Host "未检测到 OpenClaw，请选择安装方式:" -ForegroundColor Yellow
Write-Host "  [1]  直接安装 - 安装到 npm 全局目录" -ForegroundColor White
Write-Host "  [2]  自定义目录 - 推荐，避免权限/网络问题 (如 D:\openclow)" -ForegroundColor White
Write-Host "  [0]  取消" -ForegroundColor White
Write-Host ""
$choice = Read-Host "请选择 (1/2/0)"
$choice = if ($choice) { $choice.Trim() } else { "" }

if ($choice -eq "0") {
  Write-Host "[取消] 已取消" -ForegroundColor DarkGray
  Read-Host "按回车退出"
  exit 0
}

if ($choice -eq "2") {
  $customPath = Read-Host "输入安装目录 (如 D:\openclow)"
  $customPath = $customPath.Trim().Replace('"','').Replace("'",'').TrimEnd('\')
  if (-not $customPath) {
    Write-Host "[取消] 未输入有效路径" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
  }
  if (-not (Test-Path $customPath)) {
    New-Item -ItemType Directory -Path $customPath -Force | Out-Null
  }
  Write-Host ("正在安装到 " + $customPath + " ...") -ForegroundColor Cyan
  npm install -g openclaw --prefix $customPath
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[失败] 安装失败" -ForegroundColor Red
    Write-Host "[提示] EPERM: 关闭杀毒软件或以管理员运行; ECONNRESET: 检查网络/代理" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
  }
  $ocCmd = if (Test-Path (Join-Path $customPath "openclaw.cmd")) {
    Join-Path $customPath "openclaw.cmd"
  } else {
    Join-Path $customPath "openclaw.ps1"
  }
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $paths = $userPath -split ';' | Where-Object { $_.Trim() -and $_.Trim().TrimEnd('\') -ne $customPath }
  $newPath = ($paths -join ';').Trim(';')
  if ($customPath -and -not ($newPath -split ';' | Where-Object { $_.Trim().TrimEnd('\') -eq $customPath })) {
    $newPath = if ($newPath) { "$customPath;$newPath" } else { $customPath }
  }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  $env:PATH = "$customPath;$env:PATH"
  Write-Host "[完成] OpenClaw 已安装到 $customPath" -ForegroundColor Green
} else {
  if ($choice -ne "1") { Write-Host "默认使用直接安装" -ForegroundColor DarkGray }
  Write-Host "正在安装到 npm 全局目录..." -ForegroundColor Cyan
  npm install -g openclaw
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[失败] 安装失败" -ForegroundColor Red
    Write-Host "[提示] EPERM: 选择 [2] 自定义目录 D:\openclow 可避免; ECONNRESET: 检查网络/代理" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
  }
  Write-Host "[完成] OpenClaw 已安装" -ForegroundColor Green
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $hasNpm = ($userPath -split ';' | ForEach-Object { $_.Trim().TrimEnd('\') } | Where-Object { $_ -eq $NPM_GLOBAL }).Count -gt 0
  if (-not $hasNpm) {
    Write-Host "[提示] npm 目录未在 PATH 中，cmd 无法直接运行 openclaw" -ForegroundColor Yellow
    $add = Read-Host "是否一键添加到 PATH? (Y/n)"
    if ($add -ne 'n' -and $add -ne 'N') {
      $newPath = if ($userPath) { "$NPM_GLOBAL;$userPath" } else { $NPM_GLOBAL }
      [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
      $env:PATH = "$NPM_GLOBAL;$env:PATH"
      Write-Host "[OK] 已添加，新开 cmd 后 openclaw 命令生效" -ForegroundColor Green
    }
  }
}

Write-Host ""
Write-Host "[2/2] 启动 OpenClaw..." -ForegroundColor Cyan
& $ocCmd @args
Read-Host "按回车退出"
