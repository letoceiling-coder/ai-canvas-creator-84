/**
 * PM2: переменные из `.env` в корне приложения (в т.ч. VERCEL_TOKEN).
 * Секреты не храните в этом файле — только в `.env` на сервере.
 */
const fs = require("fs");
const path = require("path");

const cwd = __dirname;

function loadEnvFile(root) {
  const envPath = path.join(root, ".env");
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvFile(cwd);

module.exports = {
  apps: [
    {
      name: "botme-app",
      script: "npm",
      args: "start",
      cwd,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        ...fileEnv,
      },
    },
    {
      name: "botme-deploy-hook",
      script: "scripts/local-deploy-hook.mjs",
      interpreter: "node",
      cwd,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        ...fileEnv,
      },
    },
  ],
};
