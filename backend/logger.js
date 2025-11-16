import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, "server.log");
const LOG_STREAM = fs.createWriteStream(LOG_FILE, { flags: "a" });

const DEFAULT_VERBOSE = process.env.NODE_ENV !== "production";
const VERBOSE_LOGGING = (process.env.VERBOSE_LOGGING || (DEFAULT_VERBOSE ? "true" : "false")) === "true";
const DEFAULT_LEVEL = VERBOSE_LOGGING ? "debug" : "info";
const LOG_LEVEL = (process.env.LOG_LEVEL || DEFAULT_LEVEL).toLowerCase();

const LEVELS = ["debug", "info", "warn", "error"];
const levelPriority = LEVELS.reduce((acc, level, idx) => ({ ...acc, [level]: idx }), {});

const SHOULD_ECHO_TO_CONSOLE = process.env.NODE_ENV !== "production";

function shouldLog(level) {
  const normalized = LEVELS.includes(level) ? level : "info";
  const threshold = levelPriority[LOG_LEVEL] ?? levelPriority.info;
  return levelPriority[normalized] >= threshold;
}

function writeLog(level, message, meta = {}) {
  if (!shouldLog(level)) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  LOG_STREAM.write(JSON.stringify(entry) + "\n");
  if (SHOULD_ECHO_TO_CONSOLE) {
    const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    const context = Object.keys(meta || {}).length ? meta : "";
    console[consoleMethod](`[${entry.time}] [${level.toUpperCase()}] ${message}`, context);
  }
}

export const logger = {
  debug: (message, meta) => writeLog("debug", message, meta),
  info: (message, meta) => writeLog("info", message, meta),
  warn: (message, meta) => writeLog("warn", message, meta),
  error: (message, meta) => writeLog("error", message, meta),
};

export { VERBOSE_LOGGING };
