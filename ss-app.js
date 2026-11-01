import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdoYNcsbx6ya4UrsqZq4hCzhpxPtgAdtk",
  authDomain: "slot-seller.firebaseapp.com",
  projectId: "slot-seller",
  storageBucket: "slot-seller.firebasestorage.app",
  messagingSenderId: "449335258521",
  appId: "1:449335258521:web:8b9229f8a0b1e6e7443708"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { groups: [], teams: [] };
let unsubs = [];

/* ---------- login screen (added by this file) ---------- */
const css = document.createElement("style");
css.textContent = `
.login{position:fixed;inset:0;z-index:20;background:#000;display:flex;align-items:center;justify-content:center;padding:20px}
.login.hide{display:none}
.login form{width:100%;max-width:380px}
.login h1{font-size:26px;margin-bottom:4px;background:linear-gradient(90deg,var(--purple),var(--blue));-webkit-background-clip:text;background-clip:text;color:transparent}
.login input{width:100%;font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:13px;margin:8px 0;min-height:46px}
.login .btn{width:100%;margin-top:6px}
.err{color:var(--bad);font-size:13px;min-height:18px;margin-top:6px}
.out{background:none;border:1px solid var(--line);color:var(--muted);font:inherit;font-size:12px;border-radius:99px;padding:5px 12px;cursor:pointer}
`;
document.head.appendChild(css);

const login = document.createElement("div");
login.className = "login";
login.innerHTML = `<form id="lf" autocomplete="on">
  <h1>FF Slot Seller</h1><p class="sub">Admin login</p>
  <input id="em" type="email" placeholder="Email" autocomplete="username" required>
  <input id="pw" type="password" placeholder="Password" autocomplete="current-password" required>
  <button class="btn" id="lb" type="submit">Log in</button>
  <div class="err" id="le"></div></form>`;
document.body.appendChild(login);

const outBtn = document.createElement("button");
outBtn.className = "out"; outBtn.textContent = "Log out"; outBtn.hidden = true;
document.querySelector(".top").appendChild(outBtn);
outBtn.onclick = () => signOut(auth);

$("lf").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("le").textContent = ""; $("lb").disabled = true;
  try { await signInWithEmailAndPassword(auth, $("em").value.trim(), $("pw").value); }
  catch (err) {
    const bad = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
    $("le").textContent = bad.includes(err.code) ? "Wrong email or password." : err.code === "auth/too-many-requests" ? "Too many attempts. Try again in a few minutes." : "Login failed. Check your internet and try again.";
  }
  $("lb").disabled = false;
});

/* ---------- live data ---------- */
function watch(name, key) {
  return onSnapshot(collection(db, name),
    (snap) => { store[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderDashboard(); },
    (err) => { $("eventName").textContent = err.code === "permission-denied" ? "No admin access" : "Database error"; });
}

onAuthStateChanged(auth, (user) => {
  unsubs.forEach((u) => u()); unsubs = [];
  store.groups = []; store.teams = [];
  login.classList.toggle("hide", !!user);
  outBtn.hidden = !user;
  if (user) {
    $("eventName").textContent = "Admin";
    unsubs = [watch("groups", "groups"), watch("teams", "teams")];
  }
  renderDashboard();
});

/* ---------- dashboard ---------- */
function computeStats(s) {
  const countOf = (g) => s.teams.filter((t) => t.groupId === g.id).length;
  return {
    teams: s.teams.length, groups: s.groups.length,
    assigned: s.teams.filter((t) => t.groupId).length,
    waiting: s.teams.filter((t) => !t.groupId).length,
    joined: s.teams.filter((t) => t.joinStatus === "joined").length,
    available: s.groups.filter((g) => g.active && countOf(g) < g.capacity).length,
    full: s.groups.filter((g) => countOf(g) >= g.capacity).length,
    countOf
  };
}

function renderDashboard() {
  const st = computeStats(store);
  const tile = (n, label, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
  $("stats").innerHTML =
    tile(st.teams, "Registered teams", "hero") + tile(st.groups, "WhatsApp groups") + tile(st.assigned, "Assigned teams") +
    tile(st.waiting, "Waiting for a group", st.waiting ? "alert" : "") + tile(st.joined, "Joined (verified)") +
    tile(st.available, "Groups with space") + tile(st.full, "Full groups");
  if (!store.groups.length) {
    $("groupSummary").innerHTML = `<div class="empty"><p>No groups yet. Add your first WhatsApp group to start accepting teams.</p><button class="btn" data-go="groups">Add a group</button></div>`;
    return;
  }
  $("groupSummary").innerHTML = store.groups.map((g) => {
    const n = st.countOf(g), pct = Math.min(100, Math.round((n / g.capacity) * 100)), full = n >= g.capacity;
    const tag = !g.active ? `<span class="pill off">Inactive</span>` : full ? `<span class="pill off">Full</span>` : `<span class="pill ok">Open</span>`;
    return `<div class="card"><div class="row"><h3>${esc(g.name)}</h3>${tag}</div>
      <div class="bar"><i class="${full ? "full" : ""}" style="width:${pct}%"></i></div>
      <div class="row sub"><span>${n}/${g.capacity} teams</span><span>${Math.max(0, g.capacity - n)} spaces left</span></div></div>`;
  }).join("");
}

function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("on", v.id === "v-" + view));
  document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const tab = e.target.closest("#tabbar button");
  if (tab) return show(tab.dataset.v);
  const go = e.target.closest("[data-go]");
  if (go) show(go.dataset.go);
});
