/**
 * เทียบคะแนนกับเกณฑ์ คำนวณ % และสถานะผ่าน/ตก
 */
function checkStatus(score, fullScore, thresholdPercent) {
  if (!fullScore || fullScore <= 0) {
    throw new Error("คะแนนเต็มต้องมากกว่า 0");
  }
  const percent = Math.round(((score / fullScore) * 100) * 10) / 10;
  const status = percent < thresholdPercent ? "ตก" : "ผ่าน";
  return { percent, status };
}

module.exports = { checkStatus };
