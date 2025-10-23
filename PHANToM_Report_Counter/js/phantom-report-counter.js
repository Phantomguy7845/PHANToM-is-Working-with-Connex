/* PHANToM Report Counter — Aurora Engine 2025
   - Main/Sub categories; Main always "count", toggle "use as call total"
   - Sub nodes: type = count | text (text counts by lines)
   - Nested sub nodes supported
   - Keyboard: arrows, +/- , Enter (for text), Ctrl+C (copy report), Ctrl+S (save)
   - Autosave (localStorage)
   - SUM Rules (global, cross-category) with editable labels & suffix; stored & remembered
   - Export/Import settings as .txt (JSON string)
   - Report per spec; includes Text lines for sub with type=text
*/
(function(){
  const $ = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // DOM
  const treeEl = $("#tree");
  const toastEl = $("#toast");

  const userNameEl = $("#userName");
  const dateEl = $("#reportDate");
  const copyBtn = $("#copyReport");
  const addMainBtn = $("#addMain");
  const newMainTitleEl = $("#newMainTitle");
  const resetCountsBtn = $("#resetCounts");
  const resetAllBtn = $("#resetAll");

  const manageSumBtn = $("#manageSum");
  const sumModal = $("#sumModal");
  const sumListEl = $("#sumList");
  const sumNewLabelEl = $("#sumNewLabel");
  const sumNewSuffixEl = $("#sumNewSuffix");
  const sumAddBtn = $("#sumAdd");
  const sumSaveBtn = $("#sumSave");
  const sumDefaultBtn = $("#sumDefault");
  const sumCloseBtn = $("#closeSum");

  const exportBtn = $("#exportSettings");
  const importInput = $("#importSettings");

  // Storage keys
  const LS_KEY = "phantom_report_counter_state_v2";
  const DEF_SUM = [
    // default SUM items (editable by user)
    { id: uid(), label: "โทรรวม", suffix: "", sources: [] },           // if sources=[], we derive from "useAsCall" mains
    { id: uid(), label: "ติดต่อได้", suffix: "", sources: [] },
    { id: uid(), label: "อัปเดท", suffix: "ห้อง", sources: [] },
  ];

  // State
  let state = loadState() || defaultState();

  // Selection path for keyboard nav
  let focusPath = [];      // [mainIdx, subIdx, ...]
  let lastFocusId = null;

  initUI();
  render();
  focusRestore();

  // ---------- Init & UI ----------
  function initUI(){
    // date default
    if(!state.reportDate){
      const d = new Date();
      dateEl.valueAsDate = d;
      state.reportDate = toISO(d);
    }else{
      const [y,m,d] = state.reportDate.split("-").map(Number);
      dateEl.valueAsDate = new Date(y, m-1, d);
    }
    userNameEl.value = state.userName || "";

    // events
    addMainBtn.addEventListener("click", ()=>{
      const title = newMainTitleEl.value.trim();
      if(!title) return tip("กรอกชื่อหมวดหลักก่อน");
      addMain(title);
      newMainTitleEl.value="";
    });

    resetCountsBtn.addEventListener("click", ()=>{
      if(!confirm("รีเซ็ตค่าประจำวัน (ล้างตัวเลข/ข้อความ แต่คงโครงสร้าง) ?")) return;
      resetCountsOnly();
      tip("รีเซ็ตค่าประจำวันแล้ว", true);
    });

    resetAllBtn.addEventListener("click", ()=>{
      if(!confirm("ล้างทุกอย่าง (รวมโครงสร้าง & กฎ SUM) ?")) return;
      state = defaultState();
      saveState();
      render();
      tip("ล้างทั้งหมดแล้ว", true);
    });

    copyBtn.addEventListener("click", ()=>{
      const text = buildReport();
      copy(text).then(()=> tip("คัดลอก Report แล้ว",true));
    });

    dateEl.addEventListener("change", ()=>{
      state.reportDate = dateEl.value || toISO(new Date());
      saveState();
    });

    userNameEl.addEventListener("input", ()=>{
      state.userName = userNameEl.value.trim();
      saveState();
    });

    // SUM modal
    manageSumBtn.addEventListener("click", openSumModal);
    sumCloseBtn.addEventListener("click", ()=> sumModal.close());
    sumAddBtn.addEventListener("click", ()=>{
      const label = sumNewLabelEl.value.trim();
      if(!label) return tip("กรอกชื่อรายการสรุปก่อน");
      state.sumRules.push({ id: uid(), label, suffix: (sumNewSuffixEl.value||"").trim(), sources: [] });
      sumNewLabelEl.value=""; sumNewSuffixEl.value="";
      renderSumList();
      saveState();
    });
    sumSaveBtn.addEventListener("click", ()=>{
      // sources checked are already bound live; just save
      saveState();
      sumModal.close();
      tip("บันทึก SUM Rules แล้ว", true);
    });
    sumDefaultBtn.addEventListener("click", ()=>{
      if(!confirm("รีเซ็ตกฎรวมผลเป็นค่าเริ่มต้น ?")) return;
      state.sumRules = DEF_SUM.map(x=>({...x}));
      renderSumList();
      saveState();
      tip("รีเซ็ต SUM Rules เรียบร้อย", true);
    });

    // Export/Import
    exportBtn.addEventListener("click", ()=>{
      const payload = JSON.stringify(state);
      const blob = new Blob([payload], {type:"text/plain;charset=utf-8"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "PHANToM_Report_Counter_Settings.txt";
      a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 500);
      tip("Export เรียบร้อย", true);
    });
    importInput.addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const r = new FileReader();
      r.onload = (ev)=>{
        try{
          const obj = JSON.parse(String(ev.target.result||"{}"));
          if(!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.sumRules)) throw new Error("invalid");
          state = obj;
          saveState(); render(); focusRestore();
          tip("Import การตั้งค่าแล้ว", true);
        }catch(err){
          tip("ไฟล์ .txt ไม่ถูกต้อง");
        }
      };
      r.readAsText(f);
      importInput.value = "";
    });

    // Keyboard
    document.addEventListener("keydown", onKey);
    treeEl.addEventListener("click", ()=> treeEl.focus());
  }

  // ---------- Render ----------
  function render(){
    treeEl.innerHTML = "";
    state.categories.forEach((main, mi)=>{
      treeEl.appendChild(renderMain(main, mi));
    });
    saveState();
  }

  function renderMain(main, mi){
    const node = el("div","node main");
    node.dataset.id = main.id;

    const title = el("div","title", main.title);
    const count = el("div","count", calcCount(main));
    const asCall = el("label","toggle");
    const chk = el("input");
    chk.type = "checkbox"; chk.checked = !!main.useAsCall;
    chk.addEventListener("change", ()=>{ main.useAsCall = chk.checked; render(); });
    const lb = el("span",null,"นับเป็นโทรรวม");
    asCall.append(chk, lb);

    const ops = el("div","ops");
    const bMinus = btnMini("−", ()=> inc(main, -1));
    const bPlus  = btnMini("+", ()=> inc(main, +1));
    const bUp    = btnGhost("↑", ()=> moveMain(mi,-1));
    const bDown  = btnGhost("↓", ()=> moveMain(mi,+1));
    const bEdit  = btnGhost("✎", ()=> rename(main));
    const bDel   = btnDanger("ลบ", ()=> delMain(mi));
    ops.append(bMinus,bPlus, gap(), bUp,bDown,bEdit,bDel);

    const headRow = el("div","row2");
    headRow.append(title, count, asCall, el("span","badge","Main"), ops);

    // add sub controls
    const addRow = el("div","row");
    const subName = el("input"); subName.placeholder="เพิ่มหมวดย่อย เช่น ว่าง / ขายแล้ว / หมายเหตุ";
    const subType = el("select");
    subType.innerHTML = `<option value="count">Count</option><option value="text">Text</option>`;
    const addBtn = el("button","btn","เพิ่มย่อย");
    addBtn.addEventListener("click", ()=>{
      const t = subName.value.trim(); if(!t) return tip("กรอกชื่อหมวดย่อยก่อน");
      addSub(main, t, subType.value); subName.value="";
    });
    addRow.append(subName, subType, addBtn);

    node.append(headRow, addRow);

    // children
    if ((main.children||[]).length){
      node.append(renderChildren(main, [mi]));
    }

    if(isFocused(main.id)) node.classList.add("selected");
    node.addEventListener("click",(e)=>{ e.stopPropagation(); focusPath=[mi]; lastFocusId = main.id; renderFocus(); });

    return node;
  }

  function renderChildren(parent, path){
    const wrap = el("div","children");
    (parent.children||[]).forEach((child, idx)=>{
      wrap.append(renderSub(parent, child, [...path, idx]));
    });
    return wrap;
  }

  function renderSub(parent, nodeData, path){
    const node = el("div","node");
    node.dataset.id = nodeData.id;

    const title = el("div","title", nodeData.title);
    const count = el("div","count", calcCount(nodeData));
    const badge = el("span","mtype", nodeData.type==="text"?"Text":"Count");

    const ops = el("div","ops");
    if(nodeData.type==="count"){
      ops.append(btnMini("−", ()=> inc(nodeData,-1)), btnMini("+", ()=> inc(nodeData,+1)));
    }
    ops.append(
      gap(), btnGhost("↑", ()=> moveChild(parent, path, -1)),
      btnGhost("↓", ()=> moveChild(parent, path, +1)),
      btnGhost("✎", ()=> rename(nodeData)),
      btnDanger("ลบ", ()=> delNode(parent, path))
    );

    const header = el("div","sub-header");
    header.append(title, count, badge, ops);

    const group = el("div","group");
    if(nodeData.type==="text"){
      const ta = el("textarea","textbox");
      ta.placeholder = "พิมพ์แยกบรรทัด (1 บรรทัด = 1 นับ)";
      ta.value = (nodeData.lines||[]).join("\n");
      ta.addEventListener("input", ()=>{
        nodeData.lines = ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
        render();
      });
      group.append(ta);
    }

    // add sub-sub
    const addRow = el("div","row");
    const subName = el("input"); subName.placeholder="เพิ่มย่อยในย่อย";
    const subType = el("select"); subType.innerHTML=`<option value="count">Count</option><option value="text">Text</option>`;
    const addBtn = el("button","btn","เพิ่ม");
    addBtn.addEventListener("click", ()=>{
      const t = subName.value.trim(); if(!t) return tip("กรอกชื่อก่อน");
      addChild(nodeData, t, subType.value); subName.value="";
    });
    group.append(addRow); addRow.append(subName, subType, addBtn);

    // children of sub
    if((nodeData.children||[]).length){
      group.append(renderChildren(nodeData, path));
    }

    if(isFocused(nodeData.id)) node.classList.add("selected");
    node.addEventListener("click",(e)=>{ e.stopPropagation(); focusPath = path.slice(); lastFocusId=nodeData.id; renderFocus(); });

    const wrap = el("div"); wrap.append(header, group);
    return wrap;
  }

  function renderFocus(){
    $$(".node").forEach(n=> n.classList.remove("selected"));
    if(!lastFocusId) return;
    const nd = $(`.node[data-id="${css(lastFocusId)}"]`);
    if(nd) nd.classList.add("selected");
  }

  // ---------- Data ops ----------
  function defaultState(){
    return {
      userName: "",
      reportDate: toISO(new Date()),
      categories: [],
      sumRules: DEF_SUM.map(x=>({...x})), // copy default
    };
  }

  function addMain(title){
    state.categories.push({
      id: uid(),
      title,
      type:"count",
      count:0,
      useAsCall:false,
      children:[]
    });
    saveState(); render();
  }
  function addSub(parent, title, type){
    parent.children = parent.children || [];
    parent.children.push({
      id: uid(),
      title,
      type: type==="text" ? "text" : "count",
      count: 0,
      lines: [],
      children: []
    });
    saveState(); render();
  }
  function addChild(parentNode, title, type){
    parentNode.children = parentNode.children || [];
    parentNode.children.push({
      id: uid(),
      title,
      type: type==="text" ? "text" : "count",
      count: 0,
      lines: [],
      children: []
    });
    saveState(); render();
  }
  function rename(node){
    const nv = prompt("แก้ไขชื่อ:", node.title);
    if(!nv) return;
    node.title = nv.trim();
    saveState(); render();
  }
  function delMain(mi){
    if(!confirm(`ลบหมวดหลัก "${state.categories[mi].title}" ?`)) return;
    const removed = state.categories.splice(mi,1)[0];
    // remove from sum sources if present
    state.sumRules.forEach(rule=>{
      rule.sources = (rule.sources||[]).filter(id=>id!==removed.id);
    });
    saveState(); render();
  }
  function delNode(parent, path){
    const idx = path[path.length-1];
    const removed = parent.children.splice(idx,1)[0];
    // also remove from sum sources (in case user ever linked sub—though UI links mains only)
    state.sumRules.forEach(rule=>{
      rule.sources = (rule.sources||[]).filter(id=>id!==removed.id);
    });
    saveState(); render();
  }
  function moveMain(mi, dir){
    const ni = mi + dir;
    if(ni<0 || ni>=state.categories.length) return;
    const x = state.categories.splice(mi,1)[0];
    state.categories.splice(ni,0,x);
    saveState(); render();
  }
  function moveChild(parent, path, dir){
    const idx = path[path.length-1];
    const ni = idx + dir;
    if(ni<0 || ni>=parent.children.length) return;
    const x = parent.children.splice(idx,1)[0];
    parent.children.splice(ni,0,x);
    saveState(); render();
  }
  function inc(node, delta){
    node.count = Math.max(0, (node.count||0)+delta);
    pulse(node.id);
    saveState(); render();
  }

  // recursive count: own + children (text = lines.length)
  function calcCount(node){
    let base = node.type==="count" ? (node.count||0) : (node.lines?.length||0);
    (node.children||[]).forEach(ch=> base += calcCount(ch));
    return base;
  }

  // ---------- SUM Rules Modal ----------
  function openSumModal(){
    renderSumList();
    sumModal.showModal();
  }

  function renderSumList(){
    sumListEl.innerHTML = "";
    const mains = state.categories;

    state.sumRules.forEach(rule=>{
      const item = el("div","sum-item");

      const labelInp = el("input"); labelInp.type="text"; labelInp.value = rule.label || "";
      labelInp.placeholder = "ชื่อสรุป";
      labelInp.addEventListener("input", ()=>{ rule.label = labelInp.value.trim(); saveState(); });

      const suffixInp = el("input"); suffixInp.type="text"; suffixInp.value = rule.suffix || "";
      suffixInp.placeholder = "หน่วย เช่น ห้อง";
      suffixInp.addEventListener("input", ()=>{ rule.suffix = suffixInp.value.trim(); saveState(); });

      const delBtn = btnDanger("ลบ", ()=>{
        if(!confirm(`ลบรายการสรุป "${rule.label||''}" ?`)) return;
        state.sumRules = state.sumRules.filter(r=>r.id!==rule.id);
        renderSumList(); saveState();
      });

      const row = el("div","sum-row");
      row.append(labelInp, suffixInp, delBtn);

      const sourcesWrap = el("div","sum-sources");
      sourcesWrap.append(el("div",null,"รวมจากหัวข้อ:"));
      mains.forEach(m=>{
        const tag = el("label","sum-tag");
        const chk = el("input"); chk.type="checkbox";
        chk.checked = (rule.sources||[]).includes(m.id);
        chk.addEventListener("change", ()=>{
          rule.sources = rule.sources || [];
          if(chk.checked){
            if(!rule.sources.includes(m.id)) rule.sources.push(m.id);
          }else{
            rule.sources = rule.sources.filter(x=>x!==m.id);
          }
          saveState();
        });
        const span = el("span",null," "+m.title);
        tag.prepend(chk); tag.append(span);
        sourcesWrap.append(tag);
      });

      item.append(row, sourcesWrap);
      sumListEl.append(item);
    });
  }

  // ---------- Report ----------
  function buildReport(){
    const name = (state.userName||"PHANToM").trim();
    const d = dateEl.value ? new Date(dateEl.value) : new Date();
    const header = `${name} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;

    let lines = [];
    lines.push(header);
    lines.push("");

    // Sections
    state.categories.forEach(main=>{
      const mainSum = calcCount(main);
      lines.push(`//${main.title}${mainSum>0 ? ` ${mainSum}` : ""}`);

      // list subs
      appendSubLines(lines, main);
      lines.push("");
    });

    // SUM footer
    lines.push("//////////SUM//////////");
    const sums = computeSums();
    sums.forEach(s=>{
      const suffix = s.suffix ? ` ${s.suffix}` : "";
      lines.push(`${s.label} ${s.value}${suffix}`);
    });
    return lines.join("\n");
  }

  function appendSubLines(lines, node){
    (node.children||[]).forEach(ch=>{
      const cnt = calcCount(ch);
      // always show count line
      lines.push(`${ch.title} ${cnt}`);
      if(ch.type==="text" && (ch.lines||[]).length){
        // แสดงบรรทัดข้อความตามตัวอย่าง
        ch.lines.forEach(t=> lines.push(t));
      }
      if((ch.children||[]).length) appendSubLines(lines, ch);
    });
  }

  // SUM compute: each rule sums specified sources (by main id).
  // Special case: if rule.sources is empty and label == "โทรรวม",
  // we use all mains whose useAsCall==true.
  function computeSums(){
    const out = [];
    for(const rule of state.sumRules){
      let ids = (rule.sources||[]).slice();
      if(ids.length===0 && /โทรรวม/.test(rule.label||"")){
        ids = state.categories.filter(m=>m.useAsCall).map(m=>m.id);
      }
      let total = 0;
      ids.forEach(id=>{
        const main = state.categories.find(m=>m.id===id);
        if(main) total += calcCount(main);
      });
      out.push({ label: rule.label||"", suffix: rule.suffix||"", value: total });
    }
    return out;
  }

  // ---------- Keyboard ----------
  document.addEventListener("keydown", onKey);
  function onKey(e){
    // global shortcuts
    if(e.ctrlKey && (e.key==='s' || e.key==='S')){ e.preventDefault(); saveState(); tip("บันทึกแล้ว",true); return; }
    if(e.ctrlKey && (e.key==='c' || e.key==='C')){ e.preventDefault(); const t=buildReport(); copy(t).then(()=>tip("คัดลอก Report แล้ว",true)); return; }

    // ignore inside input/textarea
    const tag = (e.target.tagName||"").toLowerCase();
    if(tag==='input' || tag==='textarea' || e.target.isContentEditable) return;

    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-','Enter','NumpadAdd','NumpadSubtract'].includes(e.key)){
      e.preventDefault();
    }

    switch(e.key){
      case 'ArrowUp':   navUp(); break;
      case 'ArrowDown': navDown(); break;
      case 'ArrowLeft': navLeft(); break;
      case 'ArrowRight':navRight(); break;
      case '+':
      case 'NumpadAdd': adjust(+1); break;
      case '-':
      case 'NumpadSubtract': adjust(-1); break;
      case 'Enter':     addLineIfText(); break;
      default: break;
    }
  }

  function currentNode(){
    if(!state.categories.length) return null;
    if(!focusPath.length){ focusPath=[0]; lastFocusId=state.categories[0].id; }
    let n = state.categories[focusPath[0]];
    for(let i=1;i<focusPath.length;i++){
      n = n.children?.[focusPath[i]];
      if(!n) break;
    }
    return n||null;
  }

  function navUp(){
    if(!focusPath.length){ focusPath=[0]; lastFocusId=state.categories[0]?.id; renderFocus(); return; }
    const last = focusPath[focusPath.length-1];
    if(last>0){
      focusPath[focusPath.length-1]=last-1;
    }else if(focusPath.length>1){
      focusPath.pop();
    }
    const n = currentNode(); if(n){ lastFocusId=n.id; renderFocus(); }
  }
  function navDown(){
    if(!focusPath.length){ focusPath=[0]; lastFocusId=state.categories[0]?.id; renderFocus(); return; }
    let n = currentNode(); if(!n) return;
    if((n.children||[]).length){
      focusPath.push(0);
    }else{
      const p = getParentByPath(focusPath.slice(0,-1));
      if(p && p.children){
        const idx = focusPath[focusPath.length-1];
        if(idx < p.children.length-1) focusPath[focusPath.length-1]=idx+1;
      }
    }
    n = currentNode(); if(n){ lastFocusId=n.id; renderFocus(); }
  }
  function navLeft(){
    if(focusPath.length>1){
      focusPath.pop();
      const n = currentNode(); if(n){ lastFocusId=n.id; renderFocus(); }
    }
  }
  function navRight(){
    const n = currentNode(); if(!n) return;
    if((n.children||[]).length){
      focusPath.push(0);
      const n2 = currentNode(); if(n2){ lastFocusId=n2.id; renderFocus(); }
    }
  }
  function adjust(delta){
    const n = currentNode(); if(!n) return;
    if(n.type==="count"){
      inc(n, delta);
    }else{
      pulse(n.id);
      tip("โหมด Text: ใช้ Enter เพื่อเพิ่ม 1 บรรทัด");
    }
  }
  function addLineIfText(){
    const n = currentNode(); if(!n || n.type!=="text") return;
    n.lines = n.lines || [];
    n.lines.push("");
    saveState(); render();
    // focus textarea
    requestAnimationFrame(()=>{
      const ta = $(`.node[data-id="${css(n.id)}"] textarea`);
      if(ta){ ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
    });
  }
  function getParentByPath(path){
    if(!path.length) return {children: state.categories};
    let node = state.categories[path[0]];
    for(let i=1;i<path.length-1;i++) node = node.children?.[path[i]];
    return node;
  }

  // ---------- Save/Load ----------
  function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function loadState(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||""); }catch(e){ return null; } }

  // ---------- Utils ----------
  function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
  function el(tag, cls, txt){ const x=document.createElement(tag); if(cls) x.className=cls; if(txt!=null) x.textContent=txt; return x; }
  function btnMini(t,fn){ const b=el("button","btn-mini",t); b.addEventListener("click",fn); return b; }
  function btnGhost(t,fn){ const b=el("button","btn-mini btn-ghost",t); b.addEventListener("click",fn); return b; }
  function btnDanger(t,fn){ const b=el("button","btn-mini danger",t); b.addEventListener("click",fn); return b; }
  function gap(){ const s=el("span"); s.style.width="6px"; return s; }
  function pulse(id){ const nd = $(`.node[data-id="${css(id)}"] .count`); if(nd){ nd.classList.remove("pulse"); void nd.offsetWidth; nd.classList.add("pulse"); } }
  function tip(msg, ok=false){ toastEl.textContent=msg; toastEl.style.background=ok?"#153a1f":"#0d1b36"; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1400); }
  function css(s){ return CSS.escape(String(s)); }
  function toISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function copy(text){
    if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); }catch(e){}
    ta.remove(); return Promise.resolve();
  }

  function focusRestore(){
    if(lastFocusId){ renderFocus(); }
    else if(state.categories[0]){ lastFocusId=state.categories[0].id; focusPath=[0]; renderFocus(); }
  }
})();
