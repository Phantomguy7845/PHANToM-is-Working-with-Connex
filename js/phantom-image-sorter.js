/* PHANToM Image Sorter — Aurora Quiet Edition (Heuristic + Offline AI + Custom) */
(function(){
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const drop=$("#drop"), picker=$("#picker"), grid=$("#grid"), toast=$("#toast");
  const aiStatus=$("#aiStatus"), customStatus=$("#customStatus");
  const btnHeu=$("#autoHeu"), btnAI=$("#autoAI"), btnCustom=$("#autoCustom");
  const btnClear=$("#clear"), btnExport=$("#exportZip"), qualityEl=$("#quality");

  if(!drop || !grid){ console.warn("Missing essential DOM. Abort init."); return; }

  let images=[]; // {src, name, label?, conf?, cover?}
  let offline=null;      // ml5 imageClassifier (MobileNet)
  let custom=null;       // ml5 custom model
  let customReady=false; let offlineReady=false;

  const toastMsg=(t,ok=false)=>{ if(!toast) return; toast.textContent=t; toast.style.background=ok?"#153a1f":"#0d1b36"; toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"),1500); };

  // ---- Upload ----
  drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("drag");});
  drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));
  drop.addEventListener("click",()=> picker && picker.click());
  drop.addEventListener("drop",e=>{
    e.preventDefault(); drop.classList.remove("drag"); handleFiles(e.dataTransfer.files);
  });
  picker && picker.addEventListener("change",e=> handleFiles(e.target.files));

  function handleFiles(fs){
    const arr=Array.from(fs||[]).filter(f=>f.type.startsWith("image/"));
    if(!arr.length){ toastMsg("ไม่มีไฟล์ภาพ"); return; }
    arr.forEach(f=>{
      const r=new FileReader();
      r.onload=ev=>{ images.push({src:ev.target.result, name:f.name}); render(); };
      r.readAsDataURL(f);
    });
    toastMsg(`เพิ่มรูป ${arr.length} ไฟล์`, true);
  }

  // ---- Render Grid ----
  function render(){
    grid.innerHTML="";
    images.forEach((x,i)=>{
      const item=document.createElement("div"); item.className="item"; item.draggable=true;
      const im=document.createElement("img"); im.src=x.src; im.className="thumb";
      const cover=document.createElement("button"); cover.className="cover"+(x.cover?" active":""); cover.textContent="Cover";
      cover.onclick=()=>{ x.cover=!x.cover; cover.classList.toggle("active",x.cover); };
      const bar=document.createElement("div"); bar.className="bar";
      const idx=document.createElement("div"); idx.textContent=(i+1);
      const tag=document.createElement("div"); tag.textContent= x.label ? `${x.label}${x.conf?` (${Math.round(x.conf*100)}%)`:''}` : "";
      bar.append(idx,tag);

      // drag reorder
      item.addEventListener("dragstart", e=> e.dataTransfer.setData("text/plain", i));
      item.addEventListener("dragover", e=> e.preventDefault());
      item.addEventListener("drop", e=>{
        e.preventDefault();
        const from=+e.dataTransfer.getData("text/plain"), to=i;
        const mv=images.splice(from,1)[0]; images.splice(to,0,mv); render();
      });

      item.append(im,cover,bar); grid.appendChild(item);
    });
  }

  // ---- Heuristic Sort ----
  btnHeu && btnHeu.addEventListener("click", ()=>{
    if(!images.length) return toastMsg("ยังไม่มีภาพ");
    images.sort((a,b)=> (a.name||"").localeCompare(b.name||"", undefined, {numeric:true}));
    render(); toastMsg("เรียงตามชื่อไฟล์แล้ว", true);
  });

  // ---- Offline AI (MobileNet) ----
  async function ensureOffline(){
    if(offline || offlineReady) return true;
    try{
      aiStatus && (aiStatus.textContent="Offline AI: กำลังโหลด…");
      offline = await ml5.imageClassifier("MobileNet", ()=>{
        offlineReady=true; aiStatus && (aiStatus.textContent="Offline AI: พร้อมใช้งาน");
        toastMsg("Offline AI พร้อม", true);
      });
      return true;
    }catch(e){
      console.error("Offline AI load error", e);
      aiStatus && (aiStatus.textContent="Offline AI: โหลดไม่สำเร็จ");
      toastMsg("โหลด Offline AI ไม่สำเร็จ");
      return false;
    }
  }

  btnAI && btnAI.addEventListener("click", async ()=>{
    if(!images.length) return toastMsg("ยังไม่มีภาพ");
    const ok = await ensureOffline(); if(!ok) return;
    for(let i=0;i<images.length;i++){
      try{
        const img=await dataToImg(images[i].src);
        const res=await offline.classify(img);
        const r=res && res[0] ? res[0] : {label:"other", confidence:0};
        const mapped= mapMobileNet(r.label);
        images[i].label=mapped; images[i].conf=r.confidence||0;
      }catch(e){ images[i].label = images[i].label || "other"; }
    }
    // simple group by label (living… → facility → exterior → other)
    const order=["living","dining","kitchen","corridor","bedroom","bathroom","balcony","facility","exterior","other"];
    images.sort((a,b)=> (order.indexOf(a.label ?? "other")) - (order.indexOf(b.label ?? "other")));
    render(); toastMsg("AI Sort (Offline) สำเร็จ", true);
  });

  // ---- Custom Model (load from files selected by user) ----
  btnCustom && btnCustom.addEventListener("click", async ()=>{
    if(!customReady){
      const pickJson = await pickFile(".json"); if(!pickJson) return;
      const pickBin  = await pickFile(".bin");  if(!pickBin)  return;
      try{
        const fx = await ml5.featureExtractor('MobileNet');
        custom = fx.classification();
        const jURL=URL.createObjectURL(pickJson), bURL=URL.createObjectURL(pickBin);
        await custom.load({model:jURL, metadata:jURL, weights:bURL});
        customReady=true; customStatus && (customStatus.textContent="Custom Model: พร้อมใช้งาน");
        toastMsg("โหลด Custom Model สำเร็จ", true);
      }catch(e){ console.error(e); toastMsg("โหลดโมเดลไม่สำเร็จ"); return; }
    }
    if(!images.length) return toastMsg("ยังไม่มีภาพ");
    for(let i=0;i<images.length;i++){
      const img=await dataToImg(images[i].src);
      const r = await new Promise(res=> custom.classify(img,(err,out)=> res(err?{label:"other",confidence:0}:(out&&out[0])||{label:"other",confidence:0})));
      images[i].label=r.label||"other"; images[i].conf=r.confidence||0;
    }
    const order=["living","dining","kitchen","corridor","bedroom","bathroom","balcony","facility","exterior","other"];
    images.sort((a,b)=> (order.indexOf(a.label ?? "other")) - (order.indexOf(b.label ?? "other")));
    render(); toastMsg("AI Sort (Custom) สำเร็จ", true);
  });

  // ---- Export ZIP ----
  btnExport && btnExport.addEventListener("click", async ()=>{
    if(!images.length) return toastMsg("ไม่มีภาพสำหรับส่งออก");
    const q=Math.max(0.6,Math.min(0.95,parseFloat(qualityEl?.value)||0.9));
    // covers first
    const covers=images.filter(x=>x.cover), rest=images.filter(x=>!x.cover);
    const list=[...covers,...rest];
    const zip=new JSZip();
    for(let i=0;i<list.length;i++){
      const blob=await dataToJpgBlob(list[i].src,q);
      zip.file(`${i+1}.jpg`, blob);
    }
    const out=await zip.generateAsync({type:"blob"});
    saveAs(out,"PHANToM_Sorted.zip");
    toastMsg("ส่งออก ZIP เรียบร้อย", true);
  });

  // ---- Clear ----
  btnClear && btnClear.addEventListener("click", ()=>{ images=[]; render(); toastMsg("ล้างทั้งหมด", true); });

  // ---- helpers ----
  function mapMobileNet(raw=""){
    const s=raw.toLowerCase();
    if(/sofa|couch|tv|lamp/.test(s)) return "living";
    if(/dining|table/.test(s)) return "dining";
    if(/kitchen|microwave|refrigerator|oven|stove|range/.test(s)) return "kitchen";
    if(/bed|pillow|wardrobe/.test(s)) return "bedroom";
    if(/bath|toilet|shower|bathtub|sink/.test(s)) return "bathroom";
    if(/balcony|terrace|veranda|view/.test(s)) return "balcony";
    if(/corridor|hall/.test(s)) return "corridor";
    if(/pool|gym|sauna|lobby/.test(s)) return "facility";
    if(/exterior|outside|building|facade/.test(s)) return "exterior";
    return "other";
  }
  function dataToImg(data){ return new Promise(r=>{ const im=new Image(); im.src=data; im.onload=()=>r(im); }); }
  async function dataToJpgBlob(data,q){
    const im=await dataToImg(data); const c=document.createElement("canvas");
    c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext("2d").drawImage(im,0,0);
    return await new Promise(res=> c.toBlob(res,"image/jpeg",q));
  }
  function pickFile(accept){
    return new Promise(res=>{
      const inp=document.createElement("input"); inp.type="file"; inp.accept=accept;
      inp.onchange=e=> res(e.target.files[0]||null); inp.click();
    });
  }
})();
