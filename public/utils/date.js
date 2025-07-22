// public/utils/date.js

// 📌 Ngày bắt đầu học kỳ = Tuần 1
export const START_DATE = new Date("2025-08-04"); // Thứ 2, Tuần 1

/**
 * Lấy ngày bắt đầu và kết thúc của tuần học kỳ (tuần 1, 2,...)
 */
export function getStartAndEndDateOfWeek(weekNum) {
  const start = new Date(START_DATE);
  start.setDate(start.getDate() + (weekNum - 1) * 7); // tính offset từ tuần 1
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: start, endDate: end };
}

/**
 * Trả về ngày thực tế (yyyy-mm-dd) tương ứng với thứ trong tuần (1=CN, 2=T2,...)
 * Dựa vào ngày gốc bất kỳ
 */
export function getDateOfWeekday(referenceDate, weekday) {
  const date = new Date(referenceDate);
  // Từ ICTU: 2=Thứ 2 (JS = 1), ..., 7=Thứ 7 (JS = 6), 1=CN (JS = 0)
  const jsWeekday = weekday === 1 ? 0 : weekday - 1;

  const currentWeekday = date.getDay(); // 0=CN, 1=T2,...,6=T7
  const offset = (jsWeekday - currentWeekday + 7) % 7;
  date.setDate(date.getDate() + offset);
  return date.toISOString().split("T")[0];
}

/**
 * Label thứ trong tuần (Thứ 2 → Chủ Nhật)
 */
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

/**
 * Format ngày yyyy-mm-dd → dd/mm/yyyy
 */
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
