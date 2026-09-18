import test from 'node:test'
import assert from 'node:assert/strict'
import { solicitarBorrador } from './ia-client.js'

const solicitud = { descripcion: 'Consulta de prueba', contexto: {}, instructions: 'Prueba', schema: {}, name: 'prueba' }
const enviar = (fetchImpl) => solicitarBorrador(solicitud, { apiKey: 'clave-secreta', model: 'modelo', fetchImpl })
test('IA: distingue bloqueo del entorno, DNS y timeout sin revelar detalles privados', async () => {
  for (const [code, esperado] of [['EACCES', /entorno.*bloquea/], ['EPERM', /terminal normal/], ['ENOTFOUND', /DNS/], ['ETIMEDOUT', /tardó/], ['SELF_SIGNED_CERT_IN_CHAIN', /certificado/]]) {
    await assert.rejects(enviar(async () => { throw Object.assign(new Error('clave-secreta'), { cause: { code } }) }),
      (e) => esperado.test(e.message) && !e.message.includes('clave-secreta'))
  }
})
test('IA: distingue clave, cuota, límites, modelo y esquema rechazado', async () => {
  for (const [status, code, param, esperado] of [
    [401, 'invalid_api_key', null, /clave API/], [429, 'insufficient_quota', null, /facturación/],
    [429, 'rate_limit_exceeded', null, /temporal/], [404, 'model_not_found', null, /modelo.*disponible/],
    [400, 'invalid_json_schema', 'text.format.schema', /formato/], [403, null, null, /permisos/], [500, null, null, /disponible/],
  ]) await assert.rejects(enviar(async () => ({ ok: false, status, json: async () => ({ error: { code, param, message: 'clave-secreta' } }) })),
    (e) => esperado.test(e.message) && !e.message.includes('clave-secreta'))
  await assert.rejects(enviar(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html') } })), /OpenAI/)
})
test('IA: limita respuestas incompletas e ignora espacios de configuración', async () => {
  await assert.rejects(enviar(async () => ({ ok: true, json: async () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) })), /menos piezas/)
  const r = await solicitarBorrador(solicitud, { apiKey: ' clave-secreta ', model: ' modelo ', fetchImpl: async (_, opciones) => {
    assert.equal(opciones.headers.Authorization, 'Bearer clave-secreta')
    assert.equal(JSON.parse(opciones.body).model, 'modelo')
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }] }) }
  } })
  assert.deepEqual(r, { ok: true })
})
