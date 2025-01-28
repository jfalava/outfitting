# -------------------------------
# Paths
# -------------------------------
$pathList = @(
    "C:\Program Files\Go\bin",
    "$env:LOCALAPPDATA\Programs\oh-my-posh\bin",
    "$env:USERPROFILE\scoop\apps"
)
foreach ($path in $pathList) {
    if ($env:PATH -notlike "*$path*") {
        $env:PATH += ";$path"
    }
}

# -------------------------------
# Modules
# -------------------------------
Import-Module posh-git
Import-Module PSReadLine

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
Import-Module posh-git
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

# -------------------------------
# Final Setup
# -------------------------------
Clear-Host
