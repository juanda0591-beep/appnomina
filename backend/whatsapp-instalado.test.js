import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { cargarBaileys, estadoAuthSqlite, crearProveedorBaileys } from './whatsapp-baileys.js'

const require = createRequire(new URL('../services/whatsapp/package.json', import.meta.url))
let instalado = false
try { require.resolve('@whiskeysockets/baileys'); instalado = true } catch { /* El servicio es opcional. */ }

test('Baileys instalado: claves reales, protobuf y conexión local sin contactar WhatsApp', { skip: !instalado, timeout: 20000 }, async (t) => {
  const b = await cargarBaileys()
  const carpeta = await mkdtemp(join(tmpdir(), 'baileys-real-'))
  let auth, proveedor, servidor
  t.after(async () => {
    await proveedor?.cerrar()
    if (servidor) { for (const cliente of servidor.clients) cliente.terminate(); await new Promise((r) => servidor.close(r)) }
    auth?.cerrar()
    await rm(carpeta, { recursive: true, force: true })
  })
  auth = await estadoAuthSqlite(b, carpeta)
  const identidad = Buffer.from(auth.state.creds.signedIdentityKey.private)
  const clave = b.proto.Message.AppStateSyncKeyData.fromObject({ keyData: Buffer.from([1, 2, 3]), timestamp: 123 })
  await auth.state.keys.set({ 'app-state-sync-key': { prueba: clave }, session: { ejemplo: Buffer.from([9, 8]) } })
  auth.guardar(); auth.cerrar()
  auth = await estadoAuthSqlite(b, carpeta)
  assert.deepEqual(Buffer.from(auth.state.creds.signedIdentityKey.private), identidad)
  assert.deepEqual((await auth.state.keys.get('session', ['ejemplo'])).ejemplo, Buffer.from([9, 8]))
  const restaurada = (await auth.state.keys.get('app-state-sync-key', ['prueba'])).prueba
  assert.ok(restaurada instanceof b.proto.Message.AppStateSyncKeyData)
  assert.deepEqual(restaurada.keyData, Buffer.from([1, 2, 3]))

  // El socket real conecta exclusivamente a un servidor de prueba en loopback.
  const { WebSocketServer } = require(require.resolve('ws', { paths: [require.resolve('@whiskeysockets/baileys')] }))
  servidor = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(servidor, 'listening')
  const saludo = new Promise((resolve) => servidor.once('connection', (cliente) => cliente.once('message', resolve)))
  const eventos = []
  const local = { ...b, default: (config) => b.default({ ...config, waWebSocketUrl: `ws://127.0.0.1:${servidor.address().port}`, connectTimeoutMs: 5000 }) }
  proveedor = crearProveedorBaileys({ b: local, auth, estado: (e) => eventos.push(e), baja: () => assert.fail('No se esperan bajas'), desvinculado: () => {} })
  const frame = await saludo
  assert.ok(frame.length > 0, 'La implementación real genera su saludo criptográfico')
  assert.equal(eventos[0].estado, 'conectando')
  assert.equal(proveedor.conectado(), false, 'El servidor de prueba no autentica una sesión de WhatsApp')
  await proveedor.cerrar(true)
  assert.notDeepEqual(Buffer.from(auth.state.creds.signedIdentityKey.private), identidad)
})
