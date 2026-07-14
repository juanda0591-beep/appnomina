import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { formatCOP } from '../utils/format.js'
import { GraficoBarras, COLOR } from '../components/Grafico.jsx'
import { NumeroAnimado } from '../components/dashboardWidgets.jsx'
import Vacio from '../components/Vacio.jsx'

export default function ProduccionDashboard() {
  const { getProduccionDashboard } = useData()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getProduccionDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div>
        <h2>🏭 Dashboard de Producción</h2>
        <div className="banner error">No se pudo cargar el resumen: {error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div>
        <h2>🏭 Dashboard de Producción</h2>
        <div className="banner">Cargando resumen…</div>
      </div>
    )
  }

  const cuello = data.cuelloBotella?.[0] || null

  return (
    <div>
      <div className="dash-hero">
        <div>
          <h2>🏭 Dashboard de Producción</h2>
          <p className="muted">Resumen de la fabricación del mes en curso</p>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="dash-grid">
        <div className="dash-card">
          <span className="dash-icon">📋</span>
          <span className="dash-label">Órdenes activas</span>
          <strong className="dash-value"><NumeroAnimado valor={data.ordenesActivas} /></strong>
        </div>
        <div className="dash-card">
          <span className="dash-icon">✓</span>
          <span className="dash-label">Terminadas (mes)</span>
          <strong className="dash-value"><NumeroAnimado valor={data.ordenesTerminadasMes} /></strong>
        </div>
        <div className="dash-card">
          <span className="dash-icon">📦</span>
          <span className="dash-label">Unidades producidas (mes)</span>
          <strong className="dash-value"><NumeroAnimado valor={data.unidadesMes} /></strong>
        </div>
        <div className="dash-card">
          <span className="dash-icon">📉</span>
          <span className="dash-label">Merma promedio (mes)</span>
          <strong className="dash-value">{data.mermaPromedio.toFixed(1)}%</strong>
        </div>
        <div className="dash-card">
          <span className="dash-icon">💵</span>
          <span className="dash-label">Costo real producido (mes)</span>
          <strong className="dash-value"><NumeroAnimado valor={data.costoRealMes} moneda /></strong>
        </div>
      </div>

      {/* Cuello de botella */}
      <div className="cards-grid">
        <div className="card">
          <h3>🚧 Cuello de botella</h3>
          <p className="muted small">
            Procesos con más tareas sin terminar en órdenes activas. Es donde se está trabando la producción.
          </p>
          {(!data.cuelloBotella || data.cuelloBotella.length === 0) ? (
            <Vacio icono="✓" titulo="Sin cuellos de botella">
              No hay procesos pendientes en órdenes activas.
            </Vacio>
          ) : (
            <>
              {cuello && (
                <p className="muted small">
                  Mayor traba: <strong>{cuello.proceso}</strong> con {cuello.tareas} tarea(s) sin terminar.
                </p>
              )}
              <GraficoBarras
                indice="proceso"
                series={[{ name: 'tareas', label: 'Tareas pendientes', color: COLOR.danger }]}
                data={data.cuelloBotella}
              />
            </>
          )}
        </div>

        <div className="card">
          <h3>📦 Unidades por producto (mes)</h3>
          {(!data.unidadesPorProducto || data.unidadesPorProducto.length === 0) ? (
            <Vacio icono="📦" titulo="Sin producción este mes">
              Aún no hay órdenes terminadas en el mes.
            </Vacio>
          ) : (
            <GraficoBarras
              indice="producto"
              series={[{ name: 'unidades', label: 'Unidades', color: COLOR.primary }]}
              data={data.unidadesPorProducto}
            />
          )}
        </div>
      </div>
    </div>
  )
}
