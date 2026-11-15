# ขั้นตอน Deploy แอป my-triton ขึ้น GitHub Pages

เป้าหมาย: เปิดแอปได้ที่ **https://it-sccb.github.io/my-triton/** แบบเดียวกับแอป CCTV
(`it-sccb.github.io/cctv-request/`) โดยไม่ต้องผ่าน AI Studio

โค้ดชุดนี้แปลงแอปเป็น static 100% แล้ว:
- ตอน**ยังไม่ล็อกอิน**: ข้อมูลเก็บใน localStorage ของเบราว์เซอร์เครื่องนั้นเท่านั้น
  (เปิดคนละเครื่อง/คนละเบราว์เซอร์จะไม่เห็นข้อมูลกัน)
- ตอน**ล็อกอินด้วย Google**: ข้อมูลซิงค์กับ Firestore โดยตรง (ใช้ได้ทุกเครื่อง)
- ปุ่มสแกน OCR / แปลงไฟล์ Drive ด้วย AI เรียก Gemini ตรงจากเบราว์เซอร์
  ต้องมีคีย์ `VITE_GEMINI_API_KEY` ตอน build (ข้อ 3 — ถ้าไม่ตั้ง ปุ่มจะแจ้งว่ายังไม่ได้ตั้งค่าคีย์ ไม่พัง)
- `server.ts` กับ `data/maintenance.json` ยังอยู่ใน repo ไว้ใช้กับ AI Studio / Cloud Run
  เหมือนเดิม — build ของ Pages ไม่ได้ใช้มัน

---

## 0. เอาโค้ดชุดนี้ขึ้น GitHub ก่อน (ทำครั้งเดียว)

โค้ดที่แก้แล้วอยู่ในเครื่องที่ทำไว้ ยังไม่ได้ push ขึ้น GitHub
(เครื่องนั้นไม่มีสิทธิ์ push) — ให้พี push จากเครื่องตัวเอง:

1. เปิดโฟลเดอร์ repo `my-triton` บนเครื่องพี (หรือ clone ใหม่จาก
   `https://github.com/IT-SCCB/my-triton`)
2. คัดลอกไฟล์ที่แก้/เพิ่มจากชุดที่ได้รับมา ทับลงใน repo (ดูรายการไฟล์ท้ายเอกสารนี้)
3. ตรวจว่า `git status` แสดงเฉพาะไฟล์ที่ตั้งใจแก้ แล้ว push ขึ้น branch `main`:
   `git add -A && git commit -m "Static build for GitHub Pages" && git push origin main`

> ถ้า push แล้ว workflow ยังไม่รัน ให้ตรวจข้อ 1 ก่อนว่าเปิด Pages แบบ GitHub Actions ไว้หรือยัง

## 1. เปิด GitHub Pages (ทำครั้งเดียว)

1. เปิด `https://github.com/IT-SCCB/my-triton/settings/pages`
2. หัวข้อ **Build and deployment → Source** เลือก **GitHub Actions**
   (อย่าเลือก Deploy from a branch)
3. กลับไปแท็บ **Actions** ของ repo — workflow `Deploy to GitHub Pages`
   จะรันอัตโนมัติหลัง push ขึ้น `main` (หรือกด **Run workflow** เองก็ได้)
4. รอให้ job `deploy` ขึ้นเครื่องหมายถูกสีเขียว (ประมาณ 1–3 นาที)
5. เปิด `https://it-sccb.github.io/my-triton/` — ต้องเห็นหน้าแอป
   "สมุดบันทึกเซอร์วิสอ้วนพี" พร้อมรูปไทรทันและข้อมูลเริ่มต้น

**ถ้าหน้าเว็บขึ้น 404:** รออีก 1–2 นาทีแล้วรีเฟรช ถ้ายัง 404 ให้ตรวจในแท็บ Actions
ว่า workflow ผ่านไหม และตรวจว่า Source ในข้อ 2 เลือก GitHub Actions แล้วจริง

## 2. (แนะนำ) ตั้งค่า Firestore Rules ให้ตรงกับไฟล์ใน repo

ไฟล์ `firestore.rules` ใน repo กำหนดว่าเฉพาะเจ้าของข้อมูล (`users/{uid}/...`)
ที่ล็อกอินด้วย Google และยืนยันอีเมลแล้วเท่านั้นถึงอ่าน/เขียนได้
**แต่ยังไม่ได้ยืนยันว่า rules นี้ถูก deploy ลงโปรเจกต์จริงหรือยัง**

1. เปิด Firebase console → โปรเจกต์ `gen-lang-client-0842510096` →
   **Firestore Database** → เลือกฐานข้อมูล
   `ai-studio-tritonservicetra-7ad533c6-389b-46cf-a766-436047e0846d` →
   แท็บ **Rules**
2. เทียบกับไฟล์ `firestore.rules` ใน repo — ถ้าตรงกันแล้ว ข้ามไปข้อ 3 ได้เลย
3. ถ้าไม่ตรง / ว่าง / เป็นค่าเริ่มต้น (allow read, write: if false หรือเปิดกว้าง)
   ให้ deploy ใหม่ด้วย Firebase CLI จากเครื่องที่ล็อกอิน Firebase แล้ว:
   `firebase deploy --only firestore:rules`
   (ถ้าโปรเจกต์มีหลายฐานข้อมูล ให้ระบุฐานข้อมูลชื่อเดียวกับข้างบนตอน deploy
   หรือวางเนื้อหาไฟล์ลงในแท็บ Rules บน console แล้วกด Publish)

## 3. เพิ่มโดเมน Pages ใน Firebase Authentication (ทำครั้งเดียว — ไม่งั้นล็อกอินไม่ได้)

1. เปิด Firebase console → โปรเจกต์ `gen-lang-client-0842510096` →
   **Authentication → Settings → Authorized domains**
2. กด **Add domain** ใส่ `it-sccb.github.io` แล้วบันทึก
   (`localhost` มีอยู่แล้วตามค่าเริ่มต้น ใช้เทสบนเครื่องได้)
3. รอ 1–2 นาทีให้มีผล

## 4. (ถ้าอยากใช้ OCR) ใส่คีย์ Gemini เป็น GitHub Secret

คีย์นี้จะถูกฝังลงในไฟล์ JS ที่ build (ใครเปิด devtools ก็เห็นได้)
จึงควรใช้คีย์แยกสำหรับแอปนี้โดยเฉพาะ และล็อกสิทธิ์ให้แคบที่สุด:

1. เปิด Google Cloud Console → โปรเจกต์ `gen-lang-client-0842510096` →
   **APIs & Services → Credentials** → สร้าง/เลือก API key สำหรับแอปนี้
2. ตั้ง **API restrictions → Restrict key → Generative Language API** เท่านั้น
3. ตั้ง **Application restrictions → HTTP referrers** ใส่ `https://it-sccb.github.io/*`
   แล้วบันทึก — จากนั้นเทส OCR จริง (ข้อ 5) ถ้า OCR ขึ้น 403 ให้เอา
   referrer restriction ออกก่อน แล้วใช้แค่ API restriction
4. เปิด `https://github.com/IT-SCCB/my-triton/settings/secrets/actions` →
   **New repository secret** ชื่อ `VITE_GEMINI_API_KEY` ใส่ค่าคีย์ แล้วบันทึก
5. สั่งรัน workflow ใหม่ (แท็บ Actions → Deploy to GitHub Pages → Run workflow)
   หรือ push commit ใดๆ ขึ้น `main` — build รอบใหม่จะฝังคีย์ลงไป

**ถ้าไม่ทำข้อนี้เลยก็ได้** — แอปใช้งานได้ปกติทุกอย่างยกเว้นปุ่มสแกน OCR
กับปุ่มแปลงไฟล์รูปภาพ/PDF จาก Drive ด้วย AI จะแสดงข้อความภาษาไทยว่า
ยังไม่ได้ตั้งค่าคีย์ (ไฟล์ JSON มาตรฐานนำเข้าได้โดยไม่ต้องใช้ AI เหมือนเดิม)

## 5. ตรวจหลัง deploy (ทำทุกครั้งหลัง deploy รอบแรก)

เปิด `https://it-sccb.github.io/my-triton/` แล้วเช็กทีละข้อ:

- [ ] หน้าโหลดขึ้น ไม่มีหน้าขาว/ข้อความ error — เห็นรูปไทรทัน เลขไมล์ 233,850 กม.
- [ ] **แบบไม่ล็อกอิน:** กดเพิ่มรายการเติมน้ำมัน 1 รายการ → รีเฟรชหน้า →
      รายการยังอยู่ (ข้อมูลอยู่ใน localStorage ของเบราว์เซอร์เครื่องนี้)
- [ ] **ล็อกอิน Google:** กดปุ่มล็อกอิน → เลือกบัญชี Google → กลับมาหน้าแอป
      สถานะขึ้นว่าเชื่อมต่อแล้ว → เพิ่ม/แก้/ลบข้อมูล 1 รายการ → เปิด
      Firebase console → Firestore → `users/{uid}/vehicles/ouanpee-triton-2012`
      ต้องเห็นข้อมูลที่เพิ่งแก้
- [ ] **OCR (ถ้าตั้งค่าคีย์แล้ว):** เปิดหน้าสแกนใบเสร็จ เลือกรูปใบเสร็จ →
      กดวิเคราะห์ → ได้ตัวเลขมาเติมในฟอร์ม (ถ้ายังไม่ตั้งค่าคีย์ ต้องขึ้นข้อความ
      ภาษาไทยว่ายังไม่ได้ตั้งค่าคีย์ แทนที่จะพัง)
- [ ] **ซิงค์ Sheets (ถ้ามี):** เปิดหน้าซิงค์ Google Sheets วาง URL GAS →
      ดึงข้อมูลลงเครื่องได้เหมือนเดิม

## 6. ถ้าล็อกอิน Google บน Pages ไม่ได้

| อาการ | สาเหตุที่น่าจะใช่ | วิธีแก้ |
|---|---|---|
| ขึ้น `auth/unauthorized-domain` | ยังไม่ได้เพิ่มโดเมนในข้อ 3 | ทำข้อ 3 แล้วรอ 1–2 นาที ลองใหม่ |
| ป๊อปอัปล็อกอินไม่ขึ้น / โดนบล็อก | เบราว์เซอร์บล็อกป๊อปอัป | อนุญาตป๊อปอัปสำหรับ `it-sccb.github.io` แล้วกดล็อกอินใหม่ |
| ขึ้น `Missing or insufficient permissions` | Firestore rules ยังไม่ตรงกับ repo หรือบัญชี Google ยังไม่ยืนยันอีเมล | ทำข้อ 2 (deploy rules) และยืนยันอีเมลของบัญชี Google ที่ใช้ล็อกอิน |
| ล็อกอินได้แต่ข้อมูลไม่ซิงค์ (ขึ้นว่าเชื่อมต่อไม่ได้) | โควตา Firestore ฟรีรายวันเต็ม หรือ rules ไม่อนุญาต | ดูข้อความ error บนหน้าแอป — ถ้าบอกว่าโควตาเต็มให้รอวันถัดไป |

## ไฟล์ที่แก้/เพิ่มในรอบนี้

| ไฟล์ | ทำอะไร |
|---|---|
| `src/utils/serverApi.ts` (ใหม่) | ตัวกลางเรียก `/api/*` — โหมด Pages จะโยน error ทันทีโดยไม่ยิงเครือข่าย เพื่อให้ทุกปุ่ม fallback ไปบันทึก local เอง |
| `src/services/geminiClient.ts` (ใหม่) | เรียก Gemini ตรงจากเบราว์เซอร์สำหรับ OCR และแปลงไฟล์ Drive (แทน `/api/ocr`, `/api/drive-parse`) อ่านคีย์จาก `VITE_GEMINI_API_KEY` เท่านั้น |
| `vite.config.ts` | build สำหรับ Pages ใช้ base `/my-triton/` (เมื่อตั้ง `VITE_PAGES_BUILD=true`) โหมดอื่นใช้ `/` เหมือนเดิม |
| `src/data/seedData.ts` | รูปรถ import ผ่าน Vite (ได้ path ถูกต้องตาม base) + helper แปลง path รูปเก่าที่ค้างในข้อมูลเดิม |
| `src/services/firestoreSync.ts` | ใช้ URL รูปรถตัวใหม่เป็นค่าเริ่มต้น และแปลง path รูปเก่าตอนอ่านจาก Firestore |
| `src/App.tsx` | ทุกคำสั่ง `/api/*` ผ่าน `apiFetch` (ล้มแล้วบันทึก local ต่อได้), นำเข้าข้อมูล Sheets แปลงฝั่ง client, normalize รูปรถตอนโหลด/บันทึก |
| `src/components/OcrScannerModal.tsx` | สแกน OCR ผ่าน Gemini ฝั่ง client; ไม่มีคีย์แสดงข้อความภาษาไทยแทนการพัง |
| `src/components/GoogleDriveModal.tsx` | แปลงไฟล์ด้วย Gemini ฝั่ง client; ไฟล์ JSON ยัง parse ในเครื่องได้โดยไม่ใช้ AI |
| `package.json` | `esbuild` 0.25.0 → 0.28.0 (vite 8.3.8 ต้องการ — เดิม `npm install` ติด dependency conflict) + `package-lock.json` ที่สร้างใหม่สำหรับ `npm ci` |
| `.github/workflows/deploy-pages.yml` (ใหม่) | Build + deploy ขึ้น GitHub Pages อัตโนมัติทุกครั้งที่ push ขึ้น `main` |
| `DEPLOY_STEPS.md` (ไฟล์นี้) | ขั้นตอน deploy และตรวจรับ |

## สิ่งที่ยังไม่ได้ยืนยัน (ต้องตรวจบนโดเมนจริงหลัง deploy)

- ล็อกอิน Google จาก `it-sccb.github.io` ได้จริง (ต้องทำข้อ 3 ก่อน)
- Firestore rules ใน `firestore.rules` ถูก deploy ลงโปรเจกต์จริงแล้ว (ข้อ 2)
- OCR ด้วยคีย์จริง (ต้องทำข้อ 4 ก่อน แล้วเทสด้วยรูปใบเสร็จจริง)
- การซิงค์ Firestore แบบ realtime บนโดเมน Pages (เทสตามข้อ 5)
