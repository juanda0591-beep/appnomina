import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { registrarNomina, anularNomina, migrarNomina, ErrorNomina } from './nomina.js'

process.env.DB_PATH = ':memory:'
const { default: db } = await import('./db.js')
after(() => db.close())
beforeEach(() => {
  db.exec(`DELETE FROM nomina_solicitudes; DELETE FROM nominas; DELETE FROM movimientos;
    DELETE FROM tareas; DELETE FROM prestamos; DELETE FROM empleados; DELETE FROM productos;
    INSERT INTO empleados (id, nombre, activo) VALUES (1, 'Ana', 1), (2, 'Luis', 1), (3, 'Inactivo', 0);
    INSERT INTO productos (id, nombre) VALUES (1, 'Mesa'), (2, 'Silla');
    INSERT INTO procesos (id, producto_id, nombre, pago) VALUES (1, 1, 'Armado', 100), (2, 2, 'Pintura', 50);
    INSERT INTO prestamos (id, empleado_id, monto, saldo, descripcion) VALUES (1, 1, 200, 80, 'Adelanto'), (2, 2, 100, 100, 'Otro');
    INSERT INTO tareas (id, empleado_id, producto_id, proceso_id, proceso_nombre, cantidad, estado)
      VALUES (1, 1, 1, 1, 'Armado', 2, 'terminada'), (2, 1, 1, 1, 'Armado', 1, 'terminada');`)
})
const pago = () => ({ solicitudId: randomUUID(), empleadoId: 1, fecha: '2026-09-05',
  items: [{ productoId: 1, procesoId: 1, tareaId: 1, cantidad: 2, pago: 100, subtotal: 200 }],
  tareaIds: [1], descuentos: [{ prestamoId: 1, monto: 30 }], subtotal: 200, totalDescuentos: 30,
  extra: 20, extraDetalle: 'Bono', descuentoTrabajo: 10, descuentoTrabajoDetalle: 'Ajuste', total: 180,
})
const crear = (p = pago(), usuario = 'admin') => registrarNomina(db, p, usuario)
const saldo = () => db.prepare('SELECT saldo FROM prestamos WHERE id = 1').get().saldo
const contar = (tabla) => db.prepare(`SELECT COUNT(*) n FROM ${tabla}`).get().n
const rechazarSinCambios = (p) => {
  assert.throws(() => crear(p), ErrorNomina)
  assert.equal(contar('nominas'), 0)
  assert.equal(contar('movimientos'), 0)
  assert.equal(contar('nomina_solicitudes'), 0)
  assert.equal(saldo(), 80)
  assert.equal(db.prepare('SELECT estado FROM tareas WHERE id = 1').get().estado, 'terminada')
}

test('guarda valores canonicos, extras, descuentos, caja y saldos historicos', () => {
  const p = pago()
  p.items[0].productoNombre = 'Nombre adulterado'
  const nid = crear(p)
  const n = db.prepare('SELECT * FROM nominas WHERE id = ?').get(nid)
  assert.equal(n.total, 180)
  assert.equal(n.extra, 20)
  assert.equal(n.extra_detalle, 'Bono')
  assert.equal(n.descuento_trabajo, 10)
  assert.equal(n.descuento_trabajo_detalle, 'Ajuste')
  assert.deepEqual(JSON.parse(n.prestamos_snapshot), [{ descripcion: 'Adelanto', saldoAnterior: 80, descontado: 30, saldoNuevo: 50 }])
  assert.equal(saldo(), 50)
  assert.equal(db.prepare('SELECT monto FROM movimientos').get().monto, 180)
  assert.equal(db.prepare('SELECT producto_nombre FROM nomina_items').get().producto_nombre, 'Mesa')
  assert.equal(db.prepare('SELECT nomina_id FROM tareas WHERE id = 1').get().nomina_id, nid)
})

test('reintentar la misma solicitud no duplica el pago, la caja ni el descuento', () => {
  const p = pago()
  const nid = crear(p)
  assert.equal(crear(p), nid)
  assert.equal(contar('nominas'), 1)
  assert.equal(contar('movimientos'), 1)
  assert.equal(saldo(), 50)
  assert.throws(() => crear({ ...p, comentario: 'Otro pago' }), { status: 409 })
})

test('otra solicitud u otro operador no pueden pagar la misma tarea', () => {
  crear()
  assert.throws(() => crear(pago(), 'otro-operador'), { status: 409 })
  assert.equal(contar('nominas'), 1)
  assert.equal(saldo(), 50)
})

test('rechaza totales adulterados y tarifas cambiadas sin escribir nada', () => {
  for (const campo of ['subtotal', 'totalDescuentos', 'total']) rechazarSinCambios({ ...pago(), [campo]: 1 })
  const p = pago()
  p.items[0].pago = 99
  rechazarSinCambios(p)
  db.prepare('UPDATE procesos SET pago = 101 WHERE id = 1').run()
  rechazarSinCambios(pago())
})

test('rechaza prestamos ajenos, repetidos y descuentos mayores al saldo actual', () => {
  for (const descuentos of [[{ prestamoId: 2, monto: 30 }], [{ prestamoId: 1, monto: 81 }],
    [{ prestamoId: 1, monto: 15 }, { prestamoId: 1, monto: 15 }]]) rechazarSinCambios({ ...pago(), descuentos })
})

test('rechaza tareas ajenas, incompletas o modificadas', () => {
  for (const cambio of ["empleado_id = 2", "estado = 'pendiente'", 'cantidad = 3', 'producto_id = 2']) {
    db.prepare(`UPDATE tareas SET ${cambio} WHERE id = 1`).run()
    assert.throws(() => crear(), { status: 409 })
    assert.equal(contar('nominas'), 0)
    db.exec("UPDATE tareas SET empleado_id = 1, estado = 'terminada', cantidad = 2, producto_id = 1 WHERE id = 1")
  }
})

test('solo paga tareas vinculadas a filas presentes', () => {
  rechazarSinCambios({ ...pago(), tareaIds: [1, 2] })
  const p = pago()
  p.items.push({ ...p.items[0] })
  rechazarSinCambios(p)
  crear()
  assert.equal(db.prepare('SELECT estado FROM tareas WHERE id = 2').get().estado, 'terminada')
})

test('valida referencias, fechas, importes y total no negativo', () => {
  for (const cambio of [{ empleadoId: 3 }, { empleadoId: 99 }, { fecha: '2026-02-30' }, { items: [] },
    { extra: -1 }, { extra: Infinity }, { extra: true }, { solicitudId: '' }, { descuentoTrabajo: 1000 }]) {
    rechazarSinCambios({ ...pago(), ...cambio })
  }
  for (const cambio of [{ cantidad: 0 }, { cantidad: -1 }, { cantidad: 'abc' }, { procesoId: 2 }, { subtotal: 1 }]) {
    const p = pago()
    Object.assign(p.items[0], cambio)
    rechazarSinCambios(p)
  }
})

test('mantiene el pago manual y redondea los importes a centavos', () => {
  db.exec('UPDATE procesos SET pago = 0.1 WHERE id = 1')
  const p = { ...pago(), items: [{ productoId: 1, procesoId: 1, cantidad: 3, pago: 0.1, subtotal: 0.3 }],
    tareaIds: [], descuentos: [], subtotal: 0.3, totalDescuentos: 0, extra: 0, descuentoTrabajo: 0, total: 0.3 }
  const nid = crear(p)
  assert.equal(db.prepare('SELECT total FROM nominas WHERE id = ?').get(nid).total, 0.3)
  assert.equal(db.prepare('SELECT estado FROM tareas WHERE id = 1').get().estado, 'terminada')
})

test('un fallo al registrar caja revierte toda la operacion', () => {
  db.exec("CREATE TEMP TRIGGER fallo_caja BEFORE INSERT ON movimientos BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END")
  try {
    assert.throws(() => crear(), /fallo simulado/)
    assert.equal(contar('nominas'), 0)
    assert.equal(contar('nomina_items'), 0)
    assert.equal(contar('nomina_descuentos'), 0)
    assert.equal(contar('nomina_solicitudes'), 0)
    assert.equal(saldo(), 80)
    assert.equal(db.prepare('SELECT estado FROM tareas WHERE id = 1').get().estado, 'terminada')
  } finally { db.exec('DROP TRIGGER fallo_caja') }
})

test('anular restaura saldos y tareas una sola vez, sin permitir recrear el pago por reintento', () => {
  const p = pago()
  const nid = crear(p)
  anularNomina(db, nid)
  anularNomina(db, nid)
  assert.equal(saldo(), 80)
  assert.equal(contar('movimientos'), 0)
  assert.equal(contar('nomina_items'), 0)
  assert.equal(db.prepare('SELECT estado FROM tareas WHERE id = 1').get().estado, 'terminada')
  assert.throws(() => crear(p), { status: 409 })
  crear(pago())
  assert.throws(() => crear(p), { status: 409 })
})

test('la migracion es repetible y conserva las nominas anteriores', () => {
  const antigua = new Database(':memory:')
  try {
    antigua.exec('CREATE TABLE nominas (id INTEGER PRIMARY KEY, total REAL); INSERT INTO nominas VALUES (1, 42)')
    migrarNomina(antigua)
    migrarNomina(antigua)
    const n = antigua.prepare('SELECT * FROM nominas').get()
    assert.equal(n.total, 42)
    assert.equal(n.extra, 0)
    assert.equal(n.prestamos_snapshot, null)
  } finally { antigua.close() }
})
