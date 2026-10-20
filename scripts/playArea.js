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
   * @param {number} [margin=0] - Optional safety margin to inset the square arena
   * @returns {Object}
   */
  static getMetrics(viewportWidth, viewportHeight, margin = 0) {
    const w = typeof viewportWidth === "number" && viewportWidth > 0
      ? viewportWidth
      : (typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 1000);
    const h = typeof viewportHeight === "number" && viewportHeight > 0
      ? viewportHeight
      : (typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 1000);

    const safeMargin = typeof margin === "number" && margin >= 0 ? margin : 0;
    const availW = Math.max(50, w - safeMargin * 2);
    const availH = Math.max(50, h - safeMargin * 2);

    // Play area is a square whose side length equals the smaller dimension
    const size = Math.min(availW, availH);
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

  /**
   * Draws a background image or video inside the square play area.
   * Supports 'cover' and 'contain' fit modes and custom opacity.
   * Strictly clips rendering inside the square area bounds [ox, oy, size, size].
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLImageElement|HTMLVideoElement} media
   * @param {number} ox
   * @param {number} oy
   * @param {number} size
   * @param {"cover"|"contain"} [fit="cover"]
   * @param {number} [opacity=0.7]
   */
  static drawBackgroundMedia(ctx, media, ox, oy, size, fit = "cover", opacity = 0.7) {
    if (!ctx || !media || size <= 0) return;

    const mw = media.naturalWidth || media.videoWidth || media.width || 0;
    const mh = media.naturalHeight || media.videoHeight || media.height || 0;
    if (mw <= 0 || mh <= 0) return;

    const mediaAspect = mw / mh;
    let drawX = ox;
    let drawY = oy;
    let drawW = size;
    let drawH = size;

    if (fit === "contain") {
      // Entire media is visible inside square without cropping
      if (mediaAspect > 1) {
        drawW = size;
        drawH = size / mediaAspect;
        drawX = ox;
        drawY = oy + (size - drawH) / 2;
      } else {
        drawH = size;
        drawW = size * mediaAspect;
        drawX = ox + (size - drawW) / 2;
        drawY = oy;
      }
    } else {
      // 'cover': fills entire square area, cropped if needed
      if (mediaAspect > 1) {
        drawH = size;
        drawW = size * mediaAspect;
        drawX = ox - (drawW - size) / 2;
        drawY = oy;
      } else {
        drawW = size;
        drawH = size / mediaAspect;
        drawX = ox;
        drawY = oy - (drawH - size) / 2;
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, size, size);
    ctx.clip(); // Strictly clips to the square play area

    ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
    try {
      ctx.drawImage(media, drawX, drawY, drawW, drawH);
    } catch (e) {
      // Ignore drawImage errors (e.g. video loading)
    }
    ctx.restore();
  }
}

// Expose to window / global
if (typeof window !== "undefined") {
  window.PlayArea = PlayArea;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = PlayArea;
}
