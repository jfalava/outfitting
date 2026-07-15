# -------------------------------
# Paths
# -------------------------------
$pathList = @(
    "C:\bin"
    "C:\Program Files\Go\bin",
    "$env:USERPROFILE\scoop",
    "$env:LOCALAPPDATA\pnpm\",
    "$env:USERPROFILE\.bun\bin",
    "$env:USERPROFILE\.local\share\",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
)
foreach ($path in $pathList) {
    if ($env:PATH -notlike "*$path*") {
        $env:PATH += ";$path"
    }
}

# -------------------------------
# ENV
# -------------------------------
$env:BUN_INSTALL = "$env:USERPROFILE\.bun"
$env:PNPM_HOME = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\"

# -------------------------------
# History Configuration
# -------------------------------
# PSReadLine owns persistent history. Do not reuse its text history file for
# another format: older versions of this profile wrote CLIXML to the same path,
# which PSReadLine then displayed as corrupted commands.
if (Get-Module -ListAvailable -Name PSReadLine) {
    Import-Module PSReadLine -ErrorAction Stop
    Set-PSReadLineOption -HistorySaveStyle SaveIncrementally -MaximumHistoryCount 10000
}

# -------------------------------
# Aliases and Functions
# -------------------------------
function ezals {
  eza --color=always --long --git --bytes --icons=always
}
Set-Alias l ezals

function reloadprofile {
  . $PROFILE
}
Set-Alias reload reloadprofile

function whichwin {
    param (
        [string]$name
    )
    Get-Command $name | Select-Object -ExpandProperty Definition
}
Set-Alias which whichwin

function killwsl {
  wsl --shutdown
}
Set-Alias wslk killwsl

# -------------------------------
# Expressions
# -------------------------------
if (Get-Command starship -ErrorAction SilentlyContinue) {
    $starshipInit = & starship init powershell
    if ($starshipInit) {
        Invoke-Expression $starshipInit
    }
}

if (Get-Command tirith -ErrorAction SilentlyContinue) {
    $tirithInit = tirith init | Out-String
    if ($tirithInit) {
        Invoke-Expression $tirithInit
    }
}

if (Get-Command zoxide -ErrorAction SilentlyContinue) {
    $zoxideInit = zoxide init powershell | Out-String
    if ($zoxideInit) {
        Invoke-Expression $zoxideInit
    }
}

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
