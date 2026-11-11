/* namax — scroll progress engine.
   Writes --p (0…1) and data-step on every [data-scene]; all movement lives in CSS.
   Without this script (or with reduced motion) the page is a plain readable column. */
(function () {
  'use strict';

  function clamp01(n) { return n > 0 ? (n > 1 ? 1 : n) : 0; }

  // Pinned scene (taller than the viewport, content sticks inside it).
  function sceneProgress(top, height, viewport) {
    var d = height - viewport;
    return d <= 0 ? 0 : clamp01(-top / d);
  }
  // Normal section leaving through the top of the viewport.
  function exitProgress(top, height) {
    return height <= 0 ? 0 : clamp01(-top / height);
  }
  // Normal section coming up from the bottom of the viewport.
  function enterProgress(top, height, viewport) {
    var d = Math.min(height, viewport);
    return d <= 0 ? 0 : clamp01((viewport - top) / d);
  }
  function stepOf(p, steps) {
    return Math.min(steps - 1, Math.floor(p * steps));
  }

  if (typeof document === 'undefined') {
    globalThis.__motion = {
      sceneProgress: sceneProgress, exitProgress: exitProgress,
      enterProgress: enterProgress, stepOf: stepOf
    };
    return;
  }

  var root = document.documentElement;
  root.classList.add('js');

  // Floating contact button hides while the hero or the final call to action is on screen.
  var dockBlockers = [document.getElementById('hero'), document.getElementById('contact')].filter(Boolean);
  if ('IntersectionObserver' in window && dockBlockers.length) {
    var onScreen = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) onScreen.add(e.target); else onScreen.delete(e.target);
      });
      root.classList.toggle('dock-hidden', onScreen.size > 0);
    }, { threshold: 0.25 });
    dockBlockers.forEach(function (el) { io.observe(el); });
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;
  root.classList.add('js-motion');

  var scenes = Array.prototype.map.call(document.querySelectorAll('[data-scene]'), function (el) {
    return {
      el: el,
      mode: el.getAttribute('data-scene') || 'pin',
      steps: parseInt(el.getAttribute('data-steps') || '1', 10),
      top: 0, height: 0, p: -1, step: -1
    };
  });
  var viewport = 0;
  var lastWidth = -1;
  var ticking = false;

  function measure() {
    var y = window.scrollY;
    viewport = window.innerHeight;
    lastWidth = window.innerWidth;
    scenes.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      s.top = r.top + y;
      s.height = r.height;
    });
  }

  function update() {
    ticking = false;
    var y = window.scrollY;
    scenes.forEach(function (s) {
      var top = s.top - y;
      var p = s.mode === 'exit' ? exitProgress(top, s.height)
            : s.mode === 'enter' ? enterProgress(top, s.height, viewport)
            : sceneProgress(top, s.height, viewport);
      p = Math.round(p * 1000) / 1000;
      if (p !== s.p) {
        s.p = p;
        s.el.style.setProperty('--p', p);
      }
      var step = stepOf(p, s.steps);
      if (step !== s.step) {
        s.step = step;
        s.el.setAttribute('data-step', step);
      }
    });
  }

  function requestUpdate() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  // Phone address bars change the height on every scroll; only a width change re-measures.
  window.addEventListener('resize', function () {
    if (window.innerWidth !== lastWidth) { measure(); requestUpdate(); }
  });
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('load', function () { measure(); requestUpdate(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); requestUpdate(); });
  }

  measure();
  update();
})();
