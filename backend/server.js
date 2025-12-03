// server.js — Community Microhelp backend (all-in-one)
//
// Features:
// - Auth: local signup/login with JWT
// - Private uploads (auth required to fetch)
// - Posts: create/list (geo radius support), single get
// - Attachments with absolute URLs
// - Comments, Likes, Shares, Favorites
// - Groups (+ membership), Events (+ RSVPs), Invitations (token-based)
// - Chat (DMs / small group) with read/unread
//
// Env (.env):
// PORT=3001
// MONGO_URL=mongodb://localhost:27017
// DB_NAME=community
// JWT_SECRET=supersecret_dev_key
// ALLOW_UNSAFE=true
// PASSWORD_PEPPER=
// MAX_DOCS=500
// DEFAULT_TENANT_ID=t123
// VERBOSE_LOGGING=true
// LOG_LEVEL=debug
// GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
// FACEBOOK_APP_ID=123456789012345
// FACEBOOK_APP_SECRET=replace_with_facebook_secret
//
// Run: node server.js

import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { fetch } from "undici";
import { logger, VERBOSE_LOGGING } from "./logger.js";

dotenv.config();

// ---------- Config ----------
const PORT = parseInt(process.env.PORT || "3001", 10);
const MAX_DOCS = parseInt(process.env.MAX_DOCS || "500", 10);
const ALLOW_UNSAFE = (process.env.ALLOW_UNSAFE || "false") === "true";
const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || "";
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "t123";

const GOOGLE_CLIENT_ID_PLACEHOLDER = "your_google_client_id.apps.googleusercontent.com";
const FACEBOOK_APP_ID_PLACEHOLDER = "123456789012345";

const hasRealValue = (value, placeholder) =>
  typeof value === "string" && value.trim().length > 0 && (placeholder ? value !== placeholder : true);

const GOOGLE_CLIENT_ID = hasRealValue(process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_ID_PLACEHOLDER)
  ? process.env.GOOGLE_CLIENT_ID
  : "";
const FACEBOOK_APP_ID = hasRealValue(process.env.FACEBOOK_APP_ID, FACEBOOK_APP_ID_PLACEHOLDER)
  ? process.env.FACEBOOK_APP_ID
  : "";
const FACEBOOK_APP_SECRET = hasRealValue(process.env.FACEBOOK_APP_SECRET)
  ? process.env.FACEBOOK_APP_SECRET
  : "";
const IS_DEV_MODE = ALLOW_UNSAFE || process.env.NODE_ENV !== "production";

const googleOAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const facebookAppToken = FACEBOOK_APP_ID && FACEBOOK_APP_SECRET
  ? `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`
  : null;
const BCRYPT_ROUNDS = 10;

// absolute base URL for local dev
const PUBLIC_BASE_URL = `http://localhost:${PORT}`;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30; // 30 minutes
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function logError(err, priority = "P2") {
  const message = err && err.message ? err.message : String(err);
  logger.error(priority === "P1" ? `P1: ${message}` : message, {
    priority,
    stack: err && err.stack ? err.stack : undefined,
  });
}

process.on("uncaughtException", (err) => logError(err, "P1"));
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logError(err, "P1");
});

// ---------- Files / Uploads (private) ----------
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10MB each, up to 5 files
});

// ---------- Helpers ----------
function oid(id) { try { return new ObjectId(id); } catch { return null; } }

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(plain + PASSWORD_PEPPER, salt);
}
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain + PASSWORD_PEPPER, hash);
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    const tokenFromQuery = typeof req.query.token === "string" ? req.query.token : null;
    const raw = header || (tokenFromQuery ? `Bearer ${tokenFromQuery}` : null);
    if (!raw) return res.status(401).json({ error: "Missing Authorization header" });
    const [type, token] = raw.split(" ");
    if (type !== "Bearer" || !token) return res.status(401).json({ error: "Invalid Authorization header" });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    const users = req.app.locals.db.collection("users");
    const appUser = await users.findOne({ userId: decoded.userId, tenantId: decoded.tenantId });
    if (!appUser) return res.status(401).json({ error: "user not found" });
    req.appUser = appUser;
    next();
  } catch (e) {
    logError(e);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

const signupSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  username: z.string().min(3).max(40),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  tenantId: z.string().min(1),
  emailOrUsername: z.string().min(3),
  password: z.string().min(8),
});

const requestResetSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
});

const confirmResetSchema = z.object({
  tenantId: z.string().min(1),
  token: z.string().min(10),
  password: z.string().min(8),
});

const resendVerificationSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
});

const confirmEmailSchema = z.object({
  tenantId: z.string().min(1),
  token: z.string().min(10),
});

function randomToken(n = 40) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const result = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (["password", "token", "authorization", "auth"].includes(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitize(value);
    }
  }
  return result;
}

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSimplePage({ title, message, success }) {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #111827; }
        body { margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1); max-width: 420px; }
        h1 { font-size: 24px; margin-bottom: 16px; }
        p { line-height: 1.5; }
        .status { font-weight: 600; color: ${success ? "#059669" : "#b91c1c"}; }
        form { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
        input[type="password"] { padding: 12px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 16px; }
        button { padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; background: #2563eb; color: white; cursor: pointer; }
        button:disabled { background: #9ca3af; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <main class="card">
        <h1>${escapeHtml(title)}</h1>
        <p class="status">${escapeHtml(message)}</p>
      </main>
    </body>
  </html>`;
}

function renderPasswordResetPage({ token, error, success }) {
  const title = success ? "Password updated" : "Reset your password";
  const statusMsg = success
    ? "Your password has been updated. You can now return to the app and sign in with the new password."
    : "Enter your new password below. This reset link expires shortly, so complete the process now.";
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #111827; }
        body { margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1); max-width: 440px; width: 100%; }
        h1 { font-size: 24px; margin-bottom: 16px; }
        p { line-height: 1.5; }
        .status { font-weight: 600; color: ${success ? "#059669" : "#111827"}; margin-bottom: 12px; }
        .error { color: #b91c1c; font-weight: 600; margin-bottom: 12px; }
        form { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
        input[type="password"] { padding: 12px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 16px; }
        button { padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; background: #2563eb; color: white; cursor: pointer; }
        button:disabled { background: #9ca3af; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <main class="card">
        <h1>${escapeHtml(title)}</h1>
        <p class="status">${escapeHtml(statusMsg)}</p>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
        ${success
          ? "<p>It is now safe to close this tab.</p>"
          : `<form method="POST">
              <label>
                <span>New password</span>
                <input type="password" name="password" placeholder="At least 8 characters" required minlength="8" />
              </label>
              <button type="submit">Update password</button>
            </form>`}
      </main>
    </body>
  </html>`;
}

function badRequestError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// ---------- App bootstrap ----------
async function start() {
  // Allow the server to start even if environment variables are not provided.
  // This mirrors the defaults documented at the top of the file and prevents
  // the backend from crashing with "Cannot read properties of undefined" when
  // `MONGO_URL` or `DB_NAME` are missing.  Using sensible defaults makes local
  // development (and CI) work out of the box.
  const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
  const DB_NAME = process.env.DB_NAME || "community";

  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);

  // Users
  await db.collection("users").createIndexes([
    { key: { userId: 1, tenantId: 1 }, unique: true },
    { key: { tenantId: 1, email: 1 }, unique: true, sparse: true },
    { key: { tenantId: 1, username: 1 }, unique: true, sparse: true },
  ]);

  // Posts & geo
  await db.collection("posts").createIndexes([
    { key: { tenantId: 1, createdAt: -1 } },
    { key: { tenantId: 1, userId: 1, createdAt: -1 } },
    { key: { location: "2dsphere" } }, // for $geoNear
  ]);

  // Comments / Likes / Shares / Favorites
  await db.collection("comments").createIndexes([
    { key: { tenantId: 1, postId: 1, createdAt: -1 } },
    { key: { tenantId: 1, userId: 1, createdAt: -1 } },
  ]);
  await db.collection("likes").createIndexes([
    { key: { tenantId: 1, postId: 1, userId: 1 }, unique: true },
    { key: { tenantId: 1, postId: 1, createdAt: -1 } },
  ]);
  await db.collection("shares").createIndexes([
    { key: { tenantId: 1, postId: 1, userId: 1, createdAt: -1 } },
  ]);
  await db.collection("favorites").createIndexes([
    { key: { tenantId: 1, postId: 1, userId: 1 }, unique: true },
    { key: { tenantId: 1, userId: 1, createdAt: -1 } },
  ]);

  // Password reset tokens (TTL on expiresAt cleans up automatically)
  await db.collection("passwordResets").createIndexes([
    { key: { tenantId: 1, token: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);

  await db.collection("emailVerifications").createIndexes([
    { key: { tenantId: 1, token: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);

  // Groups & membership
  await db.collection("groups").createIndexes([
    { key: { tenantId: 1, slug: 1 }, unique: true },
    { key: { tenantId: 1, createdAt: -1 } },
  ]);
  await db.collection("groupMembers").createIndexes([
    { key: { tenantId: 1, groupId: 1, userId: 1 }, unique: true },
    { key: { tenantId: 1, userId: 1, createdAt: -1 } },
  ]);

  // Events & RSVPs
  await db.collection("events").createIndexes([
    { key: { tenantId: 1, startsAt: 1 } },
    { key: { tenantId: 1, groupId: 1, startsAt: 1 } },
  ]);
  await db.collection("eventRsvps").createIndexes([
    { key: { tenantId: 1, eventId: 1, userId: 1 }, unique: true },
    { key: { tenantId: 1, eventId: 1, createdAt: -1 } },
  ]);

  // Invitations
  await db.collection("invitations").createIndexes([
    { key: { tenantId: 1, token: 1 }, unique: true },
    { key: { tenantId: 1, email: 1, createdAt: -1 } },
  ]);

  // Chat
  await db.collection("chats").createIndexes([
    { key: { tenantId: 1, isGroup: 1, createdAt: -1 } },
    { key: { tenantId: 1, participantIds: 1 } },
  ]);
  await db.collection("messages").createIndexes([
    { key: { tenantId: 1, chatId: 1, createdAt: -1 } },
    { key: { tenantId: 1, chatId: 1, senderId: 1, createdAt: -1 } },
  ]);
  await db.collection("messageReads").createIndexes([
    { key: { tenantId: 1, chatId: 1, userId: 1 }, unique: true },
  ]);

  const app = express();
  app.locals.db = db;

  async function verifyEmailToken({ token, tenantId }) {
    const emailVerifications = db.collection("emailVerifications");
    const users = db.collection("users");

    const query = tenantId ? { tenantId, token } : { token };
    const record = await emailVerifications.findOne(query);
    if (!record || record.usedAt) {
      throw badRequestError("Invalid or expired verification link");
    }
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw badRequestError("Invalid or expired verification link");
    }

    const user = await users.findOne({ tenantId: record.tenantId, userId: record.userId });
    if (!user) throw badRequestError("Account not found");

    const now = new Date();
    await users.updateOne(
      { _id: user._id },
      { $set: { emailVerified: true, emailVerifiedAt: now, updatedAt: now } }
    );
    await emailVerifications.updateOne({ _id: record._id }, { $set: { usedAt: now } });
    await emailVerifications.deleteMany({ tenantId: record.tenantId, userId: record.userId, usedAt: null, token: { $ne: record.token } });

    return { email: record.email, tenantId: record.tenantId };
  }

  async function applyPasswordReset({ token, password, tenantId }) {
    const passwordResets = db.collection("passwordResets");
    const users = db.collection("users");

    const normalizedToken = (token || "").trim();
    if (!normalizedToken) {
      throw badRequestError("Invalid or expired reset token");
    }

    const normalizedTenantId = typeof tenantId === "string" ? tenantId.trim() : tenantId;
    const query = normalizedTenantId
      ? { token: normalizedToken, tenantId: normalizedTenantId }
      : { token: normalizedToken };
    const reset = await passwordResets.findOne(query);
    if (!reset || reset.usedAt) {
      throw badRequestError("Invalid or expired reset token");
    }
    if (reset.expiresAt && reset.expiresAt < new Date()) {
      throw badRequestError("Invalid or expired reset token");
    }

    const user = await users.findOne({ tenantId: reset.tenantId, email: reset.email });
    if (!user) {
      throw badRequestError("User not found");
    }

    const passwordHash = await hashPassword(password);
    await users.updateOne({ _id: user._id }, { $set: { passwordHash, updatedAt: new Date() } });
    await passwordResets.updateOne({ _id: reset._id }, { $set: { usedAt: new Date() } });

    return { email: reset.email, tenantId: reset.tenantId };
  }

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const start = Date.now();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      res.locals.body = body;
      return originalSend(body);
    };
    res.on("finish", () => {
      const meta = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
      };
      if (VERBOSE_LOGGING) {
        meta.request = {
          headers: sanitize(req.headers),
          query: sanitize(req.query),
          body: sanitize(req.body),
        };
        let respBody = res.locals.body;
        if (typeof respBody === "object") respBody = sanitize(respBody);
        meta.response = respBody;
      }
      logger.info(`HTTP ${req.method} ${req.originalUrl}`, meta);
    });
    next();
  });
  app.use(rateLimit({ windowMs: 15_000, max: 200 }));

  // ---------- Auth ----------
  app.post("/auth/signup", async (req, res) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, email, username, password, name } = parsed.data;

      const users = db.collection("users");
      const emailVerifications = db.collection("emailVerifications");
      const normalizedEmail = email.toLowerCase();
      const normalizedUsername = username.toLowerCase();

      const exists = await users.findOne({
        tenantId,
        $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
      });
      if (exists) return res.status(409).json({ error: "Email or username already in use" });

      const passwordHash = await hashPassword(password);
      const userId = `local:${tenantId}:${normalizedEmail}`;
      const now = new Date();
      const doc = {
        userId,
        tenantId,
        email: normalizedEmail,
        username: normalizedUsername,
        name,
        role: "member",
        providers: ["local"],
        passwordHash,
        emailVerified: false,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await users.insertOne(doc);

      await emailVerifications.deleteMany({ tenantId, userId, usedAt: null });
      const verificationToken = randomToken(48);
      const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
      await emailVerifications.insertOne({
        tenantId,
        userId,
        email: normalizedEmail,
        token: verificationToken,
        createdAt: now,
        expiresAt,
        usedAt: null,
      });

      const verificationLink = `${PUBLIC_BASE_URL}/email-verification/${verificationToken}`;
      const response = {
        success: true,
        requiresEmailVerification: true,
        message: "Account created. Please verify your email before logging in.",
      };
      if (ALLOW_UNSAFE) {
        response.debug = { verificationToken, verificationLink };
      }
      res.status(201).json(response);
    } catch (e) {
      logError(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, emailOrUsername, password } = parsed.data;

      const users = db.collection("users");
      const query = {
        tenantId,
        $or: [
          { email: emailOrUsername.toLowerCase() },
          { username: emailOrUsername.toLowerCase() },
        ],
      };
      const user = await users.findOne(query);
      if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      if (user.emailVerified === false) {
        return res.status(403).json({ error: "Email verification required", code: "EMAIL_NOT_VERIFIED" });
      }

      const token = signToken({
        userId: user.userId, tenantId: user.tenantId, role: user.role, email: user.email, name: user.name,
      });
      const { passwordHash, ...safeUser } = user;
      res.json({ token, user: safeUser });
    } catch (e) {
      logError(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/auth/email-verification/resend", async (req, res) => {
    try {
      const parsed = resendVerificationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, email } = parsed.data;
      const normalizedEmail = email.toLowerCase();

      const users = db.collection("users");
      const emailVerifications = db.collection("emailVerifications");
      const user = await users.findOne({ tenantId, email: normalizedEmail });
      if (!user || user.emailVerified === true) {
        return res.json({ success: true });
      }

      await emailVerifications.deleteMany({ tenantId, userId: user.userId, usedAt: null });
      const token = randomToken(48);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
      await emailVerifications.insertOne({
        tenantId,
        userId: user.userId,
        email: normalizedEmail,
        token,
        createdAt: now,
        expiresAt,
        usedAt: null,
      });

      const verificationLink = `${PUBLIC_BASE_URL}/email-verification/${token}`;
      const response = { success: true };
      if (ALLOW_UNSAFE) response.debug = { verificationToken: token, verificationLink };
      res.json(response);
    } catch (e) {
      logError(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/auth/email-verification/confirm", async (req, res) => {
    try {
      const parsed = confirmEmailSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, token } = parsed.data;
      await verifyEmailToken({ tenantId, token });
      res.json({ success: true });
    } catch (e) {
      logError(e);
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.get("/email-verification/:token", async (req, res) => {
    const token = (req.params.token || "").trim();
    if (!token) {
      return res.status(400).send(renderSimplePage({ title: "Verification failed", message: "Missing verification token.", success: false }));
    }
    try {
      await verifyEmailToken({ token });
      return res.send(renderSimplePage({ title: "Email verified", message: "Thanks! You can now return to the app and log in.", success: true }));
    } catch (e) {
      logError(e);
      const status = e.status || 500;
      const message = status === 400 ? e.message : "Unable to verify email right now. Please try again.";
      return res.status(status).send(renderSimplePage({ title: "Verification failed", message, success: false }));
    }
  });

  app.post("/auth/password-reset/request", async (req, res) => {
    try {
      const parsed = requestResetSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, email } = parsed.data;
      const normalizedEmail = email.toLowerCase();

      const users = db.collection("users");
      const user = await users.findOne({ tenantId, email: normalizedEmail });

      // always pretend success to avoid leaking which emails exist
      if (!user) return res.json({ success: true, message: "If an account exists, you'll receive an email with the reset link." });

      const passwordResets = db.collection("passwordResets");
      await passwordResets.deleteMany({ tenantId, email: normalizedEmail, usedAt: null });

      const token = randomToken(48);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
      await passwordResets.insertOne({
        tenantId,
        email: normalizedEmail,
        token,
        userId: user.userId,
        createdAt: now,
        expiresAt,
        usedAt: null,
      });

      const resetUrl = `${PUBLIC_BASE_URL}/password-reset/${token}`;
      const response = { success: true, message: "If an account exists, you'll receive an email with the reset link." };
      if (IS_DEV_MODE) response.token = token;
      if (IS_DEV_MODE) response.resetUrl = resetUrl;
      res.json(response);
    } catch (e) {
      logError(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/auth/password-reset/confirm", async (req, res) => {
    try {
      const parsed = confirmResetSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const { tenantId, token, password } = parsed.data;
      await applyPasswordReset({ token, password, tenantId });
      res.json({ success: true });
    } catch (e) {
      logError(e);
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.get("/password-reset/:token", async (req, res) => {
    try {
      const token = (req.params.token || "").trim();
      if (!token) {
        return res.status(400).send(renderPasswordResetPage({ token, error: "Missing reset token", success: false }));
      }
      const passwordResets = db.collection("passwordResets");
      const reset = await passwordResets.findOne({ token });
      if (!reset || reset.usedAt) {
        return res.status(400).send(renderPasswordResetPage({ token, error: "This reset link is no longer valid.", success: false }));
      }
      if (reset.expiresAt && reset.expiresAt < new Date()) {
        return res.status(400).send(renderPasswordResetPage({ token, error: "This reset link has expired.", success: false }));
      }
      return res.send(renderPasswordResetPage({ token, error: null, success: false }));
    } catch (e) {
      logError(e);
      return res.status(500).send(renderPasswordResetPage({ token: req.params.token, error: "Unexpected error. Please try again.", success: false }));
    }
  });

  app.post("/password-reset/:token", async (req, res) => {
    const token = (req.params.token || "").trim();
    const password = (req.body?.password || "").toString();
    if (!token) {
      return res.status(400).send(renderPasswordResetPage({ token, error: "Missing reset token", success: false }));
    }
    if (!password || password.length < 8) {
      return res.status(400).send(renderPasswordResetPage({ token, error: "Password must be at least 8 characters.", success: false }));
    }
    try {
      await applyPasswordReset({ token, password });
      return res.send(renderPasswordResetPage({ token, error: null, success: true }));
    } catch (e) {
      logError(e);
      const status = e.status || 500;
      const message = status === 400 ? e.message : "Unable to update password. Please try again.";
      return res.status(status).send(renderPasswordResetPage({ token, error: message, success: false }));
    }
  });

  // ---------- Me ----------
  app.get("/me", requireAuth, async (req, res) => {
    const u = req.appUser;
    res.json({
      user: {
        userId: u.userId,
        tenantId: u.tenantId,
        role: u.role,
        email: u.email,
        username: u.username,
        name: u.name,
        providers: u.providers || [],
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
    });
  });

  app.patch("/me", requireAuth, async (req, res) => {
    const { name } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ error: "invalid name" });
    }
    const users = db.collection("users");
    await users.updateOne(
      { userId: req.appUser.userId, tenantId: req.appUser.tenantId },
      { $set: { name: name.trim(), updatedAt: new Date() } }
    );
    const doc = await users.findOne(
      { userId: req.appUser.userId, tenantId: req.appUser.tenantId },
      { projection: { passwordHash: 0 } }
    );
    res.json({ user: doc });
  });

  // (DEV) change my role quickly
  app.patch("/me/role", requireAuth, async (req, res) => {
    if (!ALLOW_UNSAFE) return res.status(403).json({ error: "disabled in this env" });
    const { role } = req.body || {};
    if (!["admin", "moderator", "member"].includes(role)) {
      return res.status(400).json({ error: "role must be admin|moderator|member" });
    }
    const users = db.collection("users");
    await users.updateOne(
      { userId: req.appUser.userId, tenantId: req.appUser.tenantId },
      { $set: { role, updatedAt: new Date() } }
    );
    const doc = await users.findOne(
      { userId: req.appUser.userId, tenantId: req.appUser.tenantId },
      { projection: { passwordHash: 0 } }
    );
    res.json({ user: doc });
  });

  // ---------- Private file fetch ----------
  // (No express.static for /uploads — keep files private)
  app.get("/uploads/:name", requireAuth, (req, res) => {
    try {
      const raw = decodeURIComponent(req.params.name || "");
      const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(UPLOAD_DIR, safe);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file not found" });
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      if (req.query.download === "1") return res.download(filePath);
      return res.sendFile(filePath);
    } catch (e) {
      logError(e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ---------- Posts (create, list w/ geo, single) ----------
  app.post("/posts", requireAuth, upload.array("attachments", 5), async (req, res) => {
    try {
      const posts = db.collection("posts");
      const { title, content, category } = req.body;

      // optional geo
      const lat = req.body.lat !== undefined ? parseFloat(req.body.lat) : undefined;
      const lng = req.body.lng !== undefined ? parseFloat(req.body.lng) : undefined;
      let location = undefined;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        location = { type: "Point", coordinates: [lng, lat] }; // [lng, lat]
      }

      const files = req.files || [];
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;

      const attachments = files.map(f => {
        const name = path.basename(f.path);
        return {
          filename: f.originalname,
          path: `/uploads/${name}`,
          absoluteUrl: `${baseUrl}/uploads/${name}`,
          size: f.size,
          mimetype: f.mimetype,
        };
      });

      const doc = {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        title,
        content,
        category: category || "General",
        attachments,
        location,
        commentsCount: 0,
        likesCount: 0,
        sharesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const r = await posts.insertOne(doc);
      res.status(201).json({ ok: true, post: { ...doc, _id: r.insertedId } });
    } catch (e) {
      logError(e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /posts?lat=&lng=&radiusKm=&limit=&q=&category=
  app.get("/posts", requireAuth, async (req, res) => {
    try {
      const posts = db.collection("posts");
      const tenantId = req.user.tenantId;

      const lat = req.query.lat !== undefined ? parseFloat(req.query.lat) : undefined;
      const lng = req.query.lng !== undefined ? parseFloat(req.query.lng) : undefined;
      const radiusKm = req.query.radiusKm !== undefined ? parseFloat(req.query.radiusKm) : 10;
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
      const category = typeof req.query.category === "string" ? req.query.category.trim() : undefined;

      const baseMatch = { tenantId };
      if (category) baseMatch.category = category;
      if (q) {
        const re = new RegExp(q, "i");
        baseMatch.$or = [{ title: re }, { content: re }];
      }

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const pipeline = [
          {
            $geoNear: {
              near: { type: "Point", coordinates: [lng, lat] },
              distanceField: "distanceMeters",
              maxDistance: Math.max(0, radiusKm) * 1000,
              query: { ...baseMatch, location: { $exists: true } },
              spherical: true,
            }
          },
          { $sort: { distanceMeters: 1, createdAt: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: "likes",
              let: { pid: "$_id", t: "$tenantId", me: req.user.userId },
              pipeline: [
                { $match: { $expr: { $and: [
                  { $eq: ["$tenantId", "$$t"] },
                  { $eq: ["$postId", "$$pid"] },
                  { $eq: ["$userId", "$$me"] },
                ] } } },
                { $limit: 1 }
              ],
              as: "myLike",
            }
          },
          { $addFields: { likedByMe: { $gt: [{ $size: "$myLike" }, 0] } } },
          { $project: { myLike: 0 } }
        ];
        const list = await posts.aggregate(pipeline).toArray();
        return res.json({ posts: list, meta: { mode: "geo", lat, lng, radiusKm } });
      }

      const list = await posts.aggregate([
        { $match: baseMatch },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: "likes",
            let: { pid: "$_id", t: "$tenantId", me: req.user.userId },
            pipeline: [
              { $match: { $expr: { $and: [
                { $eq: ["$tenantId", "$$t"] },
                { $eq: ["$postId", "$$pid"] },
                { $eq: ["$userId", "$$me"] },
              ] } } },
              { $limit: 1 }
            ],
            as: "myLike",
          }
        },
        { $addFields: { likedByMe: { $gt: [{ $size: "$myLike" }, 0] } } },
        { $project: { myLike: 0 } }
      ]).toArray();

      res.json({ posts: list, meta: { mode: "list" } });
    } catch (e) {
      logError(e);
      res.status(500).json({ error: e.message });
    }
  });


  // single post + first page comments
  app.get("/posts/:id", requireAuth, async (req, res) => {
    const posts = db.collection("posts");
    const comments = db.collection("comments");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });

    const post = await posts.findOne({ _id: postId, tenantId: req.user.tenantId });
    if (!post) return res.status(404).json({ error: "not found" });

    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);
    const list = await comments.find({ tenantId: req.user.tenantId, postId })
      .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();

    res.json({ post, comments: list, page: { skip, limit } });
  });

  // ---------- Comments ----------
  app.post("/posts/:id/comments", requireAuth, async (req, res) => {
    const comments = db.collection("comments");
    const posts = db.collection("posts");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });

    const text = (req.body?.text || "").toString().trim();
    if (!text) return res.status(400).json({ error: "text required" });

    const now = new Date();
    const c = { tenantId: req.user.tenantId, postId, userId: req.user.userId, text, createdAt: now, updatedAt: now };
    const r = await comments.insertOne(c);
    await posts.updateOne({ _id: postId, tenantId: req.user.tenantId }, { $inc: { commentsCount: 1 }, $set: { updatedAt: now } });
    res.status(201).json({ comment: { ...c, _id: r.insertedId } });
  });

  app.get("/posts/:id/comments", requireAuth, async (req, res) => {
    const comments = db.collection("comments");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });

    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);

    const list = await comments.find({ tenantId: req.user.tenantId, postId })
      .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
    res.json({ comments: list, page: { skip, limit } });
  });

  app.delete("/posts/:id/comments/:commentId", requireAuth, async (req, res) => {
    const comments = db.collection("comments");
    const posts = db.collection("posts");
    const postId = oid(req.params.id);
    const commentId = oid(req.params.commentId);
    if (!postId || !commentId) return res.status(400).json({ error: "invalid id" });

    const c = await comments.findOne({ _id: commentId, postId, tenantId: req.user.tenantId });
    if (!c) return res.status(404).json({ error: "not found" });

    const isOwner = c.userId === req.user.userId;
    const isAdmin = req.appUser?.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ error: "forbidden" });

    await comments.deleteOne({ _id: commentId, tenantId: req.user.tenantId });
    await posts.updateOne({ _id: postId, tenantId: req.user.tenantId }, { $inc: { commentsCount: -1 }, $set: { updatedAt: new Date() } });
    res.json({ ok: true });
  });

  // ---------- Likes ----------
  app.post("/posts/:id/like", requireAuth, async (req, res) => {
    const likes = db.collection("likes");
    const posts = db.collection("posts");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });

    const doc = { tenantId: req.user.tenantId, postId, userId: req.user.userId, createdAt: new Date() };
    try {
      await likes.insertOne(doc);
      await posts.updateOne({ _id: postId, tenantId: req.user.tenantId }, { $inc: { likesCount: 1 }, $set: { updatedAt: new Date() } });
      res.status(201).json({ liked: true });
    } catch (e) {
      logError(e);
      if (e?.code === 11000) return res.status(200).json({ liked: true });
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/posts/:id/like", requireAuth, async (req, res) => {
    const likes = db.collection("likes");
    const posts = db.collection("posts");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });

    const r = await likes.deleteOne({ tenantId: req.user.tenantId, postId, userId: req.user.userId });
    if (r.deletedCount > 0) {
      await posts.updateOne({ _id: postId, tenantId: req.user.tenantId }, { $inc: { likesCount: -1 }, $set: { updatedAt: new Date() } });
    }
    res.json({ liked: false });
  });

  // ---------- Shares ----------
  app.post("/posts/:id/share", requireAuth, async (req, res) => {
    const posts = db.collection("posts");
    const shares = db.collection("shares");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });

    const now = new Date();
    await shares.insertOne({
      tenantId: req.user.tenantId, postId, userId: req.user.userId,
      target: (req.body?.target || "link").toString(), createdAt: now
    });
    await posts.updateOne({ _id: postId, tenantId: req.user.tenantId }, { $inc: { sharesCount: 1 }, $set: { updatedAt: now } });
    res.status(201).json({ shared: true });
  });

  // ---------- Favorites (bookmark) ----------
  app.post("/posts/:id/favorite", requireAuth, async (req, res) => {
    const favorites = db.collection("favorites");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });

    try {
      await favorites.insertOne({ tenantId: req.user.tenantId, postId, userId: req.user.userId, createdAt: new Date() });
      res.status(201).json({ favorited: true });
    } catch (e) {
      logError(e);
      if (e?.code === 11000) return res.status(200).json({ favorited: true });
      res.status(500).json({ error: e.message });
    }
  });
  app.delete("/posts/:id/favorite", requireAuth, async (req, res) => {
    const favorites = db.collection("favorites");
    const postId = oid(req.params.id);
    if (!postId) return res.status(400).json({ error: "invalid id" });
    await favorites.deleteOne({ tenantId: req.user.tenantId, postId, userId: req.user.userId });
    res.json({ favorited: false });
  });

  // ---------- Groups ----------
  app.post("/groups", requireAuth, async (req, res) => {
    const groups = db.collection("groups");
    const members = db.collection("groupMembers");
    const { name, slug, description } = req.body || {};
    if (!name || !slug) return res.status(400).json({ error: "name and slug required" });

    const now = new Date();
    const g = {
      tenantId: req.user.tenantId,
      name,
      slug: slug.toLowerCase(),
      description: description || "",
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now,
    };
    const r = await groups.insertOne(g);
    await members.insertOne({ tenantId: req.user.tenantId, groupId: r.insertedId, userId: req.user.userId, role: "owner", createdAt: now });
    res.status(201).json({ group: { ...g, _id: r.insertedId } });
  });

  app.get("/groups", requireAuth, async (req, res) => {
    const groups = db.collection("groups");
    const list = await groups.find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 }).toArray();
    res.json({ groups: list });
  });

  app.post("/groups/:id/join", requireAuth, async (req, res) => {
    const members = db.collection("groupMembers");
    const groupId = oid(req.params.id);
    if (!groupId) return res.status(400).json({ error: "invalid id" });
    try {
      await members.insertOne({ tenantId: req.user.tenantId, groupId, userId: req.user.userId, role: "member", createdAt: new Date() });
      res.status(201).json({ joined: true });
    } catch (e) {
      logError(e);
      if (e?.code === 11000) return res.status(200).json({ joined: true });
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/groups/:id/members", requireAuth, async (req, res) => {
    const members = db.collection("groupMembers");
    const groupId = oid(req.params.id);
    if (!groupId) return res.status(400).json({ error: "invalid id" });
    const list = await members.find({ tenantId: req.user.tenantId, groupId }).toArray();
    res.json({ members: list });
  });

  // ---------- Events ----------
  app.post("/events", requireAuth, async (req, res) => {
    const events = db.collection("events");
    const { title, description, startsAt, endsAt, groupId } = req.body || {};
    if (!title || !startsAt) return res.status(400).json({ error: "title and startsAt required" });

    const doc = {
      tenantId: req.user.tenantId,
      title,
      description: description || "",
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      groupId: groupId ? oid(groupId) : null,
      createdBy: req.user.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const r = await events.insertOne(doc);
    res.status(201).json({ event: { ...doc, _id: r.insertedId } });
  });

  app.get("/events", requireAuth, async (req, res) => {
    const events = db.collection("events");
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 7 * 864e5);
    const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 30 * 864e5);
    const list = await events.find({
      tenantId: req.user.tenantId,
      startsAt: { $gte: from, $lte: to },
    }).sort({ startsAt: 1 }).toArray();
    res.json({ events: list });
  });

  // RSVP: going|maybe|declined
  app.post("/events/:id/rsvp", requireAuth, async (req, res) => {
    const rsvps = db.collection("eventRsvps");
    const events = db.collection("events");
    const eventId = oid(req.params.id);
    if (!eventId) return res.status(400).json({ error: "invalid id" });

    const status = (req.body?.status || "going").toString();
    if (!["going", "maybe", "declined"].includes(status)) return res.status(400).json({ error: "invalid status" });

    const now = new Date();
    await rsvps.updateOne(
      { tenantId: req.user.tenantId, eventId, userId: req.user.userId },
      { $set: { status, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    const ev = await events.findOne({ _id: eventId, tenantId: req.user.tenantId });
    res.json({ ok: true, eventId, status, eventTitle: ev?.title });
  });

  // ---------- Invitations ----------
  // Create invite (admin/moderator)
  app.post("/invitations", requireAuth, async (req, res) => {
    if (!["admin", "moderator"].includes(req.appUser.role)) return res.status(403).json({ error: "forbidden" });
    const invites = db.collection("invitations");
    const email = (req.body?.email || "").toLowerCase();
    if (!email) return res.status(400).json({ error: "email required" });
    const token = randomToken(40);
    const doc = { tenantId: req.user.tenantId, email, token, createdBy: req.user.userId, createdAt: new Date(), usedAt: null };
    await invites.insertOne(doc);
    res.status(201).json({ invitation: { email, token } });
  });

  // Accept invite (bind this to your UI flow)
  app.post("/invitations/accept", requireAuth, async (req, res) => {
    const invites = db.collection("invitations");
    const token = (req.body?.token || "").toString();
    const inv = await invites.findOne({ tenantId: req.user.tenantId, token, usedAt: null });
    if (!inv) return res.status(400).json({ error: "invalid or used token" });
    await invites.updateOne({ _id: inv._id }, { $set: { usedAt: new Date(), usedBy: req.user.userId } });
    res.json({ ok: true });
  });

  // ---------- Chat ----------
  // Create or fetch a 1:1 chat (or create group with title/extra participants)
  app.post("/chats", requireAuth, async (req, res) => {
    const chats = db.collection("chats");
    const { participantIds, title } = req.body || {};
    const ids = Array.isArray(participantIds) ? participantIds.filter(Boolean) : [];
    const uniqueIds = Array.from(new Set([req.user.userId, ...ids]));
    if (uniqueIds.length < 2) return res.status(400).json({ error: "need at least 2 participants" });

    const isGroup = uniqueIds.length > 2 || !!title;
    let chat;

    if (!isGroup) {
      chat = await chats.findOne({
        tenantId: req.user.tenantId,
        isGroup: false,
        participantIds: { $all: uniqueIds, $size: 2 },
      });
    }
    if (!chat) {
      const now = new Date();
      const doc = { tenantId: req.user.tenantId, isGroup, participantIds: uniqueIds, title: title || null, createdAt: now, updatedAt: now };
      const r = await chats.insertOne(doc);
      chat = { ...doc, _id: r.insertedId };
    }
    res.status(201).json({ chat });
  });

  // List my chats with unread flag
  app.get("/chats", requireAuth, async (req, res) => {
    const chats = db.collection("chats");
    const messages = db.collection("messages");
    const reads = db.collection("messageReads");

    const list = await chats.find({
      tenantId: req.user.tenantId,
      participantIds: req.user.userId,
    }).sort({ updatedAt: -1 }).toArray();

    const result = [];
    for (const c of list) {
      const last = await messages.find({ tenantId: req.user.tenantId, chatId: c._id })
        .sort({ createdAt: -1 }).limit(1).toArray();
      const lastMsgAt = last[0]?.createdAt || null;
      const rr = await reads.findOne({ tenantId: req.user.tenantId, chatId: c._id, userId: req.user.userId });
      const lastReadAt = rr?.lastReadAt || new Date(0);
      const unread = lastMsgAt && lastMsgAt > lastReadAt;
      result.push({ ...c, lastMessageAt: lastMsgAt, unread: !!unread });
    }
    res.json({ chats: result });
  });

  // Send message
  app.post("/chats/:id/messages", requireAuth, async (req, res) => {
    const chats = db.collection("chats");
    const messages = db.collection("messages");
    const chatId = oid(req.params.id);
    if (!chatId) return res.status(400).json({ error: "invalid id" });

    const chat = await chats.findOne({ _id: chatId, tenantId: req.user.tenantId, participantIds: req.user.userId });
    if (!chat) return res.status(404).json({ error: "chat not found" });

    const text = (req.body?.text || "").toString().trim();
    if (!text) return res.status(400).json({ error: "text required" });

    const now = new Date();
    const msg = { tenantId: req.user.tenantId, chatId, senderId: req.user.userId, text, createdAt: now };
    const r = await messages.insertOne(msg);
    await chats.updateOne({ _id: chatId }, { $set: { updatedAt: now } });
    res.status(201).json({ message: { ...msg, _id: r.insertedId } });
  });

  // List messages (mark read)
  app.get("/chats/:id/messages", requireAuth, async (req, res) => {
    const chats = db.collection("chats");
    const messages = db.collection("messages");
    const reads = db.collection("messageReads");
    const chatId = oid(req.params.id);
    if (!chatId) return res.status(400).json({ error: "invalid id" });

    const chat = await chats.findOne({ _id: chatId, tenantId: req.user.tenantId, participantIds: req.user.userId });
    if (!chat) return res.status(404).json({ error: "chat not found" });

    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);
    const list = await messages.find({ tenantId: req.user.tenantId, chatId })
      .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();

    // mark read
    await reads.updateOne(
      { tenantId: req.user.tenantId, chatId, userId: req.user.userId },
      { $set: { lastReadAt: new Date() } },
      { upsert: true }
    );

    res.json({ messages: list.reverse(), page: { skip, limit } });
  });

  app.use((err, req, res, next) => {
    logError(err, err?.priority === "P1" ? "P1" : "P2");
    res.status(500).json({ error: "Internal server error" });
  });

  // ---------- Start ----------
  app.listen(PORT, () => {
    logger.info(`API running on ${PUBLIC_BASE_URL}`);
  });
}

async function bootstrap() {
  try {
    await start();
  } catch (e) {
    logError(e, "P1");
    logger.warn("Retrying startup in 5s...");
    setTimeout(bootstrap, 5000);
  }
}

bootstrap();
