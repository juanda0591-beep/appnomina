const textoCampo = (valor) => valor == null ? '' : String(valor)

export function formularioDesdeProductoIA(borrador) {
  return {
    nombre: borrador.nombre,
    datos: Object.fromEntries(['descripcion', 'valorVenta', 'valorCompra', 'stockApertura', 'stockMinimo']
      .map((k) => [k, textoCampo(borrador[k])])),
    procesos: borrador.procesos.map((p) => ({
      nombre: p.nombre, pago: textoCampo(p.pago),
      materiales: p.materiales.map((m) => ({
        materialId: textoCampo(m.materialId), cantidad: textoCampo(m.cantidad), porColor: false, familia: '',
        nombreSugerido: m.materialId === null ? m.nombre : '',
      })),
      piezas: p.piezas.map((pz) => ({ nombre: pz.nombre, cantidad: textoCampo(pz.cantidad) })),
    })),
  }
}

export function errorRecetaIA(procesos, materiales) {
  const numeroValido = (v, min = 0) => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= min
  for (const [i, p] of procesos.entries()) {
    if (!p.nombre.trim()) return `Selecciona el proceso ${i + 1} o elimina esa fila.`
    if (!numeroValido(p.pago)) return `Completa el pago por unidad de ${p.nombre}. Si no tiene pago, indica 0.`
    for (const m of p.materiales) {
      const existe = m.porColor
        ? materiales.some((mat) => mat.familia === m.familia && mat.colorId)
        : materiales.some((mat) => String(mat.id) === String(m.materialId))
      if (!existe) return `Selecciona un material registrado para ${m.nombreSugerido || p.nombre}, o elimina la fila.`
      if (!numeroValido(m.cantidad) || Number(m.cantidad) <= 0) return `Completa la cantidad de material en ${p.nombre}.`
    }
    for (const pz of p.piezas) {
      if (!pz.nombre.trim() || !numeroValido(pz.cantidad, 1) || !Number.isSafeInteger(Number(pz.cantidad))) {
        return `Completa el nombre y la cantidad entera de las piezas en ${p.nombre}.`
      }
    }
  }
  return ''
}
