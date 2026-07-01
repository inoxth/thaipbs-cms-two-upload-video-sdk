// app.js — UI wiring: read the form, call the api.js functions, update preview/status/log.
import * as api from './api.js';

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
async function handleUpload() {
  if (busy) return;
  const file = $('file').files[0];
  if (!file) return alert('Pick a video file first');

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
    setStatus('Uploading to ByteArk…');
    const videoKey = await api.uploadToByteArkStream(byteArkConfig(), file, { title }, (pct) => {
      $('bar').value = Math.round(pct);
      setStatus('Uploading to ByteArk — ' + Math.round(pct) + '%');
    });
    $('bar').value = 100;
    log('ByteArk videoKey: ' + videoKey);
    setStatus('Video uploaded ✓', 'ok');
    saveHistory();                // creds worked — remember them for next time
    showPreview('local', file);   // preview the local file right away (ByteArk is still transcoding)

    // STEP 2a — register the media-video in the library (this is what the webhook updates)
    setStatus('Creating media in CMS-Two…');
    const media = await api.createMediaVideo(cms(), { videoKey, file, teamId });

    // STEP 2b — create the Video record from that media (title / description / program)
    setStatus('Creating video in CMS-Two…');
    const video = await api.createVideo(cms(), { media, teamId, title, tagline: description, programId });
    setStatus('Done — media + video created in CMS-Two', 'ok');

    // Wait for ByteArk's webhook to flip mediaVideoStatus to completed, then show the player.
    const embeddedUrl = media?.embeddedUrl || video?.mediaVideo?.embeddedUrl;
    if ($('auto').checked && embeddedUrl) whenReadyShowPlayer(videoKey, embeddedUrl);
  } catch (err) {
    setStatus('Error — see log', 'err'); log(String(err));
  } finally {
    $('go').disabled = false; busy = false;
  }
}
$('go').addEventListener('click', handleUpload);

// ── preview box: one of three states ────────────────────────────────────────────────
function showPreview(state, arg) {
  const video = $('previewVideo'), frame = $('previewFrame'), empty = $('previewEmpty');
  video.style.display = frame.style.display = empty.style.display = 'none';
  if (state === 'local') {         // <video> playing the local file
    video.src = URL.createObjectURL(arg); video.style.display = 'block';
  } else if (state === 'embed') {  // <iframe> ByteArk player from the CMS-Two embeddedUrl
    frame.src = arg; frame.style.display = 'block';
  } else {                          // 'empty' placeholder
    video.removeAttribute('src'); frame.src = '';
    empty.style.display = 'flex';
  }
}

// Poll the media-video until ByteArk finishes transcoding, then show the player.
async function whenReadyShowPlayer(videoKey, embeddedUrl) {
  for (let i = 0; i < 40; i++) {                     // ~10 min max, checking every 15s
    await new Promise((r) => setTimeout(r, 15000));
    const status = (await api.getMediaVideoByKey(cms(), videoKey))?.mediaVideoStatus;
    setStatus('Transcoding… (' + status + ')');
    if (status === 'completed') {
      showPreview('embed', embeddedUrl);
      setStatus('Ready — playing ByteArk VOD', 'ok');
      return;
    }
  }
  setStatus('Still transcoding — reload later to watch', 'info');
}

// ── program dropdown ────────────────────────────────────────────────────────────────
$('loadPrograms').addEventListener('click', async () => {
  const teamId = $('teamId').value.trim();
  if (!teamId) return alert('Enter a Team ID first');
  const btn = $('loadPrograms'); btn.disabled = true; btn.textContent = 'Loading…';
  try {
    const data = await api.listPrograms(cms(), teamId);
    $('program').innerHTML = '<option value="">— none —</option>';
    for (const p of data) $('program').add(new Option(p.title + (p.slugCode ? ' (' + p.slugCode + ')' : ''), p.id));
    log('Loaded ' + data.length + ' programs');
  } catch (e) { alert('Load failed: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Load programs'; }
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
