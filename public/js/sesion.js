// Se usa en las páginas protegidas: verifica la sesión, muestra el nombre y maneja el cierre.
(async function () {
  const rolEsperado = document.currentScript.dataset.rol;

  try {
    const respuesta = await fetch('/api/auth/me');
    if (!respuesta.ok) throw new Error('Sin sesión');
    const { usuario } = await respuesta.json();

    // Si el rol no corresponde a la página, se redirige a la suya
    if (usuario.rol !== rolEsperado) {
      window.location.href = usuario.rol === 'ADMIN' ? '/html/admin.html' : '/html/cliente.html';
      return;
    }
    document.getElementById('nombreUsuario').textContent = `${usuario.nombres} ${usuario.apellidos}`;
  } catch (error) {
    window.location.href = '/html/login.html';
    return;
  }

  document.getElementById('btnSalir').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/html/login.html';
  });
})();
