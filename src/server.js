const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const getLichThi = require("./getLichThi");
const getLichHoc = require("./getLichHoc");

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "1mb" }));

app.use(
  session({
    secret: "nogamenolifez",
    resave: false,
    saveUninitialized: true,
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.render("index", { error: null });
});

app.post("/login", async (req, res) => {
  const { mssv, matkhau } = req.body;

  try {
    // Gọi cả hai đồng thời
    const [lichThiRaw, lichHocRaw] = await Promise.all([
      getLichThi(mssv, matkhau),
      getLichHoc(mssv, matkhau),
    ]);

    // Trích xuất dữ liệu
    const lichThi = Array.isArray(lichThiRaw?.data) ? lichThiRaw.data : [];
    const hoTenFromThi = lichThiRaw?.hoTen || null;

    const lichHoc = Array.isArray(lichHocRaw?.data) ? lichHocRaw.data : [];
    const hoTenFromHoc = lichHocRaw?.hoTen || null;

    // Ưu tiên hoTen từ lịch thi (nếu không có thì lấy từ lịch học)
    const hoTen = hoTenFromThi || hoTenFromHoc || "Không rõ tên";

    // Ghi session
    req.session.mssv = mssv;
    req.session.hoTen = hoTen;

    // Lưu file JSON
    fs.writeFileSync(
      `./data/${mssv}_lichthi.json`,
      JSON.stringify(lichThi, null, 2)
    );
    fs.writeFileSync(
      `./data/${mssv}_lichhoc.json`,
      JSON.stringify(lichHoc, null, 2)
    );

    res.redirect("/xem-lich");
  } catch (err) {
    console.error("❌ Lỗi đăng nhập:", err.message);
    res.render("index", {
      error: "Đăng nhập thất bại. Vui lòng kiểm tra lại!",
    });
  }
});

app.get("/xem-lich", (req, res) => {
  const mssv = req.session.mssv;
  const hoTen = req.session.hoTen || "Không rõ tên";

  if (!mssv) return res.redirect("/");

  try {
    const lichThi = JSON.parse(
      fs.readFileSync(`./data/${mssv}_lichthi.json`, "utf8")
    );
    const lichHoc = JSON.parse(
      fs.readFileSync(`./data/${mssv}_lichhoc.json`, "utf8")
    );

    res.render("lichcanhan", {
      lichThi: Array.isArray(lichThi) ? lichThi : [],
      lichHoc: Array.isArray(lichHoc) ? lichHoc : [],
      mssv,
      hoTen,
    });
  } catch (err) {
    console.error("❌ Lỗi đọc file lịch:", err.message);
    res.send("Không có dữ liệu lịch để hiển thị.");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.post("/api/lich-thi", async (req, res) => {
  const { mssv, matkhau } = req.body;
  try {
    const result = await getLichThi(mssv, matkhau);
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/lich-hoc", async (req, res) => {
  const { mssv, matkhau } = req.body;
  try {
    const result = await getLichHoc(mssv, matkhau);
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
});

// Cron cleanup
const cron = require("node-cron");
const cleanOldFiles = require("./cleanOldFiles");

cron.schedule("*/10 * * * *", () => {
  console.log("🧹 Dọn file cũ...");
  cleanOldFiles();
});
