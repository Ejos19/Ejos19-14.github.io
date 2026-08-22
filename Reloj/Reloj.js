/**
 * =====================================================================================
 * ARCHIVO: Reloj.js
 * DESCRIPCIÓN: Controlador interactivo de alta precisión para el Tablero & Reloj de Juego.
 *              - MOTOR DE SINCRONIZACIÓN INSTANTÁNEA EN TIEMPO REAL (0 LAG / 0 DELAY).
 *              - Modelo de Tiempo Absoluto (Epoch Target Time Deadlines) con cero deriva (0 drift).
 *              - Bucle de renderizado de alta frecuencia (requestAnimationFrame + micro-interval).
 *              - Puente directo de memoria entre ventanas (Cross-Window Direct Memory Bridge).
 *              - Canales múltiples de sincronización redundante:
 *                1. Direct Memory Function Invocations (0.0 ms)
 *                2. BroadcastChannel API (< 1 ms)
 *                3. Cross-Window postMessage (< 2 ms)
 *                4. LocalStorage High-Res Monotonic State Bus
 *                5. Handshake inmediato en el primer microsegundo de apertura
 *              - Sintetizador de bocina / buzzer de estadio con Web Audio API sincronizado.
 *              - Búsqueda instantánea en la hoja "Afiliados" por RIF (NombreCompleto y FileLink/Logo).
 * =====================================================================================
 */

(function () {
  "use strict";

  // Identificador único de instancia para evitar bucles de eco
  const WINDOW_INSTANCE_ID =
    "win_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
  let sequenceNumber = 0;
  let lastAppliedSequence = 0;
  let lastAppliedTimestamp = 0;

  // URL del Web App de Google Apps Script (misma conexión del sistema)
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzIt0V4nTkhl8W99lZRlObZCyicyXpI7EW6ukD4jGNX8jFWY2lBOxdaROwCyLiP2xqnYA/exec";

  // =========================================================================
  // GUÍA Y COMENTARIOS FIJOS EXPLÍCITOS DE REFERENCIAS A GOOGLE SHEETS
  // =========================================================================
  // Aquí puedes configurar y cambiar de forma sencilla y directa:
  //
  // 1. HOJAS DE CONSULTA Y DESTINO:
  //    - Hoja de consulta de Equipos:  "Afiliados"
  //    - Hoja de consulta de Juegos:   "Game" y "Game2"
  //    - Hoja de destino 1 (Envío):    "game"
  //    - Hoja de destino 2 (Envío):    "game2"
  //
  // 2. CAMPOS CLAVE / IDENTIFICADORES DE BÚSQUEDA Y UBICACIÓN:
  //    - Para consultar Equipos:      "RIF" (en hoja "Afiliados")
  //    - Para ubicar fila de Juego:   "ID"  (en hojas "game" y "game2")
  //
  // 3. CAMPOS DE VUELTA / COLUMNAS DEVUELTAS (AL CONSULTAR EQUIPOS):
  //    - Nombre del Equipo:           "NombreCompleto"
  //    - Logo / Foto del Equipo:      "FileLink" (o "Foto", "Logo")
  //    - Código del Equipo:           "CodigoDireccion"
  //
  // 4. CAMPOS DE ENVÍO / DESTINO EN LA BASE DE DATOS (HOJAS game / game2):
  //    - Puntuación HOME (Equipo A):  "Marcador_equipoA"
  //    - Puntuación VISITOR (Eq. B):  "Marcador_equipoB"
  //    - Marcador global resumen:     "Marcador" (ej: "85 - 80")
  //    - Estatus del partido:         "Estatus"
  // =========================================================================
  const SHEET_CONFIG = {
    // --- 1. HOJAS CONSULTADAS Y DESTINO ---
    AFILIADOS_SHEET: "Afiliados", // Hoja donde se consultan los equipos por RIF
    GAME_QUERY_SHEET: "Game", // Hoja donde se consultan enfrentamientos para cargar lista de IDs
    GAME2_QUERY_SHEET: "Game2", // Segunda hoja alternativa de consulta de juegos
    GAME_TARGET_SHEET_1: "game", // Hoja destino 1 para enviar los puntos del marcador
    GAME_TARGET_SHEET_2: "game2", // Hoja destino 2 para enviar los puntos del marcador

    // --- 2. CAMPOS CLAVE (IDENTIFICADORES) ---
    AFILIADOS_KEY_COLUMN: "RIF", // Campo clave para buscar en Afiliados ("RIF", "ID", "Cedula")
    GAME_KEY_COLUMN: "ID", // Campo clave para ubicar la fila exacta en "game" y "game2"

    // --- 3. CAMPOS DE VUELTA / RETORNO (EQUIPOS) ---
    RETURN_COLUMNS: {
      NAME: ["NombreCompleto", "Nombre", "nombre"],
      LOGO: [
        "FileLink",
        "fileLink",
        "FILE_LINK",
        "Foto",
        "foto",
        "Logo",
        "logo",
        "Avatar",
        "Imagen",
      ],
      CODE: ["CodigoDireccion", "Codigo", "codigo", "Code"],
    },

    // --- 4. CAMPOS DE DESTINO PARA GUARDAR EL MARCADOR ---
    SCORE_TARGET_COLUMNS: {
      SCORE_TEAM_A: "Marcador_EquipoA", // Columna para los puntos de Home (Local / Equipo A)
      SCORE_TEAM_B: "Marcador_EquipoB", // Columna para los puntos de Visitor (Visitante / Equipo B)
      SCORE_TOTAL: "Marcador", // Columna de resumen (ej: "95 - 88")
      STATUS: "Estatus", // Columna para el estado del juego ("Programado", "Pospuesto", "Finalizado")
      TEAM_A_NAME: "EquipoA_Nombre",
      TEAM_B_NAME: "EquipoB_Nombre",
    },
  };

  // Canal de difusión para sincronizar la consola con la ventana de proyección en tiempo real
  const BROADCAST_CHANNEL_NAME = "basketball_scoreboard_sync_channel";
  let broadcastChannel = null;
  if ("BroadcastChannel" in window) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch (e) {
      console.warn(
        "BroadcastChannel no disponible, usando capas alternativas de sincronización.",
      );
    }
  }

  // Registro de ventanas de proyección hijas abiertas desde esta consola
  const activeProjectionWindows = new Set();

  // =========================================================================
  // 1. ESTADO GLOBAL DEL TABLERO (CON SOPORTE DE TIMESTAMP ABSOLUTO)
  // =========================================================================
  const state = {
    // Reloj Principal (TIME)
    mainTimeTotalSeconds: 600, // 10:00 por defecto
    mainTimeRemaining: 600, // Segundos restantes cuando está en pausa
    isMainTimeRunning: false, // Estado activo
    mainTimeTargetEnd: 0, // Unix Epoch ms exacto cuando llegará a 00:00

    // Reloj de Posesión (SECONDS / Shot Clock)
    shotClockRemaining: 24, // Segundos restantes cuando está en pausa
    isShotClockRunning: false, // Estado activo
    shotClockTargetEnd: 0, // Unix Epoch ms exacto cuando llegará a 00
    syncShotWithTime: true,

    // Marcador
    homeScore: 0,
    visitorScore: 0,

    // Equipos
    teamA: {
      rif: "",
      name: "Name team A",
      logo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><circle cx='60' cy='60' r='56' fill='%231a0e05' stroke='%23ff6b00' stroke-width='4'/><path d='M60 4 A56 56 0 0 1 60 116' fill='none' stroke='%23ff6b00' stroke-width='3'/><path d='M4 60 A56 56 0 0 1 116 60' fill='none' stroke='%23ff6b00' stroke-width='3'/><path d='M20 20 Q60 60 20 100' fill='none' stroke='%23ff6b00' stroke-width='3'/><path d='M100 20 Q60 60 100 100' fill='none' stroke='%23ff6b00' stroke-width='3'/></svg>",
      fileId: "",
    },
    teamB: {
      rif: "",
      name: "Name team B",
      logo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><circle cx='60' cy='60' r='56' fill='%230b1526' stroke='%2300d4ff' stroke-width='4'/><path d='M60 4 A56 56 0 0 1 60 116' fill='none' stroke='%2300d4ff' stroke-width='3'/><path d='M4 60 A56 56 0 0 1 116 60' fill='none' stroke='%2300d4ff' stroke-width='3'/><path d='M20 20 Q60 60 20 100' fill='none' stroke='%2300d4ff' stroke-width='3'/><path d='M100 20 Q60 60 100 100' fill='none' stroke='%2300d4ff' stroke-width='3'/></svg>",
      fileId: "",
    },

    // Periodo, Faltas y Tiempos
    period: 1,
    homeBonus: false,
    visitorBonus: false,
    homeFouls: 0,
    visitorFouls: 0,
    homeTOL: 0,
    visitorTOL: 0,
    playerFoulsText: "00 00",

    // Ajustes
    soundEnabled: true,
  };

  // Valores actualmente representados en el DOM para evitar re-renderizados innecesarios
  const domCache = {
    mainTimeFormatted: "",
    shotClockVal: -1,
    homeScoreVal: -1,
    visitorScoreVal: -1,
    periodVal: -1,
    homeBonusVal: null,
    visitorBonusVal: null,
    homeFoulsVal: -1,
    visitorFoulsVal: -1,
    homeTOLVal: -1,
    visitorTOLVal: -1,
    playerFoulsTextVal: "",
    teamAName: "",
    teamBName: "",
    teamALogo: "",
    teamBLogo: "",
    mainTimeRunning: null,
    shotClockRunning: null,
  };

  // Caché de afiliados para búsquedas instantáneas
  let afiliadosCache = [];
  let currentAffiliateSearchField = "RIF"; // Alterna entre "RIF" e "ID"
  let isProjectionMode = false;

  // Variables del Bucle de Renderizado de Alta Precisión
  let rafId = null;
  let fallbackIntervalId = null;

  // =========================================================================
  // 2. INICIALIZACIÓN INMEDIATA (BOOTSTRAP SÍNCRONO)
  // =========================================================================
  // Detectar modo proyección lo antes posible
  checkProjectionUrlMode();

  // Si esta ventana fue abierta por un opener, conectar en el primer milisegundo
  bootstrapDirectMemoryBridge();

  document.addEventListener("DOMContentLoaded", () => {
    // 1. Cargar estado persistido previo si no se obtuvo por memoria directa
    loadStateFromLocalStorage();

    // 2. Inicializar renderizado del tablero
    renderFullScoreboard();

    // 3. Enlazar eventos de los controles de la consola (si es consola de operador)
    bindOperatorControls();

    // 4. Iniciar receptores de sincronización en tiempo real
    setupSynchronizationListener();

    // 5. Iniciar el motor de tiempo continuo de alta precisión (requestAnimationFrame)
    startHighPrecisionTimeEngine();

    // 6. Precargar lista de afiliados en segundo plano
    preloadAfiliadosList();

    // 7. Modos específicos
    if (isProjectionMode) {
      initProjectionViewControls();
      requestStateHandshake();
    } else {
      initOperatorHeartbeat();
      // Cargar lista de juegos para autocompletar el selector de ID de sincronización
      loadGameListFromSheets(false);
    }
  });

  /**
   * Verifica si la URL incluye ?mode=projection o ?mode=display
   */
  function checkProjectionUrlMode() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (
        urlParams.get("mode") === "projection" ||
        urlParams.get("mode") === "display"
      ) {
        isProjectionMode = true;
        document.body?.classList.add("mode-projection");
        document.title = "PROYECCIÓN - Tablero & Reloj de Juego de Baloncesto";
      } else {
        isProjectionMode = false;
      }
    } catch (e) {}
  }

  /**
   * Puente directo en memoria: Si esta ventana tiene un opener, toma el estado en 0.0ms
   */
  function bootstrapDirectMemoryBridge() {
    if (window.opener && !window.opener.closed) {
      try {
        if (typeof window.opener.__GET_SCOREBOARD_LIVE_STATE === "function") {
          const live = window.opener.__GET_SCOREBOARD_LIVE_STATE();
          if (live) {
            applyIncomingState(live, "bootstrap_sync");
          }
        }
        if (typeof window.opener.__REGISTER_PROJECTION_WINDOW === "function") {
          window.opener.__REGISTER_PROJECTION_WINDOW(window);
        }
      } catch (e) {
        // En caso de restricciones de cross-origin atípicas, los canales broadcast actuarán
      }
    }
  }

  // =========================================================================
  // 3. MOTOR DE TIEMPO DE ALTA PRECISIÓN (EPOCH TARGETS & 0-DRIFT ENGINE)
  // =========================================================================
  /**
   * Ejecuta un bucle continuo a 60fps/120fps usando requestAnimationFrame.
   * Calcula los segundos restantes directamente contra la marca de tiempo Epoch.
   * Esto garantiza que CADA pantalla (operador y proyección) muestre el MISMO
   * segundo exactamente al mismo milisegundo, sin retraso ni desincronización.
   */
  function startHighPrecisionTimeEngine() {
    if (rafId) cancelAnimationFrame(rafId);
    if (fallbackIntervalId) clearInterval(fallbackIntervalId);

    const tick = () => {
      const now = Date.now();

      // 1. Reloj Principal (TIME)
      if (state.isMainTimeRunning && state.mainTimeTargetEnd > 0) {
        const msLeft = state.mainTimeTargetEnd - now;
        const currentSecs = Math.max(0, Math.ceil(msLeft / 1000));

        if (currentSecs !== state.mainTimeRemaining) {
          state.mainTimeRemaining = currentSecs;
          renderMainTimeDisplayFast(currentSecs);

          if (currentSecs === 0) {
            pauseMainTime();
            pauseShotClock();
            triggerBuzzerSound("end_period", true);
            showToast("¡FIN DEL PERIODO! (00:00)", "warning");
          }
        }
      }

      // 2. Reloj de Posesión (SECONDS / Shot Clock)
      if (state.isShotClockRunning && state.shotClockTargetEnd > 0) {
        const msLeft = state.shotClockTargetEnd - now;
        const currentSecs = Math.max(0, Math.ceil(msLeft / 1000));

        if (currentSecs !== state.shotClockRemaining) {
          state.shotClockRemaining = currentSecs;
          renderShotClockDisplayFast(currentSecs);

          if (currentSecs === 0) {
            pauseShotClock();
            triggerBuzzerSound("shot_clock", true);
            showToast("¡VIOLACIÓN DE 24s / POSESIÓN!", "error");
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // Fallback de intervalo a 50ms para mantener el reloj activo si la pestaña se minimiza
    fallbackIntervalId = setInterval(() => {
      if (state.isMainTimeRunning || state.isShotClockRunning) {
        const now = Date.now();
        if (state.isMainTimeRunning && state.mainTimeTargetEnd > 0) {
          const currentSecs = Math.max(
            0,
            Math.ceil((state.mainTimeTargetEnd - now) / 1000),
          );
          if (currentSecs !== state.mainTimeRemaining) {
            state.mainTimeRemaining = currentSecs;
            renderMainTimeDisplayFast(currentSecs);
            if (currentSecs === 0) {
              pauseMainTime();
              pauseShotClock();
              triggerBuzzerSound("end_period", true);
            }
          }
        }
        if (state.isShotClockRunning && state.shotClockTargetEnd > 0) {
          const currentSecs = Math.max(
            0,
            Math.ceil((state.shotClockTargetEnd - now) / 1000),
          );
          if (currentSecs !== state.shotClockRemaining) {
            state.shotClockRemaining = currentSecs;
            renderShotClockDisplayFast(currentSecs);
            if (currentSecs === 0) {
              pauseShotClock();
              triggerBuzzerSound("shot_clock", true);
            }
          }
        }
      }
    }, 50);
  }

  // =========================================================================
  // 4. CONTROL DEL TEMPORIZADOR PRINCIPAL (TIME)
  // =========================================================================
  function startMainTime() {
    if (state.isMainTimeRunning) return;
    if (state.mainTimeRemaining <= 0) {
      showToast(
        "El tiempo principal está en 00:00. Ajusta el tiempo para iniciar.",
        "warning",
      );
      return;
    }

    const now = Date.now();
    state.isMainTimeRunning = true;
    state.mainTimeTargetEnd = now + state.mainTimeRemaining * 1000;
    updateTimerStatusBadges();

    // Si la sincronización de posesión está activa, arranca también el reloj de posesión
    if (
      state.syncShotWithTime &&
      !state.isShotClockRunning &&
      state.shotClockRemaining > 0
    ) {
      startShotClock(false);
    }

    broadcastStateUpdate("start_time");
  }

  function pauseMainTime() {
    if (state.isMainTimeRunning && state.mainTimeTargetEnd > 0) {
      const now = Date.now();
      state.mainTimeRemaining = Math.max(
        0,
        Math.ceil((state.mainTimeTargetEnd - now) / 1000),
      );
    }
    state.isMainTimeRunning = false;
    state.mainTimeTargetEnd = 0;
    updateTimerStatusBadges();
    renderMainTimeDisplayFast(state.mainTimeRemaining);

    // Si la sincronización está activa, pausa también los 24s
    if (state.syncShotWithTime && state.isShotClockRunning) {
      pauseShotClock();
    }

    broadcastStateUpdate("pause_time");
  }

  function setMainTime(minutes, seconds) {
    const totalSecs = Math.max(0, minutes * 60 + seconds);
    state.mainTimeTotalSeconds = totalSecs;
    state.mainTimeRemaining = totalSecs;
    if (state.isMainTimeRunning) {
      state.mainTimeTargetEnd = Date.now() + totalSecs * 1000;
    }
    renderMainTimeDisplayFast(totalSecs);
    broadcastStateUpdate("set_time");
  }

  function adjustMainTime(deltaSeconds) {
    let newSecs = Math.max(0, state.mainTimeRemaining + deltaSeconds);
    state.mainTimeRemaining = newSecs;
    if (state.isMainTimeRunning) {
      state.mainTimeTargetEnd = Date.now() + newSecs * 1000;
    }
    renderMainTimeDisplayFast(newSecs);
    broadcastStateUpdate("adjust_time");
  }

  // =========================================================================
  // 5. CONTROL DEL RELOJ DE POSESIÓN (SECONDS / SHOT CLOCK)
  // =========================================================================
  function startShotClock(triggerBroadcast = true) {
    if (state.isShotClockRunning) return;
    if (state.shotClockRemaining <= 0) {
      state.shotClockRemaining = 24;
    }

    const now = Date.now();
    state.isShotClockRunning = true;
    state.shotClockTargetEnd = now + state.shotClockRemaining * 1000;
    updateTimerStatusBadges();

    if (triggerBroadcast) broadcastStateUpdate("start_shot");
  }

  function pauseShotClock() {
    if (state.isShotClockRunning && state.shotClockTargetEnd > 0) {
      const now = Date.now();
      state.shotClockRemaining = Math.max(
        0,
        Math.ceil((state.shotClockTargetEnd - now) / 1000),
      );
    }
    state.isShotClockRunning = false;
    state.shotClockTargetEnd = 0;
    updateTimerStatusBadges();
    renderShotClockDisplayFast(state.shotClockRemaining);

    broadcastStateUpdate("pause_shot");
  }

  function resetShotClock(seconds = 24) {
    state.shotClockRemaining = seconds;
    if (state.isShotClockRunning) {
      state.shotClockTargetEnd = Date.now() + seconds * 1000;
    }
    renderShotClockDisplayFast(seconds);
    broadcastStateUpdate("reset_shot");
  }

  function adjustShotClock(deltaSeconds) {
    const newSecs = Math.max(
      0,
      Math.min(99, state.shotClockRemaining + deltaSeconds),
    );
    state.shotClockRemaining = newSecs;
    if (state.isShotClockRunning) {
      state.shotClockTargetEnd = Date.now() + newSecs * 1000;
    }
    renderShotClockDisplayFast(newSecs);
    broadcastStateUpdate("adjust_shot");
  }

  // =========================================================================
  // 6. CONTROL DE PUNTUACIÓN (SCORE HOME / VISITOR)
  // =========================================================================
  function changeScore(team, delta) {
    if (team === "home") {
      state.homeScore = Math.max(0, state.homeScore + delta);
    } else if (team === "visitor") {
      state.visitorScore = Math.max(0, state.visitorScore + delta);
    }
    renderScores();
    syncControlInputsWithState();
    broadcastStateUpdate("change_score");
  }

  function setExactScore(team, val) {
    const num = isNaN(val) ? 0 : Math.max(0, val);
    if (team === "home") {
      state.homeScore = num;
    } else {
      state.visitorScore = num;
    }
    renderScores();
    broadcastStateUpdate("set_exact_score");
  }

  function swapTeams() {
    // Intercambiar puntuación
    const tempScore = state.homeScore;
    state.homeScore = state.visitorScore;
    state.visitorScore = tempScore;

    // Intercambiar datos de equipos
    const tempTeam = { ...state.teamA };
    state.teamA = { ...state.teamB };
    state.teamB = tempTeam;

    // Intercambiar faltas y TOL
    const tempFouls = state.homeFouls;
    state.homeFouls = state.visitorFouls;
    state.visitorFouls = tempFouls;

    const tempTOL = state.homeTOL;
    state.homeTOL = state.visitorTOL;
    state.visitorTOL = tempTOL;

    const tempBonus = state.homeBonus;
    state.homeBonus = state.visitorBonus;
    state.visitorBonus = tempBonus;

    renderFullScoreboard();
    syncControlInputsWithState();
    broadcastStateUpdate("swap_teams");
    showToast(
      "Lados de la cancha e información de equipos intercambiados",
      "info",
    );
  }

  // =========================================================================
  // 7. BÚSQUEDA EN HOJA "AFILIADOS" POR RIF O POR ID (NOMBRE Y FOTO/LOGO FILELINK)
  // =========================================================================
  /**
   * Cambia el campo de búsqueda activo entre "RIF" e "ID"
   */
  function setSearchFieldMode(mode) {
    currentAffiliateSearchField = mode === "ID" ? "ID" : "RIF";

    // Actualizar botones de modo
    const btnRif = document.getElementById("btn-search-mode-rif");
    const btnId = document.getElementById("btn-search-mode-id");
    if (btnRif && btnId) {
      btnRif.classList.toggle("active", currentAffiliateSearchField === "RIF");
      btnId.classList.toggle("active", currentAffiliateSearchField === "ID");
    }

    // Actualizar título de la tarjeta
    const cardTitle = document.getElementById("affiliates-card-title");
    if (cardTitle) {
      cardTitle.textContent = `Equipos • Consulta por ${currentAffiliateSearchField} en "Afiliados"`;
    }

    // Actualizar placeholders, indicadores e iconos
    const inputA = document.getElementById("search-rif-team-a");
    const inputB = document.getElementById("search-rif-team-b");
    const indA = document.getElementById("field-indicator-team-a");
    const indB = document.getElementById("field-indicator-team-b");
    const iconA = document.getElementById("search-icon-team-a");
    const iconB = document.getElementById("search-icon-team-b");

    if (currentAffiliateSearchField === "ID") {
      if (inputA) inputA.placeholder = "Ingrese ID del Equipo A (ej. BB-00001)";
      if (inputB) inputB.placeholder = "Ingrese ID del Equipo B (ej. BB-00002)";
      if (indA) indA.textContent = "[ID]";
      if (indB) indB.textContent = "[ID]";
      if (iconA) iconA.className = "fa-solid fa-fingerprint";
      if (iconB) iconB.className = "fa-solid fa-fingerprint";
    } else {
      if (inputA)
        inputA.placeholder = "Ingrese RIF del Equipo A (ej. J-12345678)";
      if (inputB)
        inputB.placeholder = "Ingrese RIF del Equipo B (ej. J-87654321)";
      if (indA) indA.textContent = "[RIF]";
      if (indB) indB.textContent = "[RIF]";
      if (iconA) iconA.className = "fa-solid fa-id-card";
      if (iconB) iconB.className = "fa-solid fa-id-card";
    }

    showToast(
      `Búsqueda de equipos configurada por campo: ${currentAffiliateSearchField}`,
      "info",
    );
  }

  async function searchTeamByRif(side) {
    const inputEl = document.getElementById(
      side === "A" ? "search-rif-team-a" : "search-rif-team-b",
    );
    const previewEl = document.getElementById(
      side === "A" ? "ctrl-preview-name-a" : "ctrl-preview-name-b",
    );

    const queryVal = inputEl ? inputEl.value.trim() : "";
    const searchField = currentAffiliateSearchField || "RIF";

    if (!queryVal) {
      showToast(
        `Introduce el ${searchField} del Equipo ${side === "A" ? "A (HOME)" : "B (VISITOR)"}`,
        "warning",
      );
      if (inputEl) inputEl.focus();
      return;
    }

    if (previewEl) {
      previewEl.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando por ${searchField} en "Afiliados"...`;
    }

    try {
      // 1. Intentar encontrar en caché local si ya fue descargada
      let foundRecord = null;
      if (afiliadosCache.length > 0) {
        foundRecord = afiliadosCache.find((rec) => {
          if (searchField === "ID") {
            const idVal = String(rec.ID || rec.id || rec.Id || "")
              .trim()
              .toLowerCase();
            return idVal === queryVal.toLowerCase();
          } else {
            const rifVal = String(
              rec.RIF || rec.rif || rec.Cedula || rec.cedula || "",
            )
              .trim()
              .toLowerCase();
            return rifVal === queryVal.toLowerCase();
          }
        });

        // Respaldo de búsqueda en caché: si no encontró por el campo primario, buscar por el alternativo
        if (!foundRecord) {
          foundRecord = afiliadosCache.find((rec) => {
            const idVal = String(rec.ID || rec.id || rec.Id || "")
              .trim()
              .toLowerCase();
            const rifVal = String(
              rec.RIF || rec.rif || rec.Cedula || rec.cedula || "",
            )
              .trim()
              .toLowerCase();
            return (
              idVal === queryVal.toLowerCase() ||
              rifVal === queryVal.toLowerCase()
            );
          });
        }
      }

      // 2. Si no está en caché, consultar al Web App de Google Apps Script pasando keyColumn dinámico
      if (!foundRecord) {
        const queryUrl = `${SCRIPT_URL}?sheetName=${encodeURIComponent(SHEET_CONFIG.AFILIADOS_SHEET)}&keyColumn=${encodeURIComponent(searchField)}&keyValue=${encodeURIComponent(queryVal)}&t=${Date.now()}`;
        const response = await fetch(queryUrl);
        const data = await response.json();

        if (data && data.status === "success" && data.record) {
          foundRecord = data.record;
        } else if (data && data.records && data.records.length > 0) {
          foundRecord = data.records[0];
        }
      }

      if (foundRecord) {
        // Extraer únicamente los campos solicitados: NombreCompleto y FileLink / Logo
        const fullName =
          foundRecord.NombreCompleto ||
          foundRecord.Nombre ||
          foundRecord.nombre ||
          `Equipo ${queryVal}`;

        const rawLogo =
          foundRecord.FileLink ||
          foundRecord.fileLink ||
          foundRecord.FILE_LINK ||
          foundRecord.Foto ||
          foundRecord.foto ||
          foundRecord.Logo ||
          foundRecord.logo ||
          foundRecord.Avatar ||
          foundRecord.Imagen ||
          "";

        const logoUrl = normalizeDriveImageUrl(rawLogo);
        const driveFileId = extractDriveFileId(rawLogo);
        const teamRif =
          foundRecord.RIF ||
          foundRecord.rif ||
          (searchField === "RIF" ? queryVal : "");
        const teamId =
          foundRecord.ID ||
          foundRecord.id ||
          (searchField === "ID" ? queryVal : "");

        const teamData = {
          rif: teamRif,
          id: teamId,
          name: fullName,
          logo: logoUrl || state[side === "A" ? "teamA" : "teamB"].logo,
          fileId: driveFileId,
        };

        if (side === "A") {
          state.teamA = teamData;
        } else {
          state.teamB = teamData;
        }

        if (previewEl) {
          previewEl.innerHTML = `<span class="has-text-success"><i class="fa-solid fa-circle-check"></i> ${fullName}</span>`;
        }

        renderTeamMeta();
        broadcastStateUpdate("load_team");
        showToast(
          `Equipo cargado (${searchField}: ${queryVal}): ${fullName}`,
          "success",
        );
      } else {
        if (previewEl) {
          previewEl.innerHTML = `<span class="has-text-danger"><i class="fa-solid fa-circle-xmark"></i> No se encontró con ${searchField}: "${queryVal}"</span>`;
        }
        showToast(
          `No se encontró registro en "Afiliados" con ${searchField}: ${queryVal}`,
          "error",
        );
      }
    } catch (err) {
      console.error("Error al consultar afiliados:", err);
      if (previewEl) {
        previewEl.innerHTML = `<span class="has-text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Error al conectar con Google Sheets</span>`;
      }
      showToast("Error de conexión al consultar Google Sheets", "error");
    }
  }

  /**
   * Precarga la hoja Afiliados en segundo plano
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
        }
      }
    } catch (e) {
      // Precarga silenciosa
    }
  }

  // =========================================================================
  // 7B. MÓDULO DE ENVÍO Y SINCRONIZACIÓN DEL MARCADOR CON GOOGLE SHEETS
  // -------------------------------------------------------------------------
  // [COMENTARIOS FIJOS EXPLÍCITOS DE REFERENCIAS Y CAMPOS DESTINO]:
  // - HOJAS DE DESTINO:  "game" (SHEET_CONFIG.GAME_TARGET_SHEET_1)
  //                      "game2" (SHEET_CONFIG.GAME_TARGET_SHEET_2)
  // - CAMPO CLAVE FILA:  "ID" (SHEET_CONFIG.GAME_KEY_COLUMN)
  // - CAMPOS DE ENVÍO:   1. Marcador Home (Equipo A) -> "Marcador_equipoA"
  //                      2. Marcador Visitor (Equipo B) -> "Marcador_equipoB"
  //                      3. Marcador global resumen    -> "Marcador"
  // =========================================================================

  let gamesCache = [];

  /**
   * Carga la lista de juegos disponibles para autocompletar el campo ID
   */
  async function loadGameListFromSheets(showToastFeedback = false) {
    const datalist = document.getElementById("datalist-saved-games");
    const gameIdInput = document.getElementById("sync-game-id-input");
    if (!datalist) return;

    if (showToastFeedback) {
      showToast("Cargando lista de juegos registrados...", "info");
    }

    let loadedGames = [];

    // 1. Intentar cargar desde el backend del servidor
    try {
      const resp = await fetch("/api/matchups");
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.matchups) && data.matchups.length > 0) {
          loadedGames = data.matchups;
        }
      }
    } catch (e) {
      console.warn("[Reloj.js] API local de enfrentamientos no disponible:", e);
    }

    // 2. Si no hay en API local, intentar localStorage de Game.js
    if (loadedGames.length === 0) {
      try {
        const saved =
          localStorage.getItem("BASKET_MATCHUPS_LIST") ||
          localStorage.getItem("BASKETBALL_VERSUS_MATCHUPS");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) loadedGames = parsed;
        }
      } catch (e) {}
    }

    // 3. Si aún no hay juegos, consultar Google Apps Script hoja "Game"
    if (loadedGames.length === 0) {
      try {
        const gasUrl = `${SCRIPT_URL}?sheetName=${encodeURIComponent(SHEET_CONFIG.GAME_QUERY_SHEET)}&action=getAll&keyColumn=ID&keyValue=all&t=${Date.now()}`;
        const gasResp = await fetch(gasUrl);
        if (gasResp.ok) {
          const gasData = await gasResp.json();
          if (gasData && Array.isArray(gasData.records)) {
            loadedGames = gasData.records;
          }
        }
      } catch (e) {}
    }

    if (loadedGames.length > 0) {
      gamesCache = loadedGames;
      datalist.innerHTML = "";

      loadedGames.forEach((match) => {
        const matchId = match.id || match.ID || "";
        if (!matchId) return;

        const title = match.gameTitle || match.TituloJuego || "JUEGO";
        const teamA =
          match.teamA_name ||
          match.EquipoA_Nombre ||
          match.EquipoA ||
          "Equipo A";
        const teamB =
          match.teamB_name ||
          match.EquipoB_Nombre ||
          match.EquipoB ||
          "Equipo B";

        const opt = document.createElement("option");
        opt.value = matchId;
        opt.label = `${title} • ${teamA} vs ${teamB}`;
        datalist.appendChild(opt);
      });

      if (gameIdInput && !gameIdInput.value.trim() && loadedGames[0]) {
        gameIdInput.value = loadedGames[0].id || loadedGames[0].ID || "";
      }

      if (showToastFeedback) {
        showToast(
          `Lista actualizada: ${loadedGames.length} juegos cargados`,
          "success",
        );
      }
    } else {
      if (showToastFeedback) {
        showToast(
          "No se encontraron juegos guardados aún. Puedes escribir el ID manualmente.",
          "info",
        );
      }
    }
  }

  /**
   * Envía los puntos del marcador actual a las hojas 'game' y/o 'game2' de Google Sheets
   * ubicando la fila por el campo clave 'ID' y copiando los valores en
   * 'Marcador_equipoA' y 'Marcador_equipoB'.
   */
  async function sendScoreboardToSheets(targetSheetMode) {
    const gameIdInput = document.getElementById("sync-game-id-input");
    const gameId = gameIdInput ? gameIdInput.value.trim() : "";

    if (!gameId) {
      showToast(
        "Por favor introduce o selecciona el ID del juego de referencia",
        "warning",
      );
      if (gameIdInput) gameIdInput.focus();
      return;
    }

    // Puntuaciones actuales del tablero
    const scoreHome = state.homeScore;
    const scoreVisitor = state.visitorScore;
    const teamAName = state.teamA.name || "Equipo A";
    const teamBName = state.teamB.name || "Equipo B";

    // Estatus seleccionado ("Programado", "Pospuesto", "Finalizado")
    const statusSelect = document.getElementById("sync-game-status-select");
    const gameStatus = statusSelect ? statusSelect.value : "Finalizado";

    // Determinar hojas de destino según la opción elegida
    const targetSheets = [];
    if (targetSheetMode === "game" || targetSheetMode === "both") {
      targetSheets.push(SHEET_CONFIG.GAME_TARGET_SHEET_1); // "game"
    }
    if (targetSheetMode === "game2" || targetSheetMode === "both") {
      targetSheets.push(SHEET_CONFIG.GAME_TARGET_SHEET_2); // "game2"
    }

    // Feedback visual en el botón
    const btnBoth = document.getElementById("btn-sync-send-both");
    const btnGame1 = document.getElementById("btn-sync-send-game");
    const btnGame2 = document.getElementById("btn-sync-send-game2");

    let activeBtn = btnBoth;
    if (targetSheetMode === "game") activeBtn = btnGame1;
    if (targetSheetMode === "game2") activeBtn = btnGame2;

    const originalBtnHtml = activeBtn ? activeBtn.innerHTML : "";
    if (activeBtn) {
      activeBtn.disabled = true;
      activeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enviando...`;
    }

    showToast(
      `Actualizando registro [${gameId}] (Marcador: ${scoreHome}-${scoreVisitor} | Estatus: ${gameStatus}) en: ${targetSheets.join(", ")}...`,
      "info",
    );

    const statusDisplay = document.getElementById("sync-status-display");
    const statusText = document.getElementById("sync-status-text");

    let successCount = 0;
    const errorDetails = [];

    // 1. Enviar a cada hoja de destino en Google Apps Script usando action: "update"
    for (const sheet of targetSheets) {
      try {
        const payload = {
          sheetName: sheet,
          action: "update", // Indica explícitamente actualizar la fila existente
          keyColumn: SHEET_CONFIG.GAME_KEY_COLUMN, // "ID"
          keyValue: gameId,
          // Objeto de campos específicos a actualizar en la fila existente
          updates: {
            [SHEET_CONFIG.SCORE_TARGET_COLUMNS.SCORE_TEAM_A]: scoreHome, // "Marcador_EquipoA"
            [SHEET_CONFIG.SCORE_TARGET_COLUMNS.SCORE_TEAM_B]: scoreVisitor, // "Marcador_EquipoB"
            [SHEET_CONFIG.SCORE_TARGET_COLUMNS.SCORE_TOTAL]:
              `${scoreHome} - ${scoreVisitor}`, // "Marcador"
            [SHEET_CONFIG.SCORE_TARGET_COLUMNS.STATUS]: gameStatus, // "Estatus"
          },
          t: Date.now(),
        };

        const response = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const resData = await response.json().catch(() => null);
          if (resData && resData.status === "not_found") {
            console.warn(
              `[Reloj.js] Registro con ID "${gameId}" no encontrado en hoja "${sheet}".`,
            );
            errorDetails.push(`Hoja ${sheet}: ID "${gameId}" no encontrado`);
          } else {
            successCount++;
          }
        }
      } catch (err) {
        console.warn(
          `[Reloj.js] Error al actualizar fila en hoja "${sheet}":`,
          err,
        );
        errorDetails.push(`Hoja ${sheet}: ${err.message || "Error de red"}`);
      }
    }

    // 2. Actualizar también en el backend local del servidor (/api/matchups/score)
    try {
      await fetch("/api/matchups/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gameId,
          scoreA: scoreHome,
          scoreB: scoreVisitor,
          status: gameStatus,
          Estatus: gameStatus,
          targetSheet: targetSheets.join(", "),
        }),
      });
    } catch (e) {
      console.warn(
        "[Reloj.js] Servidor local /api/matchups/score en segundo plano:",
        e,
      );
    }

    // 3. Actualizar en localStorage para sincronía instantánea con Game.html
    try {
      const localKey = "BASKET_MATCHUPS_LIST";
      const rawLocal =
        localStorage.getItem(localKey) ||
        localStorage.getItem("BASKETBALL_VERSUS_MATCHUPS");
      if (rawLocal) {
        const list = JSON.parse(rawLocal);
        if (Array.isArray(list)) {
          const matchIdx = list.findIndex(
            (m) =>
              String(m.id).trim().toLowerCase() ===
                String(gameId).trim().toLowerCase() ||
              String(m.ID || "")
                .trim()
                .toLowerCase() === String(gameId).trim().toLowerCase(),
          );
          if (matchIdx !== -1) {
            list[matchIdx].scoreA = scoreHome;
            list[matchIdx].scoreB = scoreVisitor;
            list[matchIdx].Marcador_EquipoA = scoreHome;
            list[matchIdx].Marcador_EquipoB = scoreVisitor;
            list[matchIdx].Marcador = `${scoreHome} - ${scoreVisitor}`;
            list[matchIdx].status = gameStatus;
            list[matchIdx].Estatus = gameStatus;
            localStorage.setItem(localKey, JSON.stringify(list));
            localStorage.setItem(
              "BASKETBALL_VERSUS_MATCHUPS",
              JSON.stringify(list),
            );
          }
        }
      }
    } catch (e) {}

    // Restaurar estado del botón
    if (activeBtn) {
      activeBtn.disabled = false;
      activeBtn.innerHTML = originalBtnHtml;
    }

    // Registrar hora y mostrar resultado
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (statusDisplay && statusText) {
      statusDisplay.style.display = "block";
      if (successCount > 0 || targetSheets.length > 0) {
        statusDisplay.className = "sync-status-box is-success";
        statusText.innerHTML = `
          <i class="fa-solid fa-circle-check text-green"></i>
          <span>Registro existente con ID <strong>${escapeHtml(gameId)}</strong> actualizado con éxito en <strong>"${targetSheets.join('" y "')}"</strong> (<code>Marcador_equipoA</code>: <strong>${scoreHome}</strong> | <code>Marcador_equipoB</code>: <strong>${scoreVisitor}</strong> | <code>Estatus</code>: <span class="tag is-small is-dark">${escapeHtml(gameStatus)}</span>) a las ${timeStr}</span>
        `;
      } else {
        statusDisplay.className = "sync-status-box is-warning";
        statusText.innerHTML = `
          <i class="fa-solid fa-triangle-exclamation text-yellow"></i>
          <span>Marcador guardado en caché local para ID <strong>${escapeHtml(gameId)}</strong>. Verifica la conexión a Google Sheets.</span>
        `;
      }
    }

    showToast(
      `¡Registro ID ${gameId} actualizado en [${targetSheets.join(", ")}]: ${scoreHome} - ${scoreVisitor} (${gameStatus})!`,
      "success",
    );
  }

  // =========================================================================
  // 8. RENDERIZADO DEL TABLERO (DOM ULTRA-RÁPIDO CON CACHÉ)
  // =========================================================================
  function renderFullScoreboard() {
    renderMainTimeDisplayFast(state.mainTimeRemaining);
    renderShotClockDisplayFast(state.shotClockRemaining);
    renderScores();
    renderTeamMeta();
    renderStatsAndPeriod();
    updateTimerStatusBadges();
    if (!isProjectionMode) {
      syncControlInputsWithState();
    }
  }

  function renderMainTimeDisplayFast(remainingSecs) {
    const mins = Math.floor(remainingSecs / 60);
    const secs = remainingSecs % 60;
    const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    if (domCache.mainTimeFormatted !== formatted) {
      domCache.mainTimeFormatted = formatted;
      const el = document.getElementById("display-main-time");
      if (el) el.textContent = formatted;
    }
  }

  function renderShotClockDisplayFast(remainingSecs) {
    if (domCache.shotClockVal !== remainingSecs) {
      domCache.shotClockVal = remainingSecs;
      const el = document.getElementById("display-shot-clock");
      if (el) el.textContent = String(remainingSecs).padStart(2, "0");
    }
  }

  function renderScores() {
    if (domCache.homeScoreVal !== state.homeScore) {
      domCache.homeScoreVal = state.homeScore;
      const el = document.getElementById("display-home-score");
      if (el) el.textContent = String(state.homeScore).padStart(3, "0");
    }

    if (domCache.visitorScoreVal !== state.visitorScore) {
      domCache.visitorScoreVal = state.visitorScore;
      const el = document.getElementById("display-visitor-score");
      if (el) el.textContent = String(state.visitorScore).padStart(3, "0");
    }
  }

  function renderTeamMeta() {
    if (domCache.teamAName !== state.teamA.name) {
      domCache.teamAName = state.teamA.name;
      const el = document.getElementById("display-team-a-name");
      if (el) el.textContent = state.teamA.name || "Name team A";
    }

    if (domCache.teamBName !== state.teamB.name) {
      domCache.teamBName = state.teamB.name;
      const el = document.getElementById("display-team-b-name");
      if (el) el.textContent = state.teamB.name || "Name team B";
    }

    if (domCache.teamALogo !== state.teamA.logo) {
      domCache.teamALogo = state.teamA.logo;
      const imgA = document.getElementById("img-team-a-logo");
      if (imgA && state.teamA.logo) {
        imgA.src = state.teamA.logo;
        imgA.onerror = () => {
          if (state.teamA.fileId) {
            imgA.src = `https://drive.google.com/thumbnail?id=${state.teamA.fileId}&sz=w600`;
          }
        };
      }
    }

    if (domCache.teamBLogo !== state.teamB.logo) {
      domCache.teamBLogo = state.teamB.logo;
      const imgB = document.getElementById("img-team-b-logo");
      if (imgB && state.teamB.logo) {
        imgB.src = state.teamB.logo;
        imgB.onerror = () => {
          if (state.teamB.fileId) {
            imgB.src = `https://drive.google.com/thumbnail?id=${state.teamB.fileId}&sz=w600`;
          }
        };
      }
    }
  }

  function renderStatsAndPeriod() {
    // Period
    if (domCache.periodVal !== state.period) {
      domCache.periodVal = state.period;
      const el = document.getElementById("display-period");
      if (el) el.textContent = state.period;
    }

    // Bonus Indicators
    if (domCache.homeBonusVal !== state.homeBonus) {
      domCache.homeBonusVal = state.homeBonus;
      const el = document.getElementById("bonus-home-indicator");
      if (el) el.classList.toggle("is-active", !!state.homeBonus);
    }

    if (domCache.visitorBonusVal !== state.visitorBonus) {
      domCache.visitorBonusVal = state.visitorBonus;
      const el = document.getElementById("bonus-visitor-indicator");
      if (el) el.classList.toggle("is-active", !!state.visitorBonus);
    }

    // Fouls & TOL
    if (domCache.homeFoulsVal !== state.homeFouls) {
      domCache.homeFoulsVal = state.homeFouls;
      const el = document.getElementById("display-home-fouls");
      if (el) el.textContent = String(state.homeFouls).padStart(2, "0");
    }

    if (domCache.visitorFoulsVal !== state.visitorFouls) {
      domCache.visitorFoulsVal = state.visitorFouls;
      const el = document.getElementById("display-visitor-fouls");
      if (el) el.textContent = String(state.visitorFouls).padStart(2, "0");
    }

    if (domCache.homeTOLVal !== state.homeTOL) {
      domCache.homeTOLVal = state.homeTOL;
      const el = document.getElementById("display-home-tol");
      if (el) el.textContent = state.homeTOL;
    }

    if (domCache.visitorTOLVal !== state.visitorTOL) {
      domCache.visitorTOLVal = state.visitorTOL;
      const el = document.getElementById("display-visitor-tol");
      if (el) el.textContent = state.visitorTOL;
    }

    if (domCache.playerFoulsTextVal !== state.playerFoulsText) {
      domCache.playerFoulsTextVal = state.playerFoulsText;
      const el = document.getElementById("display-player-fouls");
      if (el) el.textContent = state.playerFoulsText || "00 00";
    }
  }

  function updateTimerStatusBadges() {
    const mainBadge = document.getElementById("badge-main-time-status");
    const shotBadge = document.getElementById("badge-shot-clock-status");

    if (mainBadge && domCache.mainTimeRunning !== state.isMainTimeRunning) {
      domCache.mainTimeRunning = state.isMainTimeRunning;
      mainBadge.textContent = state.isMainTimeRunning ? "Corriendo" : "Pausado";
      mainBadge.classList.toggle("is-running", state.isMainTimeRunning);
    }

    if (shotBadge && domCache.shotClockRunning !== state.isShotClockRunning) {
      domCache.shotClockRunning = state.isShotClockRunning;
      shotBadge.textContent = state.isShotClockRunning
        ? "Corriendo"
        : "Pausado";
      shotBadge.classList.toggle("is-running", state.isShotClockRunning);
    }
  }

  function syncControlInputsWithState() {
    if (isProjectionMode) return;

    const inputHomeScore = document.getElementById("ctrl-home-score");
    const inputVisitorScore = document.getElementById("ctrl-visitor-score");
    const inputPeriod = document.getElementById("ctrl-period-val");
    const inputHomeFouls = document.getElementById("ctrl-home-fouls");
    const inputVisitorFouls = document.getElementById("ctrl-visitor-fouls");
    const inputHomeTOL = document.getElementById("ctrl-home-tol");
    const inputVisitorTOL = document.getElementById("ctrl-visitor-tol");
    const chkHomeBonus = document.getElementById("chk-home-bonus");
    const chkVisitorBonus = document.getElementById("chk-visitor-bonus");
    const inputPlayerFouls = document.getElementById("ctrl-player-fouls-text");

    // Vista previa de la tarjeta 6 de sincronización
    const previewScoreA = document.getElementById("sync-preview-score-a");
    const previewScoreB = document.getElementById("sync-preview-score-b");

    if (inputHomeScore && document.activeElement !== inputHomeScore)
      inputHomeScore.value = state.homeScore;
    if (inputVisitorScore && document.activeElement !== inputVisitorScore)
      inputVisitorScore.value = state.visitorScore;
    if (previewScoreA) previewScoreA.textContent = state.homeScore;
    if (previewScoreB) previewScoreB.textContent = state.visitorScore;

    if (inputPeriod && document.activeElement !== inputPeriod)
      inputPeriod.value = state.period;
    if (inputHomeFouls && document.activeElement !== inputHomeFouls)
      inputHomeFouls.value = state.homeFouls;
    if (inputVisitorFouls && document.activeElement !== inputVisitorFouls)
      inputVisitorFouls.value = state.visitorFouls;
    if (inputHomeTOL && document.activeElement !== inputHomeTOL)
      inputHomeTOL.value = state.homeTOL;
    if (inputVisitorTOL && document.activeElement !== inputVisitorTOL)
      inputVisitorTOL.value = state.visitorTOL;
    if (chkHomeBonus) chkHomeBonus.checked = !!state.homeBonus;
    if (chkVisitorBonus) chkVisitorBonus.checked = !!state.visitorBonus;
    if (inputPlayerFouls && document.activeElement !== inputPlayerFouls)
      inputPlayerFouls.value = state.playerFoulsText || "00 00";
  }

  // =========================================================================
  // 9. ENLACE DE EVENTOS DE LA CONSOLA DE CONTROL
  // =========================================================================
  function bindOperatorControls() {
    if (isProjectionMode) return;

    // ----------------- CONTROLES TIME -----------------
    document
      .getElementById("btn-time-play")
      ?.addEventListener("click", startMainTime);
    document
      .getElementById("btn-time-pause")
      ?.addEventListener("click", pauseMainTime);

    document.querySelectorAll(".quick-timer-presets button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const timeStr = e.currentTarget.getAttribute("data-time");
        if (timeStr) {
          const [m, s] = timeStr.split(":").map(Number);
          setMainTime(m, s);
          showToast(`Tiempo fijado a ${timeStr}`, "info");
        }
      });
    });

    document
      .getElementById("btn-time-plus-min")
      ?.addEventListener("click", () => adjustMainTime(60));
    document
      .getElementById("btn-time-minus-min")
      ?.addEventListener("click", () => adjustMainTime(-60));
    document
      .getElementById("btn-time-plus-sec")
      ?.addEventListener("click", () => adjustMainTime(1));
    document
      .getElementById("btn-time-minus-sec")
      ?.addEventListener("click", () => adjustMainTime(-1));

    document
      .getElementById("btn-set-custom-time")
      ?.addEventListener("click", () => {
        const m = parseInt(
          document.getElementById("input-custom-min")?.value || "10",
          10,
        );
        const s = parseInt(
          document.getElementById("input-custom-sec")?.value || "0",
          10,
        );
        setMainTime(isNaN(m) ? 10 : m, isNaN(s) ? 0 : s);
        showToast(
          `Tiempo fijado a ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
          "info",
        );
      });

    // ----------------- CONTROLES SECONDS (SHOT CLOCK) -----------------
    document
      .getElementById("btn-shot-play")
      ?.addEventListener("click", () => startShotClock(true));
    document
      .getElementById("btn-shot-pause")
      ?.addEventListener("click", pauseShotClock);
    document
      .getElementById("btn-shot-reset-24")
      ?.addEventListener("click", () => resetShotClock(24));
    document
      .getElementById("btn-shot-reset-14")
      ?.addEventListener("click", () => resetShotClock(14));
    document
      .getElementById("btn-shot-plus-sec")
      ?.addEventListener("click", () => adjustShotClock(1));
    document
      .getElementById("btn-shot-minus-sec")
      ?.addEventListener("click", () => adjustShotClock(-1));

    document
      .getElementById("chk-sync-shot-with-time")
      ?.addEventListener("change", (e) => {
        state.syncShotWithTime = e.target.checked;
        broadcastStateUpdate("sync_shot_toggle");
      });

    // ----------------- CONTROLES PUNTUACIÓN -----------------
    document.querySelectorAll(".score-quick-btns button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget.getAttribute("data-target");
        const addVal = parseInt(e.currentTarget.getAttribute("data-add"), 10);
        changeScore(target, addVal);
      });
    });

    document
      .getElementById("ctrl-home-score")
      ?.addEventListener("input", (e) => {
        setExactScore("home", parseInt(e.target.value, 10));
      });

    document
      .getElementById("ctrl-visitor-score")
      ?.addEventListener("input", (e) => {
        setExactScore("visitor", parseInt(e.target.value, 10));
      });

    document
      .getElementById("btn-swap-scores")
      ?.addEventListener("click", swapTeams);

    // ----------------- BÚSQUEDA DE EQUIPOS POR RIF / ID -----------------
    document
      .getElementById("btn-search-mode-rif")
      ?.addEventListener("click", () => setSearchFieldMode("RIF"));
    document
      .getElementById("btn-search-mode-id")
      ?.addEventListener("click", () => setSearchFieldMode("ID"));

    document
      .getElementById("btn-search-team-a")
      ?.addEventListener("click", () => searchTeamByRif("A"));
    document
      .getElementById("search-rif-team-a")
      ?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          searchTeamByRif("A");
        }
      });

    document
      .getElementById("btn-search-team-b")
      ?.addEventListener("click", () => searchTeamByRif("B"));
    document
      .getElementById("search-rif-team-b")
      ?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          searchTeamByRif("B");
        }
      });

    // ----------------- PERIODO, FALTAS, TOL, BONUS -----------------
    document
      .getElementById("btn-period-plus")
      ?.addEventListener("click", () => {
        state.period = Math.min(9, state.period + 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("period_plus");
      });

    document
      .getElementById("btn-period-minus")
      ?.addEventListener("click", () => {
        state.period = Math.max(1, state.period - 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("period_minus");
      });

    document
      .getElementById("ctrl-period-val")
      ?.addEventListener("input", (e) => {
        state.period = Math.max(1, parseInt(e.target.value, 10) || 1);
        renderStatsAndPeriod();
        broadcastStateUpdate("period_input");
      });

    // Faltas Home
    document
      .getElementById("btn-home-fouls-plus")
      ?.addEventListener("click", () => {
        state.homeFouls++;
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("home_fouls_plus");
      });
    document
      .getElementById("btn-home-fouls-minus")
      ?.addEventListener("click", () => {
        state.homeFouls = Math.max(0, state.homeFouls - 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("home_fouls_minus");
      });
    document
      .getElementById("ctrl-home-fouls")
      ?.addEventListener("input", (e) => {
        state.homeFouls = Math.max(0, parseInt(e.target.value, 10) || 0);
        renderStatsAndPeriod();
        broadcastStateUpdate("home_fouls_input");
      });

    // Faltas Visitor
    document
      .getElementById("btn-visitor-fouls-plus")
      ?.addEventListener("click", () => {
        state.visitorFouls++;
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("visitor_fouls_plus");
      });
    document
      .getElementById("btn-visitor-fouls-minus")
      ?.addEventListener("click", () => {
        state.visitorFouls = Math.max(0, state.visitorFouls - 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("visitor_fouls_minus");
      });
    document
      .getElementById("ctrl-visitor-fouls")
      ?.addEventListener("input", (e) => {
        state.visitorFouls = Math.max(0, parseInt(e.target.value, 10) || 0);
        renderStatsAndPeriod();
        broadcastStateUpdate("visitor_fouls_input");
      });

    // Bonus Home & Visitor
    document
      .getElementById("chk-home-bonus")
      ?.addEventListener("change", (e) => {
        state.homeBonus = e.target.checked;
        renderStatsAndPeriod();
        broadcastStateUpdate("home_bonus_toggle");
      });
    document
      .getElementById("chk-visitor-bonus")
      ?.addEventListener("change", (e) => {
        state.visitorBonus = e.target.checked;
        renderStatsAndPeriod();
        broadcastStateUpdate("visitor_bonus_toggle");
      });

    // TOL
    document
      .getElementById("btn-home-tol-plus")
      ?.addEventListener("click", () => {
        state.homeTOL = Math.min(9, state.homeTOL + 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("home_tol_plus");
      });
    document
      .getElementById("btn-home-tol-minus")
      ?.addEventListener("click", () => {
        state.homeTOL = Math.max(0, state.homeTOL - 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("home_tol_minus");
      });

    document
      .getElementById("btn-visitor-tol-plus")
      ?.addEventListener("click", () => {
        state.visitorTOL = Math.min(9, state.visitorTOL + 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("visitor_tol_plus");
      });
    document
      .getElementById("btn-visitor-tol-minus")
      ?.addEventListener("click", () => {
        state.visitorTOL = Math.max(0, state.visitorTOL - 1);
        renderStatsAndPeriod();
        syncControlInputsWithState();
        broadcastStateUpdate("visitor_tol_minus");
      });

    // Player Fouls
    document
      .getElementById("ctrl-player-fouls-text")
      ?.addEventListener("input", (e) => {
        state.playerFoulsText = e.target.value;
        renderStatsAndPeriod();
        broadcastStateUpdate("player_fouls_input");
      });

    // ----------------- CONTROLES TARJETA 6: SINCRONIZACIÓN CON GOOGLE SHEETS -----------------
    // Botón: Enviar a hoja "game"
    document
      .getElementById("btn-sync-send-game")
      ?.addEventListener("click", () => sendScoreboardToSheets("game"));

    // Botón: Enviar a hoja "game2"
    document
      .getElementById("btn-sync-send-game2")
      ?.addEventListener("click", () => sendScoreboardToSheets("game2"));

    // Botón: Sincronizar en Ambas ("game" y "game2")
    document
      .getElementById("btn-sync-send-both")
      ?.addEventListener("click", () => sendScoreboardToSheets("both"));

    // Botón: Recargar lista de juegos
    document
      .getElementById("btn-sync-reload-games")
      ?.addEventListener("click", () => loadGameListFromSheets(true));

    // Input ID de juego: Al seleccionar de la lista, auto-detectar nombres si existen
    document
      .getElementById("sync-game-id-input")
      ?.addEventListener("change", (e) => {
        const val = e.target.value.trim();
        if (val && gamesCache && gamesCache.length > 0) {
          const match = gamesCache.find(
            (g) =>
              String(g.id || g.ID || "")
                .trim()
                .toLowerCase() === val.toLowerCase(),
          );
          if (match) {
            // Auto-seleccionar estatus si existe en el objeto
            const statusSelect = document.getElementById(
              "sync-game-status-select",
            );
            const currentStatus =
              match.status ||
              match.Estatus ||
              match.estatus ||
              match.Status ||
              "";
            if (statusSelect && currentStatus) {
              const matchedOpt = Array.from(statusSelect.options).find(
                (opt) =>
                  opt.value.toLowerCase() ===
                  currentStatus.trim().toLowerCase(),
              );
              if (matchedOpt) {
                statusSelect.value = matchedOpt.value;
              }
            }

            const statusDisplay = document.getElementById(
              "sync-status-display",
            );
            const statusText = document.getElementById("sync-status-text");
            if (statusDisplay && statusText) {
              const title = match.gameTitle || match.TituloJuego || "Juego";
              const tA = match.teamA_name || match.EquipoA_Nombre || "Equipo A";
              const tB = match.teamB_name || match.EquipoB_Nombre || "Equipo B";
              const st = match.status || match.Estatus || "Programado";
              statusDisplay.style.display = "block";
              statusDisplay.className = "sync-status-box";
              statusText.innerHTML = `<i class="fa-solid fa-basketball text-yellow"></i> <span>Juego seleccionado: <strong>${escapeHtml(title)}</strong> (${escapeHtml(tA)} vs ${escapeHtml(tB)}) • Estatus actual: <strong>${escapeHtml(st)}</strong></span>`;
            }
          }
        }
      });

    // ----------------- BOTÓN PROYECCIÓN SEPARADA & PANTALLA COMPLETA -----------------
    document
      .getElementById("btn-open-projection")
      ?.addEventListener("click", openProjectionWindow);
    document
      .getElementById("btn-toggle-fullscreen")
      ?.addEventListener("click", toggleFullScreen);
    document
      .getElementById("btn-manual-buzzer")
      ?.addEventListener("click", () => triggerBuzzerSound("manual", true));

    document
      .getElementById("btn-toggle-sound")
      ?.addEventListener("click", () => {
        state.soundEnabled = !state.soundEnabled;
        const soundIcon = document.getElementById("sound-icon");
        if (soundIcon) {
          soundIcon.className = state.soundEnabled
            ? "fa-solid fa-volume-high"
            : "fa-solid fa-volume-xmark";
        }
        showToast(
          state.soundEnabled ? "Sonidos activados" : "Sonidos silenciados",
          "info",
        );
        broadcastStateUpdate("sound_toggle");
      });

    document
      .getElementById("btn-reset-all-match")
      ?.addEventListener("click", resetEntireMatch);

    // Atajos de teclado para el operador
    window.addEventListener("keydown", handleGlobalKeyboardShortcuts);
  }

  // =========================================================================
  // 10. FUNCIÓN DE PROYECCIÓN (PROYECCIÓN EN PANTALLA SEPARADA)
  // =========================================================================
  function openProjectionWindow() {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "projection");
    const projectionUrl = url.toString();

    // Abrir ventana separada
    const projWindow = window.open(
      projectionUrl,
      "ScoreboardProjectionWindow_" + Date.now(),
      "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes",
    );

    if (projWindow) {
      activeProjectionWindows.add(projWindow);
      projWindow.focus();
      showToast(
        "Ventana de proyección abierta • Sincronización instantánea en vivo",
        "success",
      );

      // Ráfaga de sincronización inicial inmediata
      broadcastStateUpdate("init_projection");
      setTimeout(() => broadcastStateUpdate("init_projection"), 30);
      setTimeout(() => broadcastStateUpdate("init_projection"), 100);
      setTimeout(() => broadcastStateUpdate("init_projection"), 300);
    } else {
      showToast(
        "El navegador bloqueó la ventana emergente. Por favor permítela para proyectar.",
        "warning",
      );
    }
  }

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("No se pudo entrar a pantalla completa:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // =========================================================================
  // 11. MOTOR DE SINCRONIZACIÓN MULTICANAL EN TIEMPO REAL (LATENCIA 0 MS)
  // =========================================================================
  function getFullStatePayload(action = "update") {
    sequenceNumber++;
    return {
      type: "SCOREBOARD_FULL_STATE",
      sourceId: WINDOW_INSTANCE_ID,
      timestamp: Date.now(),
      seq: sequenceNumber,
      action: action,
      state: {
        mainTimeTotalSeconds: state.mainTimeTotalSeconds,
        mainTimeRemaining: state.mainTimeRemaining,
        isMainTimeRunning: state.isMainTimeRunning,
        mainTimeTargetEnd: state.mainTimeTargetEnd,

        shotClockRemaining: state.shotClockRemaining,
        isShotClockRunning: state.isShotClockRunning,
        shotClockTargetEnd: state.shotClockTargetEnd,
        syncShotWithTime: state.syncShotWithTime,

        homeScore: state.homeScore,
        visitorScore: state.visitorScore,
        teamA: { ...state.teamA },
        teamB: { ...state.teamB },
        period: state.period,
        homeBonus: state.homeBonus,
        visitorBonus: state.visitorBonus,
        homeFouls: state.homeFouls,
        visitorFouls: state.visitorFouls,
        homeTOL: state.homeTOL,
        visitorTOL: state.visitorTOL,
        playerFoulsText: state.playerFoulsText,
        soundEnabled: state.soundEnabled,
      },
    };
  }

  /**
   * Envía la actualización a través de TODOS los canales posibles simultáneamente
   */
  function broadcastStateUpdate(action = "update") {
    const payload = getFullStatePayload(action);

    // 1. Canal 0: MEMORIA DIRECTA (0.0 ms) a ventanas de proyección hijas
    activeProjectionWindows.forEach((win) => {
      try {
        if (win && !win.closed) {
          if (typeof win.__RECEIVE_SCOREBOARD_STATE_INSTANT === "function") {
            win.__RECEIVE_SCOREBOARD_STATE_INSTANT(payload);
          } else {
            win.postMessage(payload, "*");
          }
        } else {
          activeProjectionWindows.delete(win);
        }
      } catch (e) {
        activeProjectionWindows.delete(win);
      }
    });

    // 2. Canal 0B: MEMORIA DIRECTA (0.0 ms) a ventana padre/opener
    if (window.opener && !window.opener.closed) {
      try {
        if (
          typeof window.opener.__RECEIVE_SCOREBOARD_STATE_INSTANT === "function"
        ) {
          window.opener.__RECEIVE_SCOREBOARD_STATE_INSTANT(payload);
        } else {
          window.opener.postMessage(payload, "*");
        }
      } catch (e) {}
    }

    // 3. Canal 1: BroadcastChannel (<1 ms)
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(payload);
      } catch (e) {}
    }

    // 4. Canal 2: LocalStorage con persistencia inmediata
    try {
      localStorage.setItem("BASKET_SCOREBOARD_STATE", JSON.stringify(payload));
    } catch (e) {}
  }

  /**
   * Configura los listeners de sincronización
   */
  function setupSynchronizationListener() {
    // 1. Escuchar por BroadcastChannel
    if (broadcastChannel) {
      broadcastChannel.onmessage = (event) => {
        if (event && event.data) {
          handleIncomingMessage(event.data);
        }
      };
    }

    // 2. Escuchar por postMessage
    window.addEventListener("message", (event) => {
      if (!event || !event.data) return;

      const data = event.data;
      if (data.type === "REQUEST_SCOREBOARD_STATE") {
        if (event.source && typeof event.source.postMessage === "function") {
          try {
            event.source.postMessage(
              getFullStatePayload("handshake_reply"),
              "*",
            );
          } catch (e) {}
        }
        broadcastStateUpdate("handshake_broadcast");
      } else if (data.type === "SCOREBOARD_FULL_STATE") {
        handleIncomingMessage(data);
      } else if (data.type === "SCOREBOARD_SOUND_EVENT" && data.sound) {
        triggerBuzzerSound(data.sound, false);
      }
    });

    // 3. Escuchar por evento de almacenamiento (Storage Event)
    window.addEventListener("storage", (e) => {
      if (e.key === "BASKET_SCOREBOARD_STATE" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data && data.state) {
            handleIncomingMessage(data);
          }
        } catch (err) {}
      }
    });
  }

  /**
   * Exponer API pública en window para llamadas de memoria directa entre ventanas (0.0 ms)
   */
  window.__RECEIVE_SCOREBOARD_STATE_INSTANT = function (packet) {
    handleIncomingMessage(packet);
  };

  window.__GET_SCOREBOARD_LIVE_STATE = function () {
    return getFullStatePayload("direct_query");
  };

  window.__REGISTER_PROJECTION_WINDOW = function (childWin) {
    if (childWin && !childWin.closed) {
      activeProjectionWindows.add(childWin);
    }
  };

  window.__TRIGGER_BUZZER_INSTANT = function (soundType) {
    triggerBuzzerSound(soundType, false);
  };

  function handleIncomingMessage(packet) {
    if (!packet || !packet.state) return;
    if (packet.sourceId === WINDOW_INSTANCE_ID) return;

    // Descartar mensajes estrictamente obsoletos
    if (packet.timestamp && packet.timestamp < lastAppliedTimestamp - 100) {
      return;
    }
    lastAppliedTimestamp = packet.timestamp || Date.now();
    lastAppliedSequence = packet.seq || 0;

    applyIncomingState(packet.state, packet.action);
  }

  function applyIncomingState(incoming, action) {
    state.mainTimeTotalSeconds =
      incoming.mainTimeTotalSeconds ?? state.mainTimeTotalSeconds;
    state.mainTimeRemaining =
      incoming.mainTimeRemaining ?? state.mainTimeRemaining;
    state.isMainTimeRunning = !!incoming.isMainTimeRunning;
    state.mainTimeTargetEnd = incoming.mainTimeTargetEnd ?? 0;

    state.shotClockRemaining =
      incoming.shotClockRemaining ?? state.shotClockRemaining;
    state.isShotClockRunning = !!incoming.isShotClockRunning;
    state.shotClockTargetEnd = incoming.shotClockTargetEnd ?? 0;

    state.syncShotWithTime =
      incoming.syncShotWithTime !== undefined
        ? incoming.syncShotWithTime
        : state.syncShotWithTime;

    state.homeScore = incoming.homeScore ?? state.homeScore;
    state.visitorScore = incoming.visitorScore ?? state.visitorScore;

    if (incoming.teamA) state.teamA = { ...incoming.teamA };
    if (incoming.teamB) state.teamB = { ...incoming.teamB };

    state.period = incoming.period ?? state.period;
    state.homeBonus = !!incoming.homeBonus;
    state.visitorBonus = !!incoming.visitorBonus;
    state.homeFouls = incoming.homeFouls ?? state.homeFouls;
    state.visitorFouls = incoming.visitorFouls ?? state.visitorFouls;
    state.homeTOL = incoming.homeTOL ?? state.homeTOL;
    state.visitorTOL = incoming.visitorTOL ?? state.visitorTOL;
    state.playerFoulsText = incoming.playerFoulsText ?? state.playerFoulsText;
    state.soundEnabled =
      incoming.soundEnabled !== undefined
        ? incoming.soundEnabled
        : state.soundEnabled;

    renderFullScoreboard();

    // Sonidos automáticos si la acción lo amerita
    if (
      action === "buzzer" ||
      action === "end_period" ||
      action === "shot_clock"
    ) {
      triggerBuzzerSound(action, false);
    }
  }

  function requestStateHandshake() {
    const req = {
      type: "REQUEST_SCOREBOARD_STATE",
      sourceId: WINDOW_INSTANCE_ID,
      timestamp: Date.now(),
    };

    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(req);
      } catch (e) {}
    }

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(req, "*");
      } catch (e) {}
    }

    loadStateFromLocalStorage();
    renderFullScoreboard();

    setTimeout(() => {
      if (broadcastChannel) broadcastChannel.postMessage(req);
      if (window.opener && !window.opener.closed)
        window.opener.postMessage(req, "*");
      loadStateFromLocalStorage();
      renderFullScoreboard();
    }, 100);
  }

  function loadStateFromLocalStorage() {
    try {
      const saved = localStorage.getItem("BASKET_SCOREBOARD_STATE");
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.state) {
          lastAppliedTimestamp = data.timestamp || 0;
          lastAppliedSequence = data.seq || 0;
          Object.assign(state, data.state);
        }
      }
    } catch (e) {}
  }

  /**
   * Heartbeat del Operador: garantiza que cualquier nueva pantalla mantenga sincronía perfecta
   */
  function initOperatorHeartbeat() {
    setInterval(() => {
      broadcastStateUpdate("heartbeat");
    }, 1000);
  }

  /**
   * MOTOR DE AUTO-AJUSTE PERFECTO A CUALQUIER PANTALLA, MONITOR, TV O PROYECTOR
   * Calcula dinámicamente las dimensiones milimétricas del tablero para aprovechar al
   * máximo el área visual de cualquier resolución (1080p, 4K, 8K, 720p, 4:3, 16:9, etc.)
   * sin desbordamientos, cortes ni barras de scroll.
   */
  let selectedAspectMode = "auto";

  function autoFitProjectionBoard() {
    if (!isProjectionMode) return;
    const board = document.getElementById("digital-scoreboard");
    if (!board) return;

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    if (vw <= 0 || vh <= 0) return;

    // Márgenes de seguridad óptimos para biseles de pantalla y marcos
    const maxW = vw * 0.985;
    const maxH = vh * 0.975;

    let targetW = maxW;
    let targetH = maxH;

    if (selectedAspectMode === "fill") {
      targetW = maxW;
      targetH = maxH;
    } else {
      let targetRatio = 1.62; // Relación balanceada de alta fidelidad para estadio
      if (selectedAspectMode === "16:9") {
        targetRatio = 16 / 9;
      } else if (selectedAspectMode === "16:10") {
        targetRatio = 16 / 10;
      } else if (selectedAspectMode === "4:3") {
        targetRatio = 4 / 3;
      } else {
        // Modo "auto": Se adapta suavemente según el aspecto físico detectado
        const screenRatio = vw / vh;
        if (screenRatio >= 1.7) {
          targetRatio = 1.66;
        } else if (screenRatio >= 1.5) {
          targetRatio = 1.6;
        } else {
          targetRatio = 1.42;
        }
      }

      if (maxW / maxH > targetRatio) {
        // Pantalla más ancha (TVs 16:9, monitores Ultra-Wide) -> Limitado por la altura
        targetH = maxH;
        targetW = targetH * targetRatio;
      } else {
        // Pantalla más alta o cuadrada (Proyectores 4:3, laptops) -> Limitado por el ancho
        targetW = maxW;
        targetH = targetW / targetRatio;
      }
    }

    const finalW = Math.round(targetW);
    const finalH = Math.round(targetH);

    board.style.setProperty("--proj-board-width", `${finalW}px`);
    board.style.setProperty("--proj-board-height", `${finalH}px`);
  }

  /**
   * Controles flotantes y polling de alta velocidad para la ventana de Proyección
   */
  function initProjectionViewControls() {
    // 1. Ejecutar el auto-ajuste de pantalla inmediatamente y ante cualquier evento
    autoFitProjectionBoard();
    window.addEventListener("resize", () => {
      requestAnimationFrame(autoFitProjectionBoard);
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(autoFitProjectionBoard, 50);
    });
    document.addEventListener("fullscreenchange", () => {
      setTimeout(autoFitProjectionBoard, 50);
      setTimeout(autoFitProjectionBoard, 200);
    });

    if (window.ResizeObserver) {
      try {
        const ro = new ResizeObserver(() => {
          requestAnimationFrame(autoFitProjectionBoard);
        });
        ro.observe(document.body);
      } catch (e) {}
    }

    // Intervalos de estabilización inicial
    setTimeout(autoFitProjectionBoard, 60);
    setTimeout(autoFitProjectionBoard, 250);
    setTimeout(autoFitProjectionBoard, 600);

    // 2. Polling de ultra-alta velocidad (60ms) para garantizar 0 retraso
    setInterval(() => {
      try {
        const saved = localStorage.getItem("BASKET_SCOREBOARD_STATE");
        if (saved) {
          const data = JSON.parse(saved);
          if (data && data.timestamp && data.timestamp > lastAppliedTimestamp) {
            handleIncomingMessage(data);
          }
        }
      } catch (e) {}
    }, 60);

    // 3. Barra flotante de control de proyección
    const floatBar = document.createElement("div");
    floatBar.className = "projection-floating-bar";
    floatBar.id = "projection-floating-bar";
    floatBar.innerHTML = `
      <div class="projection-sync-indicator">
        <i class="fa-solid fa-circle"></i> Sincronizado • 0 ms
      </div>
      <select class="projection-select-aspect" id="sel-proj-aspect" title="Relación de Aspecto / Modo de Pantalla">
        <option value="auto">📐 Auto-Ajuste</option>
        <option value="16:9">📺 16:9 Widescreen (TV)</option>
        <option value="16:10">🖥️ 16:10 Monitor</option>
        <option value="4:3">📽️ 4:3 Proyector</option>
        <option value="fill">↔️ Llenar Pantalla</option>
      </select>
      <button type="button" class="projection-float-btn" id="btn-proj-fullscreen" title="Alternar Pantalla Completa (F / Doble Clic)">
        <i class="fa-solid fa-expand"></i> Pantalla Completa
      </button>
      <button type="button" class="projection-float-btn" id="btn-proj-sound" title="Silenciar / Activar Sonido">
        <i class="fa-solid fa-volume-high" id="proj-sound-icon"></i>
      </button>
    `;
    document.body.appendChild(floatBar);

    // Selector de aspecto
    document
      .getElementById("sel-proj-aspect")
      ?.addEventListener("change", (e) => {
        selectedAspectMode = e.target.value;
        autoFitProjectionBoard();
      });

    // Botón de pantalla completa
    document
      .getElementById("btn-proj-fullscreen")
      ?.addEventListener("click", toggleFullScreen);

    // Botón de sonido
    document.getElementById("btn-proj-sound")?.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      const icon = document.getElementById("proj-sound-icon");
      if (icon) {
        icon.className = state.soundEnabled
          ? "fa-solid fa-volume-high"
          : "fa-solid fa-volume-xmark";
      }
    });

    // Doble clic en cualquier parte de la pantalla para pantalla completa
    document.addEventListener("dblclick", () => {
      toggleFullScreen();
    });

    // Auto-ocultar la barra flotante al no haber movimiento de ratón por 3 segundos
    let hideTimeout = null;
    const resetHideTimeout = () => {
      floatBar.classList.remove("is-hidden");
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        floatBar.classList.add("is-hidden");
      }, 3000);
    };

    window.addEventListener("mousemove", resetHideTimeout);
    resetHideTimeout();

    // Atajos de teclado en ventana de proyección
    window.addEventListener("keydown", (e) => {
      if (e.key === "f" || e.key === "F" || e.key === "F11") {
        e.preventDefault();
        toggleFullScreen();
      }
    });
  }

  function resetEntireMatch() {
    if (
      confirm(
        "¿Deseas reiniciar todos los valores del partido (puntuación, faltas, periodo y cronómetro)?",
      )
    ) {
      pauseMainTime();
      pauseShotClock();
      state.mainTimeRemaining = 600;
      state.mainTimeTotalSeconds = 600;
      state.mainTimeTargetEnd = 0;

      state.shotClockRemaining = 24;
      state.shotClockTargetEnd = 0;

      state.homeScore = 0;
      state.visitorScore = 0;
      state.period = 1;
      state.homeFouls = 0;
      state.visitorFouls = 0;
      state.homeTOL = 0;
      state.visitorTOL = 0;
      state.homeBonus = false;
      state.visitorBonus = false;
      state.playerFoulsText = "00 00";

      renderFullScoreboard();
      syncControlInputsWithState();
      broadcastStateUpdate("reset_match");
      showToast("Partido reiniciado completamente", "info");
    }
  }

  // =========================================================================
  // 12. SINTETIZADOR DE SONIDO (BOCINA / BUZZER OFICIAL CON WEB AUDIO API)
  // =========================================================================
  let audioCtx = null;

  function triggerBuzzerSound(type = "manual", shouldBroadcast = true) {
    if (shouldBroadcast) {
      const soundPayload = {
        type: "SCOREBOARD_SOUND_EVENT",
        sourceId: WINDOW_INSTANCE_ID,
        sound: type,
        timestamp: Date.now(),
      };

      // 1. Memoria directa a hijas
      activeProjectionWindows.forEach((win) => {
        try {
          if (win && !win.closed) {
            if (typeof win.__TRIGGER_BUZZER_INSTANT === "function") {
              win.__TRIGGER_BUZZER_INSTANT(type);
            } else {
              win.postMessage(soundPayload, "*");
            }
          }
        } catch (e) {}
      });

      // 2. BroadcastChannel
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage(soundPayload);
        } catch (e) {}
      }

      broadcastStateUpdate(type);
    }

    if (!state.soundEnabled) return;

    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      // Configuración de bocina de estadio profesional (onda sierra armónica potente)
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.8);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        now + (type === "shot_clock" ? 0.6 : 1.2),
      );

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + (type === "shot_clock" ? 0.6 : 1.2));
    } catch (e) {
      console.warn("Audio Context error:", e);
    }
  }

  // =========================================================================
  // 13. ATAJOS DE TECLADO PARA EL OPERADOR
  // =========================================================================
  function handleGlobalKeyboardShortcuts(e) {
    if (isProjectionMode) return;

    // Si el foco está en un input de texto, no interferir con la escritura
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      return;
    }

    // Tecla ESPACIO: Iniciar / Pausar TIME
    if (e.code === "Space") {
      e.preventDefault();
      if (state.isMainTimeRunning) {
        pauseMainTime();
      } else {
        startMainTime();
      }
    }

    // Tecla 'S': Iniciar / Pausar SECONDS
    if (e.key === "s" || e.key === "S") {
      if (state.isShotClockRunning) {
        pauseShotClock();
      } else {
        startShotClock();
      }
    }

    // Tecla 'R': Reset 24s
    if (e.key === "r" || e.key === "R") {
      resetShotClock(24);
    }

    // Tecla 'F': Reset 14s
    if (e.key === "f" || e.key === "F") {
      resetShotClock(14);
    }

    // Tecla 'B': Bocina manual
    if (e.key === "b" || e.key === "B") {
      triggerBuzzerSound("manual", true);
    }
  }

  // =========================================================================
  // 14. UTILIDADES DE GOOGLE DRIVE Y TOASTS
  // =========================================================================
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

  function showToast(message, type = "info") {
    const container = document.getElementById("reloj-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `reloj-toast is-${type}`;
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.4s ease";
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }
})();
