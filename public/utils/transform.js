import { getDateOfWeekday, START_DATE } from "./date.js";

// Parse dd/mm/yyyy → Date object
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

// Tính số tuần giữa 2 ngày
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
  let currentRange = null;

  for (const line of lines) {
    if (line.startsWith("Từ")) {
      currentRange = line;
    } else if (
      (line.startsWith("Thứ") || line.toLowerCase().startsWith("chủ")) &&
      currentRange
    ) {
      const dateMatch = currentRange.match(
        /Từ\s(\d{2}\/\d{2}\/\d{4})\sđến\s(\d{2}\/\d{2}\/\d{4})/
      );
      const from = dateMatch?.[1];
      const to = dateMatch?.[2];

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

      if (thu && tietMatch && from && to) {
        result.push({
          thu,
          period: tietMatch[1].trim(),
          from,
          to,
        });
      }
    }
  }

  return result;
}

export function transformTimetableData(rawData) {
  const scheduleByDate = [];

  for (const item of rawData) {
    const { tiet, monHoc, phong, giangVien } = item;
    if (!monHoc || !tiet) continue;

    const sessions = extractSessions(tiet);
    const tenMon = item.lop?.split("(")[0].trim() || "";

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
        scheduleByDate.push({
          subject: `${monHoc.trim()} - ${tenMon}`,
          teacher: giangVien.split("(")[0].trim(),
          room: phong.trim(),
          period,
          day: realDate,
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
    });
  }

  return weeks;
}
