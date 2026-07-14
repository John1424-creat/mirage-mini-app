const state = {
  balance: 12500,
  games: 0,
  net: 0,
  dailyClaimed: false,
  risk: "low",
  homeRisk: "medium",
  homeRows: 13,
  homeStake: 10,
  homeRuns: 1,
  homeAutoBalls: 10,
  homeMode: "manual",
  carpet: {
    status: "READY",
    mode: "manual",
    betMode: "manual",
    autoCashout: 1.2,
    autoRuns: 10,
    autoRunsRemaining: 0,
    autoRunning: false,
    stake: 10,
    minStake: 5,
    maxStake: 10000,
    stakeStep: 5,
    round: null,
    multiplier: 1,
    crashPoint: null,
    roundStartedAt: null,
    animationFrameId: null,
    cashedOutMultiplier: null,
    pendingCashout: false,
    payout: 0,
    protectedRoundsPlayed: 0,
    history: [],
  },
  tier: "cheap",
  balls: 10,
  ledger: [
    { label: "Стартовый тестовый баланс", amount: 12500 },
    { label: "Daily streak: день 3", amount: 25 },
    { label: "Тестовый PvP entry", amount: -100 },
  ],
};

const RTP = 0.95;
const HOME_ROWS_MIN = 8;
const HOME_ROWS_MAX = 16;
const HOME_STAKE_MIN = 5;
const HOME_STAKE_STEP = 5;
const HOME_STAKE_MAX = 10000;
const HOME_AUTO_BALL_MIN = 10;
const HOME_AUTO_BALL_MAX = 1000;
const HOME_AUTO_BALL_OPTIONS = [10, 20, 50, 100, 1000];
const HOME_AUTO_MAX_ACTIVE_BALLS = 34;
const HOME_MANUAL_MAX_ACTIVE_BALLS = 40;
const HOME_AUTO_BALL_DURATION = 5400;
const HOME_EFFECT_GOOD_MULTIPLIER = 2;
const HOME_EFFECT_COIN_COUNT = 16;
const HOME_MONKEY_INNER_COIN_COUNT = 10;
const HOME_MONKEY_EDGE_COIN_COUNT = 18;
const HOME_BALL_RADIUS = 4.4;
const HOME_PEG_RADIUS = 3.6;
const HOME_PHYSICS_GRAVITY = 158;
const HOME_PHYSICS_RESTITUTION = 0.62;
const HOME_PHYSICS_WALL_RESTITUTION = 0.46;
const HOME_MATTER_STEP_MS = 1000 / 60;
const HOME_MATTER_MAX_STEPS = 620;
const HOME_MATTER_REPLAY_SLOWDOWN = 1.2;
const CARPET_RTP = 0.95;
const CARPET_PROTECTED_ROUNDS = 3;
const CARPET_MIN_PROTECTED_CRASH = 1.1;
const CARPET_DOUBLE_TIME_MS = 6000;
const CARPET_GROWTH_RATE = Math.log(2) / CARPET_DOUBLE_TIME_MS;
const CARPET_MAX_CRASH_DISPLAY = 100;
const CARPET_HISTORY_LIMIT = 7;
const CARPET_AUTO_CASHOUT_MIN = 1.01;
const CARPET_AUTO_CASHOUT_MAX = 20;
const CARPET_AUTO_CASHOUT_STEP = 0.05;
const CARPET_AUTO_RUNS_MIN = 1;
const CARPET_AUTO_RUNS_MAX = 1000;
const CARPET_AUTO_RUNS_STEP = 1;
const CARPET_ENTROPY_MAX = 0x100000000;
const CARPET_TRAIL_ENABLED = false;
const CARPET_TRAIL_MAX_PARTICLES = 24;
const CARPET_TRAIL_IDLE_PARTICLES = 8;
const multiplierCache = new Map();
const carpetTrail = {
  particles: [],
  points: [],
  frameId: null,
  lastTime: 0,
  lastEmit: 0,
  lastX: 0,
  lastY: 0,
  lastStatus: "READY",
};
const carpetSparks = {
  frameId: null,
  lastEmit: 0,
};

function getHomeStakeDecreaseStep(value) {
  if (value > 5000) return 1000;
  if (value > 1000) return 500;
  if (value > 100) return 50;
  return HOME_STAKE_STEP;
}

function getHomeAutoProgress(value) {
  const marks = HOME_AUTO_BALL_OPTIONS;
  if (value <= marks[0]) return 0;
  if (value >= marks[marks.length - 1]) return 1;

  for (let index = 0; index < marks.length - 1; index += 1) {
    const from = marks[index];
    const to = marks[index + 1];
    if (value <= to) {
      const localProgress = (value - from) / (to - from);
      return (index + localProgress) / (marks.length - 1);
    }
  }

  return 1;
}

function getHomeAutoBallsFromProgress(progress) {
  const marks = HOME_AUTO_BALL_OPTIONS;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const segment = clampedProgress * (marks.length - 1);
  const index = Math.min(marks.length - 2, Math.floor(segment));
  const localProgress = segment - index;
  const value = marks[index] + (marks[index + 1] - marks[index]) * localProgress;
  return Math.max(HOME_AUTO_BALL_MIN, Math.min(HOME_AUTO_BALL_MAX, Math.round(value)));
}

function getHomeAutoSpawnInterval(total) {
  if (total <= 20) return 430;
  if (total <= 50) return 315;
  if (total <= 100) return 235;
  if (total <= 250) return 190;
  return 160;
}

const riskProfiles = {
  low: { base: 0.72, edge: 2.4, power: 1.7 },
  medium: { base: 0.22, edge: 12, power: 3 },
  high: { base: 0, edge: 130, power: 5.5 },
};

function combination(n, k) {
  let result = 1;
  const limit = Math.min(k, n - k);
  for (let i = 1; i <= limit; i += 1) {
    result = (result * (n - limit + i)) / i;
  }
  return result;
}

function slotProbability(rows, slot) {
  return combination(rows, slot) / 2 ** rows;
}

const homeMatterSlotProbabilities = {
  8: [0.138667, 0.060333, 0.093667, 0.129334, 0.156, 0.129334, 0.093667, 0.060333, 0.138667],
  9: [0.116334, 0.059, 0.096, 0.113667, 0.115, 0.115, 0.113667, 0.096, 0.059, 0.116334],
  10: [0.076333, 0.059333, 0.083666, 0.105, 0.116333, 0.118667, 0.116333, 0.105, 0.083666, 0.059333, 0.076333],
  11: [0.078333, 0.063334, 0.067667, 0.080667, 0.098, 0.112, 0.112, 0.098, 0.080667, 0.067667, 0.063334, 0.078333],
  12: [0.087667, 0.065333, 0.072334, 0.072, 0.080334, 0.081, 0.082667, 0.081, 0.080334, 0.072, 0.072334, 0.065333, 0.087667],
  13: [0.052, 0.063333, 0.063666, 0.071667, 0.083333, 0.081, 0.085, 0.085, 0.081, 0.083333, 0.071667, 0.063666, 0.063333, 0.052],
  14: [0.043667, 0.043667, 0.054667, 0.070667, 0.077667, 0.078, 0.088667, 0.086, 0.088667, 0.078, 0.077667, 0.070667, 0.054667, 0.043667, 0.043667],
  15: [0.033333, 0.035, 0.048, 0.061667, 0.076, 0.082667, 0.082667, 0.080667, 0.080667, 0.082667, 0.082667, 0.076, 0.061667, 0.048, 0.035, 0.033333],
  16: [0.039333, 0.039333, 0.043667, 0.055333, 0.058, 0.067667, 0.085666, 0.08, 0.062, 0.08, 0.085666, 0.067667, 0.058, 0.055333, 0.043667, 0.039333, 0.039333],
};

function getHomeSlotProbabilities(rows) {
  const calibrated = homeMatterSlotProbabilities[rows];
  if (calibrated && calibrated.length === rows + 1) return calibrated;
  return Array.from({ length: rows + 1 }, (_, slot) => slotProbability(rows, slot));
}

function getMultipliers(rows, risk) {
  const key = `${rows}:${risk}`;
  if (multiplierCache.has(key)) return multiplierCache.get(key);

  const profile = riskProfiles[risk] || riskProfiles.medium;
  const center = rows / 2;
  const probabilities = getHomeSlotProbabilities(rows);
  const raw = Array.from({ length: rows + 1 }, (_, slot) => {
    const distance = Math.abs(slot - center) / center;
    return profile.base + profile.edge * distance ** profile.power;
  });
  const expected = raw.reduce((sum, value, slot) => sum + value * (probabilities[slot] || 0), 0);
  const scaled = raw.map((value) => value * (RTP / expected));
  multiplierCache.set(key, scaled);
  return scaled;
}

function formatMultiplier(value) {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2).replace(/0$/, "");
  return value.toFixed(2);
}

const riskLimits = {
  low: 10000,
  medium: 5064,
  high: 998,
};

const tiers = {
  cheap: 10,
  medium: 50,
  expensive: 250,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function format(value) {
  return Math.round(value).toLocaleString("ru-RU");
}

function floorMultiplier(value) {
  return Math.floor(value * 100) / 100;
}

function formatCarpetMultiplier(value) {
  return floorMultiplier(value).toFixed(2);
}

function getCarpetRandomUnit() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return Math.max((values[0] + 1) / (CARPET_ENTROPY_MAX + 1), Number.EPSILON);
  }
  return Math.max(Math.random(), Number.EPSILON);
}

const carpetEngine = {
  createRound({ protectedRoundsPlayed }) {
    const entropy = getCarpetRandomUnit();
    let crashPoint = CARPET_RTP / entropy;
    const protectedRound = protectedRoundsPlayed < CARPET_PROTECTED_ROUNDS;

    if (protectedRound) {
      crashPoint = Math.max(crashPoint, CARPET_MIN_PROTECTED_CRASH);
    }

    return {
      id: `${Date.now().toString(36)}-${Math.floor(entropy * 1e9).toString(36)}`,
      crashPoint,
      protectedRound,
      createdAt: Date.now(),
    };
  },

  getMultiplier(elapsedMs) {
    return Math.exp(CARPET_GROWTH_RATE * Math.max(0, elapsedMs));
  },

  getProgress(multiplier) {
    return Math.max(0, Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(10)));
  },

  lockMultiplier(multiplier) {
    return floorMultiplier(Math.max(1, multiplier));
  },

  getPayout(stake, multiplier) {
    return Math.floor(stake * this.lockMultiplier(multiplier));
  },

  shouldAutoCashout({ mode, autoCashout, crashPoint, multiplier }) {
    return mode === "auto" && autoCashout <= crashPoint && multiplier >= autoCashout;
  },

  shouldCrash({ crashPoint, multiplier }) {
    return multiplier >= crashPoint;
  },
};

function generateCarpetCrashPoint() {
  return carpetEngine.createRound({
    protectedRoundsPlayed: state.carpet.protectedRoundsPlayed,
  }).crashPoint;
}

function getCarpetMultiplier(elapsedMs) {
  return carpetEngine.getMultiplier(elapsedMs);
}

function getCarpetProgress(multiplier) {
  return carpetEngine.getProgress(multiplier);
}

function addLedger(label, amount) {
  state.ledger.unshift({ label, amount });
  state.ledger = state.ledger.slice(0, 8);
  state.net += amount;
  render();
}

function setBalance(next) {
  state.balance = Math.max(0, Math.round(next));
  render();
}

function render() {
  ["balance-value", "solo-balance", "carpet-balance", "pvp-balance", "wallet-balance"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = format(state.balance);
  });

  const dailyStatus = $("#daily-status");
  if (dailyStatus) dailyStatus.textContent = state.dailyClaimed ? "Следующий бонус через 24ч" : "Бонус доступен";
  const statGames = $("#stat-games");
  if (statGames) statGames.textContent = state.games;
  const statProfit = $("#stat-profit");
  if (statProfit) statProfit.textContent = format(state.net);
  renderDaily();
  renderLedger("#home-ledger");
  renderLedger("#wallet-ledger");
  renderSlots();
  updateLimits();
  renderHomeControls();
  renderCarpet();
}

function renderHomeControls() {
  const homeStake = $("#home-stake");
  if (homeStake) {
    homeStake.textContent = format(state.homeStake);
    homeStake.dataset.digits = String(state.homeStake).length >= 5 ? "long" : String(state.homeStake).length >= 4 ? "medium" : "short";
  }
  const homeRuns = $("#home-runs");
  const activeRuns = state.homeMode === "auto" ? state.homeAutoBalls : 1;
  state.homeRuns = activeRuns;
  if (homeRuns) homeRuns.textContent = 1;
  const homeLines = $("#home-lines-value");
  if (homeLines) homeLines.textContent = state.homeRows;
  const autoScale = $("#home-auto-scale");
  const autoProgress = getHomeAutoProgress(state.homeAutoBalls);
  if (autoScale) {
    autoScale.classList.toggle("show", state.homeMode === "auto");
    autoScale.style.setProperty("--auto-progress", autoProgress);
  }
  const autoRange = $("#home-auto-range");
  if (autoRange) autoRange.value = Math.round(autoProgress * 1000);
  const autoValue = $("#home-auto-value");
  if (autoValue) autoValue.textContent = `${format(state.homeAutoBalls)} шариков`;
  $$("[data-auto-balls]").forEach((button) => {
    const autoBalls = Number(button.dataset.autoBalls);
    button.classList.toggle("selected", Math.abs(getHomeAutoProgress(autoBalls) - autoProgress) <= 0.018);
  });
}

function renderCarpet() {
  const carpet = state.carpet;
  const stage = $("#carpet-stage");
  if (!stage) return;

  const displayMultiplier = Math.min(CARPET_MAX_CRASH_DISPLAY, carpet.multiplier);
  const progress = getCarpetProgress(displayMultiplier);
  const x = Math.pow(progress, 0.72) * 184;
  const y = Math.pow(progress, 1.28) * -226;
  const scale = 1;
  const rotate = -8 + progress * 12;

  stage.style.setProperty("--carpet-progress", progress.toFixed(4));
  stage.classList.toggle("ready", carpet.status === "READY");
  stage.classList.toggle("flying", carpet.status === "FLYING" || carpet.status === "STARTING");
  stage.classList.toggle("cashed", carpet.status === "CASHED_OUT");
  stage.classList.toggle("message", ["CASHED_OUT", "CRASHED", "STARTING"].includes(carpet.status));
  stage.classList.toggle("crashed", carpet.status === "CRASHED");
  const screen = $("#screen-solo");
  if (screen) {
    screen.classList.toggle("carpet-ready", carpet.status === "READY");
    screen.classList.toggle("carpet-flying", carpet.status === "FLYING" || carpet.status === "STARTING");
    screen.classList.toggle("carpet-cashed", carpet.status === "CASHED_OUT");
    screen.classList.toggle("carpet-crashed", carpet.status === "CRASHED");
  }

  const hero = $("#carpet-hero-wrap");
  if (hero) {
    hero.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
    hero.style.setProperty("--crash-x", `${x}px`);
    hero.style.setProperty("--crash-y", `${y}px`);
  }
  const flightFx = $("#carpet-flight-fx");
  if (flightFx) {
    flightFx.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
    flightFx.style.setProperty("--crash-x", `${x}px`);
    flightFx.style.setProperty("--crash-y", `${y}px`);
  }
  updateCarpetTrailEmitter();
  updateCarpetMagicSparks();

  const multiplier = $("#carpet-multiplier");
  if (multiplier) multiplier.textContent = `${formatCarpetMultiplier(displayMultiplier)}x`;

  const status = $("#carpet-status");
  if (status) {
    if (carpet.status === "STARTING") status.textContent = "КОВЕР ГОТОВИТСЯ";
    else if (carpet.status === "CASHED_OUT") status.textContent = `ЗАБРАНО ${format(carpet.payout)} КРИСТАЛЛОВ`;
    else if (carpet.status === "CRASHED") status.textContent = "БУРЯ НАСТИГЛА КОВЕР";
    else status.textContent = "ГОТОВ К ПОЛЕТУ";
  }

  const autoCounter = $("#carpet-auto-counter");
  if (autoCounter) {
    const showCounter = carpet.autoRunning || carpet.autoRunsRemaining > 0;
    autoCounter.classList.toggle("show", showCounter);
    autoCounter.textContent = `ОСТАЛОСЬ ${format(carpet.autoRunsRemaining)}`;
  }

  const label = $("#carpet-action-label");
  const payout = $("#carpet-live-payout");
  const button = $("#carpet-action-button");
  if (label) {
    if (carpet.autoRunning && (carpet.status === "READY" || carpet.status === "STARTING")) label.textContent = "СТОП";
    else if (carpet.status === "FLYING" || carpet.status === "STARTING") label.textContent = "ЗАБРАТЬ";
    else if (carpet.status === "CASHED_OUT") label.textContent = "ЗАБРАНО";
    else if (carpet.status === "CRASHED") label.textContent = "БУРЯ";
    else label.textContent = "СТАРТ";
  }
  if (payout) {
    payout.textContent = "";
  }
  if (button) {
    button.classList.toggle("flying", carpet.status === "FLYING" || carpet.status === "STARTING");
    button.classList.toggle("lost", carpet.status === "CRASHED");
    button.disabled = false;
  }

  const stake = $("#carpet-stake");
  if (stake) {
    stake.textContent = format(carpet.stake);
    stake.dataset.digits = String(carpet.stake).length >= 5 ? "long" : String(carpet.stake).length >= 4 ? "medium" : "short";
  }

  const autoCashout = $("#carpet-autocash");
  if (autoCashout) autoCashout.classList.toggle("show", carpet.mode === "auto");
  const autoCashoutValue = $("#carpet-cashout-value");
  if (autoCashoutValue) autoCashoutValue.textContent = `${carpet.autoCashout.toFixed(2)}X`;
  $$("[data-carpet-mode]").forEach((modeButton) => {
    modeButton.classList.toggle("selected", modeButton.dataset.carpetMode === carpet.mode);
    modeButton.disabled = carpet.status !== "READY";
  });
  const autoStarts = $("#carpet-autostarts");
  if (autoStarts) autoStarts.classList.toggle("show", carpet.betMode === "auto");
  const runsValue = $("#carpet-runs-value");
  if (runsValue) runsValue.textContent = format(carpet.autoRuns);
  $$("[data-carpet-bet-mode]").forEach((modeButton) => {
    modeButton.classList.toggle("selected", modeButton.dataset.carpetBetMode === carpet.betMode);
    modeButton.disabled = carpet.status !== "READY";
  });

  ["carpet-stake-minus", "carpet-stake-plus", "carpet-stake-double", "carpet-stake-max", "carpet-cashout-minus", "carpet-cashout-plus", "carpet-runs-minus", "carpet-runs-plus"].forEach((id) => {
    const control = document.getElementById(id);
    if (control) control.disabled = carpet.status !== "READY";
  });

  const history = $("#carpet-history");
  if (history) {
    history.innerHTML = "";
    const title = document.createElement("span");
    title.className = "carpet-history-title";
    title.textContent = "ПОЛЕТЫ";
    history.appendChild(title);

    const rounds = carpet.history.slice(0, 5);
    for (let index = 0; index < 5; index += 1) {
      const round = rounds[index];
      const chip = document.createElement("span");
      chip.className = round ? `carpet-chip ${round.result}` : "carpet-chip unknown";
      chip.textContent = round ? formatCarpetMultiplier(round.multiplier) : "?";
      history.appendChild(chip);
    }
  }
}

function getCarpetTrailCanvas() {
  return $("#carpet-trail-canvas");
}

function getCarpetSparkLayer() {
  return $("#carpet-magic-sparks");
}

function getCarpetTrailPoint() {
  const screen = $("#screen-solo");
  const hero = $("#carpet-hero-wrap");
  if (!screen || !hero) return { x: carpetTrail.lastX, y: carpetTrail.lastY };

  const screenRect = screen.getBoundingClientRect();
  const heroRect = hero.getBoundingClientRect();
  return {
    x: heroRect.left - screenRect.left + heroRect.width * 0.16,
    y: heroRect.top - screenRect.top + heroRect.height * 0.7,
  };
}

function resetCarpetTrail() {
  carpetTrail.points = [];
  carpetTrail.particles = [];
  carpetTrail.lastEmit = 0;
}

function updateCarpetTrailEmitter() {
  if (!CARPET_TRAIL_ENABLED) {
    resetCarpetTrail();
    return;
  }
  const point = getCarpetTrailPoint();
  const jump = Math.hypot(point.x - carpetTrail.lastX, point.y - carpetTrail.lastY);
  if (jump > 96 || (carpetTrail.lastStatus !== state.carpet.status && state.carpet.status === "STARTING")) {
    resetCarpetTrail();
  }
  carpetTrail.lastX = point.x;
  carpetTrail.lastY = point.y;
  carpetTrail.lastStatus = state.carpet.status;
  const active = ["STARTING", "FLYING", "CASHED_OUT"].includes(state.carpet.status);
  if (active || carpetTrail.particles.length > 0) startCarpetTrailRenderer();
}

function resizeCarpetTrailCanvas(canvas) {
  const screen = $("#screen-solo");
  if (!screen || !canvas) return null;
  const rect = screen.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  return { width, height, ratio };
}

function addCarpetTrailParticle(now, power = 1) {
  const flying = state.carpet.status === "FLYING" || state.carpet.status === "STARTING";
  const cashed = state.carpet.status === "CASHED_OUT";
  const baseLife = cashed ? 620 : flying ? 760 : 520;
  const spread = flying ? 12 : 6;
  const drift = flying ? 28 : 12;
  const particle = {
    x: carpetTrail.lastX + (Math.random() - 0.5) * spread,
    y: carpetTrail.lastY + (Math.random() - 0.5) * spread * 0.55,
    vx: -drift - Math.random() * 32 * power,
    vy: (Math.random() - 0.5) * 15 - 4,
    life: baseLife + Math.random() * 340,
    born: now,
    size: 12 + Math.random() * 20 * power,
    stretch: 2.2 + Math.random() * 1.8,
    hue: Math.random(),
    spin: -0.2 + Math.random() * 0.4,
    alpha: 0.18 + Math.random() * 0.18,
  };
  carpetTrail.particles.push(particle);
  if (carpetTrail.particles.length > CARPET_TRAIL_MAX_PARTICLES) carpetTrail.particles.shift();
}

function drawCarpetTrailParticle(ctx, particle, age) {
  const progress = Math.min(1, age / particle.life);
  const alpha = particle.alpha * Math.sin((1 - progress) * Math.PI * 0.5);
  if (alpha <= 0.01) return;

  const palette = particle.hue < 0.48
    ? [96, 178, 255]
    : particle.hue < 0.76
      ? [226, 92, 255]
      : [255, 221, 126];
  const radius = particle.size * (0.7 + progress * 0.7);

  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(-0.16 + particle.spin + progress * 0.12);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * particle.stretch);
  gradient.addColorStop(0, `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, ${alpha})`);
  gradient.addColorStop(0.42, `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, ${alpha * 0.34})`);
  gradient.addColorStop(1, `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * particle.stretch, radius * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCarpetTrailRibbon(ctx, now) {
  const points = carpetTrail.points.filter((point) => now - point.t < 1180);
  carpetTrail.points = points;
  if (points.length < 2) return;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const age = now - to.t;
    const fade = Math.max(0, 1 - age / 1180);
    const width = 30 * fade + 8;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 7 * fade;
    ctx.shadowColor = `rgba(97, 178, 255, ${0.34 * fade})`;
    ctx.strokeStyle = `rgba(91, 168, 255, ${0.12 * fade})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.shadowBlur = 5 * fade;
    ctx.shadowColor = `rgba(221, 96, 255, ${0.28 * fade})`;
    ctx.strokeStyle = `rgba(218, 90, 255, ${0.1 * fade})`;
    ctx.lineWidth = width * 0.54;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y + 2);
    ctx.lineTo(to.x, to.y + 1);
    ctx.stroke();

    ctx.shadowBlur = 3 * fade;
    ctx.shadowColor = `rgba(255, 221, 126, ${0.24 * fade})`;
    ctx.strokeStyle = `rgba(255, 226, 139, ${0.16 * fade})`;
    ctx.lineWidth = Math.max(2, width * 0.12);
    ctx.beginPath();
    ctx.moveTo(from.x + 3, from.y - 2);
    ctx.lineTo(to.x + 2, to.y - 1);
    ctx.stroke();
    ctx.restore();
  }
}

function renderCarpetTrailFrame(now = performance.now()) {
  if (!CARPET_TRAIL_ENABLED) {
    resetCarpetTrail();
    carpetTrail.frameId = null;
    const canvas = getCarpetTrailCanvas();
    const ctx = canvas?.getContext?.("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const canvas = getCarpetTrailCanvas();
  if (!canvas) {
    carpetTrail.frameId = null;
    return;
  }

  const dimensions = resizeCarpetTrailCanvas(canvas);
  if (!dimensions) {
    carpetTrail.frameId = null;
    return;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dimensions.ratio, 0, 0, dimensions.ratio, 0, 0);
  ctx.clearRect(0, 0, dimensions.width, dimensions.height);

  const activeTab = document.body.dataset.activeTab === "solo";
  const status = state.carpet.status;
  const flying = activeTab && (status === "FLYING" || status === "STARTING");
  const cashed = activeTab && status === "CASHED_OUT";
  const ready = activeTab && status === "READY";
  const interval = flying ? 42 : cashed ? 28 : 260;
  const canEmit = flying || cashed || (ready && carpetTrail.particles.length < CARPET_TRAIL_IDLE_PARTICLES);

  if (canEmit && now - carpetTrail.lastEmit > interval) {
    const count = cashed ? 3 : flying ? 2 : 1;
    for (let index = 0; index < count; index += 1) addCarpetTrailParticle(now, cashed ? 1.25 : flying ? 1 : 0.42);
    carpetTrail.lastEmit = now;
  }

  if (flying || cashed) {
    const lastPoint = carpetTrail.points[carpetTrail.points.length - 1];
    const moved = !lastPoint || Math.hypot(carpetTrail.lastX - lastPoint.x, carpetTrail.lastY - lastPoint.y) > 1.4;
    if (moved || now - lastPoint.t > 55) {
      carpetTrail.points.push({ x: carpetTrail.lastX, y: carpetTrail.lastY, t: now });
      if (carpetTrail.points.length > 22) carpetTrail.points.shift();
    }
  }

  drawCarpetTrailRibbon(ctx, now);

  carpetTrail.particles = carpetTrail.particles.filter((particle) => {
    const age = now - particle.born;
    if (age >= particle.life) return false;
    const dt = carpetTrail.lastTime ? Math.min(32, now - carpetTrail.lastTime) / 16.67 : 1;
    particle.x += particle.vx * 0.016 * dt;
    particle.y += particle.vy * 0.016 * dt;
    particle.vx *= 0.992;
    particle.vy += 0.08 * dt;
    drawCarpetTrailParticle(ctx, particle, age);
    return true;
  });

  carpetTrail.lastTime = now;
  if (activeTab && (flying || cashed || carpetTrail.particles.length > 0)) {
    carpetTrail.frameId = requestAnimationFrame(renderCarpetTrailFrame);
  } else {
    carpetTrail.frameId = null;
  }
}

function startCarpetTrailRenderer() {
  if (!CARPET_TRAIL_ENABLED) return;
  if (carpetTrail.frameId) return;
  carpetTrail.lastTime = 0;
  carpetTrail.lastEmit = 0;
  carpetTrail.frameId = requestAnimationFrame(renderCarpetTrailFrame);
}

function cleanupCarpetSparkLayer() {
  const layer = getCarpetSparkLayer();
  if (!layer) return;
  while (layer.children.length > 42) {
    layer.firstElementChild?.remove();
  }
}

function updateCarpetSparkOrigin(layer = getCarpetSparkLayer()) {
  const rect = layer?.getBoundingClientRect();
  const point = rect
    ? { x: rect.width * 0.18, y: rect.height * 0.73 }
    : { x: 20, y: 108 };
  if (layer) {
    layer.style.setProperty("--spark-x", `${point.x}px`);
    layer.style.setProperty("--spark-y", `${point.y}px`);
  }
  return point;
}

function createCarpetSpark(now, burst = false) {
  const layer = getCarpetSparkLayer();
  if (!layer) return;
  const point = updateCarpetSparkOrigin(layer);
  const spark = document.createElement("span");
  const palette = Math.random();
  const size = burst ? 5 + Math.random() * 3.2 : 3.2 + Math.random() * 3.2;
  const life = burst ? 820 + Math.random() * 300 : 620 + Math.random() * 360;
  const dx = -(18 + Math.random() * (burst ? 48 : 34));
  const dy = (Math.random() - 0.5) * (burst ? 34 : 22) + (burst ? -3 : -1);
  const rot = -30 + Math.random() * 60;

  spark.className = palette < 0.5 ? "carpet-spark gold" : palette < 0.78 ? "carpet-spark rose" : "carpet-spark blue";
  if (Math.random() < 0.34) spark.classList.add("diamond");
  spark.style.left = `${point.x + (Math.random() - 0.5) * 10}px`;
  spark.style.top = `${point.y + (Math.random() - 0.5) * 9}px`;
  spark.style.width = `${size}px`;
  spark.style.height = `${size}px`;
  spark.style.setProperty("--spark-dx", `${dx}px`);
  spark.style.setProperty("--spark-dy", `${dy}px`);
  spark.style.setProperty("--spark-rot", `${rot}deg`);
  spark.style.setProperty("--spark-life", `${life}ms`);
  spark.style.animationDuration = `${life}ms`;
  spark.addEventListener("animationend", () => spark.remove(), { once: true });
  layer.appendChild(spark);
  cleanupCarpetSparkLayer();
}

function renderCarpetSparkFrame(now = performance.now()) {
  const activeTab = document.body.dataset.activeTab === "solo";
  const status = state.carpet.status;
  const active = activeTab && (status === "READY" || status === "STARTING" || status === "FLYING" || status === "CASHED_OUT");
  if (!active) {
    carpetSparks.frameId = null;
    return;
  }

  updateCarpetSparkOrigin();

  const idle = status === "READY";
  const interval = idle ? 120 : status === "CASHED_OUT" ? 36 : 46;
  if (now - carpetSparks.lastEmit > interval) {
    const count = idle ? 1 : status === "CASHED_OUT" ? 5 : 3;
    for (let index = 0; index < count; index += 1) createCarpetSpark(now, status === "CASHED_OUT");
    carpetSparks.lastEmit = now;
  }

  carpetSparks.frameId = requestAnimationFrame(renderCarpetSparkFrame);
}

function updateCarpetMagicSparks() {
  const active = ["READY", "STARTING", "FLYING", "CASHED_OUT"].includes(state.carpet.status);
  if (!active || document.body.dataset.activeTab !== "solo") return;
  updateCarpetSparkOrigin();
  if (carpetSparks.frameId) return;
  carpetSparks.lastEmit = 0;
  createCarpetSpark(performance.now(), state.carpet.status === "CASHED_OUT");
  carpetSparks.frameId = requestAnimationFrame(renderCarpetSparkFrame);
}

function renderDaily() {
  const root = $("#daily-track");
  if (!root) return;
  root.innerHTML = "";
  for (let day = 1; day <= 7; day += 1) {
    const el = document.createElement("div");
    el.className = `daily-day ${day <= 3 || state.dailyClaimed ? "claimed" : ""}`;
    el.textContent = `${day}д`;
    root.appendChild(el);
  }
}

function renderLedger(selector) {
  const root = $(selector);
  if (!root) return;
  root.innerHTML = "";
  state.ledger.slice(0, 5).forEach((row) => {
    const el = document.createElement("div");
    el.className = "ledger-row";
    const amountClass = row.amount >= 0 ? "plus" : "minus";
    const prefix = row.amount >= 0 ? "+" : "";
    el.innerHTML = `<span>${row.label}</span><strong class="${amountClass}">${prefix}${format(row.amount)} ✦</strong>`;
    root.appendChild(el);
  });
}

function renderSlots(hotIndex = -1) {
  const root = $("#slot-row");
  if (!root) return;
  root.innerHTML = "";
  getMultipliers(12, state.risk).forEach((value, index) => {
    const slot = document.createElement("div");
    slot.className = `slot ${index === hotIndex ? "hot" : ""}`;
    slot.textContent = `${formatMultiplier(value)}x`;
    root.appendChild(slot);
  });
}

function updateLimits() {
  const line = $("#limit-line");
  const stake = $("#stake-input");
  if (!line || !stake) return;
  const limit = riskLimits[state.risk];
  line.textContent = `Лимит режима: ${format(limit)} кристаллов`;
  stake.max = limit;
  if (Number(stake.value) > limit) stake.value = limit;
}
function switchTab(tab) {
  document.body.dataset.activeTab = tab;
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  $(`#screen-${tab}`).classList.add("active");
  $$(".bottom-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  if (tab === "solo") renderCarpet();
}

function weightedSlotFromFairWalk(rows = state.homeRows) {
  let slot = 0;
  const path = [];
  for (let row = 0; row < rows; row += 1) {
    const right = Math.random() >= 0.5;
    if (right) slot += 1;
    path.push(slot);
  }
  return { slot, path };
}

const plinkoCanvas = $("#plinko-canvas");
const plinkoCtx = plinkoCanvas?.getContext("2d");
const homeCanvas = $("#home-plinko-canvas");
const homeCtx = homeCanvas?.getContext("2d");
const homeMonkeyImages = {
  left: new Image(),
  right: new Image(),
};
const homeMonkeyState = {
  left: { start: 0, until: 0, intensity: 0 },
  right: { start: 0, until: 0, intensity: 0 },
};
homeMonkeyImages.left.src = "./assets/monkey-left.png?v=telegram62";
homeMonkeyImages.right.src = "./assets/monkey-right.png?v=telegram62";
Object.values(homeMonkeyImages).forEach((image) => {
  image.onload = () => drawHomeBoard();
});
const coefficientSlotPath = new Path2D(
  "M3.83726 0H0C0 1.49347 0 5.9736 0.21799 6.544C0.40973 7.04573 0.71569 7.45373 1.09202 7.70933C1.51984 8 2.07989 8 3.2 8H14.8C15.9201 8 16.4802 8 16.908 7.70933C17.2843 7.45373 17.5903 7.04573 17.782 6.544C18 5.9736 18 1.49347 18 0H14.1627C13.9182 0 13.7959 0 13.6808 0.0368005C13.5787 0.0694672 13.4812 0.123333 13.3917 0.196533C13.2908 0.278933 13.2043 0.394266 13.0314 0.6248L12.4373 1.41693C12.0914 1.87814 11.9184 2.1088 11.7166 2.27373C11.5376 2.41987 11.3425 2.5276 11.1385 2.59293C10.9083 2.66667 10.6637 2.66667 10.1745 2.66667H7.8255C7.3363 2.66667 7.0917 2.66667 6.86154 2.59293C6.65746 2.5276 6.46237 2.41987 6.28343 2.27373C6.08174 2.10892 5.9089 1.87846 5.56348 1.41792L5.56274 1.41693L4.96863 0.6248C4.79548 0.394 4.70908 0.278838 4.60828 0.196533C4.51881 0.123333 4.42127 0.0694672 4.31923 0.0368005C4.20414 0 4.08185 0 3.83726 0Z"
);

function setupCanvasForDisplay(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

function isRealTelegramWebApp() {
  return document.body.classList.contains("is-telegram-webapp") &&
    !document.body.classList.contains("local-telegram-frame");
}

function getHomeCanvasProfile() {
  if (isRealTelegramWebApp() || document.body.classList.contains("local-telegram-frame")) {
    return {
      horizontalInsetMin: 10,
      horizontalInsetMax: 16,
      horizontalInsetRatio: 0.04,
      pegRadius: 2.85,
      activePegRadius: 3.15,
      activeGlowRadius: 4.35,
      activeGlowBlur: 7,
      idleGlowBlur: 3.8,
      activeDuration: 82,
      collisionPadding: 0.55,
      ballRadius: HOME_BALL_RADIUS,
    };
  }
  return {
    horizontalInsetMin: 18,
    horizontalInsetMax: 26,
    horizontalInsetRatio: 0.055,
    pegRadius: HOME_PEG_RADIUS,
    activePegRadius: HOME_PEG_RADIUS + 0.6,
    activeGlowRadius: 5.4,
    activeGlowBlur: 14,
    idleGlowBlur: 6,
    activeDuration: 150,
    collisionPadding: 0.9,
    ballRadius: HOME_BALL_RADIUS,
  };
}

function getHomeBoardGeometry(width, rows, height = 420) {
  const profile = getHomeCanvasProfile();
  const slotCount = rows + 1;
  const pegTop = 66;
  const horizontalInset = Math.max(
    profile.horizontalInsetMin,
    Math.min(profile.horizontalInsetMax, width * profile.horizontalInsetRatio)
  );
  const pegGap = (width - horizontalInset * 2) / Math.max(1, rows + 1);
  const pegBottom = Math.min(height - 124, Math.max(286, height * 0.715));
  const pegStep = rows > 1 ? (pegBottom - pegTop) / (rows - 1) : 0;
  const slotY = Math.min(height - 82, pegBottom + 18);
  const slotWidth = Math.max(17, Math.min(24, pegGap - 3));
  const slotHeight = Math.max(8, Math.min(12, slotWidth * (8 / 18)));
  const centerX = (index) => width / 2 + (index - (slotCount - 1) / 2) * pegGap;
  return { slotCount, pegTop, pegBottom, slotY, pegStep, pegGap, slotWidth, slotHeight, centerX };
}

function drawHomeLauncher(ctx, width, isLaunching = false, timestamp = performance.now()) {
  const x = width / 2;
  const y = 30;
  const pulse = isLaunching ? 0.5 + Math.sin(timestamp / 110) * 0.5 : 0;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(x, y + 10.8, 8.8, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();

  const halo = ctx.createRadialGradient(x, y, 5.5, x, y, 15.5 + pulse * 1.5);
  halo.addColorStop(0, `rgba(255, 222, 134, ${0.18 + pulse * 0.12})`);
  halo.addColorStop(0.46, `rgba(255, 98, 189, ${0.09 + pulse * 0.08})`);
  halo.addColorStop(1, "rgba(255, 98, 189, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, 15.5 + pulse * 1.5, 0, Math.PI * 2);
  ctx.fill();

  if (isLaunching) {
    ctx.strokeStyle = `rgba(255, 236, 156, ${0.58 + pulse * 0.26})`;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.arc(x, y + 0.4, 10.2 + pulse * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  const rim = ctx.createLinearGradient(x - 8, y - 8, x + 8, y + 8);
  rim.addColorStop(0, "#f4d678");
  rim.addColorStop(0.44, "#c49445");
  rim.addColorStop(1, "#4b2b31");

  ctx.shadowColor = `rgba(255, 213, 116, ${0.2 + pulse * 0.18})`;
  ctx.shadowBlur = 5 + pulse * 3;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(x, y, 10.4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  const depth = ctx.createRadialGradient(x - 2, y - 3, 1, x, y + 1, 8.8);
  depth.addColorStop(0, "#050307");
  depth.addColorStop(0.7, "#08050c");
  depth.addColorStop(1, "#17101a");

  ctx.fillStyle = depth;
  ctx.beginPath();
  ctx.arc(x, y + 0.4, 7.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 229, 151, ${0.38 + pulse * 0.16})`;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.arc(x, y + 0.4, 8.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCoefficientSlot(ctx, x, y, width, height, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width / 18, height / 8);
  ctx.fillStyle = color;
  ctx.fill(coefficientSlotPath);
  ctx.restore();
}

function drawHomeBall(ctx, ball, trail = []) {
  const radius = ball.radius || 5;
  ctx.save();
  trail.forEach((point, index) => {
    const age = trail.length - index;
    const alpha = Math.max(0, 0.2 - age * 0.035);
    if (alpha <= 0) return;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 73, 182, ${alpha})`;
    ctx.shadowColor = "rgba(255, 73, 182, 0.42)";
    ctx.shadowBlur = 12;
    ctx.arc(point.x, point.y, Math.max(1.2, radius - age * 0.38), 0, Math.PI * 2);
    ctx.fill();
  });

  const body = ctx.createRadialGradient(ball.x - radius * 0.35, ball.y - radius * 0.45, 1, ball.x, ball.y, radius + 1);
  body.addColorStop(0, "#ffd0ee");
  body.addColorStop(0.34, "#ff6ac2");
  body.addColorStop(1, "#c81782");

  ctx.beginPath();
  ctx.fillStyle = body;
  ctx.shadowColor = "rgba(255, 73, 182, 0.9)";
  ctx.shadowBlur = 15;
  ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
  ctx.beginPath();
  ctx.arc(ball.x - radius * 0.31, ball.y - radius * 0.37, radius * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getHomeBallPoints(path, slot, canvasWidth, canvasHeight = 420) {
  const rows = path.length;
  const geometry = getHomeBoardGeometry(canvasWidth, rows, canvasHeight);
  const { pegTop, slotY, pegStep, pegGap, centerX } = geometry;
  const launcherX = canvasWidth / 2;
  const profile = getHomeCanvasProfile();
  const ballRadius = profile.ballRadius;
  const contactDistance = ballRadius + profile.pegRadius + profile.collisionPadding + 1.4;
  const clampToBoard = (x, y) => {
    const bounds = getHomeTriangleBounds(y, geometry, canvasWidth, rows, ballRadius);
    return Math.max(bounds.left, Math.min(bounds.right, x));
  };
  const points = [
    { x: launcherX, y: 30 },
    { x: launcherX + (Math.random() - 0.5) * 1.2, y: 42 },
    { x: launcherX + (Math.random() - 0.5) * 2.2, y: pegTop - 17 },
  ];
  for (let row = 0; row < path.length; row += 1) {
    const previousSlot = row > 0 ? path[row - 1] : 0;
    const currentSlot = path[row];
    const direction = currentSlot > previousSlot ? 1 : -1;
    const touchedPeg = getHomeTouchedPeg(path, row);
    const pegY = pegTop + row * pegStep;
    const peg = getHomePegPosition(row, touchedPeg.col, canvasWidth, rows, canvasHeight);
    const rowNoise = (Math.random() - 0.5) * Math.min(pegGap * 0.18, 5);
    const contactX = clampToBoard(peg.x - direction * contactDistance * 0.78 + rowNoise, pegY);
    const contactY = pegY - Math.min(3.4, pegStep * 0.12) + (Math.random() - 0.5) * 1.2;
    const reboundY = Math.min(slotY - 16, pegY + pegStep * (0.32 + Math.random() * 0.1));
    const reboundX = clampToBoard(
      peg.x + direction * (pegGap * (0.27 + Math.random() * 0.12)) + (Math.random() - 0.5) * Math.min(pegGap * 0.15, 5),
      reboundY
    );
    const driftY = Math.min(slotY - 12, pegY + pegStep * (0.67 + Math.random() * 0.09));
    const laneX = launcherX + (currentSlot - (row + 1) / 2) * pegGap;
    const driftX = clampToBoard(
      laneX + direction * Math.min(pegGap * 0.2, 6) + (Math.random() - 0.5) * Math.min(pegGap * 0.28, 8),
      driftY
    );

    points.push({ x: contactX, y: contactY, peg: touchedPeg, contact: true, pegX: peg.x, pegY });
    points.push({ x: reboundX, y: reboundY, peg: touchedPeg });
    if (row < path.length - 1) {
      points.push({ x: driftX, y: driftY, peg: touchedPeg });
    }
  }
  const settleY = Math.max(pegTop, slotY - Math.max(16, pegStep * 0.58));
  points.push({
    x: clampToBoard(centerX(slot) + (Math.random() - 0.5) * Math.min(pegGap * 0.18, 5), settleY),
    y: settleY,
  });
  points.push({ x: centerX(slot), y: slotY - 5 });
  return points;
}

function getHomeTouchedPeg(path, row) {
  const previousSlot = row > 0 ? path[row - 1] : 0;
  const currentSlot = path[row];
  const touchedCol = currentSlot > previousSlot ? currentSlot - 1 : currentSlot;
  return {
    row,
    col: Math.max(0, Math.min(row + 2, touchedCol + 1)),
  };
}

function getHomePegPosition(row, col, width, rows, height) {
  const { pegTop, pegStep, pegGap } = getHomeBoardGeometry(width, rows, height);
  const count = row + 3;
  return {
    x: width / 2 + (col - (count - 1) / 2) * pegGap,
    y: pegTop + row * pegStep,
  };
}

function getHomeSlotFromX(x, width, rows, height) {
  const { slotCount, centerX } = getHomeBoardGeometry(width, rows, height);
  let closest = 0;
  let closestDistance = Infinity;
  for (let index = 0; index < slotCount; index += 1) {
    const distance = Math.abs(centerX(index) - x);
    if (distance < closestDistance) {
      closest = index;
      closestDistance = distance;
    }
  }
  return closest;
}

function getHomeMatterApi() {
  return window.Matter || null;
}

function createMatterWall(MatterApi, x1, y1, x2, y2, thickness) {
  const { Bodies } = MatterApi;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  return Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, length, thickness, {
    isStatic: true,
    angle: Math.atan2(dy, dx),
    render: { visible: false },
    friction: 0,
    restitution: 0.5,
  });
}

function simulateHomeMatterDrop(canvasWidth, canvasHeight, rows) {
  const MatterApi = getHomeMatterApi();
  if (!MatterApi) return null;

  const { Engine, World, Bodies, Body, Events } = MatterApi;
  const profile = getHomeCanvasProfile();
  const geometry = getHomeBoardGeometry(canvasWidth, rows, canvasHeight);
  const engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = 0.92;
  engine.gravity.scale = 0.001;
  engine.positionIterations = 8;
  engine.velocityIterations = 6;

  const ball = Bodies.circle(canvasWidth / 2 + (Math.random() - 0.5) * 1.2, 31.5, profile.ballRadius, {
    label: "ball",
    restitution: 0.52,
    friction: 0,
    frictionStatic: 0,
    frictionAir: 0.0026,
    density: 0.0016,
    slop: 0.01,
  });
  Body.setVelocity(ball, { x: (Math.random() - 0.5) * 0.42, y: 1.18 + Math.random() * 0.22 });

  const bodies = [ball];
  for (let row = 0; row < rows; row += 1) {
    const count = row + 3;
    for (let col = 0; col < count; col += 1) {
      const peg = getHomePegPosition(row, col, canvasWidth, rows, canvasHeight);
      bodies.push(
        Bodies.circle(peg.x, peg.y, profile.pegRadius + 0.15, {
          label: `peg:${row}:${col}`,
          isStatic: true,
          restitution: 0.68,
          friction: 0,
          slop: 0.01,
        })
      );
    }
  }

  bodies.push(
    Bodies.rectangle(canvasWidth / 2, geometry.slotY + 13, canvasWidth, 8, {
      isStatic: true,
      render: { visible: false },
      restitution: 0.1,
    })
  );

  World.add(engine.world, bodies);

  let simTime = 0;
  const activeUntil = new Map();
  Events.on(engine, "collisionStart", (event) => {
    event.pairs.forEach((pair) => {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      const pegLabel = labels.find((label) => label.startsWith("peg:"));
      if (!pegLabel || !labels.includes("ball")) return;
      const [, row, col] = pegLabel.split(":").map(Number);
      if (Number.isFinite(row) && Number.isFinite(col)) {
        activeUntil.set(`${row}:${col}`, simTime + profile.activeDuration);
      }
    });
  });

  const frames = [];
  for (let step = 0; step < HOME_MATTER_MAX_STEPS; step += 1) {
    simTime += HOME_MATTER_STEP_MS;
    Engine.update(engine, HOME_MATTER_STEP_MS);

    const bounds = getHomeTriangleBounds(ball.position.y, geometry, canvasWidth, rows, profile.ballRadius);
    const boundaryNudge = Math.max(2.2, profile.ballRadius * 0.55);
    if (ball.position.x < bounds.left) {
      Body.setPosition(ball, { x: bounds.left + boundaryNudge, y: ball.position.y });
      Body.setVelocity(ball, {
        x: Math.abs(ball.velocity.x) * 0.62 + 0.18 + Math.random() * 0.08,
        y: Math.max(ball.velocity.y, 0.72),
      });
    } else if (ball.position.x > bounds.right) {
      Body.setPosition(ball, { x: bounds.right - boundaryNudge, y: ball.position.y });
      Body.setVelocity(ball, {
        x: -Math.abs(ball.velocity.x) * 0.62 - 0.18 - Math.random() * 0.08,
        y: Math.max(ball.velocity.y, 0.72),
      });
    } else if (
      (ball.position.x - bounds.left < boundaryNudge || bounds.right - ball.position.x < boundaryNudge) &&
      Math.abs(ball.velocity.x) < 0.08 &&
      ball.velocity.y < 0.5
    ) {
      const pushRight = ball.position.x - bounds.left < bounds.right - ball.position.x;
      Body.setVelocity(ball, {
        x: pushRight ? 0.24 + Math.random() * 0.08 : -0.24 - Math.random() * 0.08,
        y: 0.76,
      });
    }

    const activePeg = [];
    activeUntil.forEach((until, key) => {
      if (until < simTime) {
        activeUntil.delete(key);
        return;
      }
      const [row, col] = key.split(":").map(Number);
      activePeg.push({ row, col });
    });

    frames.push({
      t: simTime,
      x: ball.position.x,
      y: ball.position.y,
      activePeg,
    });

    if (ball.position.y >= geometry.slotY - 5) break;
    if (step > 100 && Math.abs(ball.velocity.y) < 0.03) {
      Body.setVelocity(ball, {
        x: ball.velocity.x + (Math.random() < 0.5 ? -0.45 : 0.45),
        y: Math.max(ball.velocity.y, 0.85),
      });
    }
  }

  const lastFrame = frames[frames.length - 1] || { x: canvasWidth / 2, y: geometry.slotY - 5, t: 0, activePeg: [] };
  const slot = getHomeSlotFromX(lastFrame.x, canvasWidth, rows, canvasHeight);
  frames.push({ t: lastFrame.t + 70, x: geometry.centerX(slot), y: geometry.slotY - 5, activePeg: lastFrame.activePeg || [] });

  World.clear(engine.world, false);
  Engine.clear(engine);

  return {
    frames,
    slot,
    duration: frames[frames.length - 1]?.t || 1200,
  };
}

function createHomePhysicsAnimation(stake, timestamp, canvasWidth, canvasHeight, risk, rows) {
  const profile = getHomeCanvasProfile();
  const matterDrop = simulateHomeMatterDrop(canvasWidth, canvasHeight, rows);
  return {
    physics: !matterDrop,
    matterReplay: Boolean(matterDrop),
    rows,
    risk,
    targetSlot: matterDrop?.slot ?? null,
    frames: matterDrop?.frames || null,
    duration: matterDrop?.duration || 0,
    start: timestamp || 0,
    width: canvasWidth,
    height: canvasHeight,
    x: canvasWidth / 2 + (Math.random() - 0.5) * 1.4,
    y: 31.5,
    vx: (Math.random() - 0.5) * 26,
    vy: 32 + Math.random() * 8,
    radius: profile.ballRadius,
    last: timestamp || 0,
    trail: [],
    activePegs: [],
    stake,
    slot: null,
    multiplier: 0,
    payout: 0,
    stuckMs: 0,
    lastY: 42,
  };
}

function resolveHomePhysicsAnimation(animation) {
  if (animation.slot !== null) return;
  const slot =
    typeof animation.targetSlot === "number"
      ? Math.max(0, Math.min(animation.rows, animation.targetSlot))
      : getHomeSlotFromX(animation.x, animation.width, animation.rows, animation.height);
  const multiplier = getMultipliers(animation.rows, animation.risk)[slot] || 0;
  animation.slot = slot;
  animation.multiplier = multiplier;
  animation.payout = Math.round(animation.stake * multiplier);
}

function getHomeTriangleBounds(y, geometry, width, rows, radius) {
  if (y < geometry.pegTop - 18) {
    return {
      left: width / 2 - 13,
      right: width / 2 + 13,
    };
  }
  const rowFloat = Math.max(0, Math.min(rows - 1, (y - geometry.pegTop) / Math.max(1, geometry.pegStep)));
  const visualCount = rowFloat + 3;
  const half = ((visualCount - 1) * geometry.pegGap) / 2 + geometry.pegGap * 0.58;
  return {
    left: width / 2 - half + radius,
    right: width / 2 + half - radius,
  };
}

function stepHomePhysicsAnimation(animation, timestamp) {
  const geometry = getHomeBoardGeometry(animation.width, animation.rows, animation.height);
  const profile = getHomeCanvasProfile();
  const now = timestamp || performance.now();
  if (!animation.last) animation.last = now;
  const elapsed = Math.max(0, Math.min(48, now - animation.last));
  animation.last = now;

  let remaining = elapsed / 1000;
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;

    animation.vy += HOME_PHYSICS_GRAVITY * dt;
    animation.x += animation.vx * dt;
    animation.y += animation.vy * dt;

    const bounds = getHomeTriangleBounds(animation.y, geometry, animation.width, animation.rows, animation.radius);
    if (animation.x < bounds.left) {
      animation.x = bounds.left;
      animation.vx = Math.abs(animation.vx) * HOME_PHYSICS_WALL_RESTITUTION;
    } else if (animation.x > bounds.right) {
      animation.x = bounds.right;
      animation.vx = -Math.abs(animation.vx) * HOME_PHYSICS_WALL_RESTITUTION;
    }

    const approximateRow = Math.round((animation.y - geometry.pegTop) / Math.max(1, geometry.pegStep));
    const firstRow = Math.max(0, approximateRow - 2);
    const lastRow = Math.min(animation.rows - 1, approximateRow + 2);
    for (let row = firstRow; row <= lastRow; row += 1) {
      const count = row + 3;
      for (let col = 0; col < count; col += 1) {
        const peg = getHomePegPosition(row, col, animation.width, animation.rows, animation.height);
        const dx = animation.x - peg.x;
        const dy = animation.y - peg.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const minDistance = animation.radius + profile.pegRadius + profile.collisionPadding;
        if (distance >= minDistance) continue;

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;
        animation.x += nx * overlap;
        animation.y += ny * overlap;

        const normalVelocity = animation.vx * nx + animation.vy * ny;
        if (normalVelocity < 0) {
          animation.vx -= (1 + HOME_PHYSICS_RESTITUTION) * normalVelocity * nx;
          animation.vy -= (1 + HOME_PHYSICS_RESTITUTION) * normalVelocity * ny;
          animation.vx += nx * (8 + Math.random() * 14);
          animation.vy -= Math.max(0, Math.min(18, Math.abs(normalVelocity) * 0.08));
        }
        if (Math.abs(animation.vx) < 24) {
          const side = nx || (Math.random() < 0.5 ? -1 : 1);
          animation.vx += side * (18 + Math.random() * 18);
        }
        if (animation.vy < 38) {
          animation.vy = 38 + Math.random() * 18;
        }

        animation.activePegs.push({ row, col, until: now + profile.activeDuration });
      }
    }

    if (typeof animation.targetSlot === "number") {
      const targetX = geometry.centerX(animation.targetSlot);
      const progress = Math.max(
        0,
        Math.min(1, (animation.y - (geometry.pegTop + geometry.pegStep * 1.5)) / Math.max(1, geometry.slotY - geometry.pegTop))
      );
      if (progress > 0) {
        const ease = progress * progress * (3 - 2 * progress);
        animation.vx += (targetX - animation.x) * (0.2 + ease * 0.62) * dt;
        if (progress > 0.74) {
          animation.x += (targetX - animation.x) * 0.018 * ease;
        }
      }
    }

    animation.vx = Math.max(-190, Math.min(190, animation.vx * 0.997));
    animation.vy = Math.max(-120, Math.min(310, animation.vy));

    if (animation.y >= geometry.slotY - 5) {
      if (typeof animation.targetSlot === "number") {
        animation.x = geometry.centerX(animation.targetSlot);
      }
      animation.y = geometry.slotY - 5;
      resolveHomePhysicsAnimation(animation);
      animation.done = true;
      break;
    }
  }

  animation.trail.push({ x: animation.x, y: animation.y });
  if (animation.trail.length > 7) animation.trail.shift();
  animation.activePegs = animation.activePegs.filter((peg) => peg.until >= now);

  const verticalProgress = animation.y - (animation.lastY ?? animation.y);
  if (!animation.done && animation.y > geometry.pegTop - 6 && verticalProgress < 0.22 && Math.abs(animation.vy) < 72) {
    animation.stuckMs = (animation.stuckMs || 0) + elapsed;
  } else {
    animation.stuckMs = 0;
  }
  if (!animation.done && animation.stuckMs > 140) {
    animation.vx += (Math.random() < 0.5 ? -1 : 1) * (34 + Math.random() * 22);
    animation.vy = Math.max(animation.vy, 112);
    animation.y += 1.8;
    animation.stuckMs = 0;
  }
  animation.lastY = animation.y;

  return {
    ball: {
      x: animation.x,
      y: animation.y,
      radius: animation.radius,
    },
    trail: animation.trail,
    activePeg: animation.activePegs.map(({ row, col }) => ({ row, col })),
    done: Boolean(animation.done),
  };
}

function getHomeBallFrame(animation, timestamp) {
  if (animation.matterReplay && Array.isArray(animation.frames)) {
    const elapsed = Math.max(0, timestamp - animation.start);
    const replayElapsed = elapsed / HOME_MATTER_REPLAY_SLOWDOWN;
    const frames = animation.frames;
    let index = 0;
    while (index < frames.length - 2 && frames[index + 1].t < replayElapsed) {
      index += 1;
    }
    const a = frames[index] || frames[0];
    const b = frames[Math.min(index + 1, frames.length - 1)] || a;
    const span = Math.max(1, b.t - a.t);
    const local = Math.max(0, Math.min(1, (replayElapsed - a.t) / span));
    const smooth = local * local * (3 - 2 * local);
    const ball = {
      x: a.x + (b.x - a.x) * smooth,
      y: a.y + (b.y - a.y) * smooth,
      radius: animation.radius || HOME_BALL_RADIUS,
    };
    animation.trail.push({ x: ball.x, y: ball.y });
    if (animation.trail.length > 7) animation.trail.shift();
    return {
      ball,
      trail: animation.trail,
      activePeg: b.activePeg || a.activePeg || [],
      done: elapsed >= animation.duration * HOME_MATTER_REPLAY_SLOWDOWN,
    };
  }
  if (animation.physics) return stepHomePhysicsAnimation(animation, timestamp);
  const progress = Math.min((timestamp - animation.start) / animation.duration, 1);
  const scaled = progress * (animation.points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = animation.points[index];
  const b = animation.points[Math.min(index + 1, animation.points.length - 1)];
  const p0 = animation.points[Math.max(0, index - 1)];
  const p1 = a;
  const p2 = b;
  const p3 = animation.points[Math.min(animation.points.length - 1, index + 2)];
  const t = local;
  const t2 = t * t;
  const t3 = t2 * t;
  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );
  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );
  const ball = {
    x,
    y,
    radius: animation.radius || HOME_BALL_RADIUS,
  };
  let activePeg = null;
  if (b?.contact && local > 0.7) activePeg = b.peg;
  else if (a?.contact && local < 0.18) activePeg = a.peg;
  animation.trail.push({ x: ball.x, y: ball.y });
  if (animation.trail.length > 7) animation.trail.shift();
  return {
    ball,
    trail: animation.trail,
    activePeg,
    done: progress >= 1,
  };
}

const homeWinEffects = [];
let homeEffectsRunning = false;

function getHomeMonkeyLayout(side, width, height) {
  const drawWidth = Math.max(42, Math.min(58, width * 0.15));
  const aspect = side === "left" ? 499 / 360 : 491 / 360;
  const drawHeight = drawWidth * aspect;
  const top = Math.min(height - drawHeight - 160, Math.max(90, height * 0.285));
  const left = side === "left" ? 7 : width - drawWidth - 7;
  return {
    left,
    top,
    width: drawWidth,
    height: drawHeight,
    mouthX: side === "left" ? left + drawWidth * 0.76 : left + drawWidth * 0.24,
    mouthY: top + drawHeight * 0.63,
  };
}

function drawHomeMonkeys(ctx, width, height, timestamp) {
  ["left", "right"].forEach((side) => {
    const image = homeMonkeyImages[side];
    if (!image || !image.complete || image.naturalWidth === 0) return;

    const layout = getHomeMonkeyLayout(side, width, height);
    const state = homeMonkeyState[side];
    const active = state.until > timestamp;
    const progress = active ? Math.max(0, Math.min(1, (timestamp - state.start) / Math.max(1, state.until - state.start))) : 1;
    const shake = active ? Math.sin(timestamp / 22) * (1 - progress) * (1.1 + state.intensity * 1.8) : 0;
    const pulse = active ? Math.sin(progress * Math.PI) : 0;
    const scale = 1 + pulse * (0.035 + state.intensity * 0.025);

    ctx.save();
    ctx.globalAlpha = 0.9 + pulse * 0.1;
    ctx.translate(layout.left + layout.width / 2 + shake, layout.top + layout.height / 2);
    ctx.scale(scale, scale);
    ctx.shadowColor = `rgba(255, 205, 92, ${0.24 + pulse * 0.56})`;
    ctx.shadowBlur = 7 + pulse * 12;
    ctx.drawImage(image, -layout.width / 2, -layout.height / 2, layout.width, layout.height);
    ctx.restore();

    if (active) {
      ctx.save();
      const mouth = ctx.createRadialGradient(layout.mouthX, layout.mouthY, 1, layout.mouthX, layout.mouthY, 11 + state.intensity * 3.5);
      mouth.addColorStop(0, `rgba(255, 241, 167, ${0.5 + pulse * 0.46})`);
      mouth.addColorStop(0.42, `rgba(255, 205, 88, ${0.24 + pulse * 0.32})`);
      mouth.addColorStop(1, "rgba(255, 205, 88, 0)");
      ctx.fillStyle = mouth;
      ctx.beginPath();
      ctx.arc(layout.mouthX, layout.mouthY, 11 + state.intensity * 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

function createHomeCoinBurst(side, width, height, timestamp) {
  const originX = side === "left" ? 28 : width - 28;
  const direction = side === "left" ? 1 : -1;
  const originY = Math.min(height - 82, Math.max(150, height * 0.56));
  for (let index = 0; index < HOME_EFFECT_COIN_COUNT; index += 1) {
    homeWinEffects.push({
      type: "coin",
      start: timestamp,
      duration: 780 + Math.random() * 260,
      x: originX + (Math.random() - 0.5) * 14,
      y: originY + (Math.random() - 0.5) * 34,
      vx: direction * (34 + Math.random() * 58),
      vy: -66 - Math.random() * 80,
      gravity: 120 + Math.random() * 60,
      size: 3.4 + Math.random() * 2.3,
      spin: (Math.random() - 0.5) * Math.PI * 4,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function createHomeMonkeyBurst(side, width, height, timestamp, count, intensity) {
  const layout = getHomeMonkeyLayout(side, width, height);
  const direction = side === "left" ? 1 : -1;
  homeMonkeyState[side] = {
    start: timestamp,
    until: timestamp + 760 + intensity * 120,
    intensity,
  };

  for (let index = 0; index < count; index += 1) {
    const spread = index / Math.max(1, count - 1);
    homeWinEffects.push({
      type: "coin",
      start: timestamp + Math.random() * 90,
      duration: 780 + Math.random() * 260 + intensity * 80,
      x: layout.mouthX + (Math.random() - 0.5) * 4,
      y: layout.mouthY + (Math.random() - 0.5) * 4,
      vx: direction * (42 + Math.random() * 64 + intensity * 20),
      vy: -42 - Math.random() * 72 - Math.sin(spread * Math.PI) * 16,
      gravity: 118 + Math.random() * 62,
      size: 3.1 + Math.random() * 2.4 + intensity * 0.4,
      spin: (Math.random() - 0.5) * Math.PI * (4.5 + intensity),
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function createHomeSparkBurst(slot, timestamp) {
  const rect = homeCanvas.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const { slotY, centerX } = getHomeBoardGeometry(width, state.homeRows, height);
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const distance = 16 + Math.random() * 24;
    homeWinEffects.push({
      type: "spark",
      start: timestamp,
      duration: 420 + Math.random() * 180,
      x: centerX(slot),
      y: slotY + 4,
      vx: Math.cos(angle) * distance,
      vy: Math.sin(angle) * distance,
      gravity: 34,
      size: 1.6 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function requestHomeEffectsFrame() {
  if (homeEffectsRunning || homeManualRunning || homeAutoRunning || homeWinEffects.length === 0) return;
  homeEffectsRunning = true;
  function frame(timestamp) {
    drawHomeBoard(null, -1, 0, null, [], timestamp);
    if (homeWinEffects.length > 0 && !homeManualRunning && !homeAutoRunning) {
      requestAnimationFrame(frame);
      return;
    }
    homeEffectsRunning = false;
  }
  requestAnimationFrame(frame);
}

function triggerHomeWinEffect(slot, multiplier, timestamp = performance.now()) {
  if (multiplier < HOME_EFFECT_GOOD_MULTIPLIER) return;
  const rect = homeCanvas.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const slotCount = state.homeRows + 1;
  const leftOuter = slot === 0;
  const rightOuter = slot === slotCount - 1;
  const leftInner = slot === 1;
  const rightInner = slot === slotCount - 2;

  if (leftOuter || rightOuter || leftInner || rightInner) {
    const side = leftOuter || leftInner ? "left" : "right";
    const outer = leftOuter || rightOuter;
    createHomeMonkeyBurst(
      side,
      width,
      height,
      timestamp,
      outer ? HOME_MONKEY_EDGE_COIN_COUNT : HOME_MONKEY_INNER_COIN_COUNT,
      outer ? 1 : 0.55
    );
  } else {
    createHomeSparkBurst(slot, timestamp);
  }
  requestHomeEffectsFrame();
}

function drawHomeWinEffects(ctx, timestamp) {
  if (homeWinEffects.length === 0) return;
  ctx.save();
  for (let index = homeWinEffects.length - 1; index >= 0; index -= 1) {
    const particle = homeWinEffects[index];
    const rawProgress = (timestamp - particle.start) / particle.duration;
    if (rawProgress < 0) continue;
    const progress = Math.min(rawProgress, 1);
    if (progress >= 1) {
      homeWinEffects.splice(index, 1);
      continue;
    }
    const easeOut = 1 - (1 - progress) * (1 - progress);
    const x = particle.x + particle.vx * progress + Math.sin(progress * Math.PI * 2 + particle.phase) * 5;
    const y = particle.y + particle.vy * progress + particle.gravity * progress * progress;
    const alpha = Math.sin(progress * Math.PI);

    ctx.globalAlpha = alpha;
    if (particle.type === "coin") {
      const rotation = particle.phase + particle.spin * easeOut;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.shadowColor = "rgba(255, 214, 91, 0.72)";
      ctx.shadowBlur = 8;
      const coinGradient = ctx.createRadialGradient(-particle.size * 0.35, -particle.size * 0.45, 0.5, 0, 0, particle.size * 1.2);
      coinGradient.addColorStop(0, "#fff4a8");
      coinGradient.addColorStop(0.48, "#ffd95c");
      coinGradient.addColorStop(1, "#b56c20");
      ctx.fillStyle = coinGradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size * 1.18, particle.size * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 210, 0.68)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.shadowColor = "rgba(255, 224, 91, 0.9)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#fff2a2";
      ctx.beginPath();
      ctx.arc(x, y, particle.size * (1 - progress * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHomeBoard(ball = null, hotSlot = -1, slotDrop = 0, activePeg = null, ballTrail = [], effectTimestamp = performance.now()) {
  if (!homeCtx) return;
  const ctx = homeCtx;
  const { width, height } = setupCanvasForDisplay(homeCanvas, ctx);
  ctx.clearRect(0, 0, width, height);
  const ballEntries = Array.isArray(ball) ? ball : ball ? [{ ball, trail: ballTrail }] : [];
  const activePegs = Array.isArray(activePeg) ? activePeg : activePeg ? [activePeg] : [];

  const rows = state.homeRows;
  const { slotCount, pegTop, slotY, pegStep, pegGap, slotWidth, slotHeight, centerX } = getHomeBoardGeometry(width, rows, height);
  const canvasProfile = getHomeCanvasProfile();

  drawHomeLauncher(
    ctx,
    width,
    ballEntries.some((entry) => entry.ball && entry.ball.y < pegTop + 4),
    effectTimestamp
  );
  drawHomeMonkeys(ctx, width, height, effectTimestamp);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ballEntries.forEach((entry) => drawHomeBall(ctx, entry.ball, entry.trail || []));

  ctx.save();
  ctx.globalAlpha = 0.95;
  for (let row = 0; row < rows; row += 1) {
    const count = row + 3;
    const y = pegTop + row * pegStep;
    for (let col = 0; col < count; col += 1) {
      const x = width / 2 + (col - (count - 1) / 2) * pegGap;
      const isActivePeg = activePegs.some((peg) => peg && peg.row === row && peg.col === col);
      if (isActivePeg) {
        const activeGlow = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, canvasProfile.activeGlowRadius + 0.8);
        activeGlow.addColorStop(0, "rgba(255, 255, 205, 1)");
        activeGlow.addColorStop(0.48, "rgba(255, 244, 116, 0.82)");
        activeGlow.addColorStop(1, "rgba(255, 213, 68, 0.1)");
        ctx.beginPath();
        ctx.fillStyle = activeGlow;
        ctx.shadowColor = "rgba(255, 239, 104, 0.76)";
        ctx.shadowBlur = canvasProfile.activeGlowBlur;
        ctx.arc(x, y, canvasProfile.activeGlowRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = isActivePeg ? "#fff58c" : "#ffd95c";
      ctx.shadowColor = isActivePeg ? "rgba(255, 225, 92, 0.82)" : "rgba(255, 203, 68, 0.76)";
      ctx.shadowBlur = isActivePeg ? canvasProfile.activeGlowBlur : canvasProfile.idleGlowBlur;
      ctx.arc(x, y, isActivePeg ? canvasProfile.activePegRadius : canvasProfile.pegRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  const labels = getMultipliers(rows, state.homeRisk);
  labels.forEach((multiplier, index) => {
    const x = centerX(index) - slotWidth / 2;
    const impactOffset = index === hotSlot ? slotDrop : 0;
    const hot = index <= 1 || index >= slotCount - 2;
    const slotColor = index === hotSlot ? "#ff49b6" : hot ? "#b31655" : index % 3 === 0 ? "#f4ce62" : "#79d99a";
    ctx.save();
    if (index === hotSlot) {
      ctx.shadowColor = "rgba(255, 73, 182, 0.9)";
      ctx.shadowBlur = 12;
    }
    drawCoefficientSlot(ctx, x, slotY + impactOffset, slotWidth, slotHeight, slotColor);
    ctx.restore();
    ctx.fillStyle = "#fffbea";
    ctx.font = "500 7px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(formatMultiplier(multiplier), centerX(index), slotY + 26 + impactOffset);
  });

  drawHomeWinEffects(ctx, effectTimestamp);
}

function animateHomeSlotImpact(slot, onDone) {
  let start = null;
  const duration = 260;
  const maxDrop = 9;
  function frame(timestamp) {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const bounce = Math.sin(progress * Math.PI);
    drawHomeBoard(null, slot, bounce * maxDrop, null, [], timestamp);
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      drawHomeBoard(null, -1, 0);
      onDone();
    }
  }
  requestAnimationFrame(frame);
}

function animateHomeBoard(path, slot, onDone) {
  const rows = path.length;
  const rect = homeCanvas.getBoundingClientRect();
  const canvasWidth = Math.round(rect.width);
  const canvasHeight = Math.round(rect.height);
  const points = getHomeBallPoints(path, slot, canvasWidth, canvasHeight);

  let start = null;
  const trail = [];
  const duration = 1500;
  function frame(timestamp) {
    if (!start) start = timestamp;
    const animation = { path, points, start, duration, trail };
    const frameState = getHomeBallFrame(animation, timestamp);
    if (!frameState.done) {
      drawHomeBoard(frameState.ball, -1, 0, frameState.activePeg, frameState.trail, timestamp);
      requestAnimationFrame(frame);
    } else {
      animateHomeSlotImpact(slot, onDone);
    }
  }
  requestAnimationFrame(frame);
}

let homeWinbarTimer = null;
let homeAutoCounterTimer = null;
let homeAutoRunning = false;
let homeAutoCancelRequested = false;
const homeManualAnimations = [];
let homeManualRunning = false;
let homeManualImpactSlot = -1;
let homeManualImpactStarted = 0;
let homeManualQueuedBalls = 0;
let homeManualTotalPayout = 0;

function setHomeWinbarContent(text, withRuby = false) {
  const winbar = $("#home-winbar");
  if (!winbar) return null;
  winbar.textContent = "";
  const label = document.createElement("span");
  label.textContent = text;
  winbar.appendChild(label);
  if (withRuby) {
    const ruby = document.createElement("span");
    ruby.className = "figma-winbar-ruby";
    ruby.setAttribute("aria-hidden", "true");
    winbar.appendChild(ruby);
  }
  return winbar;
}

function pulseHomeWinbar(strong = false) {
  const winbar = $("#home-winbar");
  if (!winbar) return;
  winbar.classList.remove("pulse", "big-pulse");
  void winbar.offsetWidth;
  winbar.classList.add(strong ? "big-pulse" : "pulse");
}

function flashHomeWinbar(text, duration = 850, withRuby = false) {
  const winbar = setHomeWinbarContent(text, withRuby);
  if (!winbar) return;
  if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
  winbar.classList.add("show");
  pulseHomeWinbar(false);
  homeWinbarTimer = setTimeout(() => {
    winbar.classList.remove("show");
    homeWinbarTimer = null;
  }, duration);
}

function updateHomeAutoCounter(remaining) {
  const counter = $("#home-auto-counter");
  if (!counter) return;
  counter.textContent = `ОСТАЛОСЬ ${format(remaining)}`;
  counter.classList.add("show");
}

function hideHomeAutoCounter(delay = 0) {
  const counter = $("#home-auto-counter");
  if (homeAutoCounterTimer) clearTimeout(homeAutoCounterTimer);
  if (!counter) return;
  homeAutoCounterTimer = setTimeout(() => {
    counter.classList.remove("show");
    homeAutoCounterTimer = null;
  }, delay);
}

function cancelHomeAutoPyramid() {
  if (!homeAutoRunning) return false;
  homeAutoCancelRequested = true;
  updateHomeAutoCounter(0);
  return true;
}

function pulseChoice(button) {
  if (!button) return;
  button.classList.remove("choice-press");
  void button.offsetWidth;
  button.classList.add("choice-press");
}

function playHomeAutoPyramid(runs, totalStake) {
  const play = $("#home-play");
  const winbar = $("#home-winbar");
  const rect = homeCanvas.getBoundingClientRect();
  const canvasWidth = Math.round(rect.width);
  const canvasHeight = Math.round(rect.height);
  const multipliers = getMultipliers(state.homeRows, state.homeRisk);
  const spawnInterval = getHomeAutoSpawnInterval(runs);
  const stakePerBall = state.homeStake;
  const animations = [];
  let spawned = 0;
  let completed = 0;
  let totalPayout = 0;
  let lastSpawn = 0;
  let impactSlot = -1;
  let impactStarted = 0;

  homeAutoRunning = true;
  homeAutoCancelRequested = false;
  if (winbar) {
    if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
    homeWinbarTimer = null;
    winbar.classList.remove("show", "pulse", "big-pulse");
    winbar.textContent = "";
  }
  if (play) {
    play.disabled = false;
    const playLabel = play.querySelector("strong");
    if (playLabel) playLabel.textContent = "СТОП";
  }

  updateHomeAutoCounter(runs);
  setBalance(state.balance - totalStake);
  addLedger(`Пирамида авто: ${format(runs)} шариков`, -totalStake);
  const activeWinbar = setHomeWinbarContent("+0", true);
  if (activeWinbar) activeWinbar.classList.add("show");

  function spawnBall(timestamp) {
    animations.push(createHomePhysicsAnimation(stakePerBall, timestamp, canvasWidth, canvasHeight, state.homeRisk, state.homeRows));
    spawned += 1;
    lastSpawn = timestamp;
  }

  function frame(timestamp) {
    const ballEntries = [];
    const activePegs = [];

    for (let index = animations.length - 1; index >= 0; index -= 1) {
      const animation = animations[index];
      const frameState = getHomeBallFrame(animation, timestamp);
      if (frameState.done) {
        resolveHomePhysicsAnimation(animation);
        animations.splice(index, 1);
        completed += 1;
        totalPayout += animation.payout;
        impactSlot = animation.slot;
        impactStarted = timestamp;
        triggerHomeWinEffect(animation.slot, animation.multiplier, timestamp);
        updateHomeAutoCounter(homeAutoCancelRequested ? Math.max(0, spawned - completed) : runs - completed);
        if (animation.payout > 0) {
          setHomeWinbarContent(`+${format(totalPayout)}`, true);
          pulseHomeWinbar(animation.multiplier >= 2);
        }
      } else {
        ballEntries.push({ ball: frameState.ball, trail: frameState.trail });
        if (Array.isArray(frameState.activePeg)) activePegs.push(...frameState.activePeg);
        else activePegs.push(frameState.activePeg);
      }
    }

    while (
      !homeAutoCancelRequested &&
      spawned < runs &&
      animations.length < HOME_AUTO_MAX_ACTIVE_BALLS &&
      (lastSpawn === 0 || timestamp - lastSpawn >= spawnInterval)
    ) {
      spawnBall(timestamp);
    }

    let slotDrop = 0;
    if (impactSlot >= 0) {
      const impactProgress = Math.min((timestamp - impactStarted) / 260, 1);
      slotDrop = Math.sin(impactProgress * Math.PI) * 9;
      if (impactProgress >= 1) impactSlot = -1;
    }

    drawHomeBoard(ballEntries, impactSlot, slotDrop, activePegs, [], timestamp);

    const targetRuns = homeAutoCancelRequested ? spawned : runs;
    if (completed < targetRuns || animations.length > 0) {
      requestAnimationFrame(frame);
      return;
    }

    homeAutoRunning = false;
    homeAutoCancelRequested = false;
    const refund = Math.max(0, runs - spawned) * stakePerBall;
    setBalance(state.balance + totalPayout + refund);
    addLedger("Пирамида авто итог", totalPayout);
    if (refund > 0) addLedger("Пирамида: возврат несыгранных", refund);
    state.games += completed;
    setHomeWinbarContent(refund > 0 ? `СТОП +${format(totalPayout)}` : `ИТОГ +${format(totalPayout)}`, true);
    const finalWinbar = $("#home-winbar");
    if (finalWinbar) finalWinbar.classList.add("show");
    pulseHomeWinbar(true);
    hideHomeAutoCounter(900);
    if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
    homeWinbarTimer = setTimeout(() => {
      const currentWinbar = $("#home-winbar");
      if (currentWinbar) currentWinbar.classList.remove("show");
      homeWinbarTimer = null;
    }, 1400);
    if (play) {
      play.disabled = false;
      const playLabel = play.querySelector("strong");
      if (playLabel) playLabel.textContent = "ИГРАТЬ";
    }
    render();
    drawHomeBoard();
    requestHomeEffectsFrame();
  }

  requestAnimationFrame(frame);
}

function spawnHomeManualBall() {
  const rect = homeCanvas.getBoundingClientRect();
  const canvasWidth = Math.round(rect.width);
  const canvasHeight = Math.round(rect.height);
  homeManualAnimations.push(createHomePhysicsAnimation(state.homeStake, 0, canvasWidth, canvasHeight, state.homeRisk, state.homeRows));
}

function fillHomeManualSlots() {
  while (homeManualQueuedBalls > 0 && homeManualAnimations.length < HOME_MANUAL_MAX_ACTIVE_BALLS) {
    homeManualQueuedBalls -= 1;
    spawnHomeManualBall();
  }
}

function runHomeManualLoop() {
  if (homeManualRunning) return;
  homeManualRunning = true;

  function frame(timestamp) {
    fillHomeManualSlots();
    const ballEntries = [];
    const activePegs = [];

    for (let index = homeManualAnimations.length - 1; index >= 0; index -= 1) {
      const animation = homeManualAnimations[index];
      if (!animation.start) animation.start = timestamp;
      const frameState = getHomeBallFrame(animation, timestamp);
      if (frameState.done) {
        resolveHomePhysicsAnimation(animation);
        homeManualAnimations.splice(index, 1);
        homeManualImpactSlot = animation.slot;
        homeManualImpactStarted = timestamp;
        triggerHomeWinEffect(animation.slot, animation.multiplier, timestamp);
        setBalance(state.balance + animation.payout);
        addLedger(`Pyramid win ${animation.multiplier.toFixed(2)}x`, animation.payout);
        state.games += 1;
        flashHomeWinbar(`+${format(animation.payout)}`, 820, true);
        if (animation.multiplier >= 2) pulseHomeWinbar(true);
        render();
      } else {
        ballEntries.push({ ball: frameState.ball, trail: frameState.trail });
        if (Array.isArray(frameState.activePeg)) activePegs.push(...frameState.activePeg);
        else activePegs.push(frameState.activePeg);
      }
    }

    let slotDrop = 0;
    if (homeManualImpactSlot >= 0) {
      const impactProgress = Math.min((timestamp - homeManualImpactStarted) / 260, 1);
      slotDrop = Math.sin(impactProgress * Math.PI) * 9;
      if (impactProgress >= 1) homeManualImpactSlot = -1;
    }

    drawHomeBoard(ballEntries, homeManualImpactSlot, slotDrop, activePegs, [], timestamp);

    if (homeManualAnimations.length > 0 || homeManualImpactSlot >= 0 || homeManualQueuedBalls > 0) {
      requestAnimationFrame(frame);
      return;
    }

    homeManualRunning = false;
    if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
    homeWinbarTimer = setTimeout(() => {
      const winbar = $("#home-winbar");
      if (winbar) winbar.classList.remove("show");
      homeWinbarTimer = null;
      homeManualTotalPayout = 0;
    }, 1300);
    drawHomeBoard();
    requestHomeEffectsFrame();
  }

  requestAnimationFrame(frame);
}

function playHomePyramid() {
  const runs = state.homeMode === "auto" ? state.homeAutoBalls : 1;
  state.homeRuns = runs;
  const totalStake = state.homeStake * runs;
  const winbar = $("#home-winbar");
  if (totalStake <= 0) return;
  if (totalStake > state.balance) {
    flashHomeWinbar("Недостаточно кристаллов", 1200);
    return;
  }

  if (state.homeMode === "auto") {
    if (cancelHomeAutoPyramid()) return;
    playHomeAutoPyramid(runs, totalStake);
    return;
  }

  if (!homeManualRunning && homeManualAnimations.length === 0 && homeManualQueuedBalls === 0) {
    homeManualTotalPayout = 0;
  }

  if (homeWinbarTimer) {
    clearTimeout(homeWinbarTimer);
    homeWinbarTimer = null;
  }

  if (winbar) {
    winbar.classList.remove("show");
    winbar.textContent = "";
  }
  setBalance(state.balance - totalStake);
  addLedger("Пирамида: 1 шарик", -totalStake);
  if (homeManualAnimations.length < HOME_MANUAL_MAX_ACTIVE_BALLS) {
    spawnHomeManualBall();
  } else {
    homeManualQueuedBalls += 1;
  }
  runHomeManualLoop();
  render();
}

function drawPlinko(ball = null, hotSlot = -1) {
  if (!plinkoCtx || !plinkoCanvas) return;
  const ctx = plinkoCtx;
  const width = plinkoCanvas.width;
  const height = plinkoCanvas.height;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(255,63,212,0.18)");
  gradient.addColorStop(1, "rgba(51,233,255,0.04)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, i * 54);
    ctx.lineTo(width, i * 54 + 28);
    ctx.stroke();
  }

  for (let row = 0; row < 12; row += 1) {
    const count = row + 2;
    const y = 58 + row * 25;
    for (let col = 0; col < count; col += 1) {
      const x = width / 2 + (col - (count - 1) / 2) * 23;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.shadowColor = "rgba(51,233,255,0.7)";
      ctx.shadowBlur = 7;
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;

  const slotWidth = width / 13;
  for (let i = 0; i < 13; i += 1) {
    ctx.fillStyle = i === hotSlot ? "rgba(255,63,212,0.56)" : "rgba(255,255,255,0.08)";
    ctx.fillRect(i * slotWidth + 2, height - 42, slotWidth - 4, 34);
  }

  if (ball) {
    ctx.beginPath();
    ctx.fillStyle = "#ffd36b";
    ctx.shadowColor = "rgba(255,211,107,0.85)";
    ctx.shadowBlur = 18;
    ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function animatePlinko(path, slot, onDone) {
  const points = [{ x: plinkoCanvas.width / 2, y: 28 }];
  for (let row = 0; row < path.length; row += 1) {
    const y = 58 + row * 25;
    const x = plinkoCanvas.width / 2 + (path[row] - (row + 1) / 2) * 23;
    points.push({ x, y });
  }
  points.push({ x: (slot + 0.5) * (plinkoCanvas.width / 13), y: plinkoCanvas.height - 56 });

  let start = null;
  const duration = 1250;
  function frame(timestamp) {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const scaled = progress * (points.length - 1);
    const index = Math.floor(scaled);
    const local = scaled - index;
    const a = points[index];
    const b = points[Math.min(index + 1, points.length - 1)];
    const ball = {
      x: a.x + (b.x - a.x) * local,
      y: a.y + (b.y - a.y) * local + Math.sin(progress * Math.PI * 10) * 3,
    };
    drawPlinko(ball, progress === 1 ? slot : -1);
    if (progress < 1) requestAnimationFrame(frame);
    else onDone();
  }
  requestAnimationFrame(frame);
}

const raceCanvas = $("#race-canvas");
const raceCtx = raceCanvas.getContext("2d");

function drawRace(progressA = 0, progressB = 0, winner = "") {
  const ctx = raceCtx;
  const w = raceCanvas.width;
  const h = raceCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, 0, w, h);

  const lanes = [
    { y: 130, color: "#33e9ff", label: "Ты" },
    { y: 235, color: "#ff3fd4", label: "Соперник" },
  ];

  lanes.forEach((lane, idx) => {
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(28, lane.y);
    ctx.bezierCurveTo(95, lane.y - 70, 180, lane.y + 78, 302, lane.y);
    ctx.stroke();

    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,211,107,0.75)" : "rgba(255,255,255,0.35)";
      ctx.fillRect(78 + i * 52, lane.y - 12, 8, 24);
    }

    const t = idx === 0 ? progressA : progressB;
    const x = 28 + 274 * t;
    const y = lane.y + Math.sin(t * Math.PI * 4) * 22;
    ctx.beginPath();
    ctx.fillStyle = lane.color;
    ctx.shadowColor = lane.color;
    ctx.shadowBlur = 16;
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "12px system-ui";
    ctx.fillText(lane.label, 26, lane.y - 28);
  });

  ctx.fillStyle = "rgba(96,255,168,0.8)";
  ctx.fillRect(302, 82, 4, 200);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "12px system-ui";
  ctx.fillText("ФИНИШ", 272, 304);

  if (winner) {
    ctx.fillStyle = "rgba(9,6,19,0.72)";
    ctx.fillRect(55, 156, 220, 58);
    ctx.fillStyle = winner === "player" ? "#60ffa8" : "#ff6b8a";
    ctx.font = "bold 20px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(winner === "player" ? "ТЫ ПОБЕДИЛ" : "ПОБЕДИЛ СОПЕРНИК", w / 2, 192);
    ctx.textAlign = "left";
  }
}

function animateRace(playerChance, bank, payout) {
  const winner = Math.random() < playerChance ? "player" : "enemy";
  let start = null;
  const duration = 1800;
  function frame(timestamp) {
    if (!start) start = timestamp;
    const p = Math.min((timestamp - start) / duration, 1);
    const lead = winner === "player" ? 0.08 : -0.08;
    const a = Math.min(1, p + lead * p);
    const b = Math.min(1, p - lead * p);
    drawRace(a, b, p === 1 ? winner : "");
    if (p < 1) requestAnimationFrame(frame);
    else {
      if (winner === "player") {
        setBalance(state.balance + payout);
        addLedger("PvP победа", payout);
        $("#pvp-result").textContent = `Победа! Банк ${format(bank)}, выплата ${format(payout)} ✦.`;
      } else {
        $("#pvp-result").textContent = `Соперник быстрее. Банк комнаты был ${format(bank)} ✦.`;
      }
      state.games += 1;
      render();
    }
  }
  requestAnimationFrame(frame);
}

function playPlinko() {
  const button = $("#play-plinko");
  const stakeInput = $("#stake-input");
  const resultLine = $("#plinko-result");
  if (!button || !stakeInput || !resultLine) return;
  const stake = Math.round(Number($("#stake-input").value || 0));
  const limit = riskLimits[state.risk];
  if (stake <= 0) {
    $("#plinko-result").textContent = "Ставка должна быть больше 0.";
    return;
  }
  if (stake > limit) {
    $("#plinko-result").textContent = `Для ${state.risk} лимит ${format(limit)} ✦.`;
    return;
  }
  if (stake > state.balance) {
    $("#plinko-result").textContent = "Не хватает кристаллов.";
    return;
  }

  button.disabled = true;
  setBalance(state.balance - stake);
  addLedger("Solo ставка", -stake);
  const result = weightedSlotFromFairWalk(12);
  const multiplier = getMultipliers(12, state.risk)[result.slot];
  const payout = Math.round(stake * multiplier);
  $("#plinko-result").textContent = "Шарик падает...";
  animatePlinko(result.path, result.slot, () => {
    setBalance(state.balance + payout);
    addLedger(`Solo выплата ${multiplier.toFixed(3)}x`, payout);
    state.games += 1;
    $("#plinko-result").textContent = `Слот ${result.slot}, коэффициент ${multiplier.toFixed(3)}x, выплата ${format(payout)} ✦.`;
    button.disabled = false;
    renderSlots(result.slot);
    render();
  });
}

function pushCarpetHistory(result, multiplier, payout = 0) {
  state.carpet.history.unshift({
    result,
    multiplier: floorMultiplier(Math.max(1, multiplier)),
    payout,
  });
  state.carpet.history = state.carpet.history.slice(0, CARPET_HISTORY_LIMIT);
}

function resetCarpetRound(delay = 980) {
  renderCarpet();
  setTimeout(() => {
    state.carpet.status = "READY";
    state.carpet.multiplier = 1;
    state.carpet.round = null;
    state.carpet.crashPoint = null;
    state.carpet.roundStartedAt = null;
    state.carpet.animationFrameId = null;
    state.carpet.cashedOutMultiplier = null;
    state.carpet.pendingCashout = false;
    state.carpet.payout = 0;
    renderCarpet();
    maybeContinueCarpetAutoRuns();
  }, delay);
}

function finishCarpetCrash() {
  const carpet = state.carpet;
  if (carpet.animationFrameId) cancelAnimationFrame(carpet.animationFrameId);
  carpet.animationFrameId = null;
  carpet.status = "CRASHED";
  carpet.multiplier = carpetEngine.lockMultiplier(carpet.crashPoint || carpet.multiplier);
  carpet.protectedRoundsPlayed += 1;
  pushCarpetHistory("crash", carpet.multiplier, 0);
  addLedger(`Ковер: буря ${formatCarpetMultiplier(carpet.multiplier)}x`, 0);
  state.games += 1;
  render();
  resetCarpetRound(760);
}

function cashoutCarpetRound() {
  const carpet = state.carpet;
  if (carpet.status !== "FLYING") return;
  if (carpet.animationFrameId) cancelAnimationFrame(carpet.animationFrameId);
  const locked = carpetEngine.lockMultiplier(carpet.multiplier);
  const payout = carpetEngine.getPayout(carpet.stake, locked);
  carpet.animationFrameId = null;
  carpet.status = "CASHED_OUT";
  carpet.cashedOutMultiplier = locked;
  carpet.payout = payout;
  carpet.protectedRoundsPlayed += 1;
  pushCarpetHistory("cashout", locked, payout);
  setBalance(state.balance + payout);
  addLedger(`Ковер: забрано ${formatCarpetMultiplier(locked)}x`, payout);
  state.games += 1;
  render();
  resetCarpetRound(1050);
}

function tickCarpetRound(timestamp) {
  const carpet = state.carpet;
  if (carpet.status !== "FLYING") return;
  if (!carpet.roundStartedAt) carpet.roundStartedAt = timestamp;

  const elapsed = timestamp - carpet.roundStartedAt;
  carpet.multiplier = carpetEngine.getMultiplier(elapsed);

  if (carpet.multiplier >= CARPET_MAX_CRASH_DISPLAY) {
    carpet.multiplier = CARPET_MAX_CRASH_DISPLAY;
    cashoutCarpetRound();
    return;
  }

  if (carpetEngine.shouldAutoCashout(carpet)) {
    carpet.multiplier = carpet.autoCashout;
    cashoutCarpetRound();
    return;
  }

  if (carpetEngine.shouldCrash(carpet)) {
    finishCarpetCrash();
    return;
  }

  renderCarpet();
  carpet.animationFrameId = requestAnimationFrame(tickCarpetRound);
}

function startCarpetRound() {
  const carpet = state.carpet;
  if (carpet.status !== "READY") return;
  if (carpet.stake > state.balance) {
    const stage = $("#carpet-stage");
    const status = $("#carpet-status");
    if (status) status.textContent = "НЕДОСТАТОЧНО КРИСТАЛЛОВ";
    if (stage) {
      stage.classList.add("message");
      setTimeout(() => stage.classList.remove("message"), 900);
    }
    carpet.autoRunning = false;
    carpet.autoRunsRemaining = 0;
    renderCarpet();
    return;
  }

  if (carpet.autoRunning) carpet.autoRunsRemaining = Math.max(0, carpet.autoRunsRemaining - 1);
  const round = carpetEngine.createRound({
    protectedRoundsPlayed: carpet.protectedRoundsPlayed,
  });
  carpet.status = "STARTING";
  carpet.multiplier = 1;
  carpet.round = round;
  carpet.crashPoint = round.crashPoint;
  carpet.roundStartedAt = null;
  carpet.cashedOutMultiplier = null;
  carpet.pendingCashout = false;
  carpet.payout = 0;
  setBalance(state.balance - carpet.stake);
  addLedger("Ковер: ставка", -carpet.stake);
  render();

  setTimeout(() => {
    if (carpet.status !== "STARTING") return;
    carpet.status = "FLYING";
    carpet.roundStartedAt = performance.now();
    carpet.animationFrameId = requestAnimationFrame(tickCarpetRound);
    renderCarpet();
    if (carpet.pendingCashout) cashoutCarpetRound();
  }, 280);
}

function handleCarpetMainButton() {
  if (state.carpet.autoRunning) {
    cancelCarpetAutoRuns();
    if (state.carpet.status === "FLYING") cashoutCarpetRound();
    return;
  }
  if (state.carpet.status === "FLYING") cashoutCarpetRound();
  else if (state.carpet.status === "STARTING") state.carpet.pendingCashout = true;
  else if (state.carpet.status === "READY") {
    if (state.carpet.betMode === "auto") startCarpetAutoRuns();
    else startCarpetRound();
  }
}

let carpetActionHandledUntil = 0;

function pulseCarpetMainButton() {
  const button = $("#carpet-action-button");
  if (!button) return;
  button.classList.remove("pressed");
  void button.offsetWidth;
  button.classList.add("pressed");
}

function triggerCarpetMainButton() {
  if (["READY", "STARTING", "FLYING"].includes(state.carpet.status)) pulseCarpetMainButton();
  handleCarpetMainButton();
}

function isPrimaryPointer(event) {
  return event.pointerType !== "mouse" || event.button === 0;
}

function isCarpetRoomPointer(event) {
  if (document.body.dataset.activeTab !== "solo") return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("#screen-solo")) && !target.closest(".bottom-nav");
}

function handleCarpetRoomPointerDown(event) {
  if (!isPrimaryPointer(event) || !isCarpetRoomPointer(event)) return;
  if (state.carpet.status !== "FLYING") return;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
  cancelCarpetAutoRuns();
  pulseCarpetMainButton();
  cashoutCarpetRound();
}

function changeCarpetStake(nextStake) {
  const carpet = state.carpet;
  if (carpet.status !== "READY") return;
  carpet.stake = Math.max(carpet.minStake, Math.min(carpet.maxStake, Math.round(nextStake / carpet.stakeStep) * carpet.stakeStep));
  renderCarpet();
}

function changeCarpetAutoCashout(nextValue) {
  const carpet = state.carpet;
  if (carpet.status !== "READY") return;
  const stepped = Math.round(nextValue / CARPET_AUTO_CASHOUT_STEP) * CARPET_AUTO_CASHOUT_STEP;
  carpet.autoCashout = Math.max(CARPET_AUTO_CASHOUT_MIN, Math.min(CARPET_AUTO_CASHOUT_MAX, stepped));
  carpet.autoCashout = Math.round(carpet.autoCashout * 100) / 100;
  renderCarpet();
}

function changeCarpetAutoRuns(nextValue) {
  const carpet = state.carpet;
  if (carpet.status !== "READY" || carpet.autoRunning) return;
  const stepped = Math.round(nextValue / CARPET_AUTO_RUNS_STEP) * CARPET_AUTO_RUNS_STEP;
  carpet.autoRuns = Math.max(CARPET_AUTO_RUNS_MIN, Math.min(CARPET_AUTO_RUNS_MAX, stepped));
  renderCarpet();
}

function getCarpetAutoRunsStep(value) {
  if (value >= 500) return 100;
  if (value >= 100) return 50;
  if (value >= 50) return 10;
  if (value >= 20) return 5;
  return CARPET_AUTO_RUNS_STEP;
}

function startCarpetAutoRuns() {
  const carpet = state.carpet;
  if (carpet.status !== "READY") return;
  if (carpet.mode !== "auto") carpet.mode = "auto";
  carpet.autoRunning = true;
  carpet.autoRunsRemaining = carpet.autoRuns;
  startCarpetRound();
}

function cancelCarpetAutoRuns() {
  const carpet = state.carpet;
  if (!carpet.autoRunning && carpet.autoRunsRemaining === 0) return;
  carpet.autoRunning = false;
  carpet.autoRunsRemaining = 0;
  renderCarpet();
}

function maybeContinueCarpetAutoRuns() {
  const carpet = state.carpet;
  if (!carpet.autoRunning) return;
  if (carpet.betMode !== "auto" || carpet.autoRunsRemaining <= 0) {
    carpet.autoRunning = false;
    carpet.autoRunsRemaining = 0;
    renderCarpet();
    return;
  }
  setTimeout(() => {
    if (carpet.status === "READY" && carpet.autoRunning && carpet.autoRunsRemaining > 0) {
      startCarpetRound();
    }
  }, 240);
}

function startPvp() {
  const price = tiers[state.tier];
  const cost = price * state.balls;
  const enemyBalls = Math.max(1, Math.round(state.balls * (0.75 + Math.random() * 0.7)));
  const enemyCost = enemyBalls * price;
  const totalBalls = state.balls + enemyBalls;
  const bank = cost + enemyCost;
  const fee = Math.round(bank * 0.07);
  const payout = bank - fee;
  const chance = state.balls / totalBalls;

  if (cost > state.balance) {
    $("#pvp-result").textContent = "Не хватает кристаллов на шарики.";
    return;
  }
  setBalance(state.balance - cost);
  addLedger(`PvP шарики x${state.balls}`, -cost);
  $("#room-bank").textContent = `Банк: ${format(bank)} ✦`;
  $("#room-timer").textContent = "Старт";
  $("#pvp-result").textContent = `Твой шанс по шарикам: ${Math.round(chance * 100)}%. Комиссия: ${format(fee)} ✦.`;
  animateRace(chance, bank, payout);
}

function initTelegramViewport() {
  const webApp = window.Telegram?.WebApp;
  const params = new URLSearchParams(window.location.search);
  const localTelegramFrame = params.get("preview") === "telegram-frame";
  const designWidth = 393;
  const designHeight = 852;
  if (localTelegramFrame) {
    document.body.classList.add("local-telegram-frame");
  }

  const syncViewport = () => {
    const telegramHeight = webApp?.viewportStableHeight || webApp?.viewportHeight;
    const browserHeight = window.innerHeight || document.documentElement.clientHeight;
    const browserWidth = window.innerWidth || document.documentElement.clientWidth;
    const height = Math.max(420, Math.round(telegramHeight || browserHeight));
    const width = Math.max(320, Math.round(browserWidth));
    const scale = Math.min(1, width / designWidth, height / designHeight);
    document.documentElement.style.setProperty("--app-height", `${height}px`);
    document.documentElement.style.setProperty("--app-width", `${width}px`);
    document.documentElement.style.setProperty("--app-scale", `${scale}`);
    document.documentElement.style.setProperty("--nav-top", `${766 * scale}px`);
    drawHomeBoard();
    renderCarpet();
  };

  syncViewport();
  window.addEventListener("resize", syncViewport);

  if (!webApp) return;
  document.body.classList.add("is-telegram-webapp");
  webApp.ready?.();
  webApp.expand?.();
  webApp.disableVerticalSwipes?.();
  webApp.onEvent?.("viewportChanged", syncViewport);
  webApp.onEvent?.("safeAreaChanged", syncViewport);
  syncViewport();
}

function initMobileGestureGuards() {
  document.addEventListener("dblclick", (event) => {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", (event) => {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
}

function initEvents() {
  $$("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  const playerProfileLink = $("#player-profile-link");
  if (playerProfileLink) {
    playerProfileLink.addEventListener("click", () => switchTab("profile"));
  }

  const carpetProfileLink = $("#carpet-profile-link");
  if (carpetProfileLink) {
    carpetProfileLink.addEventListener("click", () => switchTab("profile"));
  }

  const carpetActionButton = $("#carpet-action-button");
  if (carpetActionButton) {
    carpetActionButton.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      carpetActionHandledUntil = performance.now() + 320;
      triggerCarpetMainButton();
    });
    carpetActionButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (performance.now() < carpetActionHandledUntil) return;
      triggerCarpetMainButton();
    });
  }
  document.addEventListener("pointerdown", handleCarpetRoomPointerDown, true);

  $$("[data-carpet-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
      }
      if (state.carpet.status !== "READY") return;
      state.carpet.mode = button.dataset.carpetMode;
      if (state.carpet.mode === "manual") state.carpet.betMode = "manual";
      pulseChoice(button);
      renderCarpet();
    });
  });

  const carpetCashoutMinus = $("#carpet-cashout-minus");
  if (carpetCashoutMinus) {
    carpetCashoutMinus.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetAutoCashout(state.carpet.autoCashout - CARPET_AUTO_CASHOUT_STEP);
    });
  }

  const carpetCashoutPlus = $("#carpet-cashout-plus");
  if (carpetCashoutPlus) {
    carpetCashoutPlus.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetAutoCashout(state.carpet.autoCashout + CARPET_AUTO_CASHOUT_STEP);
    });
  }

  $$("[data-carpet-bet-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
      }
      if (state.carpet.status !== "READY") return;
      state.carpet.betMode = button.dataset.carpetBetMode;
      if (state.carpet.betMode === "auto") state.carpet.mode = "auto";
      pulseChoice(button);
      renderCarpet();
    });
  });

  const carpetRunsMinus = $("#carpet-runs-minus");
  if (carpetRunsMinus) {
    carpetRunsMinus.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetAutoRuns(state.carpet.autoRuns - getCarpetAutoRunsStep(state.carpet.autoRuns));
    });
  }

  const carpetRunsPlus = $("#carpet-runs-plus");
  if (carpetRunsPlus) {
    carpetRunsPlus.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetAutoRuns(state.carpet.autoRuns + getCarpetAutoRunsStep(state.carpet.autoRuns));
    });
  }

  const carpetStakeMinus = $("#carpet-stake-minus");
  if (carpetStakeMinus) {
    carpetStakeMinus.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetStake(state.carpet.stake - getHomeStakeDecreaseStep(state.carpet.stake));
    });
  }

  const carpetStakePlus = $("#carpet-stake-plus");
  if (carpetStakePlus) {
    carpetStakePlus.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetStake(state.carpet.stake + state.carpet.stakeStep);
    });
  }

  const carpetStakeDouble = $("#carpet-stake-double");
  if (carpetStakeDouble) {
    carpetStakeDouble.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetStake(state.carpet.stake * 2);
    });
  }

  const carpetStakeMax = $("#carpet-stake-max");
  if (carpetStakeMax) {
    carpetStakeMax.addEventListener("click", () => {
      if (state.carpet.autoRunning) {
        cancelCarpetAutoRuns();
        return;
      }
      changeCarpetStake(Math.min(state.carpet.maxStake, state.balance));
    });
  }

  const claimDaily = $("#claim-daily");
  if (claimDaily) {
    claimDaily.addEventListener("click", () => {
      if (state.dailyClaimed) return;
      state.dailyClaimed = true;
      setBalance(state.balance + 40);
      addLedger("Daily bonus", 40);
    });
  }

  const homePlay = $("#home-play");
  if (homePlay) homePlay.addEventListener("click", playHomePyramid);

  const linesMinus = $("#home-lines-minus");
  if (linesMinus) {
    linesMinus.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeRows = Math.max(HOME_ROWS_MIN, state.homeRows - 1);
      if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
      homeWinbarTimer = null;
      const winbar = $("#home-winbar");
      if (winbar) winbar.classList.remove("show");
      render();
      drawHomeBoard();
    });
  }

  const linesPlus = $("#home-lines-plus");
  if (linesPlus) {
    linesPlus.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeRows = Math.min(HOME_ROWS_MAX, state.homeRows + 1);
      if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
      homeWinbarTimer = null;
      const winbar = $("#home-winbar");
      if (winbar) winbar.classList.remove("show");
      render();
      drawHomeBoard();
    });
  }

  $$(".risk-choice").forEach((button) => {
    button.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      $$(".risk-choice").forEach((item) => item.classList.toggle("selected", item === button));
      pulseChoice(button);
      state.homeRisk = button.classList.contains("high") ? "high" : button.classList.contains("low") ? "low" : "medium";
      const winbar = $("#home-winbar");
      if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
      homeWinbarTimer = null;
      if (winbar) winbar.classList.remove("show");
      drawHomeBoard();
    });
  });

  $$("[data-home-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      $$("[data-home-mode]").forEach((item) => item.classList.toggle("selected", item === button));
      pulseChoice(button);
      state.homeMode = button.dataset.homeMode;
      state.homeRuns = state.homeMode === "auto" ? state.homeAutoBalls : 1;
      const winbar = $("#home-winbar");
      if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
      homeWinbarTimer = null;
      if (winbar) winbar.classList.remove("show");
      render();
    });
  });

  $$("[data-auto-balls]").forEach((button) => {
    button.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeAutoBalls = Number(button.dataset.autoBalls);
      if (state.homeMode === "auto") state.homeRuns = state.homeAutoBalls;
      render();
    });
  });

  const autoRange = $("#home-auto-range");
  if (autoRange) {
    autoRange.addEventListener("input", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeAutoBalls = getHomeAutoBallsFromProgress(Number(autoRange.value) / 1000);
      if (state.homeMode === "auto") state.homeRuns = state.homeAutoBalls;
      render();
    });
  }

  const stakeMinus = $("#home-stake-minus");
  if (stakeMinus) {
    stakeMinus.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeStake = Math.max(HOME_STAKE_MIN, state.homeStake - getHomeStakeDecreaseStep(state.homeStake));
      render();
    });
  }

  const stakePlus = $("#home-stake-plus");
  if (stakePlus) {
    stakePlus.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeStake = Math.min(HOME_STAKE_MAX, state.homeStake + HOME_STAKE_STEP);
      render();
    });
  }

  const stakeDouble = $("#home-stake-double");
  if (stakeDouble) {
    stakeDouble.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeStake = Math.min(HOME_STAKE_MAX, Math.max(HOME_STAKE_MIN, state.homeStake * 2));
      render();
    });
  }

  const stakeMax = $("#home-stake-max");
  if (stakeMax) {
    stakeMax.addEventListener("click", () => {
      if (cancelHomeAutoPyramid()) return;
      state.homeStake = Math.max(HOME_STAKE_MIN, Math.min(HOME_STAKE_MAX, state.balance));
      render();
    });
  }

  $$("#risk-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.risk = button.dataset.risk;
      $$("#risk-tabs button").forEach((item) => item.classList.toggle("selected", item === button));
      updateLimits();
      renderSlots();
    });
  });

  $$("#tier-grid button").forEach((button) => {
    button.addEventListener("click", () => {
      state.tier = button.dataset.tier;
      $$("#tier-grid button").forEach((item) => item.classList.toggle("selected", item === button));
    });
  });

  const ballsMinus = $("#balls-minus");
  if (ballsMinus) ballsMinus.addEventListener("click", () => {
    state.balls = Math.max(1, state.balls - 5);
    $("#balls-count").textContent = state.balls;
  });

  const ballsPlus = $("#balls-plus");
  if (ballsPlus) ballsPlus.addEventListener("click", () => {
    state.balls = Math.min(150, state.balls + 5);
    $("#balls-count").textContent = state.balls;
  });

  const playPlinkoButton = $("#play-plinko");
  if (playPlinkoButton) playPlinkoButton.addEventListener("click", playPlinko);
  const startPvpButton = $("#start-pvp");
  if (startPvpButton) startPvpButton.addEventListener("click", startPvp);

  const buyUsdt = $("#buy-usdt");
  if (buyUsdt) buyUsdt.addEventListener("click", () => {
    setBalance(state.balance + 100);
    addLedger("Покупка за 1 USDT", 100);
  });
  const buyTon = $("#buy-ton");
  if (buyTon) buyTon.addEventListener("click", () => {
    setBalance(state.balance + 150);
    addLedger("Покупка за 1 TON", 150);
  });
  const withdrawTest = $("#withdraw-test");
  if (withdrawTest) withdrawTest.addEventListener("click", () => {
    const amount = 500;
    const fee = 25;
    if (state.balance < amount) {
      $("#wallet-ledger").prepend();
      return;
    }
    setBalance(state.balance - amount);
    addLedger(`Вывод: ${amount - fee} ✦ после комиссии`, -amount);
  });
}

initTelegramViewport();
initMobileGestureGuards();
drawPlinko();
drawRace();
drawHomeBoard();
initEvents();
document.body.dataset.activeTab = "home";
render();
window.addEventListener("resize", () => {
  drawHomeBoard();
  const canvas = getCarpetTrailCanvas();
  if (canvas) {
    resizeCarpetTrailCanvas(canvas);
    startCarpetTrailRenderer();
  }
});

