// public/utils/card.js

import { parsePeriodRange, getTimeRangeFromPeriods } from "./period.js";

/**
 * Tạo thẻ hiển thị thông tin lớp học
 * @param {{subject: string, teacher: string, room: string, period: string}} data
 * @returns {HTMLElement}
 */
export function createClassCard(data) {
  console.log("📌 resolvedRoom", {
    roomRaw: room,
    cleanedRoom: room.replace(/\n/g, " "),
    week,
    resolved: resolvedRoom,
  });
  const { subject, teacher, room, period, week } = data;
  const resolvedRoom = getPhongTheoTuan(room, week); // ✅ phòng đúng theo tuần

  const { firstPeriod, lastPeriod } = parsePeriodRange(period);
  const { start, end } = getTimeRangeFromPeriods(firstPeriod, lastPeriod);
  const timeRange = `${start} - ${end}`;

  const card = document.createElement("div");
  card.className = "p-3 rounded-xl shadow border bg-white";

  card.innerHTML = `
    <div class="font-semibold text-blue-600 mb-1">${subject}</div>
    <div class="text-sm">🕒 ${timeRange}</div>
    <div class="text-sm">👩‍🏫 ${teacher}</div>
    <div class="text-sm">🏫 ${resolvedRoom}</div>
    <div class="text-xs text-gray-500 mt-1">Tiết: ${period}</div>
  `;

  return card;
}

console.log("📦 render card:", {
  subject,
  week,
  rawRoom: room,
  resolvedRoom,
});

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

function getPhongTheoTuan(roomRaw, currentWeek) {
  if (!roomRaw) return "Không rõ phòng";

  const cleanedRoom = roomRaw.replace(/\n/g, " ");
  const pattern = /\(([\d,\s]+)\)\s*(C\d\.\d{3})/g;
  let match;
  let fallback = { room: null, weeks: [] };

  while ((match = pattern.exec(cleanedRoom)) !== null) {
    const weekList = match[1].split(",").map((w) => parseInt(w.trim(), 10));
    const room = match[2];

    if (!fallback.room) fallback = { room, weeks: weekList };

    if (weekList.includes(currentWeek)) {
      return `${room} (tuần ${currentWeek})`; // ✅ hiện đúng phòng + tuần
    }
  }

  // fallback nếu không có tuần nào khớp
  return `${fallback.room} (tuần ${currentWeek})`;
}
