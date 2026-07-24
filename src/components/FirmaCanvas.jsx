import { useEffect, useRef, useState } from 'react'
import { confirmar } from '../utils/notify.js'

// Lienzo para dibujar una firma con el dedo (móvil) o el mouse (escritorio).
// Usa Pointer Events, que cubren touch/mouse/stylus con la misma API.
// `valorInicial` (dataURL PNG) precarga una firma ya guardada; `onGuardar`
// recibe el nuevo dataURL al presionar Guardar, o null al Borrar.
export default function FirmaCanvas({ valorInicial, onGuardar, guardando }) {
  const canvasRef = useRef(null)
  const dibujando = useRef(false)
  // 'sin_cambios': lo cargado no se ha tocado (no reenviar al guardar).
  // 'dibujada': hay trazo nuevo que exportar. 'borrada': se limpió a propósito.
  const [estado, setEstado] = useState(valorInicial ? 'sin_cambios' : 'borrada')

  // Prepara el canvas a resolución nativa (evita que la firma se vea borrosa
  // en pantallas de alta densidad) y precarga la firma existente si hay.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const ratio = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width * ratio
    canvas.height = height * ratio
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'

    if (valorInicial) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, width, height)
      img.src = valorInicial
    }
  }, [])

  const posicion = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    dibujando.current = true
    const { x, y } = posicion(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const onPointerMove = (e) => {
    if (!dibujando.current) return
    e.preventDefault()
    const { x, y } = posicion(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
    setEstado('dibujada')
  }

  const onPointerUp = () => { dibujando.current = false }

  const limpiar = async () => {
    if (estado === 'borrada') return // ya está vacío, no hay nada que confirmar
    if (!(await confirmar('¿Borrar la firma del lienzo?'))) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const ratio = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio)
    setEstado('borrada')
  }

  const guardar = () => {
    if (estado === 'sin_cambios') return // nada que enviar, no se tocó
    onGuardar(estado === 'dibujada' ? canvasRef.current.toDataURL('image/png') : null)
  }

  return (
    <div className="firma-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="firma-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <div className="form-actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={limpiar}>🗑️ Borrar</button>
        <button type="button" className="btn-primary" onClick={guardar} disabled={guardando || estado === 'sin_cambios'}>
          {guardando ? 'Guardando…' : '💾 Guardar firma'}
        </button>
      </div>
    </div>
  )
}
