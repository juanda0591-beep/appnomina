import { useEffect, useState } from 'react'
import { confirmar } from '../utils/notify.js'

async function api(path, method = 'GET', body) {
  const r = await fetch(`/api/whatsapp${path}`, { method, headers: {
    Authorization: `Bearer ${sessionStorage.getItem('nomina_token') || ''}`, 'Content-Type': 'application/json',
  }, body: body === undefined ? undefined : JSON.stringify(body) })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'No se pudo consultar WhatsApp.')
  return d
}
export default function WhatsAppPanel({ wa, texto, setTexto, vista, setVista, ejecutar, ocupado }) {
  const [seleccion, setSeleccion] = useState([]), [lista, setLista] = useState({ mensajes: [], total: 0 })
  const [pagina, setPagina] = useState(1), [error, setError] = useState('')
  const [automaticos, setAutomaticos] = useState(!!wa?.config.automaticos)
  const [pausado, setPausado] = useState(wa?.config.pausado !== 0), [intervalo, setIntervalo] = useState(wa?.config.intervalo || 15)
  useEffect(() => {
    setAutomaticos(!!wa?.config.automaticos); setPausado(wa?.config.pausado !== 0); setIntervalo(wa?.config.intervalo || 15)
  }, [wa?.config.automaticos, wa?.config.pausado, wa?.config.intervalo])
  useEffect(() => {
    let vivo = true
    const cargar = () => api(`/mensajes?pagina=${pagina}`).then((d) => { if (vivo) { setLista(d); setError('') } }).catch((e) => { if (vivo) setError(e.message) })
    cargar(); const timer = setInterval(cargar, 5000)
    return () => { vivo = false; clearInterval(timer) }
  }, [pagina])
  const refrescar = async () => setLista(await api(`/mensajes?pagina=${pagina}`))
  const accion = (a) => ejecutar(() => api('/conexion', 'POST', { accion: a }), 'Solicitud registrada. Espera a que se actualice el estado.')
  const estado = wa?.estado || 'apagado'
  const invalidar = () => setVista(null)
  const preparar = () => ejecutar(async () => { setVista(await api('/campanas/preparar', 'POST', { texto, cuentas: seleccion })) }, 'Vista previa preparada')
  const enviarOferta = () => ejecutar(async () => {
    await api(`/campanas/${vista.id}/confirmar`, 'POST', { confirmado: true })
    setVista(null); setTexto(''); setSeleccion([]); await refrescar()
  }, 'Oferta encolada. Se enviará cuando la conexión esté activa y la cola sin pausa.')
  const reintentar = async (m) => {
    if (!await confirmar(`Mensaje a ${m.telefono}:\n${m.texto}\n\nComprueba la conversación de WhatsApp. ¿Confirmas que no se envió y deseas reintentarlo? Podría duplicarse si ya fue recibido.`)) return
    ejecutar(async () => { await api(`/mensajes/${m.id}`, 'POST', { accion: 'reintentar', confirmado: true }); await refrescar() }, 'Mensaje encolado para reintento')
  }
  return <section className="wa-panel">
    <div className="wa-encabezado"><div><h3>WhatsApp de tu negocio</h3><p className="muted">Conecta tu número, administra las notificaciones y prepara ofertas para tus clientes.</p></div><span className={`pm-estado ${estado === 'conectado' ? 'aprobado' : 'pendiente'}`}>{estado}</span></div>
    {!wa?.activo && <p className="banner">El servicio de WhatsApp no está iniciado. La instalación y el arranque del servicio están pendientes en el servidor.</p>}
    {wa?.numero && <p>Número vinculado: +{wa.numero}</p>}{wa?.error && <p role="alert" className="banner error">{wa.error}</p>}{error && <p role="alert" className="banner error">{error}</p>}
    {wa?.qr && <div className="wa-qr"><img src={wa.qr} alt="Código QR para vincular WhatsApp"/><p>En el teléfono de tu negocio, abre WhatsApp → Dispositivos vinculados → Vincular dispositivo. Escanea este código.</p></div>}
    <div className="actions"><button className="btn-primary" disabled={ocupado || !wa?.activo} onClick={() => accion('conectar')}>Conectar WhatsApp</button><button className="btn-secondary" disabled={ocupado} onClick={() => accion('desconectar')}>Desconectar</button><button className="btn-secondary" disabled={ocupado} onClick={async () => {
      if (await confirmar('¿Desvincular el número y borrar la sesión local? Será necesario escanear un QR de nuevo. Si no hay conexión, elimina también el dispositivo desde tu teléfono.')) accion('desvincular')
    }}>Desvincular número</button></div>
    <form className="wa-config" onSubmit={(e) => { e.preventDefault(); ejecutar(() => api('/config', 'PUT', { automaticos, pausado, intervalo: Number(intervalo) }), 'Configuración guardada') }}>
      <label className="pm-check"><input type="checkbox" checked={automaticos} onChange={(e) => setAutomaticos(e.target.checked)}/>Preparar notificaciones para nuevos pedidos y actualizaciones</label>
      <label className="pm-check"><input type="checkbox" checked={pausado} onChange={(e) => setPausado(e.target.checked)}/>Pausar todos los envíos</label>
      <label>Intervalo entre mensajes (segundos)<input type="number" required min="10" max="300" value={intervalo} onChange={(e) => setIntervalo(e.target.value)}/></label>
      <small className="muted">Las notificaciones requieren autorización del cliente. Desactivar su preparación no borra la cola; usa la pausa para detener los envíos pendientes.</small><button className="btn-secondary" disabled={ocupado}>Guardar configuración</button>
    </form>
    <hr/><h3>Preparar una oferta</h3><p className="muted">Selecciona clientes que autorizaron ofertas. Se comprueba de nuevo su autorización antes del envío.</p>
    <label>Texto de la oferta<textarea maxLength={1500} value={texto} onChange={(e) => { setTexto(e.target.value); invalidar() }}/></label>
    <div className="wa-destinatarios">{(wa?.destinatarios || []).map((d) => <label className="pm-check" key={d.id}><input type="checkbox" checked={seleccion.includes(d.id)} onChange={(e) => { setSeleccion(e.target.checked ? [...seleccion, d.id] : seleccion.filter((id) => id !== d.id)); invalidar() }}/>{d.negocio} · +{d.telefono}</label>)}</div>
    {!wa?.destinatarios?.length && <p className="muted">No hay clientes habilitados con autorización de ofertas y teléfono válido.</p>}
    <button className="btn-primary" disabled={ocupado || texto.trim().length < 10 || !seleccion.length} onClick={preparar}>Preparar vista previa</button>
    {vista && <div className="wa-preview"><h4>Mensaje que recibirán tus clientes</h4><pre>{vista.texto}</pre><p>{vista.destinatarios.length} destinatarios:</p><ul>{vista.destinatarios.map((d) => <li key={d.id}>{d.negocio} · +{d.telefono}</li>)}</ul><div className="actions"><button className="btn-secondary" disabled={ocupado} onClick={invalidar}>Descartar vista previa</button><button className="btn-primary" disabled={ocupado} onClick={enviarOferta}>Confirmar y encolar oferta</button></div></div>}
    <hr/><h3>Mensajes recientes</h3><p className="muted">«Enviado» significa aceptado por la conexión de WhatsApp, no leído ni entregado al cliente. «Revisar» requiere comprobar la conversación antes de reenviar.</p>
    <div className="wa-tabla">{lista.mensajes.map((m) => <div key={m.id}><span className={`pm-estado ${m.estado === 'enviado' ? 'aprobado' : 'pendiente'}`}>{m.estado}</span><span>{m.tipo} · {m.negocio || 'Cliente'}<br/>+{m.telefono || 'Sin teléfono válido'}</span><details><summary>Ver mensaje</summary><p style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</p><small>{m.error}</small></details><div className="actions">{['fallido','revisar'].includes(m.estado) && <button className="btn-secondary" disabled={ocupado} onClick={() => reintentar(m)}>Revisar y reintentar</button>}{['pendiente','preparando','fallido','revisar'].includes(m.estado) && <button className="btn-secondary" disabled={ocupado} onClick={() => ejecutar(async () => { await api(`/mensajes/${m.id}`, 'POST', { accion: 'cancelar' }); await refrescar() }, 'Mensaje cancelado')}>Cancelar mensaje</button>}</div></div>)}</div>
    {!lista.mensajes.length && <p className="muted">Todavía no hay mensajes.</p>}<div className="actions" style={{ marginTop: 16 }}><button className="btn-secondary" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button><span>Página {pagina} · {lista.total} mensajes</span><button className="btn-secondary" disabled={pagina * 30 >= lista.total} onClick={() => setPagina(pagina + 1)}>Siguiente</button><button className="btn-secondary" disabled={ocupado} onClick={() => ejecutar(refrescar)}>Actualizar mensajes</button></div>
  </section>
}
