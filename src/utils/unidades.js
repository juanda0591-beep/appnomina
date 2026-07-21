// Conversión de unidades para Cortes y Planos.
// Internamente TODO se calcula y se guarda en milímetros (precisión de corte y
// estándar de la industria del tablero). En pantalla, las MEDIDAS DEL MUEBLE
// (ancho, alto, fondo, piezas, láminas) se muestran y se ingresan en centímetros.
// El espesor y el grosor de sierra siguen en mm (así se manejan en melamina).

// mm -> cm para mostrar. Redondea a 1 decimal y usa coma decimal (es-CO).
export function mmACm(mm) {
  const cm = Math.round(Number(mm) * 10) / 100 // 1 decimal de cm
  return Number.isFinite(cm) ? cm : 0
}

// cm (lo que teclea el usuario) -> mm para guardar/calcular.
export function cmAMm(cm) {
  const n = Number(cm)
  return Number.isFinite(n) ? Math.round(n * 10) : 0
}

// Texto en cm para etiquetas: "183" o "183,5".
export function fmtCm(mm) {
  return mmACm(mm).toLocaleString('es-CO', { maximumFractionDigits: 1 })
}
