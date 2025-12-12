const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const getLichThi = require("./getLichThi");
const getLichHoc = require("./getLichHoc");
const cron = require("node-cron");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

function isAuthenticated(req, res, next) {
  // Có session => tiếp tục
  if (req.session && req.session.mssv) return next();

  // Nếu là request HTML (user gõ URL), redirect về login
  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) {
    return res.redirect("/");
  }

  // Nếu là request API (AJAX fetch) → trả JSON lỗi
  return res.status(401).json({ error: "Bạn chưa đăng nhập!" });
}

const isProduction = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);

// Middlewares
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.use(
  session({
    secret: "nogamenolifez",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 1 hour
    },
  })
);

// ROUTES

// Home - phục vụ index.html
app.get("/", (req, res) => {
  if (req.session.mssv && req.session.password) {
    return res.redirect("/lichcanhan");
  }
  res.render("index", { error: null });
});

// Login route
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
    req.session.isPrincess =
      mssvFromWeb.trim().toLowerCase() === "dtc245280019";

    fs.writeFileSync(
      `./Data/${mssvFromWeb}_lichthi.json`,
      JSON.stringify(lichThi, null, 2)
    );
    fs.writeFileSync(
      `./Data/${mssvFromWeb}_lichhoc.json`,
      JSON.stringify(lichHoc, null, 2)
    );

    // Trả về JSON với thông tin session để frontend lưu vào localStorage
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({
        success: true,
        message: "Đăng nhập thành công",
        data: { name, mssv: mssvFromWeb, password: matkhau },
      });
    }

    return res.redirect("/lichcanhan");
  } catch (err) {
    console.error("❌ Lỗi đăng nhập:", err.message);
    return res.render("index", {
      error: "Sai mã sinh viên hoặc mật khẩu hoặc lỗi hệ thống!",
    });
  }
});

// Sau khi login xong redirect về trang lịch
app.get("/xem-lich", (req, res) => {
  const mssv = req.session.mssv;
  if (!mssv) return res.redirect("/");

  const lichThiPath = `./Data/${mssv}_lichthi.json`;
  const lichHocPath = `./Data/${mssv}_lichhoc.json`;

  if (!fs.existsSync(lichThiPath) || !fs.existsSync(lichHocPath)) {
    return res.send("Không có dữ liệu lịch để hiển thị.");
  }

  res.setHeader("Cache-Control", "no-store");
  res.redirect("/lichcanhan");
});

// Phục vụ giao diện xem lịch
app.get("/lichcanhan", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/lichcanhan.html"));
});

// API restore session từ localStorage (không cần Puppeteer)
app.post("/api/restore-session", async (req, res) => {
  const { mssv, password } = req.body;

  if (!mssv || !password) {
    return res.status(400).json({
      success: false,
      message: "Thiếu thông tin đăng nhập",
    });
  }

  try {
    // Kiểm tra xem có file data không (đã từng login trước đó)
    const lichHocPath = `./Data/${mssv}_lichhoc.json`;
    const lichThiPath = `./Data/${mssv}_lichthi.json`;

    if (!fs.existsSync(lichHocPath) || !fs.existsSync(lichThiPath)) {
      return res.status(404).json({
        success: false,
        message: "Chưa có dữ liệu, vui lòng đăng nhập lại",
      });
    }

    // Đọc dữ liệu từ file để lấy thông tin user
    const lichHoc = JSON.parse(fs.readFileSync(lichHocPath, "utf8"));
    const lichThi = JSON.parse(fs.readFileSync(lichThiPath, "utf8"));

    // Tìm name và mssv từ dữ liệu (nếu có)
    let name = "Không rõ tên";
    let mssvFromWeb = mssv;

    // Thử lấy từ lichHoc hoặc lichThi nếu có
    if (Array.isArray(lichHoc) && lichHoc.length > 0) {
      // Có thể có thông tin trong data
    }

    // Restore session
    req.session.name = name;
    req.session.mssv = mssvFromWeb;
    req.session.password = password;
    req.session.isPrincess =
      mssvFromWeb.trim().toLowerCase() === "dtc245280019";

    res.json({
      success: true,
      message: "Đã khôi phục session",
      data: { name, mssv: mssvFromWeb },
    });
  } catch (err) {
    console.error("❌ Lỗi restore session:", err.message);
    res.status(500).json({
      success: false,
      message: "Không thể khôi phục session",
    });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    // Trả về JSON để frontend xóa localStorage
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ success: true, message: "Đã đăng xuất" });
    }
    res.redirect("/");
  });
});

// API trả thông tin user
app.get("/api/user-info", (req, res) => {
  const { name, mssv, isPrincess } = req.session || {};
  if (name && mssv) {
    res.json({
      success: true,
      data: { name, mssv, isPrincess: !!isPrincess },
    });
  } else {
    res.json({
      success: false,
      message: "Chưa đăng nhập hoặc thiếu thông tin",
    });
  }
});

// API lấy lịch học
app.post("/api/lich-hoc", isAuthenticated, async (req, res) => {
  const { mssv, matkhau } = req.body;
  try {
    const result = await getLichHoc(mssv, matkhau);
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API lấy lịch thi
app.post("/api/lich-thi", isAuthenticated, async (req, res) => {
  const { mssv, matkhau } = req.body;
  try {
    const result = await getLichThi(mssv, matkhau);
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API đọc file JSON (không cần truyền lại password)
app.get("/api/lich-hoc-no-auth", isAuthenticated, (req, res) => {
  const mssv = req.session.mssv;
  try {
    const data = JSON.parse(
      fs.readFileSync(`./Data/${mssv}_lichhoc.json`, "utf8")
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
      fs.readFileSync(`./Data/${mssv}_lichthi.json`, "utf8")
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error("Lỗi đọc lichthi.json:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Không đọc được dữ liệu lịch thi" });
  }
});

// API đồng bộ lịch từ hệ thống trường
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
      `./Data/${mssv}_lichthi.json`,
      JSON.stringify(lichThi, null, 2)
    );
    fs.writeFileSync(
      `./Data/${mssv}_lichhoc.json`,
      JSON.stringify(lichHoc, null, 2)
    );

    res.json({ success: true, message: "Đồng bộ xong", lichHoc, lichThi });
  } catch (err) {
    console.error("❌ Lỗi khi đồng bộ:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi đồng bộ. Không thể truy cập hệ thống trường.",
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
});
