// public/utils/card.js

import { parsePeriodRange, getTimeRangeFromPeriods } from "./period.js";

/**
 * Tạo thẻ hiển thị thông tin lớp học
 * @param {{subject: string, teacher: string, room: string, period: string}} data
 * @returns {HTMLElement}
 */
export function createClassCard(data) {
  const { subject, teacher, room, period } = data;

  const { firstPeriod, lastPeriod } = parsePeriodRange(period);
  const { start, end } = getTimeRangeFromPeriods(firstPeriod, lastPeriod);
  const timeRange = `${start} - ${end}`;

  const card = document.createElement("div");
  card.className = "p-3 rounded-xl shadow border bg-white";

  card.innerHTML = `
    <div class="font-semibold text-blue-600 mb-1">${subject}</div>
    <div class="text-sm">🕒 ${timeRange}</div>
    <div class="text-sm">👩‍🏫 ${teacher}</div>
    <div class="text-sm">🏫 ${room}</div>
    <div class="text-xs text-gray-500 mt-1">Tiết: ${period}</div>
  `;

  return card;
}

/**
 * Tạo thẻ "Không Phải Đi Học !!!"
 * @returns {HTMLElement}
 */
export function createEmptyCard() {
  const card = document.createElement("div");
  card.className =
    "p-3 text-center text-gray-500 bg-gray-100 border rounded-xl italic";
  card.textContent = "Không Phải Đi Học !!!";
  return card;
}
