import { construirMueble } from '../utils/construccionMueble.js'

export default function ListaHerrajes({ diseno, unidades = 1 }) {
  const c = construirMueble(diseno)
  if (c.avisos.length || !c.listaHerrajes?.length) return null
  return <section className="lista-herrajes"><h3>Lista de herrajes</h3>
    <p className="muted small">Cantidades para {unidades} {unidades === 1 ? 'mueble' : 'muebles'}. Los herrajes se compran aparte de los tableros.</p>
    <div className="table-wrap"><table className="table compact"><thead><tr><th>Herraje</th><th>Referencia</th><th>Medida</th><th>Cantidad</th></tr></thead>
      <tbody>{c.listaHerrajes.map((h, i) => <tr key={i}><td>{h.nombre}</td><td>{h.referencia || 'Por definir'}</td><td>{h.medida}</td><td>{h.cantidad * unidades}</td></tr>)}</tbody></table></div>
  </section>
}
