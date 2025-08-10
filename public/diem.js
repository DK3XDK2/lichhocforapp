async function fetchAndRenderDiem() {
  try {
    const res = await fetch("/api/diem-no-auth");
    const json = await res.json();
    console.log("Dữ liệu API điểm:", json);

    // Nếu API có 2 lớp success/data
    const innerData = json.data?.data || {};
    const { summary = [], details = [] } = innerData;

    console.log("Summary:", summary);
    console.log("Details:", details);

    if (!json.success || !Array.isArray(summary) || !Array.isArray(details)) {
      document.getElementById(
        "diem-container"
      ).innerHTML = `<p class="error">Dữ liệu bảng điểm không hợp lệ</p>`;
      return;
    }

    let html = "";

    // ==== PHẦN 1: CARD TÓM TẮT ====
    html += `<h2 class="section-title">Tóm tắt kết quả học tập</h2>`;
    html += `<div class="summary-cards">`;
    summary.forEach((row) => {
      html += `
        <div class="summary-card">
          <div class="summary-header">${row.namHoc} - ${row.hocKy || " "}</div>
          <div class="summary-body">
            <div><strong>TBTL Hệ 10:</strong> ${row.tbtlHe10N1}</div>
            <div><strong>TBTL Hệ 4:</strong> ${row.tbtlHe4N1}</div>
            <div><strong>Số TCTL:</strong> ${row.soTCTLN1}</div>
            <div><strong>TBC Hệ 10:</strong> ${row.tbcHe10N1}</div>
            <div><strong>Số TC:</strong> ${row.soTCN1}</div>
          </div>
        </div>
      `;
    });
    html += `</div>`;

    // ==== PHẦN 2: BẢNG CHI TIẾT ====
    html += `<h2 class="section-title">Chi tiết điểm từng môn</h2>`;
    html += `<div class="table-wrapper"><table class="table-diem">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã HP</th>
                  <th>Tên học phần</th>
                  <th>Số TC</th>
                  <th>Lần học</th>
                  <th>Lần thi</th>
                  <th>CC</th>
                  <th>Thi</th>
                  <th>TKHP</th>
                  <th>Điểm chữ</th>
                  <th>Đánh giá</th>
                </tr>
              </thead>
              <tbody>`;

    details.forEach((row) => {
      let gradeClass = row.diemChu ? `grade-${row.diemChu}` : "";
      html += `
        <tr class="${gradeClass}">
          <td>${row.stt}</td>
          <td>${row.maHocPhan}</td>
          <td>${row.tenHocPhan}</td>
          <td>${row.soTC}</td>
          <td>${row.lanHoc}</td>
          <td>${row.lanThi}</td>
          <td>${row.cc}</td>
          <td>${row.thi}</td>
          <td>${row.tkhp}</td>
          <td>${row.diemChu}</td>
          <td>${row.danhGia}</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    document.getElementById("diem-container").innerHTML = html;
  } catch (err) {
    console.error("❌ Lỗi load điểm:", err);
    document.getElementById(
      "diem-container"
    ).innerHTML = `<p class="error">Không thể tải bảng điểm</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const diemTab = document.querySelector('[data-tab="bang-diem"]');
  diemTab.addEventListener("click", () => {
    fetchAndRenderDiem();
  });
});
