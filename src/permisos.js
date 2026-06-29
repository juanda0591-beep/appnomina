// Catálogo central de páginas y acciones. Es la única fuente de verdad de los
// permisos: el front lo usa para pintar el menú, proteger rutas y ocultar botones,
// y el editor de Usuarios lo recorre para armar la matriz de checkboxes.
//
// Reglas fijas (no aparecen aquí porque no se configuran):
//  - 'admin' tiene TODO permitido siempre.
//  - 'usuarios' (gestión de cuentas) sigue siendo solo admin.
//  - 'cuenta' (Mi cuenta) está siempre disponible para el propio usuario.

export const PAGINAS = [
  { id: 'inicio', label: '🏠 Inicio', to: '/inicio', acciones: ['ver'] },
  { id: 'nomina', label: '🧾 Pago de Nómina', to: '/nomina', acciones: ['ver', 'crear'] },
  { id: 'productos', label: '📦 Productos', to: '/productos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  { id: 'empleados', label: '👷 Empleados', to: '/empleados', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  { id: 'prestamos', label: '💵 Préstamos', to: '/prestamos', acciones: ['ver', 'crear', 'eliminar'] },
  { id: 'control-dinero', label: '💰 Control de Dinero', to: '/control-dinero', acciones: ['ver', 'crear', 'eliminar'] },
  { id: 'historial', label: '📚 Historial', to: '/historial', acciones: ['ver', 'eliminar', 'exportar'] },
  { id: 'reportes', label: '📊 Reportes', to: '/reportes', acciones: ['ver', 'exportar'] },
  { id: 'costos', label: '💲 Costos', to: '/costos', acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'] },
  { id: 'empresa', label: '🏢 Empresa', to: '/empresa', acciones: ['ver', 'editar'] },
]

// Etiquetas legibles para las acciones (encabezados de la matriz)
export const ACCION_LABEL = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
}

// Todas las acciones posibles, en orden, para las columnas de la matriz
export const TODAS_ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'exportar']

// Objeto de permisos con TODO permitido (lo que recibe un usuario "con acceso amplio")
export function permisosCompletos() {
  const p = {}
  for (const pag of PAGINAS) {
    p[pag.id] = {}
    for (const a of pag.acciones) p[pag.id][a] = true
  }
  return p
}

// Objeto de permisos mínimo: solo ver el inicio (lo que recibe un usuario nuevo)
export function permisosVacios() {
  const p = {}
  for (const pag of PAGINAS) {
    p[pag.id] = {}
    for (const a of pag.acciones) p[pag.id][a] = false
  }
  p.inicio.ver = true
  return p
}

// Consulta segura: ¿el objeto de permisos permite (pagina, accion)?
// Si permisos es null/undefined se interpreta como "acceso amplio" (compatibilidad
// con usuarios creados antes de esta función).
export function puedeEn(permisos, pagina, accion) {
  if (!permisos) return true
  return !!(permisos[pagina] && permisos[pagina][accion])
}
