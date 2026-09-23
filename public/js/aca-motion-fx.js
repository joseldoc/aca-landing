/* ACA — effets complémentaires du moteur de mouvement (v2+). Charger APRÈS aca-motion.js.
   Hors de assets/ pour ne pas être figé dans _ds_bundle.js.

   [data-scrub]                 paragraphe qui s'allume mot à mot au défilement
   [data-hscroll]               scène épinglée à défilement horizontal
     [data-hscroll-track]         la piste qui glisse
     [data-hscroll-count="6"]     compteur 01 / 06 synchronisé
   [data-velocity]              inclinaison proportionnelle à la vitesse de défilement
   [data-rotate="a|b|c"]        mot qui tourne en boucle
   [data-cursor]                curseur ACA (anneau + point), libellé via [data-cursor-label]
   [data-hide-header]           l'en-tête [data-sticky-header] se retire en descendant
   [data-intro="logo.svg"]      rideau d'ouverture avec logo
   [data-to-top]                bouton flottant « haut de page » avec anneau de progression
   ACAFX.curtain(fn)            rideau de transition entre écrans

   Écrit uniquement des nodeValue / styles / classes après la préparation initiale,
   pour ne pas réveiller l'observateur de mutations du moteur principal. */
(function () {
  if (window.ACAFX) return;
  var mm = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  var reduce = mm('(prefers-reduced-motion: reduce)');
  var fine = mm('(pointer: fine)');
  document.documentElement.classList.add('aca-fx');
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function vh() { return window.innerHeight || 800; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* L'éditeur peut envelopper les textes dans des <span> : on vise le premier nœud
     TEXTE descendant, jamais firstChild (qui peut être un élément, nodeValue null). */
  function firstText(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n = w.nextNode();
    while (n && !n.nodeValue.trim()) n = w.nextNode();
    return n;
  }

  /* -------------------------------------------------------------- scrub */
  var scrubs = [];
  function prepScrub(el) {
    if (el.__fxScrub) return;
    el.__fxScrub = 1;
    var words = el.textContent.replace(/\s+/g, ' ').trim().split(' ');
    var frag = document.createDocumentFragment(), spans = [];
    for (var i = 0; i < words.length; i++) {
      var s = document.createElement('span');
      s.className = 'aca-scrub__w';
      s.textContent = words[i];
      frag.appendChild(s); spans.push(s);
      if (i < words.length - 1) frag.appendChild(document.createTextNode(' '));
    }
    el.textContent = '';
    el.appendChild(frag);
    el.__fxWords = spans;
    scrubs.push(el);
  }

  /* ------------------------------------------------------------ hscroll */
  var hs = [];
  function layoutHS(c) {
    var sticky = c.firstElementChild, track = c.querySelector('[data-hscroll-track]');
    if (!sticky || !track) return 0;
    var dist = Math.max(0, track.scrollWidth - sticky.clientWidth);
    c.__fxDist = dist;
    var h = dist > 0 && !reduce ? (dist + vh()) + 'px' : '';
    if (c.style.height !== h) c.style.height = h;
    return dist;
  }

  /* ------------------------------------------------------------ rotator */
  function prepRotator(el) {
    if (el.__fxRot) return;
    var words = (el.getAttribute('data-rotate') || '').split('|');
    if (words.length < 2) return;
    el.__fxRot = 1;
    el.classList.add('aca-rot');
    var inner = document.createElement('span');
    inner.className = 'aca-rot__i';
    inner.appendChild(document.createTextNode(words[0]));
    el.textContent = '';
    el.appendChild(inner);
    if (reduce) return;
    var idx = 0, ms = parseInt(el.getAttribute('data-rotate-ms') || '2300', 10);
    var id = setInterval(function () {
      if (!el.isConnected) { clearInterval(id); return; }
      inner.classList.add('is-out');
      setTimeout(function () {
        idx = (idx + 1) % words.length;
        var tn = firstText(inner);
        if (tn) tn.nodeValue = words[idx];
        inner.classList.remove('is-out');
        inner.classList.add('is-pre');
        void inner.offsetWidth;
        inner.classList.remove('is-pre');
      }, 430);
    }, ms);
  }

  /* -------------------------------------------------------------- apply */
  function apply() {
    var h = vh(), i, el;
    for (i = 0; i < scrubs.length; i++) {
      el = scrubs[i];
      if (!el.isConnected) continue;
      var r = el.getBoundingClientRect();
      var p = reduce ? 1 : clamp((h * 0.84 - r.top) / (r.height + h * 0.4), 0, 1);
      var w = el.__fxWords, n = w.length, x = p * n * 1.1;
      for (var k = 0; k < n; k++) w[k].style.opacity = (0.16 + clamp(x - k, 0, 1) * 0.84).toFixed(3);
    }
    for (i = 0; i < hs.length; i++) {
      el = hs[i];
      if (!el.isConnected) continue;
      var dist = layoutHS(el);
      var tr = el.querySelector('[data-hscroll-track]');
      if (!tr) continue;
      var b = el.getBoundingClientRect(), span = b.height - h;
      var q = span > 1 && dist > 0 ? clamp(-b.top / span, 0, 1) : 0;
      tr.style.transform = 'translate3d(' + (-q * dist).toFixed(1) + 'px,0,0)';
      el.style.setProperty('--hs', q.toFixed(4));
      var cnt = el.querySelector('[data-hscroll-count]');
      var tn = cnt ? firstText(cnt) : null;
      if (tn) {
        var tot = parseInt(cnt.getAttribute('data-hscroll-count'), 10) || 1;
        var t = pad(Math.min(tot, 1 + Math.floor(q * tot * 0.999)));
        if (tn.nodeValue !== t) tn.nodeValue = t;
      }
    }
  }

  /* ------------------------------------------------- vitesse & en-tête */
  var lastY = window.scrollY || 0, lastT = Date.now(), velTimer = null, dirY = lastY;
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop || 0, t = Date.now();
    var v = (y - lastY) / Math.max(16, t - lastT);
    lastY = y; lastT = t;
    if (!reduce) {
      var sk = clamp(v * -3.2, -8, 8).toFixed(2);
      var vs = document.querySelectorAll('[data-velocity]');
      for (var i = 0; i < vs.length; i++) vs[i].style.transform = 'skewX(' + sk + 'deg)';
      clearTimeout(velTimer);
      velTimer = setTimeout(function () {
        var vs2 = document.querySelectorAll('[data-velocity]');
        for (var j = 0; j < vs2.length; j++) vs2[j].style.transform = '';
      }, 130);
    }
    if (document.querySelector('[data-hide-header]')) {
      var d = y - dirY;
      if (Math.abs(d) > 6) {
        var hide = d > 0 && y > 520;
        var hd = document.querySelectorAll('[data-sticky-header]');
        for (var k = 0; k < hd.length; k++) hd[k].classList.toggle('aca-hdr-hidden', hide);
        dirY = y;
      }
    }
    apply();
    updTop();
  }

  /* ------------------------------------------------------------- curseur */
  function cursor() {
    if (!fine || reduce || !document.querySelector('[data-cursor]') || document.querySelector('.aca-cursor') || !document.body) return;
    var ring = document.createElement('div');
    ring.className = 'aca-cursor';
    var label = document.createElement('span');
    label.className = 'aca-cursor__label';
    label.appendChild(document.createTextNode(' '));
    ring.appendChild(label);
    var dot = document.createElement('div');
    dot.className = 'aca-cursor-dot';
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    var tx = -100, ty = -100, x = -100, y = -100;
    document.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
      ring.classList.add('is-on');
      var tgt = e.target && e.target.closest ? e.target : null;
      var hit = tgt ? tgt.closest('a,button,[role="tab"],select,label,input,textarea') : null;
      var lab = tgt ? tgt.closest('[data-cursor-label]') : null;
      var txt = !hit && lab ? lab.getAttribute('data-cursor-label') : '';
      ring.classList.toggle('is-hover', !!hit);
      ring.classList.toggle('is-label', !!txt);
      if (txt && label.firstChild.nodeValue !== txt) label.firstChild.nodeValue = txt;
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { ring.classList.remove('is-on'); });
    function loop() {
      x += (tx - x) * 0.2; y += (ty - y) * 0.2;
      ring.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------- haut de page */
  var topBtn = null;
  function toTop() {
    if (topBtn || !document.body || !document.querySelector('[data-to-top]')) return;
    topBtn = document.createElement('button');
    topBtn.type = 'button';
    topBtn.className = 'aca-totop';
    topBtn.setAttribute('aria-label', 'Revenir en haut de page');
    topBtn.setAttribute('title', 'Haut de page');
    var ic = document.createElement('span');
    ic.className = 'aca-totop__icon';
    topBtn.appendChild(ic);
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    document.body.appendChild(topBtn);
    updTop();
  }
  function updTop() {
    if (!topBtn) return;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var max = Math.max(1, document.documentElement.scrollHeight - vh());
    topBtn.style.setProperty('--top-p', (clamp(y / max, 0, 1) * 360).toFixed(1) + 'deg');
    topBtn.classList.toggle('is-on', y > vh() * 0.6);
  }

  /* -------------------------------------------------------------- rideaux */
  function curtain(cb) {
    if (reduce || !document.body) { if (cb) cb(); return; }
    var c = document.createElement('div');
    c.className = 'aca-curtain';
    c.innerHTML = '<div class="aca-curtain__a"></div><div class="aca-curtain__b"></div>';
    document.body.appendChild(c);
    void c.offsetWidth;
    c.classList.add('is-in');
    setTimeout(function () {
      try { if (cb) cb(); } catch (e) { setTimeout(function () { throw e; }); }
      setTimeout(function () {
        c.classList.add('is-out');
        setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 1000);
      }, 90);
    }, 640);
  }
  var introDone = false;
  function intro() {
    if (introDone || reduce) return;
    var host = document.querySelector('[data-intro]');
    if (!host || !document.body) return;
    introDone = true;
    var c = document.createElement('div');
    c.className = 'aca-curtain aca-curtain--intro is-in';
    c.innerHTML = '<div class="aca-curtain__a"></div><div class="aca-curtain__b"><img alt="" src="' + host.getAttribute('data-intro') + '"><span class="aca-curtain__bar"></span></div>';
    document.body.appendChild(c);
    setTimeout(function () {
      c.classList.add('is-out');
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 1200);
    }, 1250);
  }

  /* ----------------------------------------------------------------- scan */
  function scan() {
    var i, l;
    l = document.querySelectorAll('[data-scrub]');
    for (i = 0; i < l.length; i++) prepScrub(l[i]);
    l = document.querySelectorAll('[data-rotate]');
    for (i = 0; i < l.length; i++) prepRotator(l[i]);
    l = document.querySelectorAll('[data-hscroll]');
    for (i = 0; i < l.length; i++) if (!l[i].__fxHs) { l[i].__fxHs = 1; hs.push(l[i]); }
    scrubs = scrubs.filter(function (e) { return e.isConnected; });
    hs = hs.filter(function (e) { return e.isConnected; });
    cursor();
    toTop();
    apply();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', apply, { passive: true });
  function init() { intro(); scan(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', scan);
  /* les écrans React arrivent après le chargement : balayage léger et périodique */
  var ticks = 0, poll = setInterval(function () { scan(); if (++ticks > 40) clearInterval(poll); }, 250);
  if (window.MutationObserver) {
    var qd = null;
    var start = function () {
      if (!document.body) { setTimeout(start, 50); return; }
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var t = muts[i].target;
          if (t && t.closest && t.closest('.aca-cursor,.aca-curtain,[data-scrub],[data-rotate]')) continue;
          if (!qd) qd = setTimeout(function () { qd = null; scan(); }, 160);
          return;
        }
      }).observe(document.body, { childList: true, subtree: true });
    };
    start();
  }

  window.ACAFX = { scan: scan, apply: apply, curtain: curtain };
})();
