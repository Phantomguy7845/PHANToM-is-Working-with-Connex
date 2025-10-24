/* PHANToM Report Counter — Focus Navigation Edition (Aurora 2025 · Fixed Buttons) */

(function () {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  // ---- DOM Refs ----
  const treeEl = $("#tree");
  const toastEl = $("#toast");
  const userNameEl = $("#userName");
  const dateEl = $("#reportDate");
  const addMainBtn = $("#addMain");
  const newMainTitleEl = $("#newMainTitle");
  const copyBtn = $("#copyReport");
  const resetCountsBtn = $("#resetCounts");
  const resetAllBtn = $("#resetAll");
  const exportBtn = $("#exportSettings");
  const importInput = $("#importSettings");
  const dailySummaryEl = $("#dailySummary");

  // ---- Storage Key ----
  const LS_KEY = "PHANTOM_REPORT_STATE_V4";

  // ---- State ----
  let state = loadState() || defaultState();
  let focusPath = [];
  let flatFocusList = [];

  // ---- Init ----
  initUI();
  render();

  // =========================== INIT ===========================
  function initUI() {
    userNameEl.value = state.userName || "";
    userNameEl.addEventListener("input", () => {
      state.userName = userNameEl.value.trim();
      saveState();
    });

    if (!state.reportDate) {
      dateEl.value = isoDate();
      state.reportDate = dateEl.value;
    } else dateEl.value = state.reportDate;

    dateEl.addEventListener("change", () => {
      state.reportDate = dateEl.value || isoDate();
      saveState();
    });

    addMainBtn.addEventListener("click", onAddMain);
    copyBtn.addEventListener("click", onCopyReport);
    resetCountsBtn.addEventListener("click", onResetCounts);
    resetAllBtn.addEventListener("click", onResetAll);
    exportBtn?.addEventListener("click", onExportSettings);
    importInput?.addEventListener("change", onImportSettings);

    document.addEventListener("keydown", onGlobalKeyDown, true);
    treeEl.addEventListener("click", () => treeEl.focus());
  }

  // =========================== RENDER ===========================
  function render() {
    treeEl.innerHTML = "";
    flatFocusList = [];
    state.categories.forEach((main, mi) => {
      const mainEl = renderMain(main, mi);
      treeEl.appendChild(mainEl);
    });
    updateDailySummary();
    saveState();
    highlightFocus();
  }

  function renderMain(main, mi) {
    const node = el("div", "node main");
    node.dataset.level = "0";
    node.dataset.path = pathKey([mi]);

    const title = el("div", "title", main.title);
    title.ondblclick = () => renameNode(main);

    const typeSel = el("select");
    typeSel.innerHTML = `<option value="count">Count</option><option value="text">Text</option>`;
    typeSel.value = main.type || "count";
    typeSel.addEventListener("change", () => {
      main.type = typeSel.value;
      saveState();
      render();
    });

    const asCall = el("label", "toggle");
    const chk = el("input");
    chk.type = "checkbox";
    chk.checked = !!main.useAsCall;
    chk.addEventListener("change", () => {
      main.useAsCall = chk.checked;
      saveState();
    });
    asCall.append(chk, el("span", null, "นับเป็นโทรรวม"));

    const countWrap = el("div", "countWrap");
    if (main.type === "count") {
      const val = el("div", "count", String(main.count || 0));
      val.title = "คลิกเพื่อแก้ไขตัวเลขโดยตรง";
      val.addEventListener("click", () => inlineNumberEdit(val, main));
      const minus = miniBtn("−", () => inc(main, -1));
      const plus = miniBtn("+", () => inc(main, +1));
      countWrap.append(minus, val, plus);
    } else {
      const ta = el("textarea", "textbox");
      ta.placeholder = "พิมพ์ข้อความ (1 บรรทัด = 1 นับ)";
      ta.value = (main.lines || []).join("\n");
      ta.addEventListener("keydown", (e) => e.stopPropagation());
      ta.addEventListener("input", () => {
        main.lines = ta.value.split("\n").map(s => s.trim()).filter(Boolean);
        saveState();
        updateDailySummary();
      });
      countWrap.append(ta);
    }

    const ops = el("div", "ops");
    ops.append(
      ghostBtn("↑", () => moveMain(mi, -1)),
      ghostBtn("↓", () => moveMain(mi, +1)),
      dangerBtn("ลบ", () => delMain(mi))
    );

    const head = el("div", "header");
    head.append(title, typeSel, asCall, countWrap, ops);

    const addRow = el("div", "row");
    const subName = el("input"); subName.placeholder = "เพิ่มหมวดย่อย…";
    const subType = el("select");
    subType.innerHTML = `<option value="count">Count</option><option value="text">Text</option>`;
    const addBtn = el("button", "btn", "เพิ่มย่อย");
    addBtn.addEventListener("click", () => {
      const t = (subName.value || "").trim();
      if (!t) return toast("กรอกชื่อหมวดย่อยก่อน");
      addChild(main, t, subType.value);
      subName.value = "";
    });
    addRow.append(subName, subType, addBtn);

    node.append(head, addRow);

    if ((main.children || []).length) node.append(renderChildren(main, [mi], 1));

    registerFocusable(node, [mi]);
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      setFocusPath([mi], true);
    });

    return node;
  }

  function renderChildren(parentNode, parentPath, level) {
    const wrap = el("div", "children");
    (parentNode.children || []).forEach((child, idx) => {
      wrap.append(renderSub(parentNode, child, [...parentPath, idx], level));
    });
    return wrap;
  }

  function renderSub(parent, nodeData, path, level) {
    const node = el("div", "node");
    node.dataset.level = String(level);
    node.dataset.path = pathKey(path);

    const title = el("div", "title", nodeData.title);
    title.ondblclick = () => renameNode(nodeData);

    const badge = el("span", "mtype", nodeData.type === "text" ? "Text" : "Count");

    const countWrap = el("div", "countWrap");
    if (nodeData.type === "count") {
      const val = el("div", "count", String(nodeData.count || 0));
      val.addEventListener("click", () => inlineNumberEdit(val, nodeData));
      const minus = miniBtn("−", () => inc(nodeData, -1));
      const plus = miniBtn("+", () => inc(nodeData, +1));
      countWrap.append(minus, val, plus);
    } else {
      const ta = el("textarea", "textbox");
      ta.placeholder = "พิมพ์แยกบรรทัด (1 บรรทัด = 1 นับ)";
      ta.value = (nodeData.lines || []).join("\n");
      ta.addEventListener("keydown", (e) => e.stopPropagation());
      ta.addEventListener("input", () => {
        nodeData.lines = ta.value.split("\n").map(s => s.trim()).filter(Boolean);
        saveState();
        updateDailySummary();
      });
      countWrap.append(ta);
    }

    const ops = el("div", "ops");
    ops.append(
      ghostBtn("↑", () => moveChild(parent, path, -1)),
      ghostBtn("↓", () => moveChild(parent, path, +1)),
      dangerBtn("ลบ", () => delChild(parent, path))
    );

    const head = el("div", "sub-header");
    head.append(title, badge, countWrap, ops);
    node.append(head);

    if ((nodeData.children || []).length) node.append(renderChildren(nodeData, path, level + 1));

    registerFocusable(node, path);
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      setFocusPath(path, true);
    });

    return node;
  }

  // =========================== FOCUS ===========================
  function registerFocusable(elm, path) {
    flatFocusList.push({ path: path.slice(), el: elm });
  }

  function onGlobalKeyDown(e) {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA";
    if (typing) return;

    if (e.key === "+" || e.key === "=") { incFocused(+1); e.preventDefault(); return; }
    if (e.key === "-" || e.key === "_") { incFocused(-1); e.preventDefault(); return; }
    if (e.key === "ArrowDown") { moveFocusFlat(+1); e.preventDefault(); return; }
    if (e.key === "ArrowUp") { moveFocusFlat(-1); e.preventDefault(); return; }
    if (e.key === "ArrowRight") {
      const cur = getNodeByPath(focusPath);
      if (cur && Array.isArray(cur.children) && cur.children.length > 0) setFocusPath([...focusPath, 0], true);
      e.preventDefault(); return;
    }
    if (e.key === "ArrowLeft") {
      if (focusPath.length > 1) setFocusPath(focusPath.slice(0, -1), true);
      e.preventDefault(); return;
    }
  }

  function setFocusPath(path, scrollIntoView = false) {
    focusPath = path.slice();
    highlightFocus(scrollIntoView);
  }

  function highlightFocus(scrollIntoView = false) {
    $$(".node").forEach(n => n.classList.remove("selected"));
    if (!focusPath.length) return;
    const key = pathKey(focusPath);
    const el = $(`.node[data-path="${css(key)}"]`);
    if (el) {
      el.classList.add("selected");
      if (scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function moveFocusFlat(delta) {
    if (flatFocusList.length === 0) return;
    let idx = 0;
    if (focusPath.length) {
      const curKey = pathKey(focusPath);
      idx = flatFocusList.findIndex(x => pathKey(x.path) === curKey);
      if (idx < 0) idx = 0;
    }
    let ni = Math.max(0, Math.min(flatFocusList.length - 1, idx + delta));
    setFocusPath(flatFocusList[ni].path, true);
  }

  function incFocused(delta) {
    if (!focusPath.length) return;
    const node = getNodeByPath(focusPath);
    if (!node || node.type !== "count") return;
    inc(node, delta);
  }

  // =========================== DATA OPS ===========================
  function defaultState() {
    return { userName: "", reportDate: isoDate(), categories: [], sumRules: [] };
  }

  function addChild(parent, title, type) {
    parent.children = parent.children || [];
    parent.children.push({
      id: uid(),
      title,
      type: type === "text" ? "text" : "count",
      count: 0,
      lines: [],
      children: []
    });
    saveState(); render();
  }

  function onAddMain() {
    const t = (newMainTitleEl.value || "").trim();
    if (!t) return toast("กรุณาใส่ชื่อหมวดหลัก");
    state.categories.push({ id: uid(), title: t, type: "count", count: 0, lines: [], useAsCall: false, children: [] });
    newMainTitleEl.value = ""; saveState(); render();
  }

  function moveMain(i, dir) {
    const ni = i + dir; if (ni < 0 || ni >= state.categories.length) return;
    const x = state.categories.splice(i, 1)[0];
    state.categories.splice(ni, 0, x);
    saveState(); render();
  }

  function moveChild(parent, path, dir) {
    const idx = path[path.length - 1]; const ni = idx + dir;
    if (ni < 0 || ni >= (parent.children || []).length) return;
    const x = parent.children.splice(idx, 1)[0];
    parent.children.splice(ni, 0, x);
    saveState(); render();
  }

  function delMain(i) {
    if (!confirm(`ลบหมวด "${state.categories[i].title}" ?`)) return;
    state.categories.splice(i, 1); saveState(); render();
  }

  function delChild(parent, path) {
    const idx = path[path.length - 1];
    if (!confirm(`ลบ "${parent.children[idx].title}" ?`)) return;
    parent.children.splice(idx, 1); saveState(); render();
  }

  function renameNode(node) {
    const nv = prompt("แก้ไขชื่อ:", node.title);
    if (!nv) return; node.title = nv.trim(); saveState(); render();
  }

  function inc(node, delta) { node.count = Math.max(0, (node.count || 0) + delta); saveState(); render(); }

  // =========================== RESET ===========================
  function onResetCounts() {
    if (!confirm("รีเซ็ตค่าประจำวัน ?")) return;
    state.categories.forEach(resetCountsOnlyNode);
    saveState(); render(); toast("รีเซ็ตค่าประจำวันแล้ว");
  }

  function onResetAll() {
    if (!confirm("ล้างทุกอย่าง ?")) return;
    state = defaultState(); saveState(); render(); toast("ล้างทั้งหมดแล้ว");
  }

  function resetCountsOnlyNode(node) {
    if (node.type === "count") node.count = 0; else node.lines = [];
    (node.children || []).forEach(resetCountsOnlyNode);
  }

  // =========================== REPORT ===========================
  function onCopyReport() {
    const t = buildReport(); copy(t).then(() => toast("คัดลอก Report แล้ว"));
  }

  function updateDailySummary() {
    const summaries = state.categories.map(c => `${c.title} ${calcCount(c)}`);
    dailySummaryEl && (dailySummaryEl.textContent = summaries.slice(0, 3).join(" | ") || "—");
  }

  function buildReport() {
    const name = (state.userName || "PHANToM").trim();
    const d = new Date(dateEl.value);
    const header = `${name} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const lines = [header, ""];
    state.categories.forEach(main => {
      const total = calcCount(main);
      lines.push(`//${main.title}${total > 0 ? ` ${total}` : ""}`);
      appendSubLines(lines, main);
      if (main.type === "text" && (main.lines || []).length) main.lines.forEach(t => lines.push(t));
      lines.push("");
    });
    lines.push("//////////SUM//////////");
    lines.push("โทรรวม " + calcCalls());
    return lines.join("\n");
  }

  function appendSubLines(lines, node) {
    (node.children || []).forEach(ch => {
      const cnt = calcCount(ch);
      lines.push(`${ch.title} ${cnt}`);
      if (ch.type === "text" && (ch.lines || []).length) ch.lines.forEach(t => lines.push(t));
      if ((ch.children || []).length) appendSubLines(lines, ch);
    });
  }

  function calcCount(node) {
    const own = node.type === "count" ? (node.count || 0) : (node.lines?.length || 0);
    return (node.children || []).reduce((a, c) => a + calcCount(c), own);
  }

  function calcCalls() {
    return state.categories.filter(m => m.useAsCall).reduce((a, m) => a + calcCount(m), 0);
  }

  // =========================== EXPORT / IMPORT =========================
  function onExportSettings() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "PHANToM_Report_Counter_Settings.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
    toast("Export เรียบร้อย");
  }

  function onImportSettings(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const obj = JSON.parse(String(ev.target.result || "{}"));
        if (!obj || !Array.isArray(obj.categories)) throw new Error("invalid");
        state = obj; saveState(); render(); toast("Import เรียบร้อย");
      } catch { toast("ไฟล์ .txt ไม่ถูกต้อง"); }
      importInput.value = "";
    };
    r.readAsText(f);
  }

  // =========================== INLINE EDIT =========================
  function inlineNumberEdit(host, node) {
    const old = node.count || 0;
    const inp = el("input");
    inp.type = "number";
    inp.value = String(old);
    host.innerHTML = "";
    host.appendChild(inp);
    inp.focus();
    inp.select();
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commit();
      if (e.key === "Escape") cancel();
    });
    inp.addEventListener("blur", commit);

    function commit() {
      const n = Math.max(0, parseInt(inp.value || "0", 10));
      node.count = n;
      saveState();
           render();
    }
    function cancel() {
      render();
    }
  }

  // =========================== HELPERS ===========================
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function el(tag, cls, txt) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (txt != null) x.textContent = txt;
    return x;
  }
  function pathKey(path) { return path.join("."); }
  function getNodeByPath(path) {
    if (!path || !path.length) return null;
    let cur = state.categories[path[0]];
    for (let i = 1; i < path.length; i++) {
      if (!cur || !cur.children) return null;
      cur = cur.children[path[i]];
    }
    return cur || null;
  }
  function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function loadState() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; } }
  function isoDate() { const d = new Date(); return d.toISOString().split("T")[0]; }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function css(s) { return (s || "").replace(/"/g, "&quot;"); }

  function toast(t) {
    if (!toastEl) return;
    toastEl.textContent = t;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 1500);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  // ✅ ปุ่มย่อยที่หายไปจากเวอร์ชันก่อนหน้า (แก้ bug miniBtn / ghostBtn / dangerBtn)
  function miniBtn(txt, fn) {
    const b = document.createElement("button");
    b.className = "mini";
    b.textContent = txt;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  function ghostBtn(txt, fn) {
    const b = document.createElement("button");
    b.className = "btn ghost";
    b.textContent = txt;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  function dangerBtn(txt, fn) {
    const b = document.createElement("button");
    b.className = "btn danger";
    b.textContent = txt;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  }

})();

