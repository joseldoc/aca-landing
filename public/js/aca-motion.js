/* ACA — moteur de mouvement, sans dépendance. Version 2, sur-ensemble de la v1 :
   les pages v1 n'utilisent que les trois premières entrées, les pages v2 tout.

   [data-reveal] / [data-reveal-stagger]  révélation à l'entrée (v1)
   [data-count="24"]                       compteur (v1)
   [data-sticky-header]                    header collant (v1)
   [data-split]                            titre découpé en mots, montée masquée
   [data-parallax="0.15"]                  profondeur liée au défilement
   [data-wipe]                             raclette : balayage clip-path lié au défilement
   [data-marquee]                          ruban défilant en boucle
   [data-magnetic]                         aimantation au curseur
   [data-tilt]                             inclinaison au curseur
   [data-progress]                         barre de progression de lecture
   [data-rail]                             index de section qui se remplit

   Sûreté : tout ce qui masque est conditionné à la classe `.aca-motion` posée
   en première instruction, et tout élément resté masqué est libéré au bout de
   FAILSAFE_MS. Les effets liés au curseur ou au défilement sont purement
   additifs — sans JS, la page reste lisible et complète. */
(function () {
  var REV = 3;
  var prev = window.ACAMotion;
  if (prev && prev.__rev >= REV) return;
  if (prev) {
    var claimed = document.querySelectorAll('[data-wipe],[data-parallax],[data-marquee],[data-reveal],[data-reveal-stagger],[data-rail],[data-progress],[data-split],[data-count],[data-magnetic],[data-tilt]');
    for (var q = 0; q < claimed.length; q++) {
      var el = claimed[q];
      delete el.__acaWipe; delete el.__acaPara; delete el.__acaRail; delete el.__acaBar;
      delete el.__acaSeen; delete el.__acaMag; delete el.__acaTilt; delete el.__acaDriver;
      delete el.__acaMq;
    }
  }
  var root = document.documentElement;
  if (root) root.classList.add('aca-motion', 'aca-motion-v2');

  var FAILSAFE_MS = 2200, LAST_RESORT_MS = 20000, POLL_MS = 150;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var writing = false;

  function vh() { return window.innerHeight || 800; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function travel(el) {
    var r = el.getBoundingClientRect(), h = vh();
    return clamp((h - r.top) / (h + r.height), 0, 1);
  }

  function wipeDriver(el) {
    var track = el.closest('[data-wipe-track]');
    if (track) return track;
    var st = el.parentElement;
    while (st && st !== document.body) {
      if (getComputedStyle(st).position === 'sticky') return st.parentElement || st;
      st = st.parentElement;
    }
    return null;
  }

  function wipeProgress(el) {
    var d = el.__acaDriver;
    if (d && d.isConnected) {
      var b = d.getBoundingClientRect(), span = b.height - vh();
      if (span > 40) return clamp((-b.top / span - 0.06) / 0.88, 0, 1);
    }
    return clamp((travel(el) - 0.18) / 0.44, 0, 1);
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    var suffix = el.getAttribute('data-count-suffix') || '';
    var dur = parseInt(el.getAttribute('data-count-duration') || '1100', 10);
    if (reduce) { el.textContent = target + suffix; return; }
    if (el.__acaCounting) return;
    el.__acaCounting = true;
    var t0 = Date.now();
    setTimeout(function () { el.textContent = target + suffix; }, dur + 500);
    var tick = setInterval(function () {
      var p = Math.min((Date.now() - t0) / dur, 1);
      writing = true;
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      writing = false;
      if (p >= 1) clearInterval(tick);
    }, 30);
  }

  function split(el) {
    if (el.__acaSplit) return;
    el.__acaSplit = true;
    if (reduce) { el.classList.add('is-in'); return; }
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text || text.length > 320) { el.classList.add('is-in'); return; }
    var words = text.split(' ');
    var frag = document.createDocumentFragment();
    for (var i = 0; i < words.length; i++) {
      var m = document.createElement('span');
      m.className = 'aca-w';
      var inner = document.createElement('span');
      inner.className = 'aca-w__i';
      inner.style.transitionDelay = (i * 55) + 'ms';
      inner.textContent = words[i];
      m.appendChild(inner);
      frag.appendChild(m);
      if (i < words.length - 1) frag.appendChild(document.createTextNode(' '));
    }
    writing = true;
    el.textContent = '';
    el.appendChild(frag);
    writing = false;
  }

  function reveal(n) {
    n.classList.add('is-in');
    if (n.hasAttribute('data-count')) countUp(n);
    var kids = n.querySelectorAll('[data-count]');
    for (var i = 0; i < kids.length; i++) countUp(kids[i]);
    if (io) { try { io.unobserve(n); } catch (e) {} }
  }

  var io = null;
  function observer() {
    if (io || !('IntersectionObserver' in window)) return io;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) reveal(e.target); });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    return io;
  }

  var pending = [];
  function checkPending() {
    if (!pending.length) return;
    var h = vh(), now = Date.now();
    pending = pending.filter(function (n) {
      if (n.classList.contains('is-in')) return false;
      var rect = n.getBoundingClientRect();
      if (rect.top < h * 0.92) { reveal(n); return false; }
      var age = now - (n.__acaSince || now);
      if (age > FAILSAFE_MS && rect.top < h * 3) { reveal(n); return false; }
      if (age > LAST_RESORT_MS) { reveal(n); return false; }
      return true;
    });
    if (!pending.length) stopPoll();
  }
  var poller = null;
  function startPoll() { if (!poller) poller = setInterval(function () { checkPending(); frame(); }, POLL_MS); }
  function stopPoll() { if (poller) { clearInterval(poller); poller = null; } }

  var para = [], wipes = [], rails = [], bars = [];
  function collectScroll(r) {
    var i, n, list;
    list = r.querySelectorAll('[data-parallax]');
    for (i = 0; i < list.length; i++) { n = list[i]; if (!n.__acaPara) { n.__acaPara = 1; para.push(n); } }
    list = r.querySelectorAll('[data-wipe]');
    for (i = 0; i < list.length; i++) { n = list[i]; if (!n.__acaWipe) { n.__acaWipe = 1; n.classList.add('aca-wipe'); n.__acaDriver = wipeDriver(n); wipes.push(n); } }
    list = r.querySelectorAll('[data-rail]');
    for (i = 0; i < list.length; i++) { n = list[i]; if (!n.__acaRail) { n.__acaRail = 1; rails.push(n); } }
    list = r.querySelectorAll('[data-progress]');
    for (i = 0; i < list.length; i++) { n = list[i]; if (!n.__acaBar) { n.__acaBar = 1; bars.push(n); } }
  }

  var rafId = 0, lastApply = 0;
  function frame() {
    if (Date.now() - lastApply > 240) { apply(); return; }
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; apply(); });
  }
  function apply() {
    lastApply = Date.now();
    {
      if (reduce) return;
      var i, n, p;
      for (i = 0; i < para.length; i++) {
        n = para[i];
        if (!n.isConnected) continue;
        var sp = parseFloat(n.getAttribute('data-parallax')) || 0.1;
        var ax = n.getAttribute('data-parallax-axis') === 'x';
        p = (travel(n) - 0.5) * 2;
        var d = -p * sp * 120;
        n.style.transform = (ax ? 'translate3d(' + d + 'px,0,0)' : 'translate3d(0,' + d + 'px,0)')
          + (n.getAttribute('data-parallax-scale') ? ' scale(' + (1 + Math.abs(p) * 0.04) + ')' : '');
      }
      for (i = 0; i < wipes.length; i++) {
        n = wipes[i];
        if (!n.isConnected) continue;
        var t = wipeProgress(n);
        var e = t * t * (3 - 2 * t);
        n.style.setProperty('--wipe', (e * 100).toFixed(2) + '%');
        n.classList.toggle('is-wiped', e > 0.985);
      }
      for (i = 0; i < rails.length; i++) {
        n = rails[i];
        if (!n.isConnected) continue;
        n.style.setProperty('--rail', (clamp((travel(n) - 0.1) / 0.6, 0, 1) * 100).toFixed(1) + '%');
      }
      for (i = 0; i < bars.length; i++) {
        n = bars[i];
        if (!n.isConnected) continue;
        var doc = document.documentElement;
        var max = (doc.scrollHeight - doc.clientHeight) || 1;
        n.style.setProperty('--progress', clamp((window.scrollY || doc.scrollTop) / max, 0, 1));
      }
    }
  }

  function marquee(r) {
    var list = r.querySelectorAll('[data-marquee]');
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (n.querySelectorAll(':scope > .aca-marquee__track').length >= 2) { n.__acaMq = 1; continue; }
      if (n.__acaMq && n.querySelectorAll(':scope > .aca-marquee__track').length >= 2) continue;
      n.__acaMq = 1;
      n.classList.add('aca-marquee');
      var track = n.firstElementChild;
      if (!track) continue;
      track.classList.add('aca-marquee__track');
      var secs = parseFloat(n.getAttribute('data-marquee')) || 26;
      track.style.animationDuration = secs + 's';
      if (n.getAttribute('data-marquee-dir') === 'right') track.style.animationDirection = 'reverse';
      writing = true;
      var clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      n.appendChild(clone);
      writing = false;
    }
  }

  function pointer(r) {
    var mags = r.querySelectorAll('[data-magnetic]'), i, n;
    for (i = 0; i < mags.length; i++) {
      n = mags[i];
      if (n.__acaMag || reduce) continue;
      n.__acaMag = 1;
      (function (el) {
        var str = parseFloat(el.getAttribute('data-magnetic')) || 6;
        el.addEventListener('pointermove', function (ev) {
          var b = el.getBoundingClientRect();
          var dx = (ev.clientX - (b.left + b.width / 2)) / (b.width / 2);
          var dy = (ev.clientY - (b.top + b.height / 2)) / (b.height / 2);
          el.style.transform = 'translate3d(' + (dx * str).toFixed(2) + 'px,' + (dy * str).toFixed(2) + 'px,0)';
        });
        el.addEventListener('pointerleave', function () { el.style.transform = ''; });
      })(n);
    }
    var tilts = r.querySelectorAll('[data-tilt]');
    for (i = 0; i < tilts.length; i++) {
      n = tilts[i];
      if (n.__acaTilt || reduce) continue;
      n.__acaTilt = 1;
      (function (el) {
        var str = parseFloat(el.getAttribute('data-tilt')) || 5;
        el.style.transformStyle = 'preserve-3d';
        el.addEventListener('pointermove', function (ev) {
          var b = el.getBoundingClientRect();
          var dx = (ev.clientX - (b.left + b.width / 2)) / (b.width / 2);
          var dy = (ev.clientY - (b.top + b.height / 2)) / (b.height / 2);
          el.style.transform = 'perspective(1100px) rotateY(' + (dx * str).toFixed(2) + 'deg) rotateX(' + (-dy * str).toFixed(2) + 'deg)';
        });
        el.addEventListener('pointerleave', function () { el.style.transform = 'perspective(1100px)'; });
      })(n);
    }
  }

  function scan(r) {
    r = r || document;
    var nodes = r.querySelectorAll('[data-reveal],[data-reveal-stagger]');
    var obs = observer(), h = vh(), i;
    var sp = r.querySelectorAll('[data-split]');
    for (i = 0; i < sp.length; i++) split(sp[i]);
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.classList.contains('is-in') || n.__acaSeen) continue;
      n.__acaSeen = true;
      n.__acaSince = Date.now();
      if (reduce || n.getBoundingClientRect().top < h * 0.92) { reveal(n); continue; }
      if (obs) obs.observe(n);
      pending.push(n);
    }
    var loose = r.querySelectorAll('[data-count]:not([data-reveal])');
    for (var j = 0; j < loose.length; j++) {
      var l = loose[j];
      if (l.__acaSeen) continue;
      l.__acaSeen = true;
      if (reduce || l.getBoundingClientRect().top < h * 0.92) countUp(l);
      else { if (obs) obs.observe(l); l.__acaSince = Date.now(); pending.push(l); }
    }
    collectScroll(r);
    marquee(r);
    pointer(r);
    if (pending.length) startPoll();
    checkPending();
    frame();
  }

  var last = 0;
  window.addEventListener('scroll', function () {
    var now = Date.now();
    if (now - last >= 40) { last = now; checkPending(); }
    frame(); stickyUpdate();
  }, { passive: true });
  window.addEventListener('resize', function () { checkPending(); frame(); stickyUpdate(); }, { passive: true });

  var heads = [];
  function stickyUpdate() {
    if (!heads.length) return;
    var y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    for (var i = 0; i < heads.length; i++) heads[i].classList.toggle('is-scrolled', y > 30);
  }
  var stickyTimer = null;
  function sticky() {
    heads = [].slice.call(document.querySelectorAll('[data-sticky-header]'));
    stickyUpdate();
    if (stickyTimer || !heads.length) return;
    stickyTimer = setInterval(stickyUpdate, POLL_MS);
  }

  function init() { scan(document); sticky(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', function () { scan(document); sticky(); });

  var rescanTimer = null;
  function queueRescan() {
    if (rescanTimer || writing) return;
    rescanTimer = setTimeout(function () { rescanTimer = null; scan(document); sticky(); }, 140);
  }
  if (window.MutationObserver) {
    var start = function () {
      if (!document.body) { setTimeout(start, 50); return; }
      new MutationObserver(function () { if (!writing) queueRescan(); }).observe(document.body, { childList: true, subtree: true });
    };
    start();
  } else {
    setInterval(queueRescan, 500);
  }

  window.ACAMotion = {
    __v: 2, __rev: REV,
    scan: scan, sticky: sticky, countUp: countUp, check: checkPending, frame: frame,
    state: function () { return { pending: pending.length, polling: !!poller, parallax: para.length, wipes: wipes.length }; }
  };
})();
