import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { contextoAuditoria, consultarAuditoria } from './auditoria.js'

process.env.DB_PATH = ':memory:'
const { default: db } = await import('./db.js')
after(() => db.close())

test('captura autor, motivo, cambios y borrado sin copiar comprobantes', () => {
  contextoAuditoria.run({ usuario: 'ana', operacion: 'operacion-1', ruta: 'POST /api/movimientos', motivo: '' }, () => {
    db.prepare("INSERT INTO movimientos (id, tipo, fecha, monto, descripcion, comprobante) VALUES (1, 'ingreso', '2026-09-05', 100, 'Venta', ?)")
      .run('data:secreto')
  })
  contextoAuditoria.run({ usuario: 'luis', operacion: 'operacion-2', ruta: 'DELETE /api/movimientos/1', motivo: 'Registro equivocado' }, () => {
    db.exec('UPDATE movimientos SET monto = 200 WHERE id = 1; DELETE FROM movimientos WHERE id = 1')
  })
  const filas = consultarAuditoria(db, { entidad: 'movimientos' }).registros
  assert.equal(filas.length, 3)
  assert.equal(filas[0].usuario, 'luis')
  assert.equal(filas[0].motivo, 'Registro equivocado')
  assert.equal(filas[0].anterior.monto, 200)
  assert.equal(filas[0].posterior, null)
  assert.equal(filas[1].anterior.monto, 100)
  assert.equal(filas[1].posterior.monto, 200)
  assert.equal(filas[2].usuario, 'ana')
  assert.ok(!JSON.stringify(filas).includes('data:secreto'))
  assert.equal(consultarAuditoria(db, { usuario: 'ana', accion: 'crear' }).total, 1)
  assert.equal(consultarAuditoria(db, { usuario: "' OR 1=1 --" }).total, 0)
})

test('un rollback revierte tambien la auditoria y los registros no se pueden borrar', () => {
  const antes = db.prepare('SELECT COUNT(*) n FROM auditoria').get().n
  assert.throws(db.transaction(() => {
    db.exec("INSERT INTO movimientos (tipo, fecha, monto) VALUES ('ingreso', '2026-09-05', 50)")
    throw new Error('fallo')
  }), /fallo/)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auditoria').get().n, antes)
  assert.throws(() => db.exec('DELETE FROM auditoria'), /no se puede borrar/)
  assert.throws(() => db.exec("UPDATE auditoria SET usuario = 'otro'"), /no se puede modificar/)
})

test('no agrega un cambio ficticio si se actualiza con el mismo valor', () => {
  db.exec("INSERT INTO movimientos (id, tipo, fecha, monto) VALUES (7, 'ingreso', '2026-09-05', 50)")
  const antes = db.prepare('SELECT COUNT(*) n FROM auditoria').get().n
  db.exec('UPDATE movimientos SET monto = 50 WHERE id = 7')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auditoria').get().n, antes)
  db.exec("UPDATE movimientos SET comprobante = 'comprobante-nuevo' WHERE id = 7")
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auditoria').get().n, antes + 1)
  assert.ok(!JSON.stringify(consultarAuditoria(db, {}).registros).includes('comprobante-nuevo'))
})
