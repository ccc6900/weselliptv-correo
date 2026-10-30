import { chromium } from 'playwright';

const TARGET_URL = 'https://swooptv.tv/'; // URL principal de Swoop TV

async function main() {
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
    console.log('Abriendo Swoop TV...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000); // Esperar a que cargue bien

    // Intentar encontrar un enlace o botón que lleve a la prueba o registro
    const signupLink = page.locator('a, button').filter({ hasText: /sign up|free trial|get started|register|try/i }).first();
    
    if (await signupLink.isVisible().catch(() => false)) {
      console.log('Encontrado botón/enlace de registro. Haciendo clic...');
      await signupLink.click();
      await page.waitForTimeout(4000); // Esperar a la nueva página
    } else {
      console.log('No se encontró un enlace directo evidente. Haciendo captura de la home...');
    }

    // Sacar captura de pantalla para ver qué hay
    await page.screenshot({ path: 'swoop-register.png', fullPage: true });
    console.log('Captura guardada: swoop-register.png');

    // Volcar los inputs visibles para ver exactamente qué campos pide
    const inputs = await page.locator('input').all();
    console.log(`\nCampos de formulario encontrados (${inputs.length}):`);
    for (const input of inputs) {
      if (await input.isVisible()) {
        const type = await input.getAttribute('type') || 'text';
        const name = await input.getAttribute('name') || 'sin-nombre';
        const placeholder = await input.getAttribute('placeholder') || 'sin-placeholder';
        console.log(`  - type="${type}" name="${name}" placeholder="${placeholder}"`);
      }
    }

    // Comprobar si el texto de la página pide teléfono o WhatsApp
    const bodyText = await page.locator('body').innerText();
    const pideTelefono = bodyText.toLowerCase().includes('phone') || 
                         bodyText.toLowerCase().includes('whatsapp') || 
                         bodyText.toLowerCase().includes('teléfono');
                         
    if (pideTelefono) {
      console.log('\n⚠️ ADVERTENCIA: La página menciona teléfono/WhatsApp en algún sitio.');
    } else {
      console.log('\n✅ La página NO menciona teléfono/WhatsApp.');
    }

  } catch (error) {
    console.error('ERROR durante la prueba:', error.message);
    try { await page.screenshot({ path: 'swoop-error.png', fullPage: true }); } catch (e) {}
  } finally {
    await browser.close();
  }
}

main();
