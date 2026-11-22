# Actualizar el Apps Script (backend de OTAKU HUB)

El código del servidor vive ahora en el repositorio, en [`apps-script/`](../apps-script):

| Archivo | Qué hace |
|---|---|
| `Auth.gs` | Comprueba la clave en cada petición y responde al `ping` con la versión. |
| `Code.gs` | Lecturas y escrituras en tus hojas (antes `handleGet`/`handlePost` en tu archivo principal). |

La app detecta la versión desplegada. **Mientras no actualices, todo sigue
funcionando como antes**; las mejoras de la versión 2 se activan solas en
cuanto despliegas.

## Qué trae la versión 2
- **La clave deja de viajar en la URL** en las lecturas (van por POST).
- **Columna "AniList ID"** en FULL LIST y FULL LIST MANGA: portadas exactas y
  filtros fiables en Gacha, Recomendaciones y Planificador. Se crea sola al
  final de cada hoja la primera vez que hace falta.
- Botón **🔗 Vincular AniList** (Panel Analítico) para rellenar esa columna en
  las obras que ya tenías.
- **Guardado por fila** en Planificador y Calificador: cada cambio sube solo
  esa obra; dos dispositivos ya no se pisan la lista entera.
- Bloqueo durante las escrituras (dos guardados a la vez no se mezclan).
- Una acción desconocida **ya no registra un anime vacío**, y `updateTab` ya no
  puede vaciar FULL LIST.

## Qué trae la versión 3
- **Editar y borrar** animes y mangas desde la **ficha de obra** (toca cualquier
  portada de tu colección). Solo se modifica la fila si su título sigue
  coincidiendo con el que cargó la app; si la hoja cambió entretanto, la app
  te pide recargar en lugar de tocar otra obra.

## Pasos (≈3 minutos)
1. Abre tu proyecto en <https://script.google.com>.
2. Abre tu archivo principal (el que tenía `handleGet` y `handlePost`, p. ej.
   `Código.gs`), **borra todo su contenido** y pega el de
   [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Abre `Auth.gs`, borra su contenido y pega el de
   [`apps-script/Auth.gs`](../apps-script/Auth.gs).
4. Guarda (💾).
5. **Implementar → Gestionar implementaciones → ✏️ editar → Versión: Nueva
   versión → Implementar.** (Editando la implementación existente la URL no
   cambia.)
6. Recarga la app. Para comprobarlo, registra un anime eligiéndolo en el
   buscador: en tu hoja aparecerá su número en la columna **AniList ID**.
7. Opcional: en el Panel Analítico pulsa **🔗 Vincular AniList** para vincular
   las obras que ya tenías. Revisa unas cuantas filas en la hoja; las que no se
   vinculen con seguridad se listan al final y puedes escribir su ID a mano (es
   el número de la URL en anilist.co, p. ej. `anilist.co/anime/154587/...` →
   `154587`).

> Si algo fallara tras desplegar, en **Gestionar implementaciones** puedes
> volver a la versión anterior en un clic.
