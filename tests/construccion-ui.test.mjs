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

test('Construcción configurable: vuelos, rieles, caja, módulos, versiones y PDF', { timeout: 120000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'construccion-ui-'))
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
  const antiguo = { ancho: '120', alto: '180', fondo: '60', espesor: 18, gap: 3, holguraFondo: 10,
    armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [nuevoModulo()] }
  const previo = await api('/planos-corte', { nombre: 'Diseño anterior', proyecto: { ...proyectoVacio(), piezas: generarDespiece(paramsParaDespiece(antiguo)).piezas, diseno: antiguo } })
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1600, height: 1080 }, serviceWorkers: 'block' })
  await context.addInitScript((sesion) => {
    sessionStorage.setItem('nomina_token', sesion.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const output = process.env.UI_SCREENSHOT_DIR || carpeta
  await mkdir(output, { recursive: true })
  t.after(async () => { if (!page.isClosed()) await page.screenshot({ path: join(output, 'construccion-final.png'), animations: 'disabled' }).catch(() => {}) })
  const llenar = (label, valor) => page.getByLabel(label, { exact: true }).fill(String(valor))
  const elegir = (label, valor) => page.getByLabel(label, { exact: true }).selectOption(valor)
  const generar = async () => { await page.getByRole('button', { name: /Generar despiece/ }).click(); await page.getByText('Vistas técnicas del mueble', { exact: true }).waitFor() }
  const guardar = async () => {
    await page.getByRole('button', { name: 'Calcular corte', exact: true }).click()
    await page.getByText('Calculado', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  }
  await page.goto(`${base}/cortes-planos`)
  await llenar('Nombre del proyecto', 'Armario a medida con rieles')
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  await llenar('Ancho total (cm)', 120); await llenar('Alto total (cm)', 180); await llenar('Fondo (cm)', 60)
  await elegir('Montaje techo', 'cubre'); await llenar('Sobresaliente techo izquierda', 20); await llenar('Sobresaliente techo derecha', 30); await llenar('Sobresaliente techo frente', 40)
  await elegir('Montaje piso', 'cubre'); await llenar('Sobresaliente piso izquierda', 10); await llenar('Sobresaliente piso derecha', 10)
  await llenar('Módulo 1 · Cantidad de cajones', 2); await llenar('Módulo 1 · Alto de zona (cm)', 50); await llenar('Módulo 1 · Altura inicial (cm)', 20)
  await elegir('Módulo 1 · Tipo de riel', 'lateral')
  assert.ok(await page.getByRole('button', { name: /Generar despiece/ }).isDisabled(), 'Exige datos de fabricante antes de generar')
  await llenar('Módulo 1 · Holgura por lado (mm)', 12.5); await llenar('Módulo 1 · Largo del riel (mm)', 500)
  await llenar('Módulo 1 · Referencia del riel', 'Riel de prueba 500')
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  assert.match(await page.getByLabel('Módulo 1 · Medidas de caja').innerText(), /113,9/)
  await page.getByLabel('Ver interior', { exact: true }).check()
  const canvas = page.locator('.mueble3d canvas')
  const total = Number(await canvas.getAttribute('data-piezas-visibles'))
  await page.getByLabel('Mostrar rieles', { exact: true }).uncheck()
  assert.equal(Number(await canvas.getAttribute('data-piezas-visibles')), total - 4)
  await page.getByLabel('Mostrar rieles', { exact: true }).check()
  await page.getByLabel('Acabado 3D', { exact: true }).selectOption('roble')
  await page.locator('.mueble3d').screenshot({ path: join(output, 'construccion-riel.png'), animations: 'disabled' })
  await generar(); await guardar()
  let lista = await api('/planos-corte'), proyecto = await api(`/planos-corte/${lista[0].id}`)
  assert.equal(proyecto.proyecto.diseno.techo.frente, 40)
  assert.equal(proyecto.proyecto.diseno.modulos[0].configuracionCajon.holguraLateral, 12.5)
  assert.equal(proyecto.proyecto.piezas.find((p) => p.nombre === 'Techo').ancho, 1250)
  const antes = proyecto.proyecto.piezas.find((p) => p.nombre === 'Trasera cajón').ancho
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF de taller', exact: true }).click()
  await (await descarga).saveAs(join(output, 'plano-construccion-configurable.pdf'))
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click()
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  assert.equal(await page.getByLabel('Sobresaliente techo frente').inputValue(), '40')
  assert.equal(await page.getByLabel('Módulo 1 · Tipo de riel').inputValue(), 'lateral')
  await elegir('Módulo 1 · Tipo de riel', 'sin')
  await generar(); await guardar()
  lista = await api('/planos-corte'); proyecto = await api(`/planos-corte/${lista[0].id}`)
  assert.equal(proyecto.revision, 2)
  assert.equal(proyecto.proyecto.piezas.find((p) => p.nombre === 'Trasera cajón').ancho - antes, 21)
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'El configurador no desborda en móvil')
  await page.locator('.modulo-configurable').screenshot({ path: join(output, 'construccion-modulo-movil.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 1600, height: 1080 })
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'Diseño anterior' }).getByRole('button', { name: 'Abrir' }).click()
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  await page.getByRole('button', { name: 'Personalizar construcción', exact: true }).click()
  await page.locator('.swal2-confirm').click()
  await page.getByLabel('Montaje techo', { exact: true }).waitFor()
  assert.equal((await api(`/planos-corte/${previo.id}`)).proyecto.diseno.construccionVersion, undefined)
  assert.deepEqual(errores, [])
})
