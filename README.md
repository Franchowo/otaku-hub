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
│   └── Code.gs                # Lecturas/escrituras en Sheets (backend v2)
└── docs/
    ├── APPS-SCRIPT.md         # Cómo desplegar/actualizar el backend
    └── SEGURIDAD.md           # Cómo activar y mantener el acceso privado
```

Los scripts se cargan en orden al final de `index.html` (scripts clásicos que
comparten el ámbito global, por eso los `onclick="..."` del HTML siguen
funcionando). Si añades un archivo nuevo, inclúyelo también en la lista
`APP_SHELL` de `sw.js` y sube la versión de `CACHE_NAME`.

## Sin conexión
- La última copia de tus listas se guarda en el dispositivo (IndexedDB): la app
  la muestra al instante al abrirse y la actualiza cuando responde Sheets. Sin
  red, sigues viendo tus datos (con un aviso de la fecha de la copia).
- Lo que registres o edites sin conexión queda en cola (⏳ en la cabecera) y se
  envía solo al volver la red.
- El Service Worker guarda la app, las portadas, la fuente y html2canvas.
- Cerrar sesión (🔒) borra la copia de tus listas de ese dispositivo.

## Desarrollo local

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```
