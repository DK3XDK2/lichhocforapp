import { getDateOfWeekday, START_DATE } from "./date.js";
import { parsePeriodRange, getTimeRangeFromPeriods } from "./period.js";

function parseDateVN(str) {
  const [dd, mm, yyyy] = str.split("/");
  return new Date(`${yyyy}-${mm}-${dd}`);
}

function formatDate(dateObj) {
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function diffInWeeks(date1, date2) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return Math.floor((d2 - d1) / msPerWeek);
}

// Đây là bản cuối mình recommend
function extractSessions(tietStr) {
  const result = [];
  const lines = tietStr
    .split("\n")
    .map((l) => l.trim().replace(/[:：]$/, "")) // bỏ dấu ":" hoặc "：" ở cuối
    .filter(Boolean);

  let currentFrom = null;
  let currentTo = null;
  let groupCounter = 0;

  for (const line of lines) {
    // 📌 Nhận dòng "Từ ... đến ..."
    const dateMatch = line.match(
      /Từ\s+(\d{2}\/\d{2}\/\d{4})\s+đến\s+(\d{2}\/\d{2}\/\d{4})/i
    );
    if (dateMatch) {
      currentFrom = dateMatch[1];
      currentTo = dateMatch[2];
      groupCounter++;
      continue;
    }

    // 📌 Nhận dòng "Thứ ... tiết ..." hoặc "Chủ nhật tiết ..."
    const thuMatch = line.match(/(Thứ\s?(\d)|Chủ\s*nhật)/i);
    const tietMatch = line.match(/tiết\s([\d,]+)/i);

    let thu = null;
    if (thuMatch) {
      thu = thuMatch[0].toLowerCase().includes("chủ")
        ? 1
        : parseInt(thuMatch[2]);
    }

    if (thu && tietMatch && currentFrom && currentTo) {
      result.push({
        thu,
        period: tietMatch[1].trim(),
        from: currentFrom,
        to: currentTo,
        group: groupCounter,
      });
    }
  }

  return result;
}

function getWeeksFromRoomString(roomStr) {
  const weekSet = new Set();
  const lines = roomStr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/\(([\d,\s]+)\)/);
    if (match) {
      const weeks = match[1].split(",").map((s) => parseInt(s.trim(), 10));
      weeks.forEach((w) => {
        if (!isNaN(w)) weekSet.add(w);
      });
    }
  }

  return Array.from(weekSet).sort((a, b) => a - b);
}

function getRoomForWeek(roomStr, weekNumber) {
  const lines = roomStr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const pairs = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const weekMatch = lines[i].match(/\(([\d,\s]+)\)/);
    if (weekMatch) {
      const weeks = weekMatch[1]
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter(Boolean);
      const roomLine = lines[i + 1];
      if (roomLine && !roomLine.match(/\(\d/)) {
        pairs.push({ weeks, room: roomLine });
      }
    }
  }

  for (const pair of pairs) {
    if (pair.weeks.includes(weekNumber)) {
      return pair.room;
    }
  }

  // fallback
  if (pairs.length === 0 && lines.length === 1) return lines[0];
  const lastLine = lines[lines.length - 1];
  if (!lastLine.match(/\(\d/)) return lastLine;
  return "Không rõ phòng";
}

function resolveRoomByWeekAndSessionDates(roomStr, weekNumber, sessions) {
  const groupDateMap = {};
  for (const ses of sessions) {
    const { from, to, thu, group } = ses;
    if (group == null) continue;

    const startDate = parseDateVN(from);
    const endDate = parseDateVN(to);

    if (!groupDateMap[group]) groupDateMap[group] = [];
    groupDateMap[group].push({ startDate, endDate, thu });
  }

  const groupToWeeks = {};
  for (const [group, periods] of Object.entries(groupDateMap)) {
    const weekSet = new Set();
    for (const { startDate, endDate, thu } of periods) {
      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 7)
      ) {
        const realDate = getDateOfWeekday(d, thu);
        const week = diffInWeeks(START_DATE, realDate) + 1;
        weekSet.add(week);
      }
    }
    groupToWeeks[group] = weekSet;
  }

  const lines = roomStr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const pairs = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const groupMatch = lines[i].match(/^\(([\d,]+)\)$/);
    if (groupMatch) {
      const groups = groupMatch[1]
        .split(",")
        .map((s) => parseInt(s.trim(), 10));
      const roomLine = lines[i + 1];
      if (roomLine && !roomLine.match(/^\(\d/)) {
        pairs.push({ groups, room: roomLine });
      }
    }
  }

  for (const pair of pairs) {
    for (const g of pair.groups) {
      const weeks = groupToWeeks[g];
      if (weeks?.has(weekNumber)) {
        return pair.room;
      }
    }
  }

  return "Không rõ phòng";
}

function getRoomByGroupNumber(roomStr, groupNumber) {
  const matches = [...roomStr.matchAll(/\(([\d,\s]+)\)\s*([A-Z0-9.]+)/g)];
  for (const match of matches) {
    const groups = match[1].split(",").map((s) => parseInt(s.trim(), 10));
    const room = match[2].trim();
    if (groups.includes(groupNumber)) {
      return room;
    }
  }
  return "Không rõ phòng";
}

export function transformTimetableData(rawData) {
  if (!Array.isArray(rawData)) {
    console.error("❌ Dữ liệu đầu vào không hợp lệ:", rawData);
    return {};
  }

  const buoiIndexMap = {};
  const scheduleByDate = [];

  for (const item of rawData) {
    const { tiet, monHoc, phong, giangVien } = item;
    if (
      typeof monHoc !== "string" ||
      !monHoc.trim() ||
      typeof tiet !== "string" ||
      tiet.trim() === ""
    ) {
      console.log("⛔ Bỏ qua dòng:", item);
      continue;
    }

    const sessions = extractSessions(tiet);

    // Debug xem dòng nào có session thực sự
    console.log("✅ Parse dòng:", item);
    console.log("➡️ Sessions:", sessions);
    console.log("➡️ room:", phong);
    console.log("➡️ room weeks:", getWeeksFromRoomString(phong));

    if (sessions.length === 0) {
      console.warn("⚠️ Không tách được session nào từ tiet:", tiet);
      continue;
    }

    const tenMon = item.lop?.split("(")[0].trim() || "";
    const subjectKey = `${monHoc.trim()} - ${tenMon}`;
    if (!buoiIndexMap[subjectKey]) buoiIndexMap[subjectKey] = 0;

    for (const ses of sessions) {
      const { thu, period, from, to } = ses;
      const startDate = parseDateVN(from);
      const endDate = parseDateVN(to);

      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 7)
      ) {
        const realDate = getDateOfWeekday(d, thu);
        const realDateObj = new Date(realDate);
        const deltaWeeks = diffInWeeks(START_DATE, realDate);
        const weekNumber = deltaWeeks + 1;

        const startOfValidRange = new Date(START_DATE);
        const maxWeek = Math.max(...getWeeksFromRoomString(phong), 20);
        const endOfValidRange = new Date(START_DATE);
        endOfValidRange.setDate(endOfValidRange.getDate() + maxWeek * 7 - 1);

        if (realDateObj < startOfValidRange || realDateObj > endOfValidRange)
          continue;

        const buoiIndex = ++buoiIndexMap[subjectKey];

        let resolvedRoom = getRoomByGroupNumber(phong, ses.group);

        // ✅ fallback nếu không tìm thấy theo group (vì không có (1,2,3))
        if (resolvedRoom === "Không rõ phòng") {
          resolvedRoom = phong.trim();
        }

        // ✅ luôn lấy phần phòng chính (C5.405 thay vì "C5.405 C5")
        resolvedRoom = resolvedRoom.split(" ")[0];

        console.log(
          `🧪 Buổi ${ses.group} | Môn ${monHoc} | Phòng: ${resolvedRoom}`
        );

        const { firstPeriod, lastPeriod } = parsePeriodRange(period);
        const { start: startTime, end: endTime } = getTimeRangeFromPeriods(
          firstPeriod,
          lastPeriod
        );

        scheduleByDate.push({
          subject: `${monHoc.trim()} - ${tenMon}`,
          teacher: giangVien.split("(")[0].trim(),
          room: resolvedRoom,
          period,
          startTime,
          endTime,
          day: realDate,
          week: weekNumber,
        });
      }
    }
  }

  if (scheduleByDate.length === 0) return {};

  const firstDate = new Date(START_DATE);
  firstDate.setHours(0, 0, 0, 0);
  const weeks = {};

  for (const lesson of scheduleByDate) {
    const lessonDate = new Date(lesson.day);
    lessonDate.setHours(0, 0, 0, 0);

    const deltaWeeks = diffInWeeks(firstDate, lessonDate);
    const weekStart = new Date(
      firstDate.getTime() + deltaWeeks * 7 * 86400 * 1000
    );
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400 * 1000);

    const weekLabel = `Tuần ${deltaWeeks + 1} (${formatDate(
      weekStart
    )} đến ${formatDate(weekEnd)})`;

    if (!weeks[weekLabel]) {
      weeks[weekLabel] = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        weeks[weekLabel][dateStr] = [];
      }
    }

    const dayKey = lesson.day;
    if (!weeks[weekLabel][dayKey]) {
      weeks[weekLabel][dayKey] = [];
    }
    weeks[weekLabel][dayKey].push({
      subject: lesson.subject,
      teacher: lesson.teacher,
      room: lesson.room,
      period: lesson.period,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      day: dayKey,
      week: lesson.week,
    });
  }

  return weeks;
}
