const puntoMedio = (a, b) => a.map((v, i) => (v + b[i]) / 2)
const limitar = (v, a, b) => Math.max(a, Math.min(b, v))
const formato = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

// Proyección en píxeles CSS de coordenadas del proyecto expresadas en milímetros.
export function proyectarPunto3D(punto, limites, camara, ancho, alto) {
  if (!camara || !limites || ancho <= 0 || alto <= 0) return null
  const local = punto.map((v, i) => (v - (limites.min[i] + limites.max[i]) / 2) / 1000 - camara.ojo[i])
  const producto = (v) => local.reduce((s, n, i) => s + n * v[i], 0)
  const profundidad = -producto(camara.atras)
  if (profundidad <= .0001) return null
  return [ancho / 2 * (1 + producto(camara.derecha) / (profundidad * camara.tan * camara.aspecto)),
    alto / 2 * (1 - producto(camara.arriba) / (profundidad * camara.tan))]
}

export function crearCotasTablero(pieza, proyectar, ancho, alto) {
  if (!pieza || !pieza.origen || !pieza.dimensiones || ancho < 120 || alto < 100) return []
  const orden = ({ frente: ['ancho', 'alto', 'espesor'], lateral: ['espesor', 'alto', 'ancho'], horizontal: ['ancho', 'espesor', 'alto'] })[pieza.plano]
  if (!orden) return []
  const ejes = orden.map((k) => pieza.giro === 90 && k !== 'espesor' ? (k === 'ancho' ? 'alto' : 'ancho') : k)
  const esquinas = Array.from({ length: 8 }, (_, n) => pieza.origen.map((v, i) => v + ((n >> i) & 1) * pieza.dimensiones[i]))
  const puntos = esquinas.map(proyectar)
  if (puntos.some((p) => !p || !p.every(Number.isFinite))) return []
  if ([0, 1].some((i) => Math.max(...puntos.map((p) => p[i])) < 0 || Math.min(...puntos.map((p) => p[i])) > [ancho, alto][i])) return []
  const centro = puntos.reduce((s, p) => s.map((v, i) => v + p[i] / 8), [0, 0])
  const etiquetas = [], salida = []
  for (const key of ['ancho', 'alto', 'espesor']) {
    const eje = ejes.indexOf(key)
    const candidatos = esquinas.flatMap((_, n) => {
      if ((n >> eje) & 1) return []
      const a = puntos[n], b = puntos[n | (1 << eje)], medio = puntoMedio(a, b)
      const largo = Math.hypot(b[0] - a[0], b[1] - a[1])
      let normal = largo > 1 ? [-(b[1] - a[1]) / largo, (b[0] - a[0]) / largo] : medio.map((v, i) => v - centro[i])
      const norma = Math.hypot(...normal)
      normal = norma > .01 ? normal.map((v) => v / norma) : [1, -1]
      if (normal.reduce((s, v, i) => s + v * (medio[i] - centro[i]), 0) < 0) normal = normal.map((v) => -v)
      return [{ a, b, medio, normal, largo, puntuacion: Math.hypot(medio[0] - centro[0], medio[1] - centro[1]) + largo * .12 }]
    }).sort((a, b) => b.puntuacion - a.puntuacion)
    const c = candidatos[0], llamada = c.largo < 26 || key === 'espesor', separacion = llamada ? 46 : 28
    const a = c.a.map((v, i) => v + c.normal[i] * separacion), b = c.b.map((v, i) => v + c.normal[i] * separacion)
    const titulo = { ancho: 'Ancho', alto: 'Largo', espesor: 'Espesor' }[key]
    const texto = `${titulo} ${formato.format(Number(pieza[key]) / (key === 'espesor' ? 1 : 10))} ${key === 'espesor' ? 'mm' : 'cm'}`
    const w = Math.min(ancho - 16, texto.length * 6.8 + 18), h = 25
    const medio = puntoMedio(a, b)
    let x = limitar(medio[0] - w / 2, 8, ancho - w - 8), y = limitar(medio[1] - h / 2, 8, alto - h - 8)
    const solapa = (ex, ey) => etiquetas.some((e) => ex < e.x + e.w + 5 && ex + w + 5 > e.x && ey < e.y + e.h + 5 && ey + h + 5 > e.y)
    if (solapa(x, y)) {
      const opciones = [-33, 33, -66, 66, -99, 99].map((dy) => [x, limitar(y + dy, 8, alto - h - 8)])
        .concat([-w - 8, w + 8].map((dx) => [limitar(x + dx, 8, ancho - w - 8), y]))
      const libre = opciones.find(([ex, ey]) => !solapa(ex, ey))
      if (libre) [x, y] = libre
    }
    const etiqueta = { texto, x, y, w, h }
    etiquetas.push(etiqueta)
    const lineas = llamada ? [[c.medio, [x + w / 2, y + h / 2]]] : [[c.a, a], [a, b], [b, c.b]]
    if (!llamada) {
      const dx = (b[0] - a[0]) / c.largo, dy = (b[1] - a[1]) / c.largo
      for (const p of [a, b]) lineas.push([[p[0] - (dx + c.normal[0]) * 4, p[1] - (dy + c.normal[1]) * 4], [p[0] + (dx + c.normal[0]) * 4, p[1] + (dy + c.normal[1]) * 4]])
      if (Math.hypot(x + w / 2 - medio[0], y + h / 2 - medio[1]) > 16) lineas.push([medio, [x + w / 2, y + h / 2]])
    }
    salida.push({ key, etiqueta, lineas, color: key === 'espesor' ? '#805a2d' : '#1b6472' })
  }
  return salida
}

export function dibujarCotasImagen(ctx, cotas) {
  ctx.save(); ctx.font = '600 12px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (const c of cotas) {
    ctx.strokeStyle = c.color; ctx.lineWidth = 1.2; ctx.beginPath()
    for (const [a, b] of c.lineas) { ctx.moveTo(...a); ctx.lineTo(...b) }
    ctx.stroke()
    const e = c.etiqueta
    ctx.fillStyle = '#ffffff'; ctx.fillRect(e.x, e.y, e.w, e.h)
    ctx.strokeStyle = '#b5ced2'; ctx.strokeRect(e.x, e.y, e.w, e.h)
    ctx.fillStyle = c.color; ctx.fillText(e.texto, e.x + e.w / 2, e.y + e.h / 2)
  }
  ctx.restore()
}
