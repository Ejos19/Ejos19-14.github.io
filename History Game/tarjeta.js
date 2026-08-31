/**
 * =====================================================================================
 * ARCHIVO: tarjeta.js
 * DESCRIPCIÓN: Módulo interactivo e independiente para la generación, visualización
 *              y descarga de la TARJETA / FLYER VERTICAL de alta resolución para cada
 *              enfrentamiento publicado en HistoryGame.html (Hoja: Game2).
 * =====================================================================================
 */

(function () {
  "use strict";

  /* ===================================================================================
   * 🎨 1. SECCIÓN DE CONFIGURACIÓN Y PERSONALIZACIÓN DEL FLYER (IMAGEN DE FONDO)
   * ===================================================================================
   * 👉 AQUÍ PUEDES MODIFICAR FÁCILMENTE LA IMAGEN DE FONDO DE LA TARJETA:
   * Puedes colocar:
   * 1. Una URL web externa (ej. Unsplash, Google Drive pública, CDN)
   * 2. Una ruta local en tu proyecto (ej. "assets/fondo_cancha.jpg", "Fondo1.png")
   * =================================================================================== */
  const CONFIG_FLYER = {
    // ⬇️ MODIFICA ESTA URL CON LA IMAGEN DE FONDO QUE PREFIERAS:
    IMAGEN_FONDO_FLYER: "/Asset/Cancha.png",

    // Opacidad de la capa oscura sobre la imagen (0.0 = transparente, 1.0 = negro total)
    // Recomendado: 0.75 a 0.88 para garantizar máximo contraste y legibilidad de textos.
    OPACIDAD_SUPERPOSICION: 0.82,

    // Color/Gradiente de respaldo en caso de que la imagen tarde en cargar o no tenga conexión:
    GRADIENTE_RESPALDO:
      "radial-gradient(circle at 50% 15%, rgba(255, 107, 0, 0.35) 0%, rgba(18, 8, 3, 0.95) 70%), linear-gradient(180deg, #1c0902 0%, #0a0301 100%)",

    // Factor de escala para descarga en Alta Resolución (3 = 300% de nitidez cristalina):
    ESCALA_EXPORTACION_PNG: 3,

    // Nombre por defecto del torneo si no está asignado:
    TORNEO_DEFECTO: "Torneo Oficial de Baloncesto",
  };

  /* ===================================================================================
   * 2. INYECCIÓN DE ESTILOS CSS EXCLUSIVOS DEL FLYER (100% INDEPENDIENTE Y AISLADO)
   * =================================================================================== */
  function injectFlyerStyles() {
    if (document.getElementById("tarjeta-flyer-styles")) return;

    const style = document.createElement("style");
    style.id = "tarjeta-flyer-styles";
    style.textContent = `
      /* --- Cursor y feedback en las tarjetas de la cartelera --- */
      .matchup-card-item {
        cursor: pointer !important;
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, border-color 0.22s ease !important;
        position: relative;
      }
      .matchup-card-item:hover {
        transform: translateY(-3px) scale(1.008) !important;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85), 0 0 22px rgba(255, 107, 0, 0.35) !important;
        border-color: rgba(255, 140, 0, 0.6) !important;
      }
      .matchup-card-item::after {
        content: "\\f06e  Ver Flyer Vertical";
        font-family: "Font Awesome 6 Free", "Inter", sans-serif;
        font-weight: 900;
        position: absolute;
        bottom: 8px;
        right: 12px;
        font-size: 0.68rem;
        color: rgba(255, 170, 80, 0.85);
        background: rgba(20, 10, 5, 0.75);
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255, 107, 0, 0.3);
        opacity: 0;
        transform: translateY(4px);
        transition: all 0.2s ease;
        pointer-events: none;
      }
      .matchup-card-item:hover::after {
        opacity: 1;
        transform: translateY(0);
      }

      /* --- Modal Backdrop y Contenedor Principal --- */
      .flyer-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(5, 2, 1, 0.88);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease;
        overflow-y: auto;
      }
      .flyer-modal-overlay.is-open {
        opacity: 1;
        visibility: visible;
      }

      .flyer-modal-wrapper {
        position: relative;
        max-width: 580px;
        width: 100%;
        margin: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: scale(0.92) translateY(20px);
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .flyer-modal-overlay.is-open .flyer-modal-wrapper {
        transform: scale(1) translateY(0);
      }

      /* --- Barra Superior de Acciones (Descargar PNG y Cerrar) --- */
      .flyer-modal-toolbar {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .flyer-btn-download {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        background: linear-gradient(135deg, #ff6b00 0%, #ff8c00 50%, #ffa500 100%);
        color: #ffffff !important;
        font-family: "Montserrat", "Inter", sans-serif;
        font-size: 0.92rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 12px 24px;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 0 0 24px rgba(255, 107, 0, 0.5), 0 8px 18px rgba(0, 0, 0, 0.6);
        transition: all 0.22s ease;
      }
      .flyer-btn-download:hover {
        background: linear-gradient(135deg, #ff7e1a 0%, #ffa01a 100%);
        transform: translateY(-2px);
        box-shadow: 0 0 32px rgba(255, 107, 0, 0.7), 0 12px 24px rgba(0, 0, 0, 0.75);
      }
      .flyer-btn-download:active {
        transform: translateY(0);
      }
      .flyer-btn-close {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(30, 15, 8, 0.85);
        color: #fed7aa;
        border: 1px solid rgba(255, 107, 0, 0.4);
        border-radius: 12px;
        cursor: pointer;
        font-size: 1.25rem;
        transition: all 0.2s ease;
      }
      .flyer-btn-close:hover {
        background: #f43f5e;
        color: #ffffff;
        border-color: #f43f5e;
        transform: rotate(90deg);
      }

      /* =========================================================================
       * 🖼️ ESTRUCTURA Y DISEÑO DEL FLYER VERTICAL (ESTILO POSTER / CARTELERA)
       * ========================================================================= */
      .flyer-card-poster {
        position: relative;
        width: 100%;
        max-width: 520px;
        min-height: 740px;
        background-color: #0c0502;
        background-size: cover;
        background-position: center center;
        background-repeat: no-repeat;
        border-radius: 24px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 36px 28px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.95), 0 0 40px rgba(255, 107, 0, 0.25);
        color: #ffffff;
        user-select: none;
      }

      /* Capa oscura superpuesta para asegurar perfecta lectura */
      .flyer-card-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, 
          rgba(10, 4, 1, 0.78) 0%, 
          rgba(18, 7, 2, 0.88) 45%, 
          rgba(8, 3, 1, 0.94) 100%);
        pointer-events: none;
        z-index: 1;
      }

      /* Resplandores y detalles luminosos neón */
      .flyer-glow-top {
        position: absolute;
        top: -60px;
        left: 50%;
        transform: translateX(-50%);
        width: 320px;
        height: 160px;
        background: radial-gradient(circle, rgba(255, 107, 0, 0.45) 0%, transparent 70%);
        pointer-events: none;
        z-index: 2;
      }
      .flyer-glow-center {
        position: absolute;
        top: 48%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 360px;
        height: 240px;
        background: radial-gradient(circle, rgba(255, 140, 0, 0.25) 0%, transparent 75%);
        pointer-events: none;
        z-index: 2;
      }

      /* Contenido interno ordenado en Z-index superior */
      .flyer-content-layer {
        position: relative;
        z-index: 3;
        display: flex;
        flex-direction: column;
        height: 100%;
        justify-content: space-between;
        gap: 24px;
        text-align: center;
      }

      /* -------------------------------------------------------------------------
       * 1. PARTE SUPERIOR: ENCABEZADO, FECHA GRANDE Y HORA
       * ------------------------------------------------------------------------- */
      .flyer-top-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }

      .flyer-badge-tournament {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 16px;
        background: rgba(255, 107, 0, 0.18);
        border: 1px solid rgba(255, 140, 0, 0.45);
        border-radius: 999px;
        font-family: "Montserrat", sans-serif;
        font-size: 0.78rem;
        font-weight: 800;
        color: #fed7aa;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
        box-shadow: 0 0 16px rgba(255, 107, 0, 0.2);
      }
      .flyer-badge-tournament i {
        color: #ff8c00;
      }

      .flyer-game-title {
        font-family: "Montserrat", "Inter", sans-serif;
        font-size: 1.05rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #fed7aa;
        opacity: 0.9;
        margin-bottom: 2px;
      }

      /* FECHA EN LETRAS GRANDES Y EXPLÍCITAS CON FORMATO PERSONALIZADO */
      .flyer-date-main {
        font-family: "Montserrat", "Russo One", "Bebas Neue", sans-serif;
        font-size: 2.25rem;
        line-height: 1.15;
        font-weight: 900;
        color: #ffffff;
        text-transform: none;
        letter-spacing: 0.02em;
        margin: 4px 0;
        text-shadow: 0 0 20px rgba(255, 107, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.9);
      }

      /* HORA DEBAJO DE LA FECHA */
      .flyer-time-sub {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: "JetBrains Mono", "Montserrat", monospace;
        font-size: 1.45rem;
        font-weight: 800;
        color: #fefdfc;
        text-shadow: 0 0 16px rgba(168, 168, 168, 0.5);
        letter-spacing: 0.05em;
        margin-top: 2px;
      }
      .flyer-time-sub i {
        color: #ffaa00;
        font-size: 1.25rem;
      }

      /* -------------------------------------------------------------------------
       * 2. PARTE CENTRAL: LOGOS, NOMBRES Y METADATOS ALINEADOS FRENTE A FRENTE
       * ------------------------------------------------------------------------- */
      .flyer-center-section {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: start;
        gap: 12px;
        margin: 14px 0 16px 0;
        width: 100%;
      }

      /* Columnas laterales de cada equipo */
      .flyer-team-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      /* Columna central: VS, Marcador y Estatus */
      .flyer-vs-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        min-width: 110px;
        background: transparent !important;
        border: none !important;
      }

      /* Fila 1: Contenedores de etiquetas LOCAL / VISITANTE alineadas a la misma altura */
      .flyer-team-tag-wrap {
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 8px;
      }
      .flyer-team-tag-wrap.side-local .flyer-team-tag {
        font-family: "Montserrat", sans-serif;
        font-size: 0.8rem;
        font-weight: 900;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #00f0ff;
        text-shadow: 0 0 10px rgba(0, 240, 255, 0.7);
      }
      .flyer-team-tag-wrap.side-visitor .flyer-team-tag {
        font-family: "Montserrat", sans-serif;
        font-size: 0.8rem;
        font-weight: 900;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #ff2a5f;
        text-shadow: 0 0 10px rgba(255, 42, 95, 0.7);
      }

      /* Fila 2: Contenedores de Logo y Caja Central VS con altura uniforme fija (140px) */
      .flyer-team-logo-container {
        width: 140px;
        height: 140px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        margin-bottom: 12px;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      .flyer-team-logo-img {
        max-width: 135px;
        max-height: 135px;
        width: auto;
        height: auto;
        object-fit: contain;
        filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.85)) drop-shadow(0 0 16px rgba(255, 107, 0, 0.35));
        transition: transform 0.25s ease;
      }
      .flyer-team-placeholder-logo {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle, rgba(255, 107, 0, 0.25) 0%, rgba(20, 10, 5, 0.6) 80%);
        color: #ff8c00;
        font-size: 3.5rem;
        filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.8));
      }

      /* Caja central con la misma altura exacta de los logos (140px) */
      .flyer-vs-center-box {
        height: 140px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-bottom: 12px;
      }
      .flyer-vs-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .flyer-vs-icon {
        font-size: 1.15rem;
        color: #ff8c00;
        filter: drop-shadow(0 0 8px rgba(255, 140, 0, 0.8));
      }
      .flyer-vs-text {
        font-family: "Russo One", "Bebas Neue", sans-serif;
        font-size: 2.7rem;
        font-weight: 900;
        line-height: 1;
        letter-spacing: 0.06em;
        color: #ff6b00;
        text-shadow: 0 0 24px rgba(255, 107, 0, 0.85), 0 4px 14px rgba(0, 0, 0, 0.9);
      }

      /* Marcador central: Local Azul Neón, Visitante Rojo Neón */
      .flyer-score-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: "JetBrains Mono", "Montserrat", monospace;
        font-size: 1.9rem;
        font-weight: 900;
        line-height: 1;
        margin: 2px 0;
      }
      .flyer-score-local {
        color: #00f0ff;
        text-shadow: 0 0 18px rgba(0, 240, 255, 0.85), 0 2px 10px rgba(0, 0, 0, 0.8);
      }
      .flyer-score-visitor {
        color: #ff2a5f;
        text-shadow: 0 0 18px rgba(255, 42, 95, 0.85), 0 2px 10px rgba(0, 0, 0, 0.8);
      }
      .flyer-score-divider {
        color: #ffffff;
        opacity: 0.7;
        font-size: 1.6rem;
      }

      /* Badges Neón para los Estados */
      .flyer-status-badge {
        font-family: "Montserrat", sans-serif;
        font-size: 0.72rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 4px 12px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      /* 1. Azul Neón para PROGRAMADO */
      .flyer-status-badge.status-programado {
        color: #00f0ff;
        background: rgba(0, 240, 255, 0.15);
        border: 1.5px solid rgba(0, 240, 255, 0.65);
        box-shadow: 0 0 14px rgba(0, 240, 255, 0.45);
      }
      /* 2. Rojo Neón para FINALIZADO */
      .flyer-status-badge.status-finalizado {
        color: #ff2a5f;
        background: rgba(255, 42, 95, 0.16);
        border: 1.5px solid rgba(255, 42, 95, 0.65);
        box-shadow: 0 0 14px rgba(255, 42, 95, 0.45);
      }
      /* 3. Naranja Neón para POSPUESTO */
      .flyer-status-badge.status-pospuesto {
        color: #ff8c00;
        background: rgba(255, 140, 0, 0.16);
        border: 1.5px solid rgba(255, 140, 0, 0.65);
        box-shadow: 0 0 14px rgba(255, 140, 0, 0.45);
      }

      /* Fila 3: Nombres de los equipos alineados exactamente al tope horizontal */
      .flyer-team-name-wrap {
        min-height: 48px;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        width: 100%;
        margin-bottom: 6px;
      }
      .flyer-team-col.team-local .flyer-team-name {
        color: #ffffff;
        text-shadow: 0 0 16px rgba(0, 240, 255, 0.35), 0 2px 10px rgba(0, 0, 0, 0.9);
      }
      .flyer-team-col.team-visitor .flyer-team-name {
        color: #ffffff;
        text-shadow: 0 0 16px rgba(255, 42, 95, 0.35), 0 2px 10px rgba(0, 0, 0, 0.9);
      }
      .flyer-team-name {
        font-family: "Montserrat", "Inter", sans-serif;
        font-size: 1.25rem;
        font-weight: 900;
        line-height: 1.2;
        text-transform: uppercase;
        text-align: center;
        max-width: 180px;
        word-break: break-word;
      }

      /* Fila 4: Metadatos (ID / Código de equipo) alineados frente a frente */
      .flyer-team-meta {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        gap: 2px;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.76rem;
        min-height: 38px;
        text-align: center;
        max-width: 180px;
        line-height: 1.3;
      }
      .flyer-team-col.team-local .flyer-team-meta {
        color: #7dd3fc;
      }
      .flyer-team-col.team-visitor .flyer-team-meta {
        color: #fda4af;
      }
      .invisible-spacer {
        visibility: hidden;
        pointer-events: none;
      }

      /* -------------------------------------------------------------------------
       * 3. PARTE INFERIOR: CANCHA / LUGAR, OBSERVACIONES Y CUERPO TÉCNICO
       * ------------------------------------------------------------------------- */
      .flyer-bottom-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: 100%;
        text-align: center;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 140, 0, 0.2);
      }

      /* Lugar de Enfrentamiento / Cancha */
      .flyer-location-block {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: "Montserrat", "Inter", sans-serif;
        font-size: 0.98rem;
        font-weight: 800;
        color: #fff7ed;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .flyer-location-block i {
        color: #ff6b00;
        font-size: 1.15rem;
      }

      /* Observaciones */
      .flyer-notes-block {
        max-width: 440px;
        font-family: "Inter", sans-serif;
        font-size: 0.82rem;
        line-height: 1.45;
        color: #fed7aa;
        opacity: 0.92;
        font-style: italic;
        word-break: break-word;
      }
      .flyer-notes-block i {
        color: #ff8c00;
        margin-right: 4px;
      }

      /* Cuerpo Técnico / Árbitros */
      .flyer-referees-block {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 4px;
      }
      .flyer-ref-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        font-family: "Inter", sans-serif;
        font-size: 0.74rem;
        font-weight: 600;
        color: #fdba74;
      }
      .flyer-ref-badge i {
        color: #ffaa00;
        font-size: 0.75rem;
      }

      /* Pie con Logo o Sello deportivo */
      .flyer-footer-branding {
        font-family: "Montserrat", sans-serif;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.4);
        margin-top: 4px;
      }

      /* Responsividad en pantallas móviles */
      @media (max-width: 600px) {
        .flyer-card-poster {
          min-height: 680px;
          padding: 24px 16px;
          border-radius: 18px;
        }
        .flyer-date-main {
          font-size: 2rem;
        }
        .flyer-time-sub {
          font-size: 1.2rem;
        }
        .flyer-center-section {
          gap: 8px;
        }
        .flyer-team-logo-container,
        .flyer-vs-center-box {
          height: 100px;
        }
        .flyer-team-logo-img {
          max-width: 95px;
          max-height: 95px;
        }
        .flyer-team-placeholder-logo {
          width: 85px;
          height: 85px;
          font-size: 2.2rem;
        }
        .flyer-team-name {
          font-size: 1rem;
          max-width: 130px;
        }
        .flyer-vs-text {
          font-size: 1.9rem;
        }
        .flyer-score-display {
          font-size: 1.5rem;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* ===================================================================================
   * 3. CONSTRUCCIÓN DEL MODAL EN EL DOM
   * =================================================================================== */
  function ensureFlyerModalInDOM() {
    if (document.getElementById("flyer-preview-modal-overlay")) return;

    const modalHTML = `
      <div id="flyer-preview-modal-overlay" class="flyer-modal-overlay" role="dialog" aria-modal="true">
        <div class="flyer-modal-wrapper">
          <!-- Barra de Acciones Superior -->
          <div class="flyer-modal-toolbar">
            <button type="button" id="btn-download-flyer-png" class="flyer-btn-download" title="Descargar flyer en formato PNG en alta definición">
              <i class="fa-solid fa-cloud-arrow-down"></i>
              <span>Descargar Flyer (PNG Alta Definición)</span>
            </button>
            <button type="button" id="btn-close-flyer-modal" class="flyer-btn-close" title="Cerrar vista previa">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Poster / Flyer Vertical -->
          <div id="flyer-card-poster-element" class="flyer-card-poster">
            <!-- Capa Oscura de Legibilidad -->
            <div class="flyer-card-overlay"></div>
            <!-- Resplandores Neón de Ambiente -->
            <div class="flyer-glow-top"></div>
            <div class="flyer-glow-center"></div>

            <!-- Contenido Estructurado del Flyer -->
            <div class="flyer-content-layer" id="flyer-dynamic-content">
              <!-- Se llena dinámicamente al abrir un enfrentamiento -->
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Eventos de Cerrar Modal
    const overlay = document.getElementById("flyer-preview-modal-overlay");
    const btnClose = document.getElementById("btn-close-flyer-modal");
    const btnDownload = document.getElementById("btn-download-flyer-png");

    if (btnClose) {
      btnClose.addEventListener("click", closeFlyerModal);
    }
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeFlyerModal();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        overlay &&
        overlay.classList.contains("is-open")
      ) {
        closeFlyerModal();
      }
    });

    // Evento de Descarga en PNG en Alta Resolución
    if (btnDownload) {
      btnDownload.addEventListener("click", downloadFlyerAsHighResPNG);
    }
  }

  /* ===================================================================================
   * 4. NORMALIZACIÓN DE IMÁGENES Y LOGOS (DRIVE Y EXTERNOS)
   * =================================================================================== */
  function extractDriveId(url) {
    if (!url || typeof url !== "string") return "";
    url = url.trim();

    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/i);
    if (idMatch && idMatch[1]) return idMatch[1];

    const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (dMatch && dMatch[1]) return dMatch[1];

    const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

    if (/^[a-zA-Z0-9_-]{20,50}$/.test(url)) return url;
    return "";
  }

  function resolveLogoUrl(url) {
    if (!url || typeof url !== "string") return "";
    url = url.trim();
    if (!url) return "";

    if (
      url.startsWith("data:image/") ||
      url.startsWith("blob:") ||
      url.match(/\.(png|jpg|jpeg|svg|webp)($|\?)/i)
    ) {
      return url;
    }

    const driveId = extractDriveId(url);
    if (driveId) {
      return `https://lh3.googleusercontent.com/d/${driveId}`;
    }
    return url;
  }

  /* Formato legible de fecha para el flyer (Ej: "Miercoles. 22 Jul 2026") */
  function formatFlyerDate(dateStr) {
    if (!dateStr) return "Fecha por definir";

    try {
      let dateObj = null;

      if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
        dateObj = dateStr;
      } else if (typeof dateStr === "string") {
        const trimmed = dateStr.trim();

        // 1. Strings ISO o con tiempo (ej. "2026-09-04T04:00:00.000Z" o "2026-09-04T00:00:00")
        if (trimmed.includes("T")) {
          const datePart = trimmed.split("T")[0]; // "2026-09-04"
          const dateBits = datePart.split("-").map((n) => parseInt(n, 10));
          if (
            dateBits.length === 3 &&
            dateBits[0] &&
            dateBits[1] &&
            dateBits[2]
          ) {
            dateObj = new Date(dateBits[0], dateBits[1] - 1, dateBits[2]);
          }
        }

        // 2. Formato YYYY-MM-DD o YYYY/MM/DD
        if (!dateObj && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)) {
          const dateBits = trimmed.split(/[-/]/).map((n) => parseInt(n, 10));
          if (
            dateBits.length >= 3 &&
            dateBits[0] &&
            dateBits[1] &&
            dateBits[2]
          ) {
            dateObj = new Date(dateBits[0], dateBits[1] - 1, dateBits[2]);
          }
        }

        // 3. Formato DD-MM-YYYY o DD/MM/YYYY
        if (!dateObj && /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(trimmed)) {
          const dateBits = trimmed.split(/[-/]/).map((n) => parseInt(n, 10));
          if (
            dateBits.length >= 3 &&
            dateBits[0] &&
            dateBits[1] &&
            dateBits[2]
          ) {
            dateObj = new Date(dateBits[2], dateBits[1] - 1, dateBits[0]);
          }
        }

        // 4. Intentar parser estándar nativo si no coincidió con los anteriores
        if (!dateObj) {
          const parsed = new Date(trimmed);
          if (!isNaN(parsed.getTime())) {
            dateObj = parsed;
          }
        }
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        const dias = [
          "Domingo",
          "Lunes",
          "Martes",
          "Miercoles",
          "Jueves",
          "Viernes",
          "Sabado",
        ];
        const meses = [
          "Ene",
          "Feb",
          "Mar",
          "Abr",
          "May",
          "Jun",
          "Jul",
          "Ago",
          "Sep",
          "Oct",
          "Nov",
          "Dic",
        ];
        const diaSemana = dias[dateObj.getDay()];
        const diaNum = String(dateObj.getDate()).padStart(2, "0");
        const mesAbrev = meses[dateObj.getMonth()];
        const anio = dateObj.getFullYear();
        // Estructura requerida: format (DDD. DD, MMM, YYYY) -> Ej: "Miercoles. 22 Jul 2026"
        return `${diaSemana}. ${diaNum} ${mesAbrev} ${anio}`;
      }
    } catch (e) {
      console.warn("[tarjeta.js] Error al formatear fecha:", e);
    }

    return String(dateStr);
  }

  function escapeText(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ===================================================================================
   * 5. APERTURA Y RENDERIZADO DINÁMICO DEL FLYER VERTICAL
   * =================================================================================== */
  let currentMatchDataForFlyer = null;

  function openGameFlyer(match) {
    if (!match) return;
    currentMatchDataForFlyer = match;

    ensureFlyerModalInDOM();

    const posterEl = document.getElementById("flyer-card-poster-element");
    const container = document.getElementById("flyer-dynamic-content");
    const overlay = document.getElementById("flyer-preview-modal-overlay");

    if (!container || !overlay) return;

    // Aplicar la imagen de fondo configurada
    if (posterEl) {
      posterEl.style.backgroundImage = `url("${CONFIG_FLYER.IMAGEN_FONDO_FLYER}"), ${CONFIG_FLYER.GRADIENTE_RESPALDO}`;
    }

    // Datos del partido
    const tournId =
      match.ID_Tournament || match.id_tournament || match.tournamentId || "";
    const tournName =
      match.Tournament ||
      match.tournament ||
      match.tournamentName ||
      CONFIG_FLYER.TORNEO_DEFECTO;
    const gameTitle = match.gameTitle || `JUEGO ${match.id || ""}`;
    const dateFormatted = formatFlyerDate(match.gameDate);
    const timeFormatted = match.gameTime || "08:00 PM";

    const teamAName = match.teamA_name || "Equipo Local";
    const teamAId = match.teamA_id || "";
    const teamACode = match.teamA_code || "";
    const teamALogo = resolveLogoUrl(match.teamA_logo);

    const teamBName = match.teamB_name || "Equipo Visitante";
    const teamBId = match.teamB_id || "";
    const teamBCode = match.teamB_code || "";
    const teamBLogo = resolveLogoUrl(match.teamB_logo);

    const scoreA =
      match.scoreA != null && match.scoreA !== "" ? match.scoreA : null;
    const scoreB =
      match.scoreB != null && match.scoreB !== "" ? match.scoreB : null;

    // Normalización de Estatus y Colores Neón
    const rawStatus = String(match.status || match.Estatus || "")
      .trim()
      .toUpperCase();
    let statusType = "PROGRAMADO";
    let statusClass = "status-programado";
    let statusLabel = "PROGRAMADO";

    if (
      rawStatus.includes("FINAL") ||
      rawStatus === "TERMINADO" ||
      rawStatus === "JUGADO"
    ) {
      statusType = "FINALIZADO";
      statusClass = "status-finalizado";
      statusLabel = "FINALIZADO";
    } else if (
      rawStatus.includes("POSP") ||
      rawStatus.includes("SUSP") ||
      rawStatus.includes("APLAZ")
    ) {
      statusType = "POSPUESTO";
      statusClass = "status-pospuesto";
      statusLabel = "POSPUESTO";
    } else {
      statusType = "PROGRAMADO";
      statusClass = "status-programado";
      statusLabel = "PROGRAMADO";
    }

    // El marcador DEBE APARECER SI Y SOLO SI el estatus es FINALIZADO o POSPUESTO
    const shouldShowScore =
      statusType === "FINALIZADO" || statusType === "POSPUESTO";

    const courtLocation =
      match.courtLocation || match.Sede || match.Cancha || "Cancha Principal";
    const notes = match.notes || match.Observaciones || "";

    const hasReferees =
      match.referee1_name || match.referee2_name || match.referee3_name;

    // Construcción del contenido del Flyer Vertical:
    container.innerHTML = `
      <!-- =======================================================
           1. PARTE SUPERIOR: TORNEO, FECHA EN LETRAS GRANDES Y HORA
           ======================================================= -->
      <div class="flyer-top-section">
        <div class="flyer-badge-tournament">
          <i class="fa-solid fa-trophy"></i>
          <span>${escapeText(tournName)}${tournId ? ` • ID: ${escapeText(tournId)}` : ""}</span>
        </div>

        <div class="flyer-game-title">
          <span>${escapeText(gameTitle)}</span>
        </div>

        <!-- FECHA DEL ENFRENTAMIENTO EN LETRAS GRANDES CON FORMATO SOLICITADO -->
        <h2 class="flyer-date-main" title="Fecha del enfrentamiento">
          ${escapeText(dateFormatted)}
        </h2>

        <!-- HORA DEL ENFRENTAMIENTO DEBAJO DE LA FECHA -->
        <div class="flyer-time-sub" title="Hora del enfrentamiento">
          <i class="fa-regular fa-clock"></i>
          <span>${escapeText(timeFormatted)}</span>
        </div>
      </div>

      <!-- =======================================================
           2. PARTE CENTRAL: LOGOS, EQUIPOS Y VS ALINEADOS FRENTE A FRENTE
           ======================================================= -->
      <div class="flyer-center-section">
        <!-- Columna Equipo Local (Azul Neón) -->
        <div class="flyer-team-col team-local">
          <div class="flyer-team-tag-wrap side-local">
            <span class="flyer-team-tag">LOCAL</span>
          </div>
          <div class="flyer-team-logo-container">
            ${
              teamALogo
                ? `<img src="${teamALogo}" alt="${escapeText(teamAName)}" class="flyer-team-logo-img" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'flyer-team-placeholder-logo\\'><i class=\\'fa-solid fa-shield-halved\\'></i></div>';" />`
                : `<div class="flyer-team-placeholder-logo"><i class="fa-solid fa-shield-halved"></i></div>`
            }
          </div>
          <div class="flyer-team-name-wrap">
            <h3 class="flyer-team-name">${escapeText(teamAName)}</h3>
          </div>
          <div class="flyer-team-meta">
            ${teamAId ? `<span>ID: ${escapeText(teamAId)}</span>` : ""}
            ${teamACode ? `<span>CÓD: ${escapeText(teamACode)}</span>` : ""}
          </div>
        </div>

        <!-- Columna Central: VS, Marcador Neón y Estado -->
        <div class="flyer-vs-col">
          <div class="flyer-team-tag-wrap invisible-spacer">
            <span>&nbsp;</span>
          </div>

          <div class="flyer-vs-center-box">
            <div class="flyer-vs-wrapper">
              <i class="fa-solid fa-basketball"></i>
              <span class="flyer-vs-text">VS</span>
              <i class="fa-solid fa-basketball"></i>
            </div>

            ${
              shouldShowScore
                ? `
                <div class="flyer-score-display" title="Marcador oficial">
                  <span class="flyer-score-local">${scoreA != null && scoreA !== "" ? scoreA : "0"}</span>
                  <span class="flyer-score-divider">-</span>
                  <span class="flyer-score-visitor">${scoreB != null && scoreB !== "" ? scoreB : "0"}</span>
                </div>
                `
                : ""
            }

            <span class="flyer-status-badge ${statusClass}">
              <i class="fa-solid ${statusType === "FINALIZADO" ? "fa-flag-checkered" : statusType === "POSPUESTO" ? "fa-calendar-xmark" : "fa-stopwatch"}"></i>
              ${statusLabel}
            </span>
          </div>

          <div class="flyer-team-name-wrap invisible-spacer">
            <span>&nbsp;</span>
          </div>
          <div class="flyer-team-meta invisible-spacer">
            <span>&nbsp;</span>
          </div>
        </div>

        <!-- Columna Equipo Visitante (Rojo Neón) -->
        <div class="flyer-team-col team-visitor">
          <div class="flyer-team-tag-wrap side-visitor">
            <span class="flyer-team-tag">VISITANTE</span>
          </div>
          <div class="flyer-team-logo-container">
            ${
              teamBLogo
                ? `<img src="${teamBLogo}" alt="${escapeText(teamBName)}" class="flyer-team-logo-img" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'flyer-team-placeholder-logo\\'><i class=\\'fa-solid fa-shield-halved\\'></i></div>';" />`
                : `<div class="flyer-team-placeholder-logo"><i class="fa-solid fa-shield-halved"></i></div>`
            }
          </div>
          <div class="flyer-team-name-wrap">
            <h3 class="flyer-team-name">${escapeText(teamBName)}</h3>
          </div>
          <div class="flyer-team-meta">
            ${teamBId ? `<span>ID: ${escapeText(teamBId)}</span>` : ""}
            ${teamBCode ? `<span>CÓD: ${escapeText(teamBCode)}</span>` : ""}
          </div>
        </div>
      </div>

      <!-- =======================================================
           3. PARTE INFERIOR: SEDE / LUGAR, OBSERVACIONES Y CUERPO TÉCNICO
           ======================================================= -->
      <div class="flyer-bottom-section">
        <!-- Lugar de enfrentamiento -->
        <div class="flyer-location-block" title="Lugar de enfrentamiento">
          <i class="fa-solid fa-location-dot"></i>
          <span>${escapeText(courtLocation)}</span>
        </div>

        <!-- Observaciones -->
        ${
          notes
            ? `
            <div class="flyer-notes-block" title="Observaciones del juego">
              <i class="fa-solid fa-comment-dots"></i>
              <span>${escapeText(notes)}</span>
            </div>
            `
            : ""
        }

        <!-- Cuerpo Técnico / Árbitros -->
        ${
          hasReferees
            ? `
            <div class="flyer-referees-block" title="Cuerpo Técnico / Árbitros">
              <span style="font-size: 0.72rem; color: #fed7aa; font-weight: 700; width: 100%;"><i class="fa-solid fa-user-shield"></i> Cuerpo Técnico:</span>
              ${match.referee1_name ? `<span class="flyer-ref-badge"><i class="fa-solid fa-whistle"></i> Pral: ${escapeText(match.referee1_name)}</span>` : ""}
              ${match.referee2_name ? `<span class="flyer-ref-badge"><i class="fa-solid fa-whistle"></i> Aux: ${escapeText(match.referee2_name)}</span>` : ""}
              ${match.referee3_name ? `<span class="flyer-ref-badge"><i class="fa-solid fa-clipboard-user"></i> Mesa: ${escapeText(match.referee3_name)}</span>` : ""}
            </div>
            `
            : ""
        }

        <!-- Pie institucional -->
        <div class="flyer-footer-branding">
          <span>OFICIAL • CARTELERA DE JUEGO • BASKETBALL</span>
        </div>
      </div>
    `;

    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeFlyerModal() {
    const overlay = document.getElementById("flyer-preview-modal-overlay");
    if (overlay) {
      overlay.classList.remove("is-open");
    }
    document.body.style.overflow = "";
  }

  /* ===================================================================================
   * 6. DESCARGA EN PNG DE ALTA RESOLUCIÓN Y DEFINICIÓN (HTML2CANVAS CON ESCALA 3X)
   * =================================================================================== */
  async function downloadFlyerAsHighResPNG() {
    const posterEl = document.getElementById("flyer-card-poster-element");
    const btnDownload = document.getElementById("btn-download-flyer-png");
    if (!posterEl) return;

    if (typeof window.html2canvas !== "function") {
      alert(
        "La biblioteca de captura gráfica aún se está cargando. Por favor, intente de nuevo en un segundo.",
      );
      return;
    }

    const originalBtnHTML = btnDownload ? btnDownload.innerHTML : "";
    if (btnDownload) {
      btnDownload.disabled = true;
      btnDownload.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Generando PNG en Alta Definición...</span>`;
    }

    try {
      // Opciones para captura ultra nítida en alta resolución
      const canvas = await window.html2canvas(posterEl, {
        scale: CONFIG_FLYER.ESCALA_EXPORTACION_PNG || 3,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: null,
        scrollX: 0,
        scrollY: 0,
      });

      // Crear nombre de archivo descriptivo
      const m = currentMatchDataForFlyer || {};
      const teamA = (m.teamA_name || "EquipoA").replace(/[^a-zA-Z0-9_-]/g, "_");
      const teamB = (m.teamB_name || "EquipoB").replace(/[^a-zA-Z0-9_-]/g, "_");
      const dateStr = (m.gameDate || "Fecha").replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileName = `Flyer_${teamA}_vs_${teamB}_${dateStr}.png`;

      // Descarga directa mediante enlace
      const dataUrl = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (typeof window.showToast === "function") {
        window.showToast(
          "¡Flyer descargado en formato PNG en alta resolución!",
          "success",
        );
      }
    } catch (err) {
      console.error("[tarjeta.js] Error al exportar PNG del flyer:", err);
      alert(
        "Hubo un detalle al exportar la imagen. Se intentará generar en modo alternativo.",
      );
    } finally {
      if (btnDownload) {
        btnDownload.disabled = false;
        btnDownload.innerHTML = originalBtnHTML;
      }
    }
  }

  /* ===================================================================================
   * 7. DELEGACIÓN DE EVENTOS PARA CAPTURAR CLICKS EN CUALQUIER ENFRENTAMIENTO
   * =================================================================================== */
  function setupMatchupClickListeners() {
    // Escuchar clicks delegados en cualquier elemento de la cartelera
    document.addEventListener("click", (e) => {
      // Ignorar si el click ocurrió dentro de botones de exportación, filtros o inputs
      if (
        e.target.closest("button") ||
        e.target.closest("input") ||
        e.target.closest("select") ||
        e.target.closest(".export-actions-cluster") ||
        e.target.closest(".history-filter-bar") ||
        e.target.closest(".app-navigation-tabs") ||
        e.target.closest(".modal")
      ) {
        return;
      }

      // Detectar si se hizo click en una tarjeta de enfrentamiento
      const card = e.target.closest(".matchup-card-item");
      if (!card) return;

      // Obtener el ID del juego desde el id del elemento o atributos
      const cardIdAttr = card.id || "";
      const rawId = cardIdAttr.replace(/^history-matchup-/, "");

      // Buscar el objeto del partido en las fuentes disponibles
      let matchObj = null;

      if (typeof window.getAllHistoryMatchups === "function") {
        const all = window.getAllHistoryMatchups();
        matchObj = all.find((m) => String(m.id) === String(rawId));
      }

      if (!matchObj && typeof window.getHistoryMatchups === "function") {
        const list = window.getHistoryMatchups(false);
        matchObj = list.find((m) => String(m.id) === String(rawId));
      }

      if (!matchObj && Array.isArray(window.historyMatchups)) {
        matchObj = window.historyMatchups.find(
          (m) => String(m.id) === String(rawId),
        );
      }

      // Si se encontró el enfrentamiento, abrir la tarjeta / flyer vertical
      if (matchObj) {
        openGameFlyer(matchObj);
      }
    });
  }

  /* ===================================================================================
   * 8. INICIALIZACIÓN GLOBAL
   * =================================================================================== */
  document.addEventListener("DOMContentLoaded", () => {
    injectFlyerStyles();
    ensureFlyerModalInDOM();
    setupMatchupClickListeners();
  });

  // Exponer API global de la tarjeta para llamadas externas o directas
  window.openGameFlyer = openGameFlyer;
  window.closeGameFlyer = closeFlyerModal;
  window.downloadFlyerPNG = downloadFlyerAsHighResPNG;
  window.TARJETA_FLYER_CONFIG = CONFIG_FLYER;
})();
