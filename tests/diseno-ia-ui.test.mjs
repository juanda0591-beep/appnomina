import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { servidorPrueba } from './portal-helper.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const pixelesModelo = async (canvas) => {
  const { data, info } = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let oscuros = 0
  for (let i = 0; i < data.length; i += info.channels) if (data[i] < 210 && data[i + 1] < 210 && data[i + 2] < 210) oscuros++
  return oscuros
}

test('asistente IA cambia gavetas y entrepaños, actualiza 3D, guarda y reabre', { timeout: 120000 }, async (t) => {
  const { base, request, admin, sesion } = await servidorPrueba(t)
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' })
  await context.addInitScript((s) => {
    sessionStorage.setItem('nomina_token', s.token); sessionStorage.setItem('nomina_user', s.username); sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage(), errores = [], consultas = []
  page.on('pageerror', (e) => errores.push(e.message))
  const capturas = process.env.UI_SCREENSHOT_DIR
  if (capturas) await mkdir(capturas, { recursive: true })
  await page.route('**/api/ia/diseno/estado', (route) => route.fulfill({ json: { configurada: true } }))
  await page.route('**/api/ia/diseno', (route) => {
    const body = route.request().postDataJSON(); consultas.push(body)
    const cajones = consultas.length === 1
    return route.fulfill({ json: { explicacion: cajones ? 'Dos gavetas en el primer módulo.' : 'Un entrepaño en el primer módulo.',
      cambios: cajones ? [{ tipo: 'cajones', modulo: 1, numero: 2, opcion: null }] : [{ tipo: 'entrepanos', modulo: 1, numero: 1, opcion: null }],
      preguntas: [], advertencias: [], resumen: [cajones ? 'Módulo 1: 2 gavetas, zona de 60 cm' : 'Módulo 1: 1 entrepaño'],
      piezasAntes: cajones ? 5 : 17, piezasDespues: cajones ? 17 : 18, puedeAplicar: true } })
  })
  await page.goto(`${base}/cortes-planos`)
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Armario con diseño IA')
  await page.getByRole('tab', { name: 'Generar por medidas', exact: true }).click()
  await page.getByLabel('Ancho total (cm)', { exact: true }).fill('120')
  await page.getByLabel('Alto total (cm)', { exact: true }).fill('180')
  await page.getByLabel('Fondo (cm)', { exact: true }).fill('60')
  await page.getByLabel('Instrucción de diseño').fill('Ponle 2 gavetas al módulo 1')
  await page.getByRole('button', { name: 'Proponer cambios' }).click()
  await page.getByText('Módulo 1: 2 gavetas, zona de 60 cm').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Aplicar al diseño y al plano' }).isDisabled(), true)
  await page.getByLabel('Revisé estos cambios y sus medidas').check()
  await page.getByRole('button', { name: 'Aplicar al diseño y al plano' }).click()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).waitFor()
  const canvas = page.locator('.mueble3d canvas')
  await canvas.locator('xpath=self::*[@data-estado="listo"]').waitFor()
  assert.ok(Number(await canvas.getAttribute('data-piezas-visibles')) > 5)
  assert.ok(await pixelesModelo(canvas) > 1000, 'El mueble 3D se dibuja en escritorio')
  const antes = await canvas.screenshot()
  await page.getByRole('button', { name: 'Vista 3D lado', exact: true }).click()
  assert.notDeepEqual(await canvas.screenshot(), antes, 'La vista 3D responde al cambio de cámara')
  if (capturas) await page.locator('.mueble3d').screenshot({ path: join(capturas, 'diseno-ia-gavetas-escritorio.png') })
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  let lista = (await request('/planos-corte', 'GET', undefined, admin)).data
  let guardado = (await request(`/planos-corte/${lista[0].id}`, 'GET', undefined, admin)).data
  assert.equal(guardado.proyecto.diseno.modulos[0].cajones, 2)
  assert.ok(guardado.proyecto.piezas.some((p) => p.nombre === 'Frente cajón' && p.cantidad === 2))

  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  assert.equal(await page.getByLabel('Módulo 1 · Cantidad de cajones').inputValue(), '2')
  await page.getByLabel('Instrucción de diseño').fill('Agrega un entrepaño al módulo 1')
  await page.getByRole('button', { name: 'Proponer cambios' }).click()
  await page.getByText('Módulo 1: 1 entrepaño').waitFor()
  await page.getByLabel('Revisé estos cambios y sus medidas').check()
  await page.getByRole('button', { name: 'Aplicar al diseño y al plano' }).click()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  await page.getByRole('button', { name: 'Guardar version', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.corte-subtitle')?.textContent.endsWith('Guardado'))
  lista = (await request('/planos-corte', 'GET', undefined, admin)).data
  guardado = (await request(`/planos-corte/${lista[0].id}`, 'GET', undefined, admin)).data
  assert.equal(guardado.revision, 2)
  assert.equal(guardado.proyecto.diseno.modulos[0].alturas.length, 1)
  assert.equal(guardado.proyecto.diseno.modulos[0].cajones, 2)
  assert.equal(consultas[1].diseno.modulos[0].cajones, 2)

  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click()
  await page.getByRole('button', { name: 'Editar construcción', exact: true }).click()
  assert.equal(await page.getByLabel('Módulo 1 · Cantidad de cajones').inputValue(), '2')
  assert.equal(await page.getByLabel('Módulo 1 · Entrepaño 1 (cm)').count(), 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: /^Piezas \(/ }).click()
  await page.getByRole('tab', { name: 'Mueble 3D', exact: true }).click()
  await page.locator('.mueble3d canvas[data-estado="listo"]').waitFor()
  assert.ok(Number(await page.locator('.mueble3d canvas').getAttribute('data-piezas-visibles')) > 5)
  assert.ok(await pixelesModelo(page.locator('.mueble3d canvas')) > 1000, 'El mueble 3D se dibuja en móvil')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  if (capturas) await page.locator('.mueble3d').screenshot({ path: join(capturas, 'diseno-ia-gavetas-movil.png') })
  assert.deepEqual(errores, [])
})
