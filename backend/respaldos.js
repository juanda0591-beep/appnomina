import Database from 'better-sqlite3'
import { mkdir, readdir, stat, lstat, rename, unlink, open } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const nombreValido = /^nomina-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]{36}\.db$/
export class ErrorRespaldo extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

export function verificarRespaldo(ruta) {
  let copia
  try {
    copia = new Database(ruta, { readonly: true, fileMustExist: true })
    const integridad = copia.pragma('integrity_check')
    if (integridad.length !== 1 || integridad[0].integrity_check !== 'ok') throw new Error('integridad')
    if (copia.pragma('foreign_key_check').length) throw new Error('referencias')
    const tablas = copia.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    if (!['usuarios', 'empleados', 'nominas', 'prestamos', 'productos', 'ventas', 'movimientos', 'app_secret'].every((t) => tablas.includes(t))) {
      throw new Error('formato')
    }
    return { integridad: 'ok', nominas: copia.prepare('SELECT COUNT(*) n FROM nominas').get().n,
      movimientos: copia.prepare('SELECT COUNT(*) n FROM movimientos').get().n }
  } catch {
    throw new ErrorRespaldo('El archivo no es un respaldo valido de la aplicacion o tiene errores de integridad.', 422)
  } finally { copia?.close() }
}

export function gestorRespaldos(db, opciones = {}) {
  const carpeta = resolve(opciones.carpeta || process.env.BACKUP_DIR || join(dirname(db.name), 'respaldos'))
  const retencion = Number(opciones.retencion ?? process.env.BACKUP_RETENTION ?? 30)
  const horas = Number(opciones.horas ?? process.env.BACKUP_INTERVAL_HOURS ?? 24)
  if (!Number.isInteger(retencion) || retencion < 1 || retencion > 365
    || !Number.isFinite(horas) || horas < 1 || horas > 168) throw new ErrorRespaldo('Configuracion de respaldos no valida.')
  const automaticos = opciones.automaticos ?? process.env.BACKUP_ENABLED !== 'false'
  let enCurso = false, error = '', timer, inicio
  async function listar() {
    let archivos
    try { archivos = await readdir(carpeta, { withFileTypes: true }) }
    catch (e) { if (e.code === 'ENOENT') return []; throw e }
    const resultado = []
    for (const archivo of archivos) {
      if (!archivo.isFile() || !nombreValido.test(archivo.name)) continue
      const info = await stat(join(carpeta, archivo.name))
      resultado.push({ nombre: archivo.name, fecha: info.mtime.toISOString(), bytes: info.size })
    }
    return resultado.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.nombre.localeCompare(a.nombre))
  }
  async function ruta(nombre) {
    if (typeof nombre !== 'string' || !nombreValido.test(nombre)) throw new ErrorRespaldo('Respaldo no encontrado.', 404)
    const archivo = join(carpeta, nombre)
    let info
    try { info = await lstat(archivo) } catch { throw new ErrorRespaldo('Respaldo no encontrado.', 404) }
    if (!info.isFile() || info.isSymbolicLink()) throw new ErrorRespaldo('Respaldo no valido.', 404)
    return archivo
  }
  async function crear() {
    if (enCurso) throw new ErrorRespaldo('Ya hay un respaldo en curso.', 409)
    enCurso = true
    let temporal
    try {
      await mkdir(carpeta, { recursive: true, mode: 0o700 })
      const nombre = `nomina-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.db`
      temporal = join(carpeta, `${nombre}.partial`)
      const reservado = await open(temporal, 'wx', 0o600)
      await reservado.close()
      // SQLite Online Backup incorpora los cambios del WAL en una copia consistente.
      await db.backup(temporal)
      const copia = new Database(temporal, { fileMustExist: true })
      try {
        copia.pragma('wal_checkpoint(TRUNCATE)')
        copia.pragma('journal_mode = DELETE')
      } finally { copia.close() }
      const verificacion = verificarRespaldo(temporal)
      await rename(temporal, join(carpeta, nombre))
      temporal = null
      error = ''
      const archivos = await listar()
      for (const viejo of archivos.slice(retencion)) await unlink(await ruta(viejo.nombre))
      return { ...archivos.find((a) => a.nombre === nombre), verificacion }
    } catch (e) {
      error = e instanceof ErrorRespaldo ? e.message : 'No se pudo crear el respaldo. Revisa espacio disponible y permisos de la carpeta.'
      throw new ErrorRespaldo(error, e.status || 500)
    } finally {
      if (temporal) {
        for (const sufijo of ['', '-wal', '-shm']) await unlink(temporal + sufijo).catch(() => {})
      }
      enCurso = false
    }
  }
  async function comprobarProgramacion() {
    if (!automaticos || enCurso) return
    try {
      const archivos = await listar()
      if (!archivos[0] || Date.now() - Date.parse(archivos[0].fecha) >= horas * 3600000) await crear()
    } catch (e) {
      error = e instanceof ErrorRespaldo ? e.message : 'No se pudo acceder a la carpeta de respaldos.'
      console.error('Respaldo automatico:', error)
    }
  }
  return {
    crear, listar, ruta, comprobarProgramacion,
    async estado() { return { archivos: await listar(), automaticos, horas, retencion, enCurso, error } },
    iniciar() {
      inicio = setTimeout(comprobarProgramacion, 1000); inicio.unref()
      timer = setInterval(comprobarProgramacion, 3600000); timer.unref()
    },
    detener() { clearTimeout(inicio); clearInterval(timer) },
  }
}
