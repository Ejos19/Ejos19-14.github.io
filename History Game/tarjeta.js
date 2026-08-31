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

    // ⬇️ OPACIDAD REAL DE LA IMAGEN DE FONDO (0.0 = transparente, 1.0 = visible al 100%):
    // Modifica este valor (ej. 0.50, 0.75, 0.85, 1.0) para ver inmediatamente el cambio de intensidad.
    OPACIDAD_IMAGEN_FONDO: 0.35,

    // Color/Gradiente de respaldo en caso de que la imagen tarde en cargar o no tenga conexión:
    GRADIENTE_RESPALDO: "linear-gradient(180deg, #140508 0%, #080203 100%)",

    // Factor de escala para descarga en Alta Resolución (3 = 300% de nitidez cristalina):
    ESCALA_EXPORTACION_PNG: 3,

    // Nombre por defecto del torneo si no está asignado:
    TORNEO_DEFECTO: "Torneo Oficial de Baloncesto",
  };

  /* ===================================================================================
   * 2. VINCULACIÓN AUTOMÁTICA DE LA HOJA DE ESTILOS "tarjeta.css"
   * ===================================================================================
   * Se asegura de que "tarjeta.css" esté vinculado al documento. Si no está en el HTML,
   * se inserta dinámicamente en el <head> para garantizar portabilidad inmediata.
   * =================================================================================== */
  function linkFlyerStyles() {
    // Verificar si ya existe el enlace directo o con ID
    if (
      document.getElementById("tarjeta-flyer-css-link") ||
      document.querySelector('link[href*="tarjeta.css"]')
    ) {
      return;
    }

    const link = document.createElement("link");
    link.id = "tarjeta-flyer-css-link";
    link.rel = "stylesheet";
    link.href = "tarjeta.css";
    document.head.appendChild(link);
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
            <!-- Capa con la Imagen de Fondo (Opacidad configurable) -->
            <div class="flyer-bg-image-layer" id="flyer-card-bg-image"></div>
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

    // Aplicar la imagen de fondo configurada y su opacidad real
    const bgImg = document.getElementById("flyer-card-bg-image");
    if (bgImg) {
      bgImg.style.backgroundImage = `url("${CONFIG_FLYER.IMAGEN_FONDO_FLYER}")`;
      bgImg.style.opacity = String(
        CONFIG_FLYER.OPACIDAD_IMAGEN_FONDO != null
          ? CONFIG_FLYER.OPACIDAD_IMAGEN_FONDO
          : 0.35,
      );
    }
    if (posterEl) {
      posterEl.style.background = CONFIG_FLYER.GRADIENTE_RESPALDO;
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
          <div class="flyer-tournament-name-row">
            <i class="fa-solid fa-trophy"></i>
            <span>${escapeText(tournName)}</span>
          </div>
          ${
            tournId
              ? `<div class="flyer-tournament-id-row"><span>ID: ${escapeText(tournId)}</span></div>`
              : ""
          }
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
              <i class="fa-solid fa-bolt flyer-vs-icon"></i>
              <span class="flyer-vs-text">VS</span>
              <i class="fa-solid fa-bolt flyer-vs-icon"></i>
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
              <span style="font-size: 0.72rem; color: #fecdd3; font-weight: 700; width: 100%;"><i class="fa-solid fa-user-shield"></i> Cuerpo Técnico:</span>
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
  // Vincular estilos CSS inmediatamente
  linkFlyerStyles();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      linkFlyerStyles();
      ensureFlyerModalInDOM();
      setupMatchupClickListeners();
    });
  } else {
    ensureFlyerModalInDOM();
    setupMatchupClickListeners();
  }

  // Exponer API global de la tarjeta para llamadas externas o directas
  window.openGameFlyer = openGameFlyer;
  window.closeGameFlyer = closeFlyerModal;
  window.downloadFlyerPNG = downloadFlyerAsHighResPNG;
  window.TARJETA_FLYER_CONFIG = CONFIG_FLYER;
})();
