import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { GraficoBarras, GraficoDona, COLOR } from '../components/Grafico.jsx'
import { NumeroAnimado, Anillo } from '../components/dashboardWidgets.jsx'
import Vacio from '../components/Vacio.jsx'

// Calcula la variación porcentual de hoy vs ayer para el badge de tendencia.
function calcTendencia(hoy, ayer) {
  if (ayer > 0) {
    const pct = ((hoy - ayer) / ayer) * 100
    return { dir: pct >= 0 ? 'up' : 'down', texto: `${pct >= 0 ? '+' : ''}${Math.round(pct)}% vs ayer` }
  }
  if (hoy > 0) return { dir: 'up', texto: 'Nuevo hoy' }
  return { dir: 'flat', texto: 'Sin cambios' }
}

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

  const hoyLargo = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  // % de los ingresos de hoy que se llevaron los gastos (para el anillo del saldo)
  const pctGasto = data.ingresos > 0 ? (data.gastos / data.ingresos) * 100 : 0
  const tendIngresos = calcTendencia(data.ingresos, data.ingresosAyer)
  const tendGastos = calcTendencia(data.gastos, data.gastosAyer)

  return (
    <div>
      <div className="dash-hero">
        <div>
          <h2>👋 Hola, {usuario}</h2>
          <p className="muted">Resumen general del sistema</p>
        </div>
        <span className="dash-fecha">📅 {hoyLargo}</span>
      </div>

      {/* Tarjetas principales de dinero */}
      <div className="dash-grid">
        <div className="dash-card ingreso">
          <div className="dash-card-head">
            <span className="dash-icon">💵</span>
            <span className={`dash-trend ${tendIngresos.dir}`}>{tendIngresos.texto}</span>
          </div>
          <span className="dash-label">Ingresos de hoy</span>
          <strong className="dash-value"><NumeroAnimado valor={data.ingresos} moneda /></strong>
        </div>
        <div className="dash-card gasto">
          <div className="dash-card-head">
            <span className="dash-icon">📉</span>
            <span className={`dash-trend ${tendGastos.dir}`}>{tendGastos.texto}</span>
          </div>
          <span className="dash-label">Gastos de hoy</span>
          <strong className="dash-value"><NumeroAnimado valor={data.gastos} moneda /></strong>
        </div>
        <div className={`dash-card ${data.balance >= 0 ? 'saldo' : 'gasto'}`}>
          <div className="dash-saldo-body">
            <div>
              <span className="dash-label">Saldo en caja</span>
              <strong className="dash-value"><NumeroAnimado valor={data.balance} moneda /></strong>
            </div>
            <Anillo porcentaje={pctGasto} />
          </div>
        </div>
      </div>

      {/* Tarjetas secundarias */}
      <div className="dash-grid">
        <div className="dash-card mini">
          <span className="dash-icon">🧾</span>
          <span className="dash-label">Nómina del mes</span>
          <strong className="dash-value"><NumeroAnimado valor={data.nominaMesTotal} moneda /></strong>
          <span className="dash-sub">{data.nominaMesCantidad} pago(s)</span>
        </div>
        <div className="dash-card mini">
          <span className="dash-icon">💵</span>
          <span className="dash-label">Préstamos por cobrar</span>
          <strong className="dash-value"><NumeroAnimado valor={data.saldoPrestamos} moneda /></strong>
          <span className="dash-sub">{data.prestamosActivos} activo(s)</span>
        </div>
        <div className="dash-card mini">
          <span className="dash-icon">👷</span>
          <span className="dash-label">Empleados</span>
          <strong className="dash-value"><NumeroAnimado valor={data.totalEmpleados} /></strong>
        </div>
        <div className="dash-card mini">
          <span className="dash-icon">📦</span>
          <span className="dash-label">Productos</span>
          <strong className="dash-value"><NumeroAnimado valor={data.totalProductos} /></strong>
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
          <Vacio icono="🧾" titulo="Aún no hay pagos registrados">
            Los pagos de nómina aparecerán aquí.
          </Vacio>
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
