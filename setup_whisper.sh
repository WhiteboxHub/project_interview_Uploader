#!/bin/bash

# Universal Whisper.cpp Setup Script
# Supports: macOS (Apple Silicon & Intel), Linux, Windows WSL

set -e

# Add Homebrew to PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ============================================================================
# CONFIGURATION
# ============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WHISPER_DIR="${WHISPER_DIR:-/tmp/whisper.cpp}"
BIN_DIR="$PROJECT_ROOT/bin"
MODEL_NAME="${WHISPER_MODEL:-medium}"  # tiny, base, small, medium, large
ENV_FILE="$PROJECT_ROOT/.env"

# ============================================================================
# COLORS
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

detect_platform() {
    case "$(uname -s)" in
        Darwin*)    echo "macos" ;;
        Linux*)     echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        arm64|aarch64)  echo "arm64" ;;
        x86_64|amd64)   echo "x86_64" ;;
        *)              echo "unknown" ;;
    esac
}

check_dependencies() {
    local missing=()
    
    # Universal dependencies
    command -v git >/dev/null 2>&1 || missing+=("git")
    command -v cmake >/dev/null 2>&1 || missing+=("cmake")
    
    # Platform-specific
    local platform=$(detect_platform)
    if [ "$platform" = "macos" ]; then
        command -v clang >/dev/null 2>&1 || missing+=("clang (install Xcode Command Line Tools)")
    else
        command -v gcc >/dev/null 2>&1 || missing+=("gcc")
        command -v g++ >/dev/null 2>&1 || missing+=("g++")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        echo ""
        echo "Install missing dependencies:"
        if [ "$platform" = "macos" ]; then
            echo "  xcode-select --install"
            echo "  brew install cmake git"
        elif [ "$platform" = "linux" ]; then
            echo "  sudo apt-get update && sudo apt-get install -y git cmake build-essential"
        fi
        exit 1
    fi
}

# ============================================================================
# MAIN SETUP
# ============================================================================

main() {
    echo ""
    log_info "Whisper.cpp Universal Setup"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Detect system
    PLATFORM=$(detect_platform)
    ARCH=$(detect_arch)
    
    log_info "Platform: $PLATFORM"
    log_info "Architecture: $ARCH"
    echo ""
    
    # Check dependencies
    log_info "Checking dependencies..."
    check_dependencies
    log_success "All dependencies found"
    echo ""
    
    # Create bin directory
    mkdir -p "$BIN_DIR"
    
    # Clone/Update Whisper.cpp
    if [ -d "$WHISPER_DIR" ]; then
        log_info "Updating existing Whisper.cpp repository..."
        cd "$WHISPER_DIR"
        git pull || log_warning "Could not pull latest changes (continuing with existing version)"
    else
        log_info "Cloning Whisper.cpp repository..."
        git clone https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
        cd "$WHISPER_DIR"
    fi
    log_success "Repository ready"
    echo ""
    
    # Build with platform-specific optimizations
    log_info "Building Whisper.cpp (this may take a few minutes)..."
    rm -rf build
    mkdir build
    cd build
    
    # Platform-specific CMake flags
    CMAKE_FLAGS=(
        -DCMAKE_BUILD_TYPE=Release
        -DWHISPER_BUILD_TESTS=OFF
        -DWHISPER_BUILD_EXAMPLES=ON
        -DBUILD_SHARED_LIBS=ON
        -DCMAKE_INSTALL_RPATH="@executable_path"
        -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON
    )
    
    if [ "$PLATFORM" = "macos" ]; then
        if [ "$ARCH" = "arm64" ]; then
            log_info "Enabling Apple Silicon optimizations (Metal + Accelerate)..."
            CMAKE_FLAGS+=(
                -DGGML_METAL=ON
                -DGGML_ACCELERATE=ON
                -DGGML_METAL_EMBED_LIBRARY=ON
            )
        else
            log_info "Enabling Intel Mac optimizations (Accelerate)..."
            CMAKE_FLAGS+=(
                -DGGML_ACCELERATE=ON
            )
        fi
    elif [ "$PLATFORM" = "linux" ]; then
        log_info "Enabling Linux optimizations..."
        CMAKE_FLAGS+=(
            -DGGML_BLAS=ON
            -DGGML_CUDA=OFF  # Set to ON if you have NVIDIA GPU with CUDA
        )
    fi
    
    # Run CMake
    cmake .. "${CMAKE_FLAGS[@]}"
    
    # Build
    NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    cmake --build . -j "$NPROC"
    
    log_success "Build complete"
    echo ""
    
    # Copy binaries and libraries
    log_info "Installing to $BIN_DIR..."
    
    # Copy whisper binary
    if [ -f "bin/whisper-cli" ]; then
        cp bin/whisper-cli "$BIN_DIR/whisper"
        chmod +x "$BIN_DIR/whisper"
        log_success "Installed whisper binary (whisper-cli)"
    elif [ -f "bin/main" ]; then
        cp bin/main "$BIN_DIR/whisper"
        chmod +x "$BIN_DIR/whisper"
        log_success "Installed whisper binary (main)"
    else
        log_error "Whisper binary not found at bin/whisper-cli or bin/main"
        exit 1
    fi
    
    # Copy shared libraries
    log_info "Copying shared libraries..."
    find . -name "*.dylib" -type f -exec cp {} "$BIN_DIR/" \; 2>/dev/null || true
    find . -name "*.so" -type f -exec cp {} "$BIN_DIR/" \; 2>/dev/null || true
    
    # Fix library paths (macOS specific)
    if [ "$PLATFORM" = "macos" ]; then
        log_info "Fixing library paths..."
        cd "$BIN_DIR"
        
        for dylib in *.dylib; do
            [ -f "$dylib" ] || continue
            install_name_tool -change "@rpath/$dylib" "@executable_path/$dylib" whisper 2>/dev/null || true
            install_name_tool -id "@executable_path/$dylib" "$dylib" 2>/dev/null || true
        done
        
        # Fix inter-library dependencies
        for dylib in libwhisper*.dylib; do
            [ -f "$dylib" ] || continue
            for ggml_lib in libggml*.dylib; do
                [ -f "$ggml_lib" ] || continue
                install_name_tool -change "@rpath/$ggml_lib" "@executable_path/$ggml_lib" "$dylib" 2>/dev/null || true
            done
        done
    fi
    
    log_success "Libraries installed"
    echo ""
    
    # Download model if not exists
    MODEL_FILE="$BIN_DIR/ggml-$MODEL_NAME.bin"
    if [ ! -f "$MODEL_FILE" ]; then
        log_info "Downloading Whisper $MODEL_NAME model (~1.5GB for medium)..."
        cd "$BIN_DIR"
        
        # Use whisper.cpp download script if available
        if [ -f "$WHISPER_DIR/models/download-ggml-model.sh" ]; then
            bash "$WHISPER_DIR/models/download-ggml-model.sh" "$MODEL_NAME"
        else
            MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL_NAME.bin"
            log_info "Downloading from: $MODEL_URL"
            if command -v wget >/dev/null 2>&1; then
                wget -O "$MODEL_FILE" "$MODEL_URL"
            elif command -v curl >/dev/null 2>&1; then
                curl -L -o "$MODEL_FILE" "$MODEL_URL"
            else
                log_error "Neither wget nor curl found. Please download manually:"
                log_error "$MODEL_URL"
                exit 1
            fi
        fi
        log_success "Model downloaded"
    else
        log_success "Model already exists (skipping download)"
    fi
    echo ""
    
    # Test installation
    log_info "Testing Whisper binary..."
    if "$BIN_DIR/whisper" -h >/dev/null 2>&1; then
        log_success "Whisper binary works correctly!"
    else
        log_warning "Whisper binary test inconclusive (might still work)"
    fi
    echo ""
    
    # Update .env file
    log_info "Updating .env configuration..."
    
    # Create .env if it doesn't exist
    touch "$ENV_FILE"
    
    # Remove old WHISPER entries (macOS and Linux compatible approach)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' '/^WHISPER_CPP_PATH=/d' "$ENV_FILE"
        sed -i '' '/^WHISPER_MODEL_PATH=/d' "$ENV_FILE"
    else
        sed -i '/^WHISPER_CPP_PATH=/d' "$ENV_FILE"
        sed -i '/^WHISPER_MODEL_PATH=/d' "$ENV_FILE"
    fi
    
    # Add new entries
    echo "WHISPER_CPP_PATH=$BIN_DIR/whisper" >> "$ENV_FILE"
    echo "WHISPER_MODEL_PATH=$MODEL_FILE" >> "$ENV_FILE"
    
    log_success "Environment configured"
    echo ""
    
    # Print summary
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_success "Setup Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📍 Binary: $BIN_DIR/whisper"
    echo "🧠 Model: $MODEL_FILE"
    echo "📝 Config: $ENV_FILE"
    echo ""
    
    # Platform-specific optimizations enabled
    if [ "$PLATFORM" = "macos" ] && [ "$ARCH" = "arm64" ]; then
        log_success "Apple Silicon optimizations enabled:"
        echo "   • Metal GPU acceleration"
        echo "   • Accelerate framework"
        echo "   • Native ARM64 instructions"
    elif [ "$PLATFORM" = "macos" ]; then
        log_success "Intel Mac optimizations enabled:"
        echo "   • Accelerate framework"
        echo "   • AVX/AVX2 instructions"
    elif [ "$PLATFORM" = "linux" ]; then
        log_success "Linux optimizations enabled:"
        echo "   • BLAS acceleration"
        echo "   • Multi-threading"
    fi
    echo ""
    
    log_info "Usage: Start your Electron app and transcription will work automatically!"
    echo ""
    echo "To use a different model in the future, run:"
    echo "  WHISPER_MODEL=small ./setup_whisper.sh"
    echo ""
    echo "Available models: tiny, base, small, medium, large"
}

# ============================================================================
# RUN
# ============================================================================

main "$@"
