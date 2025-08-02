import { transformTimetableData } from "./utils/transform.js";
import { parsePeriodRange, getTimeRangeFromPeriods } from "./utils/period.js";

import { getWeekdayLabel, formatVNDate } from "./utils/date.js";
import {
  format,
  parseISO,
  addDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "https://cdn.jsdelivr.net/npm/date-fns@3.3.1/+esm";

let calendarRenderedHoc = false;
let calendarRenderedThi = false;
let cachedCalendarDataHoc = {};
let cachedCalendarDataThi = {};

function createClassCard(data) {
  const { firstPeriod, lastPeriod } = parsePeriodRange(period);
  const { start, end } = getTimeRangeFromPeriods(firstPeriod, lastPeriod);
  const timeRange = `${start} - ${end}`;

  const card = document.createElement("div");
  card.className = "p-3 rounded-xl shadow border bg-white";

  card.innerHTML = `
    <div class="font-semibold text-blue-600">${subject}</div>
    <div class="text-sm">🕒 ${timeRange}</div>
    <div class="text-sm">👩‍🏫 ${teacher}</div>
    <div class="text-sm">🏫 ${room}</div>
    <div class="text-xs text-gray-500">Tiết: ${period}</div>
  `;

  return card;
}

function createEmptyCard() {
  const card = document.createElement("div");
  card.className =
    "p-3 text-center text-gray-500 bg-gray-100 border rounded-xl";
  card.textContent = "Không có lịch, ngủ đi bạn!";
  return card;
}

function groupByDay(data) {
  const result = {};
  for (const week of Object.values(data)) {
    for (const [day, lessons] of Object.entries(week)) {
      if (!result[day]) result[day] = [];
      result[day].push(...lessons);
    }
  }
  return result;
}

function getSessionType(startTime) {
  const [hour] = startTime.split(":").map(Number);
  if (hour < 12) return "sáng";
  if (hour < 17) return "chiều";
  return "tối";
}

function renderRoomWithWeeks(currentRoom, fullRoomMap, currentWeek) {
  if (!fullRoomMap || !currentRoom) return currentRoom;

  const weekList = Object.entries(fullRoomMap)
    .filter(([w, r]) => r === currentRoom)
    .map(([w]) => parseInt(w))
    .sort((a, b) => a - b);

  if (weekList.length <= 1) return currentRoom;

  return `${currentRoom} (Tuần ${weekList.join(",")})`;
}

function renderGroupedDayCards(dayData, targetId = "schedule-container-hoc") {
  const container = document.getElementById(targetId);
  container.innerHTML = "";

  const daysWrapper = document.createElement("div");
  daysWrapper.className = "days-wrapper space-y-4";

  const sortedDays = Object.keys(dayData).sort();

  for (const day of sortedDays) {
    const lessons = dayData[day];
    const dateObj = new Date(day);
    const dd = dateObj.getDate();
    const weekday = getWeekdayLabel(day);

    const dayBox = document.createElement("div");
    dayBox.className =
      "day-card flex gap-3 items-start p-4 rounded-xl shadow bg-white border";
    dayBox.setAttribute("data-day", day);

    const dayLeft = document.createElement("div");
    dayLeft.className =
      "w-12 text-center flex flex-col justify-center items-center";
    dayLeft.innerHTML = `
      <div class="text-xl font-bold text-gray-700">${dd}</div>
      <div class="text-sm text-gray-500">${weekday.replace("Thứ", "T")}</div>
    `;
    dayBox.appendChild(dayLeft);

    const contentBox = document.createElement("div");
    contentBox.className = "flex-1 space-y-1";

    if (lessons.length === 0) {
      contentBox.innerHTML = `<div class="text-gray-500 italic">Không có lịch, ngủ đi bạn!</div>`;
    } else {
      const sessionGroups = { sáng: [], chiều: [], tối: [] };

      for (const lesson of lessons) {
        const { firstPeriod, lastPeriod } = parsePeriodRange(lesson.period);
        const { start } = getTimeRangeFromPeriods(firstPeriod, lastPeriod);
        const session = getSessionType(start);
        sessionGroups[session].push(lesson);
      }

      for (const session of ["sáng", "chiều", "tối"]) {
        const group = sessionGroups[session];
        if (group.length === 0) continue;

        const label = document.createElement("div");
        label.className =
          "text-sm font-semibold text-gray-600 mt-3 flex items-center gap-1";
        label.innerHTML = `${
          session === "sáng" ? "🕘" : session === "chiều" ? "🌇" : "🌙"
        } <span>Lịch ${session}</span>`;
        contentBox.appendChild(label);

        for (const lesson of group) {
          const { subject, teacher, room, period } = lesson;
          const { firstPeriod, lastPeriod } = parsePeriodRange(period);
          const { start, end } = getTimeRangeFromPeriods(
            firstPeriod,
            lastPeriod
          );
          const timeRange = `${start} - ${end}`;

          const card = document.createElement("div");
          card.className =
            "schedule-card bg-cyan-500 text-white p-3 rounded-lg shadow mt-1";
          card.innerHTML = `
            <div class="time">${timeRange}</div>
            <div class="subject">${subject}</div>
            <div class="info">• Giảng viên: ${teacher}</div>
            <div class="info">• Tiết: ${period}</div>
            <div class="info">• Phòng: ${renderRoomWithWeeks(
              room,
              lesson.fullRoomMap,
              lesson.currentWeek
            )}</div>
          `;
          contentBox.appendChild(card);
          const allCards = contentBox.querySelectorAll(".schedule-card");
          anime({
            targets: allCards,
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 500,
            delay: anime.stagger(100),
            easing: "easeOutQuad",
          });
        }
      }
    }

    dayBox.appendChild(contentBox);
    daysWrapper.appendChild(dayBox);
  }

  container.appendChild(daysWrapper);
}

function renderDayCard(dateObj, lessons = []) {
  const dayCard = document.createElement("div");
  dayCard.className = "day-card";

  const dayNumber = dateObj.getDate();
  const weekdayName = getWeekdayName(dateObj.getDay());

  const headerHTML = `
    <div class="day-header">
      <span class="day-number">${dayNumber}</span>
      <span class="day-name">${weekdayName}</span>
    </div>
  `;

  let contentHTML = "";

  if (lessons.length === 0) {
    contentHTML = `
      <div class="schedule-card empty">
        Không có lịch, ngủ đi bạn!
      </div>
    `;
  } else {
    contentHTML = lessons
      .map(
        (lesson) => `
      <div class="schedule-card">
        <div class="subject">${lesson.subject}</div>
        <div class="time">Tiết ${lesson.period} (${lesson.startTime} - ${lesson.endTime})</div>
        <div class="room">Phòng ${lesson.room}</div>
        <div class="teacher">${lesson.teacher}</div>
      </div>
    `
      )
      .join("");
  }

  dayCard.innerHTML = headerHTML + contentHTML;

  document.querySelector("#schedule-container").appendChild(dayCard);
}

function renderDailySchedule(dayData, dateList) {
  const container = document.getElementById("schedule-container");
  container.innerHTML = "";

  for (const day of dateList) {
    const dayBox = document.createElement("div");
    dayBox.className = "mb-6";
    dayBox.setAttribute("data-day", day);

    const title = document.createElement("div");
    title.className = "font-semibold mb-2 text-lg";
    title.textContent = `${getWeekdayLabel(day)} - ${formatVNDate(day)}`;
    dayBox.appendChild(title);

    const list = document.createElement("div");
    list.className = "space-y-2";

    const lessons = dayData[day] || [];
    if (lessons.length === 0) {
      list.appendChild(createEmptyCard());
    } else {
      for (const lesson of lessons) {
        list.appendChild(createClassCard(lesson));
      }
    }

    dayBox.appendChild(list);
    container.appendChild(dayBox);
  }
}

function generateNextDays(startDateStr, count) {
  const result = [];
  const start = new Date(startDateStr);
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const dateStr = format(date, "yyyy-MM-dd");
    result.push(dateStr);
  }
  return result;
}

function renderCalendarMonthView(dayData, type = "hoc") {
  const calendarContainer = document.getElementById("calendar-month-view");
  if (!calendarContainer) return;

  while (calendarContainer.firstChild) {
    calendarContainer.removeChild(calendarContainer.firstChild);
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const allDays = Object.keys(dayData).sort();
  if (allDays.length === 0) return;

  const firstDate = parseISO(allDays[0]);
  const monthStart = startOfMonth(firstDate);
  const monthEnd = endOfMonth(firstDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const heading = document.createElement("h2");
  heading.className = "font-semibold mb-4 text-lg";
  heading.textContent = `📅 Lịch Tháng ${format(firstDate, "MM/yyyy")}`;
  calendarContainer.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-7 gap-2 text-center text-sm";

  for (const d of days) {
    const dStr = format(d, "yyyy-MM-dd");
    const btn = document.createElement("button");
    const hasClass = allDays.includes(dStr);

    btn.textContent = d.getDate();
    btn.className = `p-2 rounded border ${
      hasClass ? "bg-green-100" : "bg-gray-100"
    } ${dStr === today ? "border-blue-500 font-bold" : "border-transparent"}`;

    btn.onclick = () => {
      const targetSelector =
        type === "thi"
          ? `#schedule-container-thi [data-day="${dStr}"]`
          : `#schedule-container-hoc [data-day="${dStr}"]`;
      const target = document.querySelector(targetSelector);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    grid.appendChild(btn);
  }

  calendarContainer.appendChild(grid);
  anime({
    targets: grid.querySelectorAll("button"),
    opacity: [0, 1],
    scale: [0.95, 1],
    delay: anime.stagger(30),
    duration: 400,
    easing: "easeOutBack",
  });
}

async function renderStudentInfo() {
  try {
    const res = await fetch("/api/user-info");
    const json = await res.json();

    if (json.success && json.data) {
      const { name, mssv } = json.data;
      document.getElementById("student-name").textContent = name;
      document.getElementById("student-mssv").textContent = mssv;
    } else {
      document.getElementById("student-info").innerHTML =
        "<p class='text-red-500'>Không thể tải thông tin sinh viên.</p>";
    }
  } catch (err) {
    console.error("Lỗi khi lấy thông tin sinh viên:", err);
    document.getElementById("student-info").innerHTML =
      "<p class='text-red-500'>Lỗi kết nối máy chủ.</p>";
  }
}
async function renderLichThi() {
  const container = document.getElementById("schedule-container-thi");

  container.innerHTML = `
    <div class="text-center my-4">
      <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 border-solid mx-auto"></div>
    </div>
  `;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const nextDates = generateNextDays(todayStr, 20);
  const groupedByDay = {};

  if (
    typeof cachedCalendarDataThi !== "object" ||
    cachedCalendarDataThi === null
  ) {
    cachedCalendarDataThi = {};
  }

  try {
    const res = await fetch("/api/lich-thi-no-auth");
    const result = await res.json();

    container.innerHTML = "";

    const daysWrapper = document.createElement("div");
    daysWrapper.className = "days-wrapper space-y-4";

    if (result.success && Array.isArray(result.data)) {
      for (const item of result.data) {
        const date = item.ngayThi;
        if (!groupedByDay[date]) groupedByDay[date] = [];
        groupedByDay[date].push(item);
      }
    }

    for (const dateStr of nextDates) {
      const exams = groupedByDay[dateStr] || [];

      const dayBox = document.createElement("div");
      dayBox.className =
        "day-card flex gap-3 items-start p-4 rounded-xl shadow bg-white border";
      dayBox.setAttribute("data-day", dateStr);

      const dateObj = new Date(dateStr);
      const dd = dateObj.getDate();
      const weekday = getWeekdayLabel(dateStr);

      const dayLeft = document.createElement("div");
      dayLeft.className =
        "w-12 text-center flex flex-col justify-center items-center";
      dayLeft.innerHTML = `
        <div class="text-xl font-bold text-gray-700">${dd}</div>
        <div class="text-sm text-gray-500">${weekday.replace("Thứ", "T")}</div>
      `;
      dayBox.appendChild(dayLeft);

      const contentBox = document.createElement("div");
      contentBox.className = "flex-1 space-y-1";

      if (exams.length === 0) {
        contentBox.innerHTML = `<div class="text-red-500 italic">Chưa có lịch thi, ngủ đi bạn!</div>`;
      } else {
        for (const e of exams) {
          const card = document.createElement("div");
          card.className =
            "schedule-card bg-purple-500 text-white p-3 rounded-lg shadow mt-1";
          card.innerHTML = `
            <div class="subject">${e.tenHocPhan}</div>
            <div class="info">• Ngày thi: ${e.ngayThi}</div>
            <div class="info">• Ca: ${e.caThi}</div>
            <div class="info">• Phòng: ${e.phongThi}</div>
            <div class="info">• SBD: ${e.soBaoDanh}</div>
            <div class="info">• Hình thức: ${e.hinhThucThi}</div>
            ${
              e.ghiChu
                ? `<div class="info italic text-gray-300">📌 ${e.ghiChu}</div>`
                : ""
            }
          `;
          contentBox.appendChild(card);
          anime({
            targets: card,
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 500,
            easing: "easeOutQuad",
          });
        }
      }

      dayBox.appendChild(contentBox);
      daysWrapper.appendChild(dayBox);
    }

    container.appendChild(daysWrapper);

    for (const dateStr of nextDates) {
      cachedCalendarDataThi[dateStr] = groupedByDay[dateStr] || [];
    }
  } catch (err) {
    console.error("❌ Lỗi khi fetch lịch thi:", err);
    container.innerHTML = `
      <div class="text-center text-red-500 mt-4">
        ⚠️ Không thể tải lịch thi. Vui lòng thử lại sau.
      </div>
    `;
  }
}

async function renderFullTimetable() {
  try {
    const res = await fetch("/api/lich-hoc-no-auth");
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      const cleanedData = json.data.filter(
        (item) => item.monHoc && item.tuan && item.tiet
      );

      const transformed = transformTimetableData(cleanedData);

      const groupedByDay = groupByDay(transformed);

      const todayStr = format(new Date(), "yyyy-MM-dd");
      const upcomingDates = generateNextDays(todayStr, 90);

      const paddedData = {};
      for (const dateStr of upcomingDates) {
        paddedData[dateStr] = groupedByDay[dateStr] || [];
      }

      cachedCalendarDataHoc = paddedData;
      renderGroupedDayCards(paddedData, "schedule-container-hoc");
      renderUpcomingLessonNotice(paddedData);
    } else {
      document.body.innerHTML =
        '<p class="text-red-500 text-center mt-10">Lỗi tải lịch học.</p>';
    }
  } catch (err) {
    console.error("Lỗi fetch:", err);
    document.body.innerHTML =
      '<p class="text-red-500 text-center mt-10">Lỗi kết nối máy chủ.</p>';
  }
}

renderFullTimetable();
renderStudentInfo();
renderLichThi();
function switchTab(tab) {
  const tabHoc = document.getElementById("lich-hoc-tab");
  const tabThi = document.getElementById("lich-thi-tab");

  const hidePane = (pane) => {
    pane.classList.remove("active");
  };

  const showPane = (pane) => {
    pane.classList.add("active");
  };

  if (tab === "hoc") {
    hidePane(tabThi);
    setTimeout(() => showPane(tabHoc), 100);
  } else {
    hidePane(tabHoc);
    setTimeout(() => showPane(tabThi), 100);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnHoc = document.getElementById("btn-tab-hoc");
  const btnThi = document.getElementById("btn-tab-thi");

  if (btnHoc && btnThi) {
    btnHoc.addEventListener("click", () => {
      switchTab("hoc");
      btnHoc.disabled = true;
      btnThi.disabled = true;
      setTimeout(() => {
        btnHoc.disabled = false;
        btnThi.disabled = false;
      }, 600);
    });

    btnThi.addEventListener("click", () => {
      switchTab("thi");
      btnHoc.disabled = true;
      btnThi.disabled = true;
      setTimeout(() => {
        btnHoc.disabled = false;
        btnThi.disabled = false;
      }, 600);
    });
  }
});

let focusedCard = null;
let originalRect = null;
let placeholder = null;
let clickedCard = null;

document.addEventListener("click", function (e) {
  if (!e.target.closest) return;

  const card = e.target.closest(".day-card");

  if (card && !card.classList.contains("focused-clone")) {
    if (focusedCard) return;

    clickedCard = card;
    const rect = card.getBoundingClientRect();
    originalRect = rect;

    placeholder = document.createElement("div");
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.display = "block";
    card.parentNode.insertBefore(placeholder, card);

    const clone = card.cloneNode(true);
    clone.classList.add("focused-clone");
    clone.style.position = "fixed";
    clone.style.top = `${rect.top}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.width = `${Math.min(rect.width, window.innerWidth - 32)}px`;
    clone.style.zIndex = 999;
    clone.style.margin = "0";
    clone.style.transition = "all 0.4s ease";
    document.body.appendChild(clone);

    addOverlay();

    card.style.visibility = "hidden";
    setTimeout(() => {
      if (clickedCard) clickedCard.style.display = "none";
    }, 50);

    focusedCard = clone;
    document.body.style.overflow = "hidden";
    document.documentElement.style.scrollBehavior = "smooth";

    requestAnimationFrame(() => {
      clone.style.top = "50%";
      clone.style.left = "50%";
      clone.style.transform = "translate(-50%, -50%) scale(1.05)";
      clone.style.boxShadow = "0 20px 60px rgba(0,0,0,0.3)";
      clone.style.borderRadius = "1rem";
    });
  } else {
    if (focusedCard) {
      focusedCard.style.transition = "all 0.4s ease";
      focusedCard.style.top = `${originalRect.top}px`;
      focusedCard.style.left = `${originalRect.left}px`;
      focusedCard.style.transform = "none";
      focusedCard.style.boxShadow = "none";

      removeOverlay();

      setTimeout(() => {
        if (focusedCard) focusedCard.remove();
        if (placeholder) placeholder.remove();
        if (clickedCard) {
          clickedCard.style.display = "";
          clickedCard.style.visibility = "visible";
        }
        document.body.style.overflow = "";
        focusedCard = null;
        originalRect = null;
        placeholder = null;
        clickedCard = null;
      }, 400);
    }
  }
});

function addOverlay() {
  if (!document.querySelector(".day-focus-overlay")) {
    const overlay = document.createElement("div");
    overlay.className = "day-focus-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = 0;
    overlay.style.background = "rgba(0,0,0,0.4)";
    overlay.style.backdropFilter = "blur(2px)";
    overlay.style.zIndex = 998;

    overlay.onclick = () => {
      if (focusedCard) {
        focusedCard.style.transition = "all 0.4s ease";
        focusedCard.style.top = `${originalRect.top}px`;
        focusedCard.style.left = `${originalRect.left}px`;
        focusedCard.style.transform = "none";
        focusedCard.style.boxShadow = "none";

        removeOverlay();

        setTimeout(() => {
          if (focusedCard) focusedCard.remove();
          if (placeholder) placeholder.remove();
          if (clickedCard) {
            clickedCard.style.display = "";
            clickedCard.style.visibility = "visible";
          }
          document.body.style.overflow = "";
          focusedCard = null;
          originalRect = null;
          placeholder = null;
          clickedCard = null;
        }, 400);
      }
    };

    document.body.appendChild(overlay);
  }
}

function removeOverlay() {
  const overlay = document.querySelector(".day-focus-overlay");
  if (overlay) overlay.remove();
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const selectedTab = btn.dataset.tab;

    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // 💥 Hiệu ứng ripple khi bấm tab
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    btn.style.setProperty("--ripple-x", `${x}px`);
    btn.style.setProperty("--ripple-y", `${y}px`);
    btn.classList.remove("ripple-animate");
    void btn.offsetWidth;
    btn.classList.add("ripple-animate");
    setTimeout(() => btn.classList.remove("ripple-animate"), 500);

    document.querySelectorAll(".tab-pane").forEach((pane) => {
      if (pane.id === `${selectedTab}-tab`) {
        pane.classList.add("active");

        pane.style.opacity = 0;
        anime({
          targets: pane,
          opacity: [0, 1],
          translateY: [20, 0],
          duration: 400,
          easing: "easeOutQuad",
        });
      } else {
        pane.classList.remove("active");
      }
    });

    const isCalendarOpen = document
      .getElementById("calendar-month-view")
      .classList.contains("open");

    if (isCalendarOpen) {
      if (
        selectedTab === "lich-thi" &&
        typeof cachedCalendarDataThi !== "undefined"
      ) {
        renderCalendarMonthView(cachedCalendarDataThi, "thi");
      } else if (
        selectedTab === "lich-hoc" &&
        typeof cachedCalendarDataHoc !== "undefined"
      ) {
        renderCalendarMonthView(cachedCalendarDataHoc, "hoc");
      }
    }
  });
});

const calendarToggle = document.getElementById("toggle-calendar-btn");
let isCalendarOpen = false;

calendarToggle?.addEventListener("click", () => {
  isCalendarOpen = !isCalendarOpen;

  const tab = document.querySelector(".tab-btn.active")?.dataset.tab || "hoc";
  const data =
    tab === "lich-thi" ? cachedCalendarDataThi : cachedCalendarDataHoc;

  const calendarView = document.getElementById("calendar-month-view");

  if (isCalendarOpen) {
    calendarToggle.innerText = "❌ Đóng lịch tháng";
    calendarView.classList.add("open");

    if (data && Object.keys(data).length > 0) {
      renderCalendarMonthView(data, tab === "lich-thi" ? "thi" : "hoc");
    } else {
      calendarView.innerHTML =
        "<div class='text-gray-500 italic text-center p-3'>⏳ Đang tải dữ liệu...</div>";
    }
  } else {
    calendarToggle.innerText = "🗓️ Hiện lịch tháng";
    calendarView.classList.remove("open");
  }
});

const toggleBtn = document.getElementById("darkmode-toggle");

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  toggleBtn.textContent = "☀️ Light Mode";
}

toggleBtn?.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  const isDark = document.body.classList.contains("dark");
  toggleBtn.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

function renderUpcomingLessonNotice(dataByDay) {
  const container = document.getElementById("upcoming-lesson-box");
  if (!container) return;

  const now = new Date();
  const lessons = [];

  for (const [dayStr, items] of Object.entries(dataByDay)) {
    for (const item of items) {
      const { firstPeriod } = parsePeriodRange(item.period);
      const { start } = getTimeRangeFromPeriods(firstPeriod, firstPeriod);
      const [h, m] = start.split(":").map(Number);
      const [year, month, day] = dayStr.split("-").map(Number);
      const lessonTime = new Date(year, month - 1, day, h, m);

      if (lessonTime >= now) {
        lessons.push({ ...item, day: dayStr, lessonTime });
      }
    }
  }

  if (lessons.length === 0) {
    container.innerHTML = "";
    return;
  }

  lessons.sort((a, b) => a.lessonTime - b.lessonTime);
  const next = lessons[0];

  container.innerHTML = `
  <div class="upcoming-box">
    <i>⏰</i>
    <span>
      <strong>Buổi học gần nhất</strong>: 
      <span style="font-weight: 600">${next.subject}</span> 
      (Tiết ${next.period}) lúc 
      <strong>${next.lessonTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}</strong> 
      tại <strong>${renderRoomWithWeeks(
        next.room,
        next.fullRoomMap,
        next.currentWeek
      )}</strong> — ${formatVNDate(next.day)}
    </span>
  </div>
`;
}

document.addEventListener("DOMContentLoaded", () => {
  const syncBtn = document.getElementById("sync-btn");
  const overlay = document.getElementById("sync-overlay");

  if (!syncBtn || !overlay) {
    console.error("Không tìm thấy sync-btn hoặc sync-overlay trong DOM");
    return;
  }

  syncBtn.addEventListener("click", async () => {
    overlay.style.display = "flex";
    overlay.classList.add("show");
    document.body.style.overflow = "hidden";
    syncBtn.disabled = true;
    syncBtn.classList.add("disabled");

    try {
      const res = await fetch("/sync", { method: "POST" });
      if (!res.ok) throw new Error("Đồng bộ thất bại");

      const data = await res.json();
      localStorage.removeItem("lichHocCache");
      localStorage.removeItem("lichThiCache");

      await renderFullTimetable();
      await renderLichThi();
    } catch (err) {
      console.warn("[SYNC] Lỗi:", err);
      alert("Đồng bộ thất bại: " + err.message);
    } finally {
      overlay.classList.remove("show");
      overlay.style.display = "none";
      document.body.style.overflow = "";
      syncBtn.disabled = false;
      syncBtn.classList.remove("disabled");
    }
  });
});
