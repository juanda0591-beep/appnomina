export class ErrorIA extends Error {
  constructor(message, status = 502) { super(message); this.status = status }
}

function errorConexion(error) {
  const codigo = error?.cause?.code || error?.code
  if (['TimeoutError', 'AbortError'].includes(error?.name) || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(codigo)) {
    return new ErrorIA('OpenAI tardó demasiado en responder. Intenta de nuevo en unos segundos.', 504)
  }
  if (['EACCES', 'EPERM'].includes(codigo)) {
    return new ErrorIA('El entorno donde se inició el servidor bloquea la conexión con OpenAI. Inicia la aplicación desde una terminal normal con acceso a Internet.', 502)
  }
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(codigo)) return new ErrorIA('El servidor no puede resolver api.openai.com. Revisa su conexión a Internet y DNS.', 502)
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(codigo)) {
    return new ErrorIA('No se pudo verificar el certificado de OpenAI. Revisa los certificados o el proxy del servidor.', 502)
  }
  return new ErrorIA('No fue posible conectar con OpenAI. Revisa la conexión a Internet del servidor y vuelve a intentar.', 502)
}

async function errorProveedor(response) {
  // No mostrar mensajes crudos: el proveedor podría devolver parte de la solicitud o credenciales.
  const datos = await response.json?.().catch(() => ({})) || {}
  const codigo = datos.error?.code, parametro = datos.error?.param
  if (response.status === 401) return new ErrorIA('OpenAI rechazó la clave API. Revisa OPENAI_API_KEY en el servidor y reinícialo después de corregirla.', 502)
  if (response.status === 429 && ['insufficient_quota', 'billing_hard_limit_reached'].includes(codigo)) {
    return new ErrorIA('La cuenta de API de OpenAI no tiene cuota disponible. Revisa su saldo y límites de facturación; la suscripción de ChatGPT es independiente.', 429)
  }
  if (response.status === 429) return new ErrorIA('OpenAI alcanzó el límite temporal de solicitudes. Espera unos segundos e intenta de nuevo.', 429)
  if (codigo === 'model_not_found' || parametro === 'model') return new ErrorIA('El modelo configurado no está disponible para esta clave. Revisa OPENAI_MODEL y el acceso al modelo en el servidor.', 502)
  if (response.status === 403) return new ErrorIA('OpenAI rechazó el acceso de esta cuenta o proyecto. Revisa los permisos de la clave API.', 502)
  if (codigo === 'invalid_json_schema' || (typeof parametro === 'string' && parametro.startsWith('text.format'))) {
    return new ErrorIA('OpenAI rechazó el formato de respuesta del asistente. Se debe revisar su compatibilidad con el modelo configurado.', 502)
  }
  if (response.status >= 500) return new ErrorIA('OpenAI no está disponible en este momento. Intenta de nuevo más tarde.', 502)
  return new ErrorIA('OpenAI rechazó la solicitud. Revisa la configuración del modelo y vuelve a intentar.', 502)
}

export async function solicitarBorrador({ descripcion, contexto, instructions, schema, name, maxTokens = 2500 }, {
  apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL, fetchImpl = fetch,
} = {}) {
  if (typeof descripcion !== 'string' || descripcion.trim().length < 5 || descripcion.length > 4000) {
    throw new ErrorIA('Escribe una descripción entre 5 y 4000 caracteres.', 400)
  }
  apiKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  model = typeof model === 'string' ? model.trim() : ''
  if (!apiKey || !model) throw new ErrorIA('La IA aún no está configurada. El administrador debe configurar la conexión en el servidor.', 503)
  let response
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model, store: false, max_output_tokens: maxTokens, instructions,
        input: JSON.stringify({ descripcion: descripcion.trim(), ...contexto }),
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
    })
  } catch (error) {
    throw errorConexion(error)
  }
  if (!response.ok) {
    throw await errorProveedor(response)
  }
  let data
  try { data = await response.json() } catch { throw new ErrorIA('La IA devolvió una respuesta no válida.') }
  if (data.status !== 'completed') {
    if (data.incomplete_details?.reason === 'max_output_tokens') throw new ErrorIA('La respuesta de IA superó el tamaño disponible. Consulta menos piezas o divide el diseño en partes.')
    throw new ErrorIA('La IA no completó el borrador. Intenta con una descripción más corta.')
  }
  const contenido = (Array.isArray(data.output) ? data.output : []).flatMap((o) => Array.isArray(o.content) ? o.content : [])
  if (contenido.some((c) => c.type === 'refusal')) throw new ErrorIA('La IA no pudo procesar esta descripción. Reformúlala.', 422)
  try { return JSON.parse(contenido.filter((c) => c.type === 'output_text').map((c) => c.text).join('')) }
  catch { throw new ErrorIA('La IA devolvió un borrador no válido. Intenta de nuevo.') }
}
