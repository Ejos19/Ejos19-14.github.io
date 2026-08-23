/**
 * =====================================================================================
 * ARCHIVO: Game.js
 * DESCRIPCIÓN: Controlador interactivo del Módulo Versus (Enfrentamientos de Equipos)
 *              Permite buscar equipos en la hoja "Afiliados", previsualizar sus logos (PNG),
 *              definir la hora/título del juego, guardar en la hoja "Game", agregar múltiples
 *              enfrentamientos, modificarlos y eliminarlos.
 * =====================================================================================
 */

(function () {
  "use strict";

  // =====================================================================================
  // 1. [CONFIGURACIÓN PRINCIPAL DE CONEXIÓN A GOOGLE APPS SCRIPT / GOOGLE SHEETS]
  // -------------------------------------------------------------------------------------
  // Aquí defines la URL del Web App de Google Apps Script que procesa los envíos, consultas,
  // inserciones y actualizaciones directas en las hojas de cálculo de Google Sheets.
  // =====================================================================================
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzPpCG9VBlMUW5vRvV5CiIfbvFtDgr0yAg-wzWBd4WJDbqgP02YLHZBAROiSfzVwS45Zg/exec";

  // =====================================================================================
  // 2. [CONFIGURACIÓN DE RUTAS DE LA NUBE / SERVIDOR LOCAL / MULTI-DISPOSITIVO]
  // -------------------------------------------------------------------------------------
  // Si deseas cambiar o personalizar las rutas donde se guardan o consultan los enfrentamientos
  // en el servidor/nube para que cualquier IP o dispositivo sincronice en tiempo real:
  // - SAVE_MATCHUPS_URL : Ruta API para guardar/actualizar toda la cartelera en la nube
  // - LOAD_MATCHUPS_URL : Ruta API para descargar la cartelera activa desde la nube
  // - SCORE_UPDATE_URL  : Ruta API para actualizar únicamente marcadores y estatus
  // =====================================================================================
  const CLOUD_API_ENDPOINTS = {
    SAVE_MATCHUPS_URL: "/api/matchups", // <-- [RUTA NUBE] Endpoint para guardar cartelera
    LOAD_MATCHUPS_URL: "/api/matchups", // <-- [RUTA NUBE] Endpoint para cargar cartelera
    SCORE_UPDATE_URL: "/api/matchups/score", // <-- [RUTA NUBE] Endpoint para actualizar marcador y estatus
  };

  // =====================================================================================
  // 3. [CONFIGURACIÓN DE HOJAS Y COLUMNAS CLAVE DE GOOGLE SHEETS]
  // -------------------------------------------------------------------------------------
  // Modifica estos valores según tus necesidades:
  // - GAME_SHEET            : Hoja estándar ("Game") para "Guardar Enfrentamiento" y "Sincronizar Sheets".
  // - CLOUD_SHEET           : Hoja en la nube ("Game2") para "Cargar de Nube" y "Guardar Cartelera en Nube".
  // - GAME_KEY_COLUMN       : Nombre de la columna clave usada para ubicar y REESCRIBIR la fila existente (ID).
  // - AFILIADOS_SHEET       : Hoja donde se consultan los Equipos A y B (Local / Visitante).
  // - CUERPO_TECNICO_SHEET  : Hoja donde se consultan los Árbitros (Principal, Auxiliar, Mesa).
  // =====================================================================================
  const SHEET_CONFIG = {
    GAME_SHEET: "Game", // <-- [HOJA ESTÁNDAR] "Guardar Enfrentamiento" y "Sincronizar Sheets"
    CLOUD_SHEET: "Game2", // <-- [HOJA NUBE] "Cargar de Nube" y "Guardar Cartelera en Nube"
    GAME_KEY_COLUMN: "ID", // <-- [CAMPO CLAVE] Columna para identificar y sobreescribir el registro existente
    AFILIADOS_SHEET: "Afiliados", // <-- [HOJA ORIGEN] Hoja de equipos
    CUERPO_TECNICO_SHEET: "CuerpoTecnico", // <-- [HOJA ORIGEN] Hoja de árbitros
  };

  // =====================================================================================
  // CREDENCIALES DE ADMINISTRADOR - FORMULARIO GAME
  // -------------------------------------------------------------------------------------
  // INSTRUCCIONES PARA MODIFICAR EL USUARIO Y CONTRASEÑA DE ADMINISTRADOR:
  // Si deseas cambiar las credenciales para autorizar las acciones de:
  //   1. Modificar un enfrentamiento en la cartelera
  //   2. Eliminar un enfrentamiento de la cartelera
  //   3. Seleccionar el modo "Ingresar (Crear nuevo registro)"
  //
  // Simplemente cambia los valores de 'ADMIN_USER' y 'ADMIN_PASSWORD' a continuación:
  // =====================================================================================
  const ADMIN_CREDENTIALS = {
    ADMIN_USER: "Deion", // <-- [CONFIGURACIÓN] CAMBIA AQUÍ TU USUARIO DE ADMINISTRADOR
    ADMIN_PASSWORD: "232026", // <-- [CONFIGURACIÓN] CAMBIA AQUÍ TU CONTRASEÑA DE ADMINISTRADOR
  };

  // Variable de control para el modal de autenticación
  let pendingAdminAuthAction = null;
  let pendingAdminAuthCancel = null;

  // Estado global de enfrentamientos
  let currentMatchups = [];
  let editingMatchupId = null;

  // Lista global de torneos conocidos (persistidos en caché y extraídos de las hojas)
  let knownTournaments = [];
  try {
    const savedTourn = localStorage.getItem("GAME_TOURNAMENTS_LIST");
    if (savedTourn) {
      const parsed = JSON.parse(savedTourn);
      if (Array.isArray(parsed)) knownTournaments = parsed;
    }
  } catch (e) {
    console.warn("[Game.js] Error leyendo GAME_TOURNAMENTS_LIST:", e);
  }

  // Estado temporal del enfrentamiento en construcción
  let currentDraft = {
    tournamentId: "TMT-00001", // ID_Tournament (secuencia TMT-00001...)
    tournamentName: "", // Tournament (Nombre del torneo asociado)
    gameTitle: "JUEGO 1",
    gameTime: "07:00 PM",
    gameDate: new Date().toISOString().split("T")[0],
    courtLocation: "Cancha Principal",
    scoreA: 0, // Puntuación Equipo Local por defecto en 0
    scoreB: 0, // Puntuación Equipo Visitante por defecto en 0
    teamA: null, // { id, name, code, rif, logo, driveId, rawData }
    teamB: null, // { id, name, code, rif, logo, driveId, rawData }
    referee1: null, // { id, name, cedula, role, photo, driveId, rawData }
    referee2: null, // { id, name, cedula, role, photo, driveId, rawData }
    referee3: null, // { id, name, cedula, role, photo, driveId, rawData }
    notes: "",
  };

  // Caché de afiliados y cuerpo técnico para autocompletado y búsquedas ultrarrápidas
  let afiliadosCache = [];
  let cuerpoTecnicoCache = [];

  // =========================================================================
  // 1. INICIALIZACIÓN
  // =========================================================================
  document.addEventListener("DOMContentLoaded", () => {
    initVersusModule();
  });

  function initVersusModule() {
    setupAdminAuthModal();
    setupStatusModal();
    initTournamentModule();
    setupEventListeners();
    loadSavedMatchupsFromLocal(); // Carga instantánea desde caché local
    loadMatchupsFromCloudServer(false); // Sincronización automática con la nube/servidor (acceso entre IPs/dispositivos)
    preloadAfiliadosList();
    preloadCuerpoTecnicoList();
    renderCurrentDraft();

    // Establecer modo inicial según el selector (predeterminado: consultar)
    const modeSelect = document.getElementById("modeSelect");
    const initialMode = modeSelect ? modeSelect.value : "consultar";
    applyGameMode(initialMode);
  }

  // =========================================================================
  // SISTEMA DE AUTORIZACIÓN DE ADMINISTRADOR (USUARIO Y CONTRASEÑA)
  // =========================================================================
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

    // Resetear campos del modal
    if (userInput) userInput.value = "";
    if (pwdInput) pwdInput.value = "";
    if (errorBox) errorBox.style.display = "none";

    modal.classList.add("is-active");

    // Foco en el campo de usuario
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
      // Credenciales correctas
      if (errorBox) errorBox.style.display = "none";
      const actionToExecute = pendingAdminAuthAction;
      closeAdminAuthModal(false);
      showToast("Acceso de Administrador autorizado", "success");
      if (typeof actionToExecute === "function") {
        actionToExecute();
      }
    } else {
      // Credenciales incorrectas
      if (errorBox) {
        if (errorText)
          errorText.textContent =
            "Usuario o contraseña de administrador incorrectos.";
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

  /**
   * Alterna la visibilidad de las secciones según el modo de operación seleccionado:
   * - "consultar": Oculta la sección de creación (buscar afiliados, guardar, agregar, limpiar)
   *                y muestra únicamente la Cartelera de Enfrentamientos.
   * - "ingresar": Muestra la sección de creación (panel config, arena con búsqueda de afiliados,
   *               botones guardar, agregar y limpiar) y la cartelera debajo.
   */
  function applyGameMode(mode) {
    const creationSection = document.getElementById("matchup-creation-section");
    const boardSection = document.getElementById("matchup-board-section");
    const modeBadge = document.getElementById("current-mode-badge");
    const modeSelect = document.getElementById("modeSelect");
    const rifControls = document.getElementById("rif-controls");

    // Ocultar cualquier control RIF residual
    if (rifControls) {
      rifControls.style.display = "none";
    }

    if (modeSelect && modeSelect.value !== mode) {
      modeSelect.value = mode;
    }

    if (mode === "ingresar") {
      if (creationSection) {
        creationSection.style.display = "block";
      }
      if (boardSection) {
        boardSection.style.display = "block";
      }
      if (modeBadge) {
        modeBadge.textContent = "Ingresar (Crear registro)";
        modeBadge.className = "config-chip emerald";
      }
    } else {
      // Modo "consultar" (Predeterminado)
      if (creationSection) {
        creationSection.style.display = "none";
      }
      if (boardSection) {
        boardSection.style.display = "block";
      }
      if (modeBadge) {
        modeBadge.textContent = "Consultar (Cartelera)";
        modeBadge.className = "config-chip purple";
      }
    }
  }

  // =========================================================================
  // 2. CONFIGURACIÓN DE EVENT LISTENERS
  // =========================================================================
  function setupEventListeners() {
    // Selector de Modo de Operación (Consultar vs. Ingresar) con protección de Administrador
    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect) {
      modeSelect.addEventListener("change", (e) => {
        const selectedMode = e.target.value;
        if (selectedMode === "ingresar") {
          // Requiere autorización de Administrador (Usuario: Oso, Password: 123456)
          requestAdminAccess(
            "Ingresar (Crear nuevo registro)",
            () => {
              applyGameMode("ingresar");
              const creationSection = document.getElementById(
                "matchup-creation-section",
              );
              if (creationSection) {
                creationSection.scrollIntoView({ behavior: "smooth" });
              }
            },
            () => {
              // Revertir a modo consultar si se cancela o falla la autenticación
              modeSelect.value = "consultar";
              applyGameMode("consultar");
            },
          );
        } else {
          applyGameMode("consultar");
        }
      });
    }

    // Búsqueda Equipo A (Local / Izquierda)
    const btnSearchA = document.getElementById("btn-search-team-a");
    const inputSearchA = document.getElementById("search-team-a");
    if (btnSearchA && inputSearchA) {
      btnSearchA.addEventListener("click", () => executeTeamSearch("A"));
      inputSearchA.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          executeTeamSearch("A");
        }
      });
    }

    // Búsqueda Equipo B (Visitante / Derecha)
    const btnSearchB = document.getElementById("btn-search-team-b");
    const inputSearchB = document.getElementById("search-team-b");
    if (btnSearchB && inputSearchB) {
      btnSearchB.addEventListener("click", () => executeTeamSearch("B"));
      inputSearchB.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          executeTeamSearch("B");
        }
      });
    }

    // Limpiar / Cambiar Equipos
    const btnClearA = document.getElementById("btn-clear-team-a");
    if (btnClearA) {
      btnClearA.addEventListener("click", () => clearTeamSelection("A"));
    }

    const btnClearB = document.getElementById("btn-clear-team-b");
    if (btnClearB) {
      btnClearB.addEventListener("click", () => clearTeamSelection("B"));
    }

    // Inputs del centro (Título, Hora, Fecha)
    const titleInput = document.getElementById("game-title-input");
    if (titleInput) {
      titleInput.addEventListener("input", (e) => {
        currentDraft.gameTitle = e.target.value;
        updatePreviewBanner();
      });
    }

    const timeInput = document.getElementById("game-time-input");
    if (timeInput) {
      timeInput.addEventListener("input", (e) => {
        currentDraft.gameTime = e.target.value;
        updatePreviewBanner();
      });
    }

    const dateInput = document.getElementById("game-date-input");
    if (dateInput) {
      dateInput.addEventListener("input", (e) => {
        currentDraft.gameDate = e.target.value;
      });
    }

    // Inputs de Puntuación (Score Local y Visitante)
    const scoreAInput = document.getElementById("game-score-a-input");
    if (scoreAInput) {
      scoreAInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        currentDraft.scoreA = isNaN(val) || val < 0 ? 0 : val;
      });
    }

    const scoreBInput = document.getElementById("game-score-b-input");
    if (scoreBInput) {
      scoreBInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        currentDraft.scoreB = isNaN(val) || val < 0 ? 0 : val;
      });
    }

    const notesInput = document.getElementById("game-notes-input");
    if (notesInput) {
      notesInput.addEventListener("input", (e) => {
        currentDraft.notes = e.target.value;
      });
    }

    // Botones de acción principales
    const btnSaveMatch = document.getElementById("btn-save-matchup");
    if (btnSaveMatch) {
      btnSaveMatch.addEventListener("click", saveCurrentMatchup);
    }

    const btnAddAnother = document.getElementById("btn-add-another-matchup");
    if (btnAddAnother) {
      btnAddAnother.addEventListener("click", addNewMatchupDraft);
    }

    const btnResetDraft = document.getElementById("btn-reset-draft");
    if (btnResetDraft) {
      btnResetDraft.addEventListener("click", resetCurrentDraft);
    }

    // Botones para sincronizar con Google Sheets (Requiere Administrador)
    const btnSyncSheets = document.getElementById("btn-sync-sheets");
    if (btnSyncSheets) {
      btnSyncSheets.addEventListener("click", () => {
        requestAdminAccess("Sincronizar con Google Sheets", () => {
          syncAllMatchupsToGoogleSheets();
        });
      });
    }

    // Botón para guardar cartelera en la Nube/Servidor (Requiere Administrador)
    const btnSaveCloud = document.getElementById("btn-save-cloud");
    if (btnSaveCloud) {
      btnSaveCloud.addEventListener("click", () => {
        requestAdminAccess("Guardar Cartelera en Nube", () => {
          saveAllMatchupsToCloudServer(false);
        });
      });
    }

    // Botón para cargar / refrescar cartelera desde la Nube/Servidor (Requiere Administrador)
    const btnReloadCloud = document.getElementById("btn-reload-cloud");
    if (btnReloadCloud) {
      btnReloadCloud.addEventListener("click", () => {
        requestAdminAccess("Cargar Cartelera de Nube", () => {
          loadMatchupsFromCloudServer(true);
        });
      });
    }

    // Cambio de criterio de búsqueda
    const keySelectA = document.getElementById("search-key-team-a");
    if (keySelectA) {
      keySelectA.addEventListener("change", (e) => {
        inputSearchA.placeholder = `Buscar por ${e.target.value}...`;
      });
    }

    const keySelectB = document.getElementById("search-key-team-b");
    if (keySelectB) {
      keySelectB.addEventListener("change", (e) => {
        inputSearchB.placeholder = `Buscar por ${e.target.value}...`;
      });
    }

    // =========================================================================
    // PASO 2 (JS): ENLACE DE EVENTOS PARA LOS 3 MÓDULOS DE ÁRBITROS
    // =========================================================================
    [1, 2, 3].forEach((idx) => {
      const btnSearch = document.getElementById(`btn-search-referee-${idx}`);
      const inputSearch = document.getElementById(`search-referee-${idx}`);
      const keySelect = document.getElementById(`search-key-referee-${idx}`);
      const btnClear = document.getElementById(`btn-clear-referee-${idx}`);

      if (btnSearch && inputSearch) {
        btnSearch.addEventListener("click", () => executeRefereeSearch(idx));
        inputSearch.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            executeRefereeSearch(idx);
          }
        });
      }

      if (keySelect && inputSearch) {
        keySelect.addEventListener("change", (e) => {
          inputSearch.placeholder = `Buscar por ${e.target.value}...`;
        });
      }

      if (btnClear) {
        btnClear.addEventListener("click", () => clearRefereeSelection(idx));
      }
    });
  }

  // =========================================================================
  // 2.5. MÓDULO DE GESTIÓN Y SELECCIÓN DE TORNEOS (ID_Tournament & Tournament)
  // =========================================================================

  /**
   * Calcula el siguiente ID de torneo en formato TMT-00001, TMT-00002, etc.
   * Busca el valor numérico más alto en el historial y continúa la secuencia sin repetir.
   */
  function calculateNextTournamentId() {
    let maxNum = 0;
    const allCandidates = [
      ...(Array.isArray(knownTournaments) ? knownTournaments : []),
      ...(Array.isArray(currentMatchups)
        ? currentMatchups.map((m) => ({
            id: m.ID_Tournament || m.id_tournament || m.tournamentId,
            name: m.Tournament || m.tournament || m.tournamentName,
          }))
        : []),
    ];

    allCandidates.forEach((item) => {
      const idStr = String((item && item.id) || "").trim();
      const match = idStr.match(/^TMT-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });

    const nextNum = maxNum + 1;
    return `TMT-${String(nextNum).padStart(5, "0")}`;
  }

  /**
   * Registra un torneo en la lista en memoria y en localStorage
   */
  function registerTournament(id, name) {
    if (!id || !String(id).trim()) return;
    const cleanId = String(id).trim();
    const cleanName = String(name || "").trim() || "Torneo General";

    const idx = knownTournaments.findIndex(
      (t) => String(t.id).trim().toLowerCase() === cleanId.toLowerCase(),
    );
    if (idx !== -1) {
      if (cleanName && cleanName !== "Torneo General") {
        knownTournaments[idx].name = cleanName;
      }
    } else {
      knownTournaments.push({ id: cleanId, name: cleanName });
    }

    try {
      localStorage.setItem(
        "GAME_TOURNAMENTS_LIST",
        JSON.stringify(knownTournaments),
      );
    } catch (e) {
      console.warn("[Game.js] Error guardando GAME_TOURNAMENTS_LIST:", e);
    }

    populateTournamentDropdown();
  }

  /**
   * Llena el dropdown de selección rápida de torneos registrados
   */
  function populateTournamentDropdown() {
    const select = document.getElementById("tourn-quick-select");
    if (!select) return;

    select.innerHTML = `<option value="">-- Seleccionar de la lista --</option>`;

    const uniqueMap = new Map();
    knownTournaments.forEach((t) => {
      if (t && t.id) {
        uniqueMap.set(String(t.id).trim(), String(t.name || "").trim());
      }
    });

    currentMatchups.forEach((m) => {
      const id = m.ID_Tournament || m.id_tournament || m.tournamentId;
      const name = m.Tournament || m.tournament || m.tournamentName;
      if (id) {
        uniqueMap.set(String(id).trim(), String(name || "").trim());
      }
    });

    uniqueMap.forEach((name, id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${id} - ${name || "Sin nombre"}`;
      if (id === currentDraft.tournamentId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  /**
   * Cambia entre el modo 'existente' y 'nuevo'
   */
  function setTournamentMode(mode) {
    const radioExisting = document.getElementById("tourn-mode-existing");
    const radioNew = document.getElementById("tourn-mode-new");
    const labelExisting = document.getElementById("label-tourn-existing");
    const labelNew = document.getElementById("label-tourn-new");
    const idInput = document.getElementById("tournament-id-input");
    const nameInput = document.getElementById("tournament-name-input");
    const searchBtnWrap = document.getElementById("tourn-search-btn-wrap");
    const quickSelectWrap = document.getElementById("tourn-quick-select-wrap");
    const statusEl = document.getElementById("tournament-search-status");

    if (statusEl) {
      statusEl.style.display = "none";
      statusEl.innerHTML = "";
    }

    if (mode === "nuevo") {
      if (radioNew) radioNew.checked = true;
      if (labelNew) labelNew.classList.add("active");
      if (labelExisting) labelExisting.classList.remove("active");

      const nextId = calculateNextTournamentId();
      if (idInput) {
        idInput.value = nextId;
        idInput.readOnly = true;
      }
      currentDraft.tournamentId = nextId;
      currentDraft.tournamentName = "";

      if (nameInput) {
        nameInput.value = "";
        nameInput.placeholder = "Escribe el nombre del nuevo torneo...";
        nameInput.focus();
      }

      if (searchBtnWrap) searchBtnWrap.style.display = "none";
      if (quickSelectWrap) quickSelectWrap.style.display = "none";

      if (statusEl) {
        statusEl.innerHTML = `<span style="color: #38bdf8; font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-sparkles"></i> Nuevo ID asignado: <strong>${nextId}</strong></span>`;
        statusEl.style.display = "block";
      }
    } else {
      if (radioExisting) radioExisting.checked = true;
      if (labelExisting) labelExisting.classList.add("active");
      if (labelNew) labelNew.classList.remove("active");

      if (idInput) {
        idInput.readOnly = false;
        if (!idInput.value || idInput.value.startsWith("TMT-")) {
          if (knownTournaments.length > 0 && !currentDraft.tournamentName) {
            idInput.value = knownTournaments[0].id;
            currentDraft.tournamentId = knownTournaments[0].id;
            currentDraft.tournamentName = knownTournaments[0].name;
            if (nameInput) nameInput.value = knownTournaments[0].name;
          }
        }
      }

      if (searchBtnWrap) searchBtnWrap.style.display = "block";
      if (quickSelectWrap) quickSelectWrap.style.display = "block";
      populateTournamentDropdown();
    }
  }

  /**
   * Busca un torneo por su ID (ID_Tournament) instantáneamente en memoria o en Google Sheets
   */
  async function searchTournamentById(queryId) {
    const cleanQuery = String(queryId || "").trim();
    const idInput = document.getElementById("tournament-id-input");
    const nameInput = document.getElementById("tournament-name-input");
    const statusEl = document.getElementById("tournament-search-status");
    const searchBtn = document.getElementById("btn-search-tournament");

    if (!cleanQuery) {
      showToast(
        "Introduce el ID del torneo para buscar (ej. TMT-00001)",
        "warning",
      );
      if (idInput) idInput.focus();
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = `<span class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Buscando ID "${cleanQuery}"...</span>`;
      statusEl.style.display = "block";
    }

    // 1. Búsqueda instantánea en memoria (knownTournaments y currentMatchups)
    let foundTournament = knownTournaments.find(
      (t) => String(t.id).trim().toLowerCase() === cleanQuery.toLowerCase(),
    );

    if (!foundTournament) {
      const matchFound = currentMatchups.find(
        (m) =>
          String(m.ID_Tournament || m.id_tournament || m.tournamentId || "")
            .trim()
            .toLowerCase() === cleanQuery.toLowerCase(),
      );
      if (matchFound) {
        foundTournament = {
          id:
            matchFound.ID_Tournament ||
            matchFound.id_tournament ||
            matchFound.tournamentId,
          name:
            matchFound.Tournament ||
            matchFound.tournament ||
            matchFound.tournamentName ||
            "Torneo General",
        };
      }
    }

    // 2. Si no está en memoria, consultar a Google Sheets en la hoja "Game" y "Game2"
    if (!foundTournament) {
      try {
        if (searchBtn) {
          searchBtn.disabled = true;
          searchBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        }

        const gasUrl = `${SCRIPT_URL}?sheetName=${encodeURIComponent(SHEET_CONFIG.GAME_SHEET)}&keyColumn=ID_Tournament&keyValue=${encodeURIComponent(cleanQuery)}&t=${Date.now()}`;
        const response = await fetch(gasUrl);
        if (response.ok) {
          const data = await response.json();
          if (data && data.status === "success" && data.record) {
            const rec = data.record;
            foundTournament = {
              id: rec.ID_Tournament || cleanQuery,
              name:
                rec.Tournament ||
                rec.Torneo ||
                rec.tournament ||
                "Torneo Registrado",
            };
          } else if (data && data.records && data.records.length > 0) {
            const rec = data.records[0];
            foundTournament = {
              id: rec.ID_Tournament || cleanQuery,
              name:
                rec.Tournament ||
                rec.Torneo ||
                rec.tournament ||
                "Torneo Registrado",
            };
          }
        }
      } catch (err) {
        console.warn("[Game.js] Falló búsqueda en Google Sheets:", err);
      } finally {
        if (searchBtn) {
          searchBtn.disabled = false;
          searchBtn.innerHTML = `<i class="fa-solid fa-search"></i> Buscar`;
        }
      }
    }

    // 3. Resultado de la búsqueda
    if (foundTournament) {
      currentDraft.tournamentId = foundTournament.id;
      currentDraft.tournamentName = foundTournament.name;

      if (idInput) idInput.value = foundTournament.id;
      if (nameInput) nameInput.value = foundTournament.name;

      registerTournament(foundTournament.id, foundTournament.name);

      if (statusEl) {
        statusEl.innerHTML = `<span style="color: #4ade80; font-size: 0.82rem; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Torneo encontrado: <strong>${escapeHtml(foundTournament.name)}</strong></span>`;
        statusEl.style.display = "block";
      }

      showToast(
        `¡Torneo "${foundTournament.name}" (${foundTournament.id}) cargado exitosamente!`,
        "success",
      );
    } else {
      if (statusEl) {
        statusEl.innerHTML = `<span style="color: #f87171; font-size: 0.82rem; font-weight: 600;"><i class="fa-solid fa-triangle-exclamation"></i> No se encontró ningún torneo con ID <strong>"${escapeHtml(cleanQuery)}"</strong>. Puedes crearlo como nuevo seleccionando "Crear Torneo Nuevo".</span>`;
        statusEl.style.display = "block";
      }
      showToast(
        `No se encontró ningún torneo con el ID "${cleanQuery}"`,
        "warning",
      );
    }
  }

  /**
   * Inicializa los escuchadores de eventos del módulo de torneos
   */
  function initTournamentModule() {
    const radioExisting = document.getElementById("tourn-mode-existing");
    const radioNew = document.getElementById("tourn-mode-new");
    const idInput = document.getElementById("tournament-id-input");
    const nameInput = document.getElementById("tournament-name-input");
    const searchBtn = document.getElementById("btn-search-tournament");
    const quickSelect = document.getElementById("tourn-quick-select");

    if (radioExisting) {
      radioExisting.addEventListener("change", () =>
        setTournamentMode("existente"),
      );
    }
    if (radioNew) {
      radioNew.addEventListener("change", () => setTournamentMode("nuevo"));
    }

    if (searchBtn && idInput) {
      searchBtn.addEventListener("click", () =>
        searchTournamentById(idInput.value),
      );
      idInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          searchTournamentById(idInput.value);
        }
      });
      idInput.addEventListener("input", (e) => {
        currentDraft.tournamentId = e.target.value;
      });
    }

    if (nameInput) {
      nameInput.addEventListener("input", (e) => {
        currentDraft.tournamentName = e.target.value;
        if (currentDraft.tournamentId) {
          registerTournament(currentDraft.tournamentId, e.target.value);
        }
      });
    }

    if (quickSelect) {
      quickSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val) {
          searchTournamentById(val);
        }
      });
    }

    populateTournamentDropdown();
  }

  // =========================================================================
  // 3. BÚSQUEDA DINÁMICA EN LA HOJA "AFILIADOS"
  // =========================================================================
  async function executeTeamSearch(side) {
    const keySelect = document.getElementById(
      `search-key-team-${side.toLowerCase()}`,
    );
    const inputSearch = document.getElementById(
      `search-team-${side.toLowerCase()}`,
    );
    const statusEl = document.getElementById(
      `search-status-${side.toLowerCase()}`,
    );

    const searchKey = keySelect ? keySelect.value : "RIF";
    const searchValue = inputSearch ? inputSearch.value.trim() : "";

    if (!searchValue) {
      showToast(
        `Por favor introduce un valor para buscar en el Equipo ${side}`,
        "warning",
      );
      if (inputSearch) inputSearch.focus();
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = `<span class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Buscando en "${SHEET_CONFIG.AFILIADOS_SHEET}"...</span>`;
      statusEl.style.display = "block";
    }

    try {
      // Intenta primero encontrar en caché local si ya está cargada
      let foundRecord = null;
      if (afiliadosCache.length > 0) {
        foundRecord = afiliadosCache.find((rec) => {
          const val =
            rec[searchKey] ||
            rec.RIF ||
            rec.ID ||
            rec.NombreCompleto ||
            rec.Estado;
          return String(val).trim().toLowerCase() === searchValue.toLowerCase();
        });
      }

      // Si no está en caché, consulta al Web App de Google Apps Script en la hoja 'Afiliados'
      if (!foundRecord) {
        const queryUrl = `${SCRIPT_URL}?sheetName=${encodeURIComponent(SHEET_CONFIG.AFILIADOS_SHEET)}&keyColumn=${encodeURIComponent(searchKey)}&keyValue=${encodeURIComponent(searchValue)}&t=${Date.now()}`;
        const response = await fetch(queryUrl);
        const data = await response.json();

        if (data && data.status === "success" && data.record) {
          foundRecord = data.record;
        } else if (data && data.records && data.records.length > 0) {
          foundRecord = data.records[0];
        }
      }

      if (foundRecord) {
        // Extraemos los campos requeridos: ID, NombreCompleto, Estado, FileLink / Foto
        const rawPhoto =
          foundRecord.FileLink ||
          foundRecord.fileLink ||
          foundRecord.FILE_LINK ||
          foundRecord.Foto ||
          foundRecord.foto ||
          foundRecord.Logo ||
          foundRecord.logo ||
          foundRecord.Avatar ||
          foundRecord.Imagen ||
          foundRecord.theFile ||
          "";

        const teamData = {
          id: foundRecord.ID || foundRecord.id || "N/A",
          name:
            foundRecord.NombreCompleto ||
            foundRecord.Nombre ||
            foundRecord.nombre ||
            "Equipo Sin Nombre",
          code: foundRecord.Estado || foundRecord.estado || "DIR-00",
          rif: foundRecord.RIF || foundRecord.rif || "",
          category: foundRecord.Categoria || "",
          rawLogo: rawPhoto,
          logo: normalizeDriveImageUrl(rawPhoto),
          driveId: extractDriveFileId(rawPhoto),
          rawData: foundRecord,
        };

        if (side === "A") {
          currentDraft.teamA = teamData;
        } else {
          currentDraft.teamB = teamData;
        }

        if (statusEl) {
          statusEl.innerHTML = `<span class="text-success"><i class="fa-solid fa-circle-check"></i> ${teamData.name} cargado con éxito</span>`;
          setTimeout(() => {
            statusEl.style.display = "none";
          }, 3000);
        }

        renderCurrentDraft();
        showToast(`Equipo ${side} (${teamData.name}) seleccionado`, "success");
      } else {
        if (statusEl) {
          statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-circle-xmark"></i> No se encontró registro en "${SHEET_CONFIG.AFILIADOS_SHEET}" con ${searchKey}: "${searchValue}"</span>`;
        }
        showToast(
          `No se encontró registro con ${searchKey}: ${searchValue}`,
          "error",
        );
      }
    } catch (err) {
      console.error("Error al buscar equipo:", err);
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Error al conectar con Google Sheets</span>`;
      }
      showToast("Error de conexión al consultar Google Sheets", "error");
    }
  }

  // =========================================================================
  // PASO 3 (JS): BÚSQUEDA DINÁMICA EN LA HOJA "CUERPO TÉCNICO" (ÁRBITROS 1, 2 Y 3)
  // -------------------------------------------------------------------------
  // Esta función es llamada cuando se busca en cualquiera de los 3 módulos.
  // Permite consultar por Cédula, RIF, ID o Nombre en la hoja 'CuerpoTecnico'.
  // =========================================================================
  async function executeRefereeSearch(refIndex) {
    const targetSheet =
      document.getElementById("refereesSheetTarget")?.value ||
      SHEET_CONFIG.CUERPO_TECNICO_SHEET;
    const keySelect = document.getElementById(`search-key-referee-${refIndex}`);
    const inputSearch = document.getElementById(`search-referee-${refIndex}`);
    const statusEl = document.getElementById(
      `search-status-referee-${refIndex}`,
    );

    const searchKey = keySelect ? keySelect.value : "Cedula";
    const searchValue = inputSearch ? inputSearch.value.trim() : "";

    if (!searchValue) {
      showToast(
        `Por favor introduce un valor para buscar al Árbitro ${refIndex}`,
        "warning",
      );
      if (inputSearch) inputSearch.focus();
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = `<span class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Buscando en "${targetSheet}"...</span>`;
      statusEl.style.display = "block";
    }

    try {
      // 1. Consulta primero en caché local si ya fue descargada
      let foundRecord = null;
      if (cuerpoTecnicoCache.length > 0) {
        foundRecord = cuerpoTecnicoCache.find((rec) => {
          const val =
            rec[searchKey] ||
            rec.Cedula ||
            rec.RIF ||
            rec.ID ||
            rec.NombreCompleto ||
            rec.Nombre;
          return String(val).trim().toLowerCase() === searchValue.toLowerCase();
        });
      }

      // 2. Si no está en caché local, realiza petición directa a Google Apps Script
      if (!foundRecord) {
        const queryUrl = `${SCRIPT_URL}?sheetName=${encodeURIComponent(targetSheet)}&keyColumn=${encodeURIComponent(searchKey)}&keyValue=${encodeURIComponent(searchValue)}&t=${Date.now()}`;
        const response = await fetch(queryUrl);
        const data = await response.json();

        if (data && data.status === "success" && data.record) {
          foundRecord = data.record;
        } else if (data && data.records && data.records.length > 0) {
          foundRecord = data.records[0];
        }
      }

      if (foundRecord) {
        // Extrae foto o archivo adjunto
        const rawPhoto =
          foundRecord.Foto ||
          foundRecord.foto ||
          foundRecord.FileLink ||
          foundRecord.fileLink ||
          foundRecord.FILE_LINK ||
          foundRecord.Avatar ||
          foundRecord.Logo ||
          foundRecord.Imagen ||
          foundRecord.theFile ||
          "";

        const refData = {
          id: foundRecord.ID || foundRecord.id || "N/A",
          name:
            foundRecord.NombreCompleto ||
            foundRecord.Nombre ||
            foundRecord.nombre ||
            "Árbitro Asignado",
          cedula:
            foundRecord.Cedula ||
            foundRecord.cedula ||
            foundRecord.RIF ||
            foundRecord.rif ||
            "--",
          role:
            foundRecord.Cargo ||
            foundRecord.cargo ||
            foundRecord.Rol ||
            foundRecord.rol ||
            foundRecord.Funcion ||
            `Árbitro ${refIndex}`,
          rawPhoto: rawPhoto,
          photo: normalizeDriveImageUrl(rawPhoto),
          driveId: extractDriveFileId(rawPhoto),
          rawData: foundRecord,
        };

        currentDraft[`referee${refIndex}`] = refData;

        if (statusEl) {
          statusEl.innerHTML = `<span class="text-success"><i class="fa-solid fa-circle-check"></i> ${refData.name} asignado</span>`;
          setTimeout(() => {
            statusEl.style.display = "none";
          }, 3000);
        }

        renderRefereeCard(refIndex, refData);
        showToast(
          `Árbitro ${refIndex} (${refData.name}) asignado con éxito`,
          "success",
        );
      } else {
        if (statusEl) {
          statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-circle-xmark"></i> No se encontró registro en "${targetSheet}" con ${searchKey}: "${searchValue}"</span>`;
        }
        showToast(
          `No se encontró registro en ${targetSheet} con ${searchKey}: ${searchValue}`,
          "error",
        );
      }
    } catch (err) {
      console.error(`Error al buscar árbitro ${refIndex}:`, err);
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Error al consultar "${targetSheet}"</span>`;
      }
      showToast(`Error al consultar hoja "${targetSheet}"`, "error");
    }
  }

  /**
   * Precarga en segundo plano la lista de Cuerpo Técnico para búsquedas instantáneas
   */
  async function preloadCuerpoTecnicoList() {
    const targetSheet = SHEET_CONFIG.CUERPO_TECNICO_SHEET;
    try {
      const response = await fetch(
        `${SCRIPT_URL}?sheetName=${encodeURIComponent(targetSheet)}&action=getAll&keyColumn=ID&keyValue=all&t=${Date.now()}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.records && Array.isArray(data.records)) {
          cuerpoTecnicoCache = data.records;
          console.log(
            `[Game.js] ${cuerpoTecnicoCache.length} registros cargados desde "${targetSheet}"`,
          );
        }
      }
    } catch (e) {
      console.log(
        `[Game.js] Precarga de "${targetSheet}" opcional, las consultas individuales funcionarán normalmente.`,
      );
    }
  }

  /**
   * Extrae el ID de Google Drive a partir de cualquier formato de URL conocido
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

    const m4 = url.match(/file\/d\/([a-zA-Z0-9_-]{15,})/);
    if (m4 && m4[1]) return m4[1];

    // Si la cadena ya es directamente un ID alfanumérico largo
    if (/^[a-zA-Z0-9_-]{20,50}$/.test(url)) {
      return url;
    }

    return "";
  }

  /**
   * Transforma URLs de Google Drive a URLs de visualización directa CDN de alta disponibilidad
   */
  function normalizeDriveImageUrl(url) {
    if (!url || typeof url !== "string") return "";
    url = url.trim();
    if (!url) return "";

    // Si ya es un data URL base64 o link directo a imagen externa
    if (
      url.startsWith("data:image/") ||
      url.startsWith("blob:") ||
      url.match(/\.(png|jpg|jpeg|svg|webp)($|\?)/i)
    ) {
      return url;
    }

    // Extrae ID de Google Drive
    const fileId = extractDriveFileId(url);
    if (fileId) {
      // El endpoint 'lh3.googleusercontent.com/d/' es el CDN directo de Google para visualización inmediata
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }

    return url;
  }

  /**
   * Obtiene la cascada de URLs alternativas para cargar imágenes de Google Drive
   */
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

  // Manejador global para reintentos transparentes de imágenes de Drive
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

    // Si fallaron todas las alternativas de red de Google Drive, muestra el placeholder deportivo
    const parentContainer = imgElement.parentElement;
    if (parentContainer) {
      parentContainer.innerHTML = `
        <div class="logo-placeholder side-${side}">
          <i class="fa-solid fa-shield-halved"></i>
          <span class="placeholder-tag">Logo no disponible</span>
        </div>
      `;
    }
  };

  // Manejador global para fotos de árbitros
  window.handleRefereePhotoError = function (
    imgElement,
    fileId,
    refIndex,
    attempt = 1,
  ) {
    if (!imgElement) return;

    const nextUrl = getDriveImageFallbackUrl(fileId, attempt);
    if (nextUrl) {
      imgElement.onerror = function () {
        window.handleRefereePhotoError(
          imgElement,
          fileId,
          refIndex,
          attempt + 1,
        );
      };
      imgElement.src = nextUrl;
      return;
    }

    const parentContainer = imgElement.parentElement;
    if (parentContainer) {
      parentContainer.innerHTML = `
        <div class="referee-empty-state">
          <i class="fa-solid fa-user-tie"></i>
          <span>Foto no disponible</span>
        </div>
      `;
    }
  };

  /**
   * Precarga en segundo plano la lista de afiliados para búsquedas instantáneas
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
          console.log(
            `[Game.js] ${afiliadosCache.length} registros cargados desde "${SHEET_CONFIG.AFILIADOS_SHEET}"`,
          );
        }
      }
    } catch (e) {
      console.log(
        "[Game.js] Precarga opcional no completada, las búsquedas individuales seguirán activas.",
      );
    }
  }

  // =========================================================================
  // 4. RENDERIZADO DEL ENFRENTAMIENTO EN CURSO (DRAFT PREVIEW)
  // =========================================================================
  function renderCurrentDraft() {
    updatePreviewBanner();
    renderTeamCard("A", currentDraft.teamA);
    renderTeamCard("B", currentDraft.teamB);

    // Renderizado de los 3 Módulos de Árbitros
    renderRefereeCard(1, currentDraft.referee1);
    renderRefereeCard(2, currentDraft.referee2);
    renderRefereeCard(3, currentDraft.referee3);

    // Actualiza campos de Torneo
    const tournIdInput = document.getElementById("tournament-id-input");
    if (
      tournIdInput &&
      tournIdInput.value !== (currentDraft.tournamentId || "")
    ) {
      tournIdInput.value = currentDraft.tournamentId || "";
    }
    const tournNameInput = document.getElementById("tournament-name-input");
    if (
      tournNameInput &&
      tournNameInput.value !== (currentDraft.tournamentName || "")
    ) {
      tournNameInput.value = currentDraft.tournamentName || "";
    }

    // Actualiza campos de formulario del centro
    const titleInput = document.getElementById("game-title-input");
    if (titleInput && titleInput.value !== currentDraft.gameTitle) {
      titleInput.value = currentDraft.gameTitle;
    }

    const timeInput = document.getElementById("game-time-input");
    if (timeInput && timeInput.value !== currentDraft.gameTime) {
      timeInput.value = currentDraft.gameTime;
    }

    const dateInput = document.getElementById("game-date-input");
    if (dateInput && dateInput.value !== currentDraft.gameDate) {
      dateInput.value = currentDraft.gameDate;
    }

    // Puntuaciones Equipo A y Equipo B (por defecto 0)
    const scoreAInput = document.getElementById("game-score-a-input");
    if (
      scoreAInput &&
      scoreAInput.value !==
        String(currentDraft.scoreA != null ? currentDraft.scoreA : 0)
    ) {
      scoreAInput.value = currentDraft.scoreA != null ? currentDraft.scoreA : 0;
    }

    const scoreBInput = document.getElementById("game-score-b-input");
    if (
      scoreBInput &&
      scoreBInput.value !==
        String(currentDraft.scoreB != null ? currentDraft.scoreB : 0)
    ) {
      scoreBInput.value = currentDraft.scoreB != null ? currentDraft.scoreB : 0;
    }

    const notesInput = document.getElementById("game-notes-input");
    if (notesInput && notesInput.value !== currentDraft.notes) {
      notesInput.value = currentDraft.notes || "";
    }

    // Botón Guardar estado
    const btnSave = document.getElementById("btn-save-matchup");
    if (btnSave) {
      if (editingMatchupId) {
        btnSave.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Actualizar Enfrentamiento`;
        btnSave.className = "button is-warning is-fullwidth";
      } else {
        btnSave.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar Enfrentamiento`;
        btnSave.className = "button is-primary is-fullwidth";
      }
    }
  }

  function updatePreviewBanner() {
    const bannerTitle = document.getElementById("arena-header-banner-text");
    if (bannerTitle) {
      const title = currentDraft.gameTitle || "JUEGO";
      const time = currentDraft.gameTime || "POR DEFINIR";
      bannerTitle.textContent = `${title.toUpperCase()} - ${time.toUpperCase()}`;
    }
  }

  function renderTeamCard(side, teamData) {
    const cardEl = document.getElementById(`team-card-${side.toLowerCase()}`);
    const logoEl = document.getElementById(`team-logo-${side.toLowerCase()}`);
    const nameEl = document.getElementById(`team-name-${side.toLowerCase()}`);
    const idEl = document.getElementById(`team-id-${side.toLowerCase()}`);
    const codeEl = document.getElementById(`team-code-${side.toLowerCase()}`);
    const rifEl = document.getElementById(`team-rif-${side.toLowerCase()}`);
    const clearBtn = document.getElementById(
      `btn-clear-team-${side.toLowerCase()}`,
    );

    if (!cardEl) return;

    if (teamData) {
      cardEl.classList.add("team-selected");
      if (clearBtn) clearBtn.style.display = "inline-flex";

      if (nameEl) nameEl.textContent = teamData.name;
      if (idEl) idEl.textContent = teamData.id;
      if (codeEl) codeEl.textContent = teamData.code;
      if (rifEl) rifEl.textContent = teamData.rif ? `RIF: ${teamData.rif}` : "";

      if (logoEl) {
        if (teamData.logo) {
          const fileId = teamData.driveId || extractDriveFileId(teamData.logo);
          logoEl.innerHTML = `
            <img src="${teamData.logo}" 
                 alt="${escapeHtml(teamData.name)}" 
                 class="team-badge-img" 
                 referrerpolicy="no-referrer"
                 crossorigin="anonymous"
                 loading="eager"
                 onerror="window.handleTeamLogoError(this, '${fileId}', '${side.toLowerCase()}', 1);" />
          `;
        } else {
          // Placeholder deportivo estilizado
          logoEl.innerHTML = `
            <div class="logo-placeholder side-${side.toLowerCase()}">
              <i class="fa-solid fa-basketball"></i>
              <span class="placeholder-tag">Equipo ${side}</span>
            </div>
          `;
        }
      }
    } else {
      cardEl.classList.remove("team-selected");
      if (clearBtn) clearBtn.style.display = "none";

      if (nameEl)
        nameEl.textContent =
          side === "A"
            ? "Seleccione Equipo Local"
            : "Seleccione Equipo Visitante";
      if (idEl) idEl.textContent = "--";
      if (codeEl) codeEl.textContent = "--";
      if (rifEl) rifEl.textContent = "";

      if (logoEl) {
        logoEl.innerHTML = `
          <div class="logo-empty-state side-${side.toLowerCase()}">
            <i class="fa-solid fa-user-plus"></i>
            <span>Buscar Equipo ${side}</span>
          </div>
        `;
      }
    }
  }

  /**
   * Renderiza el estado visual de cada una de las 3 tarjetas de Árbitros
   */
  function renderRefereeCard(refIndex, refData) {
    const cardEl = document.getElementById(`referee-card-${refIndex}`);
    const photoEl = document.getElementById(`referee-photo-${refIndex}`);
    const nameEl = document.getElementById(`referee-name-${refIndex}`);
    const cedulaEl = document.getElementById(`referee-cedula-${refIndex}`);
    const roleEl = document.getElementById(`referee-role-${refIndex}`);
    const idEl = document.getElementById(`referee-id-${refIndex}`);
    const clearBtn = document.getElementById(`btn-clear-referee-${refIndex}`);

    if (!cardEl) return;

    if (refData) {
      cardEl.classList.add("referee-selected");
      if (clearBtn) clearBtn.style.display = "inline-flex";

      if (nameEl) nameEl.textContent = refData.name;
      if (cedulaEl) cedulaEl.textContent = refData.cedula || "--";
      if (roleEl) roleEl.textContent = refData.role || `Árbitro ${refIndex}`;
      if (idEl)
        idEl.textContent =
          refData.id && refData.id !== "N/A" ? `ID: ${refData.id}` : "";

      if (photoEl) {
        if (refData.photo) {
          const fileId = refData.driveId || extractDriveFileId(refData.photo);
          photoEl.innerHTML = `
            <img src="${refData.photo}" 
                 alt="${escapeHtml(refData.name)}" 
                 class="referee-avatar-img" 
                 referrerpolicy="no-referrer"
                 crossorigin="anonymous"
                 loading="eager"
                 onerror="window.handleRefereePhotoError(this, '${fileId}', ${refIndex}, 1);" />
          `;
        } else {
          photoEl.innerHTML = `
            <div class="referee-empty-state">
              <i class="fa-solid fa-user-tie"></i>
              <span>${escapeHtml(refData.name)}</span>
            </div>
          `;
        }
      }
    } else {
      cardEl.classList.remove("referee-selected");
      if (clearBtn) clearBtn.style.display = "none";

      if (nameEl) nameEl.textContent = "Sin Árbitro Asignado";
      if (cedulaEl) cedulaEl.textContent = "--";
      if (roleEl) roleEl.textContent = "--";
      if (idEl) idEl.textContent = "";

      if (photoEl) {
        photoEl.innerHTML = `
          <div class="referee-empty-state">
            <i class="fa-solid fa-user-plus"></i>
            <span>Buscar Árbitro ${refIndex}</span>
          </div>
        `;
      }
    }
  }

  function clearTeamSelection(side) {
    if (side === "A") {
      currentDraft.teamA = null;
    } else {
      currentDraft.teamB = null;
    }
    renderCurrentDraft();
    showToast(`Equipo ${side} deseleccionado`, "info");
  }

  function clearRefereeSelection(refIndex) {
    currentDraft[`referee${refIndex}`] = null;
    const inputSearch = document.getElementById(`search-referee-${refIndex}`);
    if (inputSearch) inputSearch.value = "";
    renderRefereeCard(refIndex, null);
    showToast(`Árbitro ${refIndex} deseleccionado`, "info");
  }

  function resetCurrentDraft() {
    editingMatchupId = null;
    currentDraft = {
      tournamentId: currentDraft.tournamentId || "TMT-00001",
      tournamentName: currentDraft.tournamentName || "",
      gameTitle: `JUEGO ${currentMatchups.length + 1}`,
      gameTime: "07:00 PM",
      gameDate: new Date().toISOString().split("T")[0],
      courtLocation: "Cancha Principal",
      scoreA: 0,
      scoreB: 0,
      teamA: null,
      teamB: null,
      referee1: null,
      referee2: null,
      referee3: null,
      notes: "",
    };
    [1, 2, 3].forEach((idx) => {
      const input = document.getElementById(`search-referee-${idx}`);
      if (input) input.value = "";
    });
    renderCurrentDraft();
    showToast("Formulario de enfrentamiento reiniciado", "info");
  }

  function addNewMatchupDraft() {
    resetCurrentDraft();
    const arenaSection = document.getElementById("versus-arena-box");
    if (arenaSection) {
      arenaSection.scrollIntoView({ behavior: "smooth" });
    }
    showToast("Listo para agregar un nuevo enfrentamiento", "info");
  }

  // =====================================================================================
  // 5. [GUARDADO, MODIFICACIÓN Y REESCRITURA DE ENFRENTAMIENTOS]
  // -------------------------------------------------------------------------------------
  // Esta función gestiona el flujo completo:
  //   A. SI SE ESTÁ MODIFICANDO (editingMatchupId existe):
  //      - Conserva el ID del registro existente.
  //      - REEMPLAZA / REESCRIBE el registro existente en la cartelera local y en la nube.
  //      - Envía action: "update" a Google Sheets para sobreescribir la misma fila según el ID.
  //   B. SI ES UN ENFRENTAMIENTO NUEVO (editingMatchupId es null):
  //      - Genera un nuevo ID único.
  //      - AGREGA un nuevo registro a la cartelera y lo envía como nuevo a Google Sheets.
  // =====================================================================================
  async function saveCurrentMatchup() {
    if (!currentDraft.teamA || !currentDraft.teamB) {
      showToast(
        "Debes seleccionar ambos equipos (Equipo A y Equipo B) antes de guardar",
        "warning",
      );
      return;
    }

    const isUpdate = Boolean(editingMatchupId);
    const existingId = editingMatchupId;

    const saveBtn = document.getElementById("btn-save-matchup");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${isUpdate ? "Actualizando..." : "Guardando..."}`;
    }

    // ID del registro: si se está modificando se conserva el ID existente; si es nuevo se genera uno nuevo
    const targetMatchId = isUpdate ? existingId : `MATCH-${Date.now()}`;

    const tournIdVal = currentDraft.tournamentId || "TMT-00001";
    const tournNameVal = currentDraft.tournamentName || "Torneo General";

    const matchupRecord = {
      id: targetMatchId,
      ID_Tournament: tournIdVal,
      Tournament: tournNameVal,
      tournamentId: tournIdVal,
      tournamentName: tournNameVal,
      gameNumber: isUpdate
        ? currentMatchups.find((m) => m.id === targetMatchId)?.gameNumber ||
          currentMatchups.length
        : currentMatchups.length + 1,
      gameTitle:
        currentDraft.gameTitle || `JUEGO ${currentMatchups.length + 1}`,
      gameTime: currentDraft.gameTime || "07:00 PM",
      gameDate: currentDraft.gameDate || new Date().toISOString().split("T")[0],
      courtLocation: currentDraft.courtLocation || "Cancha Principal",

      // Puntuación de los equipos
      scoreA: currentDraft.scoreA != null ? Number(currentDraft.scoreA) : 0,
      scoreB: currentDraft.scoreB != null ? Number(currentDraft.scoreB) : 0,

      // Datos Equipo A (Local)
      teamA_id: currentDraft.teamA.id,
      teamA_name: currentDraft.teamA.name,
      teamA_code: currentDraft.teamA.code,
      teamA_rif: currentDraft.teamA.rif,
      teamA_logo: currentDraft.teamA.logo,

      // Datos Equipo B (Visitante)
      teamB_id: currentDraft.teamB.id,
      teamB_name: currentDraft.teamB.name,
      teamB_code: currentDraft.teamB.code,
      teamB_rif: currentDraft.teamB.rif,
      teamB_logo: currentDraft.teamB.logo,

      // Datos de los 3 Árbitros (Cuerpo Técnico)
      referee1_id: currentDraft.referee1 ? currentDraft.referee1.id : "",
      referee1_name: currentDraft.referee1 ? currentDraft.referee1.name : "",
      referee1_cedula: currentDraft.referee1
        ? currentDraft.referee1.cedula
        : "",
      referee1_role: currentDraft.referee1 ? currentDraft.referee1.role : "",
      referee1_photo: currentDraft.referee1 ? currentDraft.referee1.photo : "",

      referee2_id: currentDraft.referee2 ? currentDraft.referee2.id : "",
      referee2_name: currentDraft.referee2 ? currentDraft.referee2.name : "",
      referee2_cedula: currentDraft.referee2
        ? currentDraft.referee2.cedula
        : "",
      referee2_role: currentDraft.referee2 ? currentDraft.referee2.role : "",
      referee2_photo: currentDraft.referee2 ? currentDraft.referee2.photo : "",

      referee3_id: currentDraft.referee3 ? currentDraft.referee3.id : "",
      referee3_name: currentDraft.referee3 ? currentDraft.referee3.name : "",
      referee3_cedula: currentDraft.referee3
        ? currentDraft.referee3.cedula
        : "",
      referee3_role: currentDraft.referee3 ? currentDraft.referee3.role : "",
      referee3_photo: currentDraft.referee3 ? currentDraft.referee3.photo : "",

      status: isUpdate
        ? currentMatchups.find((m) => m.id === targetMatchId)?.status ||
          "programado"
        : "programado",
      notes: currentDraft.notes || "",
      updatedAt: new Date().toISOString(),
      createdAt: isUpdate
        ? currentMatchups.find((m) => m.id === targetMatchId)?.createdAt ||
          new Date().toISOString()
        : new Date().toISOString(),
    };

    if (isUpdate) {
      // REESCRIBIR / REEMPLAZAR EL REGISTRO EXISTENTE EN EL ARREGLO LOCAL
      const idx = currentMatchups.findIndex((m) => m.id === targetMatchId);
      if (idx !== -1) {
        currentMatchups[idx] = matchupRecord;
      }
      editingMatchupId = null;
      showToast(
        `Enfrentamiento "${matchupRecord.gameTitle}" actualizado y reescrito con éxito`,
        "success",
      );
    } else {
      // AGREGAR NUEVO REGISTRO AL FINAL DE LA CARTELERA
      currentMatchups.push(matchupRecord);
      showToast(
        `Nuevo enfrentamiento "${matchupRecord.gameTitle}" agregado a la cartelera`,
        "success",
      );
    }

    // 1. Guardar estado local
    registerTournament(tournIdVal, tournNameVal);
    saveMatchupsToLocal();
    renderMatchupsList();

    // 2. Guardar en el Servidor / Nube (Persistencia global sincronizada)
    saveAllMatchupsToCloudServer(true);

    // 3. Guardar o sobreescribir en Google Sheets en la hoja "Game" según corresponda
    await saveMatchupToGoogleSheets(matchupRecord, isUpdate);

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar Enfrentamiento`;
    }

    // Preparar el formulario para el siguiente enfrentamiento con marcador en 0 y conservando el torneo seleccionado
    currentDraft = {
      tournamentId: tournIdVal,
      tournamentName: tournNameVal,
      gameTitle: `JUEGO ${currentMatchups.length + 1}`,
      gameTime: "08:30 PM",
      gameDate: currentDraft.gameDate,
      courtLocation: "Cancha Principal",
      scoreA: 0,
      scoreB: 0,
      teamA: null,
      teamB: null,
      referee1: null,
      referee2: null,
      referee3: null,
      notes: "",
    };
    [1, 2, 3].forEach((idx) => {
      const input = document.getElementById(`search-referee-${idx}`);
      if (input) input.value = "";
    });
    renderCurrentDraft();
  }

  // =====================================================================================
  // 6. [SINCRONIZACIÓN Y ESCRITURA EN GOOGLE SHEETS]
  // -------------------------------------------------------------------------------------
  // Si isUpdate === true, envía action: "update" para SOBREESCRIBIR la fila existente
  // utilizando SHEET_CONFIG.GAME_KEY_COLUMN ("ID").
  // Si isUpdate === false, envía action: "insert" para crear una fila nueva.
  // =====================================================================================
  async function saveMatchupToGoogleSheets(matchup, isUpdate = false) {
    try {
      const fieldsData = {
        ID: matchup.id,
        ID_Tournament:
          matchup.ID_Tournament ||
          matchup.id_tournament ||
          matchup.tournamentId ||
          "TMT-00001",
        Tournament:
          matchup.Tournament ||
          matchup.tournament ||
          matchup.tournamentName ||
          "Torneo General",
        Fecha: matchup.gameDate,
        Hora: matchup.gameTime,
        TituloJuego: matchup.gameTitle,
        EquipoA_ID: matchup.teamA_id,
        EquipoA_Nombre: matchup.teamA_name,
        EquipoA_Codigo: matchup.teamA_code,
        EquipoA_Logo: matchup.teamA_logo,
        EquipoB_ID: matchup.teamB_id,
        EquipoB_Nombre: matchup.teamB_name,
        EquipoB_Codigo: matchup.teamB_code,
        EquipoB_Logo: matchup.teamB_logo,

        // Marcadores de puntuación y estatus
        Marcador_EquipoA: matchup.scoreA != null ? matchup.scoreA : 0,
        Marcador_EquipoB: matchup.scoreB != null ? matchup.scoreB : 0,
        Marcador: `${matchup.scoreA != null ? matchup.scoreA : 0} - ${matchup.scoreB != null ? matchup.scoreB : 0}`,
        Estatus:
          matchup.status === "pospuesto"
            ? "Pospuesto"
            : matchup.status === "finalizado"
              ? "Finalizado"
              : "Programado",

        // Árbitros del Cuerpo Técnico
        Arbitro1_Nombre: matchup.referee1_name || "",
        Arbitro1_Cedula: matchup.referee1_cedula || "",
        Arbitro1_Rol: matchup.referee1_role || "",
        Arbitro2_Nombre: matchup.referee2_name || "",
        Arbitro2_Cedula: matchup.referee2_cedula || "",
        Arbitro2_Rol: matchup.referee2_role || "",
        Arbitro3_Nombre: matchup.referee3_name || "",
        Arbitro3_Cedula: matchup.referee3_cedula || "",
        Arbitro3_Rol: matchup.referee3_role || "",

        OBSERVACIONES: `Enfrentamiento ${matchup.teamA_name} (${matchup.scoreA != null ? matchup.scoreA : 0}) vs ${matchup.teamB_name} (${matchup.scoreB != null ? matchup.scoreB : 0}). ${matchup.notes || ""}`,
      };

      const payload = isUpdate
        ? {
            sheetName: SHEET_CONFIG.GAME_SHEET,
            action: "update",
            keyColumn: SHEET_CONFIG.GAME_KEY_COLUMN,
            keyValue: matchup.id,
            ID: matchup.id,
            updates: fieldsData,
            t: Date.now(),
          }
        : {
            sheetName: SHEET_CONFIG.GAME_SHEET,
            action: "insert",
            ...fieldsData,
            t: Date.now(),
          };

      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();
      console.log(
        `[Game.js] ${isUpdate ? "Actualizado/Reescrito" : "Guardado"} en Google Sheets "${SHEET_CONFIG.GAME_SHEET}":`,
        resData,
      );
    } catch (e) {
      console.warn(
        "[Game.js] Guardado local exitoso. Google Sheets en segundo plano:",
        e,
      );
    }
  }

  /**
   * Sincroniza todos los enfrentamientos con la hoja "Game" de Google Sheets
   * respetando actualizaciones y evitando duplicados
   */
  async function syncAllMatchupsToGoogleSheets() {
    if (currentMatchups.length === 0) {
      showToast(
        "No hay enfrentamientos en la lista para sincronizar",
        "warning",
      );
      return;
    }

    const btnSync = document.getElementById("btn-sync-sheets");
    if (btnSync) {
      btnSync.disabled = true;
      btnSync.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...`;
    }

    let successCount = 0;
    // Intentar primero sincronización masiva limpia si el script la soporta
    try {
      const gasPayload = {
        sheetName: SHEET_CONFIG.GAME_SHEET,
        action: "saveAllMatchups",
        matchups: currentMatchups,
        t: Date.now(),
      };
      const resp = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(gasPayload),
      });
      const data = await resp.json();
      if (data && (data.status === "success" || data.count)) {
        successCount = currentMatchups.length;
      }
    } catch (bulkErr) {
      console.warn(
        "[Game.js] Falló sincronización masiva, procediendo registro a registro:",
        bulkErr,
      );
    }

    // Si falló masivo, sincronizar registro por registro
    if (successCount === 0) {
      for (const match of currentMatchups) {
        try {
          await saveMatchupToGoogleSheets(match, true);
          successCount++;
        } catch (err) {
          console.error("Error sincronizando:", err);
        }
      }
    }

    if (btnSync) {
      btnSync.disabled = false;
      btnSync.innerHTML = `<i class="fa-solid fa-file-excel"></i> Sincronizar Sheets`;
    }

    showToast(
      `¡${successCount} de ${currentMatchups.length} enfrentamientos sincronizados en la hoja "${SHEET_CONFIG.GAME_SHEET}"!`,
      "success",
    );
  }

  // =========================================================================
  // 6. RENDERIZADO DE LA LISTA DE ENFRENTAMIENTOS (CARTELERA)
  // =========================================================================
  function renderMatchupsList() {
    const container = document.getElementById("matchups-list-container");
    const countBadge = document.getElementById("matchups-count-badge");

    if (countBadge) {
      countBadge.textContent = `${currentMatchups.length} ${currentMatchups.length === 1 ? "Juego" : "Juegos"}`;
    }

    if (!container) return;

    if (currentMatchups.length === 0) {
      container.innerHTML = `
        <div class="empty-matchups-box">
          <i class="fa-solid fa-trophy"></i>
          <h4>No hay enfrentamientos guardados aún</h4>
          <p>Selecciona el modo <strong>"Ingresar (Crear nuevo registro)"</strong> para armar la cartelera de juegos.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = "";

    currentMatchups.forEach((match, index) => {
      const card = document.createElement("div");
      card.className = "matchup-card-item";
      card.id = `card-match-${match.id}`;

      // Comprueba si tiene árbitros asignados
      const hasReferees =
        match.referee1_name || match.referee2_name || match.referee3_name;

      const scoreA = match.scoreA != null ? match.scoreA : 0;
      const scoreB = match.scoreB != null ? match.scoreB : 0;

      // Estatus del juego (Programado: Azul Neón / Pospuesto: Naranja Neón / Finalizado: Rojo Neón)
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

      card.innerHTML = `
        <!-- Encabezado del Juego con ID en esquina superior izquierda, Título, Hora, Torneo y Fecha -->
        <div class="matchup-card-header">
          <span class="matchup-id-tag"><i class="fa-solid fa-hashtag"></i> ${escapeHtml(match.id)}</span>
          <div class="matchup-title-badge">
            <i class="fa-solid fa-basketball"></i>
            <span>${escapeHtml(match.gameTitle)}</span>
          </div>
          <div class="matchup-time-badge">
            <i class="fa-regular fa-clock"></i>
            <span>${escapeHtml(match.gameTime)}</span>
          </div>
          ${
            match.ID_Tournament ||
            match.id_tournament ||
            match.tournamentId ||
            match.Tournament ||
            match.tournament ||
            match.tournamentName
              ? `
              <div class="matchup-tournament-badge" title="Torneo: ${escapeHtml(match.Tournament || match.tournament || match.tournamentName || "")} (${escapeHtml(match.ID_Tournament || match.id_tournament || match.tournamentId || "")})">
                <i class="fa-solid fa-trophy"></i>
                <span class="matchup-tourn-id">${escapeHtml(match.ID_Tournament || match.id_tournament || match.tournamentId || "")}</span>
                ${(match.ID_Tournament || match.id_tournament || match.tournamentId) && (match.Tournament || match.tournament || match.tournamentName) ? `<span class="matchup-tourn-sep">-</span>` : ""}
                <span class="matchup-tourn-name">${escapeHtml(match.Tournament || match.tournament || match.tournamentName || "")}</span>
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
              <h5 class="matchup-team-name">${escapeHtml(match.teamA_name)}</h5>
              <div class="matchup-team-meta">
                <span><i class="fa-solid fa-fingerprint"></i> ID: ${escapeHtml(match.teamA_id)}</span>
                <span><i class="fa-solid fa-barcode"></i> ${escapeHtml(match.teamA_code)}</span>
              </div>
            </div>
            <div class="matchup-team-logo-wrap">
              ${
                match.teamA_logo
                  ? `<img src="${match.teamA_logo}" alt="${escapeHtml(match.teamA_name)}" class="team-mini-logo" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="window.handleTeamLogoError(this, '${extractDriveFileId(match.teamA_logo)}', 'a', 1);" />`
                  : `<div class="mini-placeholder side-a"><i class="fa-solid fa-shield-halved"></i></div>`
              }
            </div>
          </div>

          <!-- Centro VS con Indicador de Estatus Encima y Puntuación Debajo -->
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

              <!-- Indicador de Estatus del Juego (Encima del VS) -->
            <div class="game-status-pill status-${statusKey}" title="Estatus del juego: ${statusLabel}">
              <span class="status-dot"></span>
              <span class="status-label">${statusLabel}</span>
            </div>

          </div>

          <!-- Equipo B (Visitante): Logo a la izquierda (junto al VS), Info a la derecha -->
          <div class="matchup-team side-b">
            <div class="matchup-team-logo-wrap">
              ${
                match.teamB_logo
                  ? `<img src="${match.teamB_logo}" alt="${escapeHtml(match.teamB_name)}" class="team-mini-logo" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="window.handleTeamLogoError(this, '${extractDriveFileId(match.teamB_logo)}', 'b', 1);" />`
                  : `<div class="mini-placeholder side-b"><i class="fa-solid fa-shield-halved"></i></div>`
              }
            </div>
            <div class="matchup-team-info text-right">
              <span class="matchup-team-tag visitor">VISITANTE</span>
              <h5 class="matchup-team-name">${escapeHtml(match.teamB_name)}</h5>
              <div class="matchup-team-meta">
                <span><i class="fa-solid fa-fingerprint"></i> ID: ${escapeHtml(match.teamB_id)}</span>
                <span><i class="fa-solid fa-barcode"></i> ${escapeHtml(match.teamB_code)}</span>
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

        <!-- Barra de Acciones: Cambiar Estatus, Modificar y Eliminar protegidos con Administrador -->
        <div class="matchup-card-footer">
          <div class="matchup-notes-preview">
            ${match.notes ? `<i class="fa-solid fa-comment-dots"></i> ${escapeHtml(match.notes)}` : `<span>Enfrentamiento #${index + 1}</span>`}
          </div>
          <div class="matchup-actions-group">
            <button class="button is-small btn-status-match" data-id="${match.id}" title="Cambiar estatus del juego (Requiere Administrador)">
              <i class="fa-solid fa-flag"></i> Estatus
            </button>
            <button class="button is-small is-warning btn-edit-match" data-id="${match.id}" title="Modificar este enfrentamiento (Requiere Administrador)">
              <i class="fa-solid fa-pen-to-square"></i> Modificar
            </button>
            <button class="button is-small is-danger btn-delete-match" data-id="${match.id}" title="Eliminar este enfrentamiento (Requiere Administrador)">
              <i class="fa-solid fa-trash-can"></i> Eliminar
            </button>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    // Enlazar botones de cambiar estatus, modificar y eliminar con confirmación de credenciales de Administrador
    container.querySelectorAll(".btn-status-match").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        requestAdminAccess("Cambiar estatus del juego", () => {
          openMatchupStatusModal(id);
        });
      });
    });

    container.querySelectorAll(".btn-edit-match").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        requestAdminAccess("Modificar enfrentamiento", () => {
          editMatchup(id);
        });
      });
    });

    container.querySelectorAll(".btn-delete-match").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        requestAdminAccess("Eliminar enfrentamiento", () => {
          deleteMatchup(id);
        });
      });
    });
  }

  function editMatchup(id) {
    const match = currentMatchups.find((m) => m.id === id);
    if (!match) return;

    // Cambiar al modo "ingresar" para mostrar la arena de edición
    applyGameMode("ingresar");

    const tournId =
      match.ID_Tournament ||
      match.id_tournament ||
      match.tournamentId ||
      "TMT-00001";
    const tournName =
      match.Tournament || match.tournament || match.tournamentName || "";

    editingMatchupId = match.id;
    currentDraft = {
      tournamentId: tournId,
      tournamentName: tournName,
      gameTitle: match.gameTitle,
      gameTime: match.gameTime,
      gameDate: match.gameDate,
      courtLocation: match.courtLocation,
      scoreA: match.scoreA != null ? match.scoreA : 0,
      scoreB: match.scoreB != null ? match.scoreB : 0,
      teamA: {
        id: match.teamA_id,
        name: match.teamA_name,
        code: match.teamA_code,
        rif: match.teamA_rif,
        logo: match.teamA_logo,
      },
      teamB: {
        id: match.teamB_id,
        name: match.teamB_name,
        code: match.teamB_code,
        rif: match.teamB_rif,
        logo: match.teamB_logo,
      },
      referee1: match.referee1_name
        ? {
            id: match.referee1_id,
            name: match.referee1_name,
            cedula: match.referee1_cedula,
            role: match.referee1_role,
            photo: match.referee1_photo,
          }
        : null,
      referee2: match.referee2_name
        ? {
            id: match.referee2_id,
            name: match.referee2_name,
            cedula: match.referee2_cedula,
            role: match.referee2_role,
            photo: match.referee2_photo,
          }
        : null,
      referee3: match.referee3_name
        ? {
            id: match.referee3_id,
            name: match.referee3_name,
            cedula: match.referee3_cedula,
            role: match.referee3_role,
            photo: match.referee3_photo,
          }
        : null,
      notes: match.notes,
    };

    renderCurrentDraft();

    const arenaSection = document.getElementById("versus-arena-box");
    if (arenaSection) {
      arenaSection.scrollIntoView({ behavior: "smooth" });
    }

    showToast(
      `Modificando: ${match.gameTitle} (${match.teamA_name} [${currentDraft.scoreA}] VS [${currentDraft.scoreB}] ${match.teamB_name})`,
      "info",
    );
  }

  async function deleteMatchup(id) {
    const match = currentMatchups.find((m) => m.id === id);
    const title = match ? match.gameTitle : "Enfrentamiento";

    if (
      confirm(
        `¿Estás seguro de que deseas eliminar "${title}" de la cartelera?`,
      )
    ) {
      currentMatchups = currentMatchups.filter((m) => m.id !== id);
      saveMatchupsToLocal();
      renderMatchupsList();
      await saveAllMatchupsToCloudServer(true); // Sincronizar eliminación en el servidor y en la hoja Game2
      showToast(
        `Enfrentamiento eliminado de la cartelera y de la hoja ${SHEET_CONFIG.CLOUD_SHEET}`,
        "info",
      );
    }
  }

  // =========================================================================
  // GESTOR DEL MODAL DE CAMBIO DE ESTATUS DEL JUEGO
  // =========================================================================
  let activeStatusMatchupId = null;

  function setupStatusModal() {
    const btnClose = document.getElementById("btn-close-status-modal");
    const btnCancel = document.getElementById("btn-cancel-status-modal");
    const backdrop = document.getElementById("matchup-status-backdrop");
    const btnSave = document.getElementById("btn-save-status-modal");

    if (btnClose) btnClose.addEventListener("click", closeMatchupStatusModal);
    if (btnCancel) btnCancel.addEventListener("click", closeMatchupStatusModal);
    if (backdrop) backdrop.addEventListener("click", closeMatchupStatusModal);

    if (btnSave) {
      btnSave.addEventListener("click", saveMatchupStatusSelection);
    }
  }

  function openMatchupStatusModal(id) {
    const match = currentMatchups.find((m) => m.id === id);
    if (!match) return;

    activeStatusMatchupId = id;
    const modal = document.getElementById("matchup-status-modal");
    const titleEl = document.getElementById("status-modal-title");
    const matchupNamesEl = document.getElementById(
      "status-modal-matchup-names",
    );

    if (titleEl) titleEl.textContent = match.gameTitle || "JUEGO";
    if (matchupNamesEl)
      matchupNamesEl.textContent = `${match.teamA_name} vs ${match.teamB_name}`;

    const currentStatus = (
      match.status ||
      match.Estatus ||
      match.Estado ||
      "programado"
    ).toLowerCase();
    const targetStatus =
      currentStatus === "pospuesto" || currentStatus === "finalizado"
        ? currentStatus
        : "programado";
    const radio = document.querySelector(
      `input[name="matchup_status_choice"][value="${targetStatus}"]`,
    );
    if (radio) {
      radio.checked = true;
    } else {
      const defaultRadio = document.getElementById("status-radio-programado");
      if (defaultRadio) defaultRadio.checked = true;
    }

    if (modal) {
      modal.classList.add("is-active");
    }
  }

  function closeMatchupStatusModal() {
    const modal = document.getElementById("matchup-status-modal");
    if (modal) {
      modal.classList.remove("is-active");
    }
    activeStatusMatchupId = null;
  }

  async function saveMatchupStatusSelection() {
    if (!activeStatusMatchupId) return;

    const selectedRadio = document.querySelector(
      'input[name="matchup_status_choice"]:checked',
    );
    const newStatus = selectedRadio ? selectedRadio.value : "programado";

    const match = currentMatchups.find((m) => m.id === activeStatusMatchupId);
    if (match) {
      match.status = newStatus;
      saveMatchupsToLocal();
      renderMatchupsList();

      const statusLabels = {
        programado: "Programado (Azul Neón)",
        pospuesto: "Pospuesto (Naranja Neón)",
        finalizado: "Finalizado (Rojo Neón)",
      };

      showToast(
        `Estatus actualizado a: ${statusLabels[newStatus] || newStatus}`,
        "success",
      );

      // Guardar inmediatamente en el Servidor / Nube (para todas las IPs) y en Google Sheets
      saveAllMatchupsToCloudServer(true);
      await saveMatchupToGoogleSheets(match);
    }

    closeMatchupStatusModal();
  }

  // =====================================================================================
  // 7. [PERSISTENCIA EN NUBE / SERVIDOR Y CARGA MULTIDISPOSITIVO]
  // -------------------------------------------------------------------------------------
  // INSTRUCCIONES PARA MODIFICAR LA RUTA DONDE GUARDAR O CARGAR DE LA NUBE:
  // - Para cambiar el endpoint del servidor Node/Express, edita arriba 'CLOUD_API_ENDPOINTS'
  // - Para cambiar la URL de Google Apps Script, edita arriba 'SCRIPT_URL'
  // - Para cambiar la hoja de cálculo de destino, edita arriba 'SHEET_CONFIG.GAME_SHEET'
  // =====================================================================================

  /**
   * Actualiza el indicador visual de estado en la nube
   */
  function updateCloudStatus(state, text) {
    const indicator = document.getElementById("cloud-sync-status-indicator");
    const label = document.getElementById("cloud-status-text");
    if (!indicator || !label) return;

    indicator.className = `cloud-sync-status-indicator status-${state}`;
    label.textContent = text;
  }

  /**
   * [GUARDAR CARTELERA EN NUBE]
   * Guarda todos los enfrentamientos en el servidor (CLOUD_API_ENDPOINTS.SAVE_MATCHUPS_URL)
   * y los sincroniza con la hoja "Game2" de Google Sheets para persistencia global.
   */
  async function saveAllMatchupsToCloudServer(silent = false) {
    const btnSaveCloud = document.getElementById("btn-save-cloud");
    const originalHtml = btnSaveCloud ? btnSaveCloud.innerHTML : "";

    if (!silent && btnSaveCloud) {
      btnSaveCloud.disabled = true;
      btnSaveCloud.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando en Nube...`;
    }

    updateCloudStatus("syncing", "Guardando en nube...");

    let serverSaved = false;

    // 1. Guardar en API del Servidor Node / Express (CLOUD_API_ENDPOINTS.SAVE_MATCHUPS_URL)
    try {
      const response = await fetch(CLOUD_API_ENDPOINTS.SAVE_MATCHUPS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchups: currentMatchups, t: Date.now() }),
      });
      if (response.ok) {
        serverSaved = true;
      }
    } catch (e) {
      console.warn("[Game.js] API del servidor local no disponible:", e);
    }

    // 2. Sincronizar en segundo plano con Google Sheets en la hoja "Game2" (SHEET_CONFIG.CLOUD_SHEET)
    try {
      const gasPayload = {
        sheetName: SHEET_CONFIG.CLOUD_SHEET, // "Game2"
        action: "saveAllMatchups",
        matchups: currentMatchups,
        t: Date.now(),
      };
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(gasPayload),
      });
    } catch (gasErr) {
      console.warn(
        `[Game.js] Respaldo en Google Sheets hoja "${SHEET_CONFIG.CLOUD_SHEET}":`,
        gasErr,
      );
    }

    // 3. Guardar en localStorage como caché local del dispositivo
    saveMatchupsToLocal();

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (serverSaved) {
      updateCloudStatus("success", `Nube actualizada (${timeStr})`);
      if (!silent) {
        showToast(
          `¡Cartelera guardada en la nube y sincronizada con la hoja "${SHEET_CONFIG.CLOUD_SHEET}" (${currentMatchups.length} juegos)!`,
          "success",
        );
      }
    } else {
      updateCloudStatus("idle", `Guardado local (${timeStr})`);
      if (!silent) {
        showToast(
          `Guardado localmente en este dispositivo y sincronizado en "${SHEET_CONFIG.CLOUD_SHEET}".`,
          "info",
        );
      }
    }

    if (!silent && btnSaveCloud) {
      btnSaveCloud.disabled = false;
      btnSaveCloud.innerHTML =
        originalHtml ||
        `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar Cartelera en Nube`;
    }
  }

  /**
   * [CARGAR CARTELERA DE NUBE]
   * Consulta el servidor (CLOUD_API_ENDPOINTS.LOAD_MATCHUPS_URL) y la hoja "Game2" de Google Apps Script
   * para descargar los enfrentamientos de la cartelera. Si la hoja Game2 está vacía, limpia la cartelera.
   */
  async function loadMatchupsFromCloudServer(userTriggered = false) {
    const btnReloadCloud = document.getElementById("btn-reload-cloud");
    const originalHtml = btnReloadCloud ? btnReloadCloud.innerHTML : "";

    if (userTriggered && btnReloadCloud) {
      btnReloadCloud.disabled = true;
      btnReloadCloud.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cargando...`;
    }

    updateCloudStatus("syncing", "Consultando nube...");

    let loadedMatchups = null;
    let fetchedSuccessfully = false;

    // 1. Intentar descargar desde API del Servidor (CLOUD_API_ENDPOINTS.LOAD_MATCHUPS_URL)
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
        "[Game.js] API del servidor no disponible, intentando Google Apps Script:",
        err,
      );
    }

    // 2. Si no hubo datos del servidor o si se solicita, consultar a Google Apps Script ÚNICAMENTE en la hoja "Game2" (SHEET_CONFIG.CLOUD_SHEET)
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
            loadedMatchups = data.matchups.map((m) => {
              const tId =
                m.ID_Tournament || m.id_tournament || m.tournamentId || "";
              const tName =
                m.Tournament || m.tournament || m.tournamentName || "";
              if (tId) {
                registerTournament(tId, tName);
              }
              return {
                id: m.ID || m.id || `MATCH-${Date.now()}`,
                ID_Tournament: tId,
                Tournament: tName,
                tournamentId: tId,
                tournamentName: tName,
                gameTitle: m.TituloJuego || m.gameTitle || "JUEGO",
                gameTime: m.Hora || m.gameTime || "08:00 PM",
                gameDate: m.Fecha || m.gameDate || "",
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
                referee2_name: m.Arbitro2_Nombre || m.referee2_name || "",
                referee2_cedula: m.Arbitro2_Cedula || m.referee2_cedula || "",
                referee2_role: m.Arbitro2_Rol || m.referee2_role || "",
                referee3_name: m.Arbitro3_Nombre || m.referee3_name || "",
                referee3_cedula: m.Arbitro3_Cedula || m.referee3_cedula || "",
                referee3_role: m.Arbitro3_Rol || m.referee3_role || "",
                status: (
                  m.Estatus ||
                  m.Estado ||
                  m.status ||
                  "programado"
                ).toLowerCase(),
                notes: m.OBSERVACIONES || m.notes || "",
              };
            });
            fetchedSuccessfully = true;
          }
        }
      } catch (err) {
        console.warn(
          `[Game.js] Falló consulta a Google Apps Script (${SHEET_CONFIG.CLOUD_SHEET}):`,
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
      currentMatchups = loadedMatchups;
      saveMatchupsToLocal();
      renderMatchupsList();

      if (currentMatchups.length > 0) {
        updateCloudStatus(
          "success",
          `Cargados: ${currentMatchups.length} juegos de ${SHEET_CONFIG.CLOUD_SHEET} (${timeStr})`,
        );

        if (userTriggered) {
          showToast(
            `¡Cartelera cargada con éxito desde la nube (${SHEET_CONFIG.CLOUD_SHEET})! Se encontraron ${currentMatchups.length} juegos.`,
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
            `No hay enfrentamientos en la hoja "${SHEET_CONFIG.CLOUD_SHEET}".`,
            "info",
          );
        }
      }
    } else {
      updateCloudStatus("idle", `Listo (${timeStr})`);
      if (userTriggered) {
        showToast(
          `No se pudo sincronizar con la nube (${SHEET_CONFIG.CLOUD_SHEET}).`,
          "warning",
        );
      }
    }

    if (userTriggered && btnReloadCloud) {
      btnReloadCloud.disabled = false;
      btnReloadCloud.innerHTML =
        originalHtml ||
        `<i class="fa-solid fa-arrows-rotate"></i> Cargar de Nube`;
    }
  }

  function saveMatchupsToLocal() {
    try {
      localStorage.setItem(
        "GAME_MATCHUPS_LIST",
        JSON.stringify(currentMatchups),
      );
    } catch (e) {
      console.warn("No se pudo guardar en localStorage:", e);
    }
  }

  function loadSavedMatchupsFromLocal() {
    try {
      const saved = localStorage.getItem("GAME_MATCHUPS_LIST");
      if (saved) {
        currentMatchups = JSON.parse(saved);
        if (!Array.isArray(currentMatchups)) currentMatchups = [];
      }
    } catch (e) {
      currentMatchups = [];
    }
    renderMatchupsList();
  }

  // =========================================================================
  // 8. UTILIDADES Y EXPORTACIÓN GLOBAL
  // =========================================================================
  function showToast(text, type = "info") {
    const toast = document.createElement("div");
    toast.className = `custom-game-toast toast-${type}`;

    let icon = "fa-circle-info";
    if (type === "success") icon = "fa-circle-check";
    if (type === "warning") icon = "fa-triangle-exclamation";
    if (type === "error") icon = "fa-circle-xmark";

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(text)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 300);
    }, 3500);
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

  // Exponer métodos para integración con Exportacion.js y otros módulos
  window.getGameMatchups = function () {
    return currentMatchups;
  };
  window.getCurrentMatchups = function () {
    return currentMatchups;
  };
  window.showToast = showToast;
})();

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
