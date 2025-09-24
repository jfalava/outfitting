# -------------------------------
# Paths
# -------------------------------
$pathList = @(
    "C:\Program Files\Go\bin",
    "$env:LOCALAPPDATA\Programs\oh-my-posh\bin",
    "$env:USERPROFILE\scoop\apps",
    "$env:LOCALAPPDATA\pnpm\",
    "$env:USERPROFILE\.local\share\",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\"
)
foreach ($path in $pathList) {
    if ($env:PATH -notlike "*$path*") {
        $env:PATH += ";$path"
    }
}

# PNPM_HOME
$env:PNPM_HOME = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\"

# -------------------------------
# Modules
# -------------------------------
Import-Module PSReadLine
Import-Module posh-git

# -------------------------------
# History Configuration
# -------------------------------
$MaximumHistoryCount = 10000

if (Get-Module -ListAvailable -Name PSReadLine) {
    $HistoryFilePath = Join-Path $env:USERPROFILE 'powershell_history'
    Set-PSReadLineOption -HistorySavePath $HistoryFilePath -HistorySaveStyle SaveIncrementally
} else {
    $HistoryFilePath = "$env:USERPROFILE\powershell_history"

    Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
        Get-History -Count $MaximumHistoryCount | Export-Clixml -Path $HistoryFilePath
    } | Out-Null

    if (Test-Path $HistoryFilePath) {
        $loadedHistory = Import-Clixml -Path $HistoryFilePath
        $loadedHistory | ForEach-Object { Add-History -CommandLine $_.CommandLine }
    }
}

# -------------------------------
# Aliases and Functions
# -------------------------------
function ezals {
    eza --color=always --long --git --bytes --icons=always
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
# Expressions
# -------------------------------
oh-my-posh init pwsh --config 'https://raw.githubusercontent.com/JanDeDobbeleer/oh-my-posh/main/themes/wopian.omp.json' | Invoke-Expression
Invoke-Expression (& { (zoxide init powershell | Out-String) })

# -------------------------------
# Profile Sync
# -------------------------------
$slaveProfiles = @(
    "$env:USERPROFILE\Documents\PowerShell\Microsoft.VSCode_profile.ps1",
    "$env:USERPROFILE\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1"
)

$masterProfilePath = $PROFILE.CurrentUserAllHosts

if ($masterProfilePath -eq "$env:USERPROFILE\Documents\PowerShell\Microsoft.PowerShell_profile.ps1") { ## this one is the master
    foreach ($slaveProfile in $slaveProfiles) {
        if (Test-Path $slaveProfile) {
            $masterContent = Get-Content -Path $masterProfilePath -Raw
            $slaveContent = Get-Content -Path $slaveProfile -Raw

            if ($masterContent -ne $slaveContent) {
                Copy-Item -Path $masterProfilePath -Destination $slaveProfile -Force
            }
        } else {
            Copy-Item -Path $masterProfilePath -Destination $slaveProfile -Force
        }
    }
}
