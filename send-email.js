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

  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[name="email"]').first())
      .or(page.locator('input[placeholder*="mail" i]').first());
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);
    console.log('Email rellenado.');

    const submitButton = page.getByRole('button', { name: /submit|send|get trial|start|free trial|enviar|obtener/i }).first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });

    // --- CAMBIO CLAVE: esperar la petición de red que dispara el envío ---
    console.log('Pulsando botón y esperando petición de red...');
    const responsePromise = page.waitForResponse(response => {
      // Buscamos cualquier petición POST o que contenga la palabra "trial" o "email"
      const url = response.url().toLowerCase();
      return (response.request().method() === 'POST' || url.includes('trial') || url.includes('email')) 
             && response.status() < 500; // aceptamos 2xx y 3xx, pero no errores 5xx
    }, { timeout: 20000 });

    await submitButton.click();

    let networkOk = false;
    try {
      const response = await responsePromise;
      console.log(`Petición detectada: ${response.status()} ${response.url()}`);
      if (response.status() >= 200 && response.status() < 400) {
        networkOk = true;
      } else {
        console.log(`ADVERTENCIA: La petición devolvió status ${response.status()}`);
      }
    } catch (e) {
      console.log('No se detectó ninguna petición de red tras el clic. Posible bloqueo o formulario que no envía.');
    }

    // Esperar un poco y capturar para diagnóstico
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'send-result.png', fullPage: true });
    console.log('Captura guardada: send-result.png');

    if (networkOk) {
      fs.writeFileSync('used-email.txt', email, 'utf-8');
      console.log(`Correo usado guardado: ${email}`);
    } else {
      console.error('FALLO: No se confirmó que la web enviara el correo. Revisa send-result.png');
      process.exit(1); // Forzar fallo del workflow para que no marque el correo como usado
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
