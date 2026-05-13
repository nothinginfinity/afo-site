/* AFO Site — app.js */
/* Handles: audit form demo, dashboard JSON loading, small UI interactions */

(function () {
  'use strict';

  /* ── Free Audit Form ── */
  const auditForm = document.getElementById('audit-form');
  const auditResult = document.getElementById('audit-result');

  if (auditForm) {
    auditForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const url = document.getElementById('audit-url')?.value?.trim();
      const name = document.getElementById('audit-name')?.value?.trim();

      if (!url || !name) {
        showMessage(auditResult, 'error', 'Please fill in your website URL and business name.');
        return;
      }

      // Simulate capture
      auditForm.style.opacity = '0.4';
      auditForm.style.pointerEvents = 'none';

      setTimeout(function () {
        showMessage(
          auditResult,
          'success',
          '✅ Audit request captured. ' +
          'In the live version, this will submit to the AFO audit queue and you will receive a report within 24–48 hours. ' +
          '(Demo mode: no data was sent externally.)'
        );
      }, 600);
    });
  }

  function showMessage(el, type, text) {
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.padding = '1rem 1.25rem';
    el.style.borderRadius = '0.75rem';
    el.style.fontSize = 'var(--text-sm)';
    el.style.lineHeight = '1.6';
    if (type === 'success') {
      el.style.background = 'rgba(74,222,128,0.1)';
      el.style.border = '1px solid rgba(74,222,128,0.25)';
      el.style.color = '#4ade80';
    } else {
      el.style.background = 'rgba(248,113,113,0.1)';
      el.style.border = '1px solid rgba(248,113,113,0.25)';
      el.style.color = '#f87171';
    }
  }

  /* ── Dashboard: load demo audit JSON ── */
  const demoScoreEl = document.getElementById('demo-score');
  if (demoScoreEl) {
    fetch('/data/audits/demo-audit.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        demoScoreEl.textContent = data.score + ' / ' + data.max_score;
        const missingEl = document.getElementById('demo-missing');
        if (missingEl && data.missing_files) {
          missingEl.innerHTML = data.missing_files
            .map(function (f) { return '<li class="missing-list__item">' + f + '</li>'; })
            .join('');
        }
      })
      .catch(function () {
        // Fail silently — static numbers already shown in HTML
      });
  }

  /* ── Smooth scroll for anchor links ── */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
