const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require("electron");
const path = require("path");
const store = require("./store");
const { createServer } = require("./server");

let tray = null;
let win = null;
let httpServer = null;

const SINGLE_LOCK = app.requestSingleInstanceLock();
if (!SINGLE_LOCK) {
  app.quit();
}

function startServer() {
  if (httpServer) try { httpServer.close(); } catch {}
  httpServer = createServer(store, (port) => {
    console.log("PHANToM Web Bridge running on port", port);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 520,
    resizable: false,
    title: "PHANToM Web Bridge",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.loadFile(path.join(__dirname, "renderer/index.html"));
  win.on("close", (e) => { e.preventDefault(); win.hide(); }); // hide to tray
}

function createTray() {
  const icon = nativeImage.createEmpty(); // ใส่ไอคอนจริงได้ภายหลัง
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: "เปิดหน้าต่าง", click: () => win.show() },
    { type: "separator" },
    { label: "คัดลอก Host+Port", click: copyInfo },
    { type: "separator" },
    { label: "ออก", role: "quit" }
  ]);
  tray.setToolTip("PHANToM Web Bridge");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => win.isVisible() ? win.hide() : win.show());
}

async function copyInfo() {
  const { clipboard } = require("electron");
  const info = {
    host: "127.0.0.1",
    port: store.get("port") || 8765
  };
  clipboard.writeText(`${info.host}:${info.port}`);
}

ipcMain.handle("get-info", async () => {
  return {
    port: store.get("port"),
    releasesURL: "https://github.com/Phantomguy7845/PHANToM-is-Working-with-Connex/releases/latest"
  };
});

ipcMain.handle("set-port", async (_e, p) => {
  const port = Number(p) || 8765;
  store.set("port", port);
  // restart server
  startServer();
  return { ok: true, port };
});

ipcMain.handle("open-at-login", async (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on, args: [] });
  return { ok: true };
});

ipcMain.handle("relaunch", async () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle("get-releases-url", async () => {
  return "https://github.com/Phantomguy7845/PHANToM-is-Working-with-Connex/releases/latest";
});

app.whenReady().then(() => {
  startServer();
  createWindow();
  createTray();
  win.show(); // โชว์ครั้งแรก (ปิดแล้วขึ้น tray)
});

app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); }
});

app.on("window-all-closed", (e) => {
  e.preventDefault(); // ไม่ออก ให้คงอยู่ใน tray
});
