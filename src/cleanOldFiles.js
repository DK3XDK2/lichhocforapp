const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const MAX_AGE = 1000 * 60 * 60;

function cleanOldFiles() {
  const files = fs.readdirSync(DATA_DIR);

  files.forEach((file) => {
    const filePath = path.join(DATA_DIR, file);
    const stats = fs.statSync(filePath);
    const age = Date.now() - stats.mtimeMs;

    if (age > MAX_AGE) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Đã xoá: ${file}`);
    }
  });
}

module.exports = cleanOldFiles;
