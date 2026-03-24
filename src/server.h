#pragma once
#include <string>
#include <thread>
#include <mutex>
#include <atomic>
#include <memory>

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

struct DogeServerImpl;

class WebServer {
public:
    explicit WebServer(const std::string& webDir, int port = 4000);
    ~WebServer();
    void Start();
    void Stop();
    void UpdateState(const AircraftState& s);
private:
    std::unique_ptr<DogeServerImpl> impl_;
};
