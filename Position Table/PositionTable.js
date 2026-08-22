/**
 * =====================================================================================
 * ARCHIVO: PositionTable.js
 * DESCRIPCIÓN: Controlador interactivo de la Tabla de Posiciones y Clasificación
 *              de Equipos basado en los enfrentamientos registrados en la hoja "Game".
 * =====================================================================================
 *
 * LÓGICA DE COMPUTACIÓN Y REGLAS:
 *  1. FILTRADO POR ESTATUS: Únicamente se computan los juegos con Estatus = "Finalizado".
 *  2. DEDUPLICACIÓN: Se evalúa el campo "ID" del juego para no contar partidos duplicados.
 *  3. CÁLCULO DE GANADOR Y PERDEDOR:
 *     - Se compara Marcador_EquipoA vs Marcador_EquipoB.
 *     - El de mayor puntuación suma +1 a JG (Juegos Ganados), sus puntos a PF y los del rival a PC.
 *     - El de menor puntuación suma +1 a JP (Juegos Perdidos), sus puntos a PF y los del rival a PC.
 *  4. TOTALIZADORES POR EQUIPO (EquipoA_ID / EquipoB_ID):
 *     - JJ = Juegos Jugados (JG + JP)
 *     - JG = Juegos Ganados
 *     - JP = Juegos Perdidos
 *     - PTOS = Puntos acumulados en la tabla (3 Puntos por cada Victoria JG)
 *     - PF = Puntos a Favor totales anotados
 *     - PC = Puntos en Contra totales recibidos
 *     - DIF = Diferencia de Puntos (PF - PC)
 *       * Si DIF > 0: Azul Neón
 *       * Si DIF < 0: Vinotinto Intenso
 *       * Si DIF = 0: Neutro
 *  5. FILTROS DINÁMICOS:
 *     - Selector de Torneo por ID_Tournament
 *     - Buscador en tiempo real por Nombre o ID del Equipo
 *  6. SEGURIDAD:
 *     - Botón "Cargar Cartelera de la Nube" con modal de Administrador (Oso / 123456)
 * =====================================================================================
 */

(function () {
  "use strict";

  // =====================================================================================
  // 1. CONFIGURACIÓN PRINCIPAL DE CONEXIÓN CON GOOGLE SHEETS Y PERSISTENCIA NUBE
  // =====================================================================================
  // [COMENTARIOS FIJOS EXPLÍCITOS DE CONFIGURACIÓN Y REFERENCIAS DE CAMPOS]:
  // 1. HOJA DE EQUIPOS / AFILIADOS: "Afiliados" (SHEET_CONFIG.AFILIADOS_SHEET)
  // 2. CAMPO CLAVE DE BÚSQUEDA:     "ID" (SHEET_CONFIG.AFILIADOS_KEY_COLUMN)
  // 3. CAMPOS RETORNADOS DE EQUIPO:
  //    - Nombre del Equipo:         "NombreCompleto" (o "Nombre")
  //    - Logo / Foto del Equipo:    "FileLink" (o "Foto", "Logo", "Avatar")
  //    - Identificador / ID:        "ID"
  // 4. HOJAS DE PARTIDOS / POSICIONES:
  //    - Hoja de Partidos:          "Game"
  //    - Hoja de Posiciones:        "PositionTable"
  // 5. SEGMENTOS DE RONDA ELIMINATORIA:
  //    - "Octavos de finales"       (8 llaves = 16 equipos)
  //    - "Cuartos de finales"       (4 llaves = 8 equipos)
  //    - "Semifinal"                (2 llaves = 4 equipos)
  //    - "Final"                    (1 llave = 2 equipos)
  // =====================================================================================
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzIt0V4nTkhl8W99lZRlObZCyicyXpI7EW6ukD4jGNX8jFWY2lBOxdaROwCyLiP2xqnYA/exec";

  const SHEET_CONFIG = {
    AFILIADOS_SHEET: "Afiliados",
    AFILIADOS_KEY_COLUMN: "ID",
    TARGET_SHEET: "Game",
    CLOUD_SHEET: "Game",
    DESTINATION_SHEET: "PositionTable",
    PLAYOFFS_SHEET: "PlayOffs",
  };

  const CLOUD_API_ENDPOINTS = {
    LOAD_MATCHUPS_URL: "/api/matchups",
    SAVE_STANDINGS_URL: "/api/standings",
    BRACKET_URL: "/api/bracket",
  };

  const ADMIN_CREDENTIALS = {
    ADMIN_USER: "Oso",
    ADMIN_PASSWORD: "123456",
  };

  // =====================================================================================
  // 2. ESTADO GLOBAL DE ENFRENTAMIENTOS Y TABLA DE POSICIONES
  // =====================================================================================
  let rawMatchups = [];
  let currentSelectedTournament = "";
  let currentSearchQuery = "";
  let lastCalculatedStandings = [];
  let afiliadosCache = [];

  let pendingAdminAuthAction = null;
  let pendingAdminAuthCancel = null;

  // =====================================================================================
  // 3. INICIALIZACIÓN DEL CONTROLADOR
  // =====================================================================================
  document.addEventListener("DOMContentLoaded", () => {
    setupAdminAuthModal();
    setupEventListeners();
    setupBracketEventListeners();
    setupLoadBracketModalEvents();
    loadLocalMatchupsCache();
    // Carga automática inicial de la hoja Game
    loadMatchupsFromCloud(false);
    // Carga inicial del cuadro eliminatorio y precarga de Afiliados
    initBracketState();
    preloadAfiliadosList().then(() => {
      // Re-render si se cargaron logos de afiliados
      if (bracketState) renderBracket();
    });
    loadBracketState(null, false);
  });

  // =====================================================================================
  // 4. CONFIGURACIÓN DE EVENT LISTENERS
  // =====================================================================================
  function setupEventListeners() {
    // Botón 1: Recarga de la nube con protección de Administrador
    const btnReloadCloud = document.getElementById("btn-reload-cloud");
    if (btnReloadCloud) {
      btnReloadCloud.addEventListener("click", () => {
        requestAdminAccess(
          "Cargar y Sincronizar Enfrentamientos de la Hoja Game",
          () => {
            loadMatchupsFromCloud(true);
          },
        );
      });
    }

    // Botón 2: Enviar Datos de PositionTable a la Hoja PositionTable en la Nube con protección de Administrador
    const btnSendPositions = document.getElementById("btn-send-positions");
    if (btnSendPositions) {
      btnSendPositions.addEventListener("click", () => {
        requestAdminAccess(
          "Enviar y Guardar Tabla de Posiciones en la Hoja PositionTable",
          () => {
            sendStandingsToPositionTableCloud();
          },
        );
      });
    }

    // Selector de Torneo (ID_Tournament)
    const tournSelect = document.getElementById("tournament-filter");
    if (tournSelect) {
      tournSelect.addEventListener("change", (e) => {
        currentSelectedTournament = e.target.value;
        computeAndRenderStandings();
      });
    }

    // Buscador en tiempo real
    const searchInput = document.getElementById("team-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        currentSearchQuery = e.target.value.trim().toLowerCase();
        computeAndRenderStandings();
      });
    }
  }

  // =====================================================================================
  // 5. MODAL DE AUTORIZACIÓN DE ADMINISTRADOR (Usuario: Oso, Contraseña: 123456)
  // =====================================================================================
  function requestAdminAccess(actionDescription, onSuccess, onCancel) {
    const modal = document.getElementById("admin-auth-modal");
    const userInput = document.getElementById("admin-username-input");
    const pwdInput = document.getElementById("admin-password-input");
    const errorBox = document.getElementById("admin-auth-error");
    const instr = modal ? modal.querySelector(".admin-auth-instruction") : null;

    if (!modal) {
      if (typeof onSuccess === "function") onSuccess();
      return;
    }

    pendingAdminAuthAction = onSuccess;
    pendingAdminAuthCancel = onCancel;

    if (userInput) userInput.value = "";
    if (pwdInput) pwdInput.value = "";
    if (errorBox) errorBox.style.display = "none";
    if (instr) {
      instr.innerHTML = actionDescription
        ? `<strong>${escapeHtml(actionDescription)}</strong><br>Por favor ingrese sus credenciales de administrador para continuar:`
        : `Esta acción requiere autorización. Por favor ingrese sus credenciales de administrador para continuar:`;
    }

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
    }
  }

  // =====================================================================================
  // 5.1 CONTROL DE BLOQUEO / DESBLOQUEO DE EDICIÓN DEL CUADRO DE PLAYOFFS
  // =====================================================================================
  let isBracketEditingUnlocked = false;

  /**
   * Actualiza el estado visual y funcional del bloqueo del bracket
   */
  function setBracketUnlockState(unlocked, showNotification = true) {
    isBracketEditingUnlocked = !!unlocked;

    const btnUnlock = document.getElementById("btn-unlock-bracket");
    const iconLock = document.getElementById("icon-bracket-lock");
    const textLock = document.getElementById("text-bracket-lock");
    const bracketBoard = document.querySelector(".bracket-board-card");

    const finalDate = document.getElementById("final-event-date");
    const finalVenue = document.getElementById("final-event-venue");
    const finalCity = document.getElementById("final-event-city");

    if (btnUnlock) {
      if (isBracketEditingUnlocked) {
        btnUnlock.classList.add("is-unlocked");
        if (iconLock) iconLock.className = "fa-solid fa-lock-open";
        if (textLock) textLock.textContent = "Bloquear Edición";
        btnUnlock.title =
          "Edición de PlayOffs habilitada. Clic para volver a bloquear el cuadro.";
      } else {
        btnUnlock.classList.remove("is-unlocked");
        if (iconLock) iconLock.className = "fa-solid fa-lock";
        if (textLock) textLock.textContent = "Desbloquear Edición";
        btnUnlock.title =
          "Desbloquear edición del cuadro de PlayOffs con credenciales de administrador (Usuario y Contraseña)";
      }
    }

    if (bracketBoard) {
      if (isBracketEditingUnlocked) {
        bracketBoard.classList.add("is-unlocked");
        bracketBoard.classList.remove("is-locked");
      } else {
        bracketBoard.classList.remove("is-unlocked");
        bracketBoard.classList.add("is-locked");
      }
    }

    [finalDate, finalVenue, finalCity].forEach((el) => {
      if (el) {
        el.setAttribute(
          "contenteditable",
          isBracketEditingUnlocked ? "true" : "false",
        );
      }
    });

    if (showNotification) {
      if (isBracketEditingUnlocked) {
        showToast(
          "¡Modo de edición del cuadro de PlayOffs desbloqueado!",
          "success",
        );
      } else {
        showToast("Edición del cuadro de PlayOffs bloqueada", "info");
      }
    }
  }

  /**
   * Helper para verificar si la edición del bracket está desbloqueada antes de realizar cualquier cambio.
   * Si está bloqueada, solicita la autorización del administrador (Oso / 123456) utilizando el mismo tema modal.
   */
  function requireBracketUnlocked(
    actionCallback,
    actionName = "Editar Cuadro de PlayOffs",
  ) {
    if (isBracketEditingUnlocked) {
      if (typeof actionCallback === "function") actionCallback();
      return;
    }

    requestAdminAccess(`Desbloquear Cuadro de PlayOffs • ${actionName}`, () => {
      setBracketUnlockState(true, true);
      if (typeof actionCallback === "function") actionCallback();
    });
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

    if (btnConfirm)
      btnConfirm.addEventListener("click", validateAdminCredentials);
    if (btnCancel)
      btnCancel.addEventListener("click", () => closeAdminAuthModal(true));
    if (btnClose)
      btnClose.addEventListener("click", () => closeAdminAuthModal(true));
    if (backdrop)
      backdrop.addEventListener("click", () => closeAdminAuthModal(true));

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
  // 6. CARGA DE DATOS DESDE LA NUBE (HOJA "GAME" Y SERVIDOR LOCAL/COMPARTIDO)
  // =====================================================================================
  async function loadMatchupsFromCloud(userTriggered = false) {
    const btnReloadCloud = document.getElementById("btn-reload-cloud");
    const originalHtml = btnReloadCloud ? btnReloadCloud.innerHTML : "";

    if (userTriggered && btnReloadCloud) {
      btnReloadCloud.disabled = true;
      btnReloadCloud.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cargando...`;
    }

    updateCloudStatus("syncing", "Consultando hoja Game...");

    let loadedList = null;
    let fetchedSuccessfully = false;

    // 1. Intentar desde persistencia compartida del servidor
    try {
      const response = await fetch(
        `${CLOUD_API_ENDPOINTS.LOAD_MATCHUPS_URL}?t=${Date.now()}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (
          data &&
          data.status === "success" &&
          Array.isArray(data.matchups) &&
          data.matchups.length > 0
        ) {
          loadedList = data.matchups;
          fetchedSuccessfully = true;
        }
      }
    } catch (err) {
      console.warn(
        "[PositionTable.js] API del servidor no disponible, intentando Google Apps Script:",
        err,
      );
    }

    // 2. Consultar a Google Apps Script en la hoja "Game"
    if (!fetchedSuccessfully) {
      try {
        const gasUrl = `${SCRIPT_URL}?sheetName=${encodeURIComponent(SHEET_CONFIG.CLOUD_SHEET)}&action=getGameMatchups&t=${Date.now()}`;
        const response = await fetch(gasUrl);
        if (response.ok) {
          const data = await response.json();
          if (
            data &&
            data.status === "success" &&
            Array.isArray(data.matchups)
          ) {
            loadedList = data.matchups.map(normalizeMatchupObject);
            fetchedSuccessfully = true;
          }
        }
      } catch (err) {
        console.warn(
          `[PositionTable.js] Falló consulta a Google Apps Script (${SHEET_CONFIG.CLOUD_SHEET}):`,
          err,
        );
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (fetchedSuccessfully && Array.isArray(loadedList)) {
      rawMatchups = loadedList.map(normalizeMatchupObject);
      saveLocalMatchupsCache();
      populateTournamentSelect();
      computeAndRenderStandings();

      updateCloudStatus(
        "success",
        `Sincronizado: ${rawMatchups.length} juegos (${timeStr})`,
      );

      if (userTriggered) {
        showToast(
          `¡Datos cargados con éxito de la hoja ${SHEET_CONFIG.CLOUD_SHEET}! Se analizaron ${rawMatchups.length} enfrentamientos.`,
          "success",
        );
      }
    } else {
      updateCloudStatus("idle", `Listo (${timeStr})`);
      if (userTriggered) {
        showToast(
          `No se pudo sincronizar con la hoja "${SHEET_CONFIG.CLOUD_SHEET}". Usando datos locales.`,
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

  // Normalizar estructura de enfrentamientos de diferentes orígenes (Sheets, Server, localStorage)
  function normalizeMatchupObject(m) {
    const scoreA =
      parseInt(
        m.Marcador_EquipoA != null
          ? m.Marcador_EquipoA
          : m.scoreA != null
            ? m.scoreA
            : 0,
        10,
      ) || 0;
    const scoreB =
      parseInt(
        m.Marcador_EquipoB != null
          ? m.Marcador_EquipoB
          : m.scoreB != null
            ? m.scoreB
            : 0,
        10,
      ) || 0;

    const statusVal = String(
      m.Estatus || m.Estado || m.status || "programado",
    ).trim();

    return {
      id: String(m.ID || m.id || `MATCH-${Date.now()}`),
      tournamentId: String(
        m.ID_Tournament || m.id_tournament || m.tournamentId || "TMT-00001",
      ).trim(),
      tournamentName: String(
        m.Tournament || m.tournament || m.tournamentName || "Torneo General",
      ).trim(),
      gameTitle: String(m.TituloJuego || m.gameTitle || "JUEGO"),
      gameDate: m.Fecha || m.gameDate || "",
      scoreA: scoreA,
      scoreB: scoreB,
      teamA_id: String(m.EquipoA_ID || m.teamA_id || "").trim(),
      teamA_name: String(m.EquipoA_Nombre || m.teamA_name || "Equipo A").trim(),
      teamA_code: String(m.EquipoA_Codigo || m.teamA_code || "").trim(),
      teamA_logo: m.EquipoA_Logo || m.teamA_logo || "",
      teamB_id: String(m.EquipoB_ID || m.teamB_id || "").trim(),
      teamB_name: String(m.EquipoB_Nombre || m.teamB_name || "Equipo B").trim(),
      teamB_code: String(m.EquipoB_Codigo || m.teamB_code || "").trim(),
      teamB_logo: m.EquipoB_Logo || m.teamB_logo || "",
      status: statusVal,
      isFinalizado: statusVal.toLowerCase() === "finalizado",
    };
  }

  function loadLocalMatchupsCache() {
    try {
      const storedGame = localStorage.getItem("GAME_MATCHUPS_LIST");
      const storedHistory = localStorage.getItem("GAME_MATCHUPS_HISTORY_GAME2");
      const chosen = storedGame || storedHistory;
      if (chosen) {
        const parsed = JSON.parse(chosen);
        if (Array.isArray(parsed) && parsed.length > 0) {
          rawMatchups = parsed.map(normalizeMatchupObject);
          populateTournamentSelect();
          computeAndRenderStandings();
        }
      }
    } catch (e) {
      console.warn("[PositionTable.js] Error al cargar caché local:", e);
    }
  }

  function saveLocalMatchupsCache() {
    try {
      localStorage.setItem(
        "GAME_MATCHUPS_POSITIONS_CACHE",
        JSON.stringify(rawMatchups),
      );
    } catch (e) {
      console.warn("[PositionTable.js] Error al guardar en localStorage:", e);
    }
  }

  // =====================================================================================
  // 7. POBLAR SELECTOR DE TORNEOS (ID_TOURNAMENT)
  // =====================================================================================
  function populateTournamentSelect() {
    const select = document.getElementById("tournament-filter");
    if (!select) return;

    const tournamentsMap = new Map();

    rawMatchups.forEach((m) => {
      if (m.tournamentId) {
        if (!tournamentsMap.has(m.tournamentId)) {
          tournamentsMap.set(
            m.tournamentId,
            m.tournamentName || m.tournamentId,
          );
        }
      }
    });

    const previousValue = select.value;
    select.innerHTML = `<option value="">🏆 Todos los Torneos Registrados</option>`;

    tournamentsMap.forEach((name, id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `🏆 ${id} - ${name}`;
      select.appendChild(opt);
    });

    if (previousValue && tournamentsMap.has(previousValue)) {
      select.value = previousValue;
      currentSelectedTournament = previousValue;
    }
  }

  // =====================================================================================
  // 8. MOTOR DE CÁLCULO DE TABLA DE POSICIONES (STANDINGS ENGINE)
  // =====================================================================================
  function computeAndRenderStandings() {
    // 1. Filtrar enfrentamientos por deduplicación de ID y Estatus "Finalizado"
    const uniqueMatchIds = new Set();
    let eligibleMatches = [];

    rawMatchups.forEach((m) => {
      if (!m.id || uniqueMatchIds.has(m.id)) return;
      uniqueMatchIds.add(m.id);

      // Criterio estricto: Solo estatus que digan "Finalizado"
      if (!m.isFinalizado) return;

      // Filtro opcional por ID_Tournament
      if (
        currentSelectedTournament &&
        m.tournamentId !== currentSelectedTournament
      ) {
        return;
      }

      eligibleMatches.push(m);
    });

    // 2. Mapeo acumulativo de estadísticas por equipo (identificados por ID del equipo)
    const teamsMap = new Map();

    function getOrCreateTeamRecord(teamId, teamName, teamCode, teamLogo) {
      const cleanId = teamId || `TEMP-${teamName}`;
      if (!teamsMap.has(cleanId)) {
        teamsMap.set(cleanId, {
          id: cleanId,
          name: teamName || "Equipo Desconocido",
          code: teamCode || "",
          logo: teamLogo || "",
          jj: 0, // Juegos Jugados
          jg: 0, // Juegos Ganados
          jp: 0, // Juegos Perdidos
          ptos: 0, // Puntos en la tabla (3 pts por victoria)
          pf: 0, // Puntos a Favor
          pc: 0, // Puntos en Contra
          dif: 0, // Diferencia de Puntos (PF - PC)
        });
      }
      const existing = teamsMap.get(cleanId);
      // Mantener el mejor logo o código si llega en otro partido
      if (!existing.logo && teamLogo) existing.logo = teamLogo;
      if (!existing.code && teamCode) existing.code = teamCode;
      if (teamName && existing.name === "Equipo Desconocido")
        existing.name = teamName;
      return existing;
    }

    // 3. Procesar cada enfrentamiento finalizado
    eligibleMatches.forEach((match) => {
      const teamA = getOrCreateTeamRecord(
        match.teamA_id,
        match.teamA_name,
        match.teamA_code,
        match.teamA_logo,
      );

      const teamB = getOrCreateTeamRecord(
        match.teamB_id,
        match.teamB_name,
        match.teamB_code,
        match.teamB_logo,
      );

      const scoreA = Number(match.scoreA) || 0;
      const scoreB = Number(match.scoreB) || 0;

      // Sumar Puntos a Favor y Puntos en Contra
      teamA.pf += scoreA;
      teamA.pc += scoreB;
      teamB.pf += scoreB;
      teamB.pc += scoreA;

      // Comparación de ganador y perdedor
      if (scoreA > scoreB) {
        // Equipo A Ganador
        teamA.jg += 1;
        teamB.jp += 1;
      } else if (scoreB > scoreA) {
        // Equipo B Ganador
        teamB.jg += 1;
        teamA.jp += 1;
      } else {
        // Empate (si ocurriese)
        // Ambos computan partido pero sin victoria
      }

      // Juegos Jugados
      teamA.jj = teamA.jg + teamA.jp;
      teamB.jj = teamB.jg + teamB.jp;
    });

    // 4. Calcular PTOS (3 por JG) y DIF (PF - PC) para cada equipo
    let standingsList = Array.from(teamsMap.values()).map((team) => {
      team.ptos = team.jg * 3; // 3 puntos por cada victoria
      team.dif = team.pf - team.pc; // Diferencia de puntos
      return team;
    });

    // 5. Ordenamiento jerárquico de posiciones:
    //    1º PTOS (Puntos) descendente
    //    2º DIF (Diferencia de puntos) descendente
    //    3º PF (Puntos a favor) descendente
    //    4º PC (Puntos en contra) ascendente
    //    5º Nombre del equipo alfabético
    standingsList.sort((a, b) => {
      if (b.ptos !== a.ptos) return b.ptos - a.ptos;
      if (b.dif !== a.dif) return b.dif - a.dif;
      if (b.pf !== a.pf) return b.pf - a.pf;
      if (a.pc !== b.pc) return a.pc - b.pc;
      return a.name.localeCompare(b.name);
    });

    // 6. Asignar posiciones 1, 2, 3, 4...
    const currentTournMatch = currentSelectedTournament
      ? rawMatchups.find((m) => m.tournamentId === currentSelectedTournament)
      : null;
    const currentTournName = currentTournMatch
      ? currentTournMatch.tournamentName
      : currentSelectedTournament
        ? currentSelectedTournament
        : "Clasificación General";

    standingsList.forEach((team, index) => {
      team.position = index + 1;
      team.tournamentId = currentSelectedTournament || "TODOS";
      team.tournamentName = currentTournName;
    });

    // Guardar referencia en el estado global para envíos a la hoja PositionTable
    lastCalculatedStandings = standingsList;

    // 7. Filtrado por texto de búsqueda en tiempo real
    let displayList = standingsList;
    if (currentSearchQuery) {
      displayList = standingsList.filter((team) => {
        return (
          team.name.toLowerCase().includes(currentSearchQuery) ||
          team.id.toLowerCase().includes(currentSearchQuery) ||
          team.code.toLowerCase().includes(currentSearchQuery)
        );
      });
    }

    // 8. Actualizar métricas del resumen superior
    updateSummaryStrip(standingsList, eligibleMatches);

    // 9. Renderizar la tabla de posiciones en el DOM
    renderTableDOM(displayList, standingsList.length);
  }

  // =====================================================================================
  // 9. RENDERIZADO VISUAL DEL DOM DE LA TABLA
  // =====================================================================================
  function renderTableDOM(teams, totalTeams) {
    const tbody = document.getElementById("positions-tbody");
    const badgeCount = document.getElementById("teams-count-badge");

    if (badgeCount) {
      badgeCount.textContent = `${totalTeams} Equipos`;
    }

    if (!tbody) return;

    if (teams.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="table-loading-cell">
            <div class="table-empty-state">
              <i class="fa-solid fa-basketball fa-bounce"></i>
              <h4>No se encontraron enfrentamientos "Finalizados" para mostrar</h4>
              <p>Asegúrate de que los juegos en la hoja <strong>Game</strong> tengan estatus <strong>Finalizado</strong>.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = teams
      .map((team) => {
        // Medalla / Insignia de posición
        let posBadgeHtml = `<span class="pos-num">${team.position}</span>`;
        if (team.position === 1) {
          posBadgeHtml = `<span class="pos-rank-badge rank-1" title="1º Lugar - Campeón / Líder">1</span>`;
        } else if (team.position === 2) {
          posBadgeHtml = `<span class="pos-rank-badge rank-2" title="2º Lugar - Subcampeón">2</span>`;
        } else if (team.position === 3) {
          posBadgeHtml = `<span class="pos-rank-badge rank-3" title="3º Lugar">3</span>`;
        }

        // Formato de Diferencia de Puntos (DIF)
        let difClass = "dif-neutral";
        let difDisplay = `${team.dif}`;

        if (team.dif > 0) {
          difClass = "dif-positive";
          difDisplay = `+${team.dif}`;
        } else if (team.dif < 0) {
          difClass = "dif-negative";
          difDisplay = `${team.dif}`;
        }

        // Renderizado del Logo grande
        const logoHtml = team.logo
          ? `<img src="${team.logo}" alt="${escapeHtml(team.name)}" class="team-logo-img" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\\'fa-solid fa-basketball team-logo-fallback\\\'></i>';" />`
          : `<i class="fa-solid fa-basketball team-logo-fallback"></i>`;

        return `
          <tr class="team-standing-row" data-team-id="${escapeHtml(team.id)}">
            <!-- 1. POS -->
            <td class="pos-cell text-center">
              ${posBadgeHtml}
            </td>

            <!-- 2. EQUIPO (LOGO GRANDE + NOMBRE + ID) -->
            <td class="team-cell">
              <div class="team-flex-container">
                <div class="team-logo-box">
                  ${logoHtml}
                </div>
                <div class="team-text-group">
                  <h4 class="team-name-title">${escapeHtml(team.name)}</h4>
                  <div class="team-sub-meta">
                    <span class="team-id-chip"><i class="fa-solid fa-id-badge"></i> ${escapeHtml(team.id)}</span>
                    ${team.code ? `<span class="team-id-chip">${escapeHtml(team.code)}</span>` : ""}
                  </div>
                </div>
              </div>
            </td>

            <!-- 3. JJ (Juegos Jugados) -->
            <td class="stat-cell text-center">
              <span class="stat-val">${team.jj}</span>
            </td>

            <!-- 4. JG (Juegos Ganados) -->
            <td class="stat-cell text-center">
              <span class="stat-val text-green">${team.jg}</span>
            </td>

            <!-- 5. JP (Juegos Perdidos) -->
            <td class="stat-cell text-center">
              <span class="stat-val text-red">${team.jp}</span>
            </td>

            <!-- 6. PTOS (Puntos con columna neón vertical destacada) -->
            <td class="ptos-cell text-center">
              <span class="ptos-val">${team.ptos}</span>
            </td>

            <!-- 7. PF (Puntos a Favor Anotados) -->
            <td class="stat-cell text-center">
              <span class="stat-val">${team.pf}</span>
            </td>

            <!-- 8. PC (Puntos en Contra Recibidos) -->
            <td class="stat-cell text-center">
              <span class="stat-val">${team.pc}</span>
            </td>

            <!-- 9. DIF (Diferencia de Puntos: Azul si es >0, Vinotinto si es <0) -->
            <td class="dif-cell text-center">
              <span class="dif-val ${difClass}">${difDisplay}</span>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  // =====================================================================================
  // 10. RESUMEN DEL TORNEO (CARDS)
  // =====================================================================================
  function updateSummaryStrip(standingsList, eligibleMatches) {
    const elTourn = document.getElementById("summary-tourn-name");
    const elTeams = document.getElementById("summary-teams-count");
    const elGames = document.getElementById("summary-games-count");
    const elLeader = document.getElementById("summary-leader-name");

    if (elTourn) {
      if (currentSelectedTournament) {
        const match = rawMatchups.find(
          (m) => m.tournamentId === currentSelectedTournament,
        );
        elTourn.textContent = match
          ? `${match.tournamentName} (${match.tournamentId})`
          : currentSelectedTournament;
      } else {
        elTourn.textContent = "Todos los Torneos";
      }
    }

    if (elTeams) elTeams.textContent = `${standingsList.length}`;
    if (elGames) elGames.textContent = `${eligibleMatches.length}`;

    if (elLeader) {
      if (standingsList.length > 0) {
        const leader = standingsList[0];
        elLeader.textContent = `#1 ${leader.name} (${leader.ptos} Pts)`;
      } else {
        elLeader.textContent = "--";
      }
    }
  }

  // =====================================================================================
  // 11. ENVIAR DATOS A LA HOJA POSITIONTABLE EN LA NUBE (CON AUTORIZACIÓN ADMIN)
  // =====================================================================================
  async function sendStandingsToPositionTableCloud() {
    const btnSend = document.getElementById("btn-send-positions");
    const originalHtml = btnSend ? btnSend.innerHTML : "";

    if (!lastCalculatedStandings || lastCalculatedStandings.length === 0) {
      showToast(
        "No hay registros de posiciones calculados para enviar. Verifica que haya juegos con estatus 'Finalizado'.",
        "warning",
      );
      return;
    }

    if (btnSend) {
      btnSend.disabled = true;
      btnSend.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enviando...`;
    }

    updateCloudStatus(
      "syncing",
      `Guardando en ${SHEET_CONFIG.DESTINATION_SHEET}...`,
    );

    const selectedTournMatch = currentSelectedTournament
      ? rawMatchups.find((m) => m.tournamentId === currentSelectedTournament)
      : null;
    const tournamentName = selectedTournMatch
      ? selectedTournMatch.tournamentName
      : currentSelectedTournament
        ? currentSelectedTournament
        : "Clasificación General";

    // Preparar el paquete de datos estructurado EXACTAMENTE con los 9 encabezados de PositionTable.html
    const payload = {
      action: "savePositionTable",
      sheetName: SHEET_CONFIG.DESTINATION_SHEET,
      tournamentId: currentSelectedTournament || "TODOS",
      tournamentName: tournamentName,
      standings: lastCalculatedStandings.map((team, idx) => ({
        POS: team.position || idx + 1,
        EQUIPOS: team.name || "",
        JJ: Number(team.jj) || 0,
        JG: Number(team.jg) || 0,
        JP: Number(team.jp) || 0,
        PTOS: Number(team.ptos) || 0,
        PF: Number(team.pf) || 0,
        PC: Number(team.pc) || 0,
        DIF: Number(team.dif) || 0,
      })),
    };

    let sentSuccessfully = false;
    let errorMessage = "";

    // 1. Guardar en el servidor backend compartido (/api/standings)
    try {
      const serverRes = await fetch(CLOUD_API_ENDPOINTS.SAVE_STANDINGS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (serverRes.ok) {
        sentSuccessfully = true;
      }
    } catch (e) {
      console.warn(
        "[PositionTable.js] Falló guardado en API local del servidor:",
        e,
      );
    }

    // 2. Enviar a Google Apps Script para impactar directamente en Google Sheets (Hoja PositionTable)
    try {
      const gasRes = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      if (gasRes.ok) {
        const gasData = await gasRes.json().catch(() => null);
        if (gasData && gasData.status === "success") {
          sentSuccessfully = true;
        } else if (gasData && gasData.message) {
          errorMessage = gasData.message;
        }
      }
    } catch (gasErr) {
      console.warn(
        "[PositionTable.js] Falló envío directo a Google Apps Script:",
        gasErr,
      );
      if (!sentSuccessfully) {
        errorMessage = gasErr.message || "Error de red";
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (btnSend) {
      btnSend.disabled = false;
      btnSend.innerHTML =
        originalHtml ||
        `<i class="fa-solid fa-cloud-arrow-up"></i> Enviar Datos a PositionTable`;
    }

    if (sentSuccessfully) {
      updateCloudStatus(
        "success",
        `Guardado en ${SHEET_CONFIG.DESTINATION_SHEET} (${timeStr})`,
      );
      showToast(
        `¡Tabla de posiciones de ${lastCalculatedStandings.length} equipos enviada y guardada con éxito en la hoja "${SHEET_CONFIG.DESTINATION_SHEET}"!`,
        "success",
      );
    } else {
      updateCloudStatus("idle", `Error al enviar (${timeStr})`);
      showToast(
        `No se pudo enviar los datos a la hoja "${SHEET_CONFIG.DESTINATION_SHEET}": ${errorMessage || "Revisa la conexión o script"}`,
        "error",
      );
    }
  }

  // =====================================================================================
  // 12. UTILIDADES Y NOTIFICACIONES TOAST
  // =====================================================================================
  function updateCloudStatus(state, text) {
    const chip = document.getElementById("cloud-status-chip");
    if (!chip) return;

    if (state === "syncing") {
      chip.className = "config-chip purple";
      chip.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHtml(text)}`;
    } else if (state === "success") {
      chip.className = "config-chip emerald";
      chip.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHtml(text)}`;
    } else {
      chip.className = "config-chip orange";
      chip.innerHTML = `<i class="fa-solid fa-cloud"></i> ${escapeHtml(text)}`;
    }
  }

  function showToast(messageText, type = "info") {
    const container = document.getElementById("message");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `custom-game-toast toast-${type}`;

    let icon = "fa-circle-info";
    if (type === "success") icon = "fa-circle-check";
    if (type === "error") icon = "fa-triangle-exclamation";
    if (type === "warning") icon = "fa-triangle-exclamation";

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${escapeHtml(messageText)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 4500);
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // =====================================================================================
  // 13. MÓDULO DE RONDA ELIMINATORIA (BRACKET DE PLAYOFFS / EUROBASKET)
  // =====================================================================================
  // [COMENTARIOS FIJOS EXPLÍCITOS DE REFERENCIA A GOOGLE SHEETS]:
  // - HOJA CONSULTADA DE EQUIPOS: "Afiliados" (SHEET_CONFIG.AFILIADOS_SHEET)
  // - CAMPO CLAVE DE BÚSQUEDA:   "ID" (SHEET_CONFIG.AFILIADOS_KEY_COLUMN)
  // - CAMPOS RETORNADOS:
  //   * Nombre del Equipo:        "NombreCompleto" (o "Nombre", "nombre")
  //   * Logo / Foto del Equipo:   "FileLink" (o "Foto", "foto", "Logo", "logo", "Avatar")
  //   * Identificador del Equipo: "ID" (o "RIF")
  // - SEGMENTOS DISPONIBLES:
  //   * "Octavos de finales" (8 llaves = 16 equipos: 4 lado izquierdo, 4 lado derecho)
  //   * "Cuartos de finales" (4 llaves = 8 equipos: 2 lado izquierdo, 2 lado derecho)
  //   * "Semifinal"          (2 llaves = 4 equipos: 1 lado izquierdo, 1 lado derecho)
  //   * "Final"              (1 llave = 2 equipos finalistas)
  // =====================================================================================

  let bracketState = {
    format: "16", // "16" (Octavos), "8" (Cuartos), "4" (Semis), "2" (Final)
    date: "14 DE SEPTIEMBRE",
    venue: "ARENA RIGA",
    city: "Riga (Letonia)",
    champion: null,
    // 8 llaves de Octavos (0-3 Izquierda, 4-7 Derecha)
    octavos: [
      {
        id: "oct-1",
        label: "Octavos 1",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "oct-2",
        label: "Octavos 2",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "oct-3",
        label: "Octavos 3",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "oct-4",
        label: "Octavos 4",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "oct-5",
        label: "Octavos 5",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "oct-6",
        label: "Octavos 6",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "oct-7",
        label: "Octavos 7",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "oct-8",
        label: "Octavos 8",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
    ],
    // 4 llaves de Cuartos (0-1 Izquierda, 2-3 Derecha)
    cuartos: [
      {
        id: "qf-1",
        label: "Cuartos 1",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "qf-2",
        label: "Cuartos 2",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "qf-3",
        label: "Cuartos 3",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "qf-4",
        label: "Cuartos 4",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
    ],
    // 2 llaves de Semifinales (0 Izquierda, 1 Derecha)
    semis: [
      {
        id: "sf-1",
        label: "Semifinal 1",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
      {
        id: "sf-2",
        label: "Semifinal 2",
        teamA: null,
        teamB: null,
        scoreA: "",
        scoreB: "",
        winner: null,
      },
    ],
    // 1 llave de Final (Lado Izquierdo vs Lado Derecho)
    final: {
      id: "fin-1",
      label: "Gran Final",
      teamA: null,
      teamB: null,
      scoreA: "",
      scoreB: "",
      winner: null,
    },
  };

  // Variable para registrar el slot objetivo del modal de asignación
  let modalTargetSlot = {
    round: "octavos",
    matchIndex: 0,
    teamSide: "A",
  };

  let modalSelectedTeam = null;

  /**
   * Normalización de URLs de imágenes de Google Drive
   */
  function extractDriveFileId(url) {
    if (!url || typeof url !== "string") return "";
    url = url.trim();
    if (!url) return "";

    const m1 = url.match(/id=([a-zA-Z0-9_-]{15,})/);
    if (m1 && m1[1]) return m1[1];

    const m2 = url.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
    if (m2 && m2[1]) return m2[1];

    const m3 = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{15,})/);
    if (m3 && m3[1]) return m3[1];

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

  /**
   * Precarga en memoria la lista de la hoja "Afiliados"
   */
  async function preloadAfiliadosList() {
    try {
      const response = await fetch(
        `${SCRIPT_URL}?sheetName=${encodeURIComponent(SHEET_CONFIG.AFILIADOS_SHEET)}&action=getAll&keyColumn=ID&keyValue=all&t=${Date.now()}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.records && Array.isArray(data.records)) {
          afiliadosCache = data.records;
          renderQuickAffiliatesList();
        }
      }
    } catch (e) {
      console.warn("[PositionTable.js] Precarga de Afiliados silenciosa:", e);
    }
  }

  /**
   * Busca un equipo en la hoja "Afiliados" usando el campo "ID"
   */
  async function fetchTeamFromAfiliadosById(queryId) {
    const cleanId = String(queryId || "").trim();
    if (!cleanId) return null;

    // 1. Buscar primero en caché local si existe
    if (afiliadosCache && afiliadosCache.length > 0) {
      const match = afiliadosCache.find((r) => {
        const rId = String(r.ID || r.id || "").trim();
        const rRif = String(r.RIF || r.rif || "").trim();
        return (
          rId.toLowerCase() === cleanId.toLowerCase() ||
          rRif.toLowerCase() === cleanId.toLowerCase()
        );
      });

      if (match) {
        return normalizeAfiliadoRecord(match, cleanId);
      }
    }

    // 2. Consultar al Google Apps Script en vivo
    try {
      const url = `${SCRIPT_URL}?sheetName=${encodeURIComponent(
        SHEET_CONFIG.AFILIADOS_SHEET,
      )}&keyColumn=${encodeURIComponent(
        SHEET_CONFIG.AFILIADOS_KEY_COLUMN,
      )}&keyValue=${encodeURIComponent(cleanId)}&t=${Date.now()}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data && data.records && data.records.length > 0) {
          const rec = data.records[0];
          // Añadir a caché local
          afiliadosCache.push(rec);
          return normalizeAfiliadoRecord(rec, cleanId);
        }
      }
    } catch (err) {
      console.error(
        "[PositionTable.js] Error al consultar Afiliados por ID:",
        err,
      );
    }

    // 3. Fallback: Buscar en la tabla de posiciones calculada
    if (lastCalculatedStandings && lastCalculatedStandings.length > 0) {
      const stMatch = lastCalculatedStandings.find((s) => {
        return (
          String(s.id || "")
            .trim()
            .toLowerCase() === cleanId.toLowerCase() ||
          String(s.code || "")
            .trim()
            .toLowerCase() === cleanId.toLowerCase() ||
          String(s.name || "")
            .trim()
            .toLowerCase()
            .includes(cleanId.toLowerCase())
        );
      });
      if (stMatch) {
        return {
          id: stMatch.id,
          name: stMatch.name,
          logo: stMatch.logo,
          rawLogo: stMatch.logo,
        };
      }
    }

    return null;
  }

  function normalizeAfiliadoRecord(rec, fallbackId) {
    const fullName =
      rec.NombreCompleto ||
      rec.Nombre ||
      rec.nombre ||
      rec.teamName ||
      `Equipo ${fallbackId}`;

    const rawLogo =
      rec.FileLink ||
      rec.fileLink ||
      rec.FILE_LINK ||
      rec.Foto ||
      rec.foto ||
      rec.Logo ||
      rec.logo ||
      rec.Avatar ||
      rec.Imagen ||
      "";

    const normalizedLogo = normalizeDriveImageUrl(rawLogo);
    const teamId = rec.ID || rec.id || rec.RIF || rec.rif || fallbackId;

    return {
      id: teamId,
      name: fullName,
      logo: normalizedLogo,
      rawLogo: rawLogo,
    };
  }

  /**
   * Inicializa la estructura del bracket con datos por defecto
   */
  function initBracketState() {
    // Verificar si ya hay datos en localStorage o restaurar
    const stored = localStorage.getItem("KNOCKOUT_BRACKET_STATE");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          bracketState = { ...bracketState, ...parsed };
        }
      } catch (e) {
        console.warn(
          "[PositionTable.js] Error al parsear bracket de localStorage:",
          e,
        );
      }
    }
  }

  /**
   * Configura listeners de eventos para el bracket
   */
  function setupBracketEventListeners() {
    // Botón de Bloqueo / Desbloqueo de Edición con credenciales de administrador (Oso / 123456)
    const btnUnlock = document.getElementById("btn-unlock-bracket");
    if (btnUnlock) {
      btnUnlock.addEventListener("click", () => {
        if (!isBracketEditingUnlocked) {
          requestAdminAccess(
            "Desbloquear Edición del Cuadro de PlayOffs",
            () => {
              setBracketUnlockState(true, true);
            },
          );
        } else {
          setBracketUnlockState(false, true);
        }
      });
    }

    // Selector de formato
    const formatSelect = document.getElementById("bracket-format-select");
    if (formatSelect) {
      formatSelect.value = bracketState.format || "16";
      formatSelect.addEventListener("change", (e) => {
        const selectedFormat = e.target.value;
        const previousFormat = bracketState.format || "16";
        if (!isBracketEditingUnlocked) {
          formatSelect.value = previousFormat;
          requireBracketUnlocked(() => {
            bracketState.format = selectedFormat;
            formatSelect.value = selectedFormat;
            renderBracket();
            saveBracketState(false);
          }, "Cambiar Segmento Inicial del Torneo");
          return;
        }
        bracketState.format = selectedFormat;
        renderBracket();
        saveBracketState(false);
      });
    }

    // Botón abrir modal de asignación
    const btnOpenAssign = document.getElementById("btn-open-assign-modal");
    if (btnOpenAssign) {
      btnOpenAssign.addEventListener("click", () => {
        requireBracketUnlocked(() => {
          openBracketAssignModal("octavos", 0, "A");
        }, "Asignar Equipo por ID");
      });
    }

    // Botón sembrar desde tabla de posiciones
    const btnSeed = document.getElementById("btn-seed-from-standings");
    if (btnSeed) {
      btnSeed.addEventListener("click", () => {
        requireBracketUnlocked(() => {
          seedBracketFromStandings();
        }, "Sembrar desde Tabla de Posiciones");
      });
    }

    // Botón Cargar PlayOffs guardados por ID o Torneo
    const btnLoadBracket = document.getElementById("btn-load-bracket");
    if (btnLoadBracket) {
      btnLoadBracket.addEventListener("click", () => {
        openLoadBracketModal();
      });
    }

    // Botón guardar cuadro
    const btnSave = document.getElementById("btn-save-bracket");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        saveBracketState(true, true);
      });
    }

    // Botón exportar/descargar Imagen HD (PNG) del cuadro de PlayOffs
    const btnExportImage = document.getElementById("btn-export-image-bracket");
    if (btnExportImage) {
      btnExportImage.addEventListener("click", () => {
        exportBracketToImage();
      });
    }

    // Botón exportar/descargar PDF del cuadro de PlayOffs (Ajustado a 1 Sola Hoja)
    const btnExportPdf = document.getElementById("btn-export-pdf-bracket");
    if (btnExportPdf) {
      btnExportPdf.addEventListener("click", () => {
        exportBracketToPdf();
      });
    }

    // Botón limpiar / resetear cuadro
    const btnReset = document.getElementById("btn-reset-bracket");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        requireBracketUnlocked(() => {
          if (
            confirm(
              "¿Estás seguro de que deseas limpiar todos los equipos y resultados del cuadro eliminatorio?",
            )
          ) {
            resetBracketState();
          }
        }, "Limpiar Cuadro de PlayOffs");
      });
    }

    // Edición de fecha y sede de la final
    const finalDate = document.getElementById("final-event-date");
    if (finalDate) {
      finalDate.addEventListener("blur", () => {
        if (isBracketEditingUnlocked) {
          bracketState.date = finalDate.innerText.trim();
          saveBracketState(false);
        }
      });
      finalDate.addEventListener("click", () => {
        if (!isBracketEditingUnlocked) {
          requireBracketUnlocked(() => {
            finalDate.focus();
          }, "Editar Fecha de la Final");
        }
      });
    }

    const finalVenue = document.getElementById("final-event-venue");
    if (finalVenue) {
      finalVenue.addEventListener("blur", () => {
        if (isBracketEditingUnlocked) {
          bracketState.venue = finalVenue.innerText.trim();
          saveBracketState(false);
        }
      });
      finalVenue.addEventListener("click", () => {
        if (!isBracketEditingUnlocked) {
          requireBracketUnlocked(() => {
            finalVenue.focus();
          }, "Editar Sede / Arena de la Final");
        }
      });
    }

    const finalCity = document.getElementById("final-event-city");
    if (finalCity) {
      finalCity.addEventListener("blur", () => {
        if (isBracketEditingUnlocked) {
          bracketState.city = finalCity.innerText.trim();
          saveBracketState(false);
        }
      });
      finalCity.addEventListener("click", () => {
        if (!isBracketEditingUnlocked) {
          requireBracketUnlocked(() => {
            finalCity.focus();
          }, "Editar Ciudad de la Final");
        }
      });
    }

    // Inicializar estado bloqueado por defecto
    setBracketUnlockState(false, false);

    // Eventos del Modal de Asignación por ID
    setupAssignModalEvents();
  }

  /**
   * Configura eventos internos del modal de asignación
   */
  function setupAssignModalEvents() {
    const modal = document.getElementById("bracket-assign-modal");
    const btnClose = document.getElementById("btn-close-assign-modal");
    const btnCancel = document.getElementById("btn-modal-cancel-assign");
    const backdrop = document.getElementById("bracket-assign-backdrop");
    const btnSearch = document.getElementById("btn-modal-search-id");
    const idInput = document.getElementById("modal-team-id-input");
    const btnConfirm = document.getElementById("btn-modal-confirm-assign");
    const btnRemove = document.getElementById("btn-modal-remove-team");

    const roundSelect = document.getElementById("modal-select-round");
    const slotSelect = document.getElementById("modal-select-slot");

    const closeModal = () => {
      if (modal) modal.classList.remove("is-active");
    };

    if (btnClose) btnClose.addEventListener("click", closeModal);
    if (btnCancel) btnCancel.addEventListener("click", closeModal);
    if (backdrop) backdrop.addEventListener("click", closeModal);

    // Cambio en selector de ronda en el modal
    if (roundSelect) {
      roundSelect.addEventListener("change", (e) => {
        modalTargetSlot.round = e.target.value;
        populateModalSlotOptions();
      });
    }

    if (slotSelect) {
      slotSelect.addEventListener("change", (e) => {
        const val = e.target.value; // Formato: "0_A" o "0_B"
        const [mIdx, sSide] = val.split("_");
        modalTargetSlot.matchIndex = parseInt(mIdx, 10);
        modalTargetSlot.teamSide = sSide;
        updateModalTargetBanner();
      });
    }

    // Botón buscar ID en "Afiliados"
    if (btnSearch && idInput) {
      const executeSearch = async () => {
        const query = idInput.value.trim();
        if (!query) {
          showToast(
            "Ingrese un código ID de equipo para buscar en Afiliados",
            "warning",
          );
          return;
        }

        btnSearch.disabled = true;
        btnSearch.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Buscando...`;

        const team = await fetchTeamFromAfiliadosById(query);
        btnSearch.disabled = false;
        btnSearch.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Buscar ID`;

        if (team) {
          modalSelectedTeam = team;
          renderModalPreview(team);
          showToast(
            `Equipo encontrado: ${team.name} (ID: ${team.id})`,
            "success",
          );
        } else {
          modalSelectedTeam = null;
          renderModalPreviewNotFound(query);
          showToast(
            `No se encontró equipo con ID: "${query}" en la hoja Afiliados`,
            "error",
          );
        }
      };

      btnSearch.addEventListener("click", executeSearch);
      idInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          executeSearch();
        }
      });
    }

    // Botón confirmar asignación
    if (btnConfirm) {
      btnConfirm.addEventListener("click", () => {
        if (!modalSelectedTeam) {
          showToast(
            "Por favor busque y seleccione un equipo válido primero",
            "warning",
          );
          return;
        }

        assignTeamToSlot(
          modalTargetSlot.round,
          modalTargetSlot.matchIndex,
          modalTargetSlot.teamSide,
          modalSelectedTeam,
        );

        closeModal();
        showToast(
          `Equipo "${modalSelectedTeam.name}" asignado con éxito a la casilla seleccionada`,
          "success",
        );
      });
    }

    // Botón quitar equipo de la casilla
    if (btnRemove) {
      btnRemove.addEventListener("click", () => {
        assignTeamToSlot(
          modalTargetSlot.round,
          modalTargetSlot.matchIndex,
          modalTargetSlot.teamSide,
          null,
        );

        closeModal();
        showToast("Equipo removido de la casilla", "info");
      });
    }
  }

  /**
   * Abre el modal de asignación fijando la ronda, llave y lado
   */
  function openBracketAssignModal(round, matchIndex, teamSide) {
    const modal = document.getElementById("bracket-assign-modal");
    if (!modal) return;

    modalTargetSlot = { round, matchIndex, teamSide };

    const roundSelect = document.getElementById("modal-select-round");
    if (roundSelect) roundSelect.value = round;

    populateModalSlotOptions();
    updateModalTargetBanner();

    // Obtener equipo actual en la casilla si existe
    let currentTeam = null;
    if (round === "octavos" && bracketState.octavos[matchIndex]) {
      currentTeam =
        teamSide === "A"
          ? bracketState.octavos[matchIndex].teamA
          : bracketState.octavos[matchIndex].teamB;
    } else if (round === "cuartos" && bracketState.cuartos[matchIndex]) {
      currentTeam =
        teamSide === "A"
          ? bracketState.cuartos[matchIndex].teamA
          : bracketState.cuartos[matchIndex].teamB;
    } else if (round === "semis" && bracketState.semis[matchIndex]) {
      currentTeam =
        teamSide === "A"
          ? bracketState.semis[matchIndex].teamA
          : bracketState.semis[matchIndex].teamB;
    } else if (round === "final") {
      currentTeam =
        teamSide === "A" ? bracketState.final.teamA : bracketState.final.teamB;
    }

    const idInput = document.getElementById("modal-team-id-input");
    if (currentTeam) {
      modalSelectedTeam = currentTeam;
      if (idInput) idInput.value = currentTeam.id || "";
      renderModalPreview(currentTeam);
    } else {
      modalSelectedTeam = null;
      if (idInput) idInput.value = "";
      renderModalPreviewEmpty();
    }

    renderQuickAffiliatesList();
    modal.classList.add("is-active");
  }

  function populateModalSlotOptions() {
    const slotSelect = document.getElementById("modal-select-slot");
    if (!slotSelect) return;

    slotSelect.innerHTML = "";
    const round = modalTargetSlot.round;

    let matchCount = 8;
    if (round === "cuartos") matchCount = 4;
    if (round === "semis") matchCount = 2;
    if (round === "final") matchCount = 1;

    for (let i = 0; i < matchCount; i++) {
      const matchLabel = getMatchLabel(round, i);

      const optA = document.createElement("option");
      optA.value = `${i}_A`;
      optA.textContent = `${matchLabel} • Equipo A`;
      slotSelect.appendChild(optA);

      const optB = document.createElement("option");
      optB.value = `${i}_B`;
      optB.textContent = `${matchLabel} • Equipo B`;
      slotSelect.appendChild(optB);
    }

    const targetVal = `${modalTargetSlot.matchIndex}_${modalTargetSlot.teamSide}`;
    slotSelect.value = targetVal;
  }

  function getMatchLabel(round, idx) {
    if (round === "octavos") {
      return idx < 4
        ? `Octavos Llave ${idx + 1} (Izq)`
        : `Octavos Llave ${idx + 1} (Der)`;
    }
    if (round === "cuartos") {
      return idx < 2
        ? `Cuartos Llave ${idx + 1} (Izq)`
        : `Cuartos Llave ${idx + 1} (Der)`;
    }
    if (round === "semis") {
      return idx === 0 ? `Semifinal 1 (Izq)` : `Semifinal 2 (Der)`;
    }
    return "Gran Final";
  }

  function updateModalTargetBanner() {
    const bannerText = document.getElementById("modal-target-slot-text");
    if (!bannerText) return;

    const roundName =
      modalTargetSlot.round === "octavos"
        ? "Octavos de Final"
        : modalTargetSlot.round === "cuartos"
          ? "Cuartos de Final"
          : modalTargetSlot.round === "semis"
            ? "Semifinales"
            : "Gran Final";

    const label = getMatchLabel(
      modalTargetSlot.round,
      modalTargetSlot.matchIndex,
    );
    const side = modalTargetSlot.teamSide === "A" ? "Equipo A" : "Equipo B";

    bannerText.textContent = `${roundName} • ${label} (${side})`;
  }

  function renderModalPreview(team) {
    const logoBox = document.getElementById("modal-preview-logo-box");
    const idTag = document.getElementById("modal-preview-id-tag");
    const nameTitle = document.getElementById("modal-preview-name-title");
    const statusText = document.getElementById("modal-preview-status-text");

    if (idTag) idTag.textContent = `ID: ${team.id || "--"}`;
    if (nameTitle) nameTitle.textContent = team.name || "Equipo";
    if (statusText)
      statusText.innerHTML = `<span class="has-text-success"><i class="fa-solid fa-circle-check"></i> Equipo verificado en Hoja Afiliados</span>`;

    if (logoBox) {
      if (team.logo) {
        logoBox.innerHTML = `<img src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.name)}" class="preview-logo-img" onerror="this.outerHTML='<i class=\\\'fa-solid fa-shield-halved fallback-icon\\\'></i>'" />`;
      } else {
        logoBox.innerHTML = `<i class="fa-solid fa-shield-halved fallback-icon"></i>`;
      }
    }
  }

  function renderModalPreviewNotFound(query) {
    const logoBox = document.getElementById("modal-preview-logo-box");
    const idTag = document.getElementById("modal-preview-id-tag");
    const nameTitle = document.getElementById("modal-preview-name-title");
    const statusText = document.getElementById("modal-preview-status-text");

    if (idTag) idTag.textContent = `ID: ${query}`;
    if (nameTitle) nameTitle.textContent = `No encontrado en "Afiliados"`;
    if (statusText)
      statusText.innerHTML = `<span class="has-text-danger"><i class="fa-solid fa-circle-xmark"></i> Verifique el código ID en la hoja Google Sheets</span>`;
    if (logoBox)
      logoBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-orange" style="font-size:2rem;"></i>`;
  }

  function renderModalPreviewEmpty() {
    const logoBox = document.getElementById("modal-preview-logo-box");
    const idTag = document.getElementById("modal-preview-id-tag");
    const nameTitle = document.getElementById("modal-preview-name-title");
    const statusText = document.getElementById("modal-preview-status-text");

    if (idTag) idTag.textContent = `ID: --`;
    if (nameTitle) nameTitle.textContent = `Ingrese un ID y presione Buscar`;
    if (statusText)
      statusText.textContent = `Consulta directa en hoja Afiliados por campo ID`;
    if (logoBox)
      logoBox.innerHTML = `<i class="fa-solid fa-shield-halved fallback-icon"></i>`;
  }

  function renderQuickAffiliatesList() {
    const grid = document.getElementById("modal-quick-affiliates-grid");
    if (!grid) return;

    let list = [];
    if (afiliadosCache && afiliadosCache.length > 0) {
      list = afiliadosCache;
    } else if (lastCalculatedStandings && lastCalculatedStandings.length > 0) {
      list = lastCalculatedStandings;
    }

    if (list.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 6px; color: #94a3b8; font-size: 0.75rem;">Cargando lista de afiliados...</div>`;
      return;
    }

    grid.innerHTML = "";
    list.slice(0, 30).forEach((rec) => {
      const teamId = rec.ID || rec.id || rec.RIF || rec.rif || "";
      const teamName =
        rec.NombreCompleto ||
        rec.Nombre ||
        rec.nombre ||
        rec.name ||
        `Equipo ${teamId}`;
      const rawLogo =
        rec.FileLink || rec.Foto || rec.Logo || rec.logo || rec.rawLogo || "";
      const logoUrl = normalizeDriveImageUrl(rawLogo);

      const item = document.createElement("div");
      item.className = "quick-affiliate-item";
      item.title = `Clic para seleccionar ${teamName} (${teamId})`;

      const logoImg = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" class="quick-affiliate-thumb" onerror="this.style.display='none'" />`
        : `<i class="fa-solid fa-shield-halved" style="color:#ff8c00; font-size: 1rem;"></i>`;

      item.innerHTML = `
        ${logoImg}
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <strong>${escapeHtml(teamId)}</strong> • ${escapeHtml(teamName)}
        </div>
      `;

      item.addEventListener("click", () => {
        const idInput = document.getElementById("modal-team-id-input");
        if (idInput) idInput.value = teamId;
        const normalized = {
          id: teamId,
          name: teamName,
          logo: logoUrl,
          rawLogo: rawLogo,
        };
        modalSelectedTeam = normalized;
        renderModalPreview(normalized);
      });

      grid.appendChild(item);
    });
  }

  /**
   * Asigna un equipo a un slot específico y re-renderiza
   */
  function assignTeamToSlot(round, matchIndex, teamSide, teamData) {
    if (round === "octavos" && bracketState.octavos[matchIndex]) {
      if (teamSide === "A") bracketState.octavos[matchIndex].teamA = teamData;
      else bracketState.octavos[matchIndex].teamB = teamData;
    } else if (round === "cuartos" && bracketState.cuartos[matchIndex]) {
      if (teamSide === "A") bracketState.cuartos[matchIndex].teamA = teamData;
      else bracketState.cuartos[matchIndex].teamB = teamData;
    } else if (round === "semis" && bracketState.semis[matchIndex]) {
      if (teamSide === "A") bracketState.semis[matchIndex].teamA = teamData;
      else bracketState.semis[matchIndex].teamB = teamData;
    } else if (round === "final") {
      if (teamSide === "A") bracketState.final.teamA = teamData;
      else bracketState.final.teamB = teamData;
    }

    renderBracket();
    saveBracketState(false);
  }

  /**
   * Avanza al ganador de una llave a la siguiente ronda automáticamente
   */
  function advanceWinnerToNextRound(round, matchIndex) {
    let match = null;
    if (round === "octavos") match = bracketState.octavos[matchIndex];
    else if (round === "cuartos") match = bracketState.cuartos[matchIndex];
    else if (round === "semis") match = bracketState.semis[matchIndex];
    else if (round === "final") match = bracketState.final;

    if (!match) return;

    if (!match.teamA && !match.teamB) {
      showToast("La llave no tiene equipos asignados aún", "warning");
      return;
    }

    const scoreA = parseInt(match.scoreA, 10);
    const scoreB = parseInt(match.scoreB, 10);

    let winnerTeam = null;
    if (!isNaN(scoreA) && !isNaN(scoreB)) {
      if (scoreA > scoreB) winnerTeam = match.teamA;
      else if (scoreB > scoreA) winnerTeam = match.teamB;
      else winnerTeam = match.teamA; // Desempate
    } else {
      // Si no hay marcador definido, preguntar cuál avanza
      if (match.teamA && !match.teamB) {
        winnerTeam = match.teamA;
      } else if (!match.teamA && match.teamB) {
        winnerTeam = match.teamB;
      } else {
        const pickA = confirm(
          `Selecciona el ganador:\n- ACEPTAR para: ${match.teamA?.name}\n- CANCELAR para: ${match.teamB?.name}`,
        );
        winnerTeam = pickA ? match.teamA : match.teamB;
      }
    }

    if (!winnerTeam) return;
    match.winner = winnerTeam.id;

    // Asignar al slot destino de la siguiente ronda
    if (round === "octavos") {
      // 8 matches de octavos -> 4 de cuartos
      // oct 0 -> qf 0 teamA, oct 1 -> qf 0 teamB
      // oct 2 -> qf 1 teamA, oct 3 -> qf 1 teamB
      // oct 4 -> qf 2 teamA, oct 5 -> qf 2 teamB
      // oct 6 -> qf 3 teamA, oct 7 -> qf 3 teamB
      const targetQF = Math.floor(matchIndex / 2);
      const targetSide = matchIndex % 2 === 0 ? "A" : "B";
      if (bracketState.cuartos[targetQF]) {
        if (targetSide === "A")
          bracketState.cuartos[targetQF].teamA = winnerTeam;
        else bracketState.cuartos[targetQF].teamB = winnerTeam;
      }
    } else if (round === "cuartos") {
      // 4 matches de cuartos -> 2 de semis
      // qf 0 -> sf 0 teamA, qf 1 -> sf 0 teamB
      // qf 2 -> sf 1 teamA, qf 3 -> sf 1 teamB
      const targetSF = Math.floor(matchIndex / 2);
      const targetSide = matchIndex % 2 === 0 ? "A" : "B";
      if (bracketState.semis[targetSF]) {
        if (targetSide === "A") bracketState.semis[targetSF].teamA = winnerTeam;
        else bracketState.semis[targetSF].teamB = winnerTeam;
      }
    } else if (round === "semis") {
      // 2 matches de semis -> 1 de final
      // sf 0 -> final teamA, sf 1 -> final teamB
      if (matchIndex === 0) bracketState.final.teamA = winnerTeam;
      else bracketState.final.teamB = winnerTeam;
    } else if (round === "final") {
      bracketState.champion = winnerTeam;
      showToast(
        `🏆 ¡${winnerTeam.name} se ha coronado CAMPEÓN del torneo!`,
        "success",
      );
    }

    renderBracket();
    saveBracketState(false);
    showToast(`¡${winnerTeam.name} avanzó a la siguiente ronda!`, "success");
  }

  /**
   * Permite editar el marcador de una llave directamente
   */
  function promptEditScore(round, matchIndex, teamSide) {
    let match = null;
    if (round === "octavos") match = bracketState.octavos[matchIndex];
    else if (round === "cuartos") match = bracketState.cuartos[matchIndex];
    else if (round === "semis") match = bracketState.semis[matchIndex];
    else if (round === "final") match = bracketState.final;

    if (!match) return;

    const team = teamSide === "A" ? match.teamA : match.teamB;
    const currentScore = teamSide === "A" ? match.scoreA : match.scoreB;
    const teamName = team ? team.name : `Equipo ${teamSide}`;

    const newScore = prompt(
      `Ingrese los puntos anotados por "${teamName}":`,
      currentScore || "0",
    );
    if (newScore !== null) {
      const cleanScore = newScore.trim();
      if (teamSide === "A") match.scoreA = cleanScore;
      else match.scoreB = cleanScore;

      renderBracket();
      saveBracketState(false);
    }
  }

  /**
   * Siembra automáticamente los equipos líderes de la tabla de posiciones en el bracket
   */
  function seedBracketFromStandings() {
    if (!lastCalculatedStandings || lastCalculatedStandings.length === 0) {
      showToast(
        "No hay equipos clasificados en la tabla de posiciones para sembrar",
        "warning",
      );
      return;
    }

    const format = bracketState.format || "16";
    const teams = lastCalculatedStandings.map((s) => ({
      id: s.id,
      name: s.name,
      logo: s.logo,
      rawLogo: s.logo,
    }));

    if (format === "16") {
      // 16 equipos para Octavos de final
      // Formato clásico de torneo: 1 vs 16, 8 vs 9, 4 vs 13, 5 vs 12 (Izquierda)
      // 2 vs 15, 7 vs 10, 3 vs 14, 6 vs 11 (Derecha)
      const seedIndices = [
        [0, 15], // Oct 1 (Izq): 1 vs 16
        [7, 8], // Oct 2 (Izq): 8 vs 9
        [3, 12], // Oct 3 (Izq): 4 vs 13
        [4, 11], // Oct 4 (Izq): 5 vs 12
        [1, 14], // Oct 5 (Der): 2 vs 15
        [6, 9], // Oct 6 (Der): 7 vs 10
        [2, 13], // Oct 7 (Der): 3 vs 14
        [5, 10], // Oct 8 (Der): 6 vs 11
      ];

      seedIndices.forEach(([idxA, idxB], mIdx) => {
        bracketState.octavos[mIdx].teamA = teams[idxA] || null;
        bracketState.octavos[mIdx].teamB = teams[idxB] || null;
        bracketState.octavos[mIdx].scoreA = "";
        bracketState.octavos[mIdx].scoreB = "";
        bracketState.octavos[mIdx].winner = null;
      });
    } else if (format === "8") {
      // 8 equipos para Cuartos de final
      const seedIndices = [
        [0, 7], // QF 1: 1 vs 8
        [3, 4], // QF 2: 4 vs 5
        [1, 6], // QF 3: 2 vs 7
        [2, 5], // QF 4: 3 vs 6
      ];

      seedIndices.forEach(([idxA, idxB], mIdx) => {
        bracketState.cuartos[mIdx].teamA = teams[idxA] || null;
        bracketState.cuartos[mIdx].teamB = teams[idxB] || null;
        bracketState.cuartos[mIdx].scoreA = "";
        bracketState.cuartos[mIdx].scoreB = "";
        bracketState.cuartos[mIdx].winner = null;
      });
    } else if (format === "4") {
      bracketState.semis[0].teamA = teams[0] || null;
      bracketState.semis[0].teamB = teams[3] || null;
      bracketState.semis[1].teamA = teams[1] || null;
      bracketState.semis[1].teamB = teams[2] || null;
    } else if (format === "2") {
      bracketState.final.teamA = teams[0] || null;
      bracketState.final.teamB = teams[1] || null;
    }

    renderBracket();
    saveBracketState(true);
    showToast(
      `¡Cuadro sembrado con éxito con los líderes de la tabla de posiciones!`,
      "success",
    );
  }

  /**
   * Resetea el cuadro eliminatorio
   */
  function resetBracketState() {
    bracketState.octavos.forEach((m) => {
      m.teamA = null;
      m.teamB = null;
      m.scoreA = "";
      m.scoreB = "";
      m.winner = null;
    });

    bracketState.cuartos.forEach((m) => {
      m.teamA = null;
      m.teamB = null;
      m.scoreA = "";
      m.scoreB = "";
      m.winner = null;
    });

    bracketState.semis.forEach((m) => {
      m.teamA = null;
      m.teamB = null;
      m.scoreA = "";
      m.scoreB = "";
      m.winner = null;
    });

    bracketState.final.teamA = null;
    bracketState.final.teamB = null;
    bracketState.final.scoreA = "";
    bracketState.final.scoreB = "";
    bracketState.final.winner = null;
    bracketState.champion = null;

    renderBracket();
    saveBracketState(false);
    showToast("Cuadro eliminatorio reiniciado", "info");
  }

  /**
   * Renderiza el tablero visual del bracket de playoffs
   */
  function renderBracket() {
    // 1. Octavos Lado Izquierdo (Llaves 0, 1, 2, 3)
    const colLeftOct = document.getElementById("col-left-octavos");
    if (colLeftOct) {
      colLeftOct.innerHTML = [0, 1, 2, 3]
        .map((idx) => renderMatchupCardHTML("octavos", idx, false))
        .join("");
    }

    // 2. Octavos Lado Derecho (Llaves 4, 5, 6, 7 - Con diseño invertido)
    const colRightOct = document.getElementById("col-right-octavos");
    if (colRightOct) {
      colRightOct.innerHTML = [4, 5, 6, 7]
        .map((idx) => renderMatchupCardHTML("octavos", idx, true))
        .join("");
    }

    // 3. Cuartos Lado Izquierdo (Llaves 0, 1)
    const colLeftCuartos = document.getElementById("col-left-cuartos");
    if (colLeftCuartos) {
      colLeftCuartos.innerHTML = [0, 1]
        .map((idx) => renderMatchupCardHTML("cuartos", idx, false))
        .join("");
    }

    // 4. Cuartos Lado Derecho (Llaves 2, 3)
    const colRightCuartos = document.getElementById("col-right-cuartos");
    if (colRightCuartos) {
      colRightCuartos.innerHTML = [2, 3]
        .map((idx) => renderMatchupCardHTML("cuartos", idx, true))
        .join("");
    }

    // 5. Semifinales Lado Izquierdo (Llave 0)
    const colLeftSemis = document.getElementById("col-left-semis");
    if (colLeftSemis) {
      colLeftSemis.innerHTML = renderMatchupCardHTML("semis", 0, false);
    }

    // 6. Semifinales Lado Derecho (Llave 1)
    const colRightSemis = document.getElementById("col-right-semis");
    if (colRightSemis) {
      colRightSemis.innerHTML = renderMatchupCardHTML("semis", 1, true);
    }

    // 7. Gran Final (Centro)
    const finalSlots = document.getElementById("final-match-slots");
    if (finalSlots) {
      finalSlots.innerHTML = renderFinalMatchHTML();
    }

    // 8. Presentación Destacada del Campeón justo debajo del Trofeo de Oro
    renderChampionDisplay();

    // 9. Fechas y sedes
    const finalDate = document.getElementById("final-event-date");
    if (finalDate && bracketState.date)
      finalDate.textContent = bracketState.date;
    const finalVenue = document.getElementById("final-event-venue");
    if (finalVenue && bracketState.venue)
      finalVenue.textContent = bracketState.venue;
    const finalCity = document.getElementById("final-event-city");
    if (finalCity && bracketState.city)
      finalCity.textContent = bracketState.city;

    // Vincular interactividad sobre los elementos generados
    attachBracketDOMListeners();
  }

  /**
   * Renderiza la presentación destacada del Campeón justo debajo del Trofeo Real de Oro:
   * - Logotipo en tamaño grande
   * - Sin fondo
   * - Sin bordes
   * - Con el mismo efecto al pasar el cursor por encima (scale + glow)
   * - Nombre del equipo en grande
   * - ID en grande
   */
  function renderChampionDisplay() {
    const champContainer = document.getElementById("trophy-champion-display");
    if (!champContainer) return;

    if (bracketState.champion) {
      const champ = bracketState.champion;
      const logoUrl = champ.logo;

      const logoHTML = logoUrl
        ? `<div class="champion-logo-box" title="${escapeHtml(champ.name)}">
             <img
               src="${escapeHtml(logoUrl)}"
               alt="${escapeHtml(champ.name)}"
               class="champion-logo-img"
               onerror="this.outerHTML='<i class=\\\'fa-solid fa-basketball champion-logo-fallback\\\'></i>'"
             />
           </div>`
        : `<div class="champion-logo-box" title="${escapeHtml(champ.name)}">
             <i class="fa-solid fa-basketball champion-logo-fallback"></i>
           </div>`;

      champContainer.innerHTML = `
        <div class="champion-winner-wrapper">
          <div class="champion-crown-header">
            <i class="fa-solid fa-crown champion-crown-icon"></i>
            <span class="champion-title-tag">CAMPEÓN</span>
            <i class="fa-solid fa-crown champion-crown-icon"></i>
          </div>
          ${logoHTML}
          <div class="champion-text-info">
            <h2 class="champion-team-name">${escapeHtml(champ.name || "Equipo")}</h2>
            <div class="champion-team-id">ID: ${escapeHtml(champ.id || "--")}</div>
          </div>
        </div>
      `;
      champContainer.style.display = "flex";
    } else {
      champContainer.style.display = "none";
      champContainer.innerHTML = "";
    }
  }

  /**
   * Genera el HTML de una tarjeta de enfrentamiento (Matchup Card)
   */
  function renderMatchupCardHTML(round, matchIndex, isMirrored) {
    let match = null;
    if (round === "octavos") match = bracketState.octavos[matchIndex];
    else if (round === "cuartos") match = bracketState.cuartos[matchIndex];
    else if (round === "semis") match = bracketState.semis[matchIndex];

    if (!match) return "";

    const isWinnerA =
      match.winner && match.teamA && match.winner === match.teamA.id;
    const isWinnerB =
      match.winner && match.teamB && match.winner === match.teamB.id;

    const teamASlotHTML = renderTeamSlotHTML(
      round,
      matchIndex,
      "A",
      match.teamA,
      match.scoreA,
      isWinnerA,
      isMirrored,
    );

    const teamBSlotHTML = renderTeamSlotHTML(
      round,
      matchIndex,
      "B",
      match.teamB,
      match.scoreB,
      isWinnerB,
      isMirrored,
    );

    return `
      <div class="bracket-matchup-card" data-round="${round}" data-match-index="${matchIndex}">
        <div class="bracket-matchup-label">
          <span>${escapeHtml(match.label || `Llave ${matchIndex + 1}`)}</span>
          <button
            type="button"
            class="btn-advance-winner"
            data-action="advance-winner"
            data-round="${round}"
            data-match-index="${matchIndex}"
            title="Avanzar automáticamente al ganador de este cruce a la siguiente ronda"
          >
            Avanzar <i class="fa-solid fa-angles-right"></i>
          </button>
        </div>
        ${teamASlotHTML}
        ${teamBSlotHTML}
      </div>
    `;
  }

  /**
   * Genera el HTML de la casilla de un equipo (Team Slot)
   * Cumple la especificación:
   * - Logo de tamaño grande
   * - Sin fondo ni bordes
   * - Con el mismo efecto al pasar el puntero
   */
  function renderTeamSlotHTML(
    round,
    matchIndex,
    teamSide,
    teamData,
    score,
    isWinner,
    isMirrored,
  ) {
    const isSlotEmpty = !teamData;
    const slotClass = `bracket-team-slot ${isMirrored ? "is-mirrored" : ""} ${isWinner ? "is-winner" : ""} ${isSlotEmpty ? "is-empty" : ""}`;

    // Logo o placeholder
    let logoHTML = "";
    if (teamData && teamData.logo) {
      logoHTML = `
        <div class="team-bracket-logo-box" title="${escapeHtml(teamData.name)}">
          <img
            src="${escapeHtml(teamData.logo)}"
            alt="${escapeHtml(teamData.name)}"
            class="team-bracket-logo-img"
            onerror="this.outerHTML='<i class=\\\'fa-solid fa-basketball team-bracket-logo-fallback\\\'></i>'"
          />
        </div>
      `;
    } else if (teamData) {
      logoHTML = `
        <div class="team-bracket-logo-box" title="${escapeHtml(teamData.name)}">
          <i class="fa-solid fa-basketball team-bracket-logo-fallback"></i>
        </div>
      `;
    } else {
      logoHTML = `
        <div class="team-bracket-placeholder-icon" title="Clic para asignar equipo por ID">
          <i class="fa-solid fa-plus"></i>
        </div>
      `;
    }

    // Nombre y código ID
    const nameText = teamData
      ? escapeHtml(teamData.name)
      : "Asignar Equipo (ID)";
    const idText =
      teamData && teamData.id ? escapeHtml(teamData.id) : "Hoja Afiliados";

    const scoreVal =
      score !== "" && score !== undefined && score !== null
        ? escapeHtml(score)
        : "-";

    return `
      <div
        class="${slotClass}"
        data-action="open-assign-slot"
        data-round="${round}"
        data-match-index="${matchIndex}"
        data-team-side="${teamSide}"
        title="${teamData ? `Equipo: ${escapeHtml(teamData.name)} (ID: ${escapeHtml(teamData.id)}) - Clic para cambiar` : "Clic para asignar equipo por ID desde Afiliados"}"
      >
        ${logoHTML}
        <div class="bracket-team-info">
          <span class="bracket-team-name">${nameText}</span>
          <span class="bracket-team-id-tag">${idText}</span>
        </div>
        <div
          class="bracket-score-box"
          data-action="edit-score"
          data-round="${round}"
          data-match-index="${matchIndex}"
          data-team-side="${teamSide}"
          title="Clic para editar puntos anotados"
        >
          ${scoreVal}
        </div>
      </div>
    `;
  }

  /**
   * Genera el HTML del cruce de la Final
   */
  function renderFinalMatchHTML() {
    const match = bracketState.final;
    const isWinnerA =
      match.winner && match.teamA && match.winner === match.teamA.id;
    const isWinnerB =
      match.winner && match.teamB && match.winner === match.teamB.id;

    const teamASlot = renderTeamSlotHTML(
      "final",
      0,
      "A",
      match.teamA,
      match.scoreA,
      isWinnerA,
      false,
    );
    const teamBSlot = renderTeamSlotHTML(
      "final",
      0,
      "B",
      match.teamB,
      match.scoreB,
      isWinnerB,
      true,
    );

    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${teamASlot}
        <div style="display: flex; justify-content: center; align-items: center; gap: 8px;">
          <button
            type="button"
            class="button is-small is-warning is-rounded"
            data-action="advance-winner"
            data-round="final"
            data-match-index="0"
            style="font-weight: 800; font-size: 0.75rem; box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);"
          >
            <i class="fa-solid fa-crown"></i> Definir Campeón
          </button>
        </div>
        ${teamBSlot}
      </div>
    `;
  }

  /**
   * Conecta los eventos de clic en las casillas y botones del bracket
   */
  function attachBracketDOMListeners() {
    // 1. Clic en las casillas de equipo para abrir modal de asignación
    document
      .querySelectorAll('[data-action="open-assign-slot"]')
      .forEach((slotEl) => {
        slotEl.addEventListener("click", (e) => {
          // Evitar que el clic en el score box abra el modal de asignación
          if (e.target.closest('[data-action="edit-score"]')) return;

          const round = slotEl.getAttribute("data-round");
          const matchIndex = parseInt(
            slotEl.getAttribute("data-match-index"),
            10,
          );
          const teamSide = slotEl.getAttribute("data-team-side");

          requireBracketUnlocked(() => {
            openBracketAssignModal(round, matchIndex, teamSide);
          }, "Asignar Equipo a la Llave");
        });
      });

    // 2. Clic en la casilla de marcador para editar score
    document
      .querySelectorAll('[data-action="edit-score"]')
      .forEach((scoreEl) => {
        scoreEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const round = scoreEl.getAttribute("data-round");
          const matchIndex = parseInt(
            scoreEl.getAttribute("data-match-index"),
            10,
          );
          const teamSide = scoreEl.getAttribute("data-team-side");

          requireBracketUnlocked(() => {
            promptEditScore(round, matchIndex, teamSide);
          }, "Editar Marcador");
        });
      });

    // 3. Clic en botón de avanzar ganador
    document
      .querySelectorAll('[data-action="advance-winner"]')
      .forEach((btnEl) => {
        btnEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const round = btnEl.getAttribute("data-round");
          const matchIndex = parseInt(
            btnEl.getAttribute("data-match-index"),
            10,
          );

          requireBracketUnlocked(() => {
            advanceWinnerToNextRound(round, matchIndex);
          }, "Avanzar Ganador");
        });
      });
  }

  /**
   * Guarda el estado del bracket tanto en el servidor local (persistente multi-dispositivo)
   * como directamente en la hoja "PlayOffs" de Google Sheets mediante Google Apps Script.
   */
  async function saveBracketState(
    showToastFeedback = false,
    isUserClick = false,
  ) {
    const btnSave = document.getElementById("btn-save-bracket");
    const originalBtnHTML = btnSave ? btnSave.innerHTML : "";

    if (isUserClick && btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Guardando en PlayOffs...</span>`;
    }

    try {
      localStorage.setItem(
        "KNOCKOUT_BRACKET_STATE",
        JSON.stringify(bracketState),
      );

      // 1. Preparar las filas tabulares limpias con ID único para la hoja PlayOffs
      const playoffRows = generatePlayOffsSheetRows(bracketState);

      const tName = currentSelectedTournament
        ? allTournamentsList.find((t) => t.id === currentSelectedTournament)
            ?.name || currentSelectedTournament
        : "Torneo General";

      const serverPayload = {
        bracketData: bracketState,
        rows: playoffRows,
        tournamentId: currentSelectedTournament || "TODOS",
        tournamentName: tName,
        sheetName: SHEET_CONFIG.PLAYOFFS_SHEET || "PlayOffs",
        updatedAt: new Date().toISOString(),
      };

      // 2. Guardar en la API del backend Node/Express persistente (compartido para cualquier dispositivo e IP)
      let serverSaved = false;
      try {
        const serverRes = await fetch(CLOUD_API_ENDPOINTS.BRACKET_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serverPayload),
        });
        if (serverRes.ok) {
          serverSaved = true;
        }
      } catch (e) {
        console.warn(
          "[PositionTable.js] Guardado en servidor API /api/bracket omitido:",
          e,
        );
      }

      // 3. Encabezados exactos e impecables de la hoja PlayOffs (sin campos sobrantes de Afiliados)
      const PLAYOFFS_EXACT_HEADERS = [
        "ID",
        "ID_Tournament",
        "Torneo",
        "Fase",
        "ID_Llave",
        "Llave",
        "Lado",
        "EquipoA_ID",
        "EquipoA_Nombre",
        "Marcador_EquipoA",
        "EquipoB_ID",
        "EquipoB_Nombre",
        "Marcador_EquipoB",
        "Ganador_ID",
        "Ganador_Nombre",
        "Fecha_Evento",
        "Sede_Evento",
        "Ciudad_Evento",
        "Campeon_ID",
        "Campeon_Nombre",
        "Estatus",
        "Fecha_Actualizacion",
      ];

      const gasPayload = {
        action: "savePlayOffs",
        actionName: "savePlayOffs",
        sheetName: SHEET_CONFIG.PLAYOFFS_SHEET || "PlayOffs",
        targetSheet: SHEET_CONFIG.PLAYOFFS_SHEET || "PlayOffs",
        tournamentId: currentSelectedTournament || "TODOS",
        tournamentName: tName,
        headers: PLAYOFFS_EXACT_HEADERS,
        columns: PLAYOFFS_EXACT_HEADERS,
        rows: playoffRows,
        records: playoffRows,
        data: playoffRows,
        standings: playoffRows,
        bracketData: bracketState,
        updatedAt: new Date().toISOString(),
      };

      // Guardar en Google Apps Script si fue acción explícita del usuario o evento relevante
      let gasSuccess = false;
      try {
        const gasRes = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(gasPayload),
        });

        if (gasRes.ok) {
          const gasData = await gasRes.json().catch(() => null);
          if (gasData && (gasData.status === "success" || gasData.ok)) {
            gasSuccess = true;
          }
        }
      } catch (err) {
        console.warn(
          "[PositionTable.js] Envío a Google Apps Script (PlayOffs):",
          err,
        );
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (showToastFeedback) {
        if (gasSuccess) {
          updateCloudStatus(
            "success",
            `Guardado en ${SHEET_CONFIG.PLAYOFFS_SHEET} (${timeStr})`,
          );
          showToast(
            `¡Cuadro de PlayOffs guardado con éxito en la hoja "${SHEET_CONFIG.PLAYOFFS_SHEET}" (${playoffRows.length} llaves estructuradas con ID) y sincronizado para todos los dispositivos!`,
            "success",
          );
        } else if (serverSaved) {
          updateCloudStatus("success", `Sincronizado en Servidor (${timeStr})`);
          showToast(
            `Cuadro de PlayOffs guardado exitosamente en el servidor central (${playoffRows.length} llaves con ID). Sincronizado para cualquier equipo o dispositivo.`,
            "success",
          );
        } else {
          showToast(
            `Cuadro de PlayOffs guardado localmente (${timeStr}).`,
            "info",
          );
        }
      }
    } catch (e) {
      console.warn("[PositionTable.js] Error al guardar bracketState:", e);
      if (showToastFeedback) {
        showToast(
          "Error al guardar cuadro eliminatorio: " + e.message,
          "error",
        );
      }
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML =
          originalBtnHTML ||
          `<i class="fa-solid fa-cloud-arrow-up"></i> <span>Guardar en PlayOffs</span>`;
      }
    }
  }

  /**
   * Transforma la estructura de playoffs en filas tabulares impecables para la hoja PlayOffs
   * Cada fila cuenta con un identificador único "ID" estructurado, sin campos sobrantes ni faltantes.
   */
  function generatePlayOffsSheetRows(bracket) {
    const rows = [];
    const tIdRaw = currentSelectedTournament || "TODOS";
    const tIdClean = String(tIdRaw)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toUpperCase();
    const tName = currentSelectedTournament
      ? allTournamentsList.find((t) => t.id === currentSelectedTournament)
          ?.name || currentSelectedTournament
      : "Torneo General";
    const nowIso = new Date().toISOString();

    const dateVal = bracket.date || "14 DE SEPTIEMBRE";
    const venueVal = bracket.venue || "ARENA RIGA";
    const cityVal = bracket.city || "Riga (Letonia)";
    const champId =
      bracket.champion?.id ||
      (bracket.final?.winner ? bracket.final.winner : "");
    const champName = bracket.champion?.name || "";

    // Helper para determinar el nombre del ganador
    const getWinnerName = (match) => {
      if (!match || !match.winner) return "";
      if (match.teamA && match.teamA.id === match.winner)
        return match.teamA.name || "";
      if (match.teamB && match.teamB.id === match.winner)
        return match.teamB.name || "";
      return match.winner;
    };

    // Helper para calcular el estatus de la llave
    const getMatchStatus = (match) => {
      if (match.winner) return "Finalizado";
      if (
        (match.scoreA !== "" && match.scoreA !== undefined) ||
        (match.scoreB !== "" && match.scoreB !== undefined)
      )
        return "En Juego";
      if (match.teamA || match.teamB) return "Pendiente";
      return "Por Definir";
    };

    // 1. Octavos de final (8 llaves)
    if (Array.isArray(bracket.octavos)) {
      bracket.octavos.forEach((m, idx) => {
        const num = String(idx + 1).padStart(2, "0");
        const uniqueId = `PO-${tIdClean !== "TODOS" ? tIdClean + "-" : ""}OCT-${num}`;
        rows.push({
          ID: uniqueId,
          ID_Tournament: tIdRaw,
          Torneo: tName,
          Fase: "Octavos de Final",
          ID_Llave: m.id || `oct-${idx + 1}`,
          Llave: m.label || `Octavos ${idx + 1}`,
          Lado: idx < 4 ? "Izquierdo" : "Derecho",
          EquipoA_ID: m.teamA?.id || "",
          EquipoA_Nombre: m.teamA?.name || "",
          Marcador_EquipoA:
            m.scoreA !== "" && m.scoreA !== undefined && m.scoreA !== null
              ? m.scoreA
              : "",
          EquipoB_ID: m.teamB?.id || "",
          EquipoB_Nombre: m.teamB?.name || "",
          Marcador_EquipoB:
            m.scoreB !== "" && m.scoreB !== undefined && m.scoreB !== null
              ? m.scoreB
              : "",
          Ganador_ID: m.winner || "",
          Ganador_Nombre: getWinnerName(m),
          Fecha_Evento: dateVal,
          Sede_Evento: venueVal,
          Ciudad_Evento: cityVal,
          Campeon_ID: champId,
          Campeon_Nombre: champName,
          Estatus: getMatchStatus(m),
          Fecha_Actualizacion: nowIso,
        });
      });
    }

    // 2. Cuartos de final (4 llaves)
    if (Array.isArray(bracket.cuartos)) {
      bracket.cuartos.forEach((m, idx) => {
        const num = String(idx + 1).padStart(2, "0");
        const uniqueId = `PO-${tIdClean !== "TODOS" ? tIdClean + "-" : ""}QF-${num}`;
        rows.push({
          ID: uniqueId,
          ID_Tournament: tIdRaw,
          Torneo: tName,
          Fase: "Cuartos de Final",
          ID_Llave: m.id || `qf-${idx + 1}`,
          Llave: m.label || `Cuartos ${idx + 1}`,
          Lado: idx < 2 ? "Izquierdo" : "Derecho",
          EquipoA_ID: m.teamA?.id || "",
          EquipoA_Nombre: m.teamA?.name || "",
          Marcador_EquipoA:
            m.scoreA !== "" && m.scoreA !== undefined && m.scoreA !== null
              ? m.scoreA
              : "",
          EquipoB_ID: m.teamB?.id || "",
          EquipoB_Nombre: m.teamB?.name || "",
          Marcador_EquipoB:
            m.scoreB !== "" && m.scoreB !== undefined && m.scoreB !== null
              ? m.scoreB
              : "",
          Ganador_ID: m.winner || "",
          Ganador_Nombre: getWinnerName(m),
          Fecha_Evento: dateVal,
          Sede_Evento: venueVal,
          Ciudad_Evento: cityVal,
          Campeon_ID: champId,
          Campeon_Nombre: champName,
          Estatus: getMatchStatus(m),
          Fecha_Actualizacion: nowIso,
        });
      });
    }

    // 3. Semifinales (2 llaves)
    if (Array.isArray(bracket.semis)) {
      bracket.semis.forEach((m, idx) => {
        const num = String(idx + 1).padStart(2, "0");
        const uniqueId = `PO-${tIdClean !== "TODOS" ? tIdClean + "-" : ""}SF-${num}`;
        rows.push({
          ID: uniqueId,
          ID_Tournament: tIdRaw,
          Torneo: tName,
          Fase: "Semifinal",
          ID_Llave: m.id || `sf-${idx + 1}`,
          Llave: m.label || `Semifinal ${idx + 1}`,
          Lado: idx === 0 ? "Izquierdo" : "Derecho",
          EquipoA_ID: m.teamA?.id || "",
          EquipoA_Nombre: m.teamA?.name || "",
          Marcador_EquipoA:
            m.scoreA !== "" && m.scoreA !== undefined && m.scoreA !== null
              ? m.scoreA
              : "",
          EquipoB_ID: m.teamB?.id || "",
          EquipoB_Nombre: m.teamB?.name || "",
          Marcador_EquipoB:
            m.scoreB !== "" && m.scoreB !== undefined && m.scoreB !== null
              ? m.scoreB
              : "",
          Ganador_ID: m.winner || "",
          Ganador_Nombre: getWinnerName(m),
          Fecha_Evento: dateVal,
          Sede_Evento: venueVal,
          Ciudad_Evento: cityVal,
          Campeon_ID: champId,
          Campeon_Nombre: champName,
          Estatus: getMatchStatus(m),
          Fecha_Actualizacion: nowIso,
        });
      });
    }

    // 4. Gran Final (1 llave)
    if (bracket.final) {
      const f = bracket.final;
      const uniqueId = `PO-${tIdClean !== "TODOS" ? tIdClean + "-" : ""}FIN-01`;
      rows.push({
        ID: uniqueId,
        ID_Tournament: tIdRaw,
        Torneo: tName,
        Fase: "Gran Final",
        ID_Llave: f.id || "fin-1",
        Llave: f.label || "Gran Final",
        Lado: "Centro",
        EquipoA_ID: f.teamA?.id || "",
        EquipoA_Nombre: f.teamA?.name || "",
        Marcador_EquipoA:
          f.scoreA !== "" && f.scoreA !== undefined && f.scoreA !== null
            ? f.scoreA
            : "",
        EquipoB_ID: f.teamB?.id || "",
        EquipoB_Nombre: f.teamB?.name || "",
        Marcador_EquipoB:
          f.scoreB !== "" && f.scoreB !== undefined && f.scoreB !== null
            ? f.scoreB
            : "",
        Ganador_ID: f.winner || champId,
        Ganador_Nombre: getWinnerName(f) || champName,
        Fecha_Evento: dateVal,
        Sede_Evento: venueVal,
        Ciudad_Evento: cityVal,
        Campeon_ID: champId,
        Campeon_Nombre: champName,
        Estatus: getMatchStatus(f),
        Fecha_Actualizacion: nowIso,
      });
    }

    return rows;
  }

  /**
   * Reconstruye la estructura interactiva de Playoffs a partir de filas tabulares de la hoja PlayOffs
   * Permite recargar el cuadro mediante el ID de la llave o fila en cualquier dispositivo
   */
  function reconstructBracketFromRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return false;

    // Helper para buscar logo de equipo en cache
    const findTeamLogo = (teamId, teamName) => {
      if (!teamId && !teamName) return "";
      const cleanId = String(teamId || "")
        .trim()
        .toLowerCase();
      if (cleanId && afiliadosCache && afiliadosCache.length > 0) {
        const found = afiliadosCache.find(
          (a) =>
            String(a.ID || a.id || "")
              .trim()
              .toLowerCase() === cleanId ||
            String(a.RIF || a.rif || "")
              .trim()
              .toLowerCase() === cleanId,
        );
        if (found) {
          const raw =
            found.FileLink ||
            found.fileLink ||
            found.Foto ||
            found.foto ||
            found.Logo ||
            found.logo ||
            "";
          return normalizeDriveImageUrl(raw);
        }
      }
      if (
        cleanId &&
        lastCalculatedStandings &&
        lastCalculatedStandings.length > 0
      ) {
        const foundSt = lastCalculatedStandings.find(
          (s) =>
            String(s.id || "")
              .trim()
              .toLowerCase() === cleanId,
        );
        if (foundSt && foundSt.logo) return foundSt.logo;
      }
      return "";
    };

    let reconstructed = false;

    rows.forEach((r) => {
      const rowId = String(r.ID || "").toUpperCase();
      const matchId = String(r.ID_Llave || "").toLowerCase();
      const fase = String(r.Fase || "").toLowerCase();

      // Construir equipo A
      let teamAObj = null;
      if (r.EquipoA_ID || r.EquipoA_Nombre) {
        teamAObj = {
          id: r.EquipoA_ID || "",
          name: r.EquipoA_Nombre || `Equipo ${r.EquipoA_ID}`,
          logo: findTeamLogo(r.EquipoA_ID, r.EquipoA_Nombre),
          rawLogo: "",
        };
      }

      // Construir equipo B
      let teamBObj = null;
      if (r.EquipoB_ID || r.EquipoB_Nombre) {
        teamBObj = {
          id: r.EquipoB_ID || "",
          name: r.EquipoB_Nombre || `Equipo ${r.EquipoB_ID}`,
          logo: findTeamLogo(r.EquipoB_ID, r.EquipoB_Nombre),
          rawLogo: "",
        };
      }

      // 1. Octavos
      if (
        matchId.startsWith("oct-") ||
        rowId.includes("-OCT-") ||
        fase.includes("octavo")
      ) {
        const idxMatch =
          matchId.match(/oct-(\d+)/i) || rowId.match(/OCT-(\d+)/i);
        const idx = idxMatch ? parseInt(idxMatch[1], 10) - 1 : -1;
        if (idx >= 0 && idx < bracketState.octavos.length) {
          bracketState.octavos[idx].teamA = teamAObj;
          bracketState.octavos[idx].teamB = teamBObj;
          bracketState.octavos[idx].scoreA =
            r.Marcador_EquipoA !== undefined ? r.Marcador_EquipoA : "";
          bracketState.octavos[idx].scoreB =
            r.Marcador_EquipoB !== undefined ? r.Marcador_EquipoB : "";
          bracketState.octavos[idx].winner = r.Ganador_ID || null;
          reconstructed = true;
        }
      }
      // 2. Cuartos
      else if (
        matchId.startsWith("qf-") ||
        rowId.includes("-QF-") ||
        fase.includes("cuarto")
      ) {
        const idxMatch = matchId.match(/qf-(\d+)/i) || rowId.match(/QF-(\d+)/i);
        const idx = idxMatch ? parseInt(idxMatch[1], 10) - 1 : -1;
        if (idx >= 0 && idx < bracketState.cuartos.length) {
          bracketState.cuartos[idx].teamA = teamAObj;
          bracketState.cuartos[idx].teamB = teamBObj;
          bracketState.cuartos[idx].scoreA =
            r.Marcador_EquipoA !== undefined ? r.Marcador_EquipoA : "";
          bracketState.cuartos[idx].scoreB =
            r.Marcador_EquipoB !== undefined ? r.Marcador_EquipoB : "";
          bracketState.cuartos[idx].winner = r.Ganador_ID || null;
          reconstructed = true;
        }
      }
      // 3. Semifinales
      else if (
        matchId.startsWith("sf-") ||
        rowId.includes("-SF-") ||
        fase.includes("semi")
      ) {
        const idxMatch = matchId.match(/sf-(\d+)/i) || rowId.match(/SF-(\d+)/i);
        const idx = idxMatch ? parseInt(idxMatch[1], 10) - 1 : -1;
        if (idx >= 0 && idx < bracketState.semis.length) {
          bracketState.semis[idx].teamA = teamAObj;
          bracketState.semis[idx].teamB = teamBObj;
          bracketState.semis[idx].scoreA =
            r.Marcador_EquipoA !== undefined ? r.Marcador_EquipoA : "";
          bracketState.semis[idx].scoreB =
            r.Marcador_EquipoB !== undefined ? r.Marcador_EquipoB : "";
          bracketState.semis[idx].winner = r.Ganador_ID || null;
          reconstructed = true;
        }
      }
      // 4. Gran Final
      else if (
        matchId.startsWith("fin") ||
        rowId.includes("-FIN-") ||
        fase.includes("final")
      ) {
        bracketState.final.teamA = teamAObj;
        bracketState.final.teamB = teamBObj;
        bracketState.final.scoreA =
          r.Marcador_EquipoA !== undefined ? r.Marcador_EquipoA : "";
        bracketState.final.scoreB =
          r.Marcador_EquipoB !== undefined ? r.Marcador_EquipoB : "";
        bracketState.final.winner = r.Ganador_ID || null;

        if (r.Campeon_ID || r.Campeon_Nombre) {
          bracketState.champion = {
            id: r.Campeon_ID || r.Ganador_ID || "",
            name: r.Campeon_Nombre || r.Ganador_Nombre || "",
            logo: findTeamLogo(r.Campeon_ID, r.Campeon_Nombre),
          };
        }
        reconstructed = true;
      }

      // Metadata de fecha y sede
      if (r.Fecha_Evento) bracketState.date = r.Fecha_Evento;
      if (r.Sede_Evento) bracketState.venue = r.Sede_Evento;
      if (r.Ciudad_Evento) bracketState.city = r.Ciudad_Evento;
    });

    return reconstructed;
  }

  /**
   * Guarda el estado del bracket tanto en el servidor local (persistente multi-dispositivo)
   * como directamente en la hoja "PlayOffs" de Google Sheets mediante Google Apps Script.
   */
  async function saveBracketState(
    showToastFeedback = false,
    isUserClick = false,
  ) {
    const btnSave = document.getElementById("btn-save-bracket");
    const originalBtnHTML = btnSave ? btnSave.innerHTML : "";

    if (isUserClick && btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Guardando en PlayOffs...</span>`;
    }

    try {
      localStorage.setItem(
        "KNOCKOUT_BRACKET_STATE",
        JSON.stringify(bracketState),
      );

      // 1. Generar la estructura de filas impecable con campo "ID"
      const playoffRows = generatePlayOffsSheetRows(bracketState);

      // 2. Guardar en la API del backend Node/Express persistente (compartido para cualquier dispositivo e IP)
      const serverPayload = {
        bracketData: bracketState,
        rows: playoffRows,
        sheetName: SHEET_CONFIG.PLAYOFFS_SHEET || "PlayOffs",
        tournamentId: currentSelectedTournament || "TODOS",
        updatedAt: new Date().toISOString(),
      };

      const serverPromise = fetch(CLOUD_API_ENDPOINTS.BRACKET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverPayload),
      }).catch((e) => {
        console.warn(
          "[PositionTable.js] Guardado en servidor API /api/bracket omitido:",
          e,
        );
        return null;
      });

      // 3. Preparar el payload plano y estructurado para la hoja "PlayOffs" en Google Sheets
      const gasPayload = {
        action: "savePlayOffs",
        sheetName: SHEET_CONFIG.PLAYOFFS_SHEET || "PlayOffs",
        tournamentId: currentSelectedTournament || "TODOS",
        bracketData: bracketState,
        rows: playoffRows,
        updatedAt: new Date().toISOString(),
      };

      // Guardar en Google Apps Script si fue acción explícita del usuario o evento relevante
      let gasSuccess = false;
      let gasError = "";

      try {
        const gasRes = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(gasPayload),
        });

        if (gasRes.ok) {
          const gasData = await gasRes.json().catch(() => null);
          if (gasData && (gasData.status === "success" || gasData.ok)) {
            gasSuccess = true;
          }
        }
      } catch (err) {
        console.warn(
          "[PositionTable.js] Envío a Google Apps Script (PlayOffs):",
          err,
        );
        gasError = err.message;
      }

      await serverPromise;

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (showToastFeedback) {
        if (gasSuccess) {
          updateCloudStatus(
            "success",
            `Guardado en ${SHEET_CONFIG.PLAYOFFS_SHEET} (${timeStr})`,
          );
          showToast(
            `¡Cuadro de PlayOffs guardado con éxito en la hoja "${SHEET_CONFIG.PLAYOFFS_SHEET}" (${playoffRows.length} filas con ID) y sincronizado para todos los dispositivos!`,
            "success",
          );
        } else {
          updateCloudStatus("success", `Sincronizado en Servidor (${timeStr})`);
          showToast(
            `Cuadro de PlayOffs guardado con éxito (${playoffRows.length} filas con ID) y sincronizado en el servidor para laptop, PC, tablet y teléfono.`,
            "success",
          );
        }
      }
    } catch (e) {
      console.warn("[PositionTable.js] Error al guardar bracketState:", e);
      if (showToastFeedback) {
        showToast(
          "Error al guardar cuadro eliminatorio: " + e.message,
          "error",
        );
      }
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML =
          originalBtnHTML ||
          `<i class="fa-solid fa-floppy-disk"></i> <span>Guardar en PlayOffs</span>`;
      }
    }
  }

  /**
   * Helper para renderizar y capturar el cuadro de PlayOffs en un canvas de ultra alta definición (DPR 2x/3x)
   */
  async function captureBracketCanvas(scaleFactor = 2.5) {
    const bracketElement = document.querySelector(".bracket-board-card");
    if (!bracketElement) {
      throw new Error(
        "No se encontró el tablero del cuadro de PlayOffs para capturar.",
      );
    }

    // Clonar el contenedor para asegurar proporciones perfectas, eliminar márgenes interactivos y bordes
    const clone = bracketElement.cloneNode(true);
    clone.style.width = "1440px";
    clone.style.minWidth = "1440px";
    clone.style.maxWidth = "1440px";
    clone.style.margin = "0 auto";
    clone.style.boxSizing = "border-box";
    clone.style.background =
      "linear-gradient(180deg, #090e1a 0%, #060913 50%, #03050a 100%)";
    clone.style.borderRadius = "14px";
    clone.style.padding = "24px 28px 36px";
    clone.style.overflow = "visible";
    clone.style.boxShadow = "none";

    // Ocultar botones de interacción (avanzar llave, definir campeón) para una captura deportiva limpia
    const actionBtns = clone.querySelectorAll(
      ".btn-advance-winner, .btn-define-champ",
    );
    actionBtns.forEach((b) => (b.style.display = "none"));

    // Envolver en un contenedor offscreen
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-9999px";
    wrapper.style.top = "0";
    wrapper.style.width = "1440px";
    wrapper.style.background = "#03050a";
    wrapper.style.padding = "20px";
    wrapper.style.zIndex = "-9999";
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      const html2canvasFn =
        window.html2canvas ||
        (window.html2pdf && typeof window.html2pdf === "function"
          ? window.html2pdf().html2canvas
          : null);

      if (!html2canvasFn) {
        throw new Error(
          "La librería de captura html2canvas no está disponible.",
        );
      }

      const canvas = await html2canvasFn(clone, {
        scale: scaleFactor,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#03050a",
        scrollY: 0,
        scrollX: 0,
        windowWidth: 1480,
      });

      return canvas;
    } finally {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    }
  }

  /**
   * Captura el cuadro de PlayOffs en alta definición y lo descarga directamente como imagen PNG
   */
  async function exportBracketToImage() {
    const btnImage = document.getElementById("btn-export-image-bracket");
    const originalBtnHtml = btnImage ? btnImage.innerHTML : "";

    if (btnImage) {
      btnImage.disabled = true;
      btnImage.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Generando Imagen...</span>`;
    }

    try {
      showToast(
        "Tomando captura de pantalla en alta resolución del cuadro de PlayOffs...",
        "info",
      );

      const canvas = await captureBracketCanvas(2.5);

      const tournamentName = (
        currentSelectedTournament || "FIBA_EUROBASKET"
      ).replace(/\s+/g, "_");
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `PlayOffs_Cuadro_${tournamentName}_${dateStr}.png`;

      // Crear enlace para descarga directa
      const dataUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = dataUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      showToast(
        `¡Captura de pantalla HD descargada con éxito como "${filename}"!`,
        "success",
      );
    } catch (err) {
      console.error("[PositionTable.js] Error al exportar Imagen HD:", err);
      showToast(
        "Ocurrió un error al generar la imagen: " + err.message,
        "error",
      );
    } finally {
      if (btnImage) {
        btnImage.disabled = false;
        btnImage.innerHTML =
          originalBtnHtml ||
          `<i class="fa-solid fa-camera"></i> <span>Descargar Imagen HD</span>`;
      }
    }
  }

  /**
   * Captura el cuadro de PlayOffs y lo ajusta exactamente a 1 SOLA HOJA en formato PDF
   */
  async function exportBracketToPdf() {
    const btnPdf = document.getElementById("btn-export-pdf-bracket");
    const originalBtnHtml = btnPdf ? btnPdf.innerHTML : "";

    if (btnPdf) {
      btnPdf.disabled = true;
      btnPdf.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Ajustando a 1 Hoja PDF...</span>`;
    }

    try {
      showToast(
        "Generando captura y ajustando a 1 sola hoja de PDF...",
        "info",
      );

      const canvas = await captureBracketCanvas(2.0);

      const tournamentName = (
        currentSelectedTournament || "FIBA_EUROBASKET"
      ).replace(/\s+/g, "_");
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `PlayOffs_Cuadro_${tournamentName}_${dateStr}.pdf`;

      const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;

      if (jsPDFClass) {
        // Crear documento PDF apaisado (Landscape A4: 297mm x 210mm)
        const pdf = new jsPDFClass({
          orientation: "landscape",
          unit: "mm",
          format: "a4",
          compress: true,
        });

        const pageWidth = pdf.internal.pageSize.getWidth(); // 297 mm
        const pageHeight = pdf.internal.pageSize.getHeight(); // 210 mm

        // Márgenes finos para maximizar el cuadro en la hoja única
        const marginX = 8; // 8mm a cada lado
        const marginY = 8; // 8mm arriba y abajo
        const maxPrintWidth = pageWidth - marginX * 2; // 281 mm
        const maxPrintHeight = pageHeight - marginY * 2; // 194 mm

        const canvasRatio = canvas.width / canvas.height;
        let printWidth = maxPrintWidth;
        let printHeight = printWidth / canvasRatio;

        // Si la altura supera el límite de la página, escalar proporcionalmente por altura
        if (printHeight > maxPrintHeight) {
          printHeight = maxPrintHeight;
          printWidth = printHeight * canvasRatio;
        }

        // Centrado exacto dentro de la hoja única
        const posX = (pageWidth - printWidth) / 2;
        const posY = (pageHeight - printHeight) / 2;

        // Fondo oscuro para emparejar los márgenes con la estética deportiva
        pdf.setFillColor(3, 5, 10);
        pdf.rect(0, 0, pageWidth, pageHeight, "F");

        const imgData = canvas.toDataURL("image/jpeg", 0.96);
        pdf.addImage(
          imgData,
          "JPEG",
          posX,
          posY,
          printWidth,
          printHeight,
          undefined,
          "FAST",
        );

        pdf.save(filename);
        showToast(
          "¡Cuadro de PlayOffs ajustado y descargado en 1 sola hoja PDF con éxito!",
          "success",
        );
      } else if (window.html2pdf) {
        // Alternativa con html2pdf configurado con fit-to-page
        const opt = {
          margin: 6,
          filename: filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#03050a",
            windowWidth: 1480,
          },
          jsPDF: {
            unit: "mm",
            format: "a4",
            orientation: "landscape",
            compress: true,
          },
        };
        const bracketEl = document.querySelector(".bracket-board-card");
        await window.html2pdf().set(opt).from(bracketEl).save();
        showToast("¡Cuadro de PlayOffs descargado en PDF!", "success");
      } else {
        window.print();
      }
    } catch (err) {
      console.error("[PositionTable.js] Error al exportar PDF:", err);
      showToast("Ocurrió un error al generar el PDF: " + err.message, "error");
    } finally {
      if (btnPdf) {
        btnPdf.disabled = false;
        btnPdf.innerHTML =
          originalBtnHtml ||
          `<i class="fa-solid fa-file-pdf"></i> <span>Descargar PDF</span>`;
      }
    }
  }

  /**
   * Carga el estado del bracket desde el servidor centralizado o Google Sheets
   * para permitir visualizar la información actualizada en cualquier dispositivo o navegador
   */
  async function loadBracketState(customId = null, userTriggered = true) {
    let loaded = false;
    let tournamentLabel = "";

    const btnLoad = document.getElementById("btn-load-bracket");
    const originalBtnHTML = btnLoad ? btnLoad.innerHTML : "";
    if (userTriggered && btnLoad) {
      btnLoad.disabled = true;
      btnLoad.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Cargando...</span>`;
    }

    updateCloudStatus(
      "syncing",
      customId
        ? `Cargando PlayOffs (ID: ${customId})...`
        : "Cargando PlayOffs de la Nube...",
    );

    // 1. Cargar desde la API del servidor central (persistencia compartida para todos los equipos)
    try {
      const url = customId
        ? `${CLOUD_API_ENDPOINTS.BRACKET_URL}?id=${encodeURIComponent(customId)}&t=${Date.now()}`
        : `${CLOUD_API_ENDPOINTS.BRACKET_URL}?t=${Date.now()}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();

        // Si tenemos datos estructurados de bracket
        if (data && data.bracketData && typeof data.bracketData === "object") {
          bracketState = { ...bracketState, ...data.bracketData };
          tournamentLabel =
            data.tournamentName || data.tournamentId || customId || "";
          localStorage.setItem(
            "KNOCKOUT_BRACKET_STATE",
            JSON.stringify(bracketState),
          );
          loaded = true;
        }

        // Si tenemos filas tabulares con ID de la hoja PlayOffs
        if (data && Array.isArray(data.rows) && data.rows.length > 0) {
          const rowsApplied = reconstructBracketFromRows(data.rows);
          if (rowsApplied) {
            tournamentLabel =
              data.tournamentName || data.tournamentId || customId || "";
            localStorage.setItem(
              "KNOCKOUT_BRACKET_STATE",
              JSON.stringify(bracketState),
            );
            loaded = true;
          }
        }
      }
    } catch (e) {
      console.warn(
        "[PositionTable.js] Carga de bracket desde servidor falló:",
        e,
      );
    }

    // 2. Si no hay datos en servidor, consultar la nube en Google Sheets (Hoja PlayOffs)
    if (!loaded) {
      try {
        const gasUrl = customId
          ? `${SCRIPT_URL}?sheetName=${encodeURIComponent(
              SHEET_CONFIG.PLAYOFFS_SHEET || "PlayOffs",
            )}&action=getAll&keyColumn=ID&keyValue=${encodeURIComponent(customId)}&t=${Date.now()}`
          : `${SCRIPT_URL}?sheetName=${encodeURIComponent(
              SHEET_CONFIG.PLAYOFFS_SHEET || "PlayOffs",
            )}&action=getAll&keyColumn=ID&keyValue=all&t=${Date.now()}`;

        const gasRes = await fetch(gasUrl);
        if (gasRes.ok) {
          const gasData = await gasRes.json().catch(() => null);

          if (
            gasData &&
            gasData.bracketData &&
            typeof gasData.bracketData === "object"
          ) {
            bracketState = { ...bracketState, ...gasData.bracketData };
            tournamentLabel = customId || "";
            localStorage.setItem(
              "KNOCKOUT_BRACKET_STATE",
              JSON.stringify(bracketState),
            );
            loaded = true;
          } else if (
            gasData &&
            (Array.isArray(gasData.records) || Array.isArray(gasData.rows))
          ) {
            const rowList = gasData.records || gasData.rows;
            const rowsRebuilt = reconstructBracketFromRows(rowList);
            if (rowsRebuilt) {
              tournamentLabel = customId || "";
              localStorage.setItem(
                "KNOCKOUT_BRACKET_STATE",
                JSON.stringify(bracketState),
              );
              loaded = true;
            }
          }
        }
      } catch (err) {
        console.warn(
          "[PositionTable.js] Carga de bracket desde Google Sheets:",
          err,
        );
      }
    }

    // 3. Fallback: LocalStorage
    if (!loaded && !customId) {
      const stored = localStorage.getItem("KNOCKOUT_BRACKET_STATE");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            bracketState = { ...bracketState, ...parsed };
            loaded = true;
          }
        } catch (err) {}
      }
    }

    // Sincronizar campos de UI
    const formatSelect = document.getElementById("bracket-format-select");
    if (formatSelect && bracketState.format) {
      formatSelect.value = bracketState.format;
    }
    const finalDate = document.getElementById("final-event-date");
    if (finalDate && bracketState.date) finalDate.innerText = bracketState.date;
    const finalVenue = document.getElementById("final-event-venue");
    if (finalVenue && bracketState.venue)
      finalVenue.innerText = bracketState.venue;
    const finalCity = document.getElementById("final-event-city");
    if (finalCity && bracketState.city) finalCity.innerText = bracketState.city;

    renderBracket();

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (loaded) {
      updateCloudStatus("success", `PlayOffs cargados (${timeStr})`);
      if (userTriggered) {
        showToast(
          `¡Cuadro de PlayOffs cargado con éxito! ${tournamentLabel ? `Torneo: ${tournamentLabel}` : customId ? `ID: ${customId}` : "Configuración sincronizada."}`,
          "success",
        );
      }
      closeLoadBracketModal();
    } else {
      updateCloudStatus("idle", `Listo (${timeStr})`);
      if (userTriggered) {
        showToast(
          customId
            ? `No se encontraron registros de PlayOffs para el ID "${customId}". Verifique el ID o cree una nueva llave.`
            : "No hay configuración previa de PlayOffs guardada. Puede asignar equipos o sembrar desde la tabla.",
          "warning",
        );
      }
    }

    if (userTriggered && btnLoad) {
      btnLoad.disabled = false;
      btnLoad.innerHTML =
        originalBtnHTML ||
        `<i class="fa-solid fa-cloud-arrow-down"></i> <span>Cargar PlayOffs por ID</span>`;
    }

    return loaded;
  }

  // =========================================================================
  // 14. CONTROLADOR DEL MODAL PARA CARGAR PLAYOFFS POR CAMPO ID
  // =========================================================================
  function setupLoadBracketModalEvents() {
    const modal = document.getElementById("load-bracket-modal");
    const btnClose = document.getElementById("btn-close-load-bracket-modal");
    const btnCancel = document.getElementById("btn-modal-cancel-load-bracket");
    const backdrop = document.getElementById("load-bracket-backdrop");
    const btnDoLoad = document.getElementById("btn-modal-do-load-bracket");
    const btnLoadLatest = document.getElementById(
      "btn-modal-load-latest-bracket",
    );
    const idInput = document.getElementById("load-bracket-id-input");

    if (btnClose) btnClose.addEventListener("click", closeLoadBracketModal);
    if (btnCancel) btnCancel.addEventListener("click", closeLoadBracketModal);
    if (backdrop) backdrop.addEventListener("click", closeLoadBracketModal);

    if (btnDoLoad && idInput) {
      btnDoLoad.addEventListener("click", () => {
        const queryId = idInput.value.trim();
        if (!queryId) {
          showToast(
            "Por favor ingrese un ID de Torneo o ID de llave para cargar.",
            "warning",
          );
          idInput.focus();
          return;
        }
        loadBracketState(queryId, true);
      });

      idInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const queryId = idInput.value.trim();
          if (queryId) {
            loadBracketState(queryId, true);
          }
        }
      });
    }

    if (btnLoadLatest) {
      btnLoadLatest.addEventListener("click", () => {
        loadBracketState(null, true);
      });
    }
  }

  function openLoadBracketModal() {
    const modal = document.getElementById("load-bracket-modal");
    const idInput = document.getElementById("load-bracket-id-input");
    if (!modal) return;

    if (idInput) {
      idInput.value = currentSelectedTournament || "";
      setTimeout(() => idInput.focus(), 150);
    }

    modal.classList.add("is-active");
    fetchSavedBracketsHistory();
  }

  function closeLoadBracketModal() {
    const modal = document.getElementById("load-bracket-modal");
    if (modal) modal.classList.remove("is-active");
  }

  async function fetchSavedBracketsHistory() {
    const container = document.getElementById("modal-saved-brackets-list");
    if (!container) return;

    container.innerHTML = `
      <div class="text-muted p-3 text-center" id="saved-brackets-loading-state">
        <i class="fa-solid fa-spinner fa-spin mr-1"></i> Consultando versiones de PlayOffs en el servidor...
      </div>
    `;

    try {
      const res = await fetch(`/api/bracket/list?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          renderSavedBracketsList(data.items);
          return;
        }
      }
    } catch (e) {
      console.warn(
        "[PositionTable.js] Falló consulta de historial de PlayOffs:",
        e,
      );
    }

    // Si no hay historial en servidor, renderizar estado vacío con opción de cargar torneos registrados
    if (allTournamentsList && allTournamentsList.length > 0) {
      const defaultItems = allTournamentsList.map((t) => ({
        id: t.id,
        tournamentId: t.id,
        tournamentName: t.name || t.id,
        format: "16",
        championName: "--",
        matchCount: 15,
        updatedAt: new Date().toISOString(),
      }));
      renderSavedBracketsList(defaultItems);
    } else {
      container.innerHTML = `
        <div class="text-muted p-3 text-center">
          <i class="fa-solid fa-circle-info mr-1 text-gold"></i> No hay versiones previas guardadas en el historial. Puede guardar una nueva con el botón "Guardar en PlayOffs".
        </div>
      `;
    }
  }

  function renderSavedBracketsList(items) {
    const container = document.getElementById("modal-saved-brackets-list");
    if (!container) return;

    container.innerHTML = items
      .map((item) => {
        const formatLabel =
          item.format === "8"
            ? "Cuartos (8 equipos)"
            : item.format === "4"
              ? "Semis (4 equipos)"
              : item.format === "2"
                ? "Final (2 equipos)"
                : "Octavos (16 equipos)";
        const dateStr = item.updatedAt
          ? new Date(item.updatedAt).toLocaleDateString([], {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        const cleanId = item.id || item.tournamentId || "TODOS";

        return `
          <div class="history-bracket-card">
            <div class="history-bracket-info">
              <div class="history-bracket-title">
                <span class="history-bracket-badge"><i class="fa-solid fa-id-badge"></i> ${escapeHtml(cleanId)}</span>
                <span>${escapeHtml(item.tournamentName || item.tournamentId || "Torneo General")}</span>
              </div>
              <div class="history-bracket-meta">
                <span class="mr-2"><i class="fa-solid fa-sliders text-gold"></i> ${formatLabel}</span>
                ${item.championName && item.championName !== "--" ? `<span class="mr-2 text-gold"><i class="fa-solid fa-trophy"></i> Campeón: ${escapeHtml(item.championName)}</span>` : ""}
                ${dateStr ? `<span class="text-muted"><i class="fa-regular fa-clock"></i> ${dateStr}</span>` : ""}
              </div>
            </div>
            <button type="button" class="btn-history-load-action" data-load-id="${escapeHtml(cleanId)}">
              <i class="fa-solid fa-download"></i> Cargar
            </button>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll("[data-load-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-load-id");
        if (targetId) {
          loadBracketState(targetId, true);
        }
      });
    });
  }

  // Exponer utilidades para carga por ID en consola si se requiere
  window.loadPlayOffBracketById = loadBracketState;
  window.savePlayOffBracket = () => saveBracketState(true, true);
})();
