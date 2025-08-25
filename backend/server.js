// server.js — backend with local signup/login, social auth, users, posts with attachments (absolute URLs for localhost)
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import sanitize from "mongo-sanitize";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { request as undiciRequest } from "undici";
import bcrypt from "bcryptjs";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";

dotenv.config();

// --- Config ---
const PORT = process.env.PORT || 3001;
const MAX_DOCS = parseInt(process.env.MAX_DOCS || "500", 10);
const ALLOW_UNSAFE = (process.env.ALLOW_UNSAFE || "false") === "true";
const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || "";
const BCRYPT_ROUNDS = 10;

// 🔒 For local dev, hardcode absolute URLs to localhost
const PUBLIC_BASE_URL = `http://localhost:${PORT}`;

// --- Uploads (local filesystem) ---
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 5 } });

// --- JWT helpers ---
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing Authorization header" });
    const [type, token] = header.split(" ");
    if (type !== "Bearer" || !token) return res.status(401).json({ error: "Invalid Authorization header" });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    const users = req.app.locals.db.collection("users");
    let appUser = await users.findOne({ userId: decoded.userId, tenantId: decoded.tenantId });
    if (!appUser) {
      appUser = await upsertUser(req.app.locals.db, {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role || "member",
        provider: decoded.provider || "custom"
      });
    }
    req.appUser = appUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- Password helpers ---
async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(plain + PASSWORD_PEPPER, salt);
}
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain + PASSWORD_PEPPER, hash);
}
const signupSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  username: z.string().min(3).max(40),
  password: z.string().min(8),
  name: z.string().min(1).max(100)
});
const loginSchema = z.object({
  tenantId: z.string().min(1),
  emailOrUsername: z.string().min(3),
  password: z.string().min(8)
});

// --- Users helper ---
async function upsertUser(db, { userId, tenantId, email, name, role = "member", provider = "custom" }) {
  const users = db.collection("users");
  const now = new Date();
  const update = {
    $setOnInsert: { userId, tenantId, createdAt: now, role },
    $set: { email: email ?? null, name: name ?? null, updatedAt: now },
    $addToSet: { providers: provider }
  };
  await users.updateOne({ userId, tenantId }, update, { upsert: true });
  return users.findOne({ userId, tenantId });
}

// --- App bootstrap ---
async function start() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db(process.env.DB_NAME);

  const app = express();
  app.locals.db = db;

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(rateLimit({ windowMs: 15_000, max: 200 }));

  // Serve uploads publicly
  //app.use("/uploads", express.static(UPLOAD_DIR));
  // Geo index for posts (required for $geoNear / $near queries)
  await db.collection("posts").createIndex({ location: "2dsphere" });

  // ---------- Auth ----------
  app.post("/auth/signup", async (req, res) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, email, username, password, name } = parsed.data;
      const users = db.collection("users");
      const exists = await users.findOne({
        tenantId,
        $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
      });
      if (exists) return res.status(409).json({ error: "Email or username already in use" });
      const passwordHash = await hashPassword(password);
      const userId = `local:${tenantId}:${email.toLowerCase()}`;
      const now = new Date();
      const doc = {
        userId, tenantId,
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        name,
        role: "member",
        providers: ["local"],
        passwordHash,
        createdAt: now,
        updatedAt: now
      };
      await users.insertOne(doc);
      const token = signToken({ userId: doc.userId, tenantId: doc.tenantId, role: doc.role, email: doc.email, name: doc.name, provider: "local" });
      res.status(201).json({ token, user: { ...doc, passwordHash: undefined } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, emailOrUsername, password } = parsed.data;
      const users = db.collection("users");
      const query = { tenantId, $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername.toLowerCase() }] };
      const user = await users.findOne(query);
      if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });
      const token = signToken({ userId: user.userId, tenantId: user.tenantId, role: user.role, email: user.email, name: user.name, provider: "local" });
      const { passwordHash, ...safeUser } = user;
      res.json({ token, user: safeUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- Posts ----------
  app.post("/posts", requireAuth, upload.array("attachments", 5), async (req, res) => {
    try {
      const posts = db.collection("posts");
      const { title, content } = req.body;
  
      // parse optional location
      const lat = req.body.lat !== undefined ? parseFloat(req.body.lat) : undefined;
      const lng = req.body.lng !== undefined ? parseFloat(req.body.lng) : undefined;
      let location = undefined;
      if (
        typeof lat === "number" && !Number.isNaN(lat) &&
        typeof lng === "number" && !Number.isNaN(lng)
      ) {
        location = { type: "Point", coordinates: [lng, lat] }; // GeoJSON: [lng, lat]
      }
  
      const files = req.files || [];
      const attachments = files.map(f => {
        const name = path.basename(f.path);
        return {
          filename: f.originalname,
          path: `/uploads/${name}`,
          absoluteUrl: `${PUBLIC_BASE_URL}/uploads/${name}`,
          size: f.size,
          mimetype: f.mimetype
        };
      });
  
      const doc = {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        title,
        content,
        attachments,
        location,                 // ← stored if provided
        createdAt: new Date(),
        updatedAt: new Date()
      };
  
      const result = await posts.insertOne(doc);
      res.status(201).json({ ok: true, post: { ...doc, _id: result.insertedId } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  

  app.get("/posts", requireAuth, async (req, res) => {
    try {
      const posts = req.app.locals.db.collection("posts");
      const tenantId = req.user.tenantId;
  
      const lat = req.query.lat !== undefined ? parseFloat(req.query.lat) : undefined;
      const lng = req.query.lng !== undefined ? parseFloat(req.query.lng) : undefined;
      const radiusKm = req.query.radiusKm !== undefined ? parseFloat(req.query.radiusKm) : 10; // default 10 km
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  
      // If coords provided, use geo search (sorted by distance)
      if (
        typeof lat === "number" && !Number.isNaN(lat) &&
        typeof lng === "number" && !Number.isNaN(lng)
      ) {
        const pipeline = [
          {
            $geoNear: {
              near: { type: "Point", coordinates: [lng, lat] },
              distanceField: "distanceMeters",
              maxDistance: Math.max(0, radiusKm) * 1000,
              query: { tenantId, location: { $exists: true } },
              spherical: true
            }
          },
          { $sort: { distanceMeters: 1, createdAt: -1 } },
          { $limit: limit }
        ];
        const list = await posts.aggregate(pipeline).toArray();
        return res.json({ posts: list, meta: { mode: "geo", lat, lng, radiusKm } });
      }
  
      // Fallback: non-geo list
      const list = await posts
        .find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
  
      res.json({ posts: list, meta: { mode: "list" } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  

  // ---------- Me ----------
  app.get("/me", requireAuth, async (req, res) => {
    const user = req.appUser;
    res.json({
      user: {
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
        username: user.username,
        name: user.name,
        providers: user.providers || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  });

  app.patch("/me", requireAuth, async (req, res) => {
    const { name } = req.body || {};
    if (typeof name !== "string" || name.length < 1) {
      return res.status(400).json({ error: "invalid name" });
    }
    const users = req.app.locals.db.collection("users");
    await users.updateOne(
      { userId: req.appUser.userId, tenantId: req.appUser.tenantId },
      { $set: { name, updatedAt: new Date() } }
    );
    const doc = await users.findOne(
      { userId: req.appUser.userId, tenantId: req.appUser.tenantId },
      { projection: { passwordHash: 0 } }
    );
    res.json({ user: doc });
  });

// ✅ Private files — require Bearer token
app.get("/uploads/:name", requireAuth, (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.name || "");
    const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_"); // prevent traversal
    const filePath = path.join(UPLOAD_DIR, safe);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "file not found" });
    }

    // prevent caching of private files
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    if (req.query.download === "1") return res.download(filePath);
    return res.sendFile(filePath);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


  app.listen(PORT, () => console.log(`API running on ${PUBLIC_BASE_URL}`));
}

start().catch((e) => { console.error("Failed to start:", e); process.exit(1); });
