#!/usr/bin/env bash
#
# CEP MCP Server — macOS / Linux Setup
#
# Installs Node.js, Google Cloud CLI, and Gemini CLI, then authenticates
# with the required OAuth scopes and installs the CEP MCP Server Gemini extension.
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

# ---------- configuration ----------------------------------------------------
# Centralized settings — edit these instead of hunting through the script body.

PRODUCT_NAME="CEP MCP Server"
GITHUB_URL="https://github.com/timfee/cepbot"
EXTENSION_ID="chrome-enterprise-premium"

MIN_NODE_VERSION=20
INSTALL_NODE_VERSION=22

OAUTH_SCOPES=(
  "https://www.googleapis.com/auth/admin.directory.customer.readonly"
  "https://www.googleapis.com/auth/admin.directory.orgunit.readonly"
  "https://www.googleapis.com/auth/admin.reports.audit.readonly"
  "https://www.googleapis.com/auth/chrome.management.policy"
  "https://www.googleapis.com/auth/chrome.management.profiles.readonly"
  "https://www.googleapis.com/auth/chrome.management.reports.readonly"
  "https://www.googleapis.com/auth/cloud-identity.policies"
  "https://www.googleapis.com/auth/cloud-platform"
)
SCOPES_CSV="$(IFS=,; printf '%s' "${OAUTH_SCOPES[*]}")"

REQUIRED_APIS=(
  "serviceusage.googleapis.com"
  "admin.googleapis.com"
  "chromemanagement.googleapis.com"
  "chromepolicy.googleapis.com"
  "cloudidentity.googleapis.com"
)

PROJECT_ID_REGEX='^[a-z][a-z0-9-]{4,28}[a-z0-9]$'
PROJECT_LIST_LIMIT=20

STEP_TITLES=(
  "Homebrew / Package manager"
  "Node.js (>= ${MIN_NODE_VERSION})"
  "Google Cloud CLI"
  "Gemini CLI"
  "Google Cloud authentication"
  "GCP quota project"
  "Gemini CLI configuration"
  "Install ${PRODUCT_NAME} Gemini extension"
)
TOTAL_STEPS=${#STEP_TITLES[@]}
CURRENT_STEP=0

# ---------- helpers -----------------------------------------------------------

if [ -t 1 ]; then
  BOLD='\033[1m'
  CYAN='\033[36m'  GREEN='\033[32m'  DIM='\033[90m'
  YELLOW='\033[33m'  RED='\033[31m'  RESET='\033[0m'
else
  BOLD=''  CYAN=''  GREEN=''  DIM=''  YELLOW=''  RED=''  RESET=''
fi

step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  local title="${1:-${STEP_TITLES[$((CURRENT_STEP - 1))]}}"
  printf "\n${CYAN}[${CURRENT_STEP}/${TOTAL_STEPS}]  %s${RESET}\n" "$title"
}

ok()    { printf "   ${GREEN}%s${RESET}\n" "$1"; }
skip()  { printf "   ${DIM}%s (already installed)${RESET}\n" "$1"; }
warn()  { printf "   ${YELLOW}%s${RESET}\n" "$1" >&2; }
fail()  { printf "   ${RED}ERROR: %s${RESET}\n" "$1" >&2; exit 1; }

has() { command -v "$1" >/dev/null 2>&1; }

is_valid_project_id() {
  printf '%s' "$1" | grep -qE "$PROJECT_ID_REGEX"
}

# ---------- spinner -----------------------------------------------------------

SPINNER_PID=""

spinner_start() {
  local msg="${1:-Working...}"
  if [ ! -t 1 ] || [ "$NONINTERACTIVE" = "1" ]; then
    printf "   %s\n" "$msg"
    return
  fi
  (
    chars=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    i=0
    while true; do
      printf "\r   ${DIM}%s${RESET} %s" "${chars[$((i % ${#chars[@]}))]}" "$msg"
      i=$((i + 1))
      sleep 0.1
    done
  ) &
  SPINNER_PID=$!
}

spinner_stop() {
  local status="$1"
  local msg="$2"
  if [ -n "$SPINNER_PID" ]; then
    kill "$SPINNER_PID" 2>/dev/null
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    printf "\r\033[K"
  fi
  case "$status" in
    ok)   ok "$msg" ;;
    skip) skip "$msg" ;;
    warn) warn "$msg" ;;
    fail) printf "   ${RED}ERROR: %s${RESET}\n" "$msg" >&2; exit 1 ;;
  esac
}

# ---------- sudo / cleanup ----------------------------------------------------

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
  if [ -n "${SPINNER_PID:-}" ]; then
    kill "$SPINNER_PID" 2>/dev/null || true
  fi
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
printf "  ${BOLD}${CYAN}%s${RESET}\n" "$PRODUCT_NAME"
# Auto-sized underline
_underline=""
i=0
while [ "$i" -lt "${#PRODUCT_NAME}" ]; do _underline="${_underline}─"; i=$((i + 1)); done
printf "  ${DIM}%s${RESET}\n" "$_underline"
printf "  ${DIM}macOS / Linux Setup${RESET}\n"
echo ''
printf "  ${YELLOW}┌─────────────────────────────────────────────────────────────┐${RESET}\n"
printf "  ${YELLOW}│  This interactive experience should be considered a         │${RESET}\n"
printf "  ${YELLOW}│  Product Requirements Document.                             │${RESET}\n"
printf "  ${YELLOW}│                                                             │${RESET}\n"
printf "  ${YELLOW}│  It is not intended for live, customer use, nor does it     │${RESET}\n"
printf "  ${YELLOW}│  have an actual path to production.                         │${RESET}\n"
printf "  ${YELLOW}└─────────────────────────────────────────────────────────────┘${RESET}\n"
echo ''

has curl || fail "'curl' is required but not found. Please install it first."
has git  || fail "'git' is required but not found. Please install it first (e.g. xcode-select --install on macOS, or apt-get install git on Linux)."

if [ "$OS" = "Linux" ]; then
  has apt-get || has dnf || fail \
    "No supported package manager found (need apt-get or dnf). Install prerequisites manually."
fi

# ---------- 1. Homebrew (macOS only) / package manager check ------------------

if [ "$OS" = "Darwin" ]; then
  step 'Homebrew'

  if has brew; then
    skip "brew $(brew --version 2>&1 | sed -n '1p')"
  else
    spinner_start 'Installing Homebrew...'
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" > /dev/null 2>&1
    spinner_stop ok 'Homebrew installed'

    # Add brew to PATH for Apple Silicon
    if [ -f /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  fi
else
  step 'Package manager'
  ok "Using system package manager ($OS)"
fi

# ---------- 2. Node.js -------------------------------------------------------

step

install_node() {
  if [ "$OS" = "Darwin" ]; then
    spinner_start "Installing Node.js ${INSTALL_NODE_VERSION}..."
    brew install "node@${INSTALL_NODE_VERSION}" > /dev/null 2>&1
    # node@22 is keg-only; link it to make it available on PATH
    brew link --force --overwrite "node@${INSTALL_NODE_VERSION}" 2>/dev/null || true
    spinner_stop ok "Node.js ${INSTALL_NODE_VERSION} installed via brew"
    # Fall back to adding the keg's bin directly
    if ! has node; then
      export PATH="/opt/homebrew/opt/node@${INSTALL_NODE_VERSION}/bin:/usr/local/opt/node@${INSTALL_NODE_VERSION}/bin:$PATH"
    fi
  elif has apt-get; then
    local setup_script
    setup_script="$(mktemp)"
    TMPFILES+=("$setup_script")
    spinner_start "Installing Node.js ${INSTALL_NODE_VERSION}..."
    curl -fsSL "https://deb.nodesource.com/setup_${INSTALL_NODE_VERSION}.x" -o "$setup_script"
    run_sudo bash "$setup_script" > /dev/null 2>&1
    rm -f "$setup_script"
    run_sudo apt-get install -y nodejs > /dev/null 2>&1
    spinner_stop ok "Node.js ${INSTALL_NODE_VERSION} installed via apt"
  elif has dnf; then
    local setup_script
    setup_script="$(mktemp)"
    TMPFILES+=("$setup_script")
    spinner_start "Installing Node.js ${INSTALL_NODE_VERSION}..."
    curl -fsSL "https://rpm.nodesource.com/setup_${INSTALL_NODE_VERSION}.x" -o "$setup_script"
    run_sudo bash "$setup_script" > /dev/null 2>&1
    rm -f "$setup_script"
    run_sudo dnf install -y nodejs > /dev/null 2>&1
    spinner_stop ok "Node.js ${INSTALL_NODE_VERSION} installed via dnf"
  else
    fail "Unsupported package manager. Install Node.js ${MIN_NODE_VERSION}+ manually: https://nodejs.org"
  fi
}

if has node; then
  node_version="$(node --version | sed 's/^v//')"
  node_major="${node_version%%.*}"
  if [ "$node_major" -ge "$MIN_NODE_VERSION" ] 2>/dev/null; then
    skip "node v${node_version}"
  else
    warn "Found node v${node_version} — upgrading..."
    install_node
  fi
else
  install_node
fi

has node || fail 'node is not on PATH after install. Restart your shell and re-run.'
has npm  || fail 'npm is not on PATH. The Node.js installation may be incomplete.'

# Re-check version after any install/upgrade
node_version="$(node --version | sed 's/^v//')"
node_major="${node_version%%.*}"
if ! [ "$node_major" -ge "$MIN_NODE_VERSION" ] 2>/dev/null; then
  fail "node v${node_version} is on PATH but >= ${MIN_NODE_VERSION} is required. Remove the old version or adjust PATH."
fi
ok "node v${node_version}"

# ---------- 3. Google Cloud CLI -----------------------------------------------

step

if has gcloud; then
  skip "gcloud $(gcloud version 2>&1 | sed -n '1p')"
else
  if [ "$OS" = "Darwin" ]; then
    spinner_start 'Installing Google Cloud CLI...'
    brew install --cask google-cloud-sdk > /dev/null 2>&1
    spinner_stop ok 'Google Cloud CLI installed via brew'
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
      spinner_start 'Installing gnupg...'
      run_sudo apt-get install -y gnupg > /dev/null 2>&1
      spinner_stop ok 'gnupg installed'
    fi
    spinner_start 'Installing Google Cloud CLI...'
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | run_sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/cloud.google.gpg 2>/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      | run_sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list > /dev/null
    run_sudo apt-get update > /dev/null 2>&1 \
      || { spinner_stop fail 'apt-get update failed after adding the Google Cloud repository.'; }
    run_sudo apt-get install -y google-cloud-cli > /dev/null 2>&1
    spinner_stop ok 'Google Cloud CLI installed via apt'
  elif has dnf; then
    spinner_start 'Installing Google Cloud CLI...'
    run_sudo tee /etc/yum.repos.d/google-cloud-sdk.repo > /dev/null <<REPO
[google-cloud-cli]
name=Google Cloud CLI
baseurl=https://packages.cloud.google.com/yum/repos/cloud-sdk-el9-${ARCH}
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
REPO
    run_sudo dnf install -y google-cloud-cli > /dev/null 2>&1
    spinner_stop ok 'Google Cloud CLI installed via dnf'
  else
    fail 'Unsupported package manager. Install gcloud manually: https://cloud.google.com/sdk/docs/install'
  fi
fi

has gcloud || fail 'gcloud is not on PATH after install. Restart your shell and re-run.'
ok 'gcloud CLI ready'

# ---------- 4. Gemini CLI ----------------------------------------------------

step

gemini_installed=0
if has gemini; then
  gemini_installed=1
elif npm list -g @google/gemini-cli >/dev/null 2>&1; then
  gemini_installed=1
fi

if [ "$gemini_installed" = "1" ]; then
  skip 'gemini'
else
  spinner_start 'Installing Gemini CLI globally...'
  npm install -g @google/gemini-cli > /dev/null 2>&1 || { spinner_stop fail 'Failed to install Gemini CLI via npm.'; }
  spinner_stop ok 'Gemini CLI installed'
fi

has gemini || fail 'gemini is not on PATH. Check that npm global bin is in your PATH.'
ok 'gemini CLI ready'

# ---------- 5. Authenticate ---------------------------------------------------

step

# --- 5a. gcloud CLI auth (needed for gcloud commands during setup) ---
echo '   Checking gcloud CLI auth...'
active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n 1 || true)"

if [ -n "$active_account" ]; then
  ok "gcloud CLI authenticated as ${BOLD}${active_account}${RESET}"
  if [ "$NONINTERACTIVE" = "1" ]; then
    :
  else
    printf '   Re-authenticate gcloud CLI? (y/N) '
    response=""
    read -r response || response="N"
    if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
      gcloud auth login || fail 'gcloud CLI auth was cancelled or failed. Re-run to try again.'
      ok 'gcloud CLI re-authenticated'
    fi
  fi
else
  echo '   No active gcloud CLI account. A browser window will open for sign-in...'
  gcloud auth login || fail 'gcloud CLI auth was cancelled or failed. Re-run to try again.'
  ok 'gcloud CLI authenticated'
fi

# --- 5b. ADC auth (used by the MCP server at runtime) ---
echo '   Checking Application Default Credentials (ADC)...'

ADC_PATH="${HOME}/.config/gcloud/application_default_credentials.json"

do_adc_auth() {
  echo '   A browser window will open for ADC sign-in...'
  printf "   ${DIM}Note: ADC uses a separate OAuth client from gcloud CLI — a second browser prompt is expected.${RESET}\n"
  gcloud auth application-default login --scopes="$SCOPES_CSV" \
    || fail 'ADC authentication failed or was cancelled. Re-run to try again.'
  ok 'ADC authenticated with required scopes'
}

if [ -f "$ADC_PATH" ]; then
  if [ "$NONINTERACTIVE" = "1" ]; then
    skip 'ADC authentication (non-interactive mode; re-run interactively to re-authenticate)'
  else
    warn 'ADC credentials file already exists.'
    printf "   ${DIM}Note: ADC uses a separate OAuth client from gcloud CLI — a second browser prompt is expected.${RESET}\n"
    printf '   Re-authenticate ADC? (y/N) '
    response=""
    read -r response || response="N"
    if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
      do_adc_auth
    else
      skip 'ADC authentication'
    fi
  fi
else
  do_adc_auth
fi

# ---------- 6. Quota project --------------------------------------------------

step

adc_file="${HOME}/.config/gcloud/application_default_credentials.json"
project_id=""

# Helper: directly patch quota_project_id into the ADC JSON file when
# the gcloud CLI command fails.
patch_adc_quota_project() {
  local pid="$1"
  if [ ! -f "$adc_file" ]; then return 1; fi
  if grep -q '"quota_project_id"' "$adc_file" 2>/dev/null; then
    sed -i.bak "s/\"quota_project_id\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"quota_project_id\": \"${pid}\"/" "$adc_file" && rm -f "${adc_file}.bak"
  else
    # Insert before the closing brace
    sed -i.bak "s/}$/,\"quota_project_id\": \"${pid}\"}/" "$adc_file" && rm -f "${adc_file}.bak"
  fi
}

# Helper: verify the ADC file contains the expected quota_project_id.
verify_adc_quota_project() {
  local pid="$1"
  if [ ! -f "$adc_file" ]; then return 1; fi
  grep -q "\"quota_project_id\"[[:space:]]*:[[:space:]]*\"${pid}\"" "$adc_file" 2>/dev/null
}

# Helper: persist project ID to both gcloud config and ADC file.
set_project_everywhere() {
  local pid="$1"
  gcloud config set project "$pid" 2>/dev/null || true
  gcloud auth application-default set-quota-project "$pid" 2>/dev/null || true
  if ! verify_adc_quota_project "$pid"; then
    warn 'gcloud set-quota-project did not persist. Patching ADC file directly...'
    patch_adc_quota_project "$pid" || true
  fi
  if verify_adc_quota_project "$pid"; then
    ok "Project set: ${BOLD}${pid}${RESET}"
    return 0
  else
    warn "Could not persist project $pid to ADC file."
    return 1
  fi
}

# --- 6a. Check for existing project ---
if [ -f "$adc_file" ]; then
  existing_quota="$(grep -o '"quota_project_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$adc_file" 2>/dev/null | head -n 1 | sed 's/.*"quota_project_id"[[:space:]]*:[[:space:]]*"//' | sed 's/"//' || true)"
  if [ -n "$existing_quota" ] && is_valid_project_id "$existing_quota"; then
    project_id="$existing_quota"
  fi
fi
# Fall back to gcloud config project
if [ -z "$project_id" ]; then
  raw_project="$(gcloud config get-value project 2>/dev/null || true)"
  candidate="$(printf '%s' "$raw_project" | tr -d '[:space:]')"
  if [ "$candidate" != "(unset)" ] && is_valid_project_id "$candidate"; then
    project_id="$candidate"
  fi
fi

# --- 6b. Interactive project selection ---
needs_selection=true

if [ -n "$project_id" ]; then
  if [ "$NONINTERACTIVE" = "1" ]; then
    set_project_everywhere "$project_id" || true
    needs_selection=false
  else
    printf "   Current project: ${BOLD}%s${RESET}\n" "$project_id"
    printf '   Use this project? (Y/n/list) '
    response=""
    read -r response || response="Y"
    response="$(printf '%s' "$response" | tr '[:upper:]' '[:lower:]')"
    case "$response" in
      ''|y|yes)
        set_project_everywhere "$project_id" || true
        needs_selection=false
        ;;
      n|no|list|l)
        needs_selection=true
        ;;
      *)
        set_project_everywhere "$project_id" || true
        needs_selection=false
        ;;
    esac
  fi
fi

if [ "$needs_selection" = true ] && [ "$NONINTERACTIVE" = "1" ]; then
  warn 'No usable project found in non-interactive mode. Set one with: gcloud config set project YOUR_PROJECT_ID'
  needs_selection=false
fi

if [ "$needs_selection" = true ]; then
  spinner_start 'Fetching your GCP projects...'
  project_list_raw="$(gcloud projects list --format='value(projectId,name)' --sort-by=~createTime --limit="$PROJECT_LIST_LIMIT" 2>/dev/null || true)"
  spinner_stop ok 'Projects loaded'

  project_ids=()
  project_names=()
  while IFS=$'\t' read -r pid pname; do
    pid="$(printf '%s' "$pid" | tr -d '[:space:]')"
    if is_valid_project_id "$pid"; then
      project_ids+=("$pid")
      project_names+=("${pname:-}")
    fi
  done <<< "$project_list_raw"

  if [ ${#project_ids[@]} -eq 0 ]; then
    warn 'No existing projects found. Creating a new one...'
    response='c'
  else
    echo ''
    printf "   ${DIM}────────────────────────────────${RESET}\n"
    printf "   ${BOLD}Your GCP projects:${RESET}\n\n"
    for i in "${!project_ids[@]}"; do
      num=$((i + 1))
      if [ "${project_ids[$i]}" = "$project_id" ]; then
        printf "   ${GREEN}[%d] %s${RESET}" "$num" "${project_ids[$i]}"
      else
        printf "   [%d] %s" "$num" "${project_ids[$i]}"
      fi
      if [ -n "${project_names[$i]}" ] && [ "${project_names[$i]}" != "${project_ids[$i]}" ]; then
        printf "  ${DIM}(%s)${RESET}" "${project_names[$i]}"
      fi
      echo ''
    done
    echo ''
    printf "   ${DIM}[E] Enter a project ID manually${RESET}\n"
    printf "   ${DIM}[C] Create a new project${RESET}\n"
    printf "   ${DIM}────────────────────────────────${RESET}\n"
    echo ''
    printf '   Select (1-%d, E, or C) ' "${#project_ids[@]}"
    response=""
    read -r response || response=""
    response="$(printf '%s' "$response" | tr -d '[:space:]')"
  fi

  case "$response" in
    [eE])
      printf '   Enter project ID: '
      custom_id=""
      read -r custom_id || custom_id=""
      custom_id="$(printf '%s' "$custom_id" | tr -d '[:space:]')"
      if is_valid_project_id "$custom_id"; then
        project_id="$custom_id"
      else
        fail "Invalid project ID format: $custom_id (must be 6-30 chars: lowercase letters, digits, hyphens)"
      fi
      ;;
    [cC])
      # --- 6c. Create new project ---
      consonants='bcdfghjklmnpqrstvwxyz'
      vowels='aeiou'
      pick_char() { local s="$1"; local i=$((RANDOM % ${#s})); printf '%s' "${s:$i:1}"; }
      cvc1="$(pick_char "$consonants")$(pick_char "$vowels")$(pick_char "$consonants")"
      cvc2="$(pick_char "$consonants")$(pick_char "$vowels")$(pick_char "$consonants")"
      new_project_id="mcp-${cvc1}-${cvc2}"

      spinner_start "Creating project ${new_project_id}..."
      gcloud projects create "$new_project_id" > /dev/null 2>&1 \
        || { spinner_stop fail "Could not create project $new_project_id."; }
      spinner_stop ok "Created project: ${new_project_id}"
      project_id="$new_project_id"
      ;;
    *)
      if printf '%s' "$response" | grep -qE '^[0-9]+$'; then
        num="$response"
        if [ "$num" -ge 1 ] && [ "$num" -le "${#project_ids[@]}" ]; then
          project_id="${project_ids[$((num - 1))]}"
        else
          fail "Invalid selection: $response"
        fi
      else
        fail "Invalid selection: $response"
      fi
      ;;
  esac

  # --- 6d. Persist project ---
  set_project_everywhere "$project_id" || true
fi

quota_set=false
if [ -n "$project_id" ] && verify_adc_quota_project "$project_id"; then
  quota_set=true
fi
if [ "$quota_set" = false ]; then
  warn 'Could not set quota project. The agent will attempt to resolve this on first use.'
fi

# --- 6e. Enable required APIs ---
if [ -n "$project_id" ]; then
  spinner_start "Enabling required APIs on ${project_id}..."
  all_apis_ok=true
  for api in "${REQUIRED_APIS[@]}"; do
    if ! gcloud services enable "$api" --project "$project_id" 2>/dev/null; then
      all_apis_ok=false
    fi
  done
  if [ "$all_apis_ok" = true ]; then
    spinner_stop ok 'All required APIs enabled'
  else
    spinner_stop warn 'Some APIs could not be enabled (the agent will retry at runtime)'
  fi
fi

# ---------- 7. Gemini CLI configuration ----------------------------------------

step

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

# ---------- 8. Install extension ----------------------------------------------

step

# Uninstall first if already present — reinstalling over an existing
# extension crashes the Gemini CLI with a libuv assertion failure.
gemini extensions uninstall "$EXTENSION_ID" 2>/dev/null || true

spinner_start 'Registering extension...'
# Pipe "Y" to auto-confirm the install prompt — without this, piped/
# non-interactive sessions get EOF and the install silently skips.
install_rc=0
echo "Y" | gemini extensions install "$GITHUB_URL" > /dev/null 2>&1 || install_rc=$?

enablement_file="${HOME}/.gemini/extensions/extension-enablement.json"

if [ "$install_rc" -eq 41 ]; then
  spinner_stop warn 'Extension install needs Gemini CLI authentication first.'
  # Exit code 41 = FatalAuthenticationError.  Launch gemini interactively
  # so the user can complete the browser sign-in, then retry.
  echo ''
  printf "   ${YELLOW}Launching Gemini CLI for first-time sign-in.${RESET}\n"
  printf "   ${YELLOW}A browser window will open - complete the sign-in there.${RESET}\n"
  printf "   ${YELLOW}Once authenticated, type /quit to return to setup.${RESET}\n"
  echo ''
  gemini || true
  echo ''
  spinner_start 'Retrying extension install...'
  echo "Y" | gemini extensions install "$GITHUB_URL" > /dev/null 2>&1 \
    || true
fi

# Verify the extension actually registered (exit codes are unreliable
# due to the libuv assertion crash).
if [ -f "$enablement_file" ] && grep -q "\"${EXTENSION_ID}\"" "$enablement_file" 2>/dev/null; then
  spinner_stop ok "${PRODUCT_NAME} extension installed"
else
  spinner_stop fail "Extension install did not register. Try manually: gemini extensions install ${GITHUB_URL}"
fi

# ---------- done --------------------------------------------------------------

echo ''
printf "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "  ${GREEN}${BOLD}Setup complete!${RESET}\n"
printf "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
echo ''
printf "   ${BOLD}Node.js${RESET}     %s\n" "$(node --version)"
printf "   ${BOLD}gcloud${RESET}      %s\n" "$(gcloud version 2>&1 | head -1)"
printf "   ${BOLD}Gemini CLI${RESET}  installed\n"
if [ -n "${project_id:-}" ]; then
  printf "   ${BOLD}Project${RESET}     %s\n" "$project_id"
fi
if [ -n "${active_account:-}" ]; then
  printf "   ${BOLD}Account${RESET}     %s\n" "$active_account"
fi
echo ''
printf '  Run "gemini" to start using %s.\n' "$PRODUCT_NAME"
echo ''

} # end main

main "$@"
