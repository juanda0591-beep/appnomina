import { useState } from 'react'

export default function MoverPieza({ onMover }) {
  const [paso, setPaso] = useState(10), [error, setError] = useState(''), [ocupado, setOcupado] = useState(false)
  const mover = async (eje, signo) => {
    setError(''); setOcupado(true)
    try { await onMover(eje, signo * Number(paso)) } catch (e) { setError(e.message) }
    finally { setOcupado(false) }
  }
  return <div className="mover-pieza" aria-label="Mover pieza seleccionada">
    <h4>Mover pieza</h4>
    <label>Desplazamiento (mm)<input type="number" min="0.1" max="10000" step="0.1" value={paso} onChange={(e) => setPaso(e.target.value)} /></label>
    <div className="mover-pieza-botones">{[['x', -1, 'Izquierda'], ['x', 1, 'Derecha'], ['y', 1, 'Arriba'], ['y', -1, 'Abajo'], ['z', -1, 'Atrás'], ['z', 1, 'Adelante']].map(([eje, signo, texto]) =>
      <button key={texto} type="button" className="corte-button" disabled={ocupado || !(Number(paso) > 0 && Number(paso) <= 10000)} onClick={() => mover(eje, signo)}>{texto}</button>)}</div>
    <p className="muted small">El movimiento se aplica al proyecto. Usa Deshacer para revertirlo y Guardar versión para conservarlo.</p>
    {error && <p role="alert" className="banner error">{error}</p>}
  </div>
}
