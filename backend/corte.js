// Motor de optimización de corte tipo GUILLOTINA para láminas de melamina/MDF.
//
// Por qué guillotina y no "nesting libre": una sierra escuadradora solo hace cortes
// rectos de borde a borde. Un empaquetado libre puede dejar una pieza rodeada por
// otras sin ningún corte recto que la libere: se ve bien en pantalla pero es imposible
// de cortar. Guillotina garantiza que cada pieza sale con cortes rectos sucesivos.
//
// Para bajar el desperdicio se prueban VARIAS pasadas (distintos ordenamientos y
// sentidos del primer corte) y se elige la mejor. Si NINGUNA pieza tiene veta
// obligatoria (todas permiten rotar), también se prueba la lámina volteada 90°.

// Divide un espacio libre tras colocar una pieza en su esquina inferior-izquierda.
// `direccion` fuerza el primer corte: 'auto' parte por el eje que deje el mayor
// fragmento entero; 'vertical'/'horizontal' fijan el sentido (otra estrategia a probar).
function dividirLibre(libre, pieza, sierra, direccion) {
  const restanteDerecha = libre.ancho - pieza.ancho - sierra
  const restanteArriba = libre.largo - pieza.largo - sierra
  const nuevos = []
  const cortarVertical =
    direccion === 'vertical' ? true
      : direccion === 'horizontal' ? false
        : restanteDerecha >= restanteArriba
  if (cortarVertical) {
    // Franja derecha a lo alto completo del libre; franja superior solo sobre la pieza.
    if (restanteDerecha > 0)
      nuevos.push({ x: libre.x + pieza.ancho + sierra, y: libre.y, ancho: restanteDerecha, largo: libre.largo })
    if (restanteArriba > 0)
      nuevos.push({ x: libre.x, y: libre.y + pieza.largo + sierra, ancho: pieza.ancho, largo: restanteArriba })
  } else {
    if (restanteArriba > 0)
      nuevos.push({ x: libre.x, y: libre.y + pieza.largo + sierra, ancho: libre.ancho, largo: restanteArriba })
    if (restanteDerecha > 0)
      nuevos.push({ x: libre.x + pieza.ancho + sierra, y: libre.y, ancho: restanteDerecha, largo: pieza.largo })
  }
  return nuevos
}

// ¿Cabe la pieza (ancho x largo) en el espacio libre?
function cabe(libre, ancho, largo) {
  return ancho <= libre.ancho + 1e-6 && largo <= libre.largo + 1e-6
}

// Coloca una pieza en una lámina abierta: prueba normal y (si la veta lo permite)
// rotada 90°, y elige el hueco donde mejor encaje (menor área sobrante).
function colocarEnLamina(lamina, pieza, sierra, direccion) {
  let mejor = null
  for (let i = 0; i < lamina.libres.length; i++) {
    const libre = lamina.libres[i]
    if (cabe(libre, pieza.ancho, pieza.largo)) {
      const sobra = libre.ancho * libre.largo - pieza.ancho * pieza.largo
      if (!mejor || sobra < mejor.sobra) mejor = { i, rotada: false, sobra }
    }
    if (pieza.permiteRotar && cabe(libre, pieza.largo, pieza.ancho)) {
      const sobra = libre.ancho * libre.largo - pieza.ancho * pieza.largo
      if (!mejor || sobra < mejor.sobra) mejor = { i, rotada: true, sobra }
    }
  }
  if (!mejor) return null
  const libre = lamina.libres[mejor.i]
  const anchoUsado = mejor.rotada ? pieza.largo : pieza.ancho
  const largoUsado = mejor.rotada ? pieza.ancho : pieza.largo
  const colocada = {
    nombre: pieza.nombre, codigo: pieza.codigo, x: libre.x, y: libre.y,
    ancho: anchoUsado, largo: largoUsado, rotada: mejor.rotada,
    material: pieza.material, color: pieza.color,
  }
  lamina.piezas.push(colocada)
  lamina.libres.splice(mejor.i, 1, ...dividirLibre(libre, { ancho: anchoUsado, largo: largoUsado }, sierra, direccion))
  return colocada
}

// Ejecuta UNA pasada: coloca todas las piezas (ya ordenadas) en láminas de tamaño
// (anchoL x largoL). Devuelve las láminas usadas y las piezas que no cupieron.
function empaquetar(piezasOrdenadas, anchoL, largoL, sierra, direccion) {
  const laminas = []
  const sinCabida = []
  for (const pieza of piezasOrdenadas) {
    const cabeEnLamina =
      (pieza.ancho <= anchoL && pieza.largo <= largoL) ||
      (pieza.permiteRotar && pieza.largo <= anchoL && pieza.ancho <= largoL)
    if (!cabeEnLamina) { sinCabida.push(pieza); continue }
    let ok = false
    for (const lam of laminas) {
      if (colocarEnLamina(lam, pieza, sierra, direccion)) { ok = true; break }
    }
    if (!ok) {
      const nueva = { piezas: [], libres: [{ x: 0, y: 0, ancho: anchoL, largo: largoL }] }
      colocarEnLamina(nueva, pieza, sierra, direccion)
      laminas.push(nueva)
    }
  }
  return { laminas, sinCabida }
}

// Área del mayor retazo rectangular libre (sirve para desempatar: entre dos planos
// con igual número de láminas, es mejor el que deja un sobrante grande reutilizable).
function mayorRetazo(laminas) {
  let mejor = { ancho: 0, largo: 0, area: 0 }
  for (const lam of laminas) {
    for (const l of lam.libres || []) {
      const area = l.ancho * l.largo
      if (area > mejor.area) mejor = { ancho: l.ancho, largo: l.largo, area }
    }
  }
  return mejor
}

// Ordenamientos a probar (cada uno define una estructura de empaque distinta).
const ORDENES = {
  ladoLargo: (a, b) => Math.max(b.ancho, b.largo) - Math.max(a.ancho, a.largo),
  area: (a, b) => b.ancho * b.largo - a.ancho * a.largo,
  alto: (a, b) => b.largo - a.largo,
  ancho: (a, b) => b.ancho - a.ancho,
}
const DIRECCIONES = ['auto', 'vertical', 'horizontal']

// ¿El candidato A es mejor que B? Menos piezas sin cabida, luego menos láminas,
// y a igualdad, mayor retazo reutilizable.
function esMejor(a, b) {
  if (!b) return true
  if (a.sinCabida.length !== b.sinCabida.length) return a.sinCabida.length < b.sinCabida.length
  if (a.laminas.length !== b.laminas.length) return a.laminas.length < b.laminas.length
  return a.retazo.area > b.retazo.area
}

// Optimiza el corte de piezas de UN mismo material/espesor sobre láminas de tamaño
// fijo. Prueba varias estrategias (ordenamientos × sentido de corte, y la lámina
// volteada si ninguna pieza tiene veta obligatoria) y devuelve la mejor.
//
// piezas: [{ nombre, codigo, ancho, largo|alto, cantidad, permiteRotar, material, color }]
// lamina: { ancho, largo, espesor, costo }
// opciones: { sierra } separación de corte (grosor del disco), en mm
export function optimizarCorte(piezas, lamina, opciones = {}) {
  const sierra = Number(opciones.sierra) || 0

  // Expande cantidades: 3 entrepaños iguales => 3 piezas individuales.
  const expandidas = []
  for (const p of piezas) {
    const n = Math.max(1, Number(p.cantidad) || 1)
    for (let i = 0; i < n; i++) {
      expandidas.push({
        nombre: p.nombre, codigo: p.codigo,
        ancho: Number(p.ancho),
        largo: Number(p.alto != null ? p.alto : p.largo),
        permiteRotar: p.permiteRotar !== false && p.permiteRotar !== 0,
        material: p.material || '', color: p.color || '',
      })
    }
  }

  // Solo se puede voltear la lámina si NINGUNA pieza tiene veta obligatoria:
  // girar la lámina gira el grano, algo imposible en melamina con textura.
  const todasRotan = expandidas.every((p) => p.permiteRotar)
  const orientaciones = todasRotan && lamina.ancho !== lamina.largo
    ? [{ ancho: lamina.ancho, largo: lamina.largo, girada: false },
       { ancho: lamina.largo, largo: lamina.ancho, girada: true }]
    : [{ ancho: lamina.ancho, largo: lamina.largo, girada: false }]

  let mejor = null
  for (const orient of orientaciones) {
    for (const nombreOrden of Object.keys(ORDENES)) {
      const ordenadas = [...expandidas].sort(ORDENES[nombreOrden])
      for (const dir of DIRECCIONES) {
        const { laminas, sinCabida } = empaquetar(ordenadas, orient.ancho, orient.largo, sierra, dir)
        const cand = { laminas, sinCabida, orient, retazo: mayorRetazo(laminas) }
        if (esMejor(cand, mejor)) mejor = cand
      }
    }
  }

  const { laminas, sinCabida, orient } = mejor
  const areaTotal = orient.ancho * orient.largo * laminas.length
  const areaUtil = laminas.reduce(
    (s, lam) => s + lam.piezas.reduce((ss, p) => ss + p.ancho * p.largo, 0), 0
  )
  const desperdicioPct = areaTotal > 0 ? ((areaTotal - areaUtil) / areaTotal) * 100 : 0

  return {
    lamina: {
      ancho: orient.ancho, largo: orient.largo, girada: orient.girada,
      espesor: lamina.espesor, costo: Number(lamina.costo) || 0,
    },
    laminas: laminas.map((lam, idx) => ({ indice: idx + 1, piezas: lam.piezas })),
    cantidadLaminas: laminas.length,
    areaUtil, areaTotal,
    desperdicioPct: Math.round(desperdicioPct * 10) / 10,
    costoTotal: laminas.length * (Number(lamina.costo) || 0),
    retazoMayor: { ancho: Math.round(mejor.retazo.ancho), largo: Math.round(mejor.retazo.largo) },
    sinCabida: sinCabida.map((p) => ({ nombre: p.nombre, ancho: p.ancho, largo: p.largo })),
  }
}
