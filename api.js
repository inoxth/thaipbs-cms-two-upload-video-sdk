// api.js — all network calls (ByteArk SDK + CMS-Two REST). No DOM here; the UI (app.js) passes
// in whatever these functions need and handles the results.
//
// ByteArk upload SDK, loaded from a CDN (no build step). Use jsDelivr — it serves the browser build.
import { VideoUploadManager } from 'https://cdn.jsdelivr.net/npm/@byteark/video-upload-sdk@1.3.5/+esm';

// ── ByteArk Stream ──────────────────────────────────────────────────────────────────
// Upload the file, resolve with its videoKey. `config` = { serviceEndpoint, formId, formSecret, projectKey }.
export function uploadToByteArkStream(config, file, { title }, onProgress) {
  return new Promise((resolve, reject) => {
    const manager = new VideoUploadManager({
      serviceName: 'byteark.stream',
      serviceEndpoint: config.serviceEndpoint,
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

// ── CMS-Two ─────────────────────────────────────────────────────────────────────────
// Every call takes `cms` = { baseUrl, headers, log }.
async function postCmsTwo(cms, path, body) {
  cms.log?.('POST /api/v1' + path + ' →'); cms.log?.(body);
  const res = await fetch(cms.baseUrl + '/api/v1' + path, {
    method: 'POST',
    headers: { ...cms.headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  cms.log?.('  ' + res.status + ':'); cms.log?.(json);
  if (!res.ok) throw new Error('CMS-Two ' + path + ' failed: ' + (json.errorMessage || res.status));
  return json;
}

// STEP 2a — register the file in the media library. Creates a media-video keyed by the ByteArk
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

// STEP 2b — create the Video record from that media-video. The video item is the media's data
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

// Look up a media-video by its ByteArk key (used to poll transcoding status).
export async function getMediaVideoByKey(cms, videoKey) {
  const res = await fetch(cms.baseUrl + '/api/v1/media/files/key:' + videoKey, { headers: cms.headers });
  return res.json();
}

// List a team's programs (NOTE: the query param is `teamIds`, plural).
export async function listPrograms(cms, teamId) {
  const res = await fetch(cms.baseUrl + '/api/v1/programs?teamIds=' + encodeURIComponent(teamId) + '&limit=100', { headers: cms.headers });
  const { data = [] } = await res.json();
  return data;
}
