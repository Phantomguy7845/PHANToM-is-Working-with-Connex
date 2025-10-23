/* PHANToM Report Counter — Aurora 2025
   - Main/Sub nodes (multi-level)
   - Each node: type 'count' | 'text'
   - Inline number edit; +/- ; Text counts by lines
   - Keyboard: arrows, +/- , Enter, Ctrl+C(copy), Ctrl+S(save), Ctrl+L(theme)
   - Autosave localStorage (PHANTOM_REPORT_STATE_V4) + theme memory (PHANTOM_THEME)
   - SUM Rules (global, cross-main) + default rules
   - Daily Summary
   - Text mode: focus-safe (shortcuts disabled while typing), debounce save
   - Copy report in required pattern with "//////////SUM//////////"
   by PHANToM
*/

(function(){
  const $=(s,ctx=document)=>ctx.querySelector(s);
  const $$=(s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // DOM
  const treeEl = $("#tree");
  const toastEl = $("#toast");
  const userNameEl = $("#userName");
  const dateEl = $("#reportDate");

  const themeToggleBtn = $("#themeToggle");
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
  const dailySummaryEl = $("#dailySummary");

  // Storage keys
  const LS_KEY = "PHANTOM_REPORT_STATE_V4";
  const THEME_KEY = "PHANTOM_THEME";

  // Default SUM rules
  const DEF_SUM = [
    { id: uid(), label: "โทรรวม", suffix: "", sources: [] },
    { id: uid(), label: "ติดต่อได้", suffix: "", sources: [] },
    { id: uid(), label: "อัปเดท", suffix: "ห้อง", sources: [] },
  ];

  // State
  let state = loadState() || defaultState();

  // Focus
  let focusPath = []; // array of indexes to node
  let lastFocusId = null;

  // Theme
  initTheme();

  // Init UI
  initUI();
  render();
  focusRestore();

  // ---------- Theme ----------
  function initTheme(){
    const t = localStorage.getItem(THEME_KEY) || "dark";
    document.documentElement.setAttribute("data-theme", t);
    themeToggleBtn?.addEventListener("click", toggleTheme);
    document.addEventListener("keydown", (e)=>{
      if(e.ctrlKey && (e.key==='l'||e.key==='L')){ e.preventDefault(); toggleTheme(); }
    });
  }
  function toggleTheme(){
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur==="dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    tip(next==="dark"?"Dark Mode":"Light Mode", true);
  }

  // ---------- UI bindings ----------
  function initUI(){
    // initial date
    if(!state.reportDate){
      const d=new Date();
      dateEl.valueAsDate=d;
      state.reportDate = toISO(d);
    }else{
      const [y,m,d]=state.reportDate.split("-").map(Number);
      dateEl.valueAsDate=new Date(y,m-1,d);
    }
    userNameEl.value = state.userName || "";

    // header events
    userNameEl.addEventListener("input",()=>{ state.userName=userNameEl.value.trim(); saveState(); updateDailySummary(); });
    dateEl.addEventListener("change",()=>{ state.reportDate=dateEl.value||toISO(new Date()); saveState(); });

    copyBtn.addEventListener("click", ()=>{ const t=buildReport(); copy(t).then(()=>tip("คัดลอก Report แล้ว",true)); });

    addMainBtn.addEventListener("click", ()=>{
      const t=newMainTitleEl.value.trim(); if(!t) return tip("กรอกชื่อหมวดหลักก่อน");
      addMain(t); newMainTitleEl.value="";
    });

    resetCountsBtn.addEventListener("click", ()=>{
      if(!confirm("รีเซ็ตค่าประจำวัน (ล้างตัวเลข/ข้อความ แต่คงโครงสร้าง) ?")) return;
      resetCountsOnly(); tip("รีเซ็ตค่าประจำวันแล้ว",true);
    });

    resetAllBtn.addEventListener("click", ()=>{
      if(!confirm("ล้างทุกอย่าง (รวมโครงสร้าง & กฎ SUM) ?")) return;
      state = defaultState(); saveState(); render(); tip("ล้างทั้งหมดแล้ว",true);
    });

    // SUM modal
    manageSumBtn.addEventListener("click", openSumModal);
    sumCloseBtn.addEventListener("click", ()=> sumModal.close());
    sumAddBtn.addEventListener("click", ()=>{
      const label=sumNewLabelEl.value.trim(); if(!label) return tip("กรอกชื่อรายการสรุปก่อน");
      state.sumRules.push({ id: uid(), label, suffix:(sumNewSuffixEl.value||"").trim(), sources: [] });
      sumNewLabelEl.value=""; sumNewSuffixEl.value=""; renderSumList(); saveState();
    });
    sumSaveBtn.addEventListener("click", ()=>{ saveState(); sumModal.close(); tip("บันทึก SUM Rules แล้ว",true); });
    sumDefaultBtn.addEventListener("click", ()=>{
      if(!confirm("รีเซ็ตกฎรวมผลเป็นค่าเริ่มต้น ?")) return;
      state.sumRules = DEF_SUM.map(x=>({...x})); renderSumList(); saveState(); tip("รีเซ็ต SUM Rules เรียบร้อย",true);
    });

    // Export / Import
    exportBtn.addEventListener("click", ()=>{
      const payload = JSON.stringify(state, null, 2);
      const blob = new Blob([payload], {type:"text/plain;charset=utf-8"});
      const a=document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "PHANToM_Report_Counter_Settings.txt";
      a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 500);
      tip("Export เรียบร้อย",true);
    });
    importInput.addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = (ev)=>{
        try{
          const obj = JSON.parse(String(ev.target.result||"{}"));
          if(!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.sumRules)) throw new Error("invalid");
          state=obj; saveState(); render(); focusRestore(); tip("Import การตั้งค่าแล้ว",true);
        }catch(err){ tip("ไฟล์ .txt ไม่ถูกต้อง"); }
      };
      r.readAsText(f); importInput.value="";
    });

    // Keyboard shortcuts (global; but disabled while typing in textarea/number/text editors)
    document.addEventListener("keydown", onKey, true);
    treeEl.addEventListener("click", ()=> treeEl.focus());
  }

  // ---------- Render ----------
  function render(){
    treeEl.innerHTML="";
    state.categories.forEach((main,mi)=>{
      treeEl.appendChild(renderMain(main, mi));
    });
    updateDailySummary();
    saveState();
  }

  function updateDailySummary(){
    const sums = computeSums();
    const top = sums.slice(0,3).map(s=> `${s.label} ${s.value}${s.suffix?` ${s.suffix}`:''}`);
    dailySummaryEl.textContent = top.length ? top.join(" | ") : "—";
  }

  function renderMain(main, mi){
    const node = el("div","node main"); node.dataset.id = main.id;

    // Title
    const title = el("div","title", main.title);
    title.title="ดับเบิลคลิกเพื่อแก้ชื่อ";
    title.ondblclick = ()=> inlineRename(title, main, "title");

    // Type select
    const typeSel = el("select");
    typeSel.innerHTML = `<option value="count">Count</option><option value="text">Text</option>`;
    typeSel.value = main.type || "count";
    typeSel.addEventListener("change", ()=>{ main.type=typeSel.value; saveState(); render(); });

    // Count/Text area
    const countWrap = el("div","countWrap");
    let bodyArea = null;

    if((main.type||"count")==="count"){
      const c = el("div","count", String(calcOwn(main)));
      c.title="คลิกเพื่อพิมพ์ค่าโดยตรง";
      c.addEventListener("click", ()=> inlineNumberEdit(c, main, "count"));
      const btnMinus = miniBtn("−", ()=> inc(main,-1));
      const btnPlus  = miniBtn("+", ()=> inc(main,+1));
      countWrap.append(btnMinus, c, btnPlus);
    }else{
      bodyArea = el("textarea","textbox");
      bodyArea.placeholder="พิมพ์ข้อความ (1 บรรทัด = 1 นับ)";
      bodyArea.value = (main.lines||[]).join("\n");
      bodyArea.addEventListener("keydown",(e)=>{ e.stopPropagation(); });
      let debounceTimer=null;
      bodyArea.addEventListener("input", ()=>{
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(()=>{
          main.lines = bodyArea.value.split("\n").map(s=>s.trim()).filter(Boolean);
          saveState(); updateDailySummary();
        }, 350);
      });
      countWrap.append(bodyArea);
    }

    // asCall toggle
    const asCall = el("label","toggle");
    const chk = el("input"); chk.type="checkbox"; chk.checked=!!main.useAsCall;
    chk.addEventListener("change", ()=>{ main.useAsCall = chk.checked; saveState(); });
    asCall.append(chk, el("span",null,"นับเป็นโทรรวม"));

    // Ops
    const ops = el("div","ops");
    const bUp   = ghostBtn("↑", ()=> moveMain(mi,-1));
    const bDown = ghostBtn("↓", ()=> moveMain(mi,+1));
    const bEdit = ghostBtn("✎", ()=> rename(main));
    const bDel  = dangerBtn("ลบ", ()=> delMain(mi));
    ops.append(bUp,bDown,bEdit,bDel);

    const headRow = el("div","header");
    const left = el("div"); left.append(title);
    const center = el("div"); center.append(typeSel, asCall);
    const right = el("div"); right.append(countWrap, ops);
    headRow.append(left, center, right);

    const nodeInner = el("div");
    nodeInner.append(headRow);

    // Add sub controls
    const addRow = el("div","row");
    const subName = el("input"); subName.placeholder="เพิ่มหมวดย่อย (เช่น ว่าง / ขายแล้ว / หมายเหตุ)";
    const subType = el("select"); subType.innerHTML=`<option value="count">Count</option><option value="text">Text</option>`;
    const addBtn = el("button","btn","เพิ่มย่อย");
    addBtn.addEventListener("click", ()=>{
      const t = subName.value.trim(); if(!t) return tip("กรอกชื่อหมวดย่อยก่อน");
      addSub(main, t, subType.value); subName.value="";
    });
    nodeInner.append(addRow); addRow.append(subName, subType, addBtn);

    // Body area for main (text)
    if(bodyArea) {
      const group = el("div","group"); group.append(bodyArea); nodeInner.append(group);
    }

    // children
    if ((main.children||[]).length){
      nodeInner.append(renderChildren(main, [mi]));
    }

    if(isFocused(main.id)) node.classList.add("selected");
    node.addEventListener("click",(e)=>{ e.stopPropagation(); focusPath=[mi]; lastFocusId = main.id; renderFocus(); });

    node.append(nodeInner);
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
    const node = el("div","node"); node.dataset.id = nodeData.id;

    const title = el("div","title", nodeData.title);
    title.title="ดับเบิลคลิกเพื่อแก้ชื่อ";
    title.ondblclick = ()=> inlineRename(title, nodeData, "title");

    const badge = el("span","mtype", nodeData.type==="text"?"Text":"Count");

    const countWrap = el("div","countWrap");
    let extra=null;

    if(nodeData.type==="count"){
      const c = el("div","count", String(calcOwn(nodeData)));
      c.title="คลิกเพื่อพิมพ์ค่าโดยตรง";
      c.addEventListener("click", ()=> inlineNumberEdit(c, nodeData, "count"));
      const btnMinus = miniBtn("−", ()=> inc(nodeData,-1));
      const btnPlus  = miniBtn("+", ()=> inc(nodeData,+1));
      countWrap.append(btnMinus, c, btnPlus);
    }else{
      const ta = el("textarea","textbox");
      ta.placeholder = "พิมพ์แยกบรรทัด (1 บรรทัด = 1 นับ)";
      ta.value = (nodeData.lines||[]).join("\n");
      ta.addEventListener("keydown",(e)=>{ e.stopPropagation(); }); // ป้องกันคีย์ลัดมากวน
      let debounceTimer=null;
      ta.addEventListener("input", ()=>{
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(()=>{
          nodeData.lines = ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
          saveState(); updateDailySummary();
        }, 350);
      });
      extra = ta;
    }

    const ops = el("div","ops");
    ops.append(
      ghostBtn("↑", ()=> moveChild(parent, path, -1)),
      ghostBtn("↓", ()=> moveChild(parent, path, +1)),
      ghostBtn("✎", ()=> rename(nodeData)),
      dangerBtn("ลบ", ()=> delNode(parent, path))
    );

    const header = el("div","sub-header");
    const left = el("div"); left.append(title);
    const center = el("div"); center.append(badge);
    const right = el("div"); right.append(countWrap, ops);
    header.append(left, center, right);

    const group = el("div","group");
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

    if(extra) group.append(extra);

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
      userName:"",
      reportDate: toISO(new Date()),
      categories: [],
      sumRules: DEF_SUM.map(x=>({...x})),
    };
  }

  function addMain(title){
    state.categories.push({
      id: uid(),
      title,
      type:"count",      // or "text"
      count:0,
      lines:[],
      useAsCall:false,
      children:[]
    });
    saveState(); render();
  }
  function addSub(parent, title, type){
    parent.children = parent.children||[];
    parent.children.push({
      id: uid(),
      title,
      type: type==="text"?"text":"count",
      count:0,
      lines:[],
      children:[]
    });
    saveState(); render();
  }
  function addChild(parentNode, title, type){
    parentNode.children = parentNode.children||[];
    parentNode.children.push({
      id: uid(),
      title,
      type: type==="text"?"text":"count",
      count:0,
      lines:[],
      children:[]
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
    // remove from sum sources
    state.sumRules.forEach(rule=>{
      rule.sources = (rule.sources||[]).filter(id=>id!==removed.id);
    });
    saveState(); render();
  }
  function delNode(parent, path){
    const idx = path[path.length-1];
    const removed = parent.children.splice(idx,1)[0];
    state.sumRules.forEach(rule=>{
      rule.sources = (rule.sources||[]).filter(id=>id!==removed.id);
    });
    saveState(); render();
  }
  function moveMain(mi,dir){
    const ni=mi+dir; if(ni<0 || ni>=state.categories.length) return;
    const x=state.categories.splice(mi,1)[0]; state.categories.splice(ni,0,x);
    saveState(); render();
  }
  function moveChild(parent, path, dir){
    const idx=path[path.length-1]; const ni=idx+dir;
    if(ni<0 || ni>=parent.children.length) return;
    const x=parent.children.splice(idx,1)[0]; parent.children.splice(ni,0,x);
    saveState(); render();
  }
  function inc(node,delta){
    node.count = Math.max(0,(node.count||0)+delta);
    pulse(node.id); saveState(); render();
  }
  function calcOwn(node){
    return node.type==="count" ? (node.count||0) : (node.lines?.length||0);
  }
  function calcCount(node){
    let base = calcOwn(node);
    (node.children||[]).forEach(ch=> base += calcCount(ch));
    return base;
  }

  // ---------- Inline editors ----------
  function inlineRename(elm, node, key){
    const inp=document.createElement("input");
    inp.type="text"; inp.value=node[key]||"";
    inp.style.minWidth = "160px";
    elm.replaceWith(inp); inp.focus(); inp.select();
    const commit=()=>{
      node[key]=inp.value.trim()||node[key];
      saveState(); render();
    };
    inp.addEventListener("keydown",e=>{
      e.stopPropagation();
      if(e.key==="Enter") commit();
      if(e.key==="Escape") render();
    });
    inp.addEventListener("blur",commit);
  }
  function inlineNumberEdit(countElm, node, key){
    const val = String(node[key]||0);
    const box = document.createElement("input");
    box.type="number"; box.value=val; box.min="0";
    countElm.innerHTML=""; countElm.appendChild(box); box.focus(); box.select();
    box.addEventListener("keydown",(e)=>{ e.stopPropagation(); });
    const commit=()=>{
      const n = Math.max(0, parseInt(box.value||"0",10));
      node[key]=n; saveState(); render();
    };
    box.addEventListener("keydown",e=>{
      if(e.key==="Enter") commit();
      if(e.key==="Escape") render();
    });
    box.addEventListener("blur",commit);
  }

  // ---------- SUM ----------
  function openSumModal(){
    renderSumList(); sumModal.showModal();
  }
  function renderSumList(){
    sumListEl.innerHTML="";
    const mains=state.categories;

    state.sumRules.forEach(rule=>{
      const item=el("div","sum-item");

      const labelInp=el("input"); labelInp.type="text"; labelInp.value=rule.label||""; labelInp.placeholder="ชื่อสรุป";
      labelInp.addEventListener("input", ()=>{ rule.label=labelInp.value.trim(); saveState(); });

      const suffixInp=el("input"); suffixInp.type="text"; suffixInp.value=rule.suffix||""; suffixInp.placeholder="หน่วย เช่น ห้อง";
      suffixInp.addEventListener("input", ()=>{ rule.suffix=suffixInp.value.trim(); saveState(); });

      const delBtn=dangerBtn("ลบ",()=>{
        if(!confirm(`ลบรายการสรุป "${rule.label||''}" ?`)) return;
        state.sumRules = state.sumRules.filter(r=>r.id!==rule.id);
        renderSumList(); saveState();
      });

      const topRow=el("div","sum-row"); topRow.append(labelInp,suffixInp,delBtn);

      const sourcesWrap=el("div","sum-sources"); sourcesWrap.append(el("div",null,"รวมจากหัวข้อ:"));
      mains.forEach(m=>{
        const tag=el("label","sum-tag");
        const chk=el("input"); chk.type="checkbox";
        chk.checked=(rule.sources||[]).includes(m.id);
        chk.addEventListener("change", ()=>{
          rule.sources = rule.sources||[];
          if(chk.checked){ if(!rule.sources.includes(m.id)) rule.sources.push(m.id); }
          else{ rule.sources = rule.sources.filter(x=>x!==m.id); }
          saveState();
        });
        const span=el("span",null," "+m.title);
        tag.prepend(chk); tag.append(span); sourcesWrap.append(tag);
      });

      item.append(topRow, sourcesWrap); sumListEl.append(item);
    });
  }

  function computeSums(){
    const result=[];
    state.sumRules.forEach(rule=>{
      const ids = rule.sources||[];
      let val=0;
      if(!ids.length){
        // ถ้าไม่ได้เลือกแหล่ง ให้คงค่า 0 (ผู้ใช้กำหนดเอง)
        val=0;
      }else{
        ids.forEach(id=>{
          const main = state.categories.find(m=>m.id===id);
          if(main) val += calcCount(main);
        });
      }
      result.push({label:rule.label||"", value:val, suffix:rule.suffix||""});
    });
    return result;
  }

  // ---------- Report ----------
  function buildReport(){
    const name = (state.userName||"PHANToM").trim();
    const d = dateEl.value ? new Date(dateEl.value) : new Date();
    const header = `${name} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;

    const lines=[];
    lines.push(header);
    lines.push("");

    // sections
    state.categories.forEach(main=>{
      const total = calcCount(main);
      lines.push(`//${main.title}`);
      // child lines
      appendSubLines(lines, main);
      if(main.type==="text" && (main.lines||[]).length){
        main.lines.forEach(t=> lines.push(t));
      }
      lines.push("");
    });

    // SUM footer
    lines.push("//////////SUM//////////");
    computeSums().forEach(s=>{
      const suffix = s.suffix ? ` ${s.suffix}` : "";
      lines.push(`${s.label} ${s.value}${suffix}`);
    });

    return lines.join("\n");
  }

  function appendSubLines(lines, node){
    (node.children||[]).forEach(ch=>{
      const cnt = calcCount(ch);
      lines.push(`${ch.title} ${cnt}`);
      if(ch.type==="text" && (ch.lines||[]).length){
        ch.lines.forEach(t=> lines.push(t));
      }
      if((ch.children||[]).length){
        appendSubLines(lines, ch);
      }
    });
  }

  // ---------- Keyboard ----------
  function onKey(e){
    // disable when typing inside inputs/textarea/select/number
    const tag=(e.target && e.target.tagName || "").toLowerCase();
    const isTyping = tag==="textarea" || tag==="input" || tag==="select";
    if(isTyping){
      // allow normal typing inside editors
      return;
    }

    if(e.ctrlKey && (e.key==='c' || e.key==='C')){ // copy
      e.preventDefault();
      copy(buildReport()).then(()=> tip("คัดลอก Report แล้ว",true));
      return;
    }
    if(e.ctrlKey && (e.key==='s' || e.key==='S')){ // save
      e.preventDefault(); saveState(); tip("บันทึกแล้ว",true); return;
    }

    // arrows move focus
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)){
      e.preventDefault();
      navigateFocus(e.key);
      return;
    }

    // +/- adjust count on focused node if count-type
    if(e.key==="+" || e.key==="="){ // some keyboards use '=' for '+'
      e.preventDefault(); incFocused(1); return;
    }
    if(e.key==="-" || e.key==="_"){
      e.preventDefault(); incFocused(-1); return;
    }

    // Enter in text-type: append blank line at end (on focused node)
    if(e.key==="Enter"){
      e.preventDefault();
      addLineToFocused();
      return;
    }
  }

  function incFocused(delta){
    const node = findFocusedNode(); if(!node) return;
    if(node.type==="count"){ node.count=Math.max(0,(node.count||0)+delta); saveState(); render(); }
  }
  function addLineToFocused(){
    const node = findFocusedNode(); if(!node) return;
    if(node.type==="text"){
      node.lines = node.lines||[];
      node.lines.push("");
      saveState(); render();
    }
  }

  function navigateFocus(key){
    // simple linear traversal across .node elements
    const nodes = $$(".node");
    if(!nodes.length) return;
    let idx = nodes.findIndex(n=> n.classList.contains("selected"));
    if(idx<0) idx=0;
    if(key==="ArrowDown" || key==="ArrowRight") idx = Math.min(nodes.length-1, idx+1);
    if(key==="ArrowUp" || key==="ArrowLeft") idx = Math.max(0, idx-1);
    nodes.forEach(n=> n.classList.remove("selected"));
    nodes[idx].classList.add("selected");
    lastFocusId = nodes[idx].dataset.id || null;
    nodes[idx].scrollIntoView({block:"nearest", behavior:"smooth"});
  }

  function findFocusedNode(){
    if(!lastFocusId) return null;
    // scan tree to find node by id
    for(const m of state.categories){
      if(m.id===lastFocusId) return m;
      const f = findNodeIn(m, lastFocusId);
      if(f) return f;
    }
    return null;
  }
  function findNodeIn(node, id){
    for(const ch of (node.children||[])){
      if(ch.id===id) return ch;
      const deeper = findNodeIn(ch, id);
      if(deeper) return deeper;
    }
    return null;
  }

  function isFocused(id){ return lastFocusId===id; }
  function renderFocus(){ $$(".node").forEach(n=> n.classList.toggle("selected", n.dataset.id===lastFocusId)); }
  function focusRestore(){
    if(!lastFocusId){
      // try first node focus
      const first = $(".node"); if(first){ lastFocusId=first.dataset.id||null; renderFocus(); }
    }else{ renderFocus(); }
  }

  // ---------- Utils ----------
  function el(tag,cls,txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function miniBtn(t,fn){ const b=el("button","btn ghost",t); b.addEventListener("click",fn); return b; }
  function ghostBtn(t,fn){ const b=el("button","btn ghost",t); b.addEventListener("click",fn); return b; }
  function dangerBtn(t,fn){ const b=el("button","btn danger",t); b.addEventListener("click",fn); return b; }
  function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
  function toISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function css(s){ return String(s).replace(/"/g,'\\"'); }

  function pulse(id){
    const nd = $(`.node[data-id="${css(id)}"] .count`);
    if(!nd) return;
    nd.style.transform="scale(1.08)";
    setTimeout(()=> nd.style.transform="", 120);
  }

  function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function loadState(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||""); }catch(_){ return null; } }

  function tip(t,ok=false){ toastEl.textContent=t; toastEl.style.background=ok?"#153a1f":"#0d1b36"; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1200); }

  async function copy(text){
    try{ await navigator.clipboard.writeText(text); }
    catch(_){
      const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select();
      try{ document.execCommand("copy"); }finally{ ta.remove(); }
    }
  }
})();
