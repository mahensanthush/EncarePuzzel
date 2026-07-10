import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Particles from "@tsparticles/react";
import { loadFull } from "tsparticles";
import "./PuzzleGame.css";

const GRID_SIZE = 5;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
const TIME_LIMIT = 60; // 1 minute per the brief

// Mascot artwork: shown on Welcome / Score(hero) / Final screens only.
const MASCOT_IMAGE_URL = "/new_moscujt-removebg-preview.png"; // Updated Mascot File

// Puzzle photo: the image that actually gets cut into tiles and played.
// TODO: swap this placeholder for the real photo you want players to reassemble
// (reference thumbnail, grid tiles, tray tiles, and the drag ghost all pull from this one).
const PUZZLE_IMAGE_URL = "/mascot.jpg";

// Shared helper so grid + tray + ghost all compute the exact same sprite offset
const bgPosFor = (piece) =>
  `${(piece % GRID_SIZE) * (100 / (GRID_SIZE - 1))}% ${
    Math.floor(piece / GRID_SIZE) * (100 / (GRID_SIZE - 1))
  }%`;

const PuzzleGame = () => {
  // 5-Step Game State: WELCOME, INSTRUCTION, GAME, SCORE, FINAL
  const [gameState, setGameState] = useState("WELCOME");

  const [gridPieces, setGridPieces] = useState(Array(TOTAL_TILES).fill(null));
  const [trayPieces, setTrayPieces] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [scoreData, setScoreData] = useState({ percentage: 0, message: "", isHero: false });

  // ---- Drag state (Pointer Events: works for mouse, touch, and pen) ----
  const [ghost, setGhost] = useState(null); // { pieceId, x, y, offsetX, offsetY, width, height }
  const [hoverIndex, setHoverIndex] = useState(null); // grid cell currently under the finger/cursor
  const [hoverTray, setHoverTray] = useState(false);
  const dragInfoRef = useRef(null); // { pieceId, source } - source is "tray" or a grid index string

  // Always-current ref of gridPieces so timers/callbacks never read a stale snapshot
  const gridPiecesRef = useRef(gridPieces);
  useEffect(() => {
    gridPiecesRef.current = gridPieces;
  }, [gridPieces]);

  const particlesInit = useCallback(async (engine) => {
    await loadFull(engine);
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const calculateAndSetScore = useCallback(() => {
    const currentGrid = gridPiecesRef.current;
    let correctCount = 0;
    currentGrid.forEach((piece, index) => {
      if (piece === index) correctCount++;
    });

    const percentage = Math.round((correctCount / TOTAL_TILES) * 100);
    let message = "";
    let isHero = false;

    if (percentage === 100) {
      message = "You are an EnCare Pet Hero!";
      isHero = true;
    } else if (percentage >= 90) {
      message = "Excellent! You completed the EnCare Mascot like a pro!";
    } else if (percentage >= 70) {
      message = "Great job! You are almost there!";
    } else if (percentage >= 50) {
      message = "Good try! Keep going!";
    } else {
      message = "Nice effort! Try again and complete the mascot!";
    }

    setScoreData({ percentage, message, isHero });
    setGameState("SCORE");
  }, []);

  // Timer Logic
  useEffect(() => {
    let timer;
    if (gameState === "GAME") {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            calculateAndSetScore(); // reads gridPiecesRef.current -> always fresh
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, calculateAndSetScore]);

  // Auto win-check whenever the grid changes during active play
  useEffect(() => {
    if (gameState !== "GAME") return;
    const complete =
      !gridPieces.includes(null) && gridPieces.every((piece, index) => piece === index);
    if (complete) calculateAndSetScore();
  }, [gridPieces, gameState, calculateAndSetScore]);

  const initGame = () => {
    const pieces = Array.from({ length: TOTAL_TILES }, (_, i) => i);
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    setTrayPieces(pieces);
    setGridPieces(Array(TOTAL_TILES).fill(null));
    setTimeLeft(TIME_LIMIT);
    setGameState("GAME");
  };

  // ---------------- Pointer-based Drag & Drop ----------------
  // Replaces the old HTML5 draggable/dataTransfer approach, which never fires on touch devices.

  const performDropOnGrid = useCallback((pieceId, source, targetIndex) => {
    setGridPieces((prevGrid) => {
      const sourceIndex = source === "tray" ? null : parseInt(source, 10);
      if (sourceIndex === targetIndex) return prevGrid; // dropped back on itself

      const newGrid = [...prevGrid];
      const occupying = newGrid[targetIndex];

      if (source === "tray") {
        newGrid[targetIndex] = pieceId;
        setTrayPieces((prevTray) => {
          let newTray = prevTray.filter((p) => p !== pieceId);
          if (occupying !== null) newTray = [...newTray, occupying]; // bump displaced piece to tray
          return newTray;
        });
      } else {
        // swap the two grid pieces instead of rejecting the drop
        newGrid[sourceIndex] = occupying;
        newGrid[targetIndex] = pieceId;
      }
      return newGrid;
    });
  }, []);

  const performDropOnTray = useCallback((pieceId, source) => {
    if (source === "tray") return; // already in tray, no-op
    const sourceIndex = parseInt(source, 10);
    setGridPieces((prevGrid) => {
      const newGrid = [...prevGrid];
      newGrid[sourceIndex] = null;
      return newGrid;
    });
    setTrayPieces((prevTray) => [...prevTray, pieceId]);
  }, []);

  const handlePointerDown = (e, pieceId, source) => {
    // Ignore non-primary mouse buttons (right/middle click)
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    dragInfoRef.current = { pieceId, source };
    setGhost({
      pieceId,
      width: rect.width,
      height: rect.height,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      x: e.clientX,
      y: e.clientY,
    });
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!dragInfoRef.current) return;
      e.preventDefault();
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = el?.closest(".grid-cell");
      const trayEl = el?.closest(".bottom-tray");
      setHoverIndex(cellEl ? parseInt(cellEl.dataset.index, 10) : null);
      setHoverTray(!!trayEl);
    };

    const endDrag = (e) => {
      if (!dragInfoRef.current) return;
      const { pieceId, source } = dragInfoRef.current;
      const clientX = e.clientX ?? ghost?.x;
      const clientY = e.clientY ?? ghost?.y;
      const el = document.elementFromPoint(clientX, clientY);
      const cellEl = el?.closest(".grid-cell");
      const trayEl = el?.closest(".bottom-tray");

      if (cellEl && cellEl.dataset.index !== undefined) {
        performDropOnGrid(pieceId, source, parseInt(cellEl.dataset.index, 10));
      } else if (trayEl) {
        performDropOnTray(pieceId, source);
      }
      // dropped outside any valid zone -> snap back (state already unchanged)

      dragInfoRef.current = null;
      setGhost(null);
      setHoverIndex(null);
      setHoverTray(false);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performDropOnGrid, performDropOnTray]);

  return (
    <div className="hardware-container">
      <div className="app-container">
        {gameState === "SCORE" && scoreData.percentage >= 90 && (
          <Particles
            id="tsparticles"
            init={particlesInit}
            options={{
              particles: {
                number: { value: 200 },
                color: { value: ["#5dc19b", "#53c4c6", "#6cb754", "#ffffff"] },
                shape: { type: ["circle", "square"] },
                opacity: { value: { min: 0, max: 1 } },
                size: { value: { min: 3, max: 8 } },
                move: { enable: true, speed: 15, direction: "bottom", straight: false, outModes: "out" },
              },
            }}
            style={{ position: "absolute", zIndex: 5, pointerEvents: "none" }}
          />
        )}

        

        <div className="ui-layer">
          <AnimatePresence mode="wait">
            {gameState === "WELCOME" && (
              <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="screen-container">
                <h1 className="main-title">ENCARE<br />PUZZLE</h1>
                <div className="mascot-display mascot-jump mascot-hero" style={{ backgroundImage: `url('${MASCOT_IMAGE_URL}')` }}></div>
                <h2 className="subtitle-text">Let's match the EnCare Mascot!</h2>
                <button className="primary-btn huge-btn" onClick={() => setGameState("INSTRUCTION")}>START</button>
              </motion.div>
            )}

            {gameState === "INSTRUCTION" && (
              <motion.div key="instruction" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="screen-container">
                <h1 className="screen-heading">HOW TO PLAY</h1>
                <div className="instruction-steps">
                  <div className="instruction-step glass-panel" style={{ animationDelay: "0.05s" }}>
                    <div className="step-icon">🖐️</div>
                    <p className="step-copy"><span className="step-num">1</span>Drag each piece from the tray onto the grid.</p>
                  </div>
                  <div className="instruction-step glass-panel" style={{ animationDelay: "0.15s" }}>
                    <div className="step-icon">🧩</div>
                    <p className="step-copy"><span className="step-num">2</span>Use the photo in the corner as your guide to place every tile.</p>
                  </div>
                  <div className="instruction-step glass-panel" style={{ animationDelay: "0.25s" }}>
                    <div className="step-icon">⏱️</div>
                    <p className="step-copy"><span className="step-num">3</span><span className="highlight">You've got 1 minute</span> — complete it before time runs out!</p>
                  </div>
                </div>
                <button className="primary-btn huge-btn" onClick={initGame}>PLAY NOW</button>
              </motion.div>
            )}

            {gameState === "GAME" && (
              <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="screen-container justify-top">
                <header className="top-bar">
                  <div className="logo-container">
                    <h1 className="title-text">
                      <span className="encare">ENCARE</span><br />
                      <span className="puzzle">PUZZLE</span>
                    </h1>
                  </div>
                  <div className="reference-image glass-panel">
                    <img src={PUZZLE_IMAGE_URL} alt="Reference puzzle photo" draggable={false} />
                  </div>
                </header>

                <div className="timer-bar glass-panel">
                  <h2>TIME LEFT: <span className={timeLeft <= 10 ? "time-low" : ""}>{formatTime(timeLeft)}</span></h2>
                </div>

                <div className="puzzle-board glass-panel">
                  <div className="grid">
                    {gridPieces.map((piece, index) => {
                      const isCorrect = piece !== null && piece === index;
                      const isHovered = hoverIndex === index;
                      const isBeingDragged = ghost && ghost.pieceId === piece;
                      return (
                        <div
                          key={`grid-${index}`}
                          data-index={index}
                          className={`grid-cell${isHovered ? " drag-hover" : ""}${isCorrect ? " correct-cell" : ""}`}
                        >
                          {piece !== null && (
                            <div
                              className={`puzzle-piece${isCorrect ? " correct-piece" : ""}${isBeingDragged ? " is-dragging-source" : ""}`}
                              onPointerDown={(e) => handlePointerDown(e, piece, index.toString())}
                              style={{
                                backgroundImage: `url('${PUZZLE_IMAGE_URL}')`,
                                backgroundPosition: bgPosFor(piece),
                                backgroundSize: "500% 500%",
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={`bottom-tray glass-panel${hoverTray ? " drag-hover" : ""}`}>
                  {trayPieces.map((piece) => {
                    const isBeingDragged = ghost && ghost.pieceId === piece;
                    return (
                      <div
                        key={`tray-${piece}`}
                        className={`puzzle-piece in-tray${isBeingDragged ? " is-dragging-source" : ""}`}
                        onPointerDown={(e) => handlePointerDown(e, piece, "tray")}
                        style={{
                          backgroundImage: `url('${PUZZLE_IMAGE_URL}')`,
                          backgroundPosition: bgPosFor(piece),
                          backgroundSize: "500% 500%",
                        }}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}

            {gameState === "SCORE" && (
              <motion.div key="score" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="screen-container">
                <div className="score-box glass-panel">
                  <h2>YOUR SCORE</h2>
                  <h1 className="score-percentage">{scoreData.percentage}%</h1>
                  <p className="score-message">{scoreData.message}</p>
                </div>
                {scoreData.isHero && <div className="mascot-display mascot-jump" style={{ backgroundImage: `url('${MASCOT_IMAGE_URL}')` }}></div>}
                <button className="primary-btn huge-btn" onClick={() => setGameState("FINAL")}>CONTINUE</button>
              </motion.div>
            )}

            {gameState === "FINAL" && (
              <motion.div key="final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="screen-container">
                <h1 className="main-title">Thank you<br />for playing!</h1>
                <div className="mascot-display" style={{ backgroundImage: `url('${MASCOT_IMAGE_URL}')` }}></div>
                <div className="slogan-box">
                  <h2 className="slogan">Clean Spaces, Happy Pets.</h2>
                  <h3 className="encare-logo">ENCARE</h3>
                </div>
                <button className="primary-btn huge-btn" onClick={() => setGameState("WELCOME")}>PLAY AGAIN</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Drag ghost: follows the pointer/finger and renders above everything else */}
        {ghost && (
          <div
            className="drag-ghost"
            style={{
              left: ghost.x - ghost.offsetX,
              top: ghost.y - ghost.offsetY,
              width: ghost.width,
              height: ghost.height,
              backgroundImage: `url('${PUZZLE_IMAGE_URL}')`,
              backgroundPosition: bgPosFor(ghost.pieceId),
              backgroundSize: "500% 500%",
            }}
          />
        )}
      </div>
    </div>
  );
};

export default PuzzleGame;
