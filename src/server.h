#pragma once
#include <string>
#include <thread>
#include <mutex>
#include <atomic>
#include <memory>
#include <vector>

struct AircraftState {
    double lat             = 0.0;
    double lon             = 0.0;
    float  heading         = 0.0f;
    float  pitch           = 0.0f;
    float  roll            = 0.0f;
    float  altitude_ft     = 0.0f;
    float  agl_ft          = 0.0f;
    float  groundspeed_kts = 0.0f;
    float  airspeed_kts    = 0.0f;
    float  vspeed_fpm      = 0.0f;
    float  wind_dir        = 0.0f;
    float  wind_spd_kts    = 0.0f;
};

// One leg of the active FMS flight plan, read from the sim on the main thread.
struct FmsWaypoint {
    std::string ident;
    std::string type;   // APT, VOR, NDB, FIX, LATLON, WPT
    double      lat   = 0.0;
    double      lon   = 0.0;
    int         altFt = 0;
};

struct FlightPlan {
    std::vector<FmsWaypoint> waypoints;
};

struct DogeServerImpl;

class WebServer {
public:
    explicit WebServer(const std::string& webDir, int port = 4000);
    ~WebServer();
    void Start();
    void Stop();
    void UpdateState(const AircraftState& s);
    void UpdateFlightPlan(const FlightPlan& fp);
private:
    std::unique_ptr<DogeServerImpl> impl_;
};
