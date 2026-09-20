import { MAX_BYTES_FOTO } from './referenciasPlano.js'

// El límite de almacenamiento se aplica a la copia optimizada, no al original.
export async function prepararFotoPlano(archivo) {
  let imagen, url, canvas
  try {
    if (typeof createImageBitmap === 'function') {
      try { imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' }) } catch { /* Algunos formatos solo se decodifican con Image. */ }
    }
    if (!imagen) {
      url = URL.createObjectURL(archivo)
      imagen = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('No se pudo abrir esta foto. Si está en HEIC/HEIF, expórtala como JPG; también puedes usar PNG, WebP u otro formato compatible con tu navegador.'))
        img.src = url
      })
    }
    const ancho = imagen.naturalWidth || imagen.width, alto = imagen.naturalHeight || imagen.height
    if (!(ancho > 0 && alto > 0)) throw new Error('La fotografía no tiene dimensiones válidas.')
    let escala = Math.min(1, 2560 / Math.max(ancho, alto))
    canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no pudo preparar la foto. Intenta nuevamente.')
    for (let intento = 0; intento < 5; intento++) {
      canvas.width = Math.max(1, Math.round(ancho * escala))
      canvas.height = Math.max(1, Math.round(alto * escala))
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height)
      for (const calidad of [0.9, 0.8, 0.65]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', calidad))
        if (!blob) throw new Error('No se pudo preparar la foto. Intenta nuevamente.')
        if (blob.size <= MAX_BYTES_FOTO) {
          return await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error('No se pudo leer la fotografía preparada.'))
            reader.readAsDataURL(blob)
          })
        }
      }
      escala *= 0.75
    }
    throw new Error('No se pudo optimizar esta fotografía. Intenta guardarla como JPG y vuelve a cargarla.')
  } finally {
    imagen?.close?.()
    if (url) URL.revokeObjectURL(url)
    if (canvas) { canvas.width = 1; canvas.height = 1 }
  }
}
