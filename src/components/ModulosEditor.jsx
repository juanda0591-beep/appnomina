import { nuevoModulo } from '../utils/despiece.js'

// Editor de módulos: cada columna del mueble se configura por separado
// (puerta, entrepaños a distintas alturas, cajones). Los cambios son en vivo.
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

export default function ModulosEditor({ f, setModulos }) {
  // alto en cm, espesor en mm -> altura interior en cm.
  const altoInterior = Math.max(0, n(f.alto) - 2 * (n(f.espesor, 18) / 10))

  const editarMod = (idx, campo, val) =>
    setModulos((ms) => ms.map((m, i) => (i === idx ? { ...m, [campo]: val } : m)))

  const agregarModulo = () => setModulos((ms) => [...ms, nuevoModulo()])
  const quitarModulo = (idx) => setModulos((ms) => ms.length > 1 ? ms.filter((_, i) => i !== idx) : ms)

  // Agrega un entrepaño a media altura del hueco disponible por defecto (en cm).
  const agregarEntrepano = (idx) => setModulos((ms) => ms.map((m, i) => {
    if (i !== idx) return m
    const zona = m.cajones > 0 ? n(m.zonaCajones) : 0
    const nueva = Math.round((zona + (altoInterior - zona) / 2) * 10) / 10
    return { ...m, alturas: [...m.alturas, nueva].sort((a, b) => a - b) }
  }))
  const quitarEntrepano = (idx, k) => setModulos((ms) => ms.map((m, i) =>
    i === idx ? { ...m, alturas: m.alturas.filter((_, j) => j !== k) } : m))
  const setAlturaEntrepano = (idx, k, val) => setModulos((ms) => ms.map((m, i) =>
    i === idx ? { ...m, alturas: m.alturas.map((a, j) => (j === k ? n(val) : a)) } : m))

  const api = { editarMod, quitarModulo, agregarEntrepano, quitarEntrepano, setAlturaEntrepano, altoInterior }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>Módulos (columnas)</h4>
        <button className="btn-secondary btn-sm" onClick={agregarModulo}>+ Módulo</button>
      </div>
      <div className="modulos-cards">
        {f.modulos.map((m, idx) => (
          <ModuloCard key={idx} idx={idx} m={m} api={api} puedeQuitar={f.modulos.length > 1} />
        ))}
      </div>
    </div>
  )
}

function ModuloCard({ idx, m, api, puedeQuitar }) {
  const { editarMod, quitarModulo, agregarEntrepano, quitarEntrepano, setAlturaEntrepano, altoInterior } = api
  return (
    <div className="modulo-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Módulo {idx + 1}</strong>
        {puedeQuitar && (
          <button className="btn-danger btn-sm" onClick={() => quitarModulo(idx)}>✕</button>
        )}
      </div>

      <label>Puerta</label>
      <select value={m.puerta} onChange={(e) => editarMod(idx, 'puerta', e.target.value)}>
        <option value="ninguna">Sin puerta (abierto)</option>
        <option value="una">1 hoja</option>
        <option value="dos">2 hojas</option>
      </select>

      <label style={{ marginTop: 6 }}>Cajones abajo</label>
      <div className="row" style={{ gap: 6 }}>
        <input type="number" min="0" style={{ flex: 1 }} placeholder="N°" value={m.cajones}
          onChange={(e) => editarMod(idx, 'cajones', Math.max(0, Math.round(n(e.target.value))))} />
        <input type="number" min="0" step="0.1" style={{ flex: 1 }} placeholder="Zona alto (cm)"
          value={m.zonaCajones || ''} onChange={(e) => editarMod(idx, 'zonaCajones', n(e.target.value))} />
      </div>
      {m.cajones > 0 && (
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          <input type="number" min="0" step="0.1" style={{ flex: 1 }} placeholder="Ancho cajón (cm)"
            value={m.anchoCajon || ''} onChange={(e) => editarMod(idx, 'anchoCajon', n(e.target.value))} />
          <select style={{ flex: 1 }} value={m.ladoCajon || 'izq'}
            onChange={(e) => editarMod(idx, 'ladoCajon', e.target.value)}>
            <option value="izq">Cajón a la izquierda</option>
            <option value="der">Cajón a la derecha</option>
          </select>
        </div>
      )}
      {m.cajones > 0 && (
        <span className="muted small">
          Ancho vacío = cajón ocupa todo el módulo (puerta corta encima). Con un ancho
          menor, el cajón va a un lado y la puerta al lado va de altura completa.
        </span>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <label style={{ margin: 0 }}>Entrepaños ({m.alturas.length})</label>
        <button className="btn-secondary btn-sm" onClick={() => agregarEntrepano(idx)}>+ Entrepaño</button>
      </div>
      {m.alturas.map((alt, k) => (
        <div className="row" key={k} style={{ gap: 6, marginTop: 4, alignItems: 'center' }}>
          <span className="muted small" style={{ width: 60 }}>Altura {k + 1}</span>
          <input type="number" min="0" step="0.1" max={altoInterior} style={{ flex: 1 }} value={alt}
            onChange={(e) => setAlturaEntrepano(idx, k, e.target.value)} />
          <span className="muted small">cm</span>
          <button className="btn-danger btn-sm" onClick={() => quitarEntrepano(idx, k)}>✕</button>
        </div>
      ))}
    </div>
  )
}
