/**
 * @file playArea.js
 * @description Shared responsive layout and coordinate utilities for Project Alpha Plus.
 * Defines a square playfield whose side length equals the smaller dimension of the
 * available window, keeping it centered and fitting within the window without overflow.
 * Provides consistent coordinate conversion between screen space and normalized square
 * coordinates [0, 1], and scales note dimensions (standard big note diameter = 10%
 * of square side length, small ball diameter = 75% of big ball).
 */

class PlayArea {
  /**
   * Computes square play area metrics for given viewport width and height.
   * Side length equals the smaller dimension of the available window.
   * @param {number} [viewportWidth]
   * @param {number} [viewportHeight]
   * @returns {Object}
   */
  static getMetrics(viewportWidth, viewportHeight) {
    const w = typeof viewportWidth === "number" && viewportWidth > 0
      ? viewportWidth
      : (typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 1000);
    const h = typeof viewportHeight === "number" && viewportHeight > 0
      ? viewportHeight
      : (typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 1000);

    // Play area is a square whose side length equals the smaller dimension
    const size = Math.min(w, h);
    const offsetX = (w - size) / 2;
    const offsetY = (h - size) / 2;

    // Standard note diameter = 10% of the square's side length
    const bigDiameter = size * 0.10;
    const bigRadius = bigDiameter / 2; // 5% of square side length
    const noteRadius = bigRadius;

    // Triangle bomb note circumradius (matches standard note size)
    const triangleRadius = bigRadius * 1.05;

    // Proportional player orb radius
    const orbRadius = bigRadius * 0.88;

    return {
      viewportWidth: w,
      viewportHeight: h,
      size,
      offsetX,
      offsetY,
      bigDiameter,
      bigRadius,
      noteRadius,
      triangleRadius,
      orbRadius,

      /**
       * Converts screen / canvas pixel X to normalized local coordinate [0, 1] within the square.
       * @param {number} screenX
       * @returns {number}
       */
      toLocalX(screenX) {
        return size > 0 ? (screenX - offsetX) / size : 0.5;
      },

      /**
       * Converts screen / canvas pixel Y to normalized local coordinate [0, 1] within the square.
       * @param {number} screenY
       * @returns {number}
       */
      toLocalY(screenY) {
        return size > 0 ? (screenY - offsetY) / size : 0.5;
      },

      /**
       * Converts normalized local coordinate X [0, 1] to screen / canvas pixel X.
       * @param {number} normalizedX
       * @returns {number}
       */
      toScreenX(normalizedX) {
        const num = typeof normalizedX === "number" ? normalizedX : parseFloat(normalizedX || 0.5);
        return offsetX + num * size;
      },

      /**
       * Converts normalized local coordinate Y [0, 1] to screen / canvas pixel Y.
       * @param {number} normalizedY
       * @returns {number}
       */
      toScreenY(normalizedY) {
        const num = typeof normalizedY === "number" ? normalizedY : parseFloat(normalizedY || 0.5);
        return offsetY + num * size;
      },

      /**
       * Clamps normalized coordinate safely within square arena bounds [0.06, 0.94].
       * @param {number} val
       * @returns {number}
       */
      clampNormalized(val) {
        const num = typeof val === "number" ? val : parseFloat(val);
        const safe = isNaN(num) ? 0.5 : num;
        return Math.max(0.06, Math.min(0.94, parseFloat(safe.toFixed(3))));
      },

      /**
       * Checks whether a point in screen pixels is within the square play area.
       * @param {number} screenX
       * @param {number} screenY
       * @returns {boolean}
       */
      containsPoint(screenX, screenY) {
        return (
          screenX >= offsetX &&
          screenX <= offsetX + size &&
          screenY >= offsetY &&
          screenY <= offsetY + size
        );
      }
    };
  }
}

// Expose to window / global
if (typeof window !== "undefined") {
  window.PlayArea = PlayArea;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = PlayArea;
}
