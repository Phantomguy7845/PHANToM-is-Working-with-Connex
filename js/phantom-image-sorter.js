/* PHANToM Image Sorter — TensorFlow v4 Stable (Aurora Edition)
   - Offline AI: TFHub MobileNetV2 (GraphModel)
   - Custom Model Loader: Overlay (JSON+BIN) with user activation safe
   - Heuristic Sort + Drag/Drop + Cover + Delete + Export ZIP
   - Robust guards, progress, and UI feedback
*/
(function(){
  const $ = s => document.querySelector(s);
  const drop=$("#drop"), picker=$("#picker"), grid=$("#grid"),
        toast=$("#toast"), aiStatus=$("#aiStatus"), customStatus=$("#customStatus"),
        btnHeu=$("#autoHeu"), btnAI=$("#autoAI"), btnCustom=$("#autoCustom"),
        btnClear=$("#clear"), btnExport=$("#exportZip"), qualityEl=$("#quality"),
        loadBar=$("#loadBar"), overlay=$("#overlay"),
        btnPickJson=$("#pickJson"), btnPickBin=$("#pickBin"),
        jsonName=$("#jsonName"), binName=$("#binName"),
        btnLoadCustom=$("#loadCustom"), btnCloseOverlay=$("#closeOverlay");

  if(!drop || !grid){ console.warn("Missing essential DOM. Abort init."); return; }

  // ---------------- State ----------------
  let images=[]; // {src, name, label?, conf?, cover?}
  let offlineModel=null; let offlineReady=false;
  let customModel=null;  let customReady=false;
  let _jsonFile=null, _binFile=null;

  // ------------- Toast -------------
  function toastMsg(msg, ok=false){
    if(!toast) return;
    toast.textContent=msg;
    toast.style.background = ok ? "#153a1f" : "#0d1b36";
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"), 1800);
  }

  // ------------- Upload -------------
  drop.addEventListener("click", ()=> picker.click());
  drop.addEventListener("dragover", e=>{e.preventDefault();drop.classList.add("drag");});
  drop.addEventListener("dragleave", ()=> drop.classList.remove("drag"));
  drop.addEventListener("drop", e=>{
    e.preventDefault(); drop.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  });
  picker.addEventListener("change", e=> handleFiles(e.target.files));

  function handleFiles(fs){
    const arr = Array.from(fs||[]).filter(f=> f.type.startsWith("image/"));
    if(!arr.length){ toastMsg("ไม่มีไฟล์ภาพ"); return; }
    if(loadBar){ loadBar.style.display="block"; loadBar.firstElementChild.style.width="0%"; }
    let done=0;
    arr.forEach(f=>{
      const r=new FileReader();
      r.onload=ev=>{
        images.push({src:ev.target.result, name:f.name});
        done++; if(loadBar){ loadBar.firstElementChild.style.width = Math.round(done/arr.length*100)+"%"; }
        if(done===arr.length){ setTimeout(()=>{ if(loadBar) loadBar.style.display="none"; }, 300); }
        render();
      };
      r.readAsDataURL(f);
    });
    toastMsg(`เพิ่มรูป ${arr.length} ไฟล์`, true);
  }

  // ------------- Render Grid + Drag + Delete -------------
  function render(){
    grid.innerHTML="";
    images.forEach((x,i)=>{
      const item=document.createElement("div"); item.className="item"; item.draggable=true;

      const im=document.createElement("img"); im.src=x.src; im.className="thumb";

      const cover=document.createElement("button");
      cover.className="cover"+(x.cover?" active":""); cover.textContent="Cover";
      cover.onclick=()=>{ x.cover=!x.cover; cover.classList.toggle("active", x.cover); };

      const del=document.createElement("button");
      del.className="del"; del.title="ลบรูปนี้"; del.textContent="🗑";
      del.onclick=()=>{ images.splice(i,1); render(); };

      const bar=document.createElement("div"); bar.className="bar";
      const idx=document.createElement("div"); idx.textContent=(i+1);
      const tag=document.createElement("div");
      tag.textContent = x.label ? `${x.label}${x.conf?` (${Math.round(x.conf*100)}%)`:''}` : "";
      bar.append(idx, tag);

      // Drag reorder
      item.addEventListener("dragstart", e=> e.dataTransfer.setData("text/plain", i));
      item.addEventListener("dragover", e=> e.preventDefault());
      item.addEventListener("drop", e=>{
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain");
        const to = i;
        if(from===to) return;
        const mv = images.splice(from,1)[0];
        images.splice(to,0,mv);
        render();
      });

      item.append(im, cover, del, bar);
      grid.appendChild(item);
    });
  }

  // ------------- Heuristic Sort -------------
  btnHeu?.addEventListener("click", ()=>{
    if(!images.length) return toastMsg("ยังไม่มีภาพ");
    images.sort((a,b)=> (a.name||"").localeCompare(b.name||"", undefined, {numeric:true}));
    render(); toastMsg("เรียงตามชื่อไฟล์แล้ว", true);
  });

  // ------------- Offline AI (TFHub MobileNetV2) -------------
  async function ensureOffline(){
    if(offlineReady && offlineModel) return true;
    try{
      aiStatus.textContent="Offline AI: กำลังโหลด…";
      if(typeof tf === "undefined") throw new Error("TensorFlow.js not loaded");
      await tf.ready();
      offlineModel = await tf.loadGraphModel(
        "https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_140_224/classification/5",
        { fromTFHub:true }
      );
      offlineReady=true;
      aiStatus.textContent="Offline AI: พร้อมใช้งาน";
      aiStatus.style.color="#22c55e";
      toastMsg("Offline AI พร้อม", true);
      return true;
    }catch(e){
      console.error("Offline AI load error", e);
      aiStatus.textContent="Offline AI: โหลดไม่สำเร็จ";
      aiStatus.style.color="#ef4444";
      toastMsg("โหลด Offline AI ไม่สำเร็จ");
      return false;
    }
  }

  btnAI?.addEventListener("click", async ()=>{
    if(!images.length) return toastMsg("ยังไม่มีภาพ");
    const ok = await ensureOffline(); if(!ok) return;
    toastMsg("กำลังเรียงด้วย Offline AI…");
    for(let i=0;i<images.length;i++){
      const t = await dataToTensor(images[i].src, 224);
      try{
        const pred = offlineModel.predict(t);
        const probs = await pred.data();
        const idx = argmax(probs);
        images[i].label = "cls_"+idx; // ไม่ mapping เป็นชื่อห้อง เพราะ model เป็น ImageNet
        images[i].conf  = probs[idx] || 0;
        tf.dispose([pred,t]);
        await tf.nextFrame();
      }catch(err){
        console.warn("predict error", err);
        tf.dispose(t);
      }
    }
    images.sort((a,b)=> b.conf - a.conf);
    render(); toastMsg("Offline AI Sort สำเร็จ", true);
  });

  // ------------- Custom Model Loader (Safe Overlay) -------------
  btnCustom?.addEventListener("click", ()=>{
    _jsonFile=null; _binFile=null;
    jsonName.textContent="ยังไม่ได้เลือก";
    binName.textContent="ยังไม่ได้เลือก";
    btnLoadCustom.disabled=true;
    overlay.classList.add("show");
  });
  btnCloseOverlay?.addEventListener("click", ()=> overlay.classList.remove("show"));

  btnPickJson?.addEventListener("click", ()=>{
    pickFileNative(".json").then(f=>{
      if(f){ _jsonFile=f; jsonName.textContent=f.name; }
      btnLoadCustom.disabled = !(_jsonFile && _binFile);
    });
  });
  btnPickBin?.addEventListener("click", ()=>{
    pickFileNative(".bin").then(f=>{
      if(f){ _binFile=f; binName.textContent=f.name; }
      btnLoadCustom.disabled = !(_jsonFile && _binFile);
    });
  });

  btnLoadCustom?.addEventListener("click", async ()=>{
    if(!(_jsonFile && _binFile)) return;
    try{
      customStatus.textContent="Custom Model: กำลังโหลด…";
      const modelURL = URL.createObjectURL(_jsonFile);
      customModel = await tf.loadLayersModel(modelURL);
      customReady=true;
      customStatus.textContent="Custom Model: พร้อมใช้งาน";
      customStatus.style.color="#22c55e";
      toastMsg("โหลด Custom Model สำเร็จ", true);
      overlay.classList.remove("show");
    }catch(e){
      console.error(e);
      customStatus.textContent="Custom Model: โหลดไม่สำเร็จ";
      customStatus.style.color="#ef4444";
      toastMsg("โหลดโมเดลไม่สำเร็จ");
    }

    if(customReady && images.length){
      toastMsg("กำลังเรียงด้วย Custom Model…");
      for(let i=0;i<images.length;i++){
        const t = await dataToTensor(images[i].src, 128);
        try{
          const pred = customModel.predict(t);
          const probs = await pred.data();
          const idx = argmax(probs);
          images[i].label = "cls_"+idx;
          images[i].conf  = probs[idx] || 0;
          tf.dispose([pred,t]);
          await tf.nextFrame();
        }catch(err){
          console.warn("custom predict error", err);
          tf.dispose(t);
        }
      }
      images.sort((a,b)=> b.conf - a.conf);
      render(); toastMsg("Custom Sort สำเร็จ", true);
    }
  });

  // ------------- Export ZIP -------------
  btnExport?.addEventListener("click", async ()=>{
    if(!images.length) return toastMsg("ไม่มีภาพสำหรับส่งออก");
    const q = Math.max(0.6, Math.min(0.95, parseFloat(qualityEl?.value)||0.9));
    const covers=images.filter(x=>x.cover), rest=images.filter(x=>!x.cover);
    const list=[...covers, ...rest];
    const zip=new JSZip();
    for(let i=0;i<list.length;i++){
      const blob = await dataToJpgBlob(list[i].src, q);
      zip.file(`${i+1}.jpg`, blob);
    }
    const out = await zip.generateAsync({type:"blob"});
    saveAs(out, "PHANToM_Sorted.zip");
    toastMsg("ส่งออก ZIP เรียบร้อย", true);
  });

  // ------------- Clear -------------
  btnClear?.addEventListener("click", ()=>{
    images=[]; render(); toastMsg("ล้างทั้งหมด", true);
  });

  // ------------- Helpers -------------
  function argmax(arr){ let m=-Infinity, idx=0; for(let i=0;i<arr.length;i++){ if(arr[i]>m){ m=arr[i]; idx=i; } } return idx; }

  function dataToImg(data){ return new Promise(res=>{ const im=new Image(); im.src=data; im.onload=()=>res(im); }); }

  async function dataToJpgBlob(data, q){
    const im = await dataToImg(data);
    const c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext("2d").drawImage(im,0,0);
    return await new Promise(res=> c.toBlob(res, "image/jpeg", q));
  }

  function dataToTensor(data, size=224){
    return new Promise(res=>{
      const im=new Image(); im.src=data;
      im.onload=()=>{
        const t = tf.tidy(()=> tf.image
          .resizeBilinear(tf.browser.fromPixels(im), [size,size])
          .toFloat().div(255).expandDims(0));
        res(t);
      };
    });
  }

  function pickFileNative(accept){
    return new Promise(res=>{
      const inp=document.createElement("input");
      inp.type="file"; inp.accept=accept;
      inp.addEventListener("change", e=> res(e.target.files[0]||null), {once:true});
      inp.click(); // ถูกเรียกจากปุ่มใน overlay แล้ว จึงปลอดภัยต่อ user activation
    });
  }

})();
