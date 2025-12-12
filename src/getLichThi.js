const puppeteer = require("puppeteer");
const fs = require("fs");

// Helper function thay thế waitForTimeout (deprecated trong Puppeteer mới)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLichThi(mssv, matkhau) {
  const browser = await puppeteer.launch({
    headless: true, // ✅ Headless mode để nhanh hơn ~30-40%
    executablePath:
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
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
  });

  const page = await browser.newPage();

  let popupMessage = null;
  let popupAppeared = false;

  // Nghe sự kiện popup (alert) và xử lý nhanh
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
      if (resourceType === "image" || resourceType === "stylesheet" || resourceType === "font") {
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

    // Chờ một chút để đảm bảo page load xong
    await delay(2000);

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
        "⚠️ Tài khoản đã hết hạn đăng ký học, vẫn tiếp tục vào trang lịch thi..."
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

    console.log("🌐 Truy cập trang lịch thi...");

    // Xây dựng URL với session ID nếu có
    let examListUrl =
      "https://dangkytinchi.ictu.edu.vn/kcntt/StudentViewExamList.aspx";
    if (sessionId) {
      // Chèn session ID vào URL: /kcntt/(S(...))/StudentViewExamList.aspx
      // QUAN TRỌNG: Phải có dấu / trước session ID
      examListUrl = `https://dangkytinchi.ictu.edu.vn/kcntt/${sessionId}/StudentViewExamList.aspx`;
    }

    console.log("🔗 URL lịch thi:", examListUrl);
    await page.goto(examListUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000, // Giảm timeout từ 60s xuống 30s
    });

    // ❗Kiểm tra redirect sau khi vào
    const currentUrl = page.url();
    if (currentUrl.includes("StudyRegister")) {
      throw new Error("❌ Bị chuyển hướng — tài khoản có thể đã hết hạn.");
    }

    const hasTable = await page.$("#tblCourseList");
    if (!hasTable) {
      throw new Error("❌ Không tìm thấy bảng lịch thi — có thể chưa có lịch.");
    }

    await page.waitForSelector("#tblCourseList", { timeout: 10000 });

    const data = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#tblCourseList tr")
      ).slice(1);
      return rows
        .map((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length < 10) return null;
          return {
            stt: cells[0].innerText.trim(),
            maHocPhan: cells[1].innerText.trim(),
            tenHocPhan: cells[2].innerText.trim(),
            soTC: cells[3].innerText.trim(),
            ngayThi: cells[4].innerText.trim(),
            caThi: cells[5].innerText.trim(),
            hinhThucThi: cells[6].innerText.trim(),
            soBaoDanh: cells[7].innerText.trim(),
            phongThi: cells[8].innerText.trim(),
            ghiChu: cells[9].innerText.trim(),
          };
        })
        .filter(Boolean);
    });

    const savePath = `./Data/${mssvFromWeb}_lichthi.json`;
    fs.writeFileSync(savePath, JSON.stringify(data, null, 2), "utf-8");

    console.log(`✅ Đã lưu lịch thi vào: ${savePath}`);
    return { name, mssv: mssvFromWeb, data };
  } catch (err) {
    console.error("❌ Lỗi khi lấy lịch thi:", err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = getLichThi;
