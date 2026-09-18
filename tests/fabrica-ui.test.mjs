import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { configurarDiseno, construirMueble } from '../src/utils/construccionMueble.js'
import { activarMDF } from '../src/utils/fabricacionMDF.js'
import { nuevoModulo } from '../src/utils/despiece.js'
import { proyectoVacio } from '../src/utils/proyectoCorte.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('Fábrica: doble toque, edición, reengrueso, entamborado, espesores y tocador', { timeout: 180000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'fabrica-ui-'))
  const reserva = createServer().listen(0, '127.0.0.1'); await once(reserva, 'listening')
  const port = reserva.address().port; await new Promise((resolve) => reserva.close(resolve))
  const proceso = spawn(process.execPath, ['backend/server.js'], { cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, DB_PATH: join(carpeta, 'prueba.db'), PORT: String(port), BACKUP_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
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
    const res = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const datos = await res.json(); assert.equal(res.status, 200, JSON.stringify(datos)); return datos
  }
  const sesion = await api('/login', { username: 'admin', password: 'admin123' }); token = sesion.token
  const diseno = activarMDF(configurarDiseno({ ancho: 100, alto: 180, fondo: 50, espesor: 9, gap: 3, holguraFondo: 10,
    armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [{ ...nuevoModulo(), cajones: 2, zonaCajones: 50 }] }))
  const proyectoInicial = { ...proyectoVacio(), lamina: { ancho: 1830, largo: 2440, espesor: 9, costo: 90000 }, diseno, piezas: construirMueble(diseno).piezas }
  await api('/planos-corte', { nombre: 'Armario MDF 9 y 3', proyecto: proyectoInicial })
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block', hasTouch: true })
  await context.addInitScript((sesion) => {
    sessionStorage.setItem('nomina_token', sesion.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const output = process.env.UI_SCREENSHOT_DIR || carpeta
  await mkdir(output, { recursive: true })
  t.after(async () => { if (!page.isClosed()) await page.screenshot({ path: join(output, 'fabrica-final.png'), animations: 'disabled' }).catch(() => {}) })
  const abrirProyecto = async () => {
    await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir', exact: true }).first().click()
    await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  }
  const seleccionar = (clave) => page.getByLabel('Seleccionar pieza 3D', { exact: true }).selectOption(`PANEL:${clave}`)
  const animacion = () => page.waitForFunction(() => document.querySelector('.mueble3d canvas')?.dataset.animando === 'false')
  await page.goto(`${base}/cortes-planos`); await abrirProyecto()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  const canvas = page.locator('.mueble3d canvas')
  await canvas.locator('xpath=self::*[@data-estado="listo"]').waitFor()
  await page.getByRole('button', { name: 'Vista 3D frente', exact: true }).click()
  const box = await canvas.boundingBox()
  await canvas.dblclick({ position: { x: box.width / 2, y: box.height * .35 } })
  await animacion()
  assert.match(await canvas.getAttribute('data-abiertos'), /puerta:/)
  await page.getByRole('button', { name: 'Cerrar pieza', exact: true }).click(); await animacion()
  assert.equal(await canvas.getAttribute('data-abiertos'), '')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  await canvas.scrollIntoViewIfNeeded()
  const touchBox = await canvas.boundingBox()
  await page.touchscreen.tap(touchBox.x + touchBox.width / 2, touchBox.y + touchBox.height * .35)
  await page.touchscreen.tap(touchBox.x + touchBox.width / 2, touchBox.y + touchBox.height * .35)
  await animacion(); assert.match(await canvas.getAttribute('data-abiertos'), /puerta:/)
  await page.getByRole('button', { name: 'Cerrar todas las aperturas', exact: true }).click(); await animacion()
  await page.setViewportSize({ width: 1600, height: 1100 })
  await seleccionar('Frente cajón|0|0')
  await page.getByRole('button', { name: 'Abrir pieza', exact: true }).click(); await animacion()
  assert.match(await canvas.getAttribute('data-abiertos'), /cajon:0:0/)
  await page.getByRole('button', { name: 'Cerrar todas las aperturas', exact: true }).click(); await animacion()
  await seleccionar('Lateral|global|0')
  await page.getByLabel('Pieza · Ancho', { exact: true }).fill('480')
  await page.getByRole('button', { name: 'Aplicar a la pieza', exact: true }).click()
  assert.ok(await page.getByRole('button', { name: 'PDF de taller', exact: true }).isDisabled())
  assert.equal(await page.getByLabel('Pieza · Ancho', { exact: true }).inputValue(), '480')
  await seleccionar('Piso|global|0')
  await page.getByLabel('Pieza · Fabricación', { exact: true }).selectOption('reengrueso')
  await page.getByLabel('Pieza · Espesor terminado', { exact: true }).fill('27')
  await page.getByRole('button', { name: 'Aplicar a la pieza', exact: true }).click()
  assert.equal(await page.getByLabel('Pieza · Espesor terminado', { exact: true }).inputValue(), '27')
  await seleccionar('Techo|global|0')
  await page.getByLabel('Pieza · Fabricación', { exact: true }).selectOption('entamborado')
  await page.getByLabel('Pieza · Espesor terminado', { exact: true }).fill('36')
  await page.getByLabel('Pieza · Refuerzos interiores', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Aplicar a la pieza', exact: true }).click()
  await page.getByLabel('Aislar pieza', { exact: true }).check()
  await page.getByLabel('Ver caras y refuerzos', { exact: true }).check()
  assert.equal(Number(await canvas.getAttribute('data-piezas-visibles')), 8)
  await page.getByRole('button', { name: 'Ajustar vista 3D', exact: true }).click()
  await page.getByLabel('Separar piezas 3D', { exact: true }).fill('60')
  await page.locator('.mueble3d').screenshot({ path: join(output, 'fabrica-entamborado.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Calcular corte', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Guardar version') && !b.disabled))
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  let lista = await api('/planos-corte'), guardado = await api(`/planos-corte/${lista[0].id}`)
  assert.equal(guardado.revision, 2)
  assert.equal(guardado.proyecto.diseno.fabricacion.perfiles['Piso|global|0'].tipo, 'reengrueso')
  assert.equal(guardado.proyecto.diseno.fabricacion.ajustes['Lateral|global|0'].ancho, 480)
  assert.deepEqual(guardado.resultado.grupos.map((g) => g.espesor), [9, 3])
  for (const lam of guardado.resultado.laminas) assert.ok(lam.piezas.every((p) => guardado.proyecto.piezas.find((pi) => pi.codigo === p.codigo).espesor === lam.espesor))
  const descarga = page.waitForEvent('download'); await page.getByRole('button', { name: 'PDF de taller', exact: true }).click()
  await (await descarga).saveAs(join(output, 'plano-fabrica-mdf.pdf'))
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  await page.getByRole('button', { name: 'Base de tocador', exact: true }).click(); await page.locator('.swal2-confirm').click()
  // El generador muestra otra vista mientras el panel principal carece de diseño.
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  const select = page.getByLabel('Seleccionar pieza 3D', { exact: true })
  await select.selectOption('VIDRIO:marco-espejo')
  await page.getByRole('button', { name: 'Abrir pieza', exact: true }).click(); await animacion()
  assert.match(await page.locator('.mueble3d canvas').getAttribute('data-abiertos'), /espejo:marco-espejo/)
  await page.locator('.mueble3d').screenshot({ path: join(output, 'fabrica-tocador-espejo-abierto.png'), animations: 'disabled' })
  await page.getByRole('button', { name: /Generar despiece/ }).click()
  await page.getByRole('button', { name: 'Calcular corte', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  lista = await api('/planos-corte'); guardado = await api(`/planos-corte/${lista[0].id}`)
  assert.ok(guardado.proyecto.diseno.fabricacion.complementos.some((p) => p.tipo === 'espejo'))
  assert.ok(!guardado.proyecto.piezas.some((p) => p.nombre.includes('vidrio')))
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click(); await abrirProyecto()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  await page.getByLabel('Seleccionar pieza 3D', { exact: true }).selectOption('VIDRIO:marco-espejo')
  await page.getByRole('button', { name: 'Abrir pieza', exact: true }).click(); await animacion()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(errores, [])
})
