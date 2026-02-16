#Requires -Version 5.1
<#
.SYNOPSIS
    Sets up a Windows machine for Chrome Enterprise Premium Bot (cepbot).

.DESCRIPTION
    Installs Git, Node.js, Google Cloud CLI, and Gemini CLI, then authenticates
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

    # Remember where the user started so we can restore it when we're done.
    # Tool installers (winget, gcloud, etc.) can silently change $PWD —
    # without this the user may end up in C:\Windows\System32.
    $originalDir = Get-Location

    # When invoked via "irm … | iex", execution policy is bypassed for the
    # script text itself, but child .ps1 shims on disk (npm.ps1, gemini.ps1,
    # etc.) are still subject to the machine policy and will fail with
    # "UnauthorizedAccess". Relax the policy for this process only — this does
    # not persist after the terminal is closed and does not require admin.
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

    try {
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
        # Run a native command without letting its stderr become a
        # terminating error under $ErrorActionPreference = 'Stop'.
        #
        # 2>&1 merges stderr into the output pipeline, but PowerShell
        # wraps each stderr line as an ErrorRecord object.  When
        # stringified (e.g. via Out-String), ErrorRecords become
        # "python.exe : <message>" — polluting any variable that
        # captures the output.  We filter them out of the pipeline and
        # display them via Write-Host so callers only see clean stdout.
        param([scriptblock]$Command)
        $saved = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $Command 2>&1 | ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) {
                    Write-Host $_.Exception.Message
                } else {
                    $_
                }
            }
        }
        finally {
            $ErrorActionPreference = $saved
        }
    }

    function Read-HostSafe {
        param([string]$Prompt)
        try { return Read-Host -Prompt $Prompt }
        catch { return $null }
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

    # ------ 1. Git -----------------------------------------------------------

    Write-Step '1/8  Git'

    if (Test-Command 'git') {
        $gitVersion = Invoke-Native { git --version } | Out-String
        Write-Skip ($gitVersion.Trim())
    }
    else {
        Write-Host '   Installing Git...'
        Write-UacWarning
        Invoke-Native { winget install --id Git.Git --source winget --silent --accept-source-agreements --accept-package-agreements }
        if (-not (Assert-ExitCode 'Git install')) { return }
        Update-SessionPath
    }

    if (-not (Test-Command 'git')) {
        Write-Fail 'git is still not on PATH after install.'
        Write-Host '   Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
        return
    }
    Write-Ok 'git ready'

    # ------ 2. Node.js ------------------------------------------------------

    Write-Step '2/8  Node.js (>= 20)'

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

    # ------ 3. Google Cloud CLI ----------------------------------------------

    Write-Step '3/8  Google Cloud CLI'

    if (Test-Command 'gcloud') {
        $gcloudVer = Invoke-Native { gcloud version } | Select-Object -First 1
        Write-Skip "gcloud $gcloudVer"
    }
    else {
        Write-Host '   Installing Google Cloud CLI (this may take a few minutes)...'
        Invoke-Native { winget install --id Google.CloudSDK --source winget --silent --accept-source-agreements --accept-package-agreements }
        if (-not (Assert-ExitCode 'Google Cloud CLI install')) { return }
        Update-SessionPath
    }

    if (-not (Test-Command 'gcloud')) {
        # Update-SessionPath reads the registry, but the Google Cloud SDK
        # installer (especially in --silent mode via winget) may not have
        # written to the registry yet.  Check well-known install locations.
        $gcloudSearchPaths = @(
            "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin"
            "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin"
            "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin"
        )
        foreach ($p in $gcloudSearchPaths) {
            if (Test-Path (Join-Path $p 'gcloud.cmd')) {
                $env:Path = "$p;$env:Path"
                break
            }
        }
    }

    if (-not (Test-Command 'gcloud')) {
        Write-Fail 'gcloud is still not on PATH after install.'
        Write-Host '   Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
        return
    }
    Write-Ok 'gcloud CLI ready'

    # ------ 4. Gemini CLI ---------------------------------------------------

    Write-Step '4/8  Gemini CLI'

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

    # ------ 5. Authenticate --------------------------------------------------

    Write-Step '5/8  Google Cloud authentication'

    # --- 5a. gcloud CLI auth (needed for gcloud commands during setup) ---
    Write-Host '   Checking gcloud CLI auth...'
    $activeAccount = $null
    $authLines = Invoke-Native { gcloud auth list --filter=status:ACTIVE --format="value(account)" } | Out-String
    foreach ($line in $authLines -split '\r?\n') {
        $l = $line.Trim()
        if ($l -match '@') {
            $activeAccount = $l
            break
        }
    }

    if ($activeAccount) {
        Write-Ok "gcloud CLI authenticated as $activeAccount"
        $response = Read-HostSafe '   Re-authenticate gcloud CLI? (y/N)'
        if ($response -eq 'y' -or $response -eq 'Y') {
            Invoke-Native { gcloud auth login }
            if (-not (Assert-ExitCode 'gcloud CLI auth')) {
                Write-Host '   gcloud CLI auth was cancelled or failed. Re-run to try again.' -ForegroundColor Yellow
                return
            }
            Write-Ok 'gcloud CLI re-authenticated'
        }
    }
    else {
        Write-Host '   No active gcloud CLI account. A browser window will open for sign-in...'
        Invoke-Native { gcloud auth login }
        if (-not (Assert-ExitCode 'gcloud CLI auth')) {
            Write-Host '   gcloud CLI auth was cancelled or failed. Re-run to try again.' -ForegroundColor Yellow
            return
        }
        Write-Ok 'gcloud CLI authenticated'
    }

    # --- 5b. ADC auth (used by the MCP server at runtime) ---
    Write-Host '   Checking Application Default Credentials (ADC)...'

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
        Write-Host '   Note: ADC uses a separate OAuth client from gcloud CLI - a second browser prompt is expected.' -ForegroundColor DarkGray
        $response = Read-HostSafe '   Re-authenticate ADC? (y/N)'
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Skip 'ADC authentication'
            $shouldAuth = $false
        }
    }
    else {
        Write-Host '   A browser window will open for ADC sign-in...'
        Write-Host '   Note: this is a separate OAuth client from gcloud CLI - a second browser prompt is expected.' -ForegroundColor DarkGray
    }

    if ($shouldAuth) {
        Invoke-Native { gcloud auth application-default login --scopes=$scopes }
        if (-not (Assert-ExitCode 'ADC authentication')) {
            Write-Host '   ADC authentication was cancelled or failed. Re-run to try again.' -ForegroundColor Yellow
            return
        }
        Write-Ok 'ADC authenticated with required scopes'
    }

    # ------ 6. Quota project --------------------------------------------------

    Write-Step '6/8  GCP quota project'

    $adcFile = Join-Path (Join-Path $env:APPDATA 'gcloud') 'application_default_credentials.json'
    $projectId = $null

    # Helper: verify the ADC file contains the expected quota_project_id.
    function Test-AdcQuotaProject {
        param([string]$ExpectedId)
        if (-not (Test-Path $adcFile)) { return $false }
        try {
            $json = Get-Content $adcFile -Raw | ConvertFrom-Json
            return ($json.quota_project_id -eq $ExpectedId)
        }
        catch { return $false }
    }

    # Helper: directly patch quota_project_id into the ADC JSON file when
    # the gcloud CLI command fails.
    function Set-AdcQuotaProjectDirect {
        param([string]$Id)
        if (-not (Test-Path $adcFile)) { return $false }
        try {
            $json = Get-Content $adcFile -Raw | ConvertFrom-Json
            if ($null -eq (Get-Member -InputObject $json -Name 'quota_project_id' -MemberType NoteProperty)) {
                $json | Add-Member -NotePropertyName 'quota_project_id' -NotePropertyValue $Id
            }
            else {
                $json.quota_project_id = $Id
            }
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText($adcFile, ($json | ConvertTo-Json -Depth 10), $utf8NoBom)
            return $true
        }
        catch { return $false }
    }

    # Helper: persist project ID to both gcloud config and ADC file.
    function Set-ProjectEverywhere {
        param([string]$Id)
        $null = Invoke-Native { gcloud config set project $Id }
        $null = Invoke-Native { gcloud auth application-default set-quota-project $Id }
        if (-not (Test-AdcQuotaProject $Id)) {
            Write-Warn 'gcloud set-quota-project did not persist. Patching ADC file directly...'
            $null = Set-AdcQuotaProjectDirect $Id
        }
        if (Test-AdcQuotaProject $Id) {
            Write-Ok "Project set: $Id"
            return $true
        }
        else {
            Write-Warn "Could not persist project $Id to ADC file."
            return $false
        }
    }

    # --- 6a. Check for existing project ---
    if (Test-Path $adcFile) {
        try {
            $adcJson = Get-Content $adcFile -Raw | ConvertFrom-Json
            if ($adcJson.quota_project_id -match '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') {
                $projectId = $adcJson.quota_project_id
            }
        }
        catch { }
    }
    # Fall back to gcloud config project
    if (-not $projectId) {
        $projectLines = Invoke-Native { gcloud config get-value project } | Out-String
        foreach ($line in $projectLines -split '\r?\n') {
            $l = $line.Trim()
            if ($l -match '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') {
                $projectId = $l
                break
            }
        }
    }

    # --- 6b. Interactive project selection ---
    $needsSelection = $true

    if ($projectId) {
        Write-Host "   Current project: $projectId"
        $response = Read-HostSafe '   Use this project? (Y/n/list)'
        if (-not $response) { $response = '' }
        $response = $response.Trim().ToLower()
        if ($response -eq '' -or $response -eq 'y' -or $response -eq 'yes') {
            $null = Set-ProjectEverywhere $projectId
            $needsSelection = $false
        }
        elseif ($response -eq 'n' -or $response -eq 'no' -or $response -eq 'list' -or $response -eq 'l') {
            $needsSelection = $true
        }
        else {
            $null = Set-ProjectEverywhere $projectId
            $needsSelection = $false
        }
    }

    if ($needsSelection) {
        Write-Host '   Fetching your GCP projects...'
        $projectListRaw = Invoke-Native { gcloud projects list --format="value(projectId,name)" --sort-by=~createTime --limit=20 } | Out-String
        $projects = @()
        foreach ($line in $projectListRaw -split '\r?\n') {
            $l = $line.Trim()
            if ($l -eq '') { continue }
            $parts = $l -split '\t', 2
            $projId = $parts[0].Trim()
            $pname = if ($parts.Length -gt 1) { $parts[1].Trim() } else { '' }
            if ($projId -match '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') {
                $projects += [PSCustomObject]@{ Id = $projId; Name = $pname }
            }
        }

        if ($projects.Count -eq 0) {
            Write-Warn 'No existing projects found. Creating a new one...'
            $response = 'c'
        }
        else {
            Write-Host ''
            Write-Host '   Your GCP projects:' -ForegroundColor White
            for ($i = 0; $i -lt $projects.Count; $i++) {
                $p = $projects[$i]
                $display = "   [$($i + 1)] $($p.Id)"
                if ($p.Name -and $p.Name -ne $p.Id) {
                    $display += "  ($($p.Name))"
                }
                Write-Host $display
            }
            Write-Host ''
            Write-Host '   [E] Enter a project ID manually' -ForegroundColor DarkGray
            Write-Host '   [C] Create a new project' -ForegroundColor DarkGray
            Write-Host ''
            $response = Read-HostSafe "   Select (1-$($projects.Count), E, or C)"
            if (-not $response) { $response = '' }
            $response = $response.Trim()
        }

        if ($response -eq 'e' -or $response -eq 'E') {
            $customId = Read-HostSafe '   Enter project ID'
            if (-not $customId) { $customId = '' }
            $customId = $customId.Trim()
            if ($customId -match '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') {
                $projectId = $customId
            }
            else {
                Write-Fail "Invalid project ID format: $customId"
                Write-Host '   Project IDs must be 6-30 chars: lowercase letters, digits, hyphens.' -ForegroundColor Yellow
                return
            }
        }
        elseif ($response -eq 'c' -or $response -eq 'C') {
            # --- 6c. Create new project ---
            $consonants = 'bcdfghjklmnpqrstvwxyz'
            $vowels = 'aeiou'
            $rng = [System.Random]::new()
            $cvc1 = "$($consonants[$rng.Next($consonants.Length)])$($vowels[$rng.Next($vowels.Length)])$($consonants[$rng.Next($consonants.Length)])"
            $cvc2 = "$($consonants[$rng.Next($consonants.Length)])$($vowels[$rng.Next($vowels.Length)])$($consonants[$rng.Next($consonants.Length)])"
            $newProjectId = "mcp-$cvc1-$cvc2"

            Write-Host "   Creating project $newProjectId..."
            $null = Invoke-Native { gcloud projects create $newProjectId }
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Could not create project $newProjectId."
                return
            }
            $projectId = $newProjectId
            Write-Ok "Created project: $newProjectId"
        }
        else {
            $num = 0
            if ([int]::TryParse($response, [ref]$num) -and $num -ge 1 -and $num -le $projects.Count) {
                $projectId = $projects[$num - 1].Id
            }
            else {
                Write-Fail "Invalid selection: $response"
                return
            }
        }

        # --- 6d. Persist project ---
        $null = Set-ProjectEverywhere $projectId
    }

    $quotaProjectSet = Test-AdcQuotaProject $projectId
    if (-not $quotaProjectSet) {
        Write-Warn 'Could not set quota project. The agent will attempt to resolve this on first use.'
    }

    # --- 6e. Enable required APIs ---
    if ($projectId) {
        $requiredApis = @(
            'serviceusage.googleapis.com'
            'admin.googleapis.com'
            'chromemanagement.googleapis.com'
            'cloudidentity.googleapis.com'
        )
        Write-Host "   Enabling required APIs on $projectId..."
        $allApisOk = $true
        foreach ($api in $requiredApis) {
            $null = Invoke-Native { gcloud services enable $api --project $projectId }
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "   Could not enable $api (the agent will retry at runtime)."
                $allApisOk = $false
            }
        }
        if ($allApisOk) {
            Write-Ok 'All required APIs enabled.'
        }
    }

    # ------ 7. Gemini CLI configuration ----------------------------------------

    Write-Step '7/8  Gemini CLI configuration'

    $geminiDir = Join-Path $env:USERPROFILE '.gemini'
    $geminiSettings = Join-Path $geminiDir 'settings.json'
    $needsGeminiAuth = $true

    if (Test-Path $geminiSettings) {
        # Strip UTF-8 BOM if present — a previous run may have written one via
        # Set-Content -Encoding UTF8 (PowerShell 5.1), which the Gemini CLI's
        # JSON parser cannot handle.
        $rawBytes = [System.IO.File]::ReadAllBytes($geminiSettings)
        if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            $text = $utf8NoBom.GetString($rawBytes, 3, $rawBytes.Length - 3)
            [System.IO.File]::WriteAllText($geminiSettings, $text, $utf8NoBom)
        }

        try {
            $authType = (Get-Content $geminiSettings -Raw | ConvertFrom-Json).security.auth.selectedType
            if ($authType) {
                Write-Skip "Gemini CLI auth ($authType)"
                $needsGeminiAuth = $false
            }
        }
        catch {}
    }

    if ($needsGeminiAuth) {
        if (-not (Test-Path $geminiDir)) {
            New-Item -ItemType Directory -Path $geminiDir -Force | Out-Null
        }
        # Use .NET directly — PowerShell 5.1's -Encoding UTF8 emits a BOM
        # which breaks the Gemini CLI JSON parser.
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText(
            $geminiSettings,
            '{ "security": { "auth": { "selectedType": "oauth-personal" } } }',
            $utf8NoBom
        )
        Write-Ok 'Configured Gemini CLI to use Google login'
    }

    # ------ 8. Install extension ----------------------------------------------

    Write-Step '8/8  Install cepbot Gemini extension'

    # Uninstall first if already present — reinstalling over an existing
    # extension crashes the Gemini CLI with a libuv assertion failure.
    $null = Invoke-Native { gemini extensions uninstall chrome-enterprise-premium }
    # Ignore exit code — uninstall fails harmlessly if not installed.

    Write-Host '   Registering extension...'
    Invoke-Native { gemini extensions install https://github.com/timfee/cepbot }
    $installExitCode = $LASTEXITCODE

    if ($installExitCode -eq 0) {
        # Success on first try
    }
    elseif ($installExitCode -eq 41) {
        # Exit code 41 = FatalAuthenticationError.  The CLI validated its
        # global auth state before processing the subcommand.  Launch gemini
        # interactively so the user can complete browser sign-in, then retry.
        Write-Warn 'Extension install needs Gemini CLI authentication first.'
        Write-Host ''
        Write-Host '   Launching Gemini CLI for first-time sign-in.' -ForegroundColor Yellow
        Write-Host '   A browser window will open — complete the sign-in there.' -ForegroundColor Yellow
        Write-Host '   Once authenticated, type /quit to return to setup.' -ForegroundColor Yellow
        Write-Host ''
        # Avoid Invoke-Native here — its 2>&1 redirect can interfere with
        # interactive terminal programs.
        try {
            $ErrorActionPreference = 'SilentlyContinue'
            & gemini
        }
        finally {
            $ErrorActionPreference = 'Stop'
        }
        Write-Host ''
        Write-Host '   Retrying extension install...'
        Invoke-Native { gemini extensions install https://github.com/timfee/cepbot }
        if (-not (Assert-ExitCode 'Extension install')) { return }
    }
    else {
        Write-Fail "Extension install failed (exit code $installExitCode). Check your network connection and try again."
        return
    }
    Write-Ok 'cepbot extension installed'

    # ------ done --------------------------------------------------------------

    Write-Host ''
    Write-Host '  Setup complete!' -ForegroundColor Green
    Write-Host '  Run "gemini" to start using the Chrome Enterprise Premium Bot.' -ForegroundColor White
    Write-Host ''

    } # end try
    finally {
        # Always land in the user's home directory.  When invoked via
        # 'irm … | iex' from an elevated prompt, $originalDir is typically
        # C:\WINDOWS\system32 — not a useful working directory for Gemini CLI.
        Set-Location -Path $HOME
    }
}

# Run the setup, then clean up the function from the caller's scope.
Invoke-CepbotSetup
Remove-Item -Path Function:\Invoke-CepbotSetup -ErrorAction SilentlyContinue
