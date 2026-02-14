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
    .\setup.ps1

.NOTES
    Requires Windows 10 1709+ or Windows 11 (for winget).
    Run from a regular PowerShell prompt — the script will elevate if needed.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------- helpers ----------------------------------------------------------

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

function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

# ---------- pre-flight -------------------------------------------------------

Write-Host ''
Write-Host '  Chrome Enterprise Premium Bot - Windows Setup' -ForegroundColor White
Write-Host '  ==============================================' -ForegroundColor DarkGray
Write-Host ''

# Verify winget is available
if (-not (Test-Command 'winget')) {
    Write-Host 'ERROR: winget is not available.' -ForegroundColor Red
    Write-Host 'Install "App Installer" from the Microsoft Store, then re-run this script.' -ForegroundColor Red
    Write-Host 'https://aka.ms/getwinget' -ForegroundColor Yellow
    exit 1
}

# ---------- 1. Node.js -------------------------------------------------------

Write-Step '1/5  Node.js (>= 20)'

if (Test-Command 'node') {
    $nodeVersion = (node --version) -replace '^v', ''
    $nodeMajor = [int]($nodeVersion -split '\.')[0]
    if ($nodeMajor -ge 20) {
        Write-Skip "node $nodeVersion"
    }
    else {
        Write-Warn "Found node $nodeVersion — upgrading to latest LTS..."
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        Refresh-Path
    }
}
else {
    Write-Host '   Installing Node.js LTS...'
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Refresh-Path
}

# Verify
if (-not (Test-Command 'node')) {
    Write-Host 'ERROR: node is still not on PATH after install.' -ForegroundColor Red
    Write-Host 'Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
    exit 1
}
Write-Ok "node $(node --version)"

# ---------- 2. Google Cloud CLI -----------------------------------------------

Write-Step '2/5  Google Cloud CLI'

if (Test-Command 'gcloud') {
    Write-Skip "gcloud $(gcloud --version 2>&1 | Select-Object -First 1)"
}
else {
    Write-Host '   Installing Google Cloud CLI...'
    winget install --id Google.CloudSDK --accept-source-agreements --accept-package-agreements
    Refresh-Path
}

if (-not (Test-Command 'gcloud')) {
    Write-Host 'ERROR: gcloud is still not on PATH after install.' -ForegroundColor Red
    Write-Host 'Close this terminal, open a new one, and re-run the script.' -ForegroundColor Yellow
    exit 1
}
Write-Ok 'gcloud CLI ready'

# ---------- 3. Gemini CLI ----------------------------------------------------

Write-Step '3/5  Gemini CLI'

# Check if the gemini command exists, or if the package is globally installed
$geminiInstalled = (Test-Command 'gemini') -or
    ((npm list -g @google/gemini-cli 2>&1) -match '@google/gemini-cli')

if ($geminiInstalled) {
    Write-Skip 'gemini'
}
else {
    Write-Host '   Installing Gemini CLI globally...'
    npm install -g @google/gemini-cli
}
Write-Ok 'gemini CLI ready'

# ---------- 4. Authenticate ---------------------------------------------------

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

$adcPath = Join-Path $env:APPDATA 'gcloud' 'application_default_credentials.json'

if (Test-Path $adcPath) {
    Write-Warn 'ADC credentials file already exists.'
    $response = Read-Host '   Re-authenticate? (y/N)'
    if ($response -ne 'y') {
        Write-Skip 'authentication'
    }
    else {
        gcloud auth application-default login --scopes=$scopes
        Write-Ok 'Authenticated with required scopes'
    }
}
else {
    Write-Host '   A browser window will open for Google sign-in...'
    gcloud auth application-default login --scopes=$scopes
    Write-Ok 'Authenticated with required scopes'
}

# ---------- 5. Install extension ----------------------------------------------

Write-Step '5/5  Install cepbot Gemini extension'

Write-Host '   Registering extension...'
gemini extensions install https://github.com/timfee/cepbot
Write-Ok 'cepbot extension installed'

# ---------- done --------------------------------------------------------------

Write-Host ''
Write-Host '  Setup complete!' -ForegroundColor Green
Write-Host '  Run "gemini" to start using the Chrome Enterprise Premium Bot.' -ForegroundColor White
Write-Host ''
