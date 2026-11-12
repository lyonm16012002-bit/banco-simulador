# Banco Simulador – Proyecto Integrador

## Descripción
Aplicación web que simula las funciones básicas de un sistema bancario. Está compuesta por **tres módulos que trabajan sobre la misma base de datos MySQL**, de modo que cualquier operación hecha en uno se refleja de inmediato en los demás:

| Módulo | Ruta | Para quién |
|---|---|---|
| Banca virtual | `/html/cliente.html` | Clientes |
| Panel administrativo | `/html/admin.html` | Administrador del banco |
| Cajero automático | `/html/cajero.html` | Clientes (con número de cuenta y PIN) |

Todos los usuarios ingresan por `/html/login.html`; el sistema los lleva a su módulo según el rol. El cajero tiene su propia pantalla de identificación.

## Integrantes
- _[Leonardo Montes]_
- _[------------------------]_
- _[-----------------------]_

## Tecnologías utilizadas
- **Backend:** Node.js + Express.js
- **Base de datos:** MySQL (librería `mysql2`)
- **Autenticación:** sesiones con `express-session`; contraseñas y PIN cifrados con `bcryptjs`
- **Frontend:** HTML, CSS, JavaScript y Bootstrap 5
- **Configuración:** variables de entorno con `dotenv`

## Requisitos para ejecutar el proyecto
- [Node.js](https://nodejs.org) 18 o superior
- MySQL **8.0.16 o superior** (necesario para las restricciones `CHECK`)
- Git

## Instrucciones de instalación
```bash
git clone <URL-del-repositorio>
cd banco-simulador
npm install
```

## Configuración de la base de datos
1. Crea la base de datos y carga las tablas y los datos de prueba (el script ya incluye todo):
   ```bash
   mysql -u root -p < database.sql
   ```
   > Si usas MySQL Workbench: abre `database.sql` y ejecútalo completo. Ejecutarlo de nuevo **reinicia** la base de datos a su estado inicial.
2. Copia el archivo de ejemplo de variables de entorno y complétalo con tus datos:
   ```bash
   cp .env.example .env
   ```
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=tu_password
   DB_NAME=banco_simulador
   SESSION_SECRET=un_texto_largo_y_secreto
   ```
   El archivo `.env` **no se sube a GitHub** (está en `.gitignore`).

## Forma de ejecutar el sistema
```bash
npm start          # producción
npm run dev        # recarga automática al guardar cambios
```
Abre <http://localhost:3000>. Para comprobar la conexión con la base de datos: <http://localhost:3000/api/salud>.

## Usuarios de prueba
| Rol | Correo | Contraseña | Cuenta | PIN cajero | Saldo inicial |
|---|---|---|---|---|---|
| Administrador | `admin@banco.com` | `Admin123*` | – | – | – |
| Cliente (Ana Gómez) | `ana@correo.com` | `Cliente123*` | `1001000001` (Ahorros) | `1234` | $1.000.000 |
| Cliente (Carlos Ruiz) | `carlos@correo.com` | `Cliente123*` | `1001000002` (Corriente) | `2345` | $2.200.000 |
| Cliente (Laura Mejía) | `laura@correo.com` | `Cliente123*` | `1001000003` (Ahorros) | `3456` | $1.100.000 |

## Principales funcionalidades
**Banca virtual (cliente)**
- Iniciar y cerrar sesión; cambiar contraseña.
- Consultar saldo, número y tipo de cuenta.
- Historial de movimientos (fecha, tipo, descripción, valor y saldo resultante).
- Transferencias a otras cuentas registradas.
- Consultar y editar datos de contacto (correo, teléfono, dirección). No puede modificar saldo, cuenta, rol, estado ni movimientos.

**Panel administrativo**
- Dashboard: total de clientes, activos, bloqueados, cuentas activas y suma total de saldos.
- Crear, listar, buscar, ver en detalle y editar clientes (la creación genera también su cuenta y su PIN).
- Habilitar, bloquear o inactivar clientes (no se borran de la base de datos).
- Consultar cuentas y saldos; realizar consignaciones; consultar el historial general con filtros.

**Cajero automático**
- Identificación con número de cuenta y PIN (3 intentos fallidos bloquean la cuenta).
- Consultar saldo, retirar dinero (valores rápidos o personalizado), ver los últimos 10 movimientos y cerrar la operación.
- Se cierra solo tras 2 minutos de inactividad.

## Reglas de negocio implementadas
- Un cliente solo accede a sus propias cuentas (el servidor toma la identidad de la sesión, nunca del formulario).
- Valores siempre mayores que cero; no se retira ni transfiere más de lo disponible.
- Una cuenta o usuario bloqueado no puede operar, **incluso si ya tenía la sesión abierta**.
- Cada consignación, retiro y transferencia genera sus movimientos; los movimientos nunca se eliminan ni se editan.
- El saldo solo se modifica desde el backend, dentro de **transacciones** con bloqueo de filas (`SELECT ... FOR UPDATE`), por lo que dos operaciones simultáneas no pueden dejar saldos negativos ni inconsistentes.
- Las validaciones se hacen en el navegador **y** en el servidor.

## Estructura del proyecto
```
banco-simulador/
├── server.js                 # Servidor Express y configuración de sesiones
├── database.sql              # Tablas, relaciones, restricciones y datos de prueba
├── config/db.js              # Pool de conexión a MySQL (variables de entorno)
├── middleware/auth.js        # Sesión, roles y sesión del cajero
├── services/operaciones.js   # Consignar, retirar y transferir (transacciones)
├── controllers/              # Lógica de auth, cliente, admin y cajero
├── routes/                   # Rutas de la API
├── public/                   # Frontend (html, css, js)
├── docs/diagrama-bd.*        # Diagrama de la base de datos (.png, .svg, .dot)
└── tests/flujo.test.js       # Prueba automática del flujo completo
```

## API (resumen)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` · `/logout` | Iniciar / cerrar sesión |
| GET · PUT | `/api/cliente/perfil` | Ver cuentas y datos / editar contacto |
| PUT | `/api/cliente/password` | Cambiar contraseña |
| GET | `/api/cliente/movimientos?cuenta_id=` | Historial de la cuenta |
| POST | `/api/cliente/transferencias` | Transferir |
| GET | `/api/admin/dashboard` | Indicadores del banco |
| GET · POST | `/api/admin/clientes` | Listar/buscar (`?q=`) · crear |
| GET · PUT | `/api/admin/clientes/:id` | Detalle · editar |
| PATCH | `/api/admin/clientes/:id/estado` | Habilitar / bloquear / inactivar |
| GET | `/api/admin/cuentas` · `/api/admin/movimientos` | Cuentas y movimientos generales |
| POST | `/api/admin/consignaciones` | Consignar a una cuenta |
| POST | `/api/cajero/login` · `/logout` | Identificarse / cerrar en el cajero |
| GET | `/api/cajero/saldo` · `/movimientos` | Consultas del cajero |
| POST | `/api/cajero/retiro` | Retiro |

## Prueba de funcionamiento
**Manual (flujo de la demostración):**
1. Ana inicia sesión en la banca virtual y ve su saldo ($1.000.000).
2. En `/html/cajero.html` ingresa con `1001000001` y PIN `1234`, y retira $200.000.
3. En la banca virtual el saldo es $800.000 y aparece el movimiento "Retiro cajero – $200.000".
4. El administrador consulta la cuenta y ve $800.000.
5. El administrador consigna $500.000 a esa cuenta.
6. Ana vuelve a ingresar y ve $1.300.000.

**Automática:** con el servidor encendido y la base recién cargada con `database.sql`:
```bash
npm test
```
Ejecuta el flujo anterior y más de 50 verificaciones de reglas de negocio, seguridad y concurrencia. Si quieres probar contra otro puerto: `BASE_URL=http://localhost:3100 npm test`.

> Nota: la prueba modifica saldos y crea un cliente; vuelve a ejecutar `database.sql` para dejar los datos como al inicio.
