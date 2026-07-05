import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { GraficoBarras, GraficoDona, COLOR } from '../components/Grafico.jsx'

export default function Dashboard() {
  const { getDashboard } = useData()
  const { usuario } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div>
        <h2>📊 Inicio</h2>
        <div className="banner error">No se pudo cargar el resumen: {error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div>
        <h2>📊 Inicio</h2>
        <div className="banner">Cargando resumen…</div>
      </div>
    )
  }

  return (
    <div>
      <h2>👋 Hola, {usuario}</h2>
      <p className="muted">Resumen general del sistema</p>

      {/* Tarjetas principales de dinero */}
      <div className="dash-grid">
        <div className="dash-card ingreso">
          <span className="dash-label">Ingresos de hoy</span>
          <strong className="dash-value">{formatCOP(data.ingresos)}</strong>
        </div>
        <div className="dash-card gasto">
          <span className="dash-label">Gastos de hoy</span>
          <strong className="dash-value">{formatCOP(data.gastos)}</strong>
        </div>
        <div className={`dash-card ${data.balance >= 0 ? 'saldo' : 'gasto'}`}>
          <span className="dash-label">Saldo en caja</span>
          <strong className="dash-value">{formatCOP(data.balance)}</strong>
        </div>
      </div>

      {/* Tarjetas secundarias */}
      <div className="dash-grid">
        <div className="dash-card mini">
          <span className="dash-label">Nómina del mes</span>
          <strong className="dash-value">{formatCOP(data.nominaMesTotal)}</strong>
          <span className="dash-sub">{data.nominaMesCantidad} pago(s)</span>
        </div>
        <div className="dash-card mini">
          <span className="dash-label">Préstamos por cobrar</span>
          <strong className="dash-value">{formatCOP(data.saldoPrestamos)}</strong>
          <span className="dash-sub">{data.prestamosActivos} activo(s)</span>
        </div>
        <div className="dash-card mini">
          <span className="dash-label">Empleados</span>
          <strong className="dash-value">{data.totalEmpleados}</strong>
        </div>
        <div className="dash-card mini">
          <span className="dash-label">Productos</span>
          <strong className="dash-value">{data.totalProductos}</strong>
        </div>
      </div>

      {/* Gráficas */}
      <div className="cards-grid">
        <div className="card">
          <h3>💵 Ingresos vs Gastos de hoy</h3>
          <GraficoDona
            moneda
            data={[
              { name: 'Ingresos', value: data.ingresos, color: COLOR.verde },
              { name: 'Gastos', value: data.gastos, color: COLOR.danger },
            ]}
          />
        </div>
        <div className="card">
          <h3>🧾 Últimos pagos por empleado</h3>
          <GraficoBarras
            moneda
            indice="empleado"
            series={[{ name: 'total', label: 'Total pagado', color: COLOR.primary }]}
            data={data.ultimasNominas.map((n) => ({
              empleado: n.empleado || '— (eliminado)',
              total: n.total,
            }))}
          />
        </div>
      </div>

      {/* Últimas nóminas */}
      <div className="card">
        <h3>🧾 Últimos pagos de nómina</h3>
        {data.ultimasNominas.length === 0 ? (
          <p className="muted">Aún no hay pagos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimasNominas.map((n) => (
                  <tr key={n.id}>
                    <td>{formatFecha(n.fecha)}</td>
                    <td>{n.empleado || '— (eliminado)'}</td>
                    <td className="num">{formatCOP(n.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
