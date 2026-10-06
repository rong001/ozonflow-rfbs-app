/* OzonFlow · 首屏航线点缀：义乌 → 莫斯科，彗星沿弧线飞行；减少动态效果时只显示静态线路 */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Hero 航线：义乌 → 莫斯科，彗星沿弧线飞行 */
  function heroRoute() {
    var hero = document.getElementById('dashHero');
    if (!hero || hero.querySelector('.hero-orbit')) return;
    var NS = 'http://www.w3.org/2000/svg';
    var wrap = document.createElement('div');
    wrap.innerHTML = '<svg class="hero-orbit" viewBox="0 0 1000 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="' + NS + '">' +
      '<defs><linearGradient id="heroRouteGrad" x1="0" x2="1"><stop offset="0" stop-color="#3b6dff" stop-opacity=".15"/><stop offset=".45" stop-color="#5b5cf6" stop-opacity=".7"/><stop offset=".75" stop-color="#8b5cf6" stop-opacity=".7"/><stop offset="1" stop-color="#8b5cf6" stop-opacity=".3"/></linearGradient></defs>' +
      '<path id="heroRoutePath" class="route" d="M 440 72 Q 570 -18 700 40"/>' +
      '<circle class="node" cx="440" cy="72" r="3"/><text class="node-lbl" x="430" y="70" text-anchor="end">义乌</text>' +
      '<circle class="node" cx="700" cy="40" r="3"/><text class="node-lbl" x="712" y="44">莫斯科</text>' +
      (reduce ? '' : '<circle class="comet" r="2.6"><animateMotion dur="5.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1"><mpath href="#heroRoutePath"/></animateMotion></circle>') +
      '</svg>';
    hero.insertBefore(wrap.firstChild, hero.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', heroRoute); else heroRoute();
})();
