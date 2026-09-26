import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { servidorPrueba, ficha } from './portal-helper.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('copy IA: editar producto existente y regenerar desde Productos y catálogo mayorista', { timeout: 120000 }, async (t) => {
  const { base, request, admin, sesion } = await servidorPrueba(t)
  const r = (path, method = 'GET', body) => request(path, method, body, admin)
  const creado = await r('/productos', 'POST', { nombre: 'Armario de dos cuerpos', descripcion: 'Descripción anterior', valorVenta: 850000,
    valorCompra: 350000, stockApertura: 4, procesos: [{ nombre: 'Armado', pago: 20000, materiales: [], piezas: [] }] })
  assert.equal(creado.status, 200)
  const id = creado.data.id
  assert.equal((await r(`/portal-admin/productos/${id}`, 'PUT', ficha)).status, 200)
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await context.addInitScript((s) => {
    sessionStorage.setItem('nomina_token', s.token); sessionStorage.setItem('nomina_user', s.username); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = [], entradas = []
  const capturas = process.env.UI_SCREENSHOT_DIR
  if (capturas) await mkdir(capturas, { recursive: true })
  page.on('pageerror', (e) => errores.push(e.message))
  const copies = [
    'Armario de dos cuerpos para organizar ropa y accesorios con espacio práctico.',
    'Armario de dos cuerpos con espacio para mantener tu ropa bien organizada.',
    'Armario para tu negocio con espacio para organizar ropa y accesorios.',
    'Armario de dos cuerpos para completar una colección organizada y funcional.',
  ]
  let numero = 0
  await page.route('**/api/ia/producto-copy/estado', (route) => route.fulfill({ json: { configurada: true } }))
  await page.route('**/api/ia/producto-copy', (route) => {
    entradas.push(route.request().postDataJSON().descripcion)
    return route.fulfill({ json: { copy: copies[numero++] } })
  })

  await page.goto(`${base}/productos`)
  const fila = page.getByRole('row').filter({ hasText: 'Armario de dos cuerpos' })
  await fila.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByRole('button', { name: 'Crear copy corto con IA' }).click()
  await page.getByRole('button', { name: 'Generar copy', exact: true }).click()
  await page.getByLabel('Copy sugerido').waitFor()
  if (capturas) await page.locator('form.modal').screenshot({ path: join(capturas, 'producto-editar-copy.png') })
  assert.equal(await page.getByLabel('Copy sugerido').inputValue(), copies[0])
  await page.getByRole('button', { name: 'Usar este copy' }).click()
  assert.equal(await page.getByLabel('Descripción', { exact: true }).inputValue(), copies[0])
  assert.equal((await r('/productos')).data.find((p) => p.id === id).descripcion, 'Descripción anterior', 'Editar no guarda antes de confirmar')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await page.locator('.swal2-confirm').click()
  await page.getByText('Producto actualizado', { exact: true }).waitFor()
  assert.equal((await r('/productos')).data.find((p) => p.id === id).descripcion, copies[0])

  await fila.getByRole('button', { name: 'Regenerar copy IA' }).click()
  const modalProducto = page.getByRole('dialog', { name: 'Copy de Armario de dos cuerpos' })
  await modalProducto.getByLabel('Copy sugerido').waitFor()
  if (capturas) await page.screenshot({ path: join(capturas, 'producto-regenerar-lista.png') })
  assert.equal(await modalProducto.getByLabel('Copy sugerido').inputValue(), copies[1])
  await modalProducto.getByRole('button', { name: 'Usar este copy' }).click()
  await modalProducto.waitFor({ state: 'hidden' })
  const interno = (await r('/productos')).data.find((p) => p.id === id)
  assert.equal(interno.descripcion, copies[1])
  assert.equal(interno.valorVenta, 850000)
  assert.equal(interno.procesos[0].nombre, 'Armado')

  await page.goto(`${base}/portal-mayorista`)
  await page.getByRole('button', { name: 'Catálogo y fotografías' }).click()
  const tarjeta = page.locator('.pm-productos article').filter({ hasText: 'Armario de dos cuerpos' })
  await tarjeta.getByRole('button', { name: 'Editar ficha' }).click()
  const editor = page.getByRole('dialog', { name: 'Ficha de Armario de dos cuerpos' })
  await editor.getByRole('button', { name: 'Crear copy corto con IA' }).click()
  await editor.getByRole('button', { name: 'Generar copy', exact: true }).click()
  await editor.getByLabel('Copy sugerido').waitFor()
  if (capturas) await editor.screenshot({ path: join(capturas, 'catalogo-editar-copy.png') })
  await editor.getByRole('button', { name: 'Usar este copy' }).click()
  assert.equal(await editor.getByLabel('Descripción comercial').inputValue(), copies[2])
  assert.equal((await r('/portal-admin/productos')).data.find((p) => p.id === id).descripcion, ficha.descripcion)
  await editor.getByRole('button', { name: 'Guardar ficha', exact: true }).click()
  await editor.waitFor({ state: 'hidden' })
  assert.equal((await r('/portal-admin/productos')).data.find((p) => p.id === id).descripcion, copies[2])

  await tarjeta.getByRole('button', { name: 'Regenerar copy IA' }).click()
  const modalCatalogo = page.getByRole('dialog', { name: 'Copy de Armario de dos cuerpos' })
  await modalCatalogo.getByLabel('Copy sugerido').waitFor()
  if (capturas) await page.screenshot({ path: join(capturas, 'catalogo-regenerar-lista.png') })
  assert.equal(await modalCatalogo.getByLabel('Copy sugerido').inputValue(), copies[3])
  await modalCatalogo.getByRole('button', { name: 'Usar este copy' }).click()
  await modalCatalogo.waitFor({ state: 'hidden' })
  const catalogo = (await r('/portal-admin/productos')).data.find((p) => p.id === id)
  assert.equal(catalogo.descripcion, copies[3])
  assert.equal(catalogo.categoria, ficha.categoria)
  assert.equal(catalogo.precioCatalogo, ficha.precio)
  assert.equal((await r('/productos')).data.find((p) => p.id === id).descripcion, copies[1])
  assert.ok(entradas.every((texto) => texto.includes('Armario de dos cuerpos') && !texto.includes('850000')))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  if (capturas) await page.screenshot({ path: join(capturas, 'catalogo-copy-movil.png') })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(errores, [])
})
