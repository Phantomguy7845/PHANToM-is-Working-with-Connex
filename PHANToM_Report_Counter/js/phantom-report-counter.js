/* PHANToM Report Counter v1.2 — Count + Text + Keyboard + Autosave
   by PHANToM (2025)
   Core: Nested Category (Main/Sub), Smart Focus, SUM Rules
*/

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ====== GLOBAL STATE ======
  let data = []; // [{name, sub:[{name,type,count,texts:[]}]}]
  let activeMainIndex = -1;
  let activeSubIndex = -1;
  let isFocused = false;
  let autosaveTimer = null;

  const mainContainer = $("#mainContainer");
  const addMainBtn = $("#addMainBtn");
  const mainInput = $("#mainInput");
  const toast = $("#toast");

  // ====== INIT ======
  loadData();
  render();

  // ====== EVENT: ADD MAIN CATEGORY ======
  addMainBtn?.addEventListener("click", () => {
    const name = mainInput.value.trim();
    if (!name) return showToast("กรุณาใส่ชื่อหมวดหมู่");
    data.push({ name, sub: [], count: 0, asCall: false });
    mainInput.value = "";
    saveData();
    render();
    showToast("เพิ่มหมวดหลักแล้ว", true);
  });

  // ====== RENDER ======
  function render() {
    mainContainer.innerHTML = "";
    data.forEach((main, i) => {
      const mainBox = document.createElement("div");
      mainBox.className = "mainBox";
      mainBox.innerHTML = `
        <div class="mainHeader ${i === activeMainIndex ? "focus" : ""}">
          <div class="title">${main.name}</div>
          <div class="count">
            <button class="minus">−</button>
            <span>${main.count}</span>
            <button class="plus">+</button>
          </div>
          <div class="tools">
            <label><input type="checkbox" ${main.asCall ? "checked" : ""}> ใช้แทน "โทร"</label>
            <button class="addSub">＋ หัวข้อย่อย</button>
            <button class="delMain">🗑</button>
          </div>
        </div>
        <div class="subList"></div>
      `;
      mainContainer.appendChild(mainBox);

      // render sub
      const subList = mainBox.querySelector(".subList");
      main.sub.forEach((sub, j) => {
        const subEl = document.createElement("div");
        subEl.className = "subItem";
        if (sub.type === "count") {
          subEl.innerHTML = `
            <div class="subHeader ${i===activeMainIndex && j===activeSubIndex?"focus":""}">
              <div class="subTitle">${sub.name}</div>
              <div class="subCount">
                <button class="minus">−</button>
                <span>${sub.count}</span>
                <button class="plus">+</button>
              </div>
              <button class="delSub">🗑</button>
            </div>`;
        } else {
          const lines = sub.texts?.length || 0;
          subEl.innerHTML = `
            <div class="subHeader ${i===activeMainIndex && j===activeSubIndex?"focus":""}">
              <div class="subTitle">${sub.name} <small>(${lines})</small></div>
              <button class="delSub">🗑</button>
            </div>
            <textarea placeholder="พิมพ์ข้อความ..." rows="3">${sub.texts.join("\n")}</textarea>`;
        }
        subList.appendChild(subEl);
      });

      // === EVENTS ===
      mainBox.querySelector(".plus").onclick = () => {
        main.count++;
        saveData();
        render();
      };
      mainBox.querySelector(".minus").onclick = () => {
        main.count = Math.max(0, main.count - 1);
        saveData();
        render();
      };
      mainBox.querySelector(".addSub").onclick = () => {
        const n = prompt("ชื่อหัวข้อย่อย:");
        if (!n) return;
        const t = confirm("ให้หัวข้อย่อยนี้เป็นแบบข้อความหรือไม่?\nตกลง = ข้อความ / ยกเลิก = นับจำนวน");
        if (t) main.sub.push({ name: n, type: "text", texts: [] });
        else main.sub.push({ name: n, type: "count", count: 0 });
        saveData();
        render();
      };
      mainBox.querySelector(".delMain").onclick = () => {
        if (confirm("ลบหมวดหมู่หลักนี้?")) {
          data.splice(i, 1);
          saveData();
          render();
        }
      };
      mainBox.querySelector("input[type='checkbox']").onchange = e => {
        main.asCall = e.target.checked;
        saveData();
      };

      // sub events
      subList.querySelectorAll(".plus")?.forEach((b, j) => {
        b.onclick = () => {
          main.sub[j].count++;
          saveData();
          render();
        };
      });
      subList.querySelectorAll(".minus")?.forEach((b, j) => {
        b.onclick = () => {
          main.sub[j].count = Math.max(0, main.sub[j].count - 1);
          saveData();
          render();
        };
      });
      subList.querySelectorAll("textarea")?.forEach((ta, j) => {
        ta.oninput = () => {
          const lines = ta.value.split("\n").filter(x=>x.trim()!=="");
          main.sub[j].texts = lines;
          saveData();
        };
      });
      subList.querySelectorAll(".delSub")?.forEach((b, j) => {
        b.onclick = () => {
          if(confirm("ลบหัวข้อย่อยนี้?")){
            main.sub.splice(j,1);
            saveData();
            render();
          }
        };
      });
    });
  }

  // ====== SAVE / LOAD ======
  function saveData() {
    localStorage.setItem("phantomReportData", JSON.stringify(data));
  }
  function loadData() {
    try {
      const d = localStorage.getItem("phantomReportData");
      if (d) data = JSON.parse(d);
    } catch (e) { data = []; }
  }

  // ====== TOAST ======
  function showToast(msg, ok = false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = ok ? "#153a1f" : "#2b1d1d";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1600);
  }

  // ====== KEYBOARD CONTROL ======
  document.addEventListener("keydown", e => {
    if (e.key === "+") {
      if (activeMainIndex >= 0 && activeSubIndex < 0) {
        data[activeMainIndex].count++;
      } else if (activeMainIndex >= 0 && activeSubIndex >= 0) {
        const sub = data[activeMainIndex].sub[activeSubIndex];
        if (sub.type === "count") sub.count++;
      }
      saveData(); render();
    }
    if (e.key === "-") {
      if (activeMainIndex >= 0 && activeSubIndex < 0) {
        data[activeMainIndex].count = Math.max(0, data[activeMainIndex].count - 1);
      } else if (activeMainIndex >= 0 && activeSubIndex >= 0) {
        const sub = data[activeMainIndex].sub[activeSubIndex];
        if (sub.type === "count") sub.count = Math.max(0, sub.count - 1);
      }
      saveData(); render();
    }
  });

})();
