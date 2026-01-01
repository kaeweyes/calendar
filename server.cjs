// server.cjs
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const router = express.Router();
const FILE = path.join(__dirname, "events.json");

// ensure file exists
async function ensureFile() {
  try {
    await fs.access(FILE);
  } catch (e) {
    await fs.writeFile(FILE, JSON.stringify([], null, 2), "utf8");
  }
}

async function readEvents() {
  await ensureFile();
  const raw = await fs.readFile(FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    await fs.writeFile(FILE, JSON.stringify([], null, 2), "utf8");
    return [];
  }
}

async function writeEvents(arr) {
  await fs.writeFile(FILE, JSON.stringify(arr, null, 2), "utf8");
}

/* ---------------- normalization helpers ---------------- */
function normalizeString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeName(v) {
  return normalizeString(v);
}

function normalizeDate(v) {
  // basic trim; expecting YYYY-MM-DD
  return normalizeString(v);
}

function normalizeTimeToHHMM(v) {
  // Accept inputs like "9", "9:0", "9:00", "09:00", null, ""
  // Return either "HH:MM" (zero-padded) or "" for empty/missing.
  const s = normalizeString(v);
  if (!s) return "";

  // try to extract hh and mm digits
  const m = s.match(/^(\d{1,2})(?::?)(\d{1,2})?$/);
  if (m) {
    let hh = parseInt(m[1], 10);
    let mm = m[2] ? parseInt(m[2], 10) : 0;
    if (Number.isNaN(hh)) hh = 0;
    if (Number.isNaN(mm)) mm = 0;
    // clamp
    hh = Math.max(0, Math.min(23, hh));
    mm = Math.max(0, Math.min(59, mm));
    const hhS = String(hh).padStart(2, "0");
    const mmS = String(mm).padStart(2, "0");
    return `${hhS}:${mmS}`;
  }

  // if string doesn't match HHMM-ish, return trimmed raw (but trimmed)
  return s;
}

/* ---------------- duplicate check ---------------- */
/**
 * Return existing series only if exact duplicate on:
 *   name (normalized) + startDate (normalized) + startTime(HH:MM or "") + endTime(HH:MM or "")
 */
async function findExactDuplicate(series) {
  if (!series || !series.name || !series.startDate) return null;
  const arr = await readEvents();

  const nameN = normalizeName(series.name);
  const dateN = normalizeDate(series.startDate);
  const startTimeN = normalizeTimeToHHMM(series.startTime);
  const endTimeN = normalizeTimeToHHMM(series.endTime);

  return arr.find((s) => {
    const sName = normalizeName(s.name);
    const sDate = normalizeDate(s.startDate);
    const sStart = normalizeTimeToHHMM(s.startTime);
    const sEnd = normalizeTimeToHHMM(s.endTime);
    return sName === nameN && sDate === dateN && sStart === startTimeN && sEnd === endTimeN;
  }) || null;
}

/* ---------------- routes ---------------- */

// GET all series
router.get("/", async (req, res) => {
  try {
    const arr = await readEvents();
    res.json(arr);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// POST create series (prevents exact duplicates only)
router.post("/", async (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== "object") return res.status(400).json({ error: "Invalid series" });
    if (!incoming.name || !incoming.startDate) return res.status(400).json({ error: "series.name and series.startDate required" });

    // Normalize and canonicalize the incoming object for storage
    const series = { ...incoming };
    series.name = normalizeName(series.name);
    series.startDate = normalizeDate(series.startDate);
    series.startTime = normalizeTimeToHHMM(series.startTime); // "" if missing
    series.endTime = normalizeTimeToHHMM(series.endTime);     // "" if missing

    if (!series.id) series.id = `ts-${Date.now()}`;

    // check exact duplicate
    const dup = await findExactDuplicate(series);
    if (dup) {
      console.warn("create blocked — exact duplicate found:", {
        tried: { name: series.name, startDate: series.startDate, startTime: series.startTime, endTime: series.endTime },
        existing: { id: dup.id, name: dup.name, startDate: dup.startDate, startTime: dup.startTime, endTime: dup.endTime }
      });
      return res.status(409).json({ error: "duplicate", existing: dup });
    }

    // append and save
    const arr = await readEvents();
    arr.push(series);
    await writeEvents(arr);

    res.status(201).json(series);
  } catch (err) {
    console.error("POST /events error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT update series by id (replace)
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const arr = await readEvents();
    const idx = arr.findIndex((s) => s.id === id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });

    const updated = { ...req.body };
    if (updated.name) updated.name = normalizeName(updated.name);
    if (updated.startDate) updated.startDate = normalizeDate(updated.startDate);
    updated.startTime = normalizeTimeToHHMM(updated.startTime);
    updated.endTime = normalizeTimeToHHMM(updated.endTime);

    arr[idx] = updated;
    await writeEvents(arr);
    res.json(arr[idx]);
  } catch (err) {
    console.error("PUT /events/:id error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE by id
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const arr = await readEvents();
    const idx = arr.findIndex((s) => s.id === id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const removed = arr.splice(idx, 1)[0];
    await writeEvents(arr);
    res.json({ removed });
  } catch (err) {
    console.error("DELETE /events/:id error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// POST add exclusion
router.post("/:id/exclude", async (req, res) => {
  try {
    const id = req.params.id;
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: "date required" });
    const arr = await readEvents();
    const s = arr.find((x) => x.id === id);
    if (!s) return res.status(404).json({ error: "Not found" });
    s.exclusions = s.exclusions || [];
    if (!s.exclusions.includes(date)) s.exclusions.push(date);
    await writeEvents(arr);
    res.json({ ok: true, series: s });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// POST set endDate
router.post("/:id/end", async (req, res) => {
  try {
    const id = req.params.id;
    const { endDate } = req.body;
    if (!endDate) return res.status(400).json({ error: "endDate required" });
    const arr = await readEvents();
    const s = arr.find((x) => x.id === id);
    if (!s) return res.status(404).json({ error: "Not found" });
    s.endDate = endDate;
    await writeEvents(arr);
    res.json({ ok: true, series: s });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT replace entire array (admin)
router.put("/", async (req, res) => {
  try {
    const arr = req.body;
    if (!Array.isArray(arr)) return res.status(400).json({ error: "array required" });
    await writeEvents(arr);
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /events error:", err);
    res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
