/* PHANToM Report Counter — Stable Aurora Edition (Full Fix 2025)
   by PHANToM
   • Text Mode focus stable (multi-line input)
   • Keyboard shortcuts improved
   • Inline count editing + autosave
   • SUM / Import / Export / Copy / Reset fixed
*/

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const tree = $("#tree");
  const addMainBtn = $("#addMain");
  const newMainTitle = $("#newMainTitle");
  const copyBtn = $("#copyReport");
  const resetCountsBtn = $("#resetCounts");
  const resetAllBtn = $("#resetAll");
  const manageSumBtn = $("#manageSum");
  const exportBtn = $("#exportSettings");
  const importInput = $("#importSettings");
  const toast = $("#toast");

  let data = JSON.parse(localStorage.getItem("phantomReportData") || "[]");
  let sumRules = JSON.parse(localStorage.getItem("phantomSumRules") || "[]");

  const saveState = () => {
    localStorage.setItem("phantomReportData", JSON.stringify(data));
  };
  const saveSum = () => {
    localStorage.setItem("phantomSumRules", JSON.stringify(sumRules));
  };

  const toastMsg = (msg, ok = false) => {
    toast.textContent = msg;
    toast.style.background = ok ? "#153a1f" : "#0d1b36";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1400);
  };

  // === Render ===
  function render() {
    tree.innerHTML = "";
    data.forEach((main, mi) => {
      const mainEl = document.createElement("div");
      mainEl.className = "main";
      mainEl.tabIndex = 0;

      const head = document.createElement("div");
      head.className = "head";

      const title = document.createElement("input");
      title.value = main.title;
      title.className = "title";
      title.oninput = () => {
        main.title = title.value.trim();
        saveState();
      };

      const countBox = document.createElement("div");
      countBox.className = "count-box";

      const minus = document.createElement("button");
      minus.textContent = "−";
      const plus = document.createElement("button");
      plus.textContent = "+";
      const num = document.createElement("input");
      num.type = "number";
      num.value = main.count || 0;
      num.className = "count-num";

      minus.onclick = () => {
        main.count = Math.max(0, (main.count || 0) - 1);
        num.value = main.count;
        saveState();
      };
      plus.onclick = () => {
        main.count = (main.count || 0) + 1;
        num.value = main.count;
        saveState();
      };
      num.oninput = () => {
        main.count = parseInt(num.value) || 0;
        saveState();
      };

      countBox.append(minus, num, plus);

      const modeSel = document.createElement("select");
      modeSel.innerHTML = `<option value="count">Count</option><option value="text">Text</option>`;
      modeSel.value = main.mode || "count";
      modeSel.onchange = () => {
        main.mode = modeSel.value;
        saveState();
        render();
      };

      const toggleTel = document.createElement("label");
      toggleTel.className = "toggle";
      const telCheck = document.createElement("input");
      telCheck.type = "checkbox";
      telCheck.checked = !!main.isTelSum;
      telCheck.onchange = () => {
        main.isTelSum = telCheck.checked;
        saveState();
      };
      toggleTel.append(telCheck, document.createTextNode(" นับเป็นโทรรวม"));

      const del = document.createElement("button");
      del.textContent = "🗑";
      del.onclick = () => {
        if (confirm(`ลบหมวด "${main.title}" ?`)) {
          data.splice(mi, 1);
          saveState();
          render();
        }
      };

      head.append(title, countBox, modeSel, toggleTel, del);
      mainEl.appendChild(head);

      if (main.mode === "text") {
        const textWrap = document.createElement("div");
        textWrap.className = "text-mode";
        const area = document.createElement("textarea");
        area.value = (main.lines || []).join("\n");

        let debounceTimer = null;
        area.addEventListener("input", () => {
          clearTimeout(debounceTimer);
          main.lines = area.value.split("\n").map(s => s.trim()).filter(Boolean);
          debounceTimer = setTimeout(() => saveState(), 400);
        });
        area.addEventListener("keydown", e => {
          e.stopPropagation(); // ป้องกันคีย์ลัด global
          if (e.key === "Enter" && !e.shiftKey) return; // ป้องกัน focus หลุด
        });
        textWrap.append(area);
        mainEl.appendChild(textWrap);
      }

      tree.appendChild(mainEl);
    });
  }

  render();

  // === Add new main ===
  addMainBtn.onclick = () => {
    const t = newMainTitle.value.trim();
    if (!t) return toastMsg("กรอกชื่อหมวดก่อน");
    data.push({ title: t, count: 0, mode: "count", lines: [], isTelSum: false });
    newMainTitle.value = "";
    saveState();
    render();
  };

  // === Copy Report ===
  copyBtn.onclick = () => {
    const user = $("#userName").value || "Unknown";
    const date = $("#reportDate").value || new Date().toISOString().slice(0, 10);

    let out = `${user} ${date}\n\n`;
    data.forEach(m => {
      out += `//${m.title}\n`;
      if (m.mode === "count") out += `โทร ${m.count}\n\n`;
      else if (m.mode === "text")
        out += (m.lines || []).map(l => l).join("\n") + "\n\n";
    });

    out += "//////////SUM//////////\n";
    out += sumRules.map(s => `${s.label} ${s.total || 0}`).join("\n");

    navigator.clipboard.writeText(out);
    toastMsg("คัดลอกรายงานแล้ว", true);
  };

  // === Reset Counts ===
  resetCountsBtn.onclick = () => {
    if (!confirm("รีเซ็ตค่าตัวเลขและข้อความทั้งหมดหรือไม่?")) return;
    data.forEach(m => {
      m.count = 0;
      if (m.mode === "text") m.lines = [];
    });
    saveState();
    render();
    toastMsg("รีเซ็ตสำเร็จ", true);
  };

  // === Reset All ===
  resetAllBtn.onclick = () => {
    if (!confirm("ล้างข้อมูลทั้งหมดจริงหรือไม่?")) return;
    data = [];
    sumRules = [];
    localStorage.removeItem("phantomReportData");
    localStorage.removeItem("phantomSumRules");
    render();
    toastMsg("ล้างทั้งหมดแล้ว", true);
  };

  // === Export ===
  exportBtn.onclick = () => {
    const blob = new Blob(
      [JSON.stringify({ data, sumRules }, null, 2)],
      { type: "text/plain" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "PHANToM_Report_Settings.txt";
    a.click();
    toastMsg("Export แล้ว", true);
  };

  // === Import ===
  importInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      data = json.data || [];
      sumRules = json.sumRules || [];
      saveState(); saveSum(); render();
      toastMsg("Import สำเร็จ", true);
    } catch (err) {
      toastMsg("ไฟล์ไม่ถูกต้อง");
    }
  };

  // === Keyboard shortcuts ===
  document.addEventListener("keydown", e => {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return; // ป้องกันชน text
    if (e.key === "+") {
      const last = data[data.length - 1];
      if (last) last.count++;
      saveState(); render();
    }
    if (e.key === "-") {
      const last = data[data.length - 1];
      if (last && last.count > 0) last.count--;
      saveState(); render();
    }
    if (e.ctrlKey && e.key.toLowerCase() === "s") {
      e.preventDefault(); saveState(); toastMsg("บันทึกแล้ว", true);
    }
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault(); copyBtn.click();
    }
  });
})();
