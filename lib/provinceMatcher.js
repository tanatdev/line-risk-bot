const fs = require("fs");
const path = require("path");

const PROVINCES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "provinces.json"), "utf-8")
);

// ชื่อย่อ/ชื่อเล่นที่คนพิมพ์กันบ่อย -> ชื่อจังหวัดมาตรฐาน
const ABBREVIATIONS = {
  "กทม": "กรุงเทพมหานคร",
  "กรุงเทพ": "กรุงเทพมหานคร",
  "กรุงเทพฯ": "กรุงเทพมหานคร",
  "bangkok": "กรุงเทพมหานคร",
  "โคราช": "นครราชสีมา",
  "หาดใหญ่": "สงขลา",
  "อุบล": "อุบลราชธานี",
  "นครพนม": "นครพนม",
  "เชียงใหม่": "เชียงใหม่",
  "เมืองเลย": "เลย",
};

/**
 * เทียบข้อความอิสระกับรายชื่อจังหวัด
 * คืนค่า:
 *   { status: "matched", province: "..." }              -> เจอตรงตัว/ชื่อย่อที่รู้จัก
 *   { status: "ambiguous", candidates: [...] }           -> เจอหลายจังหวัดที่ใกล้เคียง ต้องให้เด็กยืนยัน
 *   { status: "not_found" }                              -> ไม่เจอเลย
 */
function matchProvince(rawText) {
  const text = rawText.trim();
  const normalized = text.replace(/^จังหวัด/, "").trim();

  // 1) เช็คชื่อย่อ/ชื่อเล่นที่รู้จักก่อน (แม่นสุด)
  const abbrevKey = Object.keys(ABBREVIATIONS).find(
    (k) => k.toLowerCase() === normalized.toLowerCase()
  );
  if (abbrevKey) {
    return { status: "matched", province: ABBREVIATIONS[abbrevKey] };
  }

  // 2) เช็คตรงตัวเป๊ะกับรายชื่อจังหวัดจริง
  const exact = PROVINCES.find((p) => p === normalized);
  if (exact) {
    return { status: "matched", province: exact };
  }

  // 3) เช็คแบบ "ขึ้นต้นด้วย" หรือ "มีคำนี้อยู่ในชื่อจังหวัด" (กันพิมพ์ไม่ครบ)
  const candidates = PROVINCES.filter(
    (p) => p.startsWith(normalized) || p.includes(normalized)
  );

  if (candidates.length === 1) {
    return { status: "matched", province: candidates[0] };
  }
  if (candidates.length > 1 && candidates.length <= 4) {
    return { status: "ambiguous", candidates };
  }

  return { status: "not_found" };
}

module.exports = { matchProvince, PROVINCES };
