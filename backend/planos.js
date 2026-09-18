import { validarProyecto, entradaCorte } from '../src/utils/proyectoCorte.js'
import { optimizarLote } from './corte.js'

export function guardarProyectoCorte(db, datos) {
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : ''
  if (!nombre || nombre.length > 160) throw new Error('Indica un nombre de proyecto (maximo 160 caracteres).')
  const proyecto = validarProyecto(datos.proyecto)
  const entrada = entradaCorte(proyecto)
  // El resultado guardado siempre se calcula en el servidor desde las medidas guardadas.
  const resultado = optimizarLote(entrada.piezas, entrada.lamina, entrada.opciones, entrada.laminasPorEspesor)
  if (resultado.sinCabida.length) throw new Error('Hay piezas sin cabida. Ajusta las medidas antes de guardar una version.')
  return db.transaction(() => {
    let raizId = null, revision = 1
    if (datos.proyectoId != null) {
      if (!Number.isSafeInteger(Number(datos.proyectoId))) throw new Error('Version de origen no valida.')
      const anterior = db.prepare('SELECT id, raiz_id, revision FROM planos_corte WHERE id = ?').get(Number(datos.proyectoId))
      if (!anterior) throw new Error('El proyecto de origen ya no existe.')
      raizId = anterior.raiz_id || anterior.id
      const ultima = db.prepare('SELECT MAX(revision) n FROM planos_corte WHERE COALESCE(raiz_id, id) = ?').get(raizId).n
      if (anterior.revision !== ultima) {
        const error = new Error('Existe una version mas reciente. Abrela o guarda estos cambios como una copia.')
        error.status = 409
        throw error
      }
      revision = ultima + 1
    }
    const creado = new Date().toISOString()
    const { lastInsertRowid: id } = db.prepare(`INSERT INTO planos_corte
      (nombre, origen, origen_id, resultado_json, desperdicio_pct, creado, proyecto_json, raiz_id, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nombre, proyecto.productoId ? 'producto' : 'manual',
      proyecto.productoId || null, JSON.stringify(resultado), resultado.desperdicioPct, creado,
      JSON.stringify(proyecto), raizId, revision)
    if (!raizId) { raizId = Number(id); db.prepare('UPDATE planos_corte SET raiz_id = ? WHERE id = ?').run(raizId, id) }
    return { id: Number(id), raizId, revision, nombre, creado, proyecto, resultado }
  })()
}
