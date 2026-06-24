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

  if (!isTouchDevice()) return;

  try {
    sessionStorage.removeItem("veny_vp_narrow");
  } catch (_err) {}

  document.documentElement.classList.add("veny-touch-device");

  var params = readParams();
  var layoutDone = params.get("veny_r") === "1";
  var authReturn = params.get("veny_layout") === "1";

  if (authReturn && !layoutDone) {
    var meta = document.querySelector('meta[name="viewport"]');
    var narrow = Math.min(window.screen.width, window.screen.height);
    if (meta && narrow > 0 && narrow < 768) {
      meta.setAttribute("content", "width=" + narrow + ", initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover");
    }
    params.set("veny_r", "1");
    params.delete("veny_layout");
    var qs = params.toString();
    window.location.replace(window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
    return;
  }

  if (layoutDone) {
    stripLayoutParams();
  }

  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      window.location.reload();
    }
  });
})();
