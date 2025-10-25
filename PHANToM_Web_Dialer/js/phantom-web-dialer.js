/* PHANToM Web Dialer — no dialpad, keyboard-first UX */
(() => {
  // ---------- DOM ----------
  const devSel = $("#deviceSelect");
  const btnConnect = $("#btnConnect");
  const btnDisconnect = $("#btnDisconnect");
  const statePill = $("#connState");

  const numberInput = $("#numberInput");
  const btnCall = $("#btnCall");
  const btnAnswer = $("#btnAnswer");
  const btnHangup = $("#btnHangup");

  const btnPushToggle = $("#btnPushTextToggle");
  const pushPanel = $("#pushTextPanel");
  const pushInput = $("#pushTextInput");
  const btnPush = $("#btnPushText");

  const recentList = $("#recentList");
  const statusLog = $("#statusLog");

  const histModal = $("#historyModal");
  const btnHistoryOpen = $("#btnHistoryOpen");
  const btnHistoryClose = $("#btnHistoryClose");
  const histSearch = $("#histSearch");
  const histDedup = $("#histDedup");
  const histTable = $("#histTable tbody");
  const btnHistExport = $("#btnHistoryExport");
  const histImport = $("#historyImport");

  const toastEl = $("#toast");

  // ---------- State ----------
  const LS_HIST = "PHANTOM_WEB_DIALER_HISTORY_V1";
  let history = loadHistory();
  let connected = false;

  // ---------- Bridge (stub) ----------
  // จุดเชื่อมต่อกับ WebUSB / ADB-over-Web: แยกเป็น abstract API ไว้ก่อน
  const bridge = {
    async enumerate() {
      // TODO: เชื่อมจริงผ่าน WebUSB; ตอนนี้ mock รายการเดียวสำหรับเดโม
      return [{ id: "mock1", label: "Android (mock)" }];
    },
    async connect(id) {
      // TODO: connectจริง
      await delay(200);
      return true;
    },
    async disconnect() {
      await delay(100);
      return true;
    },
    async dial(number) {
      await delay(250);
      return { ok: true, result: "dialing" };
    },
    async answer() {
      await delay(120);
      return { ok: true, result: "answered" };
    },
    async hangup() {
      await delay(100);
      return { ok: true, result: "hungup" };
    },
    async pushClipboard(text) {
      // ต้องใช้ ADB: `cmd clipboard set <text>`
      await delay(120);
      return { ok: true };
    },
  };

  // ---------- Init ----------
  initDevices();
  initUI();
  renderRecent();
  log("พร้อมทำงาน — เชื่อมต่ออุปกรณ์เพื่อเริ่มใช้งาน");

  // ---------- Devices ----------
  async function initDevices() {
    const items = await bridge.enumerate();
    devSel.innerHTML = items.map(d => `<option value="${esc(d.id)}">${esc(d.label)}</option>`).join("") || `<option value="">(ไม่พบอุปกรณ์)</option>`;
  }

  btnConnect.addEventListener("click", async () => {
    const id = devSel.value;
    if (!id) return tip("ไม่พบอุปกรณ์");
    const ok = await bridge.connect(id);
    connected = !!ok;
    setState(connected);
    tip(connected ? "เชื่อมต่อแล้ว" : "เชื่อมต่อไม่สำเร็จ");
    if (connected) numberInput.focus();
  });

  btnDisconnect.addEventListener("click", async () => {
    await bridge.disconnect();
    connected = false;
    setState(false);
    tip("ตัดการเชื่อมต่อแล้ว");
  });

  function setState(ok) {
    statePill.textContent = ok ? "Connected" : "Disconnected";
    statePill.style.borderColor = ok ? "var(--ok)" : "#334";
    statePill.style.color = ok ? "#bfffd2" : "var(--muted)";
  }

  // ---------- Call Controls ----------
  btnCall.addEventListener("click", callNow);
  btnAnswer.addEventListener("click", answerNow);
  btnHangup.addEventListener("click", hangupNow);

  async function callNow() {
    const num = numberInput.value.trim();
    if (!num) return tip("ใส่หมายเลขก่อน");
    if (!connected) return tip("ยังไม่ได้เชื่อมต่ออุปกรณ์");
    const r = await bridge.dial(num);
    log(`โทรไปยัง ${num} → ${r.result}`);
    addHistory({ number: num, at: Date.now(), result: "outgoing" });
    renderRecent();
  }
  async function answerNow() {
    if (!connected) return tip("ยังไม่ได้เชื่อมต่ออุปกรณ์");
    const r = await bridge.answer();
    log(`รับสาย → ${r.result}`);
  }
  async function hangupNow() {
    if (!connected) return tip("ยังไม่ได้เชื่อมต่ออุปกรณ์");
    const r = await bridge.hangup();
    log(`วางสาย → ${r.result}`);
  }

  // ---------- Push Text ----------
  btnPushToggle.addEventListener("click", () => {
    pushPanel.classList.toggle("hide");
    if (!pushPanel.classList.contains("hide")) pushInput.focus();
  });
  btnPush.addEventListener("click", pushNow);
  async function pushNow() {
    const text = pushInput.value;
    if (!text) return tip("พิมพ์ข้อความก่อน");
    if (!connected) return tip("ยังไม่ได้เชื่อมต่ออุปกรณ์");
    const r = await bridge.pushClipboard(text);
    if (r.ok) {
      tip("ส่งข้อความไปยังคลิปบอร์ดของอุปกรณ์แล้ว");
      pushInput.value = "";
    }
  }

  // ---------- Recent ----------
  function renderRecent() {
    const last5 = [...history].reverse().slice(0, 5);
    recentList.innerHTML = last5.map(h => `<li data-num="${esc(h.number)}">${esc(h.number)}</li>`).join("") || `<li class="muted">—</li>`;
    $$(`#recentList li`).forEach(li => li.addEventListener("click", () => {
      numberInput.value = li.dataset.num || "";
      numberInput.focus();
    }));
  }

  function addHistory(item) {
    history.push(item);
    saveHistory();
  }

  // ---------- History Modal ----------
  btnHistoryOpen.addEventListener("click", () => { renderHistory(); histModal.showModal(); });
  btnHistoryClose.addEventListener("click", () => histModal.close());
  histSearch.addEventListener("input", renderHistory);
  histDedup.addEventListener("change", renderHistory);
  btnHistExport.addEventListener("click", exportHistory);
  histImport.addEventListener("change", importHistory);

  function renderHistory() {
    const q = histSearch.value.trim();
    let list = [...history];
    if (q) list = list.filter(h => h.number.includes(q));
    if (histDedup.checked) {
      // เก็บล่าสุดของแต่ละเบอร์
      const map = new Map();
      for (let i = list.length - 1; i >= 0; i--) {
        const k = list[i].number;
        if (!map.has(k)) map.set(k, list[i]);
      }
      list = Array.from(map.values()).sort((a,b)=>a.at-b.at);
    }
    histTable.innerHTML = list
      .map(h => `<tr><td>${fmtTime(h.at)}</td><td>${esc(h.number)}</td><td>${h.result}</td></tr>`)
      .join("") || `<tr><td colspan="3" class="muted">— ไม่มีข้อมูล —</td></tr>`;
  }

  function exportHistory() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "PHANToM_Web_Dialer_History.json";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
    tip("Export ประวัติแล้ว");
  }

  function importHistory(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const obj = JSON.parse(String(ev.target.result||"[]"));
        if (!Array.isArray(obj)) throw 0;
        history = obj;
        saveHistory(); renderRecent(); renderHistory();
        tip("Import ประวัติแล้ว");
      } catch { tip("ไฟล์ไม่ถูกต้อง"); }
      histImport.value = "";
    };
    r.readAsText(f);
  }

  // ---------- Keyboard shortcuts ----------
  // โฟกัสอัตโนมัติทุกครั้งที่โหลด
  window.addEventListener("load", () => numberInput.focus());

  document.addEventListener("keydown", (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    // ถ้าพิมพ์อยู่ในช่องข้อความ push-panel ให้ไม่ intercept
    if (tag === "INPUT" && document.activeElement === pushInput) return;

    if (e.key === "Enter") { e.preventDefault(); callNow(); }
    if (e.key === "Escape") { e.preventDefault(); hangupNow(); }
    if (e.key === " " || e.code === "Space") { e.preventDefault(); answerNow(); }
  });

  // ---------- Utils ----------
  function $(s, c=document){ return c.querySelector(s); }
  function $$(s, c=document){ return Array.from(c.querySelectorAll(s)); }
  function esc(s=""){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
  function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function fmtTime(t){ const d=new Date(t); return d.toLocaleString(); }
  function tip(t){ toastEl.textContent=t; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1400); }
  function log(t){ statusLog.innerHTML += `<div>${esc(t)}</div>`; statusLog.scrollTop = statusLog.scrollHeight; }

  function loadHistory(){ try{ return JSON.parse(localStorage.getItem(LS_HIST)||"[]"); }catch{ return []; } }
  function saveHistory(){ localStorage.setItem(LS_HIST, JSON.stringify(history)); }
})();
