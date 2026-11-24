import { useEffect, useState } from 'react'
import { confirmar, notify } from '../utils/notify.js'
import { formatCOP } from '../utils/format.js'
import './PortalMayorista.css'
import WhatsAppPanel from './WhatsAppPanel.jsx'
import AsistenteCopyProducto from '../components/AsistenteCopyProducto.jsx'

async function api(path, method = 'GET', body) {
  const res = await fetch(`/api${path}`, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('nomina_token') || ''}` },
    body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación.')
  return data
}
const fotoUrl = (p, foto) => `/api/portal-admin/productos/${p.id}/${foto?.id ? `imagenes/${foto.id}` : 'imagen'}?token=${encodeURIComponent(sessionStorage.getItem('nomina_token') || '')}&v=${encodeURIComponent(p.actualizado || '')}`

function VideoProducto({ producto: p, generando, onGenerar, onQuitar, onPendiente }) {
  const [texto, setTexto] = useState(''), [sugiriendo, setSugiriendo] = useState(false), [error, setError] = useState('')
  const sugerir = async () => {
    setSugiriendo(true); setError('')
    try {
      const descripcion = `Nombre: ${p.nombre}\nCategoría: ${p.categoria}\nMedidas: ${p.medidas || 'No registradas'}\nDetalles: ${(p.descripcion || '').slice(0, 1000)}`
      const resultado = await api('/ia/producto-copy', 'POST', { descripcion })
      setTexto(resultado.copy.slice(0, 160))
    } catch (e) { setError(e.message) }
    finally { setSugiriendo(false) }
  }
  const revisarEstado = async (e) => {
    if (!e.currentTarget.open) return
    try {
      const estado = await api(`/portal-admin/productos/${p.id}/video/estado`)
      if (estado.estado === 'procesando') onPendiente(p.id)
    } catch (e) { setError(e.message) }
  }
  return <details className="pm-video-herramienta" onToggle={revisarEstado}>
    <summary>Video del producto{p.tieneVideo ? ' · Listo' : ''}</summary>
    {(p.imagenes?.length || 0) < 2 && <p className="muted small">Guarda al menos dos fotografías de este producto para generar el video.</p>}
    <label>Frase del video (opcional)<input maxLength={160} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={p.descripcion?.slice(0, 100) || 'Usar el nombre del producto'} /></label>
    <div className="pm-producto-acciones"><button type="button" className="btn-secondary" disabled={sugiriendo || generando} onClick={sugerir}>{sugiriendo ? 'Preparando frase...' : 'Sugerir frase con IA'}</button>
      <button type="button" className="btn-secondary" disabled={generando || sugiriendo || (p.imagenes?.length || 0) < 2} onClick={() => onGenerar(p, texto)}>{generando ? 'Generando video...' : p.tieneVideo ? 'Regenerar video' : 'Generar video'}</button>
      {p.tieneVideo && <button type="button" className="btn-secondary" disabled={generando} onClick={() => onQuitar(p)}>Quitar video</button>}</div>
    {error && <p className="banner error" role="alert">{error}</p>}
    {p.tieneVideo && <><video className="pm-video" controls preload="metadata" poster={fotoUrl(p)} src={`/api/portal-admin/productos/${p.id}/video?token=${encodeURIComponent(sessionStorage.getItem('nomina_token') || '')}&v=${encodeURIComponent(p.videoActualizado || '')}`}/>
      <a className="btn-secondary pm-video-descargar" href={`/api/portal-admin/productos/${p.id}/video?download=1&token=${encodeURIComponent(sessionStorage.getItem('nomina_token') || '')}`} download={`producto-${p.id}.mp4`}>Descargar video MP4</a></>}
  </details>
}

export default function PortalMayorista() {
  const [tab, setTab] = useState('cuentas'), [cuentas, setCuentas] = useState([]), [clientes, setClientes] = useState([])
  const [wa, setWa] = useState(null), [waTexto, setWaTexto] = useState(''), [waVista, setWaVista] = useState(null)
  const [productos, setProductos] = useState([]), [config, setConfig] = useState({ titulo: '', subtitulo: '' })
  const [vinculos, setVinculos] = useState({}), [editor, setEditor] = useState(null), [recuperar, setRecuperar] = useState(null)
  const [copyProducto, setCopyProducto] = useState(null)
  const [busqueda, setBusqueda] = useState(''), [filtro, setFiltro] = useState('pendiente'), [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false), [cargando, setCargando] = useState(true)
  const [leyendoFotos, setLeyendoFotos] = useState(false)
  const [videoPendiente, setVideoPendiente] = useState(null)
  const cargar = async () => {
    const [c, cl, p, conf, whats] = await Promise.all([api('/portal-admin/cuentas'), api('/clientes'), api('/portal-admin/productos'), api('/portal-admin/config'), api('/whatsapp/estado')])
    setCuentas(c); setClientes(cl.filter((c) => c.tipo === 'cliente')); setProductos(p); setConfig(conf); setWa(whats)
  }
  useEffect(() => {
    if (tab !== 'whatsapp') return
    const timer = setInterval(() => api('/whatsapp/estado').then(setWa).catch(() => {}), 3000)
    return () => clearInterval(timer)
  }, [tab])
  useEffect(() => { cargar().catch((e) => setError(e.message)).finally(() => setCargando(false)) }, [])
  useEffect(() => {
    if (!videoPendiente) return
    const revisar = async () => {
      try {
        const resultado = await api(`/portal-admin/productos/${videoPendiente}/video/estado`)
        if (resultado.estado === 'procesando') return
        setVideoPendiente(null)
        if (resultado.estado === 'completado') { await cargar(); notify.ok('Video del producto listo') }
        else setError(resultado.mensaje || 'No se pudo generar el video.')
      } catch (e) { setVideoPendiente(null); setError(e.message) }
    }
    const timer = setInterval(revisar, 3000)
    return () => clearInterval(timer)
  }, [videoPendiente])
  const ejecutar = async (fn, mensaje) => {
    if (ocupado) return
    setOcupado(true); setError('')
    try { await fn(); await cargar(); if (mensaje) notify.ok(mensaje) }
    catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  const estado = async (c, nuevo) => {
    const vinculo = vinculos[c.id] ? Number(vinculos[c.id]) : null
    const mensaje = nuevo === 'aprobado'
      ? `¿Habilitar el acceso mayorista de ${c.negocio}? ${c.clienteId || vinculo ? 'Se vinculará al cliente seleccionado.' : 'Se creará su registro en Clientes.'}`
      : `¿${nuevo === 'suspendido' ? 'Suspender' : 'Rechazar'} la cuenta de ${c.negocio}? Se cerrarán sus sesiones.`
    if (!await confirmar(mensaje)) return
    ejecutar(() => api(`/portal-admin/cuentas/${c.id}`, 'PUT', { estado: nuevo, clienteId: c.clienteId || vinculo }), 'Cuenta actualizada')
  }
  const editar = (p) => { setError(''); setEditor({ ...p, precio: p.precioCatalogo ?? '', fotos: p.imagenes || [] }) }
  const generarVideo = async (p, texto) => {
    setError('')
    try {
      await api(`/portal-admin/productos/${p.id}/video`, 'POST', { texto })
      setVideoPendiente(p.id)
      notify.ok('Preparando video del producto')
    } catch (e) { setError(e.message) }
  }
  const eliminarVideo = async (p) => {
    if (!await confirmar(`¿Quitar el video de ${p.nombre} del catálogo?`, { titulo: 'Quitar video' })) return
    ejecutar(() => api(`/portal-admin/productos/${p.id}/video`, 'DELETE'), 'Video quitado')
  }
  const subir = async (e) => {
    const archivos = [...e.target.files]
    e.target.value = ''
    if (!archivos.length) return
    if (editor.fotos.length + archivos.length > 6) { setError('Puedes guardar hasta 6 fotografías por producto. Quita alguna antes de agregar más.'); return }
    if (archivos.some((f) => f.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) { setError('Selecciona imágenes JPG, PNG o WebP de máximo 2 MB cada una.'); return }
    setLeyendoFotos(true)
    try {
      const fotos = []
      for (const archivo of archivos) {
        const imagen = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(archivo) })
        fotos.push({ imagen, nombre: archivo.name, clave: crypto.randomUUID() })
      }
      setEditor((p) => ({ ...p, fotos: [...p.fotos, ...fotos] })); setError('')
    } catch { setError('No se pudieron leer las fotografías seleccionadas.') }
    finally { setLeyendoFotos(false) }
  }
  const moverFoto = (desde, hasta) => setEditor((p) => {
    const fotos = [...p.fotos]
    fotos.splice(hasta, 0, fotos.splice(desde, 1)[0])
    return { ...p, fotos }
  })
  const guardarProducto = (e) => {
    e.preventDefault()
    ejecutar(async () => {
      await api(`/portal-admin/productos/${editor.id}`, 'PUT', { publicado: editor.publicado,
        categoria: editor.categoria, descripcion: editor.descripcion, medidas: editor.medidas,
        minimo: Number(editor.minimo), precio: editor.precio === '' ? null : Number(editor.precio), modalidad: editor.modalidad,
        revisionFotos: editor.revisionFotos, imagenes: editor.fotos.map((f) => f.id ? { id: f.id } : { imagen: f.imagen }) })
      setEditor(null)
    }, 'Ficha del catálogo guardada')
  }
  const pendientes = cuentas.filter((c) => c.estado === 'pendiente').length
  return <div className="portal-admin">
    <div className="page-header"><div><h2>Portal mayorista</h2><p className="muted">Administra el acceso de tus clientes y la colección que pueden pedir.</p></div><a className="btn-primary" href="/catalogo/" target="_blank" rel="noreferrer">Abrir catálogo ↗</a></div>
    <div className="pm-metricas"><div><strong>{pendientes}</strong><span>Solicitudes pendientes</span></div><div><strong>{cuentas.filter((c) => c.estado === 'aprobado').length}</strong><span>Clientes habilitados</span></div><div><strong>{productos.filter((p) => p.publicado).length}</strong><span>Productos publicados</span></div></div>
    <div className="pm-tabs" role="group" aria-label="Secciones del portal">{[['cuentas', `Clientes y solicitudes (${pendientes})`], ['productos', 'Catálogo y fotografías'], ['config', 'Presentación'], ['whatsapp', 'WhatsApp']].map(([k, v]) => <button className={tab === k ? 'btn-primary' : 'btn-secondary'} key={k} onClick={() => { setTab(k); setBusqueda('') }}>{v}</button>)}<button className="btn-secondary" disabled={ocupado} onClick={() => ejecutar(async () => {})}>Actualizar</button></div>
    {error && <p className="banner error" role="alert">{error}</p>}{cargando && <p role="status">Cargando portal…</p>}
    {tab === 'cuentas' && <>
      <div className="pm-filtros"><label>Estado<select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos</option>{['pendiente', 'aprobado', 'suspendido', 'rechazado'].map((s) => <option key={s}>{s}</option>)}</select></label><label>Buscar cliente<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Negocio, NIT o correo"/></label></div>
      <p className="muted">Revisa la identidad del negocio antes de aprobarlo. Puedes vincular su solicitud a un cliente existente para conservar un solo directorio.</p>
      <div className="pm-cuentas">{cuentas.filter((c) => (!filtro || c.estado === filtro) && `${c.negocio} ${c.nit} ${c.correo}`.toLowerCase().includes(busqueda.toLowerCase())).map((c) => <article className="pm-cuenta" key={c.id}>
        <header><h3>{c.negocio}</h3><span className={`pm-estado ${c.estado}`}>{c.estado}</span></header>
        <p>{c.contacto} · NIT/documento: {c.nit}</p><p>{c.correo} · {c.telefono}</p><p>{c.direccion}, {c.municipio}</p><small className="muted">Ofertas por WhatsApp: {c.ofertas ? 'autorizadas' : 'no autorizadas'} · Solicitud: {new Date(c.creado).toLocaleDateString('es-CO')}</small>
        {c.clienteId ? <p><b>Cliente vinculado:</b> {clientes.find((x) => x.id === c.clienteId)?.nombre || `#${c.clienteId}`}</p> : <label>Vincular al aprobar<select aria-label={`Vincular ${c.negocio}`} value={vinculos[c.id] || ''} onChange={(e) => setVinculos({ ...vinculos, [c.id]: e.target.value })}><option value="">Crear un nuevo cliente con estos datos</option>{clientes.map((x) => <option key={x.id} value={x.id}>{x.nombre} {x.apellidos} · {x.cedula || 'Sin documento'}</option>)}</select></label>}
        <div className="actions">{c.estado !== 'aprobado' && <button className="btn-primary" disabled={ocupado} onClick={() => estado(c, 'aprobado')}>Aprobar acceso</button>}{c.estado === 'aprobado' && <button className="btn-secondary" disabled={ocupado} onClick={() => estado(c, 'suspendido')}>Suspender acceso</button>}{c.estado === 'pendiente' && <button className="btn-secondary" disabled={ocupado} onClick={() => estado(c, 'rechazado')}>Rechazar solicitud</button>}<button className="btn-secondary" disabled={ocupado} onClick={() => setRecuperar(c)}>Restablecer contraseña</button></div>
      </article>)}</div>
      {!cargando && !cuentas.some((c) => (!filtro || c.estado === filtro) && `${c.negocio} ${c.nit} ${c.correo}`.toLowerCase().includes(busqueda.toLowerCase())) && <div className="pm-vacio">No hay solicitudes que coincidan. Comparte la dirección del catálogo con tus clientes para que soliciten acceso.</div>}
    </>}
    {tab === 'productos' && <>
      <p className="muted">Los productos se crean en Productos. Aquí eliges cuáles publicar y completas su presentación comercial. El mínimo de compra se aplica por color.</p>
      <label>Buscar producto<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o referencia"/></label>
      <div className="pm-productos">{productos.filter((p) => `${p.nombre} ${p.codigo}`.toLowerCase().includes(busqueda.toLowerCase())).map((p) => <article key={p.id}>
        <div className="pm-foto">{p.tieneImagen ? <img src={fotoUrl(p)} alt={p.nombre} loading="lazy"/> : <span>Sin fotografía</span>}</div>
        <div><span className={`pm-estado ${p.publicado ? 'aprobado' : 'pendiente'}`}>{p.publicado ? 'Publicado' : 'Oculto'}</span><h3>{p.nombre}</h3>{p.descripcion && <p className="pm-copy-resumen">{p.descripcion}</p>}<p>{p.codigo} · {p.categoria}</p><p><b>{formatCOP(p.precio)}</b> · Mínimo {p.minimo}</p><small>{p.modalidad === 'encargo' ? 'Bajo pedido' : 'Limitado a disponibilidad'} · {p.imagenes?.length || 0} fotos</small><div className="pm-producto-acciones"><button className="btn-secondary" onClick={() => editar(p)}>Editar ficha</button><button className="btn-secondary" onClick={() => setCopyProducto(p)}>Regenerar copy IA</button></div><VideoProducto producto={p} generando={videoPendiente === p.id} onGenerar={generarVideo} onQuitar={eliminarVideo} onPendiente={setVideoPendiente}/></div>
      </article>)}</div>
      {!cargando && !productos.length && <div className="pm-vacio">Crea tu primer producto en la sección Productos para publicarlo aquí.</div>}
    </>}
    {tab === 'config' && <form className="pm-config" onSubmit={(e) => { e.preventDefault(); ejecutar(() => api('/portal-admin/config', 'PUT', config), 'Presentación guardada') }}>
      <h3>La bienvenida a tu colección</h3><p className="muted">El nombre de la marca se toma de Empresa. Estos textos aparecen en la portada privada del catálogo.</p>
      <label>Título principal<input required maxLength={100} value={config.titulo} onChange={(e) => setConfig({ ...config, titulo: e.target.value })}/></label>
      <label>Descripción de bienvenida<textarea required maxLength={250} value={config.subtitulo} onChange={(e) => setConfig({ ...config, subtitulo: e.target.value })}/></label>
      <button className="btn-primary" disabled={ocupado}>Guardar presentación</button>
      <p className="muted">Los pedidos del portal llegan a Comercial → Pedidos con la etiqueta «Portal mayorista». Configura las notificaciones y ofertas en la pestaña WhatsApp.</p>
    </form>}
    {tab === 'whatsapp' && <WhatsAppPanel wa={wa} texto={waTexto} setTexto={setWaTexto} vista={waVista} setVista={setWaVista} ejecutar={ejecutar} ocupado={ocupado} />}
    {editor && <div className="modal-backdrop"><div className="modal pm-editor" role="dialog" aria-modal="true" aria-label={`Ficha de ${editor.nombre}`}><h3>{editor.nombre}</h3>{error && <p className="banner error" role="alert">{error}</p>}
      <form onSubmit={guardarProducto}><fieldset disabled={ocupado || leyendoFotos}>
        <label className="pm-check"><input type="checkbox" checked={editor.publicado} onChange={(e) => setEditor({ ...editor, publicado: e.target.checked })}/>Publicar en el catálogo mayorista</label>
        <label>Categoría<input required maxLength={80} value={editor.categoria} onChange={(e) => setEditor({ ...editor, categoria: e.target.value })} placeholder="Ej. Armarios, tocadores, mesas"/></label>
        <label>Descripción comercial<textarea maxLength={3000} value={editor.descripcion} onChange={(e) => setEditor({ ...editor, descripcion: e.target.value })}/></label>
        <AsistenteCopyProducto key={editor.id} nombre={editor.nombre} descripcion={editor.descripcion} contexto={`${editor.categoria || ''}. ${editor.medidas || ''}`}
          onAplicar={(copy) => setEditor((actual) => ({ ...actual, descripcion: copy }))} />
        <label>Medidas<input maxLength={200} value={editor.medidas} onChange={(e) => setEditor({ ...editor, medidas: e.target.value })} placeholder="Ej. 120 cm ancho × 180 cm alto × 45 cm fondo"/></label>
        <div className="pm-filtros"><label>Precio mayorista (COP)<input type="number" min="0.01" max="1000000000" step="0.01" value={editor.precio} onChange={(e) => setEditor({ ...editor, precio: e.target.value })} placeholder={`Usar precio de venta: ${editor.precioBase}`}/></label><label>Mínimo por color<input required type="number" min="1" max="10000" step="1" value={editor.minimo} onChange={(e) => setEditor({ ...editor, minimo: e.target.value })}/></label></div>
        <p className="muted">Si dejas el precio vacío, se usará el precio de venta vigente del producto: {formatCOP(editor.precioBase)}.</p>
        <label>Disponibilidad<select value={editor.modalidad} onChange={(e) => setEditor({ ...editor, modalidad: e.target.value })}><option value="encargo">Bajo pedido: permite solicitar fabricación</option><option value="stock">Solo existencias menos pedidos pendientes</option></select></label>
        <label>Fotografías del producto<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={subir} disabled={editor.fotos.length >= 6}/></label>
        <small className="muted">Hasta 6 fotografías JPG, PNG o WebP, máximo 2 MB cada una. Puedes seleccionar varias a la vez. La primera es la portada; los cambios se aplican al guardar la ficha.</small>
        {leyendoFotos && <p role="status">Preparando fotografías…</p>}
        <ol className="pm-galeria" aria-label="Fotografías seleccionadas">{editor.fotos.map((foto, i) => <li key={foto.id || foto.clave}>
          <div className="pm-galeria-imagen"><img src={foto.imagen || fotoUrl(editor, foto)} alt={`Vista previa ${i + 1}`}/><span>{i === 0 ? 'Portada' : `Foto ${i + 1}`}</span></div>
          {foto.nombre && <small title={foto.nombre}>{foto.nombre}</small>}
          <div className="pm-galeria-orden"><button type="button" className="btn-secondary" disabled={i === 0} aria-label={`Mover foto ${i + 1} antes`} onClick={() => moverFoto(i, i - 1)}>←</button><button type="button" className="btn-secondary" disabled={i === editor.fotos.length - 1} aria-label={`Mover foto ${i + 1} después`} onClick={() => moverFoto(i, i + 1)}>→</button></div>
          {i > 0 && <button type="button" className="btn-secondary" onClick={() => moverFoto(i, 0)} aria-label={`Usar foto ${i + 1} como portada`}>Usar de portada</button>}
          <button type="button" className="btn-secondary" aria-label={`Quitar foto ${i + 1}`} onClick={() => setEditor((p) => ({ ...p, fotos: p.fotos.filter((_, n) => n !== i) }))}>Quitar foto</button>
        </li>)}</ol>
        <div className="actions"><button className="btn-secondary" type="button" onClick={() => { setEditor(null); setError('') }}>Cancelar</button><button className="btn-primary">{ocupado ? 'Guardando…' : 'Guardar ficha'}</button></div>
      </fieldset></form>
    </div></div>}
    {copyProducto && <div className="modal-backdrop"><div className="modal pm-editor" role="dialog" aria-modal="true" aria-label={`Copy de ${copyProducto.nombre}`}>
      <h3>Copy de {copyProducto.nombre}</h3>
      <AsistenteCopyProducto key={copyProducto.id} nombre={copyProducto.nombre} descripcion={copyProducto.descripcion || ''}
        contexto={`${copyProducto.categoria || ''}. ${copyProducto.medidas || ''}`} autoGenerar onAplicar={async (copy) => {
          setOcupado(true)
          try {
            await api(`/portal-admin/productos/${copyProducto.id}/descripcion`, 'PATCH', { descripcion: copy })
            await cargar()
            setCopyProducto(null)
            notify.ok('Copy del catálogo actualizado')
          } finally { setOcupado(false) }
        }} />
      <div className="actions"><button type="button" className="btn-secondary" disabled={ocupado} onClick={() => setCopyProducto(null)}>Cancelar</button></div>
    </div></div>}
    {recuperar && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="Restablecer contraseña"><h3>Restablecer acceso de {recuperar.negocio}</h3><p>Verifica la identidad del cliente y acuerda con él la nueva contraseña. Las sesiones actuales se cerrarán.</p>{error && <p role="alert" className="banner error">{error}</p>}<form onSubmit={(e) => { e.preventDefault(); const nueva = new FormData(e.currentTarget).get('nueva'); ejecutar(async () => { await api(`/portal-admin/cuentas/${recuperar.id}/password`, 'POST', { nueva }); setRecuperar(null) }, 'Contraseña restablecida') }}><label>Nueva contraseña<input name="nueva" type="password" required minLength={4} placeholder="Mínimo 4 caracteres" maxLength={128} autoComplete="new-password"/></label><div className="actions"><button type="button" className="btn-secondary" disabled={ocupado} onClick={() => setRecuperar(null)}>Cancelar</button><button className="btn-primary" disabled={ocupado}>Restablecer contraseña</button></div></form></div></div>}
  </div>
}
