import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { servidorPrueba } from './portal-helper.mjs'
import { proyectoVacio } from '../src/utils/proyectoCorte.js'
import { agregarTablero } from '../src/utils/disenoLibre.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('Cotas: selección, cámara, arrastre, giro, edición, imagen descargada y móvil', { timeout: 120000 }, async (t) => {
  const { base, request, admin, sesion, carpeta } = await servidorPrueba(t)
  const p = agregarTablero(proyectoVacio(), { nombre: 'Tablero con cotas', ancho: 500, alto: 1800, espesor: 18, plano: 'lateral' }).proyecto
  assert.equal((await request('/planos-corte', 'POST', { nombre: 'Prueba de cotas 3D', proyecto: p }, admin)).status, 200)
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, serviceWorkers: 'block' })
  await context.addInitScript((s) => {
    sessionStorage.setItem('nomina_token', s.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = [], output = process.env.UI_SCREENSHOT_DIR || carpeta
  page.on('pageerror', (e) => errores.push(e.message))
  await mkdir(output, { recursive: true })
  await page.goto(`${base}/cortes-planos`)
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).click()
  const libre = page.getByRole('region', { name: 'Editor de diseño libre' })
  const canvas = page.getByLabel('Diseño libre 3D interactivo', { exact: true })
  const cotas = page.getByRole('img', { name: 'Medidas del tablero seleccionado', exact: true })
  await libre.getByLabel('Tablero de diseño libre', { exact: true }).selectOption('P001-1')
  await cotas.waitFor()
  for (const texto of ['Ancho 50 cm', 'Largo 180 cm', 'Espesor 18 mm']) assert.ok(await cotas.getByText(texto, { exact: true }).isVisible())
  await libre.screenshot({ path: join(output, 'cotas-tablero-3d.png') })
  const inicial = await cotas.locator('path').first().getAttribute('d')
  await libre.getByRole('button', { name: 'Lado', exact: true }).click()
  assert.notEqual(await cotas.locator('path').first().getAttribute('d'), inicial)
  const lateral = await cotas.locator('path').first().getAttribute('d')
  await libre.getByRole('button', { name: 'Mover tablero', exact: true }).click()
  await libre.getByLabel('Eje de arrastre', { exact: true }).selectOption('y')
  await libre.getByLabel('Ajustar a caras', { exact: true }).uncheck()
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 35, { steps: 6 })
  await page.mouse.up()
  assert.ok(Number(await libre.getByLabel('Tablero · Y (mm)', { exact: true }).inputValue()) > 0, 'Las cotas no bloquean el arrastre')
  assert.notEqual(await cotas.locator('path').first().getAttribute('d'), lateral)
  await libre.getByText('Girar y copiar', { exact: true }).click()
  await libre.getByRole('button', { name: 'Girar Y 90°', exact: true }).click()
  assert.ok(await cotas.getByText('Ancho 50 cm', { exact: true }).isVisible())
  await libre.getByLabel('Tablero · Ancho (cm)', { exact: true }).fill('60.5')
  await libre.getByRole('button', { name: 'Aplicar al tablero', exact: true }).click()
  await cotas.getByText('Ancho 60,5 cm', { exact: true }).waitFor()
  await libre.getByRole('button', { name: 'Ajustar vista libre', exact: true }).click()
  const descargar = async (archivo) => {
    const descarga = page.waitForEvent('download')
    await libre.getByRole('button', { name: 'Descargar imagen del diseño libre', exact: true }).click()
    await (await descarga).saveAs(join(output, archivo))
    return readFile(join(output, archivo))
  }
  const conCotas = await descargar('tablero-con-cotas.png')
  await libre.getByLabel('Mostrar medidas', { exact: true }).uncheck()
  assert.equal(await cotas.count(), 0)
  const sinCotas = await descargar('tablero-sin-cotas.png')
  assert.notDeepEqual(conCotas, sinCotas, 'Las cotas se incluyen en la imagen descargada')
  await libre.getByLabel('Mostrar medidas', { exact: true }).check()
  await cotas.waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  await libre.getByRole('button', { name: 'Ampliar diseño libre', exact: true }).click()
  await libre.getByRole('button', { name: 'Ajustar vista libre', exact: true }).click()
  await canvas.scrollIntoViewIfNeeded()
  assert.ok(await cotas.evaluate((svg) => {
    const { width, height } = svg.viewBox.baseVal
    return [...svg.querySelectorAll('rect')].every((r) => r.x.baseVal.value >= 0 && r.y.baseVal.value >= 0 && r.x.baseVal.value + r.width.baseVal.value <= width && r.y.baseVal.value + r.height.baseVal.value <= height)
  }), 'Etiquetas dentro del área 3D en móvil')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await libre.screenshot({ path: join(output, 'cotas-tablero-movil.png') })
  await libre.getByRole('button', { name: 'Reducir diseño libre', exact: true }).click()
  assert.deepEqual(errores, [])
})
