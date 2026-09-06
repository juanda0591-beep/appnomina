import { createHash } from 'node:crypto'

export class ErrorNomina extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

const dinero = (n) => Math.round((n + Number.EPSILON) * 100) / 100
function numero(valor, campo, positivo = false) {
  if (!['number', 'string'].includes(typeof valor) || String(valor).trim() === ''
    || !Number.isFinite(Number(valor)) || Number(valor) < 0 || Number(valor) > 1e12
    || (positivo && Number(valor) === 0)) throw new ErrorNomina(`${campo}: indica un numero valido.`)
  return Number(valor)
}
function id(valor, campo) {
  const n = numero(valor, campo, true)
  if (!Number.isSafeInteger(n)) throw new ErrorNomina(`${campo}: referencia no valida.`)
  return n
}
function texto(valor, campo, max = 2000) {
  if (valor == null) return ''
  if (typeof valor !== 'string' || valor.length > max) throw new ErrorNomina(`${campo}: texto no valido.`)
  return valor.trim()
}
function lista(valor, campo, min = 0) {
  if (!Array.isArray(valor) || valor.length < min || valor.length > 500) throw new ErrorNomina(`${campo}: lista no valida.`)
  return valor
}
function coincide(enviado, calculado, campo) {
  if (Math.abs(numero(enviado, campo) - calculado) > 0.005) {
    throw new ErrorNomina(`${campo} cambio o no coincide. Actualiza los datos y revisa el pago.`, 409)
  }
}

export function migrarNomina(db) {
  db.transaction(() => {
    const columnas = db.prepare('PRAGMA table_info(nominas)').all()
    for (const [nombre, tipo] of [
      ['extra', 'REAL NOT NULL DEFAULT 0'], ['extra_detalle', "TEXT NOT NULL DEFAULT ''"],
      ['descuento_trabajo', 'REAL NOT NULL DEFAULT 0'], ['descuento_trabajo_detalle', "TEXT NOT NULL DEFAULT ''"],
      ['prestamos_snapshot', 'TEXT'],
    ]) {
      if (!columnas.some((c) => c.name === nombre)) db.exec(`ALTER TABLE nominas ADD COLUMN ${nombre} ${tipo}`)
    }
    // La solicitud sobrevive a la anulacion para impedir que un reintento recree el pago.
    db.exec(`CREATE TABLE IF NOT EXISTS nomina_solicitudes (
      usuario TEXT NOT NULL, clave TEXT NOT NULL, huella TEXT NOT NULL, nomina_id INTEGER NOT NULL,
      anulada INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (usuario, clave)
    )`)
  })()
}

export function registrarNomina(db, datos, usuario) {
  if (!datos || typeof datos !== 'object') throw new ErrorNomina('Datos de nomina no validos.')
  const clave = texto(datos.solicitudId, 'Solicitud', 100)
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(clave)) throw new ErrorNomina('Recarga la pagina antes de registrar el pago.')
  const empleadoId = id(datos.empleadoId, 'Empleado')
  const fecha = texto(datos.fecha, 'Fecha', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha))
    || new Date(fecha).toISOString().slice(0, 10) !== fecha) throw new ErrorNomina('Fecha no valida.')
  const items = lista(datos.items, 'Trabajos', 1).map((it) => ({
    productoId: id(it?.productoId, 'Producto'), procesoId: id(it?.procesoId, 'Proceso'),
    tareaId: it?.tareaId == null ? null : id(it.tareaId, 'Tarea'),
    cantidad: numero(it?.cantidad, 'Cantidad', true), pago: numero(it?.pago, 'Pago por unidad'),
    subtotal: numero(it?.subtotal, 'Subtotal del trabajo'),
  }))
  const descuentos = lista(datos.descuentos ?? [], 'Descuentos').map((d) => ({
    prestamoId: id(d?.prestamoId, 'Prestamo'), monto: dinero(numero(d?.monto, 'Descuento', true)),
  }))
  const tareaIds = items.filter((it) => it.tareaId != null).map((it) => it.tareaId)
  if (new Set(tareaIds).size !== tareaIds.length) throw new ErrorNomina('Una tarea no puede pagarse dos veces.')
  if (datos.tareaIds !== undefined) {
    const declaradas = lista(datos.tareaIds, 'Tareas').map((v) => id(v, 'Tarea'))
    if (declaradas.length !== tareaIds.length || new Set(declaradas).size !== declaradas.length
      || declaradas.some((v) => !tareaIds.includes(v))) throw new ErrorNomina('Las tareas no coinciden con los trabajos. Recarga la pagina.')
  }
  if (new Set(descuentos.map((d) => d.prestamoId)).size !== descuentos.length) throw new ErrorNomina('Hay prestamos repetidos.')
  const extra = dinero(numero(datos.extra ?? 0, 'Pago extra'))
  const descuentoTrabajo = dinero(numero(datos.descuentoTrabajo ?? 0, 'Descuento por trabajo'))
  const extraDetalle = texto(datos.extraDetalle, 'Concepto del extra')
  const descuentoTrabajoDetalle = texto(datos.descuentoTrabajoDetalle, 'Concepto del descuento')
  const comentario = texto(datos.comentario, 'Comentario')
  const esperados = ['subtotal', 'totalDescuentos', 'total'].map((k) => numero(datos[k], k))
  const huella = createHash('sha256').update(JSON.stringify({ empleadoId, fecha, items, descuentos,
    extra, extraDetalle, descuentoTrabajo, descuentoTrabajoDetalle, comentario, esperados })).digest('hex')

  return db.transaction(() => {
    const previa = db.prepare('SELECT * FROM nomina_solicitudes WHERE usuario = ? AND clave = ?').get(usuario, clave)
    if (previa) {
      if (previa.huella !== huella) throw new ErrorNomina('Esta solicitud ya se uso para otro pago.', 409)
      if (previa.anulada || !db.prepare('SELECT id FROM nominas WHERE id = ?').get(previa.nomina_id)) throw new ErrorNomina('Este pago fue anulado. No se puede repetir la solicitud.', 409)
      return previa.nomina_id
    }
    const empleado = db.prepare('SELECT * FROM empleados WHERE id = ?').get(empleadoId)
    if (!empleado || !empleado.activo) throw new ErrorNomina('El empleado no existe o esta inactivo.')
    const trabajos = items.map((it) => {
      const proceso = db.prepare(`SELECT pr.*, p.nombre AS producto_nombre FROM procesos pr
        JOIN productos p ON p.id = pr.producto_id WHERE pr.id = ? AND pr.producto_id = ?`).get(it.procesoId, it.productoId)
      if (!proceso) throw new ErrorNomina('El producto o proceso cambio. Actualiza los datos.', 409)
      if (it.tareaId != null) {
        const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(it.tareaId)
        if (!tarea || tarea.empleado_id !== empleadoId || tarea.estado !== 'terminada' || tarea.nomina_id != null) {
          throw new ErrorNomina('Una tarea ya fue pagada, no esta terminada o pertenece a otro empleado.', 409)
        }
        if (tarea.producto_id !== it.productoId || (tarea.proceso_nombre || '').toLowerCase() !== proceso.nombre.toLowerCase()
          || tarea.cantidad !== it.cantidad) throw new ErrorNomina('El trabajo no coincide con la tarea terminada.', 409)
      }
      const pago = numero(proceso.pago, 'Tarifa del proceso')
      const subtotal = dinero(numero(pago * it.cantidad, 'Subtotal del trabajo'))
      coincide(it.pago, pago, 'La tarifa del proceso')
      coincide(it.subtotal, subtotal, 'El subtotal del trabajo')
      return { ...it, pago, subtotal, productoNombre: proceso.producto_nombre, procesoNombre: proceso.nombre }
    })
    const prestamos = db.prepare('SELECT * FROM prestamos WHERE empleado_id = ? AND saldo > 0 ORDER BY id').all(empleadoId)
    for (const d of descuentos) {
      const prestamo = prestamos.find((p) => p.id === d.prestamoId)
      if (!prestamo || d.monto <= 0 || d.monto > prestamo.saldo) throw new ErrorNomina('El descuento supera el saldo disponible o el prestamo no pertenece al empleado.', 409)
      d.descripcion = prestamo.descripcion || 'Prestamo'
    }
    const snapshot = prestamos.map((p) => {
      const descontado = descuentos.find((d) => d.prestamoId === p.id)?.monto || 0
      return { descripcion: p.descripcion || 'Prestamo', saldoAnterior: p.saldo, descontado, saldoNuevo: dinero(p.saldo - descontado) }
    })
    const subtotal = dinero(trabajos.reduce((s, it) => s + it.subtotal, 0))
    const totalDescuentos = dinero(descuentos.reduce((s, d) => s + d.monto, 0))
    const total = dinero(subtotal + extra - totalDescuentos - descuentoTrabajo)
    if (total < 0) throw new ErrorNomina('Los descuentos no pueden superar el valor del pago.')
    coincide(esperados[0], subtotal, 'Subtotal')
    coincide(esperados[1], totalDescuentos, 'Descuentos')
    coincide(esperados[2], total, 'Total')
    const nid = db.prepare(`INSERT INTO nominas (empleado_id, fecha, subtotal, total_descuentos, total, comentario,
      extra, extra_detalle, descuento_trabajo, descuento_trabajo_detalle, prestamos_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(empleadoId, fecha, subtotal, totalDescuentos, total, comentario,
      extra, extraDetalle, descuentoTrabajo, descuentoTrabajoDetalle, JSON.stringify(snapshot)).lastInsertRowid
    const insertarItem = db.prepare(`INSERT INTO nomina_items
      (nomina_id, producto_nombre, proceso_nombre, cantidad, pago, subtotal) VALUES (?, ?, ?, ?, ?, ?)`)
    for (const it of trabajos) insertarItem.run(nid, it.productoNombre, it.procesoNombre, it.cantidad, it.pago, it.subtotal)
    for (const d of descuentos) {
      db.prepare('INSERT INTO nomina_descuentos (nomina_id, prestamo_id, monto, descripcion) VALUES (?, ?, ?, ?)')
        .run(nid, d.prestamoId, d.monto, d.descripcion)
      db.prepare('UPDATE prestamos SET saldo = ROUND(saldo - ?, 2) WHERE id = ?').run(d.monto, d.prestamoId)
    }
    for (const tid of tareaIds) {
      const cambio = db.prepare("UPDATE tareas SET estado = 'pagada', nomina_id = ?, actualizado = ? WHERE id = ? AND estado = 'terminada' AND nomina_id IS NULL")
        .run(nid, new Date().toISOString(), tid)
      if (cambio.changes !== 1) throw new ErrorNomina('La tarea ya fue pagada.', 409)
    }
    db.prepare(`INSERT INTO movimientos (tipo, fecha, categoria, monto, descripcion, origen, ref_id)
      VALUES ('gasto', ?, 'Nómina', ?, ?, 'nomina', ?)`).run(fecha, total, `Pago de nómina a ${empleado.nombre}`, nid)
    db.prepare('INSERT INTO nomina_solicitudes (usuario, clave, huella, nomina_id) VALUES (?, ?, ?, ?)').run(usuario, clave, huella, nid)
    return nid
  }).immediate()
}

export function anularNomina(db, nominaId) {
  const nid = id(nominaId, 'Nomina')
  db.transaction(() => {
    const descuentos = db.prepare('SELECT prestamo_id, monto FROM nomina_descuentos WHERE nomina_id = ?').all(nid)
    for (const d of descuentos) {
      if (d.prestamo_id) db.prepare('UPDATE prestamos SET saldo = ROUND(saldo + ?, 2) WHERE id = ?').run(Number(d.monto) || 0, d.prestamo_id)
    }
    db.prepare("UPDATE tareas SET estado = 'terminada', nomina_id = NULL WHERE nomina_id = ?").run(nid)
    db.prepare('UPDATE nomina_solicitudes SET anulada = 1 WHERE nomina_id = ?').run(nid)
    db.prepare('DELETE FROM nominas WHERE id = ?').run(nid)
    db.prepare("DELETE FROM movimientos WHERE origen = 'nomina' AND ref_id = ?").run(nid)
  }).immediate()
}
