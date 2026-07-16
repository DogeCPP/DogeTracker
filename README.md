<div align="center">

<img src="web/dogepilot.png" width="130" alt="DogeTracker" />

# DogeTracker

**A live moving map for X-Plane 12, in your browser.**

Load the plugin, open `http://127.0.0.1:4000`, and watch your aircraft fly across a real map with live instruments, your flight plan, and other traffic around you. Works on the same PC, or from your phone or tablet on the same wifi.

Windows · macOS · Linux · free and open source

[Download the latest release](https://github.com/DogeCPP/DogeTracker/releases) · [Support on Ko-fi](https://ko-fi.com/dogeeeee)

</div>

---

Under the hood it is a small C++ X-Plane plugin that reads your sim's flight data and serves a tiny local web app. The frontend is plain HTML, CSS, and JavaScript. Nothing to install beyond dropping a folder into your plugins directory, no account, no cloud.

If you wish to support me updating This, Please kindly donate me at ['https://ko-fi.com/dogeeeee'] :D. Grazie!

![DogeTracker screenshot](web/dogepilot.png)

## What it does

**Your aircraft**
- Live position on a real map, updating every second, with smooth animation so the icon never teleports
- Attitude indicator with pitch ladder and bank, a wind rose, and a full instrument readout (heading, altitude, AGL, IAS, ground speed, vertical speed colour coded for climb and descent)
- A flight trail that stays until you clear it

**Flight plans, from three places**
- **SimBrief**, by pilot ID or username
- **The live FMS in the sim**, read straight out of X-Plane. Leave the SimBrief box empty and hit Load plan
- **Files**, drag in an X-Plane `.fms` (old and current formats) or a Little Navmap `.lnmpln`

The route draws as a cased line with a label at every waypoint showing its flight level, plus a waypoint timeline you can click to jump around the plan. Long ocean legs get synthetic position labels, the way real random routing is reported.

**Live traffic and ATC**
- Other pilots and online controllers from **VATSIM** and **IVAO**, one toggle per network turns on both together. Click any aircraft for its callsign, altitude, current speed, and departure and arrival
- Controllers show up with their airspace boundaries highlighted, VAT-Spy style, and their frequency

**Weather**
- **METAR** for the airports on your loaded flight plan, pinned on the map and colour coded by flight category (VFR, MVFR, IFR, LIFR). Click a pin for wind, temperature, altimeter, and the raw report

**Logbook**
- Every flight is logged automatically: departure and arrival, aircraft, duration, distance, max altitude, and your **landing rate** captured at touchdown
- Colour coded landings (buttery to hard), one click **replay** of any flight on the map, and **CSV export**

**Navigation and descent**
- Navaid overlay from free OpenStreetMap data: VOR, NDB, and intersections drawn as proper chart symbols, plus airways
- **Fast search** across airports, navaids, your route, and your logbook, with online lookup and nearest airport search
- Top of Descent calculator with a vertical profile chart and a countdown alarm that fires a sound and a full screen alert when it is time to come down

**Nice touches**
- Five base maps: dark, light, standard OSM, topographic, and satellite
- Switch between imperial and metric units
- Dark and light themes
- Reachable from any device on your network, so you can put the map on a tablet next to you
- Tells you when a new version is out, with a one click link to the download

## Getting started

You need X-Plane 12 on Windows, macOS, or Linux.

1. Download the latest zip from [Releases](https://github.com/DogeCPP/DogeTracker/releases).
2. Extract it and copy the whole `DogeTracker` folder into `X-Plane 12/Resources/plugins/`.
3. Start X-Plane, load a flight, and open `http://127.0.0.1:4000` in any browser.

### Opening it on your phone or tablet

The plugin is reachable from any device on the same wifi. On the other device open `http://<your-xplane-pc-ip>:4000`. Find the IP in the X-Plane developer console on the line starting `Network:`, or run `ipconfig` (Windows) / `ifconfig` (macOS and Linux) on the sim PC. If the page will not load, allow the port through the sim PC's firewall (see Security below).

### Changing the port

Edit `config.json` next to the platform folder before starting X-Plane:

```json
{
  "port": 4000,
  "theme": "dark"
}
```

`port` is the TCP port the server listens on. `theme` is the default the frontend uses until you toggle it. You can also change the port later from Tools &rarr; Setup in the browser, it is saved in your browser.

## The interface

The top bar has three tabs:

- **Flight**: your live instruments, position, attitude, wind
- **Route**: load a flight plan from SimBrief, the sim's FMS, or a file, and see it drawn on the map
- **Tools**: the Descent calculator, your Logbook, and Setup live here as sub-tabs

Map layers (base map, traffic, ATC, weather, navaids) are in the drawer on the right edge of the screen. The search box in the top bar finds airports, navaids, and fixes on your route, with online and nearest-airport lookup as a fallback.

## Security

DogeTracker's server has no accounts, no login, and no endpoint that changes anything on your machine. It only reads flight data and serves the map. Given that:

- **No wildcard CORS.** Other websites open in your browser cannot read your live position in the background.
- **Standard hardening headers** are sent on every response.
- **Plain HTTP on your LAN only.** A self signed HTTPS certificate would throw a security warning on every device until manually trusted, which would break opening the map on your phone, so it was left off. Do not port forward this to the internet. On a network you do not trust, keep the port firewalled to your own machine or subnet.
- **No CSRF tokens** because there is nothing to protect: every endpoint is a read only GET, with no forms, cookies, or state changing requests.

## Support

DogeTracker is built by one person in their spare time and given away for free. If it made a flight better, a coffee genuinely helps keep the updates coming:

**[ko-fi.com/dogeeeee](https://ko-fi.com/dogeeeee)**

## License

MIT. Do whatever you want with it.
