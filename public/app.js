const healthBadge = document.getElementById("healthBadge");
const briefFocusSelect = document.getElementById("briefFocusSelect");
const briefOutput = document.getElementById("briefOutput");

const createForm = document.getElementById("createForm");
const errTitle = document.getElementById("errTitle");
const createStatus = document.getElementById("createStatus");

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const moduleFilter = document.getElementById("moduleFilter");
const deliverablesList = document.getElementById("deliverablesList");
const emptyMsg = document.getElementById("emptyMsg");

const STATUS_CYCLE = {
  backlog: "in-progress",
  "in-progress": "completed",
  completed: "backlog",
};

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    healthBadge.textContent = `System: online (${data.db})`;
  } catch {
    healthBadge.textContent = "System: offline";
  }
}

async function refreshBrief() {
  const res = await fetch("/api/ai/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ focus: briefFocusSelect.value }),
  });
  if (!res.ok) return;
  const data = await res.json();
  briefOutput.textContent = data.brief;

  const m = data.metrics || {};
  document.getElementById("kpiTotal").textContent = String(m.total ?? 0);
  document.getElementById("kpiDone").textContent = String(m.completed ?? 0);
  document.getElementById("kpiActive").textContent = String(m.inProgress ?? 0);
  document.getElementById("kpiPct").textContent = `${m.completionPct ?? 0}%`;
}

async function loadDeliverables() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
  if (statusFilter.value) params.set("status", statusFilter.value);
  if (moduleFilter.value) params.set("module", moduleFilter.value);

  const res = await fetch(`/api/deliverables?${params.toString()}`);
  if (!res.ok) return;
  const data = await res.json();
  const items = data.items || [];
  emptyMsg.hidden = items.length > 0;

  deliverablesList.innerHTML = items
    .map(
      (item) => `
      <article class="deliv-card ${item.status === "completed" ? "is-completed" : ""}" data-id="${item._id}">
        <div class="deliv-top">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span class="pill"><strong>${item.code}</strong></span>
            <span class="pill">${item.module}</span>
            <span class="pill">Priority: ${item.priority.toUpperCase()}</span>
          </div>
          <span class="pill pill-status-${item.status}">${item.status.toUpperCase()}</span>
        </div>
        <h3>${item.title}</h3>
        ${item.notes ? `<p>${item.notes}</p>` : ""}
        <div class="deliv-actions">
          <button type="button" class="btn btn-sm" data-next-status="${STATUS_CYCLE[item.status] || "in-progress"}">
            Move to ${(STATUS_CYCLE[item.status] || "in-progress").toUpperCase()} →
          </button>
          <button type="button" class="btn btn-sm btn-danger" data-delete>Delete</button>
        </div>
      </article>
    `
    )
    .join("");
}

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errTitle.textContent = "";
  createStatus.textContent = "";

  const payload = {
    title: document.getElementById("dTitle").value.trim(),
    module: document.getElementById("dModule").value,
    priority: document.getElementById("dPriority").value,
    notes: document.getElementById("dNotes").value.trim(),
  };

  const res = await fetch("/api/deliverables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    errTitle.textContent = data.details?.title || "Could not create deliverable.";
    return;
  }

  createStatus.textContent = `Added ${data.data.code}: "${data.data.title}" (Ashwarya Agrawal · 23BCON1659).`;
  createForm.reset();
  await Promise.all([loadDeliverables(), refreshBrief()]);
});

deliverablesList.addEventListener("click", async (e) => {
  const card = e.target.closest(".deliv-card[data-id]");
  if (!card) return;
  const id = card.dataset.id;

  const statusBtn = e.target.closest("[data-next-status]");
  if (statusBtn) {
    await fetch(`/api/deliverables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusBtn.dataset.nextStatus }),
    });
    await Promise.all([loadDeliverables(), refreshBrief()]);
    return;
  }

  if (e.target.closest("[data-delete]")) {
    await fetch(`/api/deliverables/${id}`, { method: "DELETE" });
    await Promise.all([loadDeliverables(), refreshBrief()]);
  }
});

document.getElementById("generateBriefBtn").addEventListener("click", refreshBrief);
briefFocusSelect.addEventListener("change", refreshBrief);
searchInput.addEventListener("input", loadDeliverables);
statusFilter.addEventListener("change", loadDeliverables);
moduleFilter.addEventListener("change", loadDeliverables);

checkHealth();
loadDeliverables();
refreshBrief();
