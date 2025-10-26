/* PHANToM Web Dialer — Phase 1 (WebUSB-first, ADB-ready scaffolding)
   - No keypad; autfocus number input
   - Keyboard: Enter=call, Esc=hangup, Space=answer
   - WebUSB connect/disconnect; auto-reconnect when possible
   - Call logs (latest 5 + full history modal with search & dedupe)
   - Push Text: tries device clipboard via ADB shell; fallback to PC clipboard
*/

(function(){
  const $  = (s,c=document)=>c.querySelector(s);
  const $$ = (s,c=document)=>Array.from(c.querySelectorAll(s));

  // DOM
  const devStatus     = $("#devStatus");
  const btnConnect    = $("#btnConnect");
  const btnDisconnect = $("#btnDisconnect");

  const phoneInput = $("#phoneInput");
  const btnCall    = $("#btnCall");
  const btnAnswer  = $("#btnAnswer");
  const btnHangup  = $("#btnHangup");

  const pushPanel  = $("#pushTextPanel");
  const btnPushNow = $("#btnPushNow");
  const pushText   = $("#pushText");

  const recentList = $("#recentList");
  const btnShowAll = $("#btnShowAll");
  const btnClearLogs= $("#btnClearLogs");

  const historyModal = $("#historyModal");
  const closeHistory = $("#closeHistory");
  const searchLogs   = $("#searchLogs");
  const filterDup    = $("#filterDup");
  const historyList  = $("#historyList");

  const toastEl = $("#toast");

  // Storage
  const LS_LOGS = "PHANTOM_DIALER_LOGS_V1";
  const LS_DEV  = "PHANTOM_DIALER_LAST_DEVICE"; // for future auto-reconnect metadata
  let logs = loadLogs();

  // WebUSB Device (ADB interface)
  let adbDevice = null;
  let adbOpened = false;

  // ADB USB interface filter (class/subclass/protocol = 0xff/0x42/0x01 is common for adb)
  const ADB_FILTERS = [{ usbClass: 0xff, usbSubclass: 0x42, usbProtocol: 0x01 }];

  init();
  renderRecent();

  function init(){
    // Autofocus phone input on load
    window.addEventListener("load", ()=> { phoneInput?.focus(); });

    // Connect / Disconnect
    btnConnect.addEventListener("click", requestDevice);
    btnDisconnect.addEventListener("click", disconnectDevice);

    // Primary actions
    btnCall.addEventListener("click", makeCall);
    btnHangup.addEventListener("click", hangupCall);
    btnAnswer.addEventListener("click", answerCall);

    // Keyboard shortcuts (when not inside textarea)
    document.addEventListener("keydown", (e)=>{
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      const typing = tag === "TEXTAREA";
      if(typing) return;

      if(e.key === "Enter"){ e.preventDefault(); makeCall(); }
      if(e.key === "Escape"){ e.preventDefault(); hangupCall(); }
      if(e.code === "Space"){ e.preventDefault(); answerCall(); }
    });

    // Push text
    btnPushNow.addEventListener("click", pushClipboardToDevice);

    // Logs
    btnShowAll.addEventListener("click", openHistory);
    closeHistory.addEventListener("click", ()=> historyModal.close());
    btnClearLogs.addEventListener("click", clearLogs);
    searchLogs.addEventListener("input", renderHistory);
    filterDup.addEventListener("change", renderHistory);

    // Device disconnect event (if supported)
    if(navigator.usb){
      navigator.usb.addEventListener("disconnect", e=>{
        if(adbDevice && e.device === adbDevice){
          adbDevice = null; adbOpened = false;
          setDeviceStatus(false, "อุปกรณ์ตัดการเชื่อมต่อ");
        }
      });
    }

    // Try to remember user device (placeholder for future auto reconnect)
    tryAutoReconnect();
  }

  // -------------------- WebUSB Connect --------------------
  async function requestDevice(){
    if(!navigator.usb){
      tip("เบราว์เซอร์นี้ไม่รองรับ WebUSB", false);
      return;
    }
    try{
      const device = await navigator.usb.requestDevice({ filters: ADB_FILTERS });
      adbDevice = device;
      await openDevice();
    }catch(err){
      // user canceled or not found
      tip("ยกเลิกการเชื่อมต่อ หรือไม่พบอุปกรณ์", false);
    }
  }

  async function openDevice(){
    if(!adbDevice) return;
    try{
      if(!adbDevice.opened) await adbDevice.open();
      // Some devices require selecting configuration & claim interface
      if(adbDevice.configuration === null) await adbDevice.selectConfiguration(1);

      // Find ADB interface
      const adbIf = findAdbInterface(adbDevice);
      if(!adbIf){
        tip("ไม่พบบริการ ADB บนอุปกรณ์นี้", false);
        return;
      }
      await adbDevice.claimInterface(adbIf.interfaceNumber);
      adbOpened = true;
      btnDisconnect.disabled = false;
      setDeviceStatus(true, "เชื่อมต่อแล้ว");
      // Save minimal metadata
      localStorage.setItem(LS_DEV, JSON.stringify({vendorId: adbDevice.vendorId, productId: adbDevice.productId}));
    }catch(err){
      console.error(err);
      tip("เชื่อมต่ออุปกรณ์ไม่สำเร็จ", false);
    }
  }

  function findAdbInterface(device){
    const cfg = device.configuration;
    if(!cfg) return null;
    for(const iface of cfg.interfaces){
      for(const alt of iface.alternates){
        if(alt.interfaceClass === 0xff && alt.interfaceSubclass === 0x42 && alt.interfaceProtocol === 0x01){
          // Claim this
          return { interfaceNumber: iface.interfaceNumber, alternate: alt };
        }
      }
    }
    return null;
  }

  async function disconnectDevice(){
    try{
      if(!adbDevice) return;
      if(adbDevice.opened) await adbDevice.close();
    }catch(e){}
    adbDevice = null; adbOpened = false;
    btnDisconnect.disabled = true;
    setDeviceStatus(false, "ตัดการเชื่อมต่อแล้ว");
  }

  async function tryAutoReconnect(){
    // In Phase 1, browsers require user gesture for requestDevice
    // We can only gently hint the user if navigator.usb.getDevices() returns known devices
    if(!navigator.usb) return;
    const devs = await navigator.usb.getDevices();
    if(devs && devs.length){
      // Pick the first with ADB profile
      const target = devs.find(d=>{
        const cfg = d.configuration;
        if(!cfg) return false;
        return cfg.interfaces.some(ifc =>
          ifc.alternates.some(alt=> alt.interfaceClass===0xff && alt.interfaceSubclass===0x42 && alt.interfaceProtocol===0x01)
        );
      });
      if(target){
        adbDevice = target;
        openDevice();
      }
    }
  }

  function setDeviceStatus(connected, text){
    devStatus.textContent = text || (connected? "เชื่อมต่อแล้ว" : "ไม่ได้เชื่อมต่อ");
    devStatus.classList.toggle("muted", !connected);
    if(connected) tip("เชื่อมต่ออุปกรณ์สำเร็จ", true);
  }

  // -------------------- Call Controls --------------------
  async function makeCall(){
    const number = (phoneInput.value || "").trim();
    if(!number){ tip("กรอกหมายเลขก่อน", false); phoneInput.focus(); return; }

    // Phase 1: If ADB opened, try to send shell to start ACTION_CALL
    // Modern Android usually allows `adb shell am start -a android.intent.action.CALL -d tel:NUMBER`
    // NOTE: Requires CALL permissions. On many devices via shell it works; otherwise show fallback.
    let success = false;
    if(adbOpened){
      try{
        success = await adbShell(`am start -a android.intent.action.CALL -d tel:${escapeShell(number)}`);
      }catch(e){ success = false; }
    }
    if(!success){
      tip("สั่งโทรผ่าน ADB ไม่ได้ - ตรวจสิทธิ์/เปิด USB debugging หรือใช้งานด้วยสาย USB", false);
    }else{
      tip(`กำลังโทร: ${number}`, true);
      addLog("CALL", number);
    }
  }

  async function hangupCall(){
    // Many devices support: adb shell input keyevent KEYCODE_ENDCALL (6) or telecom hangup
    let success = false;
    if(adbOpened){
      try{
        success = await adbShell(`input keyevent KEYCODE_ENDCALL`);
      }catch(e){ success = false; }
    }
    tip(success? "วางสายแล้ว" : "สั่งวางสายไม่สำเร็จ", success);
    if(success) addLog("HANGUP", "");
  }

  async function answerCall(){
    // Often: adb shell input keyevent KEYCODE_CALL (5)
    let success = false;
    if(adbOpened){
      try{
        success = await adbShell(`input keyevent KEYCODE_CALL`);
      }catch(e){ success = false; }
    }
    tip(success? "รับสายแล้ว" : "สั่งรับสายไม่สำเร็จ", success);
    if(success) addLog("ANSWER", "");
  }

  // -------------------- Push Text to Device Clipboard --------------------
  async function pushClipboardToDevice(){
    const text = (pushText.value || "").trim();
    if(!text){ tip("พิมพ์ข้อความก่อน", false); return; }

    let success = false;
    if(adbOpened){
      // Android 13+: `cmd clipboard set "text"`
      // For older: need a helper app/broadcast. Phase 1: try cmd; if fails, fallback to PC clipboard.
      try{
        success = await adbShell(`cmd clipboard set "${escapeQuotes(text)}"`);
      }catch(e){ success = false; }
    }
    if(!success){
      // Fallback to PC clipboard
      try{
        await navigator.clipboard.writeText(text);
        tip("คัดลอกข้อความไว้บนคอมพ์แล้ว (อุปกรณ์ไม่รองรับ ADB Clipboard)", true);
      }catch(e){
        tip("ไม่สามารถคัดลอกได้", false);
      }
    }else{
      tip("ส่งข้อความไป Clipboard ของอุปกรณ์แล้ว", true);
    }
    // clear input
    pushText.value = "";
  }

  // -------------------- Logs --------------------
  function addLog(type, number){
    const rec = {
      id: uid(),
      type,            // CALL / HANGUP / ANSWER
      number: number || "",
      at: Date.now()
    };
    logs.unshift(rec);
    saveLogs();
    renderRecent();
  }

  function renderRecent(){
    recentList.innerHTML = "";
    const recent = logs.slice(0,5);
    if(!recent.length){
      recentList.innerHTML = `<div class="log-item"><div class="meta">ยังไม่มีประวัติ</div></div>`;
      return;
    }
    recent.forEach(r=>{
      recentList.appendChild(logRow(r));
    });
  }

  function openHistory(){
    historyModal.showModal();
    renderHistory();
  }

  function renderHistory(){
    const q = (searchLogs.value || "").trim();
    const dedupe = filterDup.checked;

    let data = logs.slice();
    if(q){
      const qq = q.toLowerCase();
      data = data.filter(x=> (x.number||"").toLowerCase().includes(qq));
    }
    if(dedupe){
      const map = new Map(); // number -> first seen (already newest order)
      const out = [];
      for(const x of data){
        const k = x.number || "";
        if(!map.has(k)){
          map.set(k, true);
          out.push(x);
        }
      }
      data = out;
    }
    historyList.innerHTML = "";
    if(!data.length){
      historyList.innerHTML = `<div class="hist"><div class="meta">ไม่พบข้อมูล</div></div>`;
      return;
    }
    data.forEach(r=> historyList.appendChild(histRow(r)));
  }

  function clearLogs(){
    if(!confirm("ล้างประวัติการโทรทั้งหมด ?")) return;
    logs = [];
    saveLogs();
    renderRecent();
    if(historyModal.open) renderHistory();
    tip("ล้างประวัติแล้ว", true);
  }

  function logRow(r){
    const div = document.createElement("div");
    div.className = "log-item";
    const meta = document.createElement("div");
    meta.className = "meta";
    const label = typeLabel(r.type);
    meta.textContent = `${label}${r.number? " • "+r.number:""}`;
    const when = document.createElement("div");
    when.className = "when";
    when.textContent = formatTime(r.at);
    div.append(meta, when);
    return div;
    function typeLabel(t){
      if(t==="CALL") return "โทรออก";
      if(t==="HANGUP") return "วางสาย";
      if(t==="ANSWER") return "รับสาย";
      return t;
    }
  }
  function histRow(r){
    const div = document.createElement("div");
    div.className = "hist";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${r.number || "—"}`;
    const when = document.createElement("div");
    when.className = "when";
    when.textContent = `${formatTime(r.at)} · ${r.type}`;
    div.append(meta, when);
    return div;
  }

  // -------------------- ADB Shell (Scaffold) --------------------
  // NOTE: Implementing full ADB protocol in-browser is non-trivial.
  // Phase 1: This is a placeholder that always RETURNS false.
  // When you later add an ADB transport (e.g., tiny JS ADB client),
  // replace this with real control transfer / bulk transfer to ADB endpoints.
  async function adbShell(cmd){
    console.log("[ADB SHELL] ->", cmd);
    if(!adbDevice || !adbOpened) return false;

    // TODO (Phase 2): implement minimal ADB handshake + OPEN/WRTE/OKAY/CLSE
    // For now, pretend fail to keep UX honest
    return false;
  }

  // -------------------- Utils --------------------
  function tip(t, ok=false){
    if(!toastEl) return;
    toastEl.textContent = t;
    toastEl.style.borderColor = ok ? "rgba(60,200,120,.6)" : "#2b3a5a";
    toastEl.classList.add("show");
    clearTimeout(tip._t);
    tip._t = setTimeout(()=> toastEl.classList.remove("show"), 1600);
  }
  function formatTime(ts){
    const d = new Date(ts);
    const pad2 = n=> String(n).padStart(2,"0");
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
    }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function saveLogs(){ localStorage.setItem(LS_LOGS, JSON.stringify(logs)); }
  function loadLogs(){ try{ return JSON.parse(localStorage.getItem(LS_LOGS)||"[]"); }catch{ return []; } }
  function escapeQuotes(s){ return s.replace(/"/g,'\\"'); }
  function escapeShell(s){ return s.replace(/(["\s'$`\\])/g,'\\$1'); }
})();
