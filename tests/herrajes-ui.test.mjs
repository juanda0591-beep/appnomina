import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { servidorPrueba } from './portal-helper.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('biblioteca: bases, manijas, bisagras, tubos, 3D, lista PDF y reapertura', { timeout: 120000 }, async (t) => {
  const { base, request, admin, sesion, carpeta } = await servidorPrueba(t)
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block' })
  await context.addInitScript((s) => {
    sessionStorage.setItem('nomina_token', s.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const output = process.env.UI_SCREENSHOT_DIR || carpeta
  await mkdir(output, { recursive: true })
  await page.goto(`${base}/cortes-planos`)
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Armario con biblioteca de herrajes')
  await page.getByRole('tab', { name: 'Generar por medidas', exact: true }).click()
  await page.locator('.biblioteca-bases summary').click()
  assert.equal(await page.locator('.base-mueble').count(), 8)
  await page.locator('.biblioteca-bases').screenshot({ path: join(output, 'biblioteca-bases.png') })
  await page.getByRole('button', { name: 'Cargar base Armario de dos cuerpos', exact: true }).click()
  await page.locator('.swal2-confirm').click()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  await page.locator('.modulo-herrajes summary').nth(1).click()
  await page.getByLabel('Módulo 2 · Largo manija (mm)', { exact: true }).fill('160')
  await page.getByLabel('Módulo 2 · Acabado de manija', { exact: true }).selectOption('dorado')
  await page.getByLabel('Módulo 2 · Referencia de manija', { exact: true }).fill('Manija de prueba 160')
  await page.getByLabel('Módulo 2 · Referencia tubo 1', { exact: true }).fill('Tubo de prueba Ø25')
  assert.match(await page.locator('.lista-herrajes').innerText(), /576.5 mm de largo/)
  assert.match(await page.locator('.lista-herrajes').innerText(), /Manija de prueba 160/)
  await page.locator('.modulo-herrajes').nth(1).screenshot({ path: join(output, 'biblioteca-herrajes.png') })
  await page.getByRole('button', { name: /Generar despiece/ }).click()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  const canvas = page.locator('.mueble3d canvas')
  await canvas.locator('xpath=self::*[@data-estado="listo"]').waitFor()
  await page.locator('.mueble3d').screenshot({ path: join(output, 'armario-herrajes-frente.png') })
  await page.getByLabel('Seleccionar pieza 3D', { exact: true }).selectOption('MAN-1-0')
  assert.match(await page.locator('.mueble3d-detail').innerText(), /Manija de prueba 160/)
  const cerrada = await canvas.screenshot()
  await page.getByRole('button', { name: 'Abrir pieza', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.mueble3d canvas')?.dataset.animando === 'false')
  assert.notDeepEqual(await canvas.screenshot(), cerrada, 'La manija acompaña la apertura de la puerta')
  await page.getByRole('button', { name: 'Cerrar todas las aperturas', exact: true }).click()
  await page.getByLabel('Ver interior', { exact: true }).check()
  await page.getByLabel('Seleccionar pieza 3D', { exact: true }).selectOption('TUB-1-colgador')
  assert.match(await page.locator('.mueble3d-detail').innerText(), /Tubo de prueba Ø25/)
  await page.locator('.mueble3d').screenshot({ path: join(output, 'armario-herrajes-interior.png') })
  const visibles = Number(await canvas.getAttribute('data-piezas-visibles'))
  await page.getByLabel('Mostrar herrajes', { exact: true }).uncheck()
  assert.ok(Number(await canvas.getAttribute('data-piezas-visibles')) < visibles)
  await page.getByLabel('Mostrar herrajes', { exact: true }).check()
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  const lista = (await request('/planos-corte', 'GET', undefined, admin)).data
  const guardado = (await request(`/planos-corte/${lista[0].id}`, 'GET', undefined, admin)).data
  assert.equal(guardado.proyecto.diseno.modulos[1].herrajes.manija.largo, 160)
  assert.equal(guardado.proyecto.diseno.modulos[1].herrajes.tubos.length, 1)
  const descargar = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF de taller', exact: true }).click()
  const archivo = join(output, 'armario-herrajes.pdf')
  await (await descargar).saveAs(archivo)
  assert.ok((await readFile(archivo)).toString('latin1').includes('LISTA DE HERRAJES'))
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click()
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  await page.locator('.modulo-herrajes summary').nth(1).click()
  assert.equal(await page.getByLabel('Módulo 2 · Largo manija (mm)', { exact: true }).inputValue(), '160')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.locator('.modulo-herrajes').nth(1).screenshot({ path: join(output, 'herrajes-movil.png') })
  assert.deepEqual(errores, [])
})

test('complementos: conserva 18 mm, panel libre editable y tocador con espejo y repisas', { timeout: 120000 }, async (t) => {
  const { base, request, admin, sesion, carpeta } = await servidorPrueba(t)
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block' })
  await context.addInitScript((s) => {
    sessionStorage.setItem('nomina_token', s.token); sessionStorage.setItem('nomina_user', 'admin'); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  const output = process.env.UI_SCREENSHOT_DIR || carpeta
  await mkdir(output, { recursive: true })
  await page.goto(`${base}/cortes-planos`)
  await page.getByRole('tab', { name: 'Generar por medidas', exact: true }).click()
  for (const [label, valor] of [['Ancho total (cm)', '100'], ['Alto total (cm)', '180'], ['Fondo (cm)', '50'], ['Espesor (mm)', '18']]) {
    await page.getByLabel(label, { exact: true }).first().fill(valor)
  }
  await page.getByRole('button', { name: 'Habilitar complementos', exact: true }).click()
  assert.equal(await page.getByLabel('Espesor (mm)', { exact: true }).first().inputValue(), '18')
  assert.equal(await page.getByLabel('Espesor trasera (mm)', { exact: true }).inputValue(), '18')
  await page.getByRole('button', { name: 'Agregar panel libre', exact: true }).click()
  await page.locator('.complementos-grid summary').click()
  assert.equal(await page.getByLabel('Panel adicional · Espesor MDF (mm)', { exact: true }).inputValue(), '18')
  await page.getByLabel('Panel adicional · Orientación', { exact: true }).selectOption('lateral')
  await page.getByLabel('Panel adicional · Z (mm)', { exact: true }).fill('150')
  await page.getByRole('button', { name: /Generar despiece/ }).click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Complementos en 18 mm')
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  let lista = (await request('/planos-corte', 'GET', undefined, admin)).data
  let guardado = (await request(`/planos-corte/${lista[0].id}`, 'GET', undefined, admin)).data
  const panel = guardado.proyecto.diseno.fabricacion.complementos[0]
  assert.equal(Number(guardado.proyecto.diseno.espesor), 18)
  assert.equal(panel.espesor, 18); assert.equal(panel.plano, 'lateral'); assert.equal(panel.z, 150)

  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('tab', { name: 'Generar por medidas', exact: true }).click()
  await page.locator('.biblioteca-bases summary').click()
  await page.getByRole('button', { name: 'Cargar base Tocador con repisas', exact: true }).click()
  await page.locator('.swal2-confirm').click()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  await page.getByRole('button', { name: /Generar despiece/ }).click()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  await page.locator('.mueble3d').screenshot({ path: join(output, 'tocador-repisas-3d.png') })
  const dibujado = await page.locator('.mueble3d canvas').evaluate((c) => {
    const gl = c.getContext('webgl'), pixels = new Uint8Array(c.width * c.height * 4)
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let diferentes = 0
    for (let i = 0; i < pixels.length; i += 32) if (Math.abs(pixels[i] - pixels[0]) > 12 || Math.abs(pixels[i + 1] - pixels[1]) > 12) diferentes++
    return diferentes
  })
  assert.ok(dibujado > 500, 'El tocador tiene geometría visible en WebGL')
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar espejo fijo', exact: true }).click()
  const espejoExtra = page.locator('.complementos-grid details').last()
  await espejoExtra.locator('summary').click()
  assert.equal(await espejoExtra.getByLabel('Espejo fijo · Desplazamiento', { exact: true }).inputValue(), 'fijo')
  await espejoExtra.getByLabel('Espejo fijo · X (mm)', { exact: true }).fill('-650')
  await page.getByRole('button', { name: /Generar despiece/ }).click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Tocador con complementos')
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  lista = (await request('/planos-corte', 'GET', undefined, admin)).data
  const tocador = lista.find((p) => p.nombre === 'Tocador con complementos')
  assert.ok(tocador)
  guardado = (await request(`/planos-corte/${tocador.id}`, 'GET', undefined, admin)).data
  assert.equal(guardado.proyecto.diseno.fabricacion.complementos.filter((c) => c.tipo === 'espejo').length, 2)
  assert.equal(guardado.proyecto.diseno.fabricacion.complementos.at(-1).x, -650)
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  await page.getByLabel('Seleccionar pieza 3D', { exact: true }).selectOption('VIDRIO:espejo-base')
  assert.match(await page.locator('.mueble3d-detail').innerText(), /Espejo fijo/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(errores, [])
})
