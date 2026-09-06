import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID, createHash } from 'node:crypto'

export const contextoAuditoria = new AsyncLocalStorage()

// Lista explicita: no copiar contrasenas, tokens, fotos ni comprobantes al historial.
const campos = {
  nominas: ['empleado_id', 'fecha', 'subtotal', 'total_descuentos', 'total', 'comentario', 'extra', 'extra_detalle', 'descuento_trabajo', 'descuento_trabajo_detalle'],
  nomina_items: ['nomina_id', 'producto_nombre', 'proceso_nombre', 'cantidad', 'pago', 'subtotal'],
  nomina_descuentos: ['nomina_id', 'prestamo_id', 'monto', 'descripcion'],
  prestamos: ['empleado_id', 'monto', 'saldo', 'fecha', 'descripcion'],
  movimientos: ['tipo', 'fecha', 'categoria', 'monto', 'descripcion', 'origen', 'ref_id', 'comprobante_tipo'],
  ventas: ['codigo', 'cliente_id', 'cliente_nombre', 'pedido_id', 'total', 'anticipo_aplicado', 'pagado', 'fecha', 'comentario', 'descuento_pct', 'fecha_vencimiento'],
  venta_items: ['venta_id', 'producto_id', 'producto_nombre', 'variante_id', 'color_nombre', 'cantidad', 'precio_unitario', 'descuento_pct'],
  venta_pagos: ['venta_id', 'monto', 'fecha', 'comentario', 'metodo'],
  cliente_anticipos: ['cliente_id', 'monto', 'tipo', 'venta_id', 'fecha', 'descripcion'],
  productos: ['nombre', 'codigo', 'valor_venta', 'valor_compra', 'stock_apertura', 'stock', 'stock_minimo'],
  producto_variantes: ['producto_id', 'color_id', 'codigo', 'stock', 'stock_apertura', 'stock_minimo', 'activo'],
  materiales: ['nombre', 'unidad', 'stock', 'costo_unitario', 'stock_minimo', 'familia', 'color_id'],
  producto_movimientos: ['producto_id', 'variante_id', 'tipo', 'cantidad', 'costo_unitario', 'fecha', 'descripcion', 'orden_produccion_id'],
  material_movimientos: ['material_id', 'tipo', 'cantidad', 'costo_unitario', 'fecha', 'descripcion', 'tarea_produccion_id'],
}
export const entidadesAuditadas = Object.keys(campos)

export function instalarAuditoria(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL, usuario TEXT NOT NULL, operacion TEXT NOT NULL,
    entidad TEXT NOT NULL, registro_id INTEGER NOT NULL, accion TEXT NOT NULL,
    ruta TEXT NOT NULL, motivo TEXT NOT NULL, anterior TEXT, posterior TEXT
  );
  CREATE INDEX IF NOT EXISTS auditoria_fecha ON auditoria(fecha, id);
  CREATE INDEX IF NOT EXISTS auditoria_entidad ON auditoria(entidad, registro_id, id);
  CREATE INDEX IF NOT EXISTS auditoria_operacion ON auditoria(operacion);
  CREATE TRIGGER IF NOT EXISTS auditoria_no_editar BEFORE UPDATE ON auditoria
    BEGIN SELECT RAISE(ABORT, 'El historial de auditoria no se puede modificar'); END;
  CREATE TRIGGER IF NOT EXISTS auditoria_no_borrar BEFORE DELETE ON auditoria
    BEGIN SELECT RAISE(ABORT, 'El historial de auditoria no se puede borrar'); END;`)
  db.function('audit_context', (campo) => contextoAuditoria.getStore()?.[campo] || '')
  db.function('audit_digest', (valor) => valor == null ? null : createHash('sha256').update(String(valor)).digest('hex'))
  for (const [tabla, columnas] of Object.entries(campos)) {
    const existentes = db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name)
    if (!existentes.length) continue
    const seleccion = columnas.filter((c) => existentes.includes(c))
    const json = (ref) => `json_object(${['id', ...seleccion].map((c) => `'${c}', ${ref}.${c}`).join(', ')}${
      tabla === 'movimientos' ? `, 'comprobante_huella', audit_digest(${ref}.comprobante)` : ''})`
    for (const [evento, accion] of [['INSERT', 'crear'], ['UPDATE', 'editar'], ['DELETE', 'eliminar']]) {
      const antes = evento === 'INSERT' ? 'NULL' : json('OLD')
      const despues = evento === 'DELETE' ? 'NULL' : json('NEW')
      const cambio = evento === 'UPDATE' ? ` WHEN ${antes} IS NOT ${despues}` : ''
      // TEMP: las copias son SQLite independientes, sin funciones privadas del servidor.
      db.exec(`CREATE TEMP TRIGGER IF NOT EXISTS audit_${tabla}_${evento} AFTER ${evento} ON main.${tabla}${cambio}
        BEGIN INSERT INTO auditoria (fecha, usuario, operacion, entidad, registro_id, accion, ruta, motivo, anterior, posterior)
          VALUES (strftime('%Y-%m-%dT%H:%M:%fZ','now'), coalesce(nullif(audit_context('usuario'), ''), 'sistema'),
            audit_context('operacion'), '${tabla}', ${evento === 'DELETE' ? 'OLD' : 'NEW'}.id, '${accion}',
            audit_context('ruta'), audit_context('motivo'), ${antes}, ${despues}); END;`)
    }
  }
}

export function auditarSolicitud(req, res, next) {
  const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : ''
  const financiero = /^\/api\/(nominas|prestamos|movimientos|ventas)\/[^/]+\/?$/i.test(req.path)
    || /^\/api\/clientes\/[^/]+\/anticipos\/[^/]+\/?$/i.test(req.path)
  if (req.method === 'DELETE' && financiero && (motivo.length < 3 || motivo.length > 500)) {
    return res.status(400).json({ error: 'Indica un motivo de anulacion entre 3 y 500 caracteres.' })
  }
  const concepto = [req.body?.comentario, req.body?.descripcion].find((v) => typeof v === 'string' && v.trim()) || ''
  contextoAuditoria.run({ usuario: req.usuario, operacion: randomUUID(),
    ruta: `${req.method} ${req.path}`, motivo: (motivo || concepto).slice(0, 500) }, next)
}

export function consultarAuditoria(db, query) {
  const condiciones = [], valores = []
  for (const campo of ['entidad', 'accion', 'usuario']) {
    if (typeof query[campo] === 'string' && query[campo]) { condiciones.push(`${campo} = ?`); valores.push(query[campo].slice(0, 100)) }
  }
  for (const campo of ['desde', 'hasta']) {
    if (typeof query[campo] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query[campo])) continue
    const inicio = Date.parse(`${query[campo]}T00:00:00-05:00`)
    if (!Number.isFinite(inicio)) continue
    condiciones.push(campo === 'desde' ? 'fecha >= ?' : 'fecha < ?')
    valores.push(new Date(inicio + (campo === 'hasta' ? 86400000 : 0)).toISOString())
  }
  const pagina = Math.max(1, Math.min(1000000, Math.floor(Number(query.pagina) || 1)))
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) n FROM auditoria ${where}`).get(...valores).n
  const registros = db.prepare(`SELECT * FROM auditoria ${where} ORDER BY id DESC LIMIT 30 OFFSET ?`).all(...valores, (pagina - 1) * 30)
    .map((r) => ({ ...r, anterior: r.anterior ? JSON.parse(r.anterior) : null, posterior: r.posterior ? JSON.parse(r.posterior) : null }))
  return { registros, total, pagina, paginas: Math.max(1, Math.ceil(total / 30)), entidades: entidadesAuditadas }
}
