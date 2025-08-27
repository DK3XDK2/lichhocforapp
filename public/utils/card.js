import { getDateOfWeekday, START_DATE } from "./date.js";

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

function extractSessions(tietStr) {
  const result = [];
  const lines = tietStr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let currentFrom = null;
  let currentTo = null;

  for (const line of lines) {
    const dateMatch = line.match(
      /Từ\s(\d{2}\/\d{2}\/\d{4})\sđến\s(\d{2}\/\d{2}\/\d{4})/
    );
    if (dateMatch) {
      currentFrom = dateMatch[1];
      currentTo = dateMatch[2];
      continue;
    }

    if (
      (line.startsWith("Thứ") || line.toLowerCase().startsWith("chủ")) &&
      currentFrom &&
      currentTo
    ) {
      const thuMatch = line.match(/(Thứ\s?(\d)|Chủ\s*nhật)/i);
      const tietMatch = line.match(/tiết\s([\d,]+)/);

      let thu = null;
      if (thuMatch) {
        if (thuMatch[0].toLowerCase().includes("chủ")) {
          thu = 1;
        } else {
          thu = parseInt(thuMatch[2]);
        }
      }

      if (thu && tietMatch) {
        result.push({
          thu,
          period: tietMatch[1].trim(),
          from: currentFrom,
          to: currentTo,
        });
      }
    }
  }

  return result;
}

export function transformTimetableData(rawData) {
  const buoiIndexMap = {};
  const scheduleByDate = [];

  for (const item of rawData) {
    const { tiet, monHoc, phong, giangVien } = item;
    if (!monHoc || !tiet) continue;

    const sessions = extractSessions(tiet);
    const tenMon = item.lop?.split("(")[0].trim() || "";
    const subjectKey = `${monHoc.trim()} - ${tenMon}`;
    if (!buoiIndexMap[subjectKey]) buoiIndexMap[subjectKey] = 0;

    for (const ses of sessions) {
      const { thu, period, from, to } = ses;

      const startDate = parseDateVN(from);
      const endDate = parseDateVN(to);
      const weeksToLearn = getWeeksFromRoomString(phong);

      
      const startOfValidRange = new Date(START_DATE); 
      const weeksInRoom = getWeeksFromRoomString(phong);
      const maxWeek = Math.max(...weeksInRoom, 20); 

      const endOfValidRange = new Date(START_DATE);
      endOfValidRange.setDate(endOfValidRange.getDate() + maxWeek * 7 - 1);

      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 7)
      ) {
        const realDate = getDateOfWeekday(d, thu);
        const deltaWeeks = diffInWeeks(START_DATE, realDate);
        const weekNumber = deltaWeeks + 1;

        const realDateObj = new Date(realDate);
        if (realDateObj < startOfValidRange || realDateObj > endOfValidRange) {
          const reason =
            realDateObj < startOfValidRange
              ? "trước tuần 1"
              : `ngoài tuần chỉ định (1 → ${maxWeek})`;
          console.warn(
            `⚠️ BỎ BUỔI: ${monHoc} - ${tenMon} | Ngày: ${realDate} (${formatDate(
              realDateObj
            )}) | Lý do: ${reason}`
          );
          continue;
        }

        const buoiIndex = ++buoiIndexMap[subjectKey];
        const resolvedRoom = resolveRoomByWeekAndSessionDates(
          phong,
          weekNumber,
          sessions
        );

        console.log(
          `📚 ${subjectKey} | Buổi ${buoiIndex} | Tuần ${weekNumber} | Ngày: ${formatDate(
            realDateObj
          )} | Phòng: ${resolvedRoom}`
        );

        scheduleByDate.push({
          subject: `${monHoc.trim()} - ${tenMon}`,
          teacher: giangVien.split("(")[0].trim(),
          room: resolvedRoom,
          period,
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
      day: dayKey,
      week: lesson.week,
    });
  }

  return weeks;
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

 
  console.log("🧩 Pairs tuần–phòng:");
  pairs.forEach((p, i) =>
    console.log(`  [${i}] Tuần: ${p.weeks.join(",")} → Phòng: ${p.room}`)
  );

  for (const pair of pairs) {
    if (pair.weeks.includes(weekNumber)) {
      console.log(`✅ Tuần ${weekNumber} → khớp phòng: ${pair.room}`);
      return pair.room;
    }
  }

 
  console.warn(`⚠️ Tuần ${weekNumber} → KHÔNG tìm thấy phòng phù hợp.`);

 
  if (pairs.length === 0 && lines.length === 1) {
    console.log(`💡 Fallback: chỉ có 1 dòng → dùng phòng: ${lines[0]}`);
    return lines[0];
  }

  const lastLine = lines[lines.length - 1];
  if (!lastLine.match(/\(\d/)) {
    console.log(`💡 Fallback: lấy dòng cuối rõ ràng → phòng: ${lastLine}`);
    return lastLine;
  }

  console.log(`🚫 Không rõ phòng cho tuần ${weekNumber}`);
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
