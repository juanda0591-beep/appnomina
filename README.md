# Sistema de Nómina

Aplicación web (React + Vite + Node/Express + SQLite) para manejar la nómina de
empleados por trabajo a destajo. Responsiva: funciona en celular, tablet y computador.

## Arquitectura

- **Frontend**: React + Vite (carpeta `src/`).
- **Backend**: Node + Express con base de datos **SQLite** (`backend/`). El archivo
  de datos se crea solo en `backend/nomina.db`.
- En desarrollo corren dos procesos (API en `:3001`, web en `:5173`) con proxy.
- En producción el mismo servidor Express sirve la web compilada en `:3001`.

## Portal mayorista · etapa 1

El catálogo privado tiene una entrada y una interfaz independientes en `/catalogo/`.
Su código está en `src/portal/`, se compila con la aplicación y usa exclusivamente
`/api/portal`. La administración se encuentra en **Portal mayorista**, disponible
solo para administradores, y usa `/api/portal-admin`. El sistema mantiene una sola
base de productos, clientes y pedidos. Las migraciones agregan tablas `portal_*`;
ningún producto existente se publica automáticamente.

Para comenzar:

1. Configura el nombre comercial en **Empresa** y crea los productos en **Productos**.
2. En **Portal mayorista > Catálogo y fotografías**, completa categoría, descripción,
   medidas, hasta seis fotos JPG/PNG/WebP (hasta 2 MB cada una), mínimo por color y precio mayorista. Si
   dejas el precio vacío, se usa el precio de venta vigente del producto. Publica
   únicamente las fichas que quieras mostrar a clientes aprobados.
3. Comparte la dirección `/catalogo/` del servidor con tus clientes. El registro
   solicita datos comerciales, correo y contraseña de al menos 10 caracteres.
4. Revisa cada solicitud en **Clientes y solicitudes** y vincúlala a un cliente
   existente o crea uno al aprobarla. No se vinculan cuentas automáticamente por
   correo/NIT. Una cuenta aprobada puede suspenderse y su contraseña puede
   restablecerse desde este panel tras verificar la identidad del solicitante.
5. Los pedidos llegan a **Comercial > Pedidos**, identificados como **Portal
   mayorista**, con la dirección y el teléfono solicitados. Se editan y convierten
   en venta con el flujo existente, conservando el cliente original.

Los clientes pueden buscar por nombre/referencia, filtrar categorías, seleccionar
color, preparar su carrito, confirmar dirección y consultar/repetir sus pedidos
del portal con precios actuales. Cambiar contraseña revoca las otras sesiones.
Al agregar un producto aparece una confirmación grande con foto, unidades agregadas,
cantidad acumulada y total del carrito. Permanece visible hasta elegir **Seguir
eligiendo productos** o **Ver mi pedido y continuar**. Agregar productos no envía el
pedido: se explica el siguiente paso y una barra fija mantiene visibles la cantidad,
el total y **Ver y enviar mi pedido**. Las tarjetas identifican los productos ya
agregados. La guía del catálogo explica elegir, revisar y confirmar; el envío final
conserva la revisión de cantidades, dirección y casilla de confirmación.

Cada ficha permite seleccionar varias fotografías a la vez, ordenarlas, elegir
la portada y quitar imágenes. Estos cambios se aplican al guardar la ficha;
cancelarla conserva la galería anterior. La primera foto aparece como portada.
Los clientes pueden recorrer las fotos con las flechas de la tarjeta, abrirlas
en un visor ampliado con miniaturas y deslizar en el celular. El visor también
admite las flechas del teclado y Escape para cerrar.

Las fotos anteriores se incorporan automáticamente como portada. Se guardan en
`portal_producto_imagenes`, dentro del mismo respaldo de SQLite, y mantienen los
permisos del catálogo: las imágenes de productos ocultos tampoco se pueden abrir
conociendo su dirección. Si otra sesión cambia la galería mientras editas, se pide
reabrir la ficha para evitar sobrescribir esas fotos. Pruebas de migración y API:
`node --test backend/portal-imagenes.test.js`.

El carrito y los reintentos se conservan al recargar la misma pestaña; no se
sincronizan entre dispositivos ni se garantizan tras cerrar la pestaña.

**Disponibilidad:** «Bajo pedido» permite solicitar fabricación. «Solo existencias»
valida el stock por color menos las cantidades de pedidos pendientes. La recepción
no descuenta inventario: se descuenta al convertir en venta, como en el sistema
actual. Las ventas internas pueden cambiar esa disponibilidad; el proveedor debe
confirmar la entrega. El pedido no cobra pagos ni calcula flete. El estado interno
«entregado» significa que se convirtió en venta y así se aclara en el portal.

Los precios, mínimos, publicación y colores se verifican de nuevo en el servidor.
Un precio desactualizado exige actualizar y revisar el carrito. Los reintentos del
mismo envío recuperan el pedido sin duplicarlo, incluso después de perder la
respuesta y recargar. Los pedidos eliminados conservan una referencia anulada para
impedir que un reintento los recree. El historial del portal incluye únicamente los
pedidos originados por esa cuenta; no expone observaciones internas ni otras cuentas.

Las sesiones mayoristas usan cookies HttpOnly/SameSite=Strict, independientes de
los usuarios internos, y caducan en siete días. Se revocan al suspender/restablecer
una cuenta o restaurar un respaldo. Las API del portal no cachean datos; las
mutaciones requieren JSON y un encabezado propio, y validan el origen. El despliegue
debe usar HTTPS detrás del proxy configurado y mantener portal/API en el mismo
origen (también si posteriormente se utiliza un subdominio). Las fotos se validan,
optimizan y guardan en SQLite; solo clientes aprobados y administradores pueden
consultarlas. Los respaldos existentes incluyen estas nuevas tablas e imágenes.

En esta etapa se usa un precio mayorista general por producto. Quedan para etapas
posteriores las listas de precios por cliente, pagos en línea y el agente de IA.
WhatsApp tiene su propia etapa y activación, descrita a continuación.

### WhatsApp · etapa 2

La integración de WhatsApp está separada del servidor de pedidos. **Portal
mayorista > WhatsApp** permite activar los envíos, ver la cola, preparar una vista
previa de ofertas y conectar o desvincular el número mediante QR. Las confirmaciones
de recepción, cambios de fecha y conversión a venta se encolan solo para clientes
que autorizaron notificaciones. Las ofertas se limitan a clientes que autorizaron
ofertas; el texto siempre incluye cómo responder `BAJA`. Una baja cancela mensajes
pendientes y retira ambas autorizaciones de la cuenta asociada al número.

El proceso de la API no mantiene una sesión de WhatsApp. En producción se debe
instalar Baileys **en la carpeta aislada** y arrancar el trabajador aparte:

```bash
cd /opt/appnomina
npm ci --prefix services/whatsapp
# Configura WHATSAPP_ENABLED=true en .env.local antes de iniciar.
pm2 start ecosystem.config.cjs --only nomina-whatsapp
pm2 save
```

Baileys está instalado en la versión exacta `7.0.0-rc14` (candidata a lanzamiento),
con sus dependencias fijadas en `services/whatsapp/package-lock.json`. Se verificó
la carga con Node 22, la persistencia de credenciales y claves protobuf, y el
inicio del protocolo mediante un servidor WebSocket local. La vinculación con
WhatsApp y un envío real requieren el número del negocio y conexión a Internet.
`node --test backend/whatsapp-instalado.test.js` reproduce esta comprobación local
sin contactar WhatsApp ni enviar mensajes; se omite si el servicio no está instalado.

En desarrollo local, con la aplicación encendida y `WHATSAPP_ENABLED=true` en
`.env.local`, abre otra terminal en la raíz del proyecto y ejecuta `npm run whatsapp`.
Entra como administrador a `http://localhost:3001/portal-mayorista`, abre **WhatsApp**
y pulsa **Conectar WhatsApp**. La terminal debe permanecer abierta. Si aparece un
bloqueo de red `EACCES`, inicia el servicio desde una terminal con acceso a Internet.

Con el trabajador activo y Baileys instalado, `Conectar WhatsApp` muestra el QR en
el panel. La conexión deja la cola pausada; desmarca **Pausar todos los envíos** y
guarda la configuración cuando quieras empezar. Guarda la carpeta indicada
por `WHATSAPP_AUTH_DIR` en un directorio privado fuera de `public/` y de los
respaldos compartidos; contiene credenciales de la cuenta. El trabajador usa un
único propietario en SQLite, renueva su latido y no permite dos procesos enviando.
Al reiniciar durante un envío, el mensaje queda en **revisión**; debes comprobar
la conversación antes de pulsar **Revisar y reintentar**. Los errores comprobables
(número inexistente, autorización retirada, cuenta suspendida, mensaje vencido)
se marcan fallidos o cancelados sin reintento automático. Los pedidos nunca dependen de que WhatsApp esté activo.

Baileys es una conexión no oficial y puede sufrir desconexiones o bloqueos.
WhatsApp Business Platform puede sustituirlo posteriormente. La
cola y el panel conservan la misma interfaz para poder cambiarlo posteriormente.

El trabajador usa `qrcode`, ya incluido en las dependencias principales, y no guarda
el contenido de mensajes entrantes. Ante `BAJA`, conserva el número bloqueado y
la fecha, y no envía una respuesta automática. Solo interpreta conversaciones
individuales con número telefónico identificable; los identificadores LID sin
correspondencia telefónica no se interpretan como números. Un número bloqueado
por BAJA no puede reactivarse mediante las casillas de Mi cuenta. No responde conversaciones
libres y no incorpora aún un agente de IA. La
configuración inicia con envíos pausados; activar el trabajador y los envíos son dos
decisiones separadas. Validación sin conexión real: `node --test backend/whatsapp*.test.js`. Las pruebas de interfaz del portal también
comprueban el panel, la vista previa, su invalidación al editar y la cancelación.

Los mensajes usan el teléfono registrado y autorizado de la cuenta, no un número
de entrega ingresado en un pedido. Las cuentas anteriores empiezan sin autorización
de notificaciones de pedidos; cada cliente puede activarla en **Mi cuenta**. Las
ofertas vigentes conservan la autorización de la primera etapa. Los avisos de
pedido vencen a los tres días y las ofertas a las 24 horas. La restauración de un
respaldo cancela todos los mensajes no enviados, invalida borradores de campañas
y pausa/desconecta el servicio. «Enviado» no significa leído ni entregado. Un mensaje
ya en transmisión no puede recuperarse al pausar o retirar la autorización.

Validación: `node --test backend/portal-api.test.js`. Después de compilar,
`node --test tests/portal-ui.test.mjs` comprueba registro, aprobación, foto, compra,
respuesta perdida/reintento, historial, cambio de contraseña y vista móvil con una
base temporal. Acepta `PLAYWRIGHT_MODULE`, `BROWSER_EXECUTABLE` y
`UI_SCREENSHOT_DIR` igual que las otras pruebas de interfaz.

## Cómo ejecutar

```bash
npm install        # solo la primera vez

# Desarrollo (recarga en vivo) — abre http://localhost:5173
npm run dev

# Producción / acceso desde celular y tablet — abre http://localhost:3001
npm start
```

### Actualizar el VPS

El proyecto está en `/opt/appnomina`. Comando de actualización:

```bash
cd /opt/appnomina && git pull && npm install && npm run build && pm2 restart nomina
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

## Cortes y planos de taller

El editor permite crear un proyecto independiente o cargar el despiece de un
producto. Admite láminas personalizadas, unidades a fabricar, espesor, ancho del
disco, saneado por borde, orientación de veta y cantos por pieza. Los cantos se
marcan en naranja; las medidas introducidas son medidas de corte y no se ajustan
automáticamente por el espesor del tapacanto. El lote admite distintos espesores
de MDF y los distribuye en láminas separadas, con un máximo de 1000 componentes.
El motor conserva el corte tipo guillotina.

El visor incluye selección desde la tabla o el plano, zoom, desplazamiento,
rejilla, cotas, retazos y pantalla completa. Los cambios en medidas invalidan el
resultado y desactivan el guardado y el PDF hasta volver a calcular. Deshacer y
rehacer permiten recuperar hasta 40 cambios del editor manual.

**Guardar versión** conserva el proyecto y recalcula su resultado en el servidor.
**Proyectos** permite reabrir versiones; **Guardar como copia** inicia un proyecto
independiente. Las versiones anteriores no se sobrescriben y se rechaza guardar
desde una revisión antigua si existe una más reciente. Los planos antiguos siguen
disponibles para exportar, pero no recuperan la configuración que no se guardó.
Los permisos de crear, editar y eliminar se verifican en el servidor.

El generador conserva sus medidas y módulos en el proyecto. Sus vistas técnicas
frontal, lateral y superior muestran la estructura; no incluyen mecanizados ni
herrajes. Editar manualmente una pieza desvincula esas vistas para evitar un
dibujo que ya no corresponda al despiece.

### Construcción configurable

Los diseños nuevos usan reglas de construcción v2. **Editar construcción** abre
el configurador; **Personalizar construcción** adapta un diseño anterior para
revisar sus nuevas medidas antes de guardar otra versión. Las versiones antiguas
conservan sus cálculos y no se modifican automáticamente.

- Techo y piso tienen montaje independiente entre laterales o cubriéndolos,
  con sobresalientes en mm. El ancho/alto/fondo del formulario definen la carcasa;
  el 3D muestra las medidas exteriores incluyendo vuelos y frentes.
- Cada módulo admite un ancho útil fijo o automático y frentes embutidos o
  sobrepuestos con solape de medio espesor.
- Las cajoneras admiten altura inicial desde el piso interior, alto de zona,
  cantidad, ancho completo o parcial y ubicación izquierda/derecha. Las puertas
  se generan en los huecos libres; con cajonera parcial, puertas y entrepaños
  quedan en el compartimiento contiguo.
- Las guías pueden ser sin riel, laterales, ocultas o personalizadas. Los rieles
  exigen ingresar holgura por lado y largo según fabricante. El ancho exterior
  de caja es el hueco menos dos holguras. Sin riel se propone una holgura editable
  de 2 mm por lado. La profundidad automática usa el largo del riel o el espacio
  disponible; también se admite profundidad manual.
- La caja admite retiro detrás del frente, holguras trasera y vertical, fondo
  entre paredes o debajo. Incluye dos costados, contrafrente, trasera y fondo,
  más el frente decorativo. El perfil de fábrica permite fondos de distinto espesor.

Una misma geometría genera piezas, modelo y proyecciones. Se rechazan medidas
que no caben, rieles demasiado largos, cajones fuera del módulo y entrepaños que
atraviesan cajoneras completas. No es una validación estructural o exhaustiva de
colisiones. Los rieles del 3D son esquemáticos y no entran al corte de tableros.
Los rieles ocultos pueden requerir rebajes, perforaciones y descuentos del
fabricante que esta versión no genera; tampoco calcula fondos ranurados.
El PDF incluye una hoja con vuelos, posiciones, cajas, guías y holguras.

Pruebas: `node --test backend/construccion-mueble.test.js` y, tras compilar,
`node --test tests/construccion-ui.test.mjs` con Playwright.

### MDF 9 mm, fondos 3 mm y piezas compuestas

**Usar MDF 9 mm / fondos 3 mm** activa la fabricación del taller. Las bases de
**Armario** y **Tocador** son puntos de partida editables con medidas de ejemplo;
no se presentan como mediciones obtenidas de fotografías. El tocador incluye
repisas superiores y un marco con espejo deslizante. Sus complementos se pueden
agregar, quitar y ajustar en milímetros. El vidrio se documenta aparte del MDF.

Al seleccionar un panel en el 3D aparece su editor: tamaño, posición de montaje,
espesor, construcción y lado de bisagra para puertas. Los cambios se aplican a
esa pieza, se guardan con el proyecto e invalidan el plano de corte anterior.
Los ajustes libres de tamaño/posición no ajustan automáticamente todos los
encuentros vecinos; deben revisarse antes de fabricar. El espesor de techo, piso,
laterales y divisiones se incorpora al cálculo del espacio útil.

- **Simple:** un tablero del espesor indicado.
- **Reengrueso:** una cara completa y tiras planas de MDF de 9 mm en los bordes
  elegidos. Se configuran el ancho de las tiras y el espesor terminado; este
  último debe equivaler a la cara más un número entero de capas de 9 mm.
- **Entamborado:** dos caras de espesores configurables y bastidor de tiras de
  MDF de 9 mm de canto. La altura de las tiras es el espesor terminado menos
  ambas caras. Se puede indicar el número de refuerzos interiores. Esta es una
  regla configurable de fabricación, no una certificación estructural.

**Ver caras y refuerzos** muestra los componentes; el control de separación
permite examinarlos. El despiece incluye esos componentes reales, no un tablero
macizo del espesor aparente. **Láminas por espesor** configura medidas y costos
de cada tablero. Costo cero significa sin cotizar y el total se marca como parcial.
El PDF y CSV identifican los espesores; el PDF incluye vidrio y configuración.

En el 3D, un toque selecciona y permite editar; dos toques abren o cierran una
puerta, cajón o espejo móvil. Puertas giran sobre su bisagra; el frente y la caja
del cajón se desplazan juntos; marco y vidrio deslizan horizontalmente juntos.
También hay botones **Abrir/Cerrar pieza** y **Cerrar todas las aperturas**.
Estas animaciones son de visualización: no alteran los cortes ni persisten como
medidas de montaje. No simulan colisiones, cargas, bisagras ni tolerancias de
herrajes. El espejo se representa con un tono de vidrio, sin reflexión óptica.

Pruebas: `node --test backend/fabricacion-mdf.test.js` y, tras compilar,
`node --test tests/fabrica-ui.test.mjs`. Incluyen doble toque táctil, geometría,
separación de espesores, guardado, reapertura y exportación.

### Piezas ingresadas manualmente e IA de medidas

La pestaña **Piezas 2D / 3D** funciona directamente con la tabla de piezas.
Muestra un plano acotado de la pieza, permite descargar su PDF a escala y
representa sus dimensiones y espesor en 3D. El catálogo muestra un ejemplar
por tipo; no se presenta como un mueble ensamblado. El plano de corte se obtiene
con **Calcular corte**, como en los diseños paramétricos.

Para un ensamblaje manual se indican plano de orientación y coordenadas X/Y/Z
en mm de cada unidad. Las ubicaciones se guardan en el proyecto y se incluyen
en las proyecciones del PDF de taller; las unidades sin ubicar se señalan como
pendientes. Cambiar medidas de un tipo de pieza quita sus ubicaciones para
revisarlas. No se deduce un ensamblaje único solamente de una lista de rectángulos.

**Asistente de medidas · OpenAI** permite explicar conversiones, espesores y
descuentos, o proponer una nueva tabla o ubicaciones para las piezas existentes.
Usa la conexión de servidor `OPENAI_API_KEY` y `OPENAI_MODEL`, con Responses y
Structured Outputs. Requiere permiso de ver Cortes y Planos y comparte los
límites de concurrencia y frecuencia de los asistentes existentes. La clave
nunca se envía al navegador. Una llamada real requiere conectividad y cuota
disponible en la cuenta de API.

Se envían solo la consulta, hasta 80 tipos de pieza (nombre, código, medidas,
cantidad, espesor y veta), el espesor base y las ubicaciones manuales. No se
envían precios, clientes, inventario completo ni imágenes. Se usa `store: false`.
Esto no equivale a una garantía de retención cero del proveedor. El asistente
no escribe en la base ni ejecuta instrucciones de la respuesta.

Las propuestas muestran pasos, supuestos, advertencias y datos pendientes.
Solo se puede aplicar una tabla con medidas, espesor, cantidades y veta completos;
las ubicaciones deben referirse a unidades existentes. El usuario marca que
revisó la propuesta y confirma si reemplaza la tabla. Una consulta queda
desactualizada al modificar sus medidas. Aplicar prepara el formulario; se
calcula y guarda por separado. Los resultados de IA pueden tener errores de
cálculo o interpretación y no certifican resistencia, colisiones ni mecanizados.

Pruebas sin consumir API: `node --test backend/ia-planos.test.js` y, después de
compilar, `node --test tests/piezas-ia-ui.test.mjs`. La prueba de navegador simula
las respuestas de IA, pero prueba guardado y cálculo contra una base aislada.

### Modelo 3D

En **Generar por medidas > Vista 3D** puedes explorar el mueble mientras editas
sus medidas. Después de generar el despiece, **Mueble 3D** muestra el mismo
ensamblaje en el proyecto. También está disponible al reabrir una versión
guardada que conserve el diseño paramétrico. Los despieces manuales no contienen
posiciones de montaje: deben generarse por medidas para obtener un modelo.

El visor permite girar, ampliar, desplazar, elegir vistas de cámara, ocultar
frentes o trasera, seleccionar y aislar una pieza y separar el ensamblaje.
Los paneles terminados y sus componentes representan **un mueble**,
independientemente de las unidades del lote de corte. Seleccionar una pieza en
el modelo también la identifica en la tabla y, si está calculado, en su lámina.
Blanco, roble, nogal y grafito son acabados de referencia del visor: no cambian
el material, las medidas o el costo del proyecto y no se guardan como especificación.
La vista actual se puede descargar como PNG.

Controles: arrastrar para girar, rueda para ampliar, Mayús + arrastrar o botón
derecho para desplazar. En pantallas táctiles, usar un dedo para girar y dos
para desplazar/ampliar. Con el lienzo enfocado, las flechas giran, `+`/`-` amplían
y `0` restablece la cámara. El modelo es una referencia de ensamblaje sin
mecanizados ni validación exhaustiva de colisiones. En construcción v2 los rieles
son esquemáticos y las medidas se ajustan a las holguras indicadas.

El visor usa WebGL del navegador y se carga al abrir el 3D. No requiere recursos
gráficos externos ni nuevas dependencias. Si el navegador no dispone de WebGL,
se muestra un aviso dentro del visor y siguen disponibles los planos 2D. Las
pruebas de geometría están en `backend/modelo-mueble.test.js` y las de interacción
en `tests/mueble3d-ui.test.mjs` (Playwright; usa renderizado por software en la prueba).

El PDF vectorial de taller admite A4 y A3 horizontales, lista consolidada de
piezas, vistas del mueble cuando se generó por medidas, una página por lámina,
cotas en mm y cajetín con fecha y versión. La escala de cada lámina se indica
en la página; imprimir al 100% para conservarla. Un proyecto sin guardar se
identifica como borrador. Los planos nuevos con piezas sin cabida no se guardan
ni exportan para taller.

La actualización añade columnas a `planos_corte` y el espesor opcional de
`producto_piezas` sin borrar los datos existentes.
Pruebas del motor y de versiones: `node --test backend/corte.test.js backend/cortes-api.test.js`.
Después de compilar, las pruebas con Playwright se ejecutan con
`node --test tests/cortes-ui.test.mjs`; aceptan las mismas variables de navegador
y capturas descritas abajo y usan una base temporal aislada.

## Pruebas

```bash
node --test backend/*.test.js
npm run build
```

Las pruebas usan bases en memoria o archivos temporales e incluyen revocación de
sesiones, reintentos de nómina, ventas, inventario, auditoría y restauración desde
un respaldo descargado. Usa la versión de Node compatible con `better-sqlite3`;
en este entorno la dependencia instalada corresponde a Node 22.

Con Playwright y su navegador instalados, después de compilar se pueden comprobar
ambos historiales y el pago de nómina en el navegador:
`node --test tests/historial-ui.test.mjs`. La prueba crea una base temporal y la
elimina al terminar. Opcionalmente, `PLAYWRIGHT_MODULE` indica la ruta del paquete,
`BROWSER_EXECUTABLE` la del navegador y `UI_SCREENSHOT_DIR` dónde guardar capturas.

La moneda está en pesos colombianos (COP); se cambia en `src/utils/format.js`.
