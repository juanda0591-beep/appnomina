// Formato de moneda en pesos colombianos (sin decimales por defecto)
export function formatCOP(value) {
  const n = Number(value) || 0
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

// Fecha legible.
// Los strings date-only ("2026-07-15") se interpretan como fecha LOCAL, no UTC:
// con new Date("2026-07-15") JS asume medianoche UTC y en Colombia (UTC-5) retrocede
// un día. Parseamos los componentes a mano para evitar ese corrimiento.
export function formatFecha(iso) {
  if (!iso) return ''
  let d
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso))
  if (m) {
    d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  } else {
    d = new Date(iso)
  }
  if (isNaN(d)) return iso
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Fecha de hoy en formato YYYY-MM-DD en hora LOCAL (no UTC).
// new Date().toISOString() da la fecha UTC: después de las 7pm en Colombia
// devuelve el día siguiente. Esto la mantiene correcta para inputs type="date".
export function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Duración legible entre dos timestamps ISO ("2 días", "4 horas", "15 min").
// Redondea al mayor de los dos rangos: si hay días de por medio se ignoran las
// horas sueltas, y así sucesivamente, para no saturar la vista con precisión falsa.
export function formatDuracion(desdeISO, hastaISO) {
  if (!desdeISO) return ''
  const desde = new Date(desdeISO)
  const hasta = hastaISO ? new Date(hastaISO) : new Date()
  if (isNaN(desde) || isNaN(hasta)) return ''
  const ms = Math.max(0, hasta - desde)
  const min = Math.round(ms / 60000)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `${horas} h`
  const dias = Math.round(horas / 24)
  return `${dias} día${dias === 1 ? '' : 's'}`
}
