# DogeTracker ✈️

Real-time flight tracker for X-Plane with **AviTab integration** and a live **multi-pilot map**.  
Based on [avitab-browser](https://github.com/rswilem/avitab-browser) by TheRamon.

---

## Features

| Feature | Details |
|---|---|
| 🌍 Live map | Leaflet dark-mode map showing all online DogeTracker pilots |
| 🍎 macOS (Intel + Apple Silicon) | Universal binary via `arm64;x86_64` fat build |
| 🐧 Linux | x86\_64, built inside Docker |
| 🪟 Windows | x86\_64 cross-compiled with MinGW |
| ✈️ AviTab integration | Map opens directly on the AviTab tablet in-cockpit |
| 👥 See other pilots | Live sidebar showing callsign / aircraft / alt / speed / heading |
| 🔒 Privacy | Each install generates a random UUID – no personal data sent |

---

## Repository layout

```
dogetracker/
├── src/                   X-Plane plugin (C++23)
│   ├── main.cpp           Entry point – wires tracker into flight loop
│   ├── tracker.h/.cpp     Position broadcaster (POST /api/position every 5 s)
│   └── include/
│       └── config.h       Branding, API URL, intervals
├── server/                Node.js tracking server
│   ├── server.js          Express REST API
│   └── public/
│       └── map.html       AviTab live map (Leaflet)
├── CMakeLists.txt         Multi-platform build (mac/lin/win + ARM64)
├── toolchain-mac.cmake    macOS universal binary toolchain
├── toolchain-lin.cmake    Linux toolchain (Docker)
├── toolchain-win.cmake    Windows cross-compile toolchain
└── build_platforms.sh     Interactive build + zip packager
```

---

## Quick start

### 1. Deploy the server

```bash
cd server
npm install
npm start          # http://localhost:3000
```

For production, set the `PORT` environment variable and put it behind nginx/caddy with HTTPS.

### 2. Set your server URL in the plugin

Edit `src/include/config.h`:

```cpp
#define DOGETRACKER_API_URL "https://your-dogetracker-server.com"
```

### 3. Build the plugin

You need the [X-Plane SDK](https://developer.x-plane.com/sdk/plugin-sdk-downloads/) and [CEF binaries](https://github.com/rswilem/avitab-browser) placed in `lib/`.

```bash
# macOS – universal binary (Intel + Apple Silicon)
./build_platforms.sh
# → select: mac   XP version: 12

# Or build all platforms
./build_platforms.sh
# → select: mac win lin   XP version: 12
```

### 4. Install in X-Plane

Copy `build/dist/` to:
```
X-Plane 12/Resources/plugins/dogetracker/
```

The folder should contain `mac_x64/dogetracker.xpl` (and/or `win_x64/`, `lin_x64/`).

### 5. Fly!

- Load any aircraft. DogeTracker starts broadcasting your position automatically.
- In X-Plane's plugin menu → **DogeTracker → Open DogeTracker Map** to open the live map on your AviTab.
- All other online DogeTracker pilots appear on the map within 5 seconds.

---

## Server API

| Method | Path | Body / Response |
|---|---|---|
| `POST` | `/api/position` | `{ pilot_id, callsign, aircraft, lat, lon, alt_ft, heading, speed_kts }` |
| `GET`  | `/api/users`    | `{ count, pilots: [...] }` |
| `GET`  | `/map`          | Live Leaflet map HTML |
| `GET`  | `/health`       | `{ status: "ok", pilots: N }` |

Pilots are removed from the map after **60 seconds** of inactivity (sim paused / plugin unloaded).

---

## macOS notes

DogeTracker builds a **fat universal binary** for macOS:

| Slice | Runs on |
|---|---|
| `arm64` | Apple Silicon Macs (M1/M2/M3/M4) |
| `x86_64` | Intel Macs |

X-Plane 12 on macOS ships as a universal app, so both slices are needed.  
X-Plane 11 (Intel only) builds with `x86_64` alone.

If you're adding CEF libraries for Apple Silicon, place them in `lib/mac_arm64/cef/`.  
The build system falls back to `lib/mac_x64/cef/` if the ARM64 folder doesn't exist.

---

## AviTab integration

DogeTracker hooks into AviTab via the same `AviTab/click_left` command binding used by avitab-browser.  
The live map page (`/map`) is optimised for the AviTab's small display:

- Dark theme to match cockpit lighting
- Plane icons rotate to match aircraft heading
- Sidebar lists all online pilots with live stats
- Auto-refreshes every **5 seconds**
- Click any plane icon or sidebar card to centre the map on that pilot

---

## Credits

- [avitab-browser](https://github.com/rswilem/avitab-browser) — TheRamon (GPL-3.0)
- [Leaflet](https://leafletjs.com/) — BSD 2-Clause
- [CARTO Dark Matter](https://carto.com/basemaps/) tiles

DogeTracker is released under the **GNU GPL v3.0**.
