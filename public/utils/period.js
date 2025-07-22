const ictuPeriodTable = {
  1: { start: "6:45", end: "7:35" },
  2: { start: "7:40", end: "8:30" },
  3: { start: "8:40", end: "9:30" },
  4: { start: "9:40", end: "10:30" },
  5: { start: "10:35", end: "11:25" },
  6: { start: "13:00", end: "13:50" },
  7: { start: "13:55", end: "14:45" },
  8: { start: "14:55", end: "15:45" },
  9: { start: "15:55", end: "16:45" },
  10: { start: "16:50", end: "17:40" },
  11: { start: "18:15", end: "19:05" },
  12: { start: "19:10", end: "20:00" },
  13: { start: "20:05", end: "20:55" },
  14: { start: "20:20", end: "21:10" },
  15: { start: "21:20", end: "22:10" },
};

export function parsePeriodRange(periodStr) {
  let periods = [];

  if (periodStr.includes("-")) {
    const [start, end] = periodStr.split("-").map(Number);
    periods = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  } else {
    periods = periodStr.split(",").map((p) => parseInt(p));
  }

  const first = periods[0];
  const last = periods[periods.length - 1];

  return {
    firstPeriod: ictuPeriodTable[first] || { start: "?", end: "?" },
    lastPeriod: ictuPeriodTable[last] || { start: "?", end: "?" },
  };
}

export function getTimeRangeFromPeriods(firstPeriod, lastPeriod) {
  return {
    start: firstPeriod.start || "?",
    end: lastPeriod.end || "?",
  };
}
