/* PHANToM Web Dialer — Web UI + Local Bridge (ADB)
   - Bridge base: http://127.0.0.1:9223 (configurable)
   - Auto-detect bridge (auto-retry)
   - Device list (USB / Wi-Fi debug), pick specific device
   - Dial / Answer / Hangup
   - Push Text to device clipboard
   - History (preview 5, full modal with search + dedupe)
   - Keyboard: Enter(dial), Space(answer), Esc(hangup), Ctrl+Z(undo)
*/

(function(){
  const BRIDGE = "http://127.0.0.1:9223";

  // ---- DOM
  const bridgeStatusEl = $("#bridgeStatus");
  const deviceStatusEl = $("#deviceStatus");
  const probeBridgeBtn = $("#probeBridge");
  const openInstallBtn = $("#openInstall");
  const listDevicesBtn = $("#listDevices");
  const deviceSelect = $("#deviceSelect");
  const wifiHostEl = $("#wifiHost");
  const wifiConnectBtn = $("#wifiConnect");

  const numberInput = $("#numberInput");
  const callBtn = $("#callBtn");
  const answerBtn = $("#answerBtn");
  const hangupBtn = $("#hangupBtn");

  const togglePushBtn = $("#togglePush");
  const pushArea = $("#pushArea");
  const pushInput = $("#pushInput");
  const pushSendBtn = $("#pushSend");

  const lastFiveEl = $("#lastFive");
  const historyModal = $("#historyModal");
  const openHistoryBtn = $("#openHistory");
  const closeHistoryBtn = $("#closeHistory");
  const historySearch = $("#historySearch");
  const dedupeToggle = $("#dedupeToggle");
  const clearHistoryBtn = $("#clearHistory");
  const historyBody = $("#historyBody");

  const toastEl = $("#toast");

  // ---- State
  const LS_HISTORY = "PHANTOM_DIAL_HISTORY_V1";
  const LS_LAST_DEVICE = "PHANTOM_DIAL_LAST_DEVICE";
  let bridgeOnline = false;
  let devices = [];
  let selectedSerial = localStorage.getItem(LS_LAST_DEVICE) || "";
  let undoStack = []; // simple undo for last action text/number replace
  let pingTimer = null;

  // ---- Init
  initUI();
  autoRetryBridge(); // start polling
  focusNumberInput();
  renderLastFive();
  if (selectedSerial) updateDeviceStatus();

  // ================== INIT & EVENTS ==================
  function initUI(){
    probeBridgeBtn.addEventListener("click", probeBridge);
    openInstallBtn.addEventListener("click", onOpenInstallBridge);

    listDevicesBtn.addEventListener("click", listDevices);
    deviceSelect.addEventListener("change", onPickDevice);
    wifiConnectBtn.addEventListener("click", onConnectWifi);

    callBtn.addEventListener("click", dialNow);
    answerBtn.addEventListener("click", answerNow);
    hangupBtn.addEventListener("click", hangupNow);

    togglePushBtn.addEventListener("click", ()=>{
      pushArea.classList.toggle("show");
      if (pushArea.classList.contains("show")) pushInput.focus();
    });
    pushSendBtn.addEventListener("click", pushTextNow);

    openHistoryBtn.addEventListener("click", openHistory);
    closeHistoryBtn.addEventListener("click", closeHistory);
    historySearch.addEventListener("input", renderHistory);
    dedupeToggle.addEventListener("change", renderHistory);
    clearHistoryBtn.addEventListener("click", clearHistory);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e)=>{
      // typing inside inputs
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA";

      // Ctrl+Z undo (only for numberInput & pushInput text change)
      if (e.ctrlKey && (e.key === "z" || e.key === "Z")){
        e.preventDefault();
        performUndo();
        return;
      }

      if (typing){
        // allow default typing
        // (Enter on number input => dial)
        if (document.activeElement === numberInput && e.key === "Enter"){
          e.preventDefault(); dialNow(); return;
        }
        return;
      }

      if (e.key === "Enter"){ e.preventDefault(); dialNow(); return; }
      if (e.key === " "){ e.preventDefault(); answerNow(); return; }
      if (e.key === "Escape"){ e.preventDefault(); hangupNow(); return; }
    });

    // Track changes for undo
    trackUndo(numberInput);
    trackUndo(pushInput);
  }

  function focusNumberInput(){
    numberInput.focus();
    numberInput.select();
  }

  // ================== BRIDGE ==================
  async function probeBridge(){
    try{
      const r = await fetchJSON("/health");
      if (r && (r.status==="ok" || r.ok)){
        setBridgeOnline(true, r.version ? `v${r.version}`:"OK");
        return true;
      }
    }catch{}
    setBridgeOnline(false);
    return false;
  }
  function setBridgeOnline(ok, info=""){
    bridgeOnline = !!ok;
    if (ok){
      bridgeStatusEl.classList.remove("offline");
      bridgeStatusEl.classList.add("online");
      bridgeStatusEl.textContent = `Bridge: Online ${info?`(${info})`:""}`;
    }else{
      bridgeStatusEl.classList.remove("online");
      bridgeStatusEl.classList.add("offline");
      bridgeStatusEl.textContent = "Bridge: Offline";
    }
  }

  function autoRetryBridge(){
    // immediate check
    probeBridge();
    // then poll with fixed interval (10s)
    safeClearInterval(pingTimer);
    pingTimer = setInterval(probeBridge, 10000);
  }

  async function onOpenInstallBridge(){
    // แนวทาง: เปิดลิงก์ README/ตัวติดตั้งของคุณเอง (ภายใน repo) หรือ deep-link ไปที่ exe ในเครื่องไม่ได้
    // ที่นี่เราจะเปิดหน้าชี้แนะการติดตั้งใน repo เดิม (คุณสามารถสร้างเพจคู่มือได้แล้วชี้ลิงก์ตรงนี้)
    // ถ้าคุณนำไฟล์ .exe ไว้ใน repo ให้เปลี่ยน URL ข้างล่างนี้
    window.open("../README_BRIDGE_SETUP.html", "_blank");
  }

  // ================== DEVICES ==================
  async function listDevices(){
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/devices");
      devices = Array.isArray(res?.devices) ? res.devices : [];
      renderDeviceOptions();
      toast(`พบอุปกรณ์ ${devices.length} เครื่อง`);
      // auto-pick if single
      if (devices.length === 1){
        selectedSerial = devices[0].serial;
        deviceSelect.value = selectedSerial;
        localStorage.setItem(LS_LAST_DEVICE, selectedSerial);
        updateDeviceStatus();
      }
    }catch(e){
      toast("ดึงรายการอุปกรณ์ไม่ได้");
    }
  }

  function renderDeviceOptions(){
    deviceSelect.innerHTML = `<option value="">— ยังไม่เลือกอุปกรณ์ —</option>`;
    devices.forEach(d=>{
      const opt = document.createElement("option");
      opt.value = d.serial;
      opt.textContent = `${d.model||'Device'} — ${d.serial} [${d.transport||'usb'}]`;
      deviceSelect.appendChild(opt);
    });
    if (selectedSerial){
      const found = devices.find(d=>d.serial===selectedSerial);
      if (found) deviceSelect.value = selectedSerial;
    }
  }

  function onPickDevice(){
    selectedSerial = deviceSelect.value || "";
    localStorage.setItem(LS_LAST_DEVICE, selectedSerial);
    updateDeviceStatus();
  }

  async function onConnectWifi(){
    const host = (wifiHostEl.value||"").trim();
    if (!host){ toast("กรอก IP:PORT ก่อน"); return; }
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/wifi/connect", {method:"POST", body:{host}});
      if (res?.ok){
        toast("เชื่อมต่อ Wi-Fi Debug แล้ว");
        await listDevices();
        // เลือกเครื่องที่เพิ่งเชื่อมต่อ (ถ้า serial คืนมา)
        if (res.serial){
          selectedSerial = res.serial;
          deviceSelect.value = selectedSerial;
          localStorage.setItem(LS_LAST_DEVICE, selectedSerial);
          updateDeviceStatus();
        }
      }else{
        toast(res?.error || "เชื่อมต่อ Wi-Fi Debug ไม่สำเร็จ");
      }
    }catch(e){ toast("เชื่อมต่อ Wi-Fi Debug ไม่สำเร็จ"); }
  }

  function updateDeviceStatus(){
    if (!selectedSerial){
      deviceStatusEl.textContent = "Device: —";
      return;
    }
    const meta = devices.find(d=>d.serial===selectedSerial);
    const nick = meta ? (meta.model||meta.serial) : selectedSerial;
    deviceStatusEl.textContent = `Device: ${nick}`;
  }

  // ================== ACTIONS ==================
  async function dialNow(){
    const number = (numberInput.value||"").trim();
    if (!number){ toast("กรอกหมายเลขก่อน"); numberInput.focus(); return; }
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    if (!selectedSerial){ toast("ยังไม่ได้เลือกอุปกรณ์"); return; }
    try{
      const res = await fetchJSON("/dial", {method:"POST", body:{serial:selectedSerial, number}});
      if (res?.ok){
        addHistory({act:"dial", number});
        toast("กำลังโทรออก…");
      }else{
        toast(res?.error || "สั่งโทรผ่าน ADB ไม่ได้");
      }
    }catch(e){
      toast("สั่งโทรผ่าน ADB ไม่ได้ - ตรวจสอบ Bridge/ADB/สิทธิ์");
    }
  }

  async function hangupNow(){
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    if (!selectedSerial){ toast("ยังไม่ได้เลือกอุปกรณ์"); return; }
    try{
      const res = await fetchJSON("/hangup", {method:"POST", body:{serial:selectedSerial}});
      if (res?.ok){
        addHistory({act:"hangup"});
        toast("วางสายแล้ว");
      }else{
        toast(res?.error || "สั่งวางสายไม่ได้");
      }
    }catch(e){
      toast("สั่งวางสายไม่ได้");
    }
  }

  async function answerNow(){
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    if (!selectedSerial){ toast("ยังไม่ได้เลือกอุปกรณ์"); return; }
    try{
      const res = await fetchJSON("/answer", {method:"POST", body:{serial:selectedSerial}});
      if (res?.ok){
        addHistory({act:"answer"});
        toast("รับสายแล้ว");
      }else{
        toast(res?.error || "สั่งรับสายไม่ได้");
      }
    }catch(e){
      toast("สั่งรับสายไม่ได้");
    }
  }

  async function pushTextNow(){
    const text = (pushInput.value||"").trim();
    if (!text){ toast("กรอกข้อความก่อน"); return; }
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    if (!selectedSerial){ toast("ยังไม่ได้เลือกอุปกรณ์"); return; }
    try{
      const res = await fetchJSON("/push_text", {method:"POST", body:{serial:selectedSerial, text}});
      if (res?.ok){
        addHistory({act:"push_text", meta:text});
        pushInput.value = "";
        toast("ส่งข้อความไป Clipboard บนอุปกรณ์แล้ว");
      }else{
        toast(res?.error || "สั่ง Push Text ไม่ได้");
      }
    }catch(e){
      toast("สั่ง Push Text ไม่ได้");
    }
  }

  // ================== HISTORY ==================
  function addHistory(item){
    const hist = loadHistory();
    hist.unshift({
      ts: Date.now(),
      act: item.act,
      number: item.number||"",
      meta: item.meta||""
    });
    saveHistory(hist.slice(0, 2000)); // cap
    renderLastFive();
    if (historyModal.open) renderHistory();
  }

  function renderLastFive(){
    const hist = loadHistory();
    const five = hist.slice(0,5);
    lastFiveEl.innerHTML = "";
    five.forEach(h=>{
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.textContent = labelOf(h);
      const right = document.createElement("div");
      right.className = "ts";
      right.textContent = fmtTime(h.ts);
      li.append(left, right);
      lastFiveEl.appendChild(li);
    });
  }

  function openHistory(){
    historyModal.showModal();
    historySearch.value = "";
    dedupeToggle.checked = false;
    renderHistory();
  }
  function closeHistory(){ historyModal.close(); }

  function renderHistory(){
    const q = (historySearch.value||"").trim();
    const dedupe = dedupeToggle.checked;
    let hist = loadHistory();

    if (q){
      const qq = q.toLowerCase();
      hist = hist.filter(h => (h.number||"").toLowerCase().includes(qq));
    }
    if (dedupe){
      const seen = new Set();
      const uniq = [];
      for (const h of hist){
        const key = h.number||"";
        if (key && !seen.has(key)){
          uniq.push(h);
          seen.add(key);
        }
      }
      hist = uniq;
    }

    historyBody.innerHTML = "";
    hist.forEach(h=>{
      const tr = document.createElement("tr");
      const td1 = document.createElement("td"); td1.textContent = fmtTime(h.ts);
      const td2 = document.createElement("td"); td2.textContent = actName(h.act);
      const td3 = document.createElement("td"); td3.textContent = h.number || (h.meta||"");
      tr.append(td1, td2, td3);
      historyBody.appendChild(tr);
    });
  }

  function clearHistory(){
    if (!confirm("ล้างประวัติทั้งหมด ?")) return;
    saveHistory([]);
    renderLastFive();
    renderHistory();
  }

  function loadHistory(){
    try{ return JSON.parse(localStorage.getItem(LS_HISTORY)||"[]"); }catch{return []}
  }
  function saveHistory(arr){
    localStorage.setItem(LS_HISTORY, JSON.stringify(arr||[]));
  }
  function actName(act){
    if (act==="dial") return "โทรออก";
    if (act==="hangup") return "วางสาย";
    if (act==="answer") return "รับสาย";
    if (act==="push_text") return "Push Text";
    return act;
    }
  function labelOf(h){
    if (h.act==="dial") return `โทร: ${h.number}`;
    if (h.act==="hangup") return `วางสาย`;
    if (h.act==="answer") return `รับสาย`;
    if (h.act==="push_text") return `Push: ${limit(h.meta, 18)}`;
    return `${h.act}`;
  }

  // ================== UNDO ==================
  function trackUndo(inp){
    if (!inp) return;
    let last = inp.value;
    inp.addEventListener("input", ()=>{
      undoStack.push({el:inp, from:last, to:inp.value});
      if (undoStack.length>50) undoStack.shift();
      last = inp.value;
    });
  }
  function performUndo(){
    const last = undoStack.pop();
    if (!last) return;
    last.el.value = last.from;
    last.el.focus();
    last.el.selectionStart = last.el.selectionEnd = last.el.value.length;
    toast("ย้อนกลับแล้ว");
  }

  // ================== HELPERS ==================
  function $(s, ctx=document){ return ctx.querySelector(s); }
  function fmtTime(ts){
    const d = new Date(ts);
    const dd = pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear();
    const tt = pad2(d.getHours())+":"+pad2(d.getMinutes());
    return `${dd} ${tt}`;
  }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function limit(s, n){ s = s||""; return s.length>n ? s.slice(0,n-1)+"…" : s; }

  function toast(msg){
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(()=> toastEl.classList.remove("show"), 1600);
  }

  function safeClearInterval(t){ if (t) clearInterval(t); }

  async function fetchJSON(path, opts={}){
    const url = BRIDGE + path;
    const opt = { method: opts.method||"GET", headers: { "Content-Type":"application/json" } };
    if (opts.body) opt.body = JSON.stringify(opts.body);
    const res = await fetch(url, opt);
    const txt = await res.text();
    try{ return JSON.parse(txt); }catch{ return { ok:false, error: txt||"bad json" }; }
  }

})();
