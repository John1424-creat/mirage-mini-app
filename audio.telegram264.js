(function () {
  "use strict";

  const STORAGE_KEY = "mirage.audio.v1";
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  class MirageAudioEngine {
    constructor() {
      this.context = null;
      this.master = null;
      this.music = null;
      this.effects = null;
      this.reverb = null;
      this.noiseBuffer = null;
      this.room = "home";
      this.roomNodes = [];
      this.roomTimers = [];
      this.flightNodes = [];
      this.lastPegAt = 0;
      this.lastUiAt = 0;
      this.cascadeIndex = 0;
      this.settings = this.loadSettings();
    }

    loadSettings() {
      const fallback = { master: true, music: true, effects: true };
      try {
        return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
      } catch (_error) {
        return fallback;
      }
    }

    saveSettings() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch (_error) {
        // Audio preferences remain active for the current session.
      }
    }

    ensure() {
      if (!AudioContextClass) return null;
      if (this.context) return this.context;

      const context = new AudioContextClass({ latencyHint: "interactive" });
      const master = context.createGain();
      const music = context.createGain();
      const effects = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.18;
      music.connect(master);
      effects.connect(master);
      master.connect(compressor);
      compressor.connect(context.destination);

      const reverb = context.createConvolver();
      reverb.buffer = this.createImpulse(context, 1.7, 2.8);
      reverb.connect(effects);

      this.context = context;
      this.master = master;
      this.music = music;
      this.effects = effects;
      this.reverb = reverb;
      this.noiseBuffer = this.createNoiseBuffer(context, 2.2);
      this.applySettings(true);
      return context;
    }

    createNoiseBuffer(context, duration) {
      const length = Math.ceil(context.sampleRate * duration);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let index = 0; index < length; index += 1) {
        const white = Math.random() * 2 - 1;
        previous = previous * 0.985 + white * 0.015;
        data[index] = white * 0.42 + previous * 0.58;
      }
      return buffer;
    }

    createImpulse(context, duration, decay) {
      const length = Math.ceil(context.sampleRate * duration);
      const impulse = context.createBuffer(2, length, context.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let index = 0; index < length; index += 1) {
          const envelope = Math.pow(1 - index / length, decay);
          data[index] = (Math.random() * 2 - 1) * envelope * 0.52;
        }
      }
      return impulse;
    }

    async unlock() {
      const context = this.ensure();
      if (!context) return false;
      if (context.state === "suspended") {
        try {
          await context.resume();
        } catch (_error) {
          return false;
        }
      }
      if (this.roomNodes.length === 0 && this.roomTimers.length === 0) this.startRoom(this.room);
      return context.state === "running";
    }

    applySettings(immediate = false) {
      if (!this.context) {
        this.syncControls();
        return;
      }
      const now = this.context.currentTime;
      const ramp = immediate ? 0.001 : 0.12;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.settings.master ? 0.78 : 0.0001, now, ramp);
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setTargetAtTime(this.settings.music ? 0.68 : 0.0001, now, ramp);
      this.effects.gain.cancelScheduledValues(now);
      this.effects.gain.setTargetAtTime(this.settings.effects ? 0.9 : 0.0001, now, ramp);
      this.syncControls();
    }

    toggle(key) {
      if (!Object.prototype.hasOwnProperty.call(this.settings, key)) return;
      this.settings[key] = !this.settings[key];
      this.saveSettings();
      this.unlock();
      this.applySettings();
    }

    syncControls() {
      document.body.classList.toggle("audio-muted", !this.settings.master);
      document.querySelectorAll("[data-sound-toggle]").forEach((button) => {
        const muted = !this.settings.master;
        button.classList.toggle("muted", muted);
        button.setAttribute("aria-pressed", String(muted));
        button.setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
      });
      document.querySelectorAll("[data-audio-setting]").forEach((button) => {
        const key = button.dataset.audioSetting;
        const checked = Boolean(this.settings[key]);
        button.classList.toggle("active", checked);
        button.setAttribute("aria-checked", String(checked));
        button.disabled = key !== "master" && !this.settings.master;
      });
    }

    bindControls() {
      document.addEventListener("pointerdown", () => this.unlock(), { capture: true, once: true });
      document.querySelectorAll("[data-sound-toggle]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggle("master");
        });
      });
      document.querySelectorAll("[data-audio-setting]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggle(button.dataset.audioSetting);
          this.ui("confirm");
        });
      });
      document.addEventListener("click", (event) => {
        if (event.target.closest("[data-sound-toggle], [data-audio-setting]")) return;
        if (event.target.closest("button")) this.ui("tap");
      });
      document.addEventListener("visibilitychange", () => {
        if (!this.context) return;
        if (document.hidden) this.context.suspend().catch(() => {});
      });
      this.syncControls();
    }

    setRoom(room) {
      this.room = room || "home";
      if (!this.context) return;
      this.stopRoom();
      this.startRoom(this.room);
    }

    stopRoom() {
      this.roomTimers.forEach((timer) => window.clearTimeout(timer));
      this.roomTimers = [];
      const now = this.context?.currentTime || 0;
      this.roomNodes.forEach((entry) => {
        try {
          if (entry.gain) {
            entry.gain.gain.cancelScheduledValues(now);
            entry.gain.gain.setTargetAtTime(0.0001, now, 0.18);
          }
          window.setTimeout(() => entry.node?.stop?.(), 480);
        } catch (_error) {
          // A node may already have ended naturally.
        }
      });
      this.roomNodes = [];
      if (this.room !== "solo") this.stopCarpetFlight(0.08);
    }

    startRoom(room) {
      if (!this.context || this.context.state !== "running") return;
      if (room === "solo") this.startCarpetAmbience();
      if (room === "pvp") this.startPharaohMusic();
    }

    registerRoomNode(node, gain = null) {
      this.roomNodes.push({ node, gain });
      return node;
    }

    makeLoopingNoise(destination, { gain = 0.02, frequency = 900, type = "lowpass" } = {}) {
      const context = this.context;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const level = context.createGain();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = 0.7;
      level.gain.value = gain;
      source.connect(filter);
      filter.connect(level);
      level.connect(destination);
      source.start();
      this.registerRoomNode(source, level);
      return { source, filter, level };
    }

    startCarpetAmbience() {
      const context = this.context;
      this.makeLoopingNoise(this.music, { gain: 0.026, frequency: 720, type: "lowpass" });
      [73.42, 110.0].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        filter.type = "lowpass";
        filter.frequency.value = 460;
        gain.gain.value = index === 0 ? 0.018 : 0.008;
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.music);
        oscillator.start();
        this.registerRoomNode(oscillator, gain);
      });
    }

    startPharaohMusic() {
      const context = this.context;
      this.makeLoopingNoise(this.music, { gain: 0.012, frequency: 480, type: "lowpass" });
      [55, 82.41, 110].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        filter.type = "lowpass";
        filter.frequency.value = 520;
        gain.gain.value = index === 0 ? 0.022 : 0.008;
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.music);
        oscillator.start();
        this.registerRoomNode(oscillator, gain);
      });

      const motif = [293.66, 311.13, 369.99, 392.0, 466.16, 392.0, 369.99, 311.13];
      let index = 0;
      const schedule = () => {
        if (this.room !== "pvp" || !this.context) return;
        if (index % 2 === 0) {
          this.tone({
            frequency: motif[index % motif.length],
            endFrequency: motif[index % motif.length] * 0.995,
            duration: 0.72,
            gain: 0.017,
            type: "triangle",
            destination: this.music,
            reverb: 0.5,
          });
        }
        index += 1;
        const timer = window.setTimeout(schedule, 760);
        this.roomTimers.push(timer);
      };
      schedule();
    }

    tone({
      frequency = 440,
      endFrequency = frequency,
      duration = 0.12,
      gain = 0.08,
      type = "sine",
      delay = 0,
      destination = this.effects,
      reverb = 0,
    } = {}) {
      if (!this.context || this.context.state !== "running") return null;
      const context = this.context;
      const now = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(0.025, duration * 0.25));
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(envelope);
      envelope.connect(destination);
      if (reverb > 0 && this.reverb) {
        const send = context.createGain();
        send.gain.value = reverb;
        envelope.connect(send);
        send.connect(this.reverb);
      }
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
      return oscillator;
    }

    noise({ duration = 0.2, gain = 0.05, frequency = 1200, type = "bandpass", delay = 0 } = {}) {
      if (!this.context || this.context.state !== "running") return;
      const context = this.context;
      const now = context.currentTime + delay;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = type;
      filter.frequency.setValueAtTime(frequency, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.45), now + duration);
      filter.Q.value = type === "bandpass" ? 1.4 : 0.6;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(gain, now + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.effects);
      source.start(now);
      source.stop(now + duration + 0.03);
    }

    ui(kind = "tap") {
      if (!this.settings.master || !this.settings.effects) return;
      const now = performance.now();
      if (now - this.lastUiAt < 42) return;
      this.lastUiAt = now;
      this.unlock().then(() => {
        const confirm = kind === "confirm";
        this.tone({ frequency: confirm ? 520 : 360, endFrequency: confirm ? 690 : 410, duration: 0.075, gain: 0.024, type: "triangle" });
      });
    }

    homeLaunch() {
      this.unlock().then(() => {
        this.noise({ duration: 0.16, gain: 0.045, frequency: 1900, type: "bandpass" });
        this.tone({ frequency: 270, endFrequency: 480, duration: 0.15, gain: 0.032, type: "triangle" });
      });
    }

    homePeg(intensity = 1) {
      if (!this.settings.master || !this.settings.effects) return;
      const now = performance.now();
      if (now - this.lastPegAt < 34) return;
      this.lastPegAt = now;
      const pitch = 760 + Math.random() * 520;
      this.tone({ frequency: pitch, endFrequency: pitch * 0.84, duration: 0.045, gain: 0.014 * Math.min(1.6, intensity), type: "sine" });
    }

    homeLand(multiplier = 1) {
      this.unlock().then(() => {
        const high = multiplier >= 2;
        const root = high ? 392 : 220;
        [1, high ? 1.25 : 1.19, high ? 1.5 : 1.34].forEach((ratio, index) => {
          this.tone({ frequency: root * ratio, endFrequency: root * ratio * 1.015, duration: 0.24 + index * 0.06, delay: index * 0.045, gain: high ? 0.045 : 0.026, type: "triangle", reverb: 0.38 });
        });
      });
    }

    startCarpetFlight() {
      this.unlock().then(() => {
        this.stopCarpetFlight(0.02);
        const context = this.context;
        const flightGain = context.createGain();
        flightGain.gain.value = 0.0001;
        flightGain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.24);
        flightGain.connect(this.effects);

        const wind = context.createBufferSource();
        const windFilter = context.createBiquadFilter();
        wind.buffer = this.noiseBuffer;
        wind.loop = true;
        windFilter.type = "bandpass";
        windFilter.frequency.value = 680;
        windFilter.Q.value = 0.8;
        wind.connect(windFilter);
        windFilter.connect(flightGain);
        wind.start();

        const magic = context.createOscillator();
        const magicGain = context.createGain();
        magic.type = "triangle";
        magic.frequency.value = 92;
        magicGain.gain.value = 0.26;
        magic.connect(magicGain);
        magicGain.connect(flightGain);
        magic.start();
        this.flightNodes = [
          { node: wind, filter: windFilter, gain: flightGain },
          { node: magic, gain: magicGain },
        ];
        this.noise({ duration: 0.28, gain: 0.075, frequency: 1750, type: "bandpass" });
        this.tone({ frequency: 155, endFrequency: 460, duration: 0.32, gain: 0.055, type: "sawtooth", reverb: 0.22 });
      });
    }

    updateCarpetFlight(multiplier = 1) {
      if (!this.context || this.flightNodes.length === 0) return;
      const now = this.context.currentTime;
      const intensity = Math.min(1, Math.log2(Math.max(1, multiplier)) / 4);
      const wind = this.flightNodes[0];
      const magic = this.flightNodes[1];
      wind.filter?.frequency.setTargetAtTime(680 + intensity * 1900, now, 0.12);
      wind.gain?.gain.setTargetAtTime(0.055 + intensity * 0.045, now, 0.16);
      magic.node?.frequency.setTargetAtTime(92 + intensity * 70, now, 0.16);
    }

    stopCarpetFlight(fade = 0.12) {
      if (!this.context || this.flightNodes.length === 0) return;
      const nodes = this.flightNodes;
      this.flightNodes = [];
      const now = this.context.currentTime;
      const rootGain = nodes[0]?.gain;
      rootGain?.gain.cancelScheduledValues(now);
      rootGain?.gain.setTargetAtTime(0.0001, now, Math.max(0.01, fade));
      window.setTimeout(() => {
        nodes.forEach((entry) => {
          try { entry.node?.stop?.(); } catch (_error) {}
        });
      }, Math.max(120, fade * 1000 * 5));
    }

    carpetCashout() {
      this.stopCarpetFlight(0.08);
      [392, 493.88, 587.33, 783.99].forEach((frequency, index) => {
        this.tone({ frequency, endFrequency: frequency * 1.02, duration: 0.42, delay: index * 0.055, gain: 0.05, type: "triangle", reverb: 0.52 });
      });
    }

    carpetCrash() {
      this.stopCarpetFlight(0.025);
      this.noise({ duration: 0.52, gain: 0.12, frequency: 920, type: "lowpass" });
      this.tone({ frequency: 250, endFrequency: 54, duration: 0.58, gain: 0.085, type: "sawtooth", reverb: 0.32 });
      this.tone({ frequency: 610, endFrequency: 130, duration: 0.36, gain: 0.035, type: "triangle", delay: 0.04, reverb: 0.45 });
    }

    pharaohSpin(free = false) {
      this.unlock().then(() => {
        this.noise({ duration: 0.46, gain: free ? 0.075 : 0.055, frequency: 2100, type: "bandpass" });
        [0, 0.09, 0.18, 0.27].forEach((delay, index) => {
          this.tone({ frequency: 210 + index * 32, endFrequency: 150 + index * 18, duration: 0.09, delay, gain: 0.025, type: "triangle" });
        });
      });
    }

    pharaohCascade(win = 0) {
      const index = this.cascadeIndex++ % 6;
      const root = 293.66 * Math.pow(2, index / 12);
      [1, 1.25, 1.5].forEach((ratio, noteIndex) => {
        this.tone({ frequency: root * ratio, endFrequency: root * ratio * 1.01, duration: 0.28, delay: noteIndex * 0.04, gain: win > 0 ? 0.042 : 0.025, type: "triangle", reverb: 0.42 });
      });
    }

    pharaohMultiplier(value = 2) {
      const base = 360 + Math.min(10, value) * 24;
      this.noise({ duration: 0.18, gain: 0.035, frequency: 2800, type: "highpass" });
      [1, 1.5, 2].forEach((ratio, index) => {
        this.tone({ frequency: base * ratio, endFrequency: base * ratio * 1.08, duration: 0.3, delay: index * 0.045, gain: 0.04, type: "triangle", reverb: 0.55 });
      });
    }

    pharaohScatter() {
      [293.66, 369.99, 466.16, 587.33, 739.99].forEach((frequency, index) => {
        this.tone({ frequency, endFrequency: frequency * 1.018, duration: 0.5, delay: index * 0.09, gain: 0.052, type: "triangle", reverb: 0.62 });
      });
      this.noise({ duration: 0.65, gain: 0.045, frequency: 3300, type: "highpass", delay: 0.12 });
    }

    pharaohWin(type = "win") {
      const roots = { win: 293.66, big: 349.23, mega: 392, legend: 466.16, "free-win": 392 };
      const root = roots[type] || roots.win;
      const strong = ["big", "mega", "legend", "free-win"].includes(type);
      const notes = strong ? [1, 1.25, 1.5, 2, 2.5] : [1, 1.25, 1.5];
      notes.forEach((ratio, index) => {
        this.tone({ frequency: root * ratio, endFrequency: root * ratio * 1.012, duration: strong ? 0.72 : 0.38, delay: index * (strong ? 0.09 : 0.055), gain: strong ? 0.058 : 0.035, type: index % 2 ? "sine" : "triangle", reverb: strong ? 0.7 : 0.42 });
      });
      if (strong) this.noise({ duration: 0.65, gain: 0.042, frequency: 3800, type: "highpass", delay: 0.12 });
    }
  }

  const engine = new MirageAudioEngine();
  window.mirageAudio = engine;
  engine.bindControls();
})();
