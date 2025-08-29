#!/usr/bin/env bash
set -e
APP_DIR="/opt/js-panel"
SERVICE_NAME="js-panel"
REPO_URL="https://github.com/MyMasWayVPN/js-panel.git"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

function log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

function detect_os() {
    if [[ -f /etc/debian_version ]]; then
        echo "debian"
    elif [[ -f /etc/redhat-release ]]; then
        echo "redhat"
    elif [[ -f /etc/arch-release ]]; then
        echo "arch"
    else
        echo "unknown"
    fi
}

function update_package_manager() {
    local os_type=$(detect_os)
    log_info "Updating package manager..."
    
    case $os_type in
        "debian")
            apt-get update -qq
            ;;
        "redhat")
            yum update -y -q || dnf update -y -q
            ;;
        "arch")
            pacman -Sy --noconfirm
            ;;
        *)
            log_warn "Unknown OS, skipping package manager update"
            ;;
    esac
}

function install_git() {
    local os_type=$(detect_os)
    log_info "Installing Git..."
    
    case $os_type in
        "debian")
            apt-get install -y git
            ;;
        "redhat")
            yum install -y git || dnf install -y git
            ;;
        "arch")
            pacman -S --noconfirm git
            ;;
        *)
            log_error "Unsupported OS for automatic Git installation"
            exit 1
            ;;
    esac
}

function install_nodejs() {
    local os_type=$(detect_os)
    log_info "Installing/upgrading Node.js and npm to latest LTS version..."
    
    case $os_type in
        "debian")
            # Remove old Node.js if exists
            if command -v node &> /dev/null; then
                log_info "Removing existing Node.js installation..."
                apt-get remove -y nodejs npm 2>/dev/null || true
                apt-get autoremove -y 2>/dev/null || true
            fi
            
            # Install NodeSource repository for Node.js v20 LTS (more stable)
            log_info "Adding NodeSource repository for Node.js v20 LTS..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            
            log_info "Installing Node.js v20 LTS..."
            apt-get install -y nodejs
            ;;
        "redhat")
            # Remove old Node.js if exists
            if command -v node &> /dev/null; then
                log_info "Removing existing Node.js installation..."
                yum remove -y nodejs npm 2>/dev/null || dnf remove -y nodejs npm 2>/dev/null || true
            fi
            
            # Install NodeSource repository for Node.js v20 LTS
            log_info "Adding NodeSource repository for Node.js v20 LTS..."
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
            
            log_info "Installing Node.js v20 LTS..."
            yum install -y nodejs || dnf install -y nodejs
            ;;
        "arch")
            # Remove old Node.js if exists
            if command -v node &> /dev/null; then
                log_info "Removing existing Node.js installation..."
                pacman -R --noconfirm nodejs npm 2>/dev/null || true
            fi
            
            log_info "Installing Node.js LTS..."
            pacman -S --noconfirm nodejs npm
            ;;
        *)
            log_error "Unsupported OS for automatic Node.js installation"
            exit 1
            ;;
    esac
    
    # Verify installation
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        local new_node_version=$(node --version)
        local new_npm_version=$(npm --version)
        log_info "Successfully installed Node.js $new_node_version and npm $new_npm_version"
    else
        log_error "Failed to install Node.js and npm"
        exit 1
    fi
}

function install_docker() {
    local os_type=$(detect_os)
    log_info "Installing Docker..."
    
    case $os_type in
        "debian")
            # Install Docker using official script
            curl -fsSL https://get.docker.com -o get-docker.sh
            sh get-docker.sh
            rm get-docker.sh
            systemctl enable docker
            systemctl start docker
            ;;
        "redhat")
            yum install -y docker || dnf install -y docker
            systemctl enable docker
            systemctl start docker
            ;;
        "arch")
            pacman -S --noconfirm docker
            systemctl enable docker
            systemctl start docker
            ;;
        *)
            log_error "Unsupported OS for automatic Docker installation"
            exit 1
            ;;
    esac
}

function install_curl() {
    local os_type=$(detect_os)
    log_info "Installing curl..."
    
    case $os_type in
        "debian")
            apt-get install -y curl
            ;;
        "redhat")
            yum install -y curl || dnf install -y curl
            ;;
        "arch")
            pacman -S --noconfirm curl
            ;;
        *)
            log_error "Unsupported OS for automatic curl installation"
            exit 1
            ;;
    esac
}

function check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

function get_nodejs_major_version() {
    if command -v node &> /dev/null; then
        node --version | sed 's/v\([0-9]*\).*/\1/'
    else
        echo "0"
    fi
}

function check_and_install_dependencies() {
    log_info "Checking system dependencies..."
    
    # Check if running as root
    check_root
    
    # Update package manager first
    update_package_manager
    
    # Check and install curl first (needed for other installations)
    if ! command -v curl &> /dev/null; then
        log_warn "curl not found, installing..."
        install_curl
    else
        log_info "curl is already installed"
    fi
    
    # Check and install git
    if ! command -v git &> /dev/null; then
        log_warn "Git not found, installing..."
        install_git
    else
        log_info "Git is already installed"
    fi
    
    # Check and install/upgrade Node.js and npm
    local current_node_major=$(get_nodejs_major_version)
    local min_required_version=18  # Minimum LTS version requirement
    local target_version=20        # Target LTS version for stability
    
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        log_warn "Node.js or npm not found, installing Node.js v20 LTS..."
        install_nodejs
    elif [[ $current_node_major -lt $min_required_version ]]; then
        local current_version=$(node --version)
        log_warn "Node.js $current_version is outdated (minimum required: v$min_required_version), upgrading to v20 LTS..."
        install_nodejs
    elif [[ $current_node_major -ne $target_version ]]; then
        local current_version=$(node --version)
        log_warn "Node.js $current_version detected, upgrading to v20 LTS for better compatibility..."
        install_nodejs
    else
        local node_version=$(node --version)
        local npm_version=$(npm --version)
        log_info "Node.js $node_version and npm $npm_version are compatible"
    fi
    
    # Check and install Docker
    if ! command -v docker &> /dev/null; then
        log_warn "Docker not found, installing..."
        install_docker
    else
        log_info "Docker is already installed"
        # Ensure Docker service is running
        if ! systemctl is-active --quiet docker; then
            log_info "Starting Docker service..."
            systemctl start docker
        fi
    fi
    
    log_info "All dependencies are installed and ready!"
}

function install_panel(){
  log_info "Installing panel from $REPO_URL"
  
  # Check and install system dependencies first
  check_and_install_dependencies
  
  # Remove existing installation if present
  if [[ -d "$APP_DIR" ]]; then
    log_info "Removing existing installation..."
    rm -rf "$APP_DIR"
  fi
  
  # Clone repository
  log_info "Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
  
  # Install backend dependencies
  log_info "Installing backend dependencies..."
  pushd "$APP_DIR/backend"
  npm install
  if [[ $? -ne 0 ]]; then
    log_error "Failed to install backend dependencies"
    exit 1
  fi
  popd
  
  # Install and build frontend dependencies
  log_info "Installing frontend dependencies..."
  pushd "$APP_DIR/frontend"
  npm install
  if [[ $? -ne 0 ]]; then
    log_error "Failed to install frontend dependencies"
    exit 1
  fi
  
  log_info "Building frontend..."
  npm run build
  if [[ $? -ne 0 ]]; then
    log_error "Failed to build frontend"
    exit 1
  fi
  popd
  
  # Create systemd service
  log_info "Creating systemd service..."
  cat >/etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=JS Panel Backend
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
EOF
  
  # Enable and start service
  log_info "Enabling and starting service..."
  systemctl daemon-reload
  systemctl enable --now $SERVICE_NAME
  
  if systemctl is-active --quiet $SERVICE_NAME; then
    log_info "Successfully installed and started service $SERVICE_NAME"
    log_info "Panel should be accessible at http://localhost:8080"
  else
    log_error "Service failed to start. Check logs with: journalctl -u $SERVICE_NAME"
    exit 1
  fi
}

function update_panel(){
  log_info "Updating panel"
  
  if [[ ! -d "$APP_DIR" ]]; then
    log_error "Panel not found at $APP_DIR. Please install first."
    exit 1
  fi
  
  # Update repository
  log_info "Pulling latest changes..."
  pushd "$APP_DIR" || exit 1
  git pull origin main || git pull || {
    log_error "Failed to update repository"
    popd
    exit 1
  }
  popd
  
  # Update backend dependencies
  log_info "Updating backend dependencies..."
  pushd "$APP_DIR/backend"
  npm install --omit=dev || {
    log_error "Failed to update backend dependencies"
    popd
    exit 1
  }
  popd
  
  # Update and rebuild frontend dependencies
  log_info "Updating frontend dependencies..."
  pushd "$APP_DIR/frontend"
  npm install || {
    log_error "Failed to update frontend dependencies"
    popd
    exit 1
  }
  
  log_info "Rebuilding frontend..."
  npm run build || {
    log_error "Failed to rebuild frontend"
    popd
    exit 1
  }
  popd
  
  # Restart service
  log_info "Restarting service..."
  systemctl restart $SERVICE_NAME || {
    log_error "Failed to restart service"
    exit 1
  }
  
  if systemctl is-active --quiet $SERVICE_NAME; then
    log_info "Panel updated and service restarted successfully"
  else
    log_error "Service failed to start after update. Check logs with: journalctl -u $SERVICE_NAME"
    exit 1
  fi
}

function reinstall_panel(){
  log_info "Reinstalling panel"
  
  # Stop service
  log_info "Stopping service..."
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  
  # Clean up containers
  log_info "Cleaning up containers..."
  docker ps -a --filter "label=js-panel" -q | xargs -r docker rm -f 2>/dev/null || true
  
  # Remove installation directory
  log_info "Removing existing installation..."
  rm -rf "$APP_DIR"
  
  # Reinstall
  install_panel
}

function uninstall_panel(){
  log_info "Uninstalling panel"
  
  # Stop and disable service
  log_info "Stopping and disabling service..."
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  systemctl disable $SERVICE_NAME 2>/dev/null || true
  
  # Remove service file
  log_info "Removing service file..."
  rm -f /etc/systemd/system/$SERVICE_NAME.service 2>/dev/null || true
  
  # Clean up containers
  log_info "Cleaning up containers..."
  docker ps -a --filter "label=js-panel" -q | xargs -r docker rm -f 2>/dev/null || true
  
  # Remove installation directory
  log_info "Removing installation directory..."
  rm -rf "$APP_DIR" 2>/dev/null || true
  
  # Reload systemd
  systemctl daemon-reload 2>/dev/null || true
  
  log_info "Panel uninstalled successfully"
}

function show_help() {
    echo "JS Panel Installer Script"
    echo ""
    echo "Usage: $0 {install|update|reinstall|uninstall|help}"
    echo ""
    echo "Commands:"
    echo "  install    - Install JS Panel with all dependencies and build frontend"
    echo "  update     - Update existing JS Panel installation and rebuild frontend"
    echo "  reinstall  - Completely reinstall JS Panel with fresh build"
    echo "  uninstall  - Remove JS Panel and clean up"
    echo "  help       - Show this help message"
    echo ""
    echo "System Requirements:"
    echo "  - Linux (Debian/Ubuntu, RHEL/CentOS/Fedora, or Arch)"
    echo "  - Root privileges (run with sudo)"
    echo "  - Internet connection"
    echo ""
    echo "The installer will automatically:"
    echo "  - Install/upgrade Git, Node.js v20 LTS, Docker, curl"
    echo "  - Install backend dependencies (production mode)"
    echo "  - Install frontend dependencies and build React app"
    echo "  - Create and start systemd service"
    echo "  - Make panel immediately accessible after installation"
    echo ""
    echo "After installation, access the panel at: http://localhost:8080"
    echo ""
}

case "$1" in
  install) install_panel ;;
  update) update_panel ;;
  reinstall) reinstall_panel ;;
  uninstall) uninstall_panel ;;
  help) show_help ;;
  *) 
    log_error "Invalid command: $1"
    echo ""
    show_help
    exit 1
    ;;
esac
