const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const getLichThi = require("./getLichThi");
const getLichHoc = require("./getLichHoc");

const app = express();

function isAuthenticated(req, res, next) {
  if (req.session.mssv) return next();
  return res.status(403).json({ error: "Bạn chưa đăng nhập!" });
}

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

const isProduction = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);

app.use(
  session({
    secret: "nogamenolifez",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60,
    },
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));
app.get("/lichcanhan", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/lichcanhan.html"));
});

app.get("/", (req, res) => {
  res.render("index", { error: null });
});

app.post("/login", async (req, res) => {
  const { mssv, matkhau } = req.body;

  try {
    const [lichThiRaw, lichHocRaw] = await Promise.all([
      getLichThi(mssv, matkhau),
      getLichHoc(mssv, matkhau),
    ]);

    const lichThi = Array.isArray(lichThiRaw?.data) ? lichThiRaw.data : [];
    const lichHoc = Array.isArray(lichHocRaw?.data) ? lichHocRaw.data : [];

    const name = lichHocRaw?.name || lichThiRaw?.name || "Không rõ tên";
    const mssvFromWeb = lichHocRaw?.mssv || lichThiRaw?.mssv || mssv;

    req.session.name = name;
    req.session.mssv = mssvFromWeb;
    req.session.password = matkhau;

    fs.writeFileSync(
      `./data/${mssvFromWeb}_lichthi.json`,
      JSON.stringify(lichThi, null, 2)
    );
    fs.writeFileSync(
      `./data/${mssvFromWeb}_lichhoc.json`,
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

  if (!mssv) return res.redirect("/");

  res.setHeader("Cache-Control", "no-store");

  const lichThiPath = `./data/${mssv}_lichthi.json`;
  const lichHocPath = `./data/${mssv}_lichhoc.json`;

  if (!fs.existsSync(lichThiPath) || !fs.existsSync(lichHocPath)) {
    return res.send("Không có dữ liệu lịch để hiển thị.");
  }

  // ✅ Dữ liệu đã sẵn sàng → cho phép frontend load lichcanhan.html
  res.redirect("/lichcanhan");
});

app.get("/logout", (req, res) => {
  delete req.session.password;
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get("/api/user-info", (req, res) => {
  const { name, mssv } = req.session || {};
  if (name && mssv) {
    res.json({ success: true, data: { name, mssv } });
  } else {
    res.json({
      success: false,
      message: "Chưa đăng nhập hoặc thiếu thông tin",
    });
  }
});

app.post("/api/lich-thi", isAuthenticated, async (req, res) => {
  const { mssv, matkhau } = req.body;
  try {
    const result = await getLichThi(mssv, matkhau);
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/lich-hoc", isAuthenticated, async (req, res) => {
  const { mssv, matkhau } = req.body;
  try {
    const result = await getLichHoc(mssv, matkhau);
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/sync", async (req, res) => {
  const { mssv, password } = req.session;

  if (!mssv || !password) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  try {
    const [lichThiRaw, lichHocRaw] = await Promise.all([
      getLichThi(mssv, password),
      getLichHoc(mssv, password),
    ]);

    const lichThi = Array.isArray(lichThiRaw?.data) ? lichThiRaw.data : [];
    const lichHoc = Array.isArray(lichHocRaw?.data) ? lichHocRaw.data : [];

    fs.writeFileSync(
      `./data/${mssv}_lichthi.json`,
      JSON.stringify(lichThi, null, 2)
    );
    fs.writeFileSync(
      `./data/${mssv}_lichhoc.json`,
      JSON.stringify(lichHoc, null, 2)
    );

    res.json({
      success: true,
      message: "Đồng bộ xong",
      lichHoc,
      lichThi,
    });
  } catch (err) {
    console.error("❌ Lỗi khi đồng bộ:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi đồng bộ. Không thể truy cập hệ thống trường.",
    });
  }
});

app.get("/api/lich-hoc-no-auth", isAuthenticated, (req, res) => {
  const mssv = req.session.mssv;

  try {
    const data = JSON.parse(
      fs.readFileSync(`./data/${mssv}_lichhoc.json`, "utf8")
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error("Lỗi đọc lichhoc.json:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Không đọc được dữ liệu lịch học" });
  }
});

app.get("/api/lich-thi-no-auth", isAuthenticated, (req, res) => {
  const mssv = req.session.mssv;

  try {
    const data = JSON.parse(
      fs.readFileSync(`./data/${mssv}_lichthi.json`, "utf8")
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error("Lỗi đọc lichthi.json:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Không đọc được dữ liệu lịch thi" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
});

const cron = require("node-cron");
const cleanOldFiles = require("./cleanOldFiles");

cron.schedule("*/10 * * * *", () => {
  console.log("🧹 Dọn file cũ...");
  cleanOldFiles();
});
