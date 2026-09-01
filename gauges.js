// ============================================================
// GAUGE VISUALS
// ------------------------------------------------------------
// Purely presentational. Watches the text content that app.js
// already writes into #currentTemp / #currentHum and animates
// the matching radial gauge arc. Does not touch AWS/MQTT logic.
// ============================================================

(function () {

  function setupGauge(gaugeEl) {

    const min = Number(gaugeEl.dataset.min);
    const max = Number(gaugeEl.dataset.max);
    const targetId = gaugeEl.dataset.target;
    const targetEl = document.getElementById(targetId);
    const fillPath = gaugeEl.querySelector(".gauge-fill");

    if (!targetEl || !fillPath) return;

    const arcLength = fillPath.getTotalLength();
    fillPath.style.strokeDasharray = `${arcLength}`;
    fillPath.style.strokeDashoffset = `${arcLength}`;

    function update() {
      const raw = Number(targetEl.textContent);

      if (!Number.isFinite(raw)) {
        fillPath.style.strokeDashoffset = `${arcLength}`;
        return;
      }

      const fraction = Math.min(1, Math.max(0, (raw - min) / (max - min)));
      fillPath.style.strokeDashoffset = `${arcLength * (1 - fraction)}`;
    }

    update();

    const observer = new MutationObserver(update);
    observer.observe(targetEl, { characterData: true, childList: true, subtree: true });
  }

  document.querySelectorAll(".gauge").forEach(setupGauge);

})();
