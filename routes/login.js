app.post("/login", async (req, res) => {
  const { mssv, matkhau } = req.body;

  try {
    const success = await checkDangNhap(mssv, matkhau);
    if (!success) {
      return res.render("login", { error: "Sai mã sinh viên hoặc mật khẩu" });
    }

    req.session.mssv = mssv;

    // Nếu đăng nhập đúng
    res.redirect("/xem-lich");
  } catch (err) {
    res.render("login", { error: "Lỗi hệ thống, thử lại sau!" });
  }
});
