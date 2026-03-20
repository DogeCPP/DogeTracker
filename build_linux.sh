#!/usr/bin/env bash
# =============================================================================
# DogeTracker  –  build_linux.sh
# Cross-compile for Windows 64-bit on Ubuntu using MinGW-w64
#
#   chmod +x build_linux.sh
#   ./build_linux.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLU}[INFO]${NC}  $*"; }
success() { echo -e "${GRN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YLW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR ]${NC}  $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"

echo ""
echo -e "${BLU}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLU}║   🐶  DogeTracker  –  Linux Build        ║${NC}"
echo -e "${BLU}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Install build tools ───────────────────────────────
info "Installing MinGW-w64 + build tools (needs sudo)..."
sudo apt-get update -qq
sudo apt-get install -y \
    mingw-w64 \
    gcc-mingw-w64-x86-64-posix \
    g++-mingw-w64-x86-64-posix \
    cmake \
    ninja-build \
    git \
    unzip \
    wget
success "Build tools ready."

# ── Step 2: Verify POSIX thread compiler ─────────────────────
info "Checking POSIX-thread MinGW compiler..."
if ! command -v x86_64-w64-mingw32-g++-posix &>/dev/null; then
    error "x86_64-w64-mingw32-g++-posix not found.\n  Run: sudo apt install g++-mingw-w64-x86-64-posix"
fi
VER=$(x86_64-w64-mingw32-g++-posix --version | head -1)
success "Compiler: $VER"

# ── Step 3: X-Plane SDK ───────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────"
echo "  X-Plane SDK  (free download)"
echo "  https://developer.x-plane.com/sdk/"
echo "  Extract so you have:"
echo "    <SDK>/CHeaders/XPLM/XPLMPlugin.h"
echo "    <SDK>/Libraries/Win/XPLM_64.lib"
echo "────────────────────────────────────────────────────────"

if [[ -z "${XPLANE_SDK_PATH:-}" ]]; then
    read -r -p "  Enter path to SDK folder: " XPLANE_SDK_PATH
fi
XPLANE_SDK_PATH="${XPLANE_SDK_PATH%/}"

[[ -f "${XPLANE_SDK_PATH}/CHeaders/XPLM/XPLMPlugin.h" ]] \
    || error "XPLMPlugin.h not found at: ${XPLANE_SDK_PATH}/CHeaders/XPLM/"
[[ -f "${XPLANE_SDK_PATH}/Libraries/Win/XPLM_64.lib" ]] \
    || error "XPLM_64.lib not found at: ${XPLANE_SDK_PATH}/Libraries/Win/"
success "SDK found: ${XPLANE_SDK_PATH}"

# ── Step 4: CMake configure ───────────────────────────────────
info "Configuring CMake..."
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

cmake "${SCRIPT_DIR}" \
    -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="${SCRIPT_DIR}/toolchain-mingw64.cmake" \
    -DCMAKE_BUILD_TYPE=Release \
    -DXPLANE_SDK_PATH="${XPLANE_SDK_PATH}"

success "Configure done."

# ── Step 5: Build ─────────────────────────────────────────────
echo ""
info "Building... (cpp-httplib downloads automatically on first run)"
cmake --build . --parallel "$(nproc)"

# ── Step 6: Verify ───────────────────────────────────────────
PLUGIN="${BUILD_DIR}/package/DogeTracker/64/win.xpl"

[[ -f "$PLUGIN" ]] || error "Build finished but win.xpl not found at: $PLUGIN"

FILE_OUT=$(file "$PLUGIN")
[[ "$FILE_OUT" == *"PE32+"* ]] || error "win.xpl does not look like a Windows binary: $FILE_OUT"

# Check libwinpthread is NOT in the DLL imports (Error 126 check)
IMPORTS=$(x86_64-w64-mingw32-objdump -p "$PLUGIN" | grep "DLL Name" || true)
if echo "$IMPORTS" | grep -qi "winpthread"; then
    warn "libwinpthread-1.dll is still imported — plugin may fail with Error 126 on Windows!"
    warn "DLL imports:"
    echo "$IMPORTS"
else
    success "No libwinpthread dependency — plugin is self-contained ✅"
fi

SIZE=$(du -sh "$PLUGIN" | cut -f1)

echo ""
echo -e "${GRN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║  ✅  DogeTracker build successful!               ║${NC}"
echo -e "${GRN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  win.xpl size  : ${SIZE}"
echo "  DLL imports   :"
echo "$IMPORTS" | sed 's/^/    /'
echo ""
echo "  Plugin package:"
echo "    ${BUILD_DIR}/package/DogeTracker/"
echo ""
echo "  ── INSTALL ────────────────────────────────────────────"
echo "  Copy to your Windows PC:"
echo "    <X-Plane 12>\\Resources\\plugins\\DogeTracker\\"
echo "                                         64\\win.xpl"
echo "                                         web\\"
echo "                                         config.json"
echo ""
echo "  Then start X-Plane 12 and open in browser:"
echo "    http://127.0.0.1:4000"
echo ""
echo "  ── TRANSFER ───────────────────────────────────────────"
echo "  Zip:  cd ${BUILD_DIR}/package && zip -r DogeTracker.zip DogeTracker/"
echo ""
