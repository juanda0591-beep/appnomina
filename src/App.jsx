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
import Empresa from './pages/Empresa.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Cuenta from './pages/Cuenta.jsx'
import { useData } from './context/DataContext.jsx'
import { useAuth } from './context/AuthContext.jsx'

// Cada enlace puede pedir rol 'admin'. Sin rol → visible para todos.
const links = [
  { to: '/inicio', label: '🏠 Inicio' },
  { to: '/nomina', label: '🧾 Pago de Nómina' },
  { to: '/productos', label: '📦 Productos' },
  { to: '/empleados', label: '👷 Empleados' },
  { to: '/prestamos', label: '💵 Préstamos' },
  { to: '/control-dinero', label: '💰 Control de Dinero' },
  { to: '/historial', label: '📚 Historial' },
  { to: '/reportes', label: '📊 Reportes' },
  { to: '/empresa', label: '🏢 Empresa' },
  { to: '/usuarios', label: '👥 Usuarios', rol: 'admin' },
  { to: '/cuenta', label: '🔒 Mi cuenta' },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { cargando, error } = useData()
  const { usuario, rol, logout } = useAuth()
  const location = useLocation()

  // cerrar el menú al cambiar de página (móvil)
  const closeMenu = () => setMenuOpen(false)

  // Oculta los enlaces que exigen un rol que el usuario no tiene
  const visibles = links.filter((l) => !l.rol || l.rol === rol)
  const esAdmin = rol === 'admin'

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
          <Route path="/" element={<Dashboard />} />
          <Route path="/inicio" element={<Dashboard />} />
          <Route path="/nomina" element={<Nomina />} />
          <Route path="/productos" element={<Productos />} />
          <Route path="/empleados" element={<Empleados />} />
          <Route path="/prestamos" element={<Prestamos />} />
          <Route path="/control-dinero" element={<ControlDinero />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/empresa" element={<Empresa />} />
          <Route path="/usuarios" element={esAdmin ? <Usuarios /> : <Navigate to="/inicio" replace />} />
          <Route path="/cuenta" element={<Cuenta />} />
        </Routes>
      </main>
    </div>
  )
}
