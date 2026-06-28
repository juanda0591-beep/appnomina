// Configuración de PM2 para producción.
// PM2 mantiene la app viva, la reinicia si se cae y la vuelve a levantar
// cuando reinicias el servidor.
//
// Uso en el VPS:
//   npm run build              # compila el frontend a dist/
//   pm2 start ecosystem.config.cjs
//   pm2 save                   # guarda la lista para que arranque sola al reiniciar
//   pm2 startup                # (una sola vez) genera el servicio de arranque
//
// Para actualizar tras subir cambios:
//   git pull && npm install && npm run build && pm2 restart nomina

module.exports = {
  apps: [
    {
      name: 'nomina',
      script: 'backend/server.js',
      cwd: __dirname,
      instances: 1,            // SQLite es un archivo: un solo proceso (no usar cluster)
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Restringe CORS a tu dominio. Cambia esto por el tuyo (con y sin www).
        ALLOWED_ORIGIN: 'https://luxarma.cloud,https://www.luxarma.cloud',
      },
    },
  ],
}
