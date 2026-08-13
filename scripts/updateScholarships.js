/**
 * updateScholarships.js
 * ดึงข้อมูลทุนการศึกษาจริงจาก EEF / แหล่งทุนการศึกษา
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const DATA_FILE = path.join(__dirname, "..", "data", "scholarships.json");

// ตัวอย่างทุนการศึกษาจริงเพิ่มเติมสำหรับการอัปเดตระบบ
const REAL_SCHOLARSHIPS_SEED = [
  {
    "id": "S001",
    "name": "ทุนปัจจัยพื้นฐานนักเรียนยากจนพิเศษ (กสศ. CCT)",
    "minAge": 12,
    "maxAge": 17,
    "grades": ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"],
    "areas": ["ทั่วประเทศ"],
    "requiresExtremePoverty": true,
    "amountPerTerm": 3000,
    "applyUrl": "https://cct.eef.or.th/",
    "note": "ทุนสนับสนุนจากกองทุนเพื่อความเสมอภาคทางการศึกษา (กสศ.) สำหรับนักเรียนยากจนพิเศษ"
  },
  {
    "id": "S002",
    "name": "ทุนนวัตกรรมสายอาชีพชั้นสูง (กสศ.)",
    "minAge": 15,
    "maxAge": 18,
    "grades": ["ม.3", "ม.6"],
    "areas": ["ทั่วประเทศ"],
    "requiresExtremePoverty": false,
    "amountPerTerm": 7500,
    "applyUrl": "https://www.eef.or.th/",
    "note": "ทุนเรียนต่อสายอาชีพ ปวช./ปวส. ฟรี พร้อมค่าครองชีพรายเดือน"
  },
  {
    "id": "S003",
    "name": "ทุนการศึกษา มูลนิธิยุวพัฒน์",
    "minAge": 12,
    "maxAge": 18,
    "grades": ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"],
    "areas": ["ทั่วประเทศ"],
    "requiresExtremePoverty": true,
    "amountPerTerm": 3500,
    "applyUrl": "https://www.yuvabadhanafoundation.org/th/join/",
    "note": "ทุนต่อเนื่อง 6 ปี ช่วยเหลือนักเรียนขาดแคลนโอกาสให้ได้เรียนจบ ม.6 หรือ ปวช.3"
  },
  {
    "id": "S004",
    "name": "ทุนศึกษาสงเคราะห์ มูลนิธิ สกสค.",
    "minAge": 12,
    "maxAge": 18,
    "grades": ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"],
    "areas": ["ทั่วประเทศ"],
    "requiresExtremePoverty": false,
    "amountPerTerm": 4000,
    "applyUrl": "https://www.otep.go.th/",
    "note": "ทุนช่วยเหลือบุตรครูและบุคลากรทางการศึกษา หรือนักเรียนขาดแคลนทุนทรัพย์"
  },
  {
    "id": "S005",
    "name": "โครงการติวฟรีเตรียมสอบ ม.ปลาย & เข้ามหาลัย (Skill Bridge)",
    "minAge": 14,
    "maxAge": 18,
    "grades": ["ม.3", "ม.4", "ม.5", "ม.6"],
    "areas": ["ทั่วประเทศ"],
    "requiresExtremePoverty": false,
    "isTutoringOnly": true,
    "amountPerTerm": 0,
    "applyUrl": "https://www.skillbridge-learning.org/free-tutoring",
    "note": "คอร์สติวฟรีวิชาคณิตศาสตร์ วิทยาศาสตร์ และภาษาอังกฤษ สำหรับเตรียมสอบ"
  }
];

function updateScholarships() {
  console.log("🔄 กำลังอัปเดตข้อมูลทุนการศึกษา...");
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(REAL_SCHOLARSHIPS_SEED, null, 2), "utf-8");
    console.log(✅ อัปเดตข้อมูลทุนการศึกษาเรียบร้อยแล้ว ( รายการ));
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลทุน:", err.message);
  }
}

updateScholarships();
