import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const email = fs.existsSync('used-email.txt') ? fs.readFileSync('used-email.txt', 'utf-8').trim() : '';
  const protonUser = process.env.PROTON_USER;
  const protonPass = process.env.PROTON_PASS;

  if (!email || !protonUser || !protonPass) throw new Error("Faltan datos o secretos.");

  console.log(`Buscando correo para: ${email}`);
  console.log('Iniciando navegador...');

  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] 
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
  });
  const page = await context.newPage();

  try {
    console.log('Entrando a Proton Mail...');
    await page.goto('https://mail.proton.me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Esperar un poco a que cargue el JS de Proton
    await page.waitForTimeout(5000);

    // Intentar cerrar banner de cookies si existe
    try {
      const cookieBtn = page.getByRole('button', { name: /accept|agree|aceptar/i }).first();
      if (await cookieBtn.isVisible({ timeout: 3000 })) {
        console.log('Aceptando cookies de Proton...');
        await cookieBtn.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {}

    console.log('Buscando campo de usuario...');
    // Proton suele usar un input con id="username" o name="username"
    const userInput = page.locator('input#username').first()
      .or(page.locator('input[name="username"]').first())
      .or(page.locator('input[type="email"]').first())
      .or(page.locator('input[autocomplete="username"]').first());

    await userInput.waitFor({ state: 'visible', timeout: 30000 });
    await userInput.fill(protonUser);
    console.log('Usuario escrito. Pulsando Siguiente...');

    const nextBtn = page.getByRole('button', { name: /next|siguiente|continue/i }).first()
      .or(page.locator('button[type="submit"]').first());
    await nextBtn.click();
    
    await page.waitForTimeout(4000);

    console.log('Buscando campo de contraseña...');
    const passInput = page.locator('input#password').first()
      .or(page.locator('input[name="password"]').first())
      .or(page.locator('input[type="password"]').first());
      
    await passInput.waitFor({ state: 'visible', timeout: 20000 });
    await passInput.fill(protonPass);
    console.log('Contraseña escrita. Entrando...');

    const loginBtn = page.getByRole('button', { name: /sign in|log in|entrar/i }).first()
      .or(page.locator('button[type="submit"]').first());
    await loginBtn.click();
    
    console.log('Esperando a que cargue la bandeja de entrada (esto puede tardar)...');
    await page.waitForTimeout(15000); 

    // Verificar si nos hemos quedado atascados en una pantalla de verificación (2FA)
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('verification') || bodyText.includes('verificación') || bodyText.includes('code') && bodyText.includes('email')) {
      console.log('⚠️ Proton está pidiendo un código de verificación (2FA).');
      await page.screenshot({ path: 'proton-2fa.png', fullPage: true });
      process.exit(1);
    }

    let found = false;
    for (let i = 0; i < 6; i++) {
      console.log(`Buscando correo de WeSell (Intento ${i+1})...`);
      
      // Buscar el correo en la lista
      const emailRow = page.locator('[data-testid="message-list-item"]').filter({ hasText: /WeSell/i }).first();
      
      if (await emailRow.count() > 0) {
        console.log('¡Correo encontrado! Abriendo...');
        await emailRow.click();
        await page.waitForTimeout(4000);
        
        // Extraer todo el texto visible del cuerpo del correo
        const emailBody = await page.locator('body').innerText();
        fs.writeFileSync('email-body.txt', emailBody, 'utf-8');
        console.log('✅ Texto del correo guardado en email-body.txt');
        found = true;
        break;
      }
      
      console.log('Aún no ha llegado. Recargando bandeja...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
    }

    if (!found) {
      console.log('❌ No se encontró el correo en la bandeja de Proton.');
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
