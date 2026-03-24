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

    DogeServerImpl(const std::string& dir, int p) : webDir(dir), port(p) {}

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
        auto hdr = [](httplib::Response& res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Cache-Control", "no-store, no-cache");
        };

        svr.Get("/api/position", [this, hdr](const httplib::Request&, httplib::Response& res) {
            hdr(res);
            res.set_content(stateToJSON(), "application/json");
        });

        svr.Get("/api/health", [hdr](const httplib::Request&, httplib::Response& res) {
            hdr(res);
            res.set_content("{\"status\":\"ok\",\"plugin\":\"DogeTracker\",\"version\":\"1.0.2\"}", "application/json");
        });

        // AviTab-optimised cockpit map — set homepage=http://localhost:4000/avitab in AviTab config
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
                    "<p>Make sure the web/ folder is next to the 64/ folder.</p>"
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
