#Requires -Version 5.1
<#
.SYNOPSIS
    Sets up a Windows machine for Chrome Enterprise Premium Bot (cepbot).

.DESCRIPTION
    Installs Node.js, Google Cloud CLI, and Gemini CLI, then authenticates
    with the required OAuth scopes and installs the cepbot Gemini extension.

    Skips any tool that is already installed and on PATH.

.EXAMPLE
    irm https://raw.githubusercontent.com/timfee/cepbot/main/setup.ps1 | iex

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File setup.ps1

.NOTES
    Requires Windows 10 1709+ or Windows 11 (for winget).
    If running the .ps1 file directly, you may need to allow script execution:
      Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#>

# Wrap in a function so Set-StrictMode, $ErrorActionPreference, and early
# returns do not leak into the caller's session (important for irm | iex).
function Invoke-CepbotSetup {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'

    # When invoked via "irm … | iex", execution policy is bypassed for the
    # script text itself, but child .ps1 shims on disk (npm.ps1, gemini.ps1,
    # etc.) are still subject to the machine policy and will fail with
    # "UnauthorizedAccess". Relax the policy for this process only — this does
    # not persist after the terminal is closed and does not require admin.
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

    # ------ helpers ----------------------------------------------------------

    function Write-Step {
        param([string]$Message)
        Write-Host "`n>> $Message" -ForegroundColor Cyan
    }

    function Write-Ok {
        param([string]$Message)
        Write-Host "   $Message" -ForegroundColor Green
    }

    function Write-Skip {
        param([string]$Message)
        Write-Host "   $Message (already installed)" -ForegroundColor DarkGray
    }

    function Write-Warn {
        param([string]$Message)
        Write-Host "   $Message" -ForegroundColor Yellow
    }

    function Write-Fail {
        param([string]$Message)
        Write-Host "   ERROR: $Message" -ForegroundColor Red
    }

    function Test-Command {
        param([string]$Name)
        $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
    }

    function Assert-ExitCode {
        param([string]$Step)
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "$Step failed (exit code $LASTEXITCODE)."
            return $false
        }
        return $true
    }

    function Invoke-Native {
        # Run a native command (exe / cmd / ps1 shim) without letting its
        # stderr output become a terminating error under $ErrorActionPreference
        # = 'Stop'.  Stderr is merged into stdout so it displays as normal
        # text instead of scary red.  $LASTEXITCODE is preserved for the
        # caller's Assert-ExitCode check.
        param([scriptblock]$Command)
        $saved = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $Command 2>&1
        }
        finally {
            $ErrorActionPreference = $saved
        }
    }

    function Update-SessionPath {
        # Merge newly-registered PATH entries into the current session
        # without discarding session-only paths (e.g. from conda, nvm).
        $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $userPath    = [Environment]::GetEnvironmentVariable('Path', 'User')
        $currentDirs = $env:Path -split ';' | Where-Object { $_ -ne '' }
        $registryDirs = "$machinePath;$userPath" -split ';' | Where-Object { $_ -ne '' }
        $newDirs = $registryDirs | Where-Object { $_ -notin $currentDirs }
        if ($newDirs) {
            $env:Path = ($currentDirs + $newDirs) -join ';'
        }
    }

    function Write-UacWarning {
        Write-Host ''
        Write-Host '   ** A UAC (admin) prompt may appear BEHIND this window. **' -ForegroundColor Yellow
        Write-Host '   ** Check your taskbar if the install seems to hang.     **' -ForegroundColor Yellow
        Write-Host ''

        try {
            $null = Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool FlashWindow(IntPtr hwnd, bool bInvert);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
'@ -Name 'WinAPI' -Namespace 'UacFlash' -PassThru -ErrorAction SilentlyContinue
            $hwnd = [UacFlash.WinAPI]::GetConsoleWindow()
            if ($hwnd -ne [IntPtr]::Zero) {
                [void][UacFlash.WinAPI]::FlashWindow($hwnd, $true)
            }
        }
        catch {}
    }

    # ------ pre-flight -------------------------------------------------------

    Write-Host ''
    Write-Host '  Chrome Enterprise Premium Bot - Windows Setup' -ForegroundColor White
    Write-Host '  ==============================================' -ForegroundColor DarkGray
    Write-Host ''

    # Verify winget is available
    if (-not (Test-Command 'winget')) {
        Write-Fail 'winget is not available.'
        Write-Host '   Install "App Installer" from the Microsoft Store, then re-run this script.' -ForegroundColor Red
        Write-Host '   https://aka.ms/getwinget' -ForegroundColor Yellow
        return
    }

    # ------ 1. Node.js -------------------------------------------------------

    Write-Step '1/5  Node.js (>= 20)'

    if (Test-Command 'node') {
        $nodeVersion = (node --version) -replace '^v', ''
        $nodeMajor = [int]($nodeVersion -split '\.')[0]
        if ($nodeMajor -ge 20) {
            Write-Skip "node $nodeVersion"
        }
        else {
            Write-Warn "Found node $nodeVersion - upgrading to latest LTS..."
            Write-UacWarning
            Invoke-Native { winget install --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements }
            if (-not (Assert-ExitCode 'Node.js install')) { return }
            Update-SessionPath
        }
    }
    else {
        Write-Host '   Installing Node.js LTS...'
        Write-UacWarning
        Invoke-Native { winget install --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements }
        if (-not (Assert-ExitCode 'Node.js install')) { return }
        Update-SessionPath
    }

    if (-not (Test-Command 'node')) {
        Write-Fail 'node is still not on PATH after install.'
        Write-Host '   Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
        return
    }
    if (-not (Test-Command 'npm')) {
        Write-Fail 'npm is not on PATH. The Node.js installation may be incomplete.'
        Write-Host '   Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
        return
    }

    # Re-check version after any install/upgrade
    $nodeVersion = (node --version) -replace '^v', ''
    $nodeMajor = [int]($nodeVersion -split '\.')[0]
    if ($nodeMajor -lt 20) {
        Write-Fail "node $nodeVersion is on PATH but >= 20 is required. Remove the old version or adjust PATH."
        return
    }
    Write-Ok "node $nodeVersion"

    # Ensure npm's global prefix directory exists. On a fresh Node.js install
    # the %APPDATA%\npm folder is not created until the first global install,
    # but npm itself will ENOENT if the directory is missing.
    $npmGlobalDir = Join-Path $env:APPDATA 'npm'
    if (-not (Test-Path $npmGlobalDir)) {
        New-Item -ItemType Directory -Path $npmGlobalDir -Force | Out-Null
    }

    # ------ 2. Google Cloud CLI -----------------------------------------------

    Write-Step '2/5  Google Cloud CLI'

    if (Test-Command 'gcloud') {
        $gcloudVer = Invoke-Native { gcloud version } | Select-Object -First 1
        Write-Skip "gcloud $gcloudVer"
    }
    else {
        Write-Host '   Installing Google Cloud CLI...'
        Invoke-Native { winget install --id Google.CloudSDK --source winget --silent --accept-source-agreements --accept-package-agreements }
        if (-not (Assert-ExitCode 'Google Cloud CLI install')) { return }
        Update-SessionPath
    }

    if (-not (Test-Command 'gcloud')) {
        Write-Fail 'gcloud is still not on PATH after install.'
        Write-Host '   Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
        return
    }
    Write-Ok 'gcloud CLI ready'

    # ------ 3. Gemini CLI ----------------------------------------------------

    Write-Step '3/5  Gemini CLI'

    $geminiInstalled = Test-Command 'gemini'
    if (-not $geminiInstalled -and (Test-Command 'npm')) {
        $npmOutput = Invoke-Native { npm list -g @google/gemini-cli } | Out-String
        $geminiInstalled = $npmOutput -match '@google/gemini-cli'
    }

    if ($geminiInstalled) {
        Write-Skip 'gemini'
    }
    else {
        Write-Host '   Installing Gemini CLI globally...'
        Invoke-Native { npm install -g @google/gemini-cli }
        if (-not (Assert-ExitCode 'Gemini CLI install')) { return }
    }

    if (-not (Test-Command 'gemini')) {
        # npm global bin may not be on PATH yet
        Update-SessionPath
    }
    if (-not (Test-Command 'gemini')) {
        Write-Fail 'gemini is not on PATH. Check that the npm global bin directory is in your PATH.'
        Write-Host '   Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
        return
    }
    Write-Ok 'gemini CLI ready'

    # ------ 4. Authenticate ---------------------------------------------------

    Write-Step '4/5  Google Cloud authentication'

    $scopes = @(
        'https://www.googleapis.com/auth/admin.directory.customer.readonly'
        'https://www.googleapis.com/auth/admin.directory.orgunit.readonly'
        'https://www.googleapis.com/auth/admin.reports.audit.readonly'
        'https://www.googleapis.com/auth/chrome.management.policy'
        'https://www.googleapis.com/auth/chrome.management.profiles.readonly'
        'https://www.googleapis.com/auth/chrome.management.reports.readonly'
        'https://www.googleapis.com/auth/cloud-identity.policies'
        'https://www.googleapis.com/auth/cloud-platform'
    ) -join ','

    $adcPath = Join-Path (Join-Path $env:APPDATA 'gcloud') 'application_default_credentials.json'

    $shouldAuth = $true
    if (Test-Path $adcPath) {
        Write-Warn 'ADC credentials file already exists.'
        $response = Read-Host '   Re-authenticate? (y/N)'
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Skip 'authentication'
            $shouldAuth = $false
        }
    }
    else {
        Write-Host '   A browser window will open for Google sign-in...'
    }

    if ($shouldAuth) {
        Invoke-Native { gcloud auth application-default login --scopes=$scopes }
        if (-not (Assert-ExitCode 'Authentication')) {
            Write-Host '   Authentication was cancelled or failed. Re-run to try again.' -ForegroundColor Yellow
            return
        }
        Write-Ok 'Authenticated with required scopes'
    }

    # ------ 5. Install extension ----------------------------------------------

    Write-Step '5/5  Install cepbot Gemini extension'

    Write-Host '   Registering extension...'
    Invoke-Native { gemini extensions install https://github.com/timfee/cepbot }
    if (-not (Assert-ExitCode 'Extension install')) { return }
    Write-Ok 'cepbot extension installed'

    # ------ done --------------------------------------------------------------

    Write-Host ''
    Write-Host '  Setup complete!' -ForegroundColor Green
    Write-Host '  Run "gemini" to start using the Chrome Enterprise Premium Bot.' -ForegroundColor White
    Write-Host ''
}

# Run the setup, then clean up the function from the caller's scope.
Invoke-CepbotSetup
Remove-Item -Path Function:\Invoke-CepbotSetup -ErrorAction SilentlyContinue
