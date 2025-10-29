/* PHANToM Web Dialer — UI คุยกับ Bridge ที่เลือกอุปกรณ์ไว้แล้ว */

(function () {
  const LS_HOST = "PHANTOM_BRIDGE_HOST";
  const LS_PORT = "PHANTOM_BRIDGE_PORT";
  const LS_HISTORY = "PHANTOM_DIAL_HISTORY_V1";

  // DOM
  const hostEl = $("#bridgeHost");
  const portEl = $("#bridgePort");
  const bridgeStatusEl = $("#bridgeStatus");
  const probeBtn = $("#probeBridge");
  const installA = $("#openInstall");

  const numberInput = $("#numberInput");
  const callBtn = $("#callBtn");
  const answerBtn = $("#answerBtn");
  const hangupBtn = $("#hangupBtn");

  const togglePushBtn = $("#togglePush");
  const pushArea = $("#pushArea");
  const pushInput = $("#pushInput");
  const pushSendBtn = $("#pushSend");

  const lastFiveEl = $("#lastFive");
  const openHistoryBtn = $("#openHistory");
  const historyModal = $("#historyModal");
  const historySearch = $("#historySearch");
  const dedupeToggle = $("#dedupeToggle");
  const clearHistoryBtn = $("#clearHistory");
  const closeHistoryBtn = $("#closeHistory");
  const historyBody = $("#historyBody");

  const toastEl = $("#toast");

  // init
  hostEl.value = localStorage.getItem(LS_HOST) || "127.0.0.1";
  portEl.value = localStorage.getItem(LS_PORT) || "8765";
  setInstallLink();
  renderLastFive();
  focusNumber();

  probeBtn.addEventListener("click", probeBridge);
  installA.addEventListener("click", setInstallLink);

  [hostEl, portEl].forEach(el =>
    el.addEventListener("change", () => {
      localStorage.setItem(LS_HOST, hostEl.value.trim());
      localStorage.setItem(LS_PORT, portEl.value.trim());
      setInstallLink();
      probeBridge();
    })
  );

  callBtn.addEventListener("click", dialNow);
  answerBtn.addEventListener("click", answerNow);
  hangupBtn.addEventListener("click", hangupNow);

  togglePushBtn.addEventListener("click", () => {
    pushArea.classList.toggle("hide");
    if (!pushArea.classList.contains("hide")) pushInput.focus();
  });
  pushSendBtn.addEventListener("click", pushTextNow);

  openHistoryBtn.addEventListener("click", openHistory);
  closeHistoryBtn.addEventListener("click", () => historyModal.close());
  clearHistoryBtn.addEventListener("click", clearHistory);
  historySearch.addEventListener("input", renderHistory);
  dedupeToggle.addEventListener("change", renderHistory);

  document.addEventListener("keydown", (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA";
    if (typing && document.activeElement === numberInput && e.key === "Enter") {
      e.preventDefault(); dialNow(); return;
    }
    if (typing) return;
    if (e.key === "Enter") { e.preventDefault(); dialNow(); return; }
    if (e.key === " ") { e.preventDefault(); answerNow(); return; }
    if (e.key === "Escape") { e.preventDefault(); hangupNow(); return; }
  });

  // helpers
  function baseURL() {
    const h = (hostEl.value || "").trim() || "127.0.0.1";
    const p = (portEl.value || "").trim() || "8765";
    return `http://${h}:${p}`;
  }
  function setInstallLink() {
    // ใส่ลิงก์ Releases ของคุณ (ไฟล์ .exe)
    installA.href =
      "https://github.com/Phantomguy7845/PHANToM-is-Working-with-Connex/releases/latest";
  }
  async function probeBridge() {
    try {
      const r = await fetchJSON("/health");
      if (r?.ok) {
        bridgeStatusEl.classList.remove("offline");
        bridgeStatusEl.classList.add("online");
        bridgeStatusEl.textContent = `Bridge: Online`;
        return true;
      }
      throw new Error("bad");
    } catch (e) {
      bridgeStatusEl.classList.remove("online");
      bridgeStatusEl.classList.add("offline");
      bridgeStatusEl.textContent = "Bridge: Offline";
      return false;
    }
  }
  function focusNumber() { numberInput.focus(); numberInput.select(); }

  // actions
  async function dialNow() {
    if (!(await probeBridge())) return toast("Bridge Offline");
    const number = (numberInput.value || "").trim();
    if (!number) return toast("กรอกหมายเลขก่อน");
    const res = await postJSON("/dial", { number });
    if (res.ok) { addHistory({ act: "dial", number }); toast("กำลังโทรออก…"); }
    else toast(res.error || "โทรออกไม่สำเร็จ");
  }
  async function answerNow() {
    if (!(await probeBridge())) return toast("Bridge Offline");
    const res = await postJSON("/answer", {});
    if (res.ok) { addHistory({ act: "answer" }); toast("รับสายแล้ว"); }
    else toast(res.error || "รับสายไม่ได้");
  }
  async function hangupNow() {
    if (!(await probeBridge())) return toast("Bridge Offline");
    const res = await postJSON("/hangup", {});
    if (res.ok) { addHistory({ act: "hangup" }); toast("วางสายแล้ว"); }
    else toast(res.error || "วางสายไม่ได้");
  }
  async function pushTextNow() {
    if (!(await probeBridge())) return toast("Bridge Offline");
    const text = (pushInput.value || "").trim();
    if (!text) return toast("กรอกข้อความก่อน");
    const res = await postJSON("/push_text", { text });
    if (res.ok) { addHistory({ act: "push_text", meta: text }); pushInput.value = ""; toast("ส่งข้อความแล้ว"); }
    else toast(res.error || "ส่งข้อความไม่ได้");
  }

  // history
  function addHistory(item) {
    const hist = loadHistory();
    hist.unshift({ ts: Date.now(), act: item.act, number: item.number || "", meta: item.meta || "" });
    saveHistory(hist.slice(0, 2000));
    renderLastFive();
    if (historyModal.open) renderHistory();
  }
  function renderLastFive() {
    const list = loadHistory().slice(0, 5);
    lastFiveEl.innerHTML = "";
    list.forEach(h => {
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.textContent = labelOf(h);
      const right = document.createElement("div");
      right.className = "ts";
      right.textContent = fmt(h.ts);
      li.append(left, right);
      lastFiveEl.appendChild(li);
    });
  }
  function openHistory() {
    historyModal.showModal();
    historySearch.value = "";
    dedupeToggle.checked = false;
    renderHistory();
  }
  function renderHistory() {
    const q = (historySearch.value || "").trim().toLowerCase();
    const dedupe = dedupeToggle.checked;
    let hist = loadHistory();
    if (q) hist = hist.filter(h => (h.number || "").toLowerCase().includes(q));
    if (dedupe) {
      const seen = new Set();
      hist = hist.filter(h => {
        const k = h.number || "";
        if (!k) return true;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    }
    historyBody.innerHTML = "";
    hist.forEach(h => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${fmt(h.ts)}</td><td>${nameOf(h.act)}</td><td>${h.number || h.meta || ""}</td>`;
      historyBody.appendChild(tr);
    });
  }
  function clearHistory() { if (confirm("ล้างประวัติทั้งหมด ?")) { saveHistory([]); renderLastFive(); renderHistory(); } }
  function loadHistory() { try { return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]"); } catch { return []; } }
  function saveHistory(v) { localStorage.setItem(LS_HISTORY, JSON.stringify(v || [])); }
  function labelOf(h) {
    if (h.act === "dial") return `โทร: ${h.number}`;
    if (h.act === "answer") return "รับสาย";
    if (h.act === "hangup") return "วางสาย";
    if (h.act === "push_text") return `Push: ${limit(h.meta, 18)}`;
    return h.act;
  }
  function nameOf(a) { return a === "dial" ? "โทรออก" : a === "answer" ? "รับสาย" : a === "hangup" ? "วางสาย" : a === "push_text" ? "Push Text" : a; }
  function fmt(ts) { const d = new Date(ts); return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function limit(s, n) { s = s || ""; return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function toast(m) {
    toastEl.textContent = m;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  async function fetchJSON(path, opt = {}) {
    const res = await fetch(baseURL() + path, { method: "GET", ...opt });
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { ok: false, error: t || "bad json" }; }
  }
  async function postJSON(path, body) {
    return fetchJSON(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
  }

  function $(s, c = document) { return c.querySelector(s); }
})();
