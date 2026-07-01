# Upload Video Demo — ByteArk Stream + CMS-Two

A standalone demo of the two-step video flow:

1. **ByteArk Stream** — upload the video file (VOD) via `@byteark/video-upload-sdk`, get a `videoKey`.
2. **CMS-Two** — save the metadata + that `videoKey` reference via `POST /api/v1/videos`.

## Files
- `index.html` — markup only (the form + preview + log).
- `styles.css` — all styling (CMS-Two design tokens).
- `api.js` — network layer: the ByteArk SDK upload + every CMS-Two REST call. No DOM.
- `app.js` — UI wiring: reads the form, calls `api.js`, updates preview/status/log/history.
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
1. Fill the **ByteArk Stream** form credentials (Form ID/Secret, Project Key).
2. **CMS-Two** → pick the target:
   - *Local dev* (`http://localhost:3000`) — auto-authenticates, no secret needed.
   - *Staging (via local proxy)* — set the **API secret** to the env `API_SERVER_SECRET`.
3. Fill Program / Title / Description, choose the video file, click **Upload**.

Requires Node 24+ (uses global `fetch`).
