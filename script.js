// script.js
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
const loginPikachu = document.getElementById("loginPikachu");
const brandPikachu = document.getElementById("brandPikachu");
const resultsPikachu = document.getElementById("resultsPikachu");
const runFrameA = document.getElementById("runFrameA");
const runFrameB = document.getElementById("runFrameB");

const scanSteps = [
  "Initializing Search...",
  "Checking Records...",
  "Processing Intelligence...",
  "Building Report..."
];

let authToken = sessionStorage.getItem("auth_token") || "";

const svgFallbackA =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 110 80'%3E%3Cellipse cx='56' cy='70' rx='28' ry='5' fill='%239ca3af' opacity='0.45'/%3E%3Cpath d='M18 40l16-13 12 7 9-10 9 5-4 7 12 3-10 14-17 5-13-4-8 6-1-9-10-3z' fill='%23facc15' stroke='%231f2937' stroke-width='2'/%3E%3Ccircle cx='69' cy='39' r='3' fill='%231f2937'/%3E%3Ccircle cx='63' cy='45' r='5' fill='%23ef4444'/%3E%3Cpath d='M48 30l-4-10 9 7zM56 30l3-9 6 8z' fill='%231f2937'/%3E%3C/svg%3E";
const svgFallbackB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 110 80'%3E%3Cellipse cx='56' cy='70' rx='28' ry='5' fill='%239ca3af' opacity='0.45'/%3E%3Cpath d='M18 41l17-11 11 8 8-9 10 4-5 8 13 3-11 13-16 6-14-3-7 7-2-10-10-2z' fill='%23facc15' stroke='%231f2937' stroke-width='2'/%3E%3Ccircle cx='69' cy='40' r='3' fill='%231f2937'/%3E%3Ccircle cx='63' cy='46' r='5' fill='%23ef4444'/%3E%3Cpath d='M48 31l-5-9 9 6zM56 31l3-8 6 7z' fill='%231f2937'/%3E%3C/svg%3E";

function probeImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => resolve("");
    image.src = url;
  });
}

async function pickFirstAvailableImage(candidates, fallback) {
  for (const url of candidates) {
    const found = await probeImage(url);
    if (found) {
      return found;
    }
  }
  return fallback;
}

async function setupPikachuImages() {
  const loginSource = await pickFirstAvailableImage(
    [
      "assets/pikachu-login.png",
      "assets/pikachu.png",
      "assets/pikachu-hero.png",
      "assets/pikachu.jpg"
    ],
    svgFallbackA
  );

  const brandSource = await pickFirstAvailableImage(
    ["assets/pikachu-brand.png", "assets/pikachu-face.png", "assets/pikachu.png"],
    svgFallbackA
  );

  const runSourceA = await pickFirstAvailableImage(
    ["assets/pikachu-run-1.png", "assets/pikachu-run-a.png", "assets/pikachu-run.png", "assets/pikachu.png"],
    svgFallbackA
  );

  const runSourceB = await pickFirstAvailableImage(
    ["assets/pikachu-run-2.png", "assets/pikachu-run-b.png", "assets/pikachu-run.png", "assets/pikachu.png"],
    svgFallbackB
  );

  loginPikachu.src = loginSource;
  brandPikachu.src = brandSource;
  resultsPikachu.src = brandSource;
  runFrameA.src = runSourceA;
  runFrameB.src = runSourceB;
}

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

setupPikachuImages().catch(() => {
  loginPikachu.src = svgFallbackA;
  brandPikachu.src = svgFallbackA;
  resultsPikachu.src = svgFallbackA;
  runFrameA.src = svgFallbackA;
  runFrameB.src = svgFallbackB;
});

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
