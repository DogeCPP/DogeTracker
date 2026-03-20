cmake_minimum_required(VERSION 3.20)
project(DogeTracker VERSION 1.0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(CMAKE_CROSSCOMPILING AND CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(IS_MINGW TRUE)
elseif(MINGW)
    set(IS_MINGW TRUE)
elseif(MSVC)
    set(IS_MINGW FALSE)
else()
    message(FATAL_ERROR "Unsupported platform. Use toolchain-mingw64.cmake for Linux builds.")
endif()

set(XPLANE_SDK_PATH "" CACHE PATH "X-Plane SDK root (must contain CHeaders/ and Libraries/)")

if(NOT XPLANE_SDK_PATH)
    message(FATAL_ERROR "XPLANE_SDK_PATH is not set. Download from https://developer.x-plane.com/sdk/")
endif()

if(NOT EXISTS "${XPLANE_SDK_PATH}/CHeaders/XPLM/XPLMPlugin.h")
    message(FATAL_ERROR "XPLMPlugin.h not found in: ${XPLANE_SDK_PATH}/CHeaders/XPLM/")
endif()

set(XPLM_LIB "${XPLANE_SDK_PATH}/Libraries/Win/XPLM_64.lib")
if(NOT EXISTS "${XPLM_LIB}")
    message(FATAL_ERROR "XPLM_64.lib not found at: ${XPLM_LIB}")
endif()

include(FetchContent)
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.15.3
    GIT_SHALLOW    TRUE
)
set(HTTPLIB_COMPILE OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(httplib)

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

target_compile_definitions(DogeTracker PRIVATE
    IBM=1
    XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM400=1
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    _USE_MATH_DEFINES
)

if(IS_MINGW)
    target_compile_options(DogeTracker PRIVATE -O2 -Wall -Wextra -Wno-unused-parameter)

    find_file(WINPTHREAD_STATIC
        NAMES libwinpthread.a
        PATHS /usr/x86_64-w64-mingw32/lib /usr/lib/x86_64-w64-mingw32
        NO_DEFAULT_PATH NO_CMAKE_FIND_ROOT_PATH
    )
    if(NOT WINPTHREAD_STATIC)
        message(FATAL_ERROR "libwinpthread.a not found. Run: sudo apt install gcc-mingw-w64-x86-64-posix")
    endif()

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
        -lws2_32
        -lwininet
        -liphlpapi
    )
else()
    target_compile_options(DogeTracker PRIVATE /W3 /O2 /MP /wd4267 /wd4244)
    target_link_libraries(DogeTracker PRIVATE "${XPLM_LIB}" ws2_32 wininet iphlpapi)
endif()

set(PACKAGE_DIR "${CMAKE_BINARY_DIR}/package/DogeTracker")

set_target_properties(DogeTracker PROPERTIES
    OUTPUT_NAME              "win"
    SUFFIX                   ".xpl"
    PREFIX                   ""
    RUNTIME_OUTPUT_DIRECTORY "${PACKAGE_DIR}/64"
    LIBRARY_OUTPUT_DIRECTORY "${PACKAGE_DIR}/64"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${PACKAGE_DIR}/64"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG   "${PACKAGE_DIR}/64"
    LIBRARY_OUTPUT_DIRECTORY_RELEASE "${PACKAGE_DIR}/64"
    LIBRARY_OUTPUT_DIRECTORY_DEBUG   "${PACKAGE_DIR}/64"
)

add_custom_command(TARGET DogeTracker POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_SOURCE_DIR}/web" "${PACKAGE_DIR}/web"
)
add_custom_command(TARGET DogeTracker POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/config.json" "${PACKAGE_DIR}/config.json"
)

message(STATUS "DogeTracker v1.0.1")
message(STATUS "  SDK    : ${XPLANE_SDK_PATH}")
message(STATUS "  Output : ${PACKAGE_DIR}/64/win.xpl")
