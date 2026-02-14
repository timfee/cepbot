#!/usr/bin/env bash
#
# Chrome Enterprise Premium Bot — macOS / Linux Setup
#
# Installs Node.js, Google Cloud CLI, and Gemini CLI, then authenticates
# with the required OAuth scopes and installs the cepbot Gemini extension.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/timfee/cepbot/main/setup.sh | bash
#
# Or clone the repo first and run locally:
#   chmod +x setup.sh && ./setup.sh

set -euo pipefail

# ---------- helpers -----------------------------------------------------------

step()  { printf '\n\033[36m>> %s\033[0m\n' "$1"; }
ok()    { printf '   \033[32m%s\033[0m\n' "$1"; }
skip()  { printf '   \033[90m%s (already installed)\033[0m\n' "$1"; }
warn()  { printf '   \033[33m%s\033[0m\n' "$1"; }
fail()  { printf '   \033[31mERROR: %s\033[0m\n' "$1"; exit 1; }

has() { command -v "$1" >/dev/null 2>&1; }

# ---------- pre-flight --------------------------------------------------------

echo ''
echo '  Chrome Enterprise Premium Bot — Setup'
echo '  ======================================'
echo ''

OS="$(uname -s)"

# ---------- 1. Homebrew (macOS only) ------------------------------------------

if [ "$OS" = "Darwin" ]; then
  step '1/6  Homebrew'

  if has brew; then
    skip "brew $(brew --version | head -n1)"
  else
    echo '   Installing Homebrew...'
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add brew to PATH for Apple Silicon
    if [ -f /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  fi
else
  step '1/6  Package manager'
  ok "Using system package manager ($(uname -s))"
fi

# ---------- 2. Node.js -------------------------------------------------------

step '2/6  Node.js (>= 20)'

install_node() {
  if [ "$OS" = "Darwin" ]; then
    brew install node@22
    brew link --overwrite node@22
  elif has apt-get; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif has dnf; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs
  else
    fail 'Unsupported package manager. Install Node.js 20+ manually: https://nodejs.org'
  fi
}

if has node; then
  node_version="$(node --version | sed 's/^v//')"
  node_major="${node_version%%.*}"
  if [ "$node_major" -ge 20 ]; then
    skip "node v${node_version}"
  else
    warn "Found node v${node_version} — upgrading..."
    install_node
  fi
else
  echo '   Installing Node.js LTS...'
  install_node
fi

has node || fail 'node is not on PATH after install. Restart your shell and re-run.'
has npm  || fail 'npm is not on PATH. The Node.js installation may be incomplete.'
ok "node $(node --version)"

# ---------- 3. Google Cloud CLI -----------------------------------------------

step '3/6  Google Cloud CLI'

if has gcloud; then
  skip "gcloud $(gcloud version 2>&1 | head -n1)"
else
  if [ "$OS" = "Darwin" ]; then
    brew install --cask google-cloud-sdk
  elif has apt-get; then
    # Debian / Ubuntu
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
    sudo apt-get update && sudo apt-get install -y google-cloud-cli
  elif has dnf; then
    sudo tee /etc/yum.repos.d/google-cloud-sdk.repo <<'REPO'
[google-cloud-cli]
name=Google Cloud CLI
baseurl=https://packages.cloud.google.com/yum/repos/cloud-sdk-el9-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
REPO
    sudo dnf install -y google-cloud-cli
  else
    fail 'Unsupported package manager. Install gcloud manually: https://cloud.google.com/sdk/docs/install'
  fi
fi

has gcloud || fail 'gcloud is not on PATH after install. Restart your shell and re-run.'
ok 'gcloud CLI ready'

# ---------- 4. Gemini CLI ----------------------------------------------------

step '4/6  Gemini CLI'

if has gemini || npm list -g @google/gemini-cli >/dev/null 2>&1; then
  skip 'gemini'
else
  echo '   Installing Gemini CLI globally...'
  npm install -g @google/gemini-cli
fi
ok 'gemini CLI ready'

# ---------- 5. Authenticate ---------------------------------------------------

step '5/6  Google Cloud authentication'

SCOPES="https://www.googleapis.com/auth/admin.directory.customer.readonly,\
https://www.googleapis.com/auth/admin.directory.orgunit.readonly,\
https://www.googleapis.com/auth/admin.reports.audit.readonly,\
https://www.googleapis.com/auth/chrome.management.policy,\
https://www.googleapis.com/auth/chrome.management.profiles.readonly,\
https://www.googleapis.com/auth/chrome.management.reports.readonly,\
https://www.googleapis.com/auth/cloud-identity.policies,\
https://www.googleapis.com/auth/cloud-platform"

ADC_PATH="${HOME}/.config/gcloud/application_default_credentials.json"

do_auth() {
  echo '   A browser window will open for Google sign-in...'
  gcloud auth application-default login --scopes="$SCOPES"
  ok 'Authenticated with required scopes'
}

if [ -f "$ADC_PATH" ]; then
  warn 'ADC credentials file already exists.'
  printf '   Re-authenticate? (y/N) '
  read -r response
  if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
    do_auth
  else
    skip 'authentication'
  fi
else
  do_auth
fi

# ---------- 6. Install extension ----------------------------------------------

step '6/6  Install cepbot Gemini extension'

echo '   Registering extension...'
gemini extensions install https://github.com/timfee/cepbot
ok 'cepbot extension installed'

# ---------- done --------------------------------------------------------------

echo ''
printf '  \033[32mSetup complete!\033[0m\n'
echo '  Run "gemini" to start using the Chrome Enterprise Premium Bot.'
echo ''
