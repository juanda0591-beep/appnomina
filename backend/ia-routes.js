import { Router } from 'express'
import { generarMaterial, ErrorIA } from './ia-materiales.js'
import { generarProducto } from './ia-productos.js'

export function rutasIA({ db, permisoRequired, generar = generarMaterial, generarProd = generarProducto }) {
  const router = Router()
  const solicitudes = new Map()
  let activas = 0
  const permisosMaterial = [permisoRequired('materiales', 'ver'), permisoRequired('materiales', 'crear')]
  const permisosProducto = [permisoRequired('productos', 'ver'), permisoRequired('productos', 'crear'), permisoRequired('materiales', 'ver')]
  const estado = (req, res) => {
    res.json({ configurada: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) })
  }
  router.get('/estado', ...permisosMaterial, estado)
  router.get('/producto/estado', ...permisosProducto, estado)
  const preparar = (generador) => async (req, res) => {
    const ahora = Date.now()
    for (const [usuario, registro] of solicitudes) {
      if (!registro.activa && ahora - registro.inicio > 60000) solicitudes.delete(usuario)
    }
    const previa = solicitudes.get(req.usuario)
    if (activas >= 3 || previa?.activa || (previa && ahora - previa.inicio < 6000)) {
      res.set('Retry-After', '6')
      return res.status(429).json({ error: 'Espera unos segundos antes de generar otro borrador.' })
    }
    const registro = { inicio: ahora, activa: true }
    solicitudes.set(req.usuario, registro)
    activas++
    try {
      res.json(await generador(req.body?.descripcion))
    } catch (error) {
      res.status(error instanceof ErrorIA ? error.status : 500).json({
        error: error instanceof ErrorIA ? error.message : 'No se pudo preparar el borrador.',
      })
    } finally {
      registro.activa = false
      activas--
    }
  }
  router.post('/material', ...permisosMaterial, preparar((descripcion) => {
    const colores = db.prepare('SELECT id, nombre FROM colores WHERE activo = 1 ORDER BY nombre LIMIT 300').all()
    const familias = db.prepare("SELECT DISTINCT familia FROM materiales WHERE familia IS NOT NULL AND familia != '' ORDER BY familia LIMIT 200").all().map((m) => m.familia)
    const materiales = db.prepare('SELECT id, nombre, unidad FROM materiales').all()
    return generar({ descripcion, colores, familias, materiales })
  }))
  router.post('/producto', ...permisosProducto, preparar((descripcion) => {
    const materiales = db.prepare('SELECT id, nombre, unidad FROM materiales ORDER BY nombre, id').all()
    const procesosGlobales = db.prepare('SELECT nombre FROM procesos_globales ORDER BY nombre').all()
    const productos = db.prepare('SELECT id, nombre FROM productos').all()
    return generarProd({ descripcion, materiales, procesosGlobales, productos })
  }))
  return router
}
