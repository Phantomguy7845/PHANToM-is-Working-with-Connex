/* PHANToM Web Dialer — Custom Bridge Host/Port + UI Enhanced */
(function(){

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

  const LS_HISTORY = "PHANTOM_DIAL_HISTORY_V2";
  const LS_LAST_DEVICE = "PHANTOM_DIAL_LAST_DEVICE";
  const LS_BRIDGE_HOST = "PHANTOM_BRIDGE_HOST";
  const LS_BRIDGE_PORT = "PHANTOM_BRIDGE_PORT";

  let bridgeOnline = false;
  let devices = [];
  let selectedSerial = localStorage.getItem(LS_LAST_DEVICE) || "";
  let pingTimer = null;

  // ---- Init
  initUI();
  autoRetryBridge();
  focusNumberInput();
  renderLastFive();

  // ================== INIT & EVENTS ==================
  function initUI(){
    const hostEl = $("#bridgeHost");
    const portEl = $("#bridgePort");

    // โหลดค่าที่เคยใช้ล่าสุด
    hostEl.value = localStorage.getItem(LS_BRIDGE_HOST) || "127.0.0.1";
    portEl.value = localStorage.getItem(LS_BRIDGE_PORT) || "9223";

    hostEl.addEventListener("change", ()=>localStorage.setItem(LS_BRIDGE_HOST, hostEl.value));
    portEl.addEventListener("change", ()=>localStorage.setItem(LS_BRIDGE_PORT, portEl.value));

    probeBridgeBtn.addEventListener("click", probeBridge);
    listDevicesBtn.addEventListener("click", listDevices);
    deviceSelect.addEventListener("change", onPickDevice);
    wifiConnectBtn.addEventListener("click", onConnectWifi);

    callBtn.addEventListener("click", dialNow);
    answerBtn.addEventListener("click", answerNow);
    hangupBtn.addEventListener("click", hangupNow);
    togglePushBtn.addEventListener("click", ()=> pushArea.classList.toggle("show"));
    pushSendBtn.addEventListener("click", pushTextNow);

    openHistoryBtn.addEventListener("click", openHistory);
    closeHistoryBtn.addEventListener("click", closeHistory);
    historySearch.addEventListener("input", renderHistory);
    dedupeToggle.addEventListener("change", renderHistory);
    clearHistoryBtn.addEventListener("click", clearHistory);

    document.addEventListener("keydown", (e)=>{
      if (e.key === "Enter"){ dialNow(); }
      if (e.key === " "){ e.preventDefault(); answerNow(); }
      if (e.key === "Escape"){ hangupNow(); }
    });
  }

  function getBridgeBase(){
    const host = $("#bridgeHost").value.trim() || "127.0.0.1";
    const port = $("#bridgePort").value.trim() || "9223";
    return `http://${host}:${port}`;
  }

  function focusNumberInput(){ numberInput.focus(); }

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
    probeBridge();
    clearInterval(pingTimer);
    pingTimer = setInterval(probeBridge, 8000);
  }

  // ================== DEVICES ==================
  async function listDevices(){
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/devices");
      devices = Array.isArray(res?.devices) ? res.devices : [];
      renderDeviceOptions();
      toast(`พบอุปกรณ์ ${devices.length} เครื่อง`);
      if (devices.length === 1){
        selectedSerial = devices[0].serial;
        deviceSelect.value = selectedSerial;
        localStorage.setItem(LS_LAST_DEVICE, selectedSerial);
        updateDeviceStatus();
      }
    }catch{ toast("ดึงรายการอุปกรณ์ไม่ได้"); }
  }

  function renderDeviceOptions(){
    deviceSelect.innerHTML = `<option value="">— ยังไม่เลือกอุปกรณ์ —</option>`;
    devices.forEach(d=>{
      const opt = document.createElement("option");
      opt.value = d.serial;
      opt.textContent = `${d.model||'Device'} — ${d.serial} [${d.transport||'usb'}]`;
      deviceSelect.appendChild(opt);
    });
    if (selectedSerial) deviceSelect.value = selectedSerial;
  }

  function onPickDevice(){
    selectedSerial = deviceSelect.value || "";
    localStorage.setItem(LS_LAST_DEVICE, selectedSerial);
    updateDeviceStatus();
  }

  async function onConnectWifi(){
    const host = wifiHostEl.value.trim();
    if (!host){ toast("กรอก IP:PORT ก่อน"); return; }
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/wifi/connect", {method:"POST", body:{host}});
      if (res?.ok){ toast("เชื่อมต่อ Wi-Fi Debug แล้ว"); listDevices(); }
      else toast(res?.error || "เชื่อมต่อ Wi-Fi Debug ไม่สำเร็จ");
    }catch{ toast("เชื่อมต่อ Wi-Fi Debug ไม่สำเร็จ"); }
  }

  function updateDeviceStatus(){
    if (!selectedSerial){ deviceStatusEl.textContent = "Device: —"; return; }
    const meta = devices.find(d=>d.serial===selectedSerial);
    deviceStatusEl.textContent = `Device: ${meta?.model||selectedSerial}`;
  }

  // ================== ACTIONS ==================
  async function dialNow(){
    const number = numberInput.value.trim();
    if (!number){ toast("กรอกหมายเลขก่อน"); numberInput.focus(); return; }
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/dial", {method:"POST", body:{number}});
      if (res?.ok){ addHistory({act:"dial", number}); toast("กำลังโทรออก…"); }
      else toast("สั่งโทรผ่าน ADB ไม่ได้");
    }catch{ toast("สั่งโทรผ่าน ADB ไม่ได้"); }
  }

  async function hangupNow(){
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/hangup", {method:"POST"});
      if (res?.ok){ addHistory({act:"hangup"}); toast("วางสายแล้ว"); }
    }catch{ toast("สั่งวางสายไม่ได้"); }
  }

  async function answerNow(){
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/answer", {method:"POST"});
      if (res?.ok){ addHistory({act:"answer"}); toast("รับสายแล้ว"); }
    }catch{ toast("สั่งรับสายไม่ได้"); }
  }

  async function pushTextNow(){
    const text = pushInput.value.trim();
    if (!text){ toast("กรอกข้อความก่อน"); return; }
    if (!bridgeOnline){ toast("Bridge ไม่ออนไลน์"); return; }
    try{
      const res = await fetchJSON("/push_text", {method:"POST", body:{text}});
      if (res?.ok){ addHistory({act:"push_text", meta:text}); toast("ส่งข้อความแล้ว"); }
    }catch{ toast("Push ไม่ได้"); }
  }

  // ================== HISTORY ==================
  function addHistory(item){
    const hist = loadHistory();
    hist.unshift({ ts: Date.now(), act: item.act, number: item.number||"", meta: item.meta||"" });
    saveHistory(hist.slice(0,500));
    renderLastFive();
    if (historyModal.open) renderHistory();
  }

  function renderLastFive(){
    const hist = loadHistory().slice(0,5);
    lastFiveEl.innerHTML = hist.map(h=>`<li>${actName(h.act)} — ${h.number||h.meta||""}</li>`).join("");
  }

  function openHistory(){ historyModal.showModal(); renderHistory(); }
  function closeHistory(){ historyModal.close(); }

  function renderHistory(){
    const q = historySearch.value.trim().toLowerCase();
    const dedupe = dedupeToggle.checked;
    let hist = loadHistory();
    if (q) hist = hist.filter(h => (h.number||"").includes(q));
    if (dedupe){
      const seen = new Set(); hist = hist.filter(h => !seen.has(h.number) && seen.add(h.number));
    }
    historyBody.innerHTML = hist.map(h=>`<tr><td>${fmtTime(h.ts)}</td><td>${actName(h.act)}</td><td>${h.number||h.meta||""}</td></tr>`).join("");
  }

  function clearHistory(){ if (confirm("ล้างประวัติทั้งหมด?")){ saveHistory([]); renderLastFive(); } }

  function loadHistory(){ try{return JSON.parse(localStorage.getItem(LS_HISTORY)||"[]");}catch{return[]} }
  function saveHistory(arr){ localStorage.setItem(LS_HISTORY, JSON.stringify(arr||[])); }

  // ================== HELPERS ==================
  function $(s, ctx=document){ return ctx.querySelector(s); }
  function toast(msg){ toastEl.textContent = msg; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1500); }
  function fmtTime(ts){ const d=new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}`; }
  function pad(n){return String(n).padStart(2,"0");}
  function actName(a){return a==="dial"?"โทรออก":a==="hangup"?"วางสาย":a==="answer"?"รับสาย":a==="push_text"?"Push":"อื่นๆ";}

  async function fetchJSON(path, opts={}){
    const url = getBridgeBase() + path;
    const opt = {method:opts.method||"GET",headers:{"Content-Type":"application/json"}};
    if (opts.body) opt.body = JSON.stringify(opts.body);
    const res = await fetch(url, opt);
    const txt = await res.text();
    try{return JSON.parse(txt);}catch{return {ok:false,error:txt};}
  }

})();
