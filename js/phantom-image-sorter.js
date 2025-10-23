/* PHANToM Image Sorter — TensorFlow v4 Stable */
(async function(){
const $=s=>document.querySelector(s);
const drop=$("#drop"),picker=$("#picker"),grid=$("#grid"),
toast=$("#toast"),aiStatus=$("#aiStatus"),customStatus=$("#customStatus"),
btnHeu=$("#autoHeu"),btnAI=$("#autoAI"),btnCustom=$("#autoCustom"),
btnClear=$("#clear"),btnExport=$("#exportZip"),qualityEl=$("#quality");

let images=[],offlineModel=null,customModel=null;
let offlineReady=false,customReady=false;

function toastMsg(msg,ok=false){
  toast.textContent=msg;
  toast.style.background=ok?"#153a1f":"#0d1b36";
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),1800);
}

// ---- Upload ----
drop.addEventListener("click",()=>picker.click());
drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("drag");});
drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));
drop.addEventListener("drop",e=>{
  e.preventDefault();drop.classList.remove("drag");handleFiles(e.dataTransfer.files);
});
picker.addEventListener("change",e=>handleFiles(e.target.files));

function handleFiles(fs){
  const arr=Array.from(fs||[]).filter(f=>f.type.startsWith("image/"));
  if(!arr.length)return toastMsg("ไม่มีไฟล์ภาพ");
  arr.forEach(f=>{
    const r=new FileReader();
    r.onload=ev=>{images.push({src:ev.target.result,name:f.name});render();};
    r.readAsDataURL(f);
  });
  toastMsg(`เพิ่มรูป ${arr.length} ไฟล์`,true);
}

// ---- Render ----
function render(){
  grid.innerHTML="";
  images.forEach((x,i)=>{
    const item=document.createElement("div");item.className="item";
    const im=document.createElement("img");im.src=x.src;im.className="thumb";
    const cover=document.createElement("button");
    cover.className="cover"+(x.cover?" active":"");cover.textContent="Cover";
    cover.onclick=()=>{x.cover=!x.cover;cover.classList.toggle("active",x.cover);};
    const bar=document.createElement("div");bar.className="bar";
    const idx=document.createElement("div");idx.textContent=i+1;
    const tag=document.createElement("div");
    tag.textContent=x.label?`${x.label}${x.conf?` (${Math.round(x.conf*100)}%)`:''}`:"";
    bar.append(idx,tag);
    item.append(im,cover,bar);grid.appendChild(item);
  });
}

// ---- Heuristic ----
btnHeu.addEventListener("click",()=>{
  if(!images.length)return toastMsg("ยังไม่มีภาพ");
  images.sort((a,b)=>(a.name||"").localeCompare(b.name||"",undefined,{numeric:true}));
  render();toastMsg("เรียงตามชื่อไฟล์แล้ว",true);
});

// ---- Offline AI ----
async function ensureOffline(){
  if(offlineReady&&offlineModel)return true;
  try{
    aiStatus.textContent="Offline AI: กำลังโหลด…";
    await tf.ready();
    offlineModel=await tf.loadGraphModel(
      "https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_140_224/classification/5",
      {fromTFHub:true}
    );
    offlineReady=true;
    aiStatus.textContent="Offline AI: พร้อมใช้งาน";aiStatus.style.color="#22c55e";
    toastMsg("Offline AI พร้อม",true);
    return true;
  }catch(e){
    console.error("Offline AI load error",e);
    aiStatus.textContent="Offline AI: โหลดไม่สำเร็จ";aiStatus.style.color="#ef4444";
    toastMsg("โหลด Offline AI ไม่สำเร็จ");return false;
  }
}

btnAI.addEventListener("click",async()=>{
  if(!images.length)return toastMsg("ยังไม่มีภาพ");
  const ok=await ensureOffline();if(!ok)return;
  for(let i=0;i<images.length;i++){
    const img=await dataToTensor(images[i].src);
    const pred=offlineModel.predict(img);
    const probs=await pred.data();
    const idx=probs.indexOf(Math.max(...probs));
    images[i].label="cls_"+idx;
    images[i].conf=probs[idx]||0;
    await tf.nextFrame();
  }
  images.sort((a,b)=>b.conf-a.conf);
  render();toastMsg("Offline AI Sort สำเร็จ",true);
});

// ---- Custom ----
btnCustom.addEventListener("click",async()=>{
  try{
    const json=await pickFile(".json");const bin=await pickFile(".bin");
    if(!json||!bin)return toastMsg("ยกเลิกการโหลดโมเดล");
    const modelURL=URL.createObjectURL(json);
    customModel=await tf.loadLayersModel(modelURL);
    customReady=true;customStatus.textContent="Custom Model: พร้อมใช้งาน";
    customStatus.style.color="#22c55e";toastMsg("โหลด Custom Model สำเร็จ",true);
  }catch(e){console.error(e);toastMsg("โหลดโมเดลไม่สำเร็จ");}
  if(!images.length)return;
  for(let i=0;i<images.length;i++){
    const img=await dataToTensor(images[i].src);
    const pred=customModel.predict(img);
    const probs=await pred.data();
    const idx=probs.indexOf(Math.max(...probs));
    images[i].label="cls_"+idx;images[i].conf=probs[idx]||0;
    await tf.nextFrame();
  }
  images.sort((a,b)=>b.conf-a.conf);
  render();toastMsg("Custom Sort สำเร็จ",true);
});

// ---- Export ----
btnExport.addEventListener("click",async()=>{
  if(!images.length)return toastMsg("ไม่มีภาพ");
  const q=Math.max(0.6,Math.min(0.95,parseFloat(qualityEl.value)||0.9));
  const covers=images.filter(x=>x.cover),rest=images.filter(x=>!x.cover);
  const list=[...covers,...rest];
  const zip=new JSZip();
  for(let i=0;i<list.length;i++){
    const blob=await dataToJpgBlob(list[i].src,q);
    zip.file(`${i+1}.jpg`,blob);
  }
  const out=await zip.generateAsync({type:"blob"});
  saveAs(out,"PHANToM_Sorted.zip");
  toastMsg("ส่งออก ZIP สำเร็จ",true);
});

// ---- Clear ----
btnClear.addEventListener("click",()=>{images=[];render();toastMsg("ล้างทั้งหมด",true);});

// ---- Helpers ----
function dataToImg(d){return new Promise(r=>{const im=new Image();im.src=d;im.onload=()=>r(im);});}
async function dataToJpgBlob(d,q){
  const im=await dataToImg(d);const c=document.createElement("canvas");
  c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext("2d").drawImage(im,0,0);
  return await new Promise(res=>c.toBlob(res,"image/jpeg",q));
}
function dataToTensor(d){return new Promise(res=>{
  const im=new Image();im.src=d;im.onload=()=>{
    const t=tf.tidy(()=>tf.image.resizeBilinear(tf.browser.fromPixels(im),[224,224])
      .expandDims(0).div(tf.scalar(255)));
    res(t);
  };
});}
function pickFile(accept){return new Promise(res=>{
  const inp=document.createElement("input");inp.type="file";inp.accept=accept;
  inp.addEventListener("change",e=>res(e.target.files[0]||null),{once:true});
  inp.click();
});}
})();
