import test from 'node:test'
import assert from 'node:assert/strict'
import { servidorPrueba, ficha } from '../tests/portal-helper.mjs'

test('copy de productos existentes: actualiza solo la descripción interna o comercial', { timeout: 30000 }, async (t) => {
  const { request, admin } = await servidorPrueba(t)
  const r = (path, method = 'GET', body) => request(path, method, body, admin)
  const nuevo = await r('/productos', 'POST', {
    nombre: 'Armario dos cuerpos', descripcion: 'Descripción anterior', valorVenta: 850000,
    valorCompra: 350000, stockApertura: 4, procesos: [{ nombre: 'Armado', pago: 20000, materiales: [], piezas: [] }],
  })
  assert.equal(nuevo.status, 200)
  const id = nuevo.data.id
  const textoInterno = 'Armario de dos cuerpos para organizar la ropa y aprovechar el espacio.'
  assert.equal((await request(`/productos/${id}/descripcion`, 'PATCH', { descripcion: textoInterno })).status, 401)
  assert.equal((await r(`/productos/${id}/descripcion`, 'PATCH', { descripcion: '' })).status, 400)
  assert.equal((await r(`/productos/${id}/descripcion`, 'PATCH', { descripcion: 'x'.repeat(241) })).status, 400)
  assert.equal((await r('/productos/999999/descripcion', 'PATCH', { descripcion: textoInterno })).status, 404)
  const actualizado = await r(`/productos/${id}/descripcion`, 'PATCH', { descripcion: textoInterno })
  assert.equal(actualizado.status, 200)
  assert.equal(actualizado.data.descripcion, textoInterno)
  assert.equal(actualizado.data.valorVenta, 850000)
  assert.equal(actualizado.data.valorCompra, 350000)
  assert.equal(actualizado.data.stock, 4)
  assert.equal(actualizado.data.procesos[0].nombre, 'Armado')

  assert.equal((await r(`/portal-admin/productos/${id}`, 'PUT', ficha)).status, 200)
  const textoComercial = 'Armario de dos cuerpos con espacio para ropa y accesorios en tu negocio.'
  assert.equal((await request(`/portal-admin/productos/${id}/descripcion`, 'PATCH', { descripcion: textoComercial })).status, 401)
  assert.equal((await r(`/portal-admin/productos/${id}/descripcion`, 'PATCH', { descripcion: 'x'.repeat(241) })).status, 400)
  assert.equal((await r('/portal-admin/productos/999999/descripcion', 'PATCH', { descripcion: textoComercial })).status, 404)
  assert.equal((await r(`/portal-admin/productos/${id}/descripcion`, 'PATCH', { descripcion: textoComercial })).status, 200)
  const catalogo = (await r('/portal-admin/productos')).data.find((p) => p.id === id)
  assert.equal(catalogo.descripcion, textoComercial)
  assert.equal(catalogo.categoria, ficha.categoria)
  assert.equal(catalogo.minimo, ficha.minimo)
  assert.equal(catalogo.precioCatalogo, ficha.precio)
  assert.equal(catalogo.publicado, true)
  assert.equal((await r('/productos')).data.find((p) => p.id === id).descripcion, textoInterno)

  const sinFicha = await r('/productos', 'POST', { nombre: 'Tocador compacto', descripcion: 'Tocador sin ficha', procesos: [] })
  const copySinFicha = 'Tocador compacto para acompañar la rutina diaria con espacio de organización.'
  assert.equal((await r(`/portal-admin/productos/${sinFicha.data.id}/descripcion`, 'PATCH', { descripcion: copySinFicha })).status, 200)
  const nuevoCatalogo = (await r('/portal-admin/productos')).data.find((p) => p.id === sinFicha.data.id)
  assert.equal(nuevoCatalogo.descripcion, copySinFicha)
  assert.equal(nuevoCatalogo.publicado, false)

  await r('/usuarios', 'POST', { username: 'editor-copy', password: 'prueba123', rol: 'usuario',
    permisos: { productos: { ver: true, editar: true } } })
  const token = (await request('/login', 'POST', { username: 'editor-copy', password: 'prueba123' })).data.token
  const editor = { Authorization: `Bearer ${token}` }
  assert.equal((await request('/ia/producto-copy/estado', 'GET', undefined, editor)).status, 200)
  assert.equal((await request(`/productos/${id}/descripcion`, 'PATCH', { descripcion: textoInterno }, editor)).status, 200)
  assert.equal((await request(`/portal-admin/productos/${id}/descripcion`, 'PATCH', { descripcion: textoComercial }, editor)).status, 403)
})
