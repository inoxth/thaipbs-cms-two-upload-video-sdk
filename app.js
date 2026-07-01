// app.js — UI wiring: read the form, call the api.js functions, update preview/status/log.
import * as api from './api.js';
import { t, initI18n } from './i18n.js';

// ── tiny DOM helpers ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent += (typeof m === 'string' ? m : JSON.stringify(m, null, 2)) + '\n'; };
const setStatus = (text, kind = 'info') => {   // kind: 'info' | 'ok' | 'err'
  $('status').className = 'status ' + kind;
  $('status').textContent = text;
};

// Gather the current form values into the shapes api.js expects.
const byteArkConfig = () => ({
  serviceEndpoint: $('serviceEndpoint').value.trim(),
  formId: $('formId').value.trim(),
  formSecret: $('formSecret').value.trim(),
  projectKey: $('projectKey').value.trim(),
});
const cms = () => {
  const secret = $('apiSecret').value.trim();
  return {
    baseUrl: $('cmsBase').value.replace(/\/$/, ''),
    // Auth header for CMS-Two: optional on local (auto-auth), required on staging.
    headers: secret ? { 'x-api-server-secret': secret } : {},
    log,
  };
};

// ── main flow: one click runs upload → create media → create video ──────────────────
let busy = false;
let lastVideoKey = null;   // the most recent upload, so "Refresh player" can re-check it
async function handleUpload() {
  if (busy) return;
  const file = $('file').files[0];
  if (!file) return alert(t('alert.pickFile'));

  const teamId = $('teamId').value.trim();
  const title = $('title').value.trim() || file.name;
  const description = $('description').value.trim();
  const programId = $('program').value;

  busy = true;
  $('go').disabled = true;
  $('bar').hidden = false; $('bar').value = 0;
  $('log').textContent = '';
  showPreview('empty');

  try {
    // STEP 1 — upload the file to ByteArk Stream
    setStatus(t('status.uploading'));
    const videoKey = await api.uploadToByteArkStream(byteArkConfig(), file, { title }, (pct) => {
      $('bar').value = Math.round(pct);
      setStatus(t('status.uploadingPct', Math.round(pct)));
    });
    $('bar').value = 100;
    log('video key: ' + videoKey);
    setStatus(t('status.uploaded'), 'ok');
    lastVideoKey = videoKey; $('refresh').disabled = false;   // enable manual refresh
    saveHistory();                // creds worked — remember them for next time

    // STEP 2a — register the media-video in the library (this is what the webhook updates)
    setStatus(t('status.creatingMedia'));
    const media = await api.createMediaVideo(cms(), { videoKey, file, teamId });

    // STEP 2b — create the Video record from that media (title / description / program)
    setStatus(t('status.creatingVideo'));
    await api.createVideo(cms(), { media, teamId, title, tagline: description, programId });
    setStatus(t('status.done'), 'ok');

    // Poll CMS-Two until the video is ready, then show the player from the API response.
    if ($('auto').checked) whenReadyShowPlayer(videoKey);
  } catch (err) {
    setStatus(t('status.error'), 'err'); log(String(err));
  } finally {
    $('go').disabled = false; busy = false;
  }
}
$('go').addEventListener('click', handleUpload);

// ── preview box: placeholder ('empty'/'processing'), or the CMS-Two player ('embed') ──
function showPreview(state, url) {
  const frame = $('previewFrame'), empty = $('previewEmpty');
  if (state === 'embed') {          // <iframe> player from the CMS-Two embeddedUrl
    frame.src = url; frame.style.display = 'block'; empty.style.display = 'none';
  } else {                          // 'empty' | 'processing' — show the placeholder box
    frame.src = ''; frame.style.display = 'none'; empty.style.display = 'flex';
    empty.textContent = t(state === 'processing' ? 'preview.processing' : 'preview.empty');
  }
}

// Check the video every 5s; show "processing" until mediaVideoStatus is completed, then play
// the CMS-Two player using the embeddedUrl from that same GET response.
async function whenReadyShowPlayer(videoKey) {
  while (true) {
    const media = await api.getMediaVideoByKey(cms(), videoKey);
    const status = media?.mediaVideoStatus;
    if (status === 'completed') {
      showPreview('embed', media.embeddedUrl);
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

// Refresh player: re-fetch the latest video from CMS-Two and show the player if it's ready.
$('refresh').addEventListener('click', async () => {
  if (!lastVideoKey) return;
  const btn = $('refresh'); btn.disabled = true;
  try {
    const media = await api.getMediaVideoByKey(cms(), lastVideoKey);
    if (media?.mediaVideoStatus === 'completed') {
      showPreview('embed', media.embeddedUrl);
      setStatus(t('status.ready'), 'ok');
    } else {
      showPreview('processing');
      setStatus(t('status.processing', media?.mediaVideoStatus), 'info');
    }
  } finally { btn.disabled = false; }
});

// ── program dropdown ────────────────────────────────────────────────────────────────
$('loadPrograms').addEventListener('click', async () => {
  const teamId = $('teamId').value.trim();
  if (!teamId) return alert(t('alert.enterTeam'));
  const btn = $('loadPrograms'); btn.disabled = true; btn.textContent = t('btn.loading');
  try {
    const data = await api.listPrograms(cms(), teamId);
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
