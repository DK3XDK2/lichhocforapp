

import { createClassCard, createEmptyCard } from "./card.js";
import { getWeekdayLabel, formatVNDate } from "./date.js";

/**
 
 * @param {Object} data 
 */
export function renderSchedule(data) {
  const container = document.getElementById("schedule-container");
  container.innerHTML = "";

  for (const [weekLabel, days] of Object.entries(data)) {
    const weekBox = document.createElement("div");
    weekBox.className = "p-4 border rounded-xl bg-slate-50";

    const header = document.createElement("h2");
    header.className = "text-lg font-bold mb-3 text-blue-700";
    header.textContent = weekLabel;
    weekBox.appendChild(header);

    for (const [dateStr, lessons] of Object.entries(days)) {
      const dayBox = document.createElement("div");
      dayBox.className = "mb-4";

      const title = document.createElement("div");
      title.className = "font-semibold mb-1";
      title.textContent = `${getWeekdayLabel(dateStr)} - ${formatVNDate(
        dateStr
      )}`;
      dayBox.appendChild(title);

      if (!lessons || lessons.length === 0) {
        dayBox.appendChild(createEmptyCard());
      } else {
        const list = document.createElement("div");
        list.className = "space-y-2";
        lessons.forEach((lesson) => {
          list.appendChild(createClassCard(lesson));
        });
        dayBox.appendChild(list);
      }

      weekBox.appendChild(dayBox);
    }

    container.appendChild(weekBox);
  }
}
