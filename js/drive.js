// Google sign-in (Google Identity Services token client) and Google Drive REST calls.
const cfg = window.OVAL_CONFIG || {};
const SCOPE = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ALL_DRIVES = "supportsAllDrives=true";

let tokenClient = null;
let accessToken = null;
let expiresAt = 0;
let pending = null;

export class AuthError extends Error {}

export function gisReady(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Google sign-in could not load. Check your internet connection."));
      setTimeout(check, 150);
    })();
  });
}

function ensureClient() {
  if (tokenClient) return;
  if (!cfg.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is missing in config.js");
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: cfg.GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      const p = pending; pending = null;
      if (!p) return;
      if (resp.error) return p.reject(new AuthError(resp.error_description || resp.error));
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, "https://www.googleapis.com/auth/drive")) {
        return p.reject(new AuthError("Please allow access to Google Drive so the app can read and save the shared Oval Farms data."));
      }
      accessToken = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      p.resolve(accessToken);
    },
    error_callback: (err) => {
      const p = pending; pending = null;
      if (p) p.reject(new AuthError(err && err.type === "popup_closed" ? "Sign-in window was closed." : (err && err.message) || "Sign-in failed."));
    },
  });
}

// interactive=true must be called from a click handler (opens Google's popup).
export async function requestToken({ interactive = false, hint = "" } = {}) {
  await gisReady();
  ensureClient();
  if (pending) pending.reject(new AuthError("Superseded"));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    // A quiet (non-click) request can be silently blocked by the browser; don't wait forever.
    if (!interactive) setTimeout(() => { if (pending && pending.resolve === resolve) { pending = null; reject(new AuthError("Google sign-in needs a tap. Tap Reconnect.")); } }, 10000);
    const opts = {};
    if (!interactive) opts.prompt = "";
    else opts.prompt = hint ? "" : "select_account";
    if (hint) opts.hint = hint;
    try { tokenClient.requestAccessToken(opts); }
    catch (e) { pending = null; reject(e); }
  });
}

export function hasToken() {
  return !!accessToken && Date.now() < expiresAt - 60000;
}

export function signOut() {
  if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) { /* ignore */ }
  }
  accessToken = null;
  expiresAt = 0;
}

async function api(url, opts = {}, retry = true) {
  if (!hasToken()) {
    try { await requestToken({ interactive: false, hint: localStorage.getItem("ovalerp_hint") || "" }); }
    catch (e) { throw new AuthError("Your Google session expired. Tap Reconnect."); }
  }
  const headers = { ...(opts.headers || {}), Authorization: "Bearer " + accessToken };
  const resp = await fetch(url, { ...opts, headers });
  if (resp.status === 401 && retry) {
    accessToken = null;
    return api(url, opts, false);
  }
  if (!resp.ok) {
    let msg = resp.status + " " + resp.statusText;
    try { const j = await resp.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* ignore */ }
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  return resp;
}

export async function userInfo() {
  const r = await api("https://www.googleapis.com/oauth2/v3/userinfo");
  return r.json();
}

export async function getFile(id, fields = "id,name,mimeType,version,modifiedTime,webViewLink,capabilities(canEdit,canAddChildren),lastModifyingUser(displayName,emailAddress)") {
  const r = await api(`${API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}&${ALL_DRIVES}`);
  return r.json();
}

export async function findFileInFolder(folderId, name) {
  const q = `'${folderId}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  const url = `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,version,modifiedTime)&orderBy=createdTime&${ALL_DRIVES}&includeItemsFromAllDrives=true&corpora=allDrives`;
  const r = await api(url);
  const j = await r.json();
  return (j.files || [])[0] || null;
}

export async function createFolder(name) {
  const r = await api(`${API}/files?fields=id,name,webViewLink&${ALL_DRIVES}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  return r.json();
}

export async function download(fileId) {
  const r = await api(`${API}/files/${encodeURIComponent(fileId)}?alt=media&${ALL_DRIVES}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// Creates the file when fileId is empty, otherwise overwrites its content.
export async function upload({ fileId, folderId, name, data }) {
  const boundary = "ovalerp" + Math.random().toString(36).slice(2);
  const meta = fileId ? {} : { name, parents: [folderId], mimeType: "application/json" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
  const url = fileId
    ? `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,version,modifiedTime&${ALL_DRIVES}`
    : `${UPLOAD}/files?uploadType=multipart&fields=id,version,modifiedTime&${ALL_DRIVES}`;
  const r = await api(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { "Content-Type": "multipart/related; boundary=" + boundary },
    body,
  });
  return r.json();
}

// Accepts a folder URL (https://drive.google.com/drive/folders/<id>?...) or a bare id.
export function parseFolderId(input) {
  const s = String(input || "").trim();
  const m = s.match(/folders\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]folder=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : "";
}
