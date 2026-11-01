import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = getApp(), auth = getAuth(app), db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const st = { groups: [], teams: [], links: {}, open: new Set() };
let unsubs = [];

const css = document.createElement("style");
css.textContent = `
.gact{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.gact .btn{padding:8px 12px;min-height:40px;font-size:13px}
.btn.bad{background:rgba(255,77,106,.15);color:var(--bad);border:1px solid rgba(255,77,106,.4)}
.link{word-break:break-all;font-size:12px;color:var(--blue);margin-top:8px}
.tl{margin-top:10px;border-top:1px solid var(--line);padding-top:8px;font-size:13px}
.tl div{display:flex;justify-content:space-between;padding:4px 0}
.sheet{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.7);display:none;align-items:flex-end}
.sheet.on{display:flex}
.sheet form{width:100%;max-width:640px;margin:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px 18px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom,0px) + 18px)}
.sheet label{display:block;font-size:13px;color:var(--muted);margin-top:10px}
.sheet input[type=text],.sheet input[type=number],.sheet input[type=url]{width:100%;font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:4px;min-height:46px}
.sheet .chk{display:flex;align-items:center;gap:10px;margin-top:14px;color:var(--text)}
.sheet .chk input{width:20px;height:20px}
.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#1b1240;border:1px solid #3a2d7a;padding:10px 16px;border-radius:12px;z-index:40;font-size:14px}
`;
document.head.appendChild(css);

const sheet = document.createElement("div");
sheet.className = "sheet";
sheet.innerHTML = `<form id="gf"><h2 id="gt">Add group</h2>
<label>Group name<input id="gn" type="text" maxlength="60" placeholder="Group A" required></label>
<label>WhatsApp invite link<input id="gl" type="url" placeholder="https://chat.whatsapp.com/..." required></label>
<label>Maximum teams<input id="gc" type="number" min="1" max="1000" inputmode="numeric" placeholder="50" required></label>
<label class="chk"><input id="ga" type="checkbox" checked> Active (accepts new teams)</label>
<div class="err" id="ge"></div>
<div class="gact"><button class="btn" id="gs" type="submit">Save group</button><button class="btn ghost" id="gx" type="button">Cancel</button></div></form>`;
document.body.appendChild(sheet);
let editing = null;

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function openForm(g) {
  editing = g || null;
  $("gt").textContent = g ? "Edit group" : "Add group";
  $("gn").value = g ? g.name : "";
  $("gl").value = g ? st.links[g.id] || "" : "";
  $("gc").value = g ? g.capacity : "";
  $("ga").checked = g ? !!g.active : true;
  $("ge").textContent = "";
  sheet.classList.add("on");
}
const closeForm = () => sheet.classList.remove("on");
$("gx").onclick = closeForm;
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeForm(); });

$("gf").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("gn").value.trim(), link = $("gl").value.trim(), cap = parseInt($("gc").value, 10), active = $("ga").checked;
  const err = (m) => { $("ge").textContent = m; };
  if (!name) return err("Enter a group name.");
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+/.test(link)) return err("Use a link like https://chat.whatsapp.com/XXXX");
  if (!(cap >= 1 && cap <= 1000)) return err("Capacity must be between 1 and 1000.");
  if (st.groups.some((g) => g.name.toLowerCase() === name.toLowerCase() && (!editing || g.id !== editing.id))) return err("A group with this name already exists.");
  if (editing) {
    const used = st.teams.filter((t) => t.groupId === editing.id).length;
    if (cap < used) return err(`${used} teams are already in this group. Capacity can't be lower.`);
  }
  $("gs").disabled = true;
  try {
    if (editing) {
      await updateDoc(doc(db, "groups", editing.id), { name, capacity: cap, active });
      await setDoc(doc(db, "groupSecrets", editing.id), { inviteLink: link });
    } else {
      const ref = await addDoc(collection(db, "groups"), { name, capacity: cap, active, assignedCount: 0, order: Date.now(), createdAt: serverTimestamp() });
      await setDoc(doc(db, "groupSecrets", ref.id), { inviteLink: link });
    }
    closeForm(); toast("Group saved");
  } catch (x) { err("Could not save. Check your internet and admin access."); }
  $("gs").disabled = false;
});

const JOIN = { not_joined: "Not joined", link_opened: "Link opened", joined: "Joined" };
function render() {
  const v = $("v-groups");
  const head = `<div class="sec"><h2>WhatsApp groups</h2><button class="btn" data-a="add">Add group</button></div>`;
  if (!st.groups.length) {
    v.innerHTML = head + `<div class="empty"><p>No groups yet. Add a group with its WhatsApp invite link and a team limit.</p></div>`;
    return;
  }
  v.innerHTML = head + [...st.groups].sort((a, b) => (a.order || 0) - (b.order || 0)).map((g) => {
    const mine = st.teams.filter((t) => t.groupId === g.id), n = mine.length;
    const pct = Math.min(100, Math.round((n / g.capacity) * 100)), full = n >= g.capacity;
    const c = (k) => mine.filter((t) => (t.joinStatus || "not_joined") === k).length;
    const tag = !g.active ? `<span class="pill off">Inactive</span>` : full ? `<span class="pill off">Full</span>` : `<span class="pill ok">Open</span>`;
    const open = st.open.has(g.id);
    const list = open ? `<div class="tl">${mine.length ? mine.map((t) => `<div><span>${esc(t.name)}</span><span class="sub">${JOIN[t.joinStatus || "not_joined"]}</span></div>`).join("") : `<span class="sub">No teams assigned yet.</span>`}</div>` : "";
    return `<div class="card"><div class="row"><h3>${esc(g.name)}</h3>${tag}</div>
      <div class="bar"><i class="${full ? "full" : ""}" style="width:${pct}%"></i></div>
      <div class="row sub"><span>${n}/${g.capacity} teams</span><span>${Math.max(0, g.capacity - n)} spaces left</span></div>
      <div class="sub" style="margin-top:6px">Not joined ${c("not_joined")} · Link opened ${c("link_opened")} · Joined ${c("joined")}</div>
      <div class="link">${esc(st.links[g.id] || "No link saved")}</div>
      <div class="gact">
        <button class="btn ghost" data-a="teams" data-id="${g.id}">${open ? "Hide teams" : "View teams"}</button>
        <button class="btn ghost" data-a="copy" data-id="${g.id}">Copy link</button>
        <button class="btn ghost" data-a="toggle" data-id="${g.id}">${g.active ? "Deactivate" : "Activate"}</button>
        <button class="btn ghost" data-a="edit" data-id="${g.id}">Edit</button>
        <button class="btn bad" data-a="del" data-id="${g.id}">Delete</button>
      </div>${list}</div>`;
  }).join("");
}

$("v-groups").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const g = st.groups.find((x) => x.id === b.dataset.id), a = b.dataset.a;
  try {
    if (a === "add") openForm();
    else if (a === "edit") openForm(g);
    else if (a === "teams") { st.open.has(g.id) ? st.open.delete(g.id) : st.open.add(g.id); render(); }
    else if (a === "copy") { await navigator.clipboard.writeText(st.links[g.id] || ""); toast("Link copied"); }
    else if (a === "toggle") { await updateDoc(doc(db, "groups", g.id), { active: !g.active }); toast(g.active ? "Group deactivated" : "Group activated"); }
    else if (a === "del") {
      const mine = st.teams.filter((t) => t.groupId === g.id);
      const msg = mine.length ? `Delete "${g.name}"? Its ${mine.length} teams will move to the waiting list so you can reassign them.` : `Delete "${g.name}"?`;
      if (!confirm(msg)) return;
      const batch = writeBatch(db);
      mine.forEach((t) => batch.update(doc(db, "teams", t.id), { groupId: null, joinStatus: "not_joined" }));
      batch.delete(doc(db, "groups", g.id));
      batch.delete(doc(db, "groupSecrets", g.id));
      await batch.commit(); toast("Group deleted");
    }
  } catch (x) { toast("Action failed. Try again."); }
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-go='groups']")) setTimeout(() => $("v-groups").querySelector("[data-a='add']")?.click(), 50);
});

function watch(name, fn) {
  return onSnapshot(collection(db, name), (s) => { fn(s); render(); }, () => {});
}
onAuthStateChanged(auth, (user) => {
  unsubs.forEach((u) => u()); unsubs = [];
  st.groups = []; st.teams = []; st.links = {};
  if (user) unsubs = [
    watch("groups", (s) => { st.groups = s.docs.map((d) => ({ id: d.id, ...d.data() })); }),
    watch("teams", (s) => { st.teams = s.docs.map((d) => ({ id: d.id, ...d.data() })); }),
    watch("groupSecrets", (s) => { st.links = {}; s.docs.forEach((d) => { st.links[d.id] = d.data().inviteLink; }); })
  ];
  render();
});
