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

Cámbiala desde **🔒 Mi cuenta** la primera vez. Las contraseñas se guardan como hashes
(scrypt) y la sesión usa un token firmado válido por 30 días, comprobado en el servidor.
Cerrar sesión revoca el token del dispositivo cuando hay conexión. Eliminar una
cuenta, restablecer su contraseña o cambiar sus permisos revoca todas sus sesiones.
Al cambiar tu propia contraseña se renueva la sesión actual y se cierran las demás.
Esta actualización invalida los tokens antiguos: es necesario iniciar sesión de nuevo.

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

## IA para crear materiales

En **Materiales > Nuevo material > Preparar con IA**, describe un material para
obtener un borrador, revisar datos pendientes y ver posibles duplicados. Aplicar
el borrador completa el formulario; el material solo se registra al guardar y
confirmar con el flujo habitual. Disponible para usuarios con permisos de ver y
crear materiales. Los datos extraídos por IA requieren revisión humana.

Configura `OPENAI_API_KEY` y `OPENAI_MODEL` en el entorno del servidor o en un
archivo `.env.local` en la raíz, siguiendo `.env.example`. La carga de ese archivo
requiere Node.js 20.12 o superior. Reinicia el servidor tras configurar. El modelo
debe admitir Structured Outputs en Responses y estar habilitado en tu cuenta de
OpenAI. La API requiere su propia facturación; sin conexión configurada, el alta
manual sigue disponible. No pongas la clave en variables `VITE_` ni en el navegador.

Se envían a OpenAI la descripción escrita, hasta 300 colores activos (ID y nombre)
y hasta 200 nombres de familias. El catálogo completo de materiales se compara
localmente para buscar similitudes por nombre. No se envían existencias, precios
del catálogo, empleados ni nóminas. Las solicitudes usan `store: false`. Esto no
equivale a una garantía de retención cero del proveedor. No se guardan prompts ni
respuestas en la base de datos. Máximo tres solicitudes simultáneas y una por
usuario cada seis segundos, con tiempo de espera de 45 segundos.

Referencia: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## IA para crear productos

En **Productos > Nuevo producto > Preparar con IA**, describe un producto, sus
procesos en orden, pagos por unidad, consumos de materiales por producto y piezas
a verificar. Se prepara un borrador para revisar y aplicar al formulario. No crea
registros hasta confirmar el guardado habitual. Usa la misma configuración de IA
que materiales; requiere ver y crear productos y ver materiales.

El asistente consulta hasta 500 materiales (ID, nombre y unidad) y 200 nombres de
procesos. Envía esos datos y la descripción a OpenAI, sin enviar precios ni stocks
del catálogo. Los productos existentes se comparan localmente por nombre
normalizado. Si se limita el catálogo, aparece una observación. Los límites de
solicitudes se comparten con materiales.

Los valores desconocidos quedan pendientes; los materiales no registrados se
muestran sin vincular. Al guardar un borrador aplicado, se exige completar o quitar
las filas de procesos, materiales y piezas pendientes. Los procesos nuevos quedan
asociados al producto, sin crear entradas en el catálogo global. Las piezas son
una lista de control de calidad; no generan medidas ni planos de corte. Los
procesos solo se proponen si se solicitan explícitamente. Una respuesta válida
puede contener errores de interpretación y siempre requiere revisión humana.

Pruebas de los asistentes: `node --test backend/ia-*.test.js`.

## Validación de nómina

El servidor recalcula los importes con las tarifas vigentes del catálogo y rechaza
pagos con datos desactualizados, descuentos mayores al saldo o tareas que ya están
pagadas. Cada tarea cargada queda vinculada a su fila; quitarla del formulario la
deja pendiente de pago. Para modificar una tarea, hazlo desde Gestión de Nómina.

Los reintentos de la misma solicitud devuelven el pago registrado, sin duplicar
el gasto ni los descuentos. Los trabajos manuales siguen disponibles; dos pagos
manuales iniciados por separado no se consideran automáticamente duplicados.
Si falla la descarga del PDF después de guardar, reimprime desde Historial.

Los pagos nuevos conservan extras, descuentos por trabajo y saldos de préstamos
del momento del pago para la reimpresión. La actualización agrega columnas sin
modificar los pagos anteriores; no recupera conceptos que antes no se guardaban.
Después de actualizar el servidor y compilar la web, recarga las pestañas abiertas.

Pruebas: `node --test backend/nomina.test.js backend/nomina-api.test.js backend/ia-*.test.js`.
Las pruebas de nómina usan bases aisladas. La versión de Node debe coincidir con
la usada para instalar `better-sqlite3` (en este entorno, Node 22).

## Respaldo de datos

El servidor crea un respaldo consistente al arrancar si no hay uno reciente y
cada 24 horas mientras permanece encendido. Conserva las últimas 30 copias en
`backend/respaldos/` (o en `respaldos/` junto al archivo indicado por `DB_PATH`).
Usa SQLite Online Backup para incluir las operaciones del WAL; no copies solo
`nomina.db` mientras la aplicación está funcionando.

En **Administración > Respaldos**, disponible solo para administradores, puedes
crear una copia, comprobar su integridad y descargarla. Los archivos incompletos
no aparecen en la lista; una copia nueva se publica solo después de verificarla.

Variables opcionales en `.env.local` o en el entorno del servidor:

- `BACKUP_DIR`: carpeta de destino. Usa un disco externo o una carpeta sincronizada
  para conservar copias fuera del servidor; por defecto son copias locales.
- `BACKUP_INTERVAL_HOURS`: intervalo de 1 a 168 horas; por defecto 24.
- `BACKUP_RETENTION`: cantidad de copias, de 1 a 365; por defecto 30.
- `BACKUP_ENABLED=false`: desactiva la programación automática; permite copias manuales.

Las copias contienen la información completa del negocio. No las publiques ni
las guardes dentro de `public/` o `dist/`. Configura los permisos de la carpeta de
destino para el usuario del servidor. En Windows también se aplican las ACL de esa carpeta.

### Restaurar

Detén el servidor y restaura a **un archivo nuevo**, conservando la base actual:

```bash
node backend/restaurar.js --origen "ruta/al/respaldo.db" --destino "backend/nomina-recuperada.db"
```

El comando verifica integridad y referencias, conserva datos e historial de
auditoría y elimina las sesiones anteriores. Nunca sobrescribe una base existente.
Configura `DB_PATH` con la ruta absoluta del archivo recuperado y arranca el
servidor. Verifica nóminas, ventas y saldos antes de volver a registrar operaciones.
Las migraciones se aplican al iniciar; los tokens previos no vuelven a funcionar.

## Actividad financiera

En **Administración > Actividad financiera**, el administrador puede filtrar por
fecha (hora de Colombia), usuario, registro y acción, y comparar los valores
anteriores y posteriores. Se registran nóminas, descuentos, préstamos, caja,
ventas y abonos, anticipos y cambios de inventario de productos y materiales.
Los registros de una misma solicitud comparten un identificador de operación.

Las anulaciones de nóminas, préstamos, movimientos manuales, ventas y anticipos
requieren un motivo de 3 a 500 caracteres. El historial sobrevive al borrado de
la operación; un pago que se revierte por error no deja entradas de auditoría.
No se copian contraseñas, sesiones ni archivos adjuntos al historial; los cambios
de comprobante se identifican por su huella SHA-256.

El registro comienza al instalar esta actualización. Cubre escrituras de la
aplicación, no ediciones externas del archivo SQLite. No se puede editar ni borrar
desde la aplicación; no sustituye una copia externa frente a quien tenga acceso
administrativo al servidor.

## Pruebas

```bash
node --test backend/*.test.js
npm run build
```

Las pruebas usan bases en memoria o archivos temporales e incluyen revocación de
sesiones, reintentos de nómina, ventas, inventario, auditoría y restauración desde
un respaldo descargado. Usa la versión de Node compatible con `better-sqlite3`;
en este entorno la dependencia instalada corresponde a Node 22.

La moneda está en pesos colombianos (COP); se cambia en `src/utils/format.js`.
