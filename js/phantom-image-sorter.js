/* ==========================================================
   PHANToM Image Sorter v3.0
   by PHANToM — Dual AI Mode (Google + Offline)
   ========================================================== */

(() => {
  console.log("✅ PHANToM Image Sorter Loaded");

  const $ = (s, ctx=document) => ctx.querySelector(s);
  const $$ = (s, ctx=document) => Array.from(ctx.querySelectorAll(s));

  const dropZone = $("#dropZone");
  const grid = $("#grid");
  const toast = $("#toast");
  const qualityEl = $("#quality");
  const exportBtn = $("#exportZip");
  const clearBtn = $("#clear");

  let images = [];

  const toastMsg = (msg, color="#4ade80")=>{
    toast.textContent = msg;
    toast.style.background = color;
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"),1800);
  };

  /* ========== File Upload ========== */
  const handleFiles = (files)=>{
    const arr = Array.from(files);
    if(!arr.length){ toastMsg("⚠️ ไม่มีไฟล์ที่เลือก","#f87171"); return; }
    arr.forEach(f=>{
      if(!f.type.startsWith("image/")) return;
      const reader=new FileReader();
      reader.onload=e=>{
        images.push({src:e.target.result,name:f.name});
        renderGrid();
      };
      reader.readAsDataURL(f);
    });
    toastMsg(`📸 อัปโหลด ${arr.length} ไฟล์แล้ว`);
  };

  dropZone.addEventListener("dragover",e=>{e.preventDefault();dropZone.classList.add("drag");});
  dropZone.addEventListener("dragleave",()=>dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop",e=>{
    e.preventDefault();dropZone.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  });
  dropZone.addEventListener("click",()=>{
    const inp=document.createElement("input");
    inp.type="file";inp.accept="image/*";inp.multiple=true;
    inp.onchange=e=>handleFiles(e.target.files);
    inp.click();
  });

  /* ========== Render ========== */
  const renderGrid = ()=>{
    grid.innerHTML="";
    images.forEach((img,i)=>{
      const card=document.createElement("div");
      card.className="item";
      card.draggable=true;
      card.innerHTML=`<img src="${img.src}" class="thumb"/><div class="cover">Cover</div>`;
      const cover=card.querySelector(".cover");
      cover.addEventListener("click",()=>cover.classList.toggle("active"));
      card.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",i));
      card.addEventListener("dragover",e=>e.preventDefault());
      card.addEventListener("drop",e=>{
        e.preventDefault();
        const from=e.dataTransfer.getData("text/plain");
        const to=i;
        const moved=images.splice(from,1)[0];
        images.splice(to,0,moved);
        renderGrid();
      });
      grid.appendChild(card);
    });
  };

  /* ========== Clear ========== */
  clearBtn.addEventListener("click",()=>{
    images=[];grid.innerHTML="";toastMsg("🧹 เคลียร์แล้ว","#facc15");
  });

  /* ========== Export ZIP ========== */
  exportBtn.addEventListener("click",async()=>{
    if(!images.length) return toastMsg("⚠️ ไม่มีภาพ","#f87171");
    toastMsg("⏳ กำลังบีบอัดรูป...");
    const zip=new JSZip();
    for(let i=0;i<images.length;i++){
      const blob=await fetch(images[i].src).then(r=>r.blob());
      zip.file(`${i+1}.jpg`,blob);
    }
    const blob=await zip.generateAsync({type:"blob"});
    saveAs(blob,"PHANToM_Sorted.zip");
    toastMsg("✅ บันทึกเรียบร้อย");
  });

  /* ========== Offline AI Sort (ml5.js) ========== */
  const localBtn=$("#autoLocal");
  if(localBtn){
    localBtn.addEventListener("click",async()=>{
      if(!images.length) return toastMsg("⚠️ ไม่มีภาพ","#f87171");
      toastMsg("⏳ กำลังโหลดโมเดล...");
      const classifier=await ml5.imageClassifier("MobileNet");
      const scored=[];
      for(let i=0;i<images.length;i++){
        const img=document.createElement("img");
        img.src=images[i].src;
        await new Promise(r=>img.onload=r);
        const result=await classifier.classify(img);
        const label=result[0]?.label||"unknown";
        scored.push({...images[i],label});
      }
      const order=["living","sofa","dining","kitchen","bed","bath","balcony","view"];
      scored.sort((a,b)=>{
        const ia=order.findIndex(x=>a.label.includes(x));
        const ib=order.findIndex(x=>b.label.includes(x));
        return (ia==-1?99:ia)-(ib==-1?99:ib);
      });
      images=scored;
      renderGrid();
      toastMsg("✅ เรียงรูปด้วย AI (Offline)");
    });
  }

  console.log("🟢 PHANToM Sorter initialized successfully");
})();
