const config = {
  rubiesPerUsdt: 100,
  targetRtp: 0.95,
  referralShareOfNgr: 0.15,
  streakBudgetShareOfNgr: 0.05,
  streakRewardsRubies: [1, 1, 2, 2, 3, 4, 7],
  demo: {
    refillToRubies: 10000,
    refillThresholdRubies: 1000,
    refillCooldownHours: 24,
    maxStakeShareOfBalance: 0.05,
  },
};

function readPositiveNumber(index, fallback) {
  const value = Number(process.argv[index]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function roundRubies(value) {
  return Math.round(value);
}

function calculateEconomy(turnoverRubies, deductionsRubies = 0) {
  const expectedPayout = turnoverRubies * config.targetRtp;
  const ggr = turnoverRubies - expectedPayout;
  const ngr = Math.max(0, ggr - deductionsRubies);
  const referral = ngr * config.referralShareOfNgr;
  const streakBudget = ngr * config.streakBudgetShareOfNgr;
  const retained = ngr - referral - streakBudget;
  const fullStreakFaceValue = config.streakRewardsRubies.reduce((sum, value) => sum + value, 0);
  const fullStreakExpectedCost = fullStreakFaceValue * config.targetRtp;

  return {
    turnoverRubies: roundRubies(turnoverRubies),
    turnoverUsdt: turnoverRubies / config.rubiesPerUsdt,
    expectedPayoutRubies: roundRubies(expectedPayout),
    ggrRubies: roundRubies(ggr),
    deductionsRubies: roundRubies(deductionsRubies),
    ngrRubies: roundRubies(ngr),
    referralRubies: roundRubies(referral),
    streakBudgetRubies: roundRubies(streakBudget),
    retainedRubies: roundRubies(retained),
    maximumFundedFullStreaks: Math.floor(streakBudget / fullStreakExpectedCost),
  };
}

const turnoverRubies = readPositiveNumber(2, 1000000);
const deductionsRubies = readPositiveNumber(3, 0);
const scenario = calculateEconomy(turnoverRubies, deductionsRubies);

console.log(JSON.stringify({
  config,
  formulas: {
    ggr: "turnover * (1 - RTP)",
    ngr: "max(0, GGR - bonuses - refunds - chargebacks - payment/provider fees - taxes)",
    referral: "NGR * 15%",
    streakBudget: "NGR * 5%",
    retained: "NGR - referral - streakBudget",
    demoMaxStake: "min(roomMaxStake, demoBalance * 5%)",
  },
  scenario,
}, null, 2));
