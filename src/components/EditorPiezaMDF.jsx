import { useState } from 'react'
import { perfilSimple } from '../utils/fabricacionMDF.js'

export default function EditorPiezaMDF({ pieza, diseno, onGuardar }) {
  const existente = diseno.fabricacion?.ajustes?.[pieza.clave] || {}
  const [ajuste, setAjuste] = useState(existente)
  const [perfil, setPerfil] = useState(diseno.fabricacion?.perfiles?.[pieza.clave] || perfilSimple(pieza.espesor))
  const [error, setError] = useState('')
  const campo = (label, key, def) => <label>{label}<input aria-label={`Pieza · ${label}`} type="number" step="0.1" value={ajuste[key] ?? def}
    onChange={(e) => setAjuste((a) => ({ ...a, [key]: e.target.value === '' ? '' : Number(e.target.value) }))} /></label>
  const campoPerfil = (label, key) => <label>{label}<input aria-label={`Pieza · ${label}`} type="number" min="0" step="0.1" value={perfil[key]}
    onChange={(e) => setPerfil((p) => ({ ...p, [key]: e.target.value === '' ? '' : Number(e.target.value) }))} /></label>
  const guardar = async (reset = false) => {
    setError('')
    try { await onGuardar(pieza.clave, reset ? null : { ajuste, perfil }) }
    catch (e) { setError(e.message) }
  }
  return <div className="editor-pieza" aria-label="Editor de pieza seleccionada">
    <h4>Editar esta pieza</h4>
    <p className="muted small">Medidas en mm. Los ajustes de tamaño y posición son individuales; revisa sus encuentros con las piezas vecinas.</p>
    <div className="construccion-grid">{campo('Ancho', 'ancho', pieza.ancho)}{campo('Alto / largo', 'alto', pieza.alto)}</div>
    <details><summary>Posición de montaje</summary>
      {['x', 'y', 'z'].map((e, i) => <div key={e}>{campo(`Posición ${e.toUpperCase()}`, e, pieza.origen?.[i] || 0)}</div>)}
      <p className="muted small">X desde la izquierda, Y desde la base, Z hacia el frente.</p>
    </details>
    <label>Fabricación<select aria-label="Pieza · Fabricación" value={perfil.tipo} onChange={(e) => setPerfil((p) => ({ ...p, tipo: e.target.value, final: e.target.value === 'simple' ? p.espesor : '' }))}>
      <option value="simple">Tablero simple</option><option value="reengrueso">Reengrueso con tiras MDF 9 mm</option><option value="entamborado">Entamborado</option></select></label>
    {campoPerfil('Espesor MDF / cara principal', 'espesor')}
    {perfil.tipo !== 'simple' && campoPerfil('Espesor terminado', 'final')}
    {perfil.tipo === 'reengrueso' && <>{campoPerfil('Ancho de las tiras', 'anchoTira')}
      <div className="corte-edges">{['izq', 'der', 'arriba', 'abajo'].map((b) => <label key={b}><input aria-label={`Pieza · Refuerzo ${b}`} type="checkbox" checked={perfil.bordes.includes(b)}
        onChange={(e) => setPerfil((p) => ({ ...p, bordes: e.target.checked ? [...p.bordes, b] : p.bordes.filter((n) => n !== b) }))} />{b}</label>)}</div>
      <p className="muted small">Una cara completa y tiras planas de 9 mm en los bordes elegidos, repetidas hasta alcanzar el espesor terminado.</p></>}
    {perfil.tipo === 'entamborado' && <>{campoPerfil('Espesor de contracara', 'caraInferior')}{campoPerfil('Refuerzos interiores', 'refuerzos')}
      <p className="muted small">Dos caras y bastidor de tiras MDF 9 mm de canto. La altura de las tiras es el espesor terminado menos las dos caras.</p></>}
    {pieza.movimiento?.tipo === 'girarY' && <label>Bisagra<select aria-label="Pieza · Bisagra" value={ajuste.bisagra || pieza.movimiento.lado} onChange={(e) => setAjuste((a) => ({ ...a, bisagra: e.target.value }))}>
      <option value="izq">Izquierda</option><option value="der">Derecha</option></select></label>}
    {error && <p role="alert" className="danger-text small">{error}</p>}
    <div className="corte-actions"><button type="button" className="corte-button primary" onClick={() => guardar()}>Aplicar a la pieza</button>
      <button type="button" className="corte-button" onClick={() => guardar(true)}>Restablecer pieza</button></div>
  </div>
}
