import { formatCOP } from '../utils/format.js'
import AsistenteBorrador, { DatosBorrador } from './AsistenteBorrador.jsx'

export default function AsistenteProducto({ onAplicar }) {
  return <AsistenteBorrador tipo="producto" etiqueta="Descripción del producto" onAplicar={onAplicar}
    placeholder="Armario de 2 puertas en MDF de 15 mm. Venta $850.000. Por armario: corte $20.000, consume 2 láminas MDF; armado $35.000, consume 40 tornillos. En armado verificar 2 puertas.">
    {(b) => <>
      <DatosBorrador filas={[
        ['Nombre', b.nombre], ['Descripción', b.descripcion || 'Sin descripción'],
        ['Valor de venta', b.valorVenta === null ? null : formatCOP(b.valorVenta)],
        ['Valor de compra', b.valorCompra === null ? null : formatCOP(b.valorCompra)],
        ['Stock de apertura', b.stockApertura], ['Mínimo de alerta', b.stockMinimo],
      ]} />
      {b.procesos.map((p, i) => <div className="asistente-producto-proceso" key={i}>
        <h4>{i + 1}. {p.nombre}{p.nuevo ? ' (nuevo)' : ''}</h4>
        <p>Pago por unidad: <strong>{p.pago === null ? 'Pendiente' : formatCOP(p.pago)}</strong></p>
        {p.materiales.length > 0 && <><strong>Materiales por producto</strong>
          <ul>{p.materiales.map((m, j) => <li key={j}>{m.nombre}: {m.cantidad ?? 'Cantidad pendiente'} {m.unidad}
            {m.materialId === null ? ' · Sin vincular al catálogo' : ''}</li>)}</ul>
        </>}
        {p.piezas.length > 0 && <><strong>Piezas a verificar</strong>
          <ul>{p.piezas.map((pz, j) => <li key={j}>{pz.nombre}: {pz.cantidad ?? 'Cantidad pendiente'}</li>)}</ul>
        </>}
      </div>)}
    </>}
  </AsistenteBorrador>
}
