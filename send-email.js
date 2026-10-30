import { chromium } from 'playwright';
import fs from 'fs';

const TARGET_URL = 'https://www.weselliptv.com/iptv/free-trial';
const EMAILS_FILE = 'emails.json';
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function pickNextAvailable() {
  if (!fs.existsSync(EMAILS_FILE)) throw new Error('No existe emails.json');
  const emails = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf-8'));
  // Filtramos ESTRICTAMENTE por los que están disponibles
  const next = emails.find(item => item.status === 'disponible');
  if (!next) throw new Error('No hay correos con status "disponible" en emails.json');
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
    console.log('Abriendo página...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(randomDelay(3000, 5000));

    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[name="email"]').first())
      .or(page.locator('input[placeholder*="mail" i]').first());
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });

    console.log('Escribiendo correo...');
    await emailInput.click();
    await page.waitForTimeout(randomDelay(200, 500));
    await emailInput.pressSequentially(email, { delay: randomDelay(50, 150) }); 
    await page.waitForTimeout(randomDelay(1000, 2000));

    const submitButton = page.getByRole('button', { name: /try for free/i }).first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log('Moviendo el ratón hacia el botón...');
    const buttonBox = await submitButton.boundingBox();
    if (buttonBox) {
      await page.mouse.move(
        buttonBox.x + buttonBox.width / 2 + randomDelay(-20, 20),
        buttonBox.y + buttonBox.height / 2 + randomDelay(-20, 20),
        { steps: 5 }
      );
      await page.waitForTimeout(randomDelay(300, 800));
    }

    console.log('Haciendo clic y esperando confirmación...');
    const successPromise = page.waitForSelector('text="Check Your Inbox!"', { timeout: 20000 }).catch(() => null);
    const errorPromise = page.waitForSelector('text=/already|invalid|error/i', { timeout: 20000 }).catch(() => null);

    await submitButton.click();

    const result = await Promise.race([successPromise, errorPromise]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'send-result.png', fullPage: true });

    if (result) {
      const text = await result.innerText().catch(() => '');
      if (text.includes('Check Your Inbox') || text.includes('Email sent')) {
        console.log('✅ ¡Éxito! La página muestra "Check Your Inbox!".');
        fs.writeFileSync('used-email.txt', email, 'utf-8');
        console.log(`Correo usado guardado: ${email}`);
      } else {
        console.log(`⚠️ La página mostró un mensaje inesperado: "${text}"`);
        process.exit(1);
      }
    } else {
      const emailInputVisible = await emailInput.isVisible();
      if (!emailInputVisible) {
        console.log('✅ ¡Éxito! El formulario desapareció de la vista.');
        fs.writeFileSync('used-email.txt', email, 'utf-8');
      } else {
        console.log('❌ No se detectó ni éxito ni error. Revisa send-result.png');
        process.exit(1);
      }
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
