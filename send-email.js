import { chromium } from 'playwright';
import fs from 'fs';

const TARGET_URL = 'https://www.weselliptv.com/iptv/free-trial';
const EMAILS_FILE = 'emails.json';

function pickNextAvailable() {
  if (!fs.existsSync(EMAILS_FILE)) throw new Error('No existe emails.json');
  const emails = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf-8'));
  const next = emails.find(item => item.status === 'disponible');
  if (!next) throw new Error('No hay correos con status "disponible"');
  return next.email;
}

async function main() {
  const email = pickNextAvailable();
  console.log(`Correo seleccionado: ${email}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Log de todas las peticiones para diagnóstico
  page.on('request', req => {
    if (req.method() !== 'GET') {
      console.log(`[REQ] ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', res => {
    if (res.request().method() !== 'GET') {
      console.log(`[RES] ${res.status()} ${res.url()}`);
    }
  });

  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[name="email"]').first())
      .or(page.locator('input[placeholder*="mail" i]').first());
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);
    console.log('Email rellenado.');

    // Esperar a que la validación check-email termine
    await page.waitForTimeout(2000);

    // Selector del botón corregido: incluye "try for free"
    const submitButton = page.getByRole('button', { name: /try for free|try|submit|send|start|get trial|enviar|obtener/i }).first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Botón encontrado. Esperando a que esté habilitado...');
    await submitButton.waitFor({ state: 'attached', timeout: 5000 });

    // Esperar la petición POST real de envío
    console.log('Pulsando botón y esperando petición POST...');
    const responsePromise = page.waitForResponse(response => {
      const req = response.request();
      return req.method() === 'POST' && !response.url().includes('check-email');
    }, { timeout: 20000 });

    await submitButton.click();

    let networkOk = false;
    let responseStatus = 0;
    try {
      const response = await responsePromise;
      responseStatus = response.status();
      console.log(`Petición POST detectada: ${responseStatus} ${response.url()}`);
      if (responseStatus >= 200 && responseStatus < 400) {
        networkOk = true;
      }
    } catch (e) {
      console.log('No se detectó ninguna petición POST tras el clic.');
    }

    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'send-result.png', fullPage: true });
    console.log('Captura guardada: send-result.png');

    // Comprobar también el texto de la página por si hay mensaje de éxito o error
    const bodyText = await page.locator('body').innerText();
    const successKeywords = ['check your inbox', 'check your email', 'revisa tu correo', 'sent', 'enviado', 'trial is ready'];
    const errorKeywords = ['already', 'invalid', 'error', 'failed', 'ya existe', 'inválido'];
    const hasSuccess = successKeywords.some(kw => bodyText.toLowerCase().includes(kw));
    const hasError = errorKeywords.some(kw => bodyText.toLowerCase().includes(kw));
    console.log(`Mensaje de éxito detectado: ${hasSuccess}`);
    console.log(`Mensaje de error detectado: ${hasError}`);

    if (networkOk || hasSuccess) {
      fs.writeFileSync('used-email.txt', email, 'utf-8');
      console.log(`Correo usado guardado: ${email}`);
    } else {
      console.error('FALLO: No se confirmó el envío. Revisa send-result.png');
      process.exit(1);
    }

  } catch (error) {
    console.error('ERROR durante el envío:', error.message);
    try { await page.screenshot({ path: 'send-error.png', fullPage: true }); } catch (e) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
