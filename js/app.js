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
    ru: 'NAMAX.at – Сайты для бизнеса в Вене',
    sr: 'NAMAX.at – Web sajtovi za firme u Beču',
    hr: 'NAMAX.at – Web stranice za tvrtke u Beču'
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

  // ── Biz card modals ──
  const bizModal = document.getElementById('bizModal');
  const bizModalClose = document.getElementById('bizModalClose');

  const bizIconSVGs = {
    barbershop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
    cafe:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>',
    restaurant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
    doener:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    beauty:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
    local:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  };

  function fillBizModal(card) {
    const biz = card.getAttribute('data-biz');
    const demo = card.getAttribute('data-demo');
    const lang = translations[currentLang];
    const title = card.querySelector('.biz-name').textContent;

    document.getElementById('bizModalIcon').innerHTML = bizIconSVGs[biz] || '';
    document.getElementById('bizModalTitle').textContent = title;
    document.getElementById('bizModalDesc').textContent = lang[`modal_${biz}_desc`] || '';

    const list = document.getElementById('bizModalList');
    list.innerHTML = '';
    [1, 2, 3, 4].forEach(n => {
      const key = `modal_${biz}_${n}`;
      if (lang[key]) {
        const li = document.createElement('li');
        li.textContent = lang[key];
        list.appendChild(li);
      }
    });

    const demoBtn = document.getElementById('bizModalDemo');
    const demoText = document.getElementById('bizModalDemoText');
    if (demo) {
      demoBtn.href = demo;
      demoText.textContent = lang.modal_demo_label || 'Demo ansehen';
      demoBtn.removeAttribute('aria-hidden');
    } else {
      demoBtn.href = '#';
      demoText.textContent = lang.modal_demo_missing || 'Demo folgt bald';
      demoBtn.removeAttribute('aria-hidden');
      demoBtn.addEventListener('click', e => e.preventDefault(), { once: true });
    }
  }

  function openBizModal(card) {
    fillBizModal(card);
    bizModal.setAttribute('aria-hidden', 'false');
    bizModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    bizModal._sourceCard = card;
  }

  function closeBizModal() {
    bizModal.classList.remove('active');
    bizModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    bizModal._sourceCard = null;
  }

  document.querySelectorAll('.biz-card[data-biz]').forEach(card => {
    card.addEventListener('click', () => openBizModal(card));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openBizModal(card); });
  });
  bizModalClose.addEventListener('click', closeBizModal);
  bizModal.addEventListener('click', e => { if (e.target === bizModal) closeBizModal(); });

  // ── Impressum / Datenschutz inline expand ──
  const impressumExpand   = document.getElementById('impressumExpand');
  const datenschutzExpand = document.getElementById('datenschutzExpand');

  function toggleLegal(show, hide) {
    const isHidden = show.hidden;
    hide.hidden = true;
    show.hidden = !isHidden;
    if (!show.hidden) show.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('toggleImpressum').addEventListener('click', () =>
    toggleLegal(impressumExpand, datenschutzExpand));
  document.getElementById('toggleDatenschutz').addEventListener('click', () =>
    toggleLegal(datenschutzExpand, impressumExpand));

  // Close biz modal on Escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBizModal(); });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      const tabs = btn.closest('.tabs');
      tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      tabs.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });

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
