/**
 * PHANToM Web Bridge — Node.js Local ADB Bridge
 * ----------------------------------------------
 * รองรับ:
 *   /health
 *   /devices
 *   /dial
 *   /hangup
 *   /answer
 *   /wifi/connect
 *   /push_text
 *
 * พร้อม CORS สำหรับ GitHub Pages (phantomguy7845.github.io)
 */

const http = require("http");
const { exec } = require("child_process");
const os = require("os");

const PORT = 8765; // ปรับได้ตามต้องการ
const ADB_PATH = "./adb/adb.exe"; // path ไปยัง adb.exe ภายในโฟลเดอร์โปรเจกต์

// ===== Helper: Run ADB Command =====
function runADB(cmd) {
  return new Promise((resolve, reject) => {
    exec(`"${ADB_PATH}" ${cmd}`, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message);
      else resolve(stdout.trim());
    });
  });
}

// ===== Helper: JSON Response =====
function sendJSON(res, data, code = 200) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

// ===== Server =====
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJSON(res, { ok: true });
    return;
  }

  if (req.url === "/health") {
    sendJSON(res, { ok: true, status: "ok", version: "1.1.0" });
    return;
  }

  if (req.url === "/devices") {
    try {
      const out = await runADB("devices -l");
      const lines = out.split("\n").slice(1).filter(l => l.trim());
      const devices = lines.map(l => {
        const [serial, status] = l.split("\t");
        return { serial, status, transport: "usb", model: serial };
      });
      sendJSON(res, { ok: true, devices });
    } catch (e) {
      sendJSON(res, { ok: false, error: e.toString() }, 500);
    }
    return;
  }

  if (req.url === "/dial" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try {
        const { serial, number } = JSON.parse(body || "{}");
        if (!serial || !number)
          return sendJSON(res, { ok: false, error: "Missing serial or number" }, 400);
        await runADB(`-s ${serial} shell am start -a android.intent.action.CALL -d tel:${number}`);
        sendJSON(res, { ok: true });
      } catch (e) {
        sendJSON(res, { ok: false, error: e.toString() }, 500);
      }
    });
    return;
  }

  if (req.url === "/hangup" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try {
        const { serial } = JSON.parse(body || "{}");
        if (!serial)
          return sendJSON(res, { ok: false, error: "Missing serial" }, 400);
        await runADB(`-s ${serial} shell input keyevent KEYCODE_ENDCALL`);
        sendJSON(res, { ok: true });
      } catch (e) {
        sendJSON(res, { ok: false, error: e.toString() }, 500);
      }
    });
    return;
  }

  if (req.url === "/answer" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try {
        const { serial } = JSON.parse(body || "{}");
        if (!serial)
          return sendJSON(res, { ok: false, error: "Missing serial" }, 400);
        await runADB(`-s ${serial} shell input keyevent KEYCODE_CALL`);
        sendJSON(res, { ok: true });
      } catch (e) {
        sendJSON(res, { ok: false, error: e.toString() }, 500);
      }
    });
    return;
  }

  if (req.url === "/push_text" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try {
        const { serial, text } = JSON.parse(body || "{}");
        if (!serial || !text)
          return sendJSON(res, { ok: false, error: "Missing serial or text" }, 400);
        await runADB(`-s ${serial} shell am broadcast -a clipper.set -e text "${text}"`);
        sendJSON(res, { ok: true });
      } catch (e) {
        sendJSON(res, { ok: false, error: e.toString() }, 500);
      }
    });
    return;
  }

  if (req.url === "/wifi/connect" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try {
        const { host } = JSON.parse(body || "{}");
        if (!host)
          return sendJSON(res, { ok: false, error: "Missing host" }, 400);
        const out = await runADB(`connect ${host}`);
        sendJSON(res, { ok: true, result: out });
      } catch (e) {
        sendJSON(res, { ok: false, error: e.toString() }, 500);
      }
    });
    return;
  }

  sendJSON(res, { ok: false, error: "Unknown endpoint" }, 404);
});

// ===== Helper: Detect Host =====
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

// ===== Start Server =====
server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log("=========================================");
  console.log("✅ PHANToM Web Bridge started successfully!");
  console.log(`🌐 Local access : http://127.0.0.1:${PORT}`);
  console.log(`📡 LAN access   : http://${ip}:${PORT}`);
  console.log("-----------------------------------------");
  console.log("Use this Host + Port in your PHANToM Web Dialer UI");
  console.log("=========================================");
});
