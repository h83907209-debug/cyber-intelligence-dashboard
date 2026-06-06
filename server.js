import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);

const {
  API_KEY,
  JWT_SECRET,
  ADMIN_USERNAME = "admin",
  ADMIN_PASSWORD = "1234",
  FRONTEND_ORIGIN = "*"
} = process.env;

if (!API_KEY) {
  throw new Error("Missing API_KEY in environment.");
}

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in environment.");
}

app.use(cors({ origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

const ALLOWED_TYPES = new Set(["json", "short", "html"]);

function validateLoginBody(body) {
  if (!body || typeof body !== "object") return "Invalid payload.";
  if (typeof body.username !== "string" || body.username.trim().length < 1) return "Username is required.";
  if (typeof body.password !== "string" || body.password.length < 1) return "Password is required.";
  return null;
}

function validateQueryBody(body) {
  if (!body || typeof body !== "object") return { error: "Invalid payload." };

  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (!request) return { error: "request is required." };
  if (request.length > 256) return { error: "request is too long (max 256 chars)." };

  const limit = body.limit === undefined ? 100 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 100 || limit > 10000) {
    return { error: "limit must be an integer between 100 and 10000." };
  }

  const lang = body.lang === undefined ? "en" : String(body.lang).trim().toLowerCase();
  if (!/^[a-z]{2,5}$/.test(lang)) {
    return { error: "lang must be 2-5 letters (example: en)." };
  }

  const type = body.type === undefined ? "json" : String(body.type).trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return { error: "type must be one of: json, short, html." };
  }

  return { value: { request, limit, lang, type } };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Missing bearer token." });
  }

  const token = header.slice(7).trim();

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token." });
  }
}

function cleanLeakOsintResponse(raw) {
  if (raw === null || raw === undefined) {
    return { resultCount: 0, items: [] };
  }

  if (Array.isArray(raw)) {
    return { resultCount: raw.length, items: raw.slice(0, 200) };
  }

  if (typeof raw === "object") {
    const possibleArrays = Object.values(raw).find((value) => Array.isArray(value));
    if (Array.isArray(possibleArrays)) {
      return { resultCount: possibleArrays.length, items: possibleArrays.slice(0, 200), meta: raw };
    }
    return { resultCount: 1, items: [raw] };
  }

  return { resultCount: 1, items: [{ value: String(raw) }] };
}

function tryParseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function findLatLngInObject(source, depth = 0) {
  if (!source || typeof source !== "object" || depth > 4) {
    return null;
  }

  const latKeys = ["lat", "latitude", "geo_lat", "y"];
  const lngKeys = ["lng", "lon", "long", "longitude", "geo_lon", "x"];

  let lat = null;
  let lng = null;

  for (const key of Object.keys(source)) {
    const lower = key.toLowerCase();
    if (lat === null && latKeys.includes(lower)) {
      lat = tryParseNumber(source[key]);
    }
    if (lng === null && lngKeys.includes(lower)) {
      lng = tryParseNumber(source[key]);
    }
  }

  if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return { lat, lng };
  }

  for (const value of Object.values(source)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const nested = findLatLngInObject(entry, depth + 1);
        if (nested) return nested;
      }
    } else if (value && typeof value === "object") {
      const nested = findLatLngInObject(value, depth + 1);
      if (nested) return nested;
    }
  }

  return null;
}

function fallbackLatLng(query) {
  let hash = 0;
  for (let i = 0; i < query.length; i += 1) {
    hash = (hash << 5) - hash + query.charCodeAt(i);
    hash |= 0;
  }

  const lat = ((Math.abs(hash) % 14000) / 100) - 70;
  const lng = ((Math.abs(hash * 7) % 34000) / 100) - 170;
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
}

app.get("/api/health", (_req, res) => {
  res.json({ success: true, service: "leakosint-backend", timestamp: new Date().toISOString() });
});

app.post("/api/login", (req, res) => {
  const validationError = validateLoginBody(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  const { username, password } = req.body;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: "Invalid credentials." });
  }

  const token = jwt.sign({ role: "admin", username }, JWT_SECRET, { expiresIn: "6h" });
  return res.json({ success: true, token });
});

app.post("/api/query", authMiddleware, async (req, res) => {
  const parsed = validateQueryBody(req.body);

  if (parsed.error) {
    return res.status(400).json({ success: false, error: parsed.error });
  }

  const payload = {
    token: API_KEY,
    request: parsed.value.request,
    limit: parsed.value.limit,
    lang: parsed.value.lang,
    type: parsed.value.type
  };

  try {
    const response = await fetch("https://leakosintapi.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const contentType = response.headers.get("content-type") || "";
    const upstreamBody = contentType.includes("application/json")
      ? await response.json()
      : { raw: await response.text() };

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "External API request failed.",
        status: response.status,
        details: upstreamBody
      });
    }

    const cleaned = cleanLeakOsintResponse(upstreamBody);
    const detectedLocation = findLatLngInObject(upstreamBody) || findLatLngInObject(cleaned.items[0]) || fallbackLatLng(parsed.value.request);
    return res.json({
      success: true,
      provider: "LeakOSINT",
      query: parsed.value.request,
      resultCount: cleaned.resultCount,
      items: cleaned.items,
      location: detectedLocation
    });
  } catch {
    return res.status(500).json({ success: false, error: "Unable to reach external API." });
  }
});

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
