import { chromium } from 'playwright';

const MAILTM_API = 'https://api.mail.tm';

// Función para esperar un tiempo
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function obtenerDominios() {
  const res = await fetch(`${MAILTM_API}/domains`);
  const data = await res.json();
  // La API devuelve los dominios en 'hydra:member'
  return data['hydra:member'].map(d => d.domain);
}

async function crearCuenta(domain) {
  const username = `test${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = 'password123';
  const address = `${username}@${domain}`;

  const res = await fetch(`${MAILTM_API}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password })
  });

  if (!res.ok) return null; // Si falla la creación, pasamos al siguiente

  const tokenRes = await fetch(`${MAILTM_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password })
  });
  const tokenData = await tokenRes.json();

  return { address, token: tokenData.token };
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
      return true; // La web dice que lo ha enviado
    }
    return false; // La web lo rechazó o mostró otro mensaje
  } catch (e) {
    return false;
  } finally {
    await browser.close();
  }
}

async function esperarCorreo(token, maxIntentos = 6, intervalo = 5000) {
  for (let i = 0; i < maxIntentos; i++) {
    await sleep(intervalo);
    const res = await fetch(`${MAILTM_API}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data['hydra:member'] && data['hydra:member'].length > 0) {
      return true; // ¡Correo recibido!
    }
  }
  return false;
}

async function main() {
  console.log('Obteniendo lista de dominios de mail.tm...');
  const dominios = await obtenerDominios();
  console.log(`Dominios encontrados: ${dominios.length}`);

  for (const domain of dominios) {
    console.log(`\n--- Probando dominio: ${domain} ---`);
    
    const cuenta = await crearCuenta(domain);
    if (!cuenta) {
      console.log(`No se pudo crear cuenta con ${domain}. Saltando.`);
      continue;
    }
    console.log(`Cuenta creada: ${cuenta.address}`);

    const enviado = await probarEnWeb(cuenta.address);
    if (!enviado) {
      console.log(`WeSellIPTV rechazó el correo con ${domain}. Saltando.`);
      continue;
    }
    console.log(`WeSellIPTV aceptó el correo. Esperando que llegue a mail.tm...`);

    const recibido = await esperarCorreo(cuenta.token);
    if (recibido) {
      console.log(`\n✅ ¡ÉXITO! El dominio que funciona es: ${domain}`);
      console.log(`Puedes usar este dominio en tu flujo principal.`);
      return; // Terminamos, hemos encontrado uno que funciona
    } else {
      console.log(`El correo no llegó a mail.tm con ${domain}. Saltando.`);
    }
  }

  console.log('\n❌ Ningún dominio de mail.tm ha funcionado. WeSellIPTV los bloquea todos.');
}

main().catch(console.error);
