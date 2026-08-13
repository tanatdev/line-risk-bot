/**
 * Wellbeing Check-in
 * -------------------
 * หลักการสำคัญ: บอทไม่วินิจฉัยหรือให้คำปรึกษาเรื่องสุขภาพจิตเอง
 * ทำหน้าที่แค่ "จับสัญญาณเบื้องต้น + ส่งต่อคนที่ช่วยได้จริง" เท่านั้น
 */

const fs = require("fs");
const path = require("path");

const flagsPath = path.join(__dirname, "..", "data", "wellbeing_flags.json");

const CRISIS_RESOURCES_TEXT =
  "ถ้าอยากคุยกับใครสักคนตอนนี้เลย ติดต่อได้ที่:\n" +
  "☎️ สายด่วนสุขภาพจิต กรมสุขภาพจิต โทร 1323 (ฟรี ตลอด 24 ชม.)\n" +
  "☎️ สายด่วน The Line จิตอาสา โทร 1323 กด 2\n" +
  "💬 Line OA @sabaijaiuni (บริการปรึกษาปัญหาสุขภาพใจฟรี)";

const MOOD_OPTIONS = {
  "1": { label: "สบายดี", risk: false },
  "2": { label: "เฉยๆ", risk: false },
  "3": { label: "ไม่ค่อยดี", risk: true },
  "4": { label: "แย่มาก", risk: true },
};

function loadFlags() {
  try {
    return JSON.parse(fs.readFileSync(flagsPath, "utf-8"));
  } catch {
    return [];
  }
}

function saveFlag(entry) {
  const flags = loadFlags();
  flags.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync(flagsPath, JSON.stringify(flags, null, 2), "utf-8");
}

/**
 * ประมวลผลคำตอบ mood check-in ของนักเรียน 1 คน
 * คืนค่าเป็นข้อความตอบกลับ + ว่าต้องแจ้งครูหรือไม่
 */
function handleMoodAnswer(userId, studentName, answerText) {
  const choice = MOOD_OPTIONS[answerText.trim()];

  if (!choice) {
    return {
      valid: false,
      replyText:
        "พี่ไม่แน่ใจว่าน้องหมายถึงข้อไหนนะ ลองเลือกใหม่ได้ไหม\n" +
        "1) สบายดี  2) เฉยๆ  3) ไม่ค่อยดี  4) แย่มาก\n" +
        "พิมพ์แค่ตัวเลข 1-4",
    };
  }

  if (!choice.risk) {
    return {
      valid: true,
      shouldNotifyTeacher: false,
      replyText: `ดีใจที่ได้ยินแบบนั้นนะ 😊 ถ้าอยากคุยอะไรเพิ่มเติมทักพี่มาได้เสมอเลย`,
    };
  }

  // risk = true -> รับฟังอย่างอบอุ่น ไม่ตัดสิน ไม่วินิจฉัย + ส่งต่อครู + แจ้งสายด่วนเสมอ
  saveFlag({
    userId,
    studentName: studentName || "ไม่ทราบชื่อ",
    moodAnswer: choice.label,
  });

  return {
    valid: true,
    shouldNotifyTeacher: true,
    replyText:
      `ขอบคุณที่บอกพี่นะ พี่ได้ยินแล้วว่าช่วงนี้น้องรู้สึก "${choice.label}" 💙\n` +
      `พี่จะส่งต่อให้ครูที่ปรึกษาช่วยดูแลน้องเพิ่มเติมนะ ไม่ต้องกังวลไป\n\n` +
      CRISIS_RESOURCES_TEXT,
  };
}

module.exports = { handleMoodAnswer, loadFlags, MOOD_OPTIONS, CRISIS_RESOURCES_TEXT };
