/**
 * คำนวณ Risk Score ของนักเรียน 1 คน
 * สูตร (ตกลงกับทีมไว้แล้ว - แก้ตัวเลขตรงนี้ได้ตามข้อมูลจริงที่เก็บมา):
 *   ขาดเรียน >= 5 วันติดต่อกัน   -> +40
 *   คะแนนตก >= 15% เทียบเดือนก่อน -> +30
 *   ไม่ตอบแชท >= 7 วัน           -> +30
 *
 *   รวม >= 50   -> เสี่ยงสูง (red)
 *   รวม 20-49   -> เฝ้าระวัง (yellow)
 *   รวม < 20    -> ปกติ (green)
 */

const THRESHOLDS = {
  absentDays: 5,
  absentPoints: 40,
  scoreDropPercent: 15,
  scoreDropPoints: 30,
  noReplyDays: 7,
  noReplyPoints: 30,
  highRisk: 50,
  watchlist: 20,
};

function calculateRiskScore(student) {
  let score = 0;
  const reasons = [];

  // 1. เช็คขาดเรียนติดต่อกัน
  if (student.consecutiveAbsentDays >= THRESHOLDS.absentDays) {
    score += THRESHOLDS.absentPoints;
    reasons.push(`ขาดเรียนติดต่อกัน ${student.consecutiveAbsentDays} วัน`);
  }

  // 2. เช็คคะแนนตก
  if (student.scoreLastMonth > 0) {
    const dropPercent =
      ((student.scoreLastMonth - student.scoreThisMonth) / student.scoreLastMonth) * 100;
    if (dropPercent >= THRESHOLDS.scoreDropPercent) {
      score += THRESHOLDS.scoreDropPoints;
      reasons.push(`คะแนนตก ${dropPercent.toFixed(0)}% จากเดือนก่อน`);
    }
  }

  // 3. เช็คไม่ตอบแชท
  if (student.daysSinceLastChatReply >= THRESHOLDS.noReplyDays) {
    score += THRESHOLDS.noReplyPoints;
    reasons.push(`ไม่ตอบแชท ${student.daysSinceLastChatReply} วัน`);
  }

  // จัดสถานะ
  let status = "ปกติ";
  let statusColor = "green";
  if (score >= THRESHOLDS.highRisk) {
    status = "เสี่ยงสูง";
    statusColor = "red";
  } else if (score >= THRESHOLDS.watchlist) {
    status = "เฝ้าระวัง";
    statusColor = "yellow";
  }

  return {
    ...student,
    riskScore: score,
    status,
    statusColor,
    reasons,
  };
}

function calculateAllRiskScores(students) {
  return students.map(calculateRiskScore);
}

module.exports = { calculateRiskScore, calculateAllRiskScores, THRESHOLDS };
