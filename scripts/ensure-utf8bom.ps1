$utf8BOM = New-Object System.Text.UTF8Encoding $true
foreach ($f in @("OpenClaw_Shell.ps1", "OpenClaw_Shell_Bootstrap.ps1", "OpenClaw_Install_Only.ps1")) {
  $path = Join-Path $PSScriptRoot $f
  if (Test-Path $path) {
    $c = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($path, $c, $utf8BOM)
  }
}
Write-Host "UTF-8 BOM ensured"
