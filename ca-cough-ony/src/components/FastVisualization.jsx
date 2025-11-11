import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import dataJson from "../vocalsound_wav.json"; // change to .mp3 if need space
import SearchBar from "./SearchBar";
import LoadingScreen from "./LoadingSpinner";
import AboutButton from "./AboutButton";
import ZoomButton from "./ZoomButton";
import * as C from "../utils/visualization-config";
import { checkFilters, darkenColor, getAxisPanIntent, getPanVector, findNearestValidCell, calculateCenterTransform, clampPanToGrid } from "../utils/utils";

const SPRITESHEET_PATH = "precomposed_grid_32.png";
const CANVAS_DRAW_SIZE = C.GRID_SIZE * C.CELL_SIZE;
const masterAudioURL = "all_sounds_combined.wav";  // change to .mp3 if need space
const preloadedAudio = new Audio(masterAudioURL);
preloadedAudio.preload = "auto";

export default function FastVisualization({ handleClickAbout }) {
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const initialCenterIndex = Math.floor(C.GRID_SIZE / 2);
  const canvasRef = useRef()

  const spritesheetRef = useRef(null);
  const preRenderedGridRef = useRef(null);
  const [isGridReady, setIsGridReady] = useState(false);
  const [initialCenterApplied, setInitialCenterApplied] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [selected, setSelected] = useState({ x: initialCenterIndex, y: initialCenterIndex })
  const trailHighlightsRef = useRef([]);
  const isMouseDownRef = useRef(false);

  const [metadataPos, setMetadataPos] = useState({ left: 0, top: 0})

  const [filters, setFilters] = useState([]);
  const zoomIntervalRef = useRef(null);
  const smoothCenterTimeoutRef = useRef(null);
  const panDirectionRef = useRef({ dx: 0, dy: 0 });
  const isPanningRef = useRef(false);
  const lastPlayTimeRef = useRef(0);
  const [colorMode, setColorMode] = useState("None"); // "None", "Age", "Gender", "Sound Type"
  const [isControlPanelMinimized, setIsControlPanelMinimized] = useState(false);

  const lastMousePos = useRef({ x: 0, y: 0 });

  const [transform, setTransform] = useState({
    scale: C.MIN_SCALE,
    translateX: 0,
    translateY: 0,
  });

  // Loading the single spritesheet image
  useEffect(() => {
    setLoadingProgress(0);
    const img = new Image();
    img.onload = () => {
      spritesheetRef.current = img;
      setLoadingProgress(100);
    };
    img.onerror = (err) => {
      console.error("Failed to load spritesheet:", SPRITESHEET_PATH, err);
      setLoadingProgress(100);
    };
    img.src = SPRITESHEET_PATH;
  }, []);

  // Updates the Canvas size (initial loading) in case the user changes screen sizes
  useLayoutEffect(() => {
      // Check if the ref is available
      if (canvasRef.current) {
          const newWidth = canvasRef.current.clientWidth;
          const newHeight = canvasRef.current.clientHeight;

          // Only update if dimensions are non-zero AND if they are different from current state.
          // This prevents infinite loops if the browser reports 0,0 multiple times.
          if (newWidth > 0 && newHeight > 0 && (newWidth !== canvasSize.width || newHeight !== canvasSize.height)) {
              setCanvasSize({
                  width: newWidth,
                  height: newHeight,
              });
          }
      }
  }, [canvasSize.width, canvasSize.height]);

  // The transform for initializing the grid (want it to display zoomed in, in the center)
  useLayoutEffect(() => {
    if (spritesheetRef.current && !initialCenterApplied && canvasSize.width > 0) {
        const centerCellIndex = C.GRID_SIZE / 2;
        const { translateX, translateY } = calculateCenterTransform(C.INITIAL_SCALE, centerCellIndex, centerCellIndex, canvasRef);
        setTransform({
            scale: C.INITIAL_SCALE,
            translateX: translateX,
            translateY: translateY,
        });

        // Now that centering is applied, we mark it as done.
        setInitialCenterApplied(true);
    }
  }, [spritesheetRef.current, initialCenterApplied, canvasSize.width, canvasSize.height]);

  // Creates the grid upon initialization and changing the coloring
  // Now draws from spritesheet instead of many image objects.
  const compositeGrid = useCallback((currentFilters) => {
    const sheet = spritesheetRef.current;
    if (!sheet) return;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = CANVAS_DRAW_SIZE;
    offscreenCanvas.height = CANVAS_DRAW_SIZE;
    const context = offscreenCanvas.getContext("2d");
    // If want to make image sharper --> looks worse when zoomed out
    //context.imageSmoothingEnabled = false;

    context.fillStyle = "#fff";
    context.fillRect(0, 0, CANVAS_DRAW_SIZE, CANVAS_DRAW_SIZE);

    Object.keys(dataJson).forEach(key => {
      const [x, flippedY] = key.split("_").map(Number);
      const data = dataJson[key];
      const y = C.GRID_SIZE - 1 - flippedY;

      const matches = checkFilters(data, currentFilters, C.AGE_RANGES);

      const drawX = x * C.CELL_SIZE;
      const drawY = y * C.CELL_SIZE;

      if (matches) {
        // Source coordinates in spritesheet: x * CELL_SIZE, flippedY * CELL_SIZE
        const srcX = x * C.CELL_SIZE;
        const srcY = y * C.CELL_SIZE;
        context.drawImage(
          sheet,
          srcX, srcY,
          C.CELL_SIZE, C.CELL_SIZE,
          drawX, drawY,
          C.CELL_SIZE, C.CELL_SIZE
        );

        // Color overlay section
        let overlayColor = null;
        if (colorMode === "Age") overlayColor = C.AGE_COLORS(data.age);
        else if (colorMode === "Gender") overlayColor = C.GENDER_COLORS[data.gender];
        else if (colorMode === "Sound Type")
          overlayColor = C.SOUND_TYPE_STYLES[data.sound_type]?.color;

        if (overlayColor) {
          context.fillStyle = overlayColor + "33"; // Add transparency
          context.fillRect(drawX, drawY, C.CELL_SIZE, C.CELL_SIZE);

          const borderColor = darkenColor(overlayColor, 0.3);
          context.strokeStyle = borderColor;
          context.lineWidth = 0.25;
          context.strokeRect(drawX + 0.125, drawY + 0.125, C.CELL_SIZE - 0.25, C.CELL_SIZE - 0.25);
        }
      } else {
        context.fillStyle = "#f4f3ef";
        context.fillRect(drawX, drawY, C.CELL_SIZE, C.CELL_SIZE);
      }
    });

    preRenderedGridRef.current = offscreenCanvas;
    setIsGridReady(true);
  }, [colorMode]);

  // When filters change, have to create new grid
  useEffect(() => {
    if (spritesheetRef.current) {
      setIsGridReady(false);
      compositeGrid(filters);
    }
  }, [colorMode, filters, spritesheetRef.current, compositeGrid]);

  // Draws the Canvas. selection highlight now samples from spritesheet.
  useEffect(() => {
    const canvas = canvasRef.current;
    const preRenderedGrid = preRenderedGridRef.current;
    if (!canvas || !preRenderedGrid || !isGridReady) return;

    const context = canvas.getContext("2d");
    // If want to make image sharper --> looks worse when zoomed out
    //context.imageSmoothingEnabled = false;
    const { scale, translateX, translateY } = transform;
    const { x: selX, y: selY } = selected;

    const viewWidth = canvas.clientWidth;
    const viewHeight = canvas.clientHeight
    let animationFrameId;

    function drawDarkenedFromSpritesheet(sheet, srcX, srcY, x, y, size, gamma) {
      // Create a temporary canvas same size as the area you want to draw
      const tmp = document.createElement('canvas');
      tmp.width = size;
      tmp.height = size;
      const tctx = tmp.getContext('2d');

      // Draw the source cell scaled up to 'size'
      tctx.drawImage(sheet, srcX, srcY, C.CELL_SIZE, C.CELL_SIZE, 0, 0, size, size);

      const imgData = tctx.getImageData(0, 0, size, size);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const br = 0.299 * r + 0.587 * g + 0.114 * b;
        if (br === 0) continue;
        const newBr = 255 * Math.pow(br / 255, gamma);
        const scaleRatio = newBr / br;
        data[i]     = Math.max(0, Math.min(255, data[i] * scaleRatio));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * scaleRatio));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * scaleRatio));
      }

      // put adjusted pixels back and draw onto main canvas
      tctx.putImageData(imgData, 0, 0);
      context.drawImage(tmp, x, y);
    }

    const draw = () => {
      canvas.width = viewWidth;
      canvas.height = viewHeight;

      context.fillStyle = "#f4f3ef"; // Outside of grid is colored beige
      context.fillRect(0, 0, viewWidth, viewHeight);

      context.save();
      context.translate(translateX, translateY);
      context.scale(scale, scale);
      context.drawImage(preRenderedGrid, 0, 0);
      context.restore();

      const now = Date.now();

      const trails = trailHighlightsRef.current.filter(
      t => now - t.timestamp < C.TRAIL_FADE_MS
    );
      trailHighlightsRef.current = trails; // cleanup expired

    // Draw trails FIRST (below selection)
    trails.forEach(item => {
      const timePassed = now - item.timestamp;
      const alpha = 1 - (timePassed / C.TRAIL_FADE_MS);
      const cellDrawX = item.x * C.CELL_SIZE;
      const cellDrawY = item.y * C.CELL_SIZE;
      const screenX = cellDrawX * transform.scale + transform.translateX;
      const screenY = cellDrawY * transform.scale + transform.translateY;
      const size = C.CELL_SIZE * transform.scale;
      context.strokeStyle = `rgba(93, 173, 226, ${alpha})`;
      context.lineWidth = 1.5;
      context.strokeRect(screenX, screenY, size, size);
    });

      // Draw the Selection Highlight
      const key = `${selX}_${C.GRID_SIZE - 1 - selY}`;
      const selectedData = dataJson[key];

      if (selectedData && spritesheetRef.current) {
        const cellDrawX = selX * C.CELL_SIZE;
        const cellDrawY = selY * C.CELL_SIZE;

        const screenX = cellDrawX * scale + translateX;
        const screenY = cellDrawY * scale + translateY;

        const highlightSize = C.CELL_SIZE * 2;
        const highlightOffset = (highlightSize - C.CELL_SIZE * scale) / 2;
        let highlightDrawX = screenX - highlightOffset;
        let highlightDrawY = screenY - highlightOffset + C.CELL_SIZE * 8;

        setMetadataPos({ left: screenX + (C.CELL_SIZE * scale) / 2, top: highlightDrawY});

        if (screenX + highlightSize > 0 && screenY + highlightSize > 0 && screenX < viewWidth && screenY < viewHeight) {
          const highlightOffset = (highlightSize - C.CELL_SIZE * scale) / 2;

          highlightDrawX = screenX - highlightOffset;
          highlightDrawY = screenY - highlightOffset;

          context.fillStyle = "#d7ecff";
          context.strokeStyle = "#5dade2";
          context.lineWidth = 3.5;

          let overlayColor = null;
          if (colorMode === "Age") overlayColor = C.AGE_COLORS(selectedData.age);
          else if (colorMode === "Gender") overlayColor = C.GENDER_COLORS[selectedData.gender];
          else if (colorMode === "Sound Type")
            overlayColor = C.SOUND_TYPE_STYLES[selectedData.sound_type]?.color;

          if (overlayColor) {
            const borderColor = darkenColor(overlayColor, 0.3);
            context.strokeStyle = borderColor;
            context.strokeRect(highlightDrawX, highlightDrawY, highlightSize, highlightSize);
          } else {
            context.strokeStyle = "#5dade2";
            context.strokeRect(highlightDrawX, highlightDrawY, highlightSize, highlightSize);
          }

          // Draw the darkened/processed version sampled from spritesheet
          drawDarkenedFromSpritesheet(spritesheetRef.current, selX * C.CELL_SIZE, selY * C.CELL_SIZE, highlightDrawX, highlightDrawY, highlightSize, 4.0);

          context.fillStyle = 'rgba(215, 236, 255, 0.4)';
          context.fillRect(highlightDrawX, highlightDrawY, highlightSize, highlightSize);
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    // First call to start the drawing/animation loop
    draw();

    // Cleanup function to stop the animation when component unmounts or deps change
    return () => cancelAnimationFrame(animationFrameId);

  }, [transform, selected, isGridReady, colorMode]);

  // Computes the index of a cell given the client position
  const getCellCoordinates = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const { scale, translateX, translateY } = transform;
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const gridX_pre_scale = (canvasX - translateX) / scale;
    const gridY_pre_scale = (canvasY - translateY) / scale;
    const x = Math.floor(gridX_pre_scale / C.CELL_SIZE);
    const y = Math.floor(gridY_pre_scale / C.CELL_SIZE);
    return { x, y };
  }, [transform]);

  // Updates everything that changes when user selects a new cell
  const handleCellSelect = useCallback((x, y) => {

    // Clamps to the edges if selection is out of bounds
    let targetX = Math.max(0, Math.min(x, C.GRID_SIZE - 1));
    let targetY = Math.max(0, Math.min(y, C.GRID_SIZE - 1));

    const flippedY = C.GRID_SIZE - 1 - targetY;
    const key = `${targetX}_${flippedY}`;
    const selectedData = dataJson[key];
    const isCursorCellValid = selectedData && checkFilters(selectedData, filters, C.AGE_RANGES);

    if (!isCursorCellValid) {
        // If the cursor cell is NOT valid, find the nearest valid one
        const nearestCell = findNearestValidCell(x, y, filters, dataJson);

        if (!nearestCell) {
            // No nearby valid cell found, do nothing (i.e., stay on the current selection)
            return;
        }

        // Snap the selection to the nearest valid cell
        targetX = nearestCell.x;
        targetY = nearestCell.y;
    }

    // Retrieve the data for the target cell
    const targetFlippedY = C.GRID_SIZE - 1 - targetY;
    const targetKey = `${targetX}_${targetFlippedY}`;
    const finalSelectedData = dataJson[targetKey];

    // Safety check (should always pass if logic is correct)
    if (!finalSelectedData) return;

    // Update the selection and play the audio
    setSelected({ x: targetX, y: targetY });

    // Playback helper that creates a new instance each time
    function playClip(start, end) {
      const audio = new Audio(preloadedAudio.src);
      audio.currentTime = start;
      audio.play().catch(() => {});

      // Introduce a small safety margin before the end time
      const stopTime = end - 0.08;

      const stopCheck = () => {
        // If the current time is at or past the adjusted stop time, pause and clean up.
        if (audio.currentTime >= stopTime) {
          audio.pause();
          audio.removeEventListener("timeupdate", stopCheck);
        }
      };

      // Add a single-shot timer as a fallback/redundancy for maximum safety
      const maxDuration = (end - start) * 1000; // Duration in milliseconds
      const timeoutId = setTimeout(() => {
        audio.pause();
        audio.removeEventListener("timeupdate", stopCheck);
      }, maxDuration + 100); // 100ms grace period

      audio.addEventListener("timeupdate", stopCheck);

      // Cleanup for the timeout if stopCheck fires first
      audio.addEventListener("pause", () => clearTimeout(timeoutId));
    }

    // --- Throttle check (unchanged) ---
    const now = Date.now();
    if (now - lastPlayTimeRef.current < C.MIN_PLAY_INTERVAL_MS) {
      return;
    }

    // --- Trail highlight (unchanged) ---
    const oldKey = `${selected.x}_${C.GRID_SIZE - 1 - selected.y}`;
    if (dataJson[oldKey]) {
      trailHighlightsRef.current.push({
        x: selected.x,
        y: selected.y,
        timestamp: now
      });
    }

    const changedSelect = (selected.x != targetX || selected.y != targetY);

    if (changedSelect) {
      lastPlayTimeRef.current = now;
      const { start_time, end_time } = finalSelectedData;
      playClip(start_time, end_time);
    }

  }, [selected.x, selected.y, filters]);

  // When user holding their mouse moves along the grid
  const handleCanvasMouseMove = useCallback((e) => {
    if (!isMouseDownRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    const threshold = 10 * transform.scale + 110
    const edges = getAxisPanIntent(e, rect, threshold);

    // compute raw direction
    const { vx, vy } = getPanVector(e.clientX, e.clientY, rect);

    // allow panning only if near that edge AND direction matches that axis
    let px = 0, py = 0;

    if (edges.nearRight && vx > 0) px = vx;
    if (edges.nearLeft  && vx < 0) px = vx;
    if (edges.nearBottom && vy > 0) py = vy;
    if (edges.nearTop    && vy < 0) py = vy;

    panDirectionRef.current = { vx: px, vy: py };
    isPanningRef.current = (px !== 0 || py !== 0);

    // still do your cell selection
    const { x, y } = getCellCoordinates(e);
    handleCellSelect(x, y);
  }, [getCellCoordinates, handleCellSelect, transform.scale]);

  const handleMouseDown = useCallback((e) => {
    isMouseDownRef.current = true;
    handleCanvasMouseMove(e);
  }, [handleCanvasMouseMove]);

  const handleMouseUp = useCallback(() => {
    isMouseDownRef.current = false;
    isPanningRef.current = false;
  }, []);

  useEffect(() => {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  useEffect(() => {
  let rafId;

  const panLoop = () => {
    if (isPanningRef.current) {
      const { vx, vy } = panDirectionRef.current;

      const { vx: cx, vy: cy } = clampPanToGrid(vx, vy, selected.x, selected.y);

      if (cx !== 0 || cy !== 0) {
        setTransform(prev => ({
          ...prev,
          translateX: prev.translateX - cx * C.PAN_SPEED,
          translateY: prev.translateY - cy * C.PAN_SPEED
        }));

        const fakeEvent = {
          clientX: lastMousePos.current.x,
          clientY: lastMousePos.current.y
        };
        handleCellSelect(...Object.values(getCellCoordinates(fakeEvent)));
      } else {
        isPanningRef.current = false;
      }
    }

    rafId = requestAnimationFrame(panLoop);
  };

  rafId = requestAnimationFrame(panLoop);
  return () => cancelAnimationFrame(rafId);
}, [getCellCoordinates, handleCellSelect, selected.x, selected.y]);

  // When zoom out enough, can be off-centered, so added this function to align to center
  const animateToCenter = useCallback(() => {
    // Target is the grid center at C.MIN_SCALE
    const targetTransform = calculateCenterTransform(C.MIN_SCALE, C.GRID_SIZE / 2, C.GRID_SIZE / 2, canvasRef);

    setTransform(prevTransform => {
        const { scale, translateX, translateY } = prevTransform;
        const diffX = targetTransform.translateX - translateX;
        const diffY = targetTransform.translateY - translateY;

        if (Math.abs(diffX) < 1 && Math.abs(diffY) < 1) {
            // When you get close, just lock to center
            if (smoothCenterTimeoutRef.current) clearTimeout(smoothCenterTimeoutRef.current);
            smoothCenterTimeoutRef.current = null;
            return { scale, ...targetTransform };
        }

        const newTranslateX = translateX + diffX * C.CENTER_SMOOTHING_FACTOR;
        const newTranslateY = translateY + diffY * C.CENTER_SMOOTHING_FACTOR;

        smoothCenterTimeoutRef.current = setTimeout(animateToCenter, 16);

        return {
            scale: scale,
            translateX: newTranslateX,
            translateY: newTranslateY,
        };
    });
  }, []);

  const applyZoom = useCallback((direction, factor) => {
    setTransform(prevTransform => {
      const { scale: oldScale, translateX: oldTX, translateY: oldTY } = prevTransform;
      let newScale = oldScale;

      if (smoothCenterTimeoutRef.current) {
          clearTimeout(smoothCenterTimeoutRef.current);
          smoothCenterTimeoutRef.current = null;
      }

      const shouldZoomOut = direction === 'out';

      if (shouldZoomOut) {
          if (oldScale <= C.MIN_SCALE) {
              // PHASE 2: Hit C.MIN_SCALE, start smooth center snap
              if (smoothCenterTimeoutRef.current === null) {
                  smoothCenterTimeoutRef.current = setTimeout(animateToCenter, 10);
              }
              return prevTransform;
          }
          // PHASE 1: Zoom out, keeping current cell fixed
          newScale = Math.max(oldScale / factor, C.MIN_SCALE);
      } else {
          // PHASE 1: Zoom in, keeping current cell fixed
          newScale = Math.min(oldScale * factor, C.MAX_SCALE);
      }

      if (newScale === oldScale) return prevTransform;

      // Calculate selected cell's center in grid space
      const cellCenterX = (selected.x * C.CELL_SIZE) + C.CELL_SIZE / 2;
      const cellCenterY = (selected.y * C.CELL_SIZE) + C.CELL_SIZE / 2;

      // Calculate the selected point's current screen position (PX, PY)
      const PX = cellCenterX * oldScale + oldTX;
      const PY = cellCenterY * oldScale + oldTY;

      // New translation to keep PX, PY fixed on screen after scale change
      const newTranslateX = PX - (cellCenterX * newScale);
      const newTranslateY = PY - (cellCenterY * newScale);

      return {
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY,
      };
    });
  }, [selected.x, selected.y, animateToCenter]);

  const startZoom = useCallback((direction) => {
      if (zoomIntervalRef.current) clearInterval(zoomIntervalRef.current);
      zoomIntervalRef.current = setInterval(() => {
          applyZoom(direction, C.ZOOM_FACTOR);
      }, 10);
  }, [applyZoom]);

  const stopZoom = useCallback(() => {
      if (zoomIntervalRef.current) {
          clearInterval(zoomIntervalRef.current);
          zoomIntervalRef.current = null;
      }
  }, []);

  const handleZoomInStart = () => startZoom('in');
  const handleZoomOutStart = () => startZoom('out');

  const handleWheel = useCallback((e) => {
    if (!isGridReady) return;
    const direction = e.deltaY < 0 ? 'in' : 'out';
    applyZoom(direction, C.WHEEL_ZOOM_FACTOR);
  }, [isGridReady, applyZoom]);

  useEffect(() => {
    window.addEventListener('mouseup', stopZoom);
    return () => {
        window.removeEventListener('mouseup', stopZoom);
        if (smoothCenterTimeoutRef.current) clearTimeout(smoothCenterTimeoutRef.current);
    }
  }, [stopZoom]);

  const key = `${selected.x}_${C.GRID_SIZE - 1 - selected.y}`;
  const selectedData = dataJson[key];

  // This transform is used to determine if the zoom-out button should be disabled
  const fullCenterTransform = calculateCenterTransform(C.MIN_SCALE, C.GRID_SIZE / 2, C.GRID_SIZE / 2, canvasRef);
  const isPerfectlyCentered =
    transform.scale === C.MIN_SCALE &&
    Math.abs(transform.translateX - fullCenterTransform.translateX) < 1 &&
    Math.abs(transform.translateY - fullCenterTransform.translateY) < 1;

  return (
    <div className="min-h-screen bg-[#f4f3ef] flex flex-col items-center justify-center font-[Poppins,sans-serif]">
      <div className="fixed inset-0" style={{ pointerEvents: isGridReady ? 'auto' : 'none' }}>
        <canvas
          id="grid"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onWheel={handleWheel}
          style={{
            opacity: (isGridReady && initialCenterApplied) ? 1 : 0,
            transition: 'opacity 0.3s ease-in',
            cursor: isMouseDownRef.current ? 'grabbing' : 'pointer',
            width: '100%',
            height: '100%',
          }}
        ></canvas>
        {(!isGridReady && !initialCenterApplied ) && (
          <div
          className={`fixed inset-0 transition-opacity duration-500 ${
            isGridReady && initialCenterApplied ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          >
            <LoadingScreen />
          </div>
          )}

        {selectedData && isGridReady && (
          <div
            className="absolute bg-white border border-gray-300 rounded-lg shadow-md px-3 py-2 text-xs pointer-events-none z-10 flex items-center justify-between"
            style={{
              left: metadataPos.left,
              top: metadataPos.top,
              transform: `translate(-50%, calc(-100% - ${C.CELL_SIZE * 8 + 10}px))`,
              minWidth: 130,
            }}
          >
            <div className="flex flex-col leading-tight">
              <div className="flex items-center space-x-2 text-base">
                <span className="font-bold text-black">{selectedData.id}</span>
                <span
                  style={{
                    color: C.SOUND_TYPE_STYLES[selectedData.sound_type]?.color || "#555",
                    fontWeight: 600,
                  }}
                >
                  {selectedData.sound_type}
                </span>
              </div>
              <div className="flex items-center space-x-1 mt-1">
                <span
                  style={{
                    color: C.GENDER_COLORS[selectedData.gender] || "#555",
                    fontWeight: 600,
                  }}
                >
                  {selectedData.gender}
                </span>
                <span
                  style={{
                    color: C.AGE_COLORS(selectedData.age),
                    fontWeight: 600,
                  }}
                >
                  {selectedData.age}
                </span >
              </div>
            </div>
            <div className="ml-2 text-2xl">
              {C.SOUND_TYPE_STYLES[selectedData.sound_type]?.emoji || "🎧"}
            </div>
          </div>
        )}
      </div>

      {selectedData && isGridReady && (<div>
        <div className="fixed top-6 right-6 z-20">
        <AboutButton handleClick={handleClickAbout}>
          ?
        </AboutButton>
        </div>

        <div className="fixed bottom-6 right-6 z-20 flex flex-col items-center space-y-4">
          <ZoomButton
            onMouseDown={handleZoomInStart}
            onMouseUp={stopZoom}
            onMouseLeave={stopZoom}
            disabled={transform.scale >= C.MAX_SCALE}
          >
            +
          </ZoomButton>
          <ZoomButton
            onMouseDown={handleZoomOutStart}
            onMouseUp={stopZoom}
            onMouseLeave={stopZoom}
            disabled={isPerfectlyCentered}
          >
            &minus;
          </ZoomButton>
        </div>

        <div className="fixed top-6 left-6 z-20">
          <SearchBar
            filters={filters}
            setFilters={setFilters}
          />
        </div>

        <div
          className={`fixed bottom-0 left-6 z-20 bg-white border border-gray-300 rounded-t-lg shadow-2xl p-3 transform transition-transform duration-300 ease-in-out ${
            isControlPanelMinimized ? 'translate-y-[calc(100%-50px)]' : 'translate-y-0 bottom-6'
          }`}
          style={{
            bottom: isControlPanelMinimized ? '0' : '24px',
            maxHeight: '400px',
          }}
        >
          <div className="flex items-start justify-between">
            {/* Control Group - Always Visible (even when minimized) */}
            <div className="flex items-center">
              <label className="text-sm font-semibold mr-2">Color by:</label>
              <select
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                // Disable select when minimized, so the click restores it
                //disabled={isControlPanelMinimized}
                onClick={isControlPanelMinimized ? () => setIsControlPanelMinimized(false) : undefined}
              >
                <option value="None">None</option>
                <option value="Age">Age</option>
                <option value="Gender">Gender</option>
                <option value="Sound Type">Sound Type</option>
              </select>
            </div>

            {/* Minimize/Restore Button */}
            <button
              onClick={() => setIsControlPanelMinimized(prev => !prev)}
              className="ml-4 p-1 rounded-full hover:bg-gray-100 transition-colors focus:outline-none"
              title={isControlPanelMinimized ? "Restore Panel" : "Minimize Panel"}
            >
              <span className="text-lg leading-none">
                {isControlPanelMinimized ? '▲' : '▼'}
              </span>
            </button>
          </div>

          {/* Dynamic legend - Conditionally rendered/styled to be hidden when minimized */}
          {!isControlPanelMinimized && colorMode !== "None" && (
            <div className="mt-2 space-y-1 text-xs">
              {colorMode === "Age" &&
                Object.entries(C.AGE_RANGE_TO_COLOR).map(([range, color]) => (
                  <div key={range} className="flex items-center space-x-2">
                    <span
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: color }}
                    ></span>
                    <span>{range}</span>
                  </div>
                ))}

              {colorMode === "Gender" &&
                Object.entries(C.GENDER_COLORS).map(([gender, color]) => (
                  <div key={gender} className="flex items-center space-x-2">
                    <span
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: color }}
                    ></span>
                    <span>{gender}</span>
                  </div>
                ))}

              {colorMode === "Sound Type" &&
                Object.entries(C.SOUND_TYPE_STYLES).map(([type, { color }]) => (
                  <div key={type} className="flex items-center space-x-2">
                    <span
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: color }}
                    ></span>
                    <span>{type}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>)}
    </div>
  );
}
