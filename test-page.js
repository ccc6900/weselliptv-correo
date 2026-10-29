import { chromium } from 'playwright';
import fs from 'fs';

const TARGET_URL = 'https://www.weselliptv.com/iptv/free-trial';
const SCREENSHOT_PATH = 'page-screenshot.png';
const HTML_PATH = 'page-content.html';

async function main() {
  console.log(`Abriendo: ${TARGET_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  });

  const page = await context.newPage();

  // Ocultar webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    const response = await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    console.log(`HTTP status: ${response ? response.status() : 'sin respuesta'}`);

    // Esperar un poco a que cargue todo (incluido posible Cloudflare)
    await page.waitForTimeout(8000);

    const title = await page.title();
    console.log(`Título de la página: "${title}"`);

    // Detectar señales de Cloudflare / Turnstile
    const html = await page.content();
    const hasCloudflare = html.includes('challenges.cloudflare.com') ||
                          html.includes('cf-turnstile') ||
                          html.includes('Just a moment') ||
                          title.includes('Just a moment') ||
                          title.includes('Cloudflare');

    const hasEmailInput = html.includes('type="email"') ||
                          html.includes('name="email"') ||
                          html.includes('placeholder="Email"') ||
                          html.includes('placeholder="Correo"');

    console.log(`Cloudflare/Turnstile detectado: ${hasCloudflare ? 'SÍ' : 'NO'}`);
    console.log(`Campo de email detectado: ${hasEmailInput ? 'SÍ' : 'NO'}`);

    // Guardar captura y HTML
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    fs.writeFileSync(HTML_PATH, html, 'utf-8');
    console.log(`Captura guardada: ${SCREENSHOT_PATH}`);
    console.log(`HTML guardado: ${HTML_PATH}`);

    // Diagnóstico final
    if (hasCloudflare) {
      console.log('CONCLUSIÓN: Cloudflare está bloqueando o desafiando. La automatización completa necesitará proxy/CAPTCHA de pago.');
    } else if (hasEmailInput) {
      console.log('CONCLUSIÓN: La página cargó y tiene campo de email. Podemos intentar el flujo completo.');
    } else {
      console.log('CONCLUSIÓN: La página cargó pero no se detectó campo de email. Revisa el HTML guardado.');
    }
  } catch (error) {
    console.error('ERROR durante la prueba:', error.message);
    try {
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
      console.log(`Captura de error guardada: ${SCREENSHOT_PATH}`);
    } catch (e) {
      console.error('No se pudo guardar captura de error.');
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
