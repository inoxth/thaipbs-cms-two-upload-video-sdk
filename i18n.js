// i18n.js — tiny two-language dictionary (en/th) + apply logic. No library.
// Static text: tag an element with data-i18n="key" (sets textContent) or data-i18n-ph="key"
// (sets placeholder). Dynamic text (app.js): call t('key', arg). Values can be functions for
// parameterised strings, e.g. t('status.uploadingPct', 42).

const DICT = {
  en: {
    'app.title': 'Thai PBS Video CMS — Video Upload SDK',
    'app.subtitle': 'Upload videos into Thai PBS Video CMS from your own app — one class, no dependencies.',
    'flow.upload.title': 'Upload the file',
    'flow.upload.desc': 'The video file is stored by the media service',
    'flow.cms.desc': 'Creates the video record + metadata',
    'card1.title': 'Upload credentials',
    'label.baseUrl': 'Base URL',
    'opt.local': 'Local dev — http://localhost:3000',
    'opt.staging': 'Staging — via local proxy (run proxy.mjs)',
    'label.teamId': 'Team ID',
    'label.apiSecret': 'API secret',
    'note.apiSecret': '(only for staging — the env API_SERVER_SECRET)',
    'ph.apiSecret': 'leave blank for local dev',
    'hint.apiSecret': 'Sent as the x-api-server-secret header. localhost:3000 auto-authenticates, so leave blank there.',
    'card3.title': 'Video details',
    'label.program': 'Program',
    'note.program': '(optional — links the video to a program)',
    'opt.none': '— none —',
    'btn.loadPrograms': 'Load programs',
    'btn.loading': 'Loading…',
    'label.title': 'Title',
    'label.description': 'Description',
    'label.file': 'Video file',
    'hint.video': 'One click: uploads the file → registers the media in Thai PBS Video CMS → creates the video record.',
    'toggle.autoRefresh': 'Auto-refresh the preview to the Thai PBS Video CMS player once the video is ready',
    'btn.upload': 'Upload video',
    'btn.refresh': 'Refresh player',
    'section.preview': 'Preview',
    'preview.empty': 'No video yet — upload one to preview',
    'preview.processing': 'Video is processing…',
    'hint.preview': 'The Thai PBS Video CMS player appears here once the video is ready.',
    'section.log': 'Log',
    'log.ready': 'Ready.',
    'doc.prereq.title': 'Before you start',
    'doc.prereq.item1': 'Uploader form credentials — formId, formSecret, and the projectKey of the target project.',
    'doc.prereq.item2': 'Your Thai PBS Video CMS team ID (teamId).',
    'doc.prereq.item3': 'The Thai PBS Video CMS base URL — plus the API secret (env API_SERVER_SECRET) when not on local dev.',
    'doc.usage.title': 'Use the SDK in your project',
    'doc.step1': '1. Copy sdk.js into your project — no dependencies, no build step — and import it.',
    'doc.step2': '2. Create the upload manager with your credentials and callback functions.',
    'doc.step3': '3. Add files to the upload queue — each item can carry its own title / description / program.',
    'doc.step4': '4. Start uploading — resolves when every queued job is done.',
    'doc.step5': "5. The video keeps processing after upload — poll until it's playable, then use embeddedUrl.",
    'doc.example.title': 'Complete example',
    'demo.title': 'Live demo',
    'demo.desc': 'Try the SDK right here — this form runs exactly the code documented above.',
    'demo.codeTitle': 'Your SDK call — updates as you fill the form below',
    // dynamic
    'status.uploading': 'Uploading video…',
    'status.uploadingPct': (p) => `Uploading video — ${p}%`,
    'status.creatingMedia': 'Creating media in Thai PBS Video CMS…',
    'status.creatingVideo': 'Creating video in Thai PBS Video CMS…',
    'status.done': 'Done — media + video created in Thai PBS Video CMS',
    'status.processing': (s) => `Processing… (${s}) — checking every 5s`,
    'status.ready': 'Ready — playing video',
    'status.failed': 'Processing failed — see log',
    'status.error': 'Error — see log',
    'alert.pickFile': 'Pick a video file first',
    'alert.enterTeam': 'Enter a Team ID first',
    'alert.loadFailed': (m) => 'Load failed: ' + m,
    'log.loadedPrograms': (n) => `Loaded ${n} programs`,
  },
  th: {
    'app.title': 'Thai PBS Video CMS — Video Upload SDK',
    'app.subtitle': 'อัปโหลดวิดีโอเข้า Thai PBS Video CMS จากแอปของคุณ — คลาสเดียว ไม่มี dependency',
    'flow.upload.title': 'อัปโหลดไฟล์',
    'flow.upload.desc': 'ไฟล์วิดีโอถูกจัดเก็บในระบบมีเดีย',
    'flow.cms.desc': 'สร้างรายการวิดีโอและข้อมูล meta data',
    'card1.title': 'Upload credentials',
    'label.baseUrl': 'Base URL',
    'opt.local': 'เครื่อง Local — http://localhost:3000',
    'opt.staging': 'Staging — ผ่าน proxy (รัน proxy.mjs)',
    'label.teamId': 'Team ID',
    'label.apiSecret': 'API secret',
    'note.apiSecret': '(เฉพาะ staging — ค่า env API_SERVER_SECRET)',
    'ph.apiSecret': 'เว้นว่างสำหรับเครื่อง local',
    'hint.apiSecret': 'ส่งเป็น header x-api-server-secret — localhost:3000 ยืนยันตัวตนอัตโนมัติ จึงเว้นว่างได้',
    'card3.title': 'รายละเอียดวิดีโอ',
    'label.program': 'รายการ',
    'note.program': '(ไม่บังคับ — เชื่อมวิดีโอกับรายการ)',
    'opt.none': '— ไม่มี —',
    'btn.loadPrograms': 'โหลดรายการ',
    'btn.loading': 'กำลังโหลด…',
    'label.title': 'ชื่อเรื่อง',
    'label.description': 'คำอธิบาย',
    'label.file': 'ไฟล์วิดีโอ',
    'hint.video': 'คลิกเดียว: อัปโหลดไฟล์ → บันทึกมีเดียใน Thai PBS Video CMS → สร้างรายการวิดีโอ',
    'toggle.autoRefresh': 'รีเฟรชตัวอย่างเป็นเพลเยอร์ Thai PBS Video CMS อัตโนมัติเมื่อวิดีโอพร้อม',
    'btn.upload': 'อัปโหลดวิดีโอ',
    'btn.refresh': 'รีเฟรชเพลเยอร์',
    'section.preview': 'ตัวอย่าง',
    'preview.empty': 'ยังไม่มีวิดีโอ — อัปโหลดเพื่อดูตัวอย่าง',
    'preview.processing': 'กำลังประมวลผลวิดีโอ…',
    'hint.preview': 'เพลเยอร์ Thai PBS Video CMS จะแสดงที่นี่เมื่อวิดีโอพร้อม',
    'section.log': 'บันทึก',
    'log.ready': 'พร้อมใช้งาน',
    'doc.prereq.title': 'สิ่งที่ต้องเตรียมก่อนเริ่มใช้งาน',
    'doc.prereq.item1': 'ข้อมูลรับรองของฟอร์มอัปโหลด — formId, formSecret และ projectKey ของโปรเจกต์ปลายทาง',
    'doc.prereq.item2': 'Team ID ของทีมใน Thai PBS Video CMS (teamId)',
    'doc.prereq.item3': 'Base URL ของ Thai PBS Video CMS — และ API secret (env API_SERVER_SECRET) เมื่อไม่ได้ใช้เครื่อง local',
    'doc.usage.title': 'นำ SDK ไปใช้ในโปรเจกต์ของคุณ',
    'doc.step1': '1. คัดลอก sdk.js ไปไว้ในโปรเจกต์ — ไม่มี dependency ไม่ต้อง build — แล้ว import',
    'doc.step2': '2. สร้าง upload manager ด้วยข้อมูลรับรองและ callback functions',
    'doc.step3': '3. เพิ่มไฟล์เข้าคิวอัปโหลด — แต่ละไฟล์ใส่ title / description / program ของตัวเองได้',
    'doc.step4': '4. เริ่มอัปโหลด — resolve เมื่อทุกงานในคิวเสร็จ',
    'doc.step5': "5. วิดีโอยังประมวลผลต่อหลังอัปโหลด — โพลจนพร้อมเล่น แล้วใช้ embeddedUrl",
    'doc.example.title': 'ตัวอย่างโค้ดทั้งหมด',
    'demo.title': 'ทดลองใช้งาน',
    'demo.desc': 'ลองใช้ SDK ได้ที่นี่ — ฟอร์มนี้รันโค้ดเดียวกับที่อธิบายด้านบน',
    'demo.codeTitle': 'โค้ด SDK ของคุณ — อัปเดตตามที่กรอกฟอร์มด้านล่าง',
    // dynamic
    'status.uploading': 'กำลังอัปโหลดวิดีโอ…',
    'status.uploadingPct': (p) => `กำลังอัปโหลดวิดีโอ — ${p}%`,
    'status.creatingMedia': 'กำลังสร้างมีเดียใน Thai PBS Video CMS…',
    'status.creatingVideo': 'กำลังสร้างวิดีโอใน Thai PBS Video CMS…',
    'status.done': 'เสร็จสิ้น — สร้างมีเดียและวิดีโอใน Thai PBS Video CMS แล้ว',
    'status.processing': (s) => `กำลังประมวลผล… (${s}) — ตรวจสอบทุก 5 วินาที`,
    'status.ready': 'พร้อม — กำลังเล่นวิดีโอ',
    'status.failed': 'ประมวลผลไม่สำเร็จ — ดูบันทึก',
    'status.error': 'เกิดข้อผิดพลาด — ดูบันทึก',
    'alert.pickFile': 'เลือกไฟล์วิดีโอก่อน',
    'alert.enterTeam': 'กรอก Team ID ก่อน',
    'alert.loadFailed': (m) => 'โหลดไม่สำเร็จ: ' + m,
    'log.loadedPrograms': (n) => `โหลด ${n} รายการแล้ว`,
  },
};

let lang = localStorage.getItem('lang') || 'en';   // default English

export function t(key, arg) {
  const v = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  return typeof v === 'function' ? v(arg) : v;
}

function apply() {
  document.documentElement.lang = lang;
  document.title = t('app.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const btn of document.querySelectorAll('[data-lang]')) btn.classList.toggle('active', btn.dataset.lang === lang);
}

export function setLang(l) { lang = l; localStorage.setItem('lang', l); apply(); }

// Wire the EN/TH buttons and render the initial language.
export function initI18n() {
  for (const btn of document.querySelectorAll('[data-lang]')) {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  }
  apply();
}
