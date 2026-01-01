// unscheduled.cjs
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const router = express.Router();
const FILE = path.join(__dirname, "unscheduled_events.json");

async function ensureFile() {
  try {
    await fs.access(FILE);
  } catch (e) {
    await fs.writeFile(FILE, JSON.stringify([], null, 2), "utf8");
  }
}

async function readAll() {
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

async function writeAll(arr) {
  await fs.writeFile(FILE, JSON.stringify(arr, null, 2), "utf8");
}

function normalizeString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// GET list
router.get("/", async (req, res) => {
  try {
    const all = await readAll();
    res.json(all);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// POST add (body should include at least { id, name })
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.id) return res.status(400).json({ error: "body with id required" });
    if (!body.name) return res.status(400).json({ error: "body.name required" });

    const all = await readAll();
    if (!all.find(x => x.id === body.id)) {
      const item = { ...body, name: normalizeString(body.name) };
      all.unshift(item);
      await writeAll(all);
      return res.json({ ok: true, item });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE by id
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const all = await readAll();
    const filtered = all.filter(x => x.id !== id);
    await writeAll(filtered);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
