/* PHANToM Room Trainer — TensorFlow.js + LocalStorage
   by PHANToM (Aurora Edition)
*/
const $=s=>document.querySelector(s); const $$=s=>Array.from(document.querySelectorAll(s));
const toastEl=$("#toast"), clsWrap=$("#classes"), progress=$("#progress");
let classData={}; let model=null;
const LS_KEY="PHANToM_RoomTrainer_Data";

function toast(t,ok=false){toastEl.textContent=t;toastEl.style.background=ok?"#153a1f":"#0d1b36";toastEl.classList.add("show");setTimeout(()=>toastEl.classList.remove("show"),1500);}

// โหลดข้อมูลจาก localStorage
window.addEventListener("load",()=>{
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(raw){ classData=JSON.parse(raw)||{}; render(); toast("โหลดข้อมูลฝึกก่อนหน้าแล้ว",true);}
  }catch(e){console.warn("no data",e);}
});

// บันทึกข้อมูลลง localStorage
function saveLS(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(classData)); }catch(e){console.warn(e);}
}

// เพิ่มหมวดใหม่
$("#addClass").onclick=()=>{
  const name=prompt("ชื่อหมวด (เช่น living, kitchen, bedroom)");
  if(!name) return;
  if(classData[name]) return toast("มีหมวดนี้แล้ว");
  classData[name]=[];
  render(); saveLS();
};

// แสดงภาพแต่ละหมวด
function render(){
  clsWrap.innerHTML="";
  Object.keys(classData).forEach(k=>{
    const box=document.createElement("div");
    box.innerHTML=`<h3>${k}</h3><div class="grid"></div>
      <button class="secondary">เพิ่มรูป</button>
      <button class="warn del">ลบหมวด</button>`;
    const grid=box.querySelector(".grid");
    const btnAdd=box.querySelector(".secondary");
    const btnDel=box.querySelector(".del");
    btnAdd.onclick=()=>pickImgs(k);
    btnDel.onclick=()=>{delete classData[k];render();saveLS();};
    classData[k].forEach(src=>{
      const im=document.createElement("img"); im.src=src; im.className="thumb";
      grid.append(im);
    });
    clsWrap.append(box);
  });
}

// เลือกภาพเข้าแต่ละหมวด
function pickImgs(k){
  const inp=document.createElement("input");
  inp.type="file"; inp.accept="image/*"; inp.multiple=true;
  inp.onchange=e=>{
    Array.from(e.target.files).forEach(f=>{
      const r=new FileReader();
      r.onload=v=>{ classData[k].push(v.target.result); render(); saveLS(); };
      r.readAsDataURL(f);
    });
  };
  inp.click();
}

// ล้างข้อมูลฝึก
const clearBtn=document.createElement("button");
clearBtn.textContent="ล้างข้อมูลฝึก";
clearBtn.className="warn";
clearBtn.onclick=()=>{ if(confirm("ล้างข้อมูลทั้งหมด?")){localStorage.removeItem(LS_KEY);classData={};render();toast("ล้างข้อมูลแล้ว",true);} };
progress.parentNode.insertBefore(clearBtn, progress);

// สร้างและเทรนโมเดล
$("#train").onclick=async()=>{
  if(Object.keys(classData).length<2){return toast("เพิ่มหมวดอย่างน้อย 2 หมวด");}
  progress.textContent="กำลังเตรียมข้อมูล…";

  const {xs, ys, labels}=await buildDataset();
  model=createModel(labels.length);
  model.compile({optimizer:'adam',loss:'categoricalCrossentropy',metrics:['accuracy']});
  progress.textContent="เริ่มเทรน...";
  await model.fit(xs, ys, {
    epochs:10,
    batchSize:8,
    shuffle:true,
    callbacks:{
      onEpochEnd:(ep,logs)=>{
        const acc=logs.acc||logs.accuracy||0;
        progress.textContent=`Epoch ${ep+1}/10 — Loss ${logs.loss.toFixed(4)} Acc ${(acc*100).toFixed(1)}%`;
      }
    }
  });
  xs.dispose(); ys.dispose();
  progress.textContent="✅ เทรนเสร็จสิ้น พร้อมส่งออก";
  toast("เทรนเสร็จสิ้น",true);
};

// สร้าง dataset จากภาพ
async function buildDataset(){
  let dataX=[], dataY=[], labels=Object.keys(classData);
  for(let i=0;i<labels.length;i++){
    const name=labels[i];
    for(let imgData of classData[name]){
      const tensor=await imgToTensor(imgData);
      dataX.push(tensor);
      dataY.push(i);
    }
  }
  const xs=tf.concat(dataX);
  const ys=tf.oneHot(tf.tensor1d(dataY,'int32'),labels.length);
  dataX.forEach(t=>t.dispose());
  return {xs,ys,labels};
}

// แปลงรูปเป็น tensor
function imgToTensor(data){
  return new Promise(res=>{
    const im=new Image();
    im.src=data;
    im.onload=()=>{
      const t=tf.tidy(()=>tf.image.resizeBilinear(tf.browser.fromPixels(im),[128,128])
        .toFloat().div(255).expandDims(0));
      res(t);
    };
  });
}

// สร้างโมเดล
function createModel(classes){
  const m=tf.sequential();
  m.add(tf.layers.conv2d({inputShape:[128,128,3],filters:16,kernelSize:3,activation:'relu'}));
  m.add(tf.layers.maxPooling2d({poolSize:2}));
  m.add(tf.layers.flatten());
  m.add(tf.layers.dense({units:64,activation:'relu'}));
  m.add(tf.layers.dense({units:classes,activation:'softmax'}));
  return m;
}

// ส่งออกโมเดล
$("#export").onclick=async()=>{
  if(!model) return toast("ยังไม่มีโมเดลเทรน");
  await model.save('downloads://PHANToM_Room_Model');
  toast("บันทึกโมเดลแล้ว",true);
};
