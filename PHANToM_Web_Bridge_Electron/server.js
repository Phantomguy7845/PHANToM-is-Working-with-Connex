const express = require("express");
const cors = require("cors");
const os = require("os");
const adb = require("adbkit");
const client = adb.createClient();

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const k of Object.keys(nets)) {
    for (const n of nets[k] || []) {
      if (n.family === "IPv4" && !n.internal) addrs.push(n.address);
    }
  }
  return addrs.length ? addrs : ["127.0.0.1"];
}

async function listAllDevices() {
  const list = await client.listDevices();
  const out = [];
  for (const d of list) {
    const serial = d.id;
    let model = "";
    try {
      model = (await client.getProperties(serial))["ro.product.model"] || "";
    } catch {}
    out.push({ serial, model, transport: d.type || "usb" });
  }
  return out;
}

async function shell(serial, cmd) {
  const r = await client.shell(serial, cmd);
  return await adb.util.readAll(r);
}

function createServer(store, onListening) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cors({
    origin: true,
    methods: "GET,POST,OPTIONS",
    allowedHeaders: "Content-Type"
  }));
  app.options("*", cors());

  const version = "1.2.0";

  app.get("/health", (req, res) => {
    res.json({ ok: true, status: "ok", version });
  });

  app.get("/info", (req, res) => {
    res.json({
      ok: true,
      hostCandidates: getLocalIPs(),
      port: store.get("port"),
      selectedSerial: store.get("selectedSerial") || "",
      lastWiFiHost: store.get("lastWiFiHost") || ""
    });
  });

  app.get("/devices", async (req, res) => {
    try {
      const devices = await listAllDevices();
      res.json({ ok: true, devices, selectedSerial: store.get("selectedSerial") || "" });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/select", async (req, res) => {
    try {
      const { serial } = req.body || {};
      if (!serial) return res.status(400).json({ ok: false, error: "serial required" });
      const devs = await listAllDevices();
      if (!devs.find(d => d.serial === serial)) {
        return res.status(404).json({ ok: false, error: "device not found" });
      }
      store.set("selectedSerial", serial);
      res.json({ ok: true, selectedSerial: serial });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/wifi/connect", async (req, res) => {
    try {
      const { host } = req.body || {};
      if (!host) return res.status(400).json({ ok: false, error: "host (ip:port) required" });
      await client.connect(host);
      store.set("lastWiFiHost", host);
      store.set("selectedSerial", host);
      res.json({ ok: true, serial: host });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  async function ensureSelectedConnected() {
    const sel = store.get("selectedSerial");
    if (!sel) throw new Error("NO_SELECTED_DEVICE");
    const list = await listAllDevices();
    if (!list.find(d => d.serial === sel)) throw new Error("SELECTED_DEVICE_NOT_FOUND");
    return sel;
  }

  app.post("/dial", async (req, res) => {
    try {
      const { number } = req.body || {};
      if (!number) return res.status(400).json({ ok: false, error: "number required" });
      const serial = await ensureSelectedConnected();
      await shell(serial, `am start -a android.intent.action.CALL -d tel:${number}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/answer", async (req, res) => {
    try {
      const serial = await ensureSelectedConnected();
      await shell(serial, "input keyevent KEYCODE_CALL");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/hangup", async (req, res) => {
    try {
      const serial = await ensureSelectedConnected();
      await shell(serial, "input keyevent KEYCODE_ENDCALL");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/push_text", async (req, res) => {
    try {
      const { text } = req.body || {};
      if (!text) return res.status(400).json({ ok: false, error: "text required" });
      const serial = await ensureSelectedConnected();
      const safe = text.replace(/'/g, "\\'");
      await shell(serial, `am broadcast -a clipper.set -e text '${safe}' || input text '${safe}'`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  const server = app.listen(store.get("port"), () => {
    if (onListening) onListening(store.get("port"));
  });

  return server;
}

module.exports = { createServer };
