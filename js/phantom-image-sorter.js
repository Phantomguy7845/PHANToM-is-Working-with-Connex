/* PHANToM Image Sorter v4.0 — Hybrid AI + Custom Model + Adaptive Memory */
console.log("PHANToM Image Sorter v4.0 Loaded");

window.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const dropZone = $("#dropZone"), picker=$("#filePicker"), grid=$("#grid"), toast=$("#toast");
  const modeEl=$("#mode"), qualityEl=$("#quality");
  const aiLocalEl=$("#aiLocal"), aiCustomEl=$("#aiCustom");
  const bar=$("#bar"), progText=$("#progText");
  const btnHeuristic=$("#btnHeuristic"), btnAI=$("#btnAI"), btnAICustom=$("#btnAICustom");
  const btnClear=$("#btnClear"), btnExport=$("#btnExport");
  const btnLoadModel=$("#btnLoadModel"), modelJson=$("#modelJson"), modelBin=$("#modelBin");
  const btnExportPrefs=$("#btnExportPrefs"), btnImportPrefs=$("#btnImportPrefs");

  // State
  let images = []; // {src, name, label?, conf?, cover?}
  let coverIdx = new Set();
  let localModel = null; // ml5.imageClassifier('MobileNet')
  let fe = null, customClassifier = null; // featureExtractor + classification (custom)
  let customReady = false;

  // Preferences: remember user's manual ordering tendencies per label
  const PREF_KEY = "PHAN_PREFER_V40";
  const prefs = loadPrefs();

  // Helpers
  function $(s,ctx=document){ return ctx.querySelector(s); }
  function $$(s,ctx=document){ return Array.from(ctx.querySelectorAll(s)); }
  function toastMsg(msg, ok=false){
    toast.textContent = msg;
    toast.style.background = ok ? "#164e28" : "#0c1830";
    toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"), 1800);
  }
  function setProg(p, text){
    bar.style.width = Math.max(0, Math.min(100, p))+"%";
    if(text) progText.textContent = text;
  }
  function loadPrefs(){
    try{ return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); }catch(e){ return {}; }
  }
  function savePrefs(){ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }

  // UI: Upload
  dropZone.addEventListener("dragover", e=>{ e.preventDefault(); dropZone.classList.add("drag"); });
  dropZone.addEventListener("dragleave", ()=> dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop", e=>{
    e.preventDefault(); dropZone.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  });
  dropZone.addEventListener("click", ()=> picker.click());
  picker.addEventListener("change", e=> handleFiles(e.target.files));

  function handleFiles(files){
    const arr = Array.from(files||[]).filter(f=>f.type.startsWith("image/"));
    if (!arr.length) return toastMsg("ไม่มีไฟล์");
    arr.forEach(f=>{
      const rd=new FileReader();
      rd.onload=e=>{
        images.push({src:e.target.result, name:f.name});
        renderGrid();
      };
      rd.readAsDataURL(f);
    });
    toastMsg(`อัปโหลด ${arr.length} รูปแล้ว`, true);
  }

  // Render
  function renderGrid(){
    grid.innerHTML="";
    images.forEach((img,i)=>{
      const item=document.createElement("div"); item.className="item"; item.draggable=true;

      const im=document.createElement("img"); im.src=img.src; im.className="thumb";

      const cover=document.createElement("div"); cover.className="cover"; cover.textContent="Cover";
      if (coverIdx.has(i)) cover.classList.add("active");
      cover.onclick=()=>{
        if (coverIdx.has(i)) { coverIdx.delete(i); cover.classList.remove("active"); }
        else {
          if (coverIdx.size >= 2) { toastMsg("เลือกปกได้สูงสุด 2 รูป"); return; }
          coverIdx.add(i); cover.classList.add("active");
        }
      };

      const bar=document.createElement("div"); bar.className="bar";
      const idx=document.createElement("div"); idx.className="idx"; idx.textContent = (i+1);
      const tag=document.createElement("div"); tag.className="tag";
      tag.textContent = img.label ? `${img.label} ${img.conf?`(${Math.round(img.conf*100)}%)`:''}` : "";

      bar.appendChild(idx); bar.appendChild(tag);

      // drag reorder
      item.addEventListener("dragstart", e=> e.dataTransfer.setData("text/plain", i));
      item.addEventListener("dragover", e=> e.preventDefault());
      item.addEventListener("drop", e=>{
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain");
        const to = i;
        const mv = images.splice(from,1)[0];
        images.splice(to,0,mv);
        // update preference: we consider the label order chosen by user
        learnFromUserOrder();
        renderGrid();
      });

      item.appendChild(im);
      item.appendChild(cover);
      item.appendChild(bar);
      grid.appendChild(item);
    });
  }

  // Heuristic Sort (filename-based + simple regex)
  function heuristicSort(){
    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    const order = getOrderByMode();
    const mapLabel = (name)=>{
      const n = (name||"").toLowerCase();
      if (/balcony|view|window/.test(n)) return "balcony";
      if (/bath|wc|toilet/.test(n)) return "bathroom";
      if (/bed|bedroom/.test(n)) return "bedroom";
      if (/kitchen|dining|table/.test(n)) return "kitchen";
      if (/living|sofa|tv|couch/.test(n)) return "living";
      if (/corridor|hall|way/.test(n)) return "corridor";
      if (/garage|parking|carport/.test(n)) return "garage";
      if (/stairs|stair/.test(n)) return "stairs";
      if (/exterior|front|facade|outside/.test(n)) return "exterior";
      if (/facility|pool|gym|sauna|lobby/.test(n)) return "facility";
      if (/yard|garden|lawn/.test(n)) return "yard";
      return "other";
    };
    images = images.map(x=>({...x,label:mapLabel(x.name), conf:null}));
    // apply preferences weighting
    images.sort((a,b)=> rankLabel(a.label, order) - rankLabel(b.label, order));
    renderGrid();
    toastMsg("Heuristic Sort สำเร็จ", true);
  }

  // Offline AI (MobileNet, generic)
  async function aiSortOffline(){
    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    if (!localModel) return toastMsg("Offline AI ยังไม่พร้อม");

    const order = getOrderByMode();
    setProg(0,"กำลังวิเคราะห์ (Offline) …");
    for (let i=0;i<images.length;i++){
      const imgEl = await toImg(images[i].src);
      try{
        const res = await localModel.classify(imgEl);
        const top = res && res[0] ? res[0] : {label:"other", confidence:0};
        const mapped = mapGenericToRoom(top.label);
        images[i].label = mapped; images[i].conf = top.confidence || 0;
      }catch(e){
        console.warn("offline classify error", e);
        images[i].label = images[i].label || "other";
        images[i].conf = images[i].conf || 0;
      }
      setProg(Math.round((i+1)*100/images.length), `Offline: ${i+1}/${images.length}`);
    }
    // preference-aware sort
    images.sort((a,b)=> rankLabel(a.label, order) - rankLabel(b.label, order));
    renderGrid();
    setProg(0,"พร้อมทำงาน");
    toastMsg("AI Sort (Offline) สำเร็จ", true);
  }

  // Custom Model (trained via Trainer)
  async function aiSortCustom(){
    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    if (!customReady || !customClassifier) return toastMsg("Custom Model ยังไม่พร้อม");

    const order = getOrderByMode();
    setProg(0,"กำลังวิเคราะห์ (Custom) …");
    for (let i=0;i<images.length;i++){
      const imgEl = await toImg(images[i].src);
      const pred = await new Promise(resolve=>{
        customClassifier.classify(imgEl, (err, res)=>{
          if (err) { console.error(err); return resolve({label:"other", confidence:0}); }
          const r = res && res[0] ? res[0] : {label:"other", confidence:0};
          resolve(r);
        });
      });
      images[i].label = pred.label || "other";
      images[i].conf = pred.confidence || 0;
      setProg(Math.round((i+1)*100/images.length), `Custom: ${i+1}/${images.length}`);
    }
    // preference-aware sort
    images.sort((a,b)=> rankLabel(a.label, order) - rankLabel(b.label, order));
    renderGrid();
    setProg(0,"พร้อมทำงาน");
    toastMsg("AI Sort (Custom) สำเร็จ", true);
  }

  // Map generic MobileNet labels to room-like
  function mapGenericToRoom(raw=""){
    const s = raw.toLowerCase();
    if (/sofa|couch|tv|entertainment|lamp/.test(s)) return "living";
    if (/dining|table/.test(s)) return "dining";
    if (/kitchen|microwave|refrigerator|oven|stove|range/.test(s)) return "kitchen";
    if (/bed|bedroom|pillow|wardrobe/.test(s)) return "bedroom";
    if (/bath|toilet|shower|bathtub|sink/.test(s)) return "bathroom";
    if (/balcony|terrace|veranda/.test(s)) return "balcony";
    if (/corridor|hall/.test(s)) return "corridor";
    if (/stair/.test(s)) return "stairs";
    if (/garage|car/.test(s)) return "garage";
    if (/garden|yard|lawn|tree/.test(s)) return "yard";
    if (/building|facade|outside|exterior/.test(s)) return "exterior";
    if (/pool|gym|sauna|lobby/.test(s)) return "facility";
    return "other";
  }

  // Order for each mode
  function getOrderByMode(){
    const mode = modeEl.value;
    return (mode==="house")
      ? ["exterior","garage","living","dining","kitchen","stairs","bedroom","other","bathroom","yard","facility","balcony","corridor","view"]
      : ["living","dining","kitchen","corridor","bedroom","bathroom","balcony","view","facility","exterior","other"];
  }

  // Preference-aware ranking: base by order + user memory weight
  function rankLabel(label, order){
    const base = order.indexOf(label); const b = base < 0 ? 999 : base;
    const bias = prefs[label]?.bias || 0; // negative bias => earlier
    return b + bias;
  }

  // Learn from user manual reordering (simple heuristic)
  function learnFromUserOrder(){
    // count how early each label appears
    const counts = {};
    images.forEach((x,idx)=>{
      if (!x.label) return;
      if (!counts[x.label]) counts[x.label] = [];
      counts[x.label].push(idx);
    });
    // compute average position, convert to bias in [-0.6..+0.6]
    Object.keys(counts).forEach(lbl=>{
      const avg = counts[lbl].reduce((a,b)=>a+b,0) / counts[lbl].length;
      const norm = avg / Math.max(1, images.length-1); // 0..1
      const bias = (norm - 0.5); // -0.5..0.5
      prefs[lbl] = { bias: +(bias.toFixed(2)) };
    });
    savePrefs();
  }

  // Export / Import Preferences
  btnExportPrefs.addEventListener("click", ()=>{
    const blob = new Blob([ JSON.stringify(prefs, null, 2) ], {type:"application/json"});
    saveAs(blob, "PHANToM_Preferences.json");
  });
  btnImportPrefs.addEventListener("click", ()=>{
    const inp = document.createElement("input"); inp.type="file"; inp.accept="application/json";
    inp.onchange = async e=>{
      const f = e.target.files[0]; if(!f) return;
      const text = await f.text();
      try{
        const obj = JSON.parse(text);
        Object.assign(prefs, obj);
        savePrefs();
        toastMsg("นำเข้าค่าพฤติกรรมเรียบร้อย", true);
      }catch(err){ console.error(err); toastMsg("ไฟล์ไม่ถูกต้อง"); }
    };
    inp.click();
  });

  // Tools
  function toImg(src){ return new Promise(r=>{ const im=new Image(); im.src=src; im.onload=()=>r(im); }); }
  async function dataUrlToJpgBlob(dataUrl, quality=0.9){
    const img = await toImg(dataUrl);
    const c=document.createElement("canvas"); c.width=img.naturalWidth; c.height=img.naturalHeight;
    c.getContext("2d").drawImage(img,0,0);
    return await new Promise(res=> c.toBlob(res,"image/jpeg",quality));
  }

  // Export ZIP
  async function exportZip(){
    if (!images.length) return toastMsg("ไม่มีภาพให้บันทึก");
    const q = Math.max(0.6, Math.min(0.95, parseFloat(qualityEl.value)||0.9));
    const zip = new JSZip();
    setProg(0,"กำลังสร้าง ZIP…");

    // covers first
    const coverList=[], otherList=[];
    images.forEach((x,idx)=> (coverIdx.has(idx) ? coverList : otherList).push(x));
    const final = [...coverList, ...otherList];

    for (let i=0;i<final.length;i++){
      const blob = await dataUrlToJpgBlob(final[i].src, q);
      zip.file(`${i+1}.jpg`, blob);
      setProg(Math.round((i+1)*100/final.length), `กำลังเพิ่มรูป ${i+1}/${final.length}`);
    }
    const report = [
      "--- PHANToM Image Sort Report ---",
      `Mode: ${modeEl.value}`,
      `Images: ${final.length}`,
      `Covers: ${coverList.length}`,
      `AI Local: ${localModel?'on':'off'}`,
      `AI Custom: ${customReady?'on':'off'}`,
      `Prefs: ${Object.keys(prefs).length} labels`
    ].join("\n");
    zip.file("report.txt", report);

    const out = await zip.generateAsync({type:"blob"});
    saveAs(out, "PHANToM_Sorted.zip");
    setProg(0,"พร้อมทำงาน");
    toastMsg("ส่งออก ZIP สำเร็จ ✅", true);
  }

  // Events
  btnHeuristic.addEventListener("click", heuristicSort);
  btnAI.addEventListener("click", aiSortOffline);
  btnAICustom.addEventListener("click", aiSortCustom);
  btnClear.addEventListener("click", ()=>{ images=[]; coverIdx.clear(); renderGrid(); setProg(0,"พร้อมทำงาน"); toastMsg("ล้างรูปแล้ว", true); });
  btnExport.addEventListener("click", exportZip);

  // Load custom model
  btnLoadModel.addEventListener("click", ()=>{
    modelJson.click();
  });
  modelJson.addEventListener("change", ()=>{
    modelBin.click();
  });
  modelBin.addEventListener("change", async ()=>{
    const jf = modelJson.files[0], bf = modelBin.files[0];
    if (!jf || !bf) return toastMsg("เลือกไฟล์ไม่ครบ");
    try{
      if (!fe){ fe = await ml5.featureExtractor('MobileNet'); }
      customClassifier = fe.classification();
      const jURL = URL.createObjectURL(jf);
      const bURL = URL.createObjectURL(bf);
      await customClassifier.load({model:jURL, metadata:jURL, weights:bURL});
      customReady = true;
      aiCustomEl.textContent = "พร้อมใช้งาน";
      aiCustomEl.style.color = "#22c55e";
      toastMsg("โหลด Custom Model สำเร็จ ✅", true);
    }catch(err){
      console.error("load custom model error:", err);
      aiCustomEl.textContent = "โหลดโมเดลไม่สำเร็จ";
      aiCustomEl.style.color = "#ef4444";
      toastMsg("โหลดโมเดลไม่สำเร็จ");
    }
  });

  // Init Offline AI
  try{
    aiLocalEl.textContent = "กำลังโหลด…";
    localModel = await ml5.imageClassifier("MobileNet", ()=>{
      aiLocalEl.textContent = "พร้อมใช้งาน";
      aiLocalEl.style.color = "#22c55e";
      toastMsg("Offline AI Loaded ✅", true);
    });
  }catch(e){
    aiLocalEl.textContent = "โหลดไม่สำเร็จ";
    aiLocalEl.style.color = "#ef4444";
    console.error("offline AI load error", e);
  }
});
