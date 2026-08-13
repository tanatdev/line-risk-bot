/**
 * รับโปรไฟล์นักเรียน -> filter ทุนที่ตรงเงื่อนไขจาก dataset
 * คืนค่าทุนที่ match มากที่สุด สูงสุด 3 รายการ
 */

function matchScholarships(profile, scholarships) {
  const { age, grade, area, isExtremePoverty, hasDisability, needType } = profile;

  const matched = scholarships.filter((s) => {
    // ถ้าต้องการแค่ "ติวเรียน" ให้เอาเฉพาะโปรแกรมติว/training
    if (needType === "tutoring" && !s.isTutoringOnly && !s.isTrainingOnly) return false;
    if (needType === "scholarship" && (s.isTutoringOnly || s.isTrainingOnly)) return false;

    // เช็คช่วงอายุ
    if (age != null) {
      if (s.minAge != null && age < s.minAge) return false;
      if (s.maxAge != null && age > s.maxAge) return false;
    }

    // เช็คระดับชั้น
    if (grade && s.grades && s.grades.length > 0) {
      if (!s.grades.includes(grade)) return false;
    }

    // เช็คพื้นที่ (ถ้าทุนจำกัดเฉพาะบางภาค และไม่ใช่ "ทั่วประเทศ")
    if (area && s.areas && s.areas.length > 0 && !s.areas.includes("ทั่วประเทศ")) {
      if (!s.areas.includes(area)) return false;
    }

    // เช็คเงื่อนไขยากจนพิเศษ
    if (s.requiresExtremePoverty && !isExtremePoverty) return false;

    // เช็คเงื่อนไขคนพิการ
    if (s.requiresDisability && !hasDisability) return false;

    return true;
  });

  // เรียงให้ทุนที่ให้เงินเยอะกว่าขึ้นก่อน (ปรับ logic ตรงนี้ได้ตามต้องการ)
  matched.sort((a, b) => (b.amountPerTerm || 0) - (a.amountPerTerm || 0));

  return matched.slice(0, 3);
}

module.exports = { matchScholarships };
