import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const email = fs.existsSync('used-email.txt') ? fs.readFileSync('used-email.txt', 'utf-8').trim() : '';
  const protonUser = process.env.PROTON_USER;
  const protonPass = process.env.PROTON_PASS;

  if (!email || !protonUser || !protonPass) throw new Error("Faltan datos o secretos.");

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  try {
    await page.goto('https://mail.proton.me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Login
    await page.locator('input[name="username"]').first().fill(protonUser);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    await page.locator('input[type="password"]').first().fill(protonPass);
    await page.locator('button[type="submit"]').first().click();
    
    console.log('Esperando a que cargue la bandeja...');
    await page.waitForTimeout(10000);

    let bodyText = "";
    for (let i = 0; i < 6; i++) {
      console.log(`Buscando correo (Intento ${i+1})...`);
      const emailRow = page.locator('[data-testid="message-list-item"]').filter({ hasText: /WeSell/i }).first();
      
      if (await emailRow.count() > 0) {
        await emailRow.click();
        await page.waitForTimeout(3000);
        bodyText = await page.locator('body').innerText();
        break;
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
    }

    if (bodyText) {
      fs.writeFileSync('email-body.txt', bodyText, 'utf-8');
      console.log('✅ Correo leído y guardado.');
    } else {
      console.log('❌ No llegó el correo.');
    }
  } finally {
    await browser.close();
  }
}
main();
