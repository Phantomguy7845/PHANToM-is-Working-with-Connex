// PHANToM WebADB Wrapper — USB Live + (Optional) Wi-Fi via Relay
// หมายเหตุ: Wi-Fi (ADB over TCP) จากเว็บเพียว ๆ ต้องมี ADB Relay (WebSocket)
// ถ้าไม่มี relay เราจะไม่เปิดปุ่ม Connect Wi-Fi (หรือแสดงคำอธิบาย)

export class WebADB {
  constructor() {
    this.usbSupported = 'usb' in navigator;
    this.device = null;        // WebUSB device handle
    this.transport = null;     // ADB transport (USB)
    this.adb = null;           // ADB client
    this.relaySocket = null;   // ถ้ามีการเชื่อมต่อผ่าน Relay (Wi-Fi)
  }

  // ---------- UTIL ----------
  _fail(msg) { throw new Error(msg); }
  _log(...a){ console.debug('[WebADB]', ...a); }

  // ---------- USB ----------
  async connectUsb(onInfo) {
    if (!this.usbSupported) this._fail('เบราว์เซอร์ไม่รองรับ WebUSB');

    // ใช้ import ESM ของ yume-chan แบบ pinned เวอร์ชัน
    const [{ AdbDaemonTransport }, { Adb, escapeArg }] = await Promise.all([
      import('https://esm.sh/@yume-chan/adb-transport-webusb@0.3.1?bundle'),
      import('https://esm.sh/@yume-chan/adb@0.3.1?bundle'),
    ]);

    // ขอสิทธิ์เลือกอุปกรณ์ Android
    // Android Google Vendor ID: 0x18d1
    const filters = [{ vendorId: 0x18d1 }];
    const device = await navigator.usb.requestDevice({ filters });
    this.device = device;

    const transport = await AdbDaemonTransport.connect(device);
    this.transport = transport;
    this.adb = new Adb(transport);

    const props = await this.adb.getProperties?.().catch(()=>null);
    onInfo?.({
      serial: transport.serial ?? 'USB',
      model: props?.['ro.product.model'] ?? 'Android',
      version: props?.['ro.build.version.release'] ?? '-'
    });
  }

  async disconnectUsb() {
    try { await this.transport?.dispose?.(); } catch {}
    this.transport = null; this.adb = null; this.device = null;
  }

  async shell(cmd) {
    if (!this.adb) this._fail('ยังไม่ได้เชื่อมต่อ ADB (USB)');
    const stream = await this.adb.createShell(cmd);
    const out = await stream.readAll?.();
    return typeof out === 'string' ? out : new TextDecoder().decode(out);
  }

  async call(number) {
    if (!this.adb) this._fail('ยังไม่ได้เชื่อมต่อ ADB');
    const num = String(number || '').replace(/\D+/g, '');
    if (!num) this._fail('หมายเลขว่าง');

    // โทรออก
    await this.shell(`am start -a android.intent.action.CALL -d tel:${num}`);
  }

  async hangup() {
    if (!this.adb) this._fail('ยังไม่ได้เชื่อมต่อ ADB');
    // ใช้วิธีกด Keyevent วางสาย (KEYCODE_ENDCALL = 6)
    await this.shell(`input keyevent 6`);
  }

  async answer() {
    if (!this.adb) this._fail('ยังไม่ได้เชื่อมต่อ ADB');
    // KEYCODE_CALL = 5
    await this.shell(`input keyevent 5`);
  }

  async pushClipboard(text) {
    if (!this.adb) this._fail('ยังไม่ได้เชื่อมต่อ ADB');
    const payload = String(text ?? '');
    // Android 10+ มี service "clipboard" ใน shell บางรอม
    // ถ้าใช้ไม่ได้ จะ fallback เป็น input text (ใส่ในฟิลด์ล่าสุด)
    try {
      // พยายามใช้ cmd clipboard
      const b64 = btoa(unescape(encodeURIComponent(payload)));
      // บางรอมไม่มี cmd นี้ — จะ throw
      await this.shell(`cmd clipboard set "$(echo ${b64} | base64 -d)"`);
    } catch {
      await this.shell(`input text ${this._escapeForInput(payload)}`);
    }
  }

  _escapeForInput(s) {
    // escape สำหรับ input text
    return s.replace(/(["\\`$ ])/g, '\\$1').replace(/\n/g, '\\n');
  }

  // ---------- Wi-Fi via Relay (ออปชัน) ----------
  // NOTE: ต้องมี ADB Relay ที่รองรับโปรโตคอลของ ya-webadb
  async connectWifiViaRelay(relayUrl, ipPort, onInfo) {
    if (!relayUrl) this._fail('ต้องกรอก ADB Relay URL ก่อน');
    if (!/^wss?:\/\//i.test(relayUrl)) this._fail('ADB Relay URL ต้องขึ้นต้นด้วย ws:// หรือ wss://');

    // สร้าง WebSocket ไปยัง Relay
    // จากนั้นให้ Relay เปิด ADB TCP ไปยัง ip:port และทำ tunnel ให้
    // โปรโตคอล relay มีหลายแบบ — ตรงนี้เป็น "generic" พร้อมข้อความชี้นำ
    this.relaySocket = new WebSocket(relayUrl);
    await new Promise((res, rej) => {
      this.relaySocket.onopen = res;
      this.relaySocket.onerror = rej;
    });

    // ส่งคำสั่งเชื่อมต่ออุปกรณ์ปลายทาง (ขึ้นกับ Relay ที่ใช้งานจริง)
    // ตัวอย่าง payload สมมติ (คุณต้องปรับให้เข้ากับ Relay ที่คุณใช้จริง)
    this.relaySocket.send(JSON.stringify({ op: 'connect-adb', target: ipPort }));

    onInfo?.({ serial: ipPort, model: 'ADB Relay', version: '-' });

    // หมายเหตุ: ถ้าคุณมี relay จริงภายหลัง ค่อยมาเชื่อม ya-webadb transport กับ WebSocket นี้
    // เพื่อให้ได้ Adb Transport ตัวเป็น ๆ (ตอนนี้เราทำ placeholder เพื่อ UX)
  }
}
