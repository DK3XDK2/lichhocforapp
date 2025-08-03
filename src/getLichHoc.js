const puppeteer = require("puppeteer");
const fs = require("fs");

async function getLichHoc(mssv, matkhau) {
  const browser = await puppeteer.launch({
    headless: "new",
    slowMo: 0,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
  });

  const page = await browser.newPage();

  let popupMessage = null;
  let popupAppeared = false;

  // Xử lý dialog + chờ load lại nếu có
  page.on("dialog", async (dialog) => {
    popupAppeared = true;
    popupMessage = dialog.message();
    console.log("⚠️ [POPUP] Xuất hiện:", popupMessage);

    // Bấm OK và chờ trang chuyển nếu có
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
        "⚠️ Tài khoản đã hết hạn đăng ký, vẫn thử vào trang lịch học..."
      );
    }

    console.log("🌐 Truy cập trang lịch học...");
    await page.goto(
      "https://dangkytinchi.ictu.edu.vn/kcntt/Reports/Form/StudentTimeTable.aspx",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    // Kiểm tra bị redirect sau khi vào trang lịch học
    const currentUrl = page.url();
    if (currentUrl.includes("StudyRegister")) {
      throw new Error(
        "❌ Bị chuyển hướng vì tài khoản đã hết hạn đăng ký học."
      );
    }

    const hasTable = await page.$("#gridRegistered");
    if (!hasTable) {
      throw new Error("❌ Không tìm thấy bảng lịch học — có thể chưa có lịch.");
    }

    await page.waitForSelector("#gridRegistered", { timeout: 10000 });

    const data = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#gridRegistered tr")
      ).slice(1);
      return rows.map((row) => {
        const cells = row.querySelectorAll("td");
        return {
          thu: cells[0]?.innerText.trim(),
          lop: cells[1]?.innerText.trim(),
          monHoc: cells[2]?.innerText.trim(),
          tiet: cells[3]?.innerText.trim(),
          phong: cells[4]?.innerText.trim(),
          giangVien: cells[5]?.innerText.trim(),
          tuan: cells[6]?.innerText.trim(),
        };
      });
    });

    const savePath = `./data/${mssvFromWeb}_lichhoc.json`;
    fs.writeFileSync(savePath, JSON.stringify(data, null, 2), "utf-8");

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
