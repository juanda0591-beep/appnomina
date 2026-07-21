import { useState, useEffect } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'
import PlanoCorte from '../components/PlanoCorte.jsx'
import GeneradorDespiece from '../components/GeneradorDespiece.jsx'
import { mmACm, cmAMm, fmtCm } from '../utils/unidades.js'
import { generarPdfCortes, exportarDespieceCSV } from '../utils/pdf.js'

// Medidas estándar de lámina. Valor interno en mm (estándar de corte); el label
// se muestra en cm porque el usuario trabaja en centímetros.
const LAMINAS_ESTANDAR = [
  { label: '183 × 244', ancho: 1830, largo: 2440 },
  { label: '215 × 244', ancho: 2150, largo: 2440 },
  { label: '280 × 207', ancho: 2800, largo: 2070 },
]

const emptyPieza = () => ({ nombre: '', ancho: '', alto: '', cantidad: '1', permiteRotar: true, canto: '' })

export default function CortesPlanos() {
  const { productos, calcularCorte, getPiezas, guardarPiezas, empresa } = useData()
  const { puede } = useAuth()
  const puedeEditar = puede('cortes-planos', 'editar')

  const [productoId, setProductoId] = useState('')
  const [piezas, setPiezas] = useState([])
  const [unidades, setUnidades] = useState('1')
  const [lamina, setLamina] = useState(LAMINAS_ESTANDAR[0])
  const [sierra, setSierra] = useState('4')
  const [espesor, setEspesor] = useState('18')
  const [costoLamina, setCostoLamina] = useState('90000')
  const [resultado, setResultado] = useState(null)
  const [disenoImg, setDisenoImg] = useState(null) // PNG del dibujo del generador
  const [calculando, setCalculando] = useState(false)
  const [cargandoPiezas, setCargandoPiezas] = useState(false)
  const [modo, setModo] = useState('manual') // 'manual' | 'parametrico'

  // Al elegir producto, carga su despiece guardado.
  useEffect(() => {
    setDisenoImg(null) // el dibujo pertenece a la sesión de diseño anterior
    if (!productoId) { setPiezas([]); setResultado(null); return }
    setCargandoPiezas(true)
    getPiezas(productoId)
      .then((ps) => setPiezas(ps.length ? ps.map(normalizarPieza) : [emptyPieza()]))
      .catch((err) => notify.error('Error al cargar el despiece: ' + err.message))
      .finally(() => setCargandoPiezas(false))
  }, [productoId])

  const setPiezaField = (i, campo, val) =>
    setPiezas((ps) => ps.map((p, idx) => (idx === i ? { ...p, [campo]: val } : p)))
  const agregarPieza = () => setPiezas((ps) => [...ps, emptyPieza()])
  const quitarPieza = (i) => setPiezas((ps) => ps.filter((_, idx) => idx !== i))

  // Recibe las piezas del generador (en mm) y el dibujo (PNG) para el PDF.
  const aplicarGenerado = (piezasGeneradas, imagen) => {
    setPiezas(piezasGeneradas.map((p) => ({
      nombre: p.nombre, ancho: String(mmACm(p.ancho)), alto: String(mmACm(p.alto)),
      cantidad: String(p.cantidad), permiteRotar: p.permiteRotar, canto: p.canto || '',
    })))
    setDisenoImg(imagen || null)
    setModo('manual') // vuelve a la tabla para revisar/editar antes de calcular
    notify.ok(`${piezasGeneradas.length} tipo(s) de pieza generados. Revísalos y guarda.`)
  }

  // La tabla trabaja en cm; el backend y el motor de corte, en mm.
  const guardarDespiece = async () => {
    const limpias = piezas.filter((p) => p.nombre.trim() && Number(p.ancho) > 0 && Number(p.alto) > 0)
    if (!limpias.length) { notify.error('Agrega al menos una pieza con nombre y medidas'); return }
    try {
      const guardadas = await guardarPiezas(productoId, limpias.map((p) => ({
        nombre: p.nombre.trim(), ancho: cmAMm(p.ancho), alto: cmAMm(p.alto),
        cantidad: Number(p.cantidad) || 1, permiteRotar: p.permiteRotar, canto: p.canto,
      })))
      setPiezas(guardadas.map(normalizarPieza))
      notify.ok('Despiece guardado')
    } catch (err) {
      notify.error('Error al guardar: ' + err.message)
    }
  }

  const calcular = async () => {
    const n = Math.max(1, Number(unidades) || 1)
    const limpias = piezas.filter((p) => p.nombre.trim() && Number(p.ancho) > 0 && Number(p.alto) > 0)
    if (!limpias.length) { notify.error('Agrega piezas válidas antes de calcular'); return }
    // Convierte cm -> mm y multiplica por el número de armarios a fabricar.
    const piezasCalc = limpias.map((p) => ({
      nombre: p.nombre.trim(), codigo: p.nombre.trim().slice(0, 3).toUpperCase(),
      ancho: cmAMm(p.ancho), alto: cmAMm(p.alto),
      cantidad: (Number(p.cantidad) || 1) * n, permiteRotar: p.permiteRotar,
    }))
    setCalculando(true)
    try {
      const r = await calcularCorte({
        piezas: piezasCalc,
        lamina: { ...lamina, espesor: Number(espesor) || 0, costo: Number(costoLamina) || 0 },
        opciones: { sierra: Number(sierra) || 0 },
      })
      setResultado(r)
      if (r.sinCabida?.length) {
        notify.error(`${r.sinCabida.length} pieza(s) no caben en la lámina elegida`)
      }
    } catch (err) {
      notify.error('Error al calcular: ' + err.message)
    } finally {
      setCalculando(false)
    }
  }

  const producto = productos.find((p) => String(p.id) === String(productoId))

  const exportarPdf = () => {
    if (!resultado) { notify.error('Primero calcula el corte'); return }
    generarPdfCortes({
      empresa, resultado, disenoImg,
      config: {
        productoNombre: producto?.nombre, unidades: Number(unidades) || 1,
        sierra: Number(sierra) || 0, costoLamina: Number(costoLamina) || 0,
      },
    })
  }
  const exportarCsv = () => {
    const validas = piezas.filter((p) => p.nombre.trim() && Number(p.ancho) > 0 && Number(p.alto) > 0)
    if (!validas.length) { notify.error('No hay piezas para exportar'); return }
    exportarDespieceCSV({ productoNombre: producto?.nombre, piezas: validas })
  }

  return (
    <CortesPlanosView
      {...{ productos, productoId, setProductoId, piezas, setPiezaField, agregarPieza,
        quitarPieza, guardarDespiece, calcular, unidades, setUnidades, lamina, setLamina,
        sierra, setSierra, espesor, setEspesor, costoLamina, setCostoLamina, resultado, calculando,
        cargandoPiezas, puedeEditar, producto, modo, setModo, aplicarGenerado, exportarPdf, exportarCsv }}
    />
  )
}

// El backend guarda en mm; la tabla trabaja en cm.
function normalizarPieza(p) {
  return {
    id: p.id, nombre: p.nombre, ancho: String(mmACm(p.ancho)), alto: String(mmACm(p.alto)),
    cantidad: String(p.cantidad), permiteRotar: p.permiteRotar, canto: p.canto || '',
  }
}

function CortesPlanosView(props) {
  const {
    productos, productoId, setProductoId, piezas, setPiezaField, agregarPieza,
    quitarPieza, guardarDespiece, calcular, unidades, setUnidades, lamina, setLamina,
    sierra, setSierra, espesor, setEspesor, costoLamina, setCostoLamina, resultado, calculando,
    cargandoPiezas, puedeEditar, producto, modo, setModo, aplicarGenerado,
    exportarPdf, exportarCsv,
  } = props

  return (
    <div>
      <h2>✂️ Cortes y Planos</h2>
      <p className="muted small">
        Optimización de corte tipo guillotina para láminas de melamina/MDF. Elige un
        producto, define su despiece y calcula cómo distribuir las piezas en las láminas.
      </p>

      <div className="card">
        <h3>1. Producto y despiece</h3>
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Producto (mueble)</label>
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Unidades a fabricar</label>
            <input type="number" min="1" value={unidades} onChange={(e) => setUnidades(e.target.value)} />
          </div>
        </div>

        {!productoId && (
          <Vacio icono="📦" titulo="Elige un producto">
            Selecciona el mueble para definir sus piezas.
          </Vacio>
        )}
        {cargandoPiezas && <p className="muted">Cargando despiece…</p>}
        {productoId && !cargandoPiezas && (
          <>
            <div className="tabs" style={{ margin: '12px 0' }}>
              <button
                className={modo === 'manual' ? 'tab active' : 'tab'}
                onClick={() => setModo('manual')}
              >
                ✏️ Despiece manual
              </button>
              <button
                className={modo === 'parametrico' ? 'tab active' : 'tab'}
                onClick={() => setModo('parametrico')}
              >
                📐 Generar por medidas
              </button>
            </div>
            {modo === 'manual' ? (
              <DespieceTabla
                {...{ piezas, setPiezaField, agregarPieza, quitarPieza, guardarDespiece, puedeEditar, exportarCsv }}
              />
            ) : (
              <GeneradorDespiece espesorInicial={espesor} onGenerar={aplicarGenerado} />
            )}
          </>
        )}
      </div>

      {productoId && (
        <ConfigYResultado
          {...{ lamina, setLamina, sierra, setSierra, espesor, setEspesor, costoLamina, setCostoLamina,
            calcular, calculando, resultado, producto, exportarPdf }}
        />
      )}
    </div>
  )
}

function DespieceTabla({ piezas, setPiezaField, agregarPieza, quitarPieza, guardarDespiece, puedeEditar, exportarCsv }) {
  return (
    <>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Pieza</th>
              <th className="num">Ancho (cm)</th>
              <th className="num">Alto (cm)</th>
              <th className="num">Cant.</th>
              <th>Rotar veta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {piezas.map((p, i) => (
              <tr key={i}>
                <td>
                  <input value={p.nombre} onChange={(e) => setPiezaField(i, 'nombre', e.target.value)}
                    placeholder="Ej: Lateral izq" />
                </td>
                <td className="num">
                  <input type="number" min="0" step="0.1" value={p.ancho}
                    onChange={(e) => setPiezaField(i, 'ancho', e.target.value)} style={{ width: 90 }} />
                </td>
                <td className="num">
                  <input type="number" min="0" step="0.1" value={p.alto}
                    onChange={(e) => setPiezaField(i, 'alto', e.target.value)} style={{ width: 90 }} />
                </td>
                <td className="num">
                  <input type="number" min="1" value={p.cantidad}
                    onChange={(e) => setPiezaField(i, 'cantidad', e.target.value)} style={{ width: 60 }} />
                </td>
                <td>
                  <input type="checkbox" checked={p.permiteRotar}
                    onChange={(e) => setPiezaField(i, 'permiteRotar', e.target.checked)} />
                </td>
                <td>
                  <button className="btn-danger btn-sm" onClick={() => quitarPieza(i)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button className="btn-secondary" onClick={agregarPieza}>+ Agregar pieza</button>
        <button className="btn-secondary" onClick={exportarCsv}>📄 Exportar CSV</button>
        {puedeEditar && (
          <button className="btn-primary" onClick={guardarDespiece}>💾 Guardar despiece</button>
        )}
      </div>
    </>
  )
}

function ConfigYResultado(props) {
  const { lamina, setLamina, sierra, setSierra, espesor, setEspesor, costoLamina, setCostoLamina,
    calcular, calculando, resultado, exportarPdf } = props
  return (
    <>
      <div className="card">
        <h3>2. Lámina y corte</h3>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Medida de lámina (cm)</label>
            <select
              value={lamina.label}
              onChange={(e) => setLamina(LAMINAS_ESTANDAR.find((l) => l.label === e.target.value))}
            >
              {LAMINAS_ESTANDAR.map((l) => (
                <option key={l.label} value={l.label}>{l.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Espesor (mm)</label>
            <input type="number" min="0" step="0.5" value={espesor} onChange={(e) => setEspesor(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Sierra / disco (mm)</label>
            <input type="number" min="0" step="0.5" value={sierra} onChange={(e) => setSierra(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Costo por lámina</label>
            <input type="number" min="0" value={costoLamina} onChange={(e) => setCostoLamina(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn-primary" onClick={calcular} disabled={calculando}>
            {calculando ? 'Calculando…' : '⚙️ Calcular corte'}
          </button>
        </div>
      </div>

      {resultado && <ResultadoCorte resultado={resultado} exportarPdf={exportarPdf} />}
    </>
  )
}

function ResultadoCorte({ resultado, exportarPdf }) {
  const r = resultado
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>3. Resultado de la optimización</h3>
        <button className="btn-primary btn-sm" onClick={exportarPdf}>🖨️ Exportar plano (PDF)</button>
      </div>
      <div className="cards-grid" style={{ marginTop: 12 }}>
        <div className="stat-card">
          <span className="stat-label">Láminas necesarias</span>
          <span className="stat-value">{r.cantidadLaminas}</span>
        </div>
        <div className="stat-card highlight">
          <span className="stat-label">Desperdicio</span>
          <span className="stat-value">{r.desperdicioPct}%</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Costo total láminas</span>
          <span className="stat-value">{formatCOP(r.costoTotal)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Costo desperdiciado</span>
          <span className="stat-value">{formatCOP(Math.round(r.costoTotal * r.desperdicioPct / 100))}</span>
        </div>
        {r.retazoMayor?.area !== 0 && r.retazoMayor?.ancho > 0 && (
          <div className="stat-card">
            <span className="stat-label">Retazo reutilizable</span>
            <span className="stat-value">{fmtCm(r.retazoMayor.ancho)} × {fmtCm(r.retazoMayor.largo)} cm</span>
          </div>
        )}
      </div>

      {r.lamina.girada && (
        <p className="chip" style={{ marginTop: 10 }}>
          🔄 Mejor resultado con la lámina girada 90° ({fmtCm(r.lamina.ancho)} × {fmtCm(r.lamina.largo)} cm).
          Se probó porque ninguna pieza tiene veta obligatoria.
        </p>
      )}

      {r.sinCabida?.length > 0 && (
        <p className="chip danger" style={{ marginTop: 10 }}>
          ⚠️ {r.sinCabida.length} pieza(s) más grandes que la lámina: {r.sinCabida.map((p) => p.nombre).join(', ')}
        </p>
      )}

      <div className="planos-lista" style={{ marginTop: 16 }}>
        {r.laminas.map((lam) => (
          <div key={lam.indice} style={{ marginBottom: 20 }}>
            <h4>
              Lámina {lam.indice} de {r.cantidadLaminas}
              <span className="muted small" style={{ fontWeight: 400, marginLeft: 8 }}>
                — {fmtCm(r.lamina.ancho)} × {fmtCm(r.lamina.largo)} cm
                {r.lamina.espesor ? ` · ${r.lamina.espesor} mm de espesor` : ''}
                {' '}· {lam.piezas.length} pieza(s)
              </span>
            </h4>
            <PlanoCorte
              ancho={r.lamina.ancho}
              largo={r.lamina.largo}
              piezas={lam.piezas}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
