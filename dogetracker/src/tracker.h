#pragma once

#include <string>
#include <thread>
#include <atomic>
#include <functional>

struct TrackerPosition {
    double latitude;
    double longitude;
    double altitude_ft;
    double heading;
    double speed_kts;
    std::string callsign;    // from config or sim
    std::string aircraft;    // ICAO type e.g. "B738"
    std::string pilot_id;    // unique persistent ID stored locally
};

class Tracker {
public:
    Tracker();
    ~Tracker();

    // Call once after plugin starts. Loads / generates pilot_id.
    void initialize();

    // Called every TRACKER_BROADCAST_INTERVAL_SECONDS from the flight loop.
    void tick();

    // Cleanly stop background threads.
    void shutdown();

    // Latest snapshot of remote users (JSON string).
    // The AviTab browser page polls GET /api/users and renders a Leaflet map.
    // The plugin itself doesn't need to parse this – it's consumed by the webpage.
    bool isRunning() const { return running.load(); }

private:
    std::atomic<bool> running{false};
    std::string pilotId;
    float lastBroadcastTime{0.0f};

    void loadOrCreatePilotId();
    std::string getPilotIdPath() const;

    // Blocking HTTP helpers executed on a background thread.
    static void postPosition(TrackerPosition pos);
    static size_t curlWriteCallback(void* contents, size_t size, size_t nmemb, std::string* s);
};
