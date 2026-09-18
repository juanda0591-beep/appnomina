import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { restaurarRespaldo } from './restaurar.js'
import { servidorPrueba, datosCliente, ficha } from '../tests/portal-helper.mjs'

test('WhatsApp API: permisos, consentimientos, ofertas, notificaciones y restauración', { timeout: 60000 }, async (t) => {
  const { request: r, admin, carpeta } = await servidorPrueba(t)
  const a = (path, method = 'GET', body) => r(path, method, body, admin)
  assert.equal((await r('/whatsapp/estado')).status, 401)
  const datos = { ...datosCliente(), ofertas: true, notificaciones: true }
  assert.equal((await r('/portal/registro', 'POST', datos)).status, 201)
  const cuenta = (await a('/portal-admin/cuentas')).data[0]
  await a(`/portal-admin/cuentas/${cuenta.id}`, 'PUT', { estado: 'aprobado' })
  const login = await r('/portal/login', 'POST', datos), cookie = { Cookie: login.cookie }
  const c = (path, method = 'GET', body) => r('/portal' + path, method, body, cookie)
  assert.equal((await r('/whatsapp/estado', 'GET', undefined, cookie)).status, 401)
  await a('/usuarios', 'POST', { username: 'personal', password: 'prueba123' })
  const emp = (await r('/login', 'POST', { username: 'personal', password: 'prueba123' })).data.token
  assert.equal((await r('/whatsapp/estado', 'GET', undefined, { Authorization: `Bearer ${emp}` })).status, 403)
  assert.equal((await a('/whatsapp/config', 'PUT', { automaticos: true, pausado: true, intervalo: 15 })).status, 200)
  const p = (await a('/productos', 'POST', { nombre: 'Mesa WA', valorVenta: 150000, stockApertura: 20 })).data
  await a(`/portal-admin/productos/${p.id}`, 'PUT', ficha)
  const body = { solicitudId: randomUUID(), direccion: datos.direccion, municipio: datos.municipio, telefono: '3009998888', items: [{ productoId: p.id, varianteId: p.variantes[0].id, cantidad: 2, precio: 150000 }] }
  const pedido = await c('/pedidos', 'POST', body)
  assert.equal(pedido.status, 201)
  await c('/pedidos', 'POST', body)
  let cola = (await a('/whatsapp/mensajes')).data.mensajes
  assert.equal(cola.length, 1); assert.equal(cola[0].telefono, '573001234567', 'Usa el teléfono autorizado de la cuenta, no el de entrega')
  const cambiar = { clienteId: cuenta.clienteId, fechaEntrega: '2026-10-01', items: [{ productoId: p.id, varianteId: p.variantes[0].id, cantidad: 2, precioUnitario: 150000 }] }
  cambiar.clienteId = (await a('/portal-admin/cuentas')).data[0].clienteId
  await a(`/pedidos/${pedido.data.id}`, 'PUT', cambiar)
  await a(`/pedidos/${pedido.data.id}`, 'PUT', cambiar)
  assert.equal((await a('/whatsapp/mensajes')).data.mensajes.filter((m) => m.tipo === 'fecha').length, 1)
  assert.equal((await a(`/pedidos/${pedido.data.id}/convertir`, 'POST', {})).status, 200)
  assert.equal((await a('/whatsapp/mensajes')).data.mensajes.filter((m) => m.tipo === 'venta').length, 1)
  // Una venta independiente no intenta leer la variable pedido.
  assert.equal((await a('/ventas', 'POST', { clienteId: cambiar.clienteId, items: cambiar.items })).status, 200)
  const vista = (await a('/whatsapp/campanas/preparar', 'POST', { texto: 'Oferta para clientes de prueba', cuentas: [cuenta.id] })).data
  assert.match(vista.texto, /BAJA/); assert.equal(vista.destinatarios.length, 1)
  assert.equal((await a(`/whatsapp/campanas/${vista.id}/confirmar`, 'POST', {})).status, 400)
  await c('/preferencias', 'PUT', { ofertas: false, notificaciones: true })
  assert.equal((await a(`/whatsapp/campanas/${vista.id}/confirmar`, 'POST', { confirmado: true })).status, 409)
  await c('/preferencias', 'PUT', { ofertas: true, notificaciones: true })
  const vista2 = (await a('/whatsapp/campanas/preparar', 'POST', { texto: 'Nueva oferta para clientes', cuentas: [cuenta.id] })).data
  assert.equal((await a(`/whatsapp/campanas/${vista2.id}/confirmar`, 'POST', { confirmado: true })).status, 200)
  await a(`/whatsapp/campanas/${vista2.id}/confirmar`, 'POST', { confirmado: true })
  cola = (await a('/whatsapp/mensajes')).data.mensajes
  assert.equal(cola.filter((m) => m.tipo === 'oferta').length, 1)
  assert.equal((await a(`/whatsapp/mensajes/${cola[0].id}`, 'POST', { accion: 'cancelar' })).status, 200)
  assert.equal((await a('/whatsapp/config', 'PUT', { automaticos: true, pausado: false, intervalo: 1 })).status, 400)
  await a('/whatsapp/conexion', 'POST', { accion: 'conectar' })
  assert.equal((await a('/whatsapp/estado')).data.config.pausado, 1)
  await a('/whatsapp/conexion', 'POST', { accion: 'desvincular' })
  await a('/whatsapp/conexion', 'POST', { accion: 'conectar' })
  assert.equal((await a('/whatsapp/estado')).data.config.olvidar, 1, 'Conectar no descarta una desvinculación todavía pendiente')
  // Anulación preserva una notificación, aun después de borrar el pedido original.
  const segundo = (await c('/pedidos', 'POST', { ...body, solicitudId: randomUUID() })).data
  await a(`/pedidos/${segundo.id}`, 'DELETE')
  assert.equal((await a('/whatsapp/mensajes')).data.mensajes.filter((m) => m.tipo === 'anulado').length, 1)
  const copia = (await a('/respaldos', 'POST')).data
  const destino = join(carpeta, 'restaurada-wa.db')
  await restaurarRespaldo(join(carpeta, 'respaldos', copia.nombre), destino)
  const restaurada = new Database(destino, { readonly: true })
  try {
    assert.equal(restaurada.prepare('SELECT conectar FROM wa_config').get().conectar, 0)
    assert.equal(restaurada.prepare('SELECT pausado FROM wa_config').get().pausado, 1)
    assert.equal(restaurada.prepare("SELECT count(*) n FROM wa_mensajes WHERE estado IN ('pendiente','enviando','preparando','revisar','fallido')").get().n, 0)
  } finally { restaurada.close() }
})
