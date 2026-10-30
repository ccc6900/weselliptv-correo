import { chromium } from 'playwright';

const MAILTM_API = 'https://api.mail.tm';

async function crearCorreoTemporal() {
  // 1. Obtener dominios disponibles
  const domainsRes = await fetch(`${MAILTM_API}/domains`);
  const domainsData = await domainsRes.json();
  const domain = domainsData['hydra:member'][0].domain;
  console.log(`Dominio disponible: ${domain}`);

  // 2. Crear cuenta
  const username = `test${Date.now()}`;
  const password = 'password123';
  const address = `${username}@${domain}`;

  const accountRes = await fetch(`${MAILTM_API}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password })
  });

  if (!accountRes.ok) {
    throw new Error(`Error creando cuenta: ${accountRes.status}`);
  }

  const accountData = await accountRes.json();
  console.log(`Correo temporal creado: ${address}`);

  // 3. Obtener token de acceso
  const tokenRes = await fetch(`${MAILTM_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password })
  });

  const tokenData = await tokenRes.json();
  const token = tokenData.token;
  console.log(`Token obtenido.`);

  return { address, token };
}

async function usarEnWeb(email) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://www.weselliptv.com/iptv/free-trial', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(email);
    console.log(`Email rellenado: ${email}`);

    const submitButton = page.getByRole('button', { name: /try for free/i }).first();
    await submitButton.click();
    console.log('Botón pulsado. Esperando respuesta...');

    await page.waitForTimeout(5000);

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Check Your Inbox') || bodyText.includes('Email sent')) {
      console.log('✅ WeSellIPTV dice que ha enviado el correo.');
      return true;
    } else if (bodyText.toLowerCase().includes('already') || bodyText.toLowerCase().includes('trial')) {
      console.log('⚠️ WeSellIPTV rechaza este correo (ya usado o dominio bloqueado).');
      return false;
    } else {
      console.log('❓ Respuesta inesperada. Revisa la captura.');
      await page.screenshot({ path: 'tempmail-result.png', fullPage: true });
      return false;
    }
  } finally {
    await browser.close();
  }
}

async function esperarCorreo(token, maxIntentos = 12, intervalo = 10000) {
  for (let i = 1; i <= maxIntentos; i++) {
    console.log(`Intento ${i}/${maxIntentos}: consultando mail.tm...`);
    
    const res = await fetch(`${MAILTM_API}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    
    if (data['hydra:member'] && data['hydra:member'].length > 0) {
      const msg = data['hydra:member'][0];
      console.log(`✅ ¡Correo recibido! Asunto: ${msg.subject}`);
      
      // Obtener cuerpo completo
      const msgRes = await fetch(`${MAILTM_API}/messages/${msg.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const msgData = await msgRes.json();
      console.log(`Contenido (primeros 500 chars):`);
      console.log((msgData.text || msgData.html || '').substring(0, 500));
      
      return true;
    }
    
    if (i < maxIntentos) {
      await new Promise(r => setTimeout(r, intervalo));
    }
  }
  
  console.log('❌ No ha llegado ningún correo en el tiempo de espera.');
  return false;
}

async function main() {
  const { address, token } = await crearCorreoTemporal();
  
  const enviado = await usarEnWeb(address);
  
  if (enviado) {
    console.log('Esperando correo en mail.tm (hasta 2 minutos)...');
    await esperarCorreo(token);
  } else {
    console.log('WeSellIPTV no aceptó el correo. No tiene sentido esperar.');
  }
}

main().catch(console.error);
