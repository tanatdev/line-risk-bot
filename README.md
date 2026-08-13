# Skill Bridge — Prototype

LINE chatbot + ระบบจับคู่ทุนการศึกษา + risk scoring + wellbeing check-in + แดชบอร์ดครู

## โครงสร้างไฟล์

```
skill-bridge/
├── server.js                      # main server: LINE webhook + API + serve dashboard
├── lib/
│   ├── riskScoring.js             # คำนวณ risk score (แก้สูตร/threshold ตรงนี้)
│   ├── scholarshipMatcher.js      # logic จับคู่ทุน (แก้เงื่อนไข filter ตรงนี้)
│   ├── provinceMatcher.js         # fuzzy match ชื่อจังหวัด (รองรับชื่อย่อ เช่น กทม)
│   ├── aiClassifier.js            # AI fallback (ใช้ Claude API ตีความคำตอบที่ parser ปกติจับไม่ได้)
│   └── wellbeing.js                # ประมวลผล mood check-in + บันทึก flag ให้ครูติดตาม
├── data/
│   ├── scholarships.json          # ⚠️ mock data - ต้องแทนที่ด้วยทุนจริงที่ทีมรวบรวมมา
│   ├── students.json              # mock data นักเรียน - ใช้ demo ได้เลย
│   ├── provinces.json             # รายชื่อ 77 จังหวัด
│   └── wellbeing_flags.json       # บันทึกอัตโนมัติเมื่อมีเด็กเช็คอินแล้วอาจต้องการความช่วยเหลือ
├── scripts/
│   └── updateScholarships.js      # ⚠️ scraper ต้นแบบ ยังไม่ทดสอบจริง ต้องแก้ selector เองก่อนใช้ (ดูคอมเมนต์ในไฟล์)
├── public/
│   └── dashboard.html             # แดชบอร์ดครู (risk score + wellbeing flags)
├── .env.example
└── package.json
```

## ฟีเจอร์ที่มีตอนนี้

1. **PDPA Consent** — ถามยินยอมเก็บข้อมูลก่อนเริ่มคุยทุกครั้ง ถ้าไม่ยินยอมจะไม่เก็บข้อมูลใดๆ ต่อ
2. **เมนูเลือกชั้นเรียนแบบตัวเลข (1-6)** — กันตอบชั้นเรียนเพี้ยน
3. **Fuzzy match จังหวัด** — รองรับชื่อย่อ (กทม → กรุงเทพมหานคร) และคำที่ไม่ชัดเจนถามยืนยันก่อน
4. **AI fallback classifier** (ต้องตั้ง `ANTHROPIC_API_KEY`) — ช่วยตีความคำตอบอิสระที่ parser ปกติจับไม่ได้ ถ้าไม่ตั้งค่าไว้ระบบจะข้ามไปส่งต่อครูตามปกติ ไม่ error
5. **กัน reply token หมดอายุ** — ถ้าตอบช้าจน token หมดอายุ ระบบ fallback ไปใช้ pushMessage แทนอัตโนมัติ
6. **กัน session หาย** — ถ้าคุยค้างไว้เกิน 30 นาที ระบบจะอธิบายก่อนเริ่มคุยใหม่ ไม่ใช่จู่ๆ ถามชื่อเฉยๆ
7. **Rich Menu 6 ปุ่ม** — ติดต่อสอบถาม / ทุนการศึกษา (ดึงทุนทั้งหมดทันที) / ติวฟรี (ดึงทั้งหมดทันที) / เกี่ยวกับโครงการ / เริ่มต้นใหม่
8. **Wellbeing Check-in** — พิมพ์ "เช็คอิน" หรือ "ระบายความรู้สึก" เพื่อถามความรู้สึกสั้นๆ ถ้าตอบว่าไม่ค่อยดี/แย่มาก ระบบจะส่งสายด่วนสุขภาพจิตให้ทันที + แจ้งครู (ไม่วินิจฉัย ไม่ให้คำปรึกษาเอง)
9. **แดชบอร์ดครู** — ตาราง risk score 3 สี + ตาราง wellbeing flags แยกต่างหาก

## ขั้นตอนติดตั้ง (ทำบนเครื่องตัวเอง)

```bash
cd skill-bridge
npm install
cp .env.example .env
```

ใส่ค่าใน `.env`:
```
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
TEACHER_LINE_USER_ID=       # (ไม่บังคับ) LINE userId ของครู/แอดมินที่จะรับ push แจ้งเตือน
ANTHROPIC_API_KEY=          # (ไม่บังคับ) เปิดใช้ AI fallback classifier
```

## Deploy ขึ้น Render

1. Push โค้ดขึ้น GitHub
2. เชื่อม Render กับ repo → ตั้ง Environment Variables ให้ครบตาม `.env.example`
3. Build command: `npm install` / Start command: `npm start`
4. เอา URL ที่ได้ (`https://<your-app>.onrender.com/webhook`) ไปตั้งใน LINE Developers Console → Messaging API → Webhook URL → กด Verify

## ทดสอบ Flow เต็ม

1. พิมพ์ **"สวัสดี"** → ต้องเจอข้อความ PDPA consent ก่อน
2. ตอบ 1 (ยินยอม) → ชื่อ → เลือกชั้นเรียน (ตัวเลข 1-6) → จังหวัด → 1/2 (ทุน/ติว) → 1/2 (ยากจนพิเศษ)
3. ตอบครบ → บอทแนะนำทุนที่ตรงโปรไฟล์
4. ทดสอบปุ่ม Rich Menu ทั้ง 6 ปุ่ม ต้องมีข้อความตอบกลับทุกปุ่ม ไม่มีปุ่มไหนเงียบ
5. พิมพ์ "เช็คอิน" → ตอบ 3 หรือ 4 → ต้องเห็นสายด่วนสุขภาพจิตในข้อความตอบกลับ
6. เปิด `/dashboard.html` → เช็คทั้งตาราง risk score และตาราง wellbeing flags

## จุดที่ยังต้องทำเพิ่มก่อนใช้งานจริงระยะยาว (ไม่ใช่แค่ demo)

- **`data/scholarships.json`** — ยังเป็น mock ต้องแทนที่ด้วยข้อมูลทุนจริงที่ตรวจสอบแล้ว
- **`scripts/updateScholarships.js`** — เป็นโครงร่าง ยังไม่ได้ทดสอบกับเว็บจริง ต้องเปิด DevTools หา selector จริงก่อนใช้ และควรมีคนตรวจข้อมูลก่อน publish ทุกครั้ง (อย่า auto-publish ตรงๆ)
- **Session เก็บใน memory** — ถ้า server restart ข้อมูล conversation ที่ค้างจะหายทั้งหมด ถ้าจะใช้งานจริงต่อเนื่องควรย้ายไป database/Google Sheet
- **`TEACHER_LINE_USER_ID`** — ตอนนี้รองรับแจ้งเตือนครูแค่ 1 คน ถ้ามีครูหลายคนต้องขยายเป็น list
