# ============================================================
# toolchain-mingw64.cmake  –  DogeTracker
# Cross-compile for Windows 64-bit from Linux using MinGW-w64
#
# Requires the POSIX-thread variant (supports std::thread):
#   sudo apt install gcc-mingw-w64-x86-64-posix \
#                    g++-mingw-w64-x86-64-posix
#
# Usage:
#   cmake .. \
#     -DCMAKE_TOOLCHAIN_FILE=../toolchain-mingw64.cmake \
#     -DXPLANE_SDK_PATH=/path/to/SDK
# ============================================================

set(CMAKE_SYSTEM_NAME      Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

# Use the *-posix variant: supports std::thread / std::mutex.
# The plain x86_64-w64-mingw32-g++ on Ubuntu uses win32 threads
# and will fail to compile C++17 threading code.
set(CMAKE_C_COMPILER   x86_64-w64-mingw32-gcc-posix)
set(CMAKE_CXX_COMPILER x86_64-w64-mingw32-g++-posix)
set(CMAKE_RC_COMPILER  x86_64-w64-mingw32-windres)

# Do NOT search host (Linux) paths for libraries/includes
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
