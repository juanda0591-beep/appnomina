import toast from 'react-hot-toast'
import Swal from 'sweetalert2'

// Estilo base compartido por todos los toasts (combina con el diseño de la app)
const toastBase = {
  style: {
    borderRadius: '12px',
    background: '#0f172a', // --text (fondo oscuro, como sidebar/topbar)
    color: '#fff',
    fontSize: '15px',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    padding: '12px 16px',
    boxShadow: '0 10px 30px rgba(0,0,0,.25)',
    maxWidth: '90vw',
  },
}

// Notificaciones no bloqueantes (toasts)
export const notify = {
  ok: (msg) =>
    toast.success(msg, {
      ...toastBase,
      iconTheme: { primary: '#16a34a', secondary: '#fff' }, // verde éxito
    }),
  error: (msg) =>
    toast.error(msg, {
      ...toastBase,
      duration: 5000, // los errores se leen con más calma
      iconTheme: { primary: '#dc2626', secondary: '#fff' }, // --danger
    }),
  info: (msg) => toast(msg, toastBase),
}

// Confirmación asíncrona -> devuelve true/false
export async function confirmar(
  mensaje,
  {
    titulo = '¿Confirmar?',
    textoOk = 'Sí',
    textoCancelar = 'Cancelar',
    peligro = true,
  } = {}
) {
  const r = await Swal.fire({
    title: titulo,
    text: mensaje,
    icon: peligro ? 'warning' : 'question',
    showCancelButton: true,
    confirmButtonText: textoOk,
    cancelButtonText: textoCancelar,
    confirmButtonColor: peligro ? '#dc2626' : '#2563eb', // --danger / --primary
    cancelButtonColor: '#64748b', // --muted
    reverseButtons: true,
    buttonsStyling: true,
    customClass: {
      popup: 'swal-nomina',
    },
  })
  return r.isConfirmed
}
