import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { proyectoVacio } from '../src/utils/proyectoCorte.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('Piezas manuales y asistente: 2D, 3D, ubicaciones, revisión IA, persistencia y PDF', { timeout: 120000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'piezas-ia-ui-'))
  const reserva = createServer().listen(0, '127.0.0.1'); await once(reserva, 'listening')
  const port = reserva.address().port; await new Promise((resolve) => reserva.close(resolve))
  const proceso = spawn(process.execPath, ['backend/server.js'], { cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, DB_PATH: join(carpeta, 'prueba.db'), PORT: String(port), BACKUP_ENABLED: 'false', OPENAI_API_KEY: '', OPENAI_MODEL: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(async () => {
    if (proceso.exitCode === null) { const salida = once(proceso, 'exit'); proceso.kill(); await salida }
    await rm(carpeta, { recursive: true, force: true })
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no inicio')), 10000)
    proceso.once('error', (e) => { clearTimeout(timer); reject(e) })
    proceso.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Servidor termino: ${code}`)) })
    proceso.stdout.on('data', (d) => { if (d.toString().includes('http://localhost:')) { clearTimeout(timer); resolve() } })
  })
  let token
  const base = `http://127.0.0.1:${port}`
  const api = async (path, body) => {
    const res = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const datos = await res.json(); assert.equal(res.status, 200, JSON.stringify(datos)); return datos
  }
  const sesion = await api('/login', { username: 'admin', password: 'admin123' }); token = sesion.token
  const piezas = [{ codigo: 'P001', nombre: 'Lateral', ancho: 500, alto: 1800, espesor: 9, cantidad: 2, permiteRotar: false, canto: '' }]
  await api('/planos-corte', { nombre: 'Piezas ingresadas', proyecto: { ...proyectoVacio(), lamina: { ancho: 1830, largo: 2440, espesor: 9, costo: 90000 }, piezas } })
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' })
  await context.addInitScript((sesion) => {
    sessionStorage.setItem('nomina_token', sesion.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const output = process.env.UI_SCREENSHOT_DIR || carpeta
  await mkdir(output, { recursive: true })
  await page.goto(`${base}/cortes-planos`)
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click(); await page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await page.getByRole('tab', { name: 'Piezas 2D / 3D', exact: true }).click()
  await page.getByRole('img', { name: /Plano 2D Lateral/ }).waitFor()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  await page.getByText('Ubicar esta pieza en el mueble', { exact: true }).click()
  await page.getByLabel('Orientación manual').selectOption('lateral')
  for (const eje of ['X', 'Y', 'Z']) await page.getByLabel(`Montaje manual ${eje}`).fill('0')
  await page.getByRole('button', { name: 'Aplicar ubicación', exact: true }).click()
  await page.getByText('1 unidades pendientes de ubicar. El montaje está incompleto.', { exact: true }).waitFor()
  await page.getByLabel('Unidad manual').selectOption('2')
  await page.getByLabel('Orientación manual').selectOption('lateral')
  await page.getByLabel('Montaje manual X').fill('991')
  for (const eje of ['Y', 'Z']) await page.getByLabel(`Montaje manual ${eje}`).fill('0')
  await page.getByRole('button', { name: 'Aplicar ubicación', exact: true }).click()
  assert.equal(await page.locator('.mueble3d canvas').getAttribute('data-piezas-visibles'), '2')
  const descarga = page.waitForEvent('download'); await page.getByRole('button', { name: 'PDF de esta pieza', exact: true }).click()
  await (await descarga).saveAs(join(output, 'pieza-manual.pdf'))
  await page.getByRole('button', { name: 'Calcular corte', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  let lista = await api('/planos-corte'), guardado = await api(`/planos-corte/${lista[0].id}`)
  assert.equal(guardado.proyecto.montajeManual.length, 2)
  assert.equal(guardado.proyecto.montajeManual[1].x, 991)
  await page.getByRole('button', { name: /Asistente de medidas · OpenAI/ }).click()
  await page.getByText('Configura OPENAI_API_KEY y OPENAI_MODEL en el servidor para usar el asistente.', { exact: true }).waitFor()
  assert.ok(await page.getByRole('button', { name: 'Consultar medidas', exact: true }).isDisabled())
  // Respuestas simuladas únicamente en la prueba: no requiere cuota ni datos reales.
  await page.route('**/api/ia/planos/estado', (route) => route.fulfill({ json: { configurada: true } }))
  await page.getByRole('button', { name: 'Cerrar asistente de medidas', exact: true }).click()
  await page.getByRole('button', { name: /Asistente de medidas · OpenAI/ }).click()
  let enviada
  const respuesta = { explicacion: 'Un lateral de 500 mm mide 50 cm. Para 1000 mm exteriores, techo entre laterales: 1000 - 9 - 9 = 982 mm.',
    pasos: [{ concepto: 'Techo', calculo: '1000 - 2 × 9 = 982', resultadoMm: 982 }], preguntas: [], pendientes: [],
    supuestos: ['Techo entre laterales'], advertencias: ['Verificar el método de armado'], piezas: [], montaje: [], puedeAplicarPiezas: false, puedeAplicarMontaje: false }
  await page.route('**/api/ia/planos', async (route) => { enviada = route.request().postDataJSON(); await route.fulfill({ json: respuesta }) })
  await page.getByLabel('Consulta de medidas').fill('Explica el ancho de un techo entre dos laterales de 9 mm para 100 cm exteriores')
  await page.getByRole('button', { name: 'Consultar medidas', exact: true }).click()
  await page.getByText(respuesta.explicacion, { exact: true }).waitFor()
  assert.equal(enviada.piezas[0].ancho, 500); assert.equal(enviada.modo, 'explicar')
  assert.equal(await page.getByRole('button', { name: 'Reemplazar tabla con propuesta', exact: true }).count(), 0)
  await page.unroute('**/api/ia/planos')
  await page.route('**/api/ia/planos', (route) => route.fulfill({ json: { ...respuesta, puedeAplicarPiezas: true,
    piezas: [{ codigo: 'P001', nombre: 'Techo IA', ancho: 982, alto: 500, espesor: 9, cantidad: 1, permiteRotar: true, canto: '', motivo: 'Descuento de 2 laterales' }] } }))
  await page.getByLabel('Objetivo del asistente').selectOption('proponer')
  await page.getByRole('button', { name: 'Consultar medidas', exact: true }).click()
  await page.getByText('Techo IA', { exact: true }).waitFor()
  assert.ok(await page.getByRole('button', { name: 'Reemplazar tabla con propuesta', exact: true }).isDisabled())
  await page.getByLabel('Revisé las medidas, supuestos y unidades de esta propuesta').check()
  // Una edición posterior invalida el borrador antes de poder aplicarlo.
  await page.getByLabel('Pieza manual · Ancho (cm)').fill('51')
  await page.getByText('Las medidas cambiaron. Consulta de nuevo antes de aplicar esta propuesta.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Consultar medidas', exact: true }).click()
  await page.getByLabel('Revisé las medidas, supuestos y unidades de esta propuesta').check()
  await page.getByRole('button', { name: 'Reemplazar tabla con propuesta', exact: true }).click(); await page.locator('.swal2-confirm').click()
  assert.equal(await page.getByLabel('Nombre P001', { exact: true }).inputValue(), 'Techo IA')
  assert.equal(await page.getByLabel('Pieza manual · Ancho (cm)').inputValue(), '98.2')
  assert.equal((await api('/planos-corte')).length, 2, 'Aplicar IA no guarda el proyecto')
  await page.getByRole('button', { name: 'Cerrar asistente de medidas', exact: true }).click()
  await page.locator('.manual-piezas').screenshot({ path: join(output, 'piezas-manuales.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(errores, [])
})
