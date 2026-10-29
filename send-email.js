import { chromium } from 'playwright';
import fs from 'fs';

const TARGET_URL = 'https://www.weselliptv.com/iptv/free-trial';
const EMAILS_FILE = 'emails.json';

function pickNextAvailable() {
  if (!fs.existsSync(EMAILS_FILE)) {
    throw new Error('No existe emails.json');
  }
  const emails = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf-8'));
  const next = emails.find(item => item.status === 'disponible');
  if (!next) {
    throw new Error('No hay correos con status "disponible" en emails.json');
  }
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

    // Localizar el campo de email. Probamos varios selectores por si cambia el HTML.
    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[name="email"]').first())
      .or(page.locator('input[placeholder*="mail" i]').first());

    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);
    console.log('Email rellenado en el formulario.');

    // Localizar el botón de envío. Probamos varios textos y roles.
    const submitButton = page.getByRole('button', { name: /submit|send|get trial|start|free trial|enviar|obtener/i }).first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    await submitButton.click();
    console.log('Botón de envío pulsado.');

    // Esperar un poco a que la web procese el envío
    await page.waitForTimeout(5000);

    // Comprobar si hay algún mensaje de error visible
    const bodyText = await page.locator('body').innerText();
    const errorKeywords = ['error', 'already', 'invalid', 'failed', 'ya existe', 'inválido'];
    const hasError = errorKeywords.some(kw => bodyText.toLowerCase().includes(kw));
    if (hasError) {
      console.log('ADVERTENCIA: Posible error en la página tras el envío. Revisa la captura.');
    } else {
      console.log('Envío completado sin errores visibles.');
    }

    await page.screenshot({ path: 'send-result.png', fullPage: true });
    console.log('Captura guardada: send-result.png');

    // Escribir el correo usado en un archivo para el siguiente paso
    fs.writeFileSync('used-email.txt', email, 'utf-8');
    console.log(`Correo usado guardado en used-email.txt: ${email}`);
  } catch (error) {
    console.error('ERROR durante el envío:', error.message);
    try {
      await page.screenshot({ path: 'send-error.png', fullPage: true });
    } catch (e) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
