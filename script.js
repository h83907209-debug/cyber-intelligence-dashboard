const API_BASE = "/api";
const loginView = document.getElementById("loginView");
const searchView = document.getElementById("searchView");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("loginError");

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const countryCode = document.getElementById("countryCode");
const searchError = document.getElementById("searchError");
const resultCards = document.getElementById("resultCards");

const scanOverlay = document.getElementById("scanOverlay");
const scanMessage = document.getElementById("scanMessage");

const scanSteps = [
  "Initializing Search...",
  "Checking Records...",
  "Processing Intelligence...",
  "Building Report..."
];

let authToken = sessionStorage.getItem("auth_token") || "";

function setView(isLoggedIn) {
  loginView.classList.toggle("hidden", isLoggedIn);
  searchView.classList.toggle("hidden", !isLoggedIn);
  searchView.setAttribute("aria-hidden", String(!isLoggedIn));
}

function clearResults() {
  resultCards.innerHTML = "";
}

function showEmpty(message) {
  clearResults();
  const block = document.createElement("div");
  block.className = "empty";
  block.textContent = message;
  resultCards.appendChild(block);
}

function parseError(payload, fallback) {
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

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectEntries(node, path = "", entries = []) {
  if (node === null || node === undefined) {
    return entries;
  }

  if (typeof node === "string" || typeof node === "number") {
    const text = String(node).trim();
    if (text) {
      entries.push({ key: path, value: text });
    }
    return entries;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => collectEntries(item, `${path}[${index}]`, entries));
    return entries;
  }

  if (typeof node === "object") {
    Object.entries(node).forEach(([key, value]) => {
      const next = path ? `${path}.${key}` : key;
      collectEntries(value, next, entries);
    });
  }

  return entries;
}

function pickValue(entries, patterns, options = {}) {
  const { exclude = [], requireDigit = false } = options;
  const normalizedPatterns = patterns.map(normalizeKey);
  const normalizedExclude = exclude.map(normalizeKey);

  for (const entry of entries) {
    const key = normalizeKey(entry.key);
    const value = entry.value;

    if (value.length < 2) {
      continue;
    }
    if (requireDigit && !/\d/.test(value)) {
      continue;
    }
    if (normalizedExclude.some((token) => key.includes(token))) {
      continue;
    }
    if (normalizedPatterns.some((token) => key.includes(token))) {
      return value;
    }
  }

  return "";
}

function pickMultipleNames(entries) {
  const nameTokens = ["fullname", "name", "customername", "personname"];
  const excluded = ["father", "mother", "username", "carrier", "operator", "email"];
  const found = [];

  entries.forEach((entry) => {
    const key = normalizeKey(entry.key);
    const value = entry.value;
    if (value.length < 2) {
      return;
    }
    if (excluded.some((token) => key.includes(token))) {
      return;
    }
    if (nameTokens.some((token) => key.includes(token)) && !found.includes(value)) {
      found.push(value);
    }
  });

  return found;
}

function normalizePhone(raw) {
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.length <= 5) {
    return raw;
  }
  return cleaned;
}

function buildReport(payload) {
  const entries = collectEntries(payload);
  const names = pickMultipleNames(entries);

  const cards = [];

  names.forEach((name, index) => {
    cards.push({
      label: index === 0 ? "Name" : `Name ${index + 1}`,
      value: name
    });
  });

  const name2FromFather = pickValue(entries, ["fathername", "father"]);
  if (name2FromFather && !names.includes(name2FromFather)) {
    cards.push({ label: "Name 2", value: name2FromFather });
  }

  const primaryPhone = pickValue(entries, ["phone", "mobile", "contact"], { requireDigit: true });
  const secondaryPhone = pickValue(entries, ["secondaryphone", "alternatephone", "phone2", "mobile2"], {
    requireDigit: true
  });

  if (primaryPhone) {
    cards.push({ label: "Phone Number", value: normalizePhone(primaryPhone) });
  }
  if (secondaryPhone && normalizePhone(secondaryPhone) !== normalizePhone(primaryPhone || "")) {
    cards.push({ label: "Secondary Phone", value: normalizePhone(secondaryPhone) });
  }

  const email = pickValue(entries, ["email", "mail"]);
  if (email) {
    cards.push({ label: "Email", value: email });
  }

  const address = pickValue(entries, ["address", "street", "locality", "village"]);
  if (address) {
    cards.push({ label: "Address", value: address });
  }

  const region = pickValue(entries, ["state", "region", "province"]);
  if (region) {
    cards.push({ label: "State / Region", value: region });
  }

  const documentNumber = pickValue(entries, ["document", "idnumber", "passport", "pan", "aadhaar", "voter"], {
    requireDigit: true
  });
  if (documentNumber) {
    cards.push({ label: "Document Number", value: documentNumber });
  }

  return cards;
}

function renderReport(cards) {
  clearResults();

  if (!cards.length) {
    showEmpty("No useful fields found in this search response.");
    return;
  }

  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "result-item";

    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = card.label;

    const value = document.createElement("p");
    value.className = "result-value";
    value.textContent = card.value;

    item.appendChild(label);
    item.appendChild(value);
    resultCards.appendChild(item);
  });
}

function startOverlay() {
  scanOverlay.classList.remove("hidden");
  scanOverlay.setAttribute("aria-hidden", "false");

  let step = 0;
  scanMessage.textContent = scanSteps[step];
  const interval = setInterval(() => {
    step = (step + 1) % scanSteps.length;
    scanMessage.textContent = scanSteps[step];
  }, 700);

  return () => {
    clearInterval(interval);
    scanOverlay.classList.add("hidden");
    scanOverlay.setAttribute("aria-hidden", "true");
  };
}

function holdOverlayForThreeSeconds() {
  return new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });
}

async function login(username, password) {
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
    throw new Error(parseError(payload, "Login failed."));
  }

  if (!payload || typeof payload.token !== "string" || !payload.token) {
    throw new Error("Invalid login response.");
  }

  return payload.token;
}

async function searchPhone(fullNumber) {
  const response = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      request: fullNumber,
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
    setView(false);
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    throw new Error(parseError(payload, "Search failed."));
  }

  return payload;
}

if (authToken) {
  setView(true);
  showEmpty("Enter a number to begin intelligence lookup.");
} else {
  setView(false);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const button = loginForm.querySelector("button[type='submit']");

  if (!username || !password) {
    loginError.textContent = "Username and password are required.";
    return;
  }

  button.disabled = true;
  try {
    authToken = await login(username, password);
    sessionStorage.setItem("auth_token", authToken);
    document.getElementById("password").value = "";
    setView(true);
    showEmpty("Enter a number to begin intelligence lookup.");
  } catch (error) {
    loginError.textContent = error instanceof Error ? error.message : "Login failed.";
  } finally {
    button.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  authToken = "";
  sessionStorage.removeItem("auth_token");
  searchInput.value = "";
  searchError.textContent = "";
  clearResults();
  setView(false);
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  searchError.textContent = "";
  clearResults();

  const selectedCode = countryCode.value;
  const numberOnly = searchInput.value.replace(/[^\d]/g, "");
  const button = searchForm.querySelector("button[type='submit']");

  if (!numberOnly) {
    searchError.textContent = "Please enter a valid phone number.";
    return;
  }

  const fullNumber = `${selectedCode}${numberOnly}`;

  button.disabled = true;
  const stopOverlay = startOverlay();

  try {
    const [payload] = await Promise.all([searchPhone(fullNumber), holdOverlayForThreeSeconds()]);
    const reportCards = buildReport(payload);
    renderReport(reportCards);
  } catch (error) {
    searchError.textContent = error instanceof Error ? error.message : "Search failed.";
    showEmpty("No report generated.");
  } finally {
    stopOverlay();
    button.disabled = false;
  }
});
