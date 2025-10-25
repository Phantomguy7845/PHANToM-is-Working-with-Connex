/* PHANToM Web Dialer — WebUSB ADB (Aurora 2025)
   - USB primary (multiple device picker)
   - Auto-connect (optional)
   - Dial / Hang / Answer via ADB shell
   - History + recent preview + full modal with search & de-dup
   - Push Text -> device clipboard
   - Keyboard: Enter (call), Esc (hang), Space (answer), focus number on load
*/

import { Adb } from "https://esm.sh/@yume-chan/adb@0.13.2";
import { AdbWebUsbBackend } from "https://esm.sh/@yume-chan/adb-backend-webusb@0.13.2";

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const btnConnect   = $("#btnConnect");
const btnReconnect = $("#btnReconnect");
const btnWifi      = $("#btnWifi");
const btnSettings  = $("#btnSettings");
const settingsPane = $("#settingsPane");
const optAuto      = $("#optAutoConnect");
const optLog       = $("#optLog");
const optHaptics   = $("#optHaptics");

const phoneNumber  = $("#phoneNumber");
const btnClear     = $("#btnClear");
const btnCall      = $("#btnCall");
const btnHang      = $("#btnHang");
const btnAnswer    = $("#btnAnswer");

const recentList   = $("#recentList");
const btnAllHistory= $("#btnAllHistory");
const historyModal = $("#historyModal");
const historySearch= $("#historySearch");
const filterDedup  = $("#filterDedup");
const historyList  = $("#historyList");

const statusEl     = $("#status");
const toastEl      = $("#toast");

const btnPushTextToggle = $("#btnPushTextToggle");
const pushTextPanel = $("#pushTextPanel");
const pushTextInput = $("#pushTextInput");
const btnPushText = $("#btnPushText");
const btnPushTextClear = $("#btnPushTextClear");

// persistent keys
const LS_SETTINGS = "PHANTOM_DIALER_SETTINGS_V1";
const LS_HISTORY  = "PHANTOM_DIALER_HISTORY_V1";

// runtime
let adb = null;           // Adb instance
let transport = null;     // WebUSB transport
let settings = loadSettings();
let history = loadHistory();

init();

function init(){
  // restore settings
  optAuto.checked = !!settings.autoConnect;
  optLog.checked  = !!settings.consoleLog;
  optHaptics.checked = !!settings.haptics;

  // UI binds
  btnSettings.addEventListener("click", ()=> settingsPane.classList.toggle("show"));
  optAuto.addEventListener("change", ()=> saveSettings({autoConnect: optAuto.checked}));
  optLog.addEventListener("change",  ()=> saveSettings({consoleLog: optLog.checked}));
  optHaptics.addEventListener("change", ()=> saveSettings({haptics: optHaptics.checked}));

  btnConnect.addEventListener("click", connectUsbPicker);
  btnReconnect.addEventListener("click", autoConnect);
  btnWifi.addEventListener("click", ()=> tip("Wi-Fi Debug ยังไม่เปิดใช้ (เตรียมโครงไว้แล้ว)"));

  phoneNumber.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){ e.preventDefault(); doCall(); }
    if(e.key === "Escape"){ e.preventDefault(); doHang(); }
  });
  btnClear.addEventListener("click", ()=>{ phoneNumber.value=""; phoneNumber.focus(); });

  // keypad
  $$(".quickpad .pad").forEach(b=>{
    b.addEventListener("click", ()=>{
      phoneNumber.value += b.textContent.trim();
      phoneNumber.focus();
      pulse(b);
    });
  });

  // main controls
  btnCall.addEventListener("click", doCall);
  btnHang.addEventListener("click", doHang);
  btnAnswer.addEventListener("click", doAnswer);

  // keyboard global
  document.addEventListener("keydown", (e)=>{
    const inInput = ["INPUT","TEXTAREA"].includes(document.activeElement?.tagName);
    if(inInput) return;
    if(e.key==="Enter"){ e.preventDefault(); doCall(); }
    else if(e.key==="Escape"){ e.preventDefault(); doHang(); }
    else if(e.code==="Space"){ e.preventDefault(); doAnswer(); }
  });

  // history
  btnAllHistory.addEventListener("click", openHistory);
  historySearch.addEventListener("input", renderHistory);
  filterDedup.addEventListener("change", renderHistory);

  // push text panel
  btnPushTextToggle.addEventListener("click", ()=>{
    pushTextPanel.classList.toggle("hidden");
    if(!pushTextPanel.classList.contains("hidden")) pushTextInput.focus();
  });
  btnPushText.addEventListener("click", pushTextToDevice);
  btnPushTextClear.addEventListener("click", ()=> pushTextInput.value="");

  renderRecent();

  // focus number on first load
  setTimeout(()=> phoneNumber.focus(), 250);

  // auto-connect if allowed
  if(settings.autoConnect) autoConnect();
}

// ---------- Connect ----------
async function connectUsbPicker(){
  try{
    const backend = await AdbWebUsbBackend.requestDevice();
    transport = await backend.connect();
    adb = await Adb.authenticate(transport);
    await afterConnected();
  }catch(err){
    log("connectUsbPicker error", err);
    tip("ยกเลิกหรือเชื่อมต่อไม่สำเร็จ");
  }
}

async function autoConnect(){
  try{
    const list = await AdbWebUsbBackend.getDevices();
    if(!list.length){ tip("ไม่พบอุปกรณ์ที่อนุญาตไว้แล้ว"); return; }
    // ถ้ามีหลายเครื่องจะให้ผู้ใช้เลือก
    let backend;
    if(list.length===1) backend = list[0];
    else{
      backend = await AdbWebUsbBackend.requestDevice(); // popup ให้เลือกเองตามที่กำหนดไว้
    }
    transport = await backend.connect();
    adb = await Adb.authenticate(transport);
    await afterConnected();
  }catch(err){
    log("autoConnect error", err);
    tip("Auto-connect ไม่สำเร็จ");
  }
}

async function afterConnected(){
  const props = await getDeviceProps();
  $("#deviceName").textContent = props.model || "Android";
  $("#deviceSerial").textContent = props.serial || "—";
  setStatus("USB: พร้อมใช้งาน");
  tip("เชื่อมต่อสำเร็จ", true);
}

// ดึงคุณสมบัติอุปกรณ์
async function getDeviceProps(){
  const out = { model:"", serial:"" };
  try{
    out.model = await shellRead("getprop ro.product.model");
    out.serial = await shellRead("getprop ro.serialno");
  }catch(e){ log(e); }
  return out;
}

// ---------- Core Actions ----------
async function doCall(){
  const num = (phoneNumber.value || "").replace(/\s+/g,"");
  if(!num){ tip("กรุณาใส่หมายเลขก่อนโทร"); phoneNumber.focus(); return; }
  if(!adb){ tip("ยังไม่เชื่อมต่ออุปกรณ์"); return; }

  try{
    // เปิด Dialer พร้อมหมายเลข
    await shell(`am start -a android.intent.action.DIAL -d tel:${num}`);
    // หน่วงเล็กน้อยแล้วกดปุ่ม CALL
    await sleep(350);
    await shell(`input keyevent 5`); // KEYCODE_CALL
    tip(`โทรออก: ${num}`, true);
    pushHistory({ action:"CALL", number:num });
  }catch(err){
    log("doCall err", err);
    tip("สั่งโทรล้มเหลว");
  }
}

async function doHang(){
  if(!adb){ tip("ยังไม่เชื่อมต่ออุปกรณ์"); return; }
  try{
    await shell(`input keyevent 6`); // KEYCODE_ENDCALL
    tip("วางสาย", true);
    pushHistory({ action:"HANG", number: phoneNumber.value.trim()||"-" });
  }catch(err){
    log("doHang err", err);
    tip("สั่งวางสายล้มเหลว");
  }
}

async function doAnswer(){
  if(!adb){ tip("ยังไม่เชื่อมต่ออุปกรณ์"); return; }
  try{
    // บางรุ่นใช้ HEADSETHOOK (79) จะทำงานดีกว่า
    await shell(`input keyevent 79 || input keyevent 5`);
    tip("รับสาย", true);
    pushHistory({ action:"ANSWER", number: phoneNumber.value.trim()||"-" });
  }catch(err){
    log("doAnswer err", err);
    tip("สั่งรับสายล้มเหลว");
  }
}

// ---------- Push Text ----------
async function pushTextToDevice(){
  if(!adb){ tip("ยังไม่เชื่อมต่ออุปกรณ์"); return; }
  const text = (pushTextInput.value||"").trim();
  if(!text){ tip("กรุณาพิมพ์ข้อความก่อน"); return; }
  try{
    // Android 10+ : cmd clipboard set text '...'
    const safe = text.replace(/'/g, "\\'");
    await shell(`cmd clipboard set text '${safe}'`);
    tip("ส่งข้อความไปคลิปบอร์ดมือถือแล้ว", true);
    pushTextInput.value="";
  }catch(err){
    log("pushText err", err);
    tip("ส่งไปคลิปบอร์ดไม่ได้ (Android เก่าไป?)");
  }
}

// ---------- ADB Shell Helpers ----------
async function shell(cmd){
  const proc = await adb.subprocess.shell(cmd);
  await readAll(proc.stdout);
  await proc.exit;
}

async function shellRead(cmd){
  const proc = await adb.subprocess.shell(cmd);
  const out = await readText(proc.stdout);
  await proc.exit;
  return out.trim();
}

async function readAll(stream){
  const r = stream.getReader();
  while(true){
    const { value, done } = await r.read();
    if(done) break;
  }
}
async function readText(stream){
  const decoder = new TextDecoder();
  const r = stream.getReader();
  let out = "";
  while(true){
    const { value, done } = await r.read();
    if(done) break;
    out += decoder.decode(value, {stream:true});
  }
  out += decoder.decode();
  return out;
}

// ---------- History ----------
function pushHistory(item){
  const row = {
    t: Date.now(),
    action: item.action,
    number: item.number
  };
  history.unshift(row);
  history = history.slice(0, 1000); // cap
  saveHistory();
  renderRecent();
}

function renderRecent(){
  recentList.innerHTML = "";
  history.slice(0,5).forEach(h=>{
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.textContent = `${h.action} — ${h.number}`;
    const right = document.createElement("div");
    right.className="meta";
    right.textContent = timefmt(h.t);
    li.append(left, right);
    recentList.append(li);
  });
}

function openHistory(){
  historyModal.showModal();
  renderHistory();
}

function renderHistory(){
  const q = (historySearch.value||"").trim();
  let data = history.slice();

  if(q){
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    data = data.filter(x=> re.test(x.number) || re.test(x.action));
  }

  if(filterDedup.checked){
    // เหลือเบอร์ละ 1 รายการ (ล่าสุด)
    const seen = new Set();
    const uniq = [];
    for(const row of data){
      if(seen.has(row.number)) continue;
      seen.add(row.number);
      uniq.push(row);
    }
    data = uniq;
  }

  historyList.innerHTML = "";
  data.forEach(h=>{
    const row = document.createElement("div");
    row.className="row";
    const c1 = document.createElement("div"); c1.textContent = timefmt(h.t);
    const c2 = document.createElement("div"); c2.textContent = h.number;
    const c3 = document.createElement("div"); c3.textContent = h.action;
    historyList.append(row); row.append(c1,c2,c3);
  });
}

// ---------- Status / Toast ----------
function setStatus(t){ statusEl.textContent = t; }
function tip(t, ok=false){
  toastEl.textContent = t;
  toastEl.style.borderColor = ok ? "var(--ok)" : "var(--edge)";
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), 1400);
}
function pulse(el){
  if(!el) return;
  el.style.transform="scale(0.96)";
  setTimeout(()=> el.style.transform="", 120);
}
function log(...a){ if(settings.consoleLog) console.log("[Dialer]", ...a); }

// ---------- Settings / History Storage ----------
function loadSettings(){
  try{ return JSON.parse(localStorage.getItem(LS_SETTINGS)||"{}"); }
  catch{ return {}; }
}
function saveSettings(patch){
  settings = { ...settings, ...patch };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}
function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(LS_HISTORY)||"[]"); }
  catch{ return []; }
}
function saveHistory(){
  localStorage.setItem(LS_HISTORY, JSON.stringify(history));
}

// ---------- Utils ----------
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function pad2(n){ return String(n).padStart(2,"0"); }
function timefmt(ts){
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      }
