// Who is signed in and what their role lets them do.
// Roles are a convenience inside the app; the real gate is who the Drive folder is shared with.
import { store } from "./store.js";

export const ROLES = {
  admin:   { label: "Admin",   write: true,  delete: true,  finance: true,  reports: true,  admin: true },
  manager: { label: "Manager", write: true,  delete: true,  finance: true,  reports: true,  admin: false },
  staff:   { label: "Staff",   write: true,  delete: false, finance: false, reports: false, admin: false },
  viewer:  { label: "Viewer",  write: false, delete: false, finance: true,  reports: true,  admin: false },
};

export const session = { user: null, mode: "off" };

export function userKey(email) {
  return String(email || "").toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}

export function currentRole() {
  if (session.mode === "demo") return "admin";
  const me = store.get("users", userKey(session.user && session.user.email));
  return (me && ROLES[me.role] && me.role) || "staff";
}

export function can(perm) {
  return !!ROLES[currentRole()][perm];
}

// Registers the signed-in person in the shared team list. The very first person becomes Admin.
export function registerUser() {
  const u = session.user;
  if (!u || !u.email) return;
  const id = userKey(u.email);
  const all = store.all("users");
  const me = store.get("users", id);
  const day = new Date().toISOString().slice(0, 10);
  if (!me) {
    const hasAdmin = all.some((x) => x.role === "admin");
    store.put("users", { id, email: u.email, name: u.name || u.email, picture: u.picture || "", role: hasAdmin ? "staff" : "admin", lastSeen: day });
  } else if (me.lastSeen !== day || (u.picture && me.picture !== u.picture)) {
    store.put("users", { id, lastSeen: day, name: me.name || u.name, picture: u.picture || me.picture || "" });
  }
}
