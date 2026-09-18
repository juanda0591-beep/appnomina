import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { generarDespiece, paramsParaDespiece, nuevoModulo } from '../src/utils/despiece.js'
import { proyectoVacio } from '../src/utils/proyectoCorte.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('3D: render real, giro, interior, acabados, piezas, captura, movil y recuperacion grafica', { timeout: 120000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'mueble3d-ui-'))
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
    const res = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const datos = await res.json(); assert.equal(res.status, 200, JSON.stringify(datos)); return datos
  }
  const sesion = await api('/login', { username: 'admin', password: 'admin123' }); token = sesion.token
  const diseno = { ancho: '160', alto: '200', fondo: '60', espesor: 18, gap: 3, holguraFondo: 20,
    armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [
      { ...nuevoModulo(), alturas: [110, 150], cajones: 2, zonaCajones: 60 },
      { ...nuevoModulo(), puerta: 'dos', alturas: [45, 95, 150] },
    ] }
  const piezas = generarDespiece(paramsParaDespiece(diseno)).piezas
  await api('/planos-corte', { nombre: 'Armario 3D - taller', proyecto: { ...proyectoVacio(), material: 'Melamina', piezas, diseno } })
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, serviceWorkers: 'block' })
  await context.addInitScript((sesion) => {
    sessionStorage.setItem('nomina_token', sesion.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const output = process.env.UI_SCREENSHOT_DIR || carpeta
  await mkdir(output, { recursive: true })
  t.after(async () => { if (!page.isClosed()) await page.screenshot({ path: join(output, '3d-final.png'), animations: 'disabled' }).catch(() => {}) })
  await page.goto(`${base}/cortes-planos`)
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  const canvas = page.getByLabel('Mueble 3D interactivo', { exact: true })
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  const foto = () => canvas.evaluate((c) => {
    const gl = c.getContext('webgl'), bytes = new Uint8Array(c.width * c.height * 4)
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    let hash = 0, pintados = 0
    for (let i = 0; i < bytes.length; i += 32) {
      hash = (hash * 31 + bytes[i] + bytes[i + 1]) >>> 0
      if (Math.abs(bytes[i] - bytes[0]) > 12 || Math.abs(bytes[i + 1] - bytes[1]) > 12) pintados++
    }
    return { hash, pintados, visibles: Number(c.dataset.piezasVisibles), error: gl.getError() }
  })
  const primera = await foto(); assert.ok(primera.pintados > 500, JSON.stringify(primera)); assert.equal(primera.error, 0)
  assert.equal(primera.visibles, piezas.reduce((s, p) => s + p.cantidad, 0))
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5)
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + box.height * .55, { steps: 12 }); await page.mouse.up()
  assert.notEqual((await foto()).hash, primera.hash)
  await page.getByRole('button', { name: 'Vista 3D frente', exact: true }).click()
  const frente = await foto()
  await page.getByLabel('Ver interior', { exact: true }).check()
  const interior = await foto(); assert.ok(interior.visibles < primera.visibles); assert.notEqual(interior.hash, frente.hash)
  await page.getByLabel('Acabado 3D', { exact: true }).selectOption('roble')
  assert.notEqual((await foto()).hash, interior.hash)
  await page.getByRole('button', { name: 'Ajustar vista 3D', exact: true }).click()
  await page.getByLabel('Seleccionar pieza 3D', { exact: true }).selectOption('P001-1')
  assert.match(await page.locator('.mueble3d-detail').innerText(), /Lateral/)
  await page.getByLabel('Aislar pieza', { exact: true }).check()
  assert.equal((await foto()).visibles, 1)
  await page.getByLabel('Aislar pieza', { exact: true }).uncheck()
  await page.getByLabel('Seleccionar pieza 3D', { exact: true }).selectOption('')
  await page.getByLabel('Separar piezas 3D', { exact: true }).fill('65')
  await page.locator('.mueble3d').screenshot({ path: join(output, 'mueble-3d-despiece.png'), animations: 'disabled' })
  await page.getByLabel('Separar piezas 3D', { exact: true }).fill('0')
  await page.getByLabel('Ver interior', { exact: true }).uncheck()
  await page.locator('.mueble3d').screenshot({ path: join(output, 'mueble-3d-armado.png'), animations: 'disabled' })
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar imagen 3D', exact: true }).click()
  await (await descarga).saveAs(join(output, 'mueble-3d-exportado.png'))
  // Elegir una puerta en la vista frontal comprueba la seleccion por rayo.
  await page.getByRole('button', { name: 'Vista 3D frente', exact: true }).click()
  await canvas.click({ position: { x: box.width * .43, y: box.height * .35 } })
  assert.notEqual(await page.getByLabel('Seleccionar pieza 3D', { exact: true }).inputValue(), '')
  await page.getByRole('button', { name: 'Pantalla completa 3D', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.mueble3d canvas').getBoundingClientRect().width > 1000)
  await page.getByRole('button', { name: 'Salir de pantalla completa 3D', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desbordamiento en movil')
  await page.getByRole('button', { name: 'Ajustar vista 3D', exact: true }).click()
  assert.ok((await foto()).pintados > 300)
  await page.locator('.mueble3d').screenshot({ path: join(output, 'mueble-3d-movil.png'), animations: 'disabled' })
  const perdido = await canvas.evaluate((c) => { const ext = c.getContext('webgl').getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); return !!ext })
  if (perdido) {
    await page.getByRole('button', { name: 'Reintentar 3D', exact: true }).click()
    await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
    assert.ok((await foto()).pintados > 300)
  }
  await page.getByRole('tab', { name: 'Plano de corte', exact: true }).click()
  assert.ok(await page.getByRole('button', { name: 'PDF de taller', exact: true }).isEnabled())
  await page.getByRole('tab', { name: 'Generar por medidas', exact: true }).click()
  await page.getByRole('button', { name: '🧊 Vista 3D', exact: true }).click()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  await page.getByLabel('Ancho total (cm)', { exact: true }).fill('180')
  await page.getByText('180 × 200 × 60 cm', { exact: true }).waitFor()
  assert.ok((await foto()).pintados > 300)
  assert.deepEqual(errores, [])
})
