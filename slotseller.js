"use strict";

/* Central store. Phase 2 fills these arrays from Firestore listeners;
   everything below renders from them, so nothing needs rewriting. */
const store = {
  groups: [], // {id, name, capacity, active, assignedCount}
  teams: []   // {id, name, groupId|null, joinStatus: 'not_joined'|'link_opened'|'joined'}
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function computeStats(s) {
  const countOf = (g) => s.teams.filter((t) => t.groupId === g.id).length;
  const open = s.groups.filter((g) => g.active && countOf(g) < g.capacity);
  return {
    teams: s.teams.length,
    groups: s.groups.length,
    assigned: s.teams.filter((t) => t.groupId).length,
    waiting: s.teams.filter((t) => !t.groupId).length,
    joined: s.teams.filter((t) => t.joinStatus === "joined").length,
    available: open.length,
    full: s.groups.filter((g) => countOf(g) >= g.capacity).length,
    countOf
  };
}

function renderDashboard() {
  const st = computeStats(store);
  const tile = (n, label, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
  $("stats").innerHTML =
    tile(st.teams, "Registered teams", "hero") +
    tile(st.groups, "WhatsApp groups") +
    tile(st.assigned, "Assigned teams") +
    tile(st.waiting, "Waiting for a group", st.waiting ? "alert" : "") +
    tile(st.joined, "Joined (verified)") +
    tile(st.available, "Groups with space") +
    tile(st.full, "Full groups");

  if (!store.groups.length) {
    $("groupSummary").innerHTML =
      `<div class="empty"><p>No groups yet. Add your first WhatsApp group to start accepting teams.</p>
       <button class="btn" data-go="groups">Add a group</button></div>`;
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

renderDashboard();
