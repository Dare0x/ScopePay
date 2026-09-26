(function () {
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function ease(name, value) {
    if (name === "power2.in") return value * value;
    if (name === "power2.out") return 1 - Math.pow(1 - value, 2);
    if (name === "power3.out") return 1 - Math.pow(1 - value, 3);
    return value;
  }

  function elements(target) {
    if (typeof target !== "string") return [target];
    return Array.from(document.querySelectorAll(target));
  }

  function apply(element, values) {
    const x = values.x ?? 0;
    const y = values.y ?? 0;
    const scale = values.scale ?? 1;
    if (values.opacity !== undefined) element.style.opacity = String(values.opacity);
    if (values.x !== undefined || values.y !== undefined || values.scale !== undefined) {
      element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    }
  }

  class Timeline {
    constructor() { this.tweens = []; }
    fromTo(target, from, to, duration, position) {
      this.tweens.push({ elements: elements(target), from, to, duration, position: Number(position) || 0, stagger: Number(to.stagger) || 0 });
      return this;
    }
    to(target, to, duration, position) {
      const els = elements(target);
      const from = {};
      els.forEach((element) => {
        if (to.opacity !== undefined) from.opacity = Number(element.style.opacity || 1);
        if (to.x !== undefined || to.y !== undefined || to.scale !== undefined) {
          from.x = 0; from.y = 0; from.scale = 1;
        }
      });
      this.tweens.push({ elements: els, from, to, duration, position: Number(position) || 0, stagger: Number(to.stagger) || 0 });
      return this;
    }
    seek(time) {
      this.tweens.forEach((tween) => {
        tween.elements.forEach((element, index) => {
          const start = tween.position + index * tween.stagger;
          const progress = clamp((time - start) / tween.duration, 0, 1);
          const eased = ease(tween.to.ease, progress);
          const values = {};
          ["opacity", "x", "y", "scale"].forEach((key) => {
            if (tween.from[key] !== undefined || tween.to[key] !== undefined) {
              const from = Number(tween.from[key] ?? (key === "opacity" ? 1 : key === "scale" ? 1 : 0));
              const to = Number(tween.to[key] ?? from);
              values[key] = from + (to - from) * eased;
            }
          });
          apply(element, values);
        });
      });
      return this;
    }
  }

  window.gsap = { timeline: () => new Timeline() };
})();
