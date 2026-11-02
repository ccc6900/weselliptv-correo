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
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(randomDelay(2000, 4000));

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.pressSequentially(email, { delay: randomDelay(50, 150) });
    
    const submitButton = page.getByRole('button', { name: /try for free/i }).first();
    await submitButton.click();

    // Esperar mensaje de éxito
    const success = await page.waitForSelector('text="Check Your Inbox!"', { timeout: 15000 }).catch(() => null);
    
    if (success) {
      console.log('✅ WeSellIPTV ha aceptado el correo.');
      fs.writeFileSync('used-email.txt', email, 'utf-8');
    } else {
      console.log('❌ WeSellIPTV ha rechazado el correo.');
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}
main();
