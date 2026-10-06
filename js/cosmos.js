/* OzonFlow · 星空背景：三层视差星光、闪烁、偶发流星；标签页隐藏时暂停，减少动态效果时只画静态一帧 */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cv = document.createElement('canvas');
  cv.id = 'cosmos'; cv.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(cv, document.body.firstChild);
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, stars = [], meteors = [], mx = 0, my = 0, tx = 0, ty = 0, raf = 0, last = 0, nextMeteor = 0;
  var TINTS = ['255,255,255', '210,225,255', '170,200,255', '255,236,214', '190,240,255'];

  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var n = Math.min(520, Math.round(W * H / 3600));
    stars = [];
    for (var i = 0; i < n; i++) {
      var layer = Math.random() < .62 ? 0 : (Math.random() < .75 ? 1 : 2);
      stars.push({
        x: Math.random() * W, y: Math.random() * H, l: layer,
        r: [0.45, 0.85, 1.35][layer] * (0.7 + Math.random() * 0.6),
        a: [0.35, 0.6, 0.9][layer] * (0.6 + Math.random() * 0.4),
        tw: 0.6 + Math.random() * 1.8, ph: Math.random() * 6.28,
        c: TINTS[(Math.random() * TINTS.length) | 0], vx: (Math.random() - .5) * 0.004 * (layer + 1)
      });
    }
  }

  function spawnMeteor(t) {
    var fromLeft = Math.random() < .5;
    meteors.push({ x: fromLeft ? Math.random() * W * .5 : W * .5 + Math.random() * W * .5, y: Math.random() * H * .35,
      vx: (fromLeft ? 1 : -1) * (0.55 + Math.random() * 0.35), vy: 0.28 + Math.random() * 0.2, life: 0, max: 900 + Math.random() * 600 });
    nextMeteor = t + 7000 + Math.random() * 9000;
  }

  function draw(t) {
    var dt = last ? Math.min(t - last, 50) : 16; last = t;
    tx += (mx - tx) * 0.04; ty += (my - ty) * 0.04;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (!reduce) { s.x += s.vx * dt; if (s.x < -4) s.x = W + 4; else if (s.x > W + 4) s.x = -4; }
      var depth = [6, 14, 26][s.l];
      var x = s.x - tx * depth, y = s.y - ty * depth;
      var a = reduce ? s.a : s.a * (0.55 + 0.45 * Math.sin(t * 0.001 * s.tw + s.ph));
      ctx.fillStyle = 'rgba(' + s.c + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill();
      if (s.l === 2 && a > .55) {
        ctx.fillStyle = 'rgba(' + s.c + ',' + (a * .12).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, s.r * 4, 0, 6.2832); ctx.fill();
      }
    }
    if (!reduce) {
      if (!nextMeteor) nextMeteor = t + 3500;
      if (t > nextMeteor) spawnMeteor(t);
      for (var k = meteors.length - 1; k >= 0; k--) {
        var m = meteors[k]; m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
        var p = m.life / m.max, fade = p < .15 ? p / .15 : 1 - (p - .15) / .85;
        var len = 120, nx = m.vx / Math.hypot(m.vx, m.vy), ny = m.vy / Math.hypot(m.vx, m.vy);
        var g = ctx.createLinearGradient(m.x, m.y, m.x - nx * len, m.y - ny * len);
        g.addColorStop(0, 'rgba(220,235,255,' + (0.85 * fade).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - nx * len, m.y - ny * len); ctx.stroke();
        if (m.life > m.max) meteors.splice(k, 1);
      }
      raf = requestAnimationFrame(draw);
    }
  }

  function start() { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(draw); }
  build(); start();
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { build(); if (reduce) draw(0); }, 150); });
  if (!reduce) {
    window.addEventListener('pointermove', function (e) { mx = e.clientX / W - .5; my = e.clientY / H - .5; }, { passive: true });
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  }

  /* Hero 航线：义乌 → 莫斯科，彗星沿弧线飞行 */
  function heroRoute() {
    var hero = document.getElementById('dashHero');
    if (!hero || hero.querySelector('.hero-orbit')) return;
    var NS = 'http://www.w3.org/2000/svg';
    var wrap = document.createElement('div');
    wrap.innerHTML = '<svg class="hero-orbit" viewBox="0 0 1000 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="' + NS + '">' +
      '<defs><linearGradient id="heroRouteGrad" x1="0" x2="1"><stop offset="0" stop-color="#4d8dff" stop-opacity=".1"/><stop offset=".45" stop-color="#8b9bff" stop-opacity=".9"/><stop offset=".75" stop-color="#b48cff" stop-opacity=".8"/><stop offset="1" stop-color="#ffb877" stop-opacity=".5"/></linearGradient></defs>' +
      '<path id="heroRoutePath" class="route" d="M 440 72 Q 570 -18 700 40"/>' +
      '<circle class="node" cx="440" cy="72" r="3"/><text class="node-lbl" x="430" y="70" text-anchor="end">义乌</text>' +
      '<circle class="node" cx="700" cy="40" r="3"/><text class="node-lbl" x="712" y="44">莫斯科</text>' +
      (reduce ? '' : '<circle class="comet" r="2.6"><animateMotion dur="5.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1"><mpath href="#heroRoutePath"/></animateMotion></circle>') +
      '</svg>';
    hero.insertBefore(wrap.firstChild, hero.firstChild);
    var ring = document.createElement('span'); ring.className = 'hero-ring'; ring.setAttribute('aria-hidden', 'true'); hero.appendChild(ring);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', heroRoute); else heroRoute();
})();
