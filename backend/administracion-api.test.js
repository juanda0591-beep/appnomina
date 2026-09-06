import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import Database from 'better-sqlite3'
import { restaurarRespaldo } from './restaurar.js'

test('API: sesiones revocables, auditoria financiera y respaldo descargable restaurable', { timeout: 60000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'administracion-api-'))
  const reserva = createServer().listen(0, '127.0.0.1')
  await once(reserva, 'listening')
  const port = reserva.address().port
  await new Promise((resolve) => reserva.close(resolve))
  const proceso = spawn(process.execPath, ['backend/server.js'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, DB_PATH: join(carpeta, 'prueba.db'), PORT: String(port),
      BACKUP_ENABLED: 'false', BACKUP_DIR: join(carpeta, 'respaldos'), BACKUP_RETENTION: '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (proceso.exitCode === null) { const salida = once(proceso, 'exit'); proceso.kill(); await salida }
    await rm(carpeta, { recursive: true, force: true })
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no inicio')), 10000)
    proceso.once('error', (e) => { clearTimeout(timer); reject(e) })
    proceso.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Servidor termino: ${code}`)) })
    proceso.stdout.on('data', (data) => { if (data.toString().includes('http://localhost:')) { clearTimeout(timer); resolve() } })
  })
  const base = `http://127.0.0.1:${port}/api`
  let token
  const request = async (path, method = 'GET', body, credencial = token) => {
    const res = await fetch(base + path, { method, signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, data: await res.json() }
  }
  token = (await request('/login', 'POST', { username: 'admin', password: 'admin123' })).data.token
  const otraSesion = (await request('/login', 'POST', { username: 'admin', password: 'admin123' })).data.token
  assert.equal((await request('/logout', 'POST', {}, otraSesion)).status, 200)
  assert.equal((await request('/sesion', 'GET', undefined, otraSesion)).status, 401)
  assert.equal((await request('/sesion')).status, 200)
  const usuario = (await request('/usuarios', 'POST', { username: 'consulta', password: 'prueba123', permisos: { nomina: { ver: true } } })).data
  const consulta = (await request('/login', 'POST', { username: 'consulta', password: 'prueba123' })).data.token
  for (const path of ['/auditoria', '/respaldos']) {
    assert.equal((await request(path, 'GET', undefined, consulta)).status, 403)
    assert.equal((await request(path, 'GET', undefined, '')).status, 401)
  }
  assert.equal((await request('/respaldos', 'POST', {}, consulta)).status, 403)
  await request(`/usuarios/${usuario.id}/permisos`, 'PUT', { permisos: {} })
  assert.equal((await request('/sesion', 'GET', undefined, consulta)).status, 401)

  const movimiento = (await request('/movimientos', 'POST', { tipo: 'ingreso', fecha: '2026-09-05', monto: 5000, descripcion: 'Ingreso de prueba' })).data
  assert.equal((await request(`/movimientos/${movimiento.id}`, 'DELETE')).status, 400)
  assert.equal((await request(`/movimientos/${movimiento.id}`, 'DELETE', { motivo: 'Registro equivocado' })).status, 200)
  const historial = (await request('/auditoria?entidad=movimientos&accion=eliminar&usuario=admin')).data
  assert.equal(historial.total, 1)
  assert.equal(historial.registros[0].motivo, 'Registro equivocado')
  assert.equal(historial.registros[0].anterior.monto, 5000)

  // Una venta fallida no descuenta inventario ni deja asientos de auditoria.
  const cliente = (await request('/clientes', 'POST', { nombre: 'Cliente prueba' })).data
  const producto = (await request('/productos', 'POST', { nombre: 'Mesa', stockApertura: 5, procesos: [] })).data
  const datosVenta = { clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 2, precioUnitario: 10000 }], fecha: '2026-09-05', pagoInicial: 0 }
  const antes = (await request('/auditoria')).data.total
  assert.equal((await request('/ventas', 'POST', { ...datosVenta, items: [{ ...datosVenta.items[0], cantidad: 6 }] })).status, 400)
  assert.equal((await request('/auditoria')).data.total, antes)
  const venta = await request('/ventas', 'POST', datosVenta)
  assert.equal(venta.status, 200, JSON.stringify(venta.data))
  assert.equal((await request('/productos')).data[0].stock, 3)
  assert.equal((await request(`/ventas/${venta.data.id}`, 'DELETE', { motivo: 'Pedido cancelado' })).status, 200)
  assert.equal((await request('/productos')).data[0].stock, 5)
  const anulaciones = (await request('/auditoria?entidad=ventas&accion=eliminar')).data.registros
  assert.equal(anulaciones[0].anterior.total, 20000)
  assert.equal(anulaciones[0].motivo, 'Pedido cancelado')
  const ventaCredito = (await request('/ventas', 'POST', datosVenta)).data
  assert.equal((await request(`/ventas/${ventaCredito.id}/pagos`, 'POST', { monto: 5000, metodo: 'efectivo' })).status, 200)
  assert.equal((await request(`/ventas/${ventaCredito.id}/pagos`, 'POST', { monto: 20000 })).status, 400)
  assert.equal((await request('/auditoria?entidad=venta_pagos')).data.registros[0].posterior.monto, 5000)

  const copia = await request('/respaldos', 'POST')
  assert.equal(copia.status, 201, JSON.stringify(copia.data))
  const nombre = copia.data.nombre
  assert.equal((await request(`/respaldos/${nombre}/verificar`, 'POST')).status, 200)
  assert.equal((await request(`/respaldos/${nombre}/descargar`, 'GET', undefined, consulta)).status, 401)
  const descargar = await fetch(`${base}/respaldos/${nombre}/descargar`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(descargar.status, 200)
  assert.match(descargar.headers.get('content-disposition'), /attachment/)
  const archivo = join(carpeta, 'descargada.db')
  await writeFile(archivo, Buffer.from(await descargar.arrayBuffer()))
  const destino = join(carpeta, 'recuperada.db')
  await restaurarRespaldo(archivo, destino)
  const recuperada = new Database(destino, { readonly: true })
  try {
    assert.equal(recuperada.prepare('SELECT COUNT(*) n FROM sesiones').get().n, 0)
    assert.equal(recuperada.prepare('SELECT total FROM ventas').get().total, 20000)
    assert.ok(recuperada.prepare('SELECT COUNT(*) n FROM auditoria').get().n > 0)
  } finally { recuperada.close() }
  const cambio = await request('/cambiar-password', 'POST', { actual: 'admin123', nueva: 'nueva123' })
  assert.equal(cambio.status, 200)
  assert.equal((await request('/sesion')).status, 401)
  token = cambio.data.token
  assert.equal((await request('/sesion')).status, 200)
})
