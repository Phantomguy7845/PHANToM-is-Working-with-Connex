/* PHANToM Web Dialer — GitHub Pages Sim Mode
   - ไม่ต้องติดตั้งอะไรบน PC
   - รักษาฟังก์ชันเดิม: โฟกัสช่องเบอร์, Enter โทรออก / Esc วางสาย / Space รับสาย
   - ประวัติการโทร + ค้นหา realtime + ซ่อนเบอร์ซ้ำ (แสดงรายการล่าสุด)
   - Push Text (จำลอง): คัดลอกข้อความไปคลิปบอร์ดของเครื่องนี้
   - Auto-connect (จำลอง), รองรับหลายอุปกรณ์ (เลือกชื่อจำลอง)
*/

(function(){
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));

  // DOM
  const connStatus=$("#connStatus");
  const btnConnect=$("#btnConnect");
  const btnDisconnect=$("#btnDisconnect");
  const autoConnectEl=$("#autoConnect");
  const numberInput=$("#numberInput");
  const btnCall=$("#btnCall");
  const btnAnswer=$("#btnAnswer");
  const btnHangup=$("#btnHangup");
  const togglePushText=$("#togglePushText");
  const pushTextArea=$("#pushTextArea");
  const pushText=$("#pushText");
  const btnPush=$("#btnPush");

  const searchBox=$("#searchBox");
  const dedupeEl=$("#dedupe");
  const btnClearHistory=$("#btnClearHistory");
  const recentList=$("#recentList");
  const allList=$("#allList");
  const toast=$("#toast");

  // Local Storage Keys
  const LS = {
    AUTO:"PHAN_WebDialer_AUTO",
    HIST:"PHAN_WebDialer_HIST",
    DEVICE:"PHAN_WebDialer_DEVICE"
  };

  // State
  let connected=false;
  let currentDevice=null; // {id, name}
  let history=loadHistory(); // array of {ts, number, dir:'out'|'in', status:'dialing'|'answered'|'ended', note?}

  // Init
  init();

  function init(){
    autoConnectEl.checked = localStorage.getItem(LS.AUTO)==="1";
    const savedDev = localStorage.getItem(LS.DEVICE);
    if(savedDev){ try{ currentDevice=JSON.parse(savedDev);}catch{} }

    renderConn();
    renderHistory();

    // auto-focus number input when page visible
    window.addEventListener("load", ()=> numberInput.focus());
    document.addEventListener("visibilitychange", ()=>{
      if(!document.hidden) numberInput.focus();
    });

    // Buttons
    btnConnect.addEventListener("click", onConnect);
    btnDisconnect.addEventListener("click", onDisconnect);
    autoConnectEl.addEventListener("change", ()=> {
      localStorage.setItem(LS.AUTO, autoConnectEl.checked?"1":"0");
      tip(autoConnectEl.checked?"เปิด Auto-connect":"ปิด Auto-connect", true);
    });

    btnCall.addEventListener("click", onCall);
    btnAnswer.addEventListener("click", onAnswer);
    btnHangup.addEventListener("click", onHangup);

    togglePushText.addEventListener("click", ()=>{
      const opened = togglePushText.getAttribute("aria-expanded")==="true";
      togglePushText.setAttribute("aria-expanded", String(!opened));
      pushTextArea.hidden = opened;
    });
    btnPush.addEventListener("click", onPushText);

    btnClearHistory.addEventListener("click", ()=>{
      if(!confirm("ล้างประวัติการโทรทั้งหมด?")) return;
      history=[]; saveHistory(); renderHistory(); tip("ล้างประวัติแล้ว", true);
    });

    searchBox.addEventListener("input", renderHistory);
    dedupeEl.addEventListener("change", renderHistory);

    // Keyboard shortcuts (global)
    document.addEventListener("keydown",(e)=>{
      // หลีกเลี่ยงตอนพิมพ์ใน textarea push
      const tag = (document.activeElement && document.activeElement.tagName)||"";
      const typing = tag==="TEXTAREA" && document.activeElement.id==="pushText";
      if(typing) return;

      if(e.key==="Enter"){ e.preventDefault(); onCall(); }
      if(e.key==="Escape"){ e.preventDefault(); onHangup(); }
      if(e.code==="Space"){ e.preventDefault(); onAnswer(); }
    });

    // Auto connect (Sim)
    if(autoConnectEl.checked){
      setTimeout(()=> onConnect(true), 400);
    }
  }

  // ---- Connection (Sim Mode) ----
  async function onConnect(silent=false){
    // จำลองหลายอุปกรณ์: ให้ผู้ใช้เลือก
    const options = [
      {id:"emu-01", name:"Android Emu #01"},
      {id:"emu-02", name:"Android Emu #02"},
      {id:"emu-03", name:"Android Emu #03"}
    ];
    let pick = currentDevice || options[0];
    if(!silent){
      const names = options.map((o,i)=>`${i+1}. ${o.name}`).join("\n");
      const ans = prompt(`เลือกอุปกรณ์ที่จะเชื่อมต่อ (จำลอง)\n${names}\n\nพิมพ์หมายเลข (1-${options.length})`, "1");
      const idx = Math.max(1, Math.min(options.length, parseInt(ans||"1",10)))-1;
      pick = options[idx];
    }
    currentDevice = pick;
    connected = true;
    localStorage.setItem(LS.DEVICE, JSON.stringify(currentDevice));
    renderConn();
    if(!silent) tip(`เชื่อมต่อ: ${currentDevice.name}`, true);
  }

  function onDisconnect(){
    connected=false;
    renderConn();
    tip("ตัดการเชื่อมต่อแล้ว", true);
  }

  function renderConn(){
    if(connected){
      connStatus.textContent = `เชื่อมต่อ (จำลอง): ${currentDevice?.name||"Unknown"}`;
      connStatus.className="badge ok";
      btnConnect.disabled=true;
      btnDisconnect.disabled=false;
      btnHangup.disabled=false;
    }else{
      connStatus.textContent = "ไม่ได้เชื่อมต่อ (โหมดจำลอง — GitHub Pages)";
      connStatus.className="badge";
      btnConnect.disabled=false;
      btnDisconnect.disabled=true;
      btnHangup.disabled=true;
    }
  }

  // ---- Dial / Answer / Hangup (Sim) ----
  function onCall(){
    const num=(numberInput.value||"").replace(/\s+/g,"");
    if(!num){ tip("กรอกเบอร์ก่อนโทร"); numberInput.focus(); return; }
    if(!connected){ tip("ยังไม่เชื่อมต่ออุปกรณ์ (จำลอง)"); return; }
    // Add history (dialing -> ended)
    addHistory({number:num, dir:"out", status:"dialing"});
    tip(`กำลังโทรออกไปยัง ${num}`, true);
    numberInput.select();
  }

  function onAnswer(){
    if(!connected){ tip("ยังไม่เชื่อมต่ออุปกรณ์ (จำลอง)"); return; }
    addHistory({number: "(สายเข้า)", dir:"in", status:"answered"});
    tip("รับสาย (จำลอง)", true);
  }

  function onHangup(){
    if(!connected){ tip("ยังไม่เชื่อมต่ออุปกรณ์ (จำลอง)"); return; }
    addHistory({number: "(สิ้นสุด)", dir:"out", status:"ended"});
    tip("วางสาย", true);
  }

  // ---- Push Text (Sim: copy to clipboard) ----
  async function onPushText(){
    const t = (pushText.value||"").trim();
    if(!t){ tip("กรอกข้อความก่อน", false); return; }
    try{
      await navigator.clipboard.writeText(t);
      pushText.value="";
      tip("คัดลอกข้อความไปยังคลิปบอร์ดเครื่องนี้แล้ว (โหมดจำลอง)", true);
    }catch{
      // fallback
      const ta=document.createElement("textarea"); ta.value=t; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove();
      pushText.value="";
      tip("คัดลอกข้อความแล้ว (fallback)", true);
    }
  }

  // ---- History ----
  function addHistory({number, dir, status, note}){
    history.unshift({ts: Date.now(), number, dir, status, note: note||""});
    saveHistory(); renderHistory();
  }
  function saveHistory(){
    localStorage.setItem(LS.HIST, JSON.stringify(history.slice(0, 5000))); // cap 5k
  }
  function loadHistory(){
    try{ return JSON.parse(localStorage.getItem(LS.HIST)||"[]"); }catch{ return []; }
  }

  function renderHistory(){
    const q=(searchBox.value||"").trim().toLowerCase();
    const showDedupe=dedupeEl.checked;

    let list=history.slice();
    if(q){
      list=list.filter(x=>{
        const s=[x.number||"", x.status||"", x.note||""].join(" ").toLowerCase();
        return s.includes(q);
      });
    }
    if(showDedupe){
      // Keep last occurrence per number
      const seen=new Set();
      list = list.filter(item=>{
        const key=item.number;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Recent 5
    const recent=history.slice(0,5);
    renderList(recentList, recent);
    // All
    renderList(allList, list);
  }

  function renderList(ul, items){
    ul.innerHTML="";
    if(items.length===0){
      const li=document.createElement("li");
      li.className="item";
      li.innerHTML = `<div class="tag">—</div><div class="meta">ไม่มีข้อมูล</div><div class="act"></div>`;
      ul.appendChild(li);
      return;
    }

    items.forEach(it=>{
      const li=document.createElement("li");
      li.className="item";

      const when=new Date(it.ts);
      const timeStr = `${pad2(when.getHours())}:${pad2(when.getMinutes())}:${pad2(when.getSeconds())}`;

      const tag=document.createElement("div");
      tag.className="tag";
      tag.textContent = it.dir==="out" ? "ออก" : (it.dir==="in"?"เข้า":"—");

      const meta=document.createElement("div");
      meta.className="meta";
      meta.textContent = `${it.number} • ${it.status} • ${timeStr}`;

      const act=document.createElement("div");
      act.className="act";
      const bCall = miniBtn("โทร", ()=>{ numberInput.value = (it.number||"").replace(/[^\d+]/g,""); numberInput.focus(); });
      const bNote = miniBtn("บันทึก", ()=>{
        const nv = prompt("หมายเหตุ", it.note||"");
        if(nv!=null){ it.note=nv; saveHistory(); renderHistory(); }
      });
      const bDel  = miniBtn("ลบ", ()=>{
        const idx = history.findIndex(h=>h.ts===it.ts);
        if(idx>=0){ history.splice(idx,1); saveHistory(); renderHistory(); }
      });
      act.append(bCall, bNote, bDel);

      li.append(tag, meta, act);
      ul.appendChild(li);
    });
  }

  // ---- Helpers ----
  function tip(t, ok=false){
    if(!toast) return;
    toast.textContent=t;
    toast.style.borderColor = ok? "var(--ok)" : "var(--pri)";
    toast.classList.add("show");
    setTimeout(()=> toast.classList.remove("show"), 1500);
  }
  function miniBtn(label,fn){
    const b=document.createElement("button");
    b.className="mini btn ghost"; b.textContent=label;
    b.addEventListener("click", fn);
    return b;
  }
  function pad2(n){ return String(n).padStart(2,"0"); }

})();
