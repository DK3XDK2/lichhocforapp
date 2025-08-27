export const START_DATE = new Date("2025-08-04");

export function getStartAndEndDateOfWeek(weekNum) {
  const start = new Date(START_DATE);
  start.setDate(start.getDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: start, endDate: end };
}

export function getDateOfWeekday(referenceDate, weekday) {
  const date = new Date(referenceDate);

  const jsWeekday = weekday === 1 ? 0 : weekday - 1;

  const currentWeekday = date.getDay();
  const offset = (jsWeekday - currentWeekday + 7) % 7;
  date.setDate(date.getDate() + offset);
  return date.toISOString().split("T")[0];
}

export function getWeekdayLabel(dateStr) {
  const d = new Date(dateStr);
  const labels = [
    "Chủ Nhật",
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
  ];
  return labels[d.getDay()];
}

export function formatVNDate(dateStr) {
  const [yyyy, mm, dd] = dateStr.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

export function isWeekInPast(weekText) {
  const match = weekText.match(/đến (\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return false;
  const [, dd, mm, yyyy] = match.map(Number);
  const end = new Date(yyyy, mm - 1, dd);
  end.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return end < now;
}
