/* PHANToM Report Counter — Arrow Navigation + Sub Grid + Focus friendly
   - เพิ่มการเลือกด้วยปุ่มลูกศรได้ทั้ง Main/Sub/Sub-sub (ซ้าย-ขวา/ขึ้น-ลง)
   - Sub UI เป็นการ์ดเล็ก เรียงซ้าย→ขวา ใต้หัวข้อหลัก
   - คงระบบเดิมทั้งหมด (autosave / SUM / export-import / inline edit / text-mode fixes)
*/

(function(){
  const $=(s,ctx=document)=>ctx.querySelector(s);
  const $$=(s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // ---- DOM ----
  const treeEl=$("#tree"), toastEl=$("#toast");
  const userNameEl=$("#userName"), dateEl=$("#reportDate");
  const themeToggleBtn=$("#themeToggle"), copyBtn=$("#copyReport");
  const addMainBtn=$("#addMain"), newMainTitleEl=$("#newMainTitle");
  const resetCountsBtn=$("#resetCounts"), resetAllBtn=$("#resetAll");
  const manageSumBtn=$("#manageSum"), sumModal=$("#sumModal");
  const sumListEl=$("#sumList"), sumNewLabelEl=$("#sumNewLabel"), sumNewSuffixEl=$("#sumNewSuffix");
  const sumAddBtn=$("#sumAdd"), sumSaveBtn=$("#sumSave"), sumDefaultBtn=$("#sumDefault"), sumCloseBtn=$("#closeSum");
  const exportBtn=$("#exportSettings"), importInput=$("#importSettings"), dailySummaryEl=$("#dailySummary");

  // ---- Storage ----
  const LS_KEY="PHANTOM_REPORT_STATE_V4";
  const THEME_KEY="PHANTOM_THEME";
  const DEF_SUM=[
    {id:uid(),label:"โทรรวม",suffix:"",sources:[]},
    {id:uid(),label:"ติดต่อได้",suffix:"",sources:[]},
    {id:uid(),label:"อัปเดท",suffix:"ห้อง",sources:[]},
  ];

  // ---- State ----
  let state=loadState()||defaultState();

  // focus order (flat)
  let focusOrder=[];  // [{id, path:[...], level:0|1|2}]
  let focusIndex=0;   // pointer in focusOrder

  // ---- Theme ----
  initTheme();

  // ---- Init ----
  initUI();
  render();
  restoreFocus();

  // ================= Core UI =================

  function initTheme(){
    const t=localStorage.getItem(THEME_KEY)||"dark";
    document.documentElement.setAttribute("data-theme",t);
    themeToggleBtn?.addEventListener("click",toggleTheme);
    document.addEventListener("keydown",(e)=>{
      if(e.ctrlKey && (e.key==='l'||e.key==='L')){e.preventDefault();toggleTheme();}
    });
  }
  function toggleTheme(){
    const cur=document.documentElement.getAttribute("data-theme")||"dark";
    const next=cur==="dark"?"light":"dark";
    document.documentElement.setAttribute("data-theme",next);
    localStorage.setItem(THEME_KEY,next);
    tip(next==="dark"?"Dark Mode":"Light Mode",true);
  }

  function initUI(){
    // date
    if(!state.reportDate){
      const d=new Date(); dateEl.valueAsDate=d; state.reportDate=toISO(d);
    }else{
      const [y,m,d]=state.reportDate.split("-").map(Number);
      dateEl.valueAsDate=new Date(y,m-1,d);
    }
    userNameEl.value=state.userName||"";

    userNameEl.addEventListener("input",()=>{state.userName=userNameEl.value.trim();saveState();});
    dateEl.addEventListener("change",()=>{state.reportDate=dateEl.value||toISO(new Date());saveState();});

    copyBtn.addEventListener("click",()=>{const t=buildReport();copy(t).then(()=>tip("คัดลอก Report แล้ว",true));});

    addMainBtn.addEventListener("click",()=>{
      const t=newMainTitleEl.value.trim(); if(!t) return tip("กรอกชื่อหมวดหลักก่อน");
      addMain(t); newMainTitleEl.value="";
    });

    resetCountsBtn.addEventListener("click",()=>{
      if(!confirm("รีเซ็ตค่าประจำวัน (ล้างตัวเลข/ข้อความ แต่คงโครงสร้าง) ?")) return;
      resetCountsOnly(); tip("รีเซ็ตค่าประจำวันแล้ว",true);
    });
    resetAllBtn.addEventListener("click",()=>{
      if(!confirm("ล้างทุกอย่าง (รวมโครงสร้าง & กฎ SUM) ?")) return;
      state=defaultState(); saveState(); render(); tip("ล้างทั้งหมดแล้ว",true);
    });

    // SUM
    manageSumBtn.addEventListener("click",openSumModal);
    sumCloseBtn.addEventListener("click",()=>sumModal.close());
    sumAddBtn.addEventListener("click",()=>{
      const label=sumNewLabelEl.value.trim(); if(!label) return tip("กรอกชื่อรายการสรุปก่อน");
      state.sumRules.push({id:uid(),label,suffix:(sumNewSuffixEl.value||"").trim(),sources:[]});
      sumNewLabelEl.value=""; sumNewSuffixEl.value=""; renderSumList(); saveState();
    });
    sumSaveBtn.addEventListener("click",()=>{saveState();sumModal.close();tip("บันทึก SUM Rules แล้ว",true);});
    sumDefaultBtn.addEventListener("click",()=>{
      if(!confirm("รีเซ็ตกฎรวมผลเป็นค่าเริ่มต้น ?")) return;
      state.sumRules=DEF_SUM.map(x=>({...x})); renderSumList(); saveState(); tip("รีเซ็ต SUM Rules เรียบร้อย",true);
    });

    // Export / Import
    exportBtn.addEventListener("click",()=>{
      const payload=JSON.stringify(state,null,2);
      const blob=new Blob([payload],{type:"text/plain;charset=utf-8"});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob); a.download="PHANToM_Report_Counter_Settings.txt"; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),500); tip("Export เรียบร้อย",true);
    });
    importInput.addEventListener("change",(e)=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=(ev)=>{
        try{
          const obj=JSON.parse(String(ev.target.result||"{}"));
          if(!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.sumRules)) throw new Error("invalid");
          state=obj; saveState(); render(); restoreFocus(); tip("Import การตั้งค่าแล้ว",true);
        }catch(err){ tip("ไฟล์ .txt ไม่ถูกต้อง"); }
      };
      r.readAsText(f); importInput.value="";
    });

    // Keyboard navigation (global on tree)
    treeEl.addEventListener("keydown",onKey);
    treeEl.addEventListener("click",()=>treeEl.focus());
  }

  // ================= Render =================

  function render(){
    treeEl.innerHTML="";
    state.categories.forEach((main,mi)=> treeEl.appendChild(renderMain(main,mi)));
    updateDailySummary();
    buildFocusOrder();
    highlightFocus();
    saveState();
  }

  function renderMain(main, mi){
    const node=el("div","node main"); node.dataset.id=main.id; node.tabIndex=-1;

    // header
    const title=el("div","title",main.title); title.title="ดับเบิลคลิกเพื่อแก้ชื่อ";
    title.ondblclick=()=>inlineRename(title,main,"title");

    const typeSel=el("select");
    typeSel.innerHTML=`<option value="count">Count</option><option value="text">Text</option>`;
    typeSel.value=main.type||"count";
    typeSel.addEventListener("change",()=>{main.type=typeSel.value; saveState(); render();});

    const countWrap=el("div","countWrap");
    let bodyArea=null;
    if((main.type||"count")==="count"){
      const c=el("div","count",String(calcOwn(main)));
      c.title="คลิกเพื่อพิมพ์ค่าโดยตรง";
      c.addEventListener("click",()=>inlineNumberEdit(c,main,"count"));
      const btnMinus=miniBtn("−",()=>inc(main,-1));
      const btnPlus =miniBtn("+",()=>inc(main,+1));
      countWrap.append(btnMinus,c,btnPlus);
    }else{
      bodyArea=el("textarea","textbox");
      bodyArea.placeholder="พิมพ์ข้อความ (1 บรรทัด = 1 นับ)";
      bodyArea.value=(main.lines||[]).join("\n");
      bodyArea.addEventListener("keydown",(e)=>{ e.stopPropagation(); }); // ไม่ให้คีย์ลัดแทรก
      bodyArea.addEventListener("input",()=>{
        main.lines=bodyArea.value.split("\n").map(s=>s.trim()).filter(Boolean);
        saveState(); render();
      });
    }

    const asCall=el("label","toggle"); const chk=el("input"); chk.type="checkbox"; chk.checked=!!main.useAsCall;
    chk.addEventListener("change",()=>{main.useAsCall=chk.checked;saveState();});
    asCall.append(chk,el("span",null,"นับเป็นโทรรวม"));

    const ops=el("div","ops");
    ops.append(
      ghostBtn("↑",()=>moveMain(mi,-1)),
      ghostBtn("↓",()=>moveMain(mi,+1)),
      ghostBtn("✎",()=>rename(main)),
      dangerBtn("ลบ",()=>delMain(mi))
    );

    const headRow=el("div","header");
    const left=el("div"); left.append(title);
    const center=el("div"); center.append(typeSel,asCall);
    const right=el("div"); right.append(countWrap,ops);
    headRow.append(left,center,right);

    const wrap=el("div");
    wrap.append(headRow);

    // add sub controls
    const addRow=el("div","row");
    const subName=el("input"); subName.placeholder="เพิ่มหมวดย่อย (เช่น ว่าง / ขายแล้ว / หมายเหตุ)";
    const subType=el("select"); subType.innerHTML=`<option value="count">Count</option><option value="text">Text</option>`;
    const addBtn=el("button","btn","เพิ่มย่อย");
    addBtn.addEventListener("click",()=>{
      const t=subName.value.trim(); if(!t) return tip("กรอกชื่อหมวดย่อยก่อน");
      addSub(main,t,subType.value); subName.value="";
    });
    wrap.append(addRow); addRow.append(subName,subType,addBtn);

    if(bodyArea){ const group=el("div","group"); group.append(bodyArea); wrap.append(group); }

    // children in a grid (left→right)
    const kids=(main.children||[]);
    if(kids.length){
      const chWrap=el("div","children");
      const grid=el("div","sub-grid");
      kids.forEach((child,idx)=> grid.append(renderSub(main,child,[mi,idx])));
      chWrap.append(grid); wrap.append(chWrap);
    }

    node.append(wrap);

    node.addEventListener("click",(e)=>{ e.stopPropagation(); focusIndex=findIndexById(main.id); highlightFocus(); });
    return node;
  }

  function renderSub(parent, nodeData, path){
    const card=el("div","sub-card node"); card.dataset.id=nodeData.id; card.tabIndex=-1;

    const title=el("div","title",nodeData.title); title.title="ดับเบิลคลิกเพื่อแก้ชื่อ";
    title.ondblclick=()=>inlineRename(title,nodeData,"title");
    const badge=el("span","mtype",nodeData.type==="text"?"Text":"Count");

    const countWrap=el("div","countWrap"); let extra=null;
    if(nodeData.type==="count"){
      const c=el("div","count",String(calcOwn(nodeData)));
      c.title="คลิกเพื่อพิมพ์ค่าโดยตรง";
      c.addEventListener("click",()=>inlineNumberEdit(c,nodeData,"count"));
      const btnMinus=miniBtn("−",()=>inc(nodeData,-1));
      const btnPlus =miniBtn("+",()=>inc(nodeData,+1));
      countWrap.append(btnMinus,c,btnPlus);
    }else{
      const ta=el("textarea","textbox");
      ta.placeholder="พิมพ์แยกบรรทัด (1 บรรทัด = 1 นับ)";
      ta.value=(nodeData.lines||[]).join("\n");
      ta.addEventListener("keydown",(e)=>{ e.stopPropagation(); }); // ป้องกันคีย์ลัด
      ta.addEventListener("input",()=>{
        nodeData.lines=ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
        saveState(); render();
      });
      extra=ta;
    }

    const ops=el("div","ops");
    ops.append(
      ghostBtn("↑",()=>moveChild(parent,path,-1)),
      ghostBtn("↓",()=>moveChild(parent,path,+1)),
      ghostBtn("✎",()=>rename(nodeData)),
      dangerBtn("ลบ",()=>delNode(parent,path))
    );

    const header=el("div","sub-header");
    const left=el("div"); left.append(title);
    const center=el("div"); center.append(badge);
    const right=el("div"); right.append(countWrap,ops);
    header.append(left,center,right);

    const group=el("div","group");
    // add sub-sub
    const addRow=el("div","row");
    const subName=el("input"); subName.placeholder="เพิ่มย่อยในย่อย";
    const subType=el("select"); subType.innerHTML=`<option value="count">Count</option><option value="text">Text</option>`;
    const addBtn=el("button","btn","เพิ่ม");
    addBtn.addEventListener("click",()=>{
      const t=subName.value.trim(); if(!t) return tip("กรอกชื่อก่อน");
      addChild(nodeData,t,subType.value); subName.value="";
    });
    group.append(addRow); addRow.append(subName,subType,addBtn);

    if(extra) group.append(extra);

    // sub children (render vertical under card)
    const kids=(nodeData.children||[]);
    if(kids.length){
      const subWrap=el("div","children");
      kids.forEach((g,i)=> subWrap.append(renderSub(nodeData,g,[...path,i])));
      group.append(subWrap);
    }

    card.append(header,group);

    card.addEventListener("click",(e)=>{ e.stopPropagation(); focusIndex=findIndexById(nodeData.id); highlightFocus(); });
    return card;
  }

  function updateDailySummary(){
    const sums=computeSums();
    const top=sums.slice(0,3).map(s=>`${s.label} ${s.value}${s.suffix?` ${s.suffix}`:''}`);
    dailySummaryEl.textContent=top.length?top.join(" | ") :"—";
  }

  // ================= Focus & Keyboard =================

  function buildFocusOrder(){
    focusOrder=[];
    state.categories.forEach((m,mi)=>{
      focusOrder.push({id:m.id,path:[mi],level:0});
      (m.children||[]).forEach((s,si)=>{
        focusOrder.push({id:s.id,path:[mi,si],level:1});
        (s.children||[]).forEach((t,ti)=>{
          focusOrder.push({id:t.id,path:[mi,si,ti],level:2});
        });
      });
    });
    // clamp index
    if(focusOrder.length===0){ focusIndex=0; return; }
    if(focusIndex>=focusOrder.length) focusIndex=focusOrder.length-1;
  }
  function findIndexById(id){ return Math.max(0, focusOrder.findIndex(x=>x.id===id)); }

  function highlightFocus(){
    $$(".node").forEach(n=>n.classList.remove("selected"));
    if(!focusOrder.length) return;
    const id=focusOrder[focusIndex].id;
    const nd=$(`.node[data-id="${css(id)}"]`);
    if(nd){ nd.classList.add("selected"); nd.focus({preventScroll:false}); }
  }

  function restoreFocus(){
    // default focus to first main if any
    buildFocusOrder();
    if(focusOrder.length) focusIndex=0;
    highlightFocus();
  }

  function onKey(e){
    // ignore when actively typing in inputs/textarea/number
    const tag=(e.target.tagName||"").toLowerCase();
    const typing = tag==="textarea" || (tag==="input" && e.target.type!=="button");
    if(typing) return;

    if(!focusOrder.length) return;

    const cur=focusOrder[focusIndex];

    // plus/minus for count nodes
    if(e.key==='+' || e.key==='=' ){ e.preventDefault(); step(+1); return; }
    if(e.key==='-' || e.key==='_'){ e.preventDefault(); step(-1); return; }

    // arrows navigation
    if(e.key==='ArrowDown'){ e.preventDefault(); moveVertical(+1); return; }
    if(e.key==='ArrowUp'){ e.preventDefault(); moveVertical(-1); return; }
    if(e.key==='ArrowRight'){ e.preventDefault(); moveHorizontal(+1); return; }
    if(e.key==='ArrowLeft'){ e.preventDefault(); moveHorizontal(-1); return; }

    // copy/save shortcuts
    if(e.ctrlKey && (e.key==='c'||e.key==='C')){ e.preventDefault(); const t=buildReport(); copy(t).then(()=>tip("คัดลอก Report แล้ว",true)); }
    if(e.ctrlKey && (e.key==='s'||e.key==='S')){ e.preventDefault(); saveState(); tip("บันทึกแล้ว",true); }

    function step(d){
      const node=getNodeByPath(cur.path);
      if(node && (node.type||"count")==="count"){ node.count=Math.max(0,(node.count||0)+d); saveState(); render(); focusIndex=findIndexById(cur.id); highlightFocus(); }
    }
  }

  function moveVertical(dir){
    // simply to next/prev in flat order
    if(!focusOrder.length) return;
    const ni = Math.min(Math.max(focusIndex+dir,0), focusOrder.length-1);
    focusIndex=ni; highlightFocus();
  }

  function moveHorizontal(dir){
    if(!focusOrder.length) return;
    const cur=focusOrder[focusIndex];
    // find siblings at same level and same parent
    const siblings = focusOrder.filter(x=>{
      if(x.level!==cur.level) return false;
      if(cur.level===0) return true; // mains are siblings globally
      // share parent path
      const p1=cur.path.slice(0,-1).join("-");
      const p2=x.path.slice(0,-1).join("-");
      return p1===p2;
    });
    const idxInSib = siblings.findIndex(x=>x.id===cur.id);
    const next = Math.min(Math.max(idxInSib+dir,0), siblings.length-1);
    const target = siblings[next];
    focusIndex = findIndexById(target.id);
    highlightFocus();
  }

  // ================= Data Ops =================

  function defaultState(){
    return { userName:"", reportDate:toISO(new Date()), categories:[], sumRules:DEF_SUM.map(x=>({...x})) };
  }
  function addMain(title){
    state.categories.push({ id:uid(), title, type:"count", count:0, lines:[], useAsCall:false, children:[] });
    saveState(); render();
  }
  function addSub(parent, title, type){
    parent.children=parent.children||[];
    parent.children.push({ id:uid(), title, type:type==="text"?"text":"count", count:0, lines:[], children:[] });
    saveState(); render();
  }
  function addChild(parentNode, title, type){
    parentNode.children=parentNode.children||[];
    parentNode.children.push({ id:uid(), title, type:type==="text"?"text":"count", count:0, lines:[], children:[] });
    saveState(); render();
  }
  function rename(node){
    const nv=prompt("แก้ไขชื่อ:", node.title); if(!nv) return;
    node.title=nv.trim(); saveState(); render();
  }
  function delMain(mi){
    if(!confirm(`ลบหมวดหลัก "${state.categories[mi].title}" ?`)) return;
    const removed=state.categories.splice(mi,1)[0];
    state.sumRules.forEach(rule=>{ rule.sources=(rule.sources||[]).filter(id=>id!==removed.id); });
    saveState(); render();
  }
  function delNode(parent, path){
    const idx=path[path.length-1];
    const removed=parent.children.splice(idx,1)[0];
    state.sumRules.forEach(rule=>{ rule.sources=(rule.sources||[]).filter(id=>id!==removed.id); });
    saveState(); render();
  }
  function moveMain(mi,dir){
    const ni=mi+dir; if(ni<0||ni>=state.categories.length) return;
    const x=state.categories.splice(mi,1)[0]; state.categories.splice(ni,0,x);
    saveState(); render();
  }
  function moveChild(parent, path, dir){
    const idx=path[path.length-1]; const ni=idx+dir;
    if(ni<0 || ni>=parent.children.length) return;
    const x=parent.children.splice(idx,1)[0]; parent.children.splice(ni,0,x);
    saveState(); render();
  }
  function inc(node,delta){ node.count=Math.max(0,(node.count||0)+delta); pulse(node.id); saveState(); render(); }
  function calcOwn(node){ return node.type==="count" ? (node.count||0) : (node.lines?.length||0); }
  function calcCount(node){ let base=calcOwn(node); (node.children||[]).forEach(ch=> base+=calcCount(ch)); return base; }

  // ================= Inline Editors =================
  function inlineRename(elm,node,key){
    const inp=document.createElement("input"); inp.type="text"; inp.value=node[key]||""; inp.style.minWidth="160px";
    elm.replaceWith(inp); inp.focus(); inp.select();
    const commit=()=>{ node[key]=inp.value.trim()||node[key]; saveState(); render(); };
    inp.addEventListener("keydown",e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") render(); });
    inp.addEventListener("blur",commit);
  }
  function inlineNumberEdit(countElm,node,key){
    const box=document.createElement("input"); box.type="number"; box.value=String(node[key]||0); box.min="0";
    countElm.innerHTML=""; countElm.appendChild(box); box.focus(); box.select();
    box.addEventListener("keydown",(e)=>{ e.stopPropagation(); });
    const commit=()=>{ const n=Math.max(0,parseInt(box.value||"0",10)); node[key]=n; saveState(); render(); };
    box.addEventListener("keydown",e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") render(); });
    box.addEventListener("blur",commit);
  }

  // ================= SUM =================
  function openSumModal(){ renderSumList(); sumModal.showModal(); }
  function renderSumList(){
    sumListEl.innerHTML="";
    const mains=state.categories;
    state.sumRules.forEach(rule=>{
      const item=el("div","sum-item");
      const labelInp=el("input"); labelInp.type="text"; labelInp.value=rule.label||""; labelInp.placeholder="ชื่อสรุป";
      labelInp.addEventListener("input",()=>{rule.label=labelInp.value.trim();saveState();});
      const suffixInp=el("input"); suffixInp.type="text"; suffixInp.value=rule.suffix||""; suffixInp.placeholder="หน่วย เช่น ห้อง";
      suffixInp.addEventListener("input",()=>{rule.suffix=suffixInp.value.trim();saveState();});
      const delBtn=dangerBtn("ลบ",()=>{
        if(!confirm(`ลบรายการสรุป "${rule.label||''}" ?`)) return;
        state.sumRules=state.sumRules.filter(r=>r.id!==rule.id); renderSumList(); saveState();
      });
      const topRow=el("div","sum-row"); topRow.append(labelInp,suffixInp,delBtn);

      const sourcesWrap=el("div","sum-sources"); sourcesWrap.append(el("div",null,"รวมจากหัวข้อ:"));
      mains.forEach(m=>{
        const tag=el("label","sum-tag");
        const chk=el("input"); chk.type="checkbox"; chk.checked=(rule.sources||[]).includes(m.id);
        chk.addEventListener("change",()=>{
          rule.sources=rule.sources||[];
          if(chk.checked){ if(!rule.sources.includes(m.id)) rule.sources.push(m.id); }
          else{ rule.sources=rule.sources.filter(x=>x!==m.id); }
          saveState();
        });
        tag.prepend(chk); tag.append(el("span",null," "+m.title)); sourcesWrap.append(tag);
      });

      item.append(topRow,sourcesWrap); sumListEl.append(item);
    });
  }

  function computeSums(){
    const results = state.sumRules.map(r=>({label:r.label||"",suffix:r.suffix||"",value:0}));
    state.sumRules.forEach((rule,ri)=>{
      (rule.sources||[]).forEach(id=>{
        const m=state.categories.find(x=>x.id===id); if(!m) return;
        let add=calcCount(m);
        if(m.useAsCall){ add = calcOwn(m) + (m.children||[]).reduce((s,c)=> s+calcCount(c),0); }
        results[ri].value += add;
      });
    });
    return results;
  }

  // ================= Report =================
  function buildReport(){
    const name=(state.userName||"PHANToM").trim();
    const d = dateEl.value ? new Date(dateEl.value) : new Date();
    const header=`${name} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;

    const lines=[header,""];
    state.categories.forEach(main=>{
      const total=calcCount(main);
      lines.push(`//${main.title}${total>0?` ${total}`:""}`);
      appendLines(lines,main);
      if(main.type==="text" && (main.lines||[]).length){ main.lines.forEach(t=>lines.push(t)); }
      lines.push("");
    });

    lines.push("//////////SUM//////////");
    computeSums().forEach(s=>{
      const suffix=s.suffix?` ${s.suffix}`:"";
      lines.push(`${s.label} ${s.value}${suffix}`);
    });

    return lines.join("\n");
  }
  function appendLines(lines,node){
    (node.children||[]).forEach(ch=>{
      const cnt=calcCount(ch);
      lines.push(`${ch.title} ${cnt}`);
      if(ch.type==="text" && (ch.lines||[]).length){ ch.lines.forEach(t=>lines.push(t)); }
      if((ch.children||[]).length){ appendLines(lines,ch); }
    });
  }

  // ================= Helpers =================
  function tip(t,ok=false){ if(!toastEl) return; toastEl.textContent=t; toastEl.style.background=ok?"#153a1f":"#0d1b36"; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1400); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function toISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function el(tag,cls,txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function miniBtn(txt,fn){ const b=document.createElement("button"); b.className="btn ghost"; b.textContent=txt; b.style.padding="4px 8px"; b.addEventListener("click",fn); return b; }
  function ghostBtn(txt,fn){ const b=document.createElement("button"); b.className="btn ghost"; b.textContent=txt; b.addEventListener("click",fn); return b; }
  function dangerBtn(txt,fn){ const b=document.createElement("button"); b.className="btn danger"; b.textContent=txt; b.addEventListener("click",fn); return b; }
  function css(s){ return String(s).replace(/"/g,'\\"'); }
  function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function loadState(){ try{ const raw=localStorage.getItem(LS_KEY); return raw?JSON.parse(raw):null; }catch(e){ return null; } }
  function copy(t){ return navigator.clipboard?.writeText(t) || Promise.reject(); }
  function pulse(id){ /* เผื่ออนาคตทำแอนิเมชันเพิ่ม */ }
  function resetCountsOnly(){
    state.categories.forEach(m=>{
      m.count=0; m.lines=[]; (m.children||[]).forEach(walkReset);
    });
    function walkReset(n){ n.count=0; n.lines=[]; (n.children||[]).forEach(walkReset); }
    saveState(); render();
  }
  function getNodeByPath(path){
    if(!path || !path.length) return null;
    let cur=null;
    for(let i=0;i<path.length;i++){
      if(i===0){ cur=state.categories[path[0]]; }
      else{ cur=cur?.children?.[path[i]]; }
    }
    return cur||null;
  }
})();
