const express = require("express");
const router = express.Router();
const checkDangNhap = require("../path/to/checkDangNhap"); // Đảm bảo đúng đường dẫn

const princessMSSV = "dtc245310153";
router.post("/login", async (req, res) => {
  const { mssv, matkhau } = req.body;

  try {
    const success = await checkDangNhap(mssv, matkhau);

    if (!success) {
      return res
        .status(401)
        .json({ success: false, message: "Sai mã sinh viên hoặc mật khẩu" });
    }

    req.session.mssv = mssv;

    res.json({ success: true, redirect: "/xem-lich" });
  } catch (err) {
    console.error("❌ Lỗi backend:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Lỗi hệ thống, thử lại sau!" });
  }
});

module.exports = router;
