/* PHANToM Image Sorter — TensorFlow Edition (Aurora 2025)
   Offline AI (MobileNetV2) + Custom Model Loader + Heuristic Sort
   by PHANToM
*/
(async function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const drop = $("#drop"),
    picker = $("#picker"),
    grid = $("#grid"),
    toast = $("#toast"),
    aiStatus = $("#aiStatus"),
    customStatus = $("#customStatus"),
    btnHeu = $("#autoHeu"),
    btnAI = $("#autoAI"),
    btnCustom = $("#autoCustom"),
    btnClear = $("#clear"),
    btnExport = $("#exportZip"),
    qualityEl = $("#quality");

  if (!drop || !grid) {
    console.warn("Missing essential DOM. Abort init.");
    return;
  }

  let images = []; // {src, name, label?, conf?, cover?}
  let offlineModel = null;
  let customModel = null;
  let offlineReady = false;
  let customReady = false;

  // --- Toast ---
  function toastMsg(msg, ok = false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = ok ? "#153a1f" : "#0d1b36";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1600);
  }

  // --- Upload ---
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  });
  picker.addEventListener("change", (e) => handleFiles(e.target.files));

  function handleFiles(fs) {
    const arr = Array.from(fs || []).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) {
      toastMsg("ไม่มีไฟล์ภาพ");
      return;
    }
    arr.forEach((f) => {
      const r = new FileReader();
      r.onload = (ev) => {
        images.push({ src: ev.target.result, name: f.name });
        render();
      };
      r.readAsDataURL(f);
    });
    toastMsg(`เพิ่มรูป ${arr.length} ไฟล์`, true);
  }

  // --- Render Grid ---
  function render() {
    grid.innerHTML = "";
    images.forEach((x, i) => {
      const item = document.createElement("div");
      item.className = "item";
      item.draggable = true;

      const im = document.createElement("img");
      im.src = x.src;
      im.className = "thumb";

      const cover = document.createElement("button");
      cover.className = "cover" + (x.cover ? " active" : "");
      cover.textContent = "Cover";
      cover.onclick = () => {
        x.cover = !x.cover;
        cover.classList.toggle("active", x.cover);
      };

      const bar = document.createElement("div");
      bar.className = "bar";
      const idx = document.createElement("div");
      idx.textContent = i + 1;
      const tag = document.createElement("div");
      tag.textContent = x.label
        ? `${x.label}${x.conf ? ` (${Math.round(x.conf * 100)}%)` : ""}`
        : "";
      bar.append(idx, tag);

      item.addEventListener("dragstart", (e) =>
        e.dataTransfer.setData("text/plain", i)
      );
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain"),
          to = i;
        const mv = images.splice(from, 1)[0];
        images.splice(to, 0, mv);
        render();
      });

      item.append(im, cover, bar);
      grid.appendChild(item);
    });
  }

  // --- Heuristic Sort ---
  btnHeu.addEventListener("click", () => {
    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    images.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { numeric: true })
    );
    render();
    toastMsg("เรียงตามชื่อไฟล์แล้ว", true);
  });

  // --- Load Offline AI (TensorFlow MobileNetV2) ---
  async function ensureOffline() {
    if (offlineReady && offlineModel) return true;
    try {
      aiStatus.textContent = "Offline AI: กำลังโหลด…";
      await tf.ready();
      offlineModel = await tf.loadLayersModel(
        "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v2_1.0_224/model.json"
      );
      offlineReady = true;
      aiStatus.textContent = "Offline AI: พร้อมใช้งาน";
      aiStatus.style.color = "#22c55e";
      toastMsg("Offline AI พร้อม", true);
      return true;
    } catch (e) {
      console.error("Offline AI load error", e);
      aiStatus.textContent = "Offline AI: โหลดไม่สำเร็จ";
      aiStatus.style.color = "#ef4444";
      toastMsg("โหลด Offline AI ไม่สำเร็จ");
      return false;
    }
  }

  // --- Run Offline AI ---
  btnAI.addEventListener("click", async () => {
    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    const ok = await ensureOffline();
    if (!ok) return;

    for (let i = 0; i < images.length; i++) {
      const img = await dataToTensor(images[i].src);
      const pred = offlineModel.predict(img);
      const probs = await pred.data();
      const labelIndex = probs.indexOf(Math.max(...probs));
      const label = `cls_${labelIndex}`;
      images[i].label = label;
      images[i].conf = probs[labelIndex] || 0;
      await tf.nextFrame();
    }

    images.sort((a, b) => b.conf - a.conf);
    render();
    toastMsg("Offline AI Sort สำเร็จ", true);
  });

  // --- Load Custom Model ---
  btnCustom.addEventListener("click", async () => {
    try {
      const jsonFile = await pickFile(".json");
      const binFile = await pickFile(".bin");
      if (!jsonFile || !binFile) return toastMsg("ยกเลิกการโหลดโมเดล");

      const modelURL = URL.createObjectURL(jsonFile);
      const weightsURL = URL.createObjectURL(binFile);
      customModel = await tf.loadLayersModel(modelURL);
      customReady = true;
      customStatus.textContent = "Custom Model: พร้อมใช้งาน";
      customStatus.style.color = "#22c55e";
      toastMsg("โหลด Custom Model สำเร็จ", true);
    } catch (e) {
      console.error(e);
      toastMsg("โหลดโมเดลไม่สำเร็จ");
    }

    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    for (let i = 0; i < images.length; i++) {
      const img = await dataToTensor(images[i].src);
      const pred = customModel.predict(img);
      const probs = await pred.data();
      const labelIndex = probs.indexOf(Math.max(...probs));
      const label = `cls_${labelIndex}`;
      images[i].label = label;
      images[i].conf = probs[labelIndex] || 0;
      await tf.nextFrame();
    }
    images.sort((a, b) => b.conf - a.conf);
    render();
    toastMsg("Custom Model Sort สำเร็จ", true);
  });

  // --- Export ZIP ---
  btnExport.addEventListener("click", async () => {
    if (!images.length) return toastMsg("ไม่มีภาพสำหรับส่งออก");
    const q = Math.max(
      0.6,
      Math.min(0.95, parseFloat(qualityEl?.value) || 0.9)
    );
    const covers = images.filter((x) => x.cover),
      rest = images.filter((x) => !x.cover);
    const list = [...covers, ...rest];
    const zip = new JSZip();
    for (let i = 0; i < list.length; i++) {
      const blob = await dataToJpgBlob(list[i].src, q);
      zip.file(`${i + 1}.jpg`, blob);
    }
    const out = await zip.generateAsync({ type: "blob" });
    saveAs(out, "PHANToM_Sorted.zip");
    toastMsg("ส่งออก ZIP เรียบร้อย", true);
  });

  // --- Clear ---
  btnClear.addEventListener("click", () => {
    images = [];
    render();
    toastMsg("ล้างทั้งหมด", true);
  });

  // --- Helper Functions ---
  function dataToTensor(data) {
    return new Promise((res) => {
      const img = new Image();
      img.src = data;
      img.onload = () => {
        const tensor = tf.tidy(() =>
          tf.image
            .resizeBilinear(tf.browser.fromPixels(img), [224, 224])
            .expandDims(0)
            .toFloat()
            .div(tf.scalar(127))
            .sub(tf.scalar(1))
        );
        res(tensor);
      };
    });
  }

  async function dataToJpgBlob(data, q) {
    const im = await dataToImg(data);
    const c = document.createElement("canvas");
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    c.getContext("2d").drawImage(im, 0, 0);
    return await new Promise((res) => c.toBlob(res, "image/jpeg", q));
  }

  function dataToImg(data) {
    return new Promise((r) => {
      const im = new Image();
      im.src = data;
      im.onload = () => r(im);
    });
  }

  function pickFile(accept) {
    return new Promise((res) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = accept;
      inp.onchange = (e) => res(e.target.files[0] || null);
      inp.click();
    });
  }
})();
