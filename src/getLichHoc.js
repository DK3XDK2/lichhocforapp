const puppeteer = require("puppeteer");
const fs = require("fs");

async function getLichHoc(mssv, matkhau) {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 0,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
  });

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

    const currentUrl = page.url();
    if (currentUrl.includes("StudyRegister")) {
      throw new Error(
        "❌ Bị chuyển hướng vì tài khoản đã hết hạn đăng ký học."
      );
    }

    // ===== Helper =====
    async function waitForTableData(page) {
      await page.waitForFunction(
        () => {
          const tbl = document.querySelector("#gridRegistered");
          if (!tbl) return false;
          const rows = tbl.querySelectorAll("tr").length;
          return rows > 1 && !tbl.innerText.includes("Không có dữ liệu");
        },
        { timeout: 20000 }
      );
    }

    async function changeSemester(page, value) {
      console.log(`🔄 Đang đổi sang học kỳ (value): ${value}`);

      const hasDropdown = await page.$("#drpSemester");
      if (!hasDropdown) {
        console.warn("⚠️ Không tìm thấy #drpSemester — bỏ qua đổi kỳ");
        return;
      }

      const oldHTML = await page.$eval("#gridRegistered", (el) => el.innerHTML);
      const oldValue = await page.$eval("#drpSemester", (el) => el.value);

      await page.select("#drpSemester", value);
      await page.evaluate(() => __doPostBack("drpSemester", ""));

      // Chờ load lại bảng
      await page.waitForFunction(
        (old) => document.querySelector("#gridRegistered")?.innerHTML !== old,
        { timeout: 20000 },
        oldHTML
      );

      const currentValue = await page
        .$eval("#drpSemester", (el) => el.value)
        .catch(() => null);
      console.log(
        `📅 Đã đổi sang kỳ: ${currentValue || "(Không có dropdown)"}`
      );
    }

    // 1. Chờ kỳ 1 load ban đầu
    await waitForTableData(page);
    console.log("✅ Kỳ 1 load lần đầu");

    // 📋 Lấy danh sách kỳ từ dropdown và tạo map
    const semesters = await page.$$eval("#drpSemester option", (opts) =>
      opts.map((o) => ({
        text: o.textContent.trim(),
        value: o.value,
      }))
    );
    console.log("📋 Danh sách kỳ:", semesters);

    const semesterMap = Object.fromEntries(
      semesters.map((s) => [s.text, s.value])
    );

    // Kiểm tra tồn tại kỳ
    if (!semesterMap["2_2025_2026"]) {
      throw new Error("Không tìm thấy kỳ 2_2025_2026");
    }
    if (!semesterMap["1_2025_2026"]) {
      throw new Error("Không tìm thấy kỳ 1_2025_2026");
    }

    // 2. Chuyển sang kỳ 2
    await changeSemester(page, semesterMap["2_2025_2026"]);
    console.log("✅ Đã chuyển sang kỳ 2");

    // 3. Chuyển lại kỳ 1
    await changeSemester(page, semesterMap["1_2025_2026"]);
    console.log("✅ Đã quay lại kỳ 1");

    // 4. Chọn đợt 1
    // 4. Chọn đợt 1 (nếu có)
    if (await page.$("#drpTerm")) {
      await page.select("#drpTerm", "1");
      await Promise.all([
        page.evaluate(() => __doPostBack("drpTerm", "")),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]);
    } else {
      console.warn("⚠️ Không tìm thấy #drpTerm — bỏ qua chọn đợt");
    }

    await waitForTableData(page);

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
