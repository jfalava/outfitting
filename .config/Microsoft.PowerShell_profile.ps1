# -------------------------------
# Paths
# -------------------------------
$pathList = @(
    "C:\Program Files\Go\bin",
    "$env:LOCALAPPDATA\Programs\oh-my-posh\bin",
    "$env:USERPROFILE\scoop\apps",
)

# -------------------------------
# Aliases and Functions
# -------------------------------
function ezals {
    eza --color=always --long --git --no-filesize --icons=always
}
Set-Alias l ezals

function whichwin {
    param (
        [string]$name
    )
    Get-Command $name | Select-Object -ExpandProperty Definition
}
Set-Alias which whichwin

# -------------------------------
# Modules
# -------------------------------
Import-Module posh-git
oh-my-posh init pwsh --config 'https://raw.githubusercontent.com/JanDeDobbeleer/oh-my-posh/main/themes/wopian.omp.json' | Invoke-Expression
Invoke-Expression (& { (zoxide init powershell | Out-String) })

# PowerToys CommandNotFound Module
Import-Module -Name Microsoft.WinGet.CommandNotFound

# -------------------------------
# Final Setup
# -------------------------------
Clear-Host
