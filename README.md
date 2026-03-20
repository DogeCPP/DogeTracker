# DogeTracker

A live moving map for X-Plane 12. Open your browser, point it at `http://127.0.0.1:4000`, and watch your plane move around on a real map while you fly.

Built with a C++ X-Plane plugin that reads your simulator's flight data and serves it over a tiny local HTTP server. The frontend is just HTML, CSS, and JavaScript - no app to install, nothing to configure beyond dropping a folder into your plugins directory.

![DogeTracker screenshot](dogepilot.png)

---

## What it does

- Shows your aircraft position on an OpenStreetMap or satellite tile map, updating every second
- Smooth animation between position updates so the icon doesn't teleport
- Attitude indicator with pitch ladder and bank angle display
- Wind rose showing current wind direction and speed
- Vertical speed colour-coded (green for climb, red for descent)
- Flight trail that sticks around until you clear it
- Load a SimBrief flight plan and see the full route drawn on the map with waypoints, cruise altitude, fuel and distance info
- Navaid overlay using free OpenStreetMap data - VORs, NDBs, and intersections, with airways as well
- Top of Descent calculator with a visual vertical profile chart
- Alarm system: set a countdown to your T/D and it will play an audible alert (beep, chime, or siren) and pop up a full-screen notification in your browser when it fires
- Port is configurable without recompiling - edit config.json or use the Settings tab in the browser

---

## Getting started

### What you need

- Ubuntu (tested on 24.04) or any modern Linux distro for building
- X-Plane 12 on Windows 64-bit (where the plugin actually runs)
- The free X-Plane SDK: https://developer.x-plane.com/sdk/
- `cmake`, `ninja-build`, `git`, and the MinGW cross-compiler (the build script installs all of these)

### Build

```bash
chmod +x build_linux.sh
./build_linux.sh
```

The script will ask you where your X-Plane SDK is, then handle the rest. It downloads `cpp-httplib` automatically through CMake's FetchContent, so your first build needs an internet connection.

When it finishes, the compiled plugin is at `build/package/DogeTracker/`.

### Install on your Windows machine

Copy the whole `DogeTracker` folder into your X-Plane plugins directory:

```
X-Plane 12/Resources/plugins/DogeTracker/
    64/win.xpl
    web/index.html
    web/style.css
    web/script.js
    web/dogepilot.png
    config.json
```

Start X-Plane, load a flight, and go to `http://127.0.0.1:4000` in any browser.

### Changing the port

Open `config.json` and change the `port` value before starting X-Plane:

```json
{
  "port": 4000
}
```

You can also change it from the browser after the fact by going to the Settings tab. The browser-side setting persists in localStorage, so it survives page refreshes.

---

## Features by phase

| Phase | What it covers |
|-------|----------------|
| 1 | Live lat/lon from X-Plane, local HTTP server, Leaflet map |
| 2 | Heading rotation, smooth interpolation, ADI, wind rose, IAS, vertical speed, AGL |
| 3 | SimBrief route with waypoints, aircraft type, cruise altitude, fuel, distance |
| 4 | Navaids and airways from OpenStreetMap/Overpass API (free, no key needed). Navigraph API key stub included |
| 5 | Top of Descent calculation, vertical profile chart, countdown alarm with Web Audio |

### Navaids (Phase 4)

Navaid data comes from OpenStreetMap via the Overpass API, which is completely free and requires no account. Toggle VORs, NDBs, and fixes independently. Airways load on demand for the current map view.

If you have a Navigraph subscription you can paste your API key in the Navaids tab and the plugin is wired up to use it. The free OSM data is good enough for most use cases though.

### T/D Alarm (Phase 5)

Set your estimated time to Top of Descent using the hours/minutes inputs. Pick how many minutes before T/D you want the alarm to fire (1 to 10). When the countdown hits zero, the browser plays a sound (your choice of beep, chime, or siren) and pops up a full-screen alert. Hit "Got it" to dismiss.

The vertical profile chart on the same tab shows your current altitude, the ideal 3-degree descent path, and where T/D falls. If you have a SimBrief route loaded, it also marks the destination.

---

## Configuration

`config.json` lives next to the `64/` folder in the plugin directory. The plugin reads it at startup.

```json
{
  "port": 4000,
  "theme": "dark"
}
```

The `theme` value is read by the frontend as the default if you haven't toggled it manually. `port` controls which TCP port the HTTP server listens on.
---

## License

MIT. Do whatever you want with it.
