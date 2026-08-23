/**
 * =====================================================================================
 * ARCHIVO: Afiliados.js
 * DESCRIPCIÓN: Controlador unificado y modular para el registro, consulta y actualización
 *              dinámica en Google Sheets mediante Google Apps Script.
 *
 * CARACTERÍSTICAS PRINCIPALES:
 * 1. Conexión Dinámica de Hoja: Lee el campo oculto "sheetNameInput".
 * 2. Consulta por Campo Clave Dinámico: Lee el campo oculto "searchKeyColumnInput"
 *    (ej. "RIF", "Cedula", "CodigoCliente", "Telefono", etc.) y adapta la búsqueda.
 * 3. 100% Compatible hacia atrás: Envía parámetros modernos y tradicionales a la vez.
 * 4. Manejo de archivos a Base64 para guardarlos en Google Drive.
 * 5. Documentado paso a paso con comentarios en español.
 * =====================================================================================
 */

(function () {
  "use strict";

  // Si estamos en la página del Formulario Game (Módulo Versus), Game.js gestiona los modos y eventos de Game
  const sheetInputCheck = document.getElementById("sheetNameInput");
  if (
    (sheetInputCheck && sheetInputCheck.value.trim() === "Game") ||
    window.location.pathname.includes("Game.html") ||
    document.getElementById("matchup-creation-section") ||
    document.getElementById("versus-arena-box")
  ) {
    return;
  }

  // =========================================================================
  // 1. CONFIGURACIÓN GENERAL Y URL DEL WEB APP (GOOGLE APPS SCRIPT)
  // =========================================================================
  // Reemplaza esta URL con la URL de tu Google Apps Script desplegado como Web App
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzPpCG9VBlMUW5vRvV5CiIfbvFtDgr0yAg-wzWBd4WJDbqgP02YLHZBAROiSfzVwS45Zg/exec";

  // =========================================================================
  // 2. SELECCIÓN DE ELEMENTOS DEL DOM
  // =========================================================================
  // Formulario y Modo
  const form = document.getElementById("form");
  const modeSelect = document.getElementById("modeSelect");
  const modeSelectContainer = document.getElementById("modeSelect-container");

  // Botones principales
  const submitButton = document.getElementById("submit-button");
  const updateControl = document.getElementById("update-control");
  const updateButton = document.getElementById("update-button");
  const cancelButton =
    document.getElementById("cancel-button") ||
    form?.querySelector("button.is-danger");

  // Controles de Búsqueda Dinámica
  const searchControls = document.getElementById("rif-controls");
  const searchInput = document.getElementById("rifSearch");
  const searchButton = document.getElementById("search-button");
  const clearSearchButton = document.getElementById("clear-search");
  const searchLabel =
    document.getElementById("search-label") ||
    searchControls?.querySelector(".label");
  const searchHelpText =
    document.getElementById("search-help-text") ||
    searchControls?.querySelector(".help");

  // Input de Archivos y Notificaciones
  const fileInput = document.getElementById("fileInput");
  const fileNameDisplay = document.getElementById("fileNameDisplay");
  const messageDiv = document.getElementById("message");

  // =========================================================================
  // 3. LECTURA DE CAMPOS MÁGICOS OCULTOS (HOJA, CAMPO CLAVE Y MODO PERMITIDO)
  // =========================================================================
  /**
   * Obtiene el nombre de la hoja de Google Sheets configurada en el HTML.
   * Si no existe o está vacío, usa "Afiliados" por defecto.
   */
  function getTargetSheetName() {
    const sheetInput = document.getElementById("sheetNameInput");
    return sheetInput && sheetInput.value.trim() !== ""
      ? sheetInput.value.trim()
      : "Afiliados";
  }

  /**
   * Obtiene el nombre de la columna clave configurada para búsquedas y actualizaciones.
   * Si no existe o está vacío, usa "RIF" por defecto.
   */
  function getSearchKeyColumn() {
    const keyInput = document.getElementById("searchKeyColumnInput");
    return keyInput && keyInput.value.trim() !== ""
      ? keyInput.value.trim()
      : "RIF";
  }

  /**
   * Obtiene la directiva de modo permitido configurada en el input oculto "modeConfigInput".
   *
   * Modos soportados:
   * - "ambos"          -> Permite Ingresar registros y Consultar/Editar (Muestra selector de modo).
   * - "solo_ingresar"  -> Inhabilita la consulta. Fija el formulario únicamente para crear nuevos registros.
   * - "solo_consultar" -> Inhabilita nuevos registros. Fija el formulario únicamente para buscar y editar.
   */
  function getModeConfig() {
    const configInput = document.getElementById("modeConfigInput");
    if (!configInput || !configInput.value) return "ambos";
    const val = configInput.value.trim().toLowerCase();
    if (
      val === "solo_ingresar" ||
      val === "ingresar" ||
      val === "insertar" ||
      val === "crear"
    ) {
      return "solo_ingresar";
    }
    if (
      val === "solo_consultar" ||
      val === "consultar" ||
      val === "buscar" ||
      val === "editar"
    ) {
      return "solo_consultar";
    }
    return "ambos";
  }

  /**
   * Adapta las etiquetas e indicadores de la interfaz según la configuración activa
   */
  function updateSearchUIIndicators() {
    const keyColumn = getSearchKeyColumn();
    const sheetName = getTargetSheetName();
    const modeConfig = getModeConfig();

    if (searchLabel) {
      searchLabel.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Buscar por ${keyColumn}`;
    }
    if (searchInput) {
      searchInput.placeholder = `Introduce ${keyColumn} y presiona Buscar`;
    }
    if (searchHelpText) {
      searchHelpText.textContent = `Si se encuentra el ${keyColumn} en la hoja "${sheetName}", el formulario se llenará automáticamente para consultar o actualizar.`;
    }

    // Actualiza chips de indicación superior
    const sheetBadge = document.getElementById("current-sheet-badge");
    const keyBadge = document.getElementById("current-key-badge");
    const modeBadge = document.getElementById("current-mode-badge");

    if (sheetBadge) sheetBadge.textContent = sheetName;
    if (keyBadge) keyBadge.textContent = keyColumn;

    if (modeBadge) {
      if (modeConfig === "solo_ingresar") {
        modeBadge.textContent = "Solo Ingresar (Crear)";
        modeBadge.className = "config-chip emerald";
      } else if (modeConfig === "solo_consultar") {
        modeBadge.textContent = "Solo Consultar / Editar";
        modeBadge.className = "config-chip purple";
      } else {
        modeBadge.textContent = "Ambos (Ingresar y Consultar)";
        modeBadge.className = "config-chip emerald";
      }
    }
  }

  // =========================================================================
  // 4. CONFIGURACIÓN DE CAMPOS PERMITIDOS PARA EDICIÓN
  // =========================================================================
  // Campos permitidos al ingresar un nuevo registro
  const INSERT_EDITABLE_FIELDS = [
    "ID",
    "Fecha",
    "Categoria",
    "NombreCompleto",
    "RIF",
    "Estado",
    "CodigoDireccion",
    "DireccionCorta",
    "Telefono",
    "DireccionLarga",
    "theFile",
    "OBSERVACIONES",
    "sheetName",
    "searchKeyColumn",
    "modeConfig",
  ];

  // Campos permitidos al editar/actualizar un registro existente
  const EDITABLE_FIELDS = [
    "ID",
    "Fecha",
    "Categoria",
    "NombreCompleto",
    "Estado",
    "CodigoDireccion",
    "DireccionCorta",
    "Telefono",
    "DireccionLarga",
    "theFile",
    "OBSERVACIONES",
  ];

  // =========================================================================
  // 5. GESTIÓN VISUAL DE MENSAJES Y NOTIFICACIONES
  // =========================================================================
  function showMessage(text, type = "info", timeout = 6000) {
    if (!messageDiv) return;
    messageDiv.style.display = "block";
    messageDiv.innerHTML = text;

    switch (type) {
      case "success":
        messageDiv.style.backgroundColor = "rgba(16, 185, 129, 0.25)";
        messageDiv.style.borderLeftColor = "#10b981";
        messageDiv.style.color = "#a7f3d0";
        break;
      case "error":
        messageDiv.style.backgroundColor = "rgba(244, 63, 94, 0.25)";
        messageDiv.style.borderLeftColor = "#f43f5e";
        messageDiv.style.color = "#fecdd3";
        break;
      case "warning":
        messageDiv.style.backgroundColor = "rgba(245, 158, 11, 0.25)";
        messageDiv.style.borderLeftColor = "#f59e0b";
        messageDiv.style.color = "#fef3c7";
        break;
      default: // info
        messageDiv.style.backgroundColor = "rgba(56, 189, 248, 0.25)";
        messageDiv.style.borderLeftColor = "#38bdf8";
        messageDiv.style.color = "#bae6fd";
    }

    if (timeout > 0) {
      setTimeout(() => {
        messageDiv.style.display = "none";
        messageDiv.textContent = "";
      }, timeout);
    }
  }

  function handleFetchError(error, contextAction = "conectar") {
    console.error(`Error al ${contextAction}:`, error);
    const isCorsOrNetwork =
      error.name === "TypeError" ||
      String(error.message).includes("Failed to fetch");
    if (isCorsOrNetwork) {
      showMessage(
        `<strong><i class="fa-solid fa-triangle-exclamation"></i> Error de Acceso / CORS de Google Apps Script</strong><br>` +
          `Google bloqueó la solicitud porque el Web App no tiene permisos públicos.<br>` +
          `<strong>Solución rápida en 3 pasos:</strong><br>` +
          `1. Abre tu script en Google Sheets (Extensiones > Apps Script).<br>` +
          `2. Clic en <strong>Implementar > Gestionar implementaciones</strong> > Editar (icono lápiz ✏️).<br>` +
          `3. En <strong>Versión</strong> elige <em>"Nueva versión"</em> y en <strong>Quién tiene acceso</strong> pon <em>"Cualquier persona" (Anyone)</em> > Clic en Implementar.`,
        "error",
        12000,
      );
    } else {
      showMessage(`Error: ${error.message}`, "error", 7000);
    }
  }

  // =========================================================================
  // 6. CONVERSIÓN DE ARCHIVOS A BASE64 (PARA GOOGLE DRIVE)
  // =========================================================================
  async function uploadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target.result;
        const parts = result.split(",");
        const header = parts[0] || "";
        const base64Data = parts[1] || "";
        const mimeMatch = header.match(/data:(.*);base64/);
        const mimeType = mimeMatch
          ? mimeMatch[1]
          : file.type || "application/octet-stream";

        resolve({
          fileName: file.name,
          mimeType: mimeType,
          data: base64Data,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Escuchar cambio en el input de archivo para mostrar el nombre
  if (fileInput && fileNameDisplay) {
    fileInput.addEventListener("change", function () {
      if (this.files && this.files.length > 0) {
        fileNameDisplay.textContent = this.files[0].name;
        fileNameDisplay.style.color = "#38bdf8";
      } else {
        fileNameDisplay.textContent = "No file selected";
        fileNameDisplay.style.color = "";
      }
    });
  }

  // =========================================================================
  // 6. ASIGNACIÓN Y EVALUACIÓN DEL ID ÚNICO CONSECUTIVO EN TIEMPO REAL
  // =========================================================================
  /**
   * Consulta a Google Apps Script en tiempo real el último registro asignado
   * y rellena automáticamente el campo ID con el siguiente consecutivo (ej. BB-00001).
   *
   * @param {boolean} force - Si es true, fuerza la regeneración incluso si ya tiene valor
   */
  async function fetchAndAssignNextId(force = false) {
    const idInput = form?.querySelector("input[name='ID']");
    if (!idInput) return;

    // Si estamos en modo consultar y ya tiene un valor cargado de la búsqueda, no lo sobrescribimos
    const config = getModeConfig();
    if (
      !force &&
      (config === "solo_consultar" ||
        (modeSelect && modeSelect.value === "consultar"))
    ) {
      return;
    }

    const sheetName = getTargetSheetName();
    idInput.placeholder = "Evaluando último registro en Google Sheets...";

    try {
      const response = await fetch(
        `${SCRIPT_URL}?action=getNextId&sheetName=${encodeURIComponent(sheetName)}&prefix=BB-&digits=5&t=${Date.now()}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.status === "success" && data.nextId) {
          idInput.value = data.nextId;
          idInput.placeholder =
            "este campo es el ID registro unico asignado por el sistema";
          return;
        }
      }
    } catch (err) {
      console.warn(
        "No se pudo obtener el ID remoto inmediatamente, usando valor por defecto:",
        err,
      );
    }

    // Fallback amigable si tarda la red o no hay conexión aún
    if (!idInput.value) {
      idInput.value = "BB-00001";
      idInput.placeholder =
        "este campo es el ID registro unico asignado por el sistema";
    }
  }

  // =========================================================================
  // 7. CONTROL DE MODOS: INGRESAR vs. CONSULTAR / EDITAR
  // =========================================================================
  /**
   * Aplica el modo de operación ('ingresar' o 'consultar') y actualiza la visibilidad de controles
   */
  function setMode(mode) {
    updateSearchUIIndicators();

    if (mode === "consultar") {
      if (searchControls) searchControls.style.display = "block";
      if (submitButton) submitButton.style.display = "none";
      if (updateControl) updateControl.style.display = "none";

      // En modo consultar inicial, deshabilitamos campos hasta buscar
      disableFormForSearch();
    } else {
      if (searchControls) searchControls.style.display = "none";
      if (submitButton) submitButton.style.display = "inline-flex";
      if (updateControl) updateControl.style.display = "none";
      if (searchInput) searchInput.value = "";

      // En modo ingresar, habilitamos los campos del formulario y cargamos el siguiente ID
      enableFormForInsert();
      fetchAndAssignNextId();
    }
  }

  /**
   * Aplica la directiva configurada en "modeConfigInput"
   */
  function applyConfiguredMode() {
    const config = getModeConfig();
    updateSearchUIIndicators();

    if (config === "solo_ingresar") {
      // Ocultar el selector de modo para que el usuario no pueda cambiar
      if (modeSelectContainer) modeSelectContainer.style.display = "none";
      if (modeSelect) modeSelect.value = "ingresar";
      setMode("ingresar");
    } else if (config === "solo_consultar") {
      // Ocultar el selector de modo y fijar directamente en búsqueda/consulta
      if (modeSelectContainer) modeSelectContainer.style.display = "none";
      if (modeSelect) modeSelect.value = "consultar";
      setMode("consultar");
    } else {
      // Modo "ambos": Mostrar selector desplegable y usar el valor seleccionado
      if (modeSelectContainer) modeSelectContainer.style.display = "block";
      const currentMode = modeSelect ? modeSelect.value : "ingresar";
      setMode(currentMode);
    }
  }

  function enableFormForInsert() {
    if (!form) return;
    for (let i = 0; i < form.elements.length; i++) {
      const el = form.elements[i];
      if (!el.name) continue;
      // No deshabilitar campos de control
      if (
        el.id === "sheetNameInput" ||
        el.id === "searchKeyColumnInput" ||
        el.id === "modeConfigInput"
      )
        continue;
      el.disabled = false;
      // El campo ID siempre permanece como solo lectura para evitar alteraciones
      if (el.name === "ID") {
        el.readOnly = true;
      }
    }
  }

  function disableFormForSearch() {
    if (!form) return;
    const keyColumn = getSearchKeyColumn();
    for (let i = 0; i < form.elements.length; i++) {
      const el = form.elements[i];
      if (!el.name) continue;
      if (
        el.id === "sheetNameInput" ||
        el.id === "searchKeyColumnInput" ||
        el.id === "modeConfigInput"
      )
        continue;
      // Solo dejamos habilitado el campo clave si el usuario quisiera escribir en él
      if (el.name.toUpperCase() === keyColumn.toUpperCase()) {
        el.disabled = false;
      } else {
        el.disabled = true;
      }
    }
  }

  function enableOnlyEditableFields() {
    if (!form) return;
    const keyColumn = getSearchKeyColumn();

    for (let i = 0; i < form.elements.length; i++) {
      const el = form.elements[i];
      if (!el.name) continue;
      if (
        el.id === "sheetNameInput" ||
        el.id === "searchKeyColumnInput" ||
        el.id === "modeConfigInput"
      )
        continue;

      // El campo clave único y el ID se bloquean durante edición para mantener la integridad
      if (
        el.name.toUpperCase() === keyColumn.toUpperCase() ||
        el.name.toUpperCase() === "ID"
      ) {
        el.disabled = true;
        continue;
      }

      // Si está en la lista de editables, se activa; de lo contrario se desactiva
      if (EDITABLE_FIELDS.includes(el.name)) {
        el.disabled = false;
      } else {
        el.disabled = true;
      }
    }
  }

  // =========================================================================
  // 8. LLENADO AUTOMÁTICO DEL FORMULARIO CON EL REGISTRO ENCONTRADO
  // =========================================================================
  function populateForm(record) {
    if (!record || !form) return;

    for (const key in record) {
      try {
        let elem = form.elements.namedItem(key);
        if (!elem) elem = form.elements.namedItem(String(key).toUpperCase());
        if (!elem) elem = form.elements.namedItem(String(key).toLowerCase());

        const value =
          record[key] !== null && record[key] !== undefined ? record[key] : "";

        if (elem) {
          // Si el campo es un <select>
          if (elem.tagName && elem.tagName.toLowerCase() === "select") {
            const valStr = String(value).trim();
            let matched = false;
            for (let i = 0; i < elem.options.length; i++) {
              const opt = elem.options[i];
              if (
                String(opt.value).trim().toLowerCase() ===
                  valStr.toLowerCase() ||
                String(opt.text).trim().toLowerCase() === valStr.toLowerCase()
              ) {
                elem.selectedIndex = i;
                matched = true;
                break;
              }
            }
            if (!matched && valStr !== "") {
              const newOpt = document.createElement("option");
              newOpt.value = valStr;
              newOpt.text = valStr;
              elem.appendChild(newOpt);
              elem.value = valStr;
            }
          }
          // Si el campo es de fecha (type="date")
          else if (elem.type === "date") {
            if (value) {
              const d = new Date(value);
              if (!isNaN(d.getTime())) {
                elem.value = d.toISOString().split("T")[0];
              } else {
                elem.value = value;
              }
            } else {
              elem.value = "";
            }
          }
          // Para inputs normales y textareas
          else {
            try {
              elem.value = value;
            } catch (innerErr) {
              if (elem.length && elem[0]) elem[0].value = value;
            }
          }
        }
      } catch (e) {
        console.warn("Advertencia al poblar el campo:", key, e);
      }
    }

    // Activar campos permitidos para edición
    if (modeSelect && modeSelect.value === "consultar") {
      enableOnlyEditableFields();
    }
  }

  // =========================================================================
  // 9. FUNCIÓN DE BÚSQUEDA DINÁMICA (GET AL APPS SCRIPT)
  // =========================================================================
  async function buscarRegistro(searchValue) {
    if (!searchValue || searchValue.trim() === "") {
      const keyColumn = getSearchKeyColumn();
      showMessage(
        `Por favor introduce un valor de ${keyColumn} válido para buscar.`,
        "error",
      );
      return null;
    }

    const keyColumn = getSearchKeyColumn();
    const sheetName = getTargetSheetName();

    showMessage(
      `Buscando en hoja "${sheetName}" por ${keyColumn}: ${searchValue}...`,
      "info",
      0,
    );

    try {
      // Enviamos tanto los nuevos parámetros dinámicos como "rif" para máxima compatibilidad
      const params = new URLSearchParams({
        sheetName: sheetName,
        keyColumn: keyColumn,
        keyValue: searchValue.trim(),
        rif: searchValue.trim(), // Compatibilidad hacia atrás con scripts antiguos
      });

      const url = `${SCRIPT_URL}?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
      });

      const data = await response.json();

      if (data.status === "success" && data.record) {
        showMessage(
          `¡Registro encontrado con éxito en "${sheetName}"!`,
          "success",
          4000,
        );
        return data.record;
      } else if (data.status === "not_found") {
        showMessage(
          `No se encontró ningún registro con ${keyColumn} = "${searchValue}" en la hoja "${sheetName}".`,
          "error",
          5000,
        );
        return null;
      } else {
        showMessage(
          data.message || "Respuesta inesperada del servidor de Google Sheets.",
          "error",
        );
        return null;
      }
    } catch (error) {
      handleFetchError(error, "buscar registro");
      return null;
    }
  }

  // =========================================================================
  // 10. FUNCIÓN DE ACTUALIZACIÓN DINÁMICA (POST action="update")
  // =========================================================================
  async function actualizarRegistro(keyValue, updates) {
    if (!keyValue) {
      const keyColumn = getSearchKeyColumn();
      showMessage(
        `No se encontró el valor de ${keyColumn} para actualizar.`,
        "error",
      );
      return;
    }

    const keyColumn = getSearchKeyColumn();
    const sheetName = getTargetSheetName();

    showMessage(`Guardando cambios en hoja "${sheetName}"...`, "info", 0);
    if (updateButton) updateButton.classList.add("is-loading");

    try {
      // Payload dinámico preparado para Apps Script moderno y antiguo
      const payload = {
        action: "update",
        sheetName: sheetName,
        keyColumn: keyColumn,
        keyValue: keyValue,
        rif: keyValue, // Compatibilidad hacia atrás
        updates: updates,
      };

      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        redirect: "follow",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
      });

      const data = await response.json();

      if (data.status === "success") {
        showMessage(
          data.message ||
            `¡Registro actualizado correctamente en ${sheetName}!`,
          "success",
          5000,
        );
        setTimeout(() => {
          try {
            location.reload();
          } catch (e) {}
        }, 1500);
      } else {
        showMessage(
          data.message || "Fallo al actualizar el registro.",
          "error",
        );
      }
    } catch (error) {
      handleFetchError(error, "actualizar registro");
    } finally {
      if (updateButton) updateButton.classList.remove("is-loading");
    }
  }

  // =========================================================================
  // 11. MANEJADOR DE ENVÍO DE NUEVOS REGISTROS (POST NORMAL)
  // =========================================================================
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const sheetName = getTargetSheetName();
      showMessage(
        `Enviando nuevo registro a la hoja "${sheetName}"...`,
        "info",
        0,
      );

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add("is-loading");
      }

      try {
        const formData = new FormData(this);
        const formDataObj = {};

        // Recolectar pares clave-valor
        for (let [key, value] of formData.entries()) {
          formDataObj[key] = value;
        }

        // Asegurar que sheetName vaya en el objeto
        formDataObj.sheetName = sheetName;

        // Subir archivo adjunto si fue seleccionado
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
          const fileObj = await uploadFile(fileInput.files[0]);
          formDataObj.fileData = fileObj;
        }

        const response = await fetch(SCRIPT_URL, {
          method: "POST",
          redirect: "follow",
          body: JSON.stringify(formDataObj),
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
        });

        const data = await response.json();

        if (data.status === "success") {
          showMessage(
            data.message ||
              `¡Datos guardados con éxito en la hoja "${sheetName}"!`,
            "success",
            4000,
          );
          form.reset();
          if (fileNameDisplay) fileNameDisplay.textContent = "No file selected";

          setTimeout(() => {
            try {
              location.reload();
            } catch (e) {}
          }, 1500);
        } else {
          throw new Error(
            data.message || "No se pudo guardar el registro en Google Sheets.",
          );
        }
      } catch (error) {
        handleFetchError(error, "enviar formulario");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.classList.remove("is-loading");
        }
      }
    });
  }

  // =========================================================================
  // 12. EVENT LISTENERS PARA BOTONES Y CONTROLES
  // =========================================================================
  // Cambio de modo (Ingresar vs Consultar)
  if (modeSelect) {
    modeSelect.addEventListener("change", (e) => {
      const mode = e.target.value;
      if (form) form.reset();
      if (fileNameDisplay) fileNameDisplay.textContent = "No file selected";
      setMode(mode);
    });
  }

  // Botón Buscar
  if (searchButton && searchInput) {
    searchButton.addEventListener("click", async () => {
      const val = searchInput.value.trim();
      const record = await buscarRegistro(val);
      if (record) {
        populateForm(record);
        if (updateControl) updateControl.style.display = "inline-flex";
        if (submitButton) submitButton.style.display = "none";
      }
    });

    // Permitir presionar ENTER en el input de búsqueda
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchButton.click();
      }
    });
  }

  // Botón Limpiar Búsqueda
  if (clearSearchButton) {
    clearSearchButton.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (form) form.reset();
      if (fileNameDisplay) fileNameDisplay.textContent = "No file selected";
      if (updateControl) updateControl.style.display = "none";
      const config = getModeConfig();
      if (
        config === "solo_ingresar" ||
        (config === "ambos" && modeSelect && modeSelect.value === "ingresar")
      ) {
        if (submitButton) submitButton.style.display = "inline-flex";
        enableFormForInsert();
        fetchAndAssignNextId();
      } else {
        disableFormForSearch();
      }
      showMessage("Búsqueda y formulario limpiados.", "info", 1500);
    });
  }

  // Botón Actualizar
  if (updateButton) {
    updateButton.addEventListener("click", async () => {
      const keyColumn = getSearchKeyColumn();
      // Buscamos el valor clave en el formulario o en el buscador
      let keyVal = searchInput ? searchInput.value.trim() : "";
      const fieldElem = form ? form.elements.namedItem(keyColumn) : null;
      if (fieldElem && fieldElem.value.trim() !== "") {
        keyVal = fieldElem.value.trim();
      }

      if (!keyVal) {
        showMessage(
          `No se detectó un valor de ${keyColumn} válido para actualizar.`,
          "error",
        );
        return;
      }

      // Recolectar campos editados
      const formData = new FormData(form);
      const updates = {};
      for (let [k, v] of formData.entries()) {
        if (k.toUpperCase() === keyColumn.toUpperCase()) continue;
        if (k === "sheetName" || k === "searchKeyColumn" || k === "modeConfig")
          continue;
        if (EDITABLE_FIELDS.includes(k)) {
          updates[k] = v;
        }
      }

      // Si se seleccionó nuevo archivo, agregarlo a updates
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        try {
          const fileObj = await uploadFile(fileInput.files[0]);
          updates.fileData = fileObj;
        } catch (fileErr) {
          console.error(
            "Error procesando archivo para actualización:",
            fileErr,
          );
          showMessage("Error al procesar el archivo seleccionado.", "error");
          return;
        }
      }

      await actualizarRegistro(keyVal, updates);
    });
  }

  // Botón Cancelar
  if (cancelButton && form) {
    cancelButton.addEventListener("click", () => {
      form.reset();
      if (fileNameDisplay) fileNameDisplay.textContent = "No file selected";
      if (messageDiv) messageDiv.style.display = "none";
      if (updateControl) updateControl.style.display = "none";
      const config = getModeConfig();
      if (
        config === "solo_consultar" ||
        (config === "ambos" && modeSelect && modeSelect.value === "consultar")
      ) {
        disableFormForSearch();
      } else {
        enableFormForInsert();
        if (submitButton) submitButton.style.display = "inline-flex";
        fetchAndAssignNextId();
      }
    });
  }

  // =========================================================================
  // 13. INICIALIZACIÓN AL CARGAR LA PÁGINA
  // =========================================================================
  document.addEventListener("DOMContentLoaded", () => {
    applyConfiguredMode();
  });

  // Ejecución inmediata si el script se carga después del DOM
  applyConfiguredMode();
})();
