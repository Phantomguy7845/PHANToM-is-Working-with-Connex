/* ==========================================================
   PHANToM Image Sorter v3.3
   by PHANToM — Offline AI + Heuristic + Export
   ========================================================== */
(() => {
  console.log("PHANToM Image Sorter Loaded");

  const $ = (s, ctx=document) => ctx.querySelector(s);
  const $$ = (s, ctx=document) => Array.from(ctx.querySelectorAll(s));

  const dropZone   = $("#dropZone");
  const grid       = $("#grid");
  const toastEl    = $("#toast");
  const apiKeyEl   = $("#apiKey");
  const modeEl     = $("#mode");
  const qualityEl  = $("#quality");
  const progressEl = $("#progressBar");
  const progTextEl = $("#progressText");
  const sysStatus  = $("#sysStatus");

  const btnHeu   = $("#autoHeu");
  const btnLocal = $("#autoLocal");
  const btnGCP   = $("#autoAI");
  const btnClear = $("#clear");
  const btnZip   = $("#exportZip");

  const LS = {
    get(){ try { return JSON.parse(localStorage.getItem("PHX_SORTER_V33")||"{}"); } catch(e){ return {}; } },
    set(v){ localStorage.setItem("PHX_SORTER_V33", JSON.stringify(v)); }
  };

  let images = [];           // {src, name, label?, cover?}
  let classifier = null;     // ml5 classifier
  let modelReady = false;

  // ---------- toast ----------
  const toast = (msg, color) => {
    toastEl.textContent = msg;
    if (color) toastEl.style.background = color;
    toastEl.classList.add("show");
    setTimeout(()=>toastEl.classList.remove("show"), 1800);
  };

  // ---------- progress ----------
  const setProgress = (p, text) => {
    progressEl.style.width = Math.max(0, Math.min(100, p)) + "%";
    if (text) progTextEl.textContent = text;
  };

  // ---------- persistence ----------
  const syncFromLS = () => {
    const st = LS.get();
    if (st.apiKey) apiKeyEl.value = st.apiKey;
    if (st.mode) modeEl.value = st.mode;
    if (st.quality) qualityEl.value = st.quality;
  };
  const syncToLS = () => {
    LS.set({ apiKey: apiKeyEl.value||"", mode: modeEl.value, quality: qualityEl.value });
  };
  [apiKeyEl, modeEl, qualityEl].forEach(el => el.addEventListener("change", syncToLS));

  // ---------- upload ----------
  const handleFiles = (files) => {
    const arr = Array.from(files);
    if (!arr.length){ toast("⚠️ ไม่มีไฟล์ที่เลือก","#8a1"); return; }
    arr.forEach(f=>{
      if (!f.type.startsWith("image/")) return;
      const rd=new FileReader();
      rd.onload = e => { images.push({src:e.target.result, name:f.name}); renderGrid(); };
      rd.readAsDataURL(f);
    });
    toast(`📸 อัปโหลด ${arr.length} ไฟล์แล้ว`);
  };

  dropZone.addEventListener("dragover", e=>{e.preventDefault(); dropZone.classList.add("drag");});
  dropZone.addEventListener("dragleave", ()=>dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop", e=>{
    e.preventDefault(); dropZone.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  });
  dropZone.addEventListener("click", ()=>{
    const inp=document.createElement("input");
    inp.type="file"; inp.accept="image/*"; inp.multiple=true;
    inp.onchange=e=>handleFiles(e.target.files);
    inp.click();
  });

  // ---------- render ----------
  const renderGrid = ()=>{
    grid.innerHTML="";
    images.forEach((img,i)=>{
      const card=document.createElement("div");
      card.className="item"; card.draggable=true;
      card.innerHTML=`
        <img alt="thumb" src="${img.src}" class="thumb"/>
        <div class="cover ${img.cover?'active':''}">Cover</div>
        <div class="bar"><div class="idx">${i+1}</div><div class="tag">${img.label||''}</div></div>
      `;
      const cover=card.querySelector(".cover");
      cover.addEventListener("click", ()=>{
        const count = images.filter(x=>x.cover).length;
        if (!img.cover && count>=2) return toast("เลือกปกได้สูงสุด 2 รูป","#f59e0b");
        img.cover = !img.cover;
        cover.classList.toggle("active", !!img.cover);
      });
      // drag reorder
      card.addEventListener("dragstart", e=> e.dataTransfer.setData("text/plain", i.toString()));
      card.addEventListener("dragover", e=> e.preventDefault());
      card.addEventListener("drop", e=>{
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain");
        const to = i;
        const mv = images.splice(from,1)[0];
        images.splice(to,0,mv);
        renderGrid();
      });
      grid.appendChild(card);
    });
  };

  // ---------- Heuristic Sort ----------
  const orderCondo = ["living","dining","kitchen","corridor","bed","bath","balcony","view","facility"];
  const orderHouse = ["exterior","garage","living","dining","kitchen","stairs","bed","other","bath","yard","facility"];
  const heuristicSort = ()=>{
    if (!images.length) return toast("⚠️ ไม่มีภาพ","#f87171");
    const mode = modeEl.value;
    const order = (mode==="house") ? orderHouse : orderCondo;
    const mapByName = (name)=>{
      const n = name.toLowerCase();
      if (/balcony|view|window/.test(n)) return "balcony";
      if (/bath|wc|toilet/.test(n)) return "bath";
      if (/bed|bedroom/.test(n)) return "bed";
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
    images = images.map(x=>({...x,label:mapByName(x.name)}))
                   .sort((a,b)=> order.indexOf(a.label) - order.indexOf(b.label));
    renderGrid();
    toast("✅ เรียงแบบ Heuristic แล้ว");
  };

  // ---------- Offline AI ----------
  const loadLocalModel = async ()=>{
    try{
      sysStatus.innerHTML = 'Offline AI: <b>กำลังโหลด…</b>';
      // สำคัญ: รอให้ tf พร้อมก่อน (html จัดการ setBackend แล้ว)
      await tf.ready();
      // โหลดโมเดล ml5 (ต้องเรียกหลัง tf พร้อม)
      console.log("[AI] Loading MobileNet…");
      classifier = await ml5.imageClassifier('MobileNet');
      // ml5 ไม่มี .ready เสมอไป แต่ถ้าคืน classifier ได้ถือว่าพร้อม
      modelReady = true;
      sysStatus.innerHTML = 'Offline AI: <b style="color:#4ade80">พร้อมใช้งาน</b>';
      console.log("[AI] Offline model ready");
    }catch(err){
      modelReady = false;
      sysStatus.innerHTML = 'Offline AI: <b style="color:#ef4444">โหลดไม่สำเร็จ</b>';
      console.error(err);
    }
  };

  const classifyOne = (imgEl) => new Promise((resolve)=>{
    // ป้องกันกรณีโมเดลยังไม่พร้อม
    if (!classifier) return resolve({label:"unknown", confidence:0});
    classifier.classify(imgEl, (err, results)=>{
      if (err){ console.error("AI classify error:", err); return resolve({label:"unknown",confidence:0}); }
      resolve(results && results[0] ? results[0] : {label:"unknown",confidence:0});
    });
  });

  const mapLabel = (raw, mode)=>{
    const s = (raw||"").toLowerCase();
    if (/sofa|couch|tv|living/.test(s)) return "living";
    if (/dining|table/.test(s)) return "dining";
    if (/kitchen|microwave|refrigerator|oven|range|stove/.test(s)) return "kitchen";
    if (/bed|bedroom|pillow/.test(s)) return "bed";
    if (/bath|toilet|shower|bathtub|sink/.test(s)) return "bath";
    if (/balcony|terrace|veranda/.test(s)) return "balcony";
    if (/corridor|hallway/.test(s)) return "corridor";
    if (/stair/.test(s)) return "stairs";
    if (/garage|car/.test(s)) return "garage";
    if (/garden|yard|lawn|tree/.test(s)) return "yard";
    if (/building|facade|outside|exterior/.test(s)) return "exterior";
    if (/pool|gym|sauna|lobby/.test(s)) return "facility";
    return "other";
  };

  const offlineSort = async ()=>{
    if (!images.length) return toast("⚠️ ไม่มีภาพ","#f87171");
    if (!modelReady){ toast("⚠️ Offline AI ยังไม่พร้อม","#f59e0b"); return; }

    setProgress(0,"เริ่มวิเคราะห์…");
    const mode = modeEl.value;
    const order = (mode==="house") ? orderHouse : orderCondo;

    let done=0;
    for (let i=0;i<images.length;i++){
      const tmp = document.createElement("img");
      tmp.src = images[i].src;
      await new Promise(r => tmp.onload = r);
      const r = await classifyOne(tmp);
      const label = mapLabel(r.label, mode);
      images[i].label = label;
      done++;
      setProgress(Math.round(done*100/images.length), `กำลังวิเคราะห์รูปที่ ${done}/${images.length} — ${label}`);
      console.log(`[AI] ${i+1}/${images.length} => ${r.label} => ${label}`);
    }

    images.sort((a,b)=> order.indexOf(a.label) - order.indexOf(b.label));
    renderGrid();
    setProgress(100,"เสร็จสิ้น");
    toast("✅ เรียงรูปด้วย Offline AI เรียบร้อย");
    setTimeout(()=>setProgress(0,"พร้อมทำงาน"), 700);
  };

  // ---------- Google Vision (stub) ----------
  const useGoogle = ()=>{
    const key = (apiKeyEl.value||"").trim();
    if (!key) return toast("กรุณาใส่ API Key ก่อน","#f59e0b");
    toast("โหมด Google Vision จะเปิดใช้ในรุ่นถัดไป","#0ea5e9");
  };

  // ---------- Export ZIP ----------
  const dataUrlToJpgBlob = (dataUrl, quality)=> new Promise((resolve)=>{
    const img = new Image();
    img.src = dataUrl;
    img.onload = ()=>{
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img,0,0);
      c.toBlob(b=>resolve(b), "image/jpeg", quality);
    };
  });

  const exportZip = async ()=>{
    if (!images.length) return toast("⚠️ ไม่มีภาพ","#f87171");
    const q = Math.max(0.6, Math.min(0.95, parseFloat(qualityEl.value)||0.9));
    toast("⏳ กำลังบีบอัดรูป…");
    setProgress(0,"กำลังสร้าง ZIP…");

    const zip = new JSZip();
    const covers = images.filter(x=>x.cover);
    const others = images.filter(x=>!x.cover);
    const final = [...covers, ...others];

    for (let i=0;i<final.length;i++){
      const blob = await dataUrlToJpgBlob(final[i].src, q);
      zip.file(`${i+1}.jpg`, blob);
      setProgress(Math.round((i+1)*100/final.length), `กำลังเพิ่มรูป ${i+1}/${final.length}`);
    }

    const lines = [
      "--- PHANToM Image Sort Report ---",
      `Mode: ${modeEl.value}`,
      `Images: ${final.length}`,
      `Cover: ${covers.length? covers.map((_,i)=>i+1).join(", "):"none"}`,
      `AI: ${modelReady? "ml5 MobileNet (offline)":"—"}`,
      `Export Quality: ${q}`
    ];
    zip.file("report.txt", lines.join("\n"));

    const out = await zip.generateAsync({type:"blob"});
    saveAs(out, "PHANToM_Sorted.zip");
    toast("✅ ส่งออก ZIP สำเร็จ");
    setProgress(0,"พร้อมทำงาน");
  };

  // ---------- clear ----------
  const clearAll = ()=>{
    images=[]; grid.innerHTML=""; setProgress(0,"พร้อมทำงาน");
    toast("🧹 เคลียร์แล้ว","#facc15");
  };

  // ---------- events ----------
  btnHeu.addEventListener("click", heuristicSort);
  btnLocal.addEventListener("click", offlineSort);
  btnGCP.addEventListener("click", useGoogle);
  btnZip.addEventListener("click", exportZip);
  btnClear.addEventListener("click", clearAll);

  // ---------- init ----------
  syncFromLS();
  // โหลดโมเดลหลังหน้าเสร็จ (tf backend ถูกตั้งใน HTML แล้ว)
  window.addEventListener("load", loadLocalModel);

  console.log("PHANToM Sorter initialized successfully");
})();
