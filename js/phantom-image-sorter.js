console.log("PHANToM Image Sorter Loaded");

window.addEventListener("DOMContentLoaded", async () => {
  const dropZone = document.getElementById("dropZone");
  const filePicker = document.getElementById("filePicker");
  const grid = document.getElementById("grid");
  const toast = document.getElementById("toast");
  const btnHeuristic = document.getElementById("btnHeuristic");
  const btnAI = document.getElementById("btnAI");
  const btnClear = document.getElementById("btnClear");
  const btnExport = document.getElementById("btnExport");
  const aiStatus = document.getElementById("aiStatus");

  let images = [];
  let selectedCovers = [];
  let model = null;

  function showToast(msg, ok = false) {
    toast.textContent = msg;
    toast.style.background = ok ? "#164e28" : "#0c1830";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }

  // === โหลด AI (MobileNet offline) ===
  try {
    aiStatus.textContent = "Offline AI: กำลังโหลด...";
    aiStatus.classList.remove("fail", "ready");
    model = await ml5.imageClassifier("MobileNet", () => {
      aiStatus.textContent = "Offline AI: พร้อมใช้งาน";
      aiStatus.classList.add("ready");
      showToast("Offline AI Loaded ✅", true);
    });
  } catch (e) {
    aiStatus.textContent = "Offline AI: โหลดไม่สำเร็จ";
    aiStatus.classList.add("fail");
    console.error("AI load error:", e);
  }

  console.log("PHANToM Sorter initialized successfully");

  // === ฟังก์ชันแสดงภาพใน grid ===
  function renderGrid() {
    grid.innerHTML = "";
    images.forEach((img, i) => {
      const item = document.createElement("div");
      item.className = "item";
      item.draggable = true;

      const thumb = document.createElement("img");
      thumb.src = img.src;
      thumb.className = "thumb";

      const coverBtn = document.createElement("div");
      coverBtn.className = "cover";
      coverBtn.textContent = "Cover";
      if (selectedCovers.includes(i)) coverBtn.classList.add("active");

      coverBtn.onclick = () => {
        if (selectedCovers.includes(i)) {
          selectedCovers = selectedCovers.filter(x => x !== i);
          coverBtn.classList.remove("active");
        } else if (selectedCovers.length < 2) {
          selectedCovers.push(i);
          coverBtn.classList.add("active");
        } else {
          showToast("เลือกได้สูงสุด 2 ภาพ");
        }
      };

      // Drag reorder
      item.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", i);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      item.addEventListener("dragover", e => e.preventDefault());
      item.addEventListener("drop", e => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData("text/plain"));
        const to = i;
        const temp = images[from];
        images.splice(from, 1);
        images.splice(to, 0, temp);
        renderGrid();
      });

      item.appendChild(thumb);
      item.appendChild(coverBtn);
      grid.appendChild(item);
    });
  }

  // === โหลดรูป ===
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  });
  dropZone.addEventListener("click", () => filePicker.click());
  filePicker.addEventListener("change", e => handleFiles(e.target.files));

  function handleFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = e => {
        images.push({ src: e.target.result, file });
        renderGrid();
      };
      reader.readAsDataURL(file);
    }
  }

  // === ปุ่ม Clear ===
  btnClear.onclick = () => {
    images = [];
    selectedCovers = [];
    renderGrid();
    showToast("ล้างรูปทั้งหมดแล้ว", true);
  };

  // === Heuristic Sort ===
  btnHeuristic.onclick = () => {
    if (!images.length) return showToast("ยังไม่มีภาพ");
    showToast("Heuristic Sort ...");
    images.sort((a, b) => a.file.name.localeCompare(b.file.name));
    renderGrid();
    showToast("เรียงตามชื่อไฟล์เรียบร้อย", true);
  };

  // === AI Sort (Offline) ===
  btnAI.onclick = async () => {
    if (!images.length) return showToast("ยังไม่มีภาพ");
    if (!model) return showToast("AI ยังไม่พร้อม");

    showToast("กำลังประมวลผลภาพด้วย AI ...");
    const predictions = [];
    for (const img of images) {
      const tempImg = document.createElement("img");
      tempImg.src = img.src;
      try {
        const result = await model.classify(tempImg);
        predictions.push({ label: result[0].label, img });
      } catch (err) {
        console.warn("AI classify error:", err);
      }
    }

    // จัดเรียงจากหมวดหมู่ AI
    const order = ["living", "dining", "kitchen", "bedroom", "bathroom", "balcony", "gym", "pool"];
    images = predictions.sort((a, b) => {
      const aiA = order.findIndex(x => a.label.toLowerCase().includes(x));
      const aiB = order.findIndex(x => b.label.toLowerCase().includes(x));
      return (aiA === -1 ? 99 : aiA) - (aiB === -1 ? 99 : aiB);
    }).map(x => x.img);

    renderGrid();
    showToast("AI Sort เสร็จสมบูรณ์ ✅", true);
  };

  // === Export ===
  btnExport.onclick = async () => {
    if (!images.length) return showToast("ไม่มีภาพให้บันทึก");
    showToast("กำลังสร้าง ZIP...");
    const zip = new JSZip();
    const q = parseFloat(document.getElementById("quality").value) || 0.9;

    for (let i = 0; i < images.length; i++) {
      const img = new Image();
      img.src = images[i].src;
      await new Promise(r => (img.onload = r));
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", q));
      zip.file(`${i + 1}.jpg`, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "PHANToM_Sorted.zip");
    showToast("บันทึกเรียบร้อย ✅", true);
  };
});
