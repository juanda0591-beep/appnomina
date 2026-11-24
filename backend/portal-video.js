import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import ffmpeg from 'ffmpeg-static'

const trabajos = new Map()
const MAX_VIDEO = 20 * 1024 * 1024
const ANCHO = 1280, ALTO = 720, FPS = 25, SEGUNDOS = 2.4

export function migrarVideos(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS portal_producto_videos (
    producto_id INTEGER PRIMARY KEY REFERENCES portal_productos(producto_id) ON DELETE CASCADE,
    video BLOB NOT NULL, firma TEXT NOT NULL, actualizado TEXT NOT NULL
  )`)
}

function firmaProducto(p) {
  return createHash('sha256').update(JSON.stringify([p.nombre, p.categoria, p.descripcion, p.medidas, p.galeria_revision])).digest('hex')
}

function datosProducto(db, id) {
  return db.prepare(`SELECT p.nombre, x.categoria, x.descripcion, x.medidas, x.galeria_revision, x.publicado
    FROM portal_productos x JOIN productos p ON p.id=x.producto_id WHERE x.producto_id=?`).get(id)
}

export function videoDisponible(db, id, publico = false) {
  const p = datosProducto(db, id)
  if (!p || (publico && !p.publicado)) return null
  const video = db.prepare('SELECT video, firma, actualizado FROM portal_producto_videos WHERE producto_id=?').get(id)
  return video?.firma === firmaProducto(p) ? video : null
}

export function videoEnRespuesta(db, id) {
  const p = datosProducto(db, id)
  const video = p && db.prepare('SELECT firma, actualizado FROM portal_producto_videos WHERE producto_id=?').get(id)
  return video && video.firma === firmaProducto(p)
    ? { tieneVideo: true, videoActualizado: video.actualizado }
    : { tieneVideo: false, videoActualizado: null }
}

export function estadoVideo(id) {
  return trabajos.get(Number(id)) || { estado: 'inactivo' }
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
}

function lineas(texto, max = 32) {
  const palabras = String(texto).trim().split(/\s+/), resultado = ['']
  for (const palabra of palabras) {
    const actual = resultado.at(-1)
    if (actual && `${actual} ${palabra}`.length > max && resultado.length < 2) resultado.push(palabra)
    else resultado[resultado.length - 1] = actual ? `${actual} ${palabra}` : palabra
  }
  return resultado.map((s) => escapar(s.slice(0, 58)))
}

async function fotograma(bytes, titulo, medidas, copy, primero, ultimo) {
  let base = sharp(bytes, { limitInputPixels: 24000000 }).rotate()
    .resize(ANCHO, ALTO, { fit: 'contain', background: '#e8eeeb', withoutEnlargement: false })
  if (primero || (ultimo && copy)) {
    const tituloLineas = lineas(primero ? titulo : copy, primero ? 32 : 56)
    const texto = tituloLineas.map((s, i) => `<text x="44" y="${577 + i * 39}" fill="#fff" font-family="Arial,sans-serif" font-size="${primero ? 33 : 29}" font-weight="700">${s}</text>`).join('')
    const subtitulo = primero && medidas ? `<text x="44" y="${tituloLineas.length === 1 ? 634 : 662}" fill="#d9ede5" font-family="Arial,sans-serif" font-size="21">${escapar(medidas.slice(0, 90))}</text>` : ''
    const franja = Buffer.from(`<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg"><rect y="515" width="${ANCHO}" height="205" fill="#173b32" fill-opacity=".94"/>${texto}${subtitulo}</svg>`)
    base = base.composite([{ input: franja }])
  }
  return base.png().toBuffer()
}

function ejecutar(args) {
  return new Promise((resolve, reject) => {
    const proceso = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true })
    let error = ''
    const limite = setTimeout(() => proceso.kill(), 120000)
    proceso.stderr.on('data', (d) => { error = (error + d.toString()).slice(-2000) })
    proceso.once('error', (e) => { clearTimeout(limite); reject(e) })
    proceso.once('close', (codigo) => {
      clearTimeout(limite)
      if (codigo === 0) resolve()
      else reject(new Error(`FFmpeg terminó con código ${codigo}: ${error}`))
    })
  })
}

async function producirVideo(fotos, producto, copy) {
  const dir = await mkdtemp(join(tmpdir(), 'nomina-video-'))
  try {
    const segmentos = []
    for (const [i, foto] of fotos.entries()) {
      const entrada = join(dir, `foto-${i}.png`), salida = join(dir, `segmento-${i}.mp4`)
      await writeFile(entrada, await fotograma(foto.imagen, producto.nombre, producto.medidas, copy, i === 0, i === fotos.length - 1))
      await ejecutar(['-loop', '1', '-framerate', String(FPS), '-i', entrada,
        '-vf', `zoompan=z='min(zoom+0.0006,1.045)':d=1:s=${ANCHO}x${ALTO}:fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.2,fade=t=out:st=2.15:d=0.25`,
        '-t', String(SEGUNDOS), '-r', String(FPS), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', salida])
      segmentos.push(salida)
    }
    const lista = join(dir, 'segmentos.txt'), salida = join(dir, 'video.mp4')
    await writeFile(lista, segmentos.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join('\n'))
    await ejecutar(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', salida])
    const video = await readFile(salida)
    if (!video.length || video.length > MAX_VIDEO) throw new Error('El video supera el tamaño permitido.')
    return video
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export function iniciarVideo(db, id, texto) {
  id = Number(id)
  const producto = datosProducto(db, id)
  if (!producto) return { error: 'Guarda primero la ficha comercial.', status: 404 }
  const fotos = db.prepare('SELECT imagen FROM portal_producto_imagenes WHERE producto_id=? ORDER BY posicion, id').all(id)
  if (fotos.length < 2) return { error: 'Guarda al menos dos fotografías para crear el video.', status: 400 }
  if (trabajos.get(id)?.estado === 'procesando') return { error: 'El video ya se está generando.', status: 409 }
  if ([...trabajos.values()].filter((j) => j.estado === 'procesando').length >= 2) return { error: 'Hay otros videos en proceso. Intenta en unos minutos.', status: 429 }
  if (!ffmpeg) return { error: 'FFmpeg no está disponible en este servidor.', status: 503 }
  if (texto !== undefined && (typeof texto !== 'string' || texto.trim().length > 160)) return { error: 'El texto del video debe tener máximo 160 caracteres.', status: 400 }
  const copy = (texto?.trim() || producto.descripcion || '').slice(0, 160)
  const firma = firmaProducto(producto)
  trabajos.set(id, { estado: 'procesando' })
  producirVideo(fotos, producto, copy).then((video) => {
    if (firmaProducto(datosProducto(db, id) || {}) !== firma) throw new Error('La ficha cambió mientras se generaba el video. Intenta de nuevo.')
    db.prepare(`INSERT INTO portal_producto_videos(producto_id,video,firma,actualizado) VALUES(?,?,?,?)
      ON CONFLICT(producto_id) DO UPDATE SET video=excluded.video,firma=excluded.firma,actualizado=excluded.actualizado`)
      .run(id, video, firma, new Date().toISOString())
    trabajos.set(id, { estado: 'completado' })
  }).catch((e) => {
    console.error('Error al generar video mayorista:', e.message)
    trabajos.set(id, { estado: 'error', mensaje: 'No se pudo generar el video. Revisa FFmpeg e intenta de nuevo.' })
  })
  return { estado: 'procesando' }
}

export function quitarVideo(db, id) {
  if (estadoVideo(id).estado === 'procesando') return false
  db.prepare('DELETE FROM portal_producto_videos WHERE producto_id=?').run(id)
  trabajos.delete(Number(id))
  return true
}

export function enviarVideo(res, video, rango) {
  const total = video.length
  res.set({ 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' })
  if (rango) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rango)
    if (!match || Number(match[1]) >= total) return res.status(416).set('Content-Range', `bytes */${total}`).end()
    const inicio = Number(match[1]), fin = match[2] ? Math.min(Number(match[2]), total - 1) : Math.min(inicio + 1024 * 1024 - 1, total - 1)
    if (fin < inicio) return res.status(416).set('Content-Range', `bytes */${total}`).end()
    return res.status(206).set({ 'Content-Range': `bytes ${inicio}-${fin}/${total}`, 'Content-Length': String(fin - inicio + 1) }).send(video.subarray(inicio, fin + 1))
  }
  return res.set('Content-Length', String(total)).send(video)
}
