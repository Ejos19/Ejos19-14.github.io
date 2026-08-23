import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares para JSON y urlencoded con límites ampliados
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Directorio y archivo de persistencia compartida
  const DATA_DIR = path.join(process.cwd(), "data");
  const MATCHUPS_FILE = path.join(DATA_DIR, "matchups.json");
  const STANDINGS_FILE = path.join(DATA_DIR, "standings.json");
  const BRACKET_FILE = path.join(DATA_DIR, "bracket.json");
  const BRACKET_HISTORY_FILE = path.join(DATA_DIR, "bracket_history.json");

  // Asegurar que la carpeta data exista
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // =========================================================================
  // RUTAS API PARA RONDA ELIMINATORIA (BRACKET / PLAYOFFS)
  // Persistencia centralizada compartida para todos los dispositivos (PC, móvil, tablet)
  // =========================================================================

  // GET /api/bracket/list -> Lista todas las versiones y torneos guardados de PlayOffs
  app.get("/api/bracket/list", (req, res) => {
    try {
      let historyList: any[] = [];
      if (fs.existsSync(BRACKET_HISTORY_FILE)) {
        try {
          const content = fs.readFileSync(BRACKET_HISTORY_FILE, "utf-8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) historyList = parsed;
        } catch (e) {
          historyList = [];
        }
      }

      // Si no hay historial pero sí hay bracket.json activo, agregarlo
      if (historyList.length === 0 && fs.existsSync(BRACKET_FILE)) {
        try {
          const currentContent = fs.readFileSync(BRACKET_FILE, "utf-8");
          const current = JSON.parse(currentContent);
          const currentTourn = current.tournamentId || "TODOS";
          historyList.push({
            id: currentTourn,
            tournamentId: currentTourn,
            tournamentName: current.tournamentName || currentTourn,
            format: current.bracketData?.format || "16",
            championName: current.bracketData?.champion?.name || "",
            matchCount: Array.isArray(current.rows) ? current.rows.length : 0,
            updatedAt: current.updatedAt || new Date().toISOString(),
          });
        } catch (e) {}
      }

      return res.json({
        status: "success",
        count: historyList.length,
        items: historyList.map((item) => ({
          id: item.id || item.tournamentId || "TODOS",
          tournamentId: item.tournamentId || item.id || "TODOS",
          tournamentName:
            item.tournamentName || item.tournamentId || "Torneo General",
          format: item.format || item.bracketData?.format || "16",
          championName:
            item.championName || item.bracketData?.champion?.name || "--",
          matchCount: Array.isArray(item.rows)
            ? item.rows.length
            : item.matchCount || 0,
          updatedAt: item.updatedAt || new Date().toISOString(),
        })),
      });
    } catch (err: any) {
      console.error("[API GET /api/bracket/list] Error:", err);
      return res.status(500).json({
        status: "error",
        message: "Error al listar versiones de PlayOffs: " + err.message,
      });
    }
  });

  // GET /api/bracket -> Obtiene la estructura, filas tabulares y equipos de la ronda eliminatoria
  app.get("/api/bracket", (req, res) => {
    try {
      const queryId = req.query.id
        ? String(req.query.id).trim().toLowerCase()
        : "";
      const queryTourn = req.query.tournamentId
        ? String(req.query.tournamentId).trim().toLowerCase()
        : "";
      const targetQuery = queryId || queryTourn;

      // 1. Si se especificó un ID, buscar primero en el historial
      if (targetQuery && fs.existsSync(BRACKET_HISTORY_FILE)) {
        try {
          const histContent = fs.readFileSync(BRACKET_HISTORY_FILE, "utf-8");
          const history = JSON.parse(histContent);
          if (Array.isArray(history)) {
            const matchedHistory = history.find((h: any) => {
              const hId = String(h.id || "")
                .trim()
                .toLowerCase();
              const hTourn = String(h.tournamentId || "")
                .trim()
                .toLowerCase();
              if (hId === targetQuery || hTourn === targetQuery) return true;
              if (Array.isArray(h.rows)) {
                return h.rows.some(
                  (r: any) =>
                    String(r.ID || "")
                      .trim()
                      .toLowerCase() === targetQuery ||
                    String(r.ID_Llave || "")
                      .trim()
                      .toLowerCase() === targetQuery,
                );
              }
              return false;
            });

            if (matchedHistory) {
              return res.json({
                status: "success",
                source: "history_match",
                id: targetQuery,
                bracketData: matchedHistory.bracketData || matchedHistory,
                rows: matchedHistory.rows || [],
                tournamentId:
                  matchedHistory.tournamentId || matchedHistory.id || "TODOS",
                tournamentName: matchedHistory.tournamentName || "",
                updatedAt: matchedHistory.updatedAt || new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          console.warn("[API GET /api/bracket] Error leyendo historial:", e);
        }
      }

      // 2. Si no se encontró en historial o no se especificó ID, consultar el archivo actual
      if (fs.existsSync(BRACKET_FILE)) {
        const fileContent = fs.readFileSync(BRACKET_FILE, "utf-8");
        const parsed = JSON.parse(fileContent);

        // Soporte tanto para objeto con bracketData/rows o bracketData directo
        let bracketData = parsed.bracketData ? parsed.bracketData : parsed;
        let rows = Array.isArray(parsed.rows) ? parsed.rows : [];
        let tournamentId = parsed.tournamentId || "TODOS";
        let tournamentName = parsed.tournamentName || "";
        let updatedAt = parsed.updatedAt || new Date().toISOString();

        // Si se solicitó un ID de llave específico (ej: PO-OCT-01 o oct-1)
        if (targetQuery && rows.length > 0) {
          const matchedRow = rows.find(
            (r: any) =>
              String(r.ID || "")
                .trim()
                .toLowerCase() === targetQuery ||
              String(r.ID_Llave || "")
                .trim()
                .toLowerCase() === targetQuery ||
              String(r.ID_Tournament || "")
                .trim()
                .toLowerCase() === targetQuery,
          );
          return res.json({
            status: "success",
            source: "server_storage_filtered_by_id",
            id: targetQuery,
            matchRow: matchedRow || null,
            bracketData,
            rows,
            tournamentId,
            tournamentName,
            updatedAt,
          });
        }

        return res.json({
          status: "success",
          source: "server_storage",
          bracketData: bracketData,
          rows: rows,
          tournamentId: tournamentId,
          tournamentName: tournamentName,
          updatedAt: updatedAt,
        });
      }

      return res.json({
        status: "success",
        source: "empty",
        bracketData: null,
        rows: [],
        tournamentId: "TODOS",
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[API GET /api/bracket] Error:", err);
      return res.status(500).json({
        status: "error",
        message: "Error al leer ronda eliminatoria: " + err.message,
      });
    }
  });

  // POST /api/bracket -> Guarda la estructura, equipos y filas tabulares con ID de la ronda eliminatoria
  app.post("/api/bracket", (req, res) => {
    try {
      const {
        bracketData,
        sheetName,
        rows,
        tournamentId,
        tournamentName,
        updatedAt,
      } = req.body;
      if (!bracketData) {
        return res.status(400).json({
          status: "error",
          message: "Formato inválido. 'bracketData' es requerido.",
        });
      }

      const activeTournamentId =
        tournamentId || bracketData.tournamentId || "TODOS";
      const activeTournamentName =
        tournamentName || bracketData.tournamentName || activeTournamentId;
      const cleanRows = Array.isArray(rows) ? rows : [];
      const timestamp = updatedAt || new Date().toISOString();

      const payloadToSave = {
        bracketData,
        rows: cleanRows,
        tournamentId: activeTournamentId,
        tournamentName: activeTournamentName,
        sheetName: sheetName || "PlayOffs",
        updatedAt: timestamp,
      };

      // Guardar el estado activo global
      fs.writeFileSync(
        BRACKET_FILE,
        JSON.stringify(payloadToSave, null, 2),
        "utf-8",
      );

      // Guardar en el historial indexado por ID de Torneo y fecha
      try {
        let historyList: any[] = [];
        if (fs.existsSync(BRACKET_HISTORY_FILE)) {
          const content = fs.readFileSync(BRACKET_HISTORY_FILE, "utf-8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) historyList = parsed;
        }

        const historyEntry = {
          id: activeTournamentId,
          tournamentId: activeTournamentId,
          tournamentName: activeTournamentName,
          format: bracketData.format || "16",
          championName: bracketData.champion?.name || "",
          matchCount: cleanRows.length,
          updatedAt: timestamp,
          bracketData,
          rows: cleanRows,
        };

        // Reemplazar si ya existía ese tournamentId o insertar al inicio
        const existingIdx = historyList.findIndex(
          (h: any) =>
            String(h.id || "")
              .trim()
              .toLowerCase() ===
            String(activeTournamentId).trim().toLowerCase(),
        );

        if (existingIdx !== -1) {
          historyList[existingIdx] = historyEntry;
        } else {
          historyList.unshift(historyEntry);
        }

        // Mantener hasta 30 versiones históricas
        if (historyList.length > 30) {
          historyList = historyList.slice(0, 30);
        }

        fs.writeFileSync(
          BRACKET_HISTORY_FILE,
          JSON.stringify(historyList, null, 2),
          "utf-8",
        );
      } catch (histErr) {
        console.warn(
          "[API POST /api/bracket] Error guardando historial:",
          histErr,
        );
      }

      console.log(
        `[API POST /api/bracket] Guardada ronda eliminatoria de PlayOffs con éxito (${cleanRows.length} filas con ID).`,
      );

      return res.json({
        status: "success",
        message: `Ronda eliminatoria de PlayOffs guardada exitosamente en el servidor (${cleanRows.length} filas con ID) para todos los dispositivos.`,
        targetSheet: sheetName || "PlayOffs",
        tournamentId: activeTournamentId,
        rowCount: cleanRows.length,
        updatedAt: timestamp,
      });
    } catch (err: any) {
      console.error("[API POST /api/bracket] Error:", err);
      return res.status(500).json({
        status: "error",
        message:
          "Error al guardar ronda eliminatoria en el servidor: " + err.message,
      });
    }
  });

  // =========================================================================
  // RUTAS API PARA CARTELERA DE ENFRENTAMIENTOS (COMPARTIDA ENTRE DISPOSITIVOS E IPS)
  // =========================================================================

  // GET /api/matchups -> Obtiene la cartelera guardada en el servidor
  app.get("/api/matchups", (req, res) => {
    try {
      if (fs.existsSync(MATCHUPS_FILE)) {
        const fileContent = fs.readFileSync(MATCHUPS_FILE, "utf-8");
        const parsed = JSON.parse(fileContent);
        return res.json({
          status: "success",
          source: "server_storage",
          count: Array.isArray(parsed) ? parsed.length : 0,
          matchups: Array.isArray(parsed) ? parsed : [],
        });
      }
      return res.json({
        status: "success",
        source: "empty",
        count: 0,
        matchups: [],
      });
    } catch (err: any) {
      console.error("[API GET /api/matchups] Error:", err);
      return res.status(500).json({
        status: "error",
        message:
          "Error al leer los enfrentamientos guardados en el servidor: " +
          err.message,
      });
    }
  });

  // POST /api/matchups -> Guarda la lista completa de enfrentamientos en el servidor
  app.post("/api/matchups", (req, res) => {
    try {
      const { matchups } = req.body;
      if (!Array.isArray(matchups)) {
        return res.status(400).json({
          status: "error",
          message:
            "Formato inválido. 'matchups' debe ser una lista de enfrentamientos.",
        });
      }

      fs.writeFileSync(
        MATCHUPS_FILE,
        JSON.stringify(matchups, null, 2),
        "utf-8",
      );
      console.log(
        `[API POST /api/matchups] Guardados con éxito ${matchups.length} enfrentamientos en el servidor.`,
      );

      return res.json({
        status: "success",
        message:
          "Cartelera de enfrentamientos guardada exitosamente en el servidor.",
        count: matchups.length,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[API POST /api/matchups] Error:", err);
      return res.status(500).json({
        status: "error",
        message: "Error al guardar en el servidor: " + err.message,
      });
    }
  });

  // =========================================================================
  // RUTAS API PARA TABLA DE POSICIONES (HOJA POSITIONTABLE)
  // =========================================================================

  // GET /api/standings -> Obtiene la última tabla de posiciones guardada
  app.get("/api/standings", (req, res) => {
    try {
      if (fs.existsSync(STANDINGS_FILE)) {
        const fileContent = fs.readFileSync(STANDINGS_FILE, "utf-8");
        const parsed = JSON.parse(fileContent);
        return res.json({
          status: "success",
          source: "server_storage",
          count: Array.isArray(parsed) ? parsed.length : 0,
          standings: Array.isArray(parsed) ? parsed : [],
        });
      }
      return res.json({
        status: "success",
        source: "empty",
        count: 0,
        standings: [],
      });
    } catch (err: any) {
      console.error("[API GET /api/standings] Error:", err);
      return res.status(500).json({
        status: "error",
        message:
          "Error al leer tabla de posiciones del servidor: " + err.message,
      });
    }
  });

  // POST /api/standings -> Guarda la tabla de posiciones calculada en el servidor local
  app.post("/api/standings", (req, res) => {
    try {
      const { standings } = req.body;
      if (!Array.isArray(standings)) {
        return res.status(400).json({
          status: "error",
          message:
            "Formato inválido. 'standings' debe ser un array de equipos clasificados.",
        });
      }

      fs.writeFileSync(
        STANDINGS_FILE,
        JSON.stringify(standings, null, 2),
        "utf-8",
      );
      console.log(
        `[API POST /api/standings] Guardada tabla de posiciones con ${standings.length} equipos.`,
      );

      return res.json({
        status: "success",
        message: `Tabla de posiciones guardada con éxito en el servidor (${standings.length} equipos).`,
        count: standings.length,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[API POST /api/standings] Error:", err);
      return res.status(500).json({
        status: "error",
        message:
          "Error al guardar tabla de posiciones en servidor: " + err.message,
      });
    }
  });

  // POST /api/matchups/score -> Actualiza únicamente el marcador y estatus de un enfrentamiento por su ID
  app.post("/api/matchups/score", (req, res) => {
    try {
      const { id, scoreA, scoreB, status, Estatus, targetSheet } = req.body;
      if (!id) {
        return res.status(400).json({
          status: "error",
          message:
            "Se requiere el parámetro 'id' del enfrentamiento a actualizar.",
        });
      }

      const matchStatus = status || Estatus || "Finalizado";

      let currentMatchups: any[] = [];
      if (fs.existsSync(MATCHUPS_FILE)) {
        try {
          const content = fs.readFileSync(MATCHUPS_FILE, "utf-8");
          currentMatchups = JSON.parse(content);
          if (!Array.isArray(currentMatchups)) currentMatchups = [];
        } catch (e) {
          currentMatchups = [];
        }
      }

      const matchIndex = currentMatchups.findIndex(
        (m: any) =>
          String(m.id).trim().toLowerCase() ===
            String(id).trim().toLowerCase() ||
          String(m.gameTitle || "")
            .trim()
            .toLowerCase() === String(id).trim().toLowerCase(),
      );

      const numScoreA = parseInt(scoreA, 10) || 0;
      const numScoreB = parseInt(scoreB, 10) || 0;

      if (matchIndex !== -1) {
        currentMatchups[matchIndex].scoreA = numScoreA;
        currentMatchups[matchIndex].scoreB = numScoreB;
        currentMatchups[matchIndex].Marcador_equipoA = numScoreA;
        currentMatchups[matchIndex].Marcador_equipoB = numScoreB;
        currentMatchups[matchIndex].Marcador = `${numScoreA} - ${numScoreB}`;
        currentMatchups[matchIndex].status = matchStatus;
        currentMatchups[matchIndex].Estatus = matchStatus;
        currentMatchups[matchIndex].estatus = matchStatus;
        currentMatchups[matchIndex].updatedAt = new Date().toISOString();

        fs.writeFileSync(
          MATCHUPS_FILE,
          JSON.stringify(currentMatchups, null, 2),
          "utf-8",
        );
      }

      return res.json({
        ok: true,
        message: `Marcador y estatus para el ID "${id}" actualizado con éxito: ${numScoreA} - ${numScoreB} (${matchStatus})`,
        matchFoundInServer: matchIndex !== -1,
        scoreA: numScoreA,
        scoreB: numScoreB,
        gameStatus: matchStatus,
        targetSheet: targetSheet || "game",
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[API POST /api/matchups/score] Error:", err);
      return res.status(500).json({
        status: "error",
        message: "Error al actualizar marcador en servidor: " + err.message,
      });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "Basketball Matchups & Google Sheets Portal API",
    });
  });

  // =========================================================================
  // VITE MIDDLEWARE (DESARROLLO) / STATIC SERVING (PRODUCCIÓN)
  // =========================================================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[Server] Corriendo en http://0.0.0.0:${PORT} (accesible para cualquier IP/dispositivo)`,
    );
  });
}

startServer().catch((err) => {
  console.error("[Server Startup Error]:", err);
});
