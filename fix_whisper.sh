                                                                                                                                                                                                                                            #!/bin/bash

# Fix Whisper.cpp Library Loading Issue
# This script rebuilds and properly installs whisper.cpp with all required libraries

set -e

echo "🔧 Fixing Whisper.cpp library loading issue..."

# Configuration
WHISPER_DIR="/tmp/whisper.cpp"
BIN_DIR="/Users/innovapathinc/Desktop/interview-uploader/bin"

# Create bin directory if it doesn't exist
mkdir -p "$BIN_DIR"

# Step 1: Clone or update whisper.cpp
if [ -d "$WHISPER_DIR" ]; then
    echo "📦 Updating existing whisper.cpp..."
    cd "$WHISPER_DIR"
    git pull || echo "Warning: Could not pull latest changes"
else
    echo "📦 Cloning whisper.cpp..."
    git clone https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
    cd "$WHISPER_DIR"
fi

# Step 2: Build whisper.cpp with proper settings
echo "🔨 Building whisper.cpp..."
rm -rf build
mkdir build
cd build

# Build with RPATH set to executable directory
cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=ON \
    -DCMAKE_INSTALL_RPATH="@executable_path" \
    -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON

cmake --build . -j 8

# Step 3: Copy binary and all libraries to bin directory
echo "📋 Copying files to $BIN_DIR..."

# Copy the main whisper binary
if [ -f "bin/main" ]; then
    cp bin/main "$BIN_DIR/whisper"
    chmod +x "$BIN_DIR/whisper"
    echo "✅ Copied whisper binary"
else
    echo "❌ Error: whisper binary not found at bin/main"
    exit 1
fi

# Copy all required libraries
echo "📚 Copying shared libraries..."

# Find and copy all dylib files
find . -name "*.dylib" -type f -exec cp {} "$BIN_DIR/" \;

# Also copy symlinks properly
if [ -f "src/libwhisper.1.dylib" ]; then
    cp -P src/libwhisper.*.dylib "$BIN_DIR/" 2>/dev/null || true
fi

if [ -f "ggml/src/libggml.0.dylib" ]; then
    cp -P ggml/src/libggml*.dylib "$BIN_DIR/" 2>/dev/null || true
fi

# Step 4: Fix install names in the binary to use @executable_path
echo "🔧 Fixing library paths in binary..."

cd "$BIN_DIR"

# Use install_name_tool to update library paths
for dylib in libwhisper*.dylib libggml*.dylib; do
    if [ -f "$dylib" ]; then
        # Fix the binary to look in same directory
        install_name_tool -change "@rpath/$dylib" "@executable_path/$dylib" whisper 2>/dev/null || true
        
        # Fix the library's own ID
        install_name_tool -id "@executable_path/$dylib" "$dylib" 2>/dev/null || true
        
        echo "  ✓ Fixed $dylib"
    fi
done

# Fix dependencies between libraries
for dylib in libwhisper*.dylib; do
    if [ -f "$dylib" ]; then
        # Fix references to ggml libraries
        for ggml_lib in libggml*.dylib; do
            if [ -f "$ggml_lib" ]; then
                install_name_tool -change "@rpath/$ggml_lib" "@executable_path/$ggml_lib" "$dylib" 2>/dev/null || true
            fi
        done
    fi
done

echo ""
echo "✅ Installation complete!"
echo ""
echo "📍 Binary location: $BIN_DIR/whisper"
echo "📚 Libraries location: $BIN_DIR/*.dylib"
echo ""
echo "🧪 Testing whisper binary..."
if "$BIN_DIR/whisper" -h > /dev/null 2>&1; then
    echo "✅ Whisper binary works correctly!"
else
    echo "⚠️ Warning: Whisper binary test failed"
    echo "Checking dependencies:"
    otool -L "$BIN_DIR/whisper"
fi

echo ""
echo "Update your .env file with these paths:"
echo "WHISPER_CPP_PATH=$BIN_DIR/whisper"
echo "WHISPER_MODEL_PATH=$BIN_DIR/ggml-medium.bin"
