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
#
# The entire script is wrapped in main() so that bash parses the full function
# body before executing anything. This is required for curl|bash delivery —
# without it, `exec < /dev/tty` would redirect bash's script source away from
# the pipe mid-read. Rustup, Homebrew, and Bun all use this same pattern.

set -euo pipefail

main() {

# ---------- shell check -------------------------------------------------------

if [ -z "${BASH_VERSION:-}" ]; then
  printf 'Error: this script requires bash. Run with: bash setup.sh\n' >&2
  exit 1
fi

# ---------- stdin / TTY -------------------------------------------------------
#
# When piped via curl|bash, stdin is the script itself, not the user's keyboard.
# Reconnect stdin to the real terminal so interactive prompts (like the
# re-authenticate prompt) work. Fall back to non-interactive mode if there is
# no controlling terminal.

NONINTERACTIVE="${NONINTERACTIVE:-0}"

if [ ! -t 0 ]; then
  if (: < /dev/tty) 2>/dev/null; then
    exec < /dev/tty
  else
    NONINTERACTIVE=1
  fi
fi

# ---------- platform ----------------------------------------------------------

OS="$(uname -s)"
ARCH="$(uname -m)"

# Detect Rosetta 2 on Apple Silicon
if [ "$OS" = "Darwin" ] && [ "$ARCH" = "x86_64" ]; then
  if sysctl hw.optional.arm64 2>/dev/null | grep -q ': 1'; then
    ARCH="arm64"
  fi
fi

# ---------- helpers -----------------------------------------------------------

if [ -t 1 ]; then
  CYAN='\033[36m'  GREEN='\033[32m'  DIM='\033[90m'
  YELLOW='\033[33m'  RED='\033[31m'  RESET='\033[0m'
else
  CYAN=''  GREEN=''  DIM=''  YELLOW=''  RED=''  RESET=''
fi

step()  { printf "\n${CYAN}>> %s${RESET}\n" "$1"; }
ok()    { printf "   ${GREEN}%s${RESET}\n" "$1"; }
skip()  { printf "   ${DIM}%s (already installed)${RESET}\n" "$1"; }
warn()  { printf "   ${YELLOW}%s${RESET}\n" "$1" >&2; }
fail()  { printf "   ${RED}ERROR: %s${RESET}\n" "$1" >&2; exit 1; }

has() { command -v "$1" >/dev/null 2>&1; }

USED_SUDO=0
TMPFILES=()
run_sudo() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
  else
    USED_SUDO=1
    sudo "$@"
  fi
}

cleanup() {
  # ${#arr[@]} is safe under set -u on bash 3.2; ${arr[@]} is not.
  if [ ${#TMPFILES[@]} -gt 0 ]; then
    for f in "${TMPFILES[@]}"; do rm -f "$f"; done
  fi
  if [ "$USED_SUDO" = "1" ] && has sudo; then
    sudo -k 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------- pre-flight --------------------------------------------------------

echo ''
echo '  Chrome Enterprise Premium Bot — Setup'
echo '  ======================================'
echo ''

has curl || fail "'curl' is required but not found. Please install it first."
has git  || fail "'git' is required but not found. Please install it first (e.g. xcode-select --install on macOS, or apt-get install git on Linux)."

if [ "$OS" = "Linux" ]; then
  has apt-get || has dnf || fail \
    "No supported package manager found (need apt-get or dnf). Install prerequisites manually."
fi

# ---------- 1. Homebrew (macOS only) / package manager check ------------------

if [ "$OS" = "Darwin" ]; then
  step '1/8  Homebrew'

  if has brew; then
    skip "brew $(brew --version 2>&1 | sed -n '1p')"
  else
    echo '   Installing Homebrew...'
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add brew to PATH for Apple Silicon
    if [ -f /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  fi
else
  step '1/8  Package manager'
  ok "Using system package manager ($OS)"
fi

# ---------- 2. Node.js -------------------------------------------------------

step '2/8  Node.js (>= 20)'

install_node() {
  if [ "$OS" = "Darwin" ]; then
    brew install node@22
    # node@22 is keg-only; link it to make it available on PATH
    brew link --force --overwrite node@22 2>/dev/null || true
    # Fall back to adding the keg's bin directly
    if ! has node; then
      export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
    fi
  elif has apt-get; then
    local setup_script
    setup_script="$(mktemp)"
    TMPFILES+=("$setup_script")
    curl -fsSL https://deb.nodesource.com/setup_22.x -o "$setup_script"
    run_sudo bash "$setup_script"
    rm -f "$setup_script"
    run_sudo apt-get install -y nodejs
  elif has dnf; then
    local setup_script
    setup_script="$(mktemp)"
    TMPFILES+=("$setup_script")
    curl -fsSL https://rpm.nodesource.com/setup_22.x -o "$setup_script"
    run_sudo bash "$setup_script"
    rm -f "$setup_script"
    run_sudo dnf install -y nodejs
  else
    fail 'Unsupported package manager. Install Node.js 20+ manually: https://nodejs.org'
  fi
}

if has node; then
  node_version="$(node --version | sed 's/^v//')"
  node_major="${node_version%%.*}"
  if [ "$node_major" -ge 20 ] 2>/dev/null; then
    skip "node v${node_version}"
  else
    warn "Found node v${node_version} — upgrading..."
    install_node
  fi
else
  echo '   Installing Node.js 22...'
  install_node
fi

has node || fail 'node is not on PATH after install. Restart your shell and re-run.'
has npm  || fail 'npm is not on PATH. The Node.js installation may be incomplete.'

# Re-check version after any install/upgrade
node_version="$(node --version | sed 's/^v//')"
node_major="${node_version%%.*}"
if ! [ "$node_major" -ge 20 ] 2>/dev/null; then
  fail "node v${node_version} is on PATH but >= 20 is required. Remove the old version or adjust PATH."
fi
ok "node v${node_version}"

# ---------- 3. Google Cloud CLI -----------------------------------------------

step '3/8  Google Cloud CLI'

if has gcloud; then
  skip "gcloud $(gcloud version 2>&1 | sed -n '1p')"
else
  echo '   Installing Google Cloud CLI (this may take a few minutes)...'
  if [ "$OS" = "Darwin" ]; then
    brew install --cask google-cloud-sdk
    # The cask doesn't symlink gcloud into bin; source its PATH script
    for _gcloud_inc in \
      "$(brew --prefix 2>/dev/null)/share/google-cloud-sdk/path.bash.inc" \
      /opt/homebrew/share/google-cloud-sdk/path.bash.inc \
      /usr/local/share/google-cloud-sdk/path.bash.inc; do
      if [ -f "$_gcloud_inc" ]; then
        # shellcheck disable=SC1090
        source "$_gcloud_inc"
        break
      fi
    done
  elif has apt-get; then
    if ! has gpg; then
      echo '   Installing gnupg (needed for repository signing)...'
      run_sudo apt-get install -y gnupg
    fi
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | run_sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/cloud.google.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      | run_sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list > /dev/null
    run_sudo apt-get update \
      || fail 'apt-get update failed after adding the Google Cloud repository.'
    run_sudo apt-get install -y google-cloud-cli
  elif has dnf; then
    run_sudo tee /etc/yum.repos.d/google-cloud-sdk.repo > /dev/null <<REPO
[google-cloud-cli]
name=Google Cloud CLI
baseurl=https://packages.cloud.google.com/yum/repos/cloud-sdk-el9-${ARCH}
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
REPO
    run_sudo dnf install -y google-cloud-cli
  else
    fail 'Unsupported package manager. Install gcloud manually: https://cloud.google.com/sdk/docs/install'
  fi
fi

has gcloud || fail 'gcloud is not on PATH after install. Restart your shell and re-run.'
ok 'gcloud CLI ready'

# ---------- 4. Gemini CLI ----------------------------------------------------

step '4/8  Gemini CLI'

gemini_installed=0
if has gemini; then
  gemini_installed=1
elif npm list -g @google/gemini-cli >/dev/null 2>&1; then
  gemini_installed=1
fi

if [ "$gemini_installed" = "1" ]; then
  skip 'gemini'
else
  echo '   Installing Gemini CLI globally...'
  npm install -g @google/gemini-cli || fail 'Failed to install Gemini CLI via npm.'
fi

has gemini || fail 'gemini is not on PATH. Check that npm global bin is in your PATH.'
ok 'gemini CLI ready'

# ---------- 5. Authenticate ---------------------------------------------------

step '5/8  Google Cloud authentication'

SCOPES="https://www.googleapis.com/auth/admin.directory.customer.readonly"
SCOPES+=",https://www.googleapis.com/auth/admin.directory.orgunit.readonly"
SCOPES+=",https://www.googleapis.com/auth/admin.reports.audit.readonly"
SCOPES+=",https://www.googleapis.com/auth/chrome.management.policy"
SCOPES+=",https://www.googleapis.com/auth/chrome.management.profiles.readonly"
SCOPES+=",https://www.googleapis.com/auth/chrome.management.reports.readonly"
SCOPES+=",https://www.googleapis.com/auth/cloud-identity.policies"
SCOPES+=",https://www.googleapis.com/auth/cloud-platform"

ADC_PATH="${HOME}/.config/gcloud/application_default_credentials.json"

do_auth() {
  echo '   A browser window will open for Google sign-in...'
  gcloud auth application-default login --scopes="$SCOPES" \
    || fail 'Authentication failed or was cancelled. Re-run to try again.'
  ok 'Authenticated with required scopes'
}

if [ -f "$ADC_PATH" ]; then
  if [ "$NONINTERACTIVE" = "1" ]; then
    skip 'authentication (non-interactive mode; re-run interactively to re-authenticate)'
  else
    warn 'ADC credentials file already exists.'
    printf '   Re-authenticate? (y/N) '
    response=""
    read -r response || response="N"
    if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
      do_auth
    else
      skip 'authentication'
    fi
  fi
else
  do_auth
fi

# ---------- 6. Quota project --------------------------------------------------

step '6/8  GCP quota project'

# Set quota project to avoid "quota exceeded" errors on API calls.
# Mirrors the fallback logic in mcp-server/src/lib/bootstrap.ts.
project_id=""
raw_project="$(gcloud config get-value project 2>/dev/null || true)"
project_id="$(printf '%s' "$raw_project" | tr -d '[:space:]')"
if [ "$project_id" = "(unset)" ]; then
  project_id=""
fi

if [ -n "$project_id" ]; then
  if gcloud auth application-default set-quota-project "$project_id" 2>/dev/null; then
    ok "Quota project: $project_id"
  else
    warn 'Could not set quota project. The agent will attempt to resolve this on first use.'
  fi
else
  warn 'No GCP project configured. The agent will attempt to create one on first use.'
fi

# ---------- 7. Gemini CLI configuration ----------------------------------------

step '7/8  Gemini CLI configuration'

GEMINI_DIR="${HOME}/.gemini"
GEMINI_SETTINGS="${GEMINI_DIR}/settings.json"
needs_gemini_auth=1

if [ -f "$GEMINI_SETTINGS" ]; then
  # Check if auth type is already configured (simple grep — no jq dependency)
  auth_type="$(grep -o '"selectedType"[[:space:]]*:[[:space:]]*"[^"]*"' "$GEMINI_SETTINGS" 2>/dev/null | head -n 1 | sed 's/.*"selectedType"[[:space:]]*:[[:space:]]*"//' | sed 's/"//' || true)"
  if [ -n "$auth_type" ]; then
    skip "Gemini CLI auth ($auth_type)"
    needs_gemini_auth=0
  fi
fi

if [ "$needs_gemini_auth" = "1" ]; then
  mkdir -p "$GEMINI_DIR"
  cat > "$GEMINI_SETTINGS" <<'SETTINGS'
{ "security": { "auth": { "selectedType": "oauth-personal" } } }
SETTINGS
  ok 'Configured Gemini CLI to use Google login'
fi

# ---------- 7. Install extension ----------------------------------------------

step '8/8  Install cepbot Gemini extension'

echo '   Registering extension...'
# Capture exit code without triggering set -e
install_rc=0
gemini extensions install https://github.com/timfee/cepbot 2>&1 || install_rc=$?

if [ "$install_rc" -eq 0 ]; then
  : # Success on first try
elif [ "$install_rc" -eq 41 ]; then
  # Exit code 41 = FatalAuthenticationError.  The CLI validated its global
  # auth state before processing the subcommand.  Launch gemini interactively
  # so the user can complete the browser sign-in, then retry.
  warn 'Extension install needs Gemini CLI authentication first.'
  echo ''
  printf "   ${YELLOW}Launching Gemini CLI for first-time sign-in.${RESET}\n"
  printf "   ${YELLOW}A browser window will open — complete the sign-in there.${RESET}\n"
  printf "   ${YELLOW}Once authenticated, type /quit to return to setup.${RESET}\n"
  echo ''
  gemini || true
  echo ''
  echo '   Retrying extension install...'
  gemini extensions install https://github.com/timfee/cepbot \
    || fail 'Failed to install the cepbot extension.'
else
  fail "Extension install failed (exit code $install_rc). Check your network connection and try again."
fi
ok 'cepbot extension installed'

# ---------- done --------------------------------------------------------------

echo ''
printf "  ${GREEN}Setup complete!${RESET}\n"
echo '  Run "gemini" to start using the Chrome Enterprise Premium Bot.'
echo ''

} # end main

main "$@"
