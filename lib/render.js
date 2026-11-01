import { getBrowser } from "./browser.js";

const A4_WIDTH_PX = 793.7; // 210 mm a 96 dpi
const MM_TO_PX = 96 / 25.4;
// Chrome falla al imprimir páginas de más de ~90.000 px de alto. Si el contenido
// es más alto, sale en varias páginas de este alto (mismo ancho, sin escalar).
const MAX_PAGE_HEIGHT_PX = 80000;

export const DEFAULTS = {
  width: 1280,
  mode: "single", // "single" = una sola página larga, "a4" = páginas A4
  landscape: false,
  marginMm: 0,
  timeoutMs: 25000,
};

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function normalizeOptions(input = {}) {
  return {
    width: Math.round(clamp(input.width, 320, 3840, DEFAULTS.width)),
    mode: input.mode === "a4" ? "a4" : "single",
    landscape: Boolean(input.landscape),
    marginMm: clamp(input.marginMm, 0, 50, DEFAULTS.marginMm),
    baseUrl: typeof input.baseUrl === "string" && /^https?:\/\//i.test(input.baseUrl) ? input.baseUrl : "",
  };
}

function withBaseUrl(html, baseUrl) {
  if (!baseUrl || /<base\s/i.test(html)) return html;
  const tag = `<base href="${baseUrl.replace(/"/g, "&quot;")}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
  return tag + html;
}

/**
 * Renderiza HTML con Chrome en modo "pantalla" y devuelve un Buffer con el PDF.
 */
export async function htmlToPdf(html, rawOptions = {}) {
  const opts = normalizeOptions(rawOptions);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Solo permitimos recursos http(s), data: y blob: (nada de file:// ni similares).
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (/^(https?|data|blob|about):/i.test(url)) req.continue();
      else req.abort();
    });

    await page.setViewport({ width: opts.width, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaType("screen");

    await page.setContent(withBaseUrl(html, opts.baseUrl), {
      waitUntil: ["load", "networkidle0"],
      timeout: DEFAULTS.timeoutMs,
    }).catch((err) => {
      // Si algún recurso externo tarda demasiado, seguimos con lo que haya cargado.
      if (!/timeout/i.test(String(err && err.message))) throw err;
    });

    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      // Forzamos la carga de imágenes lazy.
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((r) => { img.onload = img.onerror = r; }))
      );
    });

    // Al imprimir, Chrome calcula vh/vw con el tamaño de la página, no del viewport.
    // Fijamos en px las alturas/anchos definidos con unidades de viewport para
    // conservar el aspecto que tienen en pantalla.
    await page.evaluate(freezeViewportUnits);

    if (opts.mode === "single") {
      const height = await page.evaluate(() =>
        Math.ceil(
          Math.max(
            document.documentElement.scrollHeight,
            document.body ? document.body.scrollHeight : 0,
            document.documentElement.getBoundingClientRect().height
          )
        )
      );
      const pageHeight = Math.min(Math.max(height, 1), MAX_PAGE_HEIGHT_PX);
      return Buffer.from(
        await page.pdf({
          width: `${opts.width}px`,
          height: `${pageHeight + 1}px`,
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          preferCSSPageSize: false,
        })
      );
    }

    // Modo A4: escalamos para que el ancho del viewport quepa en el ancho imprimible.
    const pageWidthPx = opts.landscape ? 1122.5 : A4_WIDTH_PX;
    const marginPx = opts.marginMm * MM_TO_PX;
    const scale = Math.min(2, Math.max(0.1, (pageWidthPx - 2 * marginPx) / opts.width));
    const m = `${opts.marginMm}mm`;
    return Buffer.from(
      await page.pdf({
        format: "A4",
        landscape: opts.landscape,
        scale,
        printBackground: true,
        margin: { top: m, right: m, bottom: m, left: m },
        preferCSSPageSize: false,
      })
    );
  } finally {
    await page.close().catch(() => {});
  }
}

// Se ejecuta dentro de la página.
function freezeViewportUnits() {
  const UNIT = /(^|[^a-z])-?[\d.]+(d|s|l)?(vh|vw|vmin|vmax)\b/i;
  const PROPS = ["height", "min-height", "max-height", "width", "min-width", "max-width", "top", "bottom", "font-size"];
  const targets = new Map(); // elemento -> Set de propiedades

  const add = (el, prop) => {
    if (!targets.has(el)) targets.set(el, new Set());
    targets.get(el).add(prop);
  };

  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) {
        // @media, @supports, @layer...
        if (rule.media && !window.matchMedia(rule.media.mediaText).matches) continue;
        visit(rule.cssRules);
        continue;
      }
      if (!rule.selectorText || !rule.style) continue;
      const props = PROPS.filter((p) => UNIT.test(rule.style.getPropertyValue(p)));
      if (!props.length) continue;
      let els;
      try { els = document.querySelectorAll(rule.selectorText); } catch { continue; }
      els.forEach((el) => props.forEach((p) => add(el, p)));
    }
  };

  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; } // hojas cross-origin
    if (rules) visit(rules);
  }
  document.querySelectorAll("[style]").forEach((el) => {
    PROPS.forEach((p) => { if (UNIT.test(el.style.getPropertyValue(p))) add(el, p); });
  });

  // Primero leemos todo y después escribimos, para no provocar reflujos en cadena.
  const writes = [];
  targets.forEach((props, el) => {
    const cs = getComputedStyle(el);
    props.forEach((p) => {
      const v = cs.getPropertyValue(p);
      if (v && v !== "auto" && v !== "none") writes.push([el, p, v]);
    });
  });
  writes.forEach(([el, p, v]) => el.style.setProperty(p, v, "important"));
}
