const puppeteer = require("puppeteer");
const fs = require("fs");

async function getLichThi(mssv, matkhau) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto("https://dangkytinchi.ictu.edu.vn/kcntt/login.aspx", {
      waitUntil: "domcontentloaded",
    });

    await page.type('input[name="txtUserName"]', mssv);
    await page.type('input[name="txtPassword"]', matkhau);
    await Promise.all([
      page.click('input[name="btnSubmit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
    ]);

    const loginError = await page.evaluate(() => {
      const err = document.querySelector(".labelError");
      return err ? err.innerText.trim() : null;
    });
    if (loginError) throw new Error("Sai mã sinh viên hoặc mật khẩu!");

    const fullInfo = await page.evaluate(() => {
      const el = document.querySelector("#PageHeader1_lblUserFullName");
      return el ? el.innerText.trim() : "__NOT_FOUND__";
    });

    // fullInfo = "Vũ Văn Thái(DTC245260019)"
    let name = "",
      mssvFromWeb = "";
    const match = fullInfo.match(/^(.+?)\s*\((.+)\)$/);
    if (match) {
      name = match[1].trim(); // "Vũ Văn Thái"
      mssvFromWeb = match[2].trim(); // "DTC245260019"
    }

    console.log("👤 Họ tên lấy được sau login:", name);

    await page.goto(
      "https://dangkytinchi.ictu.edu.vn/kcntt/StudentViewExamList.aspx",
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForSelector("#tblCourseList");

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

    fs.writeFileSync(
      `./data/${mssv}_lichthi.json`,
      JSON.stringify(data, null, 2),
      "utf-8"
    );

    console.log("✅ Đã lấy lịch thi thành công.");
    return { name, mssv: mssvFromWeb, data };
  } catch (err) {
    console.error("❌ Lỗi khi lấy lịch thi:", err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = getLichThi;
