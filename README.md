const API_BASE = "";

const state = {
  user: JSON.parse(localStorage.getItem("notesUser")) || null,
  documents: [],
  summaries: [],
  generatedSummary: "",
  generatedKeywords: []
};

const elements = {
  welcomeText: document.getElementById("welcomeText"),
  logoutBtn: document.getElementById("logoutBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  uploadForm: document.getElementById("uploadForm"),
  documentInput: document.getElementById("documentInput"),
  documentSelect: document.getElementById("documentSelect"),
  uploadMessage: document.getElementById("uploadMessage"),
  generateSummaryBtn: document.getElementById("generateSummaryBtn"),
  summaryOutput: document.getElementById("summaryOutput"),
  keywordOutput: document.getElementById("keywordOutput"),
  saveSummaryBtn: document.getElementById("saveSummaryBtn"),
  downloadSummaryBtn: document.getElementById("downloadSummaryBtn"),
  savedSummaryList: document.getElementById("savedSummaryList"),
  adminDashboard: document.getElementById("adminDashboard")
};

function setWelcome() {
  if (state.user) {
    elements.welcomeText.textContent = `Welcome, ${state.user.name}`;
    elements.logoutBtn.classList.remove("hidden");
  } else {
    elements.welcomeText.textContent = "Not logged in";
    elements.logoutBtn.classList.add("hidden");
  }
}

function setMessage(element, message, type = "info") {
  element.textContent = message;
  element.style.color = type === "error" ? "#b91c1c" : type === "success" ? "#15803d" : "#334155";
}

function showTab(targetTab) {
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === targetTab);
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === targetTab);
  });
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

function saveCurrentUser(user) {
  state.user = user;
  localStorage.setItem("notesUser", JSON.stringify(user));
  setWelcome();
  if (user) {
    loadDocuments();
    loadSummaries();
    if (user.role === "admin") loadAdminDashboard();
  }
}

function logout() {
  state.user = null;
  localStorage.removeItem("notesUser");
  setWelcome();
  elements.documentSelect.innerHTML = "";
  elements.summaryOutput.textContent = "Please upload a document and sign in to generate a summary.";
  elements.keywordOutput.innerHTML = "";
  elements.savedSummaryList.innerHTML = "";
  elements.adminDashboard.innerHTML = "";
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function loginUser(payload) {
  try {
    const result = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    saveCurrentUser(result.user);
    setMessage(elements.uploadMessage, result.message, "success");
  } catch (error) {
    setMessage(elements.uploadMessage, error.message, "error");
  }
}

async function registerUser(payload) {
  try {
    const result = await apiRequest("/api/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setMessage(elements.uploadMessage, result.message + " Please login now.", "success");
    showTab("login-tab");
  } catch (error) {
    setMessage(elements.uploadMessage, error.message, "error");
  }
}

async function loadDocuments() {
  if (!state.user) return;

  try {
    const result = await apiRequest(`/api/documents/${state.user.id}`);
    state.documents = result.documents || [];
    renderDocumentOptions();
  } catch (error) {
    console.error(error);
  }
}

function renderDocumentOptions() {
  elements.documentSelect.innerHTML = "";

  if (!state.documents.length) {
    const option = document.createElement("option");
    option.textContent = "No uploaded documents yet";
    option.value = "";
    elements.documentSelect.appendChild(option);
    return;
  }

  state.documents.forEach(doc => {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.original_name;
    elements.documentSelect.appendChild(option);
  });
}

async function loadSummaries() {
  if (!state.user) return;

  try {
    const result = await apiRequest(`/api/summaries/${state.user.id}`);
    state.summaries = result.summaries || [];
    renderSavedSummaries();
  } catch (error) {
    console.error(error);
  }
}

function renderSavedSummaries() {
  elements.savedSummaryList.innerHTML = "";

  if (!state.summaries.length) {
    elements.savedSummaryList.innerHTML = "<div class='saved-item'>No saved summaries yet.</div>";
    return;
  }

  state.summaries.forEach(summary => {
    const item = document.createElement("div");
    item.className = "saved-item";
    item.innerHTML = `
      <h4>${summary.document_name || "Document"}</h4>
      <p>${summary.summary_text}</p>
      <small>Keywords: ${summary.keywords || "N/A"}</small>
    `;
    elements.savedSummaryList.appendChild(item);
  });
}

async function handleUpload(event) {
  event.preventDefault();

  if (!state.user) {
    setMessage(elements.uploadMessage, "Please log in before uploading a file.", "error");
    return;
  }

  const file = elements.documentInput.files[0];
  if (!file) {
    setMessage(elements.uploadMessage, "Please select a file.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("document", file);
  formData.append("userId", state.user.id);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed.");

    setMessage(elements.uploadMessage, "Document uploaded successfully.", "success");
    elements.documentInput.value = "";
    await loadDocuments();
    const uploadedId = data.document.id;
    if (uploadedId) {
      elements.documentSelect.value = String(uploadedId);
    }
  } catch (error) {
    setMessage(elements.uploadMessage, error.message, "error");
  }
}

async function generateSummary() {
  if (!state.user) {
    setMessage(elements.uploadMessage, "Please log in to generate summary.", "error");
    return;
  }

  const documentId = elements.documentSelect.value;
  if (!documentId) {
    setMessage(elements.uploadMessage, "Please upload a document first.", "error");
    return;
  }

  try {
    const result = await apiRequest("/api/summarize", {
      method: "POST",
      body: JSON.stringify({ documentId, userId: state.user.id })
    });

    state.generatedSummary = result.summary;
    state.generatedKeywords = result.keywords || [];

    elements.summaryOutput.textContent = result.summary;
    renderKeywords();
    setMessage(elements.uploadMessage, "Summary generated successfully.", "success");
  } catch (error) {
    setMessage(elements.uploadMessage, error.message, "error");
  }
}

function renderKeywords() {
  elements.keywordOutput.innerHTML = "";
  if (!state.generatedKeywords.length) {
    elements.keywordOutput.innerHTML = "No keywords found.";
    return;
  }

  state.generatedKeywords.forEach(keyword => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = keyword;
    elements.keywordOutput.appendChild(tag);
  });
}

async function saveSummary() {
  if (!state.user) {
    setMessage(elements.uploadMessage, "Please log in before saving summary.", "error");
    return;
  }

  if (!state.generatedSummary) {
    setMessage(elements.uploadMessage, "Generate a summary before saving.", "error");
    return;
  }

  const documentId = elements.documentSelect.value;

  try {
    const result = await apiRequest("/api/save-summary", {
      method: "POST",
      body: JSON.stringify({
        documentId,
        userId: state.user.id,
        summaryText: state.generatedSummary,
        keywords: state.generatedKeywords.join(", ")
      })
    });

    await loadSummaries();
    setMessage(elements.uploadMessage, "Summary saved successfully.", "success");
  } catch (error) {
    setMessage(elements.uploadMessage, error.message, "error");
  }
}

function downloadNotes() {
  if (!state.generatedSummary) {
    setMessage(elements.uploadMessage, "Generate a summary before downloading.", "error");
    return;
  }

  const text = `AI Notes Summary\n\nKeywords: ${state.generatedKeywords.join(", ")}\n\n${state.generatedSummary}`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "notes-summary.txt";
  a.click();
  URL.revokeObjectURL(url);
  setMessage(elements.uploadMessage, "Notes downloaded successfully.", "success");
}

async function loadAdminDashboard() {
  if (!state.user || state.user.role !== "admin") {
    elements.adminDashboard.innerHTML = "";
    return;
  }

  try {
    const result = await apiRequest(`/api/admin/dashboard/${state.user.id}`);
    const { dashboard } = result;

    elements.adminDashboard.innerHTML = `
      <div class="admin-card">
        <h3>Statistics</h3>
        <div class="admin-stats">
          <div class="stat-box"><strong>${dashboard.totalUsers}</strong><br />Users</div>
          <div class="stat-box"><strong>${dashboard.totalDocuments}</strong><br />Documents</div>
          <div class="stat-box"><strong>${dashboard.totalSummaries}</strong><br />Summaries</div>
        </div>
      </div>

      <div class="admin-card">
        <h3>Recent Documents</h3>
        ${dashboard.recentDocuments.map(doc => `
          <div>• ${doc.original_name} by ${doc.user_name}</div>
        `).join("") || "No recent documents."}
      </div>

      <div class="admin-card">
        <h3>Latest Summaries</h3>
        ${dashboard.recentSummaries.map(summary => `
          <div>• ${summary.document_name} by ${summary.user_name}</div>
        `).join("") || "No summaries yet."}
      </div>
    `;
  } catch (error) {
    elements.adminDashboard.innerHTML = "<div class='admin-card'>Admin access required.</div>";
  }
}

elements.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  loginUser({ email, password });
});

elements.registerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  registerUser({ name, email, password });
});

elements.uploadForm.addEventListener("submit", handleUpload);
elements.generateSummaryBtn.addEventListener("click", generateSummary);
elements.saveSummaryBtn.addEventListener("click", saveSummary);
elements.downloadSummaryBtn.addEventListener("click", downloadNotes);
elements.logoutBtn.addEventListener("click", logout);

setWelcome();
setMessage(elements.uploadMessage, "Login or register to begin.", "info");

if (state.user) {
  loadDocuments();
  loadSummaries();
  if (state.user.role === "admin") loadAdminDashboard();
}
