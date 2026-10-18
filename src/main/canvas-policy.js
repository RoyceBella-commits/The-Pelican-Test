// Loaded as a classic script before anything else (film.html, index.html).
// Chrome may GPU-accelerate a 2D canvas or move it to the CPU at runtime, and the
// two paths rasterise blurs and anti-aliasing slightly differently. Frames are rendered
// by several workers, so that would make consecutive frames flicker and break the
// determinism check. Force every 2D context onto the CPU path (willReadFrequently).
(function () {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (type === '2d') opts = Object.assign({}, opts || {}, { willReadFrequently: true });
    return orig.call(this, type, opts);
  };
})();
