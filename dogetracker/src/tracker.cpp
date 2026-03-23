// tracker.cpp – DogeTracker position broadcaster
// Reads X-Plane datarefs every TRACKER_BROADCAST_INTERVAL_SECONDS and
// POSTs the aircraft position to the DogeTracker REST API.

#include "tracker.h"
#include "config.h"
#include "path.h"

#include <XPLMDataAccess.h>
#include <XPLMProcessing.h>
#include <XPLMUtilities.h>
#include <curl/curl.h>

#include <chrono>
#include <cstring>
#include <fstream>
#include <random>
#include <sstream>
#include <thread>

// ──────────────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────────────

size_t Tracker::curlWriteCallback(void* contents, size_t size, size_t nmemb, std::string* s)
{
    s->append(static_cast<char*>(contents), size * nmemb);
    return size * nmemb;
}

// Simple UUID-v4 generator (no external library needed).
static std::string generateUUID()
{
    std::random_device rd;
    std::mt19937_64 gen(rd());
    std::uniform_int_distribution<uint32_t> dist(0, 0xFFFFFFFF);

    char buf[37];
    snprintf(buf, sizeof(buf),
        "%08x-%04x-4%03x-%04x-%08x%04x",
        dist(gen),
        dist(gen) & 0xFFFF,
        dist(gen) & 0x0FFF,
        (dist(gen) & 0x3FFF) | 0x8000,
        dist(gen),
        dist(gen) & 0xFFFF);
    return std::string(buf);
}

// ──────────────────────────────────────────────────────────────────────────
//  Tracker
// ──────────────────────────────────────────────────────────────────────────

Tracker::Tracker() : lastBroadcastTime(0.0f) {}

Tracker::~Tracker() { shutdown(); }

void Tracker::initialize()
{
    loadOrCreatePilotId();
    running.store(true);
    debug("Tracker initialized. Pilot ID: %s\n", pilotId.c_str());
}

void Tracker::shutdown()
{
    running.store(false);
}

void Tracker::tick()
{
    if (!running.load()) return;

    float elapsed = XPLMGetElapsedTime();
    if (elapsed - lastBroadcastTime < TRACKER_BROADCAST_INTERVAL_SECONDS) return;
    lastBroadcastTime = elapsed;

    // ── Read datarefs ──────────────────────────────────────────────────
    XPLMDataRef drLat      = XPLMFindDataRef("sim/flightmodel/position/latitude");
    XPLMDataRef drLon      = XPLMFindDataRef("sim/flightmodel/position/longitude");
    XPLMDataRef drAlt      = XPLMFindDataRef("sim/flightmodel/position/elevation");  // metres MSL
    XPLMDataRef drHeading  = XPLMFindDataRef("sim/flightmodel/position/mag_psi");
    XPLMDataRef drSpeed    = XPLMFindDataRef("sim/flightmodel/position/indicated_airspeed"); // kts
    XPLMDataRef drCallsign = XPLMFindDataRef("sim/aircraft/view/acf_tailnum");
    XPLMDataRef drICAO     = XPLMFindDataRef("sim/aircraft/view/acf_ICAO");

    if (!drLat || !drLon) {
        debug("Tracker: datarefs unavailable, skipping broadcast\n");
        return;
    }

    TrackerPosition pos;
    pos.latitude    = XPLMGetDatad(drLat);
    pos.longitude   = XPLMGetDatad(drLon);
    pos.altitude_ft = drAlt ? XPLMGetDatad(drAlt) * 3.28084 : 0.0;
    pos.heading     = drHeading  ? static_cast<double>(XPLMGetDataf(drHeading))  : 0.0;
    pos.speed_kts   = drSpeed    ? static_cast<double>(XPLMGetDataf(drSpeed))    : 0.0;
    pos.pilot_id    = pilotId;

    char tailnum[64] = "N/A";
    char icao[8]     = "ZZZZ";
    if (drCallsign) XPLMGetDatab(drCallsign, tailnum, 0, sizeof(tailnum) - 1);
    if (drICAO)     XPLMGetDatab(drICAO,     icao,    0, sizeof(icao)    - 1);

    pos.callsign = std::string(tailnum);
    pos.aircraft  = std::string(icao);

    // Fire-and-forget on a background thread so we don't stall the sim.
    std::thread([pos]() { Tracker::postPosition(pos); }).detach();
}

void Tracker::postPosition(TrackerPosition pos)
{
    CURL* curl = curl_easy_init();
    if (!curl) return;

    // Build JSON body
    std::ostringstream json;
    json << "{"
         << "\"pilot_id\":\""   << pos.pilot_id    << "\","
         << "\"callsign\":\""   << pos.callsign    << "\","
         << "\"aircraft\":\""   << pos.aircraft    << "\","
         << "\"lat\":"          << pos.latitude    << ","
         << "\"lon\":"          << pos.longitude   << ","
         << "\"alt_ft\":"       << pos.altitude_ft << ","
         << "\"heading\":"      << pos.heading     << ","
         << "\"speed_kts\":"    << pos.speed_kts
         << "}";

    std::string body   = json.str();
    std::string url    = std::string(DOGETRACKER_API_URL) + "/api/position";
    std::string response;

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, "Accept: application/json");

    curl_easy_setopt(curl, CURLOPT_URL,            url.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS,     body.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER,     headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION,  curlWriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA,      &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT,        4L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        // Log silently – don't disrupt the sim.
        char msg[256];
        snprintf(msg, sizeof(msg), "[dogetracker] POST failed: %s\n", curl_easy_strerror(res));
        XPLMDebugString(msg);
    }

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
}

// ──────────────────────────────────────────────────────────────────────────
//  Pilot-ID persistence
// ──────────────────────────────────────────────────────────────────────────

std::string Tracker::getPilotIdPath() const
{
    // Store next to the plugin so it persists across sim restarts.
    return Path::getInstance()->getPluginDirectory() + "/pilot_id.txt";
}

void Tracker::loadOrCreatePilotId()
{
    std::string path = getPilotIdPath();
    std::ifstream in(path);
    if (in.good()) {
        std::getline(in, pilotId);
        in.close();
        if (!pilotId.empty()) {
            debug("Tracker: loaded pilot ID %s\n", pilotId.c_str());
            return;
        }
    }

    // Generate a new one.
    pilotId = generateUUID();
    std::ofstream out(path);
    if (out.good()) {
        out << pilotId;
        out.close();
        debug("Tracker: created new pilot ID %s\n", pilotId.c_str());
    }
}
