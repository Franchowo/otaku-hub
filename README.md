# OTAKU HUB

App personal (PWA) para registrar anime y manga, con estadísticas, rankings,
calificador, planificador estacional y más. Los datos viven en Google Sheets
(a través de un Web App de Apps Script) y se enriquecen con la API de AniList.

> 🔒 **Acceso privado:** todas las lecturas y escrituras a Google Sheets
> requieren una clave que se valida en el servidor. Ver
> [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) para configurarla.
>
> ⚙️ **Backend:** el código de Apps Script está en [`apps-script/`](apps-script).
> Cómo desplegarlo: [`docs/APPS-SCRIPT.md`](docs/APPS-SCRIPT.md).

## Estructura

```
otaku-hub/
├── index.html                 # Marcado de la app (vistas/pestañas)
├── manifest.json              # Manifiesto PWA
├── sw.js                      # Service Worker (debe quedarse en la raíz)
├── assets/
│   └── icons/                 # Iconos de la PWA
├── css/
│   ├── styles.css             # Estilos principales
│   └── auth.css               # Pantalla de bloqueo
├── js/
│   ├── config.js              # URL del Web App y constantes globales
│   ├── core/
│   │   ├── utils.js           # esc()/jsArg() anti-inyección y estado de error de vistas
│   │   ├── ui.js              # toast(), confirmDialog(), temporadas y fechas
│   │   ├── auth.js            # Clave de acceso + pantalla de bloqueo
│   │   ├── state.js           # Estado global compartido
│   │   ├── router.js          # Rutas (#/vista), navegación agrupada y hub
│   │   ├── search.js          # Búsqueda global (🔍 / Ctrl+K)
│   │   ├── sortable.js        # Reordenar listas con dedo, ratón o teclado
│   │   ├── charts.js          # Gráficos ligeros (tooltip, tabla equivalente)
│   │   ├── pwa.js             # Registro del Service Worker
│   │   └── fullscreen.js      # Rotación / pantalla completa
│   ├── services/
│   │   ├── anilist.js         # Cliente GraphQL de AniList
│   │   ├── image-queue.js     # Cola de portadas (batching + caché)
│   │   ├── local-store.js     # IndexedDB: copia de las hojas y cola sin conexión
│   │   ├── sheets-api.js      # sheetsRead()/sheetsWrite(): acceso único a Sheets
│   │   ├── anilist-link.js    # Vincular obras registradas con su ID de AniList
│   │   ├── anime-meta.js      # Géneros y media mundial de tus obras (caché 7 días)
│   │   ├── sheets-fetchers.js # Lecturas maestras desde Sheets
│   │   └── cloud-sync.js      # TOP 150, ranking anual, calificador (Sheets)
│   └── views/                 # Lógica de cada pestaña
│       ├── forms.js           # Registrar anime/manga
│       ├── stats.js           # Panel analítico, detalle, librería, cápsula
│       ├── studios.js         # Ranking de estudios
│       ├── recommendations.js
│       ├── calificador.js
│       ├── planificador.js
│       ├── ranker.js          # Opening Ranker
│       ├── gacha.js
│       ├── work-sheet.js      # Ficha de obra: datos de AniList, editar y borrar
│       ├── insights.js        # Tu perfil: tú vs el mundo, géneros, evolución
│       ├── wrapped.js         # Wrapped anual en imagen
│       └── data.js            # Copia de seguridad e importar desde AniList
├── apps-script/
│   ├── Auth.gs                # Guardia de autenticación para Apps Script
│   └── Code.gs                # Lecturas/escrituras en Sheets (backend v5)
├── scripts/
│   └── sw-version.js          # Calcula CACHE_NAME (npm run sw:version)
├── tests/
│   ├── run.js                 # Ejecutor (npm test)
│   ├── unit/                  # Backend y Service Worker (sin navegador)
│   ├── e2e/                   # La app en Chromium (Sheets y AniList simulados)
│   └── online/                # Contra AniList real
└── docs/
    ├── APPS-SCRIPT.md         # Cómo desplegar/actualizar el backend
    └── SEGURIDAD.md           # Cómo activar y mantener el acceso privado
```

Los scripts se cargan en orden al final de `index.html` (scripts clásicos que
comparten el ámbito global, por eso los `onclick="..."` del HTML siguen
funcionando). Si añades un archivo nuevo, inclúyelo también en la lista
`APP_SHELL` de `sw.js` y ejecuta `npm run sw:version` (ver abajo).

## Tema claro y oscuro
El botón 🌓 de la cabecera alterna entre **automático** (sigue al sistema),
**claro** ☀️ y **oscuro** 🌙; la elección se guarda en el dispositivo. Los
colores salen de variables CSS (`--fg-rgb`, `--surface-1`, `--on-accent`…)
definidas al principio de `css/styles.css` y redefinidas para el tema claro al
final. Una prueba (`tests/e2e/contraste-temas.test.js`) recorre todas las
vistas en los dos temas y falla si algún texto no llega al contraste WCAG AA.

## Sin conexión
- La última copia de tus listas se guarda en el dispositivo (IndexedDB): la app
  la muestra al instante al abrirse y la actualiza cuando responde Sheets. Sin
  red, sigues viendo tus datos (con un aviso de la fecha de la copia).
- Lo que registres o edites sin conexión queda en cola (⏳ en la cabecera) y se
  envía solo al volver la red.
- El Service Worker guarda la app, las portadas, la fuente y html2canvas.
- Cerrar sesión (🔒) borra la copia de tus listas de ese dispositivo.

## Desarrollo local

La app no necesita compilarse: basta con servir la carpeta.

```bash
npm run serve        # o: python3 -m http.server 8000
# abre http://localhost:8000
```

### Pruebas y calidad

Requiere Node 20 o superior. La primera vez:

```bash
npm install
npx playwright install chromium
```

| Comando | Qué hace |
|---|---|
| `npm test` | Todas las pruebas: backend de Apps Script (con una hoja simulada) y la app en Chromium (con Sheets y AniList simulados). |
| `npm test -- fase2b` | Solo las suites cuyo nombre contiene `fase2b`. |
| `npm run test:online` | Pruebas contra AniList real (necesitan internet). |
| `npm run lint` | ESLint: detecta errores como usar una variable que nadie declara. |
| `npm run format` | Prettier: aplica el formato del proyecto. |
| `npm run sw:version` | Recalcula `CACHE_NAME` de `sw.js` a partir del contenido de la app. |

Las capturas que generan las pruebas quedan en `tests/output/` (ignorado por git).

GitHub Actions (`.github/workflows/ci.yml`) ejecuta lint, formato y pruebas en
cada pull request y en cada push a `main`. La prueba contra AniList real se
ejecuta cada lunes o a mano desde la pestaña **Actions**.

Una prueba (`tests/unit/service-worker-app-shell.test.js`) avisa si un archivo
de la página falta en `APP_SHELL` de `sw.js` (sin él, la app fallaría sin
conexión) y si `CACHE_NAME` no corresponde al contenido actual. La versión ya
no se sube a mano: es un resumen (hash) de todos los archivos de la app, así
que tras cualquier cambio basta con `npm run sw:version` para que los
navegadores descarguen la versión nueva.
