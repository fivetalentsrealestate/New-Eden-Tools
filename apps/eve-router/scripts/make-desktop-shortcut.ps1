# Creates an "EVE Router" icon on your Desktop that launches this project directly,
# without building an installer. Run from VS Code's terminal:  npm run shortcut
$ErrorActionPreference = 'Stop'

$project  = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $project 'node_modules\electron\dist\electron.exe'
$icon     = Join-Path $project 'build\icon.ico'

if (-not (Test-Path $electron)) {
  Write-Host "Electron isn't installed yet. Run 'npm install' first." -ForegroundColor Yellow
  exit 1
}

$desktop  = [Environment]::GetFolderPath('Desktop')   # works with OneDrive-redirected desktops too
$lnkPath  = Join-Path $desktop 'EVE Router.lnk'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = $electron
$lnk.Arguments        = "`"$project`""
$lnk.WorkingDirectory = $project
$lnk.IconLocation     = "$icon,0"
$lnk.Description      = 'EVE Router - New Eden map and jump planner'
$lnk.Save()

Write-Host "Desktop shortcut created: $lnkPath" -ForegroundColor Green
