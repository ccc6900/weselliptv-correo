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
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log('Abriendo página...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000); // Espera generosa inicial

    // Rellenar correo
    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[name="email"]').first());
    await emailInput.waitFor({ state: 'visible', timeout: 30000 });
    await emailInput.pressSequentially(email, { delay: randomDelay(50, 100) });
    
    console.log('Esperando a que la web valide el correo...');
    await page.waitForTimeout(3000); // Pausa CRUCIAL para que la web active el botón

    const submitButton = page.getByRole('button', { name: /try for free|try|start/i }).first();
    await submitButton.click();

    console.log('Esperando respuesta de la web...');
    // Esperamos a que aparezca el mensaje de éxito O un error
    const outcome = await page.waitForSelector('text=/Check Your Inbox|already|invalid|error/i', { timeout: 20000 }).catch(() => null);
    
    if (outcome) {
      const text = await outcome.innerText();
      if (text.includes('Check Your Inbox') || text.includes('Email sent')) {
        console.log('✅ WeSellIPTV ha aceptado el correo.');
        fs.writeFileSync('used-email.txt', email, 'utf-8');
      } else {
        console.log(`⚠️ La web ha mostrado un mensaje de error: "${text}"`);
        process.exit(1);
      }
    } else {
      console.log('❌ No se detectó ningún mensaje de confirmación.');
      await page.screenshot({ path: 'send-error.png', fullPage: true });
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    await page.screenshot({ path: 'send-error.png', fullPage: true });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
main();
