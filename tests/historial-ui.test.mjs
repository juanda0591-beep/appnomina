import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'

// Ejecutar despues de compilar; requiere Playwright y un navegador instalado.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

test('Historiales: filtros, recarga, paginacion, factura, anulacion y pantallas', { timeout: 120000 }, async (t) => {
  const carpeta = await mkdtemp(join(tmpdir(), 'historial-ui-'))
  const reserva = createServer().listen(0, '127.0.0.1')
  await once(reserva, 'listening')
  const port = reserva.address().port
  await new Promise((resolve) => reserva.close(resolve))
  const proceso = spawn(process.execPath, ['backend/server.js'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, DB_PATH: join(carpeta, 'prueba.db'), PORT: String(port), BACKUP_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (proceso.exitCode === null) { const salida = once(proceso, 'exit'); proceso.kill(); await salida }
    await rm(carpeta, { recursive: true, force: true })
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no inicio')), 10000)
    proceso.once('error', (e) => { clearTimeout(timer); reject(e) })
    proceso.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Servidor termino: ${code}`)) })
    proceso.stdout.on('data', (data) => { if (data.toString().includes('http://localhost:')) { clearTimeout(timer); resolve() } })
  })
  const base = `http://127.0.0.1:${port}`
  let token
  const api = async (path, body) => {
    const res = await fetch(`${base}/api${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    assert.equal(res.status, 200, JSON.stringify(data))
    return data
  }
  const sesion = await api('/login', { username: 'admin', password: 'admin123' })
  token = sesion.token
  const cliente = await api('/clientes', { nombre: 'Cliente principal', apellidos: 'Prueba' })
  const otro = await api('/clientes', { nombre: 'Cliente sin pagos' })
  const producto = await api('/productos', { nombre: 'Mesa prueba', stockApertura: 10, procesos: [{ nombre: 'Armado', pago: 100 }] })
  const venta = await api('/ventas', { clienteId: cliente.id, fecha: '2026-09-14', pagoInicial: 0,
    items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 10000 }] })
  for (let i = 0; i < 51; i++) await api(`/ventas/${venta.id}/pagos`, { monto: 100, fecha: '2026-09-14T12:00:00.000Z', comentario: `Abono ${i}` })
  const empleado = await api('/empleados', { nombre: 'Ana Prueba', cedula: '1000001', cargo: 'Armado' })
  const segundo = await api('/empleados', { nombre: 'Berta Prueba', cedula: '2000002', cargo: 'Armado' })
  for (let i = 0; i < 9; i++) await api('/nominas', {
    solicitudId: randomUUID(), empleadoId: i === 8 ? segundo.id : empleado.id,
    fecha: i === 8 ? '2026-09-13' : '2026-09-14',
    items: [{ productoId: producto.id, procesoId: producto.procesos[0].id, cantidad: 1, pago: 100, subtotal: 100 }],
    descuentos: [], subtotal: 100, totalDescuentos: 0, extra: 20, extraDetalle: 'Bono especial',
    descuentoTrabajo: 10, descuentoTrabajoDetalle: 'Ajuste de trabajo', total: 110,
  })
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', timezoneId: 'America/Bogota' })
  await context.addInitScript((sesion) => {
    sessionStorage.setItem('nomina_token', sesion.token)
    sessionStorage.setItem('nomina_user', sesion.username)
    sessionStorage.setItem('nomina_rol', 'admin')
  }, sesion)
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(error.message))
  const esperarTexto = (texto) => page.getByText(texto, { exact: false }).first().waitFor()
  const buscar = async () => {
    const respuesta = page.waitForResponse((res) => res.url().includes('/api/historial-pagos?'))
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    assert.equal((await respuesta).status(), 200)
    await page.getByRole('button', { name: 'Buscar', exact: true }).waitFor()
  }
  await page.goto(`${base}/historial-pagos`)
  await page.getByLabel('Cliente *').selectOption(String(cliente.id))
  await page.getByLabel('Hasta', { exact: true }).fill('2026-09-14')
  await buscar()
  await esperarTexto('51 registros')
  assert.equal(await page.locator('tbody tr').count(), 50)
  assert.match(await page.locator('.banner').innerText(), /5\.100/)
  await page.getByRole('button', { name: /Siguiente/ }).click()
  await esperarTexto('Página 2 de 2')
  assert.equal(await page.locator('tbody tr').count(), 1)
  await buscar()
  await esperarTexto('Página 1 de 2')
  await buscar()
  await esperarTexto('51 registros')
  await page.getByRole('link', { name: venta.codigo }).first().click()
  await page.locator('.modal').waitFor()
  assert.match(await page.locator('.modal').innerText(), /Abonos registrados/)

  await page.goto(`${base}/historial-pagos`)
  await page.getByLabel('Cliente *').selectOption(String(cliente.id))
  // Retener una respuesta permite comprobar que limpiar cancela la consulta anterior.
  let liberar
  const retenida = new Promise((resolve) => { liberar = resolve })
  let interceptada
  const llegada = new Promise((resolve) => { interceptada = resolve })
  await page.route('**/api/historial-pagos?**', async (route) => {
    const respuesta = await route.fetch()
    interceptada()
    await retenida
    await route.fulfill({ response: respuesta }).catch(() => {})
  })
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await llegada
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click()
  liberar()
  await page.unrouteAll({ behavior: 'wait' })
  await esperarTexto('Sin consulta')
  assert.equal(await page.locator('tbody tr').count(), 0)
  await page.getByLabel('Cliente *').selectOption(String(otro.id))
  await buscar()
  await esperarTexto('Sin pagos en el período seleccionado')
  await page.getByLabel('Cliente *').selectOption(String(cliente.id))
  await buscar()
  await esperarTexto('51 registros')
  const capturas = process.env.UI_SCREENSHOT_DIR
  if (capturas) {
    await mkdir(capturas, { recursive: true })
    await page.screenshot({ path: join(capturas, 'historial-desktop.png'), animations: 'disabled' })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'La pagina desborda en movil')
  if (capturas) await page.screenshot({ path: join(capturas, 'historial-mobile.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.goto(`${base}/historial`)
  await esperarTexto('Página 1 de 2')
  await page.getByRole('button', { name: /Siguiente/ }).click()
  await esperarTexto('Página 2 de 2')
  await page.getByLabel('Buscar', { exact: true }).fill('1000001')
  await esperarTexto('Página 1 de 1')
  assert.equal(await page.locator('.total-badge').count(), 8)
  await page.getByLabel('Buscar', { exact: true }).fill('2000002')
  await esperarTexto('Berta Prueba')
  assert.equal(await page.locator('.total-badge').count(), 1)
  await esperarTexto('Bono especial')
  await esperarTexto('Ajuste de trabajo')
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click()
  await page.getByRole('button', { name: /Siguiente/ }).click()
  await page.getByRole('button', { name: /Eliminar/ }).click()
  await page.locator('.swal2-textarea').fill('Pago registrado por error')
  await page.locator('.swal2-confirm').click()
  await esperarTexto('Página 1 de 1')
  assert.equal(await page.locator('.total-badge').count(), 8)
  assert.equal((await api('/nominas')).length, 8)
  const prestamo = await api('/prestamos', { empleadoId: empleado.id, monto: 50, fecha: '2026-09-14', descripcion: 'Adelanto de prueba' })
  const tarea = await api('/tareas', { empleadoId: empleado.id, productoId: producto.id,
    procesoId: producto.procesos[0].id, cantidad: 1 })
  await api(`/tareas/${tarea.id}/terminar`, {})
  await page.goto(`${base}/nomina`)
  await page.locator('main select').first().selectOption(String(empleado.id))
  await page.locator('.modal').getByRole('button', { name: /Confirmar/ }).click()
  await page.getByRole('button', { name: 'Todo', exact: true }).click()
  await page.getByRole('button', { name: /Pagar y generar PDF/ }).click()
  const descarga = page.waitForEvent('download')
  await page.locator('.swal2-confirm').click()
  await descarga
  await page.getByRole('button', { name: /Pagar y generar PDF/ }).waitFor()
  await page.locator('main select').first().selectOption(String(empleado.id))
  await esperarTexto('Sin préstamos pendientes')
  assert.equal(await page.locator('.modal').count(), 0)
  assert.equal((await api('/prestamos')).find((p) => p.id === prestamo.id).saldo, 0)
  assert.equal((await api('/tareas')).find((p) => p.id === tarea.id).estado, 'pagada')
  // Visitar las pantallas afectadas por la carga local detecta fallos de renderizado.
  for (const ruta of ['/inicio', '/nomina', '/clientes', '/empleados', '/prestamos', '/gestion-nomina',
    '/gestion-produccion', '/productos', '/materiales', '/colores', '/control-dinero', '/reportes', '/costos', '/empresa', '/cortes-planos']) {
    await page.goto(base + ruta)
    await page.locator('main h2').first().waitFor()
    await page.waitForLoadState('networkidle')
    assert.ok((await page.locator('main').innerText()).length > 20, ruta)
  }
  assert.deepEqual(errores, [])
})
