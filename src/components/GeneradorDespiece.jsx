import { lazy, Suspense, useState, useMemo, useRef } from 'react'
import { generarDespiece, nuevoModulo, paramsParaDespiece } from '../utils/despiece.js'
import { fmtCm } from '../utils/unidades.js'
import VistaFrontal from './VistaFrontal.jsx'
import ModulosEditor from './ModulosEditor.jsx'
import { ConfiguracionCarcasa } from './ConfiguracionMueble.jsx'
import { configurarDiseno } from '../utils/construccionMueble.js'
import VistasTecnicas from './VistasTecnicas.jsx'
import { confirmar } from '../utils/notify.js'
import FabricacionMDF from './FabricacionMDF.jsx'
import { editarPanelDiseno } from '../utils/fabricacionMDF.js'
import { construirMueble } from '../utils/construccionMueble.js'
const VistaMueble3D = lazy(() => import('./VistaMueble3D.jsx'))

const inicial = (espesor) => configurarDiseno({
  alto: '', ancho: '', fondo: '', espesor: espesor || '18',
  gap: '3', holguraFondo: '10',
  armado: 'laterales-completos', tipoFondo: 'superpuesto',
  modulos: [nuevoModulo()],
})

export default function GeneradorDespiece({ espesorInicial, onGenerar, disenoInicial, onModificar }) {
  const [f, setF] = useState(() => disenoInicial || inicial(espesorInicial))
  const stageRef = useRef(null) // lienzo Konva de la vista activa (para exportar)
  const set = (campo, val) => { onModificar?.(); setF((prev) => ({ ...prev, [campo]: val })) }
  const setModulos = (fn) => { onModificar?.(); setF((prev) => {
    const modulos = fn(prev.modulos)
    if (!prev.fabricacion || modulos.length >= prev.modulos.length) return { ...prev, modulos }
    const reubicar = (mapa) => Object.fromEntries(Object.entries(mapa || {}).flatMap(([key, valor]) => {
      const partes = key.split('|'), anterior = Number(partes[1])
      if (partes.length !== 3 || partes[1] === 'global' || !Number.isInteger(anterior)) return [[key, valor]]
      const nuevo = modulos.indexOf(prev.modulos[anterior])
      if (nuevo < 0) return []
      partes[1] = String(nuevo); return [[partes.join('|'), valor]]
    }))
    return { ...prev, modulos, fabricacion: { ...prev.fabricacion, perfiles: reubicar(prev.fabricacion.perfiles), ajustes: reubicar(prev.fabricacion.ajustes) } }
  }) }
  const cambiarCompleto = (nuevo) => { onModificar?.(); setF(nuevo) }
  const editarPieza = (clave, datos) => {
    const nuevo = editarPanelDiseno(f, clave, datos), c = construirMueble(nuevo)
    if (c.avisos.length) throw new Error(c.avisos[0])
    cambiarCompleto(nuevo)
  }

  const preview = useMemo(() => generarDespiece(paramsParaDespiece(f)), [f])
  const totalTipos = preview.piezas.length
  const totalUnidades = preview.piezas.reduce((s, p) => s + p.cantidad, 0)
  const listo = f.ancho && f.alto && f.fondo && preview.piezas.length > 0 && preview.avisos.length === 0

  // Al generar, captura la vista (2D o 3D) como PNG para incrustarla en el PDF.
  const aplicar = () => {
    if (!listo) return
    let imagen = null
    try {
      if (stageRef.current) imagen = stageRef.current.toDataURL({ pixelRatio: 2 })
    } catch { /* si el lienzo no está listo, se exporta sin imagen */ }
    onGenerar(preview.piezas, imagen, f)
  }

  return (
    <div>
      <p className="muted small">
        Ingresa las medidas y configura cada módulo (columna) por separado. El dibujo
        y el despiece se actualizan en vivo. Al generar, podrás editar la tabla.
      </p>
      <GeneradorForm f={f} set={set} />
      {f.construccionVersion === 2 && <FabricacionMDF f={f} cambiar={cambiarCompleto} />}
      {f.construccionVersion === 2 ? <ConfiguracionCarcasa f={f} set={set} /> : <div className="banner">
        <p>Este diseño conserva las reglas de armado anteriores.</p>
        <button type="button" className="btn-secondary" onClick={async () => {
          if (!(await confirmar('Se habilitarán nuevas reglas para cajas de cajón, frentes y sobresalientes. Revisa las medidas antes de generar y guardar una nueva versión.', { titulo: 'Adaptar diseño', textoOk: 'Adaptar', peligro: false }))) return
          onModificar?.(); setF(configurarDiseno(f))
        }}>Personalizar construcción</button></div>}
      <div className="generador-layout">
        <div style={{ flex: 1, minWidth: 300 }}>
          <ModulosEditor f={f} setModulos={setModulos} />
        </div>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          <PanelVista f={f} setModulos={setModulos} stageRef={stageRef} editarPieza={editarPieza} />
        </div>
      </div>
      <PreviewGenerador {...{ preview, totalTipos, totalUnidades, listo, aplicar }} />
    </div>
  )
}

// El mismo visor 3D se usa en el generador y al reabrir un proyecto guardado.
function PanelVista({ f, setModulos, stageRef, editarPieza }) {
  const [vista, setVista] = useState(f.construccionVersion === 2 ? '3d' : '2d')
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
        f.construccionVersion === 2 ? <VistasTecnicas diseno={f} /> : <VistaFrontal f={f} setModulos={setModulos} embebido stageRef={stageRef} />
      ) : (
        <Suspense fallback={<p className="muted">Cargando visor 3D...</p>}>
          <VistaMueble3D diseno={f} compacto onEditarPieza={f.construccionVersion === 2 ? editarPieza : undefined} />
        </Suspense>
      )}
    </div>
  )
}

function Campo({ label, valor, onChange, min = '0', step = '1', hint }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <label>{label}</label>
      <input aria-label={label} type="number" min={min} step={step} value={valor} onChange={(e) => onChange(e.target.value)} />
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
        {f.construccionVersion !== 2 && <div style={{ flex: 1, minWidth: 180 }}>
          <label>Método de armado</label>
          <select value={f.armado} onChange={(e) => set('armado', e.target.value)}>
            <option value="laterales-completos">Laterales completos</option>
            <option value="techo-piso-cubren">Techo y piso cubren</option>
          </select>
        </div>}
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
