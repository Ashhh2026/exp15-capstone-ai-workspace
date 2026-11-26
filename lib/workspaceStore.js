const mongoose = require("mongoose");
const Deliverable = require("../models/Deliverable");
const { getDbMode } = require("./db");

const VALID_MODULES = ["Frontend UI", "REST API", "Database", "AI Integration", "Security & QA"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const VALID_STATUSES = ["backlog", "in-progress", "completed"];

let memSeq = 101;
const memoryItems = [];

function isMongooseReady() {
  return getDbMode() !== "in-memory-fallback" && mongoose.connection.readyState === 1;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateDeliverable(body, isPartial = false) {
  const details = {};
  const data = {};

  if (!isPartial || Object.prototype.hasOwnProperty.call(body, "title")) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      details.title = "Deliverable title is required.";
    } else if (body.title.trim().length > 140) {
      details.title = "Title must be at most 140 characters.";
    } else {
      data.title = body.title.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "module")) {
    if (!VALID_MODULES.includes(body.module)) {
      details.module = `Module must be one of: ${VALID_MODULES.join(", ")}.`;
    } else {
      data.module = body.module;
    }
  } else if (!isPartial) {
    data.module = "REST API";
  }

  if (Object.prototype.hasOwnProperty.call(body, "priority")) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      details.priority = "Priority must be low, medium, or high.";
    } else {
      data.priority = body.priority;
    }
  } else if (!isPartial) {
    data.priority = "medium";
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (!VALID_STATUSES.includes(body.status)) {
      details.status = "Status must be backlog, in-progress, or completed.";
    } else {
      data.status = body.status;
    }
  } else if (!isPartial) {
    data.status = "backlog";
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    if (typeof body.notes !== "string") {
      details.notes = "Notes must be a string.";
    } else {
      data.notes = body.notes.trim().slice(0, 1000);
    }
  } else if (!isPartial) {
    data.notes = "";
  }

  return { details, data };
}

async function listDeliverables(query = {}) {
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const status = typeof query.status === "string" ? query.status.trim() : "";
  const mod = typeof query.module === "string" ? query.module.trim() : "";

  if (isMongooseReady()) {
    const filter = {};
    if (status && VALID_STATUSES.includes(status)) filter.status = status;
    if (mod && VALID_MODULES.includes(mod)) filter.module = mod;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ title: rx }, { code: rx }, { notes: rx }];
    }
    return Deliverable.find(filter).sort({ createdAt: -1 }).lean();
  }

  let items = memoryItems.slice();
  if (status && VALID_STATUSES.includes(status)) {
    items = items.filter((d) => d.status === status);
  }
  if (mod && VALID_MODULES.includes(mod)) {
    items = items.filter((d) => d.module === mod);
  }
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    items = items.filter((d) => rx.test(d.title) || rx.test(d.code) || rx.test(d.notes));
  }
  return items;
}

async function createDeliverable(payload) {
  const { details, data } = validateDeliverable(payload, false);
  if (Object.keys(details).length > 0) {
    const err = new Error("Validation Error");
    err.statusCode = 400;
    err.details = details;
    throw err;
  }

  const code = `CAP-${memSeq++}`;
  if (isMongooseReady()) {
    const created = await Deliverable.create({ code, ...data });
    return created.toObject();
  }

  const now = new Date().toISOString();
  const doc = {
    _id: `del_${code.toLowerCase()}`,
    code,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  memoryItems.unshift(doc);
  return doc;
}

async function updateDeliverable(id, payload) {
  const { details, data } = validateDeliverable(payload, true);
  if (Object.keys(details).length > 0) {
    const err = new Error("Validation Error");
    err.statusCode = 400;
    err.details = details;
    throw err;
  }

  if (isMongooseReady()) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Deliverable.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
  }

  const idx = memoryItems.findIndex((d) => d._id === id);
  if (idx === -1) return null;
  memoryItems[idx] = {
    ...memoryItems[idx],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  return memoryItems[idx];
}

async function deleteDeliverable(id) {
  if (isMongooseReady()) {
    if (!mongoose.Types.ObjectId.isValid(id)) return false;
    const removed = await Deliverable.findByIdAndDelete(id);
    return Boolean(removed);
  }
  const idx = memoryItems.findIndex((d) => d._id === id);
  if (idx === -1) return false;
  memoryItems.splice(idx, 1);
  return true;
}

async function generateExecutiveBrief(focus = "overview") {
  const all = await listDeliverables({});
  const total = all.length;
  const completed = all.filter((d) => d.status === "completed");
  const inProgress = all.filter((d) => d.status === "in-progress");
  const backlog = all.filter((d) => d.status === "backlog");
  const urgentOpen = all.filter((d) => d.status !== "completed" && d.priority === "high");
  const completionPct = total ? Math.round((completed.length / total) * 100) : 0;

  const summaryPayload = {
    total,
    completed: completed.length,
    inProgress: inProgress.length,
    backlog: backlog.length,
    completionPct,
    urgentTitles: urgentOpen.map((u) => `${u.code}: ${u.title}`),
  };

  const openAiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
  if (openAiKey) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are an engineering delivery lead summarizing sprint telemetry for Ashwarya Agrawal (23BCON1659). Be concise, crisp, and actionable.",
          },
          {
            role: "user",
            content: `Generate an executive sprint brief (focus: ${focus}) from this JSON telemetry: ${JSON.stringify(summaryPayload)}`,
          },
        ],
      }),
    });
    const json = await resp.json();
    const liveText = json.choices?.[0]?.message?.content?.trim();
    if (resp.ok && liveText) {
      return {
        engine: "OpenAI (gpt-4o-mini)",
        metrics: summaryPayload,
        brief: liveText,
      };
    }
  }

  const urgentLine = urgentOpen.length
    ? `Priority Risk Alert: ${urgentOpen.map((u) => `${u.code} (${u.title})`).join("; ")} require immediate closure.`
    : "Zero high-priority blockers remain open across the capstone board.";

  const nextAction =
    focus === "risks"
      ? "Audit all in-progress API endpoints with automated integration tests and verify MongoDB index coverage before release."
      : focus === "release"
      ? "Tag v1.0.0 release candidate, verify /api/health telemetry, and push final documentation to GitHub."
      : "Advance active in-progress deliverables to completed status and run final end-to-end UI verification.";

  return {
    engine: "Capstone Synthesis Engine",
    metrics: summaryPayload,
    brief: `Executive Capstone Brief — Ashwarya Agrawal (Roll No: 23BCON1659)
• Delivery Velocity: ${completed.length} of ${total} deliverables completed (${completionPct}%), with ${inProgress.length} in active execution and ${backlog.length} queued.
• ${urgentLine}
• Recommended Next Action (${focus.toUpperCase()}): ${nextAction}`,
  };
}

async function seedCapstoneData() {
  const initial = [
    {
      title: "Responsive Editorial UI & Accessibility Landmarks",
      module: "Frontend UI",
      priority: "high",
      status: "completed",
      notes: "High-contrast layout with semantic landmarks and keyboard focus states.",
    },
    {
      title: "MongoDB Schema Validation, Compound Indexes & Stats Aggregation",
      module: "Database",
      priority: "high",
      status: "completed",
      notes: "Mongoose schemas with unique constraints and .lean() read optimization.",
    },
    {
      title: "JWT Authentication & Role-Based Access Guard Middleware",
      module: "Security & QA",
      priority: "high",
      status: "completed",
      notes: "Stateless Bearer token verification and role enforcement.",
    },
    {
      title: "AI Executive Sprint Brief & Telemetry Synthesis API",
      module: "AI Integration",
      priority: "high",
      status: "in-progress",
      notes: "Synthesizes live deliverable metrics into structured status briefings.",
    },
    {
      title: "OpenAPI 3.0 Spec & Automated Integration Test Verification",
      module: "REST API",
      priority: "medium",
      status: "backlog",
      notes: "Final pre-submission check across all CRUD and AI endpoints.",
    },
  ];

  const existing = await listDeliverables({});
  if (existing.length > 0) return;
  for (const item of initial) {
    await createDeliverable(item);
  }
}

module.exports = {
  listDeliverables,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  generateExecutiveBrief,
  seedCapstoneData,
};
