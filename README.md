# weselliptv-correo

Gestor visual para consultar la bandeja GMX, extraer los datos del último correo de activación M3U y controlar qué correos ya se han utilizado.

## Configuración

En **Settings → Secrets and variables → Actions**, crea:

- `GMX_USER`: cuenta GMX que recibe los correos.
- `GMX_PASS`: contraseña de aplicación o contraseña de la cuenta.

No guardes contraseñas ni enlaces M3U en el código.

## Uso

1. Edita `emails.json` y añade los correos con `"status": "disponible"`.
2. Abre `index.html` desde GitHub Pages o desde el repositorio.
3. Pulsa **Usar siguiente correo disponible**.
4. Registra ese correo en la página de prueba de WeSellIPTV.
5. Cuando llegue la respuesta, abre **Actions → Leer respuesta M3U de GMX → Run workflow**.
6. En `used_email`, pega el correo que acabas de utilizar.
7. Al terminar, el workflow actualiza `result.json` y marca el correo como `usado` en `emails.json`.
8. Abre o recarga `index.html` para ver los datos.

## Seguridad

El repositorio es privado, pero `result.json` contiene credenciales IPTV. No lo hagas público ni compartas el repositorio con personas que no deban ver esas credenciales.
