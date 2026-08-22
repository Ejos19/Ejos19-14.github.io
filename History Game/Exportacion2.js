/**
 * =====================================================================================
 * ARCHIVO: Exportacion2.js
 * DESCRIPCIÓN: Módulo integral de exportación para la Cartelera de Enfrentamientos
 *              Publicados del Formulario HistoryGame (Hoja Game2 y Persistencia Nube).
 *              Réplica completa de Exportacion.js adaptada con botones ultra-compactos
 *              y orientación vertical PDF predefinida.
 *
 * CARACTERÍSTICAS PRINCIPALES:
 *  1. 📄 ORIENTACIÓN DE HOJA SELECCIONABLE (VERTICAL PREDEFINIDA / HORIZONTAL):
 *     - Configurado con formato Vertical (Portrait - Estándar A4) por defecto.
 *     - Diálogo interactivo al pulsar "Exportar PDF" o configuración directa en código.
 *  2. 🖼️ FONDOS FLEXIBLES (ENLACES URL O RUTAS LOCALES EN CARPETAS DEL PROYECTO):
 *     - Dos capas de fondo independientes:
 *       • FONDO 1: Detrás de cada juego individual (banner del Versus).
 *       • FONDO 2: Detrás de toda la página del PDF (fondo global del documento).
 *  3. 🏀 RÉPLICA EXACTA DE LA CARTELERA (PIXEL-PERFECT):
 *     - Insignias de estatus neón (Programado / Pospuesto / Finalizado), cápsula VS neón,
 *       marcador deportivo, logos de equipos, ID/códigos y franja de árbitros con sus roles.
 *  4. 📅 AGRUPACIÓN INTELIGENTE POR FECHA DE JUEGO:
 *     - Si hay enfrentamientos en fechas distintas, genera y descarga automáticamente
 *       un archivo PDF independiente para cada fecha registrada.
 *  5. 📊 EXPORTACIÓN ADICIONAL A EXCEL (.XLSX) Y CSV.
 * =====================================================================================
 */

(function (window, document) {
  "use strict";

  // =====================================================================================
  // ⚙️ CONFIGURACIÓN GENERAL DE EXPORTACIÓN Y PARÁMETROS DEL PDF (Exportacion2)
  // =====================================================================================
  const CONFIG_EXPORTACION2 = {
    // ===================================================================================
    // 👈 1. [ORIENTACIÓN PREDEFINIDA] 'portrait' (Vertical) o 'landscape' (Horizontal)
    //    Predefinido en "portrait" (Hoja Vertical) por requerimiento del sistema
    // ===================================================================================
    PDF_ORIENTATION: "portrait",

    // 👈 Mostrar modal selector de orientación al hacer clic en "Exportar PDF" (true / false)
    PREGUNTAR_ORIENTACION_AL_EXPORTAR: true,

    // ===================================================================================
    // 👈 2. [FONDO 1] FONDO DETRÁS DE CADA JUEGO INDIVIDUAL (Banner Versus)
    // ===================================================================================
    FONDO_DETRAS_DE_CADA_JUEGO: "/Asset/Fondo1.png",
    OPACIDAD_FONDO_CADA_JUEGO: 0.85, // 85% de visibilidad para resaltar los graffitis/cancha

    // ===================================================================================
    // 👈 3. [FONDO 2] FONDO GENERAL DETRÁS DE TODA LA HOJA DEL PDF
    // ===================================================================================
    FONDO_GENERAL_PAGINA_PDF: "/Asset/Wallpaper B1.jpeg",
    OPACIDAD_FONDO_GENERAL_PAGINA: 0.6, // 60% de visibilidad sutil

    // ===================================================================================
    // 👈 4. CANTIDAD DE JUEGOS POR PÁGINA (Ajustable por orientación)
    // ===================================================================================
    JUEGOS_POR_PAGINA_HORIZONTAL: 2, // 2 juegos por página en Horizontal (Landscape)
    JUEGOS_POR_PAGINA_VERTICAL: 4, // 4 juegos por página en Vertical (Portrait)

    // Título Institucional del encabezado:
    PDF_HEADER_TITLE: "CARTELERA OFICIAL DE ENFRENTAMIENTOS",

    // Nombre base para los archivos exportados:
    NOMBRE_ARCHIVO_BASE: "Cartelera_Game2_Publicada",
  };

  // Exponer la configuración globalmente para permitir modificaciones dinámicas en consola
  window.CONFIG_EXPORTACION2 = CONFIG_EXPORTACION2;

  // =====================================================================================
  // 1. INICIALIZACIÓN Y VINCULACIÓN DE BOTONES EN EL DOM
  // =====================================================================================
  document.addEventListener("DOMContentLoaded", () => {
    initExportModule2();
  });

  function initExportModule2() {
    const btnCsv = document.getElementById("btn-export-csv");
    const btnExcel = document.getElementById("btn-export-excel");
    const btnPdf = document.getElementById("btn-export-pdf");

    if (btnCsv) {
      btnCsv.addEventListener("click", (e) => {
        e.preventDefault();
        exportarCSV();
      });
    }

    if (btnExcel) {
      btnExcel.addEventListener("click", (e) => {
        e.preventDefault();
        exportarExcel();
      });
    }

    if (btnPdf) {
      btnPdf.addEventListener("click", (e) => {
        e.preventDefault();
        iniciarFlujoExportacionPDF();
      });
    }

    // Vincular eventos del Modal de Orientación si existe en el DOM
    initOrientationModalEvents2();
  }

  /**
   * Inicializa los eventos del modal de selección de orientación (Horizontal / Vertical)
   */
  function initOrientationModalEvents2() {
    const modal = document.getElementById("pdf-orientation-modal");
    const btnClose = document.getElementById("btn-close-pdf-modal");
    const btnCancel = document.getElementById("btn-cancel-pdf-modal");
    const backdrop = document.getElementById("pdf-orientation-backdrop");
    const btnConfirm = document.getElementById("btn-confirm-pdf-export");

    const cerrarModal = () => {
      if (modal) modal.classList.remove("is-active");
    };

    if (btnClose) btnClose.addEventListener("click", cerrarModal);
    if (btnCancel) btnCancel.addEventListener("click", cerrarModal);
    if (backdrop) backdrop.addEventListener("click", cerrarModal);

    if (btnConfirm) {
      btnConfirm.addEventListener("click", () => {
        const radioSeleccionado = document.querySelector(
          'input[name="pdf_export_orientation"]:checked',
        );
        const orientacion = radioSeleccionado
          ? radioSeleccionado.value
          : CONFIG_EXPORTACION2.PDF_ORIENTATION || "portrait";
        cerrarModal();
        ejecutarExportacionPDF(orientacion);
      });
    }
  }

  /**
   * Decide si abre el diálogo de orientación o exporta directamente según configuración.
   */
  function iniciarFlujoExportacionPDF() {
    const matchups = obtenerEnfrentamientosPublicados();
    if (matchups.length === 0) {
      mostrarNotificacion(
        "No hay enfrentamientos en la cartelera para exportar a PDF",
        "warning",
      );
      return;
    }

    // Si está configurado para preguntar y el modal está disponible en el DOM:
    if (CONFIG_EXPORTACION2.PREGUNTAR_ORIENTACION_AL_EXPORTAR) {
      const modal = document.getElementById("pdf-orientation-modal");
      if (modal) {
        // Preseleccionar según la configuración actual (por defecto 'portrait')
        const currentOrient = CONFIG_EXPORTACION2.PDF_ORIENTATION || "portrait";
        const radio = document.querySelector(
          `input[name="pdf_export_orientation"][value="${currentOrient}"]`,
        );
        if (radio) radio.checked = true;

        modal.classList.add("is-active");
        return;
      }
    }

    // Exportar directamente con la orientación configurada
    ejecutarExportacionPDF(CONFIG_EXPORTACION2.PDF_ORIENTATION || "portrait");
  }

  // =====================================================================================
  // 2. HELPER PARA RESOLVER RUTAS DE IMÁGENES (URLs O RUTAS LOCALES DEL PROYECTO)
  // =====================================================================================
  function resolverRutaFondo(rutaOFuente) {
    if (!rutaOFuente || typeof rutaOFuente !== "string") return "";
    const limpia = rutaOFuente.trim();
    if (!limpia) return "";

    if (/^(https?:\/\/|data:|blob:|\/\/)/i.test(limpia)) {
      return limpia;
    }

    try {
      const baseUrl = window.location.href.split("#")[0].split("?")[0];
      return new URL(limpia, baseUrl).href;
    } catch (e) {
      console.warn(
        "[Exportacion2.js] No se pudo resolver la ruta local:",
        limpia,
        e,
      );
      return limpia;
    }
  }

  // =====================================================================================
  // 3. OBTENCIÓN Y AGRUPACIÓN DE DATOS DE ENFRENTAMIENTOS (RESPETANDO FILTROS ACTIVOS)
  // =====================================================================================
  /**
   * Obtiene la lista actual de enfrentamientos publicados en HistoryGame / Game2,
   * respetando los filtros seleccionados en pantalla (Buscador, Torneo, Estatus).
   */
  function obtenerEnfrentamientosPublicados() {
    // 1. Priorizar la lista de enfrentamientos filtrada actualmente en HistoryGame
    if (typeof window.getFilteredHistoryMatchups === "function") {
      try {
        const list = window.getFilteredHistoryMatchups();
        if (Array.isArray(list)) return list;
      } catch (e) {
        console.warn(
          "[Exportacion2.js] Error al obtener getFilteredHistoryMatchups:",
          e,
        );
      }
    }

    // 2. Intentar getHistoryMatchups con bandera de filtrado
    if (typeof window.getHistoryMatchups === "function") {
      try {
        const list = window.getHistoryMatchups(true);
        if (Array.isArray(list)) return list;
      } catch (e) {
        console.warn(
          "[Exportacion2.js] Error al obtener getHistoryMatchups(true):",
          e,
        );
      }
    }

    // 3. Intentar obtener desde getCurrentMatchups
    if (typeof window.getCurrentMatchups === "function") {
      try {
        const list = window.getCurrentMatchups();
        if (Array.isArray(list) && list.length > 0) return list;
      } catch (e) {}
    }

    // 4. Intentar variable global historyMatchups
    if (
      Array.isArray(window.historyMatchups) &&
      window.historyMatchups.length > 0
    ) {
      return window.historyMatchups;
    }

    // 5. Intentar leer de localStorage (Game2 o General)
    try {
      const savedGame2 = localStorage.getItem("GAME_MATCHUPS_HISTORY_GAME2");
      if (savedGame2) {
        const parsed = JSON.parse(savedGame2);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }

      const savedGeneral = localStorage.getItem("GAME_MATCHUPS_LIST");
      if (savedGeneral) {
        const parsed = JSON.parse(savedGeneral);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("[Exportacion2.js] Error leyendo localStorage:", e);
    }

    return [];
  }

  /**
   * Agrupa los enfrentamientos por su fecha ('gameDate').
   */
  function agruparEnfrentamientosPorFecha(matchups) {
    const grupos = {};
    matchups.forEach((m) => {
      let rawDate =
        m.gameDate && String(m.gameDate).trim()
          ? String(m.gameDate).trim()
          : "Fecha_No_Definida";
      let fechaLimpia = rawDate.split("T")[0];
      if (!grupos[fechaLimpia]) {
        grupos[fechaLimpia] = [];
      }
      grupos[fechaLimpia].push(m);
    });
    return grupos;
  }

  /**
   * Formatea la fecha y hora de captura actual en formato estándar (ej: 17/08/2026 08:09:03 PM)
   */
  function obtenerFechaHoraCaptura() {
    const ahora = new Date();
    const dia = String(ahora.getDate()).padStart(2, "0");
    const mes = String(ahora.getMonth() + 1).padStart(2, "0");
    const anio = ahora.getFullYear();

    let horas = ahora.getHours();
    const minutos = String(ahora.getMinutes()).padStart(2, "0");
    const segundos = String(ahora.getSeconds()).padStart(2, "0");
    const ampm = horas >= 12 ? "PM" : "AM";
    horas = horas % 12;
    horas = horas ? horas : 12;
    const horasStr = String(horas).padStart(2, "0");

    return `${dia}/${mes}/${anio} ${horasStr}:${minutos}:${segundos} ${ampm}`;
  }

  /**
   * Formatea la fecha al estilo "DDDD. ddd-mmm-yyyy" (ej: "jueves. 20-agosto-2026")
   */
  function formatearFechaJuego(fechaStr) {
    if (!fechaStr) return "";
    if (typeof window.formatHistoryGameDate === "function") {
      try {
        const res = window.formatHistoryGameDate(fechaStr);
        if (res) return res;
      } catch (e) {}
    }

    try {
      const date = new Date(fechaStr);
      if (isNaN(date.getTime())) return String(fechaStr);

      const weekday = date.toLocaleDateString("es-ES", {
        weekday: "long",
        timeZone: "UTC",
      });

      const formattedDate = date
        .toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
        .replace(/ de /g, "-");

      return `${weekday}. ${formattedDate}`;
    } catch (e) {
      return String(fechaStr);
    }
  }

  function obtenerTimestampArchivo() {
    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, "0");
    const dd = String(ahora.getDate()).padStart(2, "0");
    const hh = String(ahora.getHours()).padStart(2, "0");
    const min = String(ahora.getMinutes()).padStart(2, "0");
    return `${yyyy}${mm}${dd}_${hh}${min}`;
  }

  function sanitizarNombreFecha(fechaStr) {
    return String(fechaStr).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  // =====================================================================================
  // 4. EXPORTACIÓN A FORMATO CSV
  // =====================================================================================
  function exportarCSV() {
    const matchups = obtenerEnfrentamientosPublicados();
    if (matchups.length === 0) {
      mostrarNotificacion(
        "No hay enfrentamientos en la cartelera para exportar a CSV",
        "warning",
      );
      return;
    }

    const timestampCaptura = obtenerFechaHoraCaptura();

    const headers = [
      "Nº",
      "TITULO DEL JUEGO",
      "TORNEO",
      "ID TORNEO",
      "ESTATUS",
      "HORA",
      "FECHA",
      "EQUIPO A (LOCAL)",
      "ID EQUIPO A",
      "COD EQUIPO A",
      "PUNTOS A",
      "VS",
      "PUNTOS B",
      "EQUIPO B (VISITANTE)",
      "ID EQUIPO B",
      "COD EQUIPO B",
      "MARCADOR FINAL",
      "ARBITRO 1 (PRINCIPAL)",
      "CEDULA ARBITRO 1",
      "ARBITRO 2 (AUXILIAR)",
      "CEDULA ARBITRO 2",
      "ARBITRO 3 (MESA)",
      "CEDULA ARBITRO 3",
      "OBSERVACIONES",
      "FECHA Y HORA DE CAPTURA",
    ];

    const rows = [];
    rows.push(headers.map(sanitizeCsvField).join(";"));

    matchups.forEach((m, idx) => {
      const scoreA = m.scoreA != null ? m.scoreA : 0;
      const scoreB = m.scoreB != null ? m.scoreB : 0;
      const rawStatus = (
        m.status ||
        m.Estatus ||
        m.Estado ||
        "programado"
      ).toLowerCase();
      const statusLabel =
        rawStatus === "pospuesto"
          ? "Pospuesto"
          : rawStatus === "finalizado"
            ? "Finalizado"
            : "Programado";

      const row = [
        idx + 1,
        m.gameTitle || `Juego ${idx + 1}`,
        m.Tournament || m.tournament || m.tournamentName || "",
        m.ID_Tournament || m.id_tournament || m.tournamentId || "",
        statusLabel,
        m.gameTime || "",
        m.gameDate || "",
        m.teamA_name || "",
        m.teamA_id || "",
        m.teamA_code || "",
        scoreA,
        "VS",
        scoreB,
        m.teamB_name || "",
        m.teamB_id || "",
        m.teamB_code || "",
        `${scoreA} - ${scoreB}`,
        m.referee1_name || "",
        m.referee1_cedula || "",
        m.referee2_name || "",
        m.referee2_cedula || "",
        m.referee3_name || "",
        m.referee3_cedula || "",
        m.notes || "",
        timestampCaptura,
      ];
      rows.push(row.map(sanitizeCsvField).join(";"));
    });

    const csvContent = "\uFEFF" + rows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const filename = `${CONFIG_EXPORTACION2.NOMBRE_ARCHIVO_BASE}_${obtenerTimestampArchivo()}.csv`;

    descargarBlob(blob, filename);
    mostrarNotificacion(
      `¡Cartelera exportada a CSV exitosamente! (${matchups.length} juegos)`,
      "success",
    );
  }

  function sanitizeCsvField(val) {
    if (val == null) return '""';
    let str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  // =====================================================================================
  // 5. EXPORTACIÓN A FORMATO EXCEL (.XLSX)
  // =====================================================================================
  function exportarExcel() {
    const matchups = obtenerEnfrentamientosPublicados();
    if (matchups.length === 0) {
      mostrarNotificacion(
        "No hay enfrentamientos en la cartelera para exportar a Excel",
        "warning",
      );
      return;
    }

    if (typeof XLSX === "undefined") {
      mostrarNotificacion("Librería SheetJS (XLSX) no disponible", "error");
      return;
    }

    const timestampCaptura = obtenerFechaHoraCaptura();

    const dataEnfrentamientos = matchups.map((m, idx) => {
      const scoreA = m.scoreA != null ? m.scoreA : 0;
      const scoreB = m.scoreB != null ? m.scoreB : 0;
      const rawStatus = (
        m.status ||
        m.Estatus ||
        m.Estado ||
        "programado"
      ).toLowerCase();
      const statusLabel =
        rawStatus === "pospuesto"
          ? "Pospuesto"
          : rawStatus === "finalizado"
            ? "Finalizado"
            : "Programado";

      return {
        Nº: idx + 1,
        "Título del Juego": m.gameTitle || `Juego ${idx + 1}`,
        Torneo: m.Tournament || m.tournament || m.tournamentName || "",
        "ID Torneo": m.ID_Tournament || m.id_tournament || m.tournamentId || "",
        Estatus: statusLabel,
        Hora: m.gameTime || "",
        Fecha: m.gameDate || "",
        "Equipo Local (A)": m.teamA_name || "",
        "ID Local": m.teamA_id || "",
        "Código Local": m.teamA_code || "",
        "Puntos A": scoreA,
        VS: "VS",
        "Puntos B": scoreB,
        "Equipo Visitante (B)": m.teamB_name || "",
        "ID Visitante": m.teamB_id || "",
        "Código Visitante": m.teamB_code || "",
        Marcador: `${scoreA} - ${scoreB}`,
        "Árbitro 1 (Principal)": m.referee1_name || "--",
        "Árbitro 2 (Auxiliar)": m.referee2_name || "--",
        "Árbitro 3 (Mesa)": m.referee3_name || "--",
        Observaciones: m.notes || "",
        "Fecha y Hora de Captura": timestampCaptura,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataEnfrentamientos);

    ws["!cols"] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 22 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 26 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 6 },
      { wch: 10 },
      { wch: 26 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 28 },
      { wch: 24 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Cartelera Game2");

    const filename = `${CONFIG_EXPORTACION2.NOMBRE_ARCHIVO_BASE}_${obtenerTimestampArchivo()}.xlsx`;
    XLSX.writeFile(wb, filename);

    mostrarNotificacion(
      "¡Cartelera exportada a Excel (.xlsx) exitosamente!",
      "success",
    );
  }

  // =====================================================================================
  // 6. EXPORTACIÓN A FORMATO PDF (RÉPLICA EXACTA DE LA CARTELERA)
  // =====================================================================================
  /**
   * Ejecuta la generación del PDF con la orientación especificada ('portrait' o 'landscape').
   */
  async function ejecutarExportacionPDF(orientacion = "portrait") {
    const matchups = obtenerEnfrentamientosPublicados();
    if (matchups.length === 0) {
      mostrarNotificacion(
        "No hay enfrentamientos en la cartelera para exportar a PDF",
        "warning",
      );
      return;
    }

    if (typeof window.jspdf === "undefined" && typeof jsPDF === "undefined") {
      mostrarNotificacion(
        "Librería jsPDF no disponible en el sistema",
        "error",
      );
      return;
    }

    const btnPdf = document.getElementById("btn-export-pdf");
    const originalText = btnPdf ? btnPdf.innerHTML : "";
    if (btnPdf) {
      btnPdf.disabled = true;
      btnPdf.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generando PDF (${orientacion === "portrait" ? "Vertical" : "Horizontal"})...`;
    }

    const timestampCaptura = obtenerFechaHoraCaptura();

    // 1. Agrupar los juegos por fecha
    const gruposPorFecha = agruparEnfrentamientosPorFecha(matchups);
    const fechas = Object.keys(gruposPorFecha);

    const orientacionTexto =
      orientacion === "portrait"
        ? "Vertical (Portrait)"
        : "Horizontal (Landscape)";

    if (fechas.length > 1) {
      mostrarNotificacion(
        `Detectadas ${fechas.length} fechas distintas. Generando ${fechas.length} archivos PDF [${orientacionTexto}]...`,
        "info",
      );
    } else {
      mostrarNotificacion(
        `Generando PDF de la cartelera [${orientacionTexto}]...`,
        "info",
      );
    }

    try {
      // 2. Generar un archivo PDF por cada fecha distinta
      for (let i = 0; i < fechas.length; i++) {
        const fecha = fechas[i];
        const juegosDeEstaFecha = gruposPorFecha[fecha];

        if (typeof html2canvas !== "undefined") {
          await renderizarYDescargarPdfFecha(
            fecha,
            juegosDeEstaFecha,
            timestampCaptura,
            i,
            fechas.length,
            orientacion,
          );
        } else {
          generarPdfFechaFallback(
            fecha,
            juegosDeEstaFecha,
            timestampCaptura,
            orientacion,
          );
        }

        // Pequeña pausa entre descargas si son múltiples
        if (fechas.length > 1 && i < fechas.length - 1) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (fechas.length > 1) {
        mostrarNotificacion(
          `¡Se generaron con éxito los ${fechas.length} archivos PDF en formato ${orientacionTexto}!`,
          "success",
        );
      } else {
        mostrarNotificacion(
          `¡PDF generado y descargado exitosamente en formato ${orientacionTexto}!`,
          "success",
        );
      }
    } catch (err) {
      console.error("[Exportacion2.js] Error exportando PDF:", err);
      mostrarNotificacion("Error al generar el PDF: " + err.message, "error");
    } finally {
      if (btnPdf) {
        btnPdf.disabled = false;
        btnPdf.innerHTML = originalText;
      }
    }
  }

  /**
   * Renderiza el contenedor temporal con la réplica visual idéntica de la cartelera:
   *  - Encabezado limpio con "CARTELERA OFICIAL DE ENFRENTAMIENTOS".
   *  - Fondo de graffiti/cancha en el banner del juego completamente visible y nítido.
   *  - Estatus neón (Programado / Pospuesto / Finalizado).
   *  - Cápsula VS en forma de píldora oscura con balones naranjas y VS en cursiva brillante.
   *  - Marcador de puntuación deportivo debajo del VS.
   *  - Tarjetas de equipos Local y Visitante con logos grandes e insignias.
   */
  async function renderizarYDescargarPdfFecha(
    fechaJuego,
    matchupsDeFecha,
    timestampCaptura,
    groupIndex,
    totalGroups,
    orientacion = "portrait",
  ) {
    const isPortrait = orientacion === "portrait";

    // Resolver rutas de fondos (URL web o ruta local)
    const urlFondoGlobal = resolverRutaFondo(
      CONFIG_EXPORTACION2.FONDO_GENERAL_PAGINA_PDF,
    );
    const urlFondoVersus = resolverRutaFondo(
      CONFIG_EXPORTACION2.FONDO_DETRAS_DE_CADA_JUEGO,
    );

    // Dimensiones óptimas para el contenedor virtual:
    // - Landscape: 1280px de ancho (proporción panorámica A4)
    // - Portrait:  880px de ancho (proporción vertical A4)
    const containerWidth = isPortrait ? 880 : 1280;

    // 1. Crear contenedor temporal para el renderizado
    const printContainer = document.createElement("div");
    printContainer.id = `pdf-export2-render-${groupIndex}`;
    printContainer.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${containerWidth}px;
      background: #060201;
      color: #fff7ed;
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
      padding: ${isPortrait ? "20px" : "24px"};
      z-index: 999999;
      overflow: hidden;
    `;

    // 2. Estilos CSS idénticos a la cartelera del formulario Game y HistoryGame
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      #${printContainer.id} * { box-sizing: border-box; }
      
      /* =========================================================================
         🏟️ PÁGINA DEL PDF (CON FONDO GENERAL DEL DOCUMENTO)
         ========================================================================= */
      .pdf-doc-page {
        position: relative;
        width: 100%;
        background: #090302;
        border: 2px solid rgba(255, 107, 0, 0.45);
        border-radius: 16px;
        padding: ${isPortrait ? "18px" : "22px"};
        overflow: hidden;
        margin-bottom: 24px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.9);
      }

      /* 🏟️ CAPA FONDO 2: DETRÁS DE TODA LA PÁGINA DEL PDF */
      .pdf-page-global-bg {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        width: 100%; height: 100%;
        ${urlFondoGlobal ? `background-image: url("${urlFondoGlobal}");` : "background: radial-gradient(circle at center, #180903 0%, #060201 100%);"}
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        opacity: ${CONFIG_EXPORTACION2.OPACIDAD_FONDO_GENERAL_PAGINA || 0.25};
        z-index: 0;
        pointer-events: none;
      }

      .pdf-page-content {
        position: relative;
        z-index: 1;
      }

      /* ENCABEZADO SUPERIOR DE LA PÁGINA */
      .pdf-top-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid #ff6b00;
        padding: ${isPortrait ? "12px 14px" : "14px 20px"};
        margin-bottom: ${isPortrait ? "14px" : "18px"};
        background: rgba(12, 5, 2, 0.92);
        border-radius: 10px;
        border: 1.5px solid rgba(255, 107, 0, 0.45);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.7);
      }

      .pdf-top-title-group {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .pdf-top-logo-icon {
        font-size: ${isPortrait ? "24px" : "28px"};
        filter: drop-shadow(0 0 10px #ff6b00);
      }

      .pdf-top-heading {
        margin: 0;
        font-size: ${isPortrait ? "18px" : "22px"};
        font-weight: 900;
        letter-spacing: 0.05em;
        color: #ffffff;
        text-transform: uppercase;
        font-family: 'Russo One', 'Montserrat', 'Impact', sans-serif;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 12px rgba(255, 107, 0, 0.4);
      }

      .pdf-top-right-meta {
        text-align: right;
      }

      .pdf-capture-label {
        font-size: ${isPortrait ? "8.5px" : "9.5px"};
        text-transform: uppercase;
        color: #ff8c00;
        font-weight: 800;
        letter-spacing: 0.06em;
      }

      .pdf-capture-time {
        font-size: ${isPortrait ? "12px" : "13.5px"};
        font-weight: 800;
        color: #ffffff;
        font-family: 'JetBrains Mono', monospace;
      }

      /* LISTA DE TARJETAS DE JUEGO */
      .pdf-games-stack {
        display: flex;
        flex-direction: column;
        gap: ${isPortrait ? "14px" : "16px"};
      }

      /* =========================================================================
         🏀 TARJETA DE ENFRENTAMIENTO (RÉPLICA EXACTA DE LA CARTELERA)
         ========================================================================= */
      .pdf-game-card {
        background: #090302;
        border: 1.5px solid rgba(255, 107, 0, 0.45);
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8);
      }

      /* 1. Barra Superior del Juego: # MATCH-ID | 🏀 JUEGO X | 🕒 07:00 PM | 🏆 TMT-ID - TORNEO | 📅 DDDD. ddd-mmm-yyyy */
      .pdf-game-header {
        background: #0a0402;
        padding: ${isPortrait ? "8px 14px" : "10px 18px"};
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        gap: 10px;
      }

      .pdf-game-header-left {
        display: flex;
        align-items: center;
        gap: ${isPortrait ? "8px" : "12px"};
        flex-wrap: wrap;
      }

      .pdf-game-header-right {
        display: flex;
        align-items: center;
        gap: ${isPortrait ? "8px" : "12px"};
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .pdf-game-id-tag {
        background: rgba(255, 255, 255, 0.06) !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        box-shadow: none !important;
        color: #94a3b8;
        font-family: 'JetBrains Mono', monospace;
        font-size: ${isPortrait ? "9.5px" : "11px"};
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 6px;
        letter-spacing: 0.02em;
      }

      .pdf-game-number {
        color: #ff8c00;
        font-weight: 900;
        font-size: ${isPortrait ? "13px" : "14.5px"};
        letter-spacing: 0.05em;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .pdf-game-time-badge {
        background: rgba(255, 107, 0, 0.15);
        border: 1.5px solid #d97706;
        color: #ffffff;
        padding: 2px 9px;
        border-radius: 6px;
        font-size: ${isPortrait ? "11px" : "12.5px"};
        font-weight: 800;
        font-family: 'JetBrains Mono', monospace;
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .pdf-tournament-badge {
        background: rgba(251, 191, 36, 0.12);
        border: 1px solid rgba(251, 191, 36, 0.45);
        padding: 2px 9px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: ${isPortrait ? "10px" : "11.5px"};
        white-space: nowrap;
      }

      .pdf-tourn-trophy {
        font-size: ${isPortrait ? "11px" : "12.5px"};
      }

      .pdf-tourn-id {
        color: #fbbf24;
        font-weight: 800;
        font-family: 'JetBrains Mono', monospace;
      }

      .pdf-tourn-sep {
        color: #fdba74;
        font-weight: 700;
      }

      .pdf-tourn-name {
        color: #ffffff;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .pdf-game-date-badge {
        color: #cbd5e1;
        font-size: ${isPortrait ? "11px" : "12.5px"};
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
      }

      /* 2. Banner Central del Versus (CON FONDO 1 VIBRANTE Y NÍTIDO) */
      .pdf-game-body {
        position: relative;
        overflow: hidden;
        padding: ${isPortrait ? "14px 16px" : "18px 24px"};
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: ${isPortrait ? "10px" : "16px"};
        background: transparent;
        border-top: 1px solid rgba(255, 107, 0, 0.25);
        border-bottom: 1px solid rgba(255, 107, 0, 0.25);
      }

      /* 🏀 IMAGEN DE FONDO DETRÁS DE CADA JUEGO (Banner Versus) */
      .pdf-game-bg-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        opacity: ${CONFIG_EXPORTACION2.OPACIDAD_FONDO_CADA_JUEGO || 0.85};
        z-index: 0;
        pointer-events: none;
      }

      .pdf-game-bg-tint {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(to right, rgba(10, 4, 1, 0.5) 0%, rgba(10, 4, 1, 0.05) 50%, rgba(10, 4, 1, 0.5) 100%);
        z-index: 1;
        pointer-events: none;
      }

      /* Lado Equipo A (Local) y Equipo B (Visitante) */
      .pdf-team-col {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: ${isPortrait ? "10px" : "14px"};
      }

      .pdf-team-col.side-a {
        justify-content: flex-end;
      }

      .pdf-team-col.side-b {
        justify-content: flex-start;
      }

      /* Tarjetas de Datos del Equipo */
      .pdf-team-box {
        background: rgba(10, 4, 1, 0.88);
        border: 1.5px solid rgba(255, 107, 0, 0.35);
        border-radius: 12px;
        padding: ${isPortrait ? "8px 12px" : "10px 16px"};
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.75);
        min-width: ${isPortrait ? "130px" : "190px"};
        max-width: ${isPortrait ? "230px" : "290px"};
      }

      .pdf-team-box.text-right {
        text-align: right;
        align-items: flex-end;
      }

      .pdf-team-box.text-left {
        text-align: left;
        align-items: flex-start;
      }

      .pdf-team-tag {
        font-size: ${isPortrait ? "8.5px" : "9.5px"};
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 4px;
        letter-spacing: 0.04em;
        display: inline-block;
      }

      .pdf-team-tag.local {
        background: rgba(56, 189, 248, 0.22);
        border: 1px solid rgba(56, 189, 248, 0.55);
        color: #7dd3fc;
      }

      .pdf-team-tag.visitor {
        background: rgba(244, 63, 94, 0.22);
        border: 1px solid rgba(244, 63, 94, 0.55);
        color: #fda4af;
      }

      .pdf-team-title {
        margin: 2px 0 3px 0;
        font-size: ${isPortrait ? "14px" : "17px"};
        font-weight: 900;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95);
      }

      .pdf-team-details {
        font-size: ${isPortrait ? "9.5px" : "11px"};
        color: #fdba74;
        display: flex;
        gap: 8px;
        font-weight: 700;
        flex-wrap: wrap;
      }

      /* Logo de cada equipo */
      .pdf-team-logo-wrap {
        width: ${isPortrait ? "115px" : "140px"};
        height: ${isPortrait ? "115px" : "140px"};
        min-width: ${isPortrait ? "115px" : "140px"};
        min-height: ${isPortrait ? "115px" : "140px"};
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .pdf-team-logo-img {
        max-width: 100%;
        max-height: 100%;
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 10px rgba(255, 107, 0, 0.45));
      }

      .pdf-placeholder-icon {
        font-size: ${isPortrait ? "36px" : "48px"};
        color: #ff8c00;
        opacity: 0.9;
        filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.9));
      }

      /* =========================================================================
         GRUPO CENTRAL: PÍLDORA VS, MARCADOR (AZUL / ROJO) Y ESTATUS DEBAJO
         ========================================================================= */
      .pdf-vs-group {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 4px;
      }

      .pdf-vs-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: rgba(15, 6, 2, 0.90);
        border: 1.5px solid rgba(255, 107, 0, 0.65);
        border-radius: 30px;
        padding: ${isPortrait ? "4px 14px" : "6px 18px"};
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.8), 0 0 16px rgba(255, 107, 0, 0.4);
      }

      .pdf-vs-ball {
        font-size: ${isPortrait ? "1rem" : "1.15rem"};
        color: #ff6b00;
        filter: drop-shadow(0 0 6px rgba(255, 107, 0, 0.8));
      }

      .pdf-vs-text {
        font-family: 'Russo One', 'Montserrat', 'Bebas Neue', 'Impact', sans-serif;
        font-size: ${isPortrait ? "1.25rem" : "1.55rem"};
        font-style: italic;
        font-weight: 900;
        color: #ffffff;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-shadow: 0 0 8px #ff6b00, 0 0 14px rgba(255, 107, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.9);
        line-height: 1;
      }

      /* Marcador con colores Azul (Local) y Rojo (Visitante) */
      .pdf-score-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: rgba(10, 4, 1, 0.90);
        border: 1.5px solid rgba(255, 107, 0, 0.55);
        border-radius: 20px;
        padding: ${isPortrait ? "3px 14px" : "4px 18px"};
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.7), 0 0 12px rgba(255, 107, 0, 0.35);
      }

      .pdf-score-val {
        font-family: 'JetBrains Mono', 'Impact', monospace;
        font-size: ${isPortrait ? "1.15rem" : "1.35rem"};
        font-weight: 800;
      }

      /* Azul para Local */
      .pdf-score-val.score-a {
        color: #38bdf8;
        text-shadow: 0 0 10px rgba(56, 189, 248, 0.75);
      }

      /* Rojo para Visitante */
      .pdf-score-val.score-b {
        color: #f43f5e;
        text-shadow: 0 0 10px rgba(244, 63, 94, 0.75);
      }

      .pdf-score-divider {
        color: #fed7aa;
        font-weight: 800;
        font-size: 1rem;
        opacity: 0.75;
      }

      /* Estatus Debajo del Marcador */
      .pdf-status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 3px 12px;
        border-radius: 14px;
        font-size: ${isPortrait ? "9.5px" : "11px"};
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .pdf-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
      }

      .pdf-status-pill.status-programado {
        background: rgba(14, 165, 233, 0.22);
        border: 1.5px solid #38bdf8;
        color: #38bdf8;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.55);
      }
      .pdf-status-pill.status-programado .pdf-status-dot {
        background: #38bdf8;
        box-shadow: 0 0 8px #38bdf8;
      }

      .pdf-status-pill.status-pospuesto {
        background: rgba(249, 115, 22, 0.22);
        border: 1.5px solid #f97316;
        color: #f97316;
        box-shadow: 0 0 12px rgba(249, 115, 22, 0.55);
      }
      .pdf-status-pill.status-pospuesto .pdf-status-dot {
        background: #f97316;
        box-shadow: 0 0 8px #f97316;
      }

      .pdf-status-pill.status-finalizado {
        background: rgba(239, 68, 68, 0.22);
        border: 1.5px solid #ef4444;
        color: #ef4444;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.55);
      }
      .pdf-status-pill.status-finalizado .pdf-status-dot {
        background: #ef4444;
        box-shadow: 0 0 8px #ef4444;
      }

      /* 3. Franja de Árbitros */
      .pdf-referees-strip {
        background: #080302;
        padding: ${isPortrait ? "7px 14px" : "9px 18px"};
        display: flex;
        align-items: center;
        gap: ${isPortrait ? "8px" : "12px"};
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        flex-wrap: wrap;
      }

      .pdf-ref-label {
        font-size: ${isPortrait ? "10.5px" : "12px"};
        font-weight: 800;
        color: #ff8c00;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .pdf-ref-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: ${isPortrait ? "10px" : "11.5px"};
        padding: 3px 10px;
        border-radius: 6px;
        font-weight: 700;
      }

      .pdf-ref-pill.p1 {
        border: 1px solid rgba(245, 158, 11, 0.55);
        background: rgba(245, 158, 11, 0.14);
        color: #fef08a;
      }

      .pdf-ref-pill.p2 {
        border: 1px solid rgba(56, 189, 248, 0.55);
        background: rgba(56, 189, 248, 0.14);
        color: #bae6fd;
      }

      .pdf-ref-pill.p3 {
        border: 1px solid rgba(168, 85, 247, 0.55);
        background: rgba(168, 85, 247, 0.14);
        color: #e9d5ff;
      }

      /* 4. Franja de Cancha y Observaciones */
      .pdf-game-footer {
        background: #080302;
        padding: ${isPortrait ? "6px 14px" : "8px 18px"};
        display: flex;
        align-items: center;
        gap: ${isPortrait ? "8px" : "12px"};
        border-top: 1px solid rgba(255, 107, 0, 0.15);
        flex-wrap: wrap;
      }

      .pdf-court-chip {
        background: rgba(255, 107, 0, 0.15);
        border: 1px solid rgba(255, 107, 0, 0.55);
        color: #fbbf24;
        font-size: ${isPortrait ? "9.5px" : "11px"};
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .pdf-notes-chip {
        color: #cbd5e1;
        font-size: ${isPortrait ? "9.5px" : "11px"};
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      /* PIE DEL DOCUMENTO */
      .pdf-doc-bottom-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: ${isPortrait ? "10px" : "14px"};
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.15);
        font-size: ${isPortrait ? "10px" : "11px"};
        color: #a8a29e;
      }
    `;
    printContainer.appendChild(styleEl);

    // 3. Estructurar en páginas según orientación
    const ITEMS_POR_PAGINA = isPortrait
      ? CONFIG_EXPORTACION2.JUEGOS_POR_PAGINA_VERTICAL || 2
      : CONFIG_EXPORTACION2.JUEGOS_POR_PAGINA_HORIZONTAL || 2;

    const totalPaginas = Math.ceil(matchupsDeFecha.length / ITEMS_POR_PAGINA);

    for (let p = 0; p < totalPaginas; p++) {
      const pageWrapper = document.createElement("div");
      pageWrapper.className = "pdf-doc-page";

      // 🏟️ FONDO 2: Capa de Fondo General del PDF
      const globalBg = document.createElement("div");
      globalBg.className = "pdf-page-global-bg";
      pageWrapper.appendChild(globalBg);

      // Contenido de la página
      const content = document.createElement("div");
      content.className = "pdf-page-content";

      // Encabezado limpio de la página
      content.innerHTML = `
        <div class="pdf-top-banner">
          <div class="pdf-top-title-group">
            <span class="pdf-top-logo-icon">🏀</span>
            <h1 class="pdf-top-heading">${escapeHtml(CONFIG_EXPORTACION2.PDF_HEADER_TITLE)}</h1>
          </div>
          <div class="pdf-top-right-meta">
            <div class="pdf-capture-label">FECHA Y HORA DE CAPTURA:</div>
            <div class="pdf-capture-time">${escapeHtml(timestampCaptura)}</div>
          </div>
        </div>
      `;

      // Contenedor de juegos de esta página
      const gamesStack = document.createElement("div");
      gamesStack.className = "pdf-games-stack";

      const startIdx = p * ITEMS_POR_PAGINA;
      const endIdx = Math.min(
        startIdx + ITEMS_POR_PAGINA,
        matchupsDeFecha.length,
      );

      for (let i = startIdx; i < endIdx; i++) {
        const m = matchupsDeFecha[i];
        const scoreA = m.scoreA != null ? m.scoreA : 0;
        const scoreB = m.scoreB != null ? m.scoreB : 0;
        const rawStatus = (
          m.status ||
          m.Estatus ||
          m.Estado ||
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
        const hasReferees =
          m.referee1_name || m.referee2_name || m.referee3_name;
        const fechaMostrada = formatearFechaJuego(m.gameDate || fechaJuego);
        const tournIdVal =
          m.ID_Tournament || m.id_tournament || m.tournamentId || "";
        const tournNameVal =
          m.Tournament || m.tournament || m.tournamentName || "";

        const card = document.createElement("div");
        card.className = "pdf-game-card";

        card.innerHTML = `
          <!-- 1. Encabezado de la tarjeta: ID | JUEGO X | HORA | TORNEO | FECHA -->
          <div class="pdf-game-header">
            <div class="pdf-game-header-left">
              <span class="pdf-game-id-tag"># ${escapeHtml(m.id || `MATCH-${i + 1}`)}</span>
              <span class="pdf-game-number">🏀 ${escapeHtml(m.gameTitle || `JUEGO ${i + 1}`)}</span>
              <span class="pdf-game-time-badge">🕒 ${escapeHtml(m.gameTime || "08:00 PM")}</span>
            </div>
            <div class="pdf-game-header-right">
              ${
                tournIdVal || tournNameVal
                  ? `
                <div class="pdf-tournament-badge">
                  <span class="pdf-tourn-trophy">🏆</span>
                  <span class="pdf-tourn-id">${escapeHtml(tournIdVal)}</span>
                  ${tournIdVal && tournNameVal ? `<span class="pdf-tourn-sep">-</span>` : ""}
                  <span class="pdf-tourn-name">${escapeHtml(tournNameVal)}</span>
                </div>
              `
                  : ""
              }
              <div class="pdf-game-date-badge">
                <span>📅 ${escapeHtml(fechaMostrada)}</span>
              </div>
            </div>
          </div>

          <!-- 2. Cuerpo del Versus (CON FONDO 1 VIBRANTE Y RÉPLICA EXACTA) -->
          <div class="pdf-game-body">
            <!-- Capa Imagen de Fondo (Cancha / Graffiti) -->
            ${urlFondoVersus ? `<img src="${escapeHtml(urlFondoVersus)}" class="pdf-game-bg-image" crossOrigin="anonymous" alt="Fondo Versus" />` : ""}
            <div class="pdf-game-bg-tint"></div>

            <!-- Columna Equipo A (Local) -->
            <div class="pdf-team-col side-a">
              <div class="pdf-team-box text-right">
                <span class="pdf-team-tag local">LOCAL</span>
                <h3 class="pdf-team-title">${escapeHtml(m.teamA_name || "Equipo Local")}</h3>
                <div class="pdf-team-details">
                  <span>ID: ${escapeHtml(m.teamA_id || "BB-00000")}</span>
                  <span>${escapeHtml(m.teamA_code || "DIR-00")}</span>
                </div>
              </div>
              <div class="pdf-team-logo-wrap">
                ${
                  m.teamA_logo
                    ? `<img src="${escapeHtml(m.teamA_logo)}" alt="${escapeHtml(m.teamA_name)}" class="pdf-team-logo-img" crossOrigin="anonymous" />`
                    : `<span class="pdf-placeholder-icon">🏀</span>`
                }
              </div>
            </div>

            <!-- Centro: Píldora VS, Marcador (Azul Local / Rojo Visitante), y Estatus Debajo -->
            <div class="pdf-vs-group">
              <!-- Píldora VS -->
              <div class="pdf-vs-pill">
                <span class="pdf-vs-ball">🏀</span>
                <span class="pdf-vs-text">VS</span>
                <span class="pdf-vs-ball">🏀</span>
              </div>

              <!-- Marcador de Puntos (Azul para Local y Rojo para Visitante) -->
              <div class="pdf-score-box">
                <span class="pdf-score-val score-a">${scoreA}</span>
                <span class="pdf-score-divider">-</span>
                <span class="pdf-score-val score-b">${scoreB}</span>
              </div>

              <!-- Estatus Neón (Debajo del Marcador) -->
              <div class="pdf-status-pill status-${statusKey}">
                <span class="pdf-status-dot"></span>
                <span>${statusLabel.toUpperCase()}</span>
              </div>
            </div>

            <!-- Columna Equipo B (Visitante) -->
            <div class="pdf-team-col side-b">
              <div class="pdf-team-logo-wrap">
                ${
                  m.teamB_logo
                    ? `<img src="${escapeHtml(m.teamB_logo)}" alt="${escapeHtml(m.teamB_name)}" class="pdf-team-logo-img" crossOrigin="anonymous" />`
                    : `<span class="pdf-placeholder-icon">🏀</span>`
                }
              </div>
              <div class="pdf-team-box text-left">
                <span class="pdf-team-tag visitor">VISITANTE</span>
                <h3 class="pdf-team-title">${escapeHtml(m.teamB_name || "Equipo Visitante")}</h3>
                <div class="pdf-team-details">
                  <span>ID: ${escapeHtml(m.teamB_id || "BB-00000")}</span>
                  <span>${escapeHtml(m.teamB_code || "DIR-00")}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Franja de Árbitros si existen -->
          ${
            hasReferees
              ? `
            <div class="pdf-referees-strip">
              <span class="pdf-ref-label">👤 Árbitros:</span>
              ${m.referee1_name ? `<span class="pdf-ref-pill p1">1: ${escapeHtml(m.referee1_name)}</span>` : ""}
              ${m.referee2_name ? `<span class="pdf-ref-pill p2">2: ${escapeHtml(m.referee2_name)}</span>` : ""}
              ${m.referee3_name ? `<span class="pdf-ref-pill p3">3: ${escapeHtml(m.referee3_name)}</span>` : ""}
            </div>
          `
              : ""
          }

          <!-- 4. Franja de Cancha y Observaciones -->
          ${
            m.courtLocation || m.notes || m.Observaciones
              ? `
            <div class="pdf-game-footer">
              ${m.courtLocation ? `<span class="pdf-court-chip">📍 ${escapeHtml(m.courtLocation)}</span>` : ""}
              ${m.notes || m.Observaciones ? `<span class="pdf-notes-chip">💬 ${escapeHtml(m.notes || m.Observaciones)}</span>` : ""}
            </div>
          `
              : ""
          }
        `;

        gamesStack.appendChild(card);
      }

      content.appendChild(gamesStack);

      // Pie de la página
      const bottomBar = document.createElement("div");
      bottomBar.className = "pdf-doc-bottom-bar";
      bottomBar.innerHTML = `
        <span>Página ${p + 1} de ${totalPaginas} • Juegos de la fecha (${fechaJuego}): ${matchupsDeFecha.length}</span>
        <span>Sistema de Gestión Deportiva • HistoryGame • Orientación: ${isPortrait ? "Vertical" : "Horizontal"}</span>
      `;
      content.appendChild(bottomBar);

      pageWrapper.appendChild(content);
      printContainer.appendChild(pageWrapper);
    }

    document.body.appendChild(printContainer);

    // Precargar imágenes antes de renderizar canvas
    await esperarCargaImagenes(printContainer);

    // 4. Instanciar jsPDF con la orientación configurada
    const { jsPDF } = window.jspdf || window;
    const pdf = new jsPDF({
      orientation: isPortrait ? "portrait" : "landscape",
      unit: "pt",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const pages = printContainer.querySelectorAll(".pdf-doc-page");

    for (let index = 0; index < pages.length; index++) {
      const pageEl = pages[index];

      const canvas = await html2canvas(pageEl, {
        scale: 2, // Resolución nítida Retina
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#060201",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      if (index > 0) {
        pdf.addPage();
      }

      const margin = 14;
      const printW = pdfWidth - margin * 2;
      const printH = (canvas.height * printW) / canvas.width;

      pdf.addImage(
        imgData,
        "JPEG",
        margin,
        margin,
        printW,
        Math.min(printH, pdfHeight - margin * 2),
      );
    }

    // Limpiar DOM temporal
    if (printContainer.parentElement) {
      printContainer.parentElement.removeChild(printContainer);
    }

    // Guardar archivo PDF con fecha y orientación identificada
    const fechaLimpia = sanitizarNombreFecha(fechaJuego);
    const orientSufijo = isPortrait ? "Vertical" : "Horizontal";
    const filename = `${CONFIG_EXPORTACION2.NOMBRE_ARCHIVO_BASE}_${fechaLimpia}_${orientSufijo}_${obtenerTimestampArchivo()}.pdf`;
    pdf.save(filename);
  }

  /**
   * Fallback nativo en caso de no contar con html2canvas
   */
  function generarPdfFechaFallback(
    fechaJuego,
    matchupsDeFecha,
    timestampCaptura,
    orientacion = "portrait",
  ) {
    const isPortrait = orientacion === "portrait";
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({
      orientation: isPortrait ? "portrait" : "landscape",
      unit: "mm",
      format: "a4",
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFillColor(15, 7, 3);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setDrawColor(255, 107, 0);
    doc.setLineWidth(0.8);
    doc.rect(6, 6, pageW - 12, pageH - 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 140, 0);
    doc.text(
      `${CONFIG_EXPORTACION2.PDF_HEADER_TITLE} - FECHA: ${fechaJuego}`,
      12,
      16,
    );

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `Captura: ${timestampCaptura} | Total Juegos: ${matchupsDeFecha.length} | Formato: ${isPortrait ? "Vertical" : "Horizontal"}`,
      pageW - 12,
      16,
      { align: "right" },
    );

    const fechaLimpia = sanitizarNombreFecha(fechaJuego);
    const orientSufijo = isPortrait ? "Vertical" : "Horizontal";
    doc.save(
      `${CONFIG_EXPORTACION2.NOMBRE_ARCHIVO_BASE}_${fechaLimpia}_${orientSufijo}_${obtenerTimestampArchivo()}.pdf`,
    );
  }

  // =====================================================================================
  // 7. UTILIDADES AUXILIARES
  // =====================================================================================
  function esperarCargaImagenes(container) {
    const images = container.querySelectorAll("img");
    if (!images || images.length === 0) return Promise.resolve();

    const promises = Array.from(images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 1500);
      });
    });

    return Promise.all(promises);
  }

  function descargarBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentElement) a.parentElement.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function mostrarNotificacion(texto, tipo = "info") {
    if (typeof window.showToast === "function") {
      window.showToast(texto, tipo);
      return;
    }

    const toast = document.createElement("div");
    toast.className = `custom-game-toast toast-${tipo}`;
    let icon = "fa-circle-info";
    if (tipo === "success") icon = "fa-circle-check";
    if (tipo === "warning") icon = "fa-triangle-exclamation";
    if (tipo === "error") icon = "fa-circle-xmark";

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(texto)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);
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

  // Exponer métodos globalmente
  window.Exportacion2 = {
    exportarCSV,
    exportarExcel,
    exportarPDF: (orientacion) => {
      if (orientacion) {
        ejecutarExportacionPDF(orientacion);
      } else {
        iniciarFlujoExportacionPDF();
      }
    },
    ejecutarExportacionPDF,
    resolverRutaFondo,
    obtenerFechaHoraCaptura,
    config: CONFIG_EXPORTACION2,
  };

  // Alias para invocación directa desde botones
  window.exportarPDF2 = window.Exportacion2.exportarPDF;
})(window, document);
