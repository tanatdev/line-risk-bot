/**
 * dropoutDetector.js
 * ตรวจจับและวิเคราะห์ความเสี่ยงการตกหล่นจากระบบการศึกษา (Dropout Risk)
 */

function detectDropoutRisk(students) {
  if (!Array.isArray(students)) return [];

  return students.map(student => {
    const reasons = student.riskReasons || [];
    const score = student.riskScore || 0;
    
    // เงื่อนไขเสี่ยงหล่นจากระบบ: Risk Score >= 50 หรือมีปัจจัยสะสมหลายด้าน
    const isDropoutRisk = score >= 50 || reasons.length >= 2;

    return {
      ...student,
      isDropoutRisk,
      dropoutLevel: score >= 70 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
      riskReasons: reasons
    };
  }).filter(s => s.isDropoutRisk);
}

module.exports = { detectDropoutRisk };
