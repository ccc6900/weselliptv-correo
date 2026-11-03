import { chromium } from 'playwright';
import fs from 'fs';

const TARGET_URL = 'https://www.weselliptv.com/iptv/free-trial';
const EMAILS_FILE = 'emails.json';
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
  if (!fs.existsSync(EMAILS_FILE)) throw new Error('No existe emails.json');
  const emails = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf-8'));
  
  // Buscar el primer correo disponible
  const index = emails.findIndex(item => item.status === 'disponible');
  
  if (index === -1) {
    console.log('⚠️ AGOTADO: No hay correos disponibles. Añade más alias.');
    // Creamos un result.json de aviso para que la web lo sepa
    fs.writeFileSync('result.json', JSON.stringify({ estado: 'AGOTADO', mensaje: 'No hay más alias disponibles. Por favor, añade nuevos correos a emails.json' }), 'utf-8');
    process.exit(0); // Salimos sin error para que el workflow no marque fallo rojo
  }

  const email = emails[index].email;
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
    await page.waitForTimeout(randomDelay(3000, 5000));

    const emailInput = page.locator('input[type="email"]').first().or(page.locator('input[name="email"]').first());
    await emailInput.waitFor({ state: 'visible', timeout: 30000 });
    
    console.log('Escribiendo correo...');
    await emailInput.click();
    await page.waitForTimeout(randomDelay(300, 700));
    await emailInput.pressSequentially(email, { delay: randomDelay(50, 150) });
    await page.waitForTimeout(randomDelay(2000, 3000));

    const submitButton = page.getByRole('button', { name: /try for free|try|start/i }).first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log('Moviendo el ratón hacia el botón...');
    const buttonBox = await submitButton.boundingBox();
    if (buttonBox) {
      await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2, { steps: 10 });
      await page.waitForTimeout(randomDelay(500, 1000));
    }

    console.log('Haciendo clic...');
    await submitButton.click();

    console.log('Esperando confirmación...');
    const outcome = await page.waitForSelector('text=/Check Your Inbox|already|invalid|error/i', { timeout: 20000 }).catch(() => null);
    
    if (outcome) {
      const text = await outcome.innerText();
      if (text.includes('Check Your Inbox') || text.includes('Email sent')) {
        console.log('✅ WeSellIPTV ha aceptado el correo.');
        fs.writeFileSync('used-email.txt', email, 'utf-8');
        
        // --- BORRAR EL CORREO USADO DE LA LISTA ---
        emails.splice(index, 1); 
        fs.writeFileSync(EMAILS_FILE, JSON.stringify(emails, null, 2), 'utf-8');
        console.log('Correo eliminado de emails.json para no volver a usarlo.');
        
      } else {
        console.log(`⚠️ La web mostró: "${text}"`);
        process.exit(1);
      }
    } else {
      console.log('❌ No se detectó confirmación.');
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
