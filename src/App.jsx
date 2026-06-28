import { useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Productos from './pages/Productos.jsx'
import Empleados from './pages/Empleados.jsx'
import Prestamos from './pages/Prestamos.jsx'
import Nomina from './pages/Nomina.jsx'
import ControlDinero from './pages/ControlDinero.jsx'
import Historial from './pages/Historial.jsx'
import Reportes from './pages/Reportes.jsx'
import Empresa from './pages/Empresa.jsx'
import Cuenta from './pages/Cuenta.jsx'
import { useData } from './context/DataContext.jsx'
import { useAuth } from './context/AuthContext.jsx'

const links = [
  { to: '/nomina', label: '🧾 Pago de Nómina' },
  { to: '/productos', label: '📦 Productos' },
  { to: '/empleados', label: '👷 Empleados' },
  { to: '/prestamos', label: '💵 Préstamos' },
  { to: '/control-dinero', label: '💰 Control de Dinero' },
  { to: '/historial', label: '📚 Historial' },
  { to: '/reportes', label: '📊 Reportes' },
  { to: '/empresa', label: '🏢 Empresa' },
  { to: '/cuenta', label: '🔒 Mi cuenta' },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { cargando, error } = useData()
  const { usuario, logout } = useAuth()
  const location = useLocation()

  // cerrar el menú al cambiar de página (móvil)
  const closeMenu = () => setMenuOpen(false)

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
          {links.map((l) => (
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
          <Route path="/" element={<Nomina />} />
          <Route path="/nomina" element={<Nomina />} />
          <Route path="/productos" element={<Productos />} />
          <Route path="/empleados" element={<Empleados />} />
          <Route path="/prestamos" element={<Prestamos />} />
          <Route path="/control-dinero" element={<ControlDinero />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/empresa" element={<Empresa />} />
          <Route path="/cuenta" element={<Cuenta />} />
        </Routes>
      </main>
    </div>
  )
}
