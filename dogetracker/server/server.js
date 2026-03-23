// DogeTracker Server
// REST API + static map page for the X-Plane plugin.
//
// Endpoints:
//   POST /api/position   – plugin pushes position every 5 s
//   GET  /api/users      – returns all active pilots (last seen < 60 s ago)
//   GET  /map            – serves the AviTab live-map page

"use strict";

const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────────────────────
//  In-memory pilot store  { pilot_id → PilotRecord }
// ─────────────────────────────────────────────────────────────────────────────
const PILOT_TTL_MS = 60_000; // remove pilot after 60 s of silence

/** @type {Map<string, Object>} */
const pilots = new Map();

// Prune stale pilots every 30 s
setInterval(() => {
  const cutoff = Date.now() - PILOT_TTL_MS;
  for (const [id, pilot] of pilots) {
    if (pilot.updated_at < cutoff) {
      pilots.delete(id);
      console.log(`[DogeTracker] Pilot ${pilot.callsign} (${id}) timed out.`);
    }
  }
}, 30_000);

// ─────────────────────────────────────────────────────────────────────────────
//  Middleware
// ─────────────────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/position
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/position", (req, res) => {
  const { pilot_id, callsign, aircraft, lat, lon, alt_ft, heading, speed_kts } = req.body;

  if (!pilot_id || lat == null || lon == null) {
    return res.status(400).json({ error: "pilot_id, lat and lon are required." });
  }

  const record = {
    pilot_id,
    callsign:   (callsign  || "N/A").trim().replace(/\0/g, ""),
    aircraft:   (aircraft  || "ZZZZ").trim().replace(/\0/g, ""),
    lat:        Number(lat),
    lon:        Number(lon),
    alt_ft:     Number(alt_ft    ?? 0),
    heading:    Number(heading   ?? 0),
    speed_kts:  Number(speed_kts ?? 0),
    updated_at: Date.now(),
  };

  const isNew = !pilots.has(pilot_id);
  pilots.set(pilot_id, record);
  if (isNew) console.log(`[DogeTracker] New pilot: ${record.callsign} flying ${record.aircraft}`);

  return res.json({ ok: true, online: pilots.size });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/users
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/users", (req, res) => {
  const cutoff = Date.now() - PILOT_TTL_MS;
  const active = [];
  for (const pilot of pilots.values()) {
    if (pilot.updated_at >= cutoff) {
      active.push({
        pilot_id:  pilot.pilot_id,
        callsign:  pilot.callsign,
        aircraft:  pilot.aircraft,
        lat:       pilot.lat,
        lon:       pilot.lon,
        alt_ft:    Math.round(pilot.alt_ft),
        heading:   Math.round(pilot.heading),
        speed_kts: Math.round(pilot.speed_kts),
        last_seen: Math.round((Date.now() - pilot.updated_at) / 1000),
      });
    }
  }
  return res.json({ count: active.length, pilots: active });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /map
// ─────────────────────────────────────────────────────────────────────────────
app.get("/map", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "map.html"));
});

app.get("/health", (_req, res) => res.json({ status: "ok", pilots: pilots.size }));

// ─────────────────────────────────────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[DogeTracker] Server running  → http://localhost:${PORT}`);
  console.log(`[DogeTracker] AviTab map page → http://localhost:${PORT}/map`);
});
