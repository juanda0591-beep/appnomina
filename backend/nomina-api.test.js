import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'

test('API: pago concurrente, historial completo, permisos y anulacion', { timeout: 30000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'nomina-api-'))
  const reserva = createServer().listen(0, '127.0.0.1')
  await once(reserva, 'listening')
  const port = reserva.address().port
  await new Promise((resolve) => reserva.close(resolve))
  const proceso = spawn(process.execPath, ['backend/server.js'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, DB_PATH: join(carpeta, 'prueba.db'), PORT: String(port), OPENAI_API_KEY: '', BACKUP_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (proceso.exitCode === null) {
      const salida = once(proceso, 'exit')
      proceso.kill()
      await salida
    }
    await rm(carpeta, { recursive: true, force: true })
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no inicio')), 10000)
    proceso.once('error', (e) => { clearTimeout(timer); reject(e) })
    proceso.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Servidor termino: ${code}`)) })
    proceso.stdout.on('data', (data) => {
      if (data.toString().includes('http://localhost:')) { clearTimeout(timer); resolve() }
    })
  })
  const base = `http://127.0.0.1:${port}/api`
  let token
  const request = async (path, method = 'GET', body, credencial = token) => {
    const res = await fetch(base + path, { method, signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, data: await res.json() }
  }
  token = (await request('/login', 'POST', { username: 'admin', password: 'admin123' })).data.token
  const empleado = (await request('/empleados', 'POST', { nombre: 'Prueba nomina' })).data
  const producto = (await request('/productos', 'POST', { nombre: 'Mesa prueba', procesos: [{ nombre: 'Armado', pago: 100, materiales: [], piezas: [] }] })).data
  const prestamo = (await request('/prestamos', 'POST', { empleadoId: empleado.id, monto: 80, fecha: '2026-09-05', descripcion: 'Adelanto' })).data
  const tarea = (await request('/tareas', 'POST', { empleadoId: empleado.id, productoId: producto.id, procesoId: producto.procesos[0].id, cantidad: 2 })).data
  assert.equal((await request(`/tareas/${tarea.id}/terminar`, 'POST')).status, 200)
  const p = { solicitudId: randomUUID(), empleadoId: empleado.id, fecha: '2026-09-05',
    items: [{ productoId: producto.id, procesoId: producto.procesos[0].id, tareaId: tarea.id, cantidad: 2, pago: 100, subtotal: 200 }],
    tareaIds: [tarea.id], descuentos: [{ prestamoId: prestamo.id, monto: 30 }], subtotal: 200, totalDescuentos: 30,
    extra: 20, extraDetalle: 'Bono', descuentoTrabajo: 10, descuentoTrabajoDetalle: 'Ajuste', total: 180 }
  assert.equal((await request('/nominas', 'POST', p, '')).status, 401)
  await request('/usuarios', 'POST', { username: 'consulta', password: 'prueba123', permisos: { nomina: { ver: true, crear: false } } })
  const consulta = (await request('/login', 'POST', { username: 'consulta', password: 'prueba123' })).data.token
  assert.equal((await request('/nominas', 'POST', p, consulta)).status, 403)
  const [a, b] = await Promise.all([request('/nominas', 'POST', p), request('/nominas', 'POST', p)])
  assert.equal(a.status, 200, JSON.stringify(a.data))
  assert.equal(b.status, 200, JSON.stringify(b.data))
  assert.equal(a.data.id, b.data.id)
  assert.equal((await request('/nominas', 'POST', { ...p, solicitudId: randomUUID() })).status, 409)
  const historial = (await request('/nominas')).data
  assert.equal(historial.length, 1)
  assert.deepEqual(historial[0], a.data)
  assert.equal(historial[0].extraDetalle, 'Bono')
  assert.equal(historial[0].descuentoTrabajoDetalle, 'Ajuste')
  assert.equal(historial[0].prestamosEmpleado[0].saldoNuevo, 50)
  assert.equal((await request(`/nominas/${a.data.id}`, 'DELETE', { motivo: 'Correccion de pago' })).status, 200)
  assert.equal((await request(`/nominas/${a.data.id}`, 'DELETE', { motivo: 'Correccion de pago' })).status, 200)
  assert.equal((await request('/prestamos')).data[0].saldo, 80)
  assert.equal((await request('/tareas')).data[0].estado, 'terminada')
  assert.equal((await request('/nominas', 'POST', p)).status, 409)
})
