// sdk.js — everything you need to upload a video into Thai PBS Video CMS, in one file.
// Copy this file into your project — see the usage example below.
// No dependencies: the ByteArk upload SDK is loaded from a CDN (jsDelivr serves the browser build).
import { VideoUploadManager } from 'https://cdn.jsdelivr.net/npm/@byteark/video-upload-sdk@1.3.5/+esm';

/*
  Usage — construct once, queue files, then start():

    import { CmsTwoSdk } from './sdk.js';

    const uploadManager = new CmsTwoSdk({
      teamId: 'teamId',
      byteark: { formId, formSecret, projectKey },
      cms: { baseUrl: '<cms base url>', apiSecret: 'apiSecret' },

      // Callback functions (all optional)
      onUploadProgress: (job, progress) => {},   // a video upload has progress ({ percent })
      onUploadCompleted: (job) => {},            // a video's records now exist in Thai PBS Video CMS
      onUploadFailed: (job, error) => {},        // a video failed; the queue continues
      onVideosCreated: (videoKeys) => {},        // all queued videos are created in Thai PBS Video CMS
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
*/

// ════════════════════════════════════════════════════════════════════════════════════
//  CmsTwoSdk — construct with your credentials, queue files, then start()
// ════════════════════════════════════════════════════════════════════════════════════
export class CmsTwoSdk {
  constructor({
    teamId,
    byteark,                     // { formId, formSecret, projectKey }
    cms,                         // { baseUrl, apiSecret?, log? }
    // Callback functions (all optional)
    onUploadProgress,            // (job, progress) — progress: { percent }
    onUploadCompleted,           // (job) — this job's media + video records exist in Thai PBS Video CMS
    onUploadFailed,              // (job, error) — this job failed; the queue continues
    onVideosCreated,             // (videoKeys) — after start() drains the queue
    onStatus,                    // (job, phase) — 'uploading' | 'creating-media' | 'creating-video'
  }) {
    this.teamId = teamId;
    this.byteark = byteark;
    this.cmsOptions = cms;
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
        videoKey: null, media: null, video: null,
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
      const createdKeys = [];
      let job;
      // ponytail: serial queue — one upload at a time; add concurrency if throughput matters.
      while ((job = this.jobQueue.find((j) => j.status === 'pending'))) {
        try {
          job.status = 'uploading'; cb.onStatus?.(job, 'uploading');
          job.videoKey = await uploadToByteArkStream(this.byteark, job.file, { title: job.title }, (pct) => {
            job.progress = { percent: pct };
            cb.onUploadProgress?.(job, job.progress);
          });

          const cms = makeCmsContext(this.cmsOptions);
          job.status = 'creating-media'; cb.onStatus?.(job, 'creating-media');
          job.media = await createMediaVideo(cms, { videoKey: job.videoKey, file: job.file, teamId: this.teamId });

          job.status = 'creating-video'; cb.onStatus?.(job, 'creating-video');
          job.video = await createVideo(cms, {
            media: job.media, teamId: this.teamId,
            title: job.title, tagline: job.description, programId: job.programId,
          });

          job.status = 'completed';
          createdKeys.push(job.videoKey);
          cb.onUploadCompleted?.(job);
        } catch (error) {
          job.status = 'failed';
          cb.onUploadFailed?.(job, error);
        }
      }
      if (createdKeys.length) cb.onVideosCreated?.(createdKeys);
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
      teamId: this.teamId,
      byteark: this.byteark,
      cms: this.cmsOptions,
      onProgress: (pct) => listeners.progress.forEach((fn) => fn(pct)),
      onStatus: (phase) => listeners.status.forEach((fn) => fn(phase)),
    }));

    const cmsOptions = this.cmsOptions;
    return {
      onProgress(fn) { listeners.progress.push(fn); return this; },
      onStatus(fn) { listeners.status.push(fn); return this; },
      // awaitable: `await myVideo` → { videoKey, media, video }
      then: (...a) => done.then(...a),
      catch: (...a) => done.catch(...a),
      finally: (...a) => done.finally(...a),
      // poll Thai PBS Video CMS until processed; resolves with the video (mediaVideo.embeddedUrl)
      async whenReady({ intervalMs = 5000 } = {}) {
        const { video } = await done;
        const cms = makeCmsContext(cmsOptions);
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
    return getVideoById(makeCmsContext(this.cmsOptions), videoId);
  }

  // List this team's programs (for linking a video to a program).
  listPrograms() {
    return listPrograms(makeCmsContext(this.cmsOptions), this.teamId);
  }
}

// ── the underlying one-shot function (CmsTwoSdk.upload wraps this) ───────────────────
export async function uploadVideo({
  file, title, description, programId,
  teamId,
  byteark,                     // { formId, formSecret, projectKey }
  cms: cmsOptions,             // { baseUrl, apiSecret?, log? }
  onProgress = () => {},
  onStatus = () => {},
}) {
  const cms = makeCmsContext(cmsOptions);

  // 1) upload the file to the media service → videoKey
  onStatus('uploading');
  const videoKey = await uploadToByteArkStream(byteark, file, { title }, onProgress);

  // 2) register the file in the Thai PBS Video CMS media library (webhook updates this record)
  onStatus('creating-media');
  const media = await createMediaVideo(cms, { videoKey, file, teamId });

  // 3) create the Video record with the metadata (title / description / program)
  onStatus('creating-video');
  const video = await createVideo(cms, { media, teamId, title, tagline: description, programId });

  onStatus('done');
  return { videoKey, media, video };
}

// Build the context every Thai PBS Video CMS call uses: { baseUrl, headers, log }.
export function makeCmsContext({ baseUrl, apiSecret, log }) {
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    // Auth header for Thai PBS Video CMS: optional on local (auto-auth), required on staging.
    headers: apiSecret ? { 'x-api-server-secret': apiSecret } : {},
    log,
  };
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
      onUploadFailed: (_job, err) => reject(err),
    });

    // await addUploadJobs (it creates the video object) before start().
    // videoMetadata only takes { tags, title } — ByteArk rejects other fields.
    manager
      .addUploadJobs([{ file, videoMetadata: { title, tags: [{ name: file.name }] } }])
      .then(() => manager.start())
      .catch(reject);
  });
}

// ── Thai PBS Video CMS ─────────────────────────────────────────────────────────────────────────
// Every call takes `cms` = { baseUrl, headers, log } (see makeCmsContext).
async function postCmsTwo(cms, path, body) {
  cms.log?.('POST /api/v1' + path + ' →'); cms.log?.(body);
  const res = await fetch(cms.baseUrl + '/api/v1' + path, {
    method: 'POST',
    headers: { ...cms.headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  cms.log?.('  ' + res.status + ':'); cms.log?.(json);
  if (!res.ok) throw new Error('Thai PBS Video CMS ' + path + ' failed: ' + (json.errorMessage || res.status));
  return json;
}

// Register the file in the media library. Creates a media-video keyed by the ByteArk
// videoKey; ByteArk's webhook later finds it by that key and updates mediaVideoStatus.
export async function createMediaVideo(cms, { videoKey, file, teamId }) {
  const json = await postCmsTwo(cms, '/media/files', {
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
  });
  return json.videos[0];
}

// Create the Video record from that media-video. The video item is the media's data
// + metaInfo; passing media.id links the two (so the webhook's status also reaches the video).
export async function createVideo(cms, { media, teamId, title, tagline, programId }) {
  const json = await postCmsTwo(cms, '/videos', {
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
  });
  return json.videos[0];
}

// Look up a video by its id (poll until video.mediaVideo.mediaVideoStatus is 'completed').
export async function getVideoById(cms, videoId) {
  const res = await fetch(cms.baseUrl + '/api/v1/videos/' + videoId, { headers: cms.headers });
  return res.json();
}

// List a team's programs (NOTE: the query param is `teamIds`, plural).
export async function listPrograms(cms, teamId) {
  const res = await fetch(cms.baseUrl + '/api/v1/programs?teamIds=' + encodeURIComponent(teamId) + '&limit=100', { headers: cms.headers });
  const { data = [] } = await res.json();
  return data;
}
