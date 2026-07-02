# CMS-Two Upload Demo

An integration demo for uploading videos into CMS-Two. The whole flow is wrapped in **one SDK
class** — copy `sdk.js` into your project, construct it once, queue files, then `start()`:

```js
import { CmsTwoSdk } from './sdk.js';

const uploadManager = new CmsTwoSdk({
  teamId: '<team ObjectId>',
  byteark: { formId, formSecret, projectKey, serviceEndpoint: 'https://stream.byteark.com' },
  cms: { baseUrl: '<cms base url>', apiSecret: '<staging only>' },

  // Callback functions (all optional)
  onUploadProgress: (job, progress) => console.log(job.name, progress.percent + '%'),
  onUploadCompleted: (job) => console.log('created in CMS-Two:', job.videoKey),
  onUploadFailed: (job, error) => console.error(job.name, error),
  onVideosCreated: (videoKeys) => console.log('all done:', videoKeys),
});

uploadManager.addUploadJobs(fileList);     // FileList, or [{ file, title, description, programId }]
await uploadManager.start();               // resolves when the queue is drained

// later — poll until a video is playable:
const { mediaVideoStatus, embeddedUrl } = await uploadManager.getVideoByKey(videoKey);
// mediaVideoStatus: 'pending' → 'processing' → 'completed'
```

Single-file shortcut — `upload()` returns an awaitable job handle:

```js
const myVideo = uploadManager.upload(file, { title: 'My video' });
myVideo.onProgress((pct) => console.log(pct + '%'));
const { videoKey } = await myVideo;        // records created
const ready = await myVideo.whenReady();   // playable (has embeddedUrl)
```

What each queued job does:
1. Uploads the file to the media service → gets a `videoKey`.
2. Registers a **media-video** in the CMS-Two library (`POST /api/v1/media/files`) — the record
   the processing webhook updates.
3. Creates the **video** record with the metadata (`POST /api/v1/videos`), linked to the media.

`start()` resolves as soon as every job's records exist; processing continues on the media
service. Poll `uploadManager.getVideoByKey(videoKey)` (or `myVideo.whenReady()`) until
`mediaVideoStatus` is `completed`.

## Files
- `sdk.js` — **the file you copy**: the `CmsTwoSdk` class + every CMS-Two call. No DOM, no dependencies.
- `index.html` — the demo page markup (form + preview + log + integration tutorial).
- `app.js` — demo UI wiring: reads the form, calls `sdk.js`, updates preview/status/log/history.
- `styles.css` — styling (CMS-Two design tokens).
- `i18n.js` — EN/TH text for the page.
- `proxy.mjs` — a tiny Node server that serves the files **and** proxies `/api/*` to a CMS-Two
  environment. The proxy exists so the browser can call **staging** without CORS errors: the page
  calls the proxy same-origin, and the proxy forwards server-to-server (where CORS doesn't apply),
  passing the `x-api-server-secret` auth header.

## Run

```bash
node proxy.mjs
```

Then open http://localhost:8899/

Config via env (optional):

```bash
PORT=8899 STAGING_BASE=https://console-program-new.thaipbsbeta.com node proxy.mjs
```

## Using the page
1. Fill the **Upload credentials** (Form ID/Secret, Project Key).
2. **CMS-Two** → pick the target:
   - *Staging (via local proxy)* — default; set the **API secret** to the env `API_SERVER_SECRET`.
   - *Local dev* (`http://localhost:3000`) — auto-authenticates, leave the secret blank.
3. Fill Program / Title / Description, choose the video file, click **Upload**.

Requires Node 24+ (uses global `fetch`).
