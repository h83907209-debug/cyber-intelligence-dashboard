const loginView = document.getElementById("loginView");
const searchView = document.getElementById("searchView");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchError = document.getElementById("searchError");
const resultCards = document.getElementById("resultCards");

const scanOverlay = document.getElementById("scanOverlay");
const scanMessage = document.getElementById("scanMessage");

const API_BASE = "/api";
let authToken = sessionStorage.getItem("auth_token") || "";

const SEARCH_STEPS = [
  "Initializing search...",
  "Checking records...",
  "Processing intelligence...",
  "Building report..."
];

function setAuthenticatedState(isAuthenticated) {
  loginView.classList.toggle("hidden", isAuthenticated);
  searchView.classList.toggle("hidden", !isAuthenticated);
  searchView.setAttribute("aria-hidden", String(!isAuthenticated));
}

function parseErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

function clearResults() {
  resultCards.innerHTML = "";
}

function showEmptyState(message) {
  clearResults();
  const block = document.createElement("div");
  block.className = "empty-state";
  block.textContent = message;
  resultCards.appendChild(block);
}

function normalizeKey(input) {
  return String(input).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectEntries(node, path = "", entries = []) {
  if (node === null || node === undefined) {
    return entries;
  }

  if (typeof node === "string" || typeof node === "number") {
    const value = String(node).trim();
    if (value) {
      entries.push({ key: path, value });
    }
    return entries;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => collectEntries(item, `${path}[${index}]`, entries));
    return entries;
  }

  if (typeof node === "object") {
    Object.entries(node).forEach(([key, value]) => {
      const nextPath = path ? `${path}.${key}` : key;
      collectEntries(value, nextPath, entries);
    });
  }

  return entries;
}

function pickField(entries, keyPatterns, options = {}) {
  const { exclude = [], min = 2, mustContainDigit = false } = options;
  const patterns = keyPatterns.map(normalizeKey);
  const excluded = exclude.map(normalizeKey);

  for (const entry of entries) {
    const key = normalizeKey(entry.key);
    const value = entry.value;

    if (value.length < min) {
      continue;
    }
    if (mustContainDigit && !/\d/.test(value)) {
      continue;
    }
    if (excluded.some((token) => key.includes(token))) {
      continue;
    }
    if (patterns.some((token) => key.includes(token))) {
      return value;
    }
  }

  return "";
}

function buildReport(payload) {
  const entries = collectEntries(payload);

  return [
    {
      label: "Full Name",
      value: pickField(entries, ["fullname", "name"], {
        exclude: ["father", "mother", "username", "carrier", "operator"]
      })
    },
    { label: "Phone Number", value: pickField(entries, ["phone", "mobile", "contact"], { mustContainDigit: true }) },
    {
      label: "Secondary Phone",
      value: pickField(entries, ["secondaryphone", "alternatephone", "phone2", "mobile2"], { mustContainDigit: true })
    },
    { label: "Email", value: pickField(entries, ["email", "mail"]) },
    { label: "Father Name", value: pickField(entries, ["fathername", "father"]) },
    { label: "Address", value: pickField(entries, ["address", "street", "locality", "village"]) },
    { label: "State / Region", value: pickField(entries, ["state", "region", "province"]) },
    {
      label: "Document Number",
      value: pickField(entries, ["document", "idnumber", "passport", "pan", "aadhaar", "voter"], {
        mustContainDigit: true
      })
    },
    { label: "Carrier / Operator", value: pickField(entries, ["carrier", "operator", "network", "telecom", "provider"]) }
  ].filter((item) => item.value);
}

function renderReport(cards) {
  clearResults();

  if (!cards.length) {
    showEmptyState("No reportable intelligence fields were found.");
    return;
  }

  cards.forEach((item) => {
    const article = document.createElement("article");
    article.className = "result-card";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = "result-value";
    value.textContent = item.value;

    article.appendChild(label);
    article.appendChild(value);
    resultCards.appendChild(article);
  });
}

function startScanOverlay() {
  scanOverlay.classList.remove("hidden");
  scanOverlay.setAttribute("aria-hidden", "false");

  let step = 0;
  scanMessage.textContent = SEARCH_STEPS[step];

  const interval = setInterval(() => {
    step = (step + 1) % SEARCH_STEPS.length;
    scanMessage.textContent = SEARCH_STEPS[step];
  }, 700);

  return () => {
    clearInterval(interval);
    scanOverlay.classList.add("hidden");
    scanOverlay.setAttribute("aria-hidden", "true");
  };
}

function minimumScanDuration() {
  return new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });
}

async function runQuery(target) {
  const response = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      request: target,
      limit: 100,
      lang: "en",
      type: "json"
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    authToken = "";
    sessionStorage.removeItem("auth_token");
    setAuthenticatedState(false);
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "Search failed."));
  }

  return payload;
}

if (authToken) {
  setAuthenticatedState(true);
} else {
  setAuthenticatedState(false);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const submit = loginForm.querySelector("button[type='submit']");

  if (!username || !password) {
    loginError.textContent = "Username and password are required.";
    return;
  }

  submit.disabled = true;
  loginError.textContent = "";

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      loginError.textContent = parseErrorMessage(payload, "Login failed.");
      return;
    }

    if (!payload || typeof payload.token !== "string") {
      loginError.textContent = "Invalid login response.";
      return;
    }

    authToken = payload.token;
    sessionStorage.setItem("auth_token", authToken);
    document.getElementById("password").value = "";
    setAuthenticatedState(true);
    showEmptyState("Search for a number to generate an intelligence report.");
  } catch {
    loginError.textContent = "Unable to connect to backend.";
  } finally {
    submit.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  authToken = "";
  sessionStorage.removeItem("auth_token");
  searchInput.value = "";
  searchError.textContent = "";
  clearResults();
  setAuthenticatedState(false);
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = searchInput.value.trim();
  const submit = searchForm.querySelector("button[type='submit']");

  if (!target) {
    searchError.textContent = "Phone number is required.";
    return;
  }

  searchError.textContent = "";
  clearResults();
  submit.disabled = true;

  const stopOverlay = startScanOverlay();

  try {
    const [payload] = await Promise.all([runQuery(target), minimumScanDuration()]);
    const report = buildReport(payload);
    renderReport(report);
  } catch (error) {
    searchError.textContent = error instanceof Error ? error.message : "Search failed.";
    showEmptyState("No report generated.");
  } finally {
    stopOverlay();
    submit.disabled = false;
  }
});

if (authToken) {
  showEmptyState("Search for a number to generate an intelligence report.");
}
