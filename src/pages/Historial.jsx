import { useState } from "react"
import { useData } from "../context/DataContext.jsx"
import { useAuth } from "../context/AuthContext.jsx"
import { formatCOP, formatFecha } from "../utils/format.js"
import { generarPdfNomina } from "../utils/pdf.js"
import { notify, confirmar } from "../utils/notify.js"
import Vacio from "../components/Vacio.jsx"

export default function Historial() {
  const { nominas, empresa, prestamos, getEmpleado, deleteNomina } = useData()
  const { puede } = useAuth()
  const puedeEliminar = puede("historial", "eliminar")
  const puedeExportar = puede("historial", "exportar")

  // Saldo actual (de hoy) de los préstamos pendientes de un empleado
  const saldoActualEmpleado = (empleadoId) =>
    prestamos
      .filter((p) => String(p.empleado_id) === String(empleadoId) && p.saldo > 0)
      .reduce((s, p) => s + p.saldo, 0)

  // =========================
  // ESTADOS FILTROS
  // =========================
  const [buscar, setBuscar] = useState("")
  const [fechaInicio, setFechaInicio] = useState("")
  const [fechaFin, setFechaFin] = useState("")
  const [pagina, setPagina] = useState(1)

  const porPagina = 8

  // =========================
  // FILTRADO PRINCIPAL
  // =========================
  const filtrado = nominas
    .filter((n) => {
      const emp = getEmpleado(n.empleadoId)

      const matchTexto =
        emp?.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
        emp?.documento?.includes(buscar) ||
        emp?.cargo?.toLowerCase().includes(buscar.toLowerCase())

      const fecha = new Date(n.fecha)
      const desde = fechaInicio ? fecha >= new Date(fechaInicio) : true
      const hasta = fechaFin ? fecha <= new Date(fechaFin) : true

      return matchTexto && desde && hasta
    })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  // =========================
  // PAGINACIÓN
  // =========================
  const totalPaginas = Math.ceil(filtrado.length / porPagina)

  const datosPagina = filtrado.slice(
    (pagina - 1) * porPagina,
    pagina * porPagina
  )

  // =========================
  // PDF INDIVIDUAL
  // =========================
  const reimprimir = (n) => {
    const empleado = getEmpleado(n.empleadoId)
    generarPdfNomina({ ...n, empleado, empresa })
  }

  // =========================
  // WHATSAPP
  // =========================
  const enviarWhatsApp = (n) => {
    const emp = getEmpleado(n.empleadoId)

    const mensaje =
      `*COMPROBANTE DE PAGO*\n\n` +
      `Empleado: ${emp?.nombre}\n` +
      `Documento: ${emp?.documento}\n` +
      `Cargo: ${emp?.cargo}\n\n` +
      `Fecha: ${formatFecha(n.fecha)}\n` +
      `Total: ${formatCOP(n.total)}\n\n` +
      `Gracias por tu trabajo.`

    const telefono = emp?.telefono || ""

    if (!telefono) {
      notify.error("El empleado no tiene número de WhatsApp")
      return
    }

    window.open(
      `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
      "_blank"
    )
  }

  // =========================
  // EXPORTAR CSV (EXCEL)
  // =========================
  const exportarExcel = () => {
    let csv =
      "Comprobante,Fecha,Empleado,Documento,Cargo,Subtotal,Descuentos,Total\n"

    filtrado.forEach((n) => {
      const emp = getEmpleado(n.empleadoId)

      csv += `${n.id},${n.fecha},${emp?.nombre || ""},${emp?.documento || ""},${
        emp?.cargo || ""
      },${n.subtotal},${n.totalDescuentos},${n.total}\n`
    })

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "historial_nomina.csv"
    a.click()
  }

  // =========================
  // LIMPIAR FILTROS
  // =========================
  const limpiar = () => {
    setBuscar("")
    setFechaInicio("")
    setFechaFin("")
    setPagina(1)
  }

  return (
    <div>
      <h2>📚 Historial de pagos</h2>

      {/* ================= FILTROS ================= */}
      <div className="card">
        <label htmlFor="historial-buscar">Buscar</label>
        <input
          id="historial-buscar"
          type="text"
          placeholder="🔎 Buscar empleado, documento o cargo"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />

        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="historial-desde">Desde</label>
            <input
              id="historial-desde"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="historial-hasta">Hasta</label>
            <input
              id="historial-hasta"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={limpiar}>Limpiar</button>
        </div>

        {puedeExportar && (
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={exportarExcel}>📊 Excel</button>
          </div>
        )}
      </div>

      {/* ================= RESUMEN ================= */}
      <div className="cards-grid">
        <div className="stat-card">
          <span className="stat-label">Total registros</span>
          <span className="stat-value">{filtrado.length}</span>
        </div>
        <div className="stat-card highlight">
          <span className="stat-label">Total pagado</span>
          <span className="stat-value">{formatCOP(filtrado.reduce((a, b) => a + b.total, 0))}</span>
        </div>
      </div>

      {filtrado.length === 0 && (
        <Vacio icono="📚" titulo="Sin pagos registrados">
          Ajusta la búsqueda o el rango de fechas, o registra un pago desde Pago de Nómina.
        </Vacio>
      )}

      {/* ================= LISTA ================= */}
      {datosPagina.map((n) => {
        const emp = getEmpleado(n.empleadoId)

        return (
          <div className="card" key={n.id}>
            {/* HEADER */}
            <div className="list-item">
              <div>
                <strong>{emp?.nombre || "Empleado eliminado"}</strong>

                <div className="muted small">
                  CC: {emp?.documento} | {emp?.cargo}
                </div>

                <div className="muted small">
                  📅 {formatFecha(n.fecha)} | 🧾 {n.id}
                </div>
              </div>

              <div className="actions">
                <span className="total-badge">
                  {formatCOP(n.total)}
                </span>

                <button className="btn-secondary btn-sm" onClick={() => reimprimir(n)}>📄 PDF</button>
                <button className="btn-secondary btn-sm" onClick={() => enviarWhatsApp(n)}>📱 WhatsApp</button>

                {puedeEliminar && (
                  <button
                    className="btn-danger btn-sm"
                    onClick={async () => {
                      if (
                        await confirmar(
                          "¿Eliminar este pago? (No se puede revertir)"
                        )
                      )
                        deleteNomina(n.id)
                    }}
                  >
                    🗑 Eliminar
                  </button>
                )}
              </div>
            </div>

            {/* TABLA DETALLE */}
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Proceso</th>
                    <th>Cant</th>
                    <th>Pago</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>

                <tbody>
                  {n.items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.productoNombre}</td>
                      <td>{it.procesoNombre}</td>
                      <td>{it.cantidad}</td>
                      <td>{formatCOP(it.pago)}</td>
                      <td>{formatCOP(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* DESGLOSE */}
            <div className="muted small" style={{ marginTop: 10 }}>
              Subtotal: {formatCOP(n.subtotal)} <br />
              {n.descuentos?.length > 0 ? (
                n.descuentos.map((d, i) => (
                  <span key={i}>
                    {d.descripcion || "Préstamo"}: -{formatCOP(d.monto)} <br />
                  </span>
                ))
              ) : (
                <>Descuentos: -{formatCOP(n.totalDescuentos || 0)} <br /></>
              )}
              <strong>Total: {formatCOP(n.total)}</strong>
              {emp && (
                <div style={{ marginTop: 6 }}>
                  💳 Saldo de préstamos (hoy):{" "}
                  <strong>{formatCOP(saldoActualEmpleado(n.empleadoId))}</strong>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* ================= PAGINACIÓN ================= */}
      {filtrado.length > 0 && (
        <div className="card actions">
          <button
            className="btn-secondary btn-sm"
            disabled={pagina === 1}
            onClick={() => setPagina(pagina - 1)}
          >
            ⬅ Anterior
          </button>

          <span className="muted small">
            Página {pagina} de {totalPaginas || 1}
          </span>

          <button
            className="btn-secondary btn-sm"
            disabled={pagina === totalPaginas}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguiente ➡
          </button>
        </div>
      )}
    </div>
  )
}