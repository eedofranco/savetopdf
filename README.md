# HTML a PDF

Convierte HTML (pegado o subido como archivo) en un PDF que se ve como en pantalla.
Usa Chrome headless: en Vercel con `puppeteer-core` + `@sparticuz/chromium`, y en local con tu Chrome instalado.

## Cómo se consigue el aspecto "de pantalla"

- `emulateMediaType('screen')`: se ignoran las reglas `@media print`.
- `printBackground: true`: se conservan fondos, degradados y colores.
- Viewport configurable (por defecto 1280 px), así que los media queries responsive se comportan como en un escritorio de ese ancho.
- Las alturas definidas con `vh`/`vw` se fijan en px antes de imprimir (al imprimir, Chrome las calcularía con el tamaño de la hoja).
- Se espera a `networkidle0`, a las fuentes web y a las imágenes (incluidas las `loading="lazy"`).

Formatos:
- **Una página larga** (por defecto): el PDF tiene exactamente el ancho del viewport y el alto del contenido, sin cortes. Si el contenido supera los 80.000 px de alto, se parte en páginas de ese alto.
- **A4** (vertical u horizontal, con margen opcional): el contenido se escala para que el ancho del viewport quepa en la hoja.

## Desarrollo local

Requisitos: Node 22.17+ y Google Chrome (o Chromium/Edge) instalado.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # genera PDFs de ejemplo en ./out
```

Si Chrome no está en una ruta estándar: `CHROME_PATH="/ruta/a/chrome" npm run dev`.

## Despliegue en Vercel

1. Sube esta carpeta a un repo de GitHub e impórtalo en Vercel (o `npx vercel` desde la carpeta).
2. No hace falta configurar nada: framework "Other", sin comando de build. `public/` se sirve como estático y `api/pdf.js` es la función.
3. `vercel.json` da a la función 2048 MB y 60 s. En el plan Hobby ese es el máximo de memoria; si usas Pro puedes subir `maxDuration`.

## API

`POST /api/pdf` con JSON:

| Campo | Tipo | Por defecto | |
|---|---|---|---|
| `html` | string | (obligatorio) | Máx. 4 MB (Vercel limita el cuerpo a 4,5 MB) |
| `width` | número | 1280 | Ancho del viewport en px (320–3840) |
| `mode` | `"single"` \| `"a4"` | `"single"` | |
| `landscape` | boolean | false | Solo A4 |
| `marginMm` | número | 0 | Solo A4 |
| `baseUrl` | string | | Inserta `<base href>` para resolver rutas relativas de imágenes/CSS |
| `filename` | string | `documento` | Nombre del PDF descargado |

Devuelve `application/pdf` como descarga, o `{ "error": "..." }`.

```bash
curl -X POST http://localhost:3000/api/pdf -H 'Content-Type: application/json' \
  -d '{"html":"<h1>Hola</h1>","width":1280}' -o salida.pdf
```

## Limitaciones conocidas

- **Fuentes**: el Chromium de Vercel trae pocas fuentes de sistema. Si tu HTML usa fuentes como Arial/Helvetica sin cargarlas, en Vercel se sustituyen; usa fuentes web (Google Fonts, `@font-face`) para un resultado idéntico. Los emojis y caracteres CJK necesitan una fuente web o `chromium.font(url)` en `lib/browser.js`.
- **Recursos locales**: un HTML subido con rutas relativas (`img/foto.png`) no encuentra esos archivos; usa URLs absolutas, `data:` URIs o el campo de URL base. Por seguridad solo se cargan recursos `http(s)`, `data:` y `blob:`.
- El JavaScript del HTML se ejecuta antes de generar el PDF (la vista previa del navegador no lo ejecuta).
- La primera petición tras un rato sin uso tarda unos segundos más (arranque en frío de Chromium).
