/* PHANToM Report Counter — Smart Focus Edition (v5)
   - Focus เฉพาะเมื่อผู้ใช้คลิก node หรือใช้ปุ่มลูกศรเท่านั้น (ไม่ auto-focus หลัง render)
   - Soft highlight (.selected) แทนการบังคับ focus จริง
   - ปิดคีย์ลัดอัตโนมัติเมื่อพิมพ์ใน INPUT/TEXTAREA
   - Text mode พิมพ์ต่อเนื่อง/Enter ได้ ไม่หลุดโฟกัส
   - รองรับ: Main/Sub nodes • Count/Text • Inline edit • SUM Rules • Export/Import • Autosave • Theme toggle
*/

(function(){
  const $=(s,ctx=document)=>ctx.querySelector(s);
  const $$=(s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // ---- DOM ----
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

  // ---- Storage ----
  const LS_KEY = "PHANTOM_REPORT_STATE_V4";
  const THEME_KEY = "PHANTOM_THEME";
  const DEF_SUM = [
    { id: uid(), label: "โทรรวม", suffix: "", sources: [] },
    { id: uid(), label: "ติดต่อได้", suffix: "", sources: [] },
    { id: uid(), label: "อัปเดท", suffix: "ห้อง", sources: [] },
  ];

  // ---- State ----
  let state = loadState() || defaultState();

  // โฟกัสแบบใหม่: activeNodeId เก็บเฉพาะ id node ที่ถูกเลือกอยู่ (soft highlight)
  let activeNodeId = null;

  // ---- Theme ----
  initTheme();

  // ---- Init ----
  initUI();
  render();              // ไม่มีการ auto-focus ใน render
  softRestoreSelected(); // ถ้ามี activeNodeId ให้แค่ highlight

  // ---------------- Theme ----------------
  function initTheme(){
    const t = localStorage.getItem(THEME_KEY) || "dark";
    document.documentElement.setAttribute("data-theme", t);
    themeToggleBtn?.addEventListener("click", toggleTheme);
    document.addEventListener("keydown", (e)=>{
      if(isTyping(e)) return; // หยุดคีย์ลัดเมื่อพิมพ์อยู่
      if(e.ctrlKey && (e.key==='l'||e.key==='L')){ e.preventDefault(); toggleTheme(); }
    }, true);
  }
  function toggleTheme(){
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur==="dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    tip(next==="dark"?"Dark Mode":"Light Mode", true);
  }

  // ---------------- UI & Events ----------------
  function initUI(){
    // date default
    if(!state.reportDate){
      const d=new Date();
      dateEl.valueAsDate=d;
      state.reportDate = toISO(d);
    }else{
      const [y,m,d]=state.reportDate.split("-").map(Number);
      dateEl.valueAsDate=new Date(y,m-1,d);
    }
    userNameEl.value = state.userName || "";

    // events - header
    userNameEl.addEventListener("input",()=>{ state.userName=userNameEl.value.trim(); saveState(); });
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
      a.download = `PHANToM_Report_Counter_Settings_${Date.now()}.txt`;
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
          state=obj; saveState(); render(); softRestoreSelected(); tip("Import การตั้งค่าแล้ว",true);
        }catch(err){ tip("ไฟล์ .txt ไม่ถูกต้อง"); }
      };
      r.readAsText(f); importInput.value="";
    });

    // Keyboard shortcuts (focus-safe)
    document.addEventListener("keydown", onGlobalKey, true);

    // คลิกพื้นที่ต้นไม้เพื่อให้พร้อมรับลูกศร (แต่ไม่ auto focus node)
    treeEl.addEventListener("click", ()=> treeEl.focus());
  }

  // ---------------- Render ----------------
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

    // Title (dblclick rename)
    const title = el("div","title", main.title);
    title.title="ดับเบิลคลิกเพื่อแก้ชื่อ";
    title.ondblclick = ()=> inlineRename(title, main, "title");

    // Main type select (count/text)
    const typeSel = el("select");
    typeSel.innerHTML = `<option value="count">Count</option><option value="text">Text</option>`;
    typeSel.value = main.type || "count";
    typeSel.addEventListener("change", ()=>{
      main.type=typeSel.value; saveState(); rerenderNode(main.id); // re-render เฉพาะ node
    });

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
      bodyArea.addEventListener("keydown",(e)=>{ e.stopPropagation(); }); // ปิดคีย์ลัดขณะพิมพ์
      bodyArea.addEventListener("input", ()=>{
        main.lines = bodyArea.value.split("\n").map(s=>s.trim()).filter(Boolean);
        saveState(); // ไม่ render ทันที ป้องกันหลุด focus
        updateDailySummary();
      });
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

    // Body area (text mode)
    if(bodyArea) {
      const group = el("div","group"); group.append(bodyArea); nodeInner.append(group);
    }

    // children
    if ((main.children||[]).length){
      nodeInner.append(renderChildren(main, [mi]));
    }

    // soft select handling
    node.addEventListener("click",(e)=>{ e.stopPropagation(); selectNode(node); });

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
      ta.addEventListener("keydown",(e)=>{ e.stopPropagation(); }); // ปิดคีย์ลัดขณะพิมพ์
      ta.addEventListener("input", ()=>{
        nodeData.lines = ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
        saveState(); // ไม่ render ทันที
        updateDailySummary();
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

    node.addEventListener("click",(e)=>{ e.stopPropagation(); selectNode(node); });

    const wrap = el("div"); wrap.append(header, group);
    return wrap;
  }

  // ---------------- Focus (Smart) ----------------
  function selectNode(nodeEl){
    $$(".node").forEach(n=> n.classList.remove("selected"));
    nodeEl.classList.add("selected");
    activeNodeId = nodeEl.dataset.id || null;
  }
  function softRestoreSelected(){
    if(!activeNodeId) return;
    const el = $(`.node[data-id="${css(activeNodeId)}"]`);
    if(el) el.classList.add("selected");
  }

  // ลูกศรเปลี่ยน selection เฉพาะเมื่อไม่ได้พิมพ์ใน input/textarea
  function onGlobalKey(e){
    if(isTyping(e)) return;

    // Theme
    if(e.ctrlKey && (e.key==='l'||e.key==='L')) return; // handled in initTheme

    const nodes = $$(".node");
    if(!nodes.length) return;

    const idx = nodes.findIndex(n=> n.dataset.id===activeNodeId);

    // Arrow navigation
    if(e.key==="ArrowDown" || e.key==="ArrowRight"){
      e.preventDefault();
      const next = nodes[idx+1] || nodes[0];
      selectNode(next);
      next.scrollIntoView({block:"nearest", behavior:"smooth"});
      return;
    }
    if(e.key==="ArrowUp" || e.key==="ArrowLeft"){
      e.preventDefault();
      const prev = nodes[idx-1] || nodes[nodes.length-1];
      selectNode(prev);
      prev.scrollIntoView({block:"nearest", behavior:"smooth"});
      return;
    }

    // +/- for count
    if(e.key==="+" || e.key==="-"){
      if(!activeNodeId) return;
      const target = findNodeById(activeNodeId);
      if(!target || target.type!=="count") return;
      e.preventDefault();
      if(e.key==="+") target.count = (target.count||0)+1;
      if(e.key==="-") target.count = Math.max(0,(target.count||0)-1);
      saveState();
      // re-render เฉพาะ node ถ้าเป็น main; ถ้าเป็น sub ให้ render ทั้งต้นย่อย
      rerenderNode(activeNodeId);
      softRestoreSelected();
      updateDailySummary();
      return;
    }

    // Copy report
    if(e.ctrlKey && (e.key==='c'||e.key==='C')){
      e.preventDefault();
      const t=buildReport();
      copy(t).then(()=> tip("คัดลอก Report แล้ว", true));
      return;
    }

    // Save (noop เพราะ autosave อยู่แล้ว) — แค่ feedback
    if(e.ctrlKey && (e.key==='s'||e.key==='S')){
      e.preventDefault();
      tip("บันทึกแล้ว", true);
      return;
    }
  }

  function isTyping(e){
    const t = e.target;
    const tag = (t && t.tagName) || "";
    if(tag==="TEXTAREA") return true;
    if(tag==="INPUT"){
      const tp = (t.type||"").toLowerCase();
      if(tp && tp!=="button" && tp!=="checkbox" && tp!=="radio") return true;
    }
    return false;
  }

  // ---------------- Data Ops ----------------
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
    saveState(); render(); softRestoreSelected();
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
    saveState(); render(); softRestoreSelected();
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
    saveState(); render(); softRestoreSelected();
  }
  function rename(node){
    const nv = prompt("แก้ไขชื่อ:", node.title);
    if(!nv) return;
    node.title = nv.trim();
    saveState(); render(); softRestoreSelected();
  }
  function delMain(mi){
    if(!confirm(`ลบหมวดหลัก "${state.categories[mi].title}" ?`)) return;
    const removed = state.categories.splice(mi,1)[0];
    state.sumRules.forEach(rule=>{
      rule.sources = (rule.sources||[]).filter(id=>id!==removed.id);
    });
    if(activeNodeId===removed.id) activeNodeId=null;
    saveState(); render(); softRestoreSelected();
  }
  function delNode(parent, path){
    const idx = path[path.length-1];
    const removed = parent.children.splice(idx,1)[0];
    state.sumRules.forEach(rule=>{
      rule.sources = (rule.sources||[]).filter(id=>id!==removed.id);
    });
    if(activeNodeId===removed.id) activeNodeId=null;
    saveState(); render(); softRestoreSelected();
  }
  function moveMain(mi,dir){
    const ni=mi+dir; if(ni<0 || ni>=state.categories.length) return;
    const x=state.categories.splice(mi,1)[0]; state.categories.splice(ni,0,x);
    saveState(); render(); softRestoreSelected();
  }
  function moveChild(parent, path, dir){
    const idx=path[path.length-1]; const ni=idx+dir;
    if(ni<0 || ni>=parent.children.length) return;
    const x=parent.children.splice(idx,1)[0]; parent.children.splice(ni,0,x);
    saveState(); render(); softRestoreSelected();
  }
  function inc(node,delta){
    node.count = Math.max(0,(node.count||0)+delta);
    pulse(node.id); saveState(); rerenderNode(node.id); softRestoreSelected(); updateDailySummary();
  }
  function calcOwn(node){
    return node.type==="count" ? (node.count||0) : (node.lines?.length||0);
  }
  function calcCount(node){
    let base = calcOwn(node);
    (node.children||[]).forEach(ch=> base += calcCount(ch));
    return base;
  }

  // ---------------- Inline Editors ----------------
  function inlineRename(elm, node, key){
    const inp=document.createElement("input");
    inp.type="text"; inp.value=node[key]||"";
    inp.style.minWidth = "160px";
    elm.replaceWith(inp); inp.focus(); inp.select();
    const commit=()=>{
      node[key]=inp.value.trim()||node[key];
      saveState(); render(); softRestoreSelected();
    };
    inp.addEventListener("keydown",e=>{
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
      node[key]=n; saveState(); rerenderNode(node.id); softRestoreSelected(); updateDailySummary();
    };
    box.addEventListener("keydown",e=>{
      if(e.key==="Enter") commit();
      if(e.key==="Escape") rerenderNode(node.id);
    });
    box.addEventListener("blur",commit);
  }

  // ---------------- SUM Rules ----------------
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
          rule.sources = rule.sources||=[];
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

  // ---------------- Report ----------------
  function buildReport(){
    const name = (state.userName||"PHANToM").trim();
    const d = dateEl.value ? new Date(dateEl.value) : new Date();
    const header = `${name} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;

    const lines=[];
    lines.push(header);
    lines.push("");

    state.categories.forEach(main=>{
      const total = calcCount(main);
      lines.push(`//${main.title}${total>0?` ${total}`:""}`);
      appendSubLines(lines, main);
      if(main.type==="text" && (main.lines||[]).length){
        main.lines.forEach(t=> lines.push(t));
      }
      lines.push("");
    });

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

  function computeSums(){
    // รวมเฉพาะ main id ตาม rule
    const sums = state.sumRules.map(rule=>{
      const ids = new Set(rule.sources||[]);
      let total = 0;
      state.categories.forEach(m=>{
        if(ids.has(m.id)) total += calcCount(m);
      });
      return { label: rule.label||"", suffix: rule.suffix||"", value: total };
    });
    return sums;
  }

  // ---------------- Helpers ----------------
  function rerenderNode(id){
    const old = $(`.node[data-id="${css(id)}"]`);
    if(!old) { render(); softRestoreSelected(); return; }
    // หาเป็น main หรือ child
    const mi = state.categories.findIndex(x=>x.id===id);
    if(mi>=0){
      old.replaceWith(renderMain(state.categories[mi], mi));
    }else{
      // ถ้าเป็น child ให้ fallback render ทั้งหน้า
      render();
    }
    softRestoreSelected();
  }

  function findNodeById(id){
    for(const m of state.categories){
      if(m.id===id) return m;
      const sub=findInChildren(m.children||[], id);
      if(sub) return sub;
    }
    return null;
  }
  function findInChildren(arr,id){
    for(const n of arr){
      if(n.id===id) return n;
      const sub=findInChildren(n.children||[], id);
      if(sub) return sub;
    }
    return null;
  }

  function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function loadState(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||""); }catch(e){ return null; } }

  function uid(){ return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
  function toISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function tip(t,ok=false){ if(!toastEl) return; toastEl.textContent=t; toastEl.style.background=ok?"#153a1f":"#0d1b36"; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1400); }
  function copy(text){ return navigator.clipboard.writeText(text).catch(async()=>{ const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); }finally{ ta.remove(); } }); }
  function pulse(id){
    const el=$(`.node[data-id="${css(id)}"] .count`); if(!el) return;
    el.animate([{transform:"scale(1)"},{transform:"scale(1.06)"},{transform:"scale(1)"}],{duration:200});
  }
  function css(s){ return String(s).replace(/"/g,'\\"'); }

  function el(tag, cls, txt){
    const n=document.createElement(tag);
    if(cls) n.className=cls;
    if(txt!=null) n.textContent=txt;
    return n;
  }
  function miniBtn(txt, fn){ const b=el("button","mini",txt); b.addEventListener("click",fn); return b; }
  function ghostBtn(txt, fn){ const b=el("button","ghost",txt); b.addEventListener("click",fn); return b; }
  function dangerBtn(txt, fn){ const b=el("button","danger",txt); b.addEventListener("click",fn); return b; }

})();
