import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react'
import { Modal } from '@mantine/core'
import { FilePlus2, FolderOpen, Save, Copy, Undo2, Redo2, Plus, Trash2, Download, Scissors, ChevronLeft, ChevronRight, Ruler } from 'lucide-react'
import { useLocalData, http } from '../hooks/useLocalData.js'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import PlanoCorte, { Herramienta } from '../components/PlanoCorte.jsx'
import GeneradorDespiece from '../components/GeneradorDespiece.jsx'
import VistasTecnicas from '../components/VistasTecnicas.jsx'
import { proyectoVacio, entradaCorte, colorPieza } from '../utils/proyectoCorte.js'
import { fmtCm, mmACm, cmAMm } from '../utils/unidades.js'
import { exportarDespieceCSV } from '../utils/pdf.js'
import { generarPdfTaller } from '../utils/pdfCortes.js'
import './CortesPlanos.css'
import { editarPanelDiseno } from '../utils/fabricacionMDF.js'
import { construirMueble } from '../utils/construccionMueble.js'
import PiezasManuales from '../components/PiezasManuales.jsx'
import AsistentePlanos from '../components/AsistentePlanos.jsx'
import { validarMontaje } from '../utils/piezasManuales.js'

const VistaMueble3D = lazy(() => import('../components/VistaMueble3D.jsx'))

const documentoNuevo = () => ({ nombre: 'Nuevo proyecto', proyecto: proyectoVacio() })
function historialReducer(state, action) {
  if (action.tipo === 'abrir') return { pasado: [], actual: action.valor, futuro: [] }
  if (action.tipo === 'undo' && state.pasado.length) return { pasado: state.pasado.slice(0, -1), actual: state.pasado.at(-1), futuro: [state.actual, ...state.futuro] }
  if (action.tipo === 'redo' && state.futuro.length) return { pasado: [...state.pasado, state.actual], actual: state.futuro[0], futuro: state.futuro.slice(1) }
  if (action.tipo === 'cambiar') return { pasado: [...state.pasado.slice(-39), state.actual], actual: action.fn(state.actual), futuro: [] }
  return state
}
const codigoNuevo = (piezas) => {
  let i = 1
  while (piezas.some((p) => p.codigo === `P${String(i).padStart(3, '0')}`)) i++
  return `P${String(i).padStart(3, '0')}`
}
const piezaNueva = (piezas) => ({ codigo: codigoNuevo(piezas), nombre: '', ancho: 0, alto: 0, cantidad: 1, permiteRotar: true, canto: '' })

export default function CortesPlanos() {
  const { data: productos, error: errorProductos } = useLocalData('/productos')
  const { empresa } = useData()
  const { puede } = useAuth()
  const [historial, dispatch] = useReducer(historialReducer, null, () => ({ pasado: [], actual: documentoNuevo(), futuro: [] }))
  const { nombre, proyecto } = historial.actual
  const [guardado, setGuardado] = useState(null), [calculo, setCalculo] = useState(null)
  const [ocupado, setOcupado] = useState(false), [cargandoProducto, setCargandoProducto] = useState(false)
  const [error, setError] = useState(''), [modo, setModo] = useState('despiece')
  const [listaAbierta, setListaAbierta] = useState(false), [hoja, setHoja] = useState(0)
  const [seleccionado, setSeleccionado] = useState(null), [formato, setFormato] = useState('a4')
  const [generadorKey, setGeneradorKey] = useState(0)
  const [generadorSucio, setGeneradorSucio] = useState(false)
  const [vistaPlano, setVistaPlano] = useState('corte')
  const solicitud = useRef(0), cargando = useRef(null)
  const firma = JSON.stringify(proyecto), firmaDocumento = JSON.stringify(historial.actual)
  const firmaActual = useRef(firma)
  firmaActual.current = firma
  const vigente = calculo?.firma === firma
  const resultado = vigente ? calculo.resultado : null
  const modificado = generadorSucio || (guardado ? guardado.firma !== firmaDocumento : historial.pasado.length > 0)
  const editar = (fn) => { solicitud.current++; setError(''); dispatch({ tipo: 'cambiar', fn }) }
  const cambiarProyecto = (fn) => editar((d) => ({ ...d, proyecto: fn(d.proyecto) }))
  const campo = (key, value) => cambiarProyecto((p) => ({ ...p, [key]: value }))
  const campoLamina = (key, value) => cambiarProyecto((p) => ({ ...p, ...(key === 'espesor' ? { diseno: null } : {}), lamina: { ...p.lamina, [key]: value } }))
  const cambiarPieza = (codigo, key, value) => cambiarProyecto((p) => ({ ...p, diseno: null,
    montajeManual: (p.montajeManual || []).filter((m) => m.codigo !== codigo),
    piezas: p.piezas.map((pieza) => pieza.codigo === codigo ? { ...pieza, [key]: value } : pieza) }))
  const actualizarMontaje = (montaje) => { validarMontaje(montaje, proyecto.piezas); campo('montajeManual', montaje) }
  const puedeGuardar = puede('cortes-planos', guardado?.id ? 'editar' : 'crear')
  const laminaActual = resultado?.laminas[Math.min(hoja, resultado.laminas.length - 1)]
  const piezaSeleccionada = laminaActual?.piezas.find((p) => p.id === seleccionado)

  useEffect(() => {
    const advertir = (e) => { if (modificado) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', advertir)
    return () => window.removeEventListener('beforeunload', advertir)
  }, [modificado])
  useEffect(() => () => { solicitud.current++; cargando.current?.abort() }, [])

  const permitirCambio = () => !modificado || confirmar('Hay cambios sin guardar en este proyecto.', {
    titulo: 'Descartar cambios', textoOk: 'Descartar y continuar', peligro: true })
  const nuevo = async () => {
    if (!(await permitirCambio())) return
    solicitud.current++; cargando.current?.abort(); setCargandoProducto(false)
    dispatch({ tipo: 'abrir', valor: documentoNuevo() }); setGuardado(null); setCalculo(null)
    setError(''); setHoja(0); setModo('despiece'); setGeneradorKey((n) => n + 1); setGeneradorSucio(false)
  }
  const elegirProducto = async (id) => {
    if ((proyecto.piezas.length || generadorSucio) && !(await confirmar('Se reemplazara el despiece por el del producto elegido.', { titulo: 'Cambiar producto', textoOk: 'Continuar', peligro: false }))) return
    cargando.current?.abort()
    const controller = new AbortController(); cargando.current = controller
    const producto = productos.find((p) => String(p.id) === id)
    cambiarProyecto((p) => ({ ...p, productoId: id, productoNombre: producto?.nombre || '', piezas: [], diseno: null, montajeManual: [] }))
    setGeneradorKey((n) => n + 1); setCalculo(null); setHoja(0); setGeneradorSucio(false)
    if (!id) { setCargandoProducto(false); return }
    setCargandoProducto(true)
    try {
      const piezas = await http(`/productos/${id}/piezas`, { signal: controller.signal })
      if (controller.signal.aborted) return
      cambiarProyecto((p) => ({ ...p, piezas: piezas.map((pieza, i) => ({ ...pieza, codigo: `P${String(i + 1).padStart(3, '0')}` })) }))
    } catch (e) { if (!controller.signal.aborted) setError(e.message) }
    finally { if (!controller.signal.aborted) setCargandoProducto(false) }
  }
  const calcular = async () => {
    setError('')
    try {
      const payload = entradaCorte(proyecto), firmaPeticion = firma, numero = ++solicitud.current
      setOcupado(true)
      const r = await http('/cortes/calcular', { method: 'POST', body: JSON.stringify(payload) })
      if (numero !== solicitud.current || firmaPeticion !== firmaActual.current) return
      setCalculo({ firma: firmaPeticion, resultado: r }); setHoja(0); setSeleccionado(null)
    } catch (e) { setError(e.message) }
    finally { setOcupado(false) }
  }
  const guardar = async (copia = false) => {
    setError('')
    try {
      entradaCorte(proyecto)
      setOcupado(true)
      const datos = await http('/planos-corte', { method: 'POST', body: JSON.stringify({ nombre: copia ? `${nombre} - copia` : nombre,
        proyecto, ...(guardado?.id && !copia ? { proyectoId: guardado.id } : {}) }) })
      const actual = { nombre: datos.nombre, proyecto: datos.proyecto }
      dispatch({ tipo: 'abrir', valor: actual })
      setGuardado({ ...datos, firma: JSON.stringify(actual) })
      setCalculo({ firma: JSON.stringify(datos.proyecto), resultado: datos.resultado })
      notify.ok(`Version ${datos.revision} guardada`)
    } catch (e) { setError(e.message) }
    finally { setOcupado(false) }
  }
  const abrir = async (id) => {
    if (!(await permitirCambio())) return
    setOcupado(true); setError('')
    try {
      const datos = await http(`/planos-corte/${id}`)
      if (!datos.proyecto) {
        setError('Este plano antiguo no conserva las medidas del proyecto. Puedes descargar su PDF desde Proyectos.')
        setListaAbierta(false); return
      }
      const actual = { nombre: datos.nombre, proyecto: datos.proyecto }
      solicitud.current++; cargando.current?.abort(); setCargandoProducto(false)
      dispatch({ tipo: 'abrir', valor: actual }); setGuardado({ ...datos, firma: JSON.stringify(actual) })
      setCalculo({ firma: JSON.stringify(datos.proyecto), resultado: datos.resultado })
      setListaAbierta(false); setHoja(0); setSeleccionado(null); setModo('despiece'); setGeneradorKey((n) => n + 1); setGeneradorSucio(false)
    } catch (e) { setError(e.message) }
    finally { setOcupado(false) }
  }
  const guardarDespiece = async () => {
    try {
      entradaCorte(proyecto)
      if (!(await confirmar('Se reemplazara el despiece del producto con estas piezas.', { titulo: 'Guardar en producto', textoOk: 'Guardar', peligro: false }))) return
      setOcupado(true)
      await http(`/productos/${proyecto.productoId}/piezas`, { method: 'PUT', body: JSON.stringify({ piezas: proyecto.piezas }) })
      notify.ok('Despiece del producto actualizado')
    } catch (e) { setError(e.message) }
    finally { setOcupado(false) }
  }
  const pdf = () => {
    if (!resultado || resultado.sinCabida.length) return
    try { generarPdfTaller({ empresa, resultado, proyecto, nombre, formato,
      revision: !modificado && guardado ? guardado.revision : null, creado: !modificado ? guardado?.creado : null }) }
    catch (e) { setError(e.message) }
  }
  const aplicarGenerado = (piezas, imagen, diseno) => {
    cambiarProyecto((p) => ({ ...p, diseno, montajeManual: [], lamina: { ...p.lamina, espesor: Number(diseno.espesor) },
      ...(diseno.fabricacion ? { laminasPorEspesor: Object.fromEntries([...new Set(piezas.map((pi) => pi.espesor))].map((e) => [e, p.laminasPorEspesor?.[e] || { ...p.lamina, espesor: e, costo: e === Number(diseno.espesor) ? p.lamina.costo : 0 }])) } : {}),
      piezas: piezas.map((pieza, i) => ({ ...pieza, codigo: `P${String(i + 1).padStart(3, '0')}` })) }))
    setModo('despiece'); setGeneradorKey((n) => n + 1); setGeneradorSucio(false)
  }
  const editarPieza3D = (clave, datos) => {
    const diseno = editarPanelDiseno(proyecto.diseno, clave, datos), c = construirMueble(diseno)
    if (c.avisos.length) throw new Error(c.avisos[0])
    aplicarGenerado(c.piezas, null, diseno)
  }
  const aplicarPiezasIA = async (piezas) => {
    if (!(await confirmar('Se reemplazará la tabla de piezas y se desvinculará el diseño anterior. Revisa la propuesta antes de continuar.', { titulo: 'Aplicar propuesta IA', textoOk: 'Aplicar', peligro: false }))) return false
    cambiarProyecto((p) => ({ ...p, piezas, diseno: null, montajeManual: [] }))
    setVistaPlano('piezas'); setCalculo(null); setSeleccionado(null)
    return true
  }
  const aplicarMontajeIA = async (propuesta) => {
    if (proyecto.diseno) throw new Error('Las ubicaciones libres se aplican a piezas manuales.')
    const ids = new Set(propuesta.map((p) => `${p.codigo}-${p.unidad}`))
    actualizarMontaje([...(proyecto.montajeManual || []).filter((p) => !ids.has(`${p.codigo}-${p.unidad}`)), ...propuesta])
    setVistaPlano('piezas'); return true
  }
  const cambiarModo = async (siguiente) => {
    if (siguiente === modo) return
    if (generadorSucio && !(await confirmar('Genera el despiece para aplicar las medidas. Continuar descartara los cambios del generador.', { titulo: 'Cambios por aplicar', textoOk: 'Descartar cambios' }))) return
    setGeneradorSucio(false); setModo(siguiente)
  }

  return <div className="cortes-app">
    <header className="corte-heading"><div><h2><Scissors size={23} /> Cortes y planos</h2>
      <span className="corte-subtitle">{guardado ? `Proyecto #${guardado.raizId} / Version ${guardado.revision}` : 'Proyecto nuevo'}
        <span className={`corte-dot ${modificado ? 'pending' : ''}`} />{modificado ? 'Cambios sin guardar' : guardado ? 'Guardado' : 'Borrador'}</span></div>
      <div className="corte-actions">
        <Herramienta icono={Undo2} titulo="Deshacer" disabled={!historial.pasado.length || ocupado || cargandoProducto || modo !== 'despiece'} onClick={() => { solicitud.current++; dispatch({ tipo: 'undo' }) }} />
        <Herramienta icono={Redo2} titulo="Rehacer" disabled={!historial.futuro.length || ocupado || cargandoProducto || modo !== 'despiece'} onClick={() => { solicitud.current++; dispatch({ tipo: 'redo' }) }} />
        <Herramienta icono={FilePlus2} titulo="Nuevo proyecto" onClick={nuevo} disabled={ocupado} />
        <button className="corte-button" onClick={() => setListaAbierta(true)} disabled={ocupado}><FolderOpen size={17} />Proyectos</button>
        {puedeGuardar && <button className="corte-button primary" onClick={() => guardar()} disabled={ocupado || cargandoProducto || modo !== 'despiece' || !resultado || !!resultado.sinCabida.length}><Save size={17} />Guardar version</button>}
        {puede('cortes-planos', 'crear') && guardado && <Herramienta icono={Copy} titulo="Guardar como copia" onClick={() => guardar(true)} disabled={ocupado || !resultado || !!resultado.sinCabida.length || modo !== 'despiece'} />}
      </div>
    </header>
    {(error || errorProductos) && <div role="alert" className="banner error">{error || errorProductos}</div>}
    <fieldset className="corte-fields" disabled={ocupado || cargandoProducto}>
      <div className="corte-project-fields">
        <label>Nombre del proyecto<input value={nombre} maxLength={160} onChange={(e) => editar((d) => ({ ...d, nombre: e.target.value }))} /></label>
        <label>Producto<select aria-label="Producto" value={proyecto.productoId} onChange={(e) => elegirProducto(e.target.value)}><option value="">Proyecto independiente</option>
          {proyecto.productoId && !productos.some((p) => String(p.id) === String(proyecto.productoId)) && <option value={proyecto.productoId}>{proyecto.productoNombre || 'Producto archivado'}</option>}
          {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label>Material / acabado<input value={proyecto.material} maxLength={120} placeholder="Melamina blanca" onChange={(e) => campo('material', e.target.value)} /></label>
        <Numero label="Unidades" value={proyecto.unidades} min={1} step={1} onChange={(v) => campo('unidades', v)} />
      </div>
      <div className="corte-workspace">
        <aside className="corte-config">
          <h3>Lamina y corte</h3>
          <label>Formato de lamina<select aria-label="Formato de lamina" value={`${proyecto.lamina.ancho}x${proyecto.lamina.largo}`}
            onChange={(e) => { if (e.target.value === 'custom') return; const [ancho, largo] = e.target.value.split('x').map(Number); cambiarProyecto((p) => ({ ...p, lamina: { ...p.lamina, ancho, largo } })) }}>
            {!['1830x2440', '2150x2440', '2800x2070'].includes(`${proyecto.lamina.ancho}x${proyecto.lamina.largo}`) && <option value={`${proyecto.lamina.ancho}x${proyecto.lamina.largo}`}>Personalizado</option>}
            <option value="1830x2440">183 x 244 cm</option><option value="2150x2440">215 x 244 cm</option><option value="2800x2070">280 x 207 cm</option>
          </select></label>
          <div className="corte-pair"><Numero label="Ancho (cm)" value={mmACm(proyecto.lamina.ancho)} onChange={(v) => campoLamina('ancho', cmAMm(v))} />
            <Numero label="Largo (cm)" value={mmACm(proyecto.lamina.largo)} onChange={(v) => campoLamina('largo', cmAMm(v))} /></div>
          <div className="corte-pair"><Numero label="Espesor (mm)" value={proyecto.lamina.espesor} onChange={(v) => campoLamina('espesor', v)} />
            <Numero label="Disco (mm)" value={proyecto.sierra} onChange={(v) => campo('sierra', v)} /></div>
          <Numero label="Saneado por borde (mm)" value={proyecto.margen} onChange={(v) => campo('margen', v)} />
          <Numero label="Costo por lamina" value={proyecto.lamina.costo} step={100} onChange={(v) => campoLamina('costo', v)} />
          {proyecto.piezas.some((p) => p.espesor) && <details className="laminas-espesor" open><summary>Láminas por espesor</summary>
            {[...new Set(proyecto.piezas.map((p) => p.espesor || Number(proyecto.lamina.espesor)))].sort((a, b) => b - a).map((e) => {
              const l = proyecto.laminasPorEspesor?.[e] || { ...proyecto.lamina, espesor: e, costo: e === Number(proyecto.lamina.espesor) ? proyecto.lamina.costo : 0 }
              const cambiar = (key, value) => campo('laminasPorEspesor', { ...proyecto.laminasPorEspesor, [e]: { ...l, [key]: value } })
              return <fieldset key={e}><legend>MDF {e} mm</legend><Numero label={`Ancho lámina ${e} mm (cm)`} value={mmACm(l.ancho)} onChange={(v) => cambiar('ancho', cmAMm(v))} />
                <Numero label={`Largo lámina ${e} mm (cm)`} value={mmACm(l.largo)} onChange={(v) => cambiar('largo', cmAMm(v))} />
                <Numero label={`Costo lámina ${e} mm`} value={l.costo} step={100} onChange={(v) => cambiar('costo', v)} /></fieldset>
            })}<p className="muted small">Costo 0 significa sin cotizar. Cada espesor se corta en láminas independientes.</p></details>}
          <button className="corte-button primary corte-calculate" onClick={calcular} disabled={ocupado || cargandoProducto || !proyecto.piezas.length || modo !== 'despiece'}>
            <Scissors size={17} />{ocupado ? 'Procesando...' : 'Calcular corte'}</button>
          {cargandoProducto && <p role="status">Cargando despiece...</p>}
          <div className="corte-inspector"><h3>Pieza seleccionada</h3>
            {piezaSeleccionada ? <><strong>{piezaSeleccionada.codigo} / {piezaSeleccionada.nombre}</strong>
              <dl><dt>Medida de corte</dt><dd>{fmtCm(piezaSeleccionada.anchoOriginal ?? piezaSeleccionada.ancho)} x {fmtCm(piezaSeleccionada.altoOriginal ?? piezaSeleccionada.largo)} cm</dd>
                <dt>Posicion en lamina</dt><dd>X {fmtCm(piezaSeleccionada.x)} / Y {fmtCm(piezaSeleccionada.y)} cm</dd>
                <dt>Veta</dt><dd>{piezaSeleccionada.permiteRotar ? 'Libre' : 'Fija'}</dd><dt>Orientacion</dt><dd>{piezaSeleccionada.rotada ? 'Girada 90 grados' : 'Original'}</dd>
                <dt>Cantos</dt><dd>{piezaSeleccionada.canto || 'Sin canto'}</dd></dl></> : <span className="muted">Ninguna</span>}
          </div>
        </aside>
        <section className="corte-drawing">
          <div className="corte-tabs" role="tablist" aria-label="Visualización del proyecto">
            <button role="tab" aria-selected={vistaPlano === 'corte'} onClick={() => setVistaPlano('corte')}>Plano de corte</button>
            <button role="tab" aria-selected={vistaPlano === 'mueble'} onClick={() => setVistaPlano('mueble')}>Mueble 3D</button>
            <button role="tab" aria-selected={vistaPlano === 'piezas'} onClick={() => setVistaPlano('piezas')}>Piezas 2D / 3D</button>
            <button type="button" className="corte-button" onClick={() => { setModo('generador'); document.querySelector('.corte-despiece')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>Editar construcción</button>
          </div>
          {vistaPlano === 'piezas' ? <PiezasManuales proyecto={proyecto} onPieza={cambiarPieza} onMontaje={actualizarMontaje} /> : vistaPlano === 'mueble' ? <Suspense fallback={<div className="corte-empty">Cargando visor 3D...</div>}>
            <VistaMueble3D diseno={proyecto.diseno} piezas={proyecto.piezas} seleccionado={seleccionado} onEditarPieza={proyecto.diseno?.construccionVersion === 2 ? editarPieza3D : undefined} onSeleccionar={(id) => {
              setSeleccionado(id)
              const index = resultado?.laminas.findIndex((l) => l.piezas.some((p) => p.id === id))
              if (index >= 0) setHoja(index)
            }} />
          </Suspense> : <><div className="corte-sheet-head"><div className="corte-actions">
            <Herramienta icono={ChevronLeft} titulo="Lamina anterior" disabled={!resultado || hoja <= 0} onClick={() => { setHoja(hoja - 1); setSeleccionado(null) }} />
            <strong>{laminaActual ? `Lamina ${hoja + 1} de ${resultado.cantidadLaminas}` : 'Plano de corte'}</strong>
            <Herramienta icono={ChevronRight} titulo="Lamina siguiente" disabled={!resultado || hoja >= resultado.cantidadLaminas - 1} onClick={() => { setHoja(hoja + 1); setSeleccionado(null) }} />
          </div><span className={`corte-state ${resultado ? 'ok' : ''}`}>{resultado ? 'Calculado' : calculo ? 'Requiere recalculo' : 'Sin calcular'}</span></div>
          <PlanoCorte ancho={(laminaActual?.lamina || resultado?.lamina || proyecto.lamina).ancho || 1830} largo={(laminaActual?.lamina || resultado?.lamina || proyecto.lamina).largo || 2440}
            piezas={laminaActual?.piezas || PIEZAS_VACIAS} retazos={laminaActual?.retazos || PIEZAS_VACIAS} margen={proyecto.margen}
            seleccionado={seleccionado} onSeleccionar={setSeleccionado} />
          </>}
          {resultado?.sinCabida.length > 0 && <div role="alert" className="banner error">Piezas sin cabida: {resultado.sinCabida.map((p) => p.codigo || p.nombre).join(', ')}</div>}
          {laminaActual?.espesor != null && <p className="chip">MDF {laminaActual.espesor} mm</p>}
          <div className="corte-metrics"><Metrica label="Laminas" value={resultado?.cantidadLaminas ?? '-'} />
            <Metrica label="Aprovechamiento" value={resultado ? `${(100 - resultado.desperdicioPct).toFixed(1)}%` : '-'} />
            <Metrica label={resultado?.costoIncompleto ? 'Costo parcial (faltan precios)' : 'Costo de laminas'} value={resultado ? formatCOP(resultado.costoTotal) : '-'} />
            <Metrica label="Mayor retazo" value={resultado?.retazoMayor?.ancho ? `${fmtCm(resultado.retazoMayor.ancho)} x ${fmtCm(resultado.retazoMayor.largo)} cm` : '-'} /></div>
        </section>
      </div>
      <section className="corte-despiece">
        <AsistentePlanos proyecto={proyecto} bloqueado={ocupado || cargandoProducto || modo !== 'despiece'} onPiezas={aplicarPiezasIA} onMontaje={aplicarMontajeIA} />
        <div className="corte-section-head"><div className="corte-tabs" role="tablist" aria-label="Despiece">
          <button role="tab" aria-selected={modo === 'despiece'} onClick={() => cambiarModo('despiece')}>Piezas ({proyecto.piezas.length})</button>
          <button role="tab" aria-selected={modo === 'generador'} onClick={() => cambiarModo('generador')}><Ruler size={16} />Generar por medidas</button>
        </div><div className="corte-actions">
          <button className="corte-button" onClick={() => cambiarProyecto((p) => ({ ...p, diseno: null, piezas: [...p.piezas, piezaNueva(p.piezas)] }))} disabled={modo !== 'despiece'}><Plus size={16} />Agregar pieza</button>
          {proyecto.productoId && puede('cortes-planos', 'editar') && <button className="corte-button" onClick={guardarDespiece} disabled={!proyecto.piezas.length || modo !== 'despiece'}><Save size={16} />Guardar en producto</button>}
        </div></div>
        {modo === 'generador' ? <GeneradorDespiece key={generadorKey} espesorInicial={proyecto.lamina.espesor} disenoInicial={proyecto.diseno} onModificar={() => { setCalculo(null); setGeneradorSucio(true) }} onGenerar={aplicarGenerado} /> : <>
          <div className="table-wrap"><table className="table corte-pieces"><thead><tr><th>Codigo</th><th>Pieza / MDF</th><th>Ancho (cm)</th><th>Alto (cm)</th><th>Cantidad</th><th>Rotacion</th><th>Cantos</th><th></th></tr></thead>
            <tbody>{proyecto.piezas.map((p) => <tr key={p.codigo} className={seleccionado?.replace(/-\d+$/, '') === p.codigo ? 'selected' : ''}>
              <td><button className="corte-piece-code" style={{ borderLeftColor: colorPieza(p.codigo) }} onClick={() => {
                if (vistaPlano === 'mueble' || !resultado) { setSeleccionado(`${p.codigo}-1`); return }
                const index = resultado.laminas.findIndex((l) => l.piezas.some((pieza) => pieza.codigo === p.codigo))
                if (index >= 0) { setHoja(index); setSeleccionado(resultado.laminas[index].piezas.find((pieza) => pieza.codigo === p.codigo).id) }
              }}>{p.codigo}</button></td>
              <td><input aria-label={`Nombre ${p.codigo}`} value={p.nombre} maxLength={120} onChange={(e) => cambiarPieza(p.codigo, 'nombre', e.target.value)} />{p.espesor && <span className="muted small">MDF {p.espesor} mm</span>}</td>
              <td><input aria-label={`Ancho ${p.codigo}`} type="number" min="0.1" step="0.1" value={mmACm(p.ancho) || ''} onChange={(e) => cambiarPieza(p.codigo, 'ancho', cmAMm(e.target.value))} /></td>
              <td><input aria-label={`Alto ${p.codigo}`} type="number" min="0.1" step="0.1" value={mmACm(p.alto) || ''} onChange={(e) => cambiarPieza(p.codigo, 'alto', cmAMm(e.target.value))} /></td>
              <td><input aria-label={`Cantidad ${p.codigo}`} type="number" min="1" step="1" value={p.cantidad} onChange={(e) => cambiarPieza(p.codigo, 'cantidad', Number(e.target.value))} /></td>
              <td><label className="corte-check"><input type="checkbox" checked={!!p.permiteRotar} onChange={(e) => cambiarPieza(p.codigo, 'permiteRotar', e.target.checked)} aria-label={`Permitir giro ${p.codigo}`} />Libre</label></td>
              <td><div className="corte-edges">{['arriba', 'abajo', 'izq', 'der'].map((b) => <label key={b} title={`Canto ${b}`}><input type="checkbox" aria-label={`Canto ${b} ${p.codigo}`}
                checked={(p.canto || '').split(',').includes(b)} onChange={(e) => { const bordes = new Set((p.canto || '').split(',').filter(Boolean)); e.target.checked ? bordes.add(b) : bordes.delete(b); cambiarPieza(p.codigo, 'canto', [...bordes].join(',')) }} />{({ arriba: 'S', abajo: 'I', izq: 'Iz', der: 'D' })[b]}</label>)}</div></td>
              <td><Herramienta icono={Copy} titulo={`Duplicar ${p.codigo}`} onClick={() => cambiarProyecto((prev) => ({ ...prev, diseno: null, piezas: [...prev.piezas, { ...p, codigo: codigoNuevo(prev.piezas) }] }))} />
                <Herramienta icono={Trash2} titulo={`Eliminar ${p.codigo}`} onClick={() => cambiarProyecto((prev) => ({ ...prev, diseno: null, montajeManual: (prev.montajeManual || []).filter((m) => m.codigo !== p.codigo), piezas: prev.piezas.filter((pieza) => pieza.codigo !== p.codigo) }))} /></td>
            </tr>)}</tbody></table></div>
          {!proyecto.piezas.length && <div className="corte-empty">Sin piezas</div>}
        </>}
      </section>
      {proyecto.diseno && modo === 'despiece' && <VistasTecnicas diseno={proyecto.diseno} />}
    </fieldset>
    <footer className="corte-export"><span>{proyecto.piezas.reduce((s, p) => s + Number(p.cantidad || 0), 0) * proyecto.unidades} piezas en el lote</span><div className="corte-actions">
      <button className="corte-button" disabled={!proyecto.piezas.length || ocupado} onClick={() => {
        try { entradaCorte(proyecto); exportarDespieceCSV({ productoNombre: nombre, piezas: proyecto.piezas.map((p) => ({ ...p, ancho: mmACm(p.ancho), alto: mmACm(p.alto), cantidad: p.cantidad * proyecto.unidades })) }) }
        catch (e) { setError(e.message) }
      }}><Download size={16} />CSV</button>
      <select aria-label="Formato PDF" value={formato} onChange={(e) => setFormato(e.target.value)}><option value="a4">A4 horizontal</option><option value="a3">A3 horizontal</option></select>
      <button className="corte-button primary" onClick={pdf} disabled={!resultado || ocupado || modo !== 'despiece' || !!resultado.sinCabida.length}><Download size={16} />PDF de taller</button>
    </div></footer>
    {listaAbierta && <Proyectos onCerrar={() => setListaAbierta(false)} onAbrir={abrir} empresa={empresa} ocupado={ocupado} puedeEliminar={puede('cortes-planos', 'eliminar')} />}
  </div>
}
const PIEZAS_VACIAS = []
function Numero({ label, value, onChange, step = 0.1, min = 0 }) {
  return <label>{label}<input type="number" min={min} step={step} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} /></label>
}
function Metrica({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div> }

function Proyectos({ onCerrar, onAbrir, empresa, ocupado, puedeEliminar }) {
  const { data: planos, cargando, error, recargar } = useLocalData('/planos-corte')
  const [busqueda, setBusqueda] = useState(''), [eliminando, setEliminando] = useState(false)
  const eliminar = async (p) => {
    if (!(await confirmar(`Eliminar "${p.nombre}", version ${p.revision}.`, { titulo: 'Eliminar version' }))) return
    setEliminando(true)
    try { await http(`/planos-corte/${p.id}`, { method: 'DELETE' }); await recargar() }
    catch (e) { notify.error(e.message) }
    finally { setEliminando(false) }
  }
  return <Modal opened onClose={() => { if (!ocupado && !eliminando) onCerrar() }} title="Proyectos guardados" size="xl" centered
    classNames={{ content: 'corte-dialog' }} closeButtonProps={{ 'aria-label': 'Cerrar proyectos' }}>
    <input aria-label="Buscar proyecto" placeholder="Buscar proyecto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
    {error && <p role="alert">{error}</p>}{cargando && <p>Cargando proyectos...</p>}
    <div className="table-wrap"><table className="table"><thead><tr><th>Proyecto</th><th>Version</th><th>Fecha</th><th></th></tr></thead><tbody>
      {planos.filter((p) => (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase())).map((p) => <tr key={p.id}>
        <td>{p.nombre}<div className="muted small">#{p.raizId}{!p.editable && ' / Plano antiguo'}</div></td><td>{p.revision}</td><td>{formatFecha(p.creado)}</td><td><div className="corte-actions">
          {p.editable ? <button className="corte-button" disabled={ocupado || eliminando} onClick={() => onAbrir(p.id)}><FolderOpen size={16} />Abrir</button> :
            <button className="corte-button" onClick={async () => { try { const datos = await http(`/planos-corte/${p.id}`); generarPdfTaller({ empresa, nombre: p.nombre, resultado: datos.resultado, revision: p.revision, creado: p.creado }) } catch (e) { notify.error(e.message) } }}><Download size={16} />PDF</button>}
          {puedeEliminar && <Herramienta icono={Trash2} titulo={`Eliminar version ${p.id}`} disabled={ocupado || eliminando} onClick={() => eliminar(p)} />}
        </div></td></tr>)}
    </tbody></table></div>{!cargando && !planos.length && <p className="corte-empty">Sin proyectos guardados</p>}
  </Modal>
}
