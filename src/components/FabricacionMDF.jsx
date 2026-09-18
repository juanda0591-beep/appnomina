import { activarMDF } from '../utils/fabricacionMDF.js'
import { configurarDiseno } from '../utils/construccionMueble.js'
import { nuevoModulo } from '../utils/despiece.js'
import { confirmar } from '../utils/notify.js'
import { NumeroConstruccion } from './ConfiguracionMueble.jsx'

export function plantillaFabrica(tipo) {
  const f = activarMDF(configurarDiseno({ ancho: 120, alto: tipo === 'tocador' ? 80 : 180, fondo: tipo === 'tocador' ? 40 : 50,
    espesor: 9, gap: 3, holguraFondo: 10, armado: 'laterales-completos', tipoFondo: tipo === 'tocador' ? 'sin-fondo' : 'superpuesto',
    modulos: Array.from({ length: 3 }, () => nuevoModulo()) }))
  f.techo = { montaje: 'cubre', izquierda: 15, derecha: 15, frente: 25, atras: 0 }
  if (tipo === 'armario') {
    f.modulos[1] = { ...f.modulos[1], puerta: 'dos', cajones: 3, zonaCajones: 50 }
    f.modulos[0].alturas = [135]; f.modulos[2].alturas = [135]
  } else {
    f.modulos.forEach((m, i) => { m.puerta = 'ninguna'; m.cajones = i === 1 ? 1 : 4; m.zonaCajones = i === 1 ? 16 : 70; m.configuracionCajon.inicio = i === 1 ? 60 : 4 })
    f.fabricacion.ajustes['Piso|global|0'] = { ancho: 388 }
    f.fabricacion.complementos = [
      { id: 'piso-der', tipo: 'repisa', nombre: 'Piso derecho', ancho: 388, alto: 400, espesor: 9, x: 803, y: 0, z: 0 },
      ...[0, 1191].map((x, i) => ({ id: `lateral-alto-${i}`, tipo: 'panel', plano: 'lateral', nombre: `Lateral superior ${i + 1}`, ancho: 180, alto: 850, espesor: 9, x, y: 800, z: 180 })),
      { id: 'division-alta', tipo: 'panel', plano: 'lateral', nombre: 'División superior', ancho: 180, alto: 850, espesor: 9, x: 340, y: 800, z: 180 },
      { id: 'tapa-alta', tipo: 'repisa', nombre: 'Techo tocador', ancho: 1230, alto: 220, espesor: 9, x: -15, y: 1650, z: 160 },
      ...[950, 1190, 1430].flatMap((y, i) => [
        { id: `repisa-izq-${i}`, tipo: 'repisa', nombre: `Repisa lateral ${i + 1}`, ancho: 331, alto: 180, espesor: 9, x: 9, y, z: 180 },
        { id: `repisa-espejo-${i}`, tipo: 'repisa', nombre: `Repisa detrás de espejo ${i + 1}`, ancho: 842, alto: 180, espesor: 9, x: 349, y, z: 180 },
      ]),
      { id: 'marco-espejo', tipo: 'espejo', nombre: 'Espejo tocador', ancho: 860, alto: 840, espesor: 9, marco: 65,
        espesorEspejo: 3, x: 340, y: 805, z: 374, apertura: 'der', recorrido: 750 },
    ]
  }
  return f
}

export default function FabricacionMDF({ f, cambiar }) {
  const fab = f.fabricacion
  const setFab = (key, value) => cambiar({ ...f, fabricacion: { ...fab, [key]: value } })
  const agregar = (tipo) => {
    const id = `extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const extra = { id, tipo, nombre: tipo === 'espejo' ? 'Marco con espejo' : 'Repisa', ancho: 600, alto: tipo === 'espejo' ? 800 : 250,
      espesor: 9, x: 0, y: Number(f.alto) * 10, z: 0,
      ...(tipo === 'espejo' ? { marco: 60, espesorEspejo: 3, apertura: 'der', recorrido: 500 } : {}) }
    setFab('complementos', [...fab.complementos, extra])
  }
  const editarExtra = (id, key, value) => setFab('complementos', fab.complementos.map((e) => e.id === id ? { ...e, [key]: value } : e))
  return <section className="fabricacion-mdf">
    <div className="corte-section-head"><h3>Fabricación y complementos</h3><div className="corte-actions">
      {!fab && <button type="button" className="corte-button primary" onClick={async () => {
        if (await confirmar('Cambiará la carcasa a MDF de 9 mm y los fondos a 3 mm. Revisa el despiece antes de fabricar.', { titulo: 'Perfil de fábrica', textoOk: 'Aplicar', peligro: false })) cambiar(activarMDF(f))
      }}>Usar MDF 9 mm / fondos 3 mm</button>}
      {['armario', 'tocador'].map((tipo) => <button type="button" className="corte-button" key={tipo} onClick={async () => {
        if (await confirmar('Se reemplazará el diseño actual por una base editable. Las dimensiones son de ejemplo, no medidas obtenidas de las fotos.', { titulo: `Base de ${tipo}`, textoOk: 'Cargar base', peligro: false })) cambiar(plantillaFabrica(tipo))
      }}>Base de {tipo}</button>)}
    </div></div>
    {fab && <>
      <p className="muted small">Selecciona un tablero en 3D para editar su medida, posición y fabricación. El MDF de 9 mm, los fondos de 3 mm y el vidrio se desglosan por separado.</p>
      <div className="construccion-grid"><NumeroConstruccion label="Espesor trasera (mm)" value={fab.fondo} onChange={(v) => setFab('fondo', v)} min={1} />
        <NumeroConstruccion label="Espesor fondo cajón (mm)" value={fab.fondoCajon} onChange={(v) => setFab('fondoCajon', v)} min={1} /></div>
      <div className="corte-actions"><button type="button" className="corte-button" onClick={() => agregar('repisa')}>Agregar repisa</button><button type="button" className="corte-button" onClick={() => agregar('espejo')}>Agregar marco con espejo</button></div>
      <div className="complementos-grid">{fab.complementos.map((e) => <details key={e.id}><summary>{e.nombre}</summary>
        <label>Nombre<input value={e.nombre} aria-label={`${e.id} · Nombre`} onChange={(ev) => editarExtra(e.id, 'nombre', ev.target.value)} maxLength={80} /></label>
        <div className="construccion-grid">{[['ancho', 'Ancho'], ['alto', e.tipo === 'repisa' ? 'Profundidad' : 'Alto'], ['espesor', 'Espesor MDF'], ['x', 'X'], ['y', 'Y'], ['z', 'Z'], ...(e.tipo === 'espejo' ? [['marco', 'Ancho marco'], ['espesorEspejo', 'Espesor vidrio'], ['recorrido', 'Recorrido']] : [])].map(([key, label]) =>
          <NumeroConstruccion key={key} label={`${e.nombre} · ${label} (mm)`} value={e[key]} min={['x', 'y', 'z'].includes(key) ? -5000 : 0} onChange={(v) => editarExtra(e.id, key, v)} />)}</div>
        {e.tipo === 'espejo' && <label>Desplazamiento<select aria-label={`${e.nombre} · Desplazamiento`} value={e.apertura} onChange={(ev) => editarExtra(e.id, 'apertura', ev.target.value)}><option value="der">Hacia la derecha</option><option value="izq">Hacia la izquierda</option><option value="fijo">Fijo</option></select></label>}
        <button type="button" className="btn-danger btn-sm" onClick={() => setFab('complementos', fab.complementos.filter((c) => c.id !== e.id))}>Quitar complemento</button>
      </details>)}</div>
    </>}
  </section>
}
