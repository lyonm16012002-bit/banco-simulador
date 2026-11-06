// Funciones compartidas por todas las páginas

const FORMATO_DINERO = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2
});
const dinero = (n) => FORMATO_DINERO.format(n);
const fechaHora = (f) => new Date(f).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

// Escapa texto antes de insertarlo como HTML (evita inyección de código)
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Llama a la API y siempre devuelve un objeto { ok, mensaje, status, ... }
async function api(url, metodo = 'GET', cuerpo) {
  try {
    const respuesta = await fetch(url, {
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const datos = await respuesta.json().catch(() => ({ ok: false, mensaje: 'Respuesta inválida del servidor' }));
    datos.status = respuesta.status;
    // Si la sesión expiró o el usuario fue bloqueado, se vuelve al login
    if (datos.sesion === false) window.location.href = '/html/login.html';
    return datos;
  } catch (error) {
    return { ok: false, status: 0, mensaje: 'No se pudo conectar con el servidor' };
  }
}

let temporizadores = new WeakMap();
function mostrarAlerta(contenedor, texto, tipo = 'success') {
  clearTimeout(temporizadores.get(contenedor));
  contenedor.textContent = texto;
  contenedor.className = `alert alert-${tipo}`;
  if (tipo === 'success') {
    temporizadores.set(contenedor, setTimeout(() => ocultarAlerta(contenedor), 7000));
  }
}
function ocultarAlerta(contenedor) {
  contenedor.className = 'alert d-none';
  contenedor.textContent = '';
}

const ETIQUETA_TIPO = {
  CONSIGNACION: 'Consignación',
  RETIRO_CAJERO: 'Retiro cajero',
  TRANSFERENCIA_ENVIADA: 'Transferencia enviada',
  TRANSFERENCIA_RECIBIDA: 'Transferencia recibida'
};

function badgeEstado(estado) {
  const clase = { ACTIVO: 'success', INACTIVO: 'secondary', BLOQUEADO: 'danger' }[estado] || 'secondary';
  return `<span class="badge text-bg-${clase}">${esc(estado)}</span>`;
}

// Filas <tr> para una tabla de movimientos (con o sin columnas de cuenta/titular)
function filasMovimientos(movimientos, conCuenta = false) {
  if (!movimientos.length) {
    return `<tr><td colspan="${conCuenta ? 7 : 5}" class="text-center text-muted py-4">No hay movimientos para mostrar</td></tr>`;
  }
  return movimientos.map((m) => `
    <tr>
      <td class="text-nowrap">${fechaHora(m.fecha)}</td>
      ${conCuenta ? `<td>${esc(m.numero_cuenta)}</td><td>${esc(m.titular)}</td>` : ''}
      <td>${esc(ETIQUETA_TIPO[m.tipo] || m.tipo)}</td>
      <td>${esc(m.descripcion)}</td>
      <td class="text-end text-nowrap ${m.valor < 0 ? 'valor-negativo' : 'valor-positivo'}">${dinero(m.valor)}</td>
      <td class="text-end text-nowrap">${dinero(m.saldo_resultante)}</td>
    </tr>`).join('');
}

// El botón se bloquea mientras se envía la solicitud (evita doble clic)
async function conBoton(boton, tarea) {
  if (boton) boton.disabled = true;
  try { return await tarea(); } finally { if (boton) boton.disabled = false; }
}
