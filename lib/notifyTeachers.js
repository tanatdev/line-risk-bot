const line = require("@line/bot-sdk");

/**
 * สร้าง notifier สำหรับส่งแจ้งเตือนครู ผ่าน LINE Messaging API (push message)
 * ใช้ lazy init เพื่อไม่ให้ crash ตอน require ถ้ายังไม่มี token
 */
function createNotifier() {
  let client = null;

  function getClient() {
    if (!client) {
      const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!token) return null;
      client = new line.Client({ channelAccessToken: token });
    }
    return client;
  }

  async function notify(userId, text) {
    if (!userId) {
      return { sent: false, reason: "ไม่ได้ตั้งค่า LINE userId ของครูไว้" };
    }
    const c = getClient();
    if (!c) {
      return { sent: false, reason: "ไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN" };
    }
    try {
      await c.pushMessage(userId, { type: "text", text });
      return { sent: true };
    } catch (err) {
      console.error("[classroom] ส่ง push message ไม่สำเร็จ:", err.message);
      return { sent: false, reason: err.message };
    }
  }

  return { notify };
}

module.exports = { createNotifier };
