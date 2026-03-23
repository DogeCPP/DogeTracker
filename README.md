# ✈ DogeTracker

Real-time flight tracker for X-Plane 11/12 with **AviTab integration** and a live Leaflet map.  
Fork of [avitab-browser](https://github.com/rswilem/avitab-browser) by TheRamon.

---

## Features

| Feature | Details |
|---|---|
| **Live position tracking** | Broadcasts lat/lon/alt/heading/speed every 5 s |
| **See other pilots** | Leaflet map auto-refreshes with all online DogeTracker users |
| **AviTab integration** | Map opens directly on the AviTab tablet inside the cockpit |
| **macOS Apple Silicon** | Universal binary (arm64 + x86_64) for XP12; Intel-only for XP11 |
| **Windows & Linux** | Unchanged from upstream |
| **Persistent pilot ID** | UUID stored in `pilot_id.txt` — survives restarts |

---

## Requirements

### Plugin (X-Plane side)
- X-Plane 11 or 12
- AviTab plugin installed *(for in-cockpit map)*
- One of: Zibo 737, LevelUp 737, Felis 742, JustFlight, or IXEG 737

### Server
- Node.js ≥ 18
- Any always-on host (VPS, Fly.io, Railway, etc.)

---

## Quick Start

### 1. Deploy the server

```bash
cd server
npm install
npm start
# Server runs on http://localhost:3000
```

Set `DOGETRACKER_API_URL` in `src/include/config.h` to your server's public URL before building the plugin.

### 2. Build the plugin

**macOS (Universal – Intel + Apple Silicon)**
```bash
./build_platforms.sh
# Select: mac
# X-Plane version: 12
# → build/dist/mac_x64/dogetracker.xpl  (fat binary, runs on both chips)
```

**Windows (cross-compiled from macOS/Linux)**
```bash
./build_platforms.sh
# Select: win
```

**Linux**
```bash
./build_platforms.sh
# Select: lin
# Requires Docker for the GCC cross-compile container
```

### 3. Install the plugin

Copy the `dogetracker` folder from `build/dist/` into:
```
X-Plane/Resources/plugins/dogetracker/
```

### 4. Open the map in X-Plane

- **Via AviTab**: The map loads automatically on the AviTab tablet.
- **Via menu**: *Plugins → DogeTracker → Open DogeTracker Map*

---

## How it works

```
X-Plane sim
  └─ dogetracker.xpl
       ├─ Reads datarefs (lat, lon, alt, heading, speed, callsign, ICAO)
       ├─ Every 5 s → POST /api/position  ──────────────┐
       └─ AviTab browser → GET /map                     │
                                                         ▼
                                              DogeTracker Server (Node.js)
                                                         │
                                             ┌───────────┴────────────┐
                                             │  In-memory pilot store │
                                             │  (expires after 60 s)  │
                                             └───────────┬────────────┘
                                                         │
                                              GET /api/users ← Leaflet map polls every 5 s
                                              GET /map       ← Served to AviTab browser
```

---

## API Reference

### `POST /api/position`
Sent by the plugin every 5 seconds.

```json
{
  "pilot_id":  "uuid-v4",
  "callsign":  "N737DG",
  "aircraft":  "B738",
  "lat":       51.477,
  "lon":       -0.461,
  "alt_ft":    35000,
  "heading":   270,
  "speed_kts": 450
}
```

### `GET /api/users`
Returns all pilots active in the last 60 seconds.

```json
{
  "count": 3,
  "pilots": [
    {
      "pilot_id":  "uuid-v4",
      "callsign":  "N737DG",
      "aircraft":  "B738",
      "lat":       51.477,
      "lon":       -0.461,
      "alt_ft":    35000,
      "heading":   270,
      "speed_kts": 450,
      "last_seen": 1710000000000
    }
  ]
}
```

### `GET /map`
Serves the Leaflet live-map HTML page displayed inside AviTab.

---

## Configuration (`config.h`)

| Macro | Default | Description |
|---|---|---|
| `DOGETRACKER_API_URL` | `https://your-dogetracker-server.com` | Your server URL |
| `DEFAULT_HOMEPAGE` | `DOGETRACKER_API_URL "/map"` | Page loaded in AviTab |
| `TRACKER_BROADCAST_INTERVAL_SECONDS` | `5.0` | How often position is pushed |
| `REFRESH_INTERVAL_SECONDS_SLOW` | `2.0` | Plugin flight-loop slow tick |
| `REFRESH_INTERVAL_SECONDS_FAST` | `0.1` | Plugin flight-loop fast tick |

---

## macOS Notes

- **XP12**: CMake builds a **universal fat binary** (`arm64;x86_64`). This runs natively on both Apple Silicon Macs (M1/M2/M3/M4) and Intel Macs without Rosetta.
- **XP11**: Intel-only (`x86_64`) — XP11 never shipped an ARM build.
- CEF libraries: if you only have `mac_x64` CEF libs, the fat binary still works via Rosetta on Apple Silicon for the CEF portion. For a fully native arm64 CEF build, place arm64 libs in `lib/mac_arm64/cef/`.

---

## Credits

- Original [avitab-browser](https://github.com/rswilem/avitab-browser) by **TheRamon** (GPL-3.0)
- [Leaflet.js](https://leafletjs.com/) for the map
- [CartoDB Dark Matter](https://carto.com/basemaps/) tile layer
