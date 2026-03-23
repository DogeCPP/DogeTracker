#if defined(_WIN32) || defined(_WIN64)
#include <GL/gl.h>
#include <windows.h>
#define GL_BGRA GL_BGRA_EXT
#define GL_CLAMP_TO_EDGE 0x812F
#elif __linux__
#include <GL/gl.h>
#elif __GNUC__
#define GL_SILENCE_DEPRECATION 1
#include <OpenGL/gl.h>
#endif

#define set_brightness(value) glColor4f(value, value, value, 1.0f)
#define debug(format, ...)                                                             \
    {                                                                                  \
        char buffer[1024];                                                             \
        snprintf(buffer, sizeof(buffer), "[dogetracker] " format, ##__VA_ARGS__);     \
        XPLMDebugString(buffer);                                                       \
    }

#define PRODUCT_NAME        "dogetracker"
#define FRIENDLY_NAME       "DogeTracker"
#define VERSION             "1.0.0"
#define VERSION_CHECK_URL   "https://api.github.com/repos/yourusername/dogetracker/releases?per_page=1&page=1"

// DogeTracker backend – replace with your deployed server URL
#define DOGETRACKER_API_URL "https://your-dogetracker-server.com"

#define ALL_PLUGINS_DIRECTORY  "/Resources/plugins/"
#define PLUGIN_DIRECTORY       (ALL_PLUGINS_DIRECTORY PRODUCT_NAME)
#define BUNDLE_ID              "com.dogetracker." PRODUCT_NAME

// Default page shown in AviTab
#define DEFAULT_HOMEPAGE    DOGETRACKER_API_URL "/map"

// See https://forums.x-plane.org/index.php?/forums/topic/261574-tutorial-integrating-avitab/#findComment-2319386
#define AVITAB_USE_FIXED_ASPECT_RATIO 1

#define SCALE_IMAGES 1

#define REFRESH_INTERVAL_SECONDS_FAST  0.1
#define REFRESH_INTERVAL_SECONDS_SLOW  2.0

// How often (seconds) we push our position to the DogeTracker server
#define TRACKER_BROADCAST_INTERVAL_SECONDS  5.0
