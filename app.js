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
const HOME_AUTO_MAX_ACTIVE_BALLS = 10;
const HOME_MANUAL_MAX_ACTIVE_BALLS = 12;
const HOME_AUTO_BALL_DURATION = 2250;
const HOME_EFFECT_GOOD_MULTIPLIER = 2;
const HOME_EFFECT_COIN_COUNT = 16;
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
const multiplierCache = new Map();

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
  if (total <= 20) return 675;
  if (total <= 50) return 495;
  if (total <= 100) return 375;
  if (total <= 250) return 310;
  return 270;
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

function getMultipliers(rows, risk) {
  const key = `${rows}:${risk}`;
  if (multiplierCache.has(key)) return multiplierCache.get(key);

  const profile = riskProfiles[risk] || riskProfiles.medium;
  const center = rows / 2;
  const raw = Array.from({ length: rows + 1 }, (_, slot) => {
    const distance = Math.abs(slot - center) / center;
    return profile.base + profile.edge * distance ** profile.power;
  });
  const expected = raw.reduce((sum, value, slot) => sum + value * slotProbability(rows, slot), 0);
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

function generateCarpetCrashPoint() {
  const safeU = Math.max(Math.random(), Number.EPSILON);
  let crashPoint = CARPET_RTP / safeU;
  if (state.carpet.protectedRoundsPlayed < CARPET_PROTECTED_ROUNDS) {
    crashPoint = Math.max(crashPoint, CARPET_MIN_PROTECTED_CRASH);
  }
  return crashPoint;
}

function getCarpetMultiplier(elapsedMs) {
  return Math.exp(CARPET_GROWTH_RATE * elapsedMs);
}

function getCarpetProgress(multiplier) {
  return Math.max(0, Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(10)));
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
  const x = Math.pow(progress, 0.72) * 210;
  const y = Math.pow(progress, 1.35) * -310;
  const scale = 1;
  const rotate = -8 + progress * 12;

  stage.style.setProperty("--carpet-progress", progress.toFixed(4));
  stage.classList.toggle("ready", carpet.status === "READY");
  stage.classList.toggle("flying", carpet.status === "FLYING" || carpet.status === "STARTING");
  stage.classList.toggle("cashed", carpet.status === "CASHED_OUT");
  stage.classList.toggle("message", ["CASHED_OUT", "CRASHED", "STARTING"].includes(carpet.status));
  stage.classList.toggle("crashed", carpet.status === "CRASHED");

  const hero = $("#carpet-hero-wrap");
  if (hero) {
    hero.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
    hero.style.setProperty("--crash-x", `${x}px`);
    hero.style.setProperty("--crash-y", `${y}px`);
  }

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
    if (carpet.status === "FLYING" || carpet.status === "STARTING") label.textContent = "ЗАБРАТЬ";
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
    const unknown = document.createElement("span");
    unknown.className = "carpet-chip unknown";
    unknown.textContent = "?";
    history.appendChild(unknown);

    carpet.history.slice(0, 5).forEach((round) => {
      const chip = document.createElement("span");
      chip.className = `carpet-chip ${round.result}`;
      chip.textContent = formatCarpetMultiplier(round.multiplier);
      history.appendChild(chip);
    });
  }
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

function getHomeBoardGeometry(width, rows) {
  const slotCount = rows + 1;
  const pegTop = 34;
  const slotY = 320;
  const pegStep = (slotY - 58 - pegTop) / Math.max(1, rows - 1);
  const pegGap = Math.min(26, (width - 40) / Math.max(1, rows));
  const slotWidth = Math.max(15, Math.min(28, pegGap - 2));
  const slotHeight = Math.max(8, Math.min(13, slotWidth * (8 / 18)));
  const centerX = (index) => width / 2 + (index - (slotCount - 1) / 2) * pegGap;
  return { slotCount, pegTop, slotY, pegStep, pegGap, slotWidth, slotHeight, centerX };
}

function drawHomeLauncher(ctx, width) {
  const x = width / 2;
  const y = 10;
  const glow = ctx.createRadialGradient(x, y, 4, x, y, 24);
  glow.addColorStop(0, "rgba(255, 73, 182, 0.28)");
  glow.addColorStop(0.54, "rgba(255, 73, 182, 0.1)");
  glow.addColorStop(1, "rgba(255, 73, 182, 0)");

  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();

  const rim = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, 15);
  rim.addColorStop(0, "#fff0a8");
  rim.addColorStop(0.48, "#ffcc68");
  rim.addColorStop(1, "#7b3455");

  ctx.shadowColor = "rgba(255, 211, 126, 0.58)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  const depth = ctx.createRadialGradient(x, y + 2, 1, x, y + 2, 10);
  depth.addColorStop(0, "rgba(3, 1, 8, 0.98)");
  depth.addColorStop(0.64, "rgba(13, 5, 24, 0.96)");
  depth.addColorStop(1, "rgba(255, 73, 182, 0.48)");

  ctx.fillStyle = depth;
  ctx.strokeStyle = "rgba(255, 73, 182, 0.78)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y + 1, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + 15, 11, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
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

function getHomeBallPoints(path, slot, canvasWidth) {
  const rows = path.length;
  const { pegTop, slotY, pegStep, pegGap, centerX } = getHomeBoardGeometry(canvasWidth, rows);
  const points = [{ x: canvasWidth / 2, y: 10 }];
  for (let row = 0; row < path.length; row += 1) {
    const y = pegTop + row * pegStep;
    const x = canvasWidth / 2 + (path[row] - (row + 1) / 2) * pegGap;
    points.push({ x, y });
  }
  points.push({ x: centerX(slot), y: slotY - 4 });
  return points;
}

function getHomeTouchedPeg(path, row) {
  const previousSlot = row > 0 ? path[row - 1] : 0;
  const currentSlot = path[row];
  const touchedCol = currentSlot > previousSlot ? currentSlot - 1 : currentSlot;
  return {
    row,
    col: Math.max(0, Math.min(row, touchedCol)),
  };
}

function getHomeBallFrame(animation, timestamp) {
  const progress = Math.min((timestamp - animation.start) / animation.duration, 1);
  const scaled = progress * (animation.points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = animation.points[index];
  const b = animation.points[Math.min(index + 1, animation.points.length - 1)];
  const ball = {
    x: a.x + (b.x - a.x) * local,
    y: a.y + (b.y - a.y) * local + Math.sin(progress * Math.PI * 10) * 3,
    radius: 5,
  };
  const activeRow = Math.max(0, Math.min(animation.path.length - 1, index));
  animation.trail.push({ x: ball.x, y: ball.y });
  if (animation.trail.length > 7) animation.trail.shift();
  return {
    ball,
    trail: animation.trail,
    activePeg: getHomeTouchedPeg(animation.path, activeRow),
    done: progress >= 1,
  };
}

const homeWinEffects = [];
let homeEffectsRunning = false;

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

function createHomeSparkBurst(slot, timestamp) {
  const rect = homeCanvas.getBoundingClientRect();
  const width = Math.round(rect.width);
  const { slotY, centerX } = getHomeBoardGeometry(width, state.homeRows);
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
  const edgeWin = slot <= 1 || slot >= slotCount - 2;
  if (edgeWin) {
    createHomeCoinBurst("left", width, height, timestamp);
    createHomeCoinBurst("right", width, height, timestamp);
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
    const progress = Math.min((timestamp - particle.start) / particle.duration, 1);
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
  const { slotCount, pegTop, slotY, pegStep, pegGap, slotWidth, slotHeight, centerX } = getHomeBoardGeometry(width, rows);

  drawHomeLauncher(ctx, width);

  ctx.save();
  ctx.globalAlpha = 0.95;
  for (let row = 0; row < rows; row += 1) {
    const count = row + 1;
    const y = pegTop + row * pegStep;
    for (let col = 0; col < count; col += 1) {
      const x = width / 2 + (col - (count - 1) / 2) * pegGap;
      const isActivePeg = activePegs.some((peg) => peg && peg.row === row && peg.col === col);
      if (isActivePeg) {
        const activeGlow = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 6.2);
        activeGlow.addColorStop(0, "rgba(255, 255, 205, 1)");
        activeGlow.addColorStop(0.48, "rgba(255, 244, 116, 0.95)");
        activeGlow.addColorStop(1, "rgba(255, 213, 68, 0.18)");
        ctx.beginPath();
        ctx.fillStyle = activeGlow;
        ctx.shadowColor = "rgba(255, 239, 104, 0.95)";
        ctx.shadowBlur = 14;
        ctx.arc(x, y, 5.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = isActivePeg ? "#fff58c" : "#ffd95c";
      ctx.shadowColor = isActivePeg ? "rgba(255, 225, 92, 1)" : "rgba(255, 203, 68, 0.88)";
      ctx.shadowBlur = isActivePeg ? 12 : 6;
      ctx.arc(x, y, isActivePeg ? 4.2 : 3.8, 0, Math.PI * 2);
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

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ballEntries.forEach((entry) => drawHomeBall(ctx, entry.ball, entry.trail || []));
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
  const points = getHomeBallPoints(path, slot, canvasWidth);

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
  if (winbar) {
    if (homeWinbarTimer) clearTimeout(homeWinbarTimer);
    homeWinbarTimer = null;
    winbar.classList.remove("show", "pulse", "big-pulse");
    winbar.textContent = "";
  }
  if (play) play.disabled = true;

  updateHomeAutoCounter(runs);
  setBalance(state.balance - totalStake);
  addLedger(`Пирамида авто: ${format(runs)} шариков`, -totalStake);
  const activeWinbar = setHomeWinbarContent("+0", true);
  if (activeWinbar) activeWinbar.classList.add("show");

  function spawnBall(timestamp) {
    const result = weightedSlotFromFairWalk(state.homeRows);
    const multiplier = multipliers[result.slot] || 0;
    animations.push({
      path: result.path,
      slot: result.slot,
      points: getHomeBallPoints(result.path, result.slot, canvasWidth),
      start: timestamp,
      duration: HOME_AUTO_BALL_DURATION,
      trail: [],
      multiplier,
      payout: Math.round(stakePerBall * multiplier),
    });
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
        animations.splice(index, 1);
        completed += 1;
        totalPayout += animation.payout;
        impactSlot = animation.slot;
        impactStarted = timestamp;
        triggerHomeWinEffect(animation.slot, animation.multiplier, timestamp);
        updateHomeAutoCounter(runs - completed);
        if (animation.payout > 0) {
          setHomeWinbarContent(`+${format(totalPayout)}`, true);
          pulseHomeWinbar(animation.multiplier >= 2);
        }
      } else {
        ballEntries.push({ ball: frameState.ball, trail: frameState.trail });
        activePegs.push(frameState.activePeg);
      }
    }

    while (
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

    if (completed < runs) {
      requestAnimationFrame(frame);
      return;
    }

    homeAutoRunning = false;
    setBalance(state.balance + totalPayout);
    addLedger("Пирамида авто итог", totalPayout);
    state.games += runs;
    setHomeWinbarContent(`ИТОГ +${format(totalPayout)}`, true);
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
    if (play) play.disabled = false;
    render();
    drawHomeBoard();
    requestHomeEffectsFrame();
  }

  requestAnimationFrame(frame);
}

function spawnHomeManualBall() {
  const rect = homeCanvas.getBoundingClientRect();
  const canvasWidth = Math.round(rect.width);
  const multipliers = getMultipliers(state.homeRows, state.homeRisk);
  const result = weightedSlotFromFairWalk(state.homeRows);
  const multiplier = multipliers[result.slot] || 0;
  homeManualAnimations.push({
    path: result.path,
    slot: result.slot,
    points: getHomeBallPoints(result.path, result.slot, canvasWidth),
    start: 0,
    duration: HOME_AUTO_BALL_DURATION,
    trail: [],
    multiplier,
    payout: Math.round(state.homeStake * multiplier),
  });
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
        homeManualAnimations.splice(index, 1);
        homeManualImpactSlot = animation.slot;
        homeManualImpactStarted = timestamp;
        triggerHomeWinEffect(animation.slot, animation.multiplier, timestamp);
        setBalance(state.balance + animation.payout);
        addLedger(`Pyramid win ${animation.multiplier.toFixed(2)}x`, animation.payout);
        state.games += 1;
        homeManualTotalPayout += animation.payout;
        const winbar = setHomeWinbarContent(`+${format(homeManualTotalPayout)}`, true);
        if (winbar) winbar.classList.add("show");
        pulseHomeWinbar(animation.multiplier >= 2);
        render();
      } else {
        ballEntries.push({ ball: frameState.ball, trail: frameState.trail });
        activePegs.push(frameState.activePeg);
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
    if (homeAutoRunning) return;
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

  if (winbar && homeManualTotalPayout === 0) {
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
  carpet.multiplier = Math.max(1, carpet.crashPoint || carpet.multiplier);
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
  const locked = floorMultiplier(carpet.multiplier);
  const payout = Math.floor(carpet.stake * locked);
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
  carpet.multiplier = getCarpetMultiplier(elapsed);

  if (carpet.multiplier >= CARPET_MAX_CRASH_DISPLAY) {
    carpet.multiplier = CARPET_MAX_CRASH_DISPLAY;
    cashoutCarpetRound();
    return;
  }

  if (carpet.mode === "auto" && carpet.autoCashout <= carpet.crashPoint && carpet.multiplier >= carpet.autoCashout) {
    carpet.multiplier = carpet.autoCashout;
    cashoutCarpetRound();
    return;
  }

  if (carpet.multiplier >= carpet.crashPoint) {
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
  carpet.status = "STARTING";
  carpet.multiplier = 1;
  carpet.crashPoint = generateCarpetCrashPoint();
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
    else if (state.carpet.status === "STARTING") state.carpet.pendingCashout = true;
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
  if (!webApp) return;
  document.body.classList.add("is-telegram-webapp");
  webApp.ready?.();
  webApp.expand?.();
  webApp.disableVerticalSwipes?.();
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
        return;
      }
      if (state.carpet.status !== "READY") return;
      state.carpet.mode = button.dataset.carpetMode;
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
        return;
      }
      if (state.carpet.status !== "READY") return;
      state.carpet.betMode = button.dataset.carpetBetMode;
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
      if (homeAutoRunning) return;
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
      if (homeAutoRunning) return;
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
      if (homeAutoRunning) return;
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
      if (homeAutoRunning) return;
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
      if (homeAutoRunning) return;
      state.homeAutoBalls = Number(button.dataset.autoBalls);
      if (state.homeMode === "auto") state.homeRuns = state.homeAutoBalls;
      render();
    });
  });

  const autoRange = $("#home-auto-range");
  if (autoRange) {
    autoRange.addEventListener("input", () => {
      if (homeAutoRunning) return;
      state.homeAutoBalls = getHomeAutoBallsFromProgress(Number(autoRange.value) / 1000);
      if (state.homeMode === "auto") state.homeRuns = state.homeAutoBalls;
      render();
    });
  }

  const stakeMinus = $("#home-stake-minus");
  if (stakeMinus) {
    stakeMinus.addEventListener("click", () => {
      if (homeAutoRunning) return;
      state.homeStake = Math.max(HOME_STAKE_MIN, state.homeStake - getHomeStakeDecreaseStep(state.homeStake));
      render();
    });
  }

  const stakePlus = $("#home-stake-plus");
  if (stakePlus) {
    stakePlus.addEventListener("click", () => {
      if (homeAutoRunning) return;
      state.homeStake = Math.min(HOME_STAKE_MAX, state.homeStake + HOME_STAKE_STEP);
      render();
    });
  }

  const stakeDouble = $("#home-stake-double");
  if (stakeDouble) {
    stakeDouble.addEventListener("click", () => {
      if (homeAutoRunning) return;
      state.homeStake = Math.min(HOME_STAKE_MAX, Math.max(HOME_STAKE_MIN, state.homeStake * 2));
      render();
    });
  }

  const stakeMax = $("#home-stake-max");
  if (stakeMax) {
    stakeMax.addEventListener("click", () => {
      if (homeAutoRunning) return;
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
window.addEventListener("resize", drawHomeBoard);

