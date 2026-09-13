#############################################
####################################### Paths
#############################################
$pathList = @(
    "C:\bin"
    "C:\Program Files\Go\bin",
    "$env:USERPROFILE\.amp\bin"
    "$env:USERPROFILE\scoop",
    "$env:LOCALAPPDATA\pnpm\",
    "$env:USERPROFILE\.bun\bin",
    "$env:USERPROFILE\.local\share\",
    "$env:USERPROFILE\.local\bin\",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
)
foreach ($path in $pathList) {
    if ($env:PATH -notlike "*$path*") {
        $env:PATH += ";$path"
    }
}

$env:BUN_INSTALL = "$env:USERPROFILE\.bun"
$env:PNPM_HOME = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\"

#############################################
############################### Shell History
#############################################
if (Get-Module -ListAvailable -Name PSReadLine) {
    Import-Module PSReadLine -ErrorAction Stop
    Set-PSReadLineOption -HistorySaveStyle SaveIncrementally -MaximumHistoryCount 10000

    if ($env:SECRETS -eq "0") {
        # Session opt-out: save nothing and disable history-based prediction so
        # autocomplete cannot reveal anything (old or new).
        Set-PSReadLineOption -HistorySaveStyle SaveNothing -PredictionSource None
    }

    # Never save lines that look like they contain secrets, or that were
    # deliberately hidden with a leading space (like zsh's ignoreSpace). The
    # command stays in the current session but is not written to the
    # HistorySavePath file.
    $secretHistoryPattern = '(?i)([A-Za-z0-9_]*(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)[A-Za-z0-9_]*\s*[=:]|(--(token|password|passwd|secret|secret[-_]access[-_]key|client[-_]secret|api[_-]?key|access[_-]?token|passphrase)(=|\s))|authorization\s*:)'
    Set-PSReadLineOption -AddToHistoryHandler {
        param([string]$line)
        if ($env:SECRETS -eq "0") { return $false }
        if ($line -match '^\s' -or $line -match $secretHistoryPattern) { return $false }
        return $true
    }
}

#############################################
##################################### Aliases
#############################################
# Short alias for the installed outfitting-manager executable.
Set-Alias outfit outfitting-manager

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

function Set-Chmod {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory, Position = 0)]
        [ValidateSet(400, 600)]
        [int]$Mode,

        [Parameter(Mandatory, Position = 1, ValueFromRemainingArguments = $true)]
        [string[]]$Path
    )

    if (-not (Get-Command icacls -CommandType Application -ErrorAction SilentlyContinue)) {
        throw "icacls is not available in PATH."
    }

    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $permission = if ($Mode -eq 400) { "R" } else { "RW" }
    $grant = "{0}:{1}" -f $identity, $permission

    foreach ($inputPath in $Path) {
        foreach ($resolvedPath in @(Resolve-Path -LiteralPath $inputPath -ErrorAction Stop)) {
            $target = $resolvedPath.Path
            if (-not $PSCmdlet.ShouldProcess($target, "Set ACL to chmod $Mode for $identity")) {
                continue
            }

            # Reset to inherited ACLs, remove those inherited entries, then add only the user grant.
            & icacls $target /reset /q
            if ($LASTEXITCODE -ne 0) {
                throw "icacls /reset failed for '$target' (exit code $LASTEXITCODE)."
            }

            & icacls $target /inheritance:r /q
            if ($LASTEXITCODE -ne 0) {
                throw "icacls /inheritance:r failed for '$target' (exit code $LASTEXITCODE)."
            }

            & icacls $target /grant:r $grant /q
            if ($LASTEXITCODE -ne 0) {
                throw "icacls /grant:r failed for '$target' (exit code $LASTEXITCODE)."
            }
        }
    }
}
Set-Alias chmod Set-Chmod

#############################################
################################# Expressions
#############################################

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
