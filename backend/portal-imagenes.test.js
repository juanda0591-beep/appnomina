import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import { migrarImagenes, fotosProducto, prepararImagenes, guardarImagenes } from './portal-imagenes.js'
import { servidorPrueba, datosCliente, ficha } from '../tests/portal-helper.mjs'

test('fotos: migra la imagen existente una vez, sin perderla ni recuperarla después de quitarla', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys=ON')
  db.exec('CREATE TABLE portal_productos(producto_id INTEGER PRIMARY KEY, imagen BLOB)')
  const imagen = Buffer.from('imagen anterior')
  db.prepare('INSERT INTO portal_productos VALUES(?,?)').run(10, imagen)
  migrarImagenes(db); migrarImagenes(db)
  assert.equal(fotosProducto(db, 10).length, 1)
  assert.deepEqual(db.prepare('SELECT imagen FROM portal_producto_imagenes').get().imagen, imagen)
  assert.equal(db.prepare('SELECT imagen FROM portal_productos').get().imagen, null)
  db.transaction(() => guardarImagenes(db, 10, { fotos: [], moderna: true, revision: 0 }))()
  migrarImagenes(db)
  assert.equal(fotosProducto(db, 10).length, 0)
  db.close()
})

test('galería API: varias fotos, portada, orden, privacidad, validación y conflictos', { timeout: 45000 }, async (t) => {
  const { request: r, admin } = await servidorPrueba(t)
  const a = (p, m = 'GET', b) => r(p, m, b, admin)
  const cuenta = datosCliente()
  await r('/portal/registro', 'POST', cuenta)
  const id = (await a('/portal-admin/cuentas')).data[0].id
  await a(`/portal-admin/cuentas/${id}`, 'PUT', { estado: 'aprobado' })
  const login = await r('/portal/login', 'POST', cuenta)
  const c = (p) => r('/portal' + p, 'GET', undefined, { Cookie: login.cookie })
  const p = (await a('/productos', 'POST', { nombre: 'Armario con galería', valorVenta: 150000 })).data
  const otro = (await a('/productos', 'POST', { nombre: 'Otro producto', valorVenta: 150000 })).data
  const fotos = []
  for (const color of ['#123456', '#abcdef', '#ff6688']) {
    const foto = await sharp({ create: { width: 25, height: 25, channels: 3, background: color } }).png().toBuffer()
    fotos.push({ imagen: `data:image/png;base64,${foto.toString('base64')}` })
  }
  const guardar = (extras) => a(`/portal-admin/productos/${p.id}`, 'PUT', { ...ficha, ...extras })
  assert.equal((await guardar({ imagenes: fotos, revisionFotos: 0 })).status, 200)
  let lista = (await a('/portal-admin/productos')).data.find((x) => x.id === p.id)
  const ids = lista.imagenes.map((f) => f.id)
  assert.equal(ids.length, 3)
  assert.equal(lista.revisionFotos, 1)
  const portada = await c(`/productos/${p.id}/imagen`)
  const primera = await c(`/productos/${p.id}/imagenes/${ids[0]}`)
  assert.deepEqual(portada.data, primera.data)
  assert.equal(primera.headers.get('content-type'), 'image/webp')
  assert.equal((await r(`/portal/productos/${p.id}/imagenes/${ids[0]}`)).status, 401)
  assert.equal((await c(`/productos/${otro.id}/imagenes/${ids[0]}`)).status, 404)
  assert.equal((await a(`/portal-admin/productos/${otro.id}/imagenes/${ids[0]}`)).status, 404)
  assert.equal((await a(`/portal-admin/productos/${otro.id}`, 'PUT', { ...ficha, imagenes: [{ id: ids[0] }], revisionFotos: 0 })).status, 409)
  // Ninguna validación fallida modifica la ficha ni elimina fotos.
  assert.equal((await guardar({ imagenes: [...fotos, ...fotos, fotos[0]], revisionFotos: 1 })).status, 400)
  assert.equal((await guardar({ imagenes: [{ imagen: 'data:image/png;base64,ZmFsc28=' }], revisionFotos: 1 })).status, 400)
  assert.equal((await guardar({ descripcion: 'No guardar', imagenes: [{ id: ids[0] }, { id: ids[0] }], revisionFotos: 1 })).status, 400)
  assert.equal((await guardar({ imagenes: [{ id: ids[0] }], revisionFotos: 0 })).status, 409)
  lista = (await a('/portal-admin/productos')).data.find((x) => x.id === p.id)
  assert.deepEqual(lista.imagenes.map((f) => f.id), ids)
  assert.equal(lista.descripcion, ficha.descripcion)
  assert.equal((await guardar({ imagenes: [{ id: ids[2] }, { id: ids[0] }], revisionFotos: 1 })).status, 200)
  lista = (await c('/productos')).data.find((x) => x.id === p.id)
  assert.deepEqual(lista.imagenes.map((f) => f.id), [ids[2], ids[0]])
  assert.equal((await c(`/productos/${p.id}/imagenes/${ids[1]}`)).status, 404)
  assert.deepEqual((await c(`/productos/${p.id}/imagen`)).data, (await c(`/productos/${p.id}/imagenes/${ids[2]}`)).data)
  // Ocultar el producto oculta todas sus imágenes, aun conociendo los identificadores.
  await guardar({ publicado: false })
  assert.equal((await c(`/productos/${p.id}/imagenes/${ids[2]}`)).status, 404)
  assert.equal((await a(`/portal-admin/productos/${p.id}/imagenes/${ids[2]}`)).status, 200)
  await guardar({ imagenes: [], revisionFotos: 2 })
  lista = (await c('/productos')).data.find((x) => x.id === p.id)
  assert.equal(lista.tieneImagen, false); assert.deepEqual(lista.imagenes, [])
  assert.equal((await c(`/productos/${p.id}/imagen`)).status, 404)
})

test('fotos: rechaza archivos de más de 2 MB antes de procesarlos', async () => {
  const imagen = `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`
  await assert.rejects(prepararImagenes({ imagenes: [{ imagen }], revisionFotos: 0 }), /máximo 2 MB/)
})
