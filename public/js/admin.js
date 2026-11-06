// Panel administrativo
const $ = (id) => document.getElementById(id);
const modal = (id) => bootstrap.Modal.getOrCreateInstance($(id));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Dashboard ----------
async function cargarDashboard() {
  const r = await api('/api/admin/dashboard');
  if (!r.ok) return mostrarAlerta($('alertaGlobal'), r.mensaje, 'danger');
  $('dbTotal').textContent = r.clientes.total;
  $('dbActivos').textContent = r.clientes.activos;
  $('dbBloqueados').textContent = r.clientes.bloqueados;
  $('dbCuentas').textContent = `${r.cuentas.activas} / ${r.cuentas.total}`;
  $('dbSaldo').textContent = dinero(r.saldoTotal);
}
$('btnActualizarDash').addEventListener('click', cargarDashboard);

// ---------- Clientes ----------
async function cargarClientes() {
  const r = await api(`/api/admin/clientes?q=${encodeURIComponent($('qClientes').value.trim())}`);
  if (!r.ok) return mostrarAlerta($('alertaGlobal'), r.mensaje, 'danger');
  $('tbClientes').innerHTML = r.clientes.length ? r.clientes.map((c) => `
    <tr>
      <td>${esc(c.documento)}</td>
      <td>${esc(c.nombres)} ${esc(c.apellidos)}</td>
      <td>${esc(c.email)}</td>
      <td>${badgeEstado(c.estado)}</td>
      <td class="text-end text-nowrap">${dinero(c.saldo_total)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-primary" data-accion="ver" data-id="${c.id}">Ver</button>
        <button class="btn btn-sm btn-outline-secondary" data-accion="editar" data-id="${c.id}">Editar</button>
        ${c.estado === 'ACTIVO'
          ? `<button class="btn btn-sm btn-outline-danger" data-accion="estado" data-estado="BLOQUEADO" data-id="${c.id}">Bloquear</button>`
          : `<button class="btn btn-sm btn-outline-success" data-accion="estado" data-estado="ACTIVO" data-id="${c.id}">Habilitar</button>`}
      </td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="text-center text-muted py-4">No se encontraron clientes</td></tr>';
}

async function cambiarEstado(id, estado) {
  const verbo = { ACTIVO: 'habilitar', BLOQUEADO: 'bloquear', INACTIVO: 'inactivar' }[estado];
  if (!confirm(`¿Seguro que deseas ${verbo} a este cliente y sus cuentas?`)) return false;
  const r = await api(`/api/admin/clientes/${id}/estado`, 'PATCH', { estado });
  mostrarAlerta($('alertaGlobal'), r.mensaje, r.ok ? 'success' : 'danger');
  if (r.ok) { await Promise.all([cargarClientes(), cargarCuentas(), cargarDashboard()]); }
  return r.ok;
}

async function verDetalle(id) {
  const r = await api(`/api/admin/clientes/${id}`);
  if (!r.ok) return mostrarAlerta($('alertaGlobal'), r.mensaje, 'danger');
  const c = r.cliente;
  $('detBody').innerHTML = `
    <div class="row g-2 mb-3">
      <div class="col-sm-6"><strong>Nombre:</strong> ${esc(c.nombres)} ${esc(c.apellidos)}</div>
      <div class="col-sm-6"><strong>Documento:</strong> ${esc(c.documento)}</div>
      <div class="col-sm-6"><strong>Correo:</strong> ${esc(c.email)}</div>
      <div class="col-sm-6"><strong>Teléfono:</strong> ${esc(c.telefono || '—')}</div>
      <div class="col-sm-6"><strong>Dirección:</strong> ${esc(c.direccion || '—')}</div>
      <div class="col-sm-6"><strong>Estado:</strong> ${badgeEstado(c.estado)}</div>
      <div class="col-sm-6"><strong>Cliente desde:</strong> ${fechaHora(c.creado_en)}</div>
    </div>
    <h3 class="h6">Cuentas</h3>
    <div class="tabla-scroll"><table class="table table-sm">
      <thead><tr><th>Número</th><th>Tipo</th><th>Estado</th><th class="text-end">Saldo</th></tr></thead>
      <tbody>${r.cuentas.map((k) => `<tr><td>${esc(k.numero_cuenta)}</td><td>${esc(k.tipo)}</td><td>${badgeEstado(k.estado)}</td><td class="text-end">${dinero(k.saldo)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  const opciones = ['ACTIVO', 'INACTIVO', 'BLOQUEADO'].filter((e) => e !== c.estado);
  $('detPie').innerHTML = `
    ${opciones.map((e) => `<button class="btn btn-sm btn-outline-${e === 'ACTIVO' ? 'success' : e === 'BLOQUEADO' ? 'danger' : 'secondary'}" data-accion="estado-modal" data-estado="${e}" data-id="${c.id}">${{ ACTIVO: 'Habilitar', BLOQUEADO: 'Bloquear', INACTIVO: 'Inactivar' }[e]}</button>`).join('')}
    <button class="btn btn-sm btn-outline-primary ms-auto" data-accion="editar-modal" data-id="${c.id}">Editar datos</button>
    <button class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>`;
  modal('modalDetalle').show();
}

async function abrirEditar(id) {
  const r = await api(`/api/admin/clientes/${id}`);
  if (!r.ok) return mostrarAlerta($('alertaGlobal'), r.mensaje, 'danger');
  const c = r.cliente;
  ocultarAlerta($('alertaEditar'));
  $('edId').value = c.id;
  $('edDocumento').value = c.documento;
  $('edNombres').value = c.nombres;
  $('edApellidos').value = c.apellidos;
  $('edEmail').value = c.email;
  $('edTelefono').value = c.telefono || '';
  $('edDireccion').value = c.direccion || '';
  modal('modalEditar').show();
}

$('tbClientes').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.accion === 'ver') verDetalle(id);
  if (b.dataset.accion === 'editar') abrirEditar(id);
  if (b.dataset.accion === 'estado') cambiarEstado(id, b.dataset.estado);
});

$('detPie').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion]');
  if (!b) return;
  if (b.dataset.accion === 'editar-modal') { modal('modalDetalle').hide(); abrirEditar(b.dataset.id); }
  if (b.dataset.accion === 'estado-modal') {
    if (await cambiarEstado(b.dataset.id, b.dataset.estado)) { modal('modalDetalle').hide(); }
  }
});

$('btnBuscarClientes').addEventListener('click', cargarClientes);
$('qClientes').addEventListener('keydown', (e) => { if (e.key === 'Enter') cargarClientes(); });
$('btnNuevoCliente').addEventListener('click', () => {
  $('formNuevo').reset();
  $('nuSaldo').value = 0;
  ocultarAlerta($('alertaNuevo'));
  modal('modalNuevo').show();
});

$('formNuevo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alerta = $('alertaNuevo');
  ocultarAlerta(alerta);
  const datos = {
    documento: $('nuDocumento').value.trim(), nombres: $('nuNombres').value.trim(),
    apellidos: $('nuApellidos').value.trim(), email: $('nuEmail').value.trim(),
    telefono: $('nuTelefono').value.trim(), direccion: $('nuDireccion').value.trim(),
    password: $('nuPassword').value, pin: $('nuPin').value,
    tipo_cuenta: $('nuTipo').value, saldo_inicial: $('nuSaldo').value
  };
  if (!/^\d{5,20}$/.test(datos.documento)) return mostrarAlerta(alerta, 'El documento debe tener entre 5 y 20 dígitos', 'danger');
  if (!datos.nombres || !datos.apellidos) return mostrarAlerta(alerta, 'Nombres y apellidos son obligatorios', 'danger');
  if (!EMAIL.test(datos.email)) return mostrarAlerta(alerta, 'El correo no tiene un formato válido', 'danger');
  if (datos.password.length < 8 || !/[A-Za-z]/.test(datos.password) || !/[0-9]/.test(datos.password)) {
    return mostrarAlerta(alerta, 'La contraseña debe tener mínimo 8 caracteres, con letras y números', 'danger');
  }
  if (!/^\d{4}$/.test(datos.pin)) return mostrarAlerta(alerta, 'El PIN debe tener exactamente 4 dígitos', 'danger');

  await conBoton(e.submitter, async () => {
    const r = await api('/api/admin/clientes', 'POST', datos);
    if (r.ok) {
      modal('modalNuevo').hide();
      mostrarAlerta($('alertaGlobal'), `Cliente creado. Número de cuenta asignado: ${r.numeroCuenta}`, 'success');
      await Promise.all([cargarClientes(), cargarCuentas(), cargarDashboard()]);
    } else {
      mostrarAlerta(alerta, r.mensaje, 'danger');
    }
  });
});

$('formEditar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alerta = $('alertaEditar');
  ocultarAlerta(alerta);
  if (!EMAIL.test($('edEmail').value.trim())) return mostrarAlerta(alerta, 'El correo no tiene un formato válido', 'danger');
  await conBoton(e.submitter, async () => {
    const r = await api(`/api/admin/clientes/${$('edId').value}`, 'PUT', {
      nombres: $('edNombres').value, apellidos: $('edApellidos').value, email: $('edEmail').value,
      telefono: $('edTelefono').value, direccion: $('edDireccion').value
    });
    if (r.ok) {
      modal('modalEditar').hide();
      mostrarAlerta($('alertaGlobal'), r.mensaje, 'success');
      await Promise.all([cargarClientes(), cargarCuentas()]);
    } else {
      mostrarAlerta(alerta, r.mensaje, 'danger');
    }
  });
});

// ---------- Cuentas ----------
async function cargarCuentas() {
  const r = await api(`/api/admin/cuentas?q=${encodeURIComponent($('qCuentas').value.trim())}`);
  if (!r.ok) return mostrarAlerta($('alertaGlobal'), r.mensaje, 'danger');
  $('tbCuentas').innerHTML = r.cuentas.length ? r.cuentas.map((c) => `
    <tr>
      <td>${esc(c.numero_cuenta)}</td>
      <td>${c.tipo === 'AHORROS' ? 'Ahorros' : 'Corriente'}</td>
      <td>${esc(c.nombres)} ${esc(c.apellidos)}</td>
      <td>${esc(c.documento)}</td>
      <td>${badgeEstado(c.estado)}</td>
      <td class="text-end text-nowrap">${dinero(c.saldo)}</td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="text-center text-muted py-4">No se encontraron cuentas</td></tr>';
  if (!$('qCuentas').value.trim()) {
    $('listaCuentas').innerHTML = r.cuentas.map((c) =>
      `<option value="${esc(c.numero_cuenta)}">${esc(c.nombres)} ${esc(c.apellidos)}</option>`).join('');
  }
}
$('btnBuscarCuentas').addEventListener('click', cargarCuentas);
$('qCuentas').addEventListener('keydown', (e) => { if (e.key === 'Enter') cargarCuentas(); });

// ---------- Consignación ----------
$('formConsignar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alerta = $('alertaConsignar');
  ocultarAlerta(alerta);
  const numero = $('coNumero').value.trim();
  const valor = Number($('coValor').value);
  if (!/^\d{6,20}$/.test(numero)) return mostrarAlerta(alerta, 'Ingresa un número de cuenta válido', 'danger');
  if (!(valor > 0)) return mostrarAlerta(alerta, 'El valor debe ser mayor que cero', 'danger');
  if (!confirm(`¿Consignar ${dinero(valor)} a la cuenta ${numero}?`)) return;

  await conBoton(e.submitter, async () => {
    const r = await api('/api/admin/consignaciones', 'POST', {
      numero_cuenta: numero, valor, descripcion: $('coDescripcion').value
    });
    if (r.ok) {
      mostrarAlerta(alerta, `${r.mensaje}. Nuevo saldo de la cuenta ${r.numeroCuenta}: ${dinero(r.nuevoSaldo)}`, 'success');
      $('formConsignar').reset();
      await Promise.all([cargarCuentas(), cargarClientes(), cargarDashboard(), cargarMovimientos()]);
    } else {
      mostrarAlerta(alerta, r.mensaje, 'danger');
    }
  });
});

// ---------- Movimientos ----------
async function cargarMovimientos() {
  const q = encodeURIComponent($('qMov').value.trim());
  const r = await api(`/api/admin/movimientos?q=${q}&tipo=${encodeURIComponent($('selTipoMov').value)}`);
  $('tbMov').innerHTML = r.ok
    ? filasMovimientos(r.movimientos, true)
    : `<tr><td colspan="7" class="text-danger text-center">${esc(r.mensaje)}</td></tr>`;
}
$('btnBuscarMov').addEventListener('click', cargarMovimientos);
$('qMov').addEventListener('keydown', (e) => { if (e.key === 'Enter') cargarMovimientos(); });
$('selTipoMov').addEventListener('change', cargarMovimientos);

// Al cambiar de pestaña se refrescan los datos (así se ve lo hecho desde el cajero o el cliente)
document.querySelectorAll('button[data-bs-toggle="tab"]').forEach((b) => {
  b.addEventListener('shown.bs.tab', () => {
    const destino = b.dataset.bsTarget;
    if (destino === '#tabDashboard') cargarDashboard();
    if (destino === '#tabClientes') cargarClientes();
    if (destino === '#tabCuentas' || destino === '#tabConsignar') cargarCuentas();
    if (destino === '#tabMovimientos') cargarMovimientos();
  });
});

cargarDashboard();
cargarClientes();
cargarCuentas();
cargarMovimientos();
