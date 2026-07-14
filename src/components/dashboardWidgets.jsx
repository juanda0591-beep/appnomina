import { useEffect, useRef, useState } from 'react'
import { formatCOP } from '../utils/format.js'

// Anima un número desde 0 hasta `valor` al montar (easeOutCubic).
export function useContador(valor, duracion = 900) {
  const [n, setN] = useState(0)
  const rafRef = useRef(null)
  useEffect(() => {
    const objetivo = Number(valor) || 0
    const inicio = performance.now()
    const tick = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / duracion)
      const eased = 1 - Math.pow(1 - t, 3)
      setN(objetivo * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else setN(objetivo)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [valor, duracion])
  return n
}

// Número animado. Si `moneda`, formatea como COP; si no, entero.
export function NumeroAnimado({ valor, moneda = false }) {
  const n = useContador(valor)
  return <>{moneda ? formatCOP(Math.round(n)) : Math.round(n).toLocaleString('es-CO')}</>
}

// Anillo de progreso con CSS puro (conic-gradient). El color cambia según el nivel.
export function Anillo({ porcentaje }) {
  const pct = Math.max(0, Math.min(100, Math.round(porcentaje)))
  const nivel = pct >= 90 ? 'alto' : pct >= 60 ? 'medio' : 'bajo'
  return (
    <div className={`anillo nivel-${nivel}`} style={{ '--pct': `${pct}%` }}>
      <span className="anillo-num">{pct}%</span>
    </div>
  )
}
