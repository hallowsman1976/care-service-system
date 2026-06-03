# LTC Dependence System

> ระบบรายงานการดูแลผู้สูงอายุที่มีภาวะพึ่งพิง
> รพ.สต.บ้านทรายไหลแล้ง · จังหวัดมุกดาหาร

Mobile-first web app สำหรับ Care Giver, Case Manager และ Admin บันทึก/ติดตามการเยี่ยมบ้านผู้สูงอายุที่มีภาวะพึ่งพิง พร้อมการประเมินมาตรฐาน ADL Barthel Index, 2Q/9Q/8Q สุขภาพจิต และ Risk Tracking อัตโนมัติ

---

## ✨ Features

- 🩺 **Care Giver** — บันทึกการเยี่ยมแบบ Stepper Wizard 10 ขั้น (BMI, สัญญาณชีพ, ADL, สุขภาพจิต, กิจกรรมการดูแล, ภาพถ่าย, GPS)
- 🗂 **Case Manager** — ติดตามเคสเสี่ยง · QA review · escalate/resolve
- ⚙ **Admin** — Dashboard KPI · จัดการผู้ใช้ · ทะเบียนผู้สูงอายุ · Export
- 🇹🇭 ภาษาไทยทั้งระบบ + ฟอนต์ Mitr
- 📱 Mobile-first design (440px phone shell)
- 🔒 Session-based auth + audit log ทุกการเปลี่ยนแปลง
- 🌏 GPS + Leaflet map สำหรับพิกัดบ้าน
- 📸 อัปโหลดรูปเข้า Google Drive

---

## 🛠 Tech Stack

| Layer | ใช้ |
|---|---|
| **Frontend** | React 18 (UMD) + Babel standalone (in-browser JSX transform) |
| **Styling** | Tailwind CSS Play CDN + custom theme |
| **Map** | Leaflet 1.9.4 + OpenStreetMap |
| **Alerts** | SweetAlert2 v11 |
| **Backend** | Google Apps Script (V8 runtime) — RPC over `fetch` |
| **Database** | Google Sheets (20 tabs) |
| **File storage** | Google Drive |
| **Hosting** | GitHub Pages (frontend) + Apps Script Web App (backend) |

---

## 🚀 Quick Start

### 1. Demo mode (mock data, ไม่ต้องมี backend)

```bash
# Clone หรือ download repo
git clone https://github.com/<yourname>/ltc-dependence-system.git
cd ltc-dependence-system

# เปิดด้วย web server local (จำเป็นเพราะ Babel ต้องการ HTTP ไม่ใช่ file://)
npx serve -l 5173 .
# หรือ python -m http.server 5173

# เปิด http://localhost:5173/
```

Login ด้วย username/password อะไรก็ได้ — ระบบใช้ mock data ในไฟล์ `bundle.jsx`

### 2. Production mode (real backend)

ดูคู่มือ **[docs/install-github.md](docs/install-github.md)** — สอนตั้งแต่:
- สร้าง GitHub repo + push code
- เปิด GitHub Pages
- สร้าง Google Sheet + Apps Script
- รัน `setupAll()` สร้าง schema + seed data
- Deploy Web App + connect frontend → backend

ใช้เวลา ~30 นาที สำหรับติดตั้งครั้งแรก

---

## 📂 Project Structure

```
ltc-dependence-system/
├── index.html               ← entry point
├── bundle.jsx               ← Frontend ทั้งหมด (รวม 9 modules · 3,440 บรรทัด)
├── assets/                  ← logo + รูปต่างๆ
│
├── database/                ← Google Apps Script backend
│   ├── Code.gs              ← รวม 7 modules (Config/Setup/Users/Patients/Visits/Cases/API)
│   ├── *.gs                 ← modules แยกไฟล์ (สำหรับแก้ง่าย — เลือกใช้แบบใดแบบหนึ่ง)
│   ├── appsscript.json      ← manifest (timezone, scopes)
│   └── README.md            ← schema docs + RPC reference
│
├── docs/                    ← คู่มือผู้ใช้
│   ├── install-github.md    ← 🌟 คู่มือติดตั้งบน GitHub
│   ├── manual-care-giver.md
│   ├── manual-case-manager.md
│   └── manual-admin.md
│
└── design-extract/          ← Original Claude Design bundle (backup, ลบได้)
```

---

## 🔑 Default Credentials

หลังรัน `setupAll()` ใน Apps Script จะมี seed users — **password เริ่มต้นทั้งหมด = `1234`**

| Username | Role |
|---|---|
| `admin` | Admin |
| `casemanager` | Case Manager |
| `caregiver01` ... `caregiver19` | Care Giver |

⚠️ **เปลี่ยนรหัสผ่านทันทีก่อนใช้งานจริง**

---

## 📊 Healthcare Standards

ระบบใช้เกณฑ์มาตรฐานของ **กรมการแพทย์** และ **กรมสุขภาพจิต** กระทรวงสาธารณสุข:

| เครื่องมือ | จำนวนข้อ | ใช้ทำอะไร |
|---|---|---|
| **BMI** | 2 (น้ำหนัก/ส่วนสูง) | แบ่ง 5 ระดับ (ผอม → อ้วนมาก) |
| **ADL Barthel Index** | 10 | แบ่ง 3 กลุ่ม (ติดเตียง / ติดบ้าน / ติดสังคม) |
| **2Q** | 2 | คัดกรองภาวะซึมเศร้าเบื้องต้น |
| **9Q (PHQ-9)** | 9 | ระดับภาวะซึมเศร้า (0-27) |
| **8Q** | 8 (weighted) | แนวโน้มฆ่าตัวตาย (ตามน้ำหนักคะแนน) |

**Risk derivation** อัตโนมัติฝั่ง server:
- `เสี่ยงสูง` ← 8Q > 0 หรือ 9Q ข้อ 9 > 0 → เปิด **case ติดตามอัตโนมัติ**
- `เฝ้าระวัง` ← 9Q ≥ 7 หรือ ADL ≤ 4
- `ปกติ` ← otherwise

---

## 🤝 Roles & Permissions

| Action | Care Giver | Case Manager | Admin |
|---|:---:|:---:|:---:|
| ดูเคสในความดูแล | ✓ (เฉพาะที่ assigned) | ✓ (ทุกเคส) | ✓ |
| บันทึกการเยี่ยม | ✓ | ✓ | ✓ |
| Comment ใน thread | ✓ | ✓ | ✓ |
| Escalate / Resolve case | ✗ | ✓ | ✓ |
| QA Review | ✗ | ✓ | ✓ |
| Dashboard + Export | ✗ | ✗ | ✓ |
| จัดการ User | ✗ | ✗ | ✓ |
| ทะเบียนผู้สูงอายุ | ✗ | ✗ | ✓ |

---

## 📜 License

(ระบุ license ที่ต้องการ — เช่น MIT, Apache 2.0, หรือ Proprietary)

---

## 📞 ติดต่อ

(ใส่ข้อมูลทีมพัฒนา หรือ contact)

---

**Version 1.0.0** · พัฒนาเพื่อการดูแลในชุมชน · 2569
