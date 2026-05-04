import JSZip from "jszip";
import type { SiteSchema } from "@/lib/site-schema";
import {
  siteExportBodyClass,
  siteExportDocumentTitle,
  siteExportSectionsMarkup,
  siteExportStylesheet,
} from "@/lib/site-render";

const EXPORT_SCRIPT = `'use strict';

document.documentElement.classList.add("js");

document.querySelectorAll('a[href^="#"]').forEach(function (el) {
  el.addEventListener("click", function (e) {
    var id = el.getAttribute("href");
    if (!id || id.length < 2) return;
    var t = document.querySelector(id);
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});
`;

/**
 * Собирает index.html, styles.css, script.js и скачивает site-export.zip.
 */
export async function exportSite(site: SiteSchema): Promise<void> {
  const css = siteExportStylesheet(site);
  const sections = siteExportSectionsMarkup(site);
  const title = siteExportDocumentTitle(site);
  const bodyClass = siteExportBodyClass(site);

  const indexHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="styles.css"/>
</head>
<body class="${bodyClass}">
<div class="page">
${sections}
</div>
<script src="script.js" defer></script>
</body>
</html>
`;

  const zip = new JSZip();
  zip.file("index.html", indexHtml);
  zip.file("styles.css", css);
  zip.file("script.js", EXPORT_SCRIPT);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "site-export.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * ZIP из карты путей → содержимое (например вывод `generateReactProject` / `exportReactProject`).
 */
export async function exportReactZip(
  files: Record<string, string>,
  downloadName = "react-site-export.zip",
): Promise<void> {
  const zip = new JSZip();
  for (const [relPath, content] of Object.entries(files)) {
    const normalized = relPath.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    if (!normalized) continue;
    zip.file(normalized, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { generateReactProject as exportReactProject } from "@/lib/generate-react-project";
