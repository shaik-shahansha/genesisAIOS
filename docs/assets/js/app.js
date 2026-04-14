/* ============================================================
   GENESIS OS WEBSITE — JavaScript
   ============================================================ */

(function () {
  'use strict';

  /* ── THEME ─────────────────────────────────────────────── */

  const THEME_KEY = 'genesis-theme';

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    updateThemeButton(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  function updateThemeButton(theme) {
    document.querySelectorAll('.nav-theme-btn').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  function initTheme() {
    const stored = getStoredTheme();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // Default to light as requested, but respect user preference/stored choice
    const theme = stored || 'light';
    setTheme(theme);

    document.querySelectorAll('.nav-theme-btn').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });
  }

  /* ── NAVIGATION ─────────────────────────────────────────── */

  function initNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    // Scroll effect
    function onScroll() {
      if (window.scrollY > 20) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mobile hamburger
    const hamburger = document.querySelector('.nav-hamburger');
    const mobileMenu = document.querySelector('.nav-mobile');
    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', () => {
        const open = mobileMenu.classList.toggle('open');
        hamburger.setAttribute('aria-expanded', String(open));
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!nav.contains(e.target) && !mobileMenu.contains(e.target)) {
          mobileMenu.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Active link detection
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
      if (link.dataset.page === currentPath) {
        link.classList.add('active');
      }
    });
  }

  /* ── SCROLL ANIMATIONS ──────────────────────────────────── */

  function initScrollAnimations() {
    const targets = document.querySelectorAll('.fade-up, .fade-in');
    if (!targets.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -48px 0px' });

    targets.forEach(el => observer.observe(el));
  }

  /* ── OS CLOCK ───────────────────────────────────────────── */

  function initOsClock() {
    const clocks = document.querySelectorAll('.os-time');
    if (!clocks.length) return;

    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      clocks.forEach(el => el.textContent = `${h}:${m}`);
    }

    tick();
    setInterval(tick, 10000);
  }

  /* ── COPY CODE BLOCKS ───────────────────────────────────── */

  function initCopyButtons() {
    document.querySelectorAll('.code-block-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const block = btn.closest('.code-block');
        const pre = block?.querySelector('pre');
        if (!pre) return;

        const text = pre.textContent;
        try {
          await navigator.clipboard.writeText(text);
          const orig = btn.textContent;
          btn.textContent = '✓ Copied!';
          btn.style.color = '#10b981';
          setTimeout(() => {
            btn.textContent = orig;
            btn.style.color = '';
          }, 2000);
        } catch {
          btn.textContent = 'Failed';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        }
      });
    });
  }

  /* ── SMOOTH ANCHOR SCROLL ───────────────────────────────── */

  function initAnchorScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const id = anchor.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (target) {
          e.preventDefault();
          const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
          const top = target.getBoundingClientRect().top + window.scrollY - navH - 16;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  /* ── COUNTER ANIMATION ──────────────────────────────────── */

  function animateCounter(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const dur = 1200;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(eased * target * 10) / 10;
      el.textContent = (Number.isInteger(target) ? Math.round(current) : current) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(el => observer.observe(el));
  }

  /* ── ACCORDION ──────────────────────────────────────────── */

  function initAccordion() {
    document.querySelectorAll('.accordion-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.accordion-item');
        const content = item?.querySelector('.accordion-content');
        const isOpen = item?.classList.contains('open');

        // Close all
        document.querySelectorAll('.accordion-item.open').forEach(i => {
          i.classList.remove('open');
          const c = i.querySelector('.accordion-content');
          if (c) c.style.maxHeight = '0';
        });

        // Open clicked if was closed
        if (!isOpen && item && content) {
          item.classList.add('open');
          content.style.maxHeight = content.scrollHeight + 'px';
        }
      });
    });
  }

  /* ── INIT ALL ───────────────────────────────────────────── */

  function init() {
    initTheme();
    initNav();
    initScrollAnimations();
    initOsClock();
    initCopyButtons();
    initAnchorScroll();
    initCounters();
    initAccordion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
