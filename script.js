const loginForm = document.getElementById("loginForm");
const loginPage = document.getElementById("loginPage");
const dashboard = document.getElementById("dashboard");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const scanForm = document.getElementById("scanForm");
const scanTarget = document.getElementById("scanTarget");
const resultBox = document.getElementById("resultBox");

const API_BASE = "/api";
let authToken = sessionStorage.getItem("auth_token") || "";
let mapState = null;
let globeState = null;
let engineBootPromise = null;
let typingTimer = null;

const heroTitle = document.querySelector("h1");
if (heroTitle) {
  heroTitle.setAttribute("data-title", heroTitle.textContent || "");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (existing.getAttribute("data-loaded") === "true") {
        resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute("data-loaded", "true");
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
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

    initGlobe();
    initMap();
  })();

  return engineBootPromise;
}

function initGlobe() {
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
  globeElement.style.minHeight = "240px";
  globeElement.style.border = "0";
  globeElement.style.background = "transparent";
  globeElement.style.boxShadow = "none";
  globeElement.style.animation = "none";

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, globeElement.clientWidth / globeElement.clientHeight, 0.1, 1000);
  camera.position.z = 3;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(globeElement.clientWidth, globeElement.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  globeElement.appendChild(renderer.domElement);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0x2dd4ff,
      emissive: 0x1a2d77,
      emissiveIntensity: 0.35,
      wireframe: true,
      metalness: 0.15,
      roughness: 0.45
    })
  );

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.07, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x4bf7ff, transparent: true, opacity: 0.08 })
  );

  scene.add(sphere);
  scene.add(atmosphere);
  scene.add(new THREE.AmbientLight(0x1d4ed8, 0.8));

  const light = new THREE.PointLight(0x4bf7ff, 1.1);
  light.position.set(2.5, 2.2, 2.8);
  scene.add(light);

  let frameId = 0;
  const animate = () => {
    frameId = requestAnimationFrame(animate);
    sphere.rotation.y += 0.006;
    sphere.rotation.x += 0.0014;
    atmosphere.rotation.y -= 0.002;
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
    attributionControl: true
  }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const marker = L.marker([20, 0], {
    icon: L.divIcon({
      className: "",
      html: '<div class="pulse-marker"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    })
  }).addTo(map);

  const circle = L.circle([20, 0], {
    radius: 180000,
    color: "#4bf7ff",
    weight: 1,
    fillColor: "#ff46e8",
    fillOpacity: 0.2
  }).addTo(map);

  mapState = { map, marker, circle };

  setTimeout(() => map.invalidateSize(), 200);
}

function updateLiveLocation(lat, lng, labelText) {
  if (!mapState) {
    return;
  }

  const location = [lat, lng];
  mapState.marker.setLatLng(location).bindPopup(labelText);
  mapState.circle.setLatLng(location);
  mapState.map.flyTo(location, 6, { duration: 1.8, easeLinearity: 0.3 });
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

function renderResultText(text) {
  typeInto(resultBox, text);
}

function typeInto(element, text, speed = 14) {
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

function unlockDashboard() {
  loginPage.classList.add("hidden");
  dashboard.classList.remove("hidden");
  dashboard.setAttribute("aria-hidden", "false");
  ensureVisualEngines().catch(() => {
    resultBox.textContent = "Error: failed to load map/globe engine.";
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
  resultBox.textContent = "No scan run yet.";
});

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = scanTarget.value.trim();
  const submitButton = scanForm.querySelector("button[type='submit']");

  if (!target) {
    renderResultText("Error: target is required.");
    return;
  }

  if (!authToken) {
    renderResultText("Error: session expired. Please login again.");
    lockDashboard();
    return;
  }

  submitButton.disabled = true;
  submitButton.classList.add("loading");
  resultBox.classList.add("scanning");
  const stopLoading = startDotsLoading(resultBox, "Scanning target");

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
      renderResultText("Error: unauthorized. Please login again.");
      return;
    }

    if (!response.ok) {
      finishLoading();
      renderResultText(`Error: ${parseErrorMessage(payload, "Query failed.")}`);
      return;
    }

    const resultCount = Number(payload?.resultCount ?? 0);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const lat = Number(payload?.location?.lat);
    const lng = Number(payload?.location?.lng);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      updateLiveLocation(lat, lng, `Target: ${target}`);
    }

    const preview = items.slice(0, 3).map((item, index) => `${index + 1}. ${JSON.stringify(item)}`);

    finishLoading();
    renderResultText([
      `Target: ${target}`,
      `Provider: ${payload?.provider || "LeakOSINT"}`,
      `Results: ${resultCount}`,
      Number.isFinite(lat) && Number.isFinite(lng) ? `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Location: not available",
      "",
      preview.length ? "Top Matches:" : "No matches returned.",
      ...preview,
      "",
      `Timestamp: ${new Date().toLocaleString()}`
    ].join("\n"));
  } catch {
    finishLoading();
    renderResultText("Error: unable to connect to backend.");
  }
});
