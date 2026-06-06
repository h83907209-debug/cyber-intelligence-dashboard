const loginForm = document.getElementById("loginForm");
const loginPage = document.getElementById("loginPage");
const dashboard = document.getElementById("dashboard");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const scanForm = document.getElementById("scanForm");
const scanTarget = document.getElementById("scanTarget");
const resultBox = document.getElementById("resultBox");
const resultStatus = document.getElementById("resultStatus");
const locationStatus = document.getElementById("locationStatus");
const intelCards = document.getElementById("intelCards");

const API_BASE = "/api";
const IS_MOBILE = window.matchMedia("(max-width: 767px)").matches;

let authToken = sessionStorage.getItem("auth_token") || "";
let mapState = null;
let globeState = null;
let engineBootPromise = null;
let typingTimer = null;
const geocodeCache = new Map();

const heroTitle = document.querySelector("h1");
if (heroTitle) {
  heroTitle.setAttribute("data-title", heroTitle.textContent || "");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
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

function startDotsLoading(targetElement, baseText) {
  let tick = 0;
  targetElement.textContent = `${baseText}.`;

  const intervalId = setInterval(() => {
    tick = (tick + 1) % 3;
    targetElement.textContent = `${baseText}${".".repeat(tick + 1)}`;
  }, 300);

  return () => clearInterval(intervalId);
}

function typeInto(element, text, speed = 12) {
  if (typingTimer) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }

  element.classList.add("typing");
  element.textContent = "";
  let index = 0;

  const write = () => {
    index += 1;
    element.textContent = text.slice(0, index);
    if (index < text.length) {
      typingTimer = setTimeout(write, speed);
      return;
    }
    element.classList.remove("typing");
  };

  write();
}

function clearIntelCards() {
  intelCards.innerHTML = "";
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
  const normalizedPatterns = keyPatterns.map(normalizeKey);
  const normalizedExclude = exclude.map(normalizeKey);

  for (const entry of entries) {
    const key = normalizeKey(entry.key);
    const value = entry.value;
    if (value.length < min) {
      continue;
    }
    if (mustContainDigit && !/\d/.test(value)) {
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

function parseIntelligenceFields(payload) {
  const entries = collectEntries(payload);

  const fullName = pickField(entries, ["fullname", "name"], {
    exclude: ["father", "mother", "username", "carrier", "operator"]
  });
  const fatherName = pickField(entries, ["fathername", "father"]);
  const phone = pickField(entries, ["phone", "mobile", "contact"], { mustContainDigit: true });
  const secondaryPhone = pickField(entries, ["secondaryphone", "alternatephone", "phone2", "mobile2"], {
    mustContainDigit: true
  });
  const email = pickField(entries, ["email", "mail"]);
  const address = pickField(entries, ["address", "street", "locality", "village"]);
  const city = pickField(entries, ["city", "town"]);
  const district = pickField(entries, ["district", "county"]);
  const state = pickField(entries, ["state", "region", "province"]);
  const documentNumber = pickField(entries, ["document", "idnumber", "passport", "pan", "aadhaar", "voter"], {
    mustContainDigit: true
  });
  const carrier = pickField(entries, ["carrier", "operator", "network", "telecom", "provider"]);

  const cards = [
    { label: "Name", value: fullName },
    { label: "Father Name", value: fatherName },
    { label: "Phone", value: phone },
    { label: "Secondary Phone", value: secondaryPhone && secondaryPhone !== phone ? secondaryPhone : "" },
    { label: "Email", value: email },
    { label: "Address", value: address },
    { label: "Region", value: state },
    { label: "Document Number", value: documentNumber },
    { label: "Carrier", value: carrier }
  ].filter((item) => item.value);

  return {
    cards,
    address,
    city,
    district,
    state
  };
}

function renderIntelligenceCards(cards) {
  clearIntelCards();

  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "intel-empty";
    empty.textContent = "No intelligence fields available in current response.";
    intelCards.appendChild(empty);
    return;
  }

  cards.forEach((item) => {
    const card = document.createElement("article");
    card.className = "intel-card";

    const label = document.createElement("span");
    label.className = "intel-label";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = "intel-value";
    value.textContent = item.value;

    card.appendChild(label);
    card.appendChild(value);
    intelCards.appendChild(card);
  });
}

function findLatLng(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findLatLng(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const keys = Object.keys(node);
  const latKey = keys.find((key) => ["lat", "latitude", "geo_lat"].includes(String(key).toLowerCase()));
  const lngKey = keys.find((key) => ["lng", "lon", "long", "longitude", "geo_lon"].includes(String(key).toLowerCase()));

  if (latKey && lngKey) {
    const lat = Number(node[latKey]);
    const lng = Number(node[lngKey]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  for (const value of Object.values(node)) {
    const found = findLatLng(value);
    if (found) {
      return found;
    }
  }

  return null;
}

async function geocodeQuery(query) {
  if (!query) {
    return null;
  }

  const cacheKey = query.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      geocodeCache.set(cacheKey, null);
      return null;
    }
    const payload = await response.json();
    if (!Array.isArray(payload) || !payload.length) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const lat = Number(payload[0].lat);
    const lng = Number(payload[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const point = { lat, lng, label: payload[0].display_name || query };
    geocodeCache.set(cacheKey, point);
    return point;
  } catch {
    return null;
  }
}

async function resolveLocation(payload, extracted) {
  const exact = findLatLng(payload);
  if (exact) {
    return { ...exact, source: "coordinates" };
  }

  const locationParts = {
    address: extracted.address,
    city: extracted.city,
    district: extracted.district,
    state: extracted.state
  };

  const queries = [];

  const full = [locationParts.address, locationParts.city, locationParts.district, locationParts.state]
    .filter(Boolean)
    .join(", ");
  if (full) {
    queries.push(full);
  }

  const locality = [locationParts.city, locationParts.district, locationParts.state].filter(Boolean).join(", ");
  if (locality) {
    queries.push(locality);
  }

  const districtState = [locationParts.district, locationParts.state].filter(Boolean).join(", ");
  if (districtState) {
    queries.push(districtState);
  }

  const cityState = [locationParts.city, locationParts.state].filter(Boolean).join(", ");
  if (cityState) {
    queries.push(cityState);
  }

  if (locationParts.state) {
    queries.push(locationParts.state);
  }

  for (const query of queries) {
    const result = await geocodeQuery(query);
    if (result) {
      return { lat: result.lat, lng: result.lng, source: "geocoding", label: result.label };
    }
  }

  return null;
}

async function ensureVisualEngines() {
  if (engineBootPromise) {
    return engineBootPromise;
  }

  engineBootPromise = (async () => {
    loadCss("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
    await Promise.all([
      loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"),
      loadScript("https://unpkg.com/three@0.160.0/build/three.min.js")
    ]);

    const pulseStyleId = "leaflet-pulse-style";
    if (!document.getElementById(pulseStyleId)) {
      const style = document.createElement("style");
      style.id = pulseStyleId;
      style.textContent = `
        .pulse-marker {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: rgba(255, 70, 232, 0.9);
          border: 2px solid rgba(75, 247, 255, 0.95);
          box-shadow: 0 0 12px rgba(255, 70, 232, 0.8);
          position: relative;
        }
        .pulse-marker::after {
          content: "";
          position: absolute;
          inset: -8px;
          border: 2px solid rgba(75, 247, 255, 0.75);
          border-radius: 50%;
          animation: pulse-ring 1.3s ease-out infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.6); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    await initGlobe();
    initMap();
  })();

  return engineBootPromise;
}

function earthTextureSources() {
  const customTexture = window.CUSTOM_EARTH_TEXTURE_URL || document.body.dataset.earthTexture || "";
  const customMobileTexture = document.body.dataset.earthTextureMobile || "";
  return {
    day: IS_MOBILE && customMobileTexture ? customMobileTexture : customTexture,
    fallbackDay: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg",
    night: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_lights_2048.png",
    clouds: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_clouds_1024.png",
    normal: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_normal_2048.jpg"
  };
}

async function loadTextureWithFallback(loader, primary, fallback) {
  if (primary) {
    try {
      return await loader.loadAsync(primary);
    } catch {
      // Fallback keeps globe rendering when custom texture is missing.
    }
  }
  return loader.loadAsync(fallback);
}

async function initGlobe() {
  if (globeState) {
    return;
  }

  const globeElement = document.getElementById("globe");
  if (!globeElement || !window.THREE) {
    return;
  }

  globeElement.innerHTML = "";
  globeElement.style.width = "100%";
  globeElement.style.height = "100%";
  globeElement.style.minHeight = IS_MOBILE ? "300px" : "360px";
  globeElement.style.border = "0";
  globeElement.style.background = "transparent";
  globeElement.style.boxShadow = "none";
  globeElement.style.animation = "none";

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, globeElement.clientWidth / globeElement.clientHeight, 0.1, 1000);
  camera.position.z = 2.8;

  const renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, alpha: true, powerPreference: "high-performance" });
  renderer.setSize(globeElement.clientWidth, globeElement.clientHeight);
  renderer.setPixelRatio(IS_MOBILE ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  globeElement.appendChild(renderer.domElement);

  const loader = new THREE.TextureLoader();
  const textures = earthTextureSources();

  const [dayMap, nightMap, cloudMap, normalMap] = await Promise.all([
    loadTextureWithFallback(loader, textures.day, textures.fallbackDay),
    loader.loadAsync(textures.night),
    loader.loadAsync(textures.clouds),
    loader.loadAsync(textures.normal)
  ]);

  [dayMap, nightMap, cloudMap, normalMap].forEach((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = IS_MOBILE ? 2 : 8;
  });

  const segments = IS_MOBILE ? 48 : 96;

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, segments, segments),
    new THREE.MeshPhongMaterial({
      map: dayMap,
      normalMap,
      emissiveMap: nightMap,
      emissive: new THREE.Color(0x6a89ff),
      emissiveIntensity: 0.35,
      shininess: 10
    })
  );

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.01, segments, segments),
    new THREE.MeshLambertMaterial({
      map: cloudMap,
      transparent: true,
      opacity: IS_MOBILE ? 0.28 : 0.38,
      depthWrite: false
    })
  );

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.08, segments, segments),
    new THREE.MeshBasicMaterial({
      color: 0x4bdfff,
      transparent: true,
      opacity: IS_MOBILE ? 0.12 : 0.18,
      side: THREE.BackSide
    })
  );

  scene.add(earth);
  scene.add(clouds);
  scene.add(atmosphere);

  scene.add(new THREE.AmbientLight(0x2f4e8f, 0.65));

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(5, 1.5, 5);
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x4bf7ff, 0.25);
  rim.position.set(-5, -2, -4);
  scene.add(rim);

  let frameId = 0;
  const animate = () => {
    frameId = requestAnimationFrame(animate);
    earth.rotation.y += 0.0014;
    clouds.rotation.y += 0.0018;
    atmosphere.rotation.y += 0.0007;
    renderer.render(scene, camera);
  };
  animate();

  const onResize = () => {
    const width = globeElement.clientWidth;
    const height = globeElement.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener("resize", onResize);

  globeState = { frameId, renderer, onResize };
}

function initMap() {
  if (mapState) {
    return;
  }

  const mapWrap = document.querySelector(".map-wrap");
  if (!mapWrap || !window.L) {
    return;
  }

  mapWrap.innerHTML = '<div id="liveMap" style="height:100%;width:100%;"></div>';

  const L = window.L;
  const map = L.map("liveMap", {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,
    zoomAnimation: true,
    fadeAnimation: !IS_MOBILE,
    markerZoomAnimation: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  map.fitWorld({ animate: false });

  mapState = { map, marker: null, circle: null, visible: false };
  setTimeout(() => map.invalidateSize(), 180);
}

function showLocationUnavailable() {
  locationStatus.textContent = "Location unavailable";
  locationStatus.classList.add("unavailable");

  if (!mapState) {
    return;
  }
  if (mapState.visible && mapState.marker && mapState.circle) {
    mapState.map.removeLayer(mapState.marker);
    mapState.map.removeLayer(mapState.circle);
    mapState.visible = false;
  }
}

function updateLiveLocation(lat, lng, labelText) {
  if (!mapState) {
    return;
  }

  const location = [lat, lng];
  if (!mapState.marker || !mapState.circle) {
    const L = window.L;
    mapState.marker = L.marker(location, {
      icon: L.divIcon({
        className: "",
        html: '<div class="pulse-marker"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    });

    mapState.circle = L.circle(location, {
      radius: 140000,
      color: "#4bf7ff",
      weight: 1,
      fillColor: "#ff46e8",
      fillOpacity: 0.18
    });
  }

  if (!mapState.visible) {
    mapState.marker.addTo(mapState.map);
    mapState.circle.addTo(mapState.map);
    mapState.visible = true;
  }

  mapState.marker.setLatLng(location).bindPopup(labelText);
  mapState.circle.setLatLng(location);
  mapState.map.flyTo(location, IS_MOBILE ? 6 : 7, {
    duration: IS_MOBILE ? 1.4 : 1.8,
    easeLinearity: 0.24
  });
}

function unlockDashboard() {
  loginPage.classList.add("hidden");
  dashboard.classList.remove("hidden");
  dashboard.setAttribute("aria-hidden", "false");
  ensureVisualEngines().catch(() => {
    typeInto(resultStatus, "Error: visualization engine unavailable.");
  });
}

function lockDashboard() {
  dashboard.classList.add("hidden");
  dashboard.setAttribute("aria-hidden", "true");
  loginPage.classList.remove("hidden");
  authToken = "";
  sessionStorage.removeItem("auth_token");
}

if (authToken) {
  unlockDashboard();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const submitButton = loginForm.querySelector("button[type='submit']");

  if (!username || !password) {
    loginError.textContent = "Username and password are required.";
    return;
  }

  loginError.textContent = "";
  submitButton.disabled = true;
  const stopLoading = startDotsLoading(loginError, "Authenticating");

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

    if (!payload || typeof payload.token !== "string" || !payload.token) {
      loginError.textContent = "Login succeeded but token is missing.";
      return;
    }

    authToken = payload.token;
    sessionStorage.setItem("auth_token", authToken);
    loginError.textContent = "";
    document.getElementById("password").value = "";
    unlockDashboard();
  } catch {
    loginError.textContent = "Unable to connect to backend.";
  } finally {
    stopLoading();
    submitButton.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  document.getElementById("password").value = "";
  lockDashboard();
  loginError.textContent = "";
  typeInto(resultStatus, "No scan run yet.");
  showLocationUnavailable();
  clearIntelCards();
});

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = scanTarget.value.trim();
  const submitButton = scanForm.querySelector("button[type='submit']");

  if (!target) {
    typeInto(resultStatus, "Error: target is required.");
    return;
  }

  if (!authToken) {
    typeInto(resultStatus, "Error: session expired. Please login again.");
    lockDashboard();
    return;
  }

  submitButton.disabled = true;
  submitButton.classList.add("loading");
  resultBox.classList.add("scanning");
  const stopLoading = startDotsLoading(resultStatus, "Scanning target");

  const finishLoading = () => {
    stopLoading();
    submitButton.disabled = false;
    submitButton.classList.remove("loading");
    resultBox.classList.remove("scanning");
  };

  try {
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
      finishLoading();
      lockDashboard();
      typeInto(resultStatus, "Error: unauthorized. Please login again.");
      return;
    }

    if (!response.ok) {
      finishLoading();
      typeInto(resultStatus, `Error: ${parseErrorMessage(payload, "Query failed.")}`);
      return;
    }

    const parsed = parseIntelligenceFields(payload);
    renderIntelligenceCards(parsed.cards);

    const location = await resolveLocation(payload, parsed);
    if (location) {
      locationStatus.textContent = `Location locked: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
      locationStatus.classList.remove("unavailable");
      updateLiveLocation(location.lat, location.lng, `Target: ${target}`);
    } else {
      showLocationUnavailable();
    }

    finishLoading();
    typeInto(resultStatus, `Intelligence report generated for target: ${target}`);
  } catch {
    finishLoading();
    typeInto(resultStatus, "Error: unable to connect to backend.");
  }
});
