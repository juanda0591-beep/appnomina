import { useState } from "react"
import { useData } from "../context/DataContext.jsx"
import { useAuth } from "../context/AuthContext.jsx"
import { formatCOP, formatFecha } from "../utils/format.js"
import { generarPdfNomina } from "../utils/pdf.js"
import { notify, confirmar } from "../utils/notify.js"

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
        <input
          type="text"
          placeholder="🔎 Buscar empleado, documento o cargo"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
          />

          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
          />

          <button onClick={limpiar}>Limpiar</button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          {puedeExportar && <button onClick={exportarExcel}>📊 Excel</button>}
        </div>
      </div>

      {/* ================= RESUMEN ================= */}
      <div className="card">
        <strong>Total registros:</strong> {filtrado.length}
        <br />
        <strong>Total pagado:</strong>{" "}
        {formatCOP(filtrado.reduce((a, b) => a + b.total, 0))}
      </div>

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

                <button onClick={() => reimprimir(n)}>📄 PDF</button>
                <button onClick={() => enviarWhatsApp(n)}>📱 WhatsApp</button>

                {puedeEliminar && (
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (
                        await confirmar(
                          "¿Eliminar este pago? (No se puede revertir)"
                        )
                      )
                        deleteNomina(n.id)
                    }}
                  >
                    Eliminar
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
      <div className="card" style={{ display: "flex", gap: 10 }}>
        <button
          disabled={pagina === 1}
          onClick={() => setPagina(pagina - 1)}
        >
          ⬅ Anterior
        </button>

        <span>
          Página {pagina} de {totalPaginas || 1}
        </span>

        <button
          disabled={pagina === totalPaginas}
          onClick={() => setPagina(pagina + 1)}
        >
          Siguiente ➡
        </button>
      </div>
    </div>
  )
}