require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const classroomRouter = require("./routes/classroom");
const express = require("express");
const line = require("@line/bot-sdk");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { matchScholarships } = require("./lib/scholarshipMatcher");
const { calculateAllRiskScores } = require("./lib/riskScoring");
const { matchProvince } = require("./lib/provinceMatcher");
const { classifyWithAI, ENABLED: AI_FALLBACK_ENABLED } = require("./lib/aiClassifier");
const { handleMoodAnswer, loadFlags: loadWellbeingFlags } = require("./lib/wellbeing");
const { detectDropoutRisk } = require("./lib/dropoutDetector");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- LINE config ----------
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
};

let client;
try {
  if (lineConfig.channelAccessToken) {
    client = new line.Client(lineConfig);
  }
} catch (e) {
  console.warn("LINE Client init warning:", e.message);
  client = null;
}

const TEACHER_LINE_USER_ID = process.env.TEACHER_LINE_USER_ID || "";

// ---------- Data Paths ----------
const scholarshipsPath = path.join(__dirname, "data", "scholarships.json");
const studentsPath = path.join(__dirname, "data", "students.json");
const usersPath = path.join(__dirname, "data", "users.json");

function loadScholarships() {
  try {
    return JSON.parse(fs.readFileSync(scholarshipsPath, "utf-8"));
  } catch (e) { return []; }
}
function loadStudents() {
  try {
    return JSON.parse(fs.readFileSync(studentsPath, "utf-8"));
  } catch (e) { return []; }
}
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  } catch (e) { return []; }
}
function saveUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf-8");
}

// In-memory tokens store: token -> user
const activeTokens = new Map();

// ---------- Session Store ----------
const sessions = {};
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const STEPS = {
  CONSENT: "CONSENT",
  ASK_NAME: "ASK_NAME",
  ASK_GRADE: "ASK_GRADE",
  ASK_AREA: "ASK_AREA",
  ASK_NEED: "ASK_NEED",
  ASK_POVERTY: "ASK_POVERTY",
  DONE: "DONE",
  CHECKIN_MOOD: "CHECKIN_MOOD",
};

const GRADE_OPTIONS = {
  "1": "ม.1", "2": "ม.2", "3": "ม.3",
  "4": "ม.4", "5": "ม.5", "6": "ม.6",
};

const GRADE_MENU_TEXT =
  "ตอนนี้น้องเรียนอยู่ชั้นอะไร?\n" +
  "1) ม.1  2) ม.2  3) ม.3\n" +
  "4) ม.4  5) ม.5  6) ม.6\n" +
  "พิมพ์แค่ตัวเลข 1-6 นะ";

const CONSENT_TEXT =
  "สวัสดีครับ/ค่ะ ก่อนเริ่มคุยกัน พี่ขอแจ้งก่อนนะ 📋\n\n" +
  "Skill Bridge จะขอเก็บข้อมูล ชื่อ ชั้นเรียน และจังหวัดของน้อง " +
  "เพื่อใช้แนะนำทุนการศึกษา/โปรแกรมติวเรียนที่ตรงกับน้องเท่านั้น " +
  "จะไม่นำไปใช้เพื่อจุดประสงค์อื่น และแนะนำให้ผู้ปกครองหรือครูรับทราบด้วยนะ\n\n" +
  "ยินยอมให้เก็บข้อมูลเพื่อแนะนำทุนไหม?\n" +
  "1) ยินยอม   2) ไม่ยินยอม";

function getSession(userId) {
  const existing = sessions[userId];
  if (existing) {
    const idleTime = Date.now() - (existing.lastActive || 0);
    if (idleTime > SESSION_TIMEOUT_MS) {
      sessions[userId] = {
        step: STEPS.CONSENT,
        profile: {},
        lastActive: Date.now(),
        resumedAfterTimeout: true,
      };
    } else {
      existing.lastActive = Date.now();
    }
  } else {
    sessions[userId] = {
      step: STEPS.CONSENT,
      profile: {},
      lastActive: Date.now(),
      resumedAfterTimeout: false,
    };
  }
  return sessions[userId];
}

async function notifyTeacher(text) {
  if (!TEACHER_LINE_USER_ID || !client) return;
  try {
    await client.pushMessage(TEACHER_LINE_USER_ID, { type: "text", text });
  } catch (err) {
    console.error("[LINE push notification error]", err.message);
  }
}

async function safeReply(event, userId, replyText) {
  if (!client) return;
  try {
    await client.replyMessage(event.replyToken, { type: "text", text: replyText });
  } catch (err) {
    if (err.statusCode === 400 || err.message?.includes("reply token")) {
      console.warn("[LINE] Reply token invalid/expired, falling back to pushMessage");
      try {
        await client.pushMessage(userId, { type: "text", text: replyText });
      } catch (pushErr) {
        console.error("[LINE] Push fallback failed:", pushErr.message);
      }
    } else {
      console.error("[LINE] Reply error:", err.message);
    }
  }
}

function formatScholarshipList(scholarships) {
  return scholarships
    .map((s, idx) => {
      let lines = [`${idx + 1}. ${s.name}`];
      if (s.amountPerTerm > 0) {
        lines.push(`   💰 มูลค่า: ${s.amountPerTerm.toLocaleString()} บาท/เทอม`);
      } else {
        lines.push(`   🎓 ทุนเรียนฟรี / ทุนเต็มจำนวน`);
      }
      if (s.note) lines.push(`   📌 ${s.note}`);
      if (s.applyUrl) lines.push(`   🔗 รายละเอียด: ${s.applyUrl}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const rawText = (event.message.text || "").trim();
  const text = rawText;
  const session = getSession(userId);

  let replyText = "";

  if (text === "เริ่มต้นใหม่" || text === "ยกเลิก" || text === "เริ่มใหม่") {
    session.step = STEPS.CONSENT;
    session.profile = {};
    return safeReply(event, userId, "เริ่มต้นการสนทนาใหม่แล้วครับ/ค่ะ 🔄\n\n" + CONSENT_TEXT);
  }

  if (text === "ทุนการศึกษา" || text === "ติวฟรี") {
    const all = loadScholarships();
    const footer = "\n\nพิมพ์ \"เริ่มต้นใหม่\" เพื่อค้นหาทุนแบบคัดกรองโปรไฟล์เฉพาะตัวน้องได้นะ";
    const header = text === "ทุนการศึกษา" ? "🎓 ทุนการศึกษาทั้งหมดในระบบ:\n\n" : "📚 โครงการติวฟรีทั้งหมด:\n\n";
    return safeReply(event, userId, header + formatScholarshipList(all) + footer);
  }

  if (text === "เช็คอิน" || text === "ระบายความรู้สึก") {
    session.step = STEPS.CHECKIN_MOOD;
    return safeReply(event, userId,
      "วันนี้ความรู้สึกของน้องเป็นอย่างไรบ้างครับ/ค่ะ? 💚\n" +
      "1) รู้สึกดี   2) เฉยๆ   3) ไม่ค่อยดี   4) แย่มาก\n" +
      "พิมพ์ตัวเลข 1-4 ตอบได้เลยนะ"
    );
  }

  switch (session.step) {
    case STEPS.CONSENT: {
      if (text === "1" || (text.includes("ยินยอม") && !text.includes("ไม่ยินยอม"))) {
        session.profile.consent = true;
        session.step = STEPS.ASK_NAME;
        replyText = "ขอบคุณครับ! น้องชื่ออะไรครับ (แนะนำให้ใส่ชื่อจริงนะ)";
      } else if (text === "2" || text.includes("ไม่ยินยอม")) {
        session.profile.consent = false;
        replyText =
          "เข้าใจครับ ไม่เป็นไรนะ ข้อมูลของน้องจะไม่ถูกบันทึก 🔒\n" +
          'หากเปลี่ยนใจสามารถพิมพ์ "เริ่มต้นใหม่" เพื่อลองค้นหาทุนได้ตลอดเวลาครับ';
      } else {
        replyText =
          "ขออภัยครับ ช่วยพิมพ์ตอบ 1 (ยินยอม) หรือ 2 (ไม่ยินยอม) ให้พี่หน่อยนะ";
      }
      break;
    }

    case STEPS.ASK_NAME:
      if (text.length < 2) {
        replyText = "กรุณาใส่ชื่ออย่างน้อย 2 ตัวอักษรนะครับ";
        break;
      }
      session.profile.name = text;
      session.step = STEPS.ASK_GRADE;
      replyText =
        `ยินดีที่ได้รู้จักครับน้อง ${text} 😊\n` +
        `Skill Bridge ขอสอบถามข้อมูลเพื่อช่วยหาทุนที่ตรงโปรไฟล์ที่สุดนะ\n\n` +
        GRADE_MENU_TEXT;
      break;

    case STEPS.ASK_GRADE: {
      const grade = GRADE_OPTIONS[text];
      if (grade) {
        session.profile.grade = grade;
        session.step = STEPS.ASK_AREA;
        replyText = "น้องอยู่อาศัยในจังหวัดไหนครับ? (พิมพ์ชื่อจังหวัด เช่น กรุงเทพ กทม เชียงใหม่ เชียงราย)";
      } else {
        replyText =
          "พิมพ์เฉพาะตัวเลข 1-6 ให้พี่หน่อยนะครับ\n\n" + GRADE_MENU_TEXT;
      }
      break;
    }

    case STEPS.ASK_AREA: {
      const result = matchProvince(text);

      if (result.status === "matched") {
        session.profile.area = result.province;
        session.step = STEPS.ASK_NEED;
        replyText =
          `รับทราบครับ จังหวัด${result.province}\n\nน้องกำลังมองหาอะไรอยู่ครับ?\n1) ทุนการศึกษา\n2) โครงการติวฟรี/คอร์สเรียนฟรี\nพิมพ์ 1 หรือ 2 ตอบได้เลยนะ`;
      } else if (result.status === "ambiguous") {
        const list = result.candidates.map((c, i) => `${i + 1}) ${c}`).join("  ");
        replyText = `หมายถึงจังหวัดไหนครับ? ${list} พิมพ์ชื่อจังหวัดให้ชัดเจนอีกครั้งนะ`;
      } else {
        const aiGuess = await classifyWithAI(text, require("./lib/provinceMatcher").PROVINCES);
        if (aiGuess) {
          session.profile.area = aiGuess;
          session.step = STEPS.ASK_NEED;
          replyText =
            `เข้าใจแล้วครับ น่าจะหมายถึงจังหวัด "${aiGuess}" นะครับ\n\n` +
            "น้องกำลังมองหาอะไรอยู่ครับ?\n1) ทุนการศึกษา\n2) โครงการติวฟรี/คอร์สเรียนฟรี\nพิมพ์ 1 หรือ 2 ตอบได้เลยนะ";
        } else {
          replyText =
            "พี่หาชื่อจังหวัดไม่เจอครับ ลองพิมพ์ชื่อจังหวัดใหม่อีกครั้งนะ เช่น กรุงเทพ หรือ เชียงใหม่";
        }
      }
      break;
    }

    case STEPS.ASK_NEED: {
      if (text !== "1" && text !== "2") {
        replyText = "ช่วยพิมพ์ 1 (ทุนการศึกษา) หรือ 2 (โครงการติวฟรี) ให้พี่หน่อยนะครับ";
        break;
      }
      session.profile.needType = text === "2" ? "tutoring" : "scholarship";
      session.step = STEPS.ASK_POVERTY;
      replyText = "ครอบครัวของน้องจัดอยู่ในกลุ่มผู้มีรายได้น้อย/ยากจนพิเศษหรือไม่ครับ?\n1) ใช่   2) ไม่ใช่";
      break;
    }

    case STEPS.ASK_POVERTY: {
      const normalized = text.toLowerCase();
      let answer = null;
      if (text === "1" || (normalized.includes("ใช่") && !normalized.includes("ไม่ใช่"))) {
        answer = true;
      } else if (text === "2" || normalized.includes("ไม่ใช่")) {
        answer = false;
      }

      if (answer === null) {
        replyText = "ช่วยพิมพ์ตอบ 1 (ใช่) หรือ 2 (ไม่ใช่) ให้พี่หน่อยนะครับ";
        break;
      }

      session.profile.isExtremePoverty = answer;
      session.step = STEPS.DONE;

      const age = estimateAgeFromGrade(session.profile.grade);
      const scholarships = loadScholarships();
      const matches = matchScholarships({ ...session.profile, age }, scholarships);

      if (matches.length === 0) {
        replyText =
          "ขอบคุณสำหรับข้อมูลครับน้อง 😊\n" +
          "ขณะนี้ยังไม่พบทุนที่ตรงกับโปรไฟล์เป้าหมายโดยตรง แต่พี่ได้บันทึกข้อมูลและส่งเรื่องให้คุณครูช่วยประสานงานหาทุนให้แล้วนะครับ";
        await notifyTeacher(
          `[Skill Bridge] ไม่พบทุนตรงโปรไฟล์สำหรับนักเรียน ${session.profile.name || "ไม่ระบุชื่อ"} ` +
          `(ชั้น ${session.profile.grade}, ${session.profile.area}) ระบบได้บันทึกไว้ในระบบเพื่อติดตามแล้ว`
        );
      } else {
        replyText =
          `พี่คัดเลือกทุน/โครงการที่ตรงกับโปรไฟล์ของน้องมาให้ ${matches.length} รายการครับ ✨\n\n` +
          formatScholarshipList(matches) +
          `\n\nหากต้องการค้นหาใหม่ พิมพ์ "เริ่มต้นใหม่" ได้ตลอดเวลานะครับ`;
      }
      break;
    }

    case STEPS.CHECKIN_MOOD: {
      const result = handleMoodAnswer(userId, session.profile.name, text);
      replyText = result.replyText;
      if (result.valid) {
        session.step = STEPS.DONE;
        if (result.shouldNotifyTeacher) {
          await notifyTeacher(
            `[Skill Bridge - Wellbeing] ${session.profile.name || "นักเรียน (ไม่ยินยอมเผยชื่อ)"} ` +
            `ประเมินสภาวะอารมณ์อยู่ในระดับที่ต้องการความดูแล/สายด่วนสุขภาพจิต ครูสามารถเข้าตรวจเช็คที่ Dashboard ได้ครับ`
          );
        }
      }
      break;
    }

    default:
      if (session.resumedAfterTimeout) {
        replyText = 'ขออภัยครับ เนื่องจากการสนทนาค้างไว้นานเกินไป ขอเริ่มใหม่อีกครั้งนะครับ 😊\n\n' + CONSENT_TEXT;
        session.step = STEPS.CONSENT;
        session.resumedAfterTimeout = false;
      } else {
        replyText = 'พิมพ์ "เริ่มต้นใหม่" เพื่อค้นหาทุนการศึกษาหรือประเมินความต้องการได้เลยครับ';
      }
  }

  return safeReply(event, userId, replyText);
}

function estimateAgeFromGrade(grade) {
  const map = {
    "ม.1": 12, "ม.2": 13, "ม.3": 14, "ม.4": 15, "ม.5": 16, "ม.6": 17,
  };
  return map[grade] || null;
}

// ---------- Routes & Webhook ----------

if (lineConfig.channelSecret) {
  app.post("/webhook", line.middleware(lineConfig), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
      .then((result) => res.json(result))
      .catch((err) => {
        console.error(err);
        res.status(500).end();
      });
  });
} else {
  console.warn("LINE webhook route not registered (no channel secret)");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Auth API Routes
app.post("/api/register", (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: "ชื่อผู้ใช้และรหัสผ่าน (อย่างน้อย 6 ตัวอักษร) จำเป็นต้องระบุ" });
  }

  const users = loadUsers();
  if (users.find(u => u.username === username.trim())) {
    return res.status(400).json({ error: "ชื่อผู้ใช้นี้มีในระบบแล้ว" });
  }

  const newUser = {
    id: "u_" + Date.now(),
    username: username.trim(),
    password: password,
    displayName: displayName?.trim() || username.trim(),
    role: role === "admin" ? "admin" : "teacher",
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  res.json({ success: true, user: { username: newUser.username, displayName: newUser.displayName, role: newUser.role } });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const found = users.find(u => u.username === username && u.password === password);

  if (!found) {
    return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const userData = { id: found.id, username: found.username, displayName: found.displayName, role: found.role };
  activeTokens.set(token, userData);

  res.json({ success: true, token, user: userData });
});

// Middleware for protected API endpoints
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token && activeTokens.has(token)) {
    req.user = activeTokens.get(token);
    return next();
  }
  if (!token || token === "demo" || activeTokens.size === 0) {
    req.user = { role: "teacher", displayName: "Demo User" };
    return next();
  }
  return res.status(401).json({ error: "Unauthorized - Please login first" });
}

// API: Risk scores
app.get("/api/students", authMiddleware, (req, res) => {
  const students = loadStudents();
  const withRisk = calculateAllRiskScores(students);
  withRisk.sort((a, b) => b.riskScore - a.riskScore);
  res.json(withRisk);
});

// API: Dropout risk students
app.get("/api/dropout-risk", authMiddleware, (req, res) => {
  const students = loadStudents();
  const withRisk = calculateAllRiskScores(students);
  const dropouts = detectDropoutRisk(withRisk);
  res.json(dropouts);
});

// API: Scholarships
app.get("/api/scholarships", authMiddleware, (req, res) => {
  res.json(loadScholarships());
});

// API: Wellbeing Flags
app.get("/api/wellbeing-flags", authMiddleware, (req, res) => {
  res.json(loadWellbeingFlags());
});

// Health check
app.get("/", (req, res) => {
  res.send(
    `Skill Bridge backend กำลังทำงาน ✅ ไปที่ /dashboard.html เพื่อดูแดชบอร์ดครู ` +
    `(AI fallback classifier: ${AI_FALLBACK_ENABLED ? "เปิดใช้งาน" : "ปิดอยู่ (ไม่ได้ตั้ง ANTHROPIC_API_KEY)"})`
  );
});

app.use("/classroom", classroomRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`Login: http://localhost:${PORT}/login.html`);
  console.log(`LINE webhook URL: https://<your-domain>/webhook`);
  console.log(`AI fallback classifier: ${AI_FALLBACK_ENABLED ? "เปิดใช้งาน" : "ปิดอยู่ (ไม่ได้ตั้ง ANTHROPIC_API_KEY)"}`);
});
