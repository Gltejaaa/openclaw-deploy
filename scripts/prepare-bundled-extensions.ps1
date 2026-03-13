$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$resourceRoot = Join-Path $root "src-tauri\resources"
$bundledExtensionsRoot = Join-Path $resourceRoot "bundled-extensions"
$bundledNodeModulesRoot = Join-Path $resourceRoot "bundled-node-modules"
$bundledOpenClawRoot = Join-Path $resourceRoot "bundled-openclaw"

function Resolve-OpenClawPrefix {
  $cmd = Get-Command openclaw -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  $source = $cmd.Source
  if ($source -match '\.ps1$') {
    $dir = Split-Path $source -Parent
    $cmdPath = Join-Path $dir "openclaw.cmd"
    if (Test-Path $cmdPath) { return $dir }
  }
  if (Test-Path $source) {
    return (Split-Path $source -Parent)
  }
  return $null
}

function Resolve-StateDirCandidates {
  $items = @()
  foreach ($path in @(
    $env:OPENCLAW_STATE_DIR,
    (Join-Path $HOME ".openclaw"),
    (Join-Path $HOME "openclaw\.openclaw")
  )) {
    if (-not [string]::IsNullOrWhiteSpace($path)) {
      $items += $path
    }
  }
  return $items | Select-Object -Unique
}

function Resolve-SharedStateDirCandidates {
  $items = @()
  foreach ($path in (Resolve-StateDirCandidates)) {
    if ([string]::IsNullOrWhiteSpace($path)) {
      continue
    }
    $resolved = $path
    if ($path -match '[\\/]+multi_gateways[\\/]+[^\\/]+$') {
      $multiGatewaysDir = Split-Path $path -Parent
      $resolved = Split-Path $multiGatewaysDir -Parent
    }
    if (-not [string]::IsNullOrWhiteSpace($resolved)) {
      $items += $resolved
    }
  }
  return $items | Select-Object -Unique
}

function Resolve-OpenClawBundleCandidates {
  $items = @()
  foreach ($path in @(
    $env:OPENCLAW_BUNDLE_SOURCE,
    $openclawPrefix,
    (Join-Path $HOME "openclaw"),
    "D:\openclow",
    "C:\openclow",
    "D:\openclaw",
    "C:\openclaw"
  )) {
    if (-not [string]::IsNullOrWhiteSpace($path)) {
      $items += $path
    }
  }
  return $items | Select-Object -Unique
}

function Copy-DirectoryIfFound([string[]]$Candidates, [string]$Destination) {
  $source = $Candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $source) {
    if (Test-Path $Destination) {
      Write-Host "  - preserved: $Destination (reusing existing bundled asset)" -ForegroundColor DarkYellow
      return $true
    }
    Write-Host "  - skipped: $Destination (source not found)" -ForegroundColor DarkYellow
    return $false
  }
  if (Test-Path $Destination) {
    Remove-Item $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  Copy-Item $source $Destination -Recurse -Force
  Write-Host "  - bundled: $source -> $Destination" -ForegroundColor Green
  return $true
}

function Copy-DirectoryContentsIfFound([string[]]$Candidates, [string]$Destination) {
  $source = $Candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $source) {
    if (Test-Path $Destination) {
      $existing = Get-ChildItem -Path $Destination -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '^\.' } |
        Select-Object -ExpandProperty Name
      if ($existing) {
        Write-Host "  - preserved: $Destination (reusing existing bundled runtime packages)" -ForegroundColor DarkYellow
        return @($existing)
      }
    }
    Write-Host "  - skipped: $Destination (source root not found)" -ForegroundColor DarkYellow
    return @()
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $copied = @()
  Get-ChildItem -Path $source -Force | Where-Object { $_.Name -notmatch '^\.' } | ForEach-Object {
    $target = Join-Path $Destination $_.Name
    if (Test-Path $target) {
      Remove-Item $target -Recurse -Force
    }
    Copy-Item $_.FullName $target -Recurse -Force
    $copied += $_.Name
    Write-Host "  - bundled runtime pkg: $($_.FullName) -> $target" -ForegroundColor Green
  }
  return $copied
}

function Copy-OpenClawPrefixIfFound([string[]]$Candidates, [string]$Destination) {
  $source = $Candidates | Where-Object {
    $_ -and
    (Test-Path (Join-Path $_ "node_modules\openclaw\openclaw.mjs")) -and
    ((Test-Path (Join-Path $_ "openclaw.cmd")) -or (Test-Path (Join-Path $_ "openclaw")))
  } | Select-Object -First 1
  if (-not $source) {
    if (Test-Path $Destination) {
      Write-Host "  - preserved: $Destination (reusing existing bundled OpenClaw)" -ForegroundColor DarkYellow
      return $true
    }
    Write-Host "  - skipped: $Destination (OpenClaw source not found)" -ForegroundColor DarkYellow
    return $false
  }
  if (Test-Path $Destination) {
    Remove-Item $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  foreach ($name in @(
    "openclaw.cmd",
    "openclaw.ps1",
    "openclaw",
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json"
  )) {
    $item = Join-Path $source $name
    if (Test-Path $item) {
      Copy-Item $item $Destination -Force
    }
  }
  $nodeModules = Join-Path $source "node_modules"
  if (Test-Path $nodeModules) {
    Copy-Item $nodeModules (Join-Path $Destination "node_modules") -Recurse -Force
  } else {
    Write-Host "  - skipped: $Destination (node_modules not found)" -ForegroundColor DarkYellow
    Remove-Item $Destination -Recurse -Force -ErrorAction SilentlyContinue
    return $false
  }
  Write-Host "  - bundled OpenClaw (whitelist): $source -> $Destination" -ForegroundColor Green
  return $true
}

$openclawPrefix = Resolve-OpenClawPrefix
$openclawPkgDir = if ($openclawPrefix) { Join-Path $openclawPrefix "node_modules\openclaw" } else { $null }
$stateDirs = Resolve-StateDirCandidates
$sharedStateDirs = Resolve-SharedStateDirCandidates

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Prepare Bundled Channel Assets" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

New-Item -ItemType Directory -Path $bundledExtensionsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $bundledNodeModulesRoot -Force | Out-Null

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  openclawPrefix = $openclawPrefix
  stateDirs = @($stateDirs)
  bundled = @()
}

$copied = @()
$openclawBundleCandidates = Resolve-OpenClawBundleCandidates
$qqSources = @(
  ($sharedStateDirs | ForEach-Object { Join-Path $_ "extensions\qqbot" })
)
$feishuSources = @()
$dingtalkSources = @(
  (Join-Path $root "src-tauri\vendor-extensions\openclaw-dingtalk"),
  (Join-Path $root "src-tauri\vendor-extensions\dingtalk"),
  ($sharedStateDirs | ForEach-Object { Join-Path $_ "extensions\openclaw-dingtalk" })
)
$discordSources = @()
$sdkSources = @()
$dingtalkRuntimeSources = @(
  (Join-Path $root "src-tauri\vendor-node-modules\.vendor-install\node_modules")
)
if ($openclawPkgDir) {
  $feishuSources += (Join-Path $openclawPkgDir "extensions\feishu")
  $discordSources += (Join-Path $openclawPkgDir "extensions\discord")
  $sdkSources += (Join-Path $openclawPkgDir "node_modules\@larksuiteoapi\node-sdk")
}
if ($openclawPrefix) {
  $sdkSources += (Join-Path $openclawPrefix "node_modules\@larksuiteoapi\node-sdk")
}

if (Copy-DirectoryIfFound -Candidates $qqSources -Destination (Join-Path $bundledExtensionsRoot "qqbot")) {
  $copied += "qqbot"
}

if (Copy-DirectoryIfFound -Candidates $feishuSources -Destination (Join-Path $bundledExtensionsRoot "feishu")) {
  $copied += "feishu"
}

if (Copy-DirectoryIfFound -Candidates $dingtalkSources -Destination (Join-Path $bundledExtensionsRoot "openclaw-dingtalk")) {
  $copied += "dingtalk"
}

if (Copy-DirectoryIfFound -Candidates $discordSources -Destination (Join-Path $bundledExtensionsRoot "discord")) {
  $copied += "discord"
}

if (Copy-DirectoryIfFound -Candidates $sdkSources -Destination (Join-Path $bundledNodeModulesRoot "@larksuiteoapi\node-sdk")) {
  $copied += "@larksuiteoapi/node-sdk"
}

$dingtalkRuntimeCopied = Copy-DirectoryContentsIfFound -Candidates $dingtalkRuntimeSources -Destination $bundledNodeModulesRoot
if ($dingtalkRuntimeCopied.Count -gt 0) {
  $copied += ($dingtalkRuntimeCopied | ForEach-Object { "runtime:$($_)" })
}

if (Copy-OpenClawPrefixIfFound -Candidates $openclawBundleCandidates -Destination $bundledOpenClawRoot) {
  $copied += "openclaw-runtime"
}

$manifest.bundled = $copied
$manifestPath = Join-Path $resourceRoot "bundled-manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host ""
Write-Host ("Bundled items: " + ($(if ($copied.Count -gt 0) { $copied -join ", " } else { "(none)" }))) -ForegroundColor Cyan
Write-Host ""
