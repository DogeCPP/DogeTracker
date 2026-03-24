cmake_minimum_required(VERSION 3.20)
project(DogeTracker VERSION 1.0.2 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ── Detect platform ──────────────────────────────────────────────────
if(APPLE)
    set(PLATFORM_MAC TRUE)
    set(PLATFORM_NAME "mac")
elseif(UNIX)
    set(PLATFORM_LIN TRUE)
    set(PLATFORM_NAME "lin")
elseif(WIN32 OR CMAKE_CROSSCOMPILING AND CMAKE_SYSTEM_NAME STREQUAL "Windows" OR MINGW)
    set(PLATFORM_WIN TRUE)
    set(PLATFORM_NAME "win")
else()
    message(FATAL_ERROR "Unsupported platform.")
endif()

message(STATUS "Building DogeTracker for: ${PLATFORM_NAME}")

# ── X-Plane SDK ───────────────────────────────────────────────────────
set(XPLANE_SDK_PATH "" CACHE PATH "X-Plane SDK root (must contain CHeaders/ and Libraries/)")
if(NOT XPLANE_SDK_PATH)
    message(FATAL_ERROR "XPLANE_SDK_PATH is not set. Download from https://developer.x-plane.com/sdk/")
endif()
if(NOT EXISTS "${XPLANE_SDK_PATH}/CHeaders/XPLM/XPLMPlugin.h")
    message(FATAL_ERROR "XPLMPlugin.h not found in: ${XPLANE_SDK_PATH}/CHeaders/XPLM/")
endif()

# ── cpp-httplib (header-only, cross-platform HTTP server) ────────────
include(FetchContent)
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.15.3
    GIT_SHALLOW    TRUE
)
set(HTTPLIB_COMPILE OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(httplib)

# ── Plugin target ────────────────────────────────────────────────────
add_library(DogeTracker SHARED
    src/plugin.cpp
    src/server.cpp
)

target_include_directories(DogeTracker PRIVATE
    src
    "${httplib_SOURCE_DIR}"
    "${XPLANE_SDK_PATH}/CHeaders/XPLM"
    "${XPLANE_SDK_PATH}/CHeaders/Widgets"
)

# ── Platform compile definitions ─────────────────────────────────────
if(PLATFORM_MAC)
    target_compile_definitions(DogeTracker PRIVATE
        APL=1 IBM=0 LIN=0
        XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM400=1
        GL_SILENCE_DEPRECATION=1
    )
elseif(PLATFORM_LIN)
    target_compile_definitions(DogeTracker PRIVATE
        APL=0 IBM=0 LIN=1
        XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM400=1
    )
elseif(PLATFORM_WIN)
    target_compile_definitions(DogeTracker PRIVATE
        APL=0 IBM=1 LIN=0
        XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM400=1
        WIN32_LEAN_AND_MEAN NOMINMAX _USE_MATH_DEFINES
    )
endif()

# ── Platform link settings ────────────────────────────────────────────
if(PLATFORM_MAC)
    find_library(XPLM_LIBRARY XPLM "${XPLANE_SDK_PATH}/Libraries/Mac/")
    target_compile_options(DogeTracker PRIVATE -O2 -Wall -Wextra -Wno-unused-parameter)
    target_link_options(DogeTracker PRIVATE
        -fvisibility=hidden
        -bundle
        -Wl,-undefined,dynamic_lookup
    )
    target_link_libraries(DogeTracker PRIVATE
        "-framework Cocoa"
        "-framework OpenGL"
    )
    set_target_properties(DogeTracker PROPERTIES
        OUTPUT_NAME              "mac_x64/DogeTracker"
        SUFFIX                   ".xpl"
        PREFIX                   ""
        OSX_ARCHITECTURES        "arm64;x86_64"
    )

elseif(PLATFORM_LIN)
    find_library(XPLM_LIBRARY XPLM_64.so "${XPLANE_SDK_PATH}/Libraries/Lin/")
    target_compile_options(DogeTracker PRIVATE -O2 -Wall -Wextra -Wno-unused-parameter -fPIC)
    target_link_options(DogeTracker PRIVATE
        -fvisibility=hidden
        -nodefaultlibs
        -fPIC
        -rdynamic
    )
    target_link_libraries(DogeTracker PRIVATE ${XPLM_LIBRARY})
    set_target_properties(DogeTracker PROPERTIES
        OUTPUT_NAME              "lin_x64/DogeTracker"
        SUFFIX                   ".xpl"
        PREFIX                   ""
    )

elseif(PLATFORM_WIN)
    set(XPLM_LIB "${XPLANE_SDK_PATH}/Libraries/Win/XPLM_64.lib")
    if(NOT EXISTS "${XPLM_LIB}")
        message(FATAL_ERROR "XPLM_64.lib not found at: ${XPLM_LIB}")
    endif()

    find_file(WINPTHREAD_STATIC NAMES libwinpthread.a
        PATHS /usr/x86_64-w64-mingw32/lib /usr/lib/x86_64-w64-mingw32
        NO_DEFAULT_PATH NO_CMAKE_FIND_ROOT_PATH)
    if(NOT WINPTHREAD_STATIC)
        message(FATAL_ERROR "libwinpthread.a not found. Run: sudo apt install gcc-mingw-w64-x86-64-posix")
    endif()

    target_compile_options(DogeTracker PRIVATE -O2 -Wall -Wextra -Wno-unused-parameter)
    target_link_options(DogeTracker PRIVATE
        -static-libgcc
        -Wl,--enable-stdcall-fixup
        -Wl,--allow-multiple-definition
        $<$<NOT:$<CONFIG:Debug>>:-Wl,--strip-all>
    )
    target_link_libraries(DogeTracker PRIVATE
        "${XPLM_LIB}"
        -Wl,--whole-archive "${WINPTHREAD_STATIC}" -Wl,--no-whole-archive
        -Wl,-Bstatic -lstdc++ -Wl,-Bdynamic
        -lws2_32 -lwininet -liphlpapi
    )
    set_target_properties(DogeTracker PROPERTIES
        OUTPUT_NAME              "win_x64/DogeTracker"
        SUFFIX                   ".xpl"
        PREFIX                   ""
    )
endif()

# ── Package: copy web/ and config.json next to the .xpl ──────────────
set(PACKAGE_DIR "${CMAKE_BINARY_DIR}/package/DogeTracker")

add_custom_command(TARGET DogeTracker POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_SOURCE_DIR}/web" "${PACKAGE_DIR}/web"
)
add_custom_command(TARGET DogeTracker POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/config.json" "${PACKAGE_DIR}/config.json"
)

message(STATUS "DogeTracker v1.0.2")
message(STATUS "  SDK    : ${XPLANE_SDK_PATH}")
message(STATUS "  Output : ${PACKAGE_DIR}/${PLATFORM_NAME}_x64/DogeTracker.xpl")
