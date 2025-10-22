/* ==========================================================
   PHANToM Image Sorter (Debug Build v1.1)
   by PHANToM — AI + Manual sorter for Condo/House listings
   ========================================================== */

(() => {
  console.log("✅ PHANToM Image Sorter: Script Loaded");

  // Shortcuts
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

  // Elements
  const dropZone = $("#dropZone");
  const grid = $("#grid");
  const toast = $("#toast");
  const qualityEl = $("#quality");
  const exportBtn = $("#exportZip");
  const clearBtn = $("#clear");
  const modeCondo = document.querySelector('input[value="condo"]');
  const modeHouse = document.querySelector('input[value="house"]');

  let images = [];
  let currentMode = "condo";

  /* === Toast Helper === */
  const showToast = (msg, color = "#4ade80") => {
    toast.textContent = msg;
    toast.style.background = color;
    toast.style.opacity = 1;
    setTimeout(() => (toast.style.opacity = 0), 1800);
  };

  /* === Handle Mode Switch === */
  if (modeCondo && modeHouse) {
    modeCondo.addEventListener("change", () => {
      currentMode = "condo";
      localStorage.setItem("phantom_mode", currentMode);
      showToast("🛋 โหมด: คอนโด/ห้องเช่า");
    });
    modeHouse.addEventListener("change", () => {
      currentMode = "house";
      localStorage.setItem("phantom_mode", currentMode);
      showToast("🏠 โหมด: บ้าน");
    });
    const saved = localStorage.getItem("phantom_mode");
    if (saved) {
      currentMode = saved;
      (saved === "house" ? modeHouse : modeCondo).checked = true;
    }
  }

  /* === Handle File Upload === */
  const handleFiles = (files) => {
    console.log("📥 Files dropped:", files);
    const arr = Array.from(files);
    if (!arr.length) {
      showToast("⚠️ ไม่มีไฟล์ที่เลือก", "#f87171");
      return;
    }
    arr.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          images.push({ file, src: img.src });
          renderGrid();
        };
      };
      reader.readAsDataURL(file);
    });
    showToast(`📸 อัปโหลด ${arr.length} ไฟล์แล้ว`);
  };

  /* === Drag and Drop Events === */
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "#60a5fa";
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.style.borderColor = "rgba(255,255,255,.2)";
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "rgba(255,255,255,.2)";
      handleFiles(e.dataTransfer.files);
    });
    dropZone.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.multiple = true;
      inp.onchange = (e) => handleFiles(e.target.files);
      inp.click();
    });
  }

  /* === Render Preview Grid === */
  const renderGrid = () => {
    grid.innerHTML = "";
    images.forEach((img, i) => {
      const card = document.createElement("div");
      card.className = "img-item";
      card.style.border = "1px solid rgba(255,255,255,.15)";
      card.style.borderRadius = "10px";
      card.style.padding = "6px";
      card.style.cursor = "grab";
      card.innerHTML = `
        <img src="${img.src}" style="max-width:100%;border-radius:8px"/>
        <div style="text-align:center;margin-top:4px;color:#9ca3af;font-size:.85rem">#${i + 1}</div>
      `;
      card.draggable = true;
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", i);
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/plain");
        const to = i;
        const moved = images.splice(from, 1)[0];
        images.splice(to, 0, moved);
        renderGrid();
      });
      card.addEventListener("dragover", (e) => e.preventDefault());
      grid.appendChild(card);
    });
    console.log("🧩 Rendered grid:", images.length, "images");
  };

  /* === Clear === */
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      images = [];
      grid.innerHTML = "";
      showToast("🧹 เคลียร์ทั้งหมดแล้ว", "#facc15");
    });
  }

  /* === Export as ZIP (Renamed) === */
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      if (!images.length) return showToast("⚠️ ไม่มีภาพให้บันทึก", "#f87171");

      showToast("⏳ กำลังสร้าง ZIP...");
      const zip = new JSZip();

      let quality = parseFloat(qualityEl?.value || "0.9");
      quality = Math.min(Math.max(quality, 0.6), 0.95);

      for (let i = 0; i < images.length; i++) {
        const blob = await fetch(images[i].src).then((r) => r.blob());
        const imgFile = await blobToJpg(blob, quality);
        zip.file(`${i + 1}.jpg`, imgFile);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "PHANToM_Sorted.zip";
      a.click();
      URL.revokeObjectURL(url);
      showToast("✅ บันทึกเรียบร้อย");
    });
  }

  async function blobToJpg(blob, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  /* === Error Safety === */
  window.addEventListener("error", (e) => {
    console.error("❌ JS Error:", e.message, e.filename, e.lineno);
    showToast("⚠️ Error: " + e.message, "#f87171");
  });

   // ==== Delete Mode ====
let deleteMode = false;
const deleteBtn = document.getElementById("deleteMode");
deleteBtn.addEventListener("click", ()=>{
  deleteMode = !deleteMode;
  deleteBtn.textContent = deleteMode ? "❌ ออกจากโหมดลบ" : "🗑️ ลบรูป";
  toast(deleteMode ? "เข้าสู่โหมดลบ: แตะรูปเพื่อเลือก หรือลากไปที่ปุ่มลบ" : "ออกจากโหมดลบแล้ว");
  document.querySelectorAll(".item").forEach(it=>{
    it.classList.remove("selected");
  });
});

document.addEventListener("click", e=>{
  if(!deleteMode) return;
  const it = e.target.closest(".item");
  if(it){
    it.classList.toggle("selected");
  }
});

deleteBtn.addEventListener("dragover", e=>{
  if(deleteMode){ e.preventDefault(); deleteBtn.style.background="#d33"; }
});
deleteBtn.addEventListener("dragleave", ()=> deleteBtn.style.background="var(--err)");
deleteBtn.addEventListener("drop", e=>{
  e.preventDefault();
  if(!deleteMode) return;
  const selected = document.querySelectorAll(".item.dragging, .item.selected");
  selected.forEach(x=>{
    x.style.opacity="0"; setTimeout(()=>x.remove(),200);
  });
  toast(`ลบรูป ${selected.length} ภาพแล้ว`);
  deleteBtn.style.background="var(--err)";
});

  console.log("🟢 PHANToM Sorter initialized successfully");
})();
