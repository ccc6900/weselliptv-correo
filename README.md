# weselliptv-correo

Herramienta manual para consultar la bandeja de entrada GMX y extraer los datos de un correo de respuesta M3U. No envía solicitudes al proveedor ni rota alias.

## Configuración

En **Settings → Secrets and variables → Actions**, crea estos secretos:

- `GMX_USER`: dirección de la cuenta GMX que recibe los mensajes.
- `GMX_PASS`: contraseña de aplicación o contraseña de la cuenta, según la configuración de GMX.

No guardes contraseñas ni enlaces M3U reales en los archivos del repositorio.

## Uso

1. Abre **Actions**.
2. Selecciona **Leer respuesta M3U de GMX**.
3. Pulsa **Run workflow**.
4. Cuando termine, abre la ejecución y descarga el artefacto `resultado-correo-m3u`.
5. Descomprime el ZIP y abre `index.html` en tu navegador; selecciona el `result.json` descargado.

El resultado se guarda como artefacto con retención de un día y no se confirma en Git, porque puede contener credenciales.

## Límites

El lector revisa hasta los últimos 100 mensajes de la bandeja INBOX y busca un mensaje con un enlace M3U y campos de acceso. El formato del correo puede requerir ajustes. Este proyecto no automatiza solicitudes repetidas ni la rotación de alias para evitar límites de pruebas gratuitas.
