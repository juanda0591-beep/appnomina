import sharp from 'sharp'

export const MAX_FOTOS = 6
export class ErrorImagen extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const exigir = (v, mensaje, status) => { if (!v) throw new ErrorImagen(mensaje, status) }

export function migrarImagenes(db) {
  db.transaction(() => {
    if (!db.prepare('PRAGMA table_info(portal_productos)').all().some((c) => c.name === 'galeria_revision')) {
      db.exec('ALTER TABLE portal_productos ADD COLUMN galeria_revision INTEGER NOT NULL DEFAULT 0')
    }
    db.exec(`CREATE TABLE IF NOT EXISTS portal_producto_imagenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL REFERENCES portal_productos(producto_id) ON DELETE CASCADE,
      posicion INTEGER NOT NULL, imagen BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS portal_imagenes_producto ON portal_producto_imagenes(producto_id, posicion, id);`)
    // Copiar antes de liberar el campo anterior, en la misma transacción.
    db.exec(`INSERT INTO portal_producto_imagenes(producto_id, posicion, imagen)
      SELECT producto_id, -1, imagen FROM portal_productos WHERE imagen IS NOT NULL;
      UPDATE portal_productos SET imagen=NULL WHERE imagen IS NOT NULL;`)
  })()
}

export function fotosProducto(db, productoId) {
  return db.prepare('SELECT id FROM portal_producto_imagenes WHERE producto_id=? ORDER BY posicion, id').all(productoId)
}

export async function prepararImagenes(body) {
  exigir(!(Object.hasOwn(body, 'imagenes') && Object.hasOwn(body, 'imagen')), 'No combines los dos formatos de fotografías.')
  const modernas = Object.hasOwn(body, 'imagenes')
  if (!modernas && body.imagen === undefined) return undefined
  if (modernas) exigir(Number.isSafeInteger(body.revisionFotos) && body.revisionFotos >= 0, 'Actualiza la ficha antes de modificar sus fotos.', 409)
  const entradas = modernas ? body.imagenes : body.imagen === null ? [] : [{ imagen: body.imagen }]
  exigir(Array.isArray(entradas) && entradas.length <= MAX_FOTOS, `Puedes guardar hasta ${MAX_FOTOS} fotografías por producto.`)
  const ids = new Set(), resultado = []
  // Secuencial para limitar memoria mientras se decodifican imágenes grandes.
  for (const entrada of entradas) {
    exigir(entrada && typeof entrada === 'object', 'Fotografía no válida.')
    if (Object.hasOwn(entrada, 'id')) {
      exigir(Number.isSafeInteger(entrada.id) && entrada.id > 0 && !ids.has(entrada.id) && !Object.hasOwn(entrada, 'imagen'), 'La galería contiene fotografías repetidas o inválidas.')
      ids.add(entrada.id); resultado.push({ id: entrada.id }); continue
    }
    const imagen = entrada.imagen
    exigir(typeof imagen === 'string' && imagen.length <= 2800000 && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(imagen), 'Usa imágenes JPG, PNG o WebP de máximo 2 MB cada una.')
    const bytes = Buffer.from(imagen.split(',')[1], 'base64')
    exigir(bytes.length <= 2 * 1024 * 1024, 'Cada fotografía debe pesar como máximo 2 MB.')
    try {
      const imagen = await sharp(bytes, { limitInputPixels: 24000000 }).rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
      resultado.push({ imagen })
    } catch { throw new ErrorImagen('No se pudo leer una fotografía. Usa un JPG, PNG o WebP válido.') }
  }
  return { fotos: resultado, moderna: modernas, revision: body.revisionFotos }
}

// Invocar dentro de la transacción que guarda la ficha comercial.
export function guardarImagenes(db, productoId, preparado) {
  if (preparado === undefined) return
  const actual = db.prepare('SELECT galeria_revision FROM portal_productos WHERE producto_id=?').get(productoId)
  exigir(actual, 'Producto no encontrado.', 404)
  if (preparado.moderna) exigir(actual.galeria_revision === preparado.revision, 'Otra sesión cambió las fotografías. Cierra y vuelve a abrir la ficha para actualizarla.', 409)
  const existentes = fotosProducto(db, productoId)
  for (const foto of preparado.fotos) if (foto.id) exigir(existentes.some((f) => f.id === foto.id), 'Una fotografía ya no pertenece a esta ficha. Actualízala antes de guardar.', 409)
  const conservar = new Set(preparado.fotos.map((f) => f.id).filter(Boolean))
  for (const f of existentes) if (!conservar.has(f.id)) db.prepare('DELETE FROM portal_producto_imagenes WHERE id=? AND producto_id=?').run(f.id, productoId)
  preparado.fotos.forEach((f, posicion) => {
    if (f.id) db.prepare('UPDATE portal_producto_imagenes SET posicion=? WHERE id=? AND producto_id=?').run(posicion, f.id, productoId)
    else db.prepare('INSERT INTO portal_producto_imagenes(producto_id,posicion,imagen) VALUES(?,?,?)').run(productoId, posicion, f.imagen)
  })
  db.prepare('UPDATE portal_productos SET galeria_revision=galeria_revision+1 WHERE producto_id=?').run(productoId)
}
