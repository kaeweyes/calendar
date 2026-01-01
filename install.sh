#!/usr/bin/env bash
set -euo pipefail

### Configuration: adjust if you want a specific Node major version
NODE_MAJOR="18"   # change to 16, 18, 20... (LTS recommended)

# Helpers
info()  { printf "\033[1;34m[INFO]\033[0m %s\n" "$*"; }
warn()  { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; }
error() { printf "\033[1;31m[ERROR]\033[0m %s\n" "$*" >&2; }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

detect_os() {
  local unameS
  unameS="$(uname -s)"
  case "$unameS" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    *)      echo "unknown" ;;
  esac
}

# Install NVM (no-sudo, safe fallback)
install_nvm() {
  if [ -d "${HOME}/.nvm" ]; then
    info "nvm already installed"
  else
    info "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
  fi

  # Shell integration
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  info "Installing Node LTS via nvm..."
  nvm install --lts
  nvm alias default 'lts/*' || true
}

# macOS: try brew, else nvm
install_node_macos() {
  if command_exists brew; then
    info "Homebrew found. Installing node via brew..."
    brew update || true
    brew install node || true
  else
    warn "Homebrew not found. Falling back to nvm (no sudo required)."
    install_nvm
  fi
}

# Debian/Ubuntu using NodeSource apt repo
install_node_debian() {
  if ! command_exists sudo; then
    warn "sudo not available. Falling back to nvm."
    install_nvm
    return
  fi

  info "Installing Node.js $NODE_MAJOR (NodeSource) via apt..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
}

# RHEL/CentOS/Fedora using NodeSource rpm
install_node_rpm() {
  if ! command_exists sudo; then
    warn "sudo not available. Falling back to nvm."
    install_nvm
    return
  fi

  info "Installing Node.js $NODE_MAJOR (NodeSource) via yum/dnf..."
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | sudo bash -
  if command_exists dnf; then
    sudo dnf install -y nodejs
  else
    sudo yum install -y nodejs
  fi
}

# Generic installer choosing appropriate method
install_node_generic() {
  local os="$1"
  if [ "$os" = "macos" ]; then
    install_node_macos
    return
  fi

  # linux: detect package manager / distro
  if command_exists apt-get; then
    install_node_debian
    return
  fi
  if command_exists dnf || command_exists yum; then
    install_node_rpm
    return
  fi

  warn "No apt/yum/dnf detected. Falling back to nvm method."
  install_nvm
}

# Attempt to make node/npm available (installs if necessary)
ensure_node() {
  if command_exists node && command_exists npm; then
    info "node and npm already installed: $(node -v), $(npm -v)"
    return 0
  fi

  local os
  os="$(detect_os)"
  info "Detected OS: $os"

  install_node_generic "$os"

  # After installing via nvm, the node binary may be available only in current shell
  if ! command_exists node || ! command_exists npm; then
    # If nvm installed, source it (best-effort)
    if [ -s "${HOME}/.nvm/nvm.sh" ]; then
      # shellcheck disable=SC1090
      . "${HOME}/.nvm/nvm.sh"
      nvm use default >/dev/null 2>&1 || true
    fi
  fi

  if command_exists node && command_exists npm; then
    info "Node installed: $(node -v), npm $(npm -v)"
    return 0
  fi

  error "Failed to install node/npm automatically. Please install Node.js manually and re-run the script."
  return 1
}

# Detect top-level external packages used in source (heuristic)
detect_used_packages() {
  # Search source files for require('pkg') and import ... from 'pkg' patterns
  # Exclude relative imports starting with ./ or ../ or /
  # Exclude node_modules
  info "Detecting used top-level modules from source files..."
  local pkgs
  pkgs=$(grep -hR --exclude-dir=node_modules --include=\*.js --include=\*.mjs --include=\*.cjs --include=\*.ts --include=\*.jsx --include=\*.tsx -E "require\(['\"][^'\"./][^'\"']+['\"]|from ['\"][^'\"./][^'\"']+" . 2>/dev/null \
    | sed -E "s/.*require\(['\"]([^'\" ]+)['\"].*/\1/; s/.*from ['\"]([^'\" ]+)['\"].*/\1/" \
    | grep -vE '^\.|^/' || true)

  # uniq & remove empty
  pkgs=$(echo "$pkgs" | tr ' ' '\n' | sed '/^\s*$/d' | sort -u)
  echo "$pkgs"
}

# Install node modules according to available inputs
install_node_modules() {
  # If package.json exists, prefer npm install (respects package.json)
  if [ -f package.json ]; then
    info "package.json found. Running 'npm install'..."
    npm install
    return
  fi

  # If user passed package names as script args, install those
  if [ "$#" -gt 0 ]; then
    info "Installing packages passed as arguments: $*"
    npm install --save "$@"
    return
  fi

  # Otherwise try auto-detect
  local detected
  detected="$(detect_used_packages)"
  if [ -z "$detected" ]; then
    warn "No package.json, no args provided, and no used packages could be detected automatically."
    info "If you want me to install specific packages, re-run: ./setup-node.sh express lodash"
    return
  fi

  # Convert detected list into array and install
  # Filter out core modules? We'll not try to dedupe core modules here; npm will handle or fail.
  info "Detected packages to install:"
  echo "$detected"
  # Install them
  npm install --save $(echo "$detected" | tr '\n' ' ')
}

# ========== Main ==========
main() {
  # allow passing package names as args to install directly
  local args=( "$@" )

  info "Starting setup-node script..."
  ensure_node

  # after node is ready, perform installs
  install_node_modules "${args[@]}"

  info "Done. Node: $(node -v || echo 'unknown'), npm: $(npm -v || echo 'unknown')"
  info "If you used nvm and a new shell is required, restart your terminal to have nvm/node on your PATH persistently."
}

main "$@"
