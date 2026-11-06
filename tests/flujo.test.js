// Prueba de integración: recorre el flujo de la sección 17 del enunciado y las reglas de negocio.
// Uso:  1) mysql -u root -p < database.sql   (deja los datos de prueba originales)
//       2) npm start                          (en otra terminal)
//       3) npm test
const BASE = process.env.BASE_URL || 'http://localhost:3000';

class Cliente {
  constructor() { this.cookie = ''; }
  async llamar(metodo, ruta, cuerpo) {
    const res = await fetch(BASE + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(this.cookie && { Cookie: this.cookie }) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    return { status: res.status, ...(await res.json()) };
  }
  get(r) { return this.llamar('GET', r); }
  post(r, c) { return this.llamar('POST', r, c); }
  put(r, c) { return this.llamar('PUT', r, c); }
  patch(r, c) { return this.llamar('PATCH', r, c); }
}

let ok = 0, fallos = 0;
function verificar(descripcion, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✔ ${descripcion}`); }
  else { fallos++; console.log(`  ✘ ${descripcion} ${detalle}`); }
}

(async () => {
  const ana = new Cliente(), carlos = new Cliente(), laura = new Cliente(), admin = new Cliente();

  console.log('\n== Flujo principal (sección 17) ==');
  let r = await ana.post('/api/auth/login', { email: 'ana@correo.com', password: 'Cliente123*' });
  verificar('Ana inicia sesión y va a la banca virtual', r.ok && r.destino === '/html/cliente.html');
  r = await ana.get('/api/cliente/perfil');
  const saldoInicial = r.cuentas[0].saldo;
  verificar('1. Ana consulta su saldo ($1.000.000)', saldoInicial === 1000000, `(saldo=${saldoInicial})`);

  r = await ana.post('/api/cajero/login', { numero_cuenta: '1001000001', pin: '1234' });
  verificar('2. Ana ingresa al cajero con cuenta y PIN', r.ok);
  r = await ana.post('/api/cajero/retiro', { valor: 200000 });
  verificar('3-4. Retiro de $200.000: el saldo baja a $800.000', r.ok && r.nuevoSaldo === 800000, JSON.stringify(r));

  r = await ana.get('/api/cliente/perfil');
  verificar('5. En la banca virtual el saldo es $800.000', r.cuentas[0].saldo === 800000);
  r = await ana.get('/api/cliente/movimientos');
  verificar('6. El retiro aparece en sus movimientos (-200.000, "Retiro cajero")',
    r.movimientos[0].tipo === 'RETIRO_CAJERO' && r.movimientos[0].valor === -200000 &&
    r.movimientos[0].saldo_resultante === 800000);

  r = await admin.post('/api/auth/login', { email: 'admin@banco.com', password: 'Admin123*' });
  verificar('Admin inicia sesión', r.ok && r.destino === '/html/admin.html');
  r = await admin.get('/api/admin/cuentas?q=1001000001');
  verificar('7. El administrador ve el mismo saldo ($800.000)', r.cuentas[0].saldo === 800000);

  r = await admin.post('/api/admin/consignaciones', { numero_cuenta: '1001000001', valor: 500000 });
  verificar('8. Administrador consigna $500.000', r.ok && r.nuevoSaldo === 1300000);
  r = await ana.get('/api/cliente/perfil');
  verificar('9. Ana vuelve a ingresar y ve $1.300.000', r.cuentas[0].saldo === 1300000);

  console.log('\n== Dashboard y listados del administrador ==');
  r = await admin.get('/api/admin/dashboard');
  verificar('Dashboard: 3 clientes, 3 activos, 0 bloqueados', r.clientes.total === 3 && r.clientes.activos === 3 && r.clientes.bloqueados === 0);
  verificar('Dashboard: suma de saldos = 4.600.000', r.saldoTotal === 4600000, `(${r.saldoTotal})`);
  r = await admin.get('/api/admin/clientes?q=carlos');
  verificar('Búsqueda de clientes por nombre', r.clientes.length === 1 && r.clientes[0].nombres === 'Carlos');
  r = await admin.get('/api/admin/movimientos');
  verificar('Historial general de movimientos', r.movimientos.length >= 8);

  console.log('\n== Reglas de negocio: valores y saldo ==');
  r = await ana.post('/api/cajero/retiro', { valor: 0 });
  verificar('Retiro de 0 rechazado', r.status === 400);
  r = await ana.post('/api/cajero/retiro', { valor: -5 });
  verificar('Retiro negativo rechazado', r.status === 400);
  r = await ana.post('/api/cajero/retiro', { valor: 'abc' });
  verificar('Retiro no numérico rechazado', r.status === 400);
  r = await ana.post('/api/cajero/retiro', { valor: 99999999 });
  verificar('Retiro mayor al saldo rechazado', r.status === 400 && /insuficiente/i.test(r.mensaje));
  r = await ana.post('/api/cliente/transferencias', { cuenta_origen_id: 1, numero_destino: '1001000002', monto: 99999999 });
  verificar('Transferencia mayor al saldo rechazada', r.status === 400);
  r = await ana.post('/api/cliente/transferencias', { cuenta_origen_id: 1, numero_destino: '1001000002', monto: 0 });
  verificar('Transferencia de 0 rechazada', r.status === 400);
  r = await ana.post('/api/cliente/transferencias', { cuenta_origen_id: 1, numero_destino: '1001000001', monto: 1000 });
  verificar('Transferencia a la misma cuenta rechazada', r.status === 400);
  r = await ana.post('/api/cliente/transferencias', { cuenta_origen_id: 1, numero_destino: '9999999999', monto: 1000 });
  verificar('Transferencia a cuenta inexistente rechazada', r.status === 404);
  r = await admin.post('/api/admin/consignaciones', { numero_cuenta: '1001000001', valor: -10 });
  verificar('Consignación negativa rechazada', r.status === 400);

  console.log('\n== Transferencia (4 pasos) ==');
  r = await ana.post('/api/cliente/transferencias', { cuenta_origen_id: 1, numero_destino: '1001000002', monto: 100000, descripcion: 'Prueba' });
  verificar('Ana transfiere $100.000 a Carlos', r.ok && r.nuevoSaldo === 1200000);
  await carlos.post('/api/auth/login', { email: 'carlos@correo.com', password: 'Cliente123*' });
  r = await carlos.get('/api/cliente/perfil');
  verificar('Destino incrementado (2.300.000)', r.cuentas[0].saldo === 2300000);
  r = await carlos.get('/api/cliente/movimientos');
  verificar('Movimiento en la cuenta destino', r.movimientos[0].tipo === 'TRANSFERENCIA_RECIBIDA' && r.movimientos[0].valor === 100000);
  r = await ana.get('/api/cliente/movimientos');
  verificar('Movimiento en la cuenta origen', r.movimientos[0].tipo === 'TRANSFERENCIA_ENVIADA' && r.movimientos[0].valor === -100000);

  console.log('\n== Seguridad y aislamiento ==');
  r = await ana.get('/api/admin/dashboard');
  verificar('Un cliente no puede usar el panel administrativo (403)', r.status === 403);
  r = await ana.get('/api/cliente/movimientos?cuenta_id=2');
  verificar('Un cliente no puede ver movimientos de otra cuenta', r.status === 404);
  r = await ana.post('/api/cliente/transferencias', { cuenta_origen_id: 2, numero_destino: '1001000003', monto: 1000 });
  verificar('Un cliente no puede transferir desde la cuenta de otro', r.status === 404);
  const anonimo = new Cliente();
  r = await anonimo.get('/api/cliente/perfil');
  verificar('Sin sesión se rechaza el acceso (401)', r.status === 401);
  r = await ana.put('/api/cliente/perfil', { email: 'ana@correo.com', telefono: '3101112233', direccion: 'Nueva dirección 123', saldo: 999999999, rol: 'ADMIN', estado: 'ACTIVO' });
  r = await ana.get('/api/cliente/perfil');
  verificar('Editar perfil: cambia la dirección pero NO el saldo ni el rol',
    r.usuario.direccion === 'Nueva dirección 123' && r.cuentas[0].saldo === 1200000);
  r = await ana.get('/api/admin/dashboard');
  verificar('Intentar escalar a ADMIN por el perfil no funciona', r.status === 403);

  console.log('\n== Contraseña ==');
  r = await ana.put('/api/cliente/password', { actual: 'incorrecta1', nueva: 'NuevaClave1', confirmacion: 'NuevaClave1' });
  verificar('Contraseña actual incorrecta rechazada', r.status === 400);
  r = await ana.put('/api/cliente/password', { actual: 'Cliente123*', nueva: 'corta', confirmacion: 'corta' });
  verificar('Contraseña débil rechazada', r.status === 400);
  r = await ana.put('/api/cliente/password', { actual: 'Cliente123*', nueva: 'NuevaClave1', confirmacion: 'NuevaClave1' });
  verificar('Cambio de contraseña correcto', r.ok);
  r = await new Cliente().post('/api/auth/login', { email: 'ana@correo.com', password: 'NuevaClave1' });
  verificar('Login con la nueva contraseña', r.ok);
  await ana.put('/api/cliente/password', { actual: 'NuevaClave1', nueva: 'Cliente123*', confirmacion: 'Cliente123*' });

  console.log('\n== Bloqueo de cuentas ==');
  await laura.post('/api/auth/login', { email: 'laura@correo.com', password: 'Cliente123*' });
  r = await admin.patch('/api/admin/clientes/4/estado', { estado: 'BLOQUEADO' });
  verificar('Admin bloquea a Laura', r.ok);
  r = await laura.get('/api/cliente/perfil');
  verificar('Laura, con sesión abierta, pierde el acceso al instante', r.status === 403);
  r = await new Cliente().post('/api/auth/login', { email: 'laura@correo.com', password: 'Cliente123*' });
  verificar('Laura bloqueada no puede iniciar sesión', r.status === 403);
  r = await new Cliente().post('/api/cajero/login', { numero_cuenta: '1001000003', pin: '3456' });
  verificar('Cuenta bloqueada no puede usar el cajero', r.status === 403);
  r = await ana.post('/api/cliente/transferencias', { cuenta_origen_id: 1, numero_destino: '1001000003', monto: 1000 });
  verificar('No se puede transferir a una cuenta bloqueada', r.status === 403);
  r = await admin.post('/api/admin/consignaciones', { numero_cuenta: '1001000003', valor: 1000 });
  verificar('No se puede consignar a una cuenta bloqueada', r.status === 403);
  r = await admin.get('/api/admin/dashboard');
  verificar('Dashboard cuenta 1 cliente bloqueado', r.clientes.bloqueados === 1 && r.clientes.activos === 2);
  r = await admin.patch('/api/admin/clientes/4/estado', { estado: 'ACTIVO' });
  verificar('Admin habilita de nuevo a Laura', r.ok);
  r = await new Cliente().post('/api/cajero/login', { numero_cuenta: '1001000003', pin: '3456' });
  verificar('Laura vuelve a operar en el cajero', r.ok);

  console.log('\n== PIN del cajero ==');
  const c2 = new Cliente();
  r = await c2.post('/api/cajero/login', { numero_cuenta: '1001000002', pin: '0000' });
  verificar('PIN incorrecto rechazado (quedan 2 intentos)', r.status === 401 && /2/.test(r.mensaje));
  await c2.post('/api/cajero/login', { numero_cuenta: '1001000002', pin: '0000' });
  r = await c2.post('/api/cajero/login', { numero_cuenta: '1001000002', pin: '0000' });
  verificar('Tras 3 intentos fallidos la cuenta se bloquea', r.status === 403);
  r = await c2.post('/api/cajero/login', { numero_cuenta: '1001000002', pin: '2345' });
  verificar('Con la cuenta bloqueada ni el PIN correcto sirve', r.status === 403);
  await admin.patch('/api/admin/clientes/3/estado', { estado: 'ACTIVO' });
  r = await c2.post('/api/cajero/login', { numero_cuenta: '1001000002', pin: '2345' });
  verificar('El admin la habilita y el PIN correcto funciona', r.ok);
  r = await c2.get('/api/cajero/movimientos');
  verificar('Cajero: últimos movimientos', r.ok && r.movimientos.length >= 3);
  r = await c2.post('/api/cajero/logout');
  r = await c2.get('/api/cajero/saldo');
  verificar('Cajero: al cerrar la operación se pierde el acceso', r.status === 401);

  console.log('\n== Crear cliente (admin) ==');
  r = await admin.post('/api/admin/clientes', {
    documento: '1000000099', nombres: 'Pedro', apellidos: 'Pérez', email: 'pedro@correo.com', telefono: '3001234567',
    direccion: 'Calle 1', password: 'Pedro1234', pin: '4321', tipo_cuenta: 'AHORROS', saldo_inicial: 50000
  });
  verificar('Admin crea cliente con cuenta y saldo inicial', r.ok && /^\d{10}$/.test(r.numeroCuenta), JSON.stringify(r));
  const nueva = r.numeroCuenta;
  r = await admin.post('/api/admin/clientes', { documento: '1000000099', nombres: 'X', apellidos: 'Y', email: 'x@correo.com', password: 'Clave12345', pin: '1111' });
  verificar('Documento duplicado rechazado', r.status === 409);
  r = await admin.post('/api/admin/clientes', { documento: '1000000098', nombres: 'X', apellidos: 'Y', email: 'x@correo.com', password: 'corta', pin: '1111' });
  verificar('Contraseña débil al crear cliente rechazada', r.status === 400);
  const pedro = new Cliente();
  r = await pedro.post('/api/auth/login', { email: 'pedro@correo.com', password: 'Pedro1234' });
  verificar('El cliente nuevo puede iniciar sesión', r.ok);
  r = await pedro.get('/api/cliente/perfil');
  verificar('Cuenta nueva con saldo inicial 50.000', r.cuentas[0].saldo === 50000 && r.cuentas[0].numero_cuenta === nueva);
  r = await admin.get('/api/admin/clientes');
  const idPedro = r.clientes.find((c) => c.email === 'pedro@correo.com').id;
  r = await admin.put(`/api/admin/clientes/${idPedro}`, { nombres: 'Pedro Pablo', apellidos: 'Pérez', email: 'pedro@correo.com', telefono: '3001234567', direccion: 'Calle 2' });
  verificar('Admin edita datos de un cliente', r.ok);
  r = await admin.get(`/api/admin/clientes/${idPedro}`);
  verificar('Detalle del cliente con sus cuentas', r.cliente.nombres === 'Pedro Pablo' && r.cuentas.length === 1);

  console.log('\n== Concurrencia (saldo no puede quedar negativo) ==');
  await admin.post('/api/admin/consignaciones', { numero_cuenta: nueva, valor: 50000 }); // saldo 100.000
  await pedro.post('/api/cajero/login', { numero_cuenta: nueva, pin: '4321' });
  const rs = await Promise.all(Array.from({ length: 5 }, () => pedro.post('/api/cajero/retiro', { valor: 30000 })));
  const exitosos = rs.filter((x) => x.ok).length;
  r = await pedro.get('/api/cliente/perfil');
  verificar(`5 retiros simultáneos de 30.000 con saldo 100.000: solo ${exitosos} pasan (esperado 3)`, exitosos === 3 && r.cuentas[0].saldo === 10000, `(saldo=${r.cuentas[0].saldo})`);

  console.log(`\nResultado: ${ok} correctas, ${fallos} fallidas\n`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('Error en la prueba:', e); process.exit(1); });
