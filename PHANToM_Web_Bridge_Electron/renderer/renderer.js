(async function () {
  const portEl = $("#port");
  const savePortBtn = $("#savePort");
  const autoStartEl = $("#autoStart");
  const openReleasesBtn = $("#openReleases");

  const deviceListEl = $("#deviceList");
  const refreshBtn = $("#refresh");
  const wifiHostEl = $("#wifiHost");
  const wifiConnectBtn = $("#wifiConnect");
  const selectedInfoEl = $("#selectedInfo");
  const bridgeInfoEl = $("#bridgeInfo");

  // Load initial info
  const info = await window.bridgeAPI.getInfo();
  portEl.value = info.port || 8765;
  bridgeInfoEl.textContent = `Bridge running on http://127.0.0.1:${portEl.value}`;

  savePortBtn.addEventListener("click", async () => {
    const p = Number(portEl.value) || 8765;
    const r = await window.bridgeAPI.setPort(p);
    if (r?.ok) {
      bridgeInfoEl.textContent = `Bridge running on http://127.0.0.1:${r.port}`;
      alert("รีสตาร์ทเซิร์ฟเวอร์แล้ว");
    }
  });

  openReleasesBtn.addEventListener("click", async () => {
    const url = await window.bridgeAPI.getReleasesURL();
    window.open(url, "_blank");
  });

  autoStartEl.addEventListener("change", async () => {
    await window.bridgeAPI.openAtLogin(!!autoStartEl.checked);
  });

  refreshBtn.addEventListener("click", loadDevices);
  wifiConnectBtn.addEventListener("click", connectWifi);

  async function loadDevices() {
    const { base } = baseAPI();
    try {
      const r = await (await fetch(base + "/devices")).json();
      deviceListEl.innerHTML = "";
      if (!r.ok) throw new Error(r.error || "error");
      r.devices.forEach(d => {
        const li = document.createElement("li");
        li.className = "dev";
        li.innerHTML = `
          <div>
            <div class="name">${d.model || "Device"}</div>
            <div class="meta">${d.serial} — [${d.transport}]</div>
          </div>
          <button class="btn small ${r.selectedSerial === d.serial ? 'pri' : ''}">เลือก</button>
        `;
        li.querySelector("button").addEventListener("click", () => selectDevice(d.serial));
        deviceListEl.appendChild(li);
      });
      selectedInfoEl.textContent = `Selected: ${r.selectedSerial || "—"}`;
    } catch {
      alert("โหลดรายการอุปกรณ์ไม่ได้ — ตรวจสอบ ADB/ไดรเวอร์/USB/Wi-Fi");
    }
  }

  async function selectDevice(serial) {
    const { base } = baseAPI();
    try {
      const r = await (await fetch(base + "/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial })
      })).json();
      if (!r.ok) throw new Error(r.error || "error");
      await loadDevices();
    } catch {
      alert("เลือกอุปกรณ์ไม่สำเร็จ");
    }
  }

  async function connectWifi() {
    const host = (wifiHostEl.value || "").trim();
    if (!host) { alert("กรอก IP:PORT ก่อน"); return; }
    const { base } = baseAPI();
    try {
      const r = await (await fetch(base + "/wifi/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host })
      })).json();
      if (!r.ok) throw new Error(r.error || "error");
      wifiHostEl.value = "";
      await loadDevices();
      alert("เชื่อมต่อ Wi-Fi Debug แล้ว และตั้งเป็นเครื่องที่เลือก");
    } catch {
      alert("เชื่อมต่อ Wi-Fi Debug ไม่สำเร็จ");
    }
  }

  function baseAPI() {
    const port = Number(portEl.value) || 8765;
    return { base: `http://127.0.0.1:${port}` };
  }

  function $(s, c = document) { return c.querySelector(s); }

  // first load
  loadDevices();
})();
