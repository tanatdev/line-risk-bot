const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { parseScoreExcel } = require("../lib/excelParser");
const { checkStatus } = require("../lib/gradeChecker");
const { createNotifier } = require("../lib/notifyTeachers");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const notifier = createNotifier();

const DATA_DIR = path.join(__dirname, "..", "data");
const rosterPath = path.join(DATA_DIR, "classroom-roster.json");
const scoresPath = path.join(DATA_DIR, "classroom-scores.json");
const teachersPath = path.join(DATA_DIR, "classroom-teachers.json");

function loadJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    return fallback;
  }
}
function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

const SUBJECT_LABELS = {
  math: "คณิตศาสตร์",
  science: "วิทยาศาสตร์",
  english: "ภาษาอังกฤษ",
};
const VALID_ROLES = ["homeroom", "math", "science", "english"];

// ---------- หน้าเว็บหลัก ----------
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "classroom.html"));
});

// ---------- รายชื่อนักเรียนในห้อง ----------
router.get("/api/roster", (req, res) => {
  res.json(loadJSON(rosterPath, []));
});

// ---------- คะแนนทั้งหมดที่เคยอัปโหลด ----------
router.get("/api/scores", (req, res) => {
  const scores = loadJSON(scoresPath, []);
  // ล่าสุดขึ้นก่อน
  scores.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(scores);
});

// ---------- ตั้งค่า LINE userId ของครูแต่ละคน ----------
router.get("/api/teachers", (req, res) => {
  const teachers = loadJSON(teachersPath, {});
  // ไม่ส่ง userId เต็มออกไปโชว์หน้าเว็บ กันหลุด โชว์แค่ 4 ตัวท้ายพอให้รู้ว่าตั้งไว้แล้ว
  const masked = {};
  VALID_ROLES.forEach((role) => {
    masked[role] = teachers[role] ? `••••${teachers[role].slice(-4)}` : null;
  });
  res.json(masked);
});

router.post("/api/teachers", express.json(), (req, res) => {
  const { role, userId } = req.body || {};
  if (!VALID_ROLES.includes(role) || !userId) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบ (role หรือ userId)" });
  }
  const teachers = loadJSON(teachersPath, {});
  teachers[role] = String(userId).trim();
  saveJSON(teachersPath, teachers);
  res.json({ success: true });
});

// ---------- อัปโหลดคะแนนจาก Excel ----------
router.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const { subject, chapter, fullScore, threshold } = req.body || {};

    if (!subject || !chapter || !fullScore || !threshold || !req.file) {
      return res
        .status(400)
        .json({ error: "กรอกข้อมูลไม่ครบ (วิชา / บท / คะแนนเต็ม / เกณฑ์ / ไฟล์)" });
    }
    if (!SUBJECT_LABELS[subject]) {
      return res.status(400).json({ error: "ไม่รู้จักวิชานี้" });
    }

    const roster = loadJSON(rosterPath, []);
    const rows = parseScoreExcel(req.file.buffer);

    const newRecords = [];
    const failedStudents = [];
    const uploadedAt = new Date().toISOString();

    rows.forEach((row) => {
      // จับคู่กับ roster ด้วยรหัสนักเรียนก่อน ถ้าไม่มีค่อยลองจับด้วยชื่อ
      const student = roster.find(
        (s) =>
          (row.studentId && s.id === row.studentId) ||
          (row.name && s.name.trim() === row.name.trim())
      );
      if (!student) return; // ข้ามแถวที่จับคู่นักเรียนในห้องนี้ไม่ได้

      const { percent, status } = checkStatus(
        row.score,
        Number(fullScore),
        Number(threshold)
      );

      const record = {
        studentId: student.id,
        name: student.name,
        subject,
        subjectLabel: SUBJECT_LABELS[subject],
        chapter,
        score: row.score,
        fullScore: Number(fullScore),
        percent,
        threshold: Number(threshold),
        status,
        uploadedAt,
      };
      newRecords.push(record);
      if (status === "ตก") failedStudents.push(record);
    });

    const allScores = loadJSON(scoresPath, []);
    saveJSON(scoresPath, allScores.concat(newRecords));

    // แจ้งเตือนครูวิชานี้ + ครูประจำชั้น ถ้ามีคนตกอย่างน้อย 1 คน
    let notifyResult = { subjectTeacher: null, homeroomTeacher: null };
    if (failedStudents.length > 0) {
      const teachers = loadJSON(teachersPath, {});
      const listText = failedStudents
        .map((s) => `- ${s.name} (${s.percent}%)`)
        .join("\n");
      const message =
        `📉 แจ้งเตือนคะแนนตกเกณฑ์ — ม.6/7\n` +
        `วิชา: ${SUBJECT_LABELS[subject]} | บท: ${chapter}\n` +
        `เกณฑ์: ต่ำกว่า ${threshold}% ของคะแนนเต็ม ${fullScore}\n\n` +
        `นักเรียนที่ตก (${failedStudents.length} คน):\n${listText}`;

      notifyResult.subjectTeacher = await notifier.notify(
        teachers[subject],
        message
      );
      notifyResult.homeroomTeacher = await notifier.notify(
        teachers.homeroom,
        message
      );
    }

    res.json({
      success: true,
      totalRows: rows.length,
      matched: newRecords.length,
      unmatched: rows.length - newRecords.length,
      failedCount: failedStudents.length,
      records: newRecords,
      notifyResult,
    });
  } catch (err) {
    console.error("[classroom] upload error:", err);
    res.status(500).json({ error: "ประมวลผลไฟล์ไม่สำเร็จ: " + err.message });
  }
});

module.exports = router;
