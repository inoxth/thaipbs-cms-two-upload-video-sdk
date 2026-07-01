// i18n.js — tiny two-language dictionary (en/th) + apply logic. No library.
// Static text: tag an element with data-i18n="key" (sets textContent) or data-i18n-ph="key"
// (sets placeholder). Dynamic text (app.js): call t('key', arg). Values can be functions for
// parameterised strings, e.g. t('status.uploadingPct', 42).

const DICT = {
  en: {
    'app.title': 'CMS-Two upload demo',
    'app.subtitle': 'Upload a video file and register it in CMS-Two.',
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
    'hint.video': 'One click: uploads the file → registers the media in CMS-Two → creates the video record.',
    'toggle.autoRefresh': 'Auto-refresh the preview to the CMS-Two player once the video is ready',
    'btn.upload': 'Upload video',
    'section.preview': 'Preview',
    'preview.empty': 'No video yet — upload one to preview',
    'hint.preview': 'Plays your local file immediately; swaps to the CMS-Two player once the video is ready.',
    'section.log': 'Log',
    'log.ready': 'Ready.',
    // dynamic
    'status.uploading': 'Uploading video…',
    'status.uploadingPct': (p) => `Uploading video — ${p}%`,
    'status.uploaded': 'Video uploaded ✓',
    'status.creatingMedia': 'Creating media in CMS-Two…',
    'status.creatingVideo': 'Creating video in CMS-Two…',
    'status.done': 'Done — media + video created in CMS-Two',
    'status.transcoding': (s) => `Transcoding… (${s})`,
    'status.ready': 'Ready — playing video',
    'status.stillTranscoding': 'Still transcoding — reload later to watch',
    'status.error': 'Error — see log',
    'alert.pickFile': 'Pick a video file first',
    'alert.enterTeam': 'Enter a Team ID first',
    'alert.loadFailed': (m) => 'Load failed: ' + m,
    'log.loadedPrograms': (n) => `Loaded ${n} programs`,
  },
  th: {
    'app.title': 'ตัวอย่างการอัปโหลดวิดีโอเข้า CMS-Two',
    'app.subtitle': 'อัปโหลดไฟล์วิดีโอและบันทึกข้อมูลลงใน CMS-Two',
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
    'hint.video': 'คลิกเดียว: อัปโหลดไฟล์ → บันทึกมีเดียใน CMS-Two → สร้างรายการวิดีโอ',
    'toggle.autoRefresh': 'รีเฟรชตัวอย่างเป็นเพลเยอร์ CMS-Two อัตโนมัติเมื่อวิดีโอพร้อม',
    'btn.upload': 'อัปโหลดวิดีโอ',
    'section.preview': 'ตัวอย่าง',
    'preview.empty': 'ยังไม่มีวิดีโอ — อัปโหลดเพื่อดูตัวอย่าง',
    'hint.preview': 'เล่นไฟล์ในเครื่องทันที และเปลี่ยนเป็นเพลเยอร์ CMS-Two เมื่อวิดีโอพร้อม',
    'section.log': 'บันทึก',
    'log.ready': 'พร้อมใช้งาน',
    // dynamic
    'status.uploading': 'กำลังอัปโหลดวิดีโอ…',
    'status.uploadingPct': (p) => `กำลังอัปโหลดวิดีโอ — ${p}%`,
    'status.uploaded': 'อัปโหลดวิดีโอสำเร็จ ✓',
    'status.creatingMedia': 'กำลังสร้างมีเดียใน CMS-Two…',
    'status.creatingVideo': 'กำลังสร้างวิดีโอใน CMS-Two…',
    'status.done': 'เสร็จสิ้น — สร้างมีเดียและวิดีโอใน CMS-Two แล้ว',
    'status.transcoding': (s) => `กำลังแปลงไฟล์… (${s})`,
    'status.ready': 'พร้อม — กำลังเล่นวิดีโอ',
    'status.stillTranscoding': 'ยังแปลงไฟล์ไม่เสร็จ — โหลดหน้าใหม่ภายหลัง',
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
