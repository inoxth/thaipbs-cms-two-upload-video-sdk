// app.js — the demo UI. Integration-wise it does exactly what your app would do:
// construct a CmsTwoSdk, addUploadJobs(), start(), and check getVideoById() until ready.
import { CmsTwoSdk } from './sdk.js';
import { t, initI18n } from './i18n.js';

// ── tiny DOM helpers ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent += (typeof m === 'string' ? m : JSON.stringify(m, null, 2)) + '\n'; };
const setStatus = (text, kind = 'info') => {   // kind: 'info' | 'ok' | 'err'
  $('status').className = 'status ' + kind;
  $('status').textContent = text;
};

// Build the SDK from the current form values (fresh each time, so edits apply immediately).
const uploader = (callbacks = {}) => new CmsTwoSdk({
  teamId: $('teamId').value.trim(),
  byteark: {
    formId: $('formId').value.trim(),
    formSecret: $('formSecret').value.trim(),
    projectKey: $('projectKey').value.trim(),
  },
  cms: { baseUrl: $('cmsBase').value, apiSecret: $('apiSecret').value.trim(), log },
  ...callbacks,
});

// ── main flow: ONE call to the SDK does upload → create media → create video ─────────
let busy = false;
let lastVideoId = null;    // the most recent upload's video id, so "Refresh player" can re-check it
async function handleUpload() {
  if (busy) return;
  const file = $('file').files[0];
  if (!file) return alert(t('alert.pickFile'));

  busy = true;
  $('go').disabled = true;
  $('bar').hidden = false; $('bar').value = 0;
  $('log').textContent = '';
  showPreview('empty');

  try {
    // ByteArk-style queue: construct with callbacks, queue the file(s), then start().
    const uploadManager = uploader({
      onUploadProgress: (_job, progress) => {
        $('bar').value = Math.round(progress.percent);
        setStatus(t('status.uploadingPct', Math.round(progress.percent)));
      },
      onStatus: (_job, phase) => {
        if (phase === 'uploading') setStatus(t('status.uploading'));
        if (phase === 'creating-media') { $('bar').value = 100; setStatus(t('status.creatingMedia')); }
        if (phase === 'creating-video') setStatus(t('status.creatingVideo'));
      },
      onUploadCompleted: () => setStatus(t('status.done'), 'ok'),
      onUploadFailed: (_job, error) => { setStatus(t('status.error'), 'err'); log(String(error)); },
    });

    uploadManager.addUploadJobs([{
      file,
      title: $('title').value.trim() || file.name,
      description: $('description').value.trim(),
      programId: $('program').value,
    }]);
    const [job] = await uploadManager.start();   // resolves when the queue is drained
    if (job.status !== 'completed') return;      // failure already shown by onUploadFailed

    log('video id: ' + job.video.id + '  (key: ' + job.videoKey + ')');
    lastVideoId = job.video.id; $('refresh').disabled = false;   // enable manual refresh
    saveHistory();                // creds worked — remember them for next time

    // Poll Thai PBS Video CMS until the video is ready, then show the player from the API response.
    if ($('auto').checked) whenReadyShowPlayer(job.video.id);
  } catch (err) {
    setStatus(t('status.error'), 'err'); log(String(err));
  } finally {
    $('go').disabled = false; busy = false;
  }
}
$('go').addEventListener('click', handleUpload);

// ── preview box: placeholder ('empty'/'processing'), or the Thai PBS Video CMS player ('embed') ──
function showPreview(state, url) {
  const frame = $('previewFrame'), empty = $('previewEmpty');
  if (state === 'embed') {          // <iframe> player from the Thai PBS Video CMS embeddedUrl
    frame.src = url; frame.style.display = 'block'; empty.style.display = 'none';
  } else {                          // 'empty' | 'processing' — show the placeholder box
    frame.src = ''; frame.style.display = 'none'; empty.style.display = 'flex';
    empty.textContent = t(state === 'processing' ? 'preview.processing' : 'preview.empty');
  }
}

// Check the video every 5s; show "processing" until mediaVideoStatus is completed, then play
// the Thai PBS Video CMS player using the embeddedUrl from that same GET response.
async function whenReadyShowPlayer(videoId) {
  while (true) {
    const video = await uploader().getVideoById(videoId);
    const status = video?.mediaVideo?.mediaVideoStatus;
    if (status === 'completed') {
      showPreview('embed', video.mediaVideo.embeddedUrl);
      setStatus(t('status.ready'), 'ok');
      return;
    }
    if (status === 'failed') { setStatus(t('status.failed'), 'err'); return; }
    showPreview('processing');                            // box shows "Video is processing…"
    setStatus(t('status.processing', status), 'info');   // pending/processing — keep waiting
    // ponytail: unbounded poll until completed/failed, per request. Close the tab to stop.
    await new Promise((r) => setTimeout(r, 5000));        // check again in 5s
  }
}

// Refresh player: re-fetch the latest video from Thai PBS Video CMS and show the player if it's ready.
$('refresh').addEventListener('click', async () => {
  if (!lastVideoId) return;
  const btn = $('refresh'); btn.disabled = true;
  try {
    const video = await uploader().getVideoById(lastVideoId);
    const status = video?.mediaVideo?.mediaVideoStatus;
    if (status === 'completed') {
      showPreview('embed', video.mediaVideo.embeddedUrl);
      setStatus(t('status.ready'), 'ok');
    } else {
      showPreview('processing');
      setStatus(t('status.processing', status), 'info');
    }
  } finally { btn.disabled = false; }
});

// ── program dropdown ────────────────────────────────────────────────────────────────
$('loadPrograms').addEventListener('click', async () => {
  const teamId = $('teamId').value.trim();
  if (!teamId) return alert(t('alert.enterTeam'));
  const btn = $('loadPrograms'); btn.disabled = true; btn.textContent = t('btn.loading');
  try {
    const data = await uploader().listPrograms();
    $('program').innerHTML = '<option value="">' + t('opt.none') + '</option>';
    for (const p of data) $('program').add(new Option(p.title + (p.slugCode ? ' (' + p.slugCode + ')' : ''), p.id));
    log(t('log.loadedPrograms', data.length));
  } catch (e) { alert(t('alert.loadFailed', e.message)); }
  finally { btn.disabled = false; btn.textContent = t('btn.loadPrograms'); }
});

// ── show/hide the masked API secret (CSS class swaps which eye icon shows) ───────────
$('toggleSecret').addEventListener('click', () => {
  const reveal = $('apiSecret').type === 'password';
  $('apiSecret').type = reveal ? 'text' : 'password';
  $('toggleSecret').classList.toggle('reveal', reveal);
});

// ── input history: remember past entries and offer them as a native <datalist> dropdown ──
// Saved to localStorage after a successful upload, so repeat uploads are quicker.
const REMEMBER = ['formId', 'formSecret', 'projectKey', 'teamId', 'title'];
function loadHistory() {
  for (const id of REMEMBER) {
    const el = $(id); if (!el) continue;
    const listId = id + '-history';
    let dl = document.getElementById(listId);
    if (!dl) { dl = document.createElement('datalist'); dl.id = listId; el.setAttribute('list', listId); el.after(dl); }
    dl.replaceChildren();
    for (const v of JSON.parse(localStorage.getItem('hist:' + id) || '[]')) {
      const opt = document.createElement('option'); opt.value = v; dl.appendChild(opt);
    }
  }
}
function saveHistory() {
  for (const id of REMEMBER) {
    const v = $(id)?.value.trim(); if (!v) continue;
    const prev = JSON.parse(localStorage.getItem('hist:' + id) || '[]');
    localStorage.setItem('hist:' + id, JSON.stringify([v, ...prev.filter((x) => x !== v)].slice(0, 8)));
  }
  loadHistory();
}
loadHistory();

// render the initial language + wire the EN/TH switcher
initI18n();

// ── docs chrome: copy buttons on code blocks + active-section highlight in the sidebar ──
for (const pre of document.querySelectorAll('pre.code')) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'copy-btn'; btn.textContent = 'Copy';
  btn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(pre.querySelector('code').textContent);
    btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1200);
  });
  pre.appendChild(btn);
}

// ── live code: mirror the form as a real CmsTwoSdk call, updating as the user types ──
function renderLiveCode() {
  const v = (id) => $(id).value.trim();
  const str = (s) => "'" + String(s).replace(/'/g, "\\'") + "'";
  const orPh = (id, ph) => str(v(id) || ph);          // value, else a <placeholder>
  const secret = (id, ph) => (v(id) ? "'•••••'" : str(ph)); // never print the real secret
  // The demo routes staging through the local proxy (base ''), but the live code should show the
  // real domain a dev would actually put here.
  const base = $('cmsBase').value || 'https://console-program-new.thaipbsbeta.com';
  const file = $('file').files[0];
  const programId = $('program').value;

  $('liveCode').querySelector('code').textContent =
`import { CmsTwoSdk } from './sdk.js';

const uploadManager = new CmsTwoSdk({
  teamId: ${orPh('teamId', 'teamId')},
  byteark: {
    formId: ${orPh('formId', '<form id>')},
    formSecret: ${orPh('formSecret', '<form secret>')},
    projectKey: ${orPh('projectKey', '<project key>')},
  },
  cms: {
    baseUrl: ${str(base)},
    apiSecret: ${secret('apiSecret', 'apiSecret')},
  },
  onUploadProgress: (job, progress) => console.log(progress.percent + '%'),
  onUploadCompleted: (job) => console.log('created:', job.videoKey),
});

uploadManager.addUploadJobs([{
  file,${file ? '   // ' + file.name : '   // choose a video file below'}
  title: ${orPh('title', '<title>')},
  description: ${orPh('description', '')},${programId ? `\n  programId: ${str(programId)},` : ''}
}]);

await uploadManager.start();`;
}
document.addEventListener('input', renderLiveCode);
document.addEventListener('change', renderLiveCode);
renderLiveCode();

const navLinks = [...document.querySelectorAll('.sidebar nav a')];
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }
}, { rootMargin: '0px 0px -70% 0px' });
for (const sec of document.querySelectorAll('[id]')) {
  if (navLinks.some((a) => a.getAttribute('href') === '#' + sec.id)) spy.observe(sec);
}
