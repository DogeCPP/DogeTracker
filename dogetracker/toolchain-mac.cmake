SET(CMAKE_SYSTEM_NAME Darwin)
SET(CMAKE_C_COMPILER clang)
SET(CMAKE_CXX_COMPILER clang++)

# DogeTracker supports both Apple Silicon (arm64) and Intel (x86_64) Macs.
# X-Plane 12 ships a universal binary, so we build a fat binary.
# X-Plane 11 only ran on Intel, so we restrict to x86_64 there.
if(DEFINED XPLANE_VERSION AND NOT XPLANE_VERSION STREQUAL "")
  if(XPLANE_VERSION GREATER_EQUAL 12)
      # Universal binary: runs natively on both Apple Silicon and Intel
      SET(CMAKE_OSX_ARCHITECTURES "arm64;x86_64")
      SET(CMAKE_OSX_DEPLOYMENT_TARGET "11.0")  # macOS 11 required for arm64
  else()
      SET(CMAKE_OSX_ARCHITECTURES "x86_64")
      SET(CMAKE_OSX_DEPLOYMENT_TARGET "10.12")
  endif()
endif()

# Tell CMake we support both slices so it doesn't complain about missing libs
SET(CMAKE_OSX_SYSROOT "macosx")
