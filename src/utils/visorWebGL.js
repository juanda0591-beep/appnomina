import { posicionModelo } from './modeloMueble.js'
import { transformarPieza, rotarY } from './movimientoMueble.js'

const restar = (a, b) => a.map((n, i) => n - b[i])
const sumar = (a, b) => a.map((n, i) => n + b[i])
const producto = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0)
const unidad = (v) => { const l = Math.hypot(...v) || 1; return v.map((n) => n / l) }
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const limitar = (n, min, max) => Math.max(min, Math.min(max, n))
const rad = Math.PI / 180

function multiplicar(a, b) {
  const r = new Float32Array(16)
  for (let col = 0; col < 4; col++) for (let fila = 0; fila < 4; fila++) for (let k = 0; k < 4; k++) r[col * 4 + fila] += a[k * 4 + fila] * b[col * 4 + k]
  return r
}

export function intersectarCaja(origen, direccion, centro, dimensiones) {
  let cerca = -Infinity, lejos = Infinity
  for (let i = 0; i < 3; i++) {
    const min = centro[i] - dimensiones[i] / 2, max = centro[i] + dimensiones[i] / 2
    if (Math.abs(direccion[i]) < 1e-10) { if (origen[i] < min || origen[i] > max) return null; continue }
    const a = (min - origen[i]) / direccion[i], b = (max - origen[i]) / direccion[i]
    cerca = Math.max(cerca, Math.min(a, b)); lejos = Math.min(lejos, Math.max(a, b))
    if (cerca > lejos) return null
  }
  return lejos < 0 ? null : Math.max(0, cerca)
}

const vertex = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uVP;
uniform vec3 uCentro;
uniform vec3 uDim;
uniform float uAngulo;
varying vec3 vNormal;
varying vec3 vLocal;
void main() {
  vLocal = aPos * uDim;
  float c = cos(uAngulo), s = sin(uAngulo);
  mat3 giro = mat3(c, 0., -s, 0., 1., 0., s, 0., c);
  vNormal = giro * aNormal;
  gl_Position = uVP * vec4(giro * vLocal + uCentro, 1.0);
}`
const fragment = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vLocal;
uniform vec3 uColor;
uniform float uVeta;
uniform float uPlano;
uniform float uLinea;
void main() {
  vec3 n = normalize(vNormal);
  float luz = 0.56 + 0.29 * max(dot(n, normalize(vec3(0.6, 1.0, 0.8))), 0.0)
    + 0.11 * max(dot(n, normalize(vec3(-0.8, 0.4, -0.5))), 0.0);
  float a = uPlano > 1.5 ? vLocal.z : (uPlano > 0.5 ? vLocal.z : vLocal.x);
  float b = uPlano > 1.5 ? vLocal.x : vLocal.y;
  float veta = sin(a * 340.0 + 1.7 * sin(b * 7.0)) * 0.035
    + sin(a * 95.0 + 0.9 * sin(b * 4.0)) * 0.045;
  vec3 color = uColor * (luz + veta * uVeta);
  gl_FragColor = vec4(mix(color, uColor, uLinea), 1.0);
}`

function geometriaCaja() {
  const faces = [
    [[1, 0, 0], [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]]],
    [[-1, 0, 0], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]]],
    [[0, 1, 0], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]]],
    [[0, -1, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]]],
    [[0, 0, 1], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]],
    [[0, 0, -1], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]],
  ]
  const solido = [], bordes = []
  for (const [normal, puntos] of faces) {
    for (const i of [0, 1, 2, 0, 2, 3]) solido.push(...puntos[i], ...normal)
    for (const i of [0, 1, 1, 2, 2, 3, 3, 0]) bordes.push(...puntos[i], ...normal)
  }
  return { solido: new Float32Array(solido), bordes: new Float32Array(bordes) }
}

// Visor de cajas de tablero: WebGL con profundidad real y selección por rayos.
// Dibuja solamente cuando cambia la escena o el usuario interactúa.
export class VisorWebGL {
  constructor(canvas, { onSeleccionar, onAlternar, onError, onCambio } = {}) {
    this.canvas = canvas; this.onSeleccionar = onSeleccionar; this.onCambio = onCambio
    this.onAlternar = onAlternar; this.aperturas = new Map(); this.ultimoToque = null; this.frame = null
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true })
    if (!this.gl) throw new Error('El navegador no pudo activar el visor 3D. Las vistas 2D siguen disponibles.')
    this.callbacks = []; this.buffers = []; this.shaders = []
    this.punteros = new Map(); this.target = [0, 0, 0]; this.theta = 32 * rad; this.phi = 72 * rad; this.zoom = 1
    this.opciones = {}; this.modelo = null; this.descartado = false
    try {
      const gl = this.gl
      const shader = (tipo, texto) => {
        const s = gl.createShader(tipo); this.shaders.push(s); gl.shaderSource(s, texto); gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('No fue posible preparar la visualización 3D.')
        return s
      }
      this.programa = gl.createProgram()
      gl.attachShader(this.programa, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(this.programa, shader(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(this.programa)
      if (!gl.getProgramParameter(this.programa, gl.LINK_STATUS)) throw new Error('No fue posible iniciar la visualización 3D.')
      gl.useProgram(this.programa)
      this.pos = gl.getAttribLocation(this.programa, 'aPos'); this.normal = gl.getAttribLocation(this.programa, 'aNormal')
      this.uniforms = Object.fromEntries(['VP', 'Centro', 'Dim', 'Color', 'Veta', 'Plano', 'Linea', 'Angulo'].map((n) => [n, gl.getUniformLocation(this.programa, 'u' + n)]))
      const geometria = geometriaCaja()
      for (const key of ['solido', 'bordes']) {
        this[key] = gl.createBuffer(); this.buffers.push(this[key]); gl.bindBuffer(gl.ARRAY_BUFFER, this[key]); gl.bufferData(gl.ARRAY_BUFFER, geometria[key], gl.STATIC_DRAW)
      }
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1)
      this.escuchar('contextmenu', (e) => e.preventDefault())
      this.escuchar('webglcontextlost', (e) => { e.preventDefault(); onError?.('Se perdió la conexión gráfica. Pulsa Reintentar 3D para recuperar el visor.') })
      this.escuchar('pointerdown', (e) => {
        canvas.focus(); canvas.setPointerCapture(e.pointerId)
        this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY })
        this.inicio = { x: e.clientX, y: e.clientY }; this.movido = this.punteros.size > 1
      })
      this.escuchar('pointermove', (e) => this.mover(e))
      this.escuchar('pointerup', (e) => {
        if (this.punteros.size === 1 && !this.movido && e.button === 0) {
          const p = this.seleccionar(e.clientX, e.clientY), ahora = performance.now(), ultimo = this.ultimoToque
          if (p?.movimiento && ultimo?.id === p.movimiento.id && ahora - ultimo.t < 420 && Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y) < 18) {
            this.onAlternar?.(p.movimiento.id); this.ultimoToque = null
          } else this.ultimoToque = { id: p?.movimiento?.id, t: ahora, x: e.clientX, y: e.clientY }
        }
        this.punteros.delete(e.pointerId); this.movido = true
      })
      this.escuchar('pointercancel', (e) => { this.punteros.delete(e.pointerId); this.movido = true })
      this.escuchar('lostpointercapture', (e) => this.punteros.delete(e.pointerId))
      this.escuchar('wheel', (e) => { e.preventDefault(); this.acercar(Math.exp(-e.deltaY * .001)) }, { passive: false })
      this.escuchar('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0', 'Escape', 'Enter'].includes(e.key)) return
        e.preventDefault()
        if (e.key === 'Escape') this.onSeleccionar?.(null)
        else if (e.key === 'Enter') { const p = this.visibles?.find((p) => p.id === this.opciones.seleccionado); if (p?.movimiento) this.onAlternar?.(p.movimiento.id) }
        else if (e.key === '0') this.vista('perspectiva')
        else if (e.key === '+' || e.key === '=') this.acercar(1.2)
        else if (e.key === '-') this.acercar(1 / 1.2)
        else { this.theta += (e.key === 'ArrowLeft' ? -.1 : e.key === 'ArrowRight' ? .1 : 0); this.phi = limitar(this.phi + (e.key === 'ArrowUp' ? -.1 : e.key === 'ArrowDown' ? .1 : 0), .025, Math.PI - .025); this.dibujar() }
      })
      this.observer = new ResizeObserver(() => this.dibujar()); this.observer.observe(canvas)
    } catch (error) { this.dispose(); throw error }
  }
  escuchar(evento, fn, opciones) { this.canvas.addEventListener(evento, fn, opciones); this.callbacks.push([evento, fn, opciones]) }
  actualizar(modelo, opciones) {
    const diferente = this.modelo !== modelo
    this.modelo = modelo; this.opciones = opciones
    const ids = new Set([...modelo.piezas, ...(modelo.espejos || [])].map((p) => p.movimiento?.id).filter(Boolean))
    const ahora = performance.now()
    for (const id of ids) {
      const destino = opciones.abiertos?.[id] ? 1 : 0, anterior = this.aperturas.get(id)
      if (!anterior || anterior.destino !== destino) this.aperturas.set(id, { inicio: this.progreso(id, ahora), destino, tiempo: ahora })
    }
    for (const id of this.aperturas.keys()) if (!ids.has(id)) this.aperturas.delete(id)
    if (diferente) { this.target = [0, 0, 0]; this.zoom = 1 }
    this.dibujar()
  }
  progreso(id, tiempo = performance.now()) {
    const a = this.aperturas.get(id)
    if (!a) return 0
    const t = limitar((tiempo - a.tiempo) / 380, 0, 1), suave = t * t * (3 - 2 * t)
    return a.inicio + (a.destino - a.inicio) * suave
  }
  mover(e) {
    const previo = this.punteros.get(e.pointerId)
    if (!previo) return
    const dx = e.clientX - previo.x, dy = e.clientY - previo.y
    if (Math.hypot(e.clientX - this.inicio.x, e.clientY - this.inicio.y) > 4) this.movido = true
    if (this.punteros.size > 1) {
      const otro = [...this.punteros.entries()].find(([id]) => id !== e.pointerId)[1]
      const antes = Math.hypot(previo.x - otro.x, previo.y - otro.y), despues = Math.hypot(e.clientX - otro.x, e.clientY - otro.y)
      if (antes > 4 && despues > 4) this.zoom = limitar(this.zoom * despues / antes, .35, 5)
      this.desplazar(dx / 2, dy / 2)
    } else if (e.buttons === 2 || e.shiftKey) this.desplazar(dx, dy)
    else { this.theta -= dx * .008; this.phi = limitar(this.phi - dy * .008, .025, Math.PI - .025) }
    this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.dibujar()
  }
  desplazar(dx, dy) {
    if (!this.camara) return
    const factor = this.camara.distancia * .0015
    this.target = this.target.map((n, i) => n - this.camara.derecha[i] * dx * factor + this.camara.arriba[i] * dy * factor)
  }
  acercar(factor) { this.zoom = limitar(this.zoom * factor, .35, 5); this.dibujar() }
  vista(tipo) {
    const posiciones = { perspectiva: [32, 72], frontal: [0, 90], lateral: [90, 90], superior: [0, 1.5], trasera: [180, 90] }
    const [theta, phi] = posiciones[tipo] || posiciones.perspectiva
    this.theta = theta * rad; this.phi = phi * rad; this.zoom = 1; this.target = [0, 0, 0]; this.dibujar()
  }
  dibujar() {
    if (this.descartado || !this.modelo?.piezas.length || this.gl.isContextLost()) return
    const gl = this.gl, m = this.modelo, o = this.opciones
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    gl.viewport(0, 0, w, h); gl.clearColor(.926, .947, .949, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.programa)
    const aspecto = w / h, radio = Math.hypot(...(m.envolvente || [m.ancho, m.alto, m.fondo])) / 2000 * (1 + .7 * (o.explosion || 0))
    const fov = 38 * rad, tan = Math.tan(fov / 2)
    const distancia = radio / Math.sin(Math.atan(tan * Math.min(1, aspecto))) * 1.12 / this.zoom
    const dir = [Math.sin(this.phi) * Math.sin(this.theta), Math.cos(this.phi), Math.sin(this.phi) * Math.cos(this.theta)]
    const ojo = sumar(this.target, dir.map((n) => n * distancia)), atras = unidad(restar(ojo, this.target))
    const derecha = unidad(cruz([0, 1, 0], atras)), arriba = cruz(atras, derecha)
    const view = new Float32Array([derecha[0], arriba[0], atras[0], 0, derecha[1], arriba[1], atras[1], 0, derecha[2], arriba[2], atras[2], 0, -producto(derecha, ojo), -producto(arriba, ojo), -producto(atras, ojo), 1])
    const near = Math.max(.0001, radio / 2000), far = distancia + radio * 15, f = 1 / tan
    const proj = new Float32Array([f / aspecto, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0])
    gl.uniformMatrix4fv(this.uniforms.VP, false, multiplicar(proj, view))
    this.camara = { ojo, derecha, arriba, atras, distancia, tan, aspecto }
    this.visibles = [...(o.verConstruccion && m.componentes ? m.componentes : m.piezas), ...(m.espejos || []), ...(o.verHerrajes ? m.herrajes || [] : [])].filter((p) => (!o.interior || p.grupo !== 'frentes') && (!o.sinTrasera || p.grupo !== 'trasera') && (!o.aislar || !o.seleccionado || p.id === o.seleccionado))
    const acabado = o.acabado || { color: '#ecece5' }, color = acabado.color.match(/[a-f0-9]{2}/gi).map((n) => parseInt(n, 16) / 255)
    for (const p of this.visibles) {
      const elegido = p.id === o.seleccionado
      const colorActual = p.espejo ? [.64, .83, .88] : p.herraje ? [.57, .64, .67] : color
      const transformacion = transformarPieza(p, m, o.explosion || 0, this.progreso(p.movimiento?.id))
      gl.uniform3fv(this.uniforms.Centro, transformacion.posicion); gl.uniform1f(this.uniforms.Angulo, transformacion.angulo)
      gl.uniform3fv(this.uniforms.Dim, p.dimensiones.map((n) => n / 1000))
      gl.uniform3fv(this.uniforms.Color, elegido ? [.2, .69, .71] : colorActual)
      gl.uniform1f(this.uniforms.Veta, acabado.veta && !elegido && !p.herraje && !p.espejo ? 1 : 0); gl.uniform1f(this.uniforms.Plano, p.plano === 'horizontal' ? 2 : p.plano === 'lateral' ? 1 : 0)
      gl.uniform1f(this.uniforms.Linea, 0); this.buffer(this.solido); gl.drawArrays(gl.TRIANGLES, 0, 36)
      gl.uniform3fv(this.uniforms.Color, elegido ? [.03, .39, .43] : colorActual.map((n) => n * .54))
      gl.uniform1f(this.uniforms.Linea, 1); this.buffer(this.bordes); gl.drawArrays(gl.LINES, 0, 48)
    }
    this.canvas.dataset.piezasVisibles = String(this.visibles.length)
    this.canvas.dataset.estado = 'listo'
    this.canvas.dataset.abiertos = Object.keys(o.abiertos || {}).filter((id) => o.abiertos[id]).join(',')
    const animando = [...this.aperturas.values()].some((a) => a.inicio !== a.destino && performance.now() - a.tiempo < 380)
    this.canvas.dataset.animando = String(animando)
    if (animando && this.frame === null) this.frame = requestAnimationFrame(() => { this.frame = null; this.dibujar() })
    this.onCambio?.({ zoom: Math.round(this.zoom * 100), visibles: this.visibles.length })
  }
  buffer(buffer) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(this.pos); gl.vertexAttribPointer(this.pos, 3, gl.FLOAT, false, 24, 0)
    gl.enableVertexAttribArray(this.normal); gl.vertexAttribPointer(this.normal, 3, gl.FLOAT, false, 24, 12)
  }
  seleccionar(x, y) {
    if (!this.camara) return
    const r = this.canvas.getBoundingClientRect(), c = this.camara
    const nx = ((x - r.left) / r.width * 2 - 1) * c.tan * c.aspecto, ny = (1 - (y - r.top) / r.height * 2) * c.tan
    const direccion = unidad(c.atras.map((n, i) => -n + c.derecha[i] * nx + c.arriba[i] * ny))
    let encontrado = null, menor = Infinity
    for (const p of this.visibles || []) {
      const transformacion = transformarPieza(p, this.modelo, this.opciones.explosion || 0, this.progreso(p.movimiento?.id))
      const origenLocal = rotarY(c.ojo.map((n, i) => n - transformacion.posicion[i]), -transformacion.angulo)
      const dirLocal = rotarY(direccion, -transformacion.angulo)
      const d = intersectarCaja(origenLocal, dirLocal, [0, 0, 0], p.dimensiones.map((n) => n / 1000))
      if (d !== null && d < menor) { menor = d; encontrado = p }
    }
    this.onSeleccionar?.(encontrado?.id || null)
    return encontrado
  }
  dispose() {
    this.descartado = true; this.observer?.disconnect()
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    for (const [event, fn, opciones] of this.callbacks) this.canvas.removeEventListener(event, fn, opciones)
    for (const buffer of this.buffers) this.gl.deleteBuffer(buffer)
    for (const shader of this.shaders) this.gl.deleteShader(shader)
    if (this.programa) this.gl.deleteProgram(this.programa)
  }
}
