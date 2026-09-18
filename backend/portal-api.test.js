import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import sharp from 'sharp'
import { servidorPrueba, datosCliente, ficha } from '../tests/portal-helper.mjs'
import { restaurarRespaldo } from './restaurar.js'

test('Portal mayorista: aprobación, aislamiento, catálogo, pedidos, reintentos y revocación', { timeout: 60000 }, async (t) => {
  const { request: r, admin, carpeta } = await servidorPrueba(t)
  const a = (p, m = 'GET', b) => r(p, m, b, admin)
  assert.equal((await r('/portal/productos')).status, 401)
  assert.equal((await r('/portal/config')).status, 200)
  assert.equal((await r('/portal-admin/productos')).status, 401)
  assert.equal((await r('/portal/registro', 'POST', datosCliente(), { Origin: 'https://ajeno.com' })).status, 403)
  assert.equal((await r('/portal/registro', 'POST', datosCliente(), { 'X-Portal': '' })).status, 403)
  const registro = datosCliente()
  assert.equal((await r('/portal/registro', 'POST', registro)).status, 201)
  assert.equal((await r('/portal/registro', 'POST', registro)).status, 409)
  assert.equal((await r('/portal/login', 'POST', registro)).status, 403)
  const cuenta = (await a('/portal-admin/cuentas')).data[0]
  assert.ok(!JSON.stringify(cuenta).includes('salt'))
  const cliente = (await a('/clientes', 'POST', { nombre: registro.negocio, cedula: registro.nit, correo: registro.correo })).data
  assert.equal((await a(`/portal-admin/cuentas/${cuenta.id}`, 'PUT', { estado: 'aprobado' })).status, 409)
  assert.equal((await a(`/portal-admin/cuentas/${cuenta.id}`, 'PUT', { estado: 'aprobado', clienteId: cliente.id })).status, 200)
  assert.equal((await a('/clientes')).data.length, 1)
  const login = await r('/portal/login', 'POST', registro)
  assert.equal(login.status, 200)
  assert.match(login.headers.get('set-cookie'), /HttpOnly/)
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/)
  const cookie = { Cookie: login.cookie }
  const c = (p, m = 'GET', b) => r('/portal' + p, m, b, cookie)
  for (const path of ['/clientes', '/nominas', '/usuarios', '/productos', '/portal-admin/cuentas']) assert.equal((await r(path, 'GET', undefined, cookie)).status, 401, path)
  assert.equal((await r('/portal/productos', 'GET', undefined, admin)).status, 401)
  assert.equal((await a(`/clientes/${cliente.id}`, 'DELETE')).status, 409)
  const p = (await a('/productos', 'POST', { nombre: 'Armario comercial', valorVenta: 200000, valorCompra: 80000, stockApertura: 10 })).data
  const oculto = (await a('/productos', 'POST', { nombre: 'Solo interno', valorVenta: 120000, stockApertura: 0 })).data
  assert.deepEqual((await c('/productos')).data, [])
  const foto = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#b88b65' } }).png().toBuffer()
  assert.equal((await a(`/portal-admin/productos/${p.id}`, 'PUT', { ...ficha, imagen: `data:image/png;base64,${foto.toString('base64')}` })).status, 200)
  const lista = await c('/productos')
  assert.equal(lista.headers.get('cache-control'), 'no-store')
  assert.equal(lista.data.length, 1)
  assert.equal(lista.data[0].precio, 150000)
  assert.equal(lista.data[0].tieneImagen, true)
  for (const secreto of ['valorCompra', 'valor_compra', 'procesos', 'materiales', 'precioBase']) assert.ok(!JSON.stringify(lista.data).includes(secreto))
  assert.equal((await c(`/productos/${p.id}/imagen`)).headers.get('content-type'), 'image/webp')
  assert.equal((await r(`/portal/productos/${p.id}/imagen`)).status, 401)
  const pedido = { solicitudId: randomUUID(), direccion: registro.direccion, municipio: registro.municipio, telefono: registro.telefono,
    comentario: 'Llamar antes de entregar', items: [{ productoId: p.id, varianteId: p.variantes[0].id, cantidad: 2, precio: 150000 }] }
  assert.equal((await c('/pedidos', 'POST', { ...pedido, items: [{ ...pedido.items[0], cantidad: 1 }] })).status, 409)
  assert.equal((await c('/pedidos', 'POST', { ...pedido, items: [{ ...pedido.items[0], precio: 1 }] })).status, 409)
  assert.equal((await c('/pedidos', 'POST', { ...pedido, items: [{ ...pedido.items[0], cantidad: -2 }] })).status, 400)
  assert.equal((await c('/pedidos', 'POST', { ...pedido, items: [{ ...pedido.items[0], varianteId: oculto.variantes[0].id }] })).status, 409)
  assert.equal((await c('/pedidos', 'POST', { ...pedido, items: [pedido.items[0], pedido.items[0]] })).status, 400)
  const [uno, dos] = await Promise.all([c('/pedidos', 'POST', { ...pedido, clienteId: 999, total: 1 }), c('/pedidos', 'POST', pedido)])
  assert.deepEqual([uno.status, dos.status].sort(), [200, 201])
  assert.equal(uno.data.id, dos.data.id)
  assert.equal(uno.data.total, 300000)
  assert.equal((await a('/pedidos')).data.length, 1)
  const interno = (await a('/pedidos')).data[0]
  assert.equal(interno.clienteId, cliente.id)
  assert.equal(interno.origen, 'portal')
  assert.equal(interno.entregaPortal.direccion, registro.direccion)
  assert.equal((await a(`/pedidos/${uno.data.id}`, 'PUT', { ...interno, clienteId: 999 })).status, 409)
  assert.equal((await a(`/pedidos/${uno.data.id}/convertir`, 'POST', { clienteId: 999 })).status, 409)
  assert.equal((await c('/pedidos', 'POST', { ...pedido, comentario: 'Cambio' })).status, 409)
  // Una nueva cuenta jamás ve el pedido de la primera ni pedidos internos ajenos.
  const segundo = datosCliente('segundo@ejemplo.com')
  assert.equal((await r('/portal/registro', 'POST', segundo)).status, 201)
  const cuenta2 = (await a('/portal-admin/cuentas')).data.find((c) => c.correo === segundo.correo)
  assert.equal((await a(`/portal-admin/cuentas/${cuenta2.id}`, 'PUT', { estado: 'aprobado' })).status, 200)
  const login2 = await r('/portal/login', 'POST', segundo)
  assert.equal((await r(`/portal/pedidos/${uno.data.id}`, 'GET', undefined, { Cookie: login2.cookie })).status, 404)
  assert.deepEqual((await r('/portal/pedidos', 'GET', undefined, { Cookie: login2.cookie })).data, [])
  // Disponibilidad considera el pedido pendiente y las líneas internas sin variante.
  await a(`/portal-admin/productos/${p.id}`, 'PUT', { ...ficha, modalidad: 'stock' })
  assert.equal((await c('/productos')).data[0].variantes[0].disponible, 8)
  assert.equal((await c('/pedidos', 'POST', { ...pedido, solicitudId: randomUUID(), items: [{ ...pedido.items[0], cantidad: 9 }] })).status, 409)
  const [stock1, stock2] = await Promise.all([1, 2].map(() => c('/pedidos', 'POST', { ...pedido, solicitudId: randomUUID(), items: [{ ...pedido.items[0], cantidad: 5 }] })))
  assert.deepEqual([stock1.status, stock2.status].sort(), [201, 409])
  await a(`/portal-admin/productos/${p.id}`, 'PUT', { ...ficha, precio: 160000 })
  assert.equal((await c('/pedidos', 'POST', { ...pedido, solicitudId: randomUUID() })).status, 409)
  assert.equal((await c('/pedidos', 'POST', pedido)).status, 200, 'Un reintento ya guardado ignora cambios posteriores de precio')
  await a(`/portal-admin/productos/${p.id}`, 'PUT', { ...ficha, publicado: false })
  assert.deepEqual((await c('/productos')).data, [])
  assert.equal((await c(`/productos/${p.id}/imagen`)).status, 404)
  assert.equal((await c('/pedidos', 'POST', { ...pedido, solicitudId: randomUUID() })).status, 409)
  assert.equal((await c('/pedidos')).data.length, 2)
  await a(`/pedidos/${uno.data.id}`, 'DELETE')
  assert.equal((await c('/pedidos', 'POST', pedido)).status, 409, 'Un pedido borrado no se recrea al reintentar')
  assert.equal((await c('/pedidos')).data.find((p) => p.id === null).estado, 'anulado')
  const vigente = (await c('/pedidos')).data.find((p) => p.id !== null)
  const venta = await a(`/pedidos/${vigente.id}/convertir`, 'POST', {})
  assert.equal(venta.status, 200, JSON.stringify(venta.data))
  assert.equal((await c(`/pedidos/${vigente.id}`)).data.estado, 'entregado')
  assert.equal((await a('/productos')).data.find((x) => x.id === p.id).variantes[0].stock, 5)
  // Respaldo/restauración revoca ambas clases de sesión.
  const copia = (await a('/respaldos', 'POST')).data
  const restaurada = join(carpeta, 'restaurada.db')
  await restaurarRespaldo(join(carpeta, 'respaldos', copia.nombre), restaurada)
  const lectura = new Database(restaurada, { readonly: true })
  try { assert.equal(lectura.prepare('SELECT count(*) n FROM portal_sesiones').get().n, 0); assert.equal(lectura.prepare('SELECT count(*) n FROM sesiones').get().n, 0) } finally { lectura.close() }
  // Contraseña y suspensión invalidan todas las sesiones.
  assert.equal((await c('/password', 'POST', { actual: registro.password, nueva: 'NuevaMayorista2026' })).status, 200)
  assert.equal((await c('/sesion')).status, 401)
  const nuevo = await r('/portal/login', 'POST', { correo: registro.correo, password: 'NuevaMayorista2026' })
  assert.equal(nuevo.status, 200)
  await a(`/portal-admin/cuentas/${cuenta.id}`, 'PUT', { estado: 'suspendido' })
  assert.equal((await r('/portal/sesion', 'GET', undefined, { Cookie: nuevo.cookie })).status, 401)
  await a(`/portal-admin/cuentas/${cuenta.id}`, 'PUT', { estado: 'aprobado' })
  assert.equal((await r('/portal/sesion', 'GET', undefined, { Cookie: nuevo.cookie })).status, 401)
  await a(`/portal-admin/cuentas/${cuenta.id}/password`, 'POST', { nueva: 'Recuperacion2026!' })
  assert.equal((await r('/portal/login', 'POST', { correo: registro.correo, password: 'NuevaMayorista2026' })).status, 401)
  const recuperado = await r('/portal/login', 'POST', { correo: registro.correo, password: 'Recuperacion2026!' })
  assert.equal(recuperado.status, 200)
  assert.equal((await r('/portal/logout', 'POST', {}, { Cookie: recuperado.cookie })).status, 200)
  assert.equal((await r('/portal/sesion', 'GET', undefined, { Cookie: recuperado.cookie })).status, 401)
  // La administración exige rol admin, aun si un empleado tiene permisos amplios.
  await a('/usuarios', 'POST', { username: 'empleado', password: 'prueba123', rol: 'usuario' })
  const empleado = (await r('/login', 'POST', { username: 'empleado', password: 'prueba123' })).data.token
  assert.equal((await r('/portal-admin/cuentas', 'GET', undefined, { Authorization: `Bearer ${empleado}` })).status, 403)
  for (let i = 0; i < 10; i++) assert.equal((await r('/portal/login', 'POST', { correo: 'inexistente@ejemplo.com', password: 'incorrecta' })).status, 401)
  assert.equal((await r('/portal/login', 'POST', { correo: 'inexistente@ejemplo.com', password: 'incorrecta' })).status, 429)
  assert.equal((await r('/portal/registro', 'POST', { relleno: 'a'.repeat(70000) })).status, 413)
})
