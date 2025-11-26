/* PHANToM Report Counter — 3-Level + Calc + Undo (Aurora 2025) */

(function(){
  const $ = (s,c=document)=>c.querySelector(s);
  const $$ = (s,c=document)=>Array.from(c.querySelectorAll(s));

  // ---- DOM ----
  const treeEl = $("#tree");
  const userNameEl = $("#userName");
  const dateEl = $("#reportDate");
  const copyBtn = $("#copyReport");
  const addMainBtn = $("#addMain");
  const newMainTitleEl = $("#newMainTitle");
  const addCalcToRootBtn = $("#addCalcToRoot");
  const exportBtn = $("#exportSettings");
  const importInput = $("#importSettings");
  const resetCountsBtn = $("#resetCounts");
  const resetAllBtn = $("#resetAll");

  const formulaModal = $("#formulaModal");
  const formulaListEl = $("#formulaList");
  const formulaSourceSel = $("#formulaSource");
  const formulaSignSel = $("#formulaSign");
  const formulaAddBtn = $("#formulaAdd");
  const formulaSaveBtn = $("#formulaSave");
  const formulaCloseBtn = $("#formulaClose");

  const toastEl = $("#toast");

  // ---- Storage ----
  const LS_KEY = "PHANTOM_REPORT_STATE_V5";

  // ---- State ----
  let state = loadState() || defaultState();
  ensureSumSection();
  let focusPath = [];            // [mainIndex] or [mainIndex, subIndex] or [mainIndex, subIndex, leafIndex]
  let flatFocus = [];
  let undoStack = [];

  // temp for formula editing
  let editingCalcRef = null;     // { level:"root"|"level2", mainIdx, subIdx?, leafIdx? }
  let editingCalcObj = null;     // actual node object (kind==="calc")
  let editingParts = [];         // [{nodeId, sign:+1|-1}]

  // ---- Init ----
  initHeader();
  initKeyboard();
  render();

  // =========================================================
  // Header & top actions
  function initHeader(){
    userNameEl.value = state.userName || "";
    userNameEl.addEventListener("input", ()=>{ state.userName = userNameEl.value.trim(); saveState(); });

    if(!state.reportDate){
      dateEl.valueAsDate = new Date();
      state.reportDate = isoDate();
    }else{ dateEl.value = state.reportDate; }
    dateEl.addEventListener("change", ()=>{ state.reportDate = dateEl.value || isoDate(); saveState(); });

    copyBtn.addEventListener("click", ()=>{ const t=buildReport(); copy(t).then(()=>tip("คัดลอกรายงานแล้ว",true)); });

    addMainBtn.addEventListener("click", ()=>{
      const t = (newMainTitleEl.value||"").trim();
      if(!t){ tip("กรอกชื่อหัวข้อหลักก่อน"); return; }
      pushUndo();
      state.mains.push({ id:uid(), title:t, kind:"main", children:[] });
      newMainTitleEl.value="";
      saveState(); render();
    });

    addCalcToRootBtn.addEventListener("click", ()=>{
      pushUndo();
      state.mains.push(newCalcNode("ผลรวมใหม่ (Main)"));
      saveState(); render();
      tip("เพิ่ม Calculate Node ที่ระดับหลัก", true);
    });

    exportBtn.addEventListener("click", ()=>{
      const blob = new Blob([JSON.stringify(state,null,2)],{type:"text/plain;charset=utf-8"});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob); a.download="PHANToM_Report_Counter_Settings.txt"; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),500);
      tip("Export เรียบร้อย",true);
    });
    importInput.addEventListener("change",(e)=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=(ev)=>{
        try{
          const obj=JSON.parse(String(ev.target.result||"{}"));
          if(!obj || !Array.isArray(obj.mains)) throw new Error("invalid");
          pushUndo(true);
          state=obj; ensureSumSection(); saveState(); render(); tip("Import เรียบร้อย",true);
        }catch{ tip("ไฟล์ .txt ไม่ถูกต้อง"); }
        importInput.value="";
      };
      r.readAsText(f);
    });

    resetCountsBtn.addEventListener("click", ()=>{
      if(!confirm("รีเซ็ตค่าประจำวัน (ล้างตัวเลข/ข้อความ แต่คงโครงสร้าง)?")) return;
      pushUndo();
      state.mains.forEach(resetCountsOnlyNodeDeep);
      saveState(); render(); tip("รีเซ็ตค่าประจำวันแล้ว",true);
    });

    resetAllBtn.addEventListener("click", ()=>{
      if(!confirm("ล้างทุกอย่าง?")) return;
      pushUndo();
      state = defaultState(); ensureSumSection(); saveState(); render(); tip("ล้างทั้งหมดแล้ว",true);
    });

    // Formula modal controls
    formulaCloseBtn.addEventListener("click", ()=> formulaModal.close());
    formulaAddBtn.addEventListener("click", ()=>{
      const id = formulaSourceSel.value; if(!id) return;
      const sign = (formulaSignSel.value==="-") ? -1 : +1;
      const title = findNodeTitleById(id) || "(unknown)";
      editingParts.push({nodeId:id, sign});
      renderFormulaLines();
    });
    formulaSaveBtn.addEventListener("click", ()=>{
      if(!editingCalcObj) return;
      pushUndo();
      editingCalcObj.formula = editingParts.slice(); // [{nodeId,sign}]
      saveState(); render(); formulaModal.close(); tip("บันทึกสูตรแล้ว",true);
    });
  }

  // =========================================================
  // Keyboard (global): arrows, +/- , Ctrl+Z
  function initKeyboard(){
    document.addEventListener("keydown",(e)=>{
      // ignore while typing
      const tag=(document.activeElement && document.activeElement.tagName)||"";
      if(tag==="INPUT"||tag==="TEXTAREA") return;

      if(e.ctrlKey && (e.key==="z"||e.key==="Z")){ e.preventDefault(); undo(); return; }

      if(e.key==="+"||e.key==="="){ incFocused(+1); e.preventDefault(); return; }
      if(e.key==="-"||e.key==="_"){ incFocused(-1); e.preventDefault(); return; }

      if(e.key==="ArrowDown"){ moveFocusFlat(+1); e.preventDefault(); return; }
      if(e.key==="ArrowUp"){ moveFocusFlat(-1); e.preventDefault(); return; }
      if(e.key==="ArrowRight"){ // dive
        const n = getNodeByPath(focusPath);
        if(n && n.children && n.children.length>0){ setFocusPath([...focusPath,0], true); }
        e.preventDefault(); return;
      }
      if(e.key==="ArrowLeft"){
        if(focusPath.length>1){ setFocusPath(focusPath.slice(0,-1), true); }
        e.preventDefault(); return;
      }
    }, true);
  }

  // =========================================================
  // Render Tree
  function render(){
    treeEl.innerHTML="";
    flatFocus=[];
    ensureSumSection();

    state.mains.forEach((main, mi)=>{
      const mainEl = renderMain(main, mi);
      treeEl.appendChild(mainEl);
    });

    saveState();
    highlightFocus();
  }

  function renderMain(main, mi){
    const node = div("node main");
    node.dataset.path = key([mi]);

    // Header (title + add level2 / add calc)
    const header = div("header");
    const title  = div("title", main.kind==="sum" ? "//////////SUM//////////" : main.title);
    header.appendChild(title);

    const ops = div("row");
    if(main.kind!=="sum"){
      // Add level2 section
      const subName = input("", "เพิ่ม node ขั้น 2 (ย่อหน้า)");
      const modeSel = select([{v:"count",t:"Count"},{v:"text",t:"Text"}]);
      const addBtn  = btn("เพิ่ม", ()=> {
        const t=(subName.value||"").trim(); if(!t) return tip("กรอกชื่อก่อน");
        pushUndo();
        main.children = main.children || [];
        main.children.push(newLevel2Node(t, modeSel.value));
        subName.value="";
        saveState(); render();
      });
      ops.append(subName, modeSel, addBtn);

      // Add calc at main level
      const addCalc = btnGhost("+ Calc", ()=>{
        pushUndo();
        main.children = main.children || [];
        main.children.push(newCalcNode("ผลรวมใหม่"));
        saveState(); render();
      });
      ops.appendChild(addCalc);
    }else{
      // SUM: only calc nodes allowed
      const addCalc = btn("เพิ่ม CALC (SUM)", ()=>{
        pushUndo();
        main.children = main.children || [];
        main.children.push(newCalcNode("สรุปใหม่"));
        saveState(); render();
      });
      ops.appendChild(addCalc);
    }

    // Move / delete main (except SUM cannot move/remove)
    const rightOps = div("row");
    if(main.kind!=="sum"){
      rightOps.append(
        btnGhost("↑", ()=>{ pushUndo(); moveMain(mi,-1); }),
        btnGhost("↓", ()=>{ pushUndo(); moveMain(mi,+1); }),
        btnDanger("ลบ", ()=>{
          if(!confirm(`ลบหัวข้อหลัก "${main.title}" ?`)) return;
          pushUndo();
          state.mains.splice(mi,1);
          saveState(); render();
        })
      );
    }else{
      rightOps.append(div("muted","(ตำแหน่งคงที่ด้านล่าง)"));
    }
    header.append(ops, rightOps);
    node.appendChild(header);

    // Children (level2 or calc)
    const childrenWrap = div("children");
    (main.children||[]).forEach((child, si)=>{
      if(child.kind==="calc"){
        childrenWrap.appendChild(renderCalcNode(child, [mi, si]));
      }else{
        childrenWrap.appendChild(renderLevel2(child, [mi, si]));
      }
    });

    node.appendChild(childrenWrap);

    registerFocusable(node, [mi]);
    node.addEventListener("click",(e)=>{ e.stopPropagation(); setFocusPath([mi], true); });

    return node;
  }

  function renderLevel2(l2, path){
    // l2: {id,title, kind:"level2", mode:"count"|"text", count, lines[], children:[level3 or calc?] }
    const node = div("node level2");
    node.dataset.path = key(path);
    if(l2.children && l2.children.length>0) node.classList.add("has-children");

    // header
    const head = div("sub-header");
    const title = div("title", l2.title);
    title.title = "ดับเบิลคลิกเพื่อแก้ชื่อ"; title.ondblclick = ()=> renameNode(l2);

    // mode & value (hide when has children)
    const modeWrap = div("modeWrap");
    const modeSel = select([{v:"count",t:"Count"},{v:"text",t:"Text"}], l2.mode||"count");
    modeSel.addEventListener("change", ()=>{
      pushUndo(); l2.mode = modeSel.value; saveState(); render();
    });
    modeWrap.append(modeSel);

    const countWrap = div("countWrap");
    if((l2.mode||"count")==="count"){
      const v = div("count", String(l2.count||0));
      v.title="คลิกเพื่อแก้ไขตัวเลข"; v.addEventListener("click", ()=> inlineNumber(v,l2));
      countWrap.append(btnMini("−", ()=>{pushUndo(); inc(l2,-1);}), v, btnMini("+", ()=>{pushUndo(); inc(l2,+1);}));
    }else{
      const ta = textarea((l2.lines||[]).join("\n"));
      ta.placeholder="พิมพ์ข้อความ (1 บรรทัด = 1 นับ)";
      ta.addEventListener("keydown", e=> e.stopPropagation());
      ta.addEventListener("input", ()=>{
        l2.lines = ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
        saveState();
      });
      countWrap.append(ta);
    }

    if(l2.children && l2.children.length>0){  // aggregated view
      modeWrap.style.display="none";
      countWrap.innerHTML="";
      const sum = calcCount(l2);
      countWrap.append(div("badge", "รวมลูกทั้งหมด:"), div("count", String(sum)));
    }

    const leftOps = div("row");
    leftOps.append(
      btnGhost("↑", ()=>{ pushUndo(); moveChild(getNodeByPath([path[0]]), path, -1); }),
      btnGhost("↓", ()=>{ pushUndo(); moveChild(getNodeByPath([path[0]]), path, +1); }),
      btnDanger("ลบ", ()=>{
        if(!confirm(`ลบ "${l2.title}" ?`)) return;
        pushUndo();
        const parent = getNodeByPath([path[0]]);
        parent.children.splice(path[1],1);
        saveState(); render();
      })
    );

    head.append(title, modeWrap, countWrap, leftOps);
    node.appendChild(head);

    // Level3 area + add controls
    const group = div("level3-wrap");
    const addRow = div("row");
    const subName = input("", "เพิ่ม node ขั้น 3");
    const subMode = select([{v:"count",t:"Count"},{v:"text",t:"Text"}]);
    const addBtn = btn("เพิ่ม", ()=>{
      const t=(subName.value||"").trim(); if(!t) return tip("กรอกชื่อก่อน");
      pushUndo();
      l2.children = l2.children || [];
      l2.children.push(newLevel3Node(t, subMode.value));
      subName.value="";
      saveState(); render();
    });
    // add calc under level2
    const addCalc = btnGhost("+ Calc", ()=>{
      pushUndo();
      l2.children = l2.children || [];
      l2.children.push(newCalcNode("ผลรวมใหม่ (ย่อย)"));
      saveState(); render();
    });
    addRow.append(subName, subMode, addBtn, addCalc);
    node.appendChild(addRow);

    (l2.children||[]).forEach((leaf, li)=>{
      if(leaf.kind==="calc"){ group.appendChild(renderCalcNode(leaf, [...path, li])); }
      else{ group.appendChild(renderLevel3(leaf, [...path, li])); }
    });
    if((l2.children||[]).length) node.appendChild(group);

    registerFocusable(node, path);
    node.addEventListener("click",(e)=>{ e.stopPropagation(); setFocusPath(path,true); });

    return node;
  }

  function renderLevel3(l3, path){
    const node = div("node level3");
    node.dataset.path = key(path);

    const head = div("sub-header");
    const title = div("title", l3.title);
    title.title="ดับเบิลคลิกเพื่อแก้ชื่อ"; title.ondblclick = ()=> renameNode(l3);

    const modeWrap = div("modeWrap");
    const modeSel = select([{v:"count",t:"Count"},{v:"text",t:"Text"}], l3.mode||"count");
    modeSel.addEventListener("change", ()=>{ pushUndo(); l3.mode=modeSel.value; saveState(); render(); });
    modeWrap.append(modeSel);

    const countWrap = div("countWrap");
    if((l3.mode||"count")==="count"){
      const v = div("count", String(l3.count||0));
      v.title="คลิกเพื่อแก้ไขตัวเลข"; v.addEventListener("click", ()=> inlineNumber(v,l3));
      countWrap.append(btnMini("−", ()=>{pushUndo(); inc(l3,-1);}), v, btnMini("+", ()=>{pushUndo(); inc(l3,+1);}));
    }else{
      const ta = textarea((l3.lines||[]).join("\n"));
      ta.placeholder="พิมพ์ข้อความ (1 บรรทัด = 1 นับ)";
      ta.addEventListener("keydown", e=> e.stopPropagation());
      ta.addEventListener("input", ()=>{
        l3.lines = ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
        saveState();
      });
      countWrap.append(ta);
    }

    const ops = div("row");
    ops.append(
      btnGhost("↑", ()=>{ pushUndo(); moveChild(getNodeByPath([path[0],path[1]]), path, -1); }),
      btnGhost("↓", ()=>{ pushUndo(); moveChild(getNodeByPath([path[0],path[1]]), path, +1); }),
      btnDanger("ลบ", ()=>{
        if(!confirm(`ลบ "${l3.title}" ?`)) return;
        pushUndo();
        const parent = getNodeByPath([path[0],path[1]]);
        parent.children.splice(path[2],1);
        saveState(); render();
      })
    );

    head.append(title, modeWrap, countWrap, ops);
    node.appendChild(head);

    registerFocusable(node, path);
    node.addEventListener("click",(e)=>{ e.stopPropagation(); setFocusPath(path, true); });

    return node;
  }

  function renderCalcNode(calc, path){
    // calc: {id,title, kind:"calc", formula:[{nodeId,sign}]}
    const node = div("node calc");
    node.dataset.path = key(path);

    const head = div("sub-header");
    const title = div("title", calc.title);
    title.title="ดับเบิลคลิกเพื่อแก้ชื่อ"; title.ondblclick = ()=> renameNode(calc);

    const val = evaluateCalc(calc);
    const valueBox = div("count", String(val));

    const formBtn = btnGhost("สูตร…", ()=> openFormulaEditor(calc, path));

    const ops = div("row");
    // move / del
    const parentPath = path.slice(0,-1);
    const parent = getNodeByPath(parentPath);
    ops.append(
      btnGhost("↑", ()=>{ pushUndo(); moveChild(parent, path, -1); }),
      btnGhost("↓", ()=>{ pushUndo(); moveChild(parent, path, +1); }),
      btnDanger("ลบ", ()=>{
        if(!confirm(`ลบ "${calc.title}" ?`)) return;
        pushUndo(); parent.children.splice(path[path.length-1],1); saveState(); render();
      })
    );

    head.append(title, div("formula", formulaText(calc)), valueBox, formBtn, ops);
    node.appendChild(head);

    registerFocusable(node, path);
    node.addEventListener("click",(e)=>{ e.stopPropagation(); setFocusPath(path, true); });

    return node;
  }

  // =========================================================
  // Formula editor
  function openFormulaEditor(calcObj, path){
    editingCalcObj = calcObj;
    editingCalcRef = { path };
    editingParts = (calcObj.formula||[]).map(x=>({nodeId:x.nodeId,sign:x.sign}));

    // populate sources select
    formulaSourceSel.innerHTML="";
    const nodes = listAllCountableNodes(); // {id,title}
    nodes.forEach(n=>{
      const opt=document.createElement("option");
      opt.value=n.id; opt.textContent = n.title;
      formulaSourceSel.appendChild(opt);
    });

    renderFormulaLines();
    formulaModal.showModal();
  }

  function renderFormulaLines(){
    formulaListEl.innerHTML="";
    if(!editingParts.length){
      formulaListEl.appendChild(div("muted","(ยังไม่มีส่วนประกอบในสูตร)"));
      return;
    }
    editingParts.forEach((p,idx)=>{
      const row = div("formula-line");
      row.append(
        div(null, p.sign>0?"+":"−"),
        div(null, findNodeTitleById(p.nodeId) || "(ไม่พบ)"),
        btnDanger("ลบ", ()=>{ editingParts.splice(idx,1); renderFormulaLines(); })
      );
      formulaListEl.appendChild(row);
    });
  }

  function listAllCountableNodes(){
    const out=[];
    state.mains.forEach(m=>{
      (m.children||[]).forEach(c=>{
        // calc node not included
        if(c.kind==="calc"){ /*skip*/ }
        else{
          // level2 itself is aggregate if has children else its own
          out.push({id:c.id, title:`${m.kind==="sum"?"SUM":"Main"} ▸ ${c.title}`});
          (c.children||[]).forEach(l3=>{
            if(l3.kind!=="calc") out.push({id:l3.id, title:`${m.kind==="sum"?"SUM":"Main"} ▸ ${c.title} ▸ ${l3.title}`});
          });
        }
      });
    });
    return out;
  }

  function evaluateCalc(calc){
    const parts = calc.formula||[];
    let sum=0;
    parts.forEach(p=>{
      const node = findNodeById(p.nodeId);
      const val = node ? calcCount(node) : 0;
      sum += (p.sign||1) * val;
    });
    return sum;
  }

  function formulaText(calc){
    const parts = calc.formula||[];
    if(!parts.length) return "สูตร: 0";
    return "สูตร: " + parts.map(p=>{
      const t = findNodeTitleById(p.nodeId) || "?";
      return (p.sign>0?"+":"−") + t;
    }).join(" ").replace(/^\+/,"");
  }

  // =========================================================
  // Data helpers
  function defaultState(){
    return {
      userName:"",
      reportDate: isoDate(),
      mains: []   // array of { id,title, kind:"main"|"sum"|"calc"?, children:[...] }
    };
  }

  function ensureSumSection(){
    // always keep SUM as last main
    const idx = state.mains.findIndex(m=> m.kind==="sum");
    if(idx===-1){
      state.mains.push({ id:uid(), title:"//////////SUM//////////", kind:"sum", children:[] });
    }else if(idx !== state.mains.length-1){
      const x = state.mains.splice(idx,1)[0];
      state.mains.push(x);
    }
  }

  function newLevel2Node(title, mode){
    return { id:uid(), title, kind:"level2", mode:(mode||"count"), count:0, lines:[], children:[] };
  }
  function newLevel3Node(title, mode){
    return { id:uid(), title, kind:"level3", mode:(mode||"count"), count:0, lines:[] };
  }
  function newCalcNode(title){
    return { id:uid(), title, kind:"calc", formula:[] };
  }

  function moveMain(i,dir){
    const ni=i+dir; if(ni<0||ni>=state.mains.length-1) return; // keep SUM at end
    const x=state.mains.splice(i,1)[0]; state.mains.splice(ni,0,x);
  }
  function moveChild(parent, path, dir){
    const idx = path[path.length-1];
    const ni  = idx+dir;
    if(ni<0 || ni>= (parent.children||[]).length) return;
    const x = parent.children.splice(idx,1)[0];
    parent.children.splice(ni,0,x);
    saveState(); render();
  }

  function inc(node,delta){
    node.count = Math.max(0,(node.count||0)+delta);
    saveState(); render();
  }
  function calcOwn(node){
    if(node.kind==="calc") return evaluateCalc(node);
    const mode = node.mode||"count";
    return (mode==="count") ? (node.count||0) : (node.lines?.length||0);
  }
  function calcCount(node){
    let base = calcOwn(node);
    if(node.children && node.children.length){
      node.children.forEach(ch=>{
        base += calcCount(ch);
      });
    }
    return base;
  }

  function resetCountsOnlyNodeDeep(node){
    if(node.kind==="calc"){/*skip values*/ }
    else{
      if(node.mode==="count") node.count=0;
      else if(node.mode==="text") node.lines=[];
    }
    (node.children||[]).forEach(resetCountsOnlyNodeDeep);
  }

  // =========================================================
  // Focus & Keyboard helpers
  function registerFocusable(el, path){ flatFocus.push({path:path.slice(), el}); }
  function setFocusPath(path, scroll=false){
    focusPath = path.slice();
    highlightFocus(scroll);
  }
  function highlightFocus(scroll=false){
    $$(".node").forEach(n=> n.classList.remove("selected"));
    if(!focusPath.length) return;
    const el = $(`.node[data-path="${key(focusPath)}"]`);
    if(el){
      el.classList.add("selected");
      if(scroll) el.scrollIntoView({block:"nearest",behavior:"smooth"});
    }
  }
  function moveFocusFlat(delta){
    if(flatFocus.length===0) return;
    let idx=0;
    if(focusPath.length){
      const k=key(focusPath);
      idx = flatFocus.findIndex(x=> key(x.path)===k);
      if(idx<0) idx=0;
    }
    let ni = Math.max(0, Math.min(flatFocus.length-1, idx+delta));
    setFocusPath(flatFocus[ni].path, true);
  }
  function incFocused(delta){
    if(!focusPath.length) return;
    const node = getNodeByPath(focusPath);
    // only count mode nodes (not calc / not text)
    if(!node || node.kind==="calc") return;
    if(node.mode && node.mode!=="count") return;
    pushUndo();
    inc(node, delta);
  }

  // =========================================================
  // Inline editors & rename
  function inlineNumber(host, node){
    const old = node.count||0;
    const inp = document.createElement("input");
    inp.type="number"; inp.value=String(old);
    host.innerHTML=""; host.appendChild(inp); inp.focus(); inp.select();
    inp.addEventListener("keydown",(e)=>{ e.stopPropagation(); if(e.key==="Enter") commit(); if(e.key==="Escape") cancel(); });
    inp.addEventListener("blur",commit);
    function commit(){ pushUndo(); node.count=Math.max(0,parseInt(inp.value||"0",10)); saveState(); render(); }
    function cancel(){ render(); }
  }
  function renameNode(node){
    const nv=prompt("แก้ชื่อ:", node.title);
    if(!nv) return;
    pushUndo(); node.title=nv.trim(); saveState(); render();
  }

  // =========================================================
  // Report builder
  function buildReport(){
    const name = (state.userName||"PHANToM").trim();
    const d = dateEl.value ? new Date(dateEl.value): new Date();
    const header = `${name} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;

    const out = [header,""];

    state.mains.forEach(m=>{
      if(m.kind==="sum") return; // skip here; summary later
      out.push(`//////////${m.title}//////////`);
      (m.children||[]).forEach(l2=>{
        if(l2.kind==="calc"){
          out.push(`//${l2.title} ${evaluateCalc(l2)}//`);
        }else{
          const total = calcCount(l2);
          out.push(`${l2.title} ${total}`);
          // if text mode and has lines but no children, print lines
          if((l2.mode==="text") && (!l2.children || !l2.children.length)){
            (l2.lines||[]).forEach(t=> out.push(t));
          }
          (l2.children||[]).forEach(l3=>{
            if(l3.kind==="calc"){
              out.push(`- ${l3.title} ${evaluateCalc(l3)}`);
            }else{
              const cnt = calcCount(l3);
              out.push(`- ${l3.title} ${cnt}`);
              if(l3.mode==="text"){
                (l3.lines||[]).forEach(t=> out.push(`  ${t}`));
              }
            }
          });
        }
        out.push(""); // gap between sections
      });
    });

    out.push("//////////SUM//////////");
    const sumMain = state.mains.find(m=> m.kind==="sum");
    (sumMain.children||[]).forEach(calc=>{
      const v=evaluateCalc(calc);
      out.push(`${calc.title} ${v}`);
    });

    return out.join("\n");
  }

  // =========================================================
  // Undo
  function pushUndo(clearNext=false){
    if(clearNext) undoStack.length=0;
    // limit history
    if(undoStack.length>50) undoStack.shift();
    undoStack.push(JSON.stringify(state));
  }
  function undo(){
    if(undoStack.length===0){ tip("ไม่มีรายการก่อนหน้า"); return; }
    const snap = undoStack.pop();
    try{
      state = JSON.parse(snap);
      saveState(); render();
      tip("ย้อนกลับแล้ว",true);
    }catch{ tip("ย้อนกลับไม่สำเร็จ"); }
  }

  // =========================================================
  // Lookup & helpers
  function getNodeByPath(path){
    if(!path || !path.length) return null;
    let cur = state.mains[path[0]];
    for(let i=1;i<path.length;i++){
      cur = (cur && cur.children) ? cur.children[path[i]] : null;
    }
    return cur||null;
  }
  function findNodeById(id){
    let found=null;
    state.mains.some(m=>{
      if(m.id===id){ found=m; return true; }
      (m.children||[]).some(c=>{
        if(c.id===id){ found=c; return true; }
        (c.children||[]).some(l3=>{
          if(l3.id===id){ found=l3; return true; }
          return false;
        });
        return !!found;
      });
      return !!found;
    });
    return found;
  }
  function findNodeTitleById(id){
    const n=findNodeById(id); return n?n.title:null;
  }

  // =========================================================
  // Small DOM makers
  function div(cls, txt){ const x=document.createElement("div"); if(cls) x.className=cls; if(txt!=null) x.textContent=txt; return x; }
  function input(val="", placeholder=""){ const x=document.createElement("input"); x.type="text"; x.value=val; x.placeholder=placeholder; return x; }
  function textarea(val=""){ const x=document.createElement("textarea"); x.className="textbox"; x.value=val; return x; }
  function select(opts, val){
    const s=document.createElement("select");
    opts.forEach(o=>{ const op=document.createElement("option"); op.value=o.v; op.textContent=o.t; s.appendChild(op); });
    if(val!=null) s.value=val;
    return s;
  }
  function btn(t,fn){ const b=document.createElement("button"); b.className="btn"; b.textContent=t; b.onclick=(e)=>{ e.stopPropagation(); fn&&fn(); }; return b; }
  function btnGhost(t,fn){ const b=document.createElement("button"); b.className="ghost"; b.textContent=t; b.onclick=(e)=>{ e.stopPropagation(); fn&&fn(); }; return b; }
  function btnDanger(t,fn){ const b=document.createElement("button"); b.className="danger"; b.textContent=t; b.onclick=(e)=>{ e.stopPropagation(); fn&&fn(); }; return b; }
  function btnMini(t,fn){ const b=document.createElement("button"); b.className="mini"; b.textContent=t; b.onclick=(e)=>{ e.stopPropagation(); fn&&fn(); }; return b; }

  // =========================================================
  // Persist & misc
  function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function loadState(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||"null"); }catch{ return null; } }
  function isoDate(){ const d=new Date(); return d.toISOString().split("T")[0]; }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function key(path){ return path.join("."); }
  function tip(t, ok=false){ if(!toastEl) return; toastEl.textContent=t; toastEl.style.borderColor=ok?"var(--ok)":"var(--pri)"; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1300); }
  async function copy(text){ try{ await navigator.clipboard.writeText(text); }catch{ const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } }
  function uid(){ return Math.random().toString(36).slice(2,9); }
})();
