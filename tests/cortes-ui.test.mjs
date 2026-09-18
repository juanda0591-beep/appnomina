import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('Editor de cortes: proyecto, cotas, zoom, versiones, PDF y movil', { timeout: 120000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'cortes-ui-'))
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
  const api = async (path, body, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`${base}/api${path}`, { method, signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const datos = await res.json(); assert.equal(res.status, 200, JSON.stringify(datos)); return datos
  }
  const sesion = await api('/login', { username: 'admin', password: 'admin123' }); token = sesion.token
  const producto = await api('/productos', { nombre: 'Armario dos cuerpos', procesos: [] })
  await api(`/productos/${producto.id}/piezas`, { piezas: [
    { nombre: 'Laterales', ancho: 580, alto: 1800, cantidad: 2, permiteRotar: false, canto: 'der' },
    { nombre: 'Entrepanos', ancho: 564, alto: 560, cantidad: 6, permiteRotar: true },
    { nombre: 'Puertas', ancho: 595, alto: 1790, cantidad: 2, permiteRotar: false, canto: 'arriba,abajo,izq,der' },
  ] }, 'PUT')
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block', timezoneId: 'America/Bogota' })
  await context.addInitScript((sesion) => {
    sessionStorage.setItem('nomina_token', sesion.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const esperar = (texto) => texto === 'Guardado'
    ? page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
    : page.getByText(texto, { exact: true }).waitFor()
  const calcular = async () => {
    await page.getByRole('button', { name: 'Calcular corte', exact: true }).click()
    await esperar('Calculado')
  }
  await page.goto(`${base}/cortes-planos`)
  await page.waitForLoadState('networkidle')
  assert.deepEqual(errores, [], 'La pagina debe iniciar sin errores')
  assert.match(await page.locator('body').innerText(), /Nombre del proyecto/)
  await page.getByLabel('Producto', { exact: true }).selectOption(String(producto.id))
  await page.getByLabel('Nombre P001', { exact: true }).waitFor()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Armario taller - prueba')
  await page.getByLabel('Material / acabado', { exact: true }).fill('Melamina blanca 18 mm')
  await page.getByLabel('Saneado por borde (mm)', { exact: true }).fill('10')
  await calcular()
  assert.equal(await page.getByRole('button', { name: 'PDF de taller', exact: true }).isEnabled(), true)
  const canvas = page.locator('.corte-canvas canvas').first()
  const pixeles = () => canvas.evaluate((c) => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let visibles = 0, hash = 0
    for (let i = 0; i < data.length; i += 16) { if (data[i + 3]) visibles++; hash = (hash * 31 + data[i] + data[i + 1]) >>> 0 }
    return { visibles, hash }
  })
  const antes = await pixeles(); assert.ok(antes.visibles > 500)
  await page.getByRole('button', { name: 'Acercar', exact: true }).click()
  await esperar('125%')
  assert.notEqual((await pixeles()).hash, antes.hash)
  await page.getByRole('button', { name: 'Ajustar a pantalla', exact: true }).click()
  await esperar('100%')
  await page.getByRole('button', { name: 'P001', exact: true }).click()
  await page.locator('.corte-inspector strong').waitFor()
  assert.match(await page.locator('.corte-inspector').innerText(), /Laterales/)
  await page.getByLabel('Ancho P001', { exact: true }).fill('59')
  await esperar('Requiere recalculo')
  assert.equal(await page.getByRole('button', { name: 'PDF de taller', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await esperar('Calculado')
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await esperar('Guardado')
  let planos = await api('/planos-corte'); assert.equal(planos.length, 1)
  await page.getByLabel('Unidades', { exact: true }).fill('2')
  await esperar('Requiere recalculo'); await calcular()
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click(); await esperar('Guardado')
  planos = await api('/planos-corte'); assert.equal(planos.length, 2); assert.equal(planos[0].revision, 2)
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click(); await esperar('Guardado')
  assert.equal(await page.getByLabel('Unidades', { exact: true }).inputValue(), '2')
  assert.equal(await page.getByLabel('Nombre P001', { exact: true }).inputValue(), 'Laterales')
  assert.equal(await page.getByLabel('Saneado por borde (mm)', { exact: true }).inputValue(), '10')
  const output = process.env.UI_SCREENSHOT_DIR || carpeta
  await mkdir(output, { recursive: true })
  for (const formato of ['a4', 'a3']) {
    await page.getByLabel('Formato PDF', { exact: true }).selectOption(formato)
    const descarga = page.waitForEvent('download')
    await page.getByRole('button', { name: 'PDF de taller', exact: true }).click()
    await (await descarga).saveAs(join(output, `plano-taller-${formato}.pdf`))
  }
  await page.waitForFunction(() => !document.querySelector('[role="status"]'))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(output, 'cortes-desktop.png'), animations: 'disabled', fullPage: true })
  await page.getByRole('button', { name: 'Pantalla completa', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-canvas canvas')?.width > 1000)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'La pagina no debe desbordar en movil')
  assert.ok((await pixeles()).visibles > 500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(output, 'cortes-mobile.png'), animations: 'disabled', fullPage: true })
  await page.getByRole('button', { name: 'Guardar como copia', exact: true }).click(); await esperar('Guardado')
  planos = await api('/planos-corte'); assert.equal(planos.length, 3); assert.equal(planos[0].revision, 1)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Armario por medidas')
  await page.getByRole('tab', { name: 'Generar por medidas', exact: true }).click()
  await page.getByLabel('Ancho total (cm)', { exact: true }).fill('120')
  await page.getByLabel('Alto total (cm)', { exact: true }).fill('180')
  await page.getByLabel('Fondo (cm)', { exact: true }).fill('58')
  await page.getByRole('button', { name: /Generar despiece/ }).click()
  await esperar('Vistas técnicas del mueble')
  assert.equal(await page.locator('.corte-vistas svg').count(), 3)
  await calcular()
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click(); await esperar('Guardado')
  planos = await api('/planos-corte')
  const proyectoGenerado = await api(`/planos-corte/${planos[0].id}`)
  assert.equal(proyectoGenerado.proyecto.diseno.ancho, '120')
  const pdfVistas = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF de taller', exact: true }).click()
  await (await pdfVistas).saveAs(join(output, 'plano-taller-vistas.pdf'))
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click(); await esperar('Guardado')
  await esperar('Vistas técnicas del mueble')
  await page.getByRole('tab', { name: 'Generar por medidas', exact: true }).click()
  assert.equal(await page.getByLabel('Ancho total (cm)', { exact: true }).inputValue(), '120')
  await page.getByLabel('Ancho total (cm)', { exact: true }).fill('130')
  assert.equal(await page.getByRole('button', { name: 'PDF de taller', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: /Generar despiece/ }).click()
  await calcular()
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click(); await esperar('Guardado')
  planos = await api('/planos-corte'); assert.equal(planos[0].revision, 2)
  assert.equal((await api(`/planos-corte/${planos[0].id}`)).proyecto.diseno.ancho, '130')
  await page.getByLabel('Ancho P001', { exact: true }).fill('59')
  assert.equal(await page.locator('.corte-vistas').count(), 0, 'La vista del mueble no debe sobrevivir a una edicion manual del despiece')
  assert.deepEqual(errores, [])
})
