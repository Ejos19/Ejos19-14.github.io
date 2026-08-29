/* ==========================================================================
   SISTEMA DE AUTENTICACIÓN Y CONTROL DE ACCESO - CRM OSONIKI
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // ========================================================================
  // [SECCIÓN 1]: CONFIGURACIÓN DE USUARIOS Y CONTRASEÑAS
  // ------------------------------------------------------------------------
  // Aquí puedes agregar, editar o eliminar usuarios y contraseñas.
  // Estructura: "nombre_de_usuario": "contraseña"
  // ========================================================================
  const USUARIOS_PERMITIDOS = {
    Deion: "232026", // <--- USUARIO Y CONTRASEÑA PRINCIPAL
    // "Admin": "12345",   // <--- Puedes agregar más usuarios aquí quitando las dos barras '//'
  };

  // ========================================================================
  // [SECCIÓN 2]: RUTAS Y ENLACES QUE REQUIEREN PERMISO DE ADMINISTRADOR
  // ------------------------------------------------------------------------
  // Agrega o elimina las URLs/rutas de las secciones que deseas proteger.
  // Si el enlace en el HTML coincide o contiene este texto, pedirá credenciales.
  // ========================================================================
  const ENLACES_PROTEGIDOS = [
    "Afiliados/index.html",
    "Game Play/Game.html",
    "History Game/HistoryGame.html",
    "Position Table/PositionTable.html",
    "Reloj/Reloj.html",
    // "NuevaSeccion/pagina.html" // <--- Agrega aquí nuevas rutas a proteger
  ];

  // ========================================================================
  // [SECCIÓN 3]: CONFIGURACIÓN DE SESIÓN
  // ------------------------------------------------------------------------
  // true  = Al iniciar sesión correctamente, el usuario navega libremente durante la sesión actual del navegador.
  // false = Pide contraseña CADA VEZ que hace clic en un enlace.
  // ========================================================================
  const RECORDAR_SESION = true;

  // Variable interna para almacenar el enlace al que el usuario desea ingresar
  let urlDestinoPendiente = null;

  // ------------------------------------------------------------------------
  // INYECCIÓN DINÁMICA DEL MODAL Y ESTILOS CSS (Mantiene el tema de tu CRM)
  // ------------------------------------------------------------------------
  const inyectarEstilosYModal = () => {
    // 1. Inyectar CSS ajustado exactamente al tema de tu diseño
    const style = document.createElement("style");
    style.textContent = `
      .auth-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(19, 19, 21, 0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
        font-family: "Inter", sans-serif;
      }

      .auth-modal-overlay.active {
        opacity: 1;
        pointer-events: auto;
      }

      .auth-modal-card {
        background-color: var(--dock-bg, #222225);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 32px;
        width: 100%;
        max-width: 380px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
        transform: scale(0.92);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        color: #ffffff;
        text-align: center;
      }

      .auth-modal-overlay.active .auth-modal-card {
        transform: scale(1);
      }

      .auth-modal-header {
        margin-bottom: 24px;
      }

      .auth-icon-box {
        width: 54px;
        height: 54px;
        background: #131315;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .auth-icon-box svg {
        stroke: var(--accent, #caff33);
      }

      .auth-modal-header h2 {
        font-size: 1.4rem;
        font-weight: 600;
        margin-bottom: 6px;
        letter-spacing: -0.5px;
      }

      .auth-modal-header p {
        font-size: 0.85rem;
        color: var(--text-muted, #88888c);
      }

      .auth-form-group {
        display: flex;
        flex-direction: column;
        gap: 14px;
        text-align: left;
      }

      .auth-input-wrapper {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .auth-input-wrapper label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--text-muted, #88888c);
        font-weight: 500;
      }

      .auth-input-wrapper input {
        background-color: #131315;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        padding: 12px 14px;
        color: #ffffff;
        font-size: 0.95rem;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }

      .auth-input-wrapper input:focus {
        border-color: var(--accent, #caff33);
        box-shadow: 0 0 0 2px rgba(202, 255, 51, 0.15);
      }

      .auth-error-message {
        color: #ff5f56;
        font-size: 0.8rem;
        text-align: center;
        min-height: 18px;
        margin-top: 4px;
      }

      .auth-modal-buttons {
        display: flex;
        gap: 10px;
        margin-top: 20px;
      }

      .auth-btn {
        flex: 1;
        padding: 12px;
        border-radius: 10px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
      }

      .auth-btn-cancel {
        background-color: transparent;
        color: var(--text-muted, #88888c);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .auth-btn-cancel:hover {
        background-color: rgba(255, 255, 255, 0.05);
        color: #ffffff;
      }

      .auth-btn-submit {
        background-color: var(--accent, #caff33);
        color: #000000;
      }

      .auth-btn-submit:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(style);

    // 2. Inyectar HTML de la ventana Modal
    const modalHTML = `
      <div id="authModal" class="auth-modal-overlay">
        <div class="auth-modal-card">
          <div class="auth-modal-header">
            <div class="auth-icon-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2>Acceso Restringido</h2>
            <p>Ingresa credenciales de administrador para acceder a esta sección.</p>
          </div>
          <form id="authForm" class="auth-form-group">
            <div class="auth-input-wrapper">
              <label for="authUserInput">Usuario</label>
              <input type="text" id="authUserInput" placeholder="Ingresa Usuario" autocomplete="off" required />
            </div>
            <div class="auth-input-wrapper">
              <label for="authPassInput">Contraseña</label>
              <input type="password" id="authPassInput" placeholder="••••••••" required />
            </div>
            <div id="authErrorMsg" class="auth-error-message"></div>
            <div class="auth-modal-buttons">
              <button type="button" id="authCancelBtn" class="auth-btn auth-btn-cancel">Cancelar</button>
              <button type="submit" class="auth-btn auth-btn-submit">Ingresar</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
  };

  // Inicializar UI del Modal
  inyectarEstilosYModal();

  // Referencias a los elementos del DOM creados
  const modal = document.getElementById("authModal");
  const authForm = document.getElementById("authForm");
  const userInput = document.getElementById("authUserInput");
  const passInput = document.getElementById("authPassInput");
  const errorMsg = document.getElementById("authErrorMsg");
  const cancelBtn = document.getElementById("authCancelBtn");

  // Mostrar u Ocultar Modal
  const abrirModal = () => {
    errorMsg.textContent = "";
    userInput.value = "";
    passInput.value = "";
    modal.classList.add("active");
    setTimeout(() => userInput.focus(), 100);
  };

  const cerrarModal = () => {
    modal.classList.remove("active");
    urlDestinoPendiente = null;
  };

  // Cancelar acceso
  cancelBtn.addEventListener("click", cerrarModal);

  // Cerrar modal si presiona la tecla Escape
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      cerrarModal();
    }
  });

  // Validar Formulario al hacer Submit
  authForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const usuarioIngresado = userInput.value.trim();
    const passIngresada = passInput.value.trim();

    // Comprobación contra la lista de USUARIOS_PERMITIDOS
    if (
      USUARIOS_PERMITIDOS[usuarioIngresado] &&
      USUARIOS_PERMITIDOS[usuarioIngresado] === passIngresada
    ) {
      // Si la opción RECORDAR_SESION está activa, guardamos el estado en sessionStorage
      if (RECORDAR_SESION) {
        sessionStorage.setItem("osoniki_authenticated", "true");
      }

      const destino = urlDestinoPendiente;
      cerrarModal();

      // Redirigir a la sección seleccionada
      if (destino) {
        window.location.href = destino;
      }
    } else {
      // Credenciales incorrectas
      errorMsg.textContent = "Usuario o contraseña incorrectos";
      passInput.value = "";
      passInput.focus();
    }
  });

  // ------------------------------------------------------------------------
  // CAPTURA E INTERCEPCIÓN DE CLICS EN ENLACES PROTEGIDOS
  // ------------------------------------------------------------------------
  document.addEventListener(
    "click",
    (e) => {
      // Buscar si el elemento donde se hizo clic es un enlace o está dentro de uno
      const enlace = e.target.closest("a");

      if (!enlace) return;

      const href = enlace.getAttribute("href");

      if (!href || href === "#" || href.startsWith("javascript:")) return;

      // Verificar si el enlace coincide con alguna de las rutas protegidas
      const esProtegido = ENLACES_PROTEGIDOS.some((ruta) =>
        href.includes(ruta),
      );

      if (esProtegido) {
        // Verificar si ya tiene la sesión iniciada
        if (
          RECORDAR_SESION &&
          sessionStorage.getItem("osoniki_authenticated") === "true"
        ) {
          return; // Permite la navegación normal
        }

        // Bloquear navegación por defecto
        e.preventDefault();
        e.stopPropagation();

        // Guardar URL de destino y solicitar credenciales
        urlDestinoPendiente = href;
        abrirModal();
      }
    },
    true,
  ); // Usamos captura de evento para interceptar antes que scripts de animación
});
