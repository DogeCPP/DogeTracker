#include "XPLMPlugin.h"
#include "XPLMProcessing.h"
#include "XPLMDataAccess.h"
#include "XPLMUtilities.h"
#include "XPLMNavigation.h"
#include "server.h"
#include "config_reader.h"

// ── Platform-specific network includes for IP discovery ──────────────
#if IBM
  #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
  #endif
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #include <iphlpapi.h>
#elif APL || LIN
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <arpa/inet.h>
  #include <ifaddrs.h>
  #include <netdb.h>
#endif

#include <cstring>
#include <string>
#include <memory>
#include <vector>
#include <utility>

static std::unique_ptr<WebServer> g_server;

static XPLMDataRef dr_lat     = nullptr;
static XPLMDataRef dr_lon     = nullptr;
static XPLMDataRef dr_heading = nullptr;
static XPLMDataRef dr_pitch   = nullptr;
static XPLMDataRef dr_roll    = nullptr;
static XPLMDataRef dr_elev    = nullptr;
static XPLMDataRef dr_agl     = nullptr;
static XPLMDataRef dr_gs      = nullptr;
static XPLMDataRef dr_ias     = nullptr;
static XPLMDataRef dr_vs      = nullptr;
static XPLMDataRef dr_wdir    = nullptr;
static XPLMDataRef dr_wspd    = nullptr;

static constexpr float M_TO_FT   = 3.28084f;
static constexpr float MS_TO_KT  = 1.94384f;
static constexpr float MS_TO_FPM = 196.850f;

static inline double getd(XPLMDataRef r) { return r ? XPLMGetDatad(r) : 0.0; }
static inline float  getf(XPLMDataRef r) { return r ? XPLMGetDataf(r) : 0.0f; }

static std::string GetPluginRoot() {
    char raw[512] = {};
    XPLMGetPluginInfo(XPLMGetMyID(), nullptr, raw, nullptr, nullptr);
    std::string p(raw);
    auto s1 = p.find_last_of("/\\");
    if (s1 != std::string::npos) p = p.substr(0, s1);
    auto s2 = p.find_last_of("/\\");
    if (s2 != std::string::npos) p = p.substr(0, s2);
    return p;
}

// ── Cross-platform LAN IP discovery ──────────────────────────────────
static void LogNetworkAddresses(int port) {
#if IBM
    char hostname[256] = {};
    if (gethostname(hostname, sizeof(hostname)) == 0) {
        addrinfo hints = {}, *res = nullptr;
        hints.ai_family   = AF_INET;
        hints.ai_socktype = SOCK_STREAM;
        if (getaddrinfo(hostname, nullptr, &hints, &res) == 0) {
            for (addrinfo* p = res; p != nullptr; p = p->ai_next) {
                char ip[INET_ADDRSTRLEN] = {};
                sockaddr_in* sa = reinterpret_cast<sockaddr_in*>(p->ai_addr);
                inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip));
                std::string ipStr(ip);
                if (ipStr.rfind("127.", 0) == 0) continue;
                XPLMDebugString(("[DogeTracker] Network: http://" + ipStr + ":" + std::to_string(port) + "\n").c_str());
            }
            freeaddrinfo(res);
        }
    }
#elif APL || LIN
    struct ifaddrs* ifap = nullptr;
    if (getifaddrs(&ifap) == 0) {
        for (struct ifaddrs* ifa = ifap; ifa != nullptr; ifa = ifa->ifa_next) {
            if (!ifa->ifa_addr || ifa->ifa_addr->sa_family != AF_INET) continue;
            char ip[INET_ADDRSTRLEN] = {};
            sockaddr_in* sa = reinterpret_cast<sockaddr_in*>(ifa->ifa_addr);
            inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip));
            std::string ipStr(ip);
            if (ipStr.rfind("127.", 0) == 0) continue;
            XPLMDebugString(("[DogeTracker] Network: http://" + ipStr + ":" + std::to_string(port) + "\n").c_str());
        }
        freeifaddrs(ifap);
    }
#endif
}

static const char* FmsTypeName(XPLMNavType t) {
    if (t & xplm_Nav_Airport) return "APT";
    if (t & xplm_Nav_VOR)     return "VOR";
    if (t & xplm_Nav_NDB)     return "NDB";
    if (t & xplm_Nav_Fix)     return "FIX";
    if (t & xplm_Nav_LatLon)  return "LATLON";
    return "WPT";
}

// Read the active FMS flight plan. XPLM nav calls are only valid on the
// main thread, so this runs inside the flight loop and the result is cached
// in the server for the HTTP thread to serve.
static FlightPlan ReadFMS() {
    FlightPlan fp;
    int count = XPLMCountFMSEntries();
    fp.waypoints.reserve(count > 0 ? count : 0);
    for (int i = 0; i < count; ++i) {
        XPLMNavType type = xplm_Nav_Unknown;
        char        id[256] = {0};
        XPLMNavRef  ref = XPLM_NAV_NOT_FOUND;
        int         alt = 0;
        float       lat = 0.0f, lon = 0.0f;
        XPLMGetFMSEntryInfo(i, &type, id, &ref, &alt, &lat, &lon);

        // Skip empty or not-yet-populated slots.
        if (lat == 0.0f && lon == 0.0f) continue;

        FmsWaypoint w;
        w.ident = id;
        w.type  = FmsTypeName(type);
        w.lat   = lat;
        w.lon   = lon;
        w.altFt = alt;
        fp.waypoints.push_back(std::move(w));
    }
    return fp;
}

static float FlightLoop(float, float, int, void*) {
    if (!g_server) return 1.0f;
    AircraftState s;
    s.lat             = getd(dr_lat);
    s.lon             = getd(dr_lon);
    s.heading         = getf(dr_heading);
    s.pitch           = getf(dr_pitch);
    s.roll            = getf(dr_roll);
    s.altitude_ft     = getf(dr_elev) * M_TO_FT;
    s.agl_ft          = getf(dr_agl)  * M_TO_FT;
    s.groundspeed_kts = getf(dr_gs)   * MS_TO_KT;
    s.airspeed_kts    = getf(dr_ias)  * MS_TO_KT;
    s.vspeed_fpm      = getf(dr_vs)   * MS_TO_FPM;
    s.wind_dir        = getf(dr_wdir);
    s.wind_spd_kts    = getf(dr_wspd) * MS_TO_KT;
    g_server->UpdateState(s);

    // The FMS plan changes rarely, so refresh it about once a second
    // instead of every frame.
    static int fmsTick = 0;
    if (++fmsTick >= 10) {
        fmsTick = 0;
        g_server->UpdateFlightPlan(ReadFMS());
    }
    return 0.1f;
}

PLUGIN_API int XPluginStart(char* outName, char* outSig, char* outDesc) {
    std::strcpy(outName, "DogeTracker");
    std::strcpy(outSig,  "com.dogetracker.plugin");
    std::strcpy(outDesc, "Live moving map, open your browser or AviTab after loading");

    dr_lat     = XPLMFindDataRef("sim/flightmodel/position/latitude");
    dr_lon     = XPLMFindDataRef("sim/flightmodel/position/longitude");
    dr_heading = XPLMFindDataRef("sim/flightmodel/position/true_psi");
    dr_pitch   = XPLMFindDataRef("sim/flightmodel/position/true_theta");
    dr_roll    = XPLMFindDataRef("sim/flightmodel/position/true_phi");
    dr_elev    = XPLMFindDataRef("sim/flightmodel/position/elevation");
    dr_agl     = XPLMFindDataRef("sim/flightmodel/position/y_agl");
    dr_gs      = XPLMFindDataRef("sim/flightmodel/position/groundspeed");
    dr_ias     = XPLMFindDataRef("sim/flightmodel/position/indicated_airspeed");
    dr_vs      = XPLMFindDataRef("sim/flightmodel/position/vh_ind");
    dr_wdir    = XPLMFindDataRef("sim/weather/wind_direction_degt");
    dr_wspd    = XPLMFindDataRef("sim/weather/wind_speed_kt");

    std::string root       = GetPluginRoot();
    std::string webDir     = root + "/web";
    std::string configPath = root + "/config.json";
    int port = ReadIntFromConfig(configPath, "port", 4000);

    XPLMDebugString("[DogeTracker] Starting...\n");
    XPLMDebugString(("[DogeTracker] Port   : " + std::to_string(port) + "\n").c_str());
    XPLMDebugString(("[DogeTracker] WebDir : " + webDir + "\n").c_str());
    XPLMDebugString(("[DogeTracker] Local  : http://127.0.0.1:" + std::to_string(port) + "\n").c_str());
    XPLMDebugString(("[DogeTracker] AviTab : http://127.0.0.1:" + std::to_string(port) + "/avitab\n").c_str());

    LogNetworkAddresses(port);

    g_server = std::make_unique<WebServer>(webDir, port);
    g_server->Start();

    XPLMRegisterFlightLoopCallback(FlightLoop, -1.0f, nullptr);
    return 1;
}

PLUGIN_API void XPluginStop() {
    XPLMUnregisterFlightLoopCallback(FlightLoop, nullptr);
    if (g_server) { g_server->Stop(); g_server.reset(); }
}

PLUGIN_API int  XPluginEnable()  { return 1; }
PLUGIN_API void XPluginDisable() {}
PLUGIN_API void XPluginReceiveMessage(XPLMPluginID, int, void*) {}
