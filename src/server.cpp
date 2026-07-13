#include "httplib.h"
#include "server.h"

#include <cstdio>
#include <fstream>
#include <string>
#include <thread>
#include <mutex>
#include <atomic>

struct DogeServerImpl {
    httplib::Server   svr;
    std::string       webDir;
    int               port;
    std::thread       thread;
    std::atomic<bool> running { false };
    std::mutex        mtx;
    AircraftState     state;
    std::mutex        planMtx;
    FlightPlan        plan;

    DogeServerImpl(const std::string& dir, int p) : webDir(dir), port(p) {}

    static std::string jsonEscape(const std::string& in) {
        std::string out;
        out.reserve(in.size() + 4);
        for (char c : in) {
            switch (c) {
                case '"':  out += "\\\""; break;
                case '\\': out += "\\\\"; break;
                case '\n': out += "\\n";  break;
                case '\r': out += "\\r";  break;
                case '\t': out += "\\t";  break;
                default:
                    if (static_cast<unsigned char>(c) < 0x20) {
                        char u[8];
                        std::snprintf(u, sizeof(u), "\\u%04x", c);
                        out += u;
                    } else {
                        out += c;
                    }
            }
        }
        return out;
    }

    std::string flightPlanToJSON() {
        std::lock_guard<std::mutex> lk(planMtx);
        std::string out = "{\"source\":\"fms\",\"count\":";
        out += std::to_string(plan.waypoints.size());
        out += ",\"waypoints\":[";
        for (size_t i = 0; i < plan.waypoints.size(); ++i) {
            const FmsWaypoint& w = plan.waypoints[i];
            char coords[128];
            std::snprintf(coords, sizeof(coords),
                          "\"lat\":%.6f,\"lon\":%.6f,\"altFt\":%d",
                          w.lat, w.lon, w.altFt);
            if (i) out += ',';
            out += "{\"ident\":\"" + jsonEscape(w.ident) + "\",";
            out += "\"type\":\""  + jsonEscape(w.type)  + "\",";
            out += coords;
            out += '}';
        }
        out += "]}";
        return out;
    }

    std::string stateToJSON() {
        std::lock_guard<std::mutex> lk(mtx);
        char buf[512];
        std::snprintf(buf, sizeof(buf),
            "{"
            "\"lat\":%.6f,"
            "\"lon\":%.6f,"
            "\"heading\":%.2f,"
            "\"pitch\":%.2f,"
            "\"roll\":%.2f,"
            "\"altitude_ft\":%.1f,"
            "\"agl_ft\":%.1f,"
            "\"groundspeed_kts\":%.1f,"
            "\"airspeed_kts\":%.1f,"
            "\"vspeed_fpm\":%.0f,"
            "\"wind_dir\":%.1f,"
            "\"wind_spd_kts\":%.1f"
            "}",
            state.lat, state.lon,
            (double)state.heading, (double)state.pitch, (double)state.roll,
            (double)state.altitude_ft, (double)state.agl_ft,
            (double)state.groundspeed_kts, (double)state.airspeed_kts,
            (double)state.vspeed_fpm, (double)state.wind_dir, (double)state.wind_spd_kts
        );
        return buf;
    }

    void setupRoutes() {
        // No Access-Control-Allow-Origin header here on purpose. The web UI is
        // served by this same process, so its own fetches are same-origin and
        // need no CORS header at all. Setting "*" (the old behaviour) meant
        // any website open in another tab could silently read live position
        // data from this server in the background, since a wildcard opts
        // every cross-origin page into reading the response. Leaving CORS
        // unset makes the browser block those cross-origin reads by default.
        auto hdr = [](httplib::Response& res) {
            res.set_header("Cache-Control", "no-store, no-cache");
        };

        // Applies to every response, including static files served from
        // webDir, not just the routes defined below.
        svr.set_post_routing_handler([](const httplib::Request&, httplib::Response& res) {
            res.set_header("X-Content-Type-Options", "nosniff");
            res.set_header("X-Frame-Options", "SAMEORIGIN");
            res.set_header("Referrer-Policy", "no-referrer");
        });

        svr.Get("/api/position", [this, hdr](const httplib::Request&, httplib::Response& res) {
            hdr(res);
            res.set_content(stateToJSON(), "application/json");
        });

        svr.Get("/api/health", [hdr](const httplib::Request&, httplib::Response& res) {
            hdr(res);
            res.set_content("{\"status\":\"ok\",\"plugin\":\"DogeTracker\",\"version\":\"1.5.0\"}", "application/json");
        });

        // Active FMS flight plan, refreshed on the sim main thread.
        svr.Get("/api/flightplan", [this, hdr](const httplib::Request&, httplib::Response& res) {
            hdr(res);
            res.set_content(flightPlanToJSON(), "application/json");
        });

        // AviTab-optimised cockpit map. Set homepage=http://localhost:4000/avitab in AviTab config
        svr.Get("/avitab", [this](const httplib::Request&, httplib::Response& res) {
            std::string path = webDir + "/avitab.html";
            std::ifstream f(path);
            if (f.good()) {
                std::string html((std::istreambuf_iterator<char>(f)),
                                  std::istreambuf_iterator<char>());
                res.set_content(html, "text/html");
            } else {
                res.set_redirect("/");
            }
        });

        if (!svr.set_mount_point("/", webDir.c_str())) {
            svr.Get("/", [this](const httplib::Request&, httplib::Response& res) {
                std::string html =
                    "<html><body style='font-family:sans-serif;padding:2em'>"
                    "<h2>DogeTracker is running</h2>"
                    "<p>Web directory not found: " + webDir + "</p>"
                    "<p>Make sure the web/ folder sits next to the mac_x64 / win_x64 / lin_x64 "
                    "folder inside the DogeTracker plugin directory.</p>"
                    "</body></html>";
                res.set_content(html, "text/html");
            });
        }

        svr.set_error_handler([hdr](const httplib::Request& req, httplib::Response& res) {
            hdr(res);
            char buf[256];
            std::snprintf(buf, sizeof(buf), "{\"error\":\"Not found\",\"path\":\"%s\"}", req.path.c_str());
            res.set_content(buf, "application/json");
        });
    }
};

WebServer::WebServer(const std::string& webDir, int port)
    : impl_(std::make_unique<DogeServerImpl>(webDir, port))
{
    impl_->setupRoutes();
}

WebServer::~WebServer() { Stop(); }

void WebServer::Start() {
    if (impl_->running.load()) return;
    impl_->running.store(true);
    impl_->thread = std::thread([this]() {
        impl_->svr.listen("0.0.0.0", impl_->port);
        impl_->running.store(false);
    });
}

void WebServer::Stop() {
    if (!impl_->thread.joinable()) return;
    impl_->svr.stop();
    impl_->thread.join();
    impl_->running.store(false);
}

void WebServer::UpdateState(const AircraftState& s) {
    std::lock_guard<std::mutex> lk(impl_->mtx);
    impl_->state = s;
}

void WebServer::UpdateFlightPlan(const FlightPlan& fp) {
    std::lock_guard<std::mutex> lk(impl_->planMtx);
    impl_->plan = fp;
}
