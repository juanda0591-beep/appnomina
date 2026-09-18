import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, ArrowUpRight, CheckCircle2, LogOut, Package, Search, ShoppingBag, Truck, X, Plus, ShieldCheck } from 'lucide-react'
import { portalApi, dinero, leerBorrador } from './api.js'
import GaleriaProducto from './GaleriaProducto.jsx'
import ConfirmacionProducto from './ConfirmacionProducto.jsx'
import './portal.css'

function Escena() {
  return <svg viewBox="0 0 600 520" aria-hidden="true" className="escena">
    <defs><linearGradient id="madera"><stop stopColor="#c8986b"/><stop offset="1" stopColor="#a9754b"/></linearGradient></defs>
    <path d="M120 380V160a170 170 0 0 1 340 0v220" fill="#eadfcd"/>
    <ellipse cx="310" cy="437" rx="228" ry="28" fill="#183b3220"/>
    <path d="M152 283h289v133H152z" fill="url(#madera)"/>
    <path d="M152 283l24-15h289l-24 15z" fill="#e2bb8e"/>
    <path d="M441 283l24-15v129l-24 19z" fill="#825835"/>
    <path d="M169 302h118v97H169zm133 0h121v97H302z" fill="none" stroke="#795b40" strokeWidth="2"/>
    {Array.from({ length: 19 }, (_, i) => <path key={i} d={`M${175 + i * 5.8} 306v89`} stroke="#795b40" opacity=".55"/>)}
    <circle cx="315" cy="350" r="4" fill="#e5cd9e"/>
    <path d="M173 415v25m246-25v25" stroke="#825835" strokeWidth="9"/>
    <path d="M197 270l-10-51h47l-10 51z" fill="#eee7dc"/>
    <path d="M210 223q-31-40-5-79m8 67q39-30 37-54m-36 50q-46-15-57-48" fill="none" stroke="#546e50" strokeWidth="5"/>
    <ellipse cx="205" cy="157" rx="11" ry="27" fill="#738566" transform="rotate(-15 205 157)"/>
    <ellipse cx="244" cy="172" rx="12" ry="28" fill="#48694b" transform="rotate(35 244 172)"/>
    <ellipse cx="170" cy="169" rx="11" ry="27" fill="#8d9b75" transform="rotate(-45 170 169)"/>
    <path d="M347 266v-45h37v45" fill="#e5c294"/><path d="M340 219q26-69 52 0z" fill="#f4eee3"/>
    <path d="M345 267h42" stroke="#6c5a40" strokeWidth="5"/>
    <path d="M260 268h56m-51-8h43" stroke="#ece4d3" strokeWidth="8"/>
  </svg>
}

function Acceso({ config, onLogin }) {
  const [registro, setRegistro] = useState(false)
  const [error, setError] = useState(''), [mensaje, setMensaje] = useState(''), [ocupado, setOcupado] = useState(false)
  const enviar = async (e) => {
    e.preventDefault(); setError(''); setMensaje(''); setOcupado(true)
    const f = new FormData(e.currentTarget), b = Object.fromEntries(f)
    try {
      if (registro) {
        const r = await portalApi('/registro', 'POST', { ...b, aceptaDatos: f.has('aceptaDatos'), ofertas: f.has('ofertas'), notificaciones: f.has('notificaciones') })
        setMensaje(r.mensaje); setRegistro(false)
      } else onLogin(await portalApi('/login', 'POST', b))
    } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }
  return <div className="acceso">
    <section className="acceso-editorial">
      <a className="marca" href="/catalogo/"><span className="marca-icono"><Package size={22}/></span>{config.marca}</a>
      <div className="editorial-texto"><span className="eyebrow">EXCLUSIVO PARA MAYORISTAS</span><h1>Buenos productos.<br/><em>Grandes negocios.</em></h1>
        <p>Tu próxima colección empieza aquí. Un espacio para encontrar, elegir y pedir con tranquilidad.</p></div>
      <Escena/><div className="editorial-pie"><span>Diseño para compartir.</span><span>Relaciones para crecer.</span></div>
    </section>
    <section className="acceso-form"><div className="acceso-interior">
      <span className="eyebrow">TU ESPACIO COMERCIAL</span><h2>{registro ? 'Crezcamos juntos.' : 'Qué bueno verte.'}</h2>
      <p className="muted">{registro ? 'Solicita acceso al catálogo privado. Revisaremos los datos de tu negocio antes de habilitar tu cuenta.' : 'Ingresa a tu cuenta para descubrir la colección y preparar tu próximo pedido.'}</p>
      <div className="acceso-tabs"><button aria-pressed={!registro} disabled={ocupado} onClick={() => { setRegistro(false); setError('') }}>Iniciar sesión</button><button aria-pressed={registro} disabled={ocupado} onClick={() => { setRegistro(true); setError('') }}>Solicitar acceso</button></div>
      {error && <p className="alerta error" role="alert">{error}</p>}{mensaje && <p className="alerta" role="status">{mensaje}</p>}
      <form onSubmit={enviar} key={String(registro)}>
        {registro && <div className="form-grid">
          <label>Nombre del negocio<input name="negocio" required maxLength={160} autoComplete="organization"/></label>
          <label>Nombre de contacto<input name="contacto" required maxLength={160} autoComplete="name"/></label>
          <label>NIT o documento<input name="nit" required maxLength={40}/></label>
          <label>Teléfono de contacto<input name="telefono" type="tel" required maxLength={30} autoComplete="tel"/></label>
          <label className="span-2">Dirección<input name="direccion" required maxLength={300} autoComplete="street-address"/></label>
          <label className="span-2">Ciudad o municipio<input name="municipio" required maxLength={100} autoComplete="address-level2"/></label>
        </div>}
        <label>Correo electrónico<input name="correo" type="email" required maxLength={254} autoComplete="username" placeholder="tu@negocio.com"/></label>
        <label>Contraseña<input name="password" type="password" required minLength={registro ? 10 : undefined} maxLength={128} autoComplete={registro ? 'new-password' : 'current-password'} placeholder={registro ? 'Mínimo 10 caracteres' : 'Tu contraseña'}/></label>
        {registro && <><label className="check"><input type="checkbox" name="aceptaDatos" required/>Autorizo el uso de mis datos para revisar mi solicitud, administrar mi cuenta y gestionar mis pedidos.</label>
          <label className="check"><input type="checkbox" name="ofertas"/>Quiero recibir novedades y ofertas por WhatsApp. Puedo retirar esta autorización desde mi cuenta.</label></>}
        {registro && <label className="check"><input type="checkbox" name="notificaciones"/>Autorizo confirmaciones y actualizaciones de mis pedidos por WhatsApp.</label>}
        <button className="primario ancho" disabled={ocupado}>{ocupado ? 'Un momento…' : registro ? 'Solicitar mi cuenta mayorista' : 'Entrar al catálogo'}<ArrowRight size={18}/></button>
      </form>
      <p className="acceso-ayuda">{registro ? 'El catálogo y los precios están disponibles únicamente para clientes aprobados.' : '¿Olvidaste tu contraseña? Contacta a tu proveedor para recuperar el acceso.'}</p>
      <div className="acceso-seguro"><ShieldCheck size={17}/> Acceso privado para clientes mayoristas</div>
    </div></section>
  </div>
}

function Producto({ p, agregar, bloqueado, cantidadEnPedido }) {
  const [variante, setVariante] = useState(String(p.variantes[0]?.id || ''))
  const v = p.variantes.find((v) => String(v.id) === variante)
  const agotado = !v || (p.modalidad === 'stock' && v.disponible < p.minimo)
  return <article className="producto">
    <GaleriaProducto producto={p} etiqueta={p.modalidad === 'encargo' ? 'Bajo pedido' : agotado ? 'No disponible' : 'En colección'}/>
    <div className="producto-info"><span className="eyebrow">{p.categoria} · {p.codigo}</span><h3>{p.nombre}</h3>
      <div className="producto-precio"><strong>{dinero(p.precio)}</strong><span>/ unidad</span></div>
      <p className="producto-minimo">Mínimo {p.minimo} {p.minimo === 1 ? 'unidad' : 'unidades'} por color</p>
      {(p.descripcion || p.medidas) && <details><summary>Detalles del producto</summary><p>{p.descripcion}</p>{p.medidas && <p><b>Medidas:</b> {p.medidas}</p>}</details>}
      <div className="producto-acciones"><label><span className="sr-only">Color de {p.nombre}</span><select value={variante} onChange={(e) => setVariante(e.target.value)} disabled={bloqueado}>{p.variantes.map((v) => <option value={v.id} key={v.id}>{v.color}</option>)}</select></label>
        <button className="agregar" aria-label={`Agregar ${p.nombre}`} disabled={agotado || bloqueado || !(p.precio > 0)} onClick={() => agregar(p, v)}><Plus size={18}/>Agregar</button></div>
      <small className="muted">{p.modalidad === 'encargo' ? 'Entrega a coordinar con tu proveedor' : `${v?.disponible || 0} unidades disponibles para solicitar`}</small>
      {cantidadEnPedido > 0 && <p className="producto-en-pedido"><CheckCircle2 size={16}/>{cantidadEnPedido} {cantidadEnPedido === 1 ? 'unidad en tu pedido' : 'unidades en tu pedido'}</p>}
    </div>
  </article>
}

function Cuenta({ cuenta, onChange, ejecutar }) {
  const form = useRef()
  return <section className="cuenta-panel"><span className="eyebrow">TU PERFIL</span><h1>Mi cuenta</h1><p className="muted">{cuenta.negocio} · {cuenta.correo}</p>
    <dl><dt>Contacto</dt><dd>{cuenta.contacto}</dd><dt>NIT o documento</dt><dd>{cuenta.nit}</dd><dt>Dirección registrada</dt><dd>{cuenta.direccion}, {cuenta.municipio}</dd><dt>Teléfono</dt><dd>{cuenta.telefono}</dd></dl>
    <p className="muted">Puedes indicar una dirección distinta en cada pedido. Para actualizar los datos comerciales, contacta a tu proveedor.</p>
    <label className="check"><input type="checkbox" checked={cuenta.notificaciones} onChange={(e) => { const notificaciones = e.target.checked; ejecutar(async () => { await portalApi('/preferencias', 'PUT', { ofertas: cuenta.ofertas, notificaciones }); onChange({ ...cuenta, notificaciones }) }) }}/>Recibir confirmaciones y actualizaciones de pedidos por WhatsApp</label>
    <label className="check"><input type="checkbox" checked={cuenta.ofertas} onChange={(e) => { const ofertas = e.target.checked; ejecutar(async () => { await portalApi('/preferencias', 'PUT', { ofertas, notificaciones: cuenta.notificaciones }); onChange({ ...cuenta, ofertas }) }) }}/>Recibir novedades y ofertas por WhatsApp</label>
    <h2>Cambiar contraseña</h2><form ref={form} onSubmit={(e) => { e.preventDefault(); const datos = Object.fromEntries(new FormData(e.currentTarget)); ejecutar(async () => { await portalApi('/password', 'POST', datos); form.current.reset(); return 'Contraseña actualizada. Las otras sesiones se cerraron.' }) }}>
      <label>Contraseña actual<input name="actual" type="password" autoComplete="current-password" required maxLength={128}/></label>
      <label>Nueva contraseña<input name="nueva" type="password" autoComplete="new-password" required minLength={10} maxLength={128}/></label><button className="primario">Guardar contraseña</button>
    </form>
  </section>
}

function Tienda({ config, cuenta, setCuenta }) {
  const borrador = useRef(leerBorrador(cuenta.id)).current
  const [productos, setProductos] = useState([]), [pedidos, setPedidos] = useState([])
  const [vista, setVista] = useState('catalogo'), [busqueda, setBusqueda] = useState(''), [categoria, setCategoria] = useState('Todas')
  const [carrito, setCarrito] = useState(borrador.carrito || []), [abierto, setAbierto] = useState(false)
  const [entrega, setEntrega] = useState(borrador.entrega || { direccion: cuenta.direccion, municipio: cuenta.municipio, telefono: cuenta.telefono, comentario: '' })
  const [pendiente, setPendiente] = useState(borrador.pendiente || null), [revisado, setRevisado] = useState(false)
  const [error, setError] = useState(''), [aviso, setAviso] = useState(''), [ocupado, setOcupado] = useState(false), [cargando, setCargando] = useState(true)
  const [recibo, setRecibo] = useState(null)
  const [agregado, setAgregado] = useState(null)
  const bloqueo = useRef(false)
  const dialogo = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const anterior = document.activeElement, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogo.current.querySelector('button')?.focus({ preventScroll: true })
    const atrapar = (e) => {
      if (e.key === 'Escape') { setAbierto(false); return }
      if (e.key !== 'Tab') return
      const botones = [...dialogo.current.querySelectorAll('button, input, select, textarea, a[href]')].filter((el) => !el.matches(':disabled') && el.getClientRects().length)
      const primero = botones[0], ultimo = botones[botones.length - 1]
      if (!dialogo.current.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? ultimo : primero)?.focus() }
      else if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo?.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus() }
    }
    document.addEventListener('keydown', atrapar)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', atrapar); anterior?.focus() }
  }, [abierto])
  useEffect(() => { sessionStorage.setItem(`portal_borrador_${cuenta.id}`, JSON.stringify({ carrito, entrega, pendiente })) }, [carrito, entrega, pendiente, cuenta.id])
  const ejecutar = async (fn) => {
    if (bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError(''); setAviso('')
    try { const msg = await fn(); if (typeof msg === 'string') setAviso(msg) }
    catch (e) { setError(e.message); if (e.status === 401) setCuenta(null) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  useEffect(() => {
    let vivo = true
    portalApi('/productos').then((p) => { if (vivo) setProductos(p) }).catch((e) => { if (vivo) { setError(e.message); if (e.status === 401) setCuenta(null) } }).finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [setCuenta])
  const cambiarCarrito = (next) => { setCarrito(next); setRevisado(false); setRecibo(null) }
  const agregar = (p, v) => {
    if (ocupado || pendiente || agregado) return
    const existente = carrito.find((i) => i.varianteId === v.id)
    const cantidad = existente ? existente.cantidad + 1 : p.minimo
    if (p.modalidad === 'stock' && cantidad > v.disponible) { setError('La cantidad supera la disponibilidad actual.'); return }
    const item = { productoId: p.id, varianteId: v.id, cantidad, precio: p.precio, nombre: p.nombre, color: v.color, minimo: p.minimo }
    cambiarCarrito(existente ? carrito.map((i) => i.varianteId === v.id ? item : i) : [...carrito, item])
    setError(''); setAviso('')
    setAgregado({ ...item, agregadas: existente ? 1 : p.minimo,
      foto: p.imagenes?.[0] ? `/api/portal/productos/${p.id}/imagenes/${p.imagenes[0].id}` : null })
  }
  const abrirVista = (v) => {
    setVista(v); setError(''); setAviso('')
    if (v === 'pedidos') ejecutar(async () => { setPedidos(await portalApi('/pedidos')) })
  }
  const actualizar = () => ejecutar(async () => {
    const actuales = await portalApi('/productos'); setProductos(actuales)
    let retirados = 0
    cambiarCarrito(carrito.flatMap((i) => {
      const p = actuales.find((p) => p.id === i.productoId), v = p?.variantes.find((v) => v.id === i.varianteId)
      if (!p || !v) { retirados++; return [] }
      return [{ ...i, precio: p.precio, minimo: p.minimo, cantidad: Math.max(i.cantidad, p.minimo) }]
    }))
    return `Precios actualizados. Revisa las cantidades antes de confirmar.${retirados ? ` Se retiraron ${retirados} productos que ya no están publicados.` : ''}`
  })
  const enviar = (e) => {
    e.preventDefault()
    ejecutar(async () => {
      const payload = pendiente || { ...entrega, solicitudId: crypto.randomUUID(), items: carrito.map(({ productoId, varianteId, cantidad, precio }) => ({ productoId, varianteId, cantidad, precio })) }
      setPendiente(payload)
      // Persistir antes de la petición: una recarga no cambia la clave del reintento.
      sessionStorage.setItem(`portal_borrador_${cuenta.id}`, JSON.stringify({ carrito, entrega, pendiente: payload }))
      try {
        const pedido = await portalApi('/pedidos', 'POST', payload)
        setPendiente(null); setCarrito([]); setRevisado(false); setRecibo(pedido); setAbierto(false)
        sessionStorage.removeItem(`portal_borrador_${cuenta.id}`)
        return `Pedido #${pedido.id} recibido. Tu proveedor confirmará la disponibilidad y la fecha de entrega.`
      } catch (err) {
        if (err.status && err.status < 500) setPendiente(null)
        else err.message = 'No pudimos confirmar la respuesta. Reintenta el mismo envío: no se duplicará el pedido.'
        throw err
      }
    })
  }
  const repetir = (pedido) => ejecutar(async () => {
    const actuales = await portalApi('/productos'); setProductos(actuales)
    const lineas = [], faltantes = []
    for (const i of pedido.items) {
      const p = actuales.find((p) => p.id === i.productoId), v = p?.variantes.find((v) => v.id === i.varianteId)
      if (!p || !v) { faltantes.push(i.nombre); continue }
      lineas.push({ productoId: p.id, varianteId: v.id, cantidad: Math.max(i.cantidad, p.minimo), precio: p.precio, nombre: p.nombre, color: v.color, minimo: p.minimo })
    }
    cambiarCarrito(lineas); setAbierto(true)
    return faltantes.length ? `No se pudieron agregar: ${faltantes.join(', ')}. Revisa el pedido.` : 'Pedido preparado con precios actuales. Revísalo antes de enviarlo.'
  })
  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const unidades = carrito.reduce((s, i) => s + (Number(i.cantidad) || 0), 0)
  const categorias = ['Todas', ...new Set(productos.map((p) => p.categoria))]
  const visibles = productos.filter((p) => (categoria === 'Todas' || p.categoria === categoria) && `${p.nombre} ${p.codigo} ${p.descripcion}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
  return <div className={`tienda ${carrito.length ? 'tienda-con-pedido' : ''}`}>
    <div className="franja">UNA COLECCIÓN DE POSIBILIDADES PARA TU NEGOCIO</div>
    <header className="cabecera"><a className="marca" href="/catalogo/"><span className="marca-icono"><Package size={22}/></span>{config.marca}</a>
      <nav aria-label="Navegación principal">{[['catalogo', 'Colección'], ['pedidos', 'Mis pedidos'], ['cuenta', 'Mi cuenta']].map(([v, label]) => <button key={v} aria-current={vista === v ? 'page' : undefined} onClick={() => abrirVista(v)}>{label}</button>)}</nav>
      <div className="cabecera-acciones"><button className="bolsa" onClick={() => setAbierto(!abierto)} aria-label={`Ver pedido, ${carrito.length} productos`}><ShoppingBag size={20}/><span>Mi pedido</span><b>{carrito.length}</b></button><button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" disabled={ocupado} onClick={() => ejecutar(async () => { await portalApi('/logout', 'POST', {}); setCuenta(null) })}><LogOut size={19}/></button></div>
    </header>
    <main className="tienda-main">
      <div className="saludo"><span><span className="punto"/>Acceso mayorista</span><span>Hola, {cuenta.contacto.split(' ')[0]}</span></div>
      {error && <p className="alerta error" role="alert">{error}</p>}{aviso && <p className="alerta" role="status">{aviso}</p>}
      {pendiente && <div className="alerta">Tienes un envío por confirmar. <button onClick={() => setAbierto(true)}>Abrir pedido para reintentar</button></div>}
      {recibo && <section className="recibo"><CheckCircle2 size={32}/><div><h2>Recibimos tu pedido #{recibo.id}</h2><p>{dinero(recibo.total)} · Entrega pendiente de confirmación</p></div><button onClick={() => abrirVista('pedidos')}>Ver mis pedidos <ArrowUpRight size={18}/></button></section>}
      {vista === 'catalogo' && <>
        <section className="hero"><div><span className="eyebrow">LA COLECCIÓN MAYORISTA</span><h1>{config.titulo}</h1><p>{config.subtitulo}</p><a href="#coleccion">Encuentra tu próximo favorito <ArrowDownIcon/></a></div><div className="hero-arte"><Escena/><span>Elegidos para tu negocio.</span></div></section>
        <div className="beneficios"><span><ShieldCheck size={19}/>Precios para tu negocio</span><span><Package size={19}/>Pedidos en un solo lugar</span><span><Truck size={19}/>Entrega coordinada contigo</span></div>
        <section id="coleccion"><div className="coleccion-titulo"><div><span className="eyebrow">EXPLORA Y ELIGE</span><h2>Nuestra colección <span>{productos.length}</span></h2></div><button className="texto-button" onClick={actualizar} disabled={ocupado || !!pendiente}>Actualizar catálogo</button></div>
          <ol className="guia-pedido" aria-label="Cómo hacer tu pedido"><li><b>1</b><span><strong>Elige tus productos</strong>Agrega los que necesites.</span></li><li><b>2</b><span><strong>Revisa tu pedido</strong>Ajusta cantidades y dirección.</span></li><li><b>3</b><span><strong>Confirma y envía</strong>Recibirás tu número de pedido.</span></li></ol>
          <div className="filtros"><div className="categorias" role="group" aria-label="Categorías">{categorias.map((c) => <button aria-pressed={categoria === c} key={c} onClick={() => setCategoria(c)}>{c}</button>)}</div><label className="buscador"><Search size={18}/><span className="sr-only">Buscar productos</span><input placeholder="Busca por nombre o referencia" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}/></label></div>
          {cargando ? <p className="vacio" role="status">Preparando la colección…</p> : visibles.length === 0 ? <div className="vacio"><Package size={40}/><h3>{productos.length ? 'No encontramos coincidencias' : 'La colección está en preparación'}</h3><p>{productos.length ? 'Prueba otra búsqueda o categoría.' : 'Tu proveedor publicará aquí los productos disponibles para pedidos.'}</p></div> : <div className="productos-grid">{visibles.map((p) => <Producto key={p.id} p={p} agregar={agregar} bloqueado={ocupado || !!pendiente} cantidadEnPedido={carrito.filter((i) => i.productoId === p.id).reduce((s, i) => s + (Number(i.cantidad) || 0), 0)}/>)}</div>}
        </section>
      </>}
      {vista === 'pedidos' && <section className="historial"><span className="eyebrow">CADA PEDIDO, A TU ALCANCE</span><div className="coleccion-titulo"><h1>Mis pedidos</h1><button className="texto-button" disabled={ocupado} onClick={() => abrirVista('pedidos')}>Actualizar pedidos</button></div><p className="muted">Consulta los pedidos realizados desde el portal y la fecha de entrega confirmada por tu proveedor.</p>
        {ocupado && <p role="status">Cargando…</p>}{!ocupado && !pedidos.length && <div className="vacio"><ShoppingBag size={42}/><h3>Tu próximo pedido empieza en la colección</h3><button className="primario" onClick={() => abrirVista('catalogo')}>Explorar productos</button></div>}
        {pedidos.map((p) => <article className="pedido-historial" key={p.referencia}><div className="pedido-encabezado"><div><h3>{p.id ? `Pedido #${p.id}` : `Pedido anulado · ${p.referencia}`}</h3><small>{new Date(p.creado).toLocaleString('es-CO')}</small></div><span className="estado">{{ pendiente: 'Recibido · por confirmar', entregado: 'Entregado / convertido en venta', anulado: 'Anulado' }[p.estado] || p.estado}</span><strong>{p.total == null ? '—' : dinero(p.total)}</strong></div>
          <p className="muted">{p.direccion}, {p.municipio} · {p.fechaEntrega ? `Entrega: ${p.fechaEntrega.slice(0, 10)}` : 'Fecha de entrega por confirmar'}</p>
          <details><summary>Ver detalle del pedido</summary>{p.items.map((i, index) => <p key={index}>{i.cantidad} × {i.nombre} · {i.color || 'Estándar'} <b>{dinero(i.cantidad * i.precio)}</b></p>)}{p.comentario && <p>{p.comentario}</p>}</details>
          <button className="texto-button" disabled={ocupado || !!pendiente || !!carrito.length || !p.items.length} onClick={() => repetir(p)}>Repetir con precios actuales <ArrowRight size={16}/></button>{carrito.length > 0 && <small className="muted"> Vacía tu pedido actual para repetir uno anterior.</small>}
        </article>)}
      </section>}
      {vista === 'cuenta' && <fieldset className="cuenta-fieldset" disabled={ocupado}><Cuenta cuenta={cuenta} onChange={setCuenta} ejecutar={ejecutar}/></fieldset>}
    </main>
    <footer className="pie"><span className="marca"><Package size={20}/>{config.marca}</span><span>Hecho para crecer contigo.</span><small>Catálogo privado · Precios en pesos colombianos</small></footer>
    {carrito.length > 0 && !abierto && <aside className="pedido-fijo" aria-label="Resumen de tu pedido"><div className="pedido-fijo-resumen"><span className="pedido-fijo-icono"><ShoppingBag size={24}/></span><div><strong>{unidades} {unidades === 1 ? 'unidad en tu pedido' : 'unidades en tu pedido'}</strong><span>{dinero(total)} · {pendiente ? 'Envío por confirmar' : 'Aún falta enviarlo'}</span></div></div><button className="primario" onClick={() => setAbierto(true)}>{pendiente ? 'Revisar envío pendiente' : 'Ver y enviar mi pedido'}<ArrowRight size={20}/></button></aside>}
    {agregado && <ConfirmacionProducto producto={agregado} total={total} unidades={unidades} cerrar={() => setAgregado(null)} verPedido={() => { setAgregado(null); setAbierto(true) }}/>} 
    {abierto && <div className="carrito-fondo" onClick={() => setAbierto(false)}><section ref={dialogo} className="carrito" aria-label="Tu pedido" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <header><div><span className="eyebrow">PASO A PASO, CRECEMOS</span><h2>Tu próximo pedido</h2></div><button autoFocus aria-label="Cerrar pedido" className="icon-button" onClick={() => setAbierto(false)}><X/></button></header>
      {carrito.length > 0 && !pendiente && <p className="carrito-instruccion"><strong>Ya casi terminas.</strong> Revisa las cantidades y tu dirección. Luego marca la casilla de revisión y pulsa «Confirmar y enviar pedido» al final.</p>}
      {error && <p className="alerta error" role="alert">{error}</p>}{aviso && <p className="alerta" role="status">{aviso}</p>}
      {!carrito.length ? <div className="vacio"><ShoppingBag size={40}/><h3>Hay espacio para buenas ideas</h3><p>Agrega productos de la colección para comenzar.</p></div> : <form onSubmit={enviar}>
        <fieldset disabled={ocupado || !!pendiente}>
          <div className="carrito-items">{carrito.map((i) => <article key={i.varianteId}><div><h3>{i.nombre}</h3><small>{i.color} · {dinero(i.precio)} / unidad</small></div><button type="button" className="icon-button" aria-label={`Quitar ${i.nombre}`} onClick={() => cambiarCarrito(carrito.filter((x) => x.varianteId !== i.varianteId))}><X size={16}/></button>
            <label className="cantidad">Cantidad<input aria-label={`Cantidad de ${i.nombre}`} type="number" min={i.minimo} max={10000} step={1} required value={i.cantidad} onChange={(e) => cambiarCarrito(carrito.map((x) => x.varianteId === i.varianteId ? { ...x, cantidad: e.target.value === '' ? '' : Number(e.target.value) } : x))}/></label><strong>{dinero(i.precio * i.cantidad)}</strong></article>)}</div>
          <button className="texto-button" type="button" onClick={actualizar}>Actualizar precios del pedido</button>
          <h3 className="entrega-titulo"><Truck size={19}/> Datos de entrega</h3>
          {[['direccion', 'Dirección de entrega', 300], ['municipio', 'Ciudad o municipio', 100], ['telefono', 'Teléfono de contacto', 30]].map(([key, label, max]) => <label key={key}>{label}<input required maxLength={max} value={entrega[key]} onChange={(e) => { setEntrega({ ...entrega, [key]: e.target.value }); setRevisado(false) }}/></label>)}
          <label>Notas para tu proveedor<textarea maxLength={1000} value={entrega.comentario} onChange={(e) => { setEntrega({ ...entrega, comentario: e.target.value }); setRevisado(false) }} placeholder="Indicaciones especiales para este pedido"/></label>
        </fieldset>
        <div className="carrito-total"><span>Total de productos</span><strong>{dinero(total)}</strong></div><p className="muted">El envío y la fecha de entrega se acuerdan con tu proveedor. Este pedido no realiza un cobro ni reserva inventario de forma definitiva.</p>
        {!pendiente && <label className="check"><input type="checkbox" checked={revisado} required onChange={(e) => setRevisado(e.target.checked)}/>Revisé los productos, cantidades, precios y datos de entrega.</label>}
        {pendiente && <p className="alerta">El envío está por confirmar. Puedes reintentarlo sin crear un pedido duplicado.</p>}
        <button className="primario ancho" disabled={ocupado || (!pendiente && !revisado)}>{ocupado ? 'Enviando…' : pendiente ? 'Reintentar el mismo pedido' : 'Confirmar y enviar pedido'}<ArrowRight size={18}/></button>
      </form>}
    </section></div>}
  </div>
}
function ArrowDownIcon() { return <ArrowRight size={19} style={{ transform: 'rotate(45deg)' }}/> }
function Portal() {
  const [config, setConfig] = useState({ marca: 'Colección Mayorista', titulo: 'Diseño que impulsa tu negocio.', subtitulo: 'Explora nuestra colección y prepara tu próximo pedido mayorista.' })
  const [cuenta, setCuenta] = useState(null), [cargando, setCargando] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    portalApi('/config').then((c) => { setConfig(c); document.title = `${c.marca} · Mayoristas` }).catch(() => {})
    portalApi('/sesion').then(setCuenta).catch((e) => { if (e.status !== 401) setError(e.message) }).finally(() => setCargando(false))
  }, [])
  if (cargando) return <div className="pantalla-carga"><Package size={36}/><p>Abriendo tu espacio mayorista…</p></div>
  if (error) return <div className="pantalla-carga"><p role="alert">{error}</p><button className="primario" onClick={() => window.location.reload()}>Volver a intentar</button></div>
  return cuenta ? <Tienda config={config} cuenta={cuenta} setCuenta={setCuenta}/> : <Acceso config={config} onLogin={setCuenta}/>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Portal/></React.StrictMode>)
