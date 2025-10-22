(function(){
  const $ = (s, c=document)=>c.querySelector(s);
  const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));

  const drop = $('#drop');
  const picker = $('#picker');
  const grid = $('#grid');
  const toastEl = $('#toast');
  const qualityEl = $('#quality');
  const modeInputs = $$('input[name="mode"]');
  const apiKeyEl = $('#apiKey');
  const saveKeyBtn = $('#saveKey');
  const keyState = $('#keyState');

  const LS_KEY_MODE  = 'phantom_sorter_mode_v1';
  const LS_KEY_API   = 'phantom_ai_key_v1';

  let items = [];
  let mode = 'condo';

  const toast = (msg)=>{ toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'), 1400); };

  const loadSettings = ()=>{
    const m = localStorage.getItem(LS_KEY_MODE);
    if(m) mode = m;
    modeInputs.forEach(r=> r.checked = (r.value===mode));
    const k = localStorage.getItem(LS_KEY_API);
    if(k){ apiKeyEl.value = k; keyState.textContent = 'บันทึกคีย์ไว้แล้ว'; }
  };

  const saveKey = ()=>{
    const k = (apiKeyEl.value||'').trim();
    if(!k){ keyState.textContent = 'ยังไม่ได้ใส่คีย์'; return; }
    localStorage.setItem(LS_KEY_API, k);
    keyState.textContent = 'บันทึกคีย์เรียบร้อย';
    toast('บันทึก API Key แล้ว');
  };

  saveKeyBtn.addEventListener('click', saveKey);
  modeInputs.forEach(r=> r.addEventListener('change', ()=>{ mode = r.value; localStorage.setItem(LS_KEY_MODE, mode); toast('โหมด: '+(mode==='condo'?'คอนโด':'บ้าน')); }));

  const onFiles = async (fileList)=>{
    const arr = Array.from(fileList||[]).filter(f=>/^image\\//.test(f.type));
    for(const f of arr){
      const url = URL.createObjectURL(f);
      items.push({ id: crypto.randomUUID(), file:f, url, cover:false, ai:null });
    }
    render(); toast('อัปโหลด '+arr.length+' ไฟล์');
  };

  picker.addEventListener('change', e=> onFiles(e.target.files));
  ['dragenter','dragover'].forEach(ev=> drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag');}));
  ['dragleave','drop'].forEach(ev=> drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag');}));
  drop.addEventListener('drop', e=> onFiles(e.dataTransfer.files));

  const orderCondo = ['living','dining','kitchen','corridor','bedroom','bathroom','balcony','facility'];
  const orderHouse = ['exterior','garage','living','dining','kitchen','stairs','bedroom','bathroom','around','facility'];

  const scoreByName = (name)=>{
    const nm = name.toLowerCase();
    const order = (mode==='condo')?orderCondo:orderHouse;
    for(let i=0;i<order.length;i++) if(nm.includes(order[i])) return i+1;
    return 999;
  };

  const autoHeuristic = ()=>{
    items.sort((a,b)=> scoreByName(a.file.name)-scoreByName(b.file.name));
    const covers = items.filter(x=>x.cover);
    const others = items.filter(x=>!x.cover);
    items = [...covers,...others];
    render(); toast('เรียงแบบ Heuristic แล้ว');
  };

  async function fileToBase64(file){
    const buf = await file.arrayBuffer();
    let binary=''; const bytes=new Uint8Array(buf);
    for(let i=0;i<bytes.length;i+=0x8000){ binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000)); }
    return btoa(binary);
  }

  async function callVisionLabels(file, key){
    const body={requests:[{image:{content:await fileToBase64(file)},features:[{type:'LABEL_DETECTION',maxResults:10}]}]};
    const res=await fetch('https://vision.googleapis.com/v1/images:annotate?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await res.json();
    return json.responses?.[0]?.labelAnnotations?.map(a=>a.description)||[];
  }

  async function autoAI(){
    const key = localStorage.getItem(LS_KEY_API)||apiKeyEl.value.trim();
    if(!key) return toast('กรุณาใส่และบันทึก API Key');
    if(!items.length) return toast('ยังไม่มีรูป');

    toast('AI กำลังวิเคราะห์…');
    for(const it of items){
      try{
        const labels=await callVisionLabels(it.file,key);
        it.ai={labels,score:scoreByName(labels.join(' '))};
      }catch{it.ai={labels:[],score:999};}
    }
    items.sort((a,b)=>a.ai.score-b.ai.score);
    render(); toast('เรียงด้วย AI แล้ว');
  }

  const render=()=>{
    grid.innerHTML='';
    items.forEach((it,idx)=>{
      const card=document.createElement('div');
      card.className='item'; card.draggable=true; card.dataset.id=it.id;
      const aiTag=it.ai?`<span class=\"tag\">AI:${it.ai.score<999?'✓':'?'}</span>`:'';
      card.innerHTML=`<img class=\"thumb\" src=\"${it.url}\"/><button class=\"cover ${it.cover?'active':''}\">${it.cover?'Cover✓':'Cover'}</button><div class=\"bar\"><span class=\"idx\">#${idx+1}</span><div class=\"tags\"><span class=\"tag\">${it.file.name}</span>${aiTag}</div></div>`;
      card.querySelector('.cover').onclick=()=>{const sel=items.filter(x=>x.cover);if(!it.cover&&sel.length>=2)return toast('Cover สูงสุด 2');it.cover=!it.cover;render();};
      card.addEventListener('dragstart',e=>{card.classList.add('dragging');e.dataTransfer.setData('text',it.id);});
      card.addEventListener('dragend',()=>card.classList.remove('dragging'));
      card.addEventListener('dragover',e=>{e.preventDefault();const dragging=$('.item.dragging');if(!dragging||dragging===card)return;const rect=card.getBoundingClientRect();const before=(e.clientY-rect.top)<rect.height/2;grid.insertBefore(dragging,before?card:card.nextSibling);});
      grid.appendChild(card);
    });
    const ids=$$('.item',grid).map(el=>el.dataset.id);
    items.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
  };

  $('#clear').onclick=()=>{items.forEach(i=>URL.revokeObjectURL(i.url));items=[];render();toast('ล้างแล้ว');};
  $('#autoHeu').onclick=autoHeuristic;
  $('#autoAI').onclick=autoAI;

  async function imageToJpgBlob(file,q){
    const bmp=await createImageBitmap(file);
    const cv=document.createElement('canvas
