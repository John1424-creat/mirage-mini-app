(function () {
  "use strict";

  const STORAGE_KEY = "mirage.audio.v1";
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const AUDIO_ROOT = "./assets/audio/v266";
  const SAMPLE_LIBRARY = Object.freeze({
    plinkoPeg1: `${AUDIO_ROOT}/plinko-peg-1.ogg`,
    plinkoPeg2: `${AUDIO_ROOT}/plinko-peg-2.ogg`,
    plinkoPeg3: `${AUDIO_ROOT}/plinko-peg-3.ogg`,
    plinkoPeg4: `${AUDIO_ROOT}/plinko-peg-4.ogg`,
    plinkoPeg5: `${AUDIO_ROOT}/plinko-peg-5.ogg`,
    carpetFlight: `${AUDIO_ROOT}/carpet-flight-wind.mp3`,
    pharaohSpin: `${AUDIO_ROOT}/pharaoh-spin-wheel.mp3`,
    pharaohStop1: `${AUDIO_ROOT}/pharaoh-reel-stop-1.ogg`,
    pharaohStop2: `${AUDIO_ROOT}/pharaoh-reel-stop-2.ogg`,
    pharaohStop3: `${AUDIO_ROOT}/pharaoh-reel-stop-3.ogg`,
    pharaohWinSmall: `${AUDIO_ROOT}/pharaoh-win-small.mp3`,
    pharaohMultiplier: `${AUDIO_ROOT}/pharaoh-multiplier.mp3`,
    pharaohFreeSpins: `${AUDIO_ROOT}/pharaoh-free-spins.mp3`,
    pharaohWinBig: `${AUDIO_ROOT}/pharaoh-win-big.mp3`,
    pharaohWinMega: `${AUDIO_ROOT}/pharaoh-win-mega.mp3`,
    pharaohWinLegend: `${AUDIO_ROOT}/pharaoh-win-legend.mp3`,
    pharaohPayoutTick1: `${AUDIO_ROOT}/pharaoh-payout-tick-1.ogg`,
    pharaohPayoutTick2: `${AUDIO_ROOT}/pharaoh-payout-tick-2.ogg`,
    pharaohPayoutSettle: `${AUDIO_ROOT}/pharaoh-payout-settle.mp3`,
  });

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
      this.samples = new Map();
      this.sampleDataPromise = null;
      this.sampleDecodePromise = null;
      this.activeSampleGroups = new Map();
      this.pegVoices = [];
      this.pegCursor = 0;
      this.reelStopCursor = 0;
      this.nextReelStopAt = 0;
      this.payoutTickAt = 0;
      this.payoutTickCursor = 0;
      this.lastPegAt = 0;
      this.lastUiAt = 0;
      this.cascadeIndex = 0;
      this.debugAudio = new URLSearchParams(window.location.search).get("debugAudio") === "1";
      this.debugTrace = [];
      this.settings = this.loadSettings();
    }

    markDebug(event, detail = "") {
      if (!this.debugAudio) return;
      const root = document.documentElement;
      root.dataset.audioEvent = event;
      root.dataset.audioDetail = String(detail);
      root.dataset.audioEventAt = String(Math.round(performance.now()));
      this.debugTrace.push({ event, detail: String(detail), at: Math.round(performance.now()) });
      this.debugTrace = this.debugTrace.slice(-32);
      root.dataset.audioTrace = JSON.stringify(this.debugTrace);
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

    prefetchSamples() {
      if (this.sampleDataPromise) return this.sampleDataPromise;
      this.sampleDataPromise = Promise.allSettled(Object.entries(SAMPLE_LIBRARY).map(async ([key, url]) => {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Audio ${response.status}: ${url}`);
        return [key, await response.arrayBuffer()];
      })).then((results) => results.flatMap((result) => {
        if (result.status === "fulfilled") return [result.value];
        console.warn("Mirage audio preload failed", result.reason);
        return [];
      }));
      return this.sampleDataPromise;
    }

    decodeSamples() {
      if (this.sampleDecodePromise) return this.sampleDecodePromise;
      const context = this.ensure();
      if (!context) return Promise.resolve(false);
      this.sampleDecodePromise = this.prefetchSamples().then(async (entries) => {
        const decoded = await Promise.all(entries.map(async ([key, data]) => {
          try {
            return [key, await context.decodeAudioData(data.slice(0))];
          } catch (error) {
            console.warn(`Mirage audio decode failed: ${key}`, error);
            return null;
          }
        }));
        decoded.filter(Boolean).forEach(([key, buffer]) => this.samples.set(key, buffer));
        if (this.debugAudio) document.documentElement.dataset.audioSamples = String(this.samples.size);
        return this.samples.size > 0;
      });
      return this.sampleDecodePromise;
    }

    prepare() {
      this.prefetchSamples();
      this.decodeSamples();
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
      await this.decodeSamples();
      if (this.debugAudio) document.documentElement.dataset.audioContext = context.state;
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
      this.prefetchSamples();
      if (document.readyState === "complete") this.prepare();
      else window.addEventListener("load", () => this.prepare(), { once: true });
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
      [
        "pharaoh-spin",
        "pharaoh-cascade",
        "pharaoh-multiplier",
        "pharaoh-feature",
        "pharaoh-round-win",
        "pharaoh-payout-tick",
        "pharaoh-payout-settle",
      ].forEach((group) => this.stopSampleGroup(group, 0.04));
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

      // Game events carry the melody. Keeping the bed static avoids timer and
      // oscillator churn while the slot canvas is animating on mobile WebViews.
    }

    playSample(key, {
      gain = 1,
      rate = 1,
      delay = 0,
      loop = false,
      loopStart = 0,
      loopEnd = 0,
      duration = 0,
      group = "",
      destination = this.effects,
      filter = null,
    } = {}) {
      if (!this.context || this.context.state !== "running") return null;
      const buffer = this.samples.get(key);
      if (!buffer) {
        this.markDebug("sample-missing", key);
        return null;
      }
      const context = this.context;
      const source = context.createBufferSource();
      const level = context.createGain();
      const startAt = context.currentTime + Math.max(0, delay);
      source.buffer = buffer;
      source.playbackRate.value = Math.max(0.5, Math.min(1.75, rate));
      source.loop = loop;
      if (loop) {
        source.loopStart = Math.max(0, Math.min(buffer.duration - 0.05, loopStart));
        source.loopEnd = loopEnd > source.loopStart
          ? Math.min(buffer.duration, loopEnd)
          : Math.max(source.loopStart + 0.05, buffer.duration - 0.04);
      }
      level.gain.value = Math.max(0.0001, gain);
      source.connect(level);

      let output = level;
      let filterNode = null;
      if (filter) {
        filterNode = context.createBiquadFilter();
        filterNode.type = filter.type || "lowpass";
        filterNode.frequency.value = filter.frequency || 4000;
        filterNode.Q.value = filter.q || 0.5;
        level.connect(filterNode);
        output = filterNode;
      }
      output.connect(destination || this.effects);

      const entry = { source, level, filter: filterNode, group };
      if (group) {
        const entries = this.activeSampleGroups.get(group) || [];
        entries.push(entry);
        this.activeSampleGroups.set(group, entries);
      }
      source.addEventListener("ended", () => {
        if (!group) return;
        const entries = this.activeSampleGroups.get(group) || [];
        const next = entries.filter((item) => item !== entry);
        if (next.length) this.activeSampleGroups.set(group, next);
        else this.activeSampleGroups.delete(group);
      }, { once: true });
      source.start(startAt);
      if (!loop && duration > 0) source.stop(startAt + Math.min(duration, buffer.duration));
      this.markDebug("sample", key);
      return entry;
    }

    stopSampleGroup(group, fade = 0.06) {
      if (!this.context) return;
      const entries = this.activeSampleGroups.get(group) || [];
      this.activeSampleGroups.delete(group);
      const now = this.context.currentTime;
      entries.forEach((entry) => {
        try {
          entry.level.gain.cancelScheduledValues(now);
          entry.level.gain.setTargetAtTime(0.0001, now, Math.max(0.008, fade));
          window.setTimeout(() => {
            try { entry.source.stop(); } catch (_error) {}
          }, Math.max(80, fade * 1000 * 5));
        } catch (_error) {
          // Sample may already have ended.
        }
      });
    }

    duckMusic(duration = 0.8, amount = 0.42) {
      if (!this.context || !this.music) return;
      const now = this.context.currentTime;
      const normal = this.settings.music ? 0.68 : 0.0001;
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setTargetAtTime(normal * amount, now, 0.035);
      this.music.gain.setTargetAtTime(normal, now + Math.max(0.18, duration), 0.2);
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
      if (now - this.lastPegAt < 48) return;
      this.lastPegAt = now;
      this.pegVoices = this.pegVoices.filter((entry) => entry?.source && entry.source.buffer);
      while (this.pegVoices.length >= 6) {
        const oldest = this.pegVoices.shift();
        try { oldest?.source.stop(); } catch (_error) {}
      }
      const key = `plinkoPeg${(this.pegCursor % 5) + 1}`;
      this.pegCursor += 1;
      const voice = this.playSample(key, {
        gain: 0.055 * Math.min(1.35, intensity),
        rate: 0.97 + Math.random() * 0.06,
        duration: 0.16,
      });
      if (voice) this.pegVoices.push(voice);
      this.markDebug("plinko-peg", key);
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
        const wind = this.playSample("carpetFlight", {
          gain: 0.024,
          rate: 0.92,
          loop: true,
          loopStart: 0.35,
          group: "carpet-flight",
          filter: { type: "lowpass", frequency: 3600, q: 0.35 },
        });
        this.flightNodes = wind ? [wind] : [];
        this.markDebug("carpet-flight-start", wind ? "sample" : "missing");
        this.noise({ duration: 0.28, gain: 0.075, frequency: 1750, type: "bandpass" });
        this.tone({ frequency: 155, endFrequency: 460, duration: 0.32, gain: 0.055, type: "sawtooth", reverb: 0.22 });
      });
    }

    updateCarpetFlight(multiplier = 1) {
      if (!this.context || this.flightNodes.length === 0) return;
      const now = this.context.currentTime;
      const intensity = Math.min(1, Math.log2(Math.max(1, multiplier)) / 4);
      const wind = this.flightNodes[0];
      wind.filter?.frequency.setTargetAtTime(3400 + intensity * 900, now, 0.3);
      wind.level?.gain.setTargetAtTime(0.024 + intensity * 0.016, now, 0.35);
      wind.source?.playbackRate.setTargetAtTime(0.92 + intensity * 0.08, now, 0.3);
    }

    stopCarpetFlight(fade = 0.12) {
      if (!this.context || this.flightNodes.length === 0) return;
      this.flightNodes = [];
      this.stopSampleGroup("carpet-flight", fade);
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

    pharaohSpinStart(free = false) {
      this.unlock().then(() => {
        this.stopSampleGroup("pharaoh-spin", 0.025);
        this.cascadeIndex = 0;
        this.reelStopCursor = 0;
        this.nextReelStopAt = this.context.currentTime;
        this.playSample("pharaohSpin", {
          gain: free ? 0.12 : 0.095,
          rate: free ? 1.04 : 1,
          loop: true,
          loopStart: 0.18,
          group: "pharaoh-spin",
          filter: { type: "lowpass", frequency: 5600, q: 0.35 },
        });
        this.markDebug("pharaoh-spin-start", free ? "free" : "base");
      });
    }

    pharaohSpin(free = false) {
      this.pharaohSpinStart(free);
    }

    pharaohReelStop(column = 0) {
      const key = `pharaohStop${(this.reelStopCursor % 3) + 1}`;
      this.reelStopCursor += 1;
      const now = this.context?.currentTime || 0;
      const delay = Math.max(0, this.nextReelStopAt - now);
      this.nextReelStopAt = now + delay + 0.045;
      this.playSample(key, {
        gain: 0.105,
        rate: 0.96 + Math.min(5, column) * 0.012,
        delay,
        duration: 0.28,
      });
      this.markDebug("pharaoh-reel-stop", column);
    }

    pharaohSpinSettled() {
      this.stopSampleGroup("pharaoh-spin", 0.045);
      this.markDebug("pharaoh-spin-settled");
    }

    pharaohCascadeDrop() {
      const key = `pharaohStop${(this.reelStopCursor % 3) + 1}`;
      this.reelStopCursor += 1;
      this.playSample(key, { gain: 0.075, rate: 1.08, duration: 0.24 });
      this.markDebug("pharaoh-cascade-drop");
    }

    pharaohCascade(win = 0) {
      const index = this.cascadeIndex++ % 6;
      this.playSample("pharaohWinSmall", {
        gain: win > 0 ? 0.13 : 0.09,
        rate: 0.98 + index * 0.025,
        duration: 1.35,
        group: "pharaoh-cascade",
      });
      this.duckMusic(0.7, 0.68);
      this.markDebug("pharaoh-win-reveal", Math.round(win));
    }

    pharaohMultiplier(value = 2) {
      this.playSample("pharaohMultiplier", {
        gain: 0.16,
        rate: Math.min(1.18, 0.98 + Math.log2(Math.max(2, value)) * 0.025),
        duration: 1.8,
        group: "pharaoh-multiplier",
      });
      this.duckMusic(1.1, 0.55);
      this.markDebug("pharaoh-multiplier", value);
    }

    pharaohScatter() {
      this.stopSampleGroup("pharaoh-spin", 0.035);
      this.playSample("pharaohFreeSpins", { gain: 0.18, duration: 3.6, group: "pharaoh-feature" });
      this.duckMusic(2.8, 0.3);
      this.markDebug("pharaoh-free-spins");
    }

    pharaohWin(type = "win") {
      const keys = {
        win: "pharaohWinSmall",
        big: "pharaohWinBig",
        mega: "pharaohWinMega",
        legend: "pharaohWinLegend",
        "free-win": "pharaohWinMega",
      };
      const strong = ["big", "mega", "legend", "free-win"].includes(type);
      this.stopSampleGroup("pharaoh-cascade", 0.04);
      this.playSample(keys[type] || keys.win, {
        gain: strong ? 0.19 : 0.125,
        duration: type === "legend" ? 6.5 : strong ? 4.2 : 1.6,
        group: "pharaoh-round-win",
      });
      this.duckMusic(strong ? 3.8 : 1.1, strong ? 0.24 : 0.58);
      this.markDebug("pharaoh-round-win", type);
    }

    pharaohPayoutStart(type = "win") {
      this.stopSampleGroup("pharaoh-cascade", 0.035);
      this.stopSampleGroup("pharaoh-payout-tick", 0.02);
      this.stopSampleGroup("pharaoh-payout-settle", 0.02);
      this.payoutTickAt = 0;
      this.payoutTickCursor = 0;
      if (["big", "mega", "legend", "free-win"].includes(type)) this.pharaohWin(type);
      else this.duckMusic(1.1, 0.62);
      this.markDebug("pharaoh-payout-start", type);
    }

    pharaohPayoutTick(progress = 0, type = "win") {
      if (!this.settings.master || !this.settings.effects) return;
      const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
      const strong = ["big", "mega", "legend", "free-win"].includes(type);
      const interval = (strong ? 112 : 125) - normalized * (strong ? 34 : 38);
      const now = performance.now();
      if (now - this.payoutTickAt < interval) return;
      this.payoutTickAt = now;
      const key = this.payoutTickCursor % 2 === 0 ? "pharaohPayoutTick1" : "pharaohPayoutTick2";
      this.payoutTickCursor += 1;
      this.playSample(key, {
        gain: strong ? 0.054 : 0.047,
        rate: 0.92 + normalized * 0.16 + (this.payoutTickCursor % 3) * 0.012,
        group: "pharaoh-payout-tick",
        filter: { type: "highpass", frequency: 430, q: 0.2 },
      });
      this.markDebug("pharaoh-payout-tick", Math.round(normalized * 100));
    }

    pharaohPayoutComplete(type = "win") {
      this.stopSampleGroup("pharaoh-payout-tick", 0.025);
      const strong = ["big", "mega", "legend", "free-win"].includes(type);
      this.playSample("pharaohPayoutSettle", {
        gain: strong ? 0.145 : 0.115,
        rate: strong ? 1.04 : 0.98,
        duration: 1.25,
        group: "pharaoh-payout-settle",
      });
      this.duckMusic(0.9, strong ? 0.44 : 0.62);
      this.markDebug("pharaoh-payout-complete", type);
    }
  }

  const engine = new MirageAudioEngine();
  window.mirageAudio = engine;
  engine.bindControls();
})();
