export class ErrorIA extends Error {
  constructor(message, status = 502) { super(message); this.status = status }
}

export async function solicitarBorrador({ descripcion, contexto, instructions, schema, name, maxTokens = 2500 }, {
  apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL, fetchImpl = fetch,
} = {}) {
  if (typeof descripcion !== 'string' || descripcion.trim().length < 5 || descripcion.length > 4000) {
    throw new ErrorIA('Escribe una descripción entre 5 y 4000 caracteres.', 400)
  }
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
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw new ErrorIA('La IA tardó demasiado. Intenta de nuevo.', 504)
    throw new ErrorIA('No fue posible conectar con la IA. Intenta más tarde.', 502)
  }
  if (!response.ok) {
    if (response.status === 429) throw new ErrorIA('El servicio de IA alcanzó su límite de uso. Intenta más tarde o revisa el saldo de la API.', 429)
    throw new ErrorIA('El servicio de IA rechazó la solicitud. El administrador debe revisar la configuración.', 502)
  }
  let data
  try { data = await response.json() } catch { throw new ErrorIA('La IA devolvió una respuesta no válida.') }
  if (data.status !== 'completed') throw new ErrorIA('La IA no completó el borrador. Intenta con una descripción más corta.')
  const contenido = (Array.isArray(data.output) ? data.output : []).flatMap((o) => Array.isArray(o.content) ? o.content : [])
  if (contenido.some((c) => c.type === 'refusal')) throw new ErrorIA('La IA no pudo procesar esta descripción. Reformúlala.', 422)
  try { return JSON.parse(contenido.filter((c) => c.type === 'output_text').map((c) => c.text).join('')) }
  catch { throw new ErrorIA('La IA devolvió un borrador no válido. Intenta de nuevo.') }
}
