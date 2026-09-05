import { formatCOP } from '../utils/format.js'
import AsistenteBorrador, { DatosBorrador } from './AsistenteBorrador.jsx'

export default function AsistenteMaterial({ onAplicar, colores }) {
  return <AsistenteBorrador tipo="material" etiqueta="Descripción del material" onAplicar={onAplicar}
    placeholder="Lámina MDF de 15 mm, 183 x 244 cm, costo por lámina $95.000, stock inicial 12, mínimo 3.">
    {(b) => <DatosBorrador filas={[
      ['Nombre', b.nombre], ['Unidad', b.unidad],
      ['Costo unitario', b.costoUnitario === null ? null : formatCOP(b.costoUnitario)],
      ['Stock inicial', b.stockInicial], ['Stock mínimo', b.stockMinimo],
      ['Familia', b.familia || 'Sin familia'],
      ['Color', colores.find((c) => c.id === b.colorId)?.nombre || 'Sin color'],
    ]} />}
  </AsistenteBorrador>
}
