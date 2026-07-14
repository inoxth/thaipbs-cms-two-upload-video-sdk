// sdk.js — everything you need to upload a video into Thai PBS Video CMS, in one file.
// Copy this file into your project — see the usage example below.
// No dependencies: the ByteArk upload SDK is loaded from a CDN (jsDelivr serves the browser build).
import { VideoUploadManager } from 'https://cdn.jsdelivr.net/npm/@byteark/video-upload-sdk@1.3.5/+esm';

/*
  Usage — construct once, queue files, then start():

    import { CmsTwoSdk } from './sdk.js';

    const uploadManager = new CmsTwoSdk({
      byteark: { formId, formSecret, projectKey },
      cms: {
        baseUrl:  '<cms base url>',
        accessId: '<accessId>',   // public — identifies your key
        secret:   '<secret>',     // signs short-lived appTokens locally; never sent over the wire
      },
      // NOTE: no teamId — it's derived from your key when the SDK exchanges a token.

      // Callback functions (all optional)
      onUploadProgress: (job, progress) => {},   // a video upload has progress ({ percent })
      onUploadCompleted: (job) => {},            // a video's records now exist in Thai PBS Video CMS
      onUploadFailed: (job, error) => {},        // a video failed; the queue continues
      onVideosCreated: (videoIds) => {},         // all queued videos are created in Thai PBS Video CMS (their ids)
    });

    uploadManager.addUploadJobs(fileList);       // FileList, or [{ file, title, description, programId }]
    const [job] = await uploadManager.start();   // resolves when the queue is drained

  Then poll until a video is playable (a webhook flips its status while it processes):

    const video = await uploadManager.getVideoById(job.video.id);
    // video.mediaVideo.mediaVideoStatus: 'pending' → 'processing' → 'completed'
    // video.mediaVideo.embeddedUrl: player URL once completed

  Single-file shortcut — upload() returns an awaitable job handle:

    const myVideo = uploadManager.upload(file, { title: 'My video' });
    myVideo.onProgress((pct) => console.log(pct + '%'));
    const { video } = await myVideo;             // Thai PBS Video CMS video record created
    const ready = await myVideo.whenReady();     // playable (ready.mediaVideo.embeddedUrl)

  `file` is a File object (from an <input type="file"> or drag-and-drop) — browsers can't
  read filesystem paths.

  How auth works (ByteArk-style, so nothing dangerous is ever on the wire):
    - Your `secret` stays in the browser and is used ONLY to sign a short-lived appToken locally.
    - The SDK POSTs that appToken to /api/v1/upload-tokens and gets back a 5-min accessToken
      (+ your team). Only tokens ever cross the network — never the raw `secret`.
    - The accessToken is sent in the `x-upload-token` header on the two write calls (a custom
      header, not Authorization, so the API gateway doesn't intercept it), cached, and re-minted
      automatically when it expires (or on a 401). Polling the public GET sends no token.
*/

// ════════════════════════════════════════════════════════════════════════════════════
//  CmsTwoSdk — construct with your credentials, queue files, then start()
// ════════════════════════════════════════════════════════════════════════════════════
export class CmsTwoSdk {
  constructor({
    byteark,                     // { formId, formSecret, projectKey }
    cms,                         // { baseUrl, accessId, secret, log? }
    // Callback functions (all optional)
    onUploadProgress,            // (job, progress) — progress: { percent }
    onUploadCompleted,           // (job) — this job's media + video records exist in Thai PBS Video CMS
    onUploadFailed,              // (job, error) — this job failed; the queue continues
    onVideosCreated,             // (videoIds) — Thai PBS Video CMS video ids, after start() drains the queue
    onStatus,                    // (job, phase) — 'uploading' | 'creating-media' | 'creating-video'
  }) {
    this.byteark = byteark;
    // One context per SDK instance, so the exchanged accessToken + teamId are cached across calls.
    this.cms = makeCmsContext(cms);
    this.callbacks = { onUploadProgress, onUploadCompleted, onUploadFailed, onVideosCreated, onStatus };
    this.jobQueue = [];
  }

  // Queue files for upload. Accepts a FileList / File[] or [{ file, title?, description?, programId? }].
  // Returns the created jobs; call start() to run them.
  addUploadJobs(files) {
    const jobs = Array.from(files, (f) => (f instanceof File ? { file: f } : f))
      .map(({ file, title, description, programId }) => ({
        file,
        name: file.name,
        title: title || file.name,
        description,
        programId,
        status: 'pending',        // pending → uploading → creating-media → creating-video → completed | failed
        progress: { percent: 0 },
        media: null, video: null,
      }));
    this.jobQueue.push(...jobs);
    return jobs;
  }

  getJobQueue() { return this.jobQueue; }

  // Process every pending job in the queue; resolves when all are completed or failed.
  // A failed job fires onUploadFailed and the queue moves on — start() itself doesn't throw.
  async start() {
    if (this.running) return this.running;
    this.running = (async () => {
      const cb = this.callbacks;
      const cms = this.cms;
      const createdVideoIds = [];
      let job;
      // ponytail: serial queue — one upload at a time; add concurrency if throughput matters.
      while ((job = this.jobQueue.find((j) => j.status === 'pending'))) {
        try {
          // Validate the credential FIRST — mint (or reuse a cached) accessToken before
          // touching ByteArk, so a bad accessId/secret fails here and never leaves an
          // orphaned video in the stream. Cached across jobs; re-minted later if it expires
          // during a long upload (authedPost re-mints on expiry / retries once on 401).
          await getAuth(cms);

          job.status = 'uploading'; cb.onStatus?.(job, 'uploading');
          // videoKey is the raw ByteArk key — kept internal; the dev works with job.video / job.media.
          const videoKey = await uploadToByteArkStream(this.byteark, job.file, { title: job.title }, (pct) => {
            job.progress = { percent: pct };
            cb.onUploadProgress?.(job, job.progress);
          });

          job.status = 'creating-media'; cb.onStatus?.(job, 'creating-media');
          job.media = await createMediaVideo(cms, { videoKey, file: job.file });

          job.status = 'creating-video'; cb.onStatus?.(job, 'creating-video');
          job.video = await createVideo(cms, {
            media: job.media,
            title: job.title, tagline: job.description, programId: job.programId,
          });

          job.status = 'completed';
          createdVideoIds.push(job.video.id);
          cb.onUploadCompleted?.(job);
        } catch (error) {
          job.status = 'failed';
          cb.onUploadFailed?.(job, error);
        }
      }
      if (createdVideoIds.length) cb.onVideosCreated?.(createdVideoIds);
      return this.jobQueue;
    })();
    try { return await this.running; } finally { this.running = null; }
  }

  // Starts the upload and returns a job handle: attach .onProgress/.onStatus, await it for the
  // created records, or await .whenReady() for the playable video.
  upload(file, { title, description, programId } = {}) {
    const listeners = { progress: [], status: [] };

    // Start on a microtask so listeners attached right after this call still see every event.
    const done = Promise.resolve().then(() => uploadVideo({
      file,
      title: title || file.name,
      description,
      programId,
      byteark: this.byteark,
      cms: this.cms,
      onProgress: (pct) => listeners.progress.forEach((fn) => fn(pct)),
      onStatus: (phase) => listeners.status.forEach((fn) => fn(phase)),
    }));

    const cms = this.cms;
    return {
      onProgress(fn) { listeners.progress.push(fn); return this; },
      onStatus(fn) { listeners.status.push(fn); return this; },
      // awaitable: `await myVideo` → { media, video }
      then: (...a) => done.then(...a),
      catch: (...a) => done.catch(...a),
      finally: (...a) => done.finally(...a),
      // poll Thai PBS Video CMS until processed; resolves with the video (mediaVideo.embeddedUrl)
      async whenReady({ intervalMs = 5000 } = {}) {
        const { video } = await done;
        while (true) {
          const v = await getVideoById(cms, video.id);
          if (v?.mediaVideo?.mediaVideoStatus === 'completed') return v;
          if (v?.mediaVideo?.mediaVideoStatus === 'failed') throw new Error('Video processing failed');
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      },
    };
  }

  // Look up a video by its id. mediaVideo.mediaVideoStatus tells you if it's playable yet.
  getVideoById(videoId) {
    return getVideoById(this.cms, videoId);
  }

  // List this key's team's programs (for linking a video to a program). The team is derived
  // from your key (via the token exchange), so you don't pass a teamId.
  listPrograms() {
    return listPrograms(this.cms);
  }

  // List videos, scoped to your key's team(s). `options` maps 1:1 to the API query string —
  // { page, limit, q, sortBy, publishStatus, programId, mediaStatus, type, ... } (all optional).
  // Returns the paginated envelope: { total, from, to, currentPage, lastPage, perPage, data }.
  listVideos(options = {}) {
    return listVideos(this.cms, options);
  }
}

// ── the underlying one-shot function (CmsTwoSdk.upload wraps this) ───────────────────
export async function uploadVideo({
  file, title, description, programId,
  byteark,                     // { formId, formSecret, projectKey }
  cms: cmsOptions,             // { baseUrl, accessId, secret, log? }  — or an already-built context
  onProgress = () => {},
  onStatus = () => {},
}) {
  // Accept either raw options or a prepared context (CmsTwoSdk passes its cached context).
  const cms = cmsOptions && cmsOptions.__cmsContext ? cmsOptions : makeCmsContext(cmsOptions);

  // 0) validate the credential first — mint the accessToken BEFORE the ByteArk upload, so a
  // bad accessId/secret throws here and never creates an orphaned video in the stream.
  await getAuth(cms);

  // 1) upload the file to the media service (videoKey is the raw ByteArk key — used only internally)
  onStatus('uploading');
  const videoKey = await uploadToByteArkStream(byteark, file, { title }, onProgress);

  // 2) register the file in the Thai PBS Video CMS media library (webhook updates this record)
  onStatus('creating-media');
  const media = await createMediaVideo(cms, { videoKey, file });

  // 3) create the Video record with the metadata (title / description / program)
  onStatus('creating-video');
  const video = await createVideo(cms, { media, title, tagline: description, programId });

  onStatus('done');
  return { media, video };
}

// ════════════════════════════════════════════════════════════════════════════════════
//  Auth — sign an appToken locally, exchange it for a short-lived accessToken, cache it
// ════════════════════════════════════════════════════════════════════════════════════

// Build the context every Thai PBS Video CMS call uses. Holds the credentials + a token cache.
export function makeCmsContext({ baseUrl, accessId, secret, log }) {
  return {
    __cmsContext: true,
    baseUrl: baseUrl.replace(/\/$/, ''),
    accessId,
    secret,
    log,
    _auth: null,                 // { accessToken, teamId, expiresAtMs } — populated by getAuth()
  };
}

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Sign a short-lived appToken (HS256) with the key's secret — entirely in the browser, using
// WebCrypto. The raw secret is used to sign but never leaves the page.
async function signAppToken(secret) {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const segment = (obj) => base64url(enc.encode(JSON.stringify(obj)));
  // Backdate iat and use a 5-min window so a skewed client clock (vs the server's) doesn't
  // reject the token on arrival. ponytail: fixed ±clock tolerance; the accessToken it mints is
  // itself only 5 min, so a wider appToken changes nothing security-wise.
  const data = segment({ alg: 'HS256', typ: 'JWT' }) + '.' + segment({ typ: 'app', iat: now - 60, exp: now + 300 });
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return data + '.' + base64url(new Uint8Array(sig));
}

// Tag SDK errors with which credential set / step failed, so callers (and the demo log) can tell
// an Upload-credential problem (ByteArk: formId/formSecret/projectKey) from a CMS-Two-credential
// problem (cms.accessId/secret). `error.source` is 'byteark' | 'cms'.
function sdkError(source, message, cause) {
  const e = new Error(message);
  e.source = source;
  if (cause !== undefined) e.cause = cause;
  return e;
}

// Return a valid { accessToken, teamId }, minting a fresh one via the exchange when the cache is
// empty, near expiry, or force-refreshed (after a 401). Only tokens cross the network.
// A failure here is a CMS-Two credential problem (cms.accessId / cms.secret) — NOT ByteArk.
async function getAuth(cms, force = false) {
  if (!force && cms._auth && cms._auth.expiresAtMs - 10000 > Date.now()) return cms._auth;
  const appToken = await signAppToken(cms.secret);
  cms.log?.('POST /api/v1/upload-tokens →');
  const res = await fetch(cms.baseUrl + '/api/v1/upload-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessId: cms.accessId, appToken }),
  });
  const json = await res.json().catch(() => ({}));
  cms.log?.('  ' + res.status + ':'); cms.log?.({ ...json, accessToken: json.accessToken ? '(token)' : undefined });
  if (!res.ok) {
    const detail = json.message || ('HTTP ' + res.status);
    // 401 = the key itself was rejected (bad/revoked accessId, or appToken signed with the wrong secret).
    const hint = res.status === 401
      ? ' — check your CMS-Two upload key (cms.accessId / cms.secret).'
      : '';
    throw sdkError('cms', 'CMS-Two rejected the upload key: ' + detail + hint);
  }
  cms._auth = { accessToken: json.accessToken, teamId: json.teamId, expiresAtMs: Date.parse(json.expiresAt) };
  return cms._auth;
}

// ── ByteArk Stream ──────────────────────────────────────────────────────────────────
// The media service endpoint is fixed — callers never need to set it.
const BYTEARK_STREAM_ENDPOINT = 'https://stream.byteark.com';

// Upload the file, resolve with its videoKey. `config` = { formId, formSecret, projectKey }.
export function uploadToByteArkStream(config, file, { title }, onProgress) {
  return new Promise((resolve, reject) => {
    const manager = new VideoUploadManager({
      serviceName: 'byteark.stream',
      serviceEndpoint: BYTEARK_STREAM_ENDPOINT,
      formId: config.formId,
      formSecret: config.formSecret,
      projectKey: config.projectKey,
      onUploadProgress: (_job, p) => onProgress(p?.percent ?? 0),
      onUploadCompleted: (job) => resolve(job.uploadId),   // uploadId is the ByteArk video key
      onUploadFailed: (_job, err) => reject(bytearkError(err)),
    });

    // await addUploadJobs (it creates the video object) before start().
    // videoMetadata only takes { tags, title } — ByteArk rejects other fields.
    manager
      .addUploadJobs([{ file, videoMetadata: { title, tags: [{ name: file.name }] } }])
      .then(() => manager.start())
      .catch((err) => reject(bytearkError(err)));
  });
}

// A failure in the ByteArk step is an Upload-credentials problem (formId / formSecret / projectKey)
// or an upload/network issue — never the CMS-Two key.
function bytearkError(err) {
  const detail = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
  return sdkError(
    'byteark',
    'Video upload to ByteArk failed — check your Upload credentials (byteark.formId / formSecret / projectKey): ' + detail,
    err,
  );
}

// ── Thai PBS Video CMS ─────────────────────────────────────────────────────────────────────────
// Every call takes `cms` (see makeCmsContext).

// Authenticated POST: attaches the accessToken (x-upload-token header) and fills the body with the key's teamId.
// `makeBody(teamId)` builds the request body. On a 401 we re-mint the token once and retry.
async function authedPost(cms, path, makeBody) {
  const send = async (auth) => {
    cms.log?.('POST /api/v1' + path + ' →');
    const body = makeBody(auth.teamId);
    cms.log?.(body);
    return fetch(cms.baseUrl + '/api/v1' + path, {
      method: 'POST',
      // Custom header (not Authorization) so the API gateway doesn't intercept it as a
      // Zitadel bearer before it reaches the CMS.
      headers: { 'content-type': 'application/json', 'x-upload-token': auth.accessToken },
      body: JSON.stringify(body),
    });
  };

  let auth = await getAuth(cms);
  let res = await send(auth);
  if (res.status === 401) {                    // token expired/revoked mid-flight — re-mint once
    auth = await getAuth(cms, true);
    res = await send(auth);
  }
  const json = await res.json().catch(() => ({}));
  cms.log?.('  ' + res.status + ':'); cms.log?.(json);
  if (!res.ok) {
    const detail = json.message || json.errorMessage || ('HTTP ' + res.status);
    // 401/403 here point back at the upload key (expired/revoked, or lacks scope for this team).
    const hint = (res.status === 401 || res.status === 403)
      ? ' — check your CMS-Two upload key (cms.accessId / cms.secret).'
      : '';
    throw sdkError('cms', 'CMS-Two ' + path + ' failed: ' + detail + hint);
  }
  return json;
}

// Authenticated GET: attaches the accessToken (x-upload-token) so the API scopes the result to the
// key's readable team(s). Re-mints the token once on a 401, mirroring authedPost.
async function authedGet(cms, path) {
  const send = (auth) => {
    cms.log?.('GET /api/v1' + path + ' →');
    return fetch(cms.baseUrl + '/api/v1' + path, { headers: { 'x-upload-token': auth.accessToken } });
  };

  let auth = await getAuth(cms);
  let res = await send(auth);
  if (res.status === 401) { auth = await getAuth(cms, true); res = await send(auth); }
  const json = await res.json().catch(() => ({}));
  cms.log?.('  ' + res.status + ':'); cms.log?.(json);
  if (!res.ok) {
    const detail = json.message || json.errorMessage || ('HTTP ' + res.status);
    const hint = (res.status === 401 || res.status === 403)
      ? ' — check your CMS-Two upload key (cms.accessId / cms.secret).'
      : '';
    throw sdkError('cms', 'CMS-Two ' + path + ' failed: ' + detail + hint);
  }
  return json;
}

// Register the file in the media library. Creates a media-video keyed by the ByteArk
// videoKey; ByteArk's webhook later finds it by that key and updates mediaVideoStatus.
export async function createMediaVideo(cms, { videoKey, file }) {
  const json = await authedPost(cms, '/media/files', (teamId) => ({
    type: 'video',
    videos: [{
      teamId,
      type: 'video',
      filename: file.name,
      parentFolderId: null,
      key: videoKey,
      sourceType: 'stream',
      durationSeconds: 0,
      mediaVideoStatus: 'pending',
      mediaVideoAvailabledAt: null,
      mp4MediaStatus: 'unknown',
      mp4MediaAvailabledAt: null,
    }],
  }));
  return json.videos[0];
}

// Create the Video record from that media-video. The video item is the media's data
// + metaInfo; passing media.id links the two (so the webhook's status also reaches the video).
export async function createVideo(cms, { media, title, tagline, programId }) {
  const json = await authedPost(cms, '/videos', (teamId) => ({
    teamId,
    videos: [{
      id: media.id,
      teamId,
      type: 'video',
      sourceType: 'stream',
      key: media.key,
      externalId: media.key,
      filename: media.filename,
      originalFilename: media.originalFilename || media.filename,
      useFor: 'video',
      parentFolderId: null,
      coverImageUrl: media.coverImageUrl ?? null,
      usedIn: [],
      durationSeconds: media.durationSeconds,
      mediaVideoStatus: media.mediaVideoStatus,
      mediaVideoAvailabledAt: media.mediaVideoAvailabledAt ?? null,
      mp4MediaStatus: media.mp4MediaStatus,
      mp4MediaAvailabledAt: media.mp4MediaAvailabledAt ?? null,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
      metaInfo: {
        title,
        tagline,                                 // description is stored as `tagline`
        ...(programId ? { programId } : {}),
      },
    }],
  }));
  return json.videos[0];
}

// Look up a video by its id (poll until video.mediaVideo.mediaVideoStatus is 'completed').
// Public endpoint — no token needed, so polling works for the whole transcoding duration.
export async function getVideoById(cms, videoId) {
  const res = await fetch(cms.baseUrl + '/api/v1/videos/' + videoId);
  return res.json();
}

// List the key's team's programs. Sends the x-upload-token (authenticated GET) plus the team's id
// as `teamIds` (plural — the program query's param name), derived from the token exchange. Returns
// the programs array.
export async function listPrograms(cms) {
  const { teamId } = await getAuth(cms);
  const { data = [] } = await authedGet(cms, '/programs?teamIds=' + encodeURIComponent(teamId) + '&limit=100');
  return data;
}

// List videos scoped to the key's readable team(s) (GET /videos; sends the x-upload-token so the
// API resolves that scope — unlike the public getVideoById). `options` maps 1:1 to the API query
// string: page, limit, q, sortBy, publishStatus, programId, mediaStatus, type, etc. Empty values are
// dropped. Returns the paginated envelope { total, from, to, currentPage, lastPage, perPage, data }.
export async function listVideos(cms, options = {}) {
  const { teamId } = await getAuth(cms);
  const qs = new URLSearchParams();
  qs.set('teamId', teamId);            // scope to the key's team (from the token exchange)
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);   // caller can override teamId
  }
  return authedGet(cms, '/videos?' + qs.toString());
}
