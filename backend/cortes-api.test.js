import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { proyectoVacio } from '../src/utils/proyectoCorte.js'

test('API cortes: versiones inmutables, recalculo, permisos y rechazo de datos invalidos', { timeout: 30000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'cortes-api-'))
  const reserva = createServer().listen(0, '127.0.0.1'); await once(reserva, 'listening')
  const port = reserva.address().port; await new Promise((resolve) => reserva.close(resolve))
  const proceso = spawn(process.execPath, ['backend/server.js'], { cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, DB_PATH: join(carpeta, 'prueba.db'), PORT: String(port), BACKUP_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(async () => {
    if (proceso.exitCode === null) { const salida = once(proceso, 'exit'); proceso.kill(); await salida }
    await rm(carpeta, { recursive: true, force: true })
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no inicio')), 10000)
    proceso.once('error', (e) => { clearTimeout(timer); reject(e) })
    proceso.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Servidor termino: ${code}`)) })
    proceso.stdout.on('data', (d) => { if (d.toString().includes('http://localhost:')) { clearTimeout(timer); resolve() } })
  })
  let token
  const request = async (path, body, credencial = token, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, data: await res.json() }
  }
  token = (await request('/login', { username: 'admin', password: 'admin123' })).data.token
  const proyecto = { ...proyectoVacio(), material: 'Melamina blanca', piezas: [{ codigo: 'P001', nombre: 'Lateral', ancho: 580, alto: 1800, cantidad: 2, permiteRotar: false, canto: 'der' }] }
  const uno = await request('/planos-corte', { nombre: 'Armario', proyecto, resultado: { costoTotal: 1 } })
  assert.equal(uno.status, 200, JSON.stringify(uno.data))
  assert.equal(uno.data.revision, 1)
  assert.equal(uno.data.raizId, uno.data.id)
  assert.equal(uno.data.resultado.costoTotal, 90000)
  const proyectoDos = { ...proyecto, unidades: 3 }
  const dos = await request('/planos-corte', { nombre: 'Armario', proyecto: proyectoDos, proyectoId: uno.data.id })
  assert.equal(dos.status, 200)
  assert.equal(dos.data.revision, 2)
  assert.equal(dos.data.raizId, uno.data.id)
  const antigua = await request(`/planos-corte/${uno.data.id}`)
  assert.equal(antigua.data.proyecto.unidades, 1)
  assert.equal(antigua.data.resultado.costoTotal, 90000)
  assert.equal((await request('/planos-corte', { nombre: 'Obsoleta', proyecto, proyectoId: uno.data.id })).status, 409)
  const copia = await request('/planos-corte', { nombre: 'Copia', proyecto })
  assert.equal(copia.data.revision, 1)
  assert.notEqual(copia.data.raizId, uno.data.id)
  assert.equal((await request('/planos-corte')).data.length, 3)
  const invalido = { ...proyecto, piezas: [{ ...proyecto.piezas[0], cantidad: 1.5 }] }
  assert.equal((await request('/planos-corte', { nombre: 'Invalido', proyecto: invalido })).status, 400)
  assert.equal((await request('/cortes/calcular', { piezas: invalido.piezas, lamina: proyecto.lamina })).status, 400)
  assert.equal((await request('/planos-corte', { nombre: 'Sin cabida', proyecto: { ...proyecto, margen: 800 } })).status, 400)
  await request('/usuarios', { username: 'lector', password: 'prueba123', permisos: { 'cortes-planos': { ver: true } } })
  const lector = (await request('/login', { username: 'lector', password: 'prueba123' })).data.token
  assert.equal((await request('/planos-corte', undefined, lector)).status, 200)
  assert.equal((await request('/productos', undefined, lector)).status, 200)
  assert.equal((await request('/planos-corte', { nombre: 'No permitido', proyecto }, lector)).status, 403)
  assert.equal((await request('/planos-corte', { nombre: 'No permitido', proyecto, proyectoId: dos.data.id }, lector)).status, 403)
  assert.equal((await request(`/planos-corte/${dos.data.id}`, undefined, lector, 'DELETE')).status, 403)
  assert.equal((await request('/planos-corte', undefined, '')).status, 401)
})
