const puppeteer = require("puppeteer");

async function getDiemHoc(mssv, matkhau) {
  const browser = await puppeteer.launch({
    headless: "true",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(0);

  // Xử lý popup alert/confirm
  page.on("dialog", async (dialog) => {
    console.log("⚠️ Dialog xuất hiện:", dialog.message());
    try {
      await dialog.dismiss();
    } catch (e) {
      console.error("❌ Lỗi xử lý dialog:", e);
    }
  });

  try {
    console.log("🚀 Mở trang login...");
    await page.goto("https://dangkytinchi.ictu.edu.vn/kcntt/login.aspx", {
      waitUntil: "domcontentloaded",
    });

    console.log("🔑 Điền tài khoản & mật khẩu...");
    await page.type('input[name="txtUserName"]', mssv);
    await page.type('input[name="txtPassword"]', matkhau);

    console.log("📩 Đăng nhập...");
    await Promise.all([
      page.click('input[name="btnSubmit"]'),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    // Check login lỗi
    const loginError = await page.evaluate(() => {
      const el = document.querySelector(".labelError");
      return el ? el.innerText.trim() : null;
    });
    if (loginError) {
      console.warn("❌ Sai MSSV hoặc mật khẩu");
      return { success: false, message: "Sai MSSV hoặc mật khẩu" };
    }

    console.log("📄 Mở trang bảng điểm...");
    await page.goto("https://dangkytinchi.ictu.edu.vn/kcntt/StudentMark.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 0,
    });

    // Chờ chắc chắn bảng có dữ liệu
    await page.waitForSelector("#tblStudentMark tr:nth-child(2) td", {
      timeout: 10000,
    });

    // Lấy dữ liệu tóm tắt
    const summary = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("#grdResult tr")).slice(
        1
      );
      return rows
        .map((tr) => {
          const td = tr.querySelectorAll("td");
          return {
            namHoc: td[0]?.innerText.trim(),
            hocKy: td[1]?.innerText.trim(),
            tbtlHe10N1: td[2]?.innerText.trim(),
            tbtlHe10N2: td[3]?.innerText.trim(),
            tbtlHe4N1: td[4]?.innerText.trim(),
            tbtlHe4N2: td[5]?.innerText.trim(),
            soTCTLN1: td[6]?.innerText.trim(),
            soTCTLN2: td[7]?.innerText.trim(),
            tbcHe10N1: td[8]?.innerText.trim(),
            tbcHe10N2: td[9]?.innerText.trim(),
            tbcHe4N1: td[10]?.innerText.trim(),
            tbcHe4N2: td[11]?.innerText.trim(),
            soTCN1: td[12]?.innerText.trim(),
            soTCN2: td[13]?.innerText.trim(),
          };
        })
        .filter((r) => r.namHoc);
    });

    // Lấy dữ liệu chi tiết
    const details = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#tblStudentMark tr")
      ).slice(1);
      return rows
        .map((tr) => {
          const td = tr.querySelectorAll("td");
          return {
            stt: td[0]?.innerText.trim(),
            maHocPhan: td[1]?.innerText.trim(),
            tenHocPhan: td[2]?.innerText.trim(),
            soTC: td[3]?.innerText.trim(),
            lanHoc: td[4]?.innerText.trim(),
            lanThi: td[5]?.innerText.trim(),
            diemThu: td[6]?.innerText.trim(),
            tongKet: td[7]?.innerText.trim(),
            danhGia: td[8]?.innerText.trim(),
            maSV: td[9]?.innerText.trim(),
            cc: td[10]?.innerText.trim(),
            thi: td[11]?.innerText.trim(),
            tkhp: td[12]?.innerText.trim(),
            diemChu: td[13]?.innerText.trim(),
          };
        })
        .filter((r) => r.maHocPhan);
    });

    // Debug log
    console.log(`📊 Tóm tắt: ${summary.length} bản ghi`);
    console.log(`📚 Chi tiết: ${details.length} môn học`);

    // Check rỗng
    if (summary.length === 0 && details.length === 0) {
      console.warn("⚠️ Không tìm thấy dữ liệu bảng điểm");
      return { success: false, message: "Không tìm thấy dữ liệu bảng điểm" };
    }

    return { success: true, data: { summary, details } };
  } catch (err) {
    console.error("❌ Lỗi khi lấy điểm:", err.message);
    return { success: false, message: err.message };
  } finally {
    await browser.close();
  }
}

module.exports = getDiemHoc;
