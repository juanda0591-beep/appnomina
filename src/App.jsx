import { useState } from 'react'
import { NavLink, Route, Routes, useLocation, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Productos from './pages/Productos.jsx'
import Empleados from './pages/Empleados.jsx'
import Prestamos from './pages/Prestamos.jsx'
import Nomina from './pages/Nomina.jsx'
import ControlDinero from './pages/ControlDinero.jsx'
import Historial from './pages/Historial.jsx'
import Reportes from './pages/Reportes.jsx'
import Costos from './pages/Costos.jsx'
import Empresa from './pages/Empresa.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Cuenta from './pages/Cuenta.jsx'
import { useData } from './context/DataContext.jsx'
import { useAuth } from './context/AuthContext.jsx'

// Enlaces del menú. `pagina` se cruza con los permisos del usuario (puede(pagina,'ver')).
// `solo` marca enlaces de regla fija: 'admin' (gestión de usuarios) o 'todos' (Mi cuenta).
const links = [
  { to: '/inicio', label: '🏠 Inicio', pagina: 'inicio' },
  { to: '/nomina', label: '🧾 Pago de Nómina', pagina: 'nomina' },
  { to: '/productos', label: '📦 Productos', pagina: 'productos' },
  { to: '/empleados', label: '👷 Empleados', pagina: 'empleados' },
  { to: '/prestamos', label: '💵 Préstamos', pagina: 'prestamos' },
  { to: '/control-dinero', label: '💰 Control de Dinero', pagina: 'control-dinero' },
  { to: '/historial', label: '📚 Historial', pagina: 'historial' },
  { to: '/reportes', label: '📊 Reportes', pagina: 'reportes' },
  { to: '/costos', label: '💲 Costos', pagina: 'costos' },
  { to: '/empresa', label: '🏢 Empresa', pagina: 'empresa' },
  { to: '/usuarios', label: '👥 Usuarios', solo: 'admin' },
  { to: '/cuenta', label: '🔒 Mi cuenta', solo: 'todos' },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { cargando, error } = useData()
  const { usuario, rol, puede, logout } = useAuth()
  const location = useLocation()

  // cerrar el menú al cambiar de página (móvil)
  const closeMenu = () => setMenuOpen(false)

  const esAdmin = rol === 'admin'

  // Filtra el menú: 'admin' solo para administradores; 'todos' siempre visible;
  // el resto según el permiso de ver la página.
  const visibles = links.filter((l) => {
    if (l.solo === 'admin') return esAdmin
    if (l.solo === 'todos') return true
    return puede(l.pagina, 'ver')
  })
    const rutaInicio = visibles[0]?.to || '/cuenta'

  // Envuelve una página: si el usuario no puede verla, redirige al inicio.
    const protegida = (pagina, elemento) =>
    puede(pagina, 'ver') ? elemento : <Navigate to={rutaInicio} replace />

  return (
    <div className="app">
      {/* Barra superior solo visible en móvil */}
      <header className="topbar">
        <button className="hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú">
          ☰
        </button>
        <span className="topbar-title">💰 Nómina</span>
      </header>

      {menuOpen && <div className="overlay" onClick={closeMenu} />}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <h1 className="logo">💰 Nómina</h1>
        <nav>
          {visibles.map((l) => (
            <NavLink key={l.to} to={l.to} className="navlink" onClick={closeMenu}>
              {l.label}
            </NavLink>
          ))}
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
          <Route path="/productos" element={protegida('productos', <Productos />)} />
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
