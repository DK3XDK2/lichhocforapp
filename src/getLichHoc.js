const puppeteer = require("puppeteer");
const fs = require("fs");

// Helper function thay thế waitForTimeout (deprecated trong Puppeteer mới)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLichHoc(mssv, matkhau) {
  // Detect environment: Railway/Linux không có Chrome ở đường dẫn Windows
  const isWindows = process.platform === "win32";
  const launchOptions = {
    headless: true, // ✅ Headless mode để nhanh hơn ~30-40%
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Giảm memory usage
      "--disable-gpu", // Tắt GPU rendering
      "--disable-images", // Tắt load ảnh
      "--disable-plugins",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-ipc-flooding-protection",
      "--ignore-certificate-errors", // ✅ bỏ qua lỗi SSL
      "--ignore-certificate-errors-spki-list",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
    ],
  };

  // Chỉ set executablePath trên Windows (local dev)
  if (isWindows) {
    launchOptions.executablePath =
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  } else {
    // Trên Railway/Linux, thử dùng Chromium từ system hoặc bundled
    // Railway có thể có Chromium trong PATH
    if (process.env.CHROMIUM_PATH) {
      launchOptions.executablePath = process.env.CHROMIUM_PATH;
    }
    // Nếu không có, Puppeteer sẽ dùng bundled Chromium
  }

  console.log("🚀 Launching Puppeteer...", {
    platform: process.platform,
    isWindows,
    hasExecutablePath: !!launchOptions.executablePath,
  });

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    console.log("✅ Puppeteer launched successfully");
  } catch (err) {
    console.error("❌ Puppeteer launch error:", err.message);
    console.error("❌ Launch options:", JSON.stringify(launchOptions, null, 2));
    console.error("❌ Platform:", process.platform);
    console.error("❌ Full error:", err);
    throw new Error(`Không thể khởi động trình duyệt: ${err.message}`);
  }

  const page = await browser.newPage();

  let popupMessage = null;
  let popupAppeared = false;

  // Xử lý dialog
  page.on("dialog", async (dialog) => {
    popupAppeared = true;
    popupMessage = dialog.message();
    console.log("⚠️ [POPUP] Xuất hiện:", popupMessage);

    await Promise.all([
      dialog.accept(),
      page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 })
        .catch(() => null),
    ]);
  });

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Tắt load ảnh, CSS, fonts để nhanh hơn ~20-30%
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceType = req.resourceType();
      if (
        resourceType === "image" ||
        resourceType === "stylesheet" ||
        resourceType === "font"
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log("🔐 Truy cập trang đăng nhập...");
    await page.goto("https://dangkytinchi.ictu.edu.vn/kcntt/Login.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 30000, // Giảm timeout từ 60s xuống 30s
    });

    await page.type('input[name="txtUserName"]', mssv);
    await page.type('input[name="txtPassword"]', matkhau);

    console.log("🔐 Bấm đăng nhập...");
    await Promise.all([
      page.click('input[name="btnSubmit"]'),
      page
        .waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 })
        .catch(() => null),
    ]);

    // Chờ một chút để đảm bảo page load xong (giảm từ 2s xuống 1s)
    await delay(1000);

    // Kiểm tra xem có bị redirect về Login không (lỗi đăng nhập)
    const loginUrl = page.url();
    console.log("🔗 URL sau khi click login:", loginUrl);

    if (loginUrl.includes("Login.aspx") && !loginUrl.includes("url=")) {
      // Vẫn ở trang login, có thể là lỗi
      const loginError = await page.evaluate(() => {
        const el = document.querySelector(".labelError");
        return el ? el.innerText.trim() : null;
      });
      if (loginError) {
        throw new Error("❌ Sai mã sinh viên hoặc mật khẩu!");
      }
    }

    // Nếu có query parameter url=, có thể cần navigate đến đó
    const urlMatch = loginUrl.match(/url=([^&]+)/);
    if (urlMatch) {
      const redirectUrl = decodeURIComponent(urlMatch[1]);
      console.log("🔄 Redirect đến:", redirectUrl);
      await page.goto(redirectUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await delay(500); // Giảm delay
    }

    const fullInfo = await page.evaluate(() => {
      const el = document.querySelector("#PageHeader1_lblUserFullName");
      return el ? el.innerText.trim() : "__NOT_FOUND__";
    });

    let name = "",
      mssvFromWeb = mssv;
    const match = fullInfo.match(/^(.+?)\s*\((.+)\)$/);
    if (match) {
      name = match[1].trim();
      mssvFromWeb = match[2].trim();
    }

    console.log("👤 Họ tên sau login:", name);

    if (popupAppeared && popupMessage?.includes("hết hạn đăng ký")) {
      console.warn(
        "⚠️ Tài khoản đã hết hạn đăng ký, vẫn thử vào trang lịch học..."
      );
    }

    // Lấy URL hiện tại sau khi login để có session ID
    // Đảm bảo đã navigate xong và có session ID
    await delay(500); // Giảm delay từ 1s xuống 0.5s
    const currentUrlAfterLogin = page.url();
    console.log("🔗 URL sau login:", currentUrlAfterLogin);

    // Extract session ID từ URL nếu có
    const sessionMatch = currentUrlAfterLogin.match(/\(S\(([^)]+)\)\)/);
    let sessionId = "";
    if (sessionMatch) {
      sessionId = sessionMatch[0]; // Lấy cả (S(...))
      console.log("🔑 Session ID:", sessionId);
    } else {
      console.warn(
        "⚠️ Không tìm thấy session ID trong URL, thử lấy từ cookies hoặc URL hiện tại"
      );
      // Fallback: Thử lấy từ URL hiện tại một lần nữa
      await delay(500);
      const retryUrl = page.url();
      const retryMatch = retryUrl.match(/\(S\(([^)]+)\)\)/);
      if (retryMatch) {
        sessionId = retryMatch[0];
        console.log("🔑 Session ID (retry):", sessionId);
      }
    }

    console.log("🌐 Truy cập trang lịch học...");

    // Xây dựng URL với session ID nếu có
    let timetableUrl =
      "https://dangkytinchi.ictu.edu.vn/kcntt/Reports/Form/StudentTimeTable.aspx";
    if (sessionId) {
      // Chèn session ID vào URL: /kcntt/(S(...))/Reports/...
      // QUAN TRỌNG: Phải có dấu / trước session ID
      timetableUrl = `https://dangkytinchi.ictu.edu.vn/kcntt/${sessionId}/Reports/Form/StudentTimeTable.aspx`;
    }

    console.log("🔗 URL lịch học:", timetableUrl);
    await page.goto(timetableUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000, // Giảm timeout từ 60s xuống 30s
    });

    const currentUrl = page.url();
    if (currentUrl.includes("StudyRegister")) {
      throw new Error(
        "❌ Bị chuyển hướng vì tài khoản đã hết hạn đăng ký học."
      );
    }

    // ===== Helper =====
    async function waitForTableData(page) {
      try {
        await page.waitForFunction(
          () => {
            const tbl = document.querySelector("#gridRegistered");
            if (!tbl) return false;
            const rows = tbl.querySelectorAll("tr").length;
            // Chấp nhận cả khi có dữ liệu hoặc không có dữ liệu (để tránh timeout)
            return rows > 0;
          },
          { timeout: 20000 }
        );
      } catch (err) {
        console.warn("⚠️ Timeout chờ bảng, tiếp tục...");
      }
    }

    async function changeSemester(page, value) {
      console.log(`🔄 Đang đổi sang học kỳ (value): ${value}`);

      const hasDropdown = await page.$("#drpSemester");
      if (!hasDropdown) {
        console.warn("⚠️ Không tìm thấy #drpSemester — bỏ qua đổi kỳ");
        return;
      }

      const oldHTML = await page
        .$eval("#gridRegistered", (el) => el.innerHTML)
        .catch(() => "");
      const oldValue = await page
        .$eval("#drpSemester", (el) => el.value)
        .catch(() => "");

      // Nếu đã đúng học kỳ rồi thì không cần đổi
      if (oldValue === value) {
        console.log("✅ Đã ở đúng học kỳ, không cần đổi");
        return;
      }

      await page.select("#drpSemester", value);

      // Chờ một chút để ASPX xử lý
      await delay(500);

      // Trigger postback với try-catch để handle navigation
      try {
        await page.evaluate(() => {
          if (typeof __doPostBack === "function") {
            __doPostBack("drpSemester", "");
          }
        });
      } catch (evalErr) {
        // Execution context có thể bị destroy ngay sau khi PostBack
        // Đây là behavior bình thường của ASPX
        if (evalErr.message.includes("Execution context was destroyed")) {
          console.log(
            "ℹ️ Execution context destroyed (expected after PostBack)"
          );
        } else {
          throw evalErr;
        }
      }

      // Chờ page navigate/reload hoàn toàn sau PostBack
      try {
        await page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
      } catch (navErr) {
        // Có thể không có navigation, chỉ là reload
        console.log("ℹ️ No navigation detected, waiting for reload...");
        await delay(2000); // Chờ 2 giây để page reload
      }

      // Chờ load lại bảng
      try {
        await page.waitForFunction(
          (old) => {
            const tbl = document.querySelector("#gridRegistered");
            return tbl && tbl.innerHTML !== old;
          },
          { timeout: 15000 },
          oldHTML
        );
      } catch (err) {
        console.warn("⚠️ Timeout chờ reload bảng, tiếp tục...");
        await delay(2000); // Tăng delay lên 2s để đảm bảo page load xong
      }

      // Đảm bảo page đã stable trước khi tiếp tục
      await delay(500);

      const currentValue = await page
        .$eval("#drpSemester", (el) => el.value)
        .catch(() => null);
      console.log(
        `📅 Đã đổi sang kỳ: ${currentValue || "(Không có dropdown)"}`
      );
    }

    // Chờ trang load xong
    await page.waitForSelector("#drpSemester", { timeout: 10000 }).catch(() => {
      console.warn("⚠️ Không tìm thấy dropdown học kỳ");
    });

    // 📋 Lấy danh sách kỳ từ dropdown và học kỳ hiện tại
    let semesterInfo;
    try {
      // Retry logic nếu execution context bị destroy
      let retries = 3;
      while (retries > 0) {
        try {
          semesterInfo = await page.evaluate(() => {
            const dropdown = document.querySelector("#drpSemester");
            if (!dropdown) return null;

            const options = Array.from(dropdown.options);
            const currentValue = dropdown.value;
            const currentText =
              dropdown.options[dropdown.selectedIndex]?.textContent.trim() ||
              "";

            return {
              currentValue,
              currentText,
              options: options.map((o) => ({
                text: o.textContent.trim(),
                value: o.value,
                selected: o.selected,
              })),
            };
          });
          break; // Thành công, thoát loop
        } catch (evalErr) {
          if (evalErr.message.includes("Execution context was destroyed")) {
            retries--;
            if (retries > 0) {
              console.log(
                `ℹ️ Execution context destroyed, retrying... (${retries} left)`
              );
              await delay(1000); // Chờ page stable
            } else {
              throw evalErr;
            }
          } else {
            throw evalErr;
          }
        }
      }
    } catch (err) {
      if (err.message.includes("Execution context was destroyed")) {
        console.warn("⚠️ Execution context destroyed, chờ và thử lại...");
        await delay(2000);
        // Thử lại
        semesterInfo = await page.evaluate(() => {
          const dropdown = document.querySelector("#drpSemester");
          if (!dropdown) return null;

          const options = Array.from(dropdown.options);
          const currentValue = dropdown.value;
          const currentText =
            dropdown.options[dropdown.selectedIndex]?.textContent.trim() || "";

          return {
            currentValue,
            currentText,
            options: options.map((o) => ({
              text: o.textContent.trim(),
              value: o.value,
              selected: o.selected,
            })),
          };
        });
      } else {
        throw err;
      }
    }

    if (!semesterInfo) {
      throw new Error("❌ Không tìm thấy dropdown học kỳ");
    }

    console.log("📋 Học kỳ hiện tại (dropdown):", semesterInfo.currentText);
    console.log(
      "📋 Danh sách tất cả học kỳ:",
      semesterInfo.options.map((o) => o.text)
    );

    // 🔑 QUAN TRỌNG: Luôn ưu tiên học kỳ 1_2025_2026
    // Vì trường có thể tự động chọn kỳ 2 nhưng thực tế đang học kỳ 1
    let targetSemester = null;

    // Ưu tiên 1: Tìm học kỳ 1_2025_2026 cụ thể
    const semester1_2025_2026 = semesterInfo.options.find(
      (o) =>
        o.text.includes("1_2025_2026") ||
        o.value.includes("1_2025_2026") ||
        o.text.match(/1\s*[-_]\s*2025\s*[-_]\s*2026/i)
    );

    if (semester1_2025_2026) {
      targetSemester = semester1_2025_2026.value;
      console.log(
        `✅ Tìm thấy học kỳ 1_2025_2026: ${semester1_2025_2026.text}`
      );
    } else {
      // Ưu tiên 2: Tìm học kỳ 1 bất kỳ (có thể là năm khác)
      const semester1 = semesterInfo.options.find(
        (o) =>
          o.text.includes("1_") ||
          o.text.match(/^Học kỳ\s*1/i) ||
          o.value.includes("1_")
      );

      if (semester1) {
        targetSemester = semester1.value;
        console.log(`✅ Tìm thấy học kỳ 1: ${semester1.text}`);
      } else {
        // Ưu tiên 3: Kiểm tra học kỳ hiện tại có phải kỳ 1 không
        const isCurrentSemester1 =
          semesterInfo.currentText.includes("1_") ||
          semesterInfo.currentValue.includes("1_");

        if (isCurrentSemester1) {
          // Nếu học kỳ hiện tại là kỳ 1, kiểm tra có dữ liệu không
          await waitForTableData(page);
          let hasData = false;
          try {
            hasData = await page.evaluate(() => {
              const tbl = document.querySelector("#gridRegistered");
              if (!tbl) return false;
              const rows = tbl.querySelectorAll("tr");
              return (
                rows.length > 1 && !tbl.innerText.includes("Không có dữ liệu")
              );
            });
          } catch (err) {
            if (err.message.includes("Execution context was destroyed")) {
              console.warn(
                "⚠️ Execution context destroyed khi kiểm tra dữ liệu, bỏ qua..."
              );
              hasData = false;
            } else {
              throw err;
            }
          }

          if (hasData) {
            console.log("✅ Học kỳ 1 hiện tại đã có dữ liệu, sử dụng luôn");
            targetSemester = semesterInfo.currentValue;
          }
        }

        // Fallback: Dùng học kỳ đầu tiên trong danh sách
        if (!targetSemester) {
          targetSemester = semesterInfo.options[0]?.value;
          console.log(
            `⚠️ Không tìm thấy học kỳ 1, dùng học kỳ đầu tiên: ${semesterInfo.options[0]?.text}`
          );
        }
      }
    }

    if (!targetSemester) {
      throw new Error("❌ Không tìm thấy học kỳ nào để lấy dữ liệu");
    }

    // Chuyển sang học kỳ mục tiêu (nếu chưa đúng)
    if (targetSemester !== semesterInfo.currentValue) {
      await changeSemester(page, targetSemester);
      await waitForTableData(page);
    }

    // Xử lý đợt học - Tự động tìm đợt có dữ liệu
    // ⚠️ QUAN TRỌNG: ASPX có thể cần trigger bằng cách chọn đợt 1 trước, sau đó mới chọn đợt thực tế
    if (await page.$("#drpTerm")) {
      const termInfo = await page.evaluate(() => {
        const dropdown = document.querySelector("#drpTerm");
        if (!dropdown) return null;

        const options = Array.from(dropdown.options);
        const currentValue = dropdown.value;

        return {
          currentValue,
          options: options.map((o) => ({
            text: o.textContent.trim(),
            value: o.value,
            selected: o.selected,
          })),
        };
      });

      if (termInfo) {
        console.log("📋 Đợt học hiện tại:", termInfo.currentValue);
        console.log(
          "📋 Danh sách đợt học:",
          termInfo.options.map((o) => `${o.value} (${o.text})`)
        );

        // Hàm chọn đợt học và trigger postback
        async function selectTerm(termValue) {
          await page.select("#drpTerm", termValue);
          await delay(500); // Giảm từ 1s xuống 0.5s

          await page.evaluate(() => {
            if (typeof __doPostBack === "function") {
              __doPostBack("drpTerm", "");
            }
          });

          // Chờ bảng reload (giảm từ 3s xuống 2s)
          await delay(2000);

          // Chờ bảng thay đổi
          try {
            await page.waitForFunction(
              () => {
                const tbl = document.querySelector("#gridRegistered");
                return tbl !== null;
              },
              { timeout: 10000 }
            );
          } catch (err) {
            console.warn("⚠️ Timeout chờ bảng reload");
          }

          await waitForTableData(page);
        }

        // Hàm kiểm tra xem đợt học có dữ liệu không
        async function checkTermHasData(termValue) {
          await selectTerm(termValue);

          let hasData = false;
          let retries = 3;
          while (retries > 0) {
            try {
              hasData = await page.evaluate(() => {
                const tbl = document.querySelector("#gridRegistered");
                if (!tbl) return false;

                // Kiểm tra xem có dòng "Tổng" và các dòng khác không
                const rows = tbl.querySelectorAll("tr");
                if (rows.length <= 1) return false;

                // Kiểm tra xem có dữ liệu thực sự (không phải chỉ dòng "Tổng")
                let hasRealData = false;
                for (let i = 1; i < rows.length; i++) {
                  const cells = rows[i].querySelectorAll("td");
                  if (cells.length > 0) {
                    const firstCell = cells[0]?.innerText.trim();
                    const secondCell = cells[1]?.innerText.trim();
                    const thirdCell = cells[2]?.innerText.trim();
                    // Nếu không phải dòng "Tổng" và có dữ liệu môn học
                    if (
                      firstCell !== "Tổng" &&
                      secondCell !== "Tổng" &&
                      thirdCell &&
                      thirdCell !== "Tổng" &&
                      thirdCell.trim() !== ""
                    ) {
                      hasRealData = true;
                      break;
                    }
                  }
                }

                return (
                  hasRealData && !tbl.innerText.includes("Không có dữ liệu")
                );
              });
              break; // Thành công
            } catch (err) {
              if (err.message.includes("Execution context was destroyed")) {
                retries--;
                if (retries > 0) {
                  console.warn(
                    `⚠️ Execution context destroyed khi kiểm tra đợt học, retrying... (${retries} left)`
                  );
                  await delay(1000);
                } else {
                  console.warn("⚠️ Execution context destroyed, skip check...");
                  hasData = false;
                }
              } else {
                throw err;
              }
            }
          }

          return hasData;
        }

        // 🔑 TRICK: Chọn đợt 1 trước để "khởi động" hệ thống ASPX
        const term1 = termInfo.options.find((o) => o.value === "1");
        if (term1 && termInfo.currentValue !== "1") {
          console.log("🔄 Chọn đợt 1 trước để trigger hệ thống...");
          await selectTerm("1");
          await delay(500); // Giảm từ 1s xuống 0.5s
        }

        // 🎯 QUAN TRỌNG: Ưu tiên đợt học 2 (đợt học thực tế)
        let foundTerm = null;

        // Ưu tiên 1: Tìm đợt học 2 cụ thể
        const term2 = termInfo.options.find((o) => o.value === "2");
        if (term2) {
          console.log("🔍 Ưu tiên kiểm tra đợt học 2...");
          const term2HasData = await checkTermHasData("2");

          if (term2HasData) {
            console.log("✅ Đợt học 2 đã có dữ liệu!");
            foundTerm = "2";
          } else {
            console.log("⚠️ Đợt học 2 không có dữ liệu, thử các đợt khác...");
          }
        }

        // Ưu tiên 2: Kiểm tra đợt học hiện tại (nếu chưa tìm thấy)
        if (!foundTerm) {
          const targetTerm = termInfo.currentValue;
          console.log(`🔍 Kiểm tra đợt học hiện tại: ${targetTerm}...`);

          // Chỉ thử đợt hiện tại nếu nó không phải đợt 1 (vì đã biết đang ở đợt 2)
          if (targetTerm !== "1") {
            const currentHasData = await checkTermHasData(targetTerm);

            if (currentHasData) {
              console.log(`✅ Đợt học ${targetTerm} đã có dữ liệu`);
              foundTerm = targetTerm;
            }
          }
        }

        // Ưu tiên 3: Thử tất cả các đợt học từ cao xuống thấp (nếu chưa tìm thấy)
        if (!foundTerm) {
          console.log("⚠️ Chưa tìm thấy dữ liệu, thử tất cả các đợt học...");

          // Thử tất cả các đợt học từ cao xuống thấp (trừ đợt 1 và đợt đã thử)
          const sortedTerms = [...termInfo.options]
            .filter((o) => o.value !== "1" && o.value !== foundTerm) // Bỏ qua đợt 1 và đợt đã thử
            .sort((a, b) => parseInt(b.value) - parseInt(a.value)); // Sắp xếp giảm dần

          for (const term of sortedTerms) {
            console.log(`🔄 Đang thử đợt học ${term.value}...`);

            // Mỗi lần thử, chọn đợt 1 trước rồi mới chọn đợt này
            await selectTerm("1");
            await delay(500); // Giảm từ 1s xuống 0.5s

            const hasData = await checkTermHasData(term.value);

            if (hasData) {
              console.log(`✅ Tìm thấy dữ liệu ở đợt học ${term.value}!`);
              foundTerm = term.value;
              break;
            }
          }
        }

        // Nếu không tìm thấy đợt nào có dữ liệu, dùng đợt hiện tại
        if (!foundTerm) {
          console.warn(
            "⚠️ Không tìm thấy đợt học nào có dữ liệu, dùng đợt hiện tại"
          );
          foundTerm = targetTerm;
          // Chọn đợt 1 trước rồi mới chọn đợt này
          if (foundTerm !== "1") {
            await selectTerm("1");
            await delay(500); // Giảm từ 1s xuống 0.5s
          }
          await selectTerm(foundTerm);
        }
      }
    } else {
      console.warn("⚠️ Không tìm thấy #drpTerm — bỏ qua chọn đợt");
    }

    await waitForTableData(page);

    const hasTable = await page.$("#gridRegistered");
    if (!hasTable) {
      console.warn("⚠️ Không tìm thấy bảng lịch học, trả về mảng rỗng");
      return { name, mssv: mssvFromWeb, data: [] };
    }

    await page
      .waitForSelector("#gridRegistered", { timeout: 10000 })
      .catch(() => {
        console.warn("⚠️ Timeout chờ bảng, tiếp tục lấy dữ liệu...");
      });

    const data = await page.evaluate(() => {
      const tbl = document.querySelector("#gridRegistered");
      if (!tbl) return [];

      // Kiểm tra xem có thông báo "Không có dữ liệu" không
      if (
        tbl.innerText.includes("Không có dữ liệu") ||
        tbl.innerText.includes("không có dữ liệu")
      ) {
        return [];
      }

      const rows = Array.from(tbl.querySelectorAll("tr")).slice(1);
      return rows
        .map((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length < 7) return null;

          const thu = cells[0]?.innerText.trim() || "";
          const lop = cells[1]?.innerText.trim() || "";
          const monHoc = cells[2]?.innerText.trim() || "";

          // Bỏ qua dòng "Tổng" hoặc các dòng không có dữ liệu thực
          if (
            thu === "Tổng" ||
            lop === "Tổng" ||
            (!thu && !lop && !monHoc) ||
            (thu === "" && lop === "" && monHoc === "")
          ) {
            return null;
          }

          return {
            thu,
            lop,
            monHoc,
            tiet: cells[3]?.innerText.trim() || "",
            phong: cells[4]?.innerText.trim() || "",
            giangVien: cells[5]?.innerText.trim() || "",
            tuan: cells[6]?.innerText.trim() || "",
          };
        })
        .filter(Boolean); // Loại bỏ null
    });

    if (data.length === 0) {
      console.warn("⚠️ Không có dữ liệu lịch học trong bảng");
    } else {
      console.log(`✅ Đã lấy được ${data.length} môn học`);
    }

    // Đảm bảo thư mục Data tồn tại
    const dataDir = "./Data";
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log("✅ Created Data directory in getLichHoc");
    }

    const savePath = `${dataDir}/${mssvFromWeb}_lichhoc.json`;
    try {
      fs.writeFileSync(savePath, JSON.stringify(data, null, 2), "utf-8");
      console.log(`✅ Saved lichhoc.json to ${savePath}`);
    } catch (writeErr) {
      console.error("❌ Error writing lichhoc.json:", writeErr);
      throw new Error(`Không thể lưu file lịch học: ${writeErr.message}`);
    }

    console.log(`✅ Đã lưu lịch học vào: ${savePath}`);
    return { name, mssv: mssvFromWeb, data };
  } catch (err) {
    console.error("❌ Lỗi khi lấy lịch học:", err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = getLichHoc;
