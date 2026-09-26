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
    constructor() { this.tweens = []; this._timeScale = 1; this._time = 0; }
    fromTo(target, from, to, duration, position) {
      // Accept the standard GSAP shorthand used by the composition: the
      // fourth argument is the timeline position when `to.duration` exists.
      const hasVarsDuration = to && typeof to.duration === "number";
      const actualDuration = hasVarsDuration ? to.duration : duration;
      const actualPosition = hasVarsDuration && position === undefined ? duration : position;
      this.tweens.push({ elements: elements(target), from, to, duration: Number(actualDuration) || 0, position: Number(actualPosition) || 0, stagger: Number(to.stagger) || 0 });
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
      const hasVarsDuration = to && typeof to.duration === "number";
      const actualDuration = hasVarsDuration ? to.duration : duration;
      const actualPosition = hasVarsDuration && position === undefined ? duration : position;
      this.tweens.push({ elements: els, from, to, duration: Number(actualDuration) || 0, position: Number(actualPosition) || 0, stagger: Number(to.stagger) || 0 });
      return this;
    }
    seek(time) {
      this._time = Number(time) || 0;
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
    totalTime(value) {
      if (value === undefined) return this._time;
      return this.seek(value);
    }
    duration() {
      return this.tweens.reduce((max, tween) => Math.max(max, tween.position + tween.duration + tween.stagger * Math.max(0, tween.elements.length - 1)), 0);
    }
    totalDuration() { return this.duration(); }
    getChildren() { return this.tweens; }
    paused(value) { if (value === undefined) return false; return this; }
    play() { return this; }
    pause() { return this; }
    restart() { return this.seek(0); }
    progress(value) {
      const duration = this.duration() || 1;
      if (value === undefined) return this._time / duration;
      return this.seek(Number(value) * duration);
    }
    timeScale(value) {
      if (value === undefined) return this._timeScale;
      this._timeScale = Number(value) || 1;
      return this;
    }
  }

  window.gsap = { timeline: () => new Timeline() };
})();
