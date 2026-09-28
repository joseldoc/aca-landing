/* ACA — comportements propres au site : menu mobile et formulaire de devis.
   Sans dépendance ; sans JS, le menu reste absent (liens du pied de page) et le
   formulaire retombe sur la validation HTML native et le contrôle serveur. */
(function () {
  'use strict';

  /* ------------------------------------------------------------ menu mobile */
  function menu() {
    var btn = document.querySelector('[data-menu-toggle]');
    var panel = document.getElementById('aca-mnav');
    if (!btn || !panel) return;
    var closeBtn = panel.querySelector('[data-menu-close]');
    var lastFocus = null;

    function focusables() {
      return [].slice.call(panel.querySelectorAll('a[href],button:not([disabled])'));
    }
    function open() {
      lastFocus = document.activeElement;
      panel.hidden = false;
      // laisse le navigateur appliquer `hidden=false` avant la transition
      requestAnimationFrame(function () { panel.classList.add('is-open'); });
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('aca-menu-open');
      (closeBtn || focusables()[0]).focus();
    }
    function close(restoreFocus) {
      panel.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('aca-menu-open');
      setTimeout(function () { if (!panel.classList.contains('is-open')) panel.hidden = true; }, 300);
      if (restoreFocus !== false && lastFocus) lastFocus.focus();
    }

    btn.addEventListener('click', function () {
      btn.getAttribute('aria-expanded') === 'true' ? close() : open();
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { close(); });
    panel.addEventListener('click', function (e) {
      // un lien d'ancre ferme le menu puis laisse la navigation se faire
      if (e.target.closest('a[href^="#"]')) close(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('is-open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables(), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.matchMedia('(min-width: 1001px)').addEventListener('change', function (mq) {
      if (mq.matches && panel.classList.contains('is-open')) close(false);
    });
  }

  /* ------------------------------------------------- formulaire de devis */
  var MESSAGES = {
    valueMissing: 'Ce champ est obligatoire.',
    typeMismatch: 'Saisissez une adresse e-mail valide, par exemple vous@societe.fr.',
    patternMismatch: 'Saisissez un numéro valide, par exemple 06 00 00 00 00.'
  };

  function errorFor(field) {
    var v = field.validity;
    if (v.valid) return '';
    if (v.valueMissing) return MESSAGES.valueMissing;
    if (v.typeMismatch) return MESSAGES.typeMismatch;
    if (v.patternMismatch) return MESSAGES.patternMismatch;
    return field.validationMessage;
  }

  function show(field) {
    var box = document.getElementById(field.id + '-error');
    if (!box) return true;
    var msg = errorFor(field);
    field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    box.querySelector('span').textContent = msg;
    box.hidden = !msg;
    return !msg;
  }

  function form() {
    var f = document.querySelector('[data-quote-form]');
    if (!f) return;
    f.setAttribute('novalidate', '');
    var fields = [].slice.call(f.querySelectorAll('[data-validate]'));
    var submit = f.querySelector('[type="submit"]');
    var submitLabel = submit ? submit.innerHTML : '';

    // retour arrière depuis la page suivante (cache navigateur) : bouton réactivé
    window.addEventListener('pageshow', function () {
      if (submit) { submit.removeAttribute('aria-busy'); submit.innerHTML = submitLabel; }
    });

    fields.forEach(function (field) {
      // validation à la sortie du champ, puis en direct une fois l'erreur affichée
      field.addEventListener('blur', function () { if (field.value !== '' || field.hasAttribute('aria-invalid')) show(field); });
      field.addEventListener('input', function () { if (field.getAttribute('aria-invalid') === 'true') show(field); });
    });

    f.addEventListener('submit', function (e) {
      var firstInvalid = null;
      fields.forEach(function (field) { if (!show(field) && !firstInvalid) firstInvalid = field; });
      if (firstInvalid) { e.preventDefault(); firstInvalid.focus(); return; }

      if (submit) {
        if (submit.getAttribute('aria-busy') === 'true') { e.preventDefault(); return; }
        submit.setAttribute('aria-busy', 'true');
        submit.innerHTML = '<span class="aca-spinner" aria-hidden="true"></span>Envoi en cours…';
      }
    });

    // après redirection : on amène le lecteur d'écran et le clavier sur le résultat.
    // Après `load`, sinon la navigation vers #contact remet le focus sur <body>.
    var status = document.querySelector('[data-form-status]');
    if (status) {
      var focusStatus = function () { setTimeout(function () { status.focus({ preventScroll: true }); }, 0); };
      document.readyState === 'complete' ? focusStatus() : window.addEventListener('load', focusStatus);
    }
  }

  function init() { menu(); form(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
