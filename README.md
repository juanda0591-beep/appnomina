# Sistema de Nómina

Aplicación web (React + Vite + Node/Express + SQLite) para manejar la nómina de
empleados por trabajo a destajo. Responsiva: funciona en celular, tablet y computador.

## Arquitectura

- **Frontend**: React + Vite (carpeta `src/`).
- **Backend**: Node + Express con base de datos **SQLite** (`backend/`). El archivo
  de datos se crea solo en `backend/nomina.db`.
- En desarrollo corren dos procesos (API en `:3001`, web en `:5173`) con proxy.
- En producción el mismo servidor Express sirve la web compilada en `:3001`.

## Cómo ejecutar

```bash
npm install        # solo la primera vez

# Desarrollo (recarga en vivo) — abre http://localhost:5173
npm run dev

# Producción / acceso desde celular y tablet — abre http://localhost:3001
npm start
```

### Acceder desde el celular o la tablet
1. Ejecuta `npm start` en tu PC.
2. Asegúrate de que el celular esté en la **misma red WiFi**.
3. En el navegador del celular entra a `http://IP-DE-TU-PC:3001`
   (ej: `http://192.168.1.22:3001`). La IP la muestra el servidor al iniciar.
4. Si no carga, permite Node.js en el Firewall de Windows (red privada).

## Inicio de sesión

La app pide usuario y contraseña. El primer arranque crea un usuario por defecto:

- **Usuario:** `admin`
- **Contraseña:** `admin123`

Cámbiala desde **🔒 Mi cuenta** la primera vez. Las contraseñas se guardan cifradas
(scrypt) y la sesión usa un token firmado válido por 30 días.

## Secciones

1. **🧾 Pago de Nómina** — Selecciona empleado, agrega trabajos (producto + proceso +
   cantidad → el valor se calcula solo), aplica descuentos de préstamos y genera el PDF.
2. **📦 Productos** — Productos (ej: "Armario 3 cuerpos") con varios procesos, cada uno
   con su pago por unidad (ej: Pintura $5, Armado $8).
3. **👷 Empleados** — Registro de empleados.
4. **💵 Préstamos** — Préstamos por empleado; el saldo se descuenta al aplicarlo en nómina.
5. **📚 Historial** — Pagos anteriores; reimprime el PDF.
6. **📊 Reportes** — Totales y resumen por empleado en un **rango de fechas**, con PDF.
7. **🏢 Empresa** — Nombre, NIT, dirección, teléfono, correo y logo (JPG/PNG) que
   aparecen en el encabezado de todos los PDF.
8. **🔒 Mi cuenta** — Cambiar contraseña y cerrar sesión.

### Ejemplo
Juan pintó 10 armarios de 3 cuerpos. "Pintura" se paga $5/unidad → 10 × $5 = **$50**.
Si tiene un préstamo, descuentas un monto y el total baja; su saldo se reduce solo.

## Respaldo de datos
Toda la información está en `backend/nomina.db`. Para respaldar, copia ese archivo.
La moneda está en pesos colombianos (COP); se cambia en `src/utils/format.js`.
