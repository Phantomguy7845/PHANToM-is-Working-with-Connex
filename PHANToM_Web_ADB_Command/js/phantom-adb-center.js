const BRIDGE_URL = "http://localhost:8765";

async function checkBridge(){
  try{
    const res = await fetch(`${BRIDGE_URL}/ping`);
    if(res.ok){
      document.getElementById('bridgeStatus').textContent = '🟢 Bridge พร้อมใช้งาน';
    }else throw new Error();
  }catch(e){
    document.getElementById('bridgeStatus').innerHTML =
      `🔴 ไม่พบ Bridge <a href="https://github.com/Phantomguy7845/PHANToM-is-Working-with-Connex/releases/latest/download/PHANToM-Web-Bridge.exe" target="_blank">ดาวน์โหลด</a>`;
  }
}

async function sendAdb(endpoint,body={}){
  try{
    const res = await fetch(`${BRIDGE_URL}${endpoint}`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const data = await res.json();
    document.getElementById('output').textContent = JSON.stringify(data,null,2);
  }catch(e){
    document.getElementById('output').textContent = '❌ Bridge ไม่ตอบสนอง';
  }
}

function adbCall(){ sendAdb('/adb/call',{number:document.getElementById('number').value}); }
function adbHangup(){ sendAdb('/adb/hangup'); }
function adbAnswer(){ sendAdb('/adb/answer'); }
function adbScreenshot(){ sendAdb('/adb/screenshot'); }
function adbCustom(){ sendAdb('/adb/custom',{cmd:document.getElementById('customCmd').value}); }

checkBridge();
