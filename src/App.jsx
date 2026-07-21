import { useState, lazy, Suspense } from 'react'
import { NavLink, Route, Routes, useLocation, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Productos from './pages/Productos.jsx'
import Materiales from './pages/Materiales.jsx'
import Colores from './pages/Colores.jsx'
import Empleados from './pages/Empleados.jsx'
import Prestamos from './pages/Prestamos.jsx'
import Nomina from './pages/Nomina.jsx'
import GestionNomina from './pages/GestionNomina.jsx'
import GestionProduccion from './pages/GestionProduccion.jsx'
import ProduccionDashboard from './pages/ProduccionDashboard.jsx'
import ControlDinero from './pages/ControlDinero.jsx'
import Historial from './pages/Historial.jsx'
import Reportes from './pages/Reportes.jsx'
import Costos from './pages/Costos.jsx'
import Clientes from './pages/Clientes.jsx'
import Pedidos from './pages/Pedidos.jsx'
import Ventas from './pages/Ventas.jsx'
import Empresa from './pages/Empresa.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Cuenta from './pages/Cuenta.jsx'
// Carga perezosa: Konva/react-konva solo pesan al entrar a esta ruta.
const CortesPlanos = lazy(() => import('./pages/CortesPlanos.jsx'))
import { useData } from './context/DataContext.jsx'
import { useAuth } from './context/AuthContext.jsx'

// Enlaces del menú. `pagina` se cruza con los permisos del usuario (puede(pagina,'ver')).
// `solo` marca enlaces de regla fija: 'admin' (gestión de usuarios) o 'todos' (Mi cuenta).
const links = [
  { to: '/inicio', label: '🏠 Inicio', pagina: 'inicio' },
  { to: '/nomina', label: '🧾 Pago de Nómina', pagina: 'nomina' },
  {
    group: 'gestion-nomina-grupo',
    label: '📋 Gestión de Nómina',
    items: [
      { to: '/gestion-nomina', label: '📋 Gestión de Trabajo', pagina: 'gestion-nomina' },
      { to: '/empleados', label: '👷 Empleados', pagina: 'empleados' },
      { to: '/prestamos', label: '💵 Préstamos', pagina: 'prestamos' },
    ],
  },
  { to: '/productos', label: '📦 Productos', pagina: 'productos' },
  {
    group: 'fabricacion',
    label: '🏭 Fabricación',
    items: [
      { to: '/materiales', label: '🧱 Materiales', pagina: 'materiales' },
      { to: '/colores', label: '🎨 Colores', pagina: 'colores' },
      { to: '/cortes-planos', label: '✂️ Cortes y Planos', pagina: 'cortes-planos' },
      { to: '/gestion-produccion', label: '🏭 Producción', pagina: 'gestion-produccion' },
      { to: '/produccion-dashboard', label: '📈 Panel Producción', pagina: 'produccion-dashboard' },
    ],
  },
  {
    group: 'comercial',
    label: '🛒 Comercial',
    items: [
      { to: '/clientes', label: '🧑‍🤝‍🧑 Clientes', pagina: 'clientes' },
      { to: '/pedidos', label: '📝 Pedidos', pagina: 'pedidos' },
      { to: '/ventas', label: '🛒 Ventas', pagina: 'ventas' },
    ],
  },
  { to: '/control-dinero', label: '💰 Control de Dinero', pagina: 'control-dinero' },
  { to: '/historial', label: '📚 Historial', pagina: 'historial' },
  { to: '/reportes', label: '📊 Reportes', pagina: 'reportes' },
  { to: '/costos', label: '💲 Costos', pagina: 'costos' },
  { to: '/empresa', label: '🏢 Empresa', pagina: 'empresa' },
  { to: '/usuarios', label: '👥 Usuarios', solo: 'admin' },
  { to: '/cuenta', label: '🔒 Mi cuenta', solo: 'todos' },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false) // cajón deslizante en móvil
  // Sidebar colapsado en escritorio (se recuerda entre sesiones)
  const [colapsado, setColapsado] = useState(() => localStorage.getItem('sidebarColapsado') === '1')
  const { cargando, error } = useData()
  const { usuario, rol, puede, logout } = useAuth()
  const location = useLocation()

  // cerrar el menú al cambiar de página (móvil)
  const closeMenu = () => setMenuOpen(false)

  const toggleColapsado = () => {
    setColapsado((c) => {
      const next = !c
      localStorage.setItem('sidebarColapsado', next ? '1' : '0')
      return next
    })
  }

  const esAdmin = rol === 'admin'

  const puedeVer = (l) => {
    if (l.solo === 'admin') return esAdmin
    if (l.solo === 'todos') return true
    return puede(l.pagina, 'ver')
  }

  // Filtra el menú: enlaces sueltos por su propia regla; grupos se muestran si
  // al menos uno de sus items es visible, y solo esos items visibles se listan.
  const visibles = links
    .map((l) => {
      if (!l.group) return puedeVer(l) ? l : null
      const itemsVisibles = l.items.filter(puedeVer)
      return itemsVisibles.length > 0 ? { ...l, items: itemsVisibles } : null
    })
    .filter(Boolean)

  const primeraRuta = (l) => (l.group ? l.items[0]?.to : l.to)
  const rutaInicio = primeraRuta(visibles[0]) || '/cuenta'

  // Grupos abiertos/cerrados en el menú. Se recuerda entre sesiones (localStorage);
  // si no hay preferencia guardada, un grupo nace abierto si la ruta actual pertenece
  // a él, para que no se oculte lo que se está viendo.
  const [gruposAbiertos, setGruposAbiertos] = useState(() => {
    let guardado = null
    try { guardado = JSON.parse(localStorage.getItem('gruposAbiertos') || 'null') } catch { /* ignorar json inválido */ }
    const abiertos = {}
    for (const l of links) {
      if (!l.group) continue
      abiertos[l.group] = guardado && l.group in guardado
        ? guardado[l.group]
        : l.items.some((it) => it.to === location.pathname)
    }
    return abiertos
  })
  const toggleGrupo = (group) =>
    setGruposAbiertos((g) => {
      const next = { ...g, [group]: !g[group] }
      localStorage.setItem('gruposAbiertos', JSON.stringify(next))
      return next
    })

  // Envuelve una página: si el usuario no puede verla, redirige al inicio.
  const protegida = (pagina, elemento) =>
    puede(pagina, 'ver') ? elemento : <Navigate to={rutaInicio} replace />

  return (
    <div className={`app ${colapsado ? 'sidebar-colapsado' : ''}`}>
      {/* Barra superior solo visible en móvil */}
      <header className="topbar">
        <button className="hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú">
          ☰
        </button>
        <span className="topbar-title">💰 Nómina</span>
      </header>

      {menuOpen && <div className="overlay" onClick={closeMenu} />}

      {/* Botón flotante para reabrir el menú en escritorio cuando está colapsado */}
      {colapsado && (
        <button className="sidebar-reabrir" onClick={toggleColapsado} aria-label="Mostrar menú" title="Mostrar menú">
          ☰
        </button>
      )}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <h1 className="logo">💰 Nómina</h1>
          <button
            className="sidebar-toggle"
            onClick={toggleColapsado}
            aria-label="Ocultar menú"
            title="Ocultar menú"
          >
            «
          </button>
        </div>
        <nav>
          {visibles.map((l) =>
            l.group ? (
              <div key={l.group}>
                <button
                  type="button"
                  className="nav-group-header"
                  onClick={() => toggleGrupo(l.group)}
                >
                  <span>{l.label}</span>
                  <span>{gruposAbiertos[l.group] ? '▾' : '▸'}</span>
                </button>
                {gruposAbiertos[l.group] && (
                  <div className="nav-group-items">
                    {l.items.map((it) => (
                      <NavLink key={it.to} to={it.to} className="navlink" onClick={closeMenu}>
                        {it.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={l.to} to={l.to} className="navlink" onClick={closeMenu}>
                {l.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user">👤 {usuario}</span>
          <button className="btn-logout" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="content">
        {error && (
          <div className="banner error">
            ⚠️ No se pudo conectar con el servidor. ¿Está corriendo? ({error})
          </div>
        )}
        {cargando && <div className="banner">Cargando datos…</div>}

        <Routes location={location}>
          <Route path="/" element={<Navigate to={rutaInicio} replace />} />
          <Route path="/inicio" element={protegida('inicio', <Dashboard />)} />
          <Route path="/nomina" element={protegida('nomina', <Nomina />)} />
          <Route path="/gestion-nomina" element={protegida('gestion-nomina', <GestionNomina />)} />
          <Route path="/productos" element={protegida('productos', <Productos />)} />
          <Route path="/clientes" element={protegida('clientes', <Clientes />)} />
          <Route path="/pedidos" element={protegida('pedidos', <Pedidos />)} />
          <Route path="/ventas" element={protegida('ventas', <Ventas />)} />
          <Route path="/materiales" element={protegida('materiales', <Materiales />)} />
          <Route path="/colores" element={protegida('colores', <Colores />)} />
          <Route path="/cortes-planos" element={protegida('cortes-planos', (
            <Suspense fallback={<div className="banner">Cargando módulo…</div>}>
              <CortesPlanos />
            </Suspense>
          ))} />
          <Route path="/gestion-produccion" element={protegida('gestion-produccion', <GestionProduccion />)} />
          <Route path="/produccion-dashboard" element={protegida('produccion-dashboard', <ProduccionDashboard />)} />
          <Route path="/empleados" element={protegida('empleados', <Empleados />)} />
          <Route path="/prestamos" element={protegida('prestamos', <Prestamos />)} />
          <Route path="/control-dinero" element={protegida('control-dinero', <ControlDinero />)} />
          <Route path="/historial" element={protegida('historial', <Historial />)} />
          <Route path="/reportes" element={protegida('reportes', <Reportes />)} />
          <Route path="/costos" element={protegida('costos', <Costos />)} />
          <Route path="/empresa" element={protegida('empresa', <Empresa />)} />
          <Route path="/usuarios" element={esAdmin ? <Usuarios /> : <Navigate to={rutaInicio} replace />} />
          <Route path="/cuenta" element={<Cuenta />} />
        </Routes>
      </main>
    </div>
  )
}
