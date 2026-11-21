# Seguridad: hacer OTAKU HUB privado

## El problema

La app llama a un Web App de Google Apps Script (`WEB_APP_URL` en
`js/config.js`). Ese Web App está desplegado con acceso **"Cualquier usuario"**
y no comprobaba nada, así que **cualquiera que conociera la URL podía leer tus
listas y añadir/modificar filas en tus Google Sheets**.

Poner el repositorio en privado **no soluciona esto por sí solo**: la URL
aparece en el código de la página publicada (cualquiera que la abra la ve) y
además ya está en el historial de git. La solución real es que el servidor
exija una clave.

## La solución (ya implementada en el cliente)

- `js/core/auth.js` añade tu clave a **todas** las peticiones (lecturas JSONP
  y escrituras POST) y muestra una pantalla de bloqueo hasta que introduces la
  clave correcta. La clave solo se guarda en `localStorage` de tu dispositivo,
  **nunca en el repositorio**.
- `apps-script/Auth.gs` es la guardia del servidor: rechaza con `UNAUTHORIZED`
  cualquier petición sin la clave correcta, antes de tocar tus hojas.

## Pasos que tienes que hacer tú (≈5 minutos)

### 1. Genera una clave larga
Usa algo largo y aleatorio (32+ caracteres). Por ejemplo, en la consola del
navegador:

```js
crypto.randomUUID() + crypto.randomUUID()
```

Guárdala en tu gestor de contraseñas.

### 2. Actualiza el proyecto de Apps Script
1. Abre tu proyecto en <https://script.google.com>.
2. En tu archivo actual, **renombra** `function doGet(e)` → `function handleGet(e)`
   y `function doPost(e)` → `function handlePost(e)`. (No cambies nada más.)
3. Crea un archivo nuevo **Auth.gs** y pega el contenido de
   [`apps-script/Auth.gs`](../apps-script/Auth.gs).
4. ⚙️ **Configuración del proyecto → Propiedades del script → Añadir
   propiedad**: nombre `OTAKU_HUB_KEY`, valor = tu clave.
5. **Implementar → Gestionar implementaciones → ✏️ editar → Versión: Nueva
   versión → Implementar.** (Editar la implementación existente mantiene la
   misma URL, así no hay que tocar `js/config.js`.)

### 3. Entra en la app
Abre OTAKU HUB, introduce la clave en la pantalla de bloqueo y listo. Cada
dispositivo la pide una vez. El botón 🔒 de la barra cierra la sesión en ese
dispositivo.

### 4. Comprueba que funciona
Abre en una ventana de incógnito:

```
<TU_WEB_APP_URL>?callback=test
```

Debe responder `test({"status":"error","message":"UNAUTHORIZED"})`. Si
devuelve tus datos, el paso 2 no se aplicó (revisa que creaste una *nueva
versión* de la implementación).

## Repositorio privado (opcional)

Con la clave activa, que el código sea público ya no permite modificar tus
listas. Aun así, si lo prefieres privado:

- GitHub → repo → **Settings → General → Danger Zone → Change visibility →
  Private**.
- ⚠️ **GitHub Pages en repositorios privados requiere un plan de pago (GitHub
  Pro)**. Con la cuenta gratuita, al hacerlo privado la web publicada dejará de
  funcionar. Alternativas gratuitas: mantener el repo público (seguro gracias a
  la clave), o desplegar desde un repo privado en Cloudflare Pages / Netlify /
  Vercel.

## Si alguna vez se filtra la clave
Cambia el valor de `OTAKU_HUB_KEY` en las Propiedades del script (efecto
inmediato, sin redesplegar) y vuelve a introducirla en tus dispositivos.

## Notas
- En las lecturas la clave viaja en la URL (JSONP no permite cabeceras). Va por
  HTTPS, pero puede quedar en los registros de ejecución de Google y en el
  historial de red del navegador; es aceptable para una app personal.
- El Service Worker no cachea nada de `script.google.com` (solo los archivos de
  la propia app).
- `<meta name="robots" content="noindex">` evita que los buscadores indexen la
  página.
