// Banca virtual del cliente
const $ = (id) => document.getElementById(id);
let cuentas = [];

function cuentaSeleccionada() {
  return cuentas.find((c) => String(c.id) === $('selCuenta').value) || cuentas[0];
}

function pintarResumen() {
  const c = cuentaSeleccionada();
  if (!c) return;
  $('saldoValor').textContent = dinero(c.saldo);
  $('cuentaNumero').textContent = c.numero_cuenta;
  $('cuentaTipo').textContent = c.tipo === 'AHORROS' ? 'Ahorros' : 'Corriente';
  $('cuentaEstado').innerHTML = badgeEstado(c.estado);
}

async function cargarMovimientos() {
  const c = cuentaSeleccionada();
  if (!c) return;
  const r = await api(`/api/cliente/movimientos?cuenta_id=${c.id}`);
  $('tbMovimientos').innerHTML = r.ok
    ? filasMovimientos(r.movimientos)
    : `<tr><td colspan="5" class="text-danger text-center">${esc(r.mensaje)}</td></tr>`;
}

async function cargarDatos() {
  const r = await api('/api/cliente/perfil');
  if (!r.ok) return mostrarAlerta($('alertaGlobal'), r.mensaje, 'danger');

  cuentas = r.cuentas;
  const seleccionPrevia = $('selCuenta').value;
  const opciones = cuentas.map((c) =>
    `<option value="${c.id}">${esc(c.numero_cuenta)} - ${c.tipo === 'AHORROS' ? 'Ahorros' : 'Corriente'}</option>`).join('');
  $('selCuenta').innerHTML = opciones;
  $('trOrigen').innerHTML = opciones;
  if (seleccionPrevia) $('selCuenta').value = seleccionPrevia;
  $('bloqueSelectorCuenta').classList.toggle('d-none', cuentas.length < 2);

  const u = r.usuario;
  $('pfDocumento').value = u.documento;
  $('pfNombres').value = u.nombres;
  $('pfApellidos').value = u.apellidos;
  $('pfEmail').value = u.email;
  $('pfTelefono').value = u.telefono || '';
  $('pfDireccion').value = u.direccion || '';

  pintarResumen();
  await cargarMovimientos();
}

$('selCuenta').addEventListener('change', () => { pintarResumen(); cargarMovimientos(); });

// ---------- Transferencia ----------
$('formTransferir').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alerta = $('alertaTransferir');
  ocultarAlerta(alerta);

  const destino = $('trDestino').value.trim();
  const monto = Number($('trMonto').value);
  if (!/^\d{6,20}$/.test(destino)) return mostrarAlerta(alerta, 'Ingresa un número de cuenta destino válido', 'danger');
  if (!(monto > 0)) return mostrarAlerta(alerta, 'El valor debe ser mayor que cero', 'danger');
  if (!confirm(`¿Transferir ${dinero(monto)} a la cuenta ${destino}?`)) return;

  await conBoton(e.submitter, async () => {
    const r = await api('/api/cliente/transferencias', 'POST', {
      cuenta_origen_id: $('trOrigen').value,
      numero_destino: destino,
      monto,
      descripcion: $('trDescripcion').value
    });
    if (r.ok) {
      mostrarAlerta(alerta, `${r.mensaje}. Nuevo saldo: ${dinero(r.nuevoSaldo)}`, 'success');
      $('formTransferir').reset();
      await cargarDatos();
    } else {
      mostrarAlerta(alerta, r.mensaje, 'danger');
    }
  });
});

// ---------- Perfil ----------
$('formPerfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alerta = $('alertaPerfil');
  ocultarAlerta(alerta);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('pfEmail').value.trim())) {
    return mostrarAlerta(alerta, 'El correo no tiene un formato válido', 'danger');
  }
  await conBoton(e.submitter, async () => {
    const r = await api('/api/cliente/perfil', 'PUT', {
      email: $('pfEmail').value,
      telefono: $('pfTelefono').value,
      direccion: $('pfDireccion').value
    });
    mostrarAlerta(alerta, r.mensaje, r.ok ? 'success' : 'danger');
  });
});

// ---------- Contraseña ----------
$('formPassword').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alerta = $('alertaPassword');
  ocultarAlerta(alerta);
  const nueva = $('pwNueva').value;
  if (nueva.length < 8 || !/[A-Za-z]/.test(nueva) || !/[0-9]/.test(nueva)) {
    return mostrarAlerta(alerta, 'La nueva contraseña debe tener mínimo 8 caracteres, con letras y números', 'danger');
  }
  if (nueva !== $('pwConfirmacion').value) {
    return mostrarAlerta(alerta, 'La confirmación no coincide con la nueva contraseña', 'danger');
  }
  await conBoton(e.submitter, async () => {
    const r = await api('/api/cliente/password', 'PUT', {
      actual: $('pwActual').value, nueva, confirmacion: $('pwConfirmacion').value
    });
    mostrarAlerta(alerta, r.mensaje, r.ok ? 'success' : 'danger');
    if (r.ok) $('formPassword').reset();
  });
});

cargarDatos();
