/**
 * После `vite build` превью-сервер ожидает `dist/server/server.js`, тогда как
 * Cloudflare-ориентированный выход кладёт `index.js`. Создаём относительный symlink.
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "dist", "server");
const index = path.join(dir, "index.js");
const server = path.join(dir, "server.js");

if (!fs.existsSync(index)) {
  console.warn("[postbuild] skip: dist/server/index.js missing");
  process.exit(0);
}
try {
  fs.unlinkSync(server);
} catch {
  /* ok if missing */
}
try {
  fs.symlinkSync("index.js", server);
  console.log("[postbuild] dist/server/server.js -> index.js");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.warn(`[postbuild] symlink failed: ${msg}`);
  process.exit(0);
}
