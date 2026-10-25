// Google sign-in button (Google Identity Services token client).
// It only asks for the person's name and email; the token is handed to Firebase Auth.
const cfg = window.OVAL_CONFIG || {};
const SCOPE = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

let tokenClient = null;
let pending = null;

function gisReady(timeoutMs = 12000) {
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
      if (resp.error) return p.reject(new Error(resp.error_description || resp.error));
      p.resolve(resp.access_token);
    },
    error_callback: (err) => {
      const p = pending; pending = null;
      if (p) p.reject(new Error(err && err.type === "popup_closed" ? "Sign-in window was closed." : (err && err.message) || "Sign-in failed."));
    },
  });
}

// Must be called from a click handler (opens Google's popup). Resolves with an access token.
export async function googleToken(hint = "") {
  await gisReady();
  ensureClient();
  if (pending) pending.reject(new Error("Superseded"));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    const opts = { prompt: hint ? "" : "select_account" };
    if (hint) opts.hint = hint;
    try { tokenClient.requestAccessToken(opts); }
    catch (e) { pending = null; reject(e); }
  });
}
