import { clavePanel, espesorPanel, terminarFabricacion } from './fabricacionMDF.js'

// Construcción configurable v2. Una sola geometría alimenta despiece, 3D y planos.
// Entradas de mueble/posición en cm; espesores, holguras y vuelos en mm.
const numero = (v) => v === '' || v == null || typeof v === 'boolean' ? NaN : Number(v)
const mm = (v) => Math.round(numero(v) * 10)
const redondear = (v) => Math.round(v * 100) / 100
export const tableroConfig = () => ({ montaje: 'entre', izquierda: 0, derecha: 0, frente: 0, atras: 0 })
export const cajonConfig = () => ({ inicio: 0, riel: 'sin', holguraLateral: 2, largoRiel: '',
  profundidad: '', retiroFrontal: 3, holguraTrasera: 10, holguraVertical: 12, fondoMontaje: 'entre', referencia: '' })

export function configurarDiseno(f) {
  const cubre = f.armado === 'techo-piso-cubren'
  return { ...f, construccionVersion: 2,
    techo: { ...tableroConfig(), montaje: cubre ? 'cubre' : 'entre', ...f.techo },
    piso: { ...tableroConfig(), montaje: cubre ? 'cubre' : 'entre', ...f.piso },
    modulos: f.modulos.map((m) => ({ ...m, anchoModulo: m.anchoModulo ?? '',
      frenteMontaje: m.frenteMontaje || 'embutido', configuracionCajon: { ...cajonConfig(), ...m.configuracionCajon } })),
  }
}

export function construirMueble(f) {
  const avisos = [], paneles = [], herrajes = [], modulos = [], notas = []
  const conteoPanel = new Map()
  let movimientoActual = null
  const error = (mensaje) => { throw new Error(mensaje) }
  const rango = (v, min, max, nombre, entero = false) => {
    const n = numero(v)
    if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) error(`${nombre}: indica ${entero ? 'un entero' : 'un valor'} entre ${min} y ${max}.`)
    return n
  }
  const poner = (nombre, w, h, plano, origen, grupo, modulo, separar, espesor, meta = {}) => {
    const tipo = `${nombre}|${modulo ?? 'global'}`, indice = conteoPanel.get(tipo) || 0
    conteoPanel.set(tipo, indice + 1)
    const clave = clavePanel(nombre, modulo, indice)
    espesor = espesorPanel(f, clave, espesor)
    w = redondear(w); h = redondear(h)
    if (![w, h, espesor, ...origen].every(Number.isFinite) || Math.min(w, h, espesor) <= 0) error(`${nombre}: las holguras no dejan una pieza válida.`)
    const dimensiones = plano === 'frente' ? [w, h, espesor] : plano === 'lateral' ? [espesor, h, w] : [w, espesor, h]
    paneles.push({ clave, nombre, ancho: w, alto: h, espesor, plano, origen: origen.map(redondear), movimiento: movimientoActual,
      dimensiones, posicion: dimensiones.map((d, i) => redondear(origen[i] + d / 2)), grupo, modulo, separar,
      permiteRotar: !['Lateral', 'División vertical', 'Puerta', 'Frente cajón', 'Costado cajón'].includes(nombre), ...meta })
  }
  try {
    if (!f || f.construccionVersion !== 2) error('Diseño configurable no válido.')
    const A = mm(rango(f.ancho, 1, 1000, 'Ancho')), H = mm(rango(f.alto, 1, 1000, 'Alto')), D = mm(rango(f.fondo, 1, 1000, 'Fondo'))
    const E = rango(f.espesor, 1, 100, 'Espesor'), gap = rango(f.gap, 0.5, 30, 'Separación entre frentes')
    const EF = f.fabricacion ? rango(f.fabricacion.fondo, 1, 50, 'Espesor del fondo') : E
    const EFC = f.fabricacion ? rango(f.fabricacion.fondoCajon, 1, 50, 'Espesor del fondo de cajón') : E
    const ET = rango(espesorPanel(f, clavePanel('Techo', null, 0), E), 1, 200, 'Espesor terminado techo')
    const EP = rango(espesorPanel(f, clavePanel('Piso', null, 0), E), 1, 200, 'Espesor terminado piso')
    const EI = rango(espesorPanel(f, clavePanel('Lateral', null, 0), E), 1, 200, 'Espesor lateral izquierdo')
    const ED = rango(espesorPanel(f, clavePanel('Lateral', null, 1), E), 1, 200, 'Espesor lateral derecho')
    const retiro = rango(f.holguraFondo, 0, D - 1, 'Retiro trasero de entrepaños')
    if (A <= 2 * E || H <= 2 * E || D <= 2 * E) error('Las medidas no dejan espacio interior para el espesor indicado.')
    if (!Array.isArray(f.modulos) || !f.modulos.length || f.modulos.length > 30) error('Indica entre 1 y 30 módulos.')
    if (!['sin-fondo', 'interno', 'superpuesto'].includes(f.tipoFondo)) error('Tipo de trasera no válido.')
    const tapas = {}
    for (const key of ['techo', 'piso']) {
      const t = f[key]
      if (!t || !['entre', 'cubre'].includes(t.montaje)) error(`Configura el montaje del ${key}.`)
      const vuelos = Object.fromEntries(['izquierda', 'derecha', 'frente', 'atras'].map((b) => [b, rango(t[b], 0, 500, `${key}: sobresaliente ${b}`)]))
      if (t.montaje === 'entre' && (vuelos.izquierda || vuelos.derecha)) error(`El ${key} debe cubrir los laterales para sobresalir a izquierda o derecha.`)
      tapas[key] = { ...vuelos, montaje: t.montaje }
    }
    const y0 = EP, y1 = H - ET, altoInt = H - ET - EP
    const divisiones = f.modulos.map((_, i) => i ? rango(espesorPanel(f, clavePanel('División vertical', i, 0), E), 1, 200, 'Espesor división') : 0)
    const anchoUtil = A - EI - ED - divisiones.reduce((s, e) => s + e, 0)
    if (altoInt <= 0) error('Los espesores del techo y piso no dejan altura interior.')
    const fijos = f.modulos.map((m, i) => m.anchoModulo === '' || m.anchoModulo == null ? null : mm(rango(m.anchoModulo, .1, A / 10, `Módulo ${i + 1}: ancho útil`)))
    const resto = anchoUtil - fijos.reduce((s, n) => s + (n || 0), 0), libres = fijos.filter((n) => n === null).length
    if (anchoUtil <= 0 || (libres && resto / libres < 1) || (!libres && Math.abs(resto) > .1)) error('Los anchos de módulos no completan la carcasa. Deja al menos un módulo en automático o ajusta sus medidas.')
    const anchos = fijos.map((n) => n ?? resto / libres)
    const lateralY = tapas.piso.montaje === 'cubre' ? EP : 0
    const lateralH = H - lateralY - (tapas.techo.montaje === 'cubre' ? ET : 0)
    poner('Lateral', D, lateralH, 'lateral', [0, lateralY, 0], 'estructura', null, [-1, 0, 0], E)
    poner('Lateral', D, lateralH, 'lateral', [A - ED, lateralY, 0], 'estructura', null, [1, 0, 0], E)
    for (const key of ['techo', 'piso']) {
      const t = tapas[key], cubre = t.montaje === 'cubre'
      poner(key === 'techo' ? 'Techo' : 'Piso', (cubre ? A : A - EI - ED) + t.izquierda + t.derecha,
        D + t.frente + t.atras, 'horizontal', [(cubre ? 0 : EI) - t.izquierda, key === 'techo' ? H - ET : 0, -t.atras],
        'estructura', null, [0, key === 'techo' ? 1 : -1, 0], E)
      notas.push([key === 'techo' ? 'Techo' : 'Piso', `${cubre ? 'Cubre laterales' : 'Entre laterales'}; vuelos izq./der./frente/atrás: ${t.izquierda}/${t.derecha}/${t.frente}/${t.atras} mm`])
    }
    if (f.tipoFondo === 'superpuesto') poner('Fondo', A, H, 'frente', [0, 0, -EF], 'trasera', null, [0, 0, -1.2], EF)
    if (f.tipoFondo === 'interno') poner('Fondo', A - EI - ED, altoInt, 'frente', [EI, EP, 0], 'trasera', null, [0, 0, -1.2], EF)
    const zTrasera = f.tipoFondo === 'interno' ? EF : 0
    const zEntre = Math.max(zTrasera, retiro), profundidadEntre = D - zEntre
    let x = EI
    for (let i = 0; i < f.modulos.length; i++) {
      const m = f.modulos[i], w = anchos[i], etiqueta = `Módulo ${i + 1}`
      if (i > 0) poner('División vertical', D - zTrasera, altoInt, 'lateral', [x - divisiones[i], EP, zTrasera], 'estructura', i, [(i / f.modulos.length - .5) * 1.5, 0, -.35], E)
      if (!['ninguna', 'una', 'dos'].includes(m.puerta)) error(`${etiqueta}: elige una puerta válida.`)
      if (!['embutido', 'sobrepuesto'].includes(m.frenteMontaje)) error(`${etiqueta}: montaje del frente no válido.`)
      if (!['izq', 'der'].includes(m.ladoCajon)) error(`${etiqueta}: posición lateral del cajón no válida.`)
      const nCaj = rango(m.cajones, 0, 100, `${etiqueta}: cajones`, true)
      const zona = nCaj ? mm(rango(m.zonaCajones, .1, altoInt / 10, `${etiqueta}: zona de cajones`)) : 0
      const anchoCaj = nCaj ? mm(rango(m.anchoCajon || 0, 0, w / 10, `${etiqueta}: ancho cajonera`)) : 0
      const parcial = nCaj > 0 && anchoCaj > 0 && anchoCaj < w
      const wc = parcial ? anchoCaj : w, wp = parcial ? w - wc - E : w
      if (wp <= 0) error(`${etiqueta}: la cajonera y su división no dejan espacio al costado.`)
      const cajIzq = m.ladoCajon === 'izq', xc = parcial && !cajIzq ? x + w - wc : x, xp = parcial && cajIzq ? x + wc + E : x
      const c = m.configuracionCajon || cajonConfig()
      const inicio = nCaj ? mm(rango(c.inicio, 0, altoInt / 10, `${etiqueta}: altura inicial de cajones`)) : 0
      if (inicio + zona > altoInt + .01) error(`${etiqueta}: los cajones salen del espacio interior.`)
      const sobrepuesto = m.frenteMontaje === 'sobrepuesto', zFrente = sobrepuesto ? D : D - E
      const extension = sobrepuesto ? E / 2 : 0
      if (parcial) poner('División cajón', profundidadEntre, altoInt, 'lateral', [cajIzq ? x + wc : xc - E, EP, zEntre], 'interior', i, [0, 0, -.25], E)
      if (!Array.isArray(m.alturas) || m.alturas.length > 100) error(`${etiqueta}: lista de entrepaños no válida.`)
      const alturas = m.alturas.map((a) => mm(rango(a, 0, (altoInt - E) / 10, `${etiqueta}: altura de entrepaño`))).sort((a, b) => a - b)
      for (let k = 1; k < alturas.length; k++) if (alturas[k] < alturas[k - 1] + E) error(`${etiqueta}: dos entrepaños se superponen.`)
      for (let k = 0; k < alturas.length; k++) {
        const a = alturas[k]
        const eEntre = espesorPanel(f, clavePanel('Entrepaño', i, k), E)
        if (!Number.isFinite(eEntre) || eEntre <= 0 || a + eEntre > altoInt || (k + 1 < alturas.length && a + eEntre > alturas[k + 1])) error(`${etiqueta}: el espesor del entrepaño invade otro espacio.`)
        if (nCaj && !parcial && a < inicio + zona && a + E > inicio) error(`${etiqueta}: un entrepaño atraviesa la zona de cajones.`)
        // En cajonera parcial los entrepaños pertenecen al compartimiento contiguo.
        const pe = (sobrepuesto ? D : D - E - gap) - zEntre
        poner('Entrepaño', parcial ? wp : w, pe, 'horizontal', [parcial ? xp : x, EP + a, zEntre], 'interior', i, [0, .15 + k * .2, .5], E)
      }
      const puertaZona = (py, ph, indice) => {
        if (m.puerta === 'ninguna' || ph <= .01) return
        const hojas = m.puerta === 'dos' ? 2 : 1
        const anchoFrente = (wp + 2 * extension - (hojas + 1) * gap) / hojas
        const altoFrente = ph - 2 * gap
        for (let j = 0; j < hojas; j++) {
          const origen = [xp - extension + gap + j * (anchoFrente + gap), py + gap, zFrente], derecha = hojas === 2 && j === 1
          movimientoActual = { id: `puerta:${i}:${indice}:${j}`, tipo: 'girarY', lado: derecha ? 'der' : 'izq', angulo: derecha ? 100 : -100,
            pivote: [origen[0] + (derecha ? anchoFrente : 0), origen[1], origen[2]] }
          poner('Puerta', anchoFrente, altoFrente, 'frente', origen, 'frentes', i, [hojas === 2 ? (j ? .35 : -.35) : 0, indice * .2, 1.2], E)
          movimientoActual = null
        }
      }
      if (!nCaj || parcial) puertaZona(EP, altoInt, 0)
      else { puertaZona(EP, inicio, 0); puertaZona(EP + inicio + zona, altoInt - inicio - zona, 1) }
      let caja = null
      if (nCaj) {
        if (!['sin', 'lateral', 'oculto', 'personalizado'].includes(c.riel)) error(`${etiqueta}: tipo de riel no válido.`)
        const holgura = rango(c.holguraLateral, 0, 100, `${etiqueta}: holgura del riel por lado`)
        if (c.riel !== 'sin' && holgura <= 0) error(`${etiqueta}: el riel requiere una holgura lateral mayor que cero.`)
        const trasera = rango(c.holguraTrasera, 0, D, `${etiqueta}: holgura trasera`)
        const frente = rango(c.retiroFrontal, 0, D, `${etiqueta}: retiro de caja detrás del frente`)
        const vertical = rango(c.holguraVertical, 0, zona / nCaj, `${etiqueta}: holgura vertical por cajón`)
        if (!['entre', 'debajo'].includes(c.fondoMontaje)) error(`${etiqueta}: montaje del fondo de cajón no válido.`)
        if (typeof c.referencia !== 'string' || c.referencia.length > 120) error(`${etiqueta}: referencia de riel no válida.`)
        const largoRiel = c.riel === 'sin' ? null : rango(c.largoRiel, 1, D, `${etiqueta}: largo del riel (mm)`)
        const maxProf = zFrente - frente - zTrasera - trasera
        const prof = c.profundidad === '' || c.profundidad == null ? (largoRiel ?? maxProf) : mm(rango(c.profundidad, .1, D / 10, `${etiqueta}: profundidad caja`))
        if (prof > maxProf + .01 || prof <= 2 * E) error(`${etiqueta}: la caja no cabe en profundidad con el riel, trasera y retiros elegidos.`)
        if (largoRiel && largoRiel > prof) error(`${etiqueta}: el riel es más largo que la caja.`)
        const anchoCaja = wc - 2 * holgura, entre = anchoCaja - 2 * E
        const paso = zona / nCaj, altoFrente = paso - gap, altoCaja = paso - vertical
        const debajo = c.fondoMontaje === 'debajo', altoLateral = altoCaja - (debajo ? EFC : 0)
        if (entre <= 0 || altoLateral <= E || prof - 2 * E <= 0) error(`${etiqueta}: las holguras no dejan una caja armable.`)
        const z = zFrente - frente - prof, cx = xc + holgura
        for (let j = 0; j < nCaj; j++) {
          const yf = EP + inicio + j * paso + gap / 2, yb = EP + inicio + j * paso + vertical / 2, yl = yb + (debajo ? EFC : 0)
          movimientoActual = { id: `cajon:${i}:${j}`, tipo: 'deslizarZ', recorrido: Math.min(largoRiel || prof, prof) * .8 }
          poner('Frente cajón', wc + 2 * extension - 2 * gap, altoFrente, 'frente', [xc - extension + gap, yf, zFrente], 'frentes', i, [0, 0, 1.4 + j * .15], E)
          poner('Costado cajón', prof, altoLateral, 'lateral', [cx, yl, z], 'cajones', i, [-.35, 0, .65 + j * .15], E)
          poner('Costado cajón', prof, altoLateral, 'lateral', [cx + anchoCaja - E, yl, z], 'cajones', i, [.35, 0, .65 + j * .15], E)
          poner('Trasera cajón', entre, altoLateral, 'frente', [cx + E, yl, z], 'cajones', i, [0, 0, -.3], E)
          poner('Contrafrente cajón', entre, altoLateral, 'frente', [cx + E, yl, z + prof - E], 'cajones', i, [0, 0, .9], E)
          poner('Fondo cajón', debajo ? anchoCaja : entre, debajo ? prof : prof - 2 * E, 'horizontal',
            [debajo ? cx : cx + E, yb, debajo ? z : z + E], 'cajones', i, [0, -.3, .65 + j * .15], EFC)
          movimientoActual = null
          if (largoRiel) {
            for (const lado of [-1, 1]) {
              const oculto = c.riel === 'oculto', grosor = oculto ? Math.min(15, anchoCaja / 4) : Math.max(.5, holgura * .8)
              const hR = oculto ? Math.min(8, vertical / 2) : Math.min(35, altoLateral / 2)
              if (hR <= 0) error(`${etiqueta}: el riel oculto requiere holgura vertical.`)
              const rx = oculto ? cx + (lado < 0 ? grosor : anchoCaja - 2 * grosor) : (lado < 0 ? xc + holgura * .1 : xc + wc - holgura * .9)
              const origen = [rx, oculto ? yb - hR : yl + altoLateral / 2 - hR / 2, z + prof - largoRiel]
              const dimensiones = [grosor, hR, largoRiel], id = `H${i + 1}-${j + 1}-${lado < 0 ? 'I' : 'D'}`
              herrajes.push({ id, codigo: id, nombre: `Riel ${c.riel}`, modulo: i, grupo: 'herrajes', herraje: true,
                plano: 'lateral', dimensiones, posicion: dimensiones.map((d, k) => origen[k] + d / 2), separar: [lado * .45, 0, .6 + j * .15],
                ancho: largoRiel, alto: hR, espesor: grosor, referencia: c.referencia })
            }
          }
        }
        caja = { ancho: redondear(anchoCaja), alto: redondear(altoCaja), profundidad: redondear(prof), inicio, zona, holgura, riel: c.riel, largoRiel }
        notas.push([`${etiqueta} / ${nCaj} cajones`, `Inicio ${inicio} mm; zona ${zona} mm; caja ${redondear(anchoCaja)} x ${redondear(altoCaja)} x ${redondear(prof)} mm; ${c.riel === 'sin' ? 'sin riel' : `riel ${c.riel} ${largoRiel} mm`}; holgura/lado ${holgura} mm; fondo ${c.fondoMontaje}${c.referencia ? `; ${c.referencia}` : ''}`])
      }
      modulos.push({ indice: i, x, ancho: redondear(w), alto: altoInt, caja })
      notas.push([etiqueta, `Ancho útil ${redondear(w)} mm; frentes ${m.frenteMontaje}`])
      x += w + (divisiones[i + 1] || ED)
    }
    const acc = new Map()
    for (const p of paneles) {
      const key = JSON.stringify([p.nombre, p.ancho, p.alto, p.permiteRotar])
      if (!acc.has(key)) acc.set(key, { nombre: p.nombre, ancho: p.ancho, alto: p.alto, cantidad: 0, permiteRotar: p.permiteRotar, canto: '', codigo: `P${String(acc.size + 1).padStart(3, '0')}` })
      const tipo = acc.get(key); tipo.cantidad++; p.codigo = tipo.codigo; p.id = `${tipo.codigo}-${tipo.cantidad}`
    }
    if (paneles.length > 1000) error('El diseño supera el límite de 1000 piezas por mueble.')
    const min = [0, 0, 0], max = [A, H, D]
    for (const p of paneles) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.origen[k]); max[k] = Math.max(max[k], p.origen[k] + p.dimensiones[k]) }
    const construccion = { piezas: [...acc.values()], paneles, herrajes, avisos, modulos, notas, ancho: A, alto: H, fondo: D, espesor: E,
      limites: { min, max }, envolvente: max.map((n, i) => redondear(n - min[i])) }
    return f.fabricacion ? terminarFabricacion(construccion, f) : construccion
  } catch (e) { return { piezas: [], paneles: [], herrajes: [], modulos: [], notas: [], avisos: [e.message] } }
}
