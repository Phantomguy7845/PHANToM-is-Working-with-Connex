// PHANToM Web Dialer — App Logic (USB Live + Sim + Relay Option)
import { WebADB } from './phantom-webadb.js';

const $ = (s, c=document) => c.querySelector(s);
const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));

const btnUsb = $('#btnConnectUsb');
const btnWifi = $('#btnConnectWifi');
const relayUrlEl = $('#relayUrl');
const wifiTargetEl = $('#wifiTarget');

const numberEl = $('#number');
const callBtn = $('#callBtn');
const hangBtn = $('#hangBtn');
const answerBtn = $('#answerBtn');

const togglePushBtn = $('#togglePush');
const pushArea = $('#pushArea');
const pushInput = $('#pushText');
const pushDo = $('#pushDo');

const searchEl = $('#search');
const dedupeEl = $('#dedupe');
const showAllBtn = $('#showAll');
const last5El = $('#last5');

const statusEl = $('#status');
const toastEl = $('#toast');

const LS_HISTORY = 'PHANTOM_DIAL_HISTORY_V1';
const LS_SETTINGS = 'PHANTOM_DIAL_SETTINGS_V1';

let adb = new WebADB();
let connected = false;

// ------------- Init -------------
init();

function init(){
  // ฟอร์กัสช่องหมายเลขทุกครั้งที่เปิดหน้า
  setTimeout(()=> numberEl?.focus(), 0);

  // โหลด settings เดิม
  const s = load(LS_SETTINGS) || {};
  if (s.relayUrl) relayUrlEl.value = s.relayUrl;

  // ปรับปุ่ม Wi-Fi: ถ้าไม่มี relay → ยังไม่เปิดใช้จริง (อธิบาย)
  btnWifi.addEventListener('click', onConnectWifi);
  btnUsb.addEventListener('click', onConnectUsb);

  // Dial controls
  callBtn.addEventListener('click', onCall);
  hangBtn.addEventListener('click', onHang);
  answerBtn.addEventListener('click', onAnswer);

  // Hotkeys
  document.addEventListener('keydown', (e)=>{
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (typing && document.activeElement !== numberEl) return;

    if (e.key === 'Enter'){ e.preventDefault(); onCall(); }
    if (e.key === 'Escape'){ e.preventDefault(); onHang(); }
    if (e.key === ' '){ e.preventDefault(); onAnswer(); }
  }, true);

  // Push Text
  togglePushBtn.addEventListener('click', ()=>{
    pushArea.classList.toggle('hide');
    if (!pushArea.classList.contains('hide')) pushInput.focus();
  });
  pushDo.addEventListener('click', async ()=>{
    const t = (pushInput.value||'').trim(); if(!t) return tip('พิมพ์ข้อความก่อน');
    if (!connected) return tip('ยังไม่ได้เชื่อมต่ออุปกรณ์');
    try{
      await adb.pushClipboard(t);
      pushInput.value='';
      tip('ส่งข้อความไปคลิปบอร์ดบนอุปกรณ์แล้ว', true);
    }catch(err){ tip('ส่งคลิปบอร์ดไม่สำเร็จ'); console.error(err); }
  });

  // History
  searchEl.addEventListener('input', renderHistory);
  dedupeEl.addEventListener('change', renderHistory);
  showAllBtn.addEventListener('click', ()=>{
    const all = getHistory();
    showHistoryDialog(all);
  });

  // เริ่มด้วย Last 5
  renderHistory();
  updateStatus('ยังไม่ได้เชื่อมต่อ');
}

// ------------- Connect USB -------------
async function onConnectUsb(){
  try{
    await adb.connectUsb(info=>{
      connected = true;
      updateStatus(`เชื่อมต่อ USB: ${info.model} (Android ${info.version})`);
    });
    tip('เชื่อมต่อ USB สำเร็จ', true);
  }catch(err){
    connected = false;
    console.error(err);
    tip('เชื่อมต่อ USB ไม่สำเร็จ — ตรวจสอบ USB Debugging และอนุญาต WebUSB');
    updateStatus('ยังไม่ได้เชื่อมต่อ');
  }
}

// ------------- Connect Wi-Fi via Relay (ออปชัน) -------------
async function onConnectWifi(){
  const relay = (relayUrlEl.value||'').trim();
  const target = (wifiTargetEl.value||'').trim();

  // เก็บค่าไว้
  save(LS_SETTINGS, { relayUrl: relay });

  if (!relay){
    return tip('Wi-Fi Debugging บนเว็บเพียว ๆ ต้องมี ADB Relay URL (WebSocket) — หากคุณยังไม่มี ให้ใช้ USB แทนสำหรับตอนนี้');
  }
  if (!target || !/^\d+\.\d+\.\d+\.\d+:\d+$/.test(target)){
    return tip('กรุณากรอก IP:Port ให้ถูกต้อง เช่น 192.168.1.50:5555');
  }

  try{
    await adb.connectWifiViaRelay(relay, target, info=>{
      connected = true;
      updateStatus(`เชื่อมต่อผ่าน Relay → ${info.serial}`);
    });
    tip('เชื่อมต่อ Wi-Fi ผ่าน Relay แล้ว (กำลังโหมดทดลอง)', true);
  }catch(err){
    connected = false;
    console.error(err);
    tip('เชื่อมต่อ Wi-Fi ผ่าน Relay ไม่สำเร็จ');
  }
}

// ------------- Dial actions -------------
async function onCall(){
  const num = (numberEl.value||'').trim();
  if (!num) return tip('ใส่เบอร์ก่อน');
  if (!connected) return tip('ยังไม่ได้เชื่อมต่ออุปกรณ์');

  try{
    await adb.call(num);
    tip(`โทรออก: ${num}`, true);
    addHistory({ number:num, ts:Date.now(), type:'call' });
    renderHistory();
  }catch(err){
    console.error(err);
    tip('สั่งโทรผ่าน ADB ไม่ได้ — ตรวจสอบสิทธิ์ USB Debugging/อนุญาต ADB');
  }
}

async function onHang(){
  if (!connected) return tip('ยังไม่ได้เชื่อมต่ออุปกรณ์');
  try{
    await adb.hangup();
    tip('วางสายแล้ว', true);
    addHistory({ number:'-', ts:Date.now(), type:'hang' });
    renderHistory();
  }catch(err){ console.error(err); tip('วางสายไม่สำเร็จ'); }
}

async function onAnswer(){
  if (!connected) return tip('ยังไม่ได้เชื่อมต่ออุปกรณ์');
  try{
    await adb.answer();
    tip('รับสายแล้ว', true);
    addHistory({ number:'-', ts:Date.now(), type:'answer' });
    renderHistory();
  }catch(err){ console.error(err); tip('รับสายไม่สำเร็จ'); }
}

// ------------- History -------------
function getHistory(){ return load(LS_HISTORY) || []; }
function addHistory(rec){
  const arr = getHistory();
  arr.unshift(rec);
  save(LS_HISTORY, arr.slice(0, 1000)); // เก็บสูงสุด 1000 รายการ
}

function renderHistory(){
  const q = (searchEl.value||'').trim();
  let list = getHistory().filter(x => x.type==='call');

  if (q){
    list = list.filter(x => x.number.includes(q));
  }
  if (dedupeEl.checked){
    // keep latest only per number
    const seen = new Set();
    list = list.filter(x=>{
      if (seen.has(x.number)) return false;
      seen.add(x.number); return true;
    });
  }
  const top = list.slice(0,5);

  last5El.innerHTML = '';
  if (!top.length){
    last5El.innerHTML = `<div class="item"><span>ไม่มีข้อมูล</span></div>`;
    return;
  }
  top.forEach(r=>{
    const div = document.createElement('div');
    div.className='item';
    div.innerHTML = `<b>${r.number}</b> <small>${fmtTime(r.ts)}</small>`;
    last5El.appendChild(div);
  });
}

function showHistoryDialog(all){
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const card = document.createElement('div');
  card.style.cssText = 'background:#0f1a33;color:#fff;border:1px solid #334;border-radius:12px;max-width:720px;width:90%;max-height:80vh;overflow:auto;padding:16px;';
  const head = document.createElement('div');
  head.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
  head.innerHTML = `<h3 style="margin:0">ประวัติทั้งหมด</h3><button id="__close" class="btn ghost">ปิด</button>`;
  card.appendChild(head);

  const input = document.createElement('input');
  input.type='search'; input.placeholder='ค้นหาเบอร์…'; input.style.cssText='width:100%;padding:8px 10px;background:#0b1328;border:1px solid #334;border-radius:8px;color:#ddd;margin-bottom:10px;';
  card.appendChild(input);

  const list = document.createElement('div');
  card.appendChild(list);
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  const renderAll = ()=>{
    const q = (input.value||'').trim();
    list.innerHTML='';
    let arr = all.filter(x=>x.type==='call');
    if (q) arr = arr.filter(x=> x.number.includes(q));
    arr.forEach(r=>{
      const row = document.createElement('div');
      row.className='item';
      row.style.margin='6px 0';
      row.innerHTML = `<b>${r.number}</b> <small>${fmtTime(r.ts)}</small>`;
      list.appendChild(row);
    });
  };
  input.addEventListener('input', renderAll);
  renderAll();

  card.querySelector('#__close').addEventListener('click', ()=> wrap.remove());
}

// ------------- Helpers -------------
function updateStatus(t){ statusEl.textContent = t; }
function tip(t, ok=false){
  toastEl.textContent = t;
  toastEl.style.borderColor = ok ? '#22c55e' : '#3b82f6';
  toastEl.classList.add('show');
  setTimeout(()=> toastEl.classList.remove('show'), 1600);
}
function fmtTime(ts){
  const d = new Date(ts);
  const pad = n=> String(n).padStart(2,'0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
}
function load(k){ try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null} }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
