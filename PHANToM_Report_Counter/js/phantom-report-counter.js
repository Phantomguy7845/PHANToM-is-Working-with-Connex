// === เริ่มต้น phantom-report-counter.js (patched version) ===

// (ส่วนบนทั้งหมดเหมือนเดิมจาก repo ล่าสุด)

...

// --- ภายในฟังก์ชัน renderMain(main, mi)
if((main.type||"count")==="count"){
  const c = el("div","count", String(calcOwn(main)));
  c.title="คลิกเพื่อพิมพ์ค่าโดยตรง";
  c.addEventListener("click", ()=> inlineNumberEdit(c, main, "count"));
  const btnMinus = miniBtn("−", ()=> inc(main,-1));
  const btnPlus  = miniBtn("+", ()=> inc(main,+1));
  countWrap.append(btnMinus, c, btnPlus);
}else{
  bodyArea = el("textarea","textbox");
  bodyArea.placeholder="พิมพ์ข้อความ (1 บรรทัด = 1 นับ)";
  bodyArea.value = (main.lines||[]).join("\n");

  // 🧠 ปรับแก้จุดปัญหา focus/textmode
  let typingTimeout;
  bodyArea.addEventListener("focus", ()=> window.isTyping = true);
  bodyArea.addEventListener("blur", ()=> { window.isTyping = false; });
  bodyArea.addEventListener("keydown",(e)=>{
    // ไม่ให้คีย์ลัดทำงาน แต่ให้ Enter ใช้งานได้ตามปกติ
    if(e.key !== "Enter") e.stopPropagation();
  });
  bodyArea.addEventListener("input", ()=>{
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(()=>{
      main.lines = bodyArea.value.split("\n").map(s=>s.trim()).filter(Boolean);
      saveState(); render();
    }, 250);
  });
}

// --- ภายในฟังก์ชัน renderSub(parent, nodeData, path)
...
}else{
  const ta = el("textarea","textbox");
  ta.placeholder = "พิมพ์แยกบรรทัด (1 บรรทัด = 1 นับ)";
  ta.value = (nodeData.lines||[]).join("\n");

  // 🧠 ปรับแก้จุดปัญหา focus/textmode (sub)
  let typingTimeout;
  ta.addEventListener("focus", ()=> window.isTyping = true);
  ta.addEventListener("blur", ()=> { window.isTyping = false; });
  ta.addEventListener("keydown",(e)=>{
    if(e.key !== "Enter") e.stopPropagation();
  });
  ta.addEventListener("input", ()=>{
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(()=>{
      nodeData.lines = ta.value.split("\n").map(s=>s.trim()).filter(Boolean);
      saveState(); render();
    }, 250);
  });
  extra = ta;
}

...

// === จบไฟล์ phantom-report-counter.js (patched version) ===
