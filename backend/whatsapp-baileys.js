import Database from 'better-sqlite3'
import { mkdir, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import QRCode from 'qrcode'

// Dependencia aislada: el servidor de pedidos no importa ni arranca Baileys.
export async function cargarBaileys() {
  const require = createRequire(new URL('../services/whatsapp/package.json', import.meta.url))
  let ruta
  try { ruta = require.resolve('@whiskeysockets/baileys') }
  catch { throw new Error('Falta instalar Baileys: npm install --prefix services/whatsapp @whiskeysockets/baileys') }
  const b = await import(pathToFileURL(ruta).href)
  if (!b.initAuthCreds || !b.BufferJSON || !(typeof b.default === 'function' || typeof b.makeWASocket === 'function')) {
    throw new Error('La versión instalada de Baileys no tiene la interfaz esperada. Revisa la instalación antes de vincular.')
  }
  return b
}

export async function estadoAuthSqlite(b, carpeta) {
  const dir = resolve(carpeta)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const archivo = join(dir, 'auth.db')
  const db = new Database(archivo)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS auth (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)')
  await chmod(archivo, 0o600)
  const leer = (k) => {
    const row = db.prepare('SELECT valor FROM auth WHERE clave=?').get(k)
    return row ? JSON.parse(row.valor, b.BufferJSON.reviver) : null
  }
  const escribir = (k, v) => db.prepare('INSERT INTO auth VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor').run(k, JSON.stringify(v, b.BufferJSON.replacer))
  const creds = leer('creds') || b.initAuthCreds()
  return {
    state: { creds, keys: {
      get: async (type, ids) => Object.fromEntries(ids.map((id) => {
        let value = leer(`${type}:${id}`)
        if (type === 'app-state-sync-key' && value) value = b.proto.Message.AppStateSyncKeyData.fromObject(value)
        return [id, value]
      })),
      set: async (data) => db.transaction(() => {
        for (const [type, values] of Object.entries(data)) for (const [id, value] of Object.entries(values)) {
          if (value) escribir(`${type}:${id}`, value)
          else db.prepare('DELETE FROM auth WHERE clave=?').run(`${type}:${id}`)
        }
      })(),
    } },
    guardar: () => escribir('creds', creds),
    olvidar: () => {
      db.exec('DELETE FROM auth')
      for (const k of Object.keys(creds)) delete creds[k]
      Object.assign(creds, b.initAuthCreds())
    },
    cerrar: () => db.close(),
  }
}

const logger = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return this } }
const tiempo = (promesa, ms) => {
  let timer
  return Promise.race([promesa, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms) })]).finally(() => clearTimeout(timer))
}
export function crearProveedorBaileys({ b, auth, estado, baja, desvinculado }) {
  let socket, conectado = false, generacion = 0, reintento = null, intentos = 0, cerrado = false
  const reportar = (e) => estado(e)
  const conectar = () => {
    if (cerrado) return
    const gen = ++generacion
    clearTimeout(reintento)
    reportar({ estado: 'conectando', qr: null, numero: '', error: '' })
    const keys = {
      get: (type, ids) => auth.state.keys.get(type, ids),
      set: (data) => {
        if (cerrado || gen !== generacion) return Promise.resolve()
        return auth.state.keys.set(data)
      },
    }
    socket = (typeof b.default === 'function' ? b.default : b.makeWASocket)({ auth: { ...auth.state, keys }, logger, printQRInTerminal: false,
      markOnlineOnConnect: false, syncFullHistory: false, connectTimeoutMs: 20000, defaultQueryTimeoutMs: 20000,
      browser: ['Portal mayorista', 'Chrome', '1.0.0'], getMessage: async () => undefined })
    const actual = socket
    actual.ev.on('creds.update', () => { if (gen === generacion && !cerrado) auth.guardar() })
    actual.ev.on('connection.update', async (u) => {
      if (gen !== generacion || cerrado) return
      try {
        if (u.qr) {
          const qr = await QRCode.toDataURL(u.qr, { width: 280, margin: 2 })
          if (gen === generacion && !cerrado && !conectado) reportar({ estado: 'qr', qr, qr_expira: Date.now() + 45000, error: '' })
        }
        if (u.connection === 'open') {
          conectado = true; intentos = 0
          reportar({ estado: 'conectado', qr: null, numero: (actual.user?.id || '').split(':')[0].split('@')[0], error: '' })
        }
        if (u.connection === 'close') {
          conectado = false
          const red = u.lastDisconnect?.error?.data?.code || u.lastDisconnect?.error?.cause?.code
          if (red === 'EACCES' || red === 'EPERM') {
            cerrado = true
            reportar({ estado: 'error', qr: null, numero: '', error: 'El entorno bloquea el acceso de red a WhatsApp. Inicia el servicio desde una terminal con acceso a Internet.' })
            return
          }
          const code = u.lastDisconnect?.error?.output?.statusCode
          if (code === b.DisconnectReason.loggedOut || code === b.DisconnectReason.badSession || code === b.DisconnectReason.connectionReplaced) {
            cerrado = true
            reportar({ estado: 'desvinculado', qr: null, numero: '', error: 'La sesión dejó de ser válida. Desvincula y conecta de nuevo desde el panel.' })
            desvinculado()
          } else {
            reportar({ estado: 'reconectando', qr: null, numero: '', error: 'Conexión interrumpida. Los pedidos siguen funcionando.' })
            reintento = setTimeout(conectar, Math.min(60000, 2000 * 2 ** Math.min(intentos++, 5)))
          }
        }
      } catch {
        reportar({ estado: 'error', qr: null, error: 'No se pudo actualizar la conexión. Desconecta y vuelve a conectar.' })
      }
    })
    actual.ev.on('messages.upsert', ({ messages, type }) => {
      if (cerrado || gen !== generacion || type !== 'notify') return
      for (const m of messages) {
        if (m.key?.fromMe || m.key?.remoteJid?.endsWith('@g.us')) continue
        const texto = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
        if (!/^(baja|stop|cancelar|no mas|no más)$/i.test(texto.trim())) continue
        // Los LID no son teléfonos. Solo aceptar un JID telefónico verificado por el proveedor.
        const jid = [m.key?.remoteJid, m.key?.remoteJidAlt].find((v) => typeof v === 'string' && v.endsWith('@s.whatsapp.net'))
        if (jid) baja(jid.split('@')[0].split(':')[0])
      }
    })
  }
  conectar()
  return {
    conectado: () => conectado && !cerrado,
    existe: async (numero) => {
      const rows = await tiempo(socket.onWhatsApp(`${numero}@s.whatsapp.net`), 25000)
      return rows?.some((r) => r.exists) || false
    },
    enviar: async (numero, texto, id) => {
      if (!conectado || cerrado) throw new Error('Desconectado')
      await tiempo(socket.sendMessage(`${numero}@s.whatsapp.net`, { text: texto }, { messageId: id }), 30000)
    },
    cerrar: async (olvidar = false) => {
      cerrado = true; conectado = false; generacion++; clearTimeout(reintento)
      if (olvidar && socket) { try { await tiempo(socket.logout(), 5000) } catch { /* Revocar también desde dispositivos vinculados si no hay red. */ } }
      socket?.end(new Error('Conexión detenida por administración'))
      if (olvidar) auth.olvidar()
    },
  }
}
