/**
 * =====================================================================================
 * ARCHIVO: HistoryGame.js
 * DESCRIPCIÓN: Controlador interactivo para HistoryGame.html - Consulta de Cartelera
 *              Publicada en la hoja "Game2" de Google Sheets y Servidor en la Nube.
 *              Réplica visual idéntica de la Cartelera de Enfrentamientos con
 *              autorización de Administrador requerida para "Cargar de Nube".
 * =====================================================================================
 */

(function () {
  "use strict";

  // =====================================================================================
  // 1. CONFIGURACIÓN PRINCIPAL DE GOOGLE APPS SCRIPT Y PERSISTENCIA NUBE (Game2)
  // =====================================================================================
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzPpCG9VBlMUW5vRvV5CiIfbvFtDgr0yAg-wzWBd4WJDbqgP02YLHZBAROiSfzVwS45Zg/exec";

  const SHEET_CONFIG = {
    TARGET_SHEET: "Game",
    CLOUD_SHEET: "Game",
  };

  const CLOUD_API_ENDPOINTS = {
    LOAD_MATCHUPS_URL: "/api/matchups",
  };

  const ADMIN_CREDENTIALS = {
    ADMIN_USER: "Oso",
    ADMIN_PASSWORD: "123456",
  };

  // =====================================================================================
  // 2. ESTADO GLOBAL DE LA CONSULTA DE HISTORIAL
  // =====================================================================================
  let historyMatchups = [];
  let currentFilterStatus = "todos";
  let currentFilterTournament = "";
  let currentSearchQuery = "";

  let pendingAdminAuthAction = null;
  let pendingAdminAuthCancel = null;

  // =====================================================================================
  // 3. INICIALIZACIÓN
  // =====================================================================================
  document.addEventListener("DOMContentLoaded", () => {
    setupAdminAuthModal();
    setupEventListeners();
    loadHistoryFromLocal();
    // Cargar automáticamente los enfrentamientos de Game2 al iniciar
    loadHistoryFromCloudServer(false);
  });

  // =====================================================================================
  // 4. CONFIGURACIÓN DE LISTENERS
  // =====================================================================================
  function setupEventListeners() {
    // ÚNICO BOTÓN: Cargar Cartelera de la Nube (Referencia a Hoja Game2) con protección de Administrador
    const btnReloadCloud = document.getElementById("btn-reload-cloud");
    if (btnReloadCloud) {
      btnReloadCloud.addEventListener("click", () => {
        requestAdminAccess(
          "Cargar Cartelera Publicada desde la Hoja Game2",
          () => {
            loadHistoryFromCloudServer(true);
          },
        );
      });
    }

    // Buscador en tiempo real
    const searchInput = document.getElementById("history-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        currentSearchQuery = e.target.value.trim().toLowerCase();
        renderHistoryList();
      });
    }

    // Selector de Torneos
    const tournSelect = document.getElementById("history-tournament-filter");
    if (tournSelect) {
      tournSelect.addEventListener("change", (e) => {
        currentFilterTournament = e.target.value;
        renderHistoryList();
      });
    }

    // Filtros por Estado (Todos, Programados, Finalizados, Pospuestos)
    const filterChips = document.querySelectorAll(".filter-chip-btn");
    filterChips.forEach((chip) => {
      chip.addEventListener("click", (e) => {
        filterChips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        currentFilterStatus = chip.getAttribute("data-status") || "todos";
        renderHistoryList();
      });
    });
  }

  // =====================================================================================
  // 5. MODAL DE AUTORIZACIÓN DE ADMINISTRADOR (Usuario: Oso, Contraseña: 123456)
  // =====================================================================================
  function requestAdminAccess(actionDescription, onSuccess, onCancel) {
    const modal = document.getElementById("admin-auth-modal");
    const userInput = document.getElementById("admin-username-input");
    const pwdInput = document.getElementById("admin-password-input");
    const errorBox = document.getElementById("admin-auth-error");

    if (!modal) {
      if (typeof onSuccess === "function") onSuccess();
      return;
    }

    pendingAdminAuthAction = onSuccess;
    pendingAdminAuthCancel = onCancel;

    if (userInput) userInput.value = "";
    if (pwdInput) pwdInput.value = "";
    if (errorBox) errorBox.style.display = "none";

    modal.classList.add("is-active");

    setTimeout(() => {
      if (userInput) userInput.focus();
    }, 100);
  }

  function closeAdminAuthModal(isCancelled = true) {
    const modal = document.getElementById("admin-auth-modal");
    if (modal) {
      modal.classList.remove("is-active");
    }
    if (isCancelled && typeof pendingAdminAuthCancel === "function") {
      pendingAdminAuthCancel();
    }
    pendingAdminAuthAction = null;
    pendingAdminAuthCancel = null;
  }

  function validateAdminCredentials() {
    const userInput = document.getElementById("admin-username-input");
    const pwdInput = document.getElementById("admin-password-input");
    const errorBox = document.getElementById("admin-auth-error");
    const errorText = document.getElementById("admin-auth-error-text");

    const enteredUser = userInput ? userInput.value.trim() : "";
    const enteredPwd = pwdInput ? pwdInput.value.trim() : "";

    if (
      enteredUser === ADMIN_CREDENTIALS.ADMIN_USER &&
      enteredPwd === ADMIN_CREDENTIALS.ADMIN_PASSWORD
    ) {
      if (errorBox) errorBox.style.display = "none";
      const actionToExecute = pendingAdminAuthAction;
      closeAdminAuthModal(false);
      showToast("Acceso de Administrador autorizado", "success");
      if (typeof actionToExecute === "function") {
        actionToExecute();
      }
    } else {
      if (errorBox) {
        if (errorText) {
          errorText.textContent =
            "Usuario o contraseña de administrador incorrectos.";
        }
        errorBox.style.display = "flex";
      }
      if (pwdInput) {
        pwdInput.value = "";
        pwdInput.focus();
      }
      showToast("Credenciales de administrador inválidas", "error");
    }
  }

  function setupAdminAuthModal() {
    const btnConfirm = document.getElementById("btn-confirm-admin-auth");
    const btnCancel = document.getElementById("btn-cancel-admin-auth");
    const btnClose = document.getElementById("btn-close-admin-modal");
    const backdrop = document.getElementById("admin-auth-backdrop");
    const userInput = document.getElementById("admin-username-input");
    const pwdInput = document.getElementById("admin-password-input");
    const btnTogglePwd = document.getElementById("btn-toggle-admin-pwd");
    const iconTogglePwd = document.getElementById("icon-toggle-pwd");

    if (btnConfirm) {
      btnConfirm.addEventListener("click", validateAdminCredentials);
    }
    if (btnCancel) {
      btnCancel.addEventListener("click", () => closeAdminAuthModal(true));
    }
    if (btnClose) {
      btnClose.addEventListener("click", () => closeAdminAuthModal(true));
    }
    if (backdrop) {
      backdrop.addEventListener("click", () => closeAdminAuthModal(true));
    }

    [userInput, pwdInput].forEach((input) => {
      if (input) {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            validateAdminCredentials();
          } else if (e.key === "Escape") {
            closeAdminAuthModal(true);
          }
        });
      }
    });

    if (btnTogglePwd && pwdInput && iconTogglePwd) {
      btnTogglePwd.addEventListener("click", () => {
        if (pwdInput.type === "password") {
          pwdInput.type = "text";
          iconTogglePwd.className = "fa-solid fa-eye-slash";
        } else {
          pwdInput.type = "password";
          iconTogglePwd.className = "fa-solid fa-eye";
        }
      });
    }
  }

  // =====================================================================================
  // 6. CARGA DE ENFRENTAMIENTOS PUBLICADOS DESDE LA NUBE (HOJA GAME2)
  // =====================================================================================
  async function loadHistoryFromCloudServer(userTriggered = false) {
    const btnReloadCloud = document.getElementById("btn-reload-cloud");
    const originalHtml = btnReloadCloud ? btnReloadCloud.innerHTML : "";

    if (userTriggered && btnReloadCloud) {
      btnReloadCloud.disabled = true;
      btnReloadCloud.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cargando...`;
    }

    updateCloudStatus("syncing", "Consultando Game2 en la nube...");

    let loadedMatchups = null;
    let fetchedSuccessfully = false;

    // 1. Intentar descargar desde la persistencia compartida del servidor
    try {
      const response = await fetch(
        `${CLOUD_API_ENDPOINTS.LOAD_MATCHUPS_URL}?t=${Date.now()}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.status === "success" && Array.isArray(data.matchups)) {
          loadedMatchups = data.matchups;
          fetchedSuccessfully = true;
        }
      }
    } catch (err) {
      console.warn(
        "[HistoryGame.js] API del servidor no disponible, intentando Google Apps Script:",
        err,
      );
    }

    // 2. Si no hubo datos del servidor o si se solicita, consultar a Google Apps Script ÚNICAMENTE en la hoja "Game2"
    if (!fetchedSuccessfully) {
      try {
        const gasUrl = `${SCRIPT_URL}?sheetName=${encodeURIComponent(
          SHEET_CONFIG.CLOUD_SHEET,
        )}&action=getGameMatchups&t=${Date.now()}`;
        const response = await fetch(gasUrl);
        if (response.ok) {
          const data = await response.json();
          if (
            data &&
            data.status === "success" &&
            Array.isArray(data.matchups)
          ) {
            loadedMatchups = data.matchups.map((m) => ({
              id: m.ID || m.id || `MATCH-${Date.now()}`,
              ID_Tournament:
                m.ID_Tournament || m.id_tournament || m.tournamentId || "",
              Tournament:
                m.Tournament || m.tournament || m.tournamentName || "",
              tournamentId:
                m.ID_Tournament || m.id_tournament || m.tournamentId || "",
              tournamentName:
                m.Tournament || m.tournament || m.tournamentName || "",
              gameTitle: m.TituloJuego || m.gameTitle || "JUEGO",
              gameTime: m.Hora || m.gameTime || "08:00 PM",
              gameDate: m.Fecha || m.gameDate || "",
              courtLocation: m.Cancha || m.courtLocation || "Cancha Principal",
              scoreA:
                parseInt(
                  m.Marcador_EquipoA != null ? m.Marcador_EquipoA : m.scoreA,
                  10,
                ) || 0,
              scoreB:
                parseInt(
                  m.Marcador_EquipoB != null ? m.Marcador_EquipoB : m.scoreB,
                  10,
                ) || 0,
              teamA_id: m.EquipoA_ID || m.teamA_id || "",
              teamA_name: m.EquipoA_Nombre || m.teamA_name || "Equipo A",
              teamA_code: m.EquipoA_Codigo || m.teamA_code || "",
              teamA_logo: m.EquipoA_Logo || m.teamA_logo || "",
              teamB_id: m.EquipoB_ID || m.teamB_id || "",
              teamB_name: m.EquipoB_Nombre || m.teamB_name || "Equipo B",
              teamB_code: m.EquipoB_Codigo || m.teamB_code || "",
              teamB_logo: m.EquipoB_Logo || m.teamB_logo || "",
              referee1_name: m.Arbitro1_Nombre || m.referee1_name || "",
              referee1_cedula: m.Arbitro1_Cedula || m.referee1_cedula || "",
              referee1_role: m.Arbitro1_Rol || m.referee1_role || "",
              referee1_photo: m.Arbitro1_Foto || m.referee1_photo || "",
              referee2_name: m.Arbitro2_Nombre || m.referee2_name || "",
              referee2_cedula: m.Arbitro2_Cedula || m.referee2_cedula || "",
              referee2_role: m.Arbitro2_Rol || m.referee2_role || "",
              referee2_photo: m.Arbitro2_Foto || m.referee2_photo || "",
              referee3_name: m.Arbitro3_Nombre || m.referee3_name || "",
              referee3_cedula: m.Arbitro3_Cedula || m.referee3_cedula || "",
              referee3_role: m.Arbitro3_Rol || m.referee3_role || "",
              referee3_photo: m.Arbitro3_Foto || m.referee3_photo || "",
              status: (
                m.Estatus ||
                m.Estado ||
                m.status ||
                "programado"
              ).toLowerCase(),
              notes: m.OBSERVACIONES || m.notes || "",
            }));
            fetchedSuccessfully = true;
          }
        }
      } catch (err) {
        console.warn(
          `[HistoryGame.js] Falló consulta a Google Apps Script (${SHEET_CONFIG.CLOUD_SHEET}):`,
          err,
        );
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (fetchedSuccessfully && Array.isArray(loadedMatchups)) {
      historyMatchups = loadedMatchups;
      saveHistoryToLocal();
      populateTournamentFilter();
      renderHistoryList();

      if (historyMatchups.length > 0) {
        updateCloudStatus(
          "success",
          `Cargados: ${historyMatchups.length} juegos de ${SHEET_CONFIG.CLOUD_SHEET} (${timeStr})`,
        );
        if (userTriggered) {
          showToast(
            `¡Cartelera cargada con éxito desde la nube (${SHEET_CONFIG.CLOUD_SHEET})! Se encontraron ${historyMatchups.length} juegos publicados.`,
            "success",
          );
        }
      } else {
        updateCloudStatus(
          "idle",
          `0 juegos en ${SHEET_CONFIG.CLOUD_SHEET} (${timeStr})`,
        );
        if (userTriggered) {
          showToast(
            `No hay enfrentamientos publicados en la hoja "${SHEET_CONFIG.CLOUD_SHEET}".`,
            "info",
          );
        }
      }
    } else {
      updateCloudStatus("idle", `Listo (${timeStr})`);
      if (userTriggered) {
        showToast(
          `No se pudo sincronizar con la hoja "${SHEET_CONFIG.CLOUD_SHEET}".`,
          "warning",
        );
      }
    }

    if (userTriggered && btnReloadCloud) {
      btnReloadCloud.disabled = false;
      btnReloadCloud.innerHTML =
        originalHtml ||
        `<i class="fa-solid fa-arrows-rotate"></i> Cargar Cartelera de la Nube`;
    }
  }

  function saveHistoryToLocal() {
    try {
      localStorage.setItem(
        "GAME_MATCHUPS_HISTORY_GAME2",
        JSON.stringify(historyMatchups),
      );
    } catch (e) {
      console.warn("[HistoryGame.js] Error al guardar en localStorage:", e);
    }
  }

  function loadHistoryFromLocal() {
    try {
      const stored = localStorage.getItem("GAME_MATCHUPS_HISTORY_GAME2");
      if (stored) {
        historyMatchups = JSON.parse(stored);
        if (Array.isArray(historyMatchups)) {
          populateTournamentFilter();
          renderHistoryList();
        }
      }
    } catch (e) {
      console.warn("[HistoryGame.js] Error al cargar de localStorage:", e);
    }
  }

  function updateCloudStatus(state, text) {
    const indicator = document.getElementById("cloud-sync-status-indicator");
    const textEl = document.getElementById("cloud-status-text");

    if (!indicator || !textEl) return;

    indicator.className = `cloud-sync-status-indicator status-${state}`;
    textEl.textContent = text;
  }

  // =====================================================================================
  // 7. POBLAR FILTRO DE TORNEOS DINÁMICAMENTE
  // =====================================================================================
  function populateTournamentFilter() {
    const select = document.getElementById("history-tournament-filter");
    if (!select) return;

    const tournamentsMap = new Map();

    historyMatchups.forEach((m) => {
      const tId = m.ID_Tournament || m.id_tournament || m.tournamentId || "";
      const tName = m.Tournament || m.tournament || m.tournamentName || "";

      if (tId || tName) {
        const key = tId || tName;
        if (!tournamentsMap.has(key)) {
          tournamentsMap.set(key, {
            id: tId,
            name: tName || "Torneo General",
          });
        }
      }
    });

    const previousValue = select.value;
    select.innerHTML = `<option value="">🏆 Todos los Torneos (${tournamentsMap.size > 0 ? tournamentsMap.size : "Todos"})</option>`;

    tournamentsMap.forEach((tourn) => {
      const opt = document.createElement("option");
      opt.value = tourn.id || tourn.name;
      opt.textContent = `${tourn.id ? tourn.id + " - " : ""}${tourn.name}`;
      select.appendChild(opt);
    });

    if (previousValue && tournamentsMap.has(previousValue)) {
      select.value = previousValue;
    }
  }

  // =====================================================================================
  // 8. RENDERIZADO DE LA CARTELERA PUBLICADA (RÉPLICA EXACTA DE GAME.HTML)
  // =====================================================================================
  function getFilteredHistoryList() {
    if (!Array.isArray(historyMatchups)) return [];

    return historyMatchups.filter((match) => {
      // 1. Filtro por Estado
      if (currentFilterStatus !== "todos") {
        const rawStatus = (
          match.status ||
          match.Estatus ||
          match.Estado ||
          "programado"
        ).toLowerCase();
        if (
          currentFilterStatus === "programado" &&
          rawStatus !== "programado"
        ) {
          return false;
        }
        if (
          currentFilterStatus === "finalizado" &&
          rawStatus !== "finalizado"
        ) {
          return false;
        }
        if (currentFilterStatus === "pospuesto" && rawStatus !== "pospuesto") {
          return false;
        }
      }

      // 2. Filtro por Torneo
      if (currentFilterTournament) {
        const mTournId = (
          match.ID_Tournament ||
          match.id_tournament ||
          match.tournamentId ||
          ""
        ).toLowerCase();
        const mTournName = (
          match.Tournament ||
          match.tournament ||
          match.tournamentName ||
          ""
        ).toLowerCase();
        const filterVal = currentFilterTournament.toLowerCase();

        if (mTournId !== filterVal && mTournName !== filterVal) {
          return false;
        }
      }

      // 3. Filtro por Texto de Búsqueda
      if (currentSearchQuery) {
        const searchPool = [
          match.gameTitle,
          match.id,
          match.teamA_name,
          match.teamA_code,
          match.teamB_name,
          match.teamB_code,
          match.courtLocation,
          match.gameDate,
          match.gameTime,
          match.ID_Tournament,
          match.Tournament,
          match.referee1_name,
          match.referee2_name,
          match.referee3_name,
          match.notes,
          match.Observaciones,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchPool.includes(currentSearchQuery)) {
          return false;
        }
      }

      return true;
    });
  }

  function renderHistoryList() {
    const container = document.getElementById("matchups-list-container");
    const countBadge = document.getElementById("matchups-count-badge");

    if (!container) return;

    // Aplicar filtros de búsqueda, estado y torneo
    const filtered = getFilteredHistoryList();

    if (countBadge) {
      countBadge.textContent = `${filtered.length} de ${historyMatchups.length} Juegos`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-matchups-box">
          <i class="fa-solid fa-trophy"></i>
          <h4>No se encontraron enfrentamientos publicados</h4>
          <p>
            ${
              historyMatchups.length === 0
                ? 'No hay registros en la hoja <strong>"Game2"</strong>. Usa el botón <strong>"Cargar Cartelera de la Nube"</strong> para consultar.'
                : "No hay juegos que coincidan con los filtros seleccionados."
            }
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = "";

    filtered.forEach((match, index) => {
      const card = document.createElement("div");
      card.className = "matchup-card-item";
      card.id = `history-matchup-${match.id}`;

      const scoreA = match.scoreA != null ? match.scoreA : 0;
      const scoreB = match.scoreB != null ? match.scoreB : 0;

      const rawStatus = (
        match.status ||
        match.Estatus ||
        match.Estado ||
        "programado"
      ).toLowerCase();
      const statusKey =
        rawStatus === "pospuesto" || rawStatus === "finalizado"
          ? rawStatus
          : "programado";
      const statusLabel =
        statusKey === "pospuesto"
          ? "Pospuesto"
          : statusKey === "finalizado"
            ? "Finalizado"
            : "Programado";

      const tournIdVal =
        match.ID_Tournament || match.id_tournament || match.tournamentId || "";
      const tournNameVal =
        match.Tournament || match.tournament || match.tournamentName || "";

      const hasReferees =
        match.referee1_name || match.referee2_name || match.referee3_name;

      const hasNotesOrCourt =
        match.notes || match.Observaciones || match.courtLocation;

      card.innerHTML = `
        <!-- Encabezado del Juego con ID, Título, Hora, Torneo y Fecha -->
        <div class="matchup-card-header">
          <span class="matchup-id-tag"><i class="fa-solid fa-hashtag"></i> ${escapeHtml(match.id)}</span>
          <div class="matchup-title-badge">
            <i class="fa-solid fa-basketball"></i>
            <span>${escapeHtml(match.gameTitle || `JUEGO ${index + 1}`)}</span>
          </div>
          <div class="matchup-time-badge">
            <i class="fa-regular fa-clock"></i>
            <span>${escapeHtml(match.gameTime || "08:00 PM")}</span>
          </div>
          ${
            tournIdVal || tournNameVal
              ? `
              <div class="matchup-tournament-badge" title="Torneo: ${escapeHtml(tournNameVal)} (${escapeHtml(tournIdVal)})">
                <i class="fa-solid fa-trophy"></i>
                <span class="matchup-tourn-id">${escapeHtml(tournIdVal)}</span>
                ${tournIdVal && tournNameVal ? `<span class="matchup-tourn-sep">-</span>` : ""}
                <span class="matchup-tourn-name">${escapeHtml(tournNameVal)}</span>
              </div>
              `
              : ""
          }
          <div class="matchup-date-badge">
            <i class="fa-regular fa-calendar"></i>
            <span>${escapeHtml(formatDate(match.gameDate))}</span>
          </div>
        </div>

        <!-- Cuerpo del Versus (Estilo Banner con Logos adyacentes al VS) -->
        <div class="matchup-card-body">
          <!-- Equipo A (Local): Info a la izquierda, Logo a la derecha (junto al VS) -->
          <div class="matchup-team side-a">
            <div class="matchup-team-info">
              <span class="matchup-team-tag local">LOCAL</span>
              <h5 class="matchup-team-name">${escapeHtml(match.teamA_name || "Equipo A")}</h5>
              <div class="matchup-team-meta">
                <span><i class="fa-solid fa-fingerprint"></i> ID: ${escapeHtml(match.teamA_id || "")}</span>
                ${match.teamA_code ? `<span><i class="fa-solid fa-barcode"></i> ${escapeHtml(match.teamA_code)}</span>` : ""}
              </div>
            </div>
            <div class="matchup-team-logo-wrap">
              ${
                match.teamA_logo
                  ? `<img src="${normalizeDriveImageUrl(match.teamA_logo)}" alt="${escapeHtml(match.teamA_name)}" class="team-mini-logo" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="window.handleTeamLogoError(this, '${extractDriveFileId(match.teamA_logo)}', 'a', 1);" />`
                  : `<div class="mini-placeholder side-a"><i class="fa-solid fa-shield-halved"></i></div>`
              }
            </div>
          </div>

          <!-- Centro VS con Emblema, Marcador y Estatus -->
          <div class="matchup-vs-center">
            <div class="mini-vs-spark">
              <i class="fa-solid fa-basketball vs-ball-left"></i>
              <span class="vs-glow-text">VS</span>
              <i class="fa-solid fa-basketball vs-ball-right"></i>
            </div>
            <div class="matchup-score-display-box" title="Marcador de puntuación">
              <span class="score-pill-val score-a">${scoreA}</span>
              <span class="score-pill-sep">-</span>
              <span class="score-pill-val score-b">${scoreB}</span>
            </div>
            <div class="game-status-pill status-${statusKey}" title="Estatus del juego: ${statusLabel}">
              <span class="status-dot"></span>
              <span class="status-label">${statusLabel.toUpperCase()}</span>
            </div>
          </div>

          <!-- Equipo B (Visitante): Logo a la izquierda (junto al VS), Info a la derecha -->
          <div class="matchup-team side-b">
            <div class="matchup-team-logo-wrap">
              ${
                match.teamB_logo
                  ? `<img src="${normalizeDriveImageUrl(match.teamB_logo)}" alt="${escapeHtml(match.teamB_name)}" class="team-mini-logo" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="window.handleTeamLogoError(this, '${extractDriveFileId(match.teamB_logo)}', 'b', 1);" />`
                  : `<div class="mini-placeholder side-b"><i class="fa-solid fa-shield-halved"></i></div>`
              }
            </div>
            <div class="matchup-team-info text-right">
              <span class="matchup-team-tag visitor">VISITANTE</span>
              <h5 class="matchup-team-name">${escapeHtml(match.teamB_name || "Equipo B")}</h5>
              <div class="matchup-team-meta">
                <span><i class="fa-solid fa-fingerprint"></i> ID: ${escapeHtml(match.teamB_id || "")}</span>
                ${match.teamB_code ? `<span><i class="fa-solid fa-barcode"></i> ${escapeHtml(match.teamB_code)}</span>` : ""}
              </div>
            </div>
          </div>
        </div>

        <!-- Fila de Árbitros Asignados -->
        ${
          hasReferees
            ? `
          <div class="matchup-referees-strip">
            <span class="ref-strip-title"><i class="fa-solid fa-user-shield"></i> Árbitros:</span>
            ${match.referee1_name ? `<span class="ref-chip principal"><i class="fa-solid fa-whistle"></i> 1: ${escapeHtml(match.referee1_name)}</span>` : ""}
            ${match.referee2_name ? `<span class="ref-chip auxiliar"><i class="fa-solid fa-whistle"></i> 2: ${escapeHtml(match.referee2_name)}</span>` : ""}
            ${match.referee3_name ? `<span class="ref-chip mesa"><i class="fa-solid fa-whistle"></i> 3: ${escapeHtml(match.referee3_name)}</span>` : ""}
          </div>
          `
            : ""
        }

        <!-- Barra Inferior de Información (Cancha y Observaciones / Notas) -->
        ${
          hasNotesOrCourt
            ? `
          <div class="matchup-card-footer">
            <div class="matchup-notes-preview">
              ${match.courtLocation ? `<span class="court-location-chip"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(match.courtLocation)}</span>` : ""}
              ${match.notes || match.Observaciones ? `<span><i class="fa-solid fa-comment-dots"></i> ${escapeHtml(match.notes || match.Observaciones)}</span>` : ""}
            </div>
          </div>
          `
            : ""
        }
      `;

      container.appendChild(card);
    });
  }

  // =====================================================================================
  // 9. MANEJO DE IMÁGENES Y LOGOS DE GOOGLE DRIVE CON RESILIENCIA Y FALLBACK
  // =====================================================================================
  function extractDriveFileId(url) {
    if (!url || typeof url !== "string") return "";
    url = url.trim();

    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/i);
    if (idMatch && idMatch[1]) return idMatch[1];

    const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (dMatch && dMatch[1]) return dMatch[1];

    const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})/i);
    if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

    if (/^[a-zA-Z0-9_-]{20,50}$/.test(url)) {
      return url;
    }

    return "";
  }

  function normalizeDriveImageUrl(url) {
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

    const fileId = extractDriveFileId(url);
    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }

    return url;
  }

  function getDriveImageFallbackUrl(fileId, attempt) {
    if (!fileId) return "";
    switch (attempt) {
      case 1:
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
      case 2:
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      case 3:
        return `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
      case 4:
        return `https://docs.google.com/uc?id=${fileId}&export=download`;
      default:
        return "";
    }
  }

  window.handleTeamLogoError = function (
    imgElement,
    fileId,
    side,
    attempt = 1,
  ) {
    if (!imgElement) return;

    const nextUrl = getDriveImageFallbackUrl(fileId, attempt);
    if (nextUrl) {
      imgElement.onerror = function () {
        window.handleTeamLogoError(imgElement, fileId, side, attempt + 1);
      };
      imgElement.src = nextUrl;
      return;
    }

    const parentContainer = imgElement.parentElement;
    if (parentContainer) {
      parentContainer.innerHTML = `
        <div class="mini-placeholder side-${side}">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
      `;
    }
  };

  // =====================================================================================
  // 10. UTILIDADES Y NOTIFICACIONES TOAST
  // =====================================================================================
  function showToast(message, type = "info") {
    const msgContainer = document.getElementById("message");
    if (!msgContainer) return;

    const toast = document.createElement("div");
    const bgClass =
      type === "success"
        ? "is-success"
        : type === "error"
          ? "is-danger"
          : type === "warning"
            ? "is-warning"
            : "is-info";

    const iconClass =
      type === "success"
        ? "fa-circle-check"
        : type === "error"
          ? "fa-circle-exclamation"
          : type === "warning"
            ? "fa-triangle-exclamation"
            : "fa-circle-info";

    toast.className = `notification ${bgClass} is-light toast-notification`;
    toast.innerHTML = `
      <button class="delete" aria-label="close"></button>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <i class="fa-solid ${iconClass}" style="font-size: 1.25rem;"></i>
        <span>${escapeHtml(message)}</span>
      </div>
    `;

    const closeBtn = toast.querySelector(".delete");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => toast.remove());
    }

    msgContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 400);
      }
    }, 4500);
  }

  // Esta funcion es para darle formato a la fecha visualizada en la cartelera de enfrentamientos. el cual se especifica en "(formatDate(match.gameDate))"

  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);

    // Obtiene el día de la semana (ej: "miércoles")
    const weekday = date.toLocaleDateString("es-ES", {
      weekday: "long",
      timeZone: "UTC",
    });

    // Obtiene el resto de la fecha y reemplaza los conectores "de" por guiones
    const formattedDate = date
      .toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
      .replace(/ de /g, "-");

    return `${weekday}. ${formattedDate}`;
  }

  function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Exponer lista y métodos globalmente para Exportacion2.js
  window.getFilteredHistoryMatchups = function () {
    return getFilteredHistoryList();
  };
  window.getHistoryMatchups = function (onlyFiltered = true) {
    if (onlyFiltered) {
      return getFilteredHistoryList();
    }
    return Array.isArray(historyMatchups) ? [...historyMatchups] : [];
  };
  window.getAllHistoryMatchups = function () {
    return Array.isArray(historyMatchups) ? [...historyMatchups] : [];
  };
  window.getGameMatchups = window.getHistoryMatchups;
  window.getCurrentMatchups = window.getHistoryMatchups;
  window.historyMatchups = historyMatchups;
  window.formatHistoryGameDate = formatDate;
})();
