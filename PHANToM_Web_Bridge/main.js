// PHANToM Web Bridge — Device Manager + ADB Relay (Express)
// Focus: เลือกอุปกรณ์ที่ Bridge (ล็อก 1 เครื่อง), Wi-Fi connect, คำสั่ง ADB ทั้งหมดส่งเข้า “เครื่องที่เลือกไว้เท่านั้น”

// Install once (dev): npm i express cors adbkit
// Build (pkg): pkg main.js --targets win --output PHANToM-Web-Bridge.exe

const express = require("express");
const cors = require("cors");
const adb = require("adbkit");
const os = require("os");
const fs = require("fs");
const path = require("path");

// -------- Config --------
const PORT = Number(process.env.BRIDGE_PORT || process.argv[2] || 8765);
const STATE_FILE = path.join(process.cwd(), "bridge_state.json");

// -------- State --------
let state = loadState() || { selectedSerial: "", lastWiFiHost: "" };
const client = adb.createClient();

// -------- Utils --------
function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; }
}
async function listAllDevices() {
  const list = await client.listDevices(); // [{id, type}]
  const out = [];
  for (const d of list) {
    const serial = d.id;
    let model = "";
    try { model = (await client.getProperties(serial))["ro.product.model"] || ""; } catch {}
    out.push({ serial, model, transport: d.type || "usb" });
  }
  return out;
}
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
async function ensureSelectedConnected() {
  if (!state.selectedSerial) throw new Error("NO_SELECTED_DEVICE");
  // ตรวจว่ามีใน list จริงไหม
  const list = await listAllDevices();
  if (!list.find(d => d.serial === state.selectedSerial)) {
    throw new Error("SELECTED_DEVICE_NOT_FOUND");
  }
  return state.selectedSerial;
}
async function shell(serial, cmd) {
  const r = await client.shell(serial, cmd);
  return await adb.util.readAll(r);
}

// -------- Server --------
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin: true,
  methods: "GET,POST,OPTIONS",
  allowedHeaders: "Content-Type",
  credentials: false,
}));
app.options("*", cors());

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "ok", version: "1.1.0" });
});

// Info (ให้หน้าเว็บโชว์ host+port+selected)
app.get("/info", (req, res) => {
  res.json({
    ok: true,
    hostCandidates: getLocalIPs(),
    port: PORT,
    selectedSerial: state.selectedSerial || "",
    lastWiFiHost: state.lastWiFiHost || ""
  });
});

// รายการอุปกรณ์ (เพื่อให้ผู้ใช้เลือกที่ฝั่ง Bridge app)
app.get("/devices", async (req, res) => {
  try {
    const devices = await listAllDevices();
    res.json({ ok: true, devices, selectedSerial: state.selectedSerial || "" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// เลือกอุปกรณ์ (ล็อก 1 เครื่อง)
app.post("/select", async (req, res) => {
  try {
    const { serial } = req.body || {};
    if (!serial) return res.status(400).json({ ok: false, error: "serial required" });
    const devs = await listAllDevices();
    if (!devs.find(d => d.serial === serial)) {
      return res.status(404).json({ ok: false, error: "device not found" });
    }
    state.selectedSerial = serial;
    saveState();
    res.json({ ok: true, selectedSerial: serial });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// เชื่อมต่อ Wi-Fi debugging (adb connect ip:port)
app.post("/wifi/connect", async (req, res) => {
  try {
    const { host } = req.body || {};
    if (!host) return res.status(400).json({ ok: false, error: "host (ip:port) required" });
    await client.connect(host); // อาจโยน error หากไม่ได้เปิด wireless debugging
    state.lastWiFiHost = host;
    // หลัง connect สำเร็จ เลือกเครื่องนี้ให้เป็น selected ด้วย
    state.selectedSerial = host;
    saveState();
    res.json({ ok: true, serial: state.selectedSerial });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// โทรออก (เครื่องที่เลือกไว้เท่านั้น)
app.post("/dial", async (req, res) => {
  try {
    const { number } = req.body || {};
    if (!number) return res.status(400).json({ ok: false, error: "number required" });
    const serial = await ensureSelectedConnected();
    // เปิดโทรออก
    await shell(serial, `am start -a android.intent.action.CALL -d tel:${number}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// รับสาย
app.post("/answer", async (req, res) => {
  try {
    const serial = await ensureSelectedConnected();
    // วิธีทั่วไป (บางรุ่นอาจต้องใช้ service call telecom)
    await shell(serial, "input keyevent KEYCODE_CALL");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// วางสาย
app.post("/hangup", async (req, res) => {
  try {
    const serial = await ensureSelectedConnected();
    await shell(serial, "input keyevent KEYCODE_ENDCALL");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ส่งข้อความไป Clipboard
app.post("/push_text", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, error: "text required" });
    const serial = await ensureSelectedConnected();
    // ใช้ service เพื่อใส่คลิปบอร์ด (ต้องมี set-clipboard utility ในเครื่อง? ใช้มาตรฐาน input text แทน)
    // วิธีทั่วไป: ตั้งค่าใน primary clip ผ่าน am broadcast (บางรุ่นไม่รองรับ)
    // ทางเลือก fallback: ส่งผ่าน 'input text', ให้ผู้ใช้วางเอง
    await shell(serial, `am broadcast -a clipper.set -e text '${text.replace(/'/g,"\\'")}' || input text '${text.replace(/'/g,"\\'")}'`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Start
app.listen(PORT, () => {
  const ips = getLocalIPs();
  console.log("=========================================");
  console.log(" PHANToM Web Bridge is running");
  console.log(` Host candidates: ${ips.join(", ")}`);
  console.log(` Port: ${PORT}`);
  console.log(" Open this in Web Dialer:");
  console.log(`  Host: 127.0.0.1   Port: ${PORT}`);
  console.log(" Or use your LAN IP above as Host");
  console.log("=========================================");
});
