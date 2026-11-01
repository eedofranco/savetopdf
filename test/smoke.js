// Prueba rápida: genera PDFs de ejemplo en ./out usando tu Chrome local.
import fs from "node:fs/promises";
import { htmlToPdf } from "../lib/render.js";
import { getBrowser } from "../lib/browser.js";

const html = `<!doctype html><html><head><style>
  body{margin:0;font-family:system-ui;background:#0f172a;color:#e2e8f0}
  .hero{min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#1e3a8a,#9333ea)}
  .hero h1{font-size:64px;margin:0}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:48px}
  .card{background:#1e293b;border-radius:16px;padding:24px;box-shadow:0 10px 30px #0008}
  @media print{ body{background:white;color:black} }
  @media (max-width:800px){ .cards{grid-template-columns:1fr} }
</style></head><body>
  <section class="hero"><h1>Hola PDF</h1></section>
  <section class="cards">${Array.from({ length: 12 }, (_, i) => `<div class="card"><h3>Tarjeta ${i + 1}</h3><p>Lorem ipsum dolor sit amet.</p></div>`).join("")}</section>
</body></html>`;

await fs.mkdir("out", { recursive: true });
for (const [name, opts] of [
  ["single", { mode: "single" }],
  ["a4", { mode: "a4" }],
  ["a4-landscape-margin", { mode: "a4", landscape: true, marginMm: 10 }],
]) {
  const t = Date.now();
  const pdf = await htmlToPdf(html, opts);
  await fs.writeFile(`out/${name}.pdf`, pdf);
  console.log(`${name}: ${pdf.length} bytes en ${Date.now() - t} ms`);
}
(await getBrowser()).close();
