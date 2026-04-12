import crypto from "crypto";

// Simple token-based auth using Vercel KV (Redis).
// If KV isn't configured, falls back to in-memory (resets on cold start — dev only).
//
// To enable persistent storage:
// 1. Go to Vercel dashboard > Storage > Create KV Database
// 2. Connect it to this project
// 3. Env vars KV_REST_API_URL and KV_REST_API_TOKEN are auto-set

const AUTH_SECRET = process.env.AUTH_SECRET || "degens-mlb-v2-secret-change-me";

// ─── Simple KV helpers (uses Vercel KV REST API) ───
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  if (!KV_URL) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  if (!KV_URL) return false;
  try {
    await fetch(`${KV_URL}/set/${key}/${encodeURIComponent(JSON.stringify(value))}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Password hashing ───
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const { hash: check } = hashPassword(password, salt);
  return check === hash;
}

// ─── Token generation ───
function createToken(username) {
  const payload = { username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }; // 7 days
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const check = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  if (check !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── In-memory fallback (dev/testing only) ───
const memoryUsers = {};

async function getUser(username) {
  const kv = await kvGet(`user:${username}`);
  if (kv) return kv;
  return memoryUsers[username] || null;
}

async function setUser(username, userData) {
  const saved = await kvSet(`user:${username}`, userData);
  if (!saved) memoryUsers[username] = userData;
}

// ─── Handler ───
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: "Username must be 3-30 characters." });
  }

  const normalizedUser = username.toLowerCase().trim();

  if (action === "register") {
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = await getUser(normalizedUser);
    if (existing) {
      return res.status(409).json({ error: "Username already taken." });
    }

    const { salt, hash } = hashPassword(password);
    await setUser(normalizedUser, { username: normalizedUser, salt, hash, createdAt: new Date().toISOString() });

    return res.status(201).json({ message: "Account created." });
  }

  if (action === "login") {
    const user = await getUser(normalizedUser);
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    if (!verifyPassword(password, user.salt, user.hash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = createToken(normalizedUser);
    return res.status(200).json({ token, username: normalizedUser });
  }

  if (action === "verify") {
    const token = req.body.token;
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }
    return res.status(200).json({ valid: true, username: payload.username });
  }

  return res.status(400).json({ error: "Invalid action." });
}
