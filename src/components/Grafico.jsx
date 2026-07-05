import { BarChart, DonutChart } from '@mantine/charts'
import { formatCOP } from '../utils/format.js'

// Colores de marca (mismos de :root en index.css)
export const COLOR = {
  primary: '#2563eb',
  danger: '#dc2626',
  verde: '#16a34a',
  gris: '#94a3b8',
}

// Formatea el valor del tooltip/eje. `moneda` -> COP; si no, número tal cual.
const fmtValor = (moneda) => (v) => (moneda ? formatCOP(v) : String(v))

// Gráfico de barras genérico.
// - data: array de objetos
// - indice: clave del eje (ej: 'nombre')
// - series: [{ name: 'clave', color: '#...' }]
// - moneda: si true, formatea los valores como pesos
// - horizontal: orientación de las barras
export function GraficoBarras({ data, indice, series, moneda = false, horizontal = false, alto = 260 }) {
  if (!data || data.length === 0) return <p className="muted small">Sin datos para graficar.</p>
  return (
    <BarChart
      h={alto}
      data={data}
      dataKey={indice}
      series={series}
      orientation={horizontal ? 'vertical' : 'horizontal'}
      valueFormatter={fmtValor(moneda)}
      tickLine="y"
      gridAxis="xy"
      withLegend={series.length > 1}
    />
  )
}

// Gráfico de dona (torta con centro hueco).
// - data: [{ name, value, color }]
// - moneda: formatea los valores como pesos
export function GraficoDona({ data, moneda = false, alto = 220 }) {
  const total = (data || []).reduce((s, d) => s + Number(d.value || 0), 0)
  if (!data || total === 0) return <p className="muted small">Sin datos para graficar.</p>
  return (
    <DonutChart
      h={alto}
      data={data}
      withLabelsLine
      withLabels
      tooltipDataSource="segment"
      valueFormatter={fmtValor(moneda)}
    />
  )
}
