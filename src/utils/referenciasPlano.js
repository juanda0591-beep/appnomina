export const MAX_FOTOS_PLANO = 6
export const MAX_BYTES_FOTO = 2 * 1024 * 1024
export const referenciaVacia = () => ({ tipo: 'armario', descripcion: '', ancho: null, alto: null, fondo: null, fotos: [] })

export function validarReferenciasPlano(valor) {
  if (!valor || !['armario', 'tocador'].includes(valor.tipo)) throw new Error('Selecciona armario o tocador.')
  if (typeof valor.descripcion !== 'string' || valor.descripcion.length > 4000) throw new Error('La descripción admite hasta 4000 caracteres.')
  const medidas = {}
  for (const eje of ['ancho', 'alto', 'fondo']) {
    const n = valor[eje]
    if (n != null && (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100000)) throw new Error('Indica medidas exteriores válidas en mm.')
    medidas[eje] = n ?? null
  }
  if (!Array.isArray(valor.fotos) || valor.fotos.length > MAX_FOTOS_PLANO) throw new Error('Puedes adjuntar hasta 6 fotografías.')
  const fotos = valor.fotos.map((f) => {
    if (!f || !['interior', 'exterior', 'detalle'].includes(f.vista)) throw new Error('Indica si la foto es interior, exterior o detalle.')
    if (typeof f.nombre !== 'string' || !f.nombre.trim() || f.nombre.length > 160) throw new Error('Nombre de fotografía no válido.')
    if (typeof f.datos !== 'string' || f.datos.length > Math.ceil(MAX_BYTES_FOTO / 3) * 4 + 40) throw new Error('Cada foto debe pesar máximo 2 MB.')
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(f.datos)
    if (!match || match[2].length % 4 !== 0) throw new Error('Usa fotografías JPG, PNG o WebP válidas.')
    const bytes = match[2].length * 3 / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0)
    const firma = { jpeg: '/9j/', png: 'iVBORw0KGgo', webp: 'UklGR' }[match[1]]
    if (bytes > MAX_BYTES_FOTO || !match[2].startsWith(firma)) throw new Error('Fotografía no válida o mayor de 2 MB.')
    return { vista: f.vista, nombre: f.nombre.trim(), datos: f.datos }
  })
  return { tipo: valor.tipo, descripcion: valor.descripcion.trim(), ...medidas, fotos }
}
