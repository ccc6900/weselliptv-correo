import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  // Si no existe used-email.txt, es que el paso anterior se detuvo (agotado)
  if (!fs.existsSync('used-email.txt')) {
    console.log('Saltando lectura de Proton: no se envió ningún correo (posiblemente agotado).');
    process.exit(0); 
  }

  const email = fs.readFileSync('used-email.txt', 'utf-8').trim();
  const protonUser = process.env.PROTON_USER;
  const protonPass = process.env.PROTON_PASS;

  console.log(`Buscando correo para: ${email}`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto('https://mail.proton.me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Login
    await page.locator('input#username, input[name="username"]').first().fill(protonUser);
    await page.getByRole('button', { name: /next|siguiente|continue/i }).first().or(page.locator('button[type="submit"]').first()).click();
    await page.waitForTimeout(3000);
    await page.locator('input#password, input[name="password"]').first().fill(protonPass);
    await page.getByRole('button', { name: /sign in|log in|entrar/i }).first().or(page.locator('button[type="submit"]').first()).click();
    
    console.log('Esperando bandeja...');
    await page.waitForTimeout(15000); 

    let found = false;
    for (let i = 0; i < 12; i++) {
      console.log(`Buscando correo de WeSell (Intento ${i+1}/12)...`);
      const emailRow = page.locator('[data-testid="message-list-item"]').filter({ hasText: /WeSell/i }).first();
      
      if (await emailRow.count() > 0) {
        await emailRow.click();
        await page.waitForTimeout(4000);
        const emailBody = await page.locator('body').innerText();
        fs.writeFileSync('email-body.txt', emailBody, 'utf-8');
        console.log('✅ Texto del correo guardado.');
        found = true;
        break;
      }
      console.log('Aún no ha llegado. Recargando...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(10000);
    }

    if (!found) {
      console.log('❌ No se encontró el correo.');
      await page.screenshot({ path: 'proton-error.png', fullPage: true });
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ ERROR en Proton:', error.message);
    await page.screenshot({ path: 'proton-error.png', fullPage: true });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
main();
