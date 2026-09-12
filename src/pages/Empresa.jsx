import { useEffect, useState } from 'react'
import { useLocalData } from '../hooks/useLocalData.js'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { notify, confirmar } from '../utils/notify.js'
import FirmaCanvas from '../components/FirmaCanvas.jsx'

const vacio = { nombre: '', direccion: '', telefono: '', correo: '', nit: '', logo: '', firma: '' }

export default function Empresa() {
  // Carga local de datos
  const { data: empresa, cargando, recargar } = useLocalData('/empresa')

  // Funciones de mutación del context
  const { updateEmpresa } = useData()
  const { puede } = useAuth()
  const puedeEditar = puede('empresa', 'editar')
  const [form, setForm] = useState(vacio)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (empresa) setForm({ ...vacio, ...empresa })
  }, [empresa])

  const setField = (field, val) => {
    setForm((f) => ({ ...f, [field]: val }))
    setGuardado(false)
  }

  const onLogo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/image\/(jpeg|jpg|png)/.test(file.type)) {
      notify.error('El logo debe ser una imagen JPG o PNG')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      notify.error('El logo es muy pesado (máx 2 MB). Usa una imagen más liviana.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setField('logo', reader.result) // dataURL base64
    reader.readAsDataURL(file)
  }

  const onQuitarLogo = async () => {
    if (!(await confirmar('¿Quitar el logo de la empresa?'))) return
    setField('logo', '')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify.error('El nombre de la empresa es obligatorio'); return }
    setGuardando(true)
    try {
      await updateEmpresa(form)
      await recargar()
      setGuardado(true)
    } catch (err) {
      notify.error('Error al guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  // La firma se guarda aparte (no espera al submit general del formulario),
  // enviando los demás datos actuales para no pisarlos.
  const [guardandoFirma, setGuardandoFirma] = useState(false)
  const handleGuardarFirma = async (dataUrl) => {
    setGuardandoFirma(true)
    try {
      await updateEmpresa({ ...form, firma: dataUrl || '' })
      await recargar()
      setField('firma', dataUrl || '')
      notify.ok(dataUrl ? 'Firma guardada' : 'Firma eliminada')
    } catch (err) {
      notify.error('Error al guardar la firma: ' + err.message)
    } finally {
      setGuardandoFirma(false)
    }
  }

  if (cargando) {
    return (
      <div>
        <h2>🏢 Datos de la empresa</h2>
        <div className="banner">Cargando datos de la empresa...</div>
      </div>
    )
  }

  if (!empresa) {
    return (
      <div>
        <h2>🏢 Datos de la empresa</h2>
        <div className="banner error">No se pudieron cargar los datos de la empresa</div>
      </div>
    )
  }

  return (
    <div>
      <h2>🏢 Datos de la empresa</h2>
      <p className="muted">
        Esta información (y el logo) aparecerá en el encabezado de todos los PDF para
        que los comprobantes se vean profesionales.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Nombre de la empresa</label>
            <input value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder="Ej: Muebles El Roble" />
          </div>
          <div style={{ flex: 1 }}>
            <label>NIT / Identificación</label>
            <input value={form.nit} onChange={(e) => setField('nit', e.target.value)} placeholder="Ej: 900.123.456-7" />
          </div>
        </div>

        <label>Dirección</label>
        <input value={form.direccion} onChange={(e) => setField('direccion', e.target.value)} placeholder="Ej: Calle 10 # 20-30, Bogotá" />

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Teléfono</label>
            <input value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} placeholder="Ej: 310 555 5555" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Correo</label>
            <input type="email" value={form.correo} onChange={(e) => setField('correo', e.target.value)} placeholder="Ej: contacto@empresa.com" />
          </div>
        </div>

        <label>Logo (JPG o PNG)</label>
        <input type="file" accept="image/jpeg,image/png" onChange={onLogo} />
        {form.logo && (
          <div className="logo-preview">
            <img src={form.logo} alt="Logo" />
            <button type="button" className="btn-secondary" onClick={onQuitarLogo}>
              Quitar logo
            </button>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={guardando || !puedeEditar}>
            {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
          {guardado && <span className="chip">✅ Guardado</span>}
          {!puedeEditar && <span className="muted small">No tienes permiso para editar estos datos.</span>}
        </div>
      </form>

      <div className="card">
        <h3>✍️ Firma del representante</h3>
        <p className="muted small">
          Dibuja la firma con el dedo (desde el móvil) o el mouse. Se guarda como imagen
          y queda impresa en los PDF donde aparece "Firma del representante".
        </p>
        {puedeEditar ? (
          <FirmaCanvas valorInicial={form.firma} onGuardar={handleGuardarFirma} guardando={guardandoFirma} />
        ) : form.firma ? (
          <div className="logo-preview">
            <img src={form.firma} alt="Firma del representante" />
          </div>
        ) : (
          <p className="muted small">No hay firma guardada. No tienes permiso para editarla.</p>
        )}
      </div>
    </div>
  )
}
