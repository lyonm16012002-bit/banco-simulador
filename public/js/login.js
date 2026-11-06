// Lógica del formulario de inicio de sesión
const formulario = document.getElementById('formLogin');
const inputEmail = document.getElementById('email');
const inputPassword = document.getElementById('password');
const caja = document.getElementById('mensaje');
const boton = document.getElementById('btnIngresar');

function mostrarMensaje(texto, tipo) {
  caja.textContent = texto;
  caja.className = `alert alert-${tipo}`;
}

formulario.addEventListener('submit', async (e) => {
  e.preventDefault();
  caja.className = 'alert d-none';

  // Validación en el navegador
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputEmail.value.trim());
  const passwordValida = inputPassword.value.length > 0;
  inputEmail.classList.toggle('is-invalid', !emailValido);
  inputPassword.classList.toggle('is-invalid', !passwordValida);
  if (!emailValido || !passwordValida) return;

  boton.disabled = true;
  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inputEmail.value, password: inputPassword.value })
    });
    const datos = await respuesta.json();

    if (datos.ok) {
      mostrarMensaje(datos.mensaje, 'success');
      window.location.href = datos.destino;
    } else {
      mostrarMensaje(datos.mensaje, 'danger');
    }
  } catch (error) {
    mostrarMensaje('No se pudo conectar con el servidor', 'danger');
  } finally {
    boton.disabled = false;
  }
});
