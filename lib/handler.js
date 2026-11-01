import { htmlToPdf } from "./render.js";

const MAX_HTML_BYTES = 4 * 1024 * 1024; // Vercel limita el cuerpo de la petición a 4,5 MB

async function readJsonBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_HTML_BYTES + 64 * 1024) throw Object.assign(new Error("El HTML es demasiado grande (máx. 4 MB)."), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function safeFilename(name) {
  const base = String(name || "documento").replace(/\.[a-z0-9]+$/i, "").replace(/[^\w\-. ]+/g, "_").trim() || "documento";
  return base.slice(0, 100) + ".pdf";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Usa POST con JSON: { html, width, mode, landscape, marginMm, baseUrl }" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.status ? err.message : "JSON inválido." });
  }

  const html = body && body.html;
  if (typeof html !== "string" || !html.trim()) {
    return sendJson(res, 400, { error: "Falta el campo 'html'." });
  }
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
    return sendJson(res, 413, { error: "El HTML es demasiado grande (máx. 4 MB)." });
  }

  try {
    const pdf = await htmlToPdf(html, body);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(body.filename)}"`);
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(pdf);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "No se pudo generar el PDF: " + (err && err.message ? err.message : String(err)) });
  }
}
