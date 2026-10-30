import { chromium } from 'playwright';

const API_BASE = 'https://www.1secmail.com/api/v1/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function obtenerDominios() {
  const res = await fetch(`${API_BASE}?action=getDomainList`);
  const dominios = await res.json();
  return dominios;
}

async function crearCorreo(domain) {
  const username = `test${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const address = `${username}@${domain}`;
  // 1secMail no requiere crear la cuenta, el correo existe automáticamente
  return { address, login: username, domain };
}

async function probarEnWeb(email) {
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
    await page.goto('https://www.weselliptv.com/iptv/free-trial', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    
    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[name="email"]').first())
      .or(page.locator('input[placeholder*="mail" i]').first());
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);
    
    const submitButton = page.getByRole('button', { name: /try for free/i }).first();
    await submitButton.click();
    
    await page.waitForTimeout(4000);
    
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Check Your Inbox') || bodyText.includes('Email sent')) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  } finally {
    await browser.close();
  }
}

async function esperarCorreo(login, domain, maxIntentos = 6, intervalo = 5000) {
  for (let i = 0; i < maxIntentos; i++) {
    await sleep(intervalo);
    try {
      const res = await fetch(`${API_BASE}?action=getMessages&login=${login}&domain=${domain}`);
      const mensajes = await res.json();
      if (mensajes && mensajes.length > 0) {
        return true; // ¡Correo recibido!
      }
    } catch (e) {
      // Ignorar errores de red y reintentar
    }
  }
  return false;
}

async function main() {
  console.log('Obteniendo lista de dominios de 1secMail...');
  const dominios = await obtenerDominios();
  
  if (!dominios || dominios.length === 0) {
    console.log('❌ No se pudieron obtener los dominios de 1secMail.');
    return;
  }
  
  console.log(`Dominios encontrados: ${dominios.length}`);
  console.log(`Dominios: ${dominios.join(', ')}`);

  for (const domain of dominios) {
    console.log(`\n--- Probando dominio: ${domain} ---`);
    
    const cuenta = await crearCorreo(domain);
    console.log(`Correo generado: ${cuenta.address}`);

    const enviado = await probarEnWeb(cuenta.address);
    if (!enviado) {
      console.log(`WeSellIPTV rechazó el correo con ${domain}. Saltando.`);
      continue;
    }
    console.log(`WeSellIPTV aceptó el correo. Esperando que llegue a 1secMail...`);

    const recibido = await esperarCorreo(cuenta.login, cuenta.domain);
    if (recibido) {
      console.log(`\n✅ ¡ÉXITO! El dominio que funciona es: ${domain}`);
      console.log(`Puedes usar este dominio en tu flujo principal.`);
      return; // Terminamos, hemos encontrado uno que funciona
    } else {
      console.log(`El correo no llegó a 1secMail con ${domain}. Saltando.`);
    }
  }

  console.log('\n❌ Ningún dominio de 1secMail ha funcionado. WeSellIPTV los bloquea todos.');
}

main().catch(console.error);
