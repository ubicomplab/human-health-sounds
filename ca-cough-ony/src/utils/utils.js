import * as C from "./visualization-config";

// Returns whether the data point is in the filters
export const checkFilters = (data, filters) => {
  const activeFilters = filters.filter(f => f.active).map(f => f.name);
  if (activeFilters.length === 0) return true;
  if (!data) return false;

  return activeFilters.every((f) => {
    if (f === data.gender || f.toLowerCase() === data.sound_type.toLowerCase()) return true;

    const ageLabel = f.replace("Age: ", "");
    const range = C.AGE_RANGES.find((r) => r.label === ageLabel);
    if (range) {
      const ageNum = Number(data.age);
      return ageNum >= range.min && ageNum <= range.max;
    }
    return false;
  });
};

// Used for darkening the border color relative to the fill color
export function darkenColor(hex, amount = 0.25) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.max(0, Math.min(255, r * (1 - amount)));
  g = Math.max(0, Math.min(255, g * (1 - amount)));
  b = Math.max(0, Math.min(255, b * (1 - amount)));

  return `rgb(${r}, ${g}, ${b})`;
}

// Computes the panning direction of cursor relative to center
export function getPanVector(clientX, clientY, rect) {
  const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Distance from center
    const dx = clientX - centerX;
    const dy = clientY - centerY;

    const mag = Math.sqrt(dx*dx + dy*dy);
    if (mag === 0) return { vx: 0, vy: 0 };

    // Normalize
    return { vx: dx / mag, vy: dy / mag };
}

// Returns if cursor is close to all of the four edges
export function getAxisPanIntent(e, rect, threshold) {
  return {
    nearLeft:   e.clientX < rect.left + (threshold),
    nearRight:  e.clientX > rect.right - (threshold),
    nearTop:    e.clientY < rect.top + (threshold),
    nearBottom: e.clientY > rect.bottom - threshold
  };
}

export function findNearestValidCell(startX, startY, currentFilters, dataJson) {
    // Check the start cell first
    const key = `${startX}_${C.GRID_SIZE - 1 - startY}`;
    const data = dataJson[key];
    if (data && checkFilters(data, currentFilters, C.AGE_RANGES)) {
        return { x: startX, y: startY };
    }

    // Spiral search outwards
    for (let r = 1; r < C.GRID_SIZE / 2; r++) { // r is the radius/distance
        // Check the boundary of the square defined by radius r
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                // Only check the cells on the square's perimeter for this radius
                if (Math.abs(dx) === r || Math.abs(dy) === r) {
                    const x = startX + dx;
                    const y = startY + dy;

                    if (x >= 0 && x < C.GRID_SIZE && y >= 0 && y < C.GRID_SIZE) {
                        const cellKey = `${x}_${C.GRID_SIZE - 1 - y}`;
                        const cellData = dataJson[cellKey];

                        // Check if cell exists and passes filters
                        if (cellData && checkFilters(cellData, currentFilters, C.AGE_RANGES)) {
                            return { x, y }; // Found the nearest valid cell
                        }
                    }
                }
            }
        }
    }

    return null; // No valid cell found within the search limit
};

export function calculateCenterTransform(scale, targetX, targetY, canvasRef) {
    if (!canvasRef.current) return { translateX: 0, translateY: 0 };

    const screenCenterX = canvasRef.current.clientWidth / 2;
    const screenCenterY = canvasRef.current.clientHeight / 2;

    const cellCenterX = (targetX * C.CELL_SIZE) + C.CELL_SIZE / 2;
    const cellCenterY = (targetY * C.CELL_SIZE) + C.CELL_SIZE / 2;

    const newTranslateX = screenCenterX - (cellCenterX * scale);
    const newTranslateY = screenCenterY - (cellCenterY * scale);

    return { translateX: newTranslateX, translateY: newTranslateY };
  };

export function clampPanToGrid(vx, vy, selX, selY) {
  let cx = vx, cy = vy;

  // Right, left, bottom, top boundaries
  if((selX === C.GRID_SIZE - 1 && vx > 0) || (selX === 0 && vx < 0) || (selY === C.GRID_SIZE - 1 && vy > 0) || (selY === 0 && vy < 0)) {
    cx = 0;
    cy = 0;
  }

  return { vx: cx, vy: cy };
}