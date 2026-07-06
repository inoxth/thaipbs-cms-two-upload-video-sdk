# Thai PBS Video CMS Upload Demo

An integration demo for uploading videos into Thai PBS Video CMS. The whole flow is wrapped in **one SDK
class** — copy `sdk.js` into your project, construct it once, queue files, then `start()`:

```js
import { CmsTwoSdk } from './sdk.js';

const uploadManager = new CmsTwoSdk({
  byteark: { formId, formSecret, projectKey },
  cms: {
    baseUrl:  '<cms base url>',
    accessId: '<accessId>',   // public — identifies your key
    secret:   '<secret>',     // signs appTokens locally; never sent over the wire
  },                          // no teamId — derived from your key

  // Callback functions (all optional)
  onUploadProgress: (job, progress) => console.log(job.name, progress.percent + '%'),
  onUploadCompleted: (job) => console.log('created in Thai PBS Video CMS:', job.video.id),
  onUploadFailed: (job, error) => console.error(job.name, error),
  onVideosCreated: (videoIds) => console.log('all done:', videoIds),
});

uploadManager.addUploadJobs(fileList);     // FileList, or [{ file, title, description, programId }]
const [job] = await uploadManager.start(); // resolves when the queue is drained

// later — poll until a video is playable:
const video = await uploadManager.getVideoById(job.video.id);
const { mediaVideoStatus, embeddedUrl } = video.mediaVideo;
// mediaVideoStatus: 'pending' → 'processing' → 'completed'
```

Single-file shortcut — `upload()` returns an awaitable job handle:

```js
const myVideo = uploadManager.upload(file, { title: 'My video' });
myVideo.onProgress((pct) => console.log(pct + '%'));
const { video } = await myVideo;           // Thai PBS Video CMS video record created
const ready = await myVideo.whenReady();   // playable (ready.mediaVideo.embeddedUrl)
```

What each queued job does:
1. Uploads the file to the media service.
2. Registers a **media-video** in the Thai PBS Video CMS library (`POST /api/v1/media/files`) — the record
   the processing webhook updates.
3. Creates the **video** record with the metadata (`POST /api/v1/videos`), linked to the media.

`start()` resolves as soon as every job's records exist; processing continues on the media
service. Poll `uploadManager.getVideoById(job.video.id)` (or `myVideo.whenReady()`) until
`video.mediaVideo.mediaVideoStatus` is `completed`.

## Files
- `sdk.js` — **the file you copy**: the `CmsTwoSdk` class + every Thai PBS Video CMS call. No DOM, no dependencies.
- `index.html` — the demo page markup (form + preview + log + integration tutorial).
- `app.js` — demo UI wiring: reads the form, calls `sdk.js`, updates preview/status/log/history.
- `styles.css` — styling (Thai PBS Video CMS design tokens).
- `i18n.js` — EN/TH text for the page.
- `proxy.mjs` — a tiny Node server that serves these static files, and can *optionally* proxy `/api/*`
  to a CMS environment. **Auth is no longer proxied** — the SDK signs its own short-lived tokens and
  exchanges them, so nothing sensitive passes through it. The proxy is now only useful to let a
  localhost page call a remote CMS without adding your origin to its CORS allow-list (see below).

## Auth model

The SDK is given an **`accessId` + `secret`** (an *upload key* the Thai PBS team issues). It signs a
short-lived `appToken` with the `secret` **locally in the browser**, exchanges it at
`POST /api/v1/upload-tokens` for a 5-minute `accessToken`, and sends that in the
**`x-upload-token`** header on the two write calls (a custom header, not `Authorization`, so the
API gateway doesn't intercept it). **Only tokens ever cross the network** — never the raw `secret`.
No `teamId` is configured; it comes back from the exchange.

## Run

```bash
node proxy.mjs        # serves the static files (and optional /api proxy)
```

Then open http://localhost:8899/ (or serve the files any other way).

## CORS

Because the SDK calls the CMS **directly** from the browser, your page's origin must be in that CMS's
`APP_CORS_ALLOWED_ORIGINS`. For local dev against a remote (staging) CMS you can instead run
`proxy.mjs` and point `baseUrl` at the proxy, which forwards server-to-server (no CORS).

## Using the page
1. Fill the **Upload credentials** (Form ID/Secret, Project Key).
2. **Thai PBS Video CMS** → set the **Base URL** (Local dev `http://localhost:3000`, or Staging) and paste
   your **Access ID** + **Secret** (your upload key).
3. Fill Program / Title / Description, choose the video file, click **Upload**.

Requires Node 24+ (uses global `fetch`).
