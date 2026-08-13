const XLSX = require("xlsx");

/**
 * แปลงไฟล์ Excel (buffer) เป็นรายการคะแนน
 * รองรับหัวตารางได้หลายแบบ กันครูตั้งชื่อคอลัมน์ไม่ตรงเป๊ะ:
 *   รหัสนักเรียน / Student_ID / รหัส
 *   ชื่อ-นามสกุล / ชื่อ / Name
 *   คะแนน / Score / คะแนนที่ได้
 *
 * ไฟล์ต้นฉบับต้องมีอย่างน้อย "ชื่อ-นามสกุล" หรือ "รหัสนักเรียน" 1 อย่าง + "คะแนน"
 */
function parseScoreExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rows
    .map((row) => {
      const studentId =
        row["รหัสนักเรียน"] || row["Student_ID"] || row["รหัส"] || "";
      const name = row["ชื่อ-นามสกุล"] || row["ชื่อ"] || row["Name"] || "";
      const scoreRaw =
        row["คะแนน"] || row["Score"] || row["คะแนนที่ได้"] || 0;
      return {
        studentId: String(studentId).trim(),
        name: String(name).trim(),
        score: Number(scoreRaw) || 0,
      };
    })
    .filter((r) => r.name || r.studentId); // ข้ามแถวว่าง
}

module.exports = { parseScoreExcel };
