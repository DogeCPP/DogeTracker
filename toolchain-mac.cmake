set(CMAKE_SYSTEM_NAME Darwin)
set(CMAKE_C_COMPILER   clang)
set(CMAKE_CXX_COMPILER clang++)
# Universal binary — runs natively on both Intel and Apple Silicon
set(CMAKE_OSX_ARCHITECTURES    "arm64;x86_64")
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0")
