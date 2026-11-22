/**
 * OTAKU HUB — Guardia de autenticación para el Web App de Apps Script.
 *
 * INSTALACIÓN (resumen, detalle en docs/SEGURIDAD.md):
 *   1. En tu proyecto de Apps Script, renombra tus funciones actuales:
 *        doGet(e)  ->  handleGet(e)
 *        doPost(e) ->  handlePost(e)
 *   2. Crea un archivo nuevo "Auth.gs" y pega este código.
 *   3. Configuración del proyecto -> Propiedades del script -> añade:
 *        OTAKU_HUB_KEY = <una clave larga y aleatoria>
 *   4. Implementar -> Gestionar implementaciones -> editar -> "Nueva versión".
 *
 * Desde ese momento, cualquier lectura o escritura sin la clave correcta
 * recibe {status:"error", message:"UNAUTHORIZED"} y NO toca tus hojas.
 *
 * El "ping" devuelve también la versión de Code.gs (OTAKU_API_VERSION): la app
 * la usa para no enviar acciones nuevas a un backend antiguo.
 */

const OTAKU_AUTH_PROPERTY = 'OTAKU_HUB_KEY';

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = params.callback;

  if (!otakuIsAuthorized_(params.key)) {
    return otakuRespond_({ status: 'error', message: 'UNAUTHORIZED' }, callback);
  }
  if (params.action === 'ping') {
    var version = (typeof OTAKU_API_VERSION !== 'undefined') ? OTAKU_API_VERSION : 1;
    return otakuRespond_({ status: 'success', auth: 'ok', version: version }, callback);
  }
  // Quitar la clave antes de pasar la petición a tu lógica original.
  delete e.parameter.key;
  return handleGet(e);
}

function doPost(e) {
  let body = null;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    body = null;
  }

  if (!body || !otakuIsAuthorized_(body.key)) {
    return otakuRespond_({ status: 'error', message: 'UNAUTHORIZED' });
  }

  // Quitar la clave para que nunca llegue a escribirse en una hoja.
  delete body.key;
  e.postData = { contents: JSON.stringify(body), type: e.postData.type, length: e.postData.length, name: e.postData.name };
  return handlePost(e);
}

/** Compara la clave recibida con la guardada, en tiempo constante. */
function otakuIsAuthorized_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty(OTAKU_AUTH_PROPERTY);
  let ok = false;
  if (expected && typeof provided === 'string' && provided.length > 0) {
    const a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, provided);
    const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expected);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    ok = diff === 0;
  }
  // Cada intento fallido tarda 1 s más: frena a quien pruebe claves a ciegas
  // sin bloquear a nadie (un bloqueo global permitiría que te bloquearan a ti).
  if (!ok) Utilities.sleep(1000);
  return ok;
}

/** Responde en JSON o JSONP (validando el nombre del callback). */
function otakuRespond_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][\w$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
