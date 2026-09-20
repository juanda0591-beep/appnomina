import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomFillSync } from 'node:crypto'
import sharp from 'sharp'
import { servidorPrueba } from './portal-helper.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('Planos desde fotos: cargar, revisar, mover, deshacer, guardar y reabrir', { timeout: 120000 }, async (t) => {
  const { base, request, admin, sesion } = await servidorPrueba(t)
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' })
  await context.addInitScript((s) => {
    sessionStorage.setItem('nomina_token', s.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const piezas = [{ codigo: 'P001', nombre: 'Lateral desde fotos', ancho: 500, alto: 1800, espesor: 9, cantidad: 2, permiteRotar: true, canto: '' }]
  const montaje = [0, 991].map((x, i) => ({ codigo: 'P001', unidad: i + 1, plano: 'lateral', x, y: 0, z: 0 }))
  let enviada
  await page.route('**/api/ia/planos/estado', (route) => route.fulfill({ json: { configurada: true } }))
  await page.route('**/api/ia/planos', (route) => {
    enviada = route.request().postDataJSON()
    return route.fulfill({ json: { explicacion: 'Propuesta de montaje para revisar.', pasos: [], preguntas: [], pendientes: [], supuestos: [], advertencias: [],
      piezas, montaje, puedeAplicarPiezas: true, puedeAplicarMontaje: false } })
  })
  await page.goto(`${base}/cortes-planos`)

  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Armario con fotografías')

  await page.getByLabel('Espesor (mm)', { exact: true }).fill('9')

  await page.getByRole('button', { name: 'Crear plano desde fotos', exact: true }).click()
  await page.getByLabel('Ancho exterior (cm)', { exact: true }).fill('100')
  await page.getByLabel('Alto exterior (cm)', { exact: true }).fill('180')
  await page.getByLabel('Fondo exterior (cm)', { exact: true }).fill('50')
  await page.getByLabel('Consulta de medidas').fill('Dos laterales en MDF de 9 mm, sin veta; sin puertas ni trasera.')
  const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#8ca8a0' } }).png().toBuffer()
  // Foto de 27 megapíxeles y más de 2 MB: se optimiza antes de enviar o guardar.
  const grande = await sharp(randomFillSync(Buffer.alloc(6000 * 4500 * 3)), { raw: { width: 6000, height: 4500, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
  assert.ok(grande.length > 2 * 1024 * 1024)
  await page.getByLabel('Fotos exteriores', { exact: true }).setInputFiles({ name: 'exterior.png', mimeType: 'image/jpeg', buffer: grande })
  await page.getByAltText('exterior: exterior.png', { exact: true }).waitFor()
  await page.getByLabel('Fotos interiores', { exact: true }).setInputFiles({ name: 'interior.png', mimeType: 'image/png', buffer })
  await page.getByAltText('interior: interior.png', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Generar plano desde fotos', exact: true }).click()
  await page.getByText('Propuesta de montaje para revisar.', { exact: true }).waitFor()
  assert.equal(enviada.referencias.fotos.length, 2)
  assert.equal(enviada.referencias.ancho, 1000)
  assert.equal(enviada.modo, 'fotos')
  const optimizada = Buffer.from(enviada.referencias.fotos[0].datos.split(',')[1], 'base64')
  const meta = await sharp(optimizada).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.equal(meta.width, 2560)
  assert.equal(meta.height, 1920)
  assert.ok(optimizada.length <= 2 * 1024 * 1024)
  assert.equal(await page.getByRole('button', { name: 'Aplicar plano y posiciones', exact: true }).isDisabled(), true)
  await page.getByLabel('Revisé las medidas, supuestos y unidades de esta propuesta').check()
  await page.getByRole('button', { name: 'Aplicar plano y posiciones', exact: true }).click()
  await page.locator('.swal2-confirm').click()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  await page.getByLabel('Seleccionar pieza 3D').selectOption('P001-2')
  await page.getByLabel('Desplazamiento (mm)', { exact: true }).fill('50')
  await page.getByRole('button', { name: 'Atrás', exact: true }).click()
  await page.getByText('Posición X / Y / Z: 991 / 0 / -50 mm', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await page.getByText('Posición X / Y / Z: 991 / 0 / 0 mm', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  await page.getByText('Posición X / Y / Z: 991 / 0 / -50 mm', { exact: true }).waitFor()

  await page.getByLabel('Nombre P001', { exact: true }).fill('Lateral revisado')

  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  const lista = (await request('/planos-corte', 'GET', undefined, admin)).data
  const guardado = (await request(`/planos-corte/${lista[0].id}`, 'GET', undefined, admin)).data
  assert.equal(guardado.proyecto.referencias.fotos.length, 2)
  assert.equal(guardado.proyecto.montajeManual[0].z, 0)
  assert.equal(guardado.proyecto.montajeManual[1].z, -50)

  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  await page.getByLabel('Seleccionar pieza 3D').selectOption('P001-2')
  await page.getByText('Posición X / Y / Z: 991 / 0 / -50 mm', { exact: true }).waitFor()

  await page.getByRole('button', { name: 'Crear plano desde fotos', exact: true }).click()
  await page.getByAltText('exterior: exterior.png', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Ancho exterior (cm)', { exact: true }).inputValue(), '100')
  await mkdir('artifacts', { recursive: true })
  await page.locator('.referencias-plano').screenshot({ path: join('artifacts', 'plano-fotos-referencias.png') })

  await page.locator('.manual-piezas').screenshot({ path: join('artifacts', 'plano-fotos-movimiento.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desbordamiento horizontal en móvil')
  assert.deepEqual(errores, [])
})
