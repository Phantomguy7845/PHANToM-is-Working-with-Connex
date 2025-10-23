/*
PHANToM Image Sorter v3.3
- Heuristic Sort (Basic logic)
- Offline AI (MobileNet Feature Extractor)
- Custom AI (Load model.json + weights.bin)
- UI feedback + Toast system
by PHANToM
*/

console.log("PHANToM Image Sorter Loaded");

const drop = document.getElementById("drop");
const grid = document.getElementById("grid");
const toast = document.getElementById("toast");

let images = [];
let classifier = null;
let customClassifier = null;

// 🔹 แสดงข้อความแจ้งเตือน
function showToast(msg, ok = false) {
  toast.innerText = msg;
  toast.classList.add("show");
  toast.style.background = ok ? "#1b3a1b" : "#0d1b36";
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// 🔹 โหลด Offline AI
async function initOfflineAI() {
  try {
    classifier = ml5.imageClassifier("MobileNet", () => {
      console.log("Offline AI loaded");
      showToast("Offline AI โหลดสำเร็จ ✓", true);
      document.querySelector("#aiStatus").textContent = "โหลดสำเร็จ";
    });
  } catch (e) {
    console.error(e);
    showToast("Offline AI โหลดไม่สำเร็จ ❌");
  }
}

// 🔹 ลากวางรูป
drop.addEventListener("dragover", e => {
  e.preventDefault();
  drop.classList.add("drag");
});
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", e => {
  e.preventDefault();
  drop.classList.remove("drag");
  handleFiles(e.dataTransfer.files);
});

document.getElementById("picker").addEventListener("change", e => {
  handleFiles(e.target.files);
});

// 🔹 แสดงรูปใน Grid
function handleFiles(fileList) {
  grid.innerHTML = "";
  images = [];
  for (let file of fileList) {
    if (!file.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.src = url;
    img.className = "thumb";
    const item = document.createElement("div");
    item.className = "item";
    const cover = document.createElement("button");
    cover.innerText = "Cover";
    cover.className = "cover";
    cover.onclick = () => cover.classList.toggle("active");
    item.appendChild(img);
    item.appendChild(cover);
    grid.appendChild(item);
    images.push({ file, img, cover });
  }
  showToast(`เพิ่มรูป ${images.length} รูป ✓`, true);
}

// 🔹 Heuristic Sort (เรียงเบื้องต้นจากชื่อไฟล์)
function heuristicSort() {
  if (images.length === 0) return showToast("ยังไม่มีรูป");
  images.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
  renderSorted();
  showToast("เรียงรูปตามชื่อไฟล์แล้ว ✓", true);
}

// 🔹 Offline AI Sort (MobileNet)
async function aiSortOffline() {
  if (!classifier) return showToast("Offline AI ยังไม่พร้อม");
  if (images.length === 0) return showToast("ยังไม่มีรูป");

  showToast("กำลังวิเคราะห์รูป...", false);
  const predictions = [];
  for (let img of images) {
    const result = await classifier.classify(img.img);
    predictions.push({ img, label: result[0].label });
  }

  images.sort((a, b) => a.label.localeCompare(b.label));
  renderSorted();
  showToast("AI Offline เรียงรูปสำเร็จ ✓", true);
}

// 🔹 Custom Model Sort (PHANToM Room Trainer)
async function aiSortCustom() {
  if (!customClassifier) return showToast("ยังไม่ได้โหลดโมเดล Custom");
  if (images.length === 0) return showToast("ยังไม่มีรูป");

  showToast("กำลังใช้โมเดล Custom วิเคราะห์...", false);
  for (let img of images) {
    const result = await customClassifier.classify(img.img);
    img.label = result[0].label;
  }
  images.sort((a, b) => a.label.localeCompare(b.label));
  renderSorted();
  showToast("AI Custom เรียงรูปสำเร็จ ✓", true);
}

// 🔹 โหลดโมเดล Custom จาก Room Trainer
async function loadCustomModel() {
  try {
    showToast("กำลังโหลดโมเดล Custom...");
    customClassifier = await ml5.imageClassifier("model.json", () => {
      showToast("โมเดล Custom พร้อมใช้งาน ✓", true);
      document.querySelector("#customStatus").textContent = "โหลดสำเร็จ";
    });
  } catch (e) {
    console.error(e);
    showToast("โหลดโมเดล Custom ไม่สำเร็จ ❌");
  }
}

// 🔹 เคลียร์ทั้งหมด
function clearAll() {
  grid.innerHTML = "";
  images = [];
  showToast("ล้างทั้งหมดแล้ว", true);
}

// 🔹 Export ZIP
async function exportZip() {
  if (images.length === 0) return showToast("ไม่มีรูปให้บันทึก");
  const zip = new JSZip();
  const quality = parseFloat(document.getElementById("quality").value || "0.9");

  let i = 1;
  for (let img of images) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = img.img.naturalWidth;
    canvas.height = img.img.naturalHeight;
    ctx.drawImage(img.img, 0, 0);
    const data = canvas.toDataURL("image/jpeg", quality);
    const base64 = data.split(",")[1];
    zip.file(`${i++}.jpg`, base64, { base64: true });
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "PHANToM_Sorted_Images.zip");
  showToast("ส่งออกไฟล์ ZIP เรียบร้อย ✓", true);
}

// 🔹 Render UI ใหม่
function renderSorted() {
  grid.innerHTML = "";
  let index = 1;
  for (let img of images) {
    const item = document.createElement("div");
    item.className = "item";
    const imageEl = document.createElement("img");
    imageEl.src = img.img.src;
    imageEl.className = "thumb";
    const label = document.createElement("div");
    label.className = "bar";
    label.innerHTML = `<span class="idx">${index++}</span> <span>${img.label || ""}</span>`;
    item.appendChild(imageEl);
    item.appendChild(label);
    grid.appendChild(item);
  }
}

// 🔹 ปุ่มต่างๆ
document.getElementById("autoHeu")?.addEventListener("click", heuristicSort);
document.getElementById("autoAI")?.addEventListener("click", aiSortOffline);
document.getElementById("autoCustom")?.addEventListener("click", aiSortCustom);
document.getElementById("exportZip")?.addEventListener("click", exportZip);
document.getElementById("clear")?.addEventListener("click", clearAll);

// 🔹 โหลด AI อัตโนมัติเมื่อเริ่มต้น
window.addEventListener("load", initOfflineAI);
