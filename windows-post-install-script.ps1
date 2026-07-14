# Post install script for Windows
## This requires a shell reload

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Scoop
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Reload shell

. $PROFILE

# Fonts

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    winget install --id Cloudflare.cloudflared -e
}

$fontTemp = Join-Path $env:TEMP "fonts.tar.gz"

Write-Host "❖ Authenticating to fetch licensed fonts... " -ForegroundColor Cyan
cloudflared access login https://win.jfa.dev/fonts
cloudflared access curl https://win.jfa.dev/fonts -o $fontTemp

$fontDest = Join-Path $env:TEMP "fonts-extracted"
New-Item -ItemType Directory -Force -Path $fontDest | Out-Null
tar -xzf $fontTemp -C $fontDest

Get-ChildItem $fontDest -Filter *.ttf,*.otf -Recurse | ForEach-Object {
    $shell = New-Object -ComObject Shell.Application
    $fontsFolder = $shell.Namespace(0x14)
    $fontsFolder.CopyHere($_.FullName)
}
Write-Host "`n❖ Installation complete." -ForegroundColor Green
