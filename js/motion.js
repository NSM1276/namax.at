/* namax — scroll progress engine.
   Writes data-step on every [data-scene] (and --p on the hero); all movement lives in CSS.
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
  // Scenes that show one thing per equal slice of the scroll.
  function stepOf(p, steps) {
    return Math.min(steps - 1, Math.floor(p * steps));
  }
  // Stacked cards: card k is fully on top at p = k / (steps - 1).
  function stackStep(p, steps) {
    return steps <= 1 ? 0 : Math.round(p * (steps - 1));
  }
  // Pinned content taller than its box would be clipped, so that scene must not be pinned.
  function needsUnpin(contentHeight, boxHeight) {
    return contentHeight > boxHeight + 1;
  }

  if (typeof document === 'undefined') {
    globalThis.__motion = {
      sceneProgress: sceneProgress, exitProgress: exitProgress, enterProgress: enterProgress,
      stepOf: stepOf, stackStep: stackStep, needsUnpin: needsUnpin
    };
    return;
  }

  var root = document.documentElement;
  root.classList.add('js');

  // Floating contact button hides wherever the page already shows its own WhatsApp button:
  // the hero, the chat (whose last message is the button) and the final call to action.
  var dockBlockers = ['hero', 'how', 'contact']
    .map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if ('IntersectionObserver' in window && dockBlockers.length) {
    root.classList.add('dock-hidden'); // the page opens on the hero
    var onScreen = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) onScreen.add(e.target); else onScreen.delete(e.target);
      });
      root.classList.toggle('dock-hidden', onScreen.size > 0);
    }, { rootMargin: '-35% 0px -35% 0px' });
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
      boxes: el.querySelectorAll('.scene-pin, .svc'),
      top: 0, height: 0, p: -1, step: -1
    };
  });
  var viewport = 0;
  var lastWidth = -1;
  var ticking = false;

  // A scene is pinned only if everything in it fits on this screen; otherwise it gets
  // .no-pin and reads as a normal section (small phones, landscape, enlarged text).
  function fitScenes() {
    scenes.forEach(function (s) {
      if (!s.boxes.length) return;
      s.el.classList.remove('no-pin');
      var over = false;
      for (var i = 0; i < s.boxes.length && !over; i++) {
        var box = s.boxes[i];
        var content = box.firstElementChild;
        if (content && needsUnpin(content.offsetHeight, box.clientHeight)) over = true;
      }
      if (over) s.el.classList.add('no-pin');
    });
  }

  function measure() {
    fitScenes();
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
      p = Math.round(p * 10000) / 10000;
      // Only the hero follows the finger. Everything else changes state once per step and
      // lets a CSS transition do the moving: per-frame values made cards and phones tremble
      // while a touch scroll was coasting to a stop.
      if (p !== s.p) {
        s.p = p;
        if (s.mode === 'exit') s.el.style.setProperty('--p', p);
      }
      var step = s.mode === 'stack' ? stackStep(p, s.steps) : stepOf(p, s.steps);
      if (step !== s.step) {
        s.step = step;
        s.el.setAttribute('data-step', step);
      }
    });
  }

  function requestUpdate() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  function remeasure() { measure(); requestUpdate(); }

  // Scenes are sized in svh, so a phone's address bar sliding away does not resize them and
  // nothing is re-measured mid-scroll. A real change (rotation, window resize, text zoom) does.
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(remeasure);
    scenes.forEach(function (s) { ro.observe(s.el); });
  }
  window.addEventListener('resize', function () {
    if (window.innerWidth !== lastWidth) remeasure();
  });
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

  measure();
  update();
})();
