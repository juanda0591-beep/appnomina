import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const archivo = fileURLToPath(new URL('../.env.local', import.meta.url))
if (existsSync(archivo) && process.loadEnvFile) process.loadEnvFile(archivo)
