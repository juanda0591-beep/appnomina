export async function portalApi(path, method = 'GET', body) {
  const res = await fetch(`/api/portal${path}`, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Portal': '1' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) })
  const data = await res.json()
  if (!res.ok) { const e = new Error(data.error || 'No se pudo completar la solicitud.'); e.status = res.status; throw e }
  return data
}
export const dinero = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(n)
export function leerBorrador(id) {
  try { return JSON.parse(sessionStorage.getItem(`portal_borrador_${id}`) || '{}') } catch { return {} }
}
