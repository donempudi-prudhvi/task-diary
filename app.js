// ---- Config ----
const PASSCODE = "812137";
const REPO_OWNER = "donempudi-prudhvi";
const REPO_NAME = "task-diary";
const FILE_PATH = "tasks.json";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

let GITHUB_TOKEN = localStorage.getItem("td-token") || "";

// ---- Gate ----
const gate = document.getElementById("gate");
const gateForm = document.getElementById("gate-form");
const gateInput = document.getElementById("gate-input");
const gateError = document.getElementById("gate-error");
const app = document.getElementById("app");

gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (gateInput.value === PASSCODE) {
    sessionStorage.setItem("td-unlocked", "1");
    unlock();
  } else {
    gateError.textContent = "Incorrect passcode.";
    gateInput.value = "";
  }
});

function unlock() {
  gate.hidden = true;
  app.hidden = false;
  ensureToken();
  loadTasks();
}

function ensureToken() {
  while (!GITHUB_TOKEN) {
    const entered = prompt(
      "Enter your GitHub personal access token (scoped to this repo, Contents: Read/Write).\n" +
        "It will be saved only in this browser's local storage, never uploaded."
    );
    if (entered === null) continue;
    const trimmed = entered.trim();
    if (trimmed) {
      GITHUB_TOKEN = trimmed;
      localStorage.setItem("td-token", GITHUB_TOKEN);
    }
  }
}

if (sessionStorage.getItem("td-unlocked") === "1") {
  unlock();
}

// ---- App state ----
const addForm = document.getElementById("add-form");
const addInput = document.getElementById("add-input");
const addButton = addForm.querySelector("button");
const statusEl = document.getElementById("status");
const pendingList = document.getElementById("pending-list");
const completedList = document.getElementById("completed-list");

let tasks = [];
let fileSha = null;
let busy = false;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function setBusy(b) {
  busy = b;
  addButton.disabled = b;
  addInput.disabled = b;
}

async function githubRequest(method, body) {
  const res = await fetch(API_BASE, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem("td-token");
    GITHUB_TOKEN = "";
    ensureToken();
    return githubRequest(method, body);
  }
  return res;
}

async function loadTasks() {
  setBusy(true);
  setStatus("Loading tasks...");
  try {
    const res = await githubRequest("GET");
    if (res.status === 404) {
      tasks = [];
      fileSha = null;
      setStatus("No tasks yet. Add your first one!");
    } else if (res.ok) {
      const data = await res.json();
      fileSha = data.sha;
      const decoded = decodeURIComponent(
        atob(data.content.replace(/\n/g, ""))
          .split("")
          .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("")
      );
      tasks = JSON.parse(decoded || "[]");
      setStatus("");
    } else {
      const err = await res.json().catch(() => ({}));
      setStatus(`Failed to load tasks (${res.status}): ${err.message || "unknown error"}`, true);
    }
  } catch (e) {
    setStatus(`Failed to load tasks: ${e.message}`, true);
  }
  render();
  setBusy(false);
}

async function saveTasks() {
  setBusy(true);
  setStatus("Saving...");
  try {
    const json = JSON.stringify(tasks, null, 2);
    const encoded = btoa(
      encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      )
    );
    const body = {
      message: `Update tasks - ${new Date().toISOString()}`,
      content: encoded,
    };
    if (fileSha) body.sha = fileSha;

    const res = await githubRequest("PUT", body);
    if (res.ok) {
      const data = await res.json();
      fileSha = data.content.sha;
      setStatus("");
    } else {
      const err = await res.json().catch(() => ({}));
      setStatus(`Failed to save (${res.status}): ${err.message || "unknown error"}`, true);
    }
  } catch (e) {
    setStatus(`Failed to save: ${e.message}`, true);
  }
  setBusy(false);
}

function render() {
  pendingList.innerHTML = "";
  completedList.innerHTML = "";

  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  if (pending.length === 0) {
    pendingList.innerHTML = '<li class="empty-hint">No pending tasks.</li>';
  } else {
    pending.forEach((task) => pendingList.appendChild(renderItem(task)));
  }

  if (completed.length === 0) {
    completedList.innerHTML = '<li class="empty-hint">No completed tasks.</li>';
  } else {
    completed.forEach((task) => completedList.appendChild(renderItem(task)));
  }
}

function renderItem(task) {
  const li = document.createElement("li");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.disabled = busy;
  checkbox.addEventListener("change", () => toggleTask(task.id));

  const span = document.createElement("span");
  span.textContent = task.text;

  li.appendChild(checkbox);
  li.appendChild(span);
  return li;
}

async function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  render();
  await saveTasks();
  render();
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = addInput.value.trim();
  if (!text) return;
  tasks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    text,
    completed: false,
  });
  addInput.value = "";
  render();
  await saveTasks();
  render();
});
