// Who is signed in and what their role lets them do.
// The team list is the Firestore "staff" collection (Settings > Team). The Firestore rules
// enforce the same roles, so the menus here only hide what someone couldn't do anyway.
import { store } from "./store.js";

export const ROLES = {
  admin:   { label: "Admin",   write: true,  delete: true,  finance: true,  reports: true,  admin: true },
  manager: { label: "Manager", write: true,  delete: true,  finance: true,  reports: true,  admin: false },
  staff:   { label: "Staff",   write: true,  delete: false, finance: false, reports: false, admin: false },
  viewer:  { label: "Viewer",  write: false, delete: false, finance: true,  reports: true,  admin: false },
};

// mode: off | firebase | demo
export const session = { user: null, mode: "off", role: "" };

export function userKey(email) {
  return String(email || "").trim().toLowerCase();
}

export function currentRole() {
  if (session.mode === "demo") return "admin";
  const me = store.get("staff", userKey(session.user && session.user.email));
  const role = (me && me.role) || session.role;
  return ROLES[role] ? role : "viewer";
}

export function can(perm) {
  return !!ROLES[currentRole()][perm];
}

// Keeps the person's own name, photo and last-seen day current on their team record.
export function touchStaff() {
  const u = session.user;
  if (!u || !u.email || session.mode !== "firebase") return;
  const id = userKey(u.email);
  const me = store.get("staff", id);
  if (!me) return;
  const day = new Date().toISOString().slice(0, 10);
  if (me.lastSeen !== day || (u.picture && me.picture !== u.picture) || (!me.name && u.name)) {
    store.put("staff", { id, lastSeen: day, name: me.name || u.name || "", picture: u.picture || me.picture || "" });
  }
}
