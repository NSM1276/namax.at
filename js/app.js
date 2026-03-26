// ── Tubes hero background ──
async function initHeroTubes() {
  const canvas = document.getElementById('tubes-canvas');
  if (!canvas) return;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js');
    const TubesCursor = mod.default || mod;
    const app = TubesCursor(canvas, {
      tubes: {
        colors: ['#1b8fd1', '#4bb3f0', '#0a3a5c'],
        lights: {
          intensity: 200,
          colors: ['#1b8fd1', '#c0e8ff', '#4bb3f0', '#0e2840']
        }
      }
    });
    // Click hero section to randomize colors
    document.getElementById('hero').addEventListener('click', () => {
      if (!app?.tubes) return;
      const r = () => '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
      app.tubes.setColors([r(), r(), r()]);
      app.tubes.setLightsColors([r(), r(), r(), r()]);
    });
    canvas.style.pointerEvents = 'none';
  } catch (_) {
    // silently fall back to CSS gradient
  }
}

// ── Neon button ripple ──
function initNeonRipple() {
  document.querySelectorAll('.btn-neon').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const ripple = document.createElement('span');
      ripple.className = 'neon-ripple';
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;position:absolute;`;
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    });
  });
}

const DEFAULT_LANG = 'de';
let currentLang = localStorage.getItem('namax_lang') || DEFAULT_LANG;

function applyLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem('namax_lang', lang);

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang][key] !== undefined) {
      el.innerHTML = translations[lang][key];
    }
  });

  const codeEl = document.getElementById('langCurrentCode');
  if (codeEl) codeEl.textContent = lang.toUpperCase();
  document.querySelectorAll('.lang-option').forEach(opt => {
    opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
  });

  document.documentElement.lang = lang;

  const titles = {
    de: 'NAMAX.at – Websites für lokale Betriebe in Wien',
    en: 'NAMAX.at – Websites for local businesses in Vienna',
    tr: 'NAMAX.at – Viyana\'da işletmeler için web siteleri',
    ru: 'NAMAX.at – Сайты для бизнеса в Вене'
  };
  document.title = titles[lang];
}

document.addEventListener('DOMContentLoaded', () => {
  // Tubes + Ripple
  initHeroTubes();
  initNeonRipple();

  // Language dropdown
  const dropdown = document.getElementById('langDropdown');
  const currentBtn = document.getElementById('langCurrentBtn');
  if (dropdown && currentBtn) {
    currentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.querySelectorAll('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => {
        applyLanguage(opt.getAttribute('data-lang'));
        dropdown.classList.remove('open');
      });
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }
  applyLanguage(currentLang);

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-question').addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  // Mobile menu
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        menuToggle.classList.remove('open');
      });
    });
  }

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // Header on scroll
  const header = document.querySelector('header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  // Reveal on scroll
  const revealEls = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  revealEls.forEach(el => observer.observe(el));
});
