// ============================================================
// PHANToM Image Sorter v3.4
// Offline AI + Google Vision + Heuristic
// ============================================================

window.addEventListener("load", async () => {
  console.log("PHANToM Image Sorter Loaded");

  const dropZone = document.getElementById("drop");
  const picker = document.getElementById("picker");
  const grid = document.getElementById("grid");
  const toast = document.getElementById("toast");
  const aiLocalEl = document.getElementById("aiLocal");
  const aiCustomEl = document.getElementById("aiCustom");
  const modeRadios = document.getElementsByName("mode");
  const exportBtn = document.getElementById("exportZip");
  const autoHeuBtn = document.getElementById("autoHeu");
  const autoAIBtn = document.getElementById("autoAI");
  const autoCustomBtn = document.getElementById("autoCustom");
  const clearBtn = document.getElementById("clear");
  const qualityInput = document.getElementById("quality");
  const saveKeyBtn = document.getElementById("saveKey");
  const apiKeyInput = document.getElementById("apiKey");
  const keyState = document.getElementById("keyState");

  let files = [];
  let mode = "condo";
  let model = null;
  let classifier = null;
  let googleApiKey = localStorage.getItem("phantom_api_key") || "";
  let localAIReady = false;

  if (apiKeyInput) apiKeyInput.value = googleApiKey;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function refreshGrid() {
    grid.innerHTML = "";
    files.forEach((f, i) => {
      const div = document.createElement("div");
      div.className = "item";
      div.draggable = true;
      div.innerHTML = `
        <img src="${f.url}" class="thumb"/>
        <div class="bar">
          <div class="idx">${i + 1}</div>
          <div class="tags">
            ${(f.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}
          </div>
        </div>
        <div class="cover ${f.cover ? "active" : ""}">Cover</div>
      `;
      const coverBtn = div.querySelector(".cover");
      coverBtn.addEventListener("click", () => {
        f.cover = !f.cover;
        coverBtn.classList.toggle("active", f.cover);
      });
      grid.appendChild(div);
    });
  }

  // ---------- Drag & Drop Upload ----------
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
  picker.addEventListener("change", e => handleFiles(e.target.files));

  function handleFiles(list) {
    for (let f of list) {
      if (!f.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(f);
      files.push({ file: f, url, name: f.name });
    }
    refreshGrid();
    showToast("เพิ่มรูปภาพแล้ว");
  }

  // ---------- Clear ----------
  clearBtn.addEventListener("click", () => {
    files = [];
    refreshGrid();
    showToast("ล้างทั้งหมดแล้ว");
  });

  // ---------- Save API Key ----------
  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem("phantom_api_key", key);
      googleApiKey = key;
      keyState.textContent = "บันทึกแล้ว ✓";
    } else {
      keyState.textContent = "กรุณาใส่ API Key";
    }
  });

  // ---------- Mode ----------
  modeRadios.forEach(r => {
    r.addEventListener("change", () => {
      mode = r.value;
      showToast("เปลี่ยนโหมดเป็น: " + (mode === "condo" ? "คอนโด" : "บ้าน"));
    });
  });

  // ---------- Offline AI Loading ----------
  async function loadOfflineAI() {
    try {
      if (!window.ml5) {
        aiLocalEl.textContent = "โหลด ml5.js...";
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/ml5@0.12.2/dist/ml5.min.js";
          s.onload = res;
          s.onerror = rej;
          document.body.appendChild(s);
        });
      }
      aiLocalEl.textContent = "กำลังโหลดโมเดล…";
      classifier = await ml5.imageClassifier("MobileNet", () => {
        aiLocalEl.textContent = "พร้อมใช้งาน ✓";
        localAIReady = true;
        console.log("Offline AI ready");
      });
    } catch (e) {
      aiLocalEl.textContent = "โหลดไม่สำเร็จ ❌";
      console.error("Offline AI error:", e);
      localAIReady = false;
    }
  }

  await loadOfflineAI();

  // ---------- Auto-sort (Heuristic) ----------
  autoHeuBtn.addEventListener("click", () => {
    if (!files.length) return showToast("ไม่มีภาพในรายการ");
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    refreshGrid();
    showToast("เรียงตามชื่อไฟล์แล้ว");
  });

  // ---------- Auto-sort (Offline AI) ----------
  autoAIBtn.addEventListener("click", async () => {
    if (!localAIReady || !classifier) return showToast("Offline AI ยังไม่พร้อม");
    if (!files.length) return showToast("ไม่มีภาพให้วิเคราะห์");

    showToast("กำลังวิเคราะห์ภาพด้วย Offline AI…");

    for (const f of files) {
      try {
        const img = document.createElement("img");
        img.src = f.url;
        await new Promise(res => (img.onload = res));
        const results = await classifier.classify(img);
        f.tags = [results[0].label];
      } catch (err) {
        console.error("AI classify error:", err);
      }
    }
    refreshGrid();
    showToast("วิเคราะห์เสร็จแล้ว (Offline AI)");
  });

  // ---------- Export ZIP ----------
  exportBtn.addEventListener("click", async () => {
    if (!files.length) return showToast("ไม่มีภาพจะบันทึก");
    const zip = new JSZip();
    const q = parseFloat(qualityInput.value) || 0.9;
    let idx = 1;
    for (const f of files) {
      const blob = await fetch(f.url).then(r => r.blob());
      const canvas = document.createElement("canvas");
      const img = await createImageBitmap(blob);
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const jpg = await new Promise(r => canvas.toBlob(r, "image/jpeg", q));
      zip.file(`${idx++}.jpg`, jpg);
    }
    const out = await zip.generateAsync({ type: "blob" });
    saveAs(out, "PHANToM_Sorted.zip");
    showToast("บันทึก ZIP เรียบร้อย");
  });

  console.log("PHANToM Sorter initialized successfully");
});
