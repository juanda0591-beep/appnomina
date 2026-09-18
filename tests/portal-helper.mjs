import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

export async function servidorPrueba(t) {
  const carpeta = await mkdtemp(join(tmpdir(), 'portal-test-'))
  const reserva = createServer().listen(0, '127.0.0.1')
  await once(reserva, 'listening')
  const port = reserva.address().port
  await new Promise((resolve) => reserva.close(resolve))
  const proceso = spawn(process.execPath, ['backend/server.js'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, DB_PATH: join(carpeta, 'prueba.db'), PORT: String(port), BACKUP_ENABLED: 'false', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (proceso.exitCode === null) { const salida = once(proceso, 'exit'); proceso.kill(); await salida }
    await rm(carpeta, { recursive: true, force: true })
  })
  let logs = ''
  proceso.stderr.on('data', (d) => { logs += d.toString() })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`El servidor no inició: ${logs}`)), 15000)
    proceso.once('error', (e) => { clearTimeout(timer); reject(e) })
    proceso.once('exit', (c) => { clearTimeout(timer); reject(new Error(`Servidor terminó ${c}: ${logs}`)) })
    proceso.stdout.on('data', (d) => { if (d.toString().includes('http://localhost:')) { clearTimeout(timer); resolve() } })
  })
  const base = `http://127.0.0.1:${port}`
  const request = async (path, method = 'GET', body, headers = {}) => {
    const res = await fetch(base + '/api' + path, { method, signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-Portal': '1', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.arrayBuffer()
    return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0], headers: res.headers }
  }
  const login = await request('/login', 'POST', { username: 'admin', password: 'admin123' })
  const admin = { Authorization: `Bearer ${login.data.token}` }
  return { base, request, admin, carpeta, sesion: login.data }
}

export const datosCliente = (correo = 'cliente@ejemplo.com') => ({ correo, password: 'Mayorista2026!',
  negocio: 'Muebles del Norte', contacto: 'Ana Pérez', nit: correo, telefono: '3001234567',
  direccion: 'Calle 10 # 20-30', municipio: 'Bogotá', aceptaDatos: true, ofertas: false })
export const ficha = { publicado: true, categoria: 'Muebles', descripcion: 'Diseño para tu negocio.', medidas: '120 × 80 × 40 cm', minimo: 2, precio: 150000, modalidad: 'encargo' }
