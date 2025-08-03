const puppeteer = require("puppeteer");
const fs = require("fs");

async function getLichThi(mssv, matkhau) {
  const browser = await puppeteer.launch({
    headless: "new",
    slowMo: 0,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
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

    console.log("🔐 Truy cập trang đăng nhập...");
    await page.goto("https://dangkytinchi.ictu.edu.vn/kcntt/login.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.type('input[name="txtUserName"]', mssv);
    await page.type('input[name="txtPassword"]', matkhau);

    console.log("🔐 Bấm đăng nhập...");
    await Promise.all([
      page.click('input[name="btnSubmit"]'),
      page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 })
        .catch(() => null),
    ]);

    // Kiểm tra lỗi đăng nhập
    const loginError = await page.evaluate(() => {
      const el = document.querySelector(".labelError");
      return el ? el.innerText.trim() : null;
    });
    if (loginError) throw new Error("❌ Sai mã sinh viên hoặc mật khẩu!");

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

    console.log("🌐 Truy cập trang lịch thi...");
    await page.goto(
      "https://dangkytinchi.ictu.edu.vn/kcntt/StudentViewExamList.aspx",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

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

    const savePath = `./data/${mssvFromWeb}_lichthi.json`;
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
