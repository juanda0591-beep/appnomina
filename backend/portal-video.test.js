import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import ffmpeg from 'ffmpeg-static'
import { execFileSync } from 'node:child_process'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { servidorPrueba, datosCliente, ficha } from '../tests/portal-helper.mjs'

test('video mayorista: genera MP4 con fotos guardadas, protege el acceso e invalida cambios', { timeout: 120000 }, async (t) => {
  const { request: r, admin, carpeta } = await servidorPrueba(t)
  const a = (path, method = 'GET', body) => r(path, method, body, admin)
  const registro = datosCliente('video@ejemplo.com')
  assert.equal((await r('/portal/registro', 'POST', registro)).status, 201)
  const cuenta = (await a('/portal-admin/cuentas')).data[0]
  assert.equal((await a(`/portal-admin/cuentas/${cuenta.id}`, 'PUT', { estado: 'aprobado' })).status, 200)
  const login = await r('/portal/login', 'POST', registro)
  const cliente = (path, headers = {}) => r(`/portal${path}`, 'GET', undefined, { Cookie: login.cookie, ...headers })
  const producto = (await a('/productos', 'POST', { nombre: 'Armario de prueba', valorVenta: 300000, stockApertura: 3 })).data
  const id = producto.id
  const fotos = await Promise.all(['#153b32', '#b78655'].map(async (color) => ({ imagen: `data:image/png;base64,${(await sharp({ create: { width: 400, height: 300, channels: 3, background: color } }).png().toBuffer()).toString('base64')}` })))
  const video = (method = 'GET', body) => a(`/portal-admin/productos/${id}/video`, method, body)
  assert.equal((await video('POST', {})).status, 404)
  assert.equal((await a(`/portal-admin/productos/${id}`, 'PUT', { ...ficha, imagenes: fotos, revisionFotos: 0 })).status, 200)
  assert.equal((await r(`/portal-admin/productos/${id}/video`, 'POST', {})).status, 401)
  assert.equal((await video('POST', { texto: 'x'.repeat(161) })).status, 400)
  assert.equal((await video('POST', { texto: 'Armario para organizar tu negocio con vistas del exterior e interior.' })).status, 202)
  assert.equal((await video('POST', {})).status, 409)
  let estado
  for (let i = 0; i < 60; i++) {
    estado = (await a(`/portal-admin/productos/${id}/video/estado`)).data
    if (estado.estado !== 'procesando') break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.deepEqual(estado, { estado: 'completado' })
  let listado = (await cliente('/productos')).data.find((p) => p.id === id)
  assert.equal(listado.tieneVideo, true)
  assert.equal((await r(`/portal/productos/${id}/video`)).status, 401)
  const completo = await cliente(`/productos/${id}/video`)
  assert.equal(completo.status, 200)
  assert.equal(completo.headers.get('content-type'), 'video/mp4')
  assert.equal(Buffer.from(completo.data).toString('ascii', 4, 8), 'ftyp')
  const descarga = await a(`/portal-admin/productos/${id}/video?download=1`)
  assert.equal(descarga.status, 200)
  assert.match(descarga.headers.get('content-disposition'), new RegExp(`producto-${id}\\.mp4`))
  const archivo = join(carpeta, 'producto.mp4')
  await writeFile(archivo, Buffer.from(completo.data))
  const fotogramas = []
  for (const [i, segundo] of ['1.0', '3.4'].entries()) {
    const destino = join(carpeta, `fotograma-${i}.png`)
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', segundo, '-i', archivo, '-frames:v', '1', '-y', destino], { timeout: 15000 })
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true })
      await writeFile(join(process.env.UI_SCREENSHOT_DIR, `video-fotograma-${i}.png`), await readFile(destino))
    }
    const foto = await sharp(await readFile(destino)).resize(24, 14).raw().toBuffer()
    fotogramas.push(foto)
  }
  assert.notDeepEqual(fotogramas[0], fotogramas[1], 'El video muestra más de una fotografía real')
  const parcial = await cliente(`/productos/${id}/video`, { Range: 'bytes=0-1023' })
  assert.equal(parcial.status, 206)
  assert.equal(parcial.data.byteLength, 1024)
  assert.equal((await cliente(`/productos/${id}/video`, { Range: 'bytes=999999999-' })).status, 416)
  const antes = (await a('/portal-admin/productos')).data.find((p) => p.id === id)
  assert.equal((await a(`/portal-admin/productos/${id}`, 'PUT', { ...ficha, descripcion: 'Nueva descripción comercial', imagenes: antes.imagenes.map(({ id }) => ({ id })), revisionFotos: antes.revisionFotos })).status, 200)
  listado = (await cliente('/productos')).data.find((p) => p.id === id)
  assert.equal(listado.tieneVideo, false)
  assert.equal((await cliente(`/productos/${id}/video`)).status, 404)
  assert.equal((await video('DELETE')).status, 200)
})
