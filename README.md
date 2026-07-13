# DogeTracker

A live moving map for X-Plane 12. Open your browser, point it at `http://127.0.0.1:4000`, and watch your plane move around on a real map while you fly.

Built with a C++ X-Plane plugin that reads your simulator's flight data and serves it over a tiny local HTTP server. The frontend is just HTML, CSS, and JavaScript - no app to install, nothing to configure beyond dropping a folder into your plugins directory.

If you wish to support me updating This, Please kindly donate me at ['https://ko-fi.com/dogeeeee'] :D. Grazie!

![DogeTracker screenshot](web/dogepilot.png)

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
- Live VATSIM and IVAO traffic on the map, click any aircraft for its altitude, speed, and departure/arrival
- Top of Descent calculator with a visual vertical profile chart
- Alarm system: set a countdown to your T/D and it will play an audible alert (beep, chime, or siren) and pop up a full-screen notification in your browser when it fires
- Port is configurable without recompiling - edit config.json or use the Settings tab in the browser

---

## Getting started

### What you need
- X-Plane 12 on Windows 64-bit

### Install on your Windows machine

Copy the whole `DogeTracker` folder into your X-Plane plugins directory
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

### Navaids 

Navaid data comes from OpenStreetMap via the Overpass API, which is completely free and requires no account. Toggle VORs, NDBs, and fixes independently. Airways load on demand for the current map view.

If you have a Navigraph subscription you can paste your API key in the Navaids tab and the plugin is wired up to use it. The free OSM data is good enough for most use cases though.

### T/D Alarm 

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

## Security

DogeTracker's server has no accounts, no auth, and no endpoints that change anything on your machine, it only reads flight data and serves the map. Given that, here's what's actually done and why:

- **No wildcard CORS.** Earlier versions sent `Access-Control-Allow-Origin: *`, which meant any website open in another browser tab could quietly read your live position in the background. That header is gone. The plugin's own page is served from the same origin as its API, so it doesn't need it, and removing it stops other sites from reading your data.
- **Standard hardening headers** (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) are sent on every response.
- **No self-signed HTTPS.** It was considered, but a self-signed cert makes every browser show a "not secure" warning on first visit, on every device, until someone manually trusts it, which breaks the "open it from your phone on the same wifi" feature this plugin is built around. The server only ever serves read-only flight data on your own LAN, so plain HTTP was kept.
- **CSRF protection wasn't added** because there's nothing for it to protect: every endpoint is a GET that only reads data, there are no forms, no cookies, and no state-changing requests anywhere in the app.
- **Firewall guidance:** the server binds to your LAN so other devices on the same wifi can reach it, that's the point of the "open on other devices" feature. Do not port-forward this to the internet. If you're on a network you don't fully trust (public wifi, a shared or corporate LAN), either turn off "open on other devices" by leaving the port firewalled to `127.0.0.1` only, or use your OS firewall to restrict the port to your own subnet.

## License

MIT. Do whatever you want with it.
