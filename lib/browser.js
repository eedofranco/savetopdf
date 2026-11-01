import fs from "node:fs";
import puppeteer from "puppeteer-core";

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Rutas habituales de Chrome/Chromium para desarrollo local.
const LOCAL_CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
].filter(Boolean);

function findLocalChrome() {
  const found = LOCAL_CHROME_CANDIDATES.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (!found) {
    throw new Error(
      "No encontré Chrome en este equipo. Instálalo o define CHROME_PATH con la ruta al ejecutable."
    );
  }
  return found;
}

async function launch() {
  if (IS_SERVERLESS) {
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }
  return puppeteer.launch({
    executablePath: findLocalChrome(),
    headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
}

// Reutilizamos el navegador entre peticiones (en Vercel, mientras la instancia siga caliente).
let browserPromise = null;

export async function getBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    if (browser && browser.connected) return browser;
  }
  browserPromise = launch();
  return browserPromise;
}
