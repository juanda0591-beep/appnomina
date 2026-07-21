import { useState, useMemo, useRef } from 'react'
import { generarDespiece, nuevoModulo } from '../utils/despiece.js'
import { cmAMm, fmtCm } from '../utils/unidades.js'
import VistaFrontal from './VistaFrontal.jsx'
import VistaIso from './VistaIso.jsx'
import ModulosEditor from './ModulosEditor.jsx'

const inicial = (espesor) => ({
  alto: '', ancho: '', fondo: '', espesor: espesor || '18',
  gap: '3', holguraFondo: '10',
  armado: 'laterales-completos', tipoFondo: 'superpuesto',
  modulos: [nuevoModulo()],
})

// Convierte el estado del formulario (medidas en cm) a los parámetros del motor,
// que trabaja en mm. Espesor, gap y holgura ya están en mm.
const paramsParaDespiece = (f) => ({
  ancho: cmAMm(f.ancho), alto: cmAMm(f.alto), fondo: cmAMm(f.fondo),
  espesor: Number(f.espesor) || 18, gap: Number(f.gap) || 0,
  holguraFondo: Number(f.holguraFondo) || 0,
  armado: f.armado, tipoFondo: f.tipoFondo,
  modulos: f.modulos.map((m) => ({
    entrepanos: m.alturas.length, cajones: m.cajones,
    zonaCajones: cmAMm(m.zonaCajones), puerta: m.puerta,
    anchoCajon: cmAMm(m.anchoCajon), ladoCajon: m.ladoCajon,
  })),
})

export default function GeneradorDespiece({ espesorInicial, onGenerar }) {
  const [f, setF] = useState(() => inicial(espesorInicial))
  const stageRef = useRef(null) // lienzo Konva de la vista activa (para exportar)
  const set = (campo, val) => setF((prev) => ({ ...prev, [campo]: val }))
  const setModulos = (fn) => setF((prev) => ({ ...prev, modulos: fn(prev.modulos) }))

  const preview = useMemo(() => generarDespiece(paramsParaDespiece(f)), [f])
  const totalTipos = preview.piezas.length
  const totalUnidades = preview.piezas.reduce((s, p) => s + p.cantidad, 0)
  const listo = f.ancho && f.alto && f.fondo && preview.piezas.length > 0

  // Al generar, captura la vista (2D o 3D) como PNG para incrustarla en el PDF.
  const aplicar = () => {
    if (!listo) return
    let imagen = null
    try {
      if (stageRef.current) imagen = stageRef.current.toDataURL({ pixelRatio: 2 })
    } catch { /* si el lienzo no está listo, se exporta sin imagen */ }
    onGenerar(preview.piezas, imagen)
  }

  return (
    <div>
      <p className="muted small">
        Ingresa las medidas y configura cada módulo (columna) por separado. El dibujo
        y el despiece se actualizan en vivo. Al generar, podrás editar la tabla.
      </p>
      <GeneradorForm f={f} set={set} />
      <div className="generador-layout">
        <div style={{ flex: 1, minWidth: 300 }}>
          <ModulosEditor f={f} setModulos={setModulos} />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <PanelVista f={f} setModulos={setModulos} stageRef={stageRef} />
        </div>
      </div>
      <PreviewGenerador {...{ preview, totalTipos, totalUnidades, listo, aplicar }} />
    </div>
  )
}

// Panel de visualización: alterna entre alzado 2D (editable) y vista 3D isométrica.
function PanelVista({ f, setModulos, stageRef }) {
  const [vista, setVista] = useState('2d')
  const [lado, setLado] = useState('der')
  return (
    <div className="card" style={{ background: '#f8fafc' }}>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={vista === '2d' ? 'tab active' : 'tab'} onClick={() => setVista('2d')}>
          📐 Alzado 2D
        </button>
        <button className={vista === '3d' ? 'tab active' : 'tab'} onClick={() => setVista('3d')}>
          🧊 Vista 3D
        </button>
      </div>
      {vista === '2d' ? (
        <VistaFrontal f={f} setModulos={setModulos} embebido stageRef={stageRef} />
      ) : (
        <div>
          <div className="tabs" style={{ marginBottom: 8 }}>
            <button className={lado === 'izq' ? 'tab active' : 'tab'} onClick={() => setLado('izq')}>
              ◀ Desde la izquierda
            </button>
            <button className={lado === 'der' ? 'tab active' : 'tab'} onClick={() => setLado('der')}>
              Desde la derecha ▶
            </button>
          </div>
          <VistaIso f={f} lado={lado} stageRef={stageRef} />
          <p className="muted small" style={{ marginTop: 8 }}>
            Proyección 3D del mueble. El frente muestra puertas y cajones; el volumen
            indica la profundidad ({f.fondo || '—'} cm).
          </p>
        </div>
      )}
    </div>
  )
}

function Campo({ label, valor, onChange, min = '0', step = '1', hint }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <label>{label}</label>
      <input type="number" min={min} step={step} value={valor} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="muted small">{hint}</span>}
    </div>
  )
}

function GeneradorForm({ f, set }) {
  return (
    <>
      <div className="row">
        <Campo label="Ancho total (cm)" valor={f.ancho} onChange={(v) => set('ancho', v)} step="0.1" />
        <Campo label="Alto total (cm)" valor={f.alto} onChange={(v) => set('alto', v)} step="0.1" />
        <Campo label="Fondo (cm)" valor={f.fondo} onChange={(v) => set('fondo', v)} step="0.1" />
        <Campo label="Espesor (mm)" valor={f.espesor} onChange={(v) => set('espesor', v)} step="0.5" />
      </div>
      <div className="row">
        <Campo label="Holgura puerta (mm)" valor={f.gap} onChange={(v) => set('gap', v)} step="0.5" />
        <Campo label="Holgura fondo (mm)" valor={f.holguraFondo} onChange={(v) => set('holguraFondo', v)} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>Método de armado</label>
          <select value={f.armado} onChange={(e) => set('armado', e.target.value)}>
            <option value="laterales-completos">Laterales completos</option>
            <option value="techo-piso-cubren">Techo y piso cubren</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label>Fondo (trasera)</label>
          <select value={f.tipoFondo} onChange={(e) => set('tipoFondo', e.target.value)}>
            <option value="superpuesto">Superpuesto</option>
            <option value="interno">Interno</option>
            <option value="sin-fondo">Sin fondo</option>
          </select>
        </div>
      </div>
    </>
  )
}

function PreviewGenerador({ preview, totalTipos, totalUnidades, listo, aplicar }) {
  return (
    <>
      {preview.avisos.map((a, i) => (
        <p key={i} className="chip danger" style={{ marginTop: 6 }}>⚠️ {a}</p>
      ))}
      {listo && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table compact">
            <thead>
              <tr><th>Pieza</th><th className="num">Ancho (cm)</th><th className="num">Alto (cm)</th>
                <th className="num">Cant.</th><th>Veta</th></tr>
            </thead>
            <tbody>
              {preview.piezas.map((p, i) => (
                <tr key={i}>
                  <td>{p.nombre}</td><td className="num">{fmtCm(p.ancho)}</td><td className="num">{fmtCm(p.alto)}</td>
                  <td className="num">{p.cantidad}</td><td>{p.permiteRotar ? 'libre' : 'fija'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="form-actions">
        <span className="muted small">
          {listo ? `${totalTipos} tipo(s) · ${totalUnidades} pieza(s)` : 'Completa ancho, alto y fondo.'}
        </span>
        <button className="btn-primary" onClick={aplicar} disabled={!listo}>📐 Generar despiece</button>
      </div>
    </>
  )
}
