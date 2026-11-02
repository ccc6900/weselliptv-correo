import { chromium } from 'playwright';
import fs from 'fs';

const TARGET_URL = 'https://www.weselliptv.com/iptv/free-trial';
const EMAILS_FILE = 'emails.json';
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

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
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-ES',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log('Abriendo página...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000); // Espera extra para que cargue JavaScript pesado

    // Intentar aceptar cookies si hay un banner
    try {
      const cookieBtn = page.getByRole('button', { name: /accept|agree|aceptar/i }).first();
      if (await cookieBtn.isVisible({ timeout: 3000 })) {
        console.log('Aceptando cookies...');
        await cookieBtn.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('No hay banner de cookies o no se pudo cerrar.');
    }

    // Buscar el input de email con múltiples estrategias
    console.log('Buscando campo de email...');
    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[name="email"]').first())
      .or(page.locator('input[name="emailAddress"]').first())
      .or(page.locator('input[placeholder*="mail" i]').first())
      .or(page.locator('input[type="text"]').first()); // Último recurso
      
    await emailInput.waitFor({ state: 'visible', timeout: 30000 });

    console.log('Escribiendo correo...');
    await emailInput.click();
    await page.waitForTimeout(randomDelay(200, 500));
    await emailInput.pressSequentially(email, { delay: randomDelay(50, 100) });
    await page.waitForTimeout(randomDelay(1000, 2000));

    // Buscar el botón
    const submitButton = page.getByRole('button', { name: /try for free|try|start|submit|send/i }).first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log('Pulsando botón...');
    await submitButton.click();

    // Esperar mensaje de éxito o error
    const result = await page.waitForSelector('text="Check Your Inbox!"', { timeout: 20000 }).catch(() => null);
    
    if (result) {
      console.log('✅ WeSellIPTV ha aceptado el correo.');
      fs.writeFileSync('used-email.txt', email, 'utf-8');
    } else {
      console.log('⚠️ No se vio el mensaje de éxito, revisando el cuerpo...');
      const bodyText = await page.locator('body').innerText();
      if (bodyText.includes('Check Your Inbox') || bodyText.includes('Email sent')) {
        console.log('✅ WeSellIPTV ha aceptado el correo (verificado por texto).');
        fs.writeFileSync('used-email.txt', email, 'utf-8');
      } else {
        console.log('❌ WeSellIPTV ha rechazado el correo o ha mostrado otro mensaje.');
        await page.screenshot({ path: 'send-error.png', fullPage: true });
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    // Capturar pantalla si algo falla para ver qué ha pasado
    await page.screenshot({ path: 'send-error.png', fullPage: true });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
main();
