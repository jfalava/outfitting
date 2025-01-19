# -------------------------------
# Paths
# -------------------------------
$pathList = @(
    "C:\Program Files\Go\bin",
    "C:\Users\jfalava\AppData\Local\Programs\oh-my-posh\bin",
    "C:\Users\jfalava\scoop\apps",
    "F:\Dev\bin"
)
foreach ($path in $pathList) {
    if ($env:PATH -notlike "*$path*") {
        $env:PATH += ";$path"
    }
}

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
