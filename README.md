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

**Live traffic**
- Other pilots online right now from **VATSIM** and **IVAO**, each network toggled on its own
- Click any aircraft for its callsign, altitude, current speed, and departure and arrival

**Navigation and descent**
- Navaid overlay from free OpenStreetMap data: VOR, NDB, and intersections drawn as proper chart symbols, plus airways
- Top of Descent calculator with a vertical profile chart and a countdown alarm that fires a sound and a full screen alert when it is time to come down

**Nice touches**
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

`port` is the TCP port the server listens on. `theme` is the default the frontend uses until you toggle it. You can also change the port later from the Setup tab in the browser, it is saved in your browser.

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
