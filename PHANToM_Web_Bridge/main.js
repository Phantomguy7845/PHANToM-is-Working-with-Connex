const express = require('express');
const { execFile, exec } = require('child_process');
const path = require('path');
const app = express();
app.use(express.json());

const adb = path.join(__dirname,'adb','adb.exe');

app.get('/ping',(req,res)=>res.send('ok'));

app.post('/adb/call',(req,res)=>{
  execFile(adb,['shell','am','start','-a','android.intent.action.CALL','-d',`tel:${req.body.number}`]);
  res.json({ok:true,cmd:'call'});
});

app.post('/adb/hangup',(req,res)=>{
  execFile(adb,['shell','input','keyevent','KEYCODE_ENDCALL']);
  res.json({ok:true});
});

app.post('/adb/answer',(req,res)=>{
  execFile(adb,['shell','input','keyevent','KEYCODE_HEADSETHOOK']);
  res.json({ok:true});
});

app.post('/adb/screenshot',(req,res)=>{
  execFile(adb,['shell','screencap','-p','/sdcard/screen.png'],()=>{
    execFile(adb,['pull','/sdcard/screen.png','screenshot.png'],()=>{
      res.json({ok:true,path:'screenshot.png'});
    });
  });
});

app.post('/adb/custom',(req,res)=>{
  execFile(adb,['shell',...req.body.cmd.split(' ')],(err,out)=>{
    res.json({output:out || err});
  });
});

app.listen(8765,()=>console.log('Bridge running on http://localhost:8765'));
