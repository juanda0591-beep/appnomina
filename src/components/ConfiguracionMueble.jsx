import { tableroConfig, cajonConfig, construirMueble } from '../utils/construccionMueble.js'
import { fmtCm } from '../utils/unidades.js'

export function NumeroConstruccion({ label, value, onChange, min = 0, max, step = .1, placeholder }) {
  return <label>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={value ?? ''} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} /></label>
}

export function ConfiguracionCarcasa({ f, set }) {
  return <section className="construccion-carcasa">
    <p className="muted small">Ancho, alto y fondo definen la carcasa. Los sobresalientes se suman a esas medidas. Todas las piezas usan el espesor del proyecto.</p>
    <div className="construccion-tapas">{['techo', 'piso'].map((key) => {
      const t = { ...tableroConfig(), ...f[key] }, nombre = key === 'techo' ? 'Techo' : 'Piso'
      const cambiar = (campo, valor) => set(key, { ...t, [campo]: valor })
      return <fieldset key={key}><legend>{nombre}</legend>
        <label>Montaje<select aria-label={`Montaje ${key}`} value={t.montaje} onChange={(e) => set(key, { ...t, montaje: e.target.value,
          ...(e.target.value === 'entre' ? { izquierda: 0, derecha: 0 } : {}) })}>
          <option value="entre">Entre los laterales</option><option value="cubre">Cubre los laterales</option></select></label>
        <div className="construccion-grid">{[['izquierda', 'Izquierda'], ['derecha', 'Derecha'], ['frente', 'Frente'], ['atras', 'Atrás']].map(([campo, label]) =>
          <label key={campo}>{label} (mm)<input aria-label={`Sobresaliente ${key} ${campo}`} type="number" min="0" max="500" step="1"
            value={t[campo]} disabled={t.montaje === 'entre' && ['izquierda', 'derecha'].includes(campo)} onChange={(e) => cambiar(campo, e.target.value === '' ? '' : Number(e.target.value))} /></label>)}</div>
      </fieldset>
    })}</div>
  </section>
}

export function ModuloConfigurable({ f, m, idx, api, puedeQuitar }) {
  const { editarMod, quitarModulo, agregarEntrepano, quitarEntrepano, setAlturaEntrepano, altoInterior } = api
  const titulo = `Módulo ${idx + 1}`, c = { ...cajonConfig(), ...m.configuracionCajon }
  const set = (campo, valor) => editarMod(idx, campo, valor)
  const cajon = (campo, valor) => set('configuracionCajon', { ...c, [campo]: valor })
  const resultado = construirMueble(f), resumen = resultado.modulos?.[idx]
  const numero = (label, key, opciones = {}) => <NumeroConstruccion label={`${titulo} · ${label}`} value={m[key]} onChange={(v) => set(key, v)} {...opciones} />
  const numeroCaja = (label, key, opciones = {}) => <NumeroConstruccion label={`${titulo} · ${label}`} value={c[key]} onChange={(v) => cajon(key, v)} {...opciones} />
  return <fieldset className="modulo-card modulo-configurable"><legend>{titulo}</legend>
    <div className="construccion-module-head"><span>{resumen ? `Ancho útil: ${fmtCm(resumen.ancho)} cm` : 'Completa la configuración'}</span>
      {puedeQuitar && <button type="button" className="btn-danger btn-sm" aria-label={`Eliminar ${titulo}`} onClick={() => quitarModulo(idx)}>Quitar</button>}</div>
    {numero('Ancho útil (cm)', 'anchoModulo', { placeholder: 'Automático', min: .1 })}
    <div className="construccion-grid"><label>Puertas<select aria-label={`${titulo} · Puertas`} value={m.puerta} onChange={(e) => set('puerta', e.target.value)}>
      <option value="ninguna">Sin puerta</option><option value="una">Una hoja por hueco</option><option value="dos">Dos hojas por hueco</option></select></label>
      <label>Montaje de frentes<select aria-label={`${titulo} · Montaje de frentes`} value={m.frenteMontaje || 'embutido'} onChange={(e) => set('frenteMontaje', e.target.value)}>
        <option value="embutido">Embutidos</option><option value="sobrepuesto">Sobrepuestos (medio espesor)</option></select></label></div>
    <details open><summary>Cajonera</summary><div className="construccion-grid">
      {numero('Cantidad de cajones', 'cajones', { step: 1, max: 100 })}
      {numero('Alto de zona (cm)', 'zonaCajones', { max: altoInterior })}
    </div>
    {Number(m.cajones) > 0 && <>
      <div className="construccion-grid">{numeroCaja('Altura inicial (cm)', 'inicio', { max: altoInterior })}
        {numero('Ancho cajonera (cm)', 'anchoCajon', { placeholder: '0 = todo el módulo' })}</div>
      <label>Posición lateral<select aria-label={`${titulo} · Posición lateral`} value={m.ladoCajon} onChange={(e) => set('ladoCajon', e.target.value)}>
        <option value="izq">Izquierda</option><option value="der">Derecha</option></select></label>
      <p className="muted small">Altura desde el piso interior. Ancho 0 ocupa todo el módulo. Con ancho parcial, los entrepaños y puertas van al costado; a todo el ancho, las puertas cubren los huecos arriba y abajo.</p>
      <label>Tipo de guía<select aria-label={`${titulo} · Tipo de riel`} value={c.riel} onChange={(e) => set('configuracionCajon', {
        ...c, riel: e.target.value, holguraLateral: e.target.value === 'sin' ? 2 : '', largoRiel: '' })}>
        <option value="sin">Sin riel</option><option value="lateral">Riel lateral</option><option value="oculto">Riel oculto</option><option value="personalizado">Otro / personalizado</option></select></label>
      <div className="construccion-grid">{numeroCaja('Holgura por lado (mm)', 'holguraLateral', { max: 100, placeholder: 'Según fabricante' })}
        {c.riel !== 'sin' && numeroCaja('Largo del riel (mm)', 'largoRiel', { min: 1, step: 1, placeholder: 'Según fabricante' })}</div>
      {c.riel !== 'sin' && <><label>Referencia del riel<input aria-label={`${titulo} · Referencia del riel`} value={c.referencia} maxLength={120} placeholder="Marca / modelo"
        onChange={(e) => cajon('referencia', e.target.value)} /></label><p className="construccion-advertencia">Ingresa las holguras de tu herraje. El tipo de riel no aplica un descuento universal ni genera perforaciones.</p></>}
      <details><summary>Medidas de caja y fondo</summary>
        <div className="construccion-grid">{numeroCaja('Profundidad caja (cm)', 'profundidad', { placeholder: 'Automática', min: .1 })}
          {numeroCaja('Retiro detrás del frente (mm)', 'retiroFrontal')}
          {numeroCaja('Holgura trasera (mm)', 'holguraTrasera')}
          {numeroCaja('Holgura vertical por cajón (mm)', 'holguraVertical')}</div>
        <label>Fondo del cajón<select aria-label={`${titulo} · Fondo del cajón`} value={c.fondoMontaje} onChange={(e) => cajon('fondoMontaje', e.target.value)}>
          <option value="entre">Entre costados y frente/trasera</option><option value="debajo">Debajo de la caja</option></select></label>
        <p className="muted small">Caja con dos costados, contrafrente, trasera y fondo; frente decorativo independiente. La profundidad automática usa el largo del riel o el espacio disponible cuando no hay riel.</p>
      </details>
      {resumen?.caja && <div className="construccion-resumen" aria-label={`${titulo} · Medidas de caja`}>
        <strong>Caja exterior: {fmtCm(resumen.caja.ancho)} × {fmtCm(resumen.caja.alto)} × {fmtCm(resumen.caja.profundidad)} cm</strong>
        <span>Ancho del hueco − 2 × {resumen.caja.holgura} mm de holgura lateral</span></div>}
    </>}
    </details>
    <details open><summary>Entrepaños ({m.alturas.length})</summary>
      <button type="button" className="btn-secondary btn-sm" onClick={() => agregarEntrepano(idx)}>+ Entrepaño</button>
      {m.alturas.map((alt, k) => <div className="construccion-shelf" key={k}>
        <NumeroConstruccion label={`${titulo} · Entrepaño ${k + 1} (cm)`} value={alt} max={altoInterior - Number(f.espesor) / 10} onChange={(v) => setAlturaEntrepano(idx, k, v)} />
        <button type="button" className="btn-danger btn-sm" aria-label={`Quitar entrepaño ${k + 1} del ${titulo}`} onClick={() => quitarEntrepano(idx, k)}>✕</button>
      </div>)}<p className="muted small">Alturas desde la cara superior del piso interior.</p>
    </details>
  </fieldset>
}
