/* PHANToM Image Sorter — TensorFlow Edition (Aurora 2025)
   Offline AI (MobileNetV2) + Custom Model Loader + Heuristic Sort
   by PHANToM
*/
(async function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const drop = $("#drop");
  const picker = $("#picker");
  const grid = $("#grid");
  const toast = $("#toast");

  const aiStatus = $("#aiStatus");
  const customStatus = $("#customStatus");

  const btnHeu = $("#autoHeu");
  const btnAI = $("#autoAI");
  const btnCustom = $("#autoCustom");
  const btnClear = $("#clear");
  const btnExport = $("#exportZip");
  const qualityEl = $("#quality");

  if (!drop || !grid) {
    console.warn("Missing essential DOM. Abort init.");
    return;
  }

  /** state */
  let images = []; // {src, name, label?, conf?, cover?}
  let offlineModel = null;
  let offlineReady = false;

  let customModel = null;
  let customReady = false;

  /** toast */
  function toastMsg(msg, ok = false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = ok ? "#153a1f" : "#0d1b36";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1600);
  }

  /** upload handlers */
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
  drop.addEventListener("click", () => picker.click());
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
    picker.value = ""; // reset for next choose
  }

  /** render grid */
  function render() {
    grid.innerHTML = "";
    images.forEach((x, i) => {
      const item = document.createElement("div");
      item.className = "item";
      item.draggable = true;

      const im = document.createElement("img");
      im.src = x.src;
      im.className = "thumb";

      // cover toggle
      const cover = document.createElement("button");
      cover.className = "cover" + (x.cover ? " active" : "");
      cover.textContent = "Cover";
      cover.onclick = () => {
        x.cover = !x.cover;
        cover.classList.toggle("active", x.cover);
      };

      // delete button
      const del = document.createElement("button");
      del.className = "delbtn";
      del.textContent = "ลบ";
      del.title = "ลบรูปนี้";
      del.onclick = () => {
        images.splice(i, 1);
        render();
        toastMsg("ลบรูปแล้ว", true);
      };

      const bar = document.createElement("div");
      bar.className = "bar";
      const idx = document.createElement("div");
      idx.className = "idx";
      idx.textContent = i + 1;
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = x.label
        ? `${x.label}${x.conf ? ` (${Math.round(x.conf * 100)}%)` : ""}`
        : "";
      bar.append(idx, tag);

      // drag reorder
      item.addEventListener("dragstart", (e) =>
        e.dataTransfer.setData("text/plain", i)
      );
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain");
        const to = i;
        if (from === to) return;
        const mv = images.splice(from, 1)[0];
        images.splice(to, 0, mv);
        render();
      });

      item.append(im, cover, del, bar);
      grid.appendChild(item);
    });
  }

  /** heuristic sort (by filename) */
  btnHeu.addEventListener("click", () => {
    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    images.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { numeric: true })
    );
    render();
    toastMsg("เรียงตามชื่อไฟล์แล้ว", true);
  });

  /** ensure offline AI (MobileNet V2) */
  async function ensureOffline() {
    if (offlineReady && offlineModel) return true;
    try {
      aiStatus.textContent = "Offline AI: กำลังโหลด…";
      await tf.ready();

      // URL ปกติของ MobileNetV2 (หากมีปัญหา 404 จะลองสำรอง)
      const urls = [
        "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v2_1.0_224/model.json",
        "https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json"
      ];

      let loaded = null;
      let lastErr = null;
      for (const u of urls) {
        try {
          loaded = await tf.loadLayersModel(u);
          if (loaded) break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!loaded) throw lastErr || new Error("ไม่สามารถโหลด MobileNetV2");

      offlineModel = loaded;
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

  /** run offline AI */
  btnAI.addEventListener("click", async () => {
    if (!images.length) return toastMsg("ยังไม่มีภาพ");
    const ok = await ensureOffline();
    if (!ok) return;

    for (let i = 0; i < images.length; i++) {
      const t = await dataToTensor(images[i].src);
      try {
        const pred = offlineModel.predict(t);
        const probs = await pred.data();
        const labelIndex = argMax(probs);
        images[i].label = `cls_${labelIndex}`;
        images[i].conf = probs[labelIndex] || 0;
        tf.dispose(pred);
      } catch (e) {
        console.warn("predict error", e);
        images[i].label = images[i].label || "other";
        images[i].conf = images[i].conf || 0;
      } finally {
        tf.dispose(t);
      }
      await tf.nextFrame();
    }

    // simple: sort by confidence desc
    images.sort((a, b) => (b.conf || 0) - (a.conf || 0));
    render();
    toastMsg("Offline AI Sort สำเร็จ", true);
  });

  /** custom model (model.json + weights.bin) */
  btnCustom.addEventListener("click", async (evt) => {
    try {
      // ต้องกด 1 ครั้งเพื่อเลือก 2 ไฟล์ (multiple)
      const files = await pickFiles(".json,.bin", true);
      if (!files || !files.length) return;

      // หา .json และ .bin
      let jsonFile = null, binFile = null;
      for (const f of files) {
        if (f.name.toLowerCase().endsWith(".json")) jsonFile = f;
        if (f.name.toLowerCase().endsWith(".bin")) binFile = f;
      }
      if (!jsonFile || !binFile) {
        toastMsg("โปรดเลือกทั้งไฟล์ .json และ .bin");
        return;
      }

      // โหลดด้วย browserFiles (แก้ปัญหา blob: และ CORS)
      customModel = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, binFile]));
      customReady = true;
      customStatus.textContent = "Custom Model: พร้อมใช้งาน";
      customStatus.style.color = "#22c55e";
      toastMsg("โหลด Custom Model สำเร็จ", true);
    } catch (e) {
      console.error(e);
      toastMsg("โหลดโมเดลไม่สำเร็จ");
      return;
    }

    if (!images.length) return toastMsg("ยังไม่มีภาพ");

    for (let i = 0; i < images.length; i++) {
      const t = await dataToTensor(images[i].src);
      try {
        const pred = customModel.predict(t);
        const probs = await pred.data();
        const labelIndex = argMax(probs);
        images[i].label = `cls_${labelIndex}`;
        images[i].conf = probs[labelIndex] || 0;
        tf.dispose(pred);
      } catch (e) {
        console.warn("custom predict error", e);
        images[i].label = images[i].label || "other";
        images[i].conf = images[i].conf || 0;
      } finally {
        tf.dispose(t);
      }
      await tf.nextFrame();
    }
    images.sort((a, b) => (b.conf || 0) - (a.conf || 0));
    render();
    toastMsg("Custom Model Sort สำเร็จ", true);
  });

  /** export zip */
  btnExport.addEventListener("click", async () => {
    if (!images.length) return toastMsg("ไม่มีภาพสำหรับส่งออก");
    const q = Math.max(0.6, Math.min(0.95, parseFloat(qualityEl?.value) || 0.9));
    const covers = images.filter((x) => x.cover);
    const rest = images.filter((x) => !x.cover);
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

  /** clear */
  btnClear.addEventListener("click", () => {
    images = [];
    render();
    toastMsg("ล้างทั้งหมด", true);
  });

  /** helpers */
  function argMax(arr) {
    let m = -Infinity, idx = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > m) { m = arr[i]; idx = i; }
    }
    return idx;
  }

  function dataToTensor(data) {
    return new Promise((res) => {
      const img = new Image();
      img.src = data;
      img.onload = () => {
        const t = tf.tidy(() =>
          tf.image
            .resizeBilinear(tf.browser.fromPixels(img), [224, 224])
            .expandDims(0)
            .toFloat()
            .div(tf.scalar(127))
            .sub(tf.scalar(1))
        );
        res(t);
      };
      img.onerror = () => res(tf.zeros([1, 224, 224, 3]));
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
      im.onerror = () => r(new Image());
    });
  }

  // show file picker (must be called under user gesture)
  function pickFiles(accept, multiple = false) {
    return new Promise((res) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = accept;
      inp.multiple = multiple;
      inp.onchange = (e) => {
        const files = Array.from(e.target.files || []);
        res(files);
        inp.remove();
      };
      document.body.appendChild(inp);
      inp.click();
    });
  }

  // 初期メッセージ
  console.log("PHANToM Image Sorter Loaded");
})();
