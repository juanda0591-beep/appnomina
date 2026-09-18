import Database from 'better-sqlite3'
import { parseArgs } from 'node:util'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lstat, mkdir, link, unlink, open } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { verificarRespaldo, ErrorRespaldo } from './respaldos.js'

export async function restaurarRespaldo(origen, destino) {
  const fuente = resolve(origen), salida = resolve(destino)
  if (fuente === salida) throw new ErrorRespaldo('El destino debe ser un archivo nuevo.')
  for (const ruta of [salida, `${salida}-wal`, `${salida}-shm`]) {
    try { await lstat(ruta); throw new ErrorRespaldo('El destino ya existe. Usa un archivo nuevo para conservar la base actual.') }
    catch (e) { if (e.code !== 'ENOENT') throw e }
  }
  verificarRespaldo(fuente)
  await mkdir(dirname(salida), { recursive: true, mode: 0o700 })
  const temporal = `${salida}.${randomUUID()}.partial`
  let lectura, copia
  try {
    const reservado = await open(temporal, 'wx', 0o600)
    await reservado.close()
    lectura = new Database(fuente, { readonly: true, fileMustExist: true })
    await lectura.backup(temporal)
    lectura.close(); lectura = null
    copia = new Database(temporal)
    // Ninguna sesion incluida en la copia vuelve a habilitarse al restaurar.
    if (copia.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sesiones'").get()) copia.exec('DELETE FROM sesiones')
    if (copia.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'portal_sesiones'").get()) copia.exec('DELETE FROM portal_sesiones')
    if (copia.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'wa_config'").get()) {
      copia.exec(`UPDATE wa_config SET automaticos=0, pausado=1, conectar=0, olvidar=0, comando=comando+1;
        UPDATE wa_worker SET propietario=NULL, latido=0, estado='apagado', numero='', qr=NULL, qr_expira=0;
        UPDATE wa_mensajes SET estado='cancelado', error='Respaldo restaurado: no se reenvían mensajes anteriores.'
          WHERE estado IN ('pendiente','preparando','enviando','revisar','fallido');
        UPDATE wa_campanas SET estado='cancelada' WHERE estado='borrador';`)
    }
    copia.pragma('wal_checkpoint(TRUNCATE)')
    copia.pragma('journal_mode = DELETE')
    copia.close(); copia = null
    const verificacion = verificarRespaldo(temporal)
    // Un enlace exclusivo evita sobrescribir un destino creado mientras se verificaba.
    await link(temporal, salida)
    return { destino: salida, ...verificacion }
  } finally {
    lectura?.close(); copia?.close()
    for (const sufijo of ['', '-wal', '-shm']) await unlink(temporal + sufijo).catch(() => {})
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { origen: { type: 'string' }, destino: { type: 'string' } } })
    if (!values.origen || !values.destino) throw new Error('Uso: node backend/restaurar.js --origen respaldo.db --destino recuperada.db')
    console.log(JSON.stringify(await restaurarRespaldo(values.origen, values.destino), null, 2))
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
