// Estado vacío reutilizable: un icono grande y un mensaje, para cuando una lista
// o sección no tiene datos todavía. Reemplaza los <p className="muted">No hay…</p>.
export default function Vacio({ icono = '📭', titulo, children }) {
  return (
    <div className="vacio">
      <span className="vacio-icono">{icono}</span>
      {titulo && <p className="vacio-titulo">{titulo}</p>}
      {children && <p className="vacio-sub">{children}</p>}
    </div>
  )
}
