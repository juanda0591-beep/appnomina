import db from './db.js'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { adquirirWorker, latidoWorker, procesarMensaje, registrarBaja } from './whatsapp.js'
import { cargarBaileys, estadoAuthSqlite, crearProveedorBaileys } from './whatsapp-baileys.js'

if (process.env.WHATSAPP_ENABLED !== 'true') {
  console.log('WhatsApp desactivado. Configura WHATSAPP_ENABLED=true para iniciar el trabajador.')
  db.close()
  process.exit(0)
}
const propietario = randomUUID()
db.pragma('busy_timeout = 5000')
if (!adquirirWorker(db, propietario)) { console.error('Ya hay un trabajador de WhatsApp activo.'); db.close(); process.exit(1) }
let proveedor, auth, detenido = false, ocupado = false, comando = -1, siguiente = 0, timer, latido
function estado(datos) {
  const campos = ['estado','numero','qr','qr_expira','error'].filter((k) => Object.hasOwn(datos, k))
  if (!campos.length || detenido) return
  db.prepare(`UPDATE wa_worker SET ${campos.map((k) => `${k}=?`).join(',')} WHERE id=1 AND propietario=?`).run(...campos.map((k) => datos[k]), propietario)
}
async function cerrar(olvidar = false) {
  const anterior = proveedor; proveedor = null
  await anterior?.cerrar(olvidar)
  // Evitar cerrar la BD de claves mientras una llamada de Baileys aún está finalizando.
  if (olvidar && !anterior) auth?.olvidar()
}
async function ciclo() {
  if (detenido || ocupado) return
  ocupado = true
  try {
    const c = db.prepare('SELECT * FROM wa_config WHERE id=1').get()
    if (c.comando !== comando) {
      await cerrar(!!c.olvidar)
      comando = c.comando
      if (c.olvidar && !auth) {
        const b = await cargarBaileys()
        auth = await estadoAuthSqlite(b, process.env.WHATSAPP_AUTH_DIR || join(dirname(db.name), 'whatsapp-privado'))
        auth.olvidar()
      }
      if (c.conectar) {
        const b = await cargarBaileys()
        if (!auth) auth = await estadoAuthSqlite(b, process.env.WHATSAPP_AUTH_DIR || join(dirname(db.name), 'whatsapp-privado'))
        proveedor = crearProveedorBaileys({ b, auth, estado,
          baja: (numero) => registrarBaja(db, numero),
          desvinculado: () => db.prepare('UPDATE wa_config SET conectar=0, pausado=1, comando=comando+1 WHERE id=1').run(),
        })
      } else estado({ estado: 'desconectado', numero: '', qr: null, error: '' })
      db.prepare('UPDATE wa_config SET olvidar=0 WHERE id=1 AND comando=?').run(comando)
    }
    if (proveedor && Date.now() >= siguiente) {
      const intento = await procesarMensaje(db, proveedor, propietario)
      if (intento) siguiente = Date.now() + c.intervalo * 1000
    }
  } catch (e) {
    estado({ estado: 'error', qr: null, error: e.message?.startsWith('Falta instalar Baileys') ? e.message : 'No se pudo iniciar o procesar WhatsApp. Revisa la instalación y vuelve a conectar.' })
  } finally { ocupado = false }
}
async function detener(code = 0) {
  if (detenido) return
  detenido = true; clearInterval(timer); clearInterval(latido)
  await cerrar()
  db.prepare("UPDATE wa_worker SET propietario=NULL, latido=0, estado='apagado', qr=NULL, numero='' WHERE id=1 AND propietario=?").run(propietario)
  process.exit(code)
}
latido = setInterval(() => {
  try { if (!latidoWorker(db, propietario)) detener() } catch { detener() }
}, 5000)
timer = setInterval(ciclo, 2000)
process.on('SIGTERM', () => detener()); process.on('SIGINT', () => detener())
process.on('uncaughtException', () => detener(1))
process.on('unhandledRejection', () => detener(1))
console.log('Trabajador WhatsApp iniciado. La vinculación y los envíos se controlan desde Portal mayorista.')
await ciclo()
