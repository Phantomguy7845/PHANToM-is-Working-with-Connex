/* PHANToM Image Sorter — Modified version (2025)
   Drag & Drop + Export JPG/ZIP
   by PHANToM
*/

(async function() {
  const $ = (s) => document.querySelector(s);

  const drop = $("#drop");
  const picker = $("#picker");
  const grid = $("#grid");
  const toast = $("#toast");

  const btnHeu = $("#autoHeu");
  const btnClear = $("#clear");
  const btnExport = $("#exportZip");
  const qualityEl = $("#quality");

  if (!drop || !grid) {
    console.warn("Missing essential DOM. Abort init.");
    return;
  }

  // state: array of { src, name, orientation, cover? }
  let images = [];

  // overlay for full image view
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.background = 'rgba(0,0,0,0.8)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.visibility = 'hidden';
  overlay.style.zIndex = 1000;
  const overlayImg = document.createElement('img');
  overlayImg.style.maxWidth = '90%';
  overlayImg.style.maxHeight = '90%';
  overlayImg.style.borderRadius = '12px';
  overlay.appendChild(overlayImg);
  document.body.appendChild(overlay);
  function showOverlay(src) {
    overlayImg.src = src;
    overlay.style.visibility = 'visible';
  }
  function hideOverlay() {
    overlay.style.visibility = 'hidden';
  }
  overlay.addEventListener('click', hideOverlay);

  function toastMsg(msg, ok=false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = ok ? '#153a1f' : '#0d1b36';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1600);
  }

  // upload handlers
  if (drop) {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      handleFiles(e.dataTransfer.files);
    });
    drop.addEventListener('click', () => picker && picker.click());
  }
  if (picker) {
    picker.addEventListener('change', (e) => handleFiles(e.target.files));
  }

  function handleFiles(fs) {
    const arr = Array.from(fs || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!arr.length) {
      toastMsg('ไม่มีไฟล์ภาพ');
      return;
    }
    arr.forEach((f) => {
      const r = new FileReader();
      r.onload = (ev) => {
        const src = ev.target.result;
        const tmp = new Image();
        tmp.src = src;
        tmp.onload = () => {
          const orientation = tmp.naturalWidth >= tmp.naturalHeight ? 'แนวนอน' : 'แนวตั้ง';
          images.push({ src, name: f.name, orientation });
          render();
        };
        tmp.onerror = () => {
          images.push({ src, name: f.name, orientation: '' });
          render();
        };
      };
      r.readAsDataURL(f);
    });
    toastMsg(`เพิ่มรูป ${arr.length} ไฟล์`, true);
    if (picker) picker.value = '';
  }

  function render() {
    grid.innerHTML = '';
    images.forEach((x, i) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.draggable = true;

      const im = document.createElement('img');
      im.src = x.src;
      im.className = 'thumb';

      const coverBtn = document.createElement('button');
      coverBtn.className = 'cover' + (x.cover ? ' active' : '');
      coverBtn.textContent = 'Cover';
      coverBtn.onclick = () => {
        x.cover = !x.cover;
        coverBtn.classList.toggle('active', x.cover);
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'delbtn';
      delBtn.textContent = 'ลบ';
      delBtn.title = 'ลบรูปนี้';
      delBtn.onclick = () => {
        images.splice(i, 1);
        render();
        toastMsg('ลบรูปแล้ว', true);
      };

      const bar = document.createElement('div');
      bar.className = 'bar';
      const idxEl = document.createElement('div');
      idxEl.className = 'idx';
      idxEl.textContent = i + 1;
      // append index to bar
      bar.appendChild(idxEl);
      // create an orientation label inside the bar so it doesn’t overlap other controls
      if (x.orientation) {
        const orientTag = document.createElement('div');
        // reuse the existing .tag styling for orientation labels
        orientTag.className = 'tag';
        orientTag.textContent = x.orientation;
        bar.appendChild(orientTag);
      }

      // drag reorder events
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', i);
      });
      item.addEventListener('dragover', (e) => e.preventDefault());
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData('text/plain');
        const to = i;
        if (from === to) return;
        const mv = images.splice(from, 1)[0];
        images.splice(to, 0, mv);
        render();
      });

      // zoom button: show overlay on click (no need to hold)
      const zoomBtn = document.createElement('button');
      zoomBtn.className = 'zoombtn';
      zoomBtn.textContent = 'ขยาย';
      zoomBtn.addEventListener('click', () => {
        showOverlay(x.src);
      });

      item.append(im, coverBtn, delBtn, bar, zoomBtn);
      grid.appendChild(item);
    });
  }

  if (btnHeu) {
    btnHeu.addEventListener('click', () => {
      if (!images.length) return toastMsg('ยังไม่มีภาพ');
      images.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
      render();
      toastMsg('เรียงตามชื่อไฟล์แล้ว', true);
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      images = [];
      render();
      toastMsg('ล้างทั้งหมด', true);
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      if (!images.length) return toastMsg('ไม่มีภาพสำหรับส่งออก');
      const q = Math.max(0.6, Math.min(0.95, parseFloat(qualityEl?.value) || 0.9));
      const covers = images.filter((x) => x.cover);
      const rest = images.filter((x) => !x.cover);
      const list = [...covers, ...rest];

      const zip = new JSZip();
      for (let i = 0; i < list.length; i++) {
        const blob = await dataToJpgBlob(list[i].src, q);
        zip.file(`${i + 1}.jpg`, blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      saveAs(out, 'PHANToM_Sorted.zip');
      toastMsg('ส่งออก ZIP เรียบร้อย', true);
    });
  }

  async function dataToJpgBlob(data, q) {
    const im = await dataToImg(data);
    const c = document.createElement('canvas');
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  }

  function dataToImg(data) {
    return new Promise((r) => {
      const im = new Image();
      im.src = data;
      im.onload = () => r(im);
      im.onerror = () => r(new Image());
    });
  }

  console.log('Modified PHANToM Image Sorter Loaded');
})();
