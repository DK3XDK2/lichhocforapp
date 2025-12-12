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

const isProduction =
  process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT;
app.set("trust proxy", 1);

// Middlewares - CORS config cho production
app.use(
  cors({
    origin: true, // Cho phép tất cả origins (hoặc set cụ thể domain của bạn)
    credentials: true, // Quan trọng: cho phép gửi cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    maxAge: 86400, // Cache preflight requests
  })
);

// Thêm timeout cho tất cả requests (5 phút)
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 phút
  res.setTimeout(300000); // 5 phút
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.use(
  session({
    secret: "nogamenolifez",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: isProduction, // true trên HTTPS (Railway)
      sameSite: isProduction ? "none" : "lax", // "none" cần cho cross-site trên HTTPS
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 ngày
      httpOnly: true, // Bảo vệ cookie khỏi JavaScript
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

// Helper function để timeout Promise
function timeoutPromise(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// Login route
app.post("/login", async (req, res) => {
  const { mssv, matkhau } = req.body;

  console.log("🔐 Login attempt:", {
    mssv,
    isProduction,
    platform: process.platform,
  });

  // Set timeout cho toàn bộ request (180 giây cho Railway - Puppeteer cần thời gian)
  const loginTimeout = 180000; // 3 phút

  console.log(
    "⏱️ Starting login with timeout:",
    loginTimeout / 1000,
    "seconds"
  );

  try {
    // Chạy tuần tự thay vì parallel để tránh quá tải memory trên Railway
    console.log("📥 Fetching LichThi...");
    const lichThiRaw = await timeoutPromise(
      loginTimeout / 2, // 90 giây cho mỗi request
      getLichThi(mssv, matkhau)
    );
    console.log("✅ LichThi fetched successfully");

    console.log("📥 Fetching LichHoc...");
    const lichHocRaw = await timeoutPromise(
      loginTimeout / 2, // 90 giây cho mỗi request
      getLichHoc(mssv, matkhau)
    );
    console.log("✅ LichHoc fetched successfully");

    const lichThi = Array.isArray(lichThiRaw?.data) ? lichThiRaw.data : [];
    const lichHoc = Array.isArray(lichHocRaw?.data) ? lichHocRaw.data : [];

    const name = lichHocRaw?.name || lichThiRaw?.name || "Không rõ tên";
    const mssvFromWeb = lichHocRaw?.mssv || lichThiRaw?.mssv || mssv;

    req.session.name = name;
    req.session.mssv = mssvFromWeb;
    req.session.password = matkhau;
    req.session.isPrincess =
      mssvFromWeb.trim().toLowerCase() === "dtc245280019";

    // Đảm bảo thư mục Data tồn tại
    const dataDir = "./Data";
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log("✅ Created Data directory");
    }

    // Ghi file với error handling
    try {
      fs.writeFileSync(
        `${dataDir}/${mssvFromWeb}_lichthi.json`,
        JSON.stringify(lichThi, null, 2),
        "utf8"
      );
      console.log(`✅ Saved lichthi.json for ${mssvFromWeb}`);
    } catch (writeErr) {
      console.error("❌ Error writing lichthi.json:", writeErr);
      throw new Error("Không thể lưu dữ liệu lịch thi");
    }

    try {
      fs.writeFileSync(
        `${dataDir}/${mssvFromWeb}_lichhoc.json`,
        JSON.stringify(lichHoc, null, 2),
        "utf8"
      );
      console.log(`✅ Saved lichhoc.json for ${mssvFromWeb}`);
    } catch (writeErr) {
      console.error("❌ Error writing lichhoc.json:", writeErr);
      throw new Error("Không thể lưu dữ liệu lịch học");
    }

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
    // Log đầy đủ thông tin lỗi
    console.error("❌ Lỗi đăng nhập:", err.message);
    console.error("❌ Stack:", err.stack);
    console.error("❌ Error details:", {
      name: err.name,
      message: err.message,
      platform: process.platform,
      isProduction,
      code: err.code,
      syscall: err.syscall,
      path: err.path,
    });

    // Log thêm nếu là Puppeteer error
    if (err.message.includes("Puppeteer") || err.message.includes("browser")) {
      console.error("❌ Puppeteer error detected");
    }

    // Log thêm nếu là file system error
    if (
      err.code === "ENOENT" ||
      err.code === "EACCES" ||
      err.code === "EMFILE"
    ) {
      console.error("❌ File system error detected:", err.code);
    }

    // Xác định loại lỗi để trả về message phù hợp
    let errorMessage = "Sai mã sinh viên hoặc mật khẩu hoặc lỗi hệ thống!";
    if (err.message.includes("Timeout")) {
      errorMessage = "Đăng nhập quá lâu. Vui lòng thử lại sau.";
    } else if (
      err.message.includes("Puppeteer") ||
      err.message.includes("trình duyệt")
    ) {
      errorMessage =
        "Lỗi hệ thống: Không thể khởi động trình duyệt. Vui lòng thử lại sau.";
    } else if (err.message.includes("Sai mã sinh viên")) {
      errorMessage = "Sai mã sinh viên hoặc mật khẩu!";
    }

    // Trả về JSON nếu là AJAX request
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(500).json({
        success: false,
        message: errorMessage,
        error: err.message,
        errorType: err.name,
      });
    }

    return res.render("index", {
      error: errorMessage,
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

// Error handler middleware (phải đặt sau tất cả routes)
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  console.error("❌ Stack:", err.stack);
  res.status(500).json({
    success: false,
    message: "Lỗi hệ thống không xác định",
    error: err.message,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${isProduction ? "Production" : "Development"}`);
  console.log(`🖥️  Platform: ${process.platform}`);
  console.log(`📦 Node version: ${process.version}`);
});
