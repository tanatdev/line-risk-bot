/**
 * AI fallback classifier
 * -----------------------
 * ใช้เฉพาะตอนที่ parser แบบ rule-based (เมนูตัวเลข / fuzzy match จังหวัด) จับคำตอบไม่ได้เท่านั้น
 * ไม่ใช่ให้ AI คุยอิสระกับเด็ก แค่ช่วย "จัดคำตอบที่พิมพ์มาแบบอิสระ" ให้ตรงกับตัวเลือกที่มีอยู่แล้ว
 *
 * ต้องตั้งค่า ANTHROPIC_API_KEY ใน environment variables ก่อนถึงจะทำงาน
 * ถ้าไม่ตั้งไว้ ฟังก์ชันจะคืนค่า null ทันที ระบบจะ fallback ไปส่งต่อครูตามปกติ (ไม่ error)
 */

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ENABLED = Boolean(API_KEY);

async function classifyWithAI(rawText, options) {
  if (!ENABLED) return null; // ไม่ได้ตั้ง API key ไว้ -> ข้ามไปเลย ไม่ error

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // โมเดลเล็ก เร็ว พอสำหรับ classify งานง่ายแบบนี้
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content:
              `นักเรียนพิมพ์ว่า: "${rawText}"\n\n` +
              `ตัวเลือกที่มีให้เลือกคือ: ${JSON.stringify(options)}\n\n` +
              `ช่วยตอบกลับมาแค่ค่าที่ตรงที่สุดจากลิสต์ตัวเลือกด้านบนเท่านั้น ` +
              `ห้ามมีคำอธิบายเพิ่ม ถ้าไม่แน่ใจจริงๆ ว่าตรงตัวไหน ให้ตอบว่า UNKNOWN`,
          },
        ],
      }),
      // กันไม่ให้รอนานเกินไปจน reply token หมดอายุ (LINE token อายุ ~1 นาที)
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const answer = data?.content?.[0]?.text?.trim();

    if (!answer || answer === "UNKNOWN" || !options.includes(answer)) {
      return null;
    }
    return answer;
  } catch (err) {
    console.error("AI classify fallback ล้มเหลว:", err.message);
    return null; // ล้มเหลวก็ไม่ error ให้กระบวนการเดิม fallback ไปส่งต่อครูตามปกติ
  }
}

module.exports = { classifyWithAI, ENABLED };
