import { CATALOGO_HERRAJES, configuracionHerrajes } from '../utils/herrajesMueble.js'
import { NumeroConstruccion } from './ConfiguracionMueble.jsx'

export function IconoHerraje({ tipo }) {
  return <svg viewBox="0 0 76 48" aria-hidden="true" width="76" height="48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {tipo === 'barra' ? <><path d="M13 33V17h50v16"/><path d="M10 34h9m38 0h9" strokeWidth="2"/></>
      : tipo === 'pomo' ? <><circle cx="38" cy="22" r="13"/><path d="M33 35v5h10v-5"/></>
        : tipo === 'bisagra' ? <><circle cx="24" cy="24" r="13"/><path d="M34 18h16v12H34m16-18h15v24H50"/><circle cx="58" cy="18" r="1"/><circle cx="58" cy="30" r="1"/></>
          : <><path d="M12 22h52v8H12zM10 16v19m56-19v19"/>{tipo === 'ovalado' && <ellipse cx="38" cy="26" rx="7" ry="13" strokeWidth="1.5"/>}</>}
  </svg>
}

export default function HerrajesModulo({ f, m, idx, onChange }) {
  const h = configuracionHerrajes(m), titulo = `Módulo ${idx + 1}`
  const cambiar = (key, campos) => onChange({ ...h, [key]: { ...h[key], ...campos } })
  const numero = (grupo, label, key, min, max) => <NumeroConstruccion label={`${titulo} · ${label}`} value={h[grupo][key]} min={min} max={max}
    onChange={(valor) => cambiar(grupo, { [key]: valor })}/>
  const referencia = (grupo, label) => <label>{label}<input maxLength={120} aria-label={`${titulo} · ${label}`} value={h[grupo].referencia}
    placeholder="Marca o referencia de tu proveedor" onChange={(e) => cambiar(grupo, { referencia: e.target.value })}/></label>
  const agregarTubo = (tipo = 'redondo') => {
    if (h.tubos.length >= 4) return
    onChange({ ...h, tubos: [...h.tubos, { id: crypto.randomUUID(), tipo, altura: Math.max(5, Number(f.alto) - Number(f.espesor) / 5 - 20),
      fondo: Number(f.fondo) / 2, diametro: tipo === 'ovalado' ? 16 : 25, alto: 30, descuento: 10, referencia: '' }] })
  }
  const editarTubo = (id, key, valor) => onChange({ ...h, tubos: h.tubos.map((t) => t.id === id ? { ...t, [key]: valor } : t) })
  return <details className="modulo-herrajes">
    <summary>Biblioteca de herrajes</summary>
    <p className="muted small">Modelos genéricos editables. Indica la referencia que compras y confirma sus medidas antes de perforar.</p>
    <div className="herrajes-catalogo">{CATALOGO_HERRAJES.map((item) => <button type="button" key={item.id} className="herraje-opcion"
      aria-label={`${titulo} · Añadir ${item.nombre}`} disabled={item.familia === 'tubo' && h.tubos.length >= 4}
      onClick={() => item.familia === 'manija' ? cambiar('manija', { tipo: item.id }) : item.familia === 'bisagra' ? cambiar('bisagras', { activo: true }) : agregarTubo(item.id === 'ovalado' ? 'ovalado' : 'redondo')}>
      <IconoHerraje tipo={item.id}/><strong>{item.nombre}</strong><small>{item.detalle}</small>
    </button>)}</div>
    <fieldset className="herraje-config"><legend>Manijas</legend>
      <label>Modelo<select aria-label={`${titulo} · Modelo de manija`} value={h.manija.tipo} onChange={(e) => cambiar('manija', { tipo: e.target.value })}>
        <option value="sin">Sin manijas</option><option value="barra">Barra</option><option value="pomo">Pomo</option></select></label>
      {h.manija.tipo !== 'sin' && <>
        <div className="construccion-grid">{h.manija.tipo === 'barra' && numero('manija', 'Largo manija (mm)', 'largo', 32, 600)}
          {numero('manija', 'Diámetro manija (mm)', 'diametro', 4, 60)}{numero('manija', 'Salida manija (mm)', 'salida', 5, 80)}
          {numero('manija', 'Retiro manija desde borde (mm)', 'retiro', 10, 200)}</div>
        <label>Acabado<select aria-label={`${titulo} · Acabado de manija`} value={h.manija.acabado} onChange={(e) => cambiar('manija', { acabado: e.target.value })}>
          <option value="acero">Acero</option><option value="negro">Negro</option><option value="dorado">Dorado</option></select></label>
        {referencia('manija', 'Referencia de manija')}
        <p className="muted small">Puertas: manija vertical junto al borde de apertura. Gavetas: horizontal y centrada.</p>
      </>}
    </fieldset>
    <fieldset className="herraje-config"><legend>Bisagras</legend>
      <label className="corte-check"><input type="checkbox" checked={h.bisagras.activo} onChange={(e) => cambiar('bisagras', { activo: e.target.checked })}/>Mostrar bisagras en las puertas</label>
      {h.bisagras.activo && <><div className="construccion-grid">{numero('bisagras', 'Bisagras por hoja', 'cantidad', 2, 6)}
        {numero('bisagras', 'Diámetro cazoleta (mm)', 'diametro', 20, 60)}{numero('bisagras', 'Retiro bisagras arriba y abajo (mm)', 'retiro', 30, 300)}</div>
        {referencia('bisagras', 'Referencia de bisagra')}
        <p className="muted small">La cantidad depende del peso y altura de la puerta y de la ficha del fabricante. La vista no genera perforaciones.</p>
      </>}
    </fieldset>
    {h.tubos.map((t, i) => <fieldset key={t.id} className="herraje-config"><legend>Tubo para ropa {i + 1}</legend>
      <label>Sección<select value={t.tipo} aria-label={`${titulo} · Sección tubo ${i + 1}`} onChange={(e) => editarTubo(t.id, 'tipo', e.target.value)}><option value="redondo">Redondo</option><option value="ovalado">Ovalado</option></select></label>
      <div className="construccion-grid">{[['altura', 'Altura tubo desde piso interior (cm)', 1, 1000], ['fondo', 'Posición tubo desde atrás (cm)', 1, 1000], ['diametro', t.tipo === 'ovalado' ? 'Ancho sección oval (mm)' : 'Diámetro tubo (mm)', 10, 60], ...(t.tipo === 'ovalado' ? [['alto', 'Alto sección oval (mm)', 10, 90]] : []), ['descuento', 'Descuento total soportes (mm)', 0, 60]].map(([key, label, min, max]) =>
        <NumeroConstruccion key={key} label={`${titulo} · ${label} · ${i + 1}`} value={t[key]} min={min} max={max} onChange={(v) => editarTubo(t.id, key, v)}/>)}</div>
      <label>Referencia de tubo<input aria-label={`${titulo} · Referencia tubo ${i + 1}`} value={t.referencia} maxLength={120} onChange={(e) => editarTubo(t.id, 'referencia', e.target.value)}/></label>
      <p className="muted small">Largo = ancho útil del módulo − descuento total. Incluye dos soportes en la lista.</p>
      <button type="button" className="btn-danger btn-sm" aria-label={`${titulo} · Quitar tubo ${i + 1}`} onClick={() => onChange({ ...h, tubos: h.tubos.filter((tubo) => tubo.id !== t.id) })}>Quitar tubo</button>
    </fieldset>)}
  </details>
}
