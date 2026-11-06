// Cajero automático virtual
const $ = (id) => document.getElementById(id);
const SECCIONES = ['seccionLogin', 'seccionMenu', 'seccionSaldo', 'seccionRetiro', 'seccionMovs'];
const TIEMPO_INACTIVIDAD = 2 * 60 * 1000; // coincide con el límite del servidor
let temporizador = null;
let activo = false;

function mostrarSeccion(id) {
  SECCIONES.forEach((s) => $(s).classList.toggle('d-none', s !== id));
  ocultarAlerta($('mensajeCajero'));
}

function reiniciarTemporizador() {
  clearTimeout(temporizador);
  if (!activo) return;
  temporizador = setTimeout(() => cerrarOperacion('La sesión se cerró por inactividad.', 'warning'), TIEMPO_INACTIVIDAD);
}
document.addEventListener('click', reiniciarTemporizador);
document.addEventListener('keydown', reiniciarTemporizador);

// Si el servidor dice que la sesión del cajero terminó, se vuelve a la pantalla inicial
function sesionTerminada(r) {
  if (r.status === 401 || r.status === 403) {
    cerrarLocal();
    mostrarAlerta($('mensajeCajero'), r.mensaje, 'warning');
    return true;
  }
  return false;
}

function cerrarLocal() {
  activo = false;
  clearTimeout(temporizador);
  $('formCajero').reset();
  mostrarSeccion('seccionLogin');
}

async function cerrarOperacion(mensaje, tipo = 'success') {
  await api('/api/cajero/logout', 'POST');
  cerrarLocal();
  mostrarAlerta($('mensajeCajero'), mensaje, tipo);
}

// ---------- Identificación ----------
$('formCajero').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cuenta = $('cjCuenta').value.trim();
  const pin = $('cjPin').value;
  if (!/^\d{6,20}$/.test(cuenta)) return mostrarAlerta($('mensajeCajero'), 'Ingresa un número de cuenta válido', 'danger');
  if (!/^\d{4}$/.test(pin)) return mostrarAlerta($('mensajeCajero'), 'El PIN debe tener 4 dígitos', 'danger');

  await conBoton(e.submitter, async () => {
    const r = await api('/api/cajero/login', 'POST', { numero_cuenta: cuenta, pin });
    $('cjPin').value = '';
    if (!r.ok) return mostrarAlerta($('mensajeCajero'), r.mensaje, 'danger');
    activo = true;
    $('titularCajero').textContent = r.titular;
    mostrarSeccion('seccionMenu');
    reiniciarTemporizador();
  });
});

// ---------- Consultar saldo ----------
$('btnSaldo').addEventListener('click', async () => {
  const r = await api('/api/cajero/saldo');
  if (sesionTerminada(r)) return;
  if (!r.ok) return mostrarAlerta($('mensajeCajero'), r.mensaje, 'danger');
  $('cjSaldo').textContent = dinero(r.saldo);
  $('cjCuentaInfo').textContent = `${r.numeroCuenta} (${r.tipo === 'AHORROS' ? 'Ahorros' : 'Corriente'})`;
  mostrarSeccion('seccionSaldo');
});

// ---------- Últimos movimientos ----------
$('btnMovs').addEventListener('click', async () => {
  const r = await api('/api/cajero/movimientos');
  if (sesionTerminada(r)) return;
  if (!r.ok) return mostrarAlerta($('mensajeCajero'), r.mensaje, 'danger');
  $('tbCajeroMovs').innerHTML = r.movimientos.length
    ? r.movimientos.map((m) => `
      <tr>
        <td class="text-nowrap">${fechaHora(m.fecha)}</td>
        <td>${esc(ETIQUETA_TIPO[m.tipo] || m.tipo)}</td>
        <td>${esc(m.descripcion)}</td>
        <td class="text-end text-nowrap ${m.valor < 0 ? 'valor-negativo' : 'valor-positivo'}">${dinero(m.valor)}</td>
        <td class="text-end text-nowrap">${dinero(m.saldo_resultante)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="text-center opacity-75">Sin movimientos</td></tr>';
  mostrarSeccion('seccionMovs');
});

// ---------- Retiro ----------
$('btnRetirar').addEventListener('click', () => {
  $('cjValor').value = '';
  $('bloqueRetiro').classList.remove('d-none');
  $('resultadoRetiro').classList.add('d-none');
  mostrarSeccion('seccionRetiro');
});

document.querySelectorAll('.monto-rapido').forEach((b) =>
  b.addEventListener('click', () => { $('cjValor').value = b.dataset.valor; }));

$('btnConfirmarRetiro').addEventListener('click', async (e) => {
  const valor = Number($('cjValor').value);
  if (!(valor > 0)) return mostrarAlerta($('mensajeCajero'), 'El valor debe ser mayor que cero', 'danger');
  ocultarAlerta($('mensajeCajero'));

  await conBoton(e.currentTarget, async () => {
    const r = await api('/api/cajero/retiro', 'POST', { valor });
    if (sesionTerminada(r)) return;
    if (!r.ok) return mostrarAlerta($('mensajeCajero'), r.mensaje, 'danger');
    $('rtValor').textContent = dinero(r.valorRetirado);
    $('rtSaldo').textContent = dinero(r.nuevoSaldo);
    $('bloqueRetiro').classList.add('d-none');
    $('resultadoRetiro').classList.remove('d-none');
  });
});

document.querySelectorAll('.volver-menu').forEach((b) =>
  b.addEventListener('click', () => mostrarSeccion('seccionMenu')));

// ---------- Cerrar la operación ----------
$('btnSalir').addEventListener('click', () => cerrarOperacion('Operación finalizada. ¡Gracias por usar nuestro cajero!'));
