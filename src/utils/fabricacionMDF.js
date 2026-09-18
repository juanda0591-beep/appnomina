// Perfiles de fabricación: el panel terminado y sus componentes de corte son distintos.
export const clavePanel = (nombre, modulo, indice) => `${nombre}|${modulo ?? 'global'}|${indice}`
export const perfilSimple = (espesor = 9) => ({ tipo: 'simple', espesor, final: espesor, anchoTira: 40,
  caraInferior: 3, refuerzos: 0, bordes: ['izq', 'der', 'arriba', 'abajo'] })
export function espesorPanel(f, clave, defecto) {
  const perfil = f.fabricacion?.perfiles?.[clave]
  if (!perfil) return defecto
  return Number(perfil.tipo === 'simple' ? perfil.espesor : perfil.final)
}

export function activarMDF(f) {
  return { ...f, espesor: 9, fabricacion: { version: 1, fondo: 3, fondoCajon: 3, perfiles: {}, ajustes: {}, complementos: [], ...f.fabricacion } }
}

export function editarPanelDiseno(f, clave, datos) {
  const fab = f.fabricacion || { version: 1, fondo: Number(f.espesor), fondoCajon: Number(f.espesor), perfiles: {}, ajustes: {}, complementos: [] }
  const perfiles = { ...fab.perfiles }, ajustes = { ...fab.ajustes }
  if (datos) { perfiles[clave] = datos.perfil; ajustes[clave] = datos.ajuste }
  else { delete perfiles[clave]; delete ajustes[clave] }
  return { ...f, fabricacion: { ...fab, perfiles, ajustes } }
}

const red = (n) => Math.round(n * 100) / 100
const validar = (v, min, max, etiqueta, entero = false) => {
  if (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < min || Number(v) > max || (entero && !Number.isInteger(Number(v)))) throw new Error(`${etiqueta}: indica un valor entre ${min} y ${max}.`)
  return Number(v)
}
const dimensiones = (w, h, t, plano) => plano === 'frente' ? [w, h, t] : plano === 'lateral' ? [t, h, w] : [w, t, h]
const transformarLocal = (p, u, v, t) => {
  const d = p.plano === 'frente' ? [u, v, t] : p.plano === 'lateral' ? [t, v, u] : [u, t, v]
  return p.origen.map((n, i) => n + d[i])
}

export function terminarFabricacion(c, f) {
  const fab = f.fabricacion
  if (!fab) return c
  if (fab.version !== 1) throw new Error('Perfil de fabricación no compatible.')
  validar(fab.fondo, 1, 50, 'Espesor de fondo'); validar(fab.fondoCajon, 1, 50, 'Espesor de fondo de cajón')
  if (!fab.perfiles || typeof fab.perfiles !== 'object' || Array.isArray(fab.perfiles) || !fab.ajustes || typeof fab.ajustes !== 'object' || Array.isArray(fab.ajustes)) throw new Error('Configuración de piezas no válida.')
  if (!Array.isArray(fab.complementos) || fab.complementos.length > 60) throw new Error('Máximo 60 complementos por proyecto.')
  const bases = c.paneles.map((p) => ({ ...p }))
  const espejos = [], ids = new Set()
  for (const extra of fab.complementos) {
    if (!extra || typeof extra.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(extra.id) || ids.has(extra.id)) throw new Error('Identificador de complemento no válido.')
    ids.add(extra.id)
    const w = validar(extra.ancho, 1, 5000, 'Ancho complemento'), h = validar(extra.alto, 1, 5000, 'Alto complemento'), t = validar(extra.espesor, 1, 100, 'Espesor complemento')
    const origen = ['x', 'y', 'z'].map((e) => validar(extra[e], -5000, 10000, `Posición ${e}`))
    const nombre = String(extra.nombre || 'Complemento').slice(0, 80)
    if (!['repisa', 'panel', 'espejo'].includes(extra.tipo)) throw new Error('Complemento no válido.')
    if (extra.tipo === 'espejo') {
      const b = validar(extra.marco, 1, Math.min(w, h) / 2 - .1, 'Ancho del marco')
      const carrera = validar(extra.recorrido, 0, 5000, 'Recorrido del espejo')
      if (!['izq', 'der', 'fijo'].includes(extra.apertura)) throw new Error('Apertura del espejo no válida.')
      const mov = { id: `espejo:${extra.id}`, tipo: 'deslizarX', recorrido: extra.apertura === 'fijo' ? 0 : carrera * (extra.apertura === 'izq' ? -1 : 1) }
      for (const [sufijo, pw, ph, pos] of [['izq', b, h, origen], ['der', b, h, [origen[0] + w - b, origen[1], origen[2]]], ['inf', w - 2 * b, b, [origen[0] + b, origen[1], origen[2]]], ['sup', w - 2 * b, b, [origen[0] + b, origen[1] + h - b, origen[2]]]]) {
        bases.push({ clave: `extra:${extra.id}:${sufijo}`, extraId: extra.id, nombre: `${nombre} · marco ${sufijo}`, ancho: pw, alto: ph, espesor: t,
          plano: 'frente', origen: pos, dimensiones: [pw, ph, t], grupo: 'marcos', modulo: null, separar: [0, 0, .9], permiteRotar: false, movimiento: mov })
      }
      const mt = validar(extra.espesorEspejo, 1, 20, 'Espesor del espejo')
      espejos.push({ id: `VIDRIO:${extra.id}`, clave: `espejo:${extra.id}`, extraId: extra.id, codigo: `ES-${espejos.length + 1}`, nombre: `${nombre} · vidrio`, ancho: w - 2 * b, alto: h - 2 * b,
        espesor: mt, dimensiones: [w - 2 * b, h - 2 * b, mt], origen: [origen[0] + b, origen[1] + b, origen[2] + t - mt],
        posicion: [origen[0] + w / 2, origen[1] + h / 2, origen[2] + t - mt / 2], grupo: 'espejos', plano: 'frente', modulo: null,
        separar: [0, 0, 1], espejo: true, movimiento: mov })
    } else {
      const plano = extra.tipo === 'repisa' ? 'horizontal' : extra.plano || 'frente'
      if (!['horizontal', 'lateral', 'frente'].includes(plano)) throw new Error('Orientación de complemento no válida.')
      bases.push({ clave: `extra:${extra.id}`, extraId: extra.id, nombre, ancho: w, alto: h, espesor: t, dimensiones: dimensiones(w, h, t, plano),
        origen, plano, grupo: 'complementos', modulo: null, separar: [0, .5, .5], permiteRotar: true })
    }
  }
  const salida = [], componentes = [], notas = [...c.notas]
  for (const base of bases) {
    const ajuste = fab.ajustes[base.clave] || {}
    const p = { ...base, origen: [...base.origen] }
    if (ajuste.ancho != null) p.ancho = validar(ajuste.ancho, 1, 10000, `${p.nombre}: ancho`)
    if (ajuste.alto != null) p.alto = validar(ajuste.alto, 1, 10000, `${p.nombre}: alto`)
    for (const [i, e] of ['x', 'y', 'z'].entries()) if (ajuste[e] != null) p.origen[i] = validar(ajuste[e], -5000, 10000, `${p.nombre}: ${e}`)
    const perfil = fab.perfiles[p.clave] || perfilSimple(p.espesor)
    const e = validar(perfil.espesor, 1, 100, `${p.nombre}: MDF`)
    if (!['simple', 'reengrueso', 'entamborado'].includes(perfil.tipo)) throw new Error('Tipo de fabricación no válido.')
    const final = perfil.tipo === 'simple' ? e : validar(perfil.final, e, 200, `${p.nombre}: espesor final`)
    if (p.grupo === 'cajones' && perfil.tipo !== 'simple') throw new Error('Los componentes de caja de cajón deben ser tableros simples.')
    p.espesor = final; p.dimensiones = dimensiones(p.ancho, p.alto, final, p.plano)
    p.posicion = p.dimensiones.map((d, i) => p.origen[i] + d / 2); p.perfil = perfil
    if (p.movimiento?.tipo === 'girarY') {
      const derecha = (ajuste.bisagra || p.movimiento.lado) === 'der'
      p.movimiento = { ...p.movimiento, lado: derecha ? 'der' : 'izq', pivote: [p.origen[0] + (derecha ? p.ancho : 0), p.origen[1], p.origen[2]], angulo: derecha ? 100 : -100 }
    }
    const comp = (nombre, w, h, grosor, u = 0, v = 0, capa = 0, numCapa = '') => {
      if (Math.min(w, h, grosor) <= 0) throw new Error(`${p.nombre}: las tiras no caben.`)
      const dim = dimensiones(w, h, grosor, p.plano), ori = transformarLocal(p, u, v, capa)
      const eje = p.plano === 'frente' ? 2 : p.plano === 'lateral' ? 0 : 1
      const separar = p.separar.map((n, i) => n + (i === eje && perfil.tipo !== 'simple' ? (capa + grosor / 2) / final - .5 : 0))
      const item = { ...p, nombre, padre: p.clave, subclave: `${p.clave}:${componentes.length}:${numCapa}`, ancho: red(w), alto: red(h), espesor: red(grosor), separar,
        dimensiones: dim, origen: ori, posicion: dim.map((n, i) => ori[i] + n / 2), componentes: undefined }
      componentes.push(item)
    }
    if (perfil.tipo === 'simple') comp(p.nombre, p.ancho, p.alto, e)
    else {
      const b = validar(perfil.anchoTira, 1, Math.min(p.ancho, p.alto) / 2 - .1, `${p.nombre}: ancho de tiras`)
      const bordes = perfil.tipo === 'entamborado' ? ['izq', 'der', 'arriba', 'abajo'] : perfil.bordes
      if (!Array.isArray(bordes) || !bordes.length || bordes.some((s) => !['izq', 'der', 'arriba', 'abajo'].includes(s)) || new Set(bordes).size !== bordes.length) throw new Error('Selecciona los bordes reforzados sin repetirlos.')
      const inferior = perfil.tipo === 'entamborado' ? validar(perfil.caraInferior, 1, 50, 'Cara inferior') : 0
      const nucleo = final - e - inferior
      if (!(nucleo > 0)) throw new Error(`${p.nombre}: el espesor final debe superar la suma de las caras.`)
      const capas = perfil.tipo === 'reengrueso' ? nucleo / 9 : 1
      if (perfil.tipo === 'reengrueso' && Math.abs(capas - Math.round(capas)) > .0001) throw new Error(`${p.nombre}: el reengrueso suma capas de 9 mm a la cara base.`)
      // Cara principal al exterior positivo del eje de espesor (arriba/frente).
      comp(`${p.nombre} · cara`, p.ancho, p.alto, e, 0, 0, final - e)
      if (inferior) comp(`${p.nombre} · contracara`, p.ancho, p.alto, inferior)
      for (let capa = 0; capa < Math.round(capas); capa++) {
        const t = inferior + (perfil.tipo === 'reengrueso' ? capa * 9 : 0)
        // Refuerzos entamborados se cortan en MDF 9 de canto: ancho = altura del núcleo.
        const tira = (borde, largo, u, v, horizontal) => {
          if (perfil.tipo === 'reengrueso') comp(`${p.nombre} · tira ${borde}`, horizontal ? largo : b, horizontal ? b : largo, 9, u, v, t, capa)
          else {
            const ori = transformarLocal(p, u, v, t), dimLocal = horizontal ? [largo, 9, nucleo] : [9, largo, nucleo]
            const dim = p.plano === 'frente' ? dimLocal : p.plano === 'lateral' ? [dimLocal[2], dimLocal[1], dimLocal[0]] : [dimLocal[0], dimLocal[2], dimLocal[1]]
            componentes.push({ ...p, padre: p.clave, subclave: `${p.clave}:liston:${borde}:${componentes.length}`, nombre: `${p.nombre} · refuerzo ${borde}`,
              ancho: red(largo), alto: red(nucleo), espesor: 9, dimensiones: dim, origen: ori, posicion: dim.map((n, i) => ori[i] + n / 2) })
          }
        }
        const bordeAncho = perfil.tipo === 'entamborado' ? 9 : b
        if (bordes.includes('izq')) tira('izq', p.alto, 0, 0, false)
        if (bordes.includes('der')) tira('der', p.alto, p.ancho - bordeAncho, 0, false)
        const li = bordes.includes('izq') ? bordeAncho : 0, ld = bordes.includes('der') ? bordeAncho : 0
        if (bordes.includes('abajo')) tira('abajo', p.ancho - li - ld, li, 0, true)
        if (bordes.includes('arriba')) tira('arriba', p.ancho - li - ld, li, p.alto - bordeAncho, true)
        if (perfil.tipo === 'entamborado') {
          const n = validar(perfil.refuerzos, 0, 50, 'Refuerzos interiores', true)
          if (n && (p.alto - 18) / (n + 1) < 9) throw new Error('Hay demasiados refuerzos interiores para esta pieza.')
          for (let j = 0; j < n; j++) tira(`interno ${j + 1}`, p.ancho - 18, 9, 9 + (p.alto - 18) * (j + 1) / (n + 1) - 4.5, true)
        }
      }
      notas.push([p.nombre, `${perfil.tipo}; espesor terminado ${final} mm; cara ${e} mm${inferior ? `; contracara ${inferior} mm; núcleo ${nucleo} mm; ${perfil.refuerzos} refuerzos` : `; tiras ${b} mm, ${Math.round(capas)} capas de MDF 9 mm`}`])
    }
    salida.push(p)
  }
  const acc = new Map()
  for (const p of componentes) {
    const key = JSON.stringify([p.nombre, p.ancho, p.alto, p.espesor, p.permiteRotar])
    if (!acc.has(key)) acc.set(key, { nombre: p.nombre, ancho: p.ancho, alto: p.alto, espesor: p.espesor, material: 'MDF', cantidad: 0,
      permiteRotar: p.permiteRotar, canto: '', codigo: `P${String(acc.size + 1).padStart(3, '0')}` })
    const item = acc.get(key); item.cantidad++; p.codigo = item.codigo; p.id = `${item.codigo}-${item.cantidad}`
  }
  if (componentes.length > 1000) throw new Error('Los componentes de fabricación superan el límite de 1000 piezas.')
  for (const p of salida) { p.codigo = componentes.find((comp) => comp.padre === p.clave).codigo; p.id = `PANEL:${p.clave}` }
  const min = [0, 0, 0], max = [c.ancho, c.alto, c.fondo]
  for (const p of [...salida, ...espejos]) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.origen[k]); max[k] = Math.max(max[k], p.origen[k] + p.dimensiones[k]) }
  return { ...c, paneles: salida, componentes, espejos, piezas: [...acc.values()], notas,
    limites: { min, max }, envolvente: max.map((n, i) => red(n - min[i])) }
}
