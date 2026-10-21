(function () {
  function isTouchDevice() {
    return window.matchMedia("(hover: none), (pointer: coarse)").matches;
  }

  function readParams() {
    return new URLSearchParams(window.location.search);
  }

  function stripLayoutParams() {
    var params = readParams();
    if (!params.has("veny_layout") && !params.has("veny_r")) return;
    params.delete("veny_layout");
    params.delete("veny_r");
    var query = params.toString();
    var next = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
    window.history.replaceState({}, "", next);
  }

  var PINCH_DISABLED_VIEWPORT =
    "width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

  function ensurePinchDisabledViewport(useNarrowWidth) {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    if (useNarrowWidth) {
      var narrow = Math.min(window.screen.width, window.screen.height);
      if (narrow > 0 && narrow < 768) {
        meta.setAttribute(
          "content",
          "width=" +
            narrow +
            ", initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
        );
        return;
      }
    }
    meta.setAttribute("content", PINCH_DISABLED_VIEWPORT);
  }

  /** S24·S25 등 기기별 차이: viewport만으로 부족할 때 멀티터치 핀치 차단 */
  function blockPinchZoomGestures() {
    var stopMultiTouch = function (e) {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchstart", stopMultiTouch, { passive: false, capture: true });
    document.addEventListener("touchmove", stopMultiTouch, { passive: false, capture: true });
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (name) {
      document.addEventListener(
        name,
        function (e) {
          e.preventDefault();
        },
        { passive: false, capture: true },
      );
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        if (window.visualViewport.scale > 1.02) ensurePinchDisabledViewport(false);
      });
    }
  }

  if (!isTouchDevice()) return;

  try {
    sessionStorage.removeItem("veny_vp_narrow");
  } catch (_err) {}

  document.documentElement.classList.add("veny-touch-device");

  var params = readParams();
  var layoutDone = params.get("veny_r") === "1";
  var authReturn = params.get("veny_layout") === "1";

  if (authReturn && !layoutDone) {
    ensurePinchDisabledViewport(true);
    params.set("veny_r", "1");
    params.delete("veny_layout");
    var qs = params.toString();
    window.location.replace(window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
    return;
  }

  ensurePinchDisabledViewport(layoutDone);
  blockPinchZoomGestures();

  if (layoutDone) {
    stripLayoutParams();
  }

  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      window.location.reload();
    }
  });
})();
