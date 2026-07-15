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
