/* PHANToM Report Counter — Aurora Dark+Light 2025
   Fixed Text Mode Focus + Multi-line Input
*/

(function(){
  const $=(s,ctx=document)=>ctx.querySelector(s);
  const $$=(s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const treeEl=$("#tree"),toastEl=$("#toast");
  const userNameEl=$("#userName"),dateEl=$("#reportDate");
  const addMainBtn=$("#addMain"),newMainTitleEl=$("#newMainTitle");
  const copyBtn=$("#copyReport"),resetCountsBtn=$("#resetCounts"),resetAllBtn=$("#resetAll");
  const manageSumBtn=$("#manageSum"),sumModal=$("#sumModal"),sumListEl=$("#sumList");
  const sumNewLabelEl=$("#sumNewLabel"),sumNewSuffixEl=$("#sumNewSuffix");
  const sumAddBtn=$("#sumAdd"),sumSaveBtn=$("#sumSave"),sumDefaultBtn=$("#sumDefault"),sumCloseBtn=$("#closeSum");
  const exportBtn=$("#exportSettings"),importInput=$("#importSettings"),dailySummaryEl=$("#dailySummary");

  const LS_KEY="PHANTOM_REPORT_STATE_V4";
  const DEF_SUM=[{id:uid(),label:"โทรรวม",suffix:"",sources:[]},{id:uid(),label:"ติดต่อได้",suffix:"",sources:[]},{id:uid(),label:"อัปเดท",suffix:"ห้อง",sources:[]}];

  let state=loadState()||defaultState();
  render();

  // --- Render Tree ---
  function render(){
    treeEl.innerHTML="";
    state.categories.forEach((main,mi)=> treeEl.appendChild(renderMain(main,mi)));
    saveState();
  }

  function renderMain(main,mi){
    const node=el("div","node main");
    const title=el("div","title",main.title);
    const typeSel=el("select");
    typeSel.innerHTML=`<option value="count">Count</option><option value="text">Text</option>`;
    typeSel.value=main.type||"count";
    typeSel.addEventListener("change",()=>{main.type=typeSel.value;saveState();render();});

    const countWrap=el("div","countWrap");
    if(main.type==="count"){
      const c=el("div","count",String(main.count||0));
      c.addEventListener("click",()=>inlineNumberEdit(c,main,"count"));
      const minus=miniBtn("−",()=>inc(main,-1));
      const plus=miniBtn("+",()=>inc(main,+1));
      countWrap.append(minus,c,plus);
    }else{
      const ta=el("textarea","textbox");
      ta.placeholder="พิมพ์ข้อความ (1 บรรทัด = 1 นับ)";
      ta.value=(main.lines||[]).join("\n");

      // 🔧 แก้ปัญหาหลุดโฟกัส + debounce save
      ta.addEventListener("keydown",e=>{
        e.stopPropagation(); // block shortcut
      });
      let debounceTimer=null;
      ta.addEventListener("input",()=>{
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(()=>{
          main.lines=ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
          saveState();
          updateDailySummary();
        },500);
      });
      countWrap.append(ta);
    }

    const asCall=el("label","toggle");
    const chk=el("input");chk.type="checkbox";chk.checked=!!main.useAsCall;
    chk.addEventListener("change",()=>{main.useAsCall=chk.checked;saveState();});
    asCall.append(chk,el("span",null,"นับเป็นโทรรวม"));

    const head=el("div","header");
    head.append(title,typeSel,countWrap,asCall);

    const addRow=el("div","row");
    const subName=el("input");subName.placeholder="เพิ่มหมวดย่อย";
    const subType=el("select");subType.innerHTML=`<option value="count">Count</option><option value="text">Text</option>`;
    const addBtn=el("button","btn","เพิ่ม");
    addBtn.addEventListener("click",()=>{
      const t=subName.value.trim();if(!t)return tip("กรอกชื่อหมวดย่อยก่อน");
      addSub(main,t,subType.value);subName.value="";
    });
    addRow.append(subName,subType,addBtn);

    const wrap=el("div","wrap");wrap.append(head,addRow);
    (main.children||[]).forEach((ch,i)=>wrap.append(renderSub(main,ch,[mi,i])));
    node.append(wrap);
    return node;
  }

  function renderSub(parent,nodeData,path){
    const node=el("div","node sub");
    const title=el("div","title",nodeData.title);
    const badge=el("span","mtype",nodeData.type==="text"?"Text":"Count");
    const countWrap=el("div","countWrap");

    if(nodeData.type==="count"){
      const c=el("div","count",String(nodeData.count||0));
      c.addEventListener("click",()=>inlineNumberEdit(c,nodeData,"count"));
      const minus=miniBtn("−",()=>inc(nodeData,-1));
      const plus=miniBtn("+",()=>inc(nodeData,+1));
      countWrap.append(minus,c,plus);
    }else{
      const ta=el("textarea","textbox");
      ta.placeholder="พิมพ์แยกบรรทัด (1 บรรทัด = 1 นับ)";
      ta.value=(nodeData.lines||[]).join("\n");

      // ✅ ป้องกันหลุดโฟกัส
      ta.addEventListener("keydown",e=>{
        e.stopPropagation();
      });
      let debounceTimer=null;
      ta.addEventListener("input",()=>{
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(()=>{
          nodeData.lines=ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
          saveState();
          updateDailySummary();
        },500);
      });
      countWrap.append(ta);
    }

    const header=el("div","sub-header");
    header.append(title,badge,countWrap);
    node.append(header);
    return node;
  }

  // --- helpers ---
  function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e;}
  function miniBtn(t,fn){const b=el("button","mini",t);b.addEventListener("click",fn);return b;}
  function inc(node,d){node.count=Math.max(0,(node.count||0)+d);saveState();render();}
  function inlineNumberEdit(c,node,k){
    const box=document.createElement("input");box.type="number";box.value=node[k]||0;box.min="0";
    c.innerHTML="";c.append(box);box.focus();box.select();
    box.addEventListener("keydown",e=>e.stopPropagation());
    const commit=()=>{node[k]=parseInt(box.value)||0;saveState();render();};
    box.addEventListener("blur",commit);
    box.addEventListener("keydown",e=>{if(e.key==="Enter")commit();if(e.key==="Escape")render();});
  }
  function addSub(p,t,ty){p.children=p.children||[];p.children.push({id:uid(),title:t,type:ty,count:0,lines:[],children:[]});saveState();render();}
  function uid(){return Math.random().toString(36).slice(2);}
  function saveState(){localStorage.setItem(LS_KEY,JSON.stringify(state));}
  function loadState(){try{return JSON.parse(localStorage.getItem(LS_KEY)||"");}catch{return null;}}
  function defaultState(){return{userName:"",reportDate:new Date().toISOString().slice(0,10),categories:[],sumRules:DEF_SUM.map(x=>({...x}))};}
  function tip(t,ok=false){toastEl.textContent=t;toastEl.style.background=ok?"#153a1f":"#0d1b36";toastEl.classList.add("show");setTimeout(()=>toastEl.classList.remove("show"),1200);}
  function updateDailySummary(){if(dailySummaryEl)dailySummaryEl.textContent="บันทึกแล้ว";}
})();
