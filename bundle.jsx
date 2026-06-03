/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LTC Dependence System — Frontend Bundle (React + Babel standalone)
 *  รพ.สต.บ้านทรายไหลแล้ง · จังหวัดมุกดาหาร
 *
 *  ไฟล์รวมจากโมดูล JSX 9 ไฟล์ (data → shared → screens → dashboard →
 *    admin-mgmt → case-manager → form-sections → form → app)
 *  ใช้ comment block แบ่ง 9 section ตามไฟล์ต้นทาง
 *
 *  Stack: React 18 (UMD) + Babel standalone (in-browser JSX transform)
 *         + Tailwind Play CDN + Leaflet 1.9.4 + SweetAlert2 v11
 *
 *  Load order matters — each file relies on globals exposed by prior ones via
 *  `Object.assign(window, {...})` at file end.
 *
 *  วิธีใช้:
 *    เปลี่ยน index.html ให้โหลดไฟล์เดียวแทน 9 ไฟล์:
 *      <script type="text/babel" data-presets="env,react" src="bundle.jsx"></script>
 *
 *  Version: 1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 */


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 0 · api.jsx                                                  ║
   ║  Backend RPC client for the Google Apps Script Web App.               ║
   ║  • Live mode  : POST {fn,args,token} as text/plain (no CORS preflight)║
   ║                 to the configured Web App URL; returns Result<T>      ║
   ║  • Mock mode  : when no URL is configured, resolves with the in-file  ║
   ║                 mock data so the prototype runs fully offline.        ║
   ║  Configure the URL at runtime via the Admin → ตั้งค่าระบบ screen, or   ║
   ║  window.LTC_API_URL, or localStorage key "ltc_api_url".               ║
   ║  Exposes: LTC_API                                                     ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */

const LTC_API = (() => {
  const LS_URL   = "ltc_api_url";
  const LS_USER  = "ltc_user";
  const LS_TOKEN = "ltc_token";

  // Deployed Google Apps Script Web App — the system is LIVE by default.
  // Contract (matches database/*.gs):
  //   • doGet  → health check only  { ok, service, version, time }
  //   • doPost → RPC router. Body = { fn, args, token } sent as text/plain
  //              (no CORS preflight). Each fn returns its own { ok, ... } object.
  //   • Public fn: login. All others require a session token from login(),
  //              and the server injects the resolved caller as the 1st arg.
  const DEFAULT_URL = "https://script.google.com/macros/s/AKfycbwAEJGrYFgQ2z3whJzkPleZUjqqeSnZP3iqt_NqqrunTPS3jRAz-9ZuHpkrlseSb9kC/exec";

  const ls = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
  };

  const getBaseUrl = () => ((typeof window !== "undefined" && window.LTC_API_URL) || ls.get(LS_URL) || DEFAULT_URL).trim();
  const setBaseUrl = (url) => ls.set(LS_URL, (url || "").trim());
  const isLive     = () => !!getBaseUrl();

  // Logged-in user + session token, persisted across reloads.
  const getUser  = () => { try { return JSON.parse(ls.get(LS_USER) || "null"); } catch (e) { return null; } };
  const setUser  = (u) => ls.set(LS_USER, u ? JSON.stringify(u) : "");
  const getToken = () => ls.get(LS_TOKEN);
  const setToken = (t) => ls.set(LS_TOKEN, t || "");

  async function parseJson_(res) {
    try { return await res.json(); }
    catch (e) { throw new Error("ระบบหลังบ้านตอบกลับไม่ถูกต้อง (ไม่ใช่ JSON)"); }
  }

  // Core RPC — POST { fn, args, token } as text/plain (no CORS preflight) → { ok, ... }
  // `args` is the positional argument list; the server injects the resolved caller
  // as the first argument for authed functions, so callers pass only the trailing args.
  async function rpc(fn, args, opts) {
    const url = getBaseUrl();
    if (!url) throw new Error("ยังไม่ได้ตั้งค่า URL ของระบบหลังบ้าน");
    const body = { fn, args: args || [] };
    const tok = (opts && "token" in opts) ? opts.token : getToken();
    if (tok) body.token = tok;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });
    const data = await parseJson_(res);
    if (!data || data.ok === false) {
      const msg = (data && data.message) || "การเชื่อมต่อระบบหลังบ้านล้มเหลว";
      if (/session|เข้าสู่ระบบ|หมดอายุ/i.test(msg)) setToken("");   // force re-login
      throw new Error(msg);
    }
    return data;
  }

  // Backend role string → app role id used by the router.
  function mapRole(r) {
    const s = String(r || "").toLowerCase();
    if (s.indexOf("admin") >= 0) return "admin";
    if (s.indexOf("case") >= 0 || s.indexOf("manager") >= 0) return "case_manager";
    if (s.indexOf("care") >= 0 || s.indexOf("giver") >= 0 || s.indexOf("cg") >= 0) return "caregiver";
    return s || "caregiver";
  }

  // Birthdate is stored with a Buddhist-era year (e.g. 2487 = พ.ศ.) → age in years.
  function ageFromBirthdate(iso) {
    if (!iso) return null;
    const y = new Date(iso).getFullYear();
    if (!y || isNaN(y)) return null;
    const nowBE = new Date().getFullYear() + 543;
    const birthBE = y > 2400 ? y : y + 543;   // tolerate CE-stored dates too
    const age = nowBE - birthBE;
    return (age >= 0 && age < 130) ? age : null;
  }

  // ── Reference / lookup maps (village labels + caregiver staff names) ───────
  // Cached after first login; cleared on logout or when patients change.
  let _mapsPromise = null;
  function clearMaps_() { _mapsPromise = null; }
  async function getMaps_() {
    if (_mapsPromise) return _mapsPromise;
    _mapsPromise = (async () => {
      const maps = { villages: {}, villageMoo: {}, relations: {}, caregivers: {} };
      try {
        const ref = await rpc("getReferenceData", []);
        const data = (ref && ref.data) || {};
        (data.villages || []).forEach(v => {
          const id = v.VillageID != null ? v.VillageID : v.id;
          if (id == null || id === "") return;
          maps.villageMoo[id] = v.MooNumber;
          maps.villages[id] = (v.MooNumber != null && v.MooNumber !== "")
            ? ("หมู่ " + v.MooNumber + (v.VillageName ? " " + v.VillageName : ""))
            : (v.VillageName || String(id));
        });
        (data.relations || []).forEach(r => {
          const id = r.RelationID != null ? r.RelationID : r.id;
          if (id != null) maps.relations[id] = r.RelationName || r.name || String(id);
        });
      } catch (e) { /* reference data is best-effort */ }
      try {
        const us = await rpc("listUsers", []);   // admin-only; ignored otherwise
        (us.users || []).forEach(u => {
          if (String(u.Role) === "caregiver") maps.caregivers[u.UserID] = u.FullName || u.UserID;
        });
      } catch (e) { /* non-admin: caregiver names stay as UserIDs */ }
      return maps;
    })();
    return _mapsPromise;
  }

  // Map a backend patient row (database/Patients.gs schema) into the UI shape.
  function normalizePatient(r, maps) {
    if (!r) return r;
    maps = maps || {};
    const vid   = r.VillageID;
    const cgId  = r.AssignedCaregiverUserID;
    const birth = r.BirthDate || "";
    return {
      pid: String(r.PID != null ? r.PID : ""),
      patient_id: String(r.PID != null ? r.PID : ""),   // backend keys patients by PID
      name: r.FullName || "—",
      age: (r.Age !== "" && r.Age != null) ? Number(r.Age) : ageFromBirthdate(birth),
      sex: r.Sex || "",
      village: (maps.villages && maps.villages[vid]) || (vid ? String(vid) : ""),
      village_id: vid != null ? vid : "",
      moo: (maps.villageMoo && maps.villageMoo[vid] != null) ? maps.villageMoo[vid] : undefined,
      address: r.Address != null ? String(r.Address) : "",
      caregiver_at_home: r.HouseholdCaregiverName || "",
      relation: r.HouseholdRelationID || "",
      contact: r.HouseholdContact || "",
      adl_group: r.ADLGroup || null,
      risk: r.RiskLevel || null,
      last_visit: r.LastVisitDate || "—",
      visit_count: Number(r.VisitCount) || 0,
      assigned_cg: (maps.caregivers && maps.caregivers[cgId]) || (cgId ? String(cgId) : ""),
      assigned_cg_id: cgId != null ? cgId : "",
      distance_km: null,
      due_today: false, visited_today: false,
      profileImageUrl: r.ProfileImageUrl || r.profileImageUrl || "",
      birthdateBE: birth || null,
      lat: (r.Lat !== "" && r.Lat != null && !isNaN(+r.Lat)) ? +r.Lat : null,
      lng: (r.Lng !== "" && r.Lng != null && !isNaN(+r.Lng)) ? +r.Lng : null,
      _raw: r
    };
  }

  // Map a backend visit row → the flat shape VisitRow/dashboard expect.
  // ctx = { patients: {pid->{name,village}}, caregivers: {userId->name} }
  function normalizeVisit(r, ctx) {
    if (!r) return r; ctx = ctx || {};
    const pid = String(r.PID != null ? r.PID : "");
    const p = (ctx.patients && ctx.patients[pid]) || {};
    const date = String(r.VisitDate || "").slice(0, 10);
    const num = (x) => (x === "" || x == null || isNaN(+x)) ? 0 : +x;
    return {
      id: r.VisitID || "",
      pid,
      date: date.length === 10 ? date.slice(5).replace("-", "/") + "/" + date.slice(0, 4).slice(2) : (date || "—"),
      raw_date: date,
      name: p.name || pid || "—",
      village: p.village || "",
      cg: (ctx.caregivers && ctx.caregivers[r.CaregiverUserID]) || r.CaregiverUserID || "",
      adl: num(r.ADLTotal),
      q9: num(r.NineQTotal),
      q8: num(r.EightQTotal),
      risk: r.RiskLevel || "ปกติ",
      _raw: r
    };
  }

  // ── High-level operations ─────────────────────────────────────────────────
  // login is the only PUBLIC fn → call with token:"" so no stale token is sent.
  async function login(username, password) {
    const r = await rpc("login", [username, password], { token: "" });
    setToken(r.token || "");
    clearMaps_();
    const u = r.user || {};
    const role = mapRole(u.Role);
    const merged = {
      id: u.UserID, user_id: u.UserID, username: u.Username,
      name: u.FullName, role,
      initials: u.Initials || "", village_id: u.VillageID || "", phone: u.Phone || ""
    };
    setUser(merged);
    return { ok: true, user: merged, role };
  }

  // Patients — server scopes by role (caregivers see only their own).
  async function listPatients(opts) {
    const out = await rpc("listPatients", [opts || {}]);
    const maps = await getMaps_();
    return (Array.isArray(out.patients) ? out.patients : []).map(r => normalizePatient(r, maps));
  }

  // Reference + user directory
  async function getReferenceData() { const r = await rpc("getReferenceData", []); return (r && r.data) || {}; }
  async function listCaregivers() { const m = await getMaps_(); return Object.keys(m.caregivers).map(id => ({ id, name: m.caregivers[id] })); }
  async function listUsers() { const r = await rpc("listUsers", []); return r.users || []; }
  async function createUser(payload) { return await rpc("createUser", [payload]); }
  async function updateUser(userId, patch) { return await rpc("updateUser", [userId, patch]); }
  async function resetPassword(userId, newPassword) { return await rpc("resetPassword", [userId, newPassword]); }

  // Patient registry (admin). updatePatient(pid, patch); delete = soft (Active:false).
  async function createPatient(payload) { const r = await rpc("createPatient", [payload]); clearMaps_(); return r; }
  async function updatePatient(pid, patch) { return await rpc("updatePatient", [pid, patch]); }
  async function deletePatient(pid) { return await rpc("updatePatient", [pid, { Active: false }]); }
  async function assignCaregiver(pid, caregiverUserId) { const r = await rpc("assignCaregiver", [pid, caregiverUserId]); return r; }

  // Visits + cases
  async function submitVisit(payload) { return await rpc("submitVisit", [payload]); }
  async function listVisits(opts) { const r = await rpc("listVisits", [opts || {}]); return r.visits || []; }
  async function getVisit(visitId) { return await rpc("getVisit", [visitId]); }
  async function getVisitsLast14Days() { const r = await rpc("getVisitsLast14Days", []); return r.buckets || []; }
  async function listCases(opts) { const r = await rpc("listCases", [opts || {}]); return r.cases || []; }

  // The backend has no settings endpoint — expose reference data for read,
  // and treat save as unsupported (kept for API-shape compatibility).
  async function getSettings() { try { return await getReferenceData(); } catch (e) { return {}; } }
  async function saveSettings() { throw new Error("ระบบหลังบ้านนี้ยังไม่รองรับการบันทึกการตั้งค่า"); }

  // Connectivity check — GET → health JSON { ok, service, version, time }
  async function ping() {
    const url = getBaseUrl();
    if (!url) throw new Error("ยังไม่ได้ตั้งค่า URL");
    const res = await fetch(url, { method: "GET" });
    const data = await parseJson_(res);
    if (!data || data.ok === false) throw new Error((data && data.message) || "ตอบกลับไม่ถูกต้อง");
    return { ok: true, service: data.service || "LTC Dependence", version: data.version || "live", message: "pong" };
  }

  function logout() { setToken(""); setUser(null); clearMaps_(); }

  return {
    rpc, login, listPatients, getReferenceData, listCaregivers, listUsers,
    createUser, updateUser, resetPassword,
    createPatient, updatePatient, deletePatient, assignCaregiver,
    submitVisit, listVisits, getVisit, getVisitsLast14Days, listCases,
    getSettings, saveSettings, ping, logout,
    getBaseUrl, setBaseUrl, getUser, setUser, getToken, setToken, isLive, normalizePatient, normalizeVisit,
    DEFAULT_URL
  };
})();

if (typeof window !== "undefined") Object.assign(window, { LTC_API });


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 1 · data.jsx                                                 ║
   ║  Mock data + Thai-language reference tables + scoring rubrics         ║
   ║  Exposes: CURRENT_USER, ALL_ROLES, PATIENTS, RELATIONS, CAREGIVERS,   ║
   ║   VISITS, VISITS_14D, ADL_ITEMS, TWO_Q, NINE_Q, NINE_Q_OPTS, EIGHT_Q, ║
   ║   DAILY_CARE, HEALTH_CARE, OTHER_CARE,                                ║
   ║   interpretADL, interpretBMI, interpret9Q, interpret8Q,               ║
   ║   thaiDateString, thaiTimeString                                      ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */

// Current login (Care Giver) — name/user_id are filled from the backend on login.
const CURRENT_USER = {
  user_id: "",
  name: "เจ้าหน้าที่",
  role: "Care Giver",
  village: "—",
  phone: "—",
  initials: ""
};

const ALL_ROLES = [
  { id: "caregiver",    label: "Care Giver",   sub: "บันทึกการเยี่ยมรายเคส", icon: "🩺" },
  { id: "case_manager", label: "Case Manager", sub: "ติดตามเคสเสี่ยง · QA", icon: "🗂" },
  { id: "admin",        label: "Admin",        sub: "Dashboard · จัดการระบบ", icon: "⚙︎" }
];

// Patient roster — loaded live from the backend (LTC_API.listPatients()).
// No mock seed: every screen fetches the real roster.
const PATIENTS = [];

const RELATIONS = ["พ่อ", "แม่", "บุตร", "พี่", "น้อง", "หลาน", "ญาติ", "อื่น ๆ"];

// ─── ADL Barthel (10 items) ─────────────────────────────────────────────────
const ADL_ITEMS = [
  {
    n: 1, title: "รับประทานอาหาร",
    options: [
      { v: 0, label: "ไม่สามารถตักอาหารเข้าปากได้ ต้องมีคนป้อน" },
      { v: 1, label: "ตักอาหารเองได้ แต่ต้องมีคนช่วย เช่น หั่นเป็นชิ้นเล็ก ๆ" },
      { v: 2, label: "ตักอาหารและช่วยตัวเองได้ปกติ" }
    ]
  },
  {
    n: 2, title: "ล้างหน้า หวีผม แปรงฟัน โกนหนวด",
    options: [
      { v: 0, label: "ต้องการความช่วยเหลือ" },
      { v: 1, label: "ทำได้เอง (รวมการใช้อุปกรณ์)" }
    ]
  },
  {
    n: 3, title: "ลุกนั่งจากที่นอน/เตียง ไปยังเก้าอี้",
    options: [
      { v: 0, label: "ไม่สามารถนั่งทรงตัวได้" },
      { v: 1, label: "ต้องใช้คน 2 คนช่วยพยุง" },
      { v: 2, label: "ใช้คน 1 คนช่วยพยุงและบอกวิธี" },
      { v: 3, label: "ทำได้เอง" }
    ]
  },
  {
    n: 4, title: "การใช้ห้องน้ำ",
    options: [
      { v: 0, label: "ช่วยตัวเองไม่ได้" },
      { v: 1, label: "ทำได้เองบ้าง" },
      { v: 2, label: "ทำได้เองอย่างปกติ" }
    ]
  },
  {
    n: 5, title: "การเคลื่อนที่ภายในห้อง/บ้าน",
    options: [
      { v: 0, label: "เคลื่อนที่ไม่ได้" },
      { v: 1, label: "ต้องใช้รถเข็นและช่วยจัดล้อ" },
      { v: 2, label: "เดินหรือเคลื่อนได้ โดยมีคนช่วย" },
      { v: 3, label: "เดิน/เคลื่อนได้เอง" }
    ]
  },
  {
    n: 6, title: "การสวมใส่เสื้อผ้า",
    options: [
      { v: 0, label: "ต้องมีคนแต่งตัวให้" },
      { v: 1, label: "ทำได้ครึ่งหนึ่ง ต้องมีคนช่วย" },
      { v: 2, label: "ทำได้เอง" }
    ]
  },
  {
    n: 7, title: "การขึ้นลงบันได 1 ชั้น",
    options: [
      { v: 0, label: "ไม่สามารถทำได้" },
      { v: 1, label: "ต้องมีคนช่วย" },
      { v: 2, label: "ทำได้เอง" }
    ]
  },
  {
    n: 8, title: "การอาบน้ำ",
    options: [
      { v: 0, label: "ต้องมีคนช่วย" },
      { v: 1, label: "อาบเองได้" }
    ]
  },
  {
    n: 9, title: "การกลั้นอุจจาระ",
    options: [
      { v: 0, label: "กลั้นไม่ได้" },
      { v: 1, label: "กลั้นไม่ได้บางครั้ง (เดือนละ ≥ 1)" },
      { v: 2, label: "กลั้นได้เป็นปกติ" }
    ]
  },
  {
    n: 10, title: "การกลั้นปัสสาวะ",
    options: [
      { v: 0, label: "กลั้นไม่ได้" },
      { v: 1, label: "กลั้นไม่ได้บางครั้ง" },
      { v: 2, label: "กลั้นได้เป็นปกติ" }
    ]
  }
];

// Interpret ADL total
function interpretADL(total) {
  if (total <= 4)   return { label: "ติดเตียง",   tone: "danger",  sub: "พึ่งพิงทั้งหมด" };
  if (total <= 11)  return { label: "ติดบ้าน",    tone: "warning", sub: "พึ่งพิงปานกลาง" };
  return              { label: "ติดสังคม",  tone: "ok",      sub: "ช่วยเหลือตนเองได้" };
}

// ─── 2Q ─────────────────────────────────────────────────────────────────────
const TWO_Q = [
  "ใน 2 สัปดาห์ที่ผ่านมา รู้สึกหดหู่ เศร้า ท้อแท้ สิ้นหวัง",
  "ใน 2 สัปดาห์ที่ผ่านมา รู้สึกเบื่อ ไม่อยากทำอะไร"
];

// ─── 9Q ─────────────────────────────────────────────────────────────────────
const NINE_Q = [
  "เบื่อ ไม่สนใจอยากทำอะไร",
  "ไม่สบายใจ ซึมเศร้า ท้อแท้",
  "หลับยาก หรือหลับ ๆ ตื่น ๆ หรือหลับมากเกินไป",
  "เหนื่อยง่าย หรือไม่ค่อยมีแรง",
  "เบื่ออาหาร หรือกินมากเกินไป",
  "รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลว",
  "สมาธิไม่ดี เวลาทำอะไร เช่น ดูทีวี ฟังวิทยุ ทำงาน",
  "พูดช้า ทำอะไรช้าจนคนอื่นสังเกตเห็น หรือกระสับกระส่ายไม่เหมือนเดิม",
  "คิดทำร้ายตนเอง หรือคิดว่าตายไปจะดีกว่า"
];
const NINE_Q_OPTS = [
  { v: 0, label: "ไม่มีเลย" },
  { v: 1, label: "เป็นบางวัน" },
  { v: 2, label: "เป็นบ่อย" },
  { v: 3, label: "เป็นทุกวัน" }
];
function interpret9Q(total) {
  if (total <= 6)   return { label: "ไม่มีภาวะซึมเศร้า",      tone: "ok" };
  if (total <= 12)  return { label: "ซึมเศร้าระดับน้อย",       tone: "warning" };
  if (total <= 18)  return { label: "ซึมเศร้าระดับปานกลาง",    tone: "warning" };
  return              { label: "ซึมเศร้าระดับรุนแรง",     tone: "danger" };
}

// ─── 8Q (suicide risk) — score weights from spec ────────────────────────────
const EIGHT_Q = [
  { n: 1, text: "คิดอยากตาย หรือคิดว่าตายไปจะดีกว่า",        yes: 1  },
  { n: 2, text: "อยากทำร้ายตัวเอง",                            yes: 2  },
  { n: 3, text: "คิดเกี่ยวกับการฆ่าตัวตาย",                    yes: 6, followUp: "ควบคุมความอยากฆ่าตัวตายได้หรือไม่" },
  { n: 4, text: "มีแผนการที่จะฆ่าตัวตาย",                      yes: 8  },
  { n: 5, text: "เตรียมการทำร้ายตนเอง/ฆ่าตัวตาย",              yes: 9  },
  { n: 6, text: "ทำให้ตนเองบาดเจ็บ แต่ไม่ตั้งใจเสียชีวิต",     yes: 4  },
  { n: 7, text: "พยายามฆ่าตัวตาย โดยตั้งใจให้ตาย",             yes: 10 },
  { n: 8, text: "ตลอดชีวิตที่ผ่านมา เคยพยายามฆ่าตัวตาย",       yes: 4  }
];
function interpret8Q(total) {
  if (total === 0)  return { label: "ไม่มีแนวโน้มฆ่าตัวตายในปัจจุบัน", tone: "ok" };
  if (total <= 8)   return { label: "แนวโน้มระดับน้อย",                 tone: "warning" };
  if (total <= 16)  return { label: "แนวโน้มระดับปานกลาง",              tone: "warning" };
  return              { label: "แนวโน้มระดับรุนแรง",                tone: "danger" };
}

function interpretBMI(bmi) {
  if (!bmi || isNaN(bmi)) return { label: "—", tone: "neutral" };
  if (bmi < 18.5)  return { label: "ผอม / น้ำหนักน้อย", tone: "warning" };
  if (bmi < 23)    return { label: "สมส่วน",            tone: "ok" };
  if (bmi < 25)    return { label: "ท้วม / น้ำหนักเกิน", tone: "warning" };
  if (bmi < 30)    return { label: "อ้วน",              tone: "warning" };
  return              { label: "อ้วนมาก",         tone: "danger" };
}

// ─── Care-activity checklists ────────────────────────────────────────────────
const DAILY_CARE = [
  "การเปลี่ยนผ้าอ้อม / แผ่นรองซับ",
  "การพลิกตะแคงตัว",
  "จัดท่านอนป้องกันแผลกดทับ / ป้องกันเท้าตก",
  "การเคลื่อนย้ายผู้สูงอายุบนเตียง / ที่นอน",
  "ช่วยเคลื่อนย้ายจากจุดหนึ่งไปยังอีกจุดหนึ่ง"
];
const HEALTH_CARE = [
  "ประเมินภาวะซึมเศร้า",
  "ประเมินสัญญาณชีพ",
  "ทำแผล",
  "ดูแลสายสวนต่าง ๆ ให้สะอาดและอยู่ในตำแหน่งที่เหมาะสม",
  "นวดผ่อนคลายกล้ามเนื้อ / กระตุ้นระบบไหลเวียน",
  "บริหารข้อและกล้ามเนื้อ",
  "ฝึกทรงตัว / ฝึกเดิน",
  "สมาธิบำบัด",
  "ฝึกหายใจ"
];
const OTHER_CARE = [
  "ดูแลที่อยู่อาศัยให้สะอาด ปลอดภัย อากาศถ่ายเท",
  "ให้คำปรึกษาด้านสุขภาพแก่ผู้สูงอายุ",
  "ให้คำปรึกษาด้านสุขภาพแก่ครอบครัว / ผู้ดูแล",
  "อ่านหนังสือ / บทสวดมนต์ / เอกสารให้ผู้สูงอายุฟัง",
  "พาไปพบแพทย์ / บุคลากรสาธารณสุขตามนัด",
  "จัดพาหนะรับ-ส่งผู้สูงอายุ",
  "ช่วยบุคลากรสาธารณสุขในการทำหัตถการ",
  "ประสานการเบิกจ่ายวัสดุอุปกรณ์การแพทย์จาก รพ./รพ.สต.",
  "ประสานบุคลากรสาธารณสุขกรณีฉุกเฉิน"
];

// ─── Admin: Care Givers + recent Visits log ──────────────────────────
// The backend has no caregivers endpoint — Care Givers are derived from the
// free-text caregiverName on each patient row (see AssignScreen).
const CAREGIVERS = [];

// Visit history — the backend currently exposes only createVisit (write); there
// is no list endpoint yet, so visit-derived views show honest empty states.
const VISITS = [];

// 14-day visit volume — for sparkline / bar chart (empty until a visits feed exists)
const VISITS_14D = [];

// ─── Thai date utilities ────────────────────────────────────────────────────
function thaiDateString(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}
function thaiTimeString(d = new Date()) {
  return d.toTimeString().slice(0, 5);
}

// expose
Object.assign(window, {
  CURRENT_USER, ALL_ROLES, PATIENTS, RELATIONS,
  CAREGIVERS, VISITS, VISITS_14D,
  ADL_ITEMS, interpretADL, interpretBMI,
  TWO_Q, NINE_Q, NINE_Q_OPTS, interpret9Q,
  EIGHT_Q, interpret8Q,
  DAILY_CARE, HEALTH_CARE, OTHER_CARE,
  thaiDateString, thaiTimeString
});


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 2 · shared.jsx                                               ║
   ║  Shared UI atoms — buttons, fields, score cards, toggles              ║
   ║  Exposes: StatusBar, AppHeader, PrimaryButton, GhostButton, Field,    ║
   ║   TextInput, Select, Toggle, RadioCardGroup, YesNoGroup, ScoreChip,   ║
   ║   ResultBanner, Stepper, SectionCard, CheckRow, LogoMark, TONE        ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


const { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } = React;

// Tone → palette
const TONE = {
  ok:       { bg: "bg-accent-sage/10",   fg: "text-accent-sage",   ring: "ring-accent-sage/30",  dot: "bg-accent-sage" },
  warning:  { bg: "bg-accent-gold/10",   fg: "text-accent-gold",   ring: "ring-accent-gold/30",  dot: "bg-accent-gold" },
  danger:   { bg: "bg-accent-coral/10",  fg: "text-accent-coral",  ring: "ring-accent-coral/30", dot: "bg-accent-coral" },
  neutral:  { bg: "bg-ink-100",          fg: "text-ink-700",       ring: "ring-ink-300",         dot: "bg-ink-400" }
};

// ──────────────────────────────────────────────────────────────── Status bar
function StatusBar() {
  const [time, setTime] = useState(thaiTimeString());
  useEffect(() => {
    const t = setInterval(() => setTime(thaiTimeString()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="sbar flex items-center justify-between px-5 pt-3 pb-1 text-[12px] text-ink-700 tnum">
      <span className="font-medium">{time}</span>
      <span className="flex items-center gap-1.5">
        <span>●●●●●</span>
        <span className="opacity-70">LTE</span>
        <span className="inline-flex items-center gap-0.5">
          <span className="w-4 h-2 border border-ink-700 rounded-[2px] relative">
            <span className="absolute inset-0.5 bg-ink-700 rounded-[1px]" style={{ width: "75%" }}></span>
          </span>
          <span>74%</span>
        </span>
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── App header
function AppHeader({ title, subtitle, onBack, right }) {
  return (
    <header className="px-5 pt-2 pb-3 flex items-center gap-3 sticky top-0 z-30 bg-paper-warm/95 backdrop-blur">
      {onBack ? (
        <button
          onClick={onBack}
          className="w-10 h-10 -ml-1 grid place-items-center rounded-full bg-ink-100 text-ink-800 active:scale-95 transition"
          aria-label="ย้อนกลับ"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
      ) : null}
      <div className="flex-1 min-w-0">
        <h1 className="font-medium text-[17px] leading-tight text-ink-900 truncate">{title}</h1>
        {subtitle ? <div className="text-[12px] text-ink-500 truncate">{subtitle}</div> : null}
      </div>
      {right}
    </header>
  );
}

// ──────────────────────────────────────────────────────────────── Buttons
function PrimaryButton({ children, onClick, loading, disabled, className = "", icon }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={
        "relative h-12 px-5 rounded-2xl bg-ink-800 text-white font-medium text-[15px] " +
        "active:scale-[0.99] transition disabled:opacity-60 disabled:active:scale-100 " +
        "flex items-center justify-center gap-2 overflow-hidden " + className
      }
    >
      {loading ? <span className="absolute inset-0 saving"></span> : null}
      <span className="relative flex items-center gap-2">
        {loading ? (
          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3"/>
            <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        ) : icon}
        {children}
      </span>
    </button>
  );
}

function GhostButton({ children, onClick, className = "", icon, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={"h-12 px-5 rounded-2xl border border-ink-200 bg-white text-ink-800 font-medium text-[15px] active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:active:scale-100 " + className}
    >
      {icon}
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────── Fields
function Field({ label, hint, error, required, children, right }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] text-ink-700 font-medium">
          {label}{required ? <span className="text-accent-coral ml-1">*</span> : null}
        </span>
        {right || (hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null)}
      </div>
      {children}
      {error ? <div className="text-[11px] text-accent-coral mt-1">{error}</div> : null}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, inputMode, type = "text", suffix, prefix, maxLength, readOnly, className = "" }) {
  return (
    <div className={"flex items-stretch rounded-xl bg-white border border-ink-200 focus-within:border-ink-700 focus-within:shadow-ring transition " + className}>
      {prefix ? <span className="self-center pl-3 text-ink-500 text-[13px]">{prefix}</span> : null}
      <input
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        type={type}
        maxLength={maxLength}
        readOnly={readOnly}
        className="flex-1 h-12 px-4 bg-transparent outline-none text-[15px] text-ink-900 placeholder:text-ink-400 tnum"
      />
      {suffix ? <span className="self-center pr-3 text-ink-500 text-[13px]">{suffix}</span> : null}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value || ""}
        onChange={onChange}
        className="w-full h-12 pl-4 pr-10 rounded-xl bg-white border border-ink-200 text-[15px] text-ink-900 appearance-none outline-none focus:border-ink-700 focus:shadow-ring"
      >
        <option value="" disabled>{placeholder || "เลือก…"}</option>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── Toggle
function Toggle({ value, onChange, label, sub }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-ink-200 active:scale-[.995] transition"
    >
      <span className="text-left">
        <div className="text-[14px] font-medium text-ink-900">{label}</div>
        {sub ? <div className="text-[12px] text-ink-500 mt-0.5">{sub}</div> : null}
      </span>
      <span
        className={
          "relative w-12 h-7 rounded-full transition shrink-0 " +
          (value ? "bg-ink-800" : "bg-ink-200")
        }
      >
        <span
          className={"absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition " + (value ? "left-[22px]" : "left-0.5")}
        />
      </span>
    </button>
  );
}

// ─────────────────────────────────── Thai (Buddhist-era) flat date picker
const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const THAI_DOW = ["อา","จ","อ","พ","พฤ","ศ","ส"];

// 2-digit (or n-digit) zero pad
function padN(n, w = 2) { return String(n).padStart(w, "0"); }

// Parse a Buddhist-era date string ("2487-09-09" or "2487-09-09T...") →
// { beYear, month(0-11), day } or null. Tolerates CE-year strings.
function parseBE(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  let y = +m[1];
  if (y < 2400) y += 543;            // a CE-year slipped in → convert to BE
  return { beYear: y, month: (+m[2]) - 1, day: +m[3] };
}

// Emit the backend's birthdateBE format: BE year + UTC midnight.
function toBEISO(beYear, month, day) {
  return padN(beYear, 4) + "-" + padN(month + 1) + "-" + padN(day) + "T00:00:00.000Z";
}

// Age (in years) from a BE-year birthdate string, or "" if unknown.
function ageFromBE(s) {
  const p = parseBE(s);
  if (!p) return "";
  const nowBE = new Date().getFullYear() + 543;
  const a = nowBE - p.beYear;
  return (a >= 0 && a < 130) ? a : "";
}

function ThaiDatePicker({ value, onChange, placeholder = "เลือกวันเกิด" }) {
  const sel = parseBE(value);
  const nowBE = new Date().getFullYear() + 543;
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(sel ? sel.beYear : nowBE - 70);
  const [viewM, setViewM] = useState(sel ? sel.month : 0);

  // Re-sync the calendar view when an external value arrives.
  useEffect(() => {
    const s = parseBE(value);
    if (s) { setViewY(s.beYear); setViewM(s.month); }
  }, [value]);

  // Calendar math uses the Gregorian year so leap days / weekdays are correct.
  const gy = viewY - 543;
  const daysInMonth = new Date(gy, viewM + 1, 0).getDate();
  const firstDow = new Date(gy, viewM, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const years = [];
  for (let y = nowBE; y >= nowBE - 120; y--) years.push(y);

  const prevMonth = () => { if (viewM === 0) { setViewM(11); setViewY(viewY - 1); } else setViewM(viewM - 1); };
  const nextMonth = () => { if (viewM === 11) { setViewM(0); setViewY(viewY + 1); } else setViewM(viewM + 1); };
  const pick = (d) => { onChange(toBEISO(viewY, viewM, d)); setOpen(false); };

  const label = sel ? `${sel.day} ${THAI_MONTHS[sel.month]} ${sel.beYear}` : "";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-12 px-4 rounded-xl bg-white border border-ink-200 text-left text-[15px] flex items-center justify-between outline-none focus:border-ink-700 focus:shadow-ring transition"
      >
        <span className={label ? "text-ink-900 tnum" : "text-ink-400"}>{label || placeholder}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-500"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </button>

      {open ? (
        <div className="mt-2 rounded-2xl bg-white border border-ink-200 shadow-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={prevMonth} className="w-8 h-8 grid place-items-center rounded-lg bg-ink-50 text-ink-700 active:scale-95">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <select value={viewM} onChange={e => setViewM(+e.target.value)} className="flex-1 h-9 px-2 rounded-lg border border-ink-200 text-[13px] bg-white outline-none focus:border-ink-700">
              {THAI_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={viewY} onChange={e => setViewY(+e.target.value)} className="w-[88px] h-9 px-2 rounded-lg border border-ink-200 text-[13px] bg-white outline-none focus:border-ink-700 tnum">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={nextMonth} className="w-8 h-8 grid place-items-center rounded-lg bg-ink-50 text-ink-700 active:scale-95">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {THAI_DOW.map((d, i) => <div key={i} className="text-center text-[11px] text-ink-400">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i}></div>;
              const on = sel && sel.beYear === viewY && sel.month === viewM && sel.day === d;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={"h-9 rounded-lg text-[13px] tnum transition " + (on ? "bg-ink-800 text-white" : "text-ink-800 hover:bg-ink-50 active:bg-ink-100")}
                >{d}</button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── Radio Card (style 1 — outlined card with score)
function RadioCardGroup({ items, value, onChange, columns }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? items.length}, minmax(0, 1fr))` }}
    >
      {items.map(it => {
        const on = value === it.v;
        return (
          <button
            key={it.v}
            type="button"
            onClick={() => onChange(it.v)}
            className={
              "text-left rounded-2xl border border-ink-200 bg-white p-3 transition " +
              "min-h-[72px] flex flex-col gap-1 " +
              (on ? "radio-card-on" : "")
            }
          >
            <span className={"inline-flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-medium tnum " +
              (on ? "bg-ink-800 text-white" : "bg-ink-100 text-ink-700")}>{it.v}</span>
            <span className="text-[11.5px] leading-snug text-ink-700">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Yes / No pill group (for 2Q / 8Q)
function YesNoGroup({ value, onChange, yesLabel = "มี", noLabel = "ไม่มี" }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { v: false, label: noLabel },
        { v: true,  label: yesLabel }
      ].map(o => {
        const on = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={
              "h-12 rounded-2xl border text-[14px] font-medium transition " +
              (on
                ? (o.v ? "bg-accent-coral text-white border-accent-coral" : "bg-ink-800 text-white border-ink-800")
                : "bg-white border-ink-200 text-ink-700")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── Score chip
function ScoreChip({ tone = "neutral", children, dot = true }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium " + t.bg + " " + t.fg}>
      {dot ? <span className={"w-1.5 h-1.5 rounded-full " + t.dot}></span> : null}
      {children}
    </span>
  );
}

function ResultBanner({ tone = "neutral", title, value, sub }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <div className={"rounded-2xl p-4 ring-1 " + t.bg + " " + t.ring}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-500">{title}</div>
          <div className={"text-[18px] font-medium leading-tight " + t.fg}>{value}</div>
          {sub ? <div className="text-[12px] text-ink-600 mt-0.5">{sub}</div> : null}
        </div>
        <span className={"w-10 h-10 rounded-2xl grid place-items-center " + t.dot + " text-white"}>
          {tone === "danger" ? "!" : tone === "warning" ? "›" : "✓"}
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── Stepper
function Stepper({ steps, current, onJump, completed }) {
  const total = steps.length;
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="px-5 pb-3">
      <div className="flex items-center justify-between text-[11px] text-ink-500 tnum mb-1.5">
        <span>ขั้นตอนที่ {current + 1} จาก {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
        <div
          className="h-full bg-ink-800 transition-all"
          style={{ width: pct + "%" }}
        ></div>
      </div>
      <div className="mt-3 -mx-5 px-5 flex gap-1.5 overflow-x-auto no-scrollbar">
        {steps.map((s, i) => {
          const isDone = completed[i];
          const isCur = i === current;
          return (
            <button
              key={s.id}
              onClick={() => onJump(i)}
              className={
                "shrink-0 px-3 h-8 rounded-full text-[12px] flex items-center gap-1.5 transition " +
                (isCur
                  ? "bg-ink-800 text-white"
                  : isDone
                    ? "bg-accent-sage/15 text-accent-sage"
                    : "bg-white border border-ink-200 text-ink-500")
              }
            >
              <span className="tnum">{String(i + 1).padStart(2, "0")}</span>
              <span>{s.short}</span>
              {isDone && !isCur ? <span>✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── Section card
function SectionCard({ title, subtitle, children, right }) {
  return (
    <section className="bg-white rounded-3xl shadow-card border border-ink-100 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-medium text-ink-900 leading-tight">{title}</h2>
          {subtitle ? <div className="text-[12px] text-ink-500 mt-0.5">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="px-5 pb-5 space-y-4">{children}</div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────── Checkbox row
function CheckRow({ checked, onToggle, label, accent }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "w-full text-left flex items-start gap-3 p-3 rounded-xl border transition " +
        (checked ? "border-ink-700 bg-ink-50" : "border-ink-200 bg-white")
      }
    >
      <span
        className={
          "shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 grid place-items-center transition " +
          (checked ? "bg-ink-800 border-ink-800 text-white" : "border-ink-300 bg-white")
        }
      >
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l4 4 10-10"/>
          </svg>
        ) : null}
      </span>
      <span className="text-[13.5px] text-ink-800 leading-snug">{label}</span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────── Logo mark
function LogoMark({ size = 56 }) {
  return (
    <img
      src="assets/logo.png"
      alt="ตราโรงพยาบาลส่งเสริมสุขภาพตำบลบ้านทรายไหลแล้ง"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded-full object-cover"
    />
  );
}

Object.assign(window, {
  StatusBar, AppHeader,
  PrimaryButton, GhostButton,
  Field, TextInput, Select,
  Toggle, RadioCardGroup, YesNoGroup,
  ScoreChip, ResultBanner,
  Stepper, SectionCard, CheckRow,
  LogoMark, TONE
});


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 3 · screens.jsx                                              ║
   ║  Login + Care Giver Home screens (LoginScreen, HomeScreen, PatientCard) ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


const { useState: uS1, useEffect: uE1 } = React;

// ──────────────────────────────────────────────────────────────── LOGIN
function LoginScreen({ onLogin }) {
  const [role, setRole] = uS1("caregiver");
  const [username, setUsername] = uS1("");
  const [password, setPassword] = uS1("");
  const [show, setShow] = uS1(false);
  const [loading, setLoading] = uS1(false);

  const submit = async () => {
    if (!username || !password) {
      Swal.fire({ icon: "warning", title: "กรอกข้อมูลไม่ครบ", text: "กรุณาระบุชื่อผู้ใช้และรหัสผ่าน" });
      return;
    }
    setLoading(true);
    try {
      const r = await LTC_API.login(username, password);
      // Reflect the real signed-in identity in the header of each role's home.
      const u = r.user || {};
      if (r.role === "admin")        { ADMIN_USER.name = u.name || ADMIN_USER.name; }
      else if (r.role === "case_manager") { CM_USER.name = u.name || CM_USER.name; }
      else { CURRENT_USER.name = u.name || CURRENT_USER.name; CURRENT_USER.user_id = u.id != null ? String(u.id) : CURRENT_USER.user_id; }
      setLoading(false);
      onLogin(r.role || role);
    } catch (e) {
      setLoading(false);
      Swal.fire({ icon: "error", title: "เข้าสู่ระบบไม่สำเร็จ", text: e.message || String(e) });
    }
  };

  return (
    <div className="phone phone-bg">
      <StatusBar/>
      <div className="px-6 pt-6 pb-8 flex flex-col gap-6 min-h-[calc(100dvh-28px)]">
        {/* Identity */}
        <div className="flex flex-col items-center gap-3 pt-6">
          <LogoMark size={88}/>
          <div className="text-center">
            <div className="text-[12px] tracking-[0.2em] text-ink-500 uppercase">LTC Dependence Care</div>
            <h1 className="text-[22px] font-medium text-ink-900 leading-tight mt-1">
              ระบบรายงานการดูแล<br/>ผู้สูงอายุที่มีภาวะพึ่งพิง
            </h1>
            <div className="text-[12.5px] text-ink-600 mt-1.5">
              โรงพยาบาลส่งเสริมสุขภาพตำบล<br/>บ้านทรายไหลแล้ง · จังหวัดมุกดาหาร
            </div>
          </div>
        </div>

        {/* Role tabs */}
        <div>
          <div className="text-[12px] text-ink-500 mb-2">เข้าใช้งานในบทบาท</div>
          <div className="grid grid-cols-3 gap-2">
            {ALL_ROLES.map(r => {
              const on = role === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={
                    "rounded-2xl p-3 text-left border transition " +
                    (on
                      ? "border-ink-800 bg-white shadow-card"
                      : "border-ink-200 bg-white/60 text-ink-600")
                  }
                >
                  <div className={"text-[20px] " + (on ? "" : "opacity-70")}>{r.icon}</div>
                  <div className={"text-[12px] font-medium leading-tight mt-1 " + (on ? "text-ink-900" : "text-ink-700")}>
                    {r.label}
                  </div>
                  <div className="text-[10.5px] text-ink-500 mt-0.5 leading-snug">{r.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl p-5 shadow-card border border-ink-100 space-y-4">
          <Field label="ชื่อผู้ใช้งาน" required>
            <TextInput
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username"
              prefix={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>
                </svg>
              }
            />
          </Field>
          <Field label="รหัสผ่าน" required>
            <TextInput
              value={password}
              onChange={e => setPassword(e.target.value)}
              type={show ? "text" : "password"}
              placeholder="••••••"
              prefix={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
                </svg>
              }
              suffix={
                <button onClick={() => setShow(s => !s)} className="text-[12px] text-ink-700 px-1">
                  {show ? "ซ่อน" : "แสดง"}
                </button>
              }
            />
          </Field>
          <div className="flex items-center justify-between text-[12px]">
            <label className="inline-flex items-center gap-2 text-ink-600">
              <input type="checkbox" defaultChecked className="accent-ink-800 w-4 h-4"/>
              จดจำการเข้าสู่ระบบ
            </label>
            <button className="text-ink-700 underline-offset-2 underline">ลืมรหัสผ่าน?</button>
          </div>
          <PrimaryButton loading={loading} onClick={submit} className="w-full">
            เข้าสู่ระบบ
          </PrimaryButton>
        </div>

        <div className="text-center text-[11.5px] text-ink-500 mt-auto">
          v1.0 · พัฒนาเพื่อการดูแลในชุมชน · 2569
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── HOME (Care Giver)
function HomeScreen({ onOpenNewVisit, onOpenPatient, onLogout }) {
  const [tab, setTab] = uS1("all");
  const [q, setQ] = uS1("");
  const [view, setView] = uS1("home"); // home · report · map · me
  const [roster, setRoster] = uS1(PATIENTS);
  const [myVisitCount, setMyVisitCount] = uS1(0);

  const today = thaiDateString();

  // Load the caregiver's own roster + visit feed from the backend. The server
  // already scopes both reads to the logged-in caregiver.
  uE1(() => {
    let alive = true;
    LTC_API.listPatients({}).then(list => {
      if (alive && Array.isArray(list)) setRoster(list);
    }).catch(() => {});
    LTC_API.listVisits({}).then(v => {
      if (alive && Array.isArray(v)) setMyVisitCount(v.length);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // CG scoping — a Care Giver sees only the cases assigned to them.
  // (Live backend already scopes caregivers server-side; mock filters here.)
  const myPatients = LTC_API.isLive()
    ? roster
    : roster.filter(p => p.assigned_cg === CURRENT_USER.user_id);

  const filtered = myPatients.filter(p => {
    if (tab === "risk" && p.risk === "ปกติ") return false;
    if (tab === "bed" && p.adl_group !== "ติดเตียง") return false;
    if (tab === "today" && !p.due_today) return false;
    if (q) {
      const needle = q.toLowerCase();
      return (p.name + p.pid + p.village).toLowerCase().includes(needle);
    }
    return true;
  });

  // Computed stats (no hardcoded figures)
  const riskCount = myPatients.filter(p => p.risk !== "ปกติ").length;
  const todayPlanned = myPatients.filter(p => p.due_today).length;
  const visitedToday = myPatients.filter(p => p.due_today && p.visited_today).length;
  const donePct = todayPlanned ? Math.round((visitedToday / todayPlanned) * 100) : 0;

  return (
    <div className="phone phone-bg pb-32">
      <StatusBar/>

      {/* Greeting header */}
      <header className="px-5 pt-2 pb-4 flex items-center gap-3">
        <LogoMark size={44}/>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-ink-500">สวัสดี · {today}</div>
          <div className="text-[15px] font-medium text-ink-900 truncate">{CURRENT_USER.name}</div>
        </div>
        <button
          onClick={onLogout}
          className="w-10 h-10 grid place-items-center rounded-full bg-white border border-ink-200 text-ink-700"
          aria-label="ออกจากระบบ"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
          </svg>
        </button>
      </header>

      {view === "home" ? (
        <>
          {/* Today summary */}
          <div className="mx-5 mb-5 rounded-3xl bg-ink-800 text-white p-5 shadow-pop overflow-hidden relative">
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5"></div>
            <div className="absolute -bottom-10 -right-2 w-32 h-32 rounded-full bg-white/5"></div>
            <div className="relative">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/60">วันนี้</div>
              <div className="mt-1 flex items-end gap-2">
                <div className="text-[40px] font-medium leading-none tnum">{todayPlanned}</div>
                <div className="text-[13px] text-white/80 pb-1">เคสที่ต้องเยี่ยม</div>
              </div>
              <div className="mt-3 flex gap-2 text-[12px]">
                <div className="px-2.5 py-1 rounded-full bg-white/10 inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-coral"></span>
                  เสี่ยงสูง {riskCount}
                </div>
                <div className="px-2.5 py-1 rounded-full bg-white/10">เยี่ยมแล้ว {visitedToday} / {todayPlanned}</div>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full bg-accent-sage2" style={{ width: donePct + "%" }}></div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-5 mb-3">
            <div className="flex items-stretch rounded-2xl bg-white border border-ink-200 focus-within:border-ink-700">
              <span className="self-center pl-4 text-ink-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                </svg>
              </span>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="ค้นหา ชื่อ / PID / หมู่บ้าน"
                className="flex-1 h-12 px-3 bg-transparent outline-none text-[14px] placeholder:text-ink-400"
              />
              <button className="self-center pr-4 text-ink-500" aria-label="กรอง">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-5 mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: "all",  label: "ทั้งหมด · " + myPatients.length },
              { id: "risk", label: "เคสเสี่ยง · " + riskCount },
              { id: "bed",  label: "ติดเตียง · " + myPatients.filter(p=>p.adl_group==="ติดเตียง").length },
              { id: "today",label: "วันนี้ · " + todayPlanned }
            ].map(t => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    "shrink-0 h-9 px-3.5 rounded-full text-[12.5px] transition " +
                    (on ? "bg-ink-800 text-white" : "bg-white border border-ink-200 text-ink-700")
                  }
                >{t.label}</button>
              );
            })}
          </div>

          {/* Patient cards */}
          <div className="px-5 space-y-3">
            {filtered.map(p => <PatientCard key={p.pid} p={p} onOpen={() => onOpenPatient(p)}/>)}
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">
                ไม่พบเคสที่ตรงกับเงื่อนไข
              </div>
            ) : null}
          </div>
        </>
      ) : view === "report" ? (
        <CGReportPanel patients={myPatients} riskCount={riskCount} todayPlanned={todayPlanned} visitedToday={visitedToday} visitCount={myVisitCount}/>
      ) : view === "map" ? (
        <CGMapPanel patients={myPatients} onOpenPatient={onOpenPatient}/>
      ) : (
        <CGProfilePanel patients={myPatients} onLogout={onLogout} visitCount={myVisitCount}/>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="phone-w pointer-events-auto bg-white/95 backdrop-blur border-t border-ink-100 px-3 py-2 flex items-center justify-around">
          {[
            { id: "home", label: "เคส", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
            { id: "report", label: "รายงาน", icon: "M4 4h12l4 4v12H4z M14 4v6h6" },
            { id: "fab",  fab: true },
            { id: "map",  label: "แผนที่", icon: "M9 3l-6 3v15l6-3 6 3 6-3V3l-6 3z" },
            { id: "me",   label: "บัญชี", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1.5-4 5-6 8-6s6.5 2 8 6" }
          ].map(item => item.fab ? (
            <button
              key="fab"
              onClick={onOpenNewVisit}
              className="-mt-7 w-14 h-14 rounded-2xl bg-ink-800 text-white grid place-items-center shadow-pop active:scale-95 transition"
              aria-label="บันทึกเยี่ยมใหม่"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          ) : (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={"flex-1 flex flex-col items-center gap-0.5 py-1 transition " + (view === item.id ? "text-ink-800" : "text-ink-500")}
              aria-current={view === item.id ? "page" : undefined}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={view === item.id ? 2.1 : 1.6} strokeLinecap="round" strokeLinejoin="round">
                {item.icon.split(" ").map((d,i) => <path key={i} d={d}/>)}
              </svg>
              <span className={"text-[10.5px] " + (view === item.id ? "font-medium" : "")}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ───────────────────────────────────────────── Care Giver · Report panel
function CGReportPanel({ patients, riskCount, todayPlanned, visitedToday, visitCount = 0 }) {
  const byAdl = (g) => patients.filter(p => p.adl_group === g).length;
  const myVisits = { length: visitCount };
  const adlGroups = [
    { g: "ติดสังคม", tone: "ok" },
    { g: "ติดบ้าน",  tone: "warning" },
    { g: "ติดเตียง", tone: "danger" }
  ];
  return (
    <div className="px-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-ink-100 shadow-card p-4">
          <div className="text-[26px] font-medium text-ink-900 tnum leading-none">{patients.length}</div>
          <div className="text-[12px] text-ink-600 mt-1">เคสในความรับผิดชอบ</div>
        </div>
        <div className="rounded-2xl bg-white border border-ink-100 shadow-card p-4">
          <div className="text-[26px] font-medium text-ink-900 tnum leading-none">{myVisits.length}</div>
          <div className="text-[12px] text-ink-600 mt-1">การเยี่ยมของฉัน</div>
        </div>
        <div className="rounded-2xl bg-white border border-ink-100 shadow-card p-4">
          <div className="text-[26px] font-medium text-accent-coral tnum leading-none">{riskCount}</div>
          <div className="text-[12px] text-ink-600 mt-1">เคสเสี่ยง / เฝ้าระวัง</div>
        </div>
        <div className="rounded-2xl bg-white border border-ink-100 shadow-card p-4">
          <div className="text-[26px] font-medium text-accent-sage tnum leading-none">{visitedToday}/{todayPlanned}</div>
          <div className="text-[12px] text-ink-600 mt-1">เยี่ยมแล้ววันนี้</div>
        </div>
      </div>

      <SectionCard title="แยกตามระดับการพึ่งพิง">
        <div className="space-y-2.5">
          {adlGroups.map(({ g, tone }) => {
            const n = byAdl(g);
            const pct = patients.length ? Math.round((n / patients.length) * 100) : 0;
            const t = TONE[tone] || TONE.neutral;
            return (
              <div key={g}>
                <div className="flex items-center justify-between text-[12.5px] mb-1">
                  <span className="text-ink-700 inline-flex items-center gap-1.5">
                    <span className={"w-2 h-2 rounded-full " + t.dot}></span>{g}
                  </span>
                  <span className="text-ink-500 tnum">{n} เคส</span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div className={"h-full " + t.dot} style={{ width: pct + "%" }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="การเยี่ยมล่าสุดของฉัน" subtitle={`${myVisits.length} รายการ`}>
        {myVisits.length ? (
          <div className="space-y-2">
            {myVisits.map(v => (
              <div key={v.id} className="flex items-center gap-3 py-1.5">
                <div className="w-9 h-9 rounded-xl bg-paper grid place-items-center text-[11px] font-medium text-ink-700">
                  {v.name.replace(/^น(าง|าย|.ส.)\s*/,"").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink-900 truncate">{v.name}</div>
                  <div className="text-[11px] text-ink-500">ADL {v.adl} · 9Q {v.q9}{v.q8 ? ` · 8Q ${v.q8}` : ""}</div>
                </div>
                <div className="text-[11px] text-ink-500 tnum shrink-0">{v.date}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-ink-500 text-[13px] py-4">ยังไม่มีการเยี่ยม</div>
        )}
      </SectionCard>
    </div>
  );
}

// ───────────────────────────────────────────── Care Giver · Map panel
function CGMapPanel({ patients, onOpenPatient }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const CENTER = [16.5418, 104.7237]; // รพ.สต.บ้านทรายไหลแล้ง (มุกดาหาร)

  // stable pseudo-coordinate from distance + pid so demo markers don't jump
  const coordFor = (p) => {
    let seed = 0;
    for (let i = 0; i < p.pid.length; i++) seed = (seed * 31 + p.pid.charCodeAt(i)) % 360;
    const bearing = seed * Math.PI / 180;
    const dKm = p.distance_km || 1;
    const dLat = (dKm / 111) * Math.cos(bearing);
    const dLng = (dKm / (111 * Math.cos(CENTER[0] * Math.PI / 180))) * Math.sin(bearing);
    return [CENTER[0] + dLat, CENTER[1] + dLng];
  };

  useEffect(() => {
    if (!elRef.current || mapRef.current || typeof L === "undefined") return;
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false }).setView(CENTER, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    // health center
    L.circleMarker(CENTER, { radius: 7, color: "#13224a", fillColor: "#13224a", fillOpacity: 1, weight: 2 })
      .addTo(map).bindPopup("รพ.สต.บ้านทรายไหลแล้ง");
    // patient markers (approximate, prototype)
    patients.forEach(p => {
      const tone = p.risk === "เสี่ยงสูง" ? "#c0533f" : p.risk === "เฝ้าระวัง" ? "#b58a3c" : "#3e8e6a";
      L.circleMarker(coordFor(p), { radius: 6, color: "#fff", weight: 2, fillColor: tone, fillOpacity: 1 })
        .addTo(map).bindPopup(`<b>${p.name}</b><br/>${p.adl_group} · ${p.risk}<br/>ห่าง ${p.distance_km} กม.`);
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const sorted = [...patients].sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));

  return (
    <div className="px-5 space-y-3">
      <div ref={elRef} className="rounded-3xl overflow-hidden border border-ink-200 shadow-card" style={{ height: 260 }}></div>
      <div className="text-[11px] text-ink-400 px-1">ตำแหน่งเป็นค่าโดยประมาณสำหรับตัวอย่าง · เรียงตามระยะทางจาก รพ.สต.</div>
      <div className="space-y-2">
        {sorted.map(p => {
          const tone = p.risk === "เสี่ยงสูง" ? "danger" : p.risk === "เฝ้าระวัง" ? "warning" : "ok";
          const t = TONE[tone] || TONE.neutral;
          return (
            <button
              key={p.pid}
              onClick={() => onOpenPatient(p)}
              className="w-full text-left rounded-2xl bg-white border border-ink-100 shadow-card p-3.5 flex items-center gap-3 active:scale-[.995] transition"
            >
              <span className={"w-2.5 h-2.5 rounded-full shrink-0 " + t.dot}></span>
              <span className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-ink-900 truncate">{p.name}</div>
                <div className="text-[11.5px] text-ink-500 truncate">{p.village}</div>
              </span>
              <span className="text-[12px] text-ink-600 tnum shrink-0">{p.distance_km} กม.</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── Care Giver · Profile panel
function CGProfilePanel({ patients, onLogout, visitCount = 0 }) {
  const myVisits = visitCount;
  const changePw = () => Swal.fire({
    icon: "info",
    title: "เปลี่ยนรหัสผ่าน",
    text: "ฟีเจอร์นี้จะเชื่อมต่อกับระบบจริงเมื่อพร้อมใช้งาน",
    confirmButtonText: "ตกลง"
  });
  return (
    <div className="px-5 space-y-4">
      <div className="rounded-3xl bg-white border border-ink-100 shadow-card p-5 flex items-center gap-4">
        <LogoMark size={56}/>
        <div className="min-w-0">
          <div className="text-[16px] font-medium text-ink-900 truncate">{CURRENT_USER.name}</div>
          <div className="text-[12px] text-ink-500">{CURRENT_USER.role} · {CURRENT_USER.user_id}</div>
        </div>
      </div>

      <SectionCard title="ข้อมูลเจ้าหน้าที่">
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between"><span className="text-ink-500">พื้นที่รับผิดชอบ</span><span className="text-ink-900">{CURRENT_USER.village}</span></div>
          <div className="flex justify-between"><span className="text-ink-500">เบอร์ติดต่อ</span><span className="text-ink-900 tnum">{CURRENT_USER.phone}</span></div>
          <div className="flex justify-between"><span className="text-ink-500">เคสในความรับผิดชอบ</span><span className="text-ink-900 tnum">{patients.length} เคส</span></div>
          <div className="flex justify-between"><span className="text-ink-500">การเยี่ยมสะสม</span><span className="text-ink-900 tnum">{myVisits} ครั้ง</span></div>
        </div>
      </SectionCard>

      <div className="space-y-2.5">
        <GhostButton onClick={changePw} className="w-full">เปลี่ยนรหัสผ่าน</GhostButton>
        <GhostButton onClick={onLogout} className="w-full text-accent-coral border-accent-coral/30">ออกจากระบบ</GhostButton>
      </div>

      <div className="text-center text-[11px] text-ink-400 pt-2">v1.0 · LTC Care · 2569</div>
    </div>
  );
}

function PatientCard({ p, onOpen }) {
  const riskTone = p.risk === "เสี่ยงสูง" ? "danger" : p.risk === "เฝ้าระวัง" ? "warning" : "ok";
  const adlTone = p.adl_group === "ติดเตียง" ? "danger" : p.adl_group === "ติดบ้าน" ? "warning" : "ok";
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white rounded-3xl border border-ink-100 shadow-card p-4 active:scale-[.995] transition"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-paper grid place-items-center text-ink-700 font-medium">
          {p.name.replace(/^น(าง|าย|.ส.)\s*/, "").slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="text-[15px] font-medium text-ink-900 truncate">{p.name}</div>
            <div className="text-[12px] text-ink-500 tnum shrink-0">{p.age} ปี · {p.sex}</div>
          </div>
          <div className="text-[11.5px] text-ink-500 tnum mt-0.5">PID {p.pid}</div>
          <div className="text-[12px] text-ink-600 mt-1.5 truncate">{p.village}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {p.adl_group ? <ScoreChip tone={adlTone}>{p.adl_group}</ScoreChip> : null}
            {p.risk ? <ScoreChip tone={riskTone}>{p.risk}</ScoreChip> : null}
            <span className="text-[11px] text-ink-500 ml-auto tnum">เยี่ยมล่าสุด {p.last_visit}</span>
          </div>
        </div>
      </div>
      <div className="dotted-rule my-3"></div>
      <div className="flex items-center justify-between text-[12px] text-ink-600">
        {p.distance_km != null ? (
          <span className="inline-flex items-center gap-1.5 tnum">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ห่าง {p.distance_km} กม.
          </span>
        ) : <span></span>}
        <span className="tnum">เยี่ยมรวม {p.visit_count} ครั้ง</span>
        <span className="inline-flex items-center gap-1 text-ink-800 font-medium">
          เปิดเคส
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </span>
      </div>
    </button>
  );
}

Object.assign(window, { LoginScreen, HomeScreen, PatientCard });


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 4 · dashboard.jsx                                            ║
   ║  Admin Dashboard — KPIs, charts, recent visits, search/filter, export ║
   ║  Exposes: AdminDashboard                                              ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


const { useState: usD, useMemo: umD, useRef: urD } = React;

const ADMIN_USER = {
  name: "ผู้ดูแลระบบ",
  role: "ผู้อำนวยการ รพ.สต.",
  initials: ""
};

function AdminDashboard({ onLogout, onNav }) {
  const [range, setRange] = usD("7d");
  const [query, setQuery] = usD("");
  const [riskFilter, setRiskFilter] = usD("all");
  const [village, setVillage] = usD("all");
  const [patients, setPatients] = usD([]);
  const [visits, setVisits] = usD([]);
  const [buckets14d, setBuckets14d] = usD([]);

  // Live roster + visit feed from the backend.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [pts, cgs, rawVisits, buckets] = await Promise.all([
          LTC_API.listPatients().catch(() => []),
          LTC_API.listCaregivers().catch(() => []),
          LTC_API.listVisits({ limit: 100 }).catch(() => []),
          LTC_API.getVisitsLast14Days().catch(() => [])
        ]);
        if (!alive) return;
        const plist = Array.isArray(pts) ? pts : [];
        setPatients(plist);
        setBuckets14d(Array.isArray(buckets) ? buckets : []);
        // Build join context for visit rows.
        const pmap = {}; plist.forEach(p => { pmap[String(p.pid)] = { name: p.name, village: p.village }; });
        const cmap = {}; (Array.isArray(cgs) ? cgs : []).forEach(c => { cmap[c.id] = c.name; });
        const norm = (Array.isArray(rawVisits) ? rawVisits : []).map(v => LTC_API.normalizeVisit(v, { patients: pmap, caregivers: cmap }));
        setVisits(norm);
      } catch (e) { /* graceful empty */ }
    })();
    return () => { alive = false; };
  }, []);

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const k = umD(() => {
    const cases = patients.length;
    const v = visits;
    const total = v.length;
    const lowADL = v.filter(x => x.adl > 0 && x.adl <= 11).length;
    const high9Q = v.filter(x => x.q9 >= 7).length;
    const has8Q = v.filter(x => x.q8 > 0).length;
    const latestDate = v.length ? v[0].raw_date : null;
    const visitsToday = latestDate ? v.filter(x => x.raw_date === latestDate).length : 0;
    return { cases, visits: total, lowADL, high9Q, has8Q, visitsToday };
  }, [patients, visits]);

  // Care Givers derived from the live roster (count of assigned cases).
  const caregivers = umD(() => {
    const m = {};
    patients.forEach(p => {
      const n = p.assigned_cg;
      if (!n) return;
      const key = p.assigned_cg_id || n;
      if (!m[key]) m[key] = { id: key, name: n, village: p.village || "", cases: 0, active: true };
      m[key].cases++;
    });
    return Object.values(m).sort((a, b) => b.cases - a.cases);
  }, [patients]);

  // 14-day chart counts.
  const chart14d = umD(() => buckets14d.map(b => Number(b.count) || 0), [buckets14d]);

  // Distinct villages present across the roster (for the filter chips).
  const villageOptions = umD(() => {
    const s = new Set();
    patients.forEach(p => { if (p.village) s.add(p.village); });
    return Array.from(s).sort();
  }, [patients]);

  // ─── Filtered visits ─────────────────────────────────────────────────────
  const filtered = umD(() => visits.filter(v => {
    if (riskFilter !== "all" && v.risk !== riskFilter) return false;
    if (village !== "all" && v.village !== village) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(v.name + v.pid + v.cg).toLowerCase().includes(q)) return false;
    }
    return true;
  }), [visits, query, riskFilter, village]);

  const exportFile = (kind) => {
    Swal.fire({
      title: `กำลังสร้างไฟล์ ${kind.toUpperCase()}...`,
      didOpen: () => Swal.showLoading(),
      timer: 1100,
      timerProgressBar: true
    }).then(() => {
      Swal.fire({
        icon: "success",
        title: "ส่งออกสำเร็จ",
        html: `ดาวน์โหลดรายงาน <b>visit-log_${range}.${kind}</b><br/><span style="color:#506aa3; font-size:12px">${filtered.length} รายการ</span>`,
        confirmButtonText: "ตกลง"
      });
    });
  };

  return (
    <div className="phone phone-bg pb-28">
      <StatusBar/>

      {/* Identity header */}
      <header className="px-5 pt-2 pb-3 flex items-center gap-3">
        <LogoMark size={44}/>
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] text-ink-500">{ADMIN_USER.role}</div>
          <div className="text-[15px] font-medium text-ink-900 truncate">{ADMIN_USER.name}</div>
        </div>
        <button
          onClick={onLogout}
          className="w-10 h-10 grid place-items-center rounded-full bg-white border border-ink-200 text-ink-700"
          aria-label="ออกจากระบบ"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
          </svg>
        </button>
      </header>

      {/* Title row + range */}
      <div className="px-5 mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11.5px] tracking-[0.18em] text-ink-500 uppercase">Dashboard</div>
          <h1 className="text-[22px] font-medium text-ink-900 leading-tight">ภาพรวมการดูแล</h1>
          <div className="text-[12px] text-ink-500 mt-0.5">รพ.สต.บ้านทรายไหลแล้ง · ปรับล่าสุด {thaiDateString()} {thaiTimeString()}</div>
        </div>
      </div>

      {/* Date range pills */}
      <div className="px-5 mb-4 flex gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: "today", label: "วันนี้" },
          { id: "7d",    label: "7 วัน" },
          { id: "30d",   label: "30 วัน" },
          { id: "qtr",   label: "ไตรมาส" },
          { id: "year",  label: "ปีงบ 2569" }
        ].map(r => {
          const on = range === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={
                "shrink-0 h-9 px-3.5 rounded-full text-[12.5px] transition " +
                (on ? "bg-ink-800 text-white" : "bg-white border border-ink-200 text-ink-700")
              }
            >{r.label}</button>
          );
        })}
      </div>

      {/* KPI tiles */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-4">
        <KPI value={k.cases}   label="จำนวนเคสทั้งหมด" sub="เคสในความรับผิดชอบ" tone="neutral"/>
        <KPI value={k.visits}  label="ครั้งเยี่ยมทั้งหมด" sub={`วันนี้ ${k.visitsToday} ครั้ง`} tone="ok"/>
        <KPI value={k.lowADL}  label="เคส ADL ≤ 11" sub="ติดบ้าน / ติดเตียง" tone="warning"/>
        <KPI value={k.high9Q}  label="เคส 9Q ≥ 7" sub="ภาวะซึมเศร้า" tone="warning"/>
      </div>

      {/* Critical risk callout */}
      <div className="px-5 mb-5">
        <div className="rounded-3xl bg-accent-coral text-white p-4 shadow-pop overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/8"></div>
          <div className="relative flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 grid place-items-center text-[20px] shrink-0">!</div>
            <div className="flex-1">
              <div className="text-[11px] tracking-[0.16em] uppercase opacity-80">เร่งด่วน</div>
              <div className="text-[15px] font-medium leading-tight mt-0.5">
                {k.has8Q} เคสมี 8Q &gt; 0 — แนวโน้มฆ่าตัวตาย
              </div>
              <div className="text-[12px] opacity-90 mt-1">ติดตามภายใน 7 วัน · ส่งต่อ รพ.อำเภอตามแผน CPG</div>
            </div>
            <button className="self-center w-9 h-9 rounded-xl bg-white/15 grid place-items-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Visits trend chart */}
      <SectionCard title="แนวโน้มการเยี่ยม · 14 วันที่ผ่านมา" subtitle="จำนวนครั้งต่อวัน">
        <VisitsBarChart data={chart14d}/>
        <div className="flex items-center justify-between text-[12px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-ink-800"></span> ทั้งหมด
          </span>
          <span className="tnum">เฉลี่ย {chart14d.length ? (chart14d.reduce((s,v)=>s+v,0)/chart14d.length).toFixed(1) : "0"} ครั้ง/วัน</span>
        </div>
      </SectionCard>

      <div className="h-4"></div>

      {/* ADL distribution donut */}
      <div className="px-5 grid grid-cols-1 gap-4">
        <SectionCard title="การกระจายระดับการพึ่งพิง" subtitle="จากการประเมิน ADL ล่าสุด">
          <ADLDonut patients={patients}/>
        </SectionCard>
      </div>

      <div className="h-4"></div>

      {/* Care giver leaderboard */}
      <SectionCard title="Care Giver ในพื้นที่" subtitle={`${caregivers.length} คนปฏิบัติงาน`}>
        <div className="space-y-2">
          {caregivers.map((c,i) => (
            <div key={c.id} className="flex items-center gap-3 py-2">
              <div className="w-9 h-9 rounded-xl bg-paper border border-ink-100 grid place-items-center text-[12px] font-medium text-ink-700">
                {c.name.split(" ").filter(Boolean)[0].slice(0,2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-ink-900 truncate">{c.name}</div>
                <div className="text-[11.5px] text-ink-500">{c.village}</div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-medium text-ink-900 tnum">{c.cases}</div>
                <div className="text-[10.5px] text-ink-500">เคสที่ดูแล</div>
              </div>
              <span className={"w-2 h-2 rounded-full " + (c.active ? "bg-accent-sage" : "bg-ink-300")}></span>
            </div>
          ))}
          {caregivers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[12.5px]">
              ยังไม่มี Care Giver ที่ถูกมอบหมาย
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="h-4"></div>

      {/* Recent visits list + filters + export */}
      <SectionCard
        title="รายงานการเยี่ยมล่าสุด"
        subtitle={`${filtered.length} รายการ`}
        right={
          <div className="flex gap-1.5">
            <button onClick={() => exportFile("xlsx")} className="px-2.5 h-8 rounded-full bg-accent-sage/10 text-accent-sage text-[11px] font-medium inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>
              XLSX
            </button>
            <button onClick={() => exportFile("pdf")} className="px-2.5 h-8 rounded-full bg-accent-coral/10 text-accent-coral text-[11px] font-medium inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>
              PDF
            </button>
          </div>
        }
      >
        {/* Search */}
        <div className="flex items-stretch rounded-xl bg-paper border border-ink-100">
          <span className="self-center pl-3 text-ink-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหา ชื่อ / PID / Care Giver"
            className="flex-1 h-11 px-3 bg-transparent outline-none text-[13.5px] placeholder:text-ink-400"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pt-1">
          {["all","เสี่ยงสูง","เฝ้าระวัง","ปกติ"].map(r => {
            const on = riskFilter === r;
            return (
              <button
                key={r}
                onClick={() => setRiskFilter(r)}
                className={"shrink-0 h-8 px-3 rounded-full text-[11.5px] transition border " +
                  (on
                    ? "bg-ink-800 text-white border-ink-800"
                    : "bg-white border-ink-200 text-ink-600")
                }
              >{r === "all" ? "ทุกระดับเสี่ยง" : r}</button>
            );
          })}
          <span className="w-px shrink-0 bg-ink-200 mx-1 self-stretch"></span>
          {["all", ...villageOptions].map(v => {
            const on = village === v;
            return (
              <button
                key={v}
                onClick={() => setVillage(v)}
                className={"shrink-0 h-8 px-3 rounded-full text-[11.5px] transition border " +
                  (on
                    ? "bg-ink-800 text-white border-ink-800"
                    : "bg-white border-ink-200 text-ink-600")
                }
              >{v === "all" ? "ทุกหมู่บ้าน" : v}</button>
            );
          })}
        </div>

        {/* Visit rows */}
        <div className="space-y-2">
          {filtered.map(v => <VisitRow key={v.id} v={v}/>)}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">
              ไม่พบรายการที่ตรงกับเงื่อนไข
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="h-6"></div>

      {/* Admin quick actions */}
      <div className="px-5 mb-6">
        {/* Headline action — assign Care Givers to cases */}
        <button
          onClick={() => onNav?.("assign")}
          className="w-full mb-3 rounded-3xl bg-ink-800 text-white p-4 flex items-center gap-3 shadow-card active:scale-[.995] transition text-left"
        >
          <span className="w-11 h-11 rounded-2xl bg-white/10 grid place-items-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>
            </svg>
          </span>
          <span className="flex-1 min-w-0">
            <div className="text-[14.5px] font-medium">มอบหมาย Care Giver</div>
            <div className="text-[11.5px] text-white/70">กำหนดผู้รับผิดชอบรายเคส</div>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <AdminAction icon="users"    label="จัดการผู้ใช้งาน" sub={`${caregivers.length} คน`}     onClick={() => onNav?.("users")}/>
          <AdminAction icon="patients" label="ทะเบียนผู้สูงอายุ" sub={`${k.cases} เคส`}        onClick={() => onNav?.("patients")}/>
          <AdminAction icon="settings" label="ตั้งค่าระบบ"     sub="ฟอร์ม · พื้นที่"        onClick={() => onNav?.("settings")}/>
          <AdminAction icon="audit"    label="audit log"        sub="กิจกรรมการแก้ไข"      onClick={() => onNav?.("audit")}/>
        </div>
      </div>

      <div className="text-center text-[11px] text-ink-400 pb-6">
        v1.0 · LTC Care · 2569
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── KPI tile
function KPI({ value, label, sub, tone = "neutral", trend }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <div className="rounded-3xl bg-white border border-ink-100 shadow-card p-4">
      <div className="flex items-start justify-between">
        <span className={"w-8 h-8 rounded-xl grid place-items-center " + t.bg}>
          <span className={"w-2 h-2 rounded-full " + t.dot}></span>
        </span>
        {trend ? (
          <span className="text-[11px] text-ink-500 tnum inline-flex items-center gap-0.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 15l6-6 6 6"/>
            </svg>
            {trend}
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-[28px] font-medium leading-none text-ink-900 tnum">{value}</div>
      <div className="text-[12px] text-ink-700 mt-1.5 leading-tight">{label}</div>
      {sub ? <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────── Bar chart
function VisitsBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-32 grid place-items-center text-[12px] text-ink-400">
        ยังไม่มีข้อมูลการเยี่ยม
      </div>
    );
  }
  const max = Math.max(...data) || 1;
  const labels = ["จ","อ","พ","พฤ","ศ","ส","อา"];
  return (
    <div>
      <div className="flex items-end gap-1.5 h-32">
        {data.map((v, i) => {
          const h = Math.max(6, (v / max) * 100);
          const isRecent = i >= data.length - 3;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="text-[10px] text-ink-500 tnum">{v}</div>
              <div
                className={"w-full rounded-t-md transition " +
                  (isRecent ? "bg-ink-800" : "bg-ink-200")}
                style={{ height: h + "%" }}
              ></div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-ink-400 tnum">
        {data.map((_,i) => (
          <div key={i} className="flex-1 text-center">{labels[i % 7]}</div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── ADL donut
function ADLDonut({ patients = [] }) {
  const seg = [
    { label: "ติดสังคม", value: patients.filter(p => p.adl_group === "ติดสังคม").length, color: "#3e8e6a" },
    { label: "ติดบ้าน",   value: patients.filter(p => p.adl_group === "ติดบ้าน").length,  color: "#b58a3c" },
    { label: "ติดเตียง",  value: patients.filter(p => p.adl_group === "ติดเตียง").length, color: "#c0533f" }
  ];
  const total = seg.reduce((s,x)=>s+x.value, 0);
  if (total === 0) {
    return (
      <div className="h-28 grid place-items-center text-[12px] text-ink-400 text-center">
        ยังไม่มีข้อมูลการประเมิน ADL
      </div>
    );
  }
  let acc = 0;
  const R = 42, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#ecf0f7" strokeWidth="14"/>
        {seg.map((s, i) => {
          const dash = (s.value / total) * C;
          const el = (
            <circle
              key={i}
              cx="60" cy="60" r={R}
              fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 60 60)"
              strokeLinecap="butt"
            />
          );
          acc += dash;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="500" fill="#0b1530" fontFamily="Mitr">{total}</text>
        <text x="60" y="76" textAnchor="middle" fontSize="10" fill="#506aa3" fontFamily="Mitr">เคสรวม</text>
      </svg>
      <div className="flex-1 space-y-2">
        {seg.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }}></span>
            <span className="text-ink-800 flex-1">{s.label}</span>
            <span className="tnum text-ink-500">{s.value}</span>
            <span className="tnum text-ink-400 w-9 text-right">{Math.round(s.value/total*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── Visit row
function VisitRow({ v }) {
  const tone = v.risk === "เสี่ยงสูง" ? "danger" : v.risk === "เฝ้าระวัง" ? "warning" : "ok";
  const adlTone = v.adl <= 4 ? "danger" : v.adl <= 11 ? "warning" : "ok";
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="text-center shrink-0 w-12">
          <div className="text-[10px] text-ink-400 tnum">{v.date.slice(0,5)}</div>
          <div className="text-[10px] text-ink-400 tnum">{v.date.slice(6)}</div>
          <div className="mt-1 text-[10px] text-ink-500 tnum">{v.id}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="text-[13.5px] font-medium text-ink-900 truncate">{v.name}</div>
          </div>
          <div className="text-[10.5px] text-ink-500 tnum">PID {v.pid} · {v.village}</div>
          <div className="text-[11.5px] text-ink-600 mt-1 truncate">โดย {v.cg}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ScoreChip tone={adlTone}>ADL {v.adl}</ScoreChip>
            <ScoreChip tone={v.q9 >= 7 ? "warning" : "neutral"}>9Q {v.q9}</ScoreChip>
            {v.q8 > 0 ? <ScoreChip tone="danger">8Q {v.q8}</ScoreChip> : null}
            <ScoreChip tone={tone}>{v.risk}</ScoreChip>
          </div>
        </div>
        <button className="self-center text-ink-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── Admin actions
function AdminAction({ icon, label, sub, onClick }) {
  const ICON = {
    users:    <path d="M16 21v-2a4 4 0 0 0-3-3.87M3 21v-2a4 4 0 0 1 3-3.87M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>,
    patients: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>,
    settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12l2 1-1 3-2-1 M5 12l-2 1 1 3 2-1 M12 5l1-2h3l-1 2 M12 19l1 2h3l-1-2"/>,
    audit:    <path d="M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5"/>
  };
  return (
    <button onClick={onClick} className="rounded-2xl bg-white border border-ink-100 shadow-card p-4 text-left flex items-start gap-3 active:scale-[.99] transition">
      <span className="w-9 h-9 rounded-xl bg-ink-100 text-ink-800 grid place-items-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {ICON[icon]}
        </svg>
      </span>
      <span className="min-w-0">
        <div className="text-[13.5px] font-medium text-ink-900 leading-tight">{label}</div>
        <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>
      </span>
    </button>
  );
}

Object.assign(window, { AdminDashboard });


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 5 · admin-mgmt.jsx                                           ║
   ║  Admin: User Management + Patient Registry (CRUD UIs)                 ║
   ║  Exposes: UsersScreen, PatientsScreen, BottomSheet                    ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


const { useState: usM, useMemo: umM, useRef: urM, useEffect: ueM } = React;

const ROLE_BADGE = {
  "Care Giver":   { tone: "ok",      label: "Care Giver" },
  "Admin":        { tone: "neutral", label: "Admin" },
  "Case Manager": { tone: "warning", label: "Case Manager" }
};

// Map between backend role codes and the UI labels used by UsersScreen.
const ROLE_TO_UI = { caregiver: "Care Giver", case_manager: "Case Manager", admin: "Admin" };
const ROLE_TO_BE = { "Care Giver": "caregiver", "Case Manager": "case_manager", "Admin": "admin" };

// Backend user row (sanitized) → UI-shaped record.
function normalizeUser(u) {
  return {
    user_id: u.UserID || "",
    name: u.FullName || "",
    username: u.Username || "",
    role: ROLE_TO_UI[u.Role] || u.Role || "Care Giver",
    village: u.VillageID != null ? String(u.VillageID) : "",
    phone: u.Phone || "",
    email: u.Email || "",
    active: u.Active !== false,
    cases: 0,
    _raw: u
  };
}

// ────────────────────────────────────────────────────────────── Bottom Sheet
function BottomSheet({ open, onClose, title, children, actions }) {
  ueM(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]" onClick={onClose}></div>
      <div className="phone relative bg-paper-warm rounded-t-3xl max-h-[88dvh] w-full overflow-hidden animate-[slideUp_.25s_ease-out] flex flex-col"
           style={{ animation: "slideUp .25s ease-out" }}>
        <div className="pt-3 pb-1 grid place-items-center">
          <div className="w-12 h-1.5 rounded-full bg-ink-200"></div>
        </div>
        <div className="px-5 pb-2 pt-1 flex items-center justify-between">
          <h2 className="text-[16px] font-medium text-ink-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full bg-ink-100 text-ink-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4 space-y-4 flex-1">{children}</div>
        {actions ? (
          <div className="px-4 pt-3 pb-4 border-t border-ink-100 bg-paper-warm flex gap-2">{actions}</div>
        ) : null}
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── User Management
function UsersScreen({ onBack }) {
  const [users, setUsers] = usM([]);
  const [role, setRole] = usM("all");
  const [q, setQ] = usM("");
  const [editing, setEditing] = usM(null);    // user object or "new"

  const reload = () => LTC_API.listUsers()
    .then(rows => { if (Array.isArray(rows)) setUsers(rows.map(normalizeUser)); })
    .catch(() => {});
  ueM(() => { reload(); }, []);

  const filtered = umM(() => users.filter(u => {
    if (role !== "all" && u.role !== role) return false;
    if (q) {
      const n = q.toLowerCase();
      if (!(u.name + u.user_id + u.username + u.village).toLowerCase().includes(n)) return false;
    }
    return true;
  }), [users, role, q]);

  const counts = umM(() => ({
    all: users.length,
    "Care Giver":   users.filter(u => u.role === "Care Giver").length,
    "Case Manager": users.filter(u => u.role === "Case Manager").length,
    "Admin":        users.filter(u => u.role === "Admin").length
  }), [users]);

  const openNew = () => setEditing({
    user_id: "", name: "", role: "Care Giver", username: "", village: "", phone: "", cases: 0, active: true
  });

  const save = async (next) => {
    if (!next.name || !next.username || !next.phone) {
      Swal.fire({ icon: "warning", title: "ข้อมูลไม่ครบ", text: "กรุณาระบุชื่อ · username · เบอร์ติดต่อ" });
      return;
    }
    if (!/^\d{9,10}$/.test(next.phone)) {
      Swal.fire({ icon: "warning", title: "เบอร์ไม่ถูกต้อง", text: "ต้องเป็นตัวเลข 9-10 หลัก" });
      return;
    }
    const exists = !!next.user_id;
    try {
      if (exists) {
        await LTC_API.updateUser(next.user_id, {
          FullName: next.name, Role: ROLE_TO_BE[next.role] || "caregiver",
          VillageID: next.village || "", Phone: next.phone, Email: next.email || "",
          Active: next.active !== false
        });
      } else {
        await LTC_API.createUser({
          Username: next.username, FullName: next.name, Role: ROLE_TO_BE[next.role] || "caregiver",
          VillageID: next.village || "", Phone: next.phone, Email: next.email || "",
          Active: next.active !== false
        });
      }
      await reload();
      setEditing(null);
      Swal.fire({ icon: "success", title: exists ? "อัปเดตสำเร็จ" : "เพิ่มผู้ใช้สำเร็จ", timer: 1100, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", text: e.message || String(e) });
    }
  };

  // No hard-delete endpoint — disable the account (Active:false) instead.
  const remove = (u) => {
    Swal.fire({
      icon: "warning", title: "ปิดการใช้งานบัญชี?", html: `<b>${u.name}</b><br/><span style="color:#506aa3">${u.user_id}</span><br/><span style="color:#888;font-size:12px">บัญชีจะไม่ถูกลบ แต่จะเข้าสู่ระบบไม่ได้</span>`,
      showCancelButton: true, confirmButtonText: "ปิดการใช้งาน", cancelButtonText: "ยกเลิก"
    }).then(async r => {
      if (!r.isConfirmed) return;
      try {
        await LTC_API.updateUser(u.user_id, { Active: false });
        await reload();
        setEditing(null);
        Swal.fire({ icon: "success", title: "ปิดการใช้งานแล้ว", timer: 1000, showConfirmButton: false });
      } catch (e) {
        Swal.fire({ icon: "error", title: "ดำเนินการไม่สำเร็จ", text: e.message || String(e) });
      }
    });
  };

  return (
    <div className="phone phone-bg pb-28">
      <StatusBar/>
      <AppHeader
        title="จัดการผู้ใช้งาน"
        subtitle={`${users.length} บัญชี · ทั้งหน่วยงาน`}
        onBack={onBack}
      />

      {/* Search */}
      <div className="px-5">
        <div className="flex items-stretch rounded-xl bg-white border border-ink-200">
          <span className="self-center pl-3 text-ink-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหา ชื่อ / username / หมู่บ้าน"
            className="flex-1 h-11 px-3 bg-transparent outline-none text-[13.5px]"
          />
        </div>
      </div>

      {/* Role tabs */}
      <div className="px-5 mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: "all",          label: "ทั้งหมด · " + counts.all },
          { id: "Care Giver",   label: "Care Giver · " + counts["Care Giver"] },
          { id: "Case Manager", label: "Case Manager · " + counts["Case Manager"] },
          { id: "Admin",        label: "Admin · " + counts["Admin"] }
        ].map(t => {
          const on = role === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setRole(t.id)}
              className={"shrink-0 h-9 px-3.5 rounded-full text-[12.5px] " +
                (on ? "bg-ink-800 text-white" : "bg-white border border-ink-200 text-ink-700")}
            >{t.label}</button>
          );
        })}
      </div>

      {/* List */}
      <div className="px-5 mt-3 space-y-2">
        {filtered.map(u => (
          <button
            key={u.user_id}
            onClick={() => setEditing(u)}
            className="w-full text-left rounded-2xl bg-white border border-ink-100 shadow-card p-3 flex items-center gap-3 active:scale-[.995] transition"
          >
            <div className="w-11 h-11 rounded-2xl bg-paper border border-ink-100 grid place-items-center font-medium text-ink-800 text-[14px]">
              {u.name.split(/\s+/).filter(Boolean).map(p => p.slice(0,1)).slice(0,2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <div className="text-[14px] font-medium text-ink-900 truncate">{u.name}</div>
              </div>
              <div className="text-[11px] text-ink-500 tnum">{u.user_id} · @{u.username}</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <ScoreChip tone={ROLE_BADGE[u.role]?.tone}>{ROLE_BADGE[u.role]?.label || u.role}</ScoreChip>
                <span className="text-[11px] text-ink-500">{u.village}</span>
                {u.cases ? <span className="text-[11px] text-ink-500 tnum">· {u.cases} เคส</span> : null}
                <span className="ml-auto flex items-center gap-1 text-[11px]">
                  <span className={"w-1.5 h-1.5 rounded-full " + (u.active ? "bg-accent-sage" : "bg-ink-300")}></span>
                  {u.active ? "ใช้งาน" : "ปิด"}
                </span>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">
            ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไข
          </div>
        ) : null}
      </div>

      {/* FAB */}
      <button
        onClick={openNew}
        className="fixed bottom-6 right-[max(1.25rem,calc(50vw-220px+1.25rem))] w-14 h-14 rounded-2xl bg-ink-800 text-white grid place-items-center shadow-pop active:scale-95 z-20"
        aria-label="เพิ่มผู้ใช้"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>

      {/* Editor */}
      <UserEditor user={editing} onSave={save} onDelete={remove} onClose={() => setEditing(null)}/>
    </div>
  );
}

function UserEditor({ user, onSave, onDelete, onClose }) {
  const [d, setD] = usM(user || {});
  ueM(() => { setD(user || {}); }, [user]);
  if (!user) return null;
  const isNew = !user.user_id || user.user_id.startsWith("CG-") && !user.name;
  const set = (p) => setD(prev => ({ ...prev, ...p }));

  return (
    <BottomSheet
      open={!!user}
      onClose={onClose}
      title={user.name ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}
      actions={
        <>
          {user.name ? (
            <GhostButton onClick={() => onDelete(user)} className="text-accent-coral border-accent-coral/30">
              ปิดใช้งาน
            </GhostButton>
          ) : null}
          <GhostButton onClick={onClose} className="flex-1">ยกเลิก</GhostButton>
          <PrimaryButton onClick={() => onSave(d)} className="flex-1">บันทึก</PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="รหัสผู้ใช้">
          <TextInput value={d.user_id} readOnly/>
        </Field>
        <Field label="บทบาท" required>
          <Select
            value={d.role}
            onChange={e => set({ role: e.target.value })}
            options={["Care Giver","Case Manager","Admin"]}
          />
        </Field>
      </div>
      <Field label="ชื่อ - นามสกุล" required>
        <TextInput value={d.name} onChange={e => set({ name: e.target.value })} placeholder="เช่น นางสมพร  ใจดี"/>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="username" required>
          <TextInput value={d.username} onChange={e => set({ username: e.target.value.replace(/\s/g,"") })} placeholder="username" readOnly={!!d.user_id}/>
        </Field>
        <Field label="เบอร์ติดต่อ" required>
          <TextInput
            value={d.phone}
            onChange={e => set({ phone: e.target.value.replace(/[^\d]/g,"").slice(0,10) })}
            inputMode="numeric" placeholder="0812345678"
          />
        </Field>
      </div>
      <Field label="พื้นที่รับผิดชอบ">
        <Select
          value={d.village}
          onChange={e => set({ village: e.target.value })}
          options={["หมู่ 4","หมู่ 5","หมู่ 6","หมู่ 7","ทั้งตำบล","—"]}
        />
      </Field>
      <Toggle
        value={!!d.active}
        onChange={v => set({ active: v })}
        label="สถานะใช้งาน"
        sub={d.active ? "สามารถเข้าสู่ระบบได้" : "ระงับการเข้าสู่ระบบ"}
      />
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────── Patient Registry
function PatientsScreen({ onBack }) {
  const [list, setList] = usM([]);
  const [q, setQ] = usM("");
  const [grp, setGrp] = usM("all");
  const [editing, setEditing] = usM(null);

  const reload = () => LTC_API.listPatients()
    .then(rows => { if (Array.isArray(rows)) setList(rows); })
    .catch(() => {});
  ueM(() => { reload(); }, []);

  // Map the editor's (app-shaped) record to the backend patient row schema.
  const toBackend = (p) => ({
    PID: p.pid,
    FullName: p.name,
    BirthDate: p.birthdateBE || "",
    Age: (p.age === "" || p.age == null) ? "" : Number(p.age),
    Sex: p.sex,
    VillageID: p.village_id || p.village || "",
    Address: p.address || "",
    HouseholdCaregiverName: p.caregiver_at_home || "",
    HouseholdRelationID: p.relation || "",
    HouseholdContact: p.contact || "",
    AssignedCaregiverUserID: p.assigned_cg_id || ""
  });

  const filtered = umM(() => list.filter(p => {
    if (grp !== "all" && p.adl_group !== grp) return false;
    if (q) {
      const n = q.toLowerCase();
      if (!(p.name + p.pid + p.village).toLowerCase().includes(n)) return false;
    }
    return true;
  }), [list, q, grp]);

  const groupCounts = umM(() => ({
    all: list.length,
    "ติดสังคม": list.filter(p=>p.adl_group==="ติดสังคม").length,
    "ติดบ้าน":   list.filter(p=>p.adl_group==="ติดบ้าน").length,
    "ติดเตียง":  list.filter(p=>p.adl_group==="ติดเตียง").length
  }), [list]);

  const openNew = () => setEditing({
    pid:"", name:"", age:"", sex:"หญิง", village:"หมู่ 4 บ้านทรายไหลแล้ง",
    address:"", caregiver_at_home:"", relation:"บุตร", contact:"",
    adl_group:"ติดบ้าน", last_visit:"—", visit_count:0, risk:"ปกติ", distance_km:1
  });

  const save = async (next) => {
    if (!/^\d{13}$/.test(next.pid)) {
      Swal.fire({ icon: "warning", title: "PID ไม่ถูกต้อง", text: "ต้องเป็นตัวเลข 13 หลัก" });
      return;
    }
    if (!next.name) {
      Swal.fire({ icon: "warning", title: "ระบุชื่อผู้สูงอายุ" });
      return;
    }
    if (next.contact && !/^\d{9,10}$/.test(next.contact)) {
      Swal.fire({ icon: "warning", title: "เบอร์ไม่ถูกต้อง", text: "ต้องเป็นตัวเลข 9-10 หลัก" });
      return;
    }
    const exists = list.some(p => String(p.pid) === String(next.pid));
    try {
      const payload = toBackend(next);
      if (exists) { delete payload.PID; await LTC_API.updatePatient(next.pid, payload); }
      else        await LTC_API.createPatient(payload);
      await reload();
      setEditing(null);
      Swal.fire({ icon: "success", title: exists ? "อัปเดตสำเร็จ" : "เพิ่มผู้สูงอายุสำเร็จ", timer: 1100, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", text: e.message || String(e) });
    }
  };

  const remove = (p) => {
    Swal.fire({
      icon: "warning", title: "ลบเคส?", html: `<b>${p.name}</b><br/>PID ${p.pid}`,
      showCancelButton: true, confirmButtonText: "ลบ", cancelButtonText: "ยกเลิก"
    }).then(async r => {
      if (!r.isConfirmed) return;
      try {
        await LTC_API.deletePatient(p.pid);
        await reload();
        setEditing(null);
        Swal.fire({ icon: "success", title: "ลบแล้ว", timer: 900, showConfirmButton: false });
      } catch (e) {
        Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", text: e.message || String(e) });
      }
    });
  };

  return (
    <div className="phone phone-bg pb-28">
      <StatusBar/>
      <AppHeader
        title="ทะเบียนผู้สูงอายุ"
        subtitle={`${list.length} เคส · ทั้งตำบล`}
        onBack={onBack}
      />

      <div className="px-5">
        <div className="flex items-stretch rounded-xl bg-white border border-ink-200">
          <span className="self-center pl-3 text-ink-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหา ชื่อ / PID / หมู่บ้าน"
            className="flex-1 h-11 px-3 bg-transparent outline-none text-[13.5px]"
          />
        </div>
      </div>

      <div className="px-5 mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: "all",       label: "ทั้งหมด · " + groupCounts.all },
          { id: "ติดสังคม",  label: "ติดสังคม · " + groupCounts["ติดสังคม"] },
          { id: "ติดบ้าน",   label: "ติดบ้าน · " + groupCounts["ติดบ้าน"] },
          { id: "ติดเตียง",  label: "ติดเตียง · " + groupCounts["ติดเตียง"] }
        ].map(t => {
          const on = grp === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setGrp(t.id)}
              className={"shrink-0 h-9 px-3.5 rounded-full text-[12.5px] " +
                (on ? "bg-ink-800 text-white" : "bg-white border border-ink-200 text-ink-700")}
            >{t.label}</button>
          );
        })}
      </div>

      <div className="px-5 mt-3 space-y-3">
        {filtered.map(p => (
          <button
            key={p.pid}
            onClick={() => setEditing(p)}
            className="w-full text-left rounded-3xl bg-white border border-ink-100 shadow-card p-4 active:scale-[.995] transition"
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-paper grid place-items-center font-medium text-ink-700">
                {p.name.replace(/^น(าง|าย|.ส.)\s*/,"").slice(0,2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <div className="text-[14.5px] font-medium text-ink-900 truncate">{p.name}</div>
                  <div className="text-[11px] text-ink-500 tnum shrink-0">{p.age} ปี · {p.sex}</div>
                </div>
                <div className="text-[11px] text-ink-500 tnum">PID {p.pid}</div>
                <div className="text-[12px] text-ink-600 mt-1 truncate">{p.village}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  {p.adl_group ? <ScoreChip tone={p.adl_group==="ติดเตียง"?"danger":p.adl_group==="ติดบ้าน"?"warning":"ok"}>{p.adl_group}</ScoreChip> : null}
                  {p.risk ? <ScoreChip tone={p.risk==="เสี่ยงสูง"?"danger":p.risk==="เฝ้าระวัง"?"warning":"ok"}>{p.risk}</ScoreChip> : null}
                  <span className="ml-auto text-[11px] text-ink-500 tnum">{p.visit_count} ครั้ง</span>
                </div>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">
            ไม่พบเคสที่ตรงกับเงื่อนไข
          </div>
        ) : null}
      </div>

      <button
        onClick={openNew}
        className="fixed bottom-6 right-[max(1.25rem,calc(50vw-220px+1.25rem))] w-14 h-14 rounded-2xl bg-ink-800 text-white grid place-items-center shadow-pop active:scale-95 z-20"
        aria-label="เพิ่มผู้สูงอายุ"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>

      <PatientEditor patient={editing} onSave={save} onDelete={remove} onClose={() => setEditing(null)}/>
    </div>
  );
}

function PatientEditor({ patient, onSave, onDelete, onClose }) {
  const [d, setD] = usM(patient || {});
  ueM(() => { setD(patient || {}); }, [patient]);
  if (!patient) return null;
  const set = (p) => setD(prev => ({ ...prev, ...p }));

  return (
    <BottomSheet
      open={!!patient}
      onClose={onClose}
      title={patient.name ? "แก้ไขข้อมูลผู้สูงอายุ" : "เพิ่มผู้สูงอายุ"}
      actions={
        <>
          {patient.name ? (
            <GhostButton onClick={() => onDelete(patient)} className="text-accent-coral border-accent-coral/30">
              ลบ
            </GhostButton>
          ) : null}
          <GhostButton onClick={onClose} className="flex-1">ยกเลิก</GhostButton>
          <PrimaryButton onClick={() => onSave(d)} className="flex-1">บันทึก</PrimaryButton>
        </>
      }
    >
      <Field label="เลขประจำตัวประชาชน (PID)" required hint="13 หลัก">
        <TextInput
          value={d.pid}
          onChange={e => set({ pid: e.target.value.replace(/[^\d]/g,"").slice(0,13) })}
          inputMode="numeric"
          placeholder="1490800000000"
        />
      </Field>
      <Field label="ชื่อ - นามสกุล" required>
        <TextInput value={d.name} onChange={e => set({ name: e.target.value })} placeholder="เช่น นางบุญมี  สุขสมบัติ"/>
      </Field>
      <Field label="วันเดือนปีเกิด (พ.ศ.)" hint="เลือกจากปฏิทิน">
        <ThaiDatePicker value={d.birthdateBE} onChange={iso => set({ birthdateBE: iso })}/>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="อายุ" hint="คำนวณจากวันเกิด">
          <TextInput value={ageFromBE(d.birthdateBE)} readOnly inputMode="numeric" suffix="ปี" placeholder="—"/>
        </Field>
        <Field label="เพศ">
          <Select
            value={d.sex}
            onChange={e => set({ sex: e.target.value })}
            options={["หญิง","ชาย"]}
          />
        </Field>
      </div>
      <Field label="หมู่บ้าน">
        <Select
          value={d.village}
          onChange={e => set({ village: e.target.value })}
          options={[
            "หมู่ 4 บ้านทรายไหลแล้ง",
            "หมู่ 5 บ้านดอนสวรรค์",
            "หมู่ 6 บ้านนาทุ่ง",
            "หมู่ 7 บ้านโนนหินดำ"
          ]}
        />
      </Field>
      <Field label="ที่อยู่">
        <TextInput value={d.address} onChange={e => set({ address: e.target.value })} placeholder="บ้านเลขที่ / หมู่ที่ / ตำบล"/>
      </Field>
      <div className="dotted-rule"></div>
      <div className="text-[12px] text-ink-500 -mb-2">ผู้ดูแลในครัวเรือน</div>
      <Field label="ชื่อผู้ดูแล">
        <TextInput value={d.caregiver_at_home} onChange={e => set({ caregiver_at_home: e.target.value })} placeholder="เช่น นายสมพร  สุขสมบัติ"/>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ความสัมพันธ์">
          <Select value={d.relation} onChange={e => set({ relation: e.target.value })} options={RELATIONS}/>
        </Field>
        <Field label="เบอร์ติดต่อ">
          <TextInput
            value={d.contact}
            onChange={e => set({ contact: e.target.value.replace(/[^\d]/g,"").slice(0,10) })}
            inputMode="numeric"
            placeholder="0812345678"
          />
        </Field>
      </div>
      <div className="dotted-rule"></div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ระดับการพึ่งพิง">
          <Select value={d.adl_group} onChange={e => set({ adl_group: e.target.value })} options={["ติดสังคม","ติดบ้าน","ติดเตียง"]}/>
        </Field>
        <Field label="ระดับความเสี่ยง">
          <Select value={d.risk} onChange={e => set({ risk: e.target.value })} options={["ปกติ","เฝ้าระวัง","เสี่ยงสูง"]}/>
        </Field>
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────── Assign Care Giver (Admin)
function AssignScreen({ onBack }) {
  const [list, setList] = usM([]);
  const [caregivers, setCaregivers] = usM([]); // [{id, name}]
  const [q, setQ] = usM("");
  const [picking, setPicking] = usM(null); // patient currently being (re)assigned

  // Load the full roster + the real list of staff Care Givers from the backend.
  ueM(() => {
    let alive = true;
    LTC_API.listPatients().then(rows => {
      if (alive && Array.isArray(rows)) setList(rows);
    }).catch(() => {});
    LTC_API.listCaregivers().then(rows => {
      if (alive && Array.isArray(rows)) setCaregivers(rows);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const filtered = umM(() => list.filter(p => {
    if (!q) return true;
    const n = q.toLowerCase();
    return (p.name + p.pid + p.village + (p.assigned_cg || "")).toLowerCase().includes(n);
  }), [list, q]);

  const assignedCount = umM(() => list.filter(p => p.assigned_cg_id).length, [list]);
  const unassignedCount = list.length - assignedCount;

  const apply = async (patient_id, caregiver) => {
    try {
      // assignCaregiver(pid, caregiverUserId) — backend validates the user is role caregiver.
      if (!caregiver || !caregiver.id) return;
      await LTC_API.assignCaregiver(patient_id, caregiver.id);
      setList(list.map(p => (p.patient_id === patient_id || p.pid === patient_id)
        ? { ...p, assigned_cg: caregiver.name, assigned_cg_id: caregiver.id } : p));
      setPicking(null);
      Swal.fire({
        icon: "success",
        title: "มอบหมายสำเร็จ",
        html: `มอบหมายให้ <b>${caregiver.name}</b>`,
        timer: 1200, showConfirmButton: false
      });
    } catch (e) {
      Swal.fire({ icon: "error", title: "มอบหมายไม่สำเร็จ", text: e.message || String(e) });
    }
  };

  return (
    <div className="phone phone-bg pb-28">
      <StatusBar/>
      <AppHeader title="มอบหมาย Care Giver" subtitle={`${list.length} เคส · มอบหมายแล้ว ${assignedCount}`} onBack={onBack}/>

      {/* Summary */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-white border border-ink-100 shadow-card p-4">
          <div className="text-[26px] font-medium text-ink-900 tnum leading-none">{assignedCount}</div>
          <div className="text-[12px] text-ink-600 mt-1">มอบหมายแล้ว</div>
        </div>
        <div className={"rounded-2xl border shadow-card p-4 " + (unassignedCount ? "bg-accent-coral/5 border-accent-coral/30" : "bg-white border-ink-100")}>
          <div className={"text-[26px] font-medium tnum leading-none " + (unassignedCount ? "text-accent-coral" : "text-ink-900")}>{unassignedCount}</div>
          <div className="text-[12px] text-ink-600 mt-1">ยังไม่มอบหมาย</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 mb-3">
        <div className="flex items-stretch rounded-xl bg-white border border-ink-200">
          <span className="self-center pl-3 text-ink-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ผู้สูงอายุ / Care Giver" className="flex-1 h-11 px-3 bg-transparent outline-none text-[13.5px]"/>
        </div>
      </div>

      {/* List */}
      <div className="px-5 space-y-3">
        {filtered.map(p => {
          const cg = p.assigned_cg;
          return (
            <div key={p.pid} className="rounded-3xl bg-white border border-ink-100 shadow-card p-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-paper grid place-items-center font-medium text-ink-700">
                  {p.name.replace(/^น(าง|าย|.ส.)\s*/,"").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-ink-900 truncate">{p.name}</div>
                  <div className="text-[11.5px] text-ink-500 truncate">{p.village}</div>
                  <div className="mt-2">
                    {cg ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-sage"></span>{cg}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-accent-coral">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-coral"></span>ยังไม่มอบหมาย
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setPicking(p)}
                  className="self-center shrink-0 h-9 px-3.5 rounded-full text-[12.5px] bg-ink-800 text-white active:scale-95 transition"
                >{cg ? "เปลี่ยน" : "มอบหมาย"}</button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">ไม่พบเคสที่ตรงกับเงื่อนไข</div>
        ) : null}
      </div>

      {/* Picker sheet */}
      <BottomSheet
        open={!!picking}
        onClose={() => setPicking(null)}
        title={picking ? `มอบหมาย · ${picking.name}` : ""}
      >
        {picking ? (
          <div className="space-y-2">
            {caregivers.map(cg => {
              const on = String(picking.assigned_cg_id) === String(cg.id);
              return (
                <button
                  key={cg.id}
                  onClick={() => apply(picking.patient_id || picking.pid, cg)}
                  className={"w-full text-left rounded-2xl border p-3.5 flex items-center gap-3 transition " + (on ? "radio-card-on" : "border-ink-200 bg-white")}
                >
                  <div className="w-10 h-10 rounded-xl bg-paper grid place-items-center font-medium text-ink-700">
                    {cg.name.replace(/^น(าง|าย|.ส.)\s*/,"").slice(0,2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-ink-900 truncate">{cg.name}</div>
                  </div>
                  {on ? <span className="text-[11px] text-ink-700 shrink-0">ปัจจุบัน</span> : null}
                </button>
              );
            })}
            {caregivers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink-200 p-6 text-center text-ink-500 text-[12.5px]">ยังไม่มีบัญชี Care Giver ในระบบ</div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}

// ─────────────────────────────────────────────────────── System Settings (Admin)
function SettingsScreen({ onBack }) {
  const [cfg, setCfg] = usM({
    requireGPS: true,
    requirePhotos: true,
    requireADL: true,
    autoFlag8Q: true,
    defaultRadiusKm: "5"
  });
  const set = (p) => setCfg(prev => ({ ...prev, ...p }));

  // ── Backend connection (Task #15) ──────────────────────────────────────────
  const [apiUrl, setApiUrl] = usM(LTC_API.getBaseUrl());
  const [conn, setConn] = usM({ state: LTC_API.isLive() ? "live" : "mock", msg: "" });
  const [testing, setTesting] = usM(false);

  const testConnection = async () => {
    const url = (apiUrl || "").trim();
    if (!url) {
      Swal.fire({ icon: "warning", title: "ยังไม่ได้กรอก URL", text: "วาง Web App URL ของ Google Apps Script ก่อนทดสอบ" });
      return;
    }
    setTesting(true);
    const prev = LTC_API.getBaseUrl();
    try {
      LTC_API.setBaseUrl(url);               // ping() reads from stored base URL
      const data = await LTC_API.ping();
      setConn({ state: "live", msg: `${data.service || "LTC"} v${data.version || "?"}` });
      Swal.fire({ icon: "success", title: "เชื่อมต่อสำเร็จ", html: `<div style="font-size:13px;color:#13224a">${data.service || "LTC API"} · v${data.version || "?"}</div>`, timer: 1500, showConfirmButton: false });
    } catch (e) {
      LTC_API.setBaseUrl(prev);              // roll back on failure
      setConn({ state: "error", msg: e.message || String(e) });
      Swal.fire({ icon: "error", title: "เชื่อมต่อไม่สำเร็จ", text: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    // Persist the API base URL so the app talks to the live backend next reload.
    const url = (apiUrl || "").trim();
    LTC_API.setBaseUrl(url);
    setConn(c => ({ ...c, state: url ? "live" : "mock" }));
    Swal.fire({
      icon: "success",
      title: "บันทึกการตั้งค่าแล้ว",
      html: url
        ? `<div style="font-size:13px;color:#506aa3">โหมดเชื่อมต่อ backend จริง</div>`
        : `<div style="font-size:13px;color:#506aa3">โหมดตัวอย่าง (ไม่ได้ตั้งค่า URL)</div>`,
      timer: 1300, showConfirmButton: false
    });
  };

  const connBadge = conn.state === "live"
    ? { bg: "bg-accent-sage/12", dot: "bg-accent-sage", text: "text-accent-sage", label: "เชื่อมต่อ backend จริง" }
    : conn.state === "error"
    ? { bg: "bg-accent-coral/12", dot: "bg-accent-coral", text: "text-accent-coral", label: "เชื่อมต่อไม่สำเร็จ" }
    : { bg: "bg-ink-100", dot: "bg-ink-400", text: "text-ink-500", label: "โหมดตัวอย่าง (Mock)" };

  return (
    <div className="phone phone-bg pb-28">
      <StatusBar/>
      <AppHeader title="ตั้งค่าระบบ" subtitle="การเชื่อมต่อ · ฟอร์ม · พื้นที่" onBack={onBack}/>

      <div className="px-5 space-y-5">
        <SectionCard title="การเชื่อมต่อ Backend">
          <div className="flex items-center gap-2 mb-3">
            <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium " + connBadge.bg + " " + connBadge.text}>
              <span className={"w-1.5 h-1.5 rounded-full " + connBadge.dot}></span>
              {connBadge.label}
            </span>
            {conn.msg ? <span className="text-[11px] text-ink-500 truncate">{conn.msg}</span> : null}
          </div>
          <Field label="Web App URL (Google Apps Script)" hint="วาง URL จากการ Deploy → Web app · เว้นว่างเพื่อใช้โหมดตัวอย่าง">
            <input
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              spellCheck={false}
              autoCapitalize="off"
              className="w-full h-11 px-3 rounded-xl bg-white border border-ink-200 outline-none text-[12.5px] font-mono focus:border-ink-600"
            />
          </Field>
          <div className="mt-2">
            <GhostButton onClick={testConnection} disabled={testing} className={"w-full " + (testing ? "saving" : "")}>
              {testing ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}
            </GhostButton>
          </div>
        </SectionCard>

        <SectionCard title="ข้อกำหนดการบันทึกเยี่ยม">
          <div className="space-y-2.5">
            <Toggle value={cfg.requireGPS}    onChange={v => set({ requireGPS: v })}    label="บังคับพิกัด GPS" sub="ต้องระบุพิกัดก่อนบันทึกการเยี่ยม"/>
            <Toggle value={cfg.requirePhotos} onChange={v => set({ requirePhotos: v })} label="บังคับแนบภาพถ่าย" sub="อย่างน้อย 1 ภาพต่อการเยี่ยม"/>
            <Toggle value={cfg.requireADL}    onChange={v => set({ requireADL: v })}    label="บังคับประเมิน ADL" sub="ต้องทำแบบประเมิน Barthel ทุกครั้ง"/>
            <Toggle value={cfg.autoFlag8Q}    onChange={v => set({ autoFlag8Q: v })}    label="แจ้งเตือนอัตโนมัติเมื่อ 8Q > 0" sub="ส่งเคสเข้า Case Manager ทันที"/>
          </div>
        </SectionCard>

        <SectionCard title="พื้นที่รับผิดชอบ">
          <Field label="รัศมีเขตบริการเริ่มต้น" hint="ใช้กับการคำนวณระยะทางการเยี่ยม">
            <Select
              value={cfg.defaultRadiusKm}
              onChange={e => set({ defaultRadiusKm: e.target.value })}
              options={[
                { value: "3", label: "3 กิโลเมตร" },
                { value: "5", label: "5 กิโลเมตร" },
                { value: "10", label: "10 กิโลเมตร" }
              ]}
            />
          </Field>
          <div className="text-[12px] text-ink-500 leading-relaxed">
            หมู่บ้านในความรับผิดชอบ: หมู่ 4 บ้านทรายไหลแล้ง · หมู่ 5 บ้านดอนสวรรค์ · หมู่ 6 บ้านนาทุ่ง · หมู่ 7 บ้านโนนหินดำ
          </div>
        </SectionCard>

        <SectionCard title="ความปลอดภัย">
          <div className="text-[12.5px] text-ink-600 leading-relaxed">
            รหัสผ่านเริ่มต้นของผู้ใช้ใหม่คือ <b>1234</b> — กำหนดให้ผู้ใช้เปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งแรก
          </div>
          <div className="mt-2">
            <GhostButton onClick={() => Swal.fire({ icon: "info", title: "รีเซ็ตรหัสผ่าน", text: "เลือกผู้ใช้จากเมนูจัดการผู้ใช้งานเพื่อรีเซ็ตรหัสผ่าน" })} className="w-full">
              รีเซ็ตรหัสผ่านผู้ใช้
            </GhostButton>
          </div>
        </SectionCard>

        <PrimaryButton onClick={save} className="w-full">บันทึกการตั้งค่า</PrimaryButton>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Audit Log (Admin)
// The backend exposes no audit-log endpoint yet → empty until one exists.
const AUDIT_LOG = [];
const AUDIT_LABELS = {
  assign_caregiver: "มอบหมาย Care Giver",
  submit_visit: "บันทึกการเยี่ยม",
  create_user: "เพิ่มผู้ใช้",
  update_patient: "แก้ไขข้อมูลผู้สูงอายุ",
  reset_password: "รีเซ็ตรหัสผ่าน",
  login: "เข้าสู่ระบบ"
};

function AuditLogScreen({ onBack }) {
  const [q, setQ] = usM("");
  const filtered = umM(() => AUDIT_LOG.filter(a => {
    if (!q) return true;
    const n = q.toLowerCase();
    return (a.actor + a.target + a.detail + (AUDIT_LABELS[a.action] || a.action)).toLowerCase().includes(n);
  }), [q]);

  return (
    <div className="phone phone-bg pb-28">
      <StatusBar/>
      <AppHeader title="บันทึกกิจกรรม (Audit Log)" subtitle={`${AUDIT_LOG.length} รายการล่าสุด`} onBack={onBack}/>

      <div className="px-5 mb-3">
        <div className="flex items-stretch rounded-xl bg-white border border-ink-200">
          <span className="self-center pl-3 text-ink-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ผู้ใช้ / เคส / กิจกรรม" className="flex-1 h-11 px-3 bg-transparent outline-none text-[13.5px]"/>
        </div>
      </div>

      <div className="px-5 space-y-2.5">
        {filtered.map(a => {
          const t = TONE[a.tone] || TONE.neutral;
          return (
            <div key={a.id} className="rounded-2xl bg-white border border-ink-100 shadow-card p-4">
              <div className="flex items-center gap-2">
                <span className={"w-7 h-7 rounded-lg grid place-items-center " + t.bg}>
                  <span className={"w-2 h-2 rounded-full " + t.dot}></span>
                </span>
                <span className="text-[13px] font-medium text-ink-900">{AUDIT_LABELS[a.action] || a.action}</span>
                <span className="ml-auto text-[11px] text-ink-500 tnum">{a.ts}</span>
              </div>
              <div className="mt-2 text-[12.5px] text-ink-700">{a.detail}</div>
              <div className="mt-1 text-[11.5px] text-ink-500">
                โดย {a.actor} · เป้าหมาย {a.target}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">ไม่พบกิจกรรมที่ตรงกับเงื่อนไข</div>
        ) : null}
      </div>
    </div>
  );
}

Object.assign(window, { UsersScreen, PatientsScreen, BottomSheet, AssignScreen, SettingsScreen, AuditLogScreen });


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 6 · case-manager.jsx                                         ║
   ║  Case Manager — risk-case tracking · comment thread · QA review       ║
   ║  Exposes: CaseManagerScreen, CaseDetailScreen                         ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


const { useState: usC, useMemo: umC, useRef: urC, useEffect: ueC } = React;

const CM_USER = {
  name: "Case Manager",
  role: "Case Manager",
  initials: ""
};

// Map a backend case status → the UI status taxonomy (urgent/watch/qa/resolved).
function mapCaseStatus_(beStatus, risk) {
  if (beStatus === "resolved") return "resolved";
  if (beStatus === "escalated") return "urgent";
  if (beStatus === "monitoring") return "qa";
  // open
  return (risk === "เสี่ยงสูง") ? "urgent" : "watch";
}

// Build the UI case list from real backend rows (listCases) joined with the
// patient roster + visit feed (for ADL/9Q/8Q chips on the triggering visit).
async function loadCases_() {
  const [cases, patients, visits] = await Promise.all([
    LTC_API.listCases({}).catch(() => []),
    LTC_API.listPatients().catch(() => []),
    LTC_API.listVisits({ limit: 500 }).catch(() => [])
  ]);
  const pmap = {}; (patients || []).forEach(p => { pmap[String(p.pid)] = p; });
  const vmap = {}; (visits || []).forEach(v => { const raw = v._raw || v; if (raw.VisitID) vmap[raw.VisitID] = raw; });
  const num = (x) => (x === "" || x == null || isNaN(+x)) ? 0 : +x;
  return (cases || []).map(c => {
    const pid = String(c.PID != null ? c.PID : "");
    const p = pmap[pid] || {};
    const tv = vmap[c.TriggeringVisitID] || {};
    const status = mapCaseStatus_(c.Status, c.RiskLevel || p.risk);
    return {
      pid,
      caseId: c.CaseID || "",
      name: p.name || pid || "—",
      village: p.village || "",
      cg: p.assigned_cg || "—",
      adl: num(tv.ADLTotal),
      q9: num(tv.NineQTotal),
      q8: num(tv.EightQTotal),
      risk: c.RiskLevel || p.risk || "ปกติ",
      last_visit: String(c.OpenedAt || tv.VisitDate || "").slice(0, 10) || "—",
      status,
      qa_pending: status === "qa",
      _raw: c
    };
  });
}

// Comment threads keyed by PID — no backend feed yet, so none are seeded.
const SEED_COMMENTS = {};

const QA_RUBRIC = [
  { id: "complete",   label: "ความครบถ้วนของข้อมูล",      hint: "กรอกครบทุก section · ไม่มีช่องว่าง" },
  { id: "accuracy",   label: "ความถูกต้องของการประเมิน",  hint: "BMI · ADL · 2Q/9Q สอดคล้องกับอาการ" },
  { id: "photos",     label: "หลักฐานภาพถ่าย",            hint: "ภาพชัด แสดงกิจกรรมจริง" },
  { id: "timeliness", label: "ความตรงต่อเวลา",            hint: "บันทึกภายใน 24 ชม. หลังเยี่ยม" },
  { id: "followup",   label: "การติดตามและประสาน",         hint: "แจ้งทีมเมื่อพบความเสี่ยง" }
];

const STATUS_META = {
  urgent:   { label: "เร่งด่วน",        tone: "danger",  icon: "!" },
  watch:    { label: "ติดตาม",         tone: "warning", icon: "›" },
  qa:       { label: "ตรวจสอบคุณภาพ",  tone: "neutral", icon: "Q" },
  resolved: { label: "แก้ไขแล้ว",       tone: "ok",      icon: "✓" }
};

// ─────────────────────────────────────────────────────────── CASE LIST
function CaseManagerScreen({ onLogout, onOpenCase }) {
  const [cases, setCases] = usC([]);
  const [tab, setTab] = usC("urgent");
  const [q, setQ] = usC("");

  ueC(() => {
    let alive = true;
    loadCases_().then(rows => { if (alive && Array.isArray(rows)) setCases(rows); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const filtered = umC(() => cases.filter(c => {
    if (tab !== "all" && c.status !== tab) return false;
    if (q && !(c.name + c.pid + c.village).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [cases, tab, q]);

  const counts = umC(() => ({
    all: cases.length,
    urgent: cases.filter(c => c.status === "urgent").length,
    watch: cases.filter(c => c.status === "watch").length,
    qa: cases.filter(c => c.qa_pending).length,
    resolved: cases.filter(c => c.status === "resolved").length
  }), [cases]);

  return (
    <div className="phone phone-bg pb-12">
      <StatusBar/>

      <header className="px-5 pt-2 pb-3 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-ink-800 text-white grid place-items-center font-medium text-[15px]">
          {CM_USER.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] text-ink-500">{CM_USER.role}</div>
          <div className="text-[15px] font-medium text-ink-900 truncate">{CM_USER.name}</div>
        </div>
        <button
          onClick={onLogout}
          className="w-10 h-10 grid place-items-center rounded-full bg-white border border-ink-200 text-ink-700"
          aria-label="ออกจากระบบ"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
          </svg>
        </button>
      </header>

      <div className="px-5 mb-3">
        <div className="text-[11.5px] tracking-[0.18em] text-ink-500 uppercase">Case Tracking</div>
        <h1 className="text-[22px] font-medium text-ink-900 leading-tight">ติดตามเคสและคุณภาพการดูแล</h1>
        <div className="text-[12px] text-ink-500 mt-0.5">รพ.สต.บ้านทรายไหลแล้ง · ปรับล่าสุด {thaiDateString()}</div>
      </div>

      {/* Hero — urgent summary */}
      <div className="mx-5 mb-5 rounded-3xl bg-ink-800 text-white p-5 shadow-pop relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5"></div>
        <div className="relative grid grid-cols-3 gap-4">
          <div>
            <div className="text-[40px] font-medium tnum leading-none text-accent-coral">{counts.urgent}</div>
            <div className="text-[11.5px] mt-1 opacity-80">เร่งด่วน<br/>8Q &gt; 0</div>
          </div>
          <div>
            <div className="text-[40px] font-medium tnum leading-none">{counts.watch}</div>
            <div className="text-[11.5px] mt-1 opacity-80">ติดตาม<br/>9Q ≥ 7 หรือ ADL ≤ 4</div>
          </div>
          <div>
            <div className="text-[40px] font-medium tnum leading-none">{counts.qa}</div>
            <div className="text-[11.5px] mt-1 opacity-80">QA<br/>รอตรวจสอบ</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 mb-3">
        <div className="flex items-stretch rounded-xl bg-white border border-ink-200">
          <span className="self-center pl-3 text-ink-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหา ชื่อเคส / PID / หมู่บ้าน"
            className="flex-1 h-11 px-3 bg-transparent outline-none text-[13.5px]"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: "urgent",   label: "เร่งด่วน · " + counts.urgent },
          { id: "watch",    label: "ติดตาม · "   + counts.watch },
          { id: "qa",       label: "ตรวจ QA · "  + counts.qa },
          { id: "resolved", label: "แก้ไขแล้ว · "+ counts.resolved },
          { id: "all",      label: "ทั้งหมด · "  + counts.all }
        ].map(t => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={"shrink-0 h-9 px-3.5 rounded-full text-[12.5px] " +
                (on ? "bg-ink-800 text-white" : "bg-white border border-ink-200 text-ink-700")}
            >{t.label}</button>
          );
        })}
      </div>

      {/* Cases */}
      <div className="px-5 space-y-3">
        {filtered.map(c => <CaseCard key={c.pid} c={c} onOpen={() => onOpenCase(c)}/>)}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">
            ไม่พบเคสในหมวดนี้
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CaseCard({ c, onOpen }) {
  const meta = STATUS_META[c.status];
  const commentCount = (SEED_COMMENTS[c.pid] || []).length;
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-3xl bg-white border border-ink-100 shadow-card p-4 active:scale-[.995] transition"
    >
      <div className="flex items-start gap-3">
        <span className={"w-10 h-10 rounded-2xl grid place-items-center text-[15px] font-medium shrink-0 " + TONE[meta.tone].bg + " " + TONE[meta.tone].fg}>
          {meta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="text-[14.5px] font-medium text-ink-900 truncate">{c.name}</div>
            <ScoreChip tone={meta.tone}>{meta.label}</ScoreChip>
          </div>
          <div className="text-[11px] text-ink-500 tnum">PID {c.pid} · {c.village}</div>
          <div className="text-[12px] text-ink-600 mt-1.5 truncate">CG: {c.cg}</div>
        </div>
      </div>
      <div className="dotted-rule my-3"></div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <ScoreChip tone={c.adl <= 4 ? "danger" : c.adl <= 11 ? "warning" : "ok"}>ADL {c.adl}</ScoreChip>
          <ScoreChip tone={c.q9 >= 7 ? "warning" : "neutral"}>9Q {c.q9}</ScoreChip>
          {c.q8 > 0 ? <ScoreChip tone="danger">8Q {c.q8}</ScoreChip> : null}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1 tnum">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-1.5 4.8L21 21l-4.7-1.5a8.4 8.4 0 1 1 4.7-8z"/></svg>
            {commentCount}
          </span>
          <span className="tnum">{c.last_visit}</span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────── CASE DETAIL
function CaseDetailScreen({ kase, onBack }) {
  const [tab, setTab] = usC("thread");
  const [comments, setComments] = usC(() => SEED_COMMENTS[kase.pid] || []);
  const [draft, setDraft] = usC("");
  const [qa, setQa] = usC(() => Object.fromEntries(QA_RUBRIC.map(r => [r.id, 4])));
  const [status, setStatus] = usC(kase.status);

  const post = () => {
    if (!draft.trim()) return;
    setComments([...comments, {
      author: CM_USER.name, role: "Case Manager",
      time: `${thaiDateString()} ${thaiTimeString()}`,
      text: draft.trim()
    }]);
    setDraft("");
  };

  const qaAvg = umC(() => {
    const vals = Object.values(qa);
    return (vals.reduce((s,v)=>s+v,0) / vals.length).toFixed(1);
  }, [qa]);

  const escalate = () => {
    Swal.fire({
      icon: "warning",
      title: "ส่งต่อ รพ.อำเภอ?",
      html: `<b>${kase.name}</b><br/><span style="color:#506aa3">PID ${kase.pid}</span><br/><br/>
             ระบบจะสร้าง refer note และแจ้งทีมจิตเวช รพ.มุกดาหาร`,
      showCancelButton: true,
      confirmButtonText: "ส่งต่อ",
      cancelButtonText: "ยกเลิก"
    }).then(r => {
      if (r.isConfirmed) {
        setStatus("watch");
        Swal.fire({ icon: "success", title: "ส่ง refer note สำเร็จ", timer: 1200, showConfirmButton: false });
      }
    });
  };

  const markResolved = () => {
    Swal.fire({
      icon: "question",
      title: "ปิดเคส?",
      text: "เคสนี้จะถูกย้ายไปหมวดแก้ไขแล้ว",
      showCancelButton: true,
      confirmButtonText: "ยืนยัน",
      cancelButtonText: "ยกเลิก"
    }).then(r => {
      if (r.isConfirmed) {
        setStatus("resolved");
        Swal.fire({ icon: "success", title: "ปิดเคสแล้ว", timer: 1100, showConfirmButton: false });
      }
    });
  };

  const meta = STATUS_META[status];

  return (
    <div className="phone phone-bg pb-32">
      <StatusBar/>
      <AppHeader
        title={kase.name}
        subtitle={`PID ${kase.pid} · ${kase.village}`}
        onBack={onBack}
        right={<ScoreChip tone={meta.tone}>{meta.label}</ScoreChip>}
      />

      {/* Score timeline */}
      <SectionCard title="ไทม์ไลน์การเยี่ยม" subtitle={`${kase.visits.length} ครั้ง · แสดงคะแนน ADL / 9Q / 8Q`}>
        <ScoreTimeline visits={kase.visits}/>
      </SectionCard>

      <div className="h-4"></div>

      {/* Tabs */}
      <div className="px-5">
        <div className="rounded-2xl bg-ink-100 p-1 grid grid-cols-3 gap-1 text-[12.5px]">
          {[
            { id: "thread",  label: "ความเห็น" },
            { id: "qa",      label: "คุณภาพ QA" },
            { id: "history", label: "ประวัติเยี่ยม" }
          ].map(t => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={"h-9 rounded-xl transition " + (on ? "bg-white text-ink-900 shadow-card font-medium" : "text-ink-600")}
              >{t.label}</button>
            );
          })}
        </div>
      </div>

      <div className="h-3"></div>

      {tab === "thread" ? (
        <div className="px-5 space-y-3">
          {comments.map((c,i) => <CommentBubble key={i} c={c}/>)}
          {comments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500 text-[13px]">
              ยังไม่มีความเห็นในเคสนี้ — เริ่มสนทนาเพื่อประสานการดูแล
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "qa" ? (
        <div className="px-5">
          <SectionCard
            title="ตรวจสอบคุณภาพการดูแล"
            subtitle={`Care Giver: ${kase.cg}`}
            right={<ScoreChip tone={qaAvg >= 4 ? "ok" : qaAvg >= 3 ? "warning" : "danger"}>{qaAvg} / 5</ScoreChip>}
          >
            {QA_RUBRIC.map(r => (
              <div key={r.id} className="space-y-2 pb-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-ink-800">{r.label}</div>
                    <div className="text-[11px] text-ink-500">{r.hint}</div>
                  </div>
                  <div className="text-[13px] font-medium text-ink-900 tnum">{qa[r.id]}/5</div>
                </div>
                <StarRow value={qa[r.id]} onChange={v => setQa(prev => ({ ...prev, [r.id]: v }))}/>
              </div>
            ))}
            <div className="dotted-rule"></div>
            <Field label="ข้อเสนอแนะถึง Care Giver">
              <textarea
                placeholder="เช่น ภาพถ่ายในการเยี่ยมครั้งล่าสุดยังไม่ชัด ขอให้ปรับ..."
                className="w-full min-h-[80px] p-3 rounded-xl bg-white border border-ink-200 focus:border-ink-700 focus:shadow-ring outline-none text-[13.5px]"
              />
            </Field>
            <PrimaryButton onClick={() => Swal.fire({ icon: "success", title: "ส่งผลตรวจสอบเรียบร้อย", timer: 1100, showConfirmButton: false })} className="w-full">
              บันทึกผลตรวจสอบคุณภาพ
            </PrimaryButton>
          </SectionCard>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="px-5 space-y-2">
          {[...kase.visits].reverse().map(v => (
            <div key={v.id} className="rounded-2xl bg-white border border-ink-100 shadow-card p-3 flex items-start gap-3">
              <div className="text-center w-12 shrink-0">
                <div className="text-[11px] text-ink-400 tnum">{v.date.slice(0,5)}</div>
                <div className="text-[11px] text-ink-400 tnum">{v.date.slice(6)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-ink-700">โดย {v.cg}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <ScoreChip tone={v.adl <= 4 ? "danger" : v.adl <= 11 ? "warning" : "ok"}>ADL {v.adl}</ScoreChip>
                  <ScoreChip tone={v.q9 >= 7 ? "warning" : "neutral"}>9Q {v.q9}</ScoreChip>
                  {v.q8 > 0 ? <ScoreChip tone="danger">8Q {v.q8}</ScoreChip> : null}
                </div>
              </div>
              <span className="text-[10.5px] text-ink-400 tnum self-center">{v.id}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Sticky action bar — composer for thread, escalate/resolve always present */}
      {tab === "thread" ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
          <div className="phone-w pointer-events-auto px-3 pt-2 pb-3 bg-paper-warm/95 backdrop-blur border-t border-ink-100">
            <div className="flex items-end gap-2">
              <div className="flex-1 flex flex-col rounded-2xl border border-ink-200 bg-white">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={1}
                  placeholder="พิมพ์ความเห็น / ข้อเสนอแนะ..."
                  className="w-full p-3 bg-transparent outline-none text-[13.5px] resize-none"
                  style={{ minHeight: 44, maxHeight: 120 }}
                />
                <div className="flex items-center gap-2 px-2 pb-2">
                  <button onClick={escalate} className="text-[11px] px-2 py-1 rounded-full bg-accent-coral/10 text-accent-coral">↗ ส่งต่อ รพ.</button>
                  <button onClick={markResolved} className="text-[11px] px-2 py-1 rounded-full bg-accent-sage/10 text-accent-sage">✓ ปิดเคส</button>
                </div>
              </div>
              <button
                onClick={post}
                disabled={!draft.trim()}
                className="w-12 h-12 rounded-2xl bg-ink-800 text-white grid place-items-center disabled:opacity-40 active:scale-95"
                aria-label="ส่งความเห็น"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
          <div className="phone-w pointer-events-auto px-4 pt-3 pb-4 bg-paper-warm/95 backdrop-blur border-t border-ink-100 flex gap-2">
            <GhostButton onClick={escalate} className="flex-1 text-accent-coral border-accent-coral/30">↗ ส่งต่อ รพ.อำเภอ</GhostButton>
            <PrimaryButton onClick={markResolved} className="flex-1">✓ ปิดเคส</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function ScoreTimeline({ visits }) {
  return (
    <div className="space-y-3">
      {visits.map((v, i) => {
        const isLast = i === visits.length - 1;
        return (
          <div key={v.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center shrink-0">
              <span className={"w-3 h-3 rounded-full ring-4 " + (isLast ? "bg-ink-800 ring-ink-100" : "bg-ink-300 ring-paper")}></span>
              {i < visits.length - 1 ? <span className="w-px flex-1 bg-ink-200 mt-1 min-h-[36px]"></span> : null}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-baseline gap-2">
                <div className="text-[12.5px] font-medium text-ink-800 tnum">{v.date}</div>
                <div className="text-[11px] text-ink-500 truncate">โดย {v.cg}</div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <ScoreChip tone={v.adl <= 4 ? "danger" : v.adl <= 11 ? "warning" : "ok"}>ADL {v.adl}</ScoreChip>
                <ScoreChip tone={v.q9 >= 7 ? "warning" : "neutral"}>9Q {v.q9}</ScoreChip>
                {v.q8 > 0 ? <ScoreChip tone="danger">8Q {v.q8}</ScoreChip> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommentBubble({ c }) {
  const isCM = c.role === "Case Manager";
  return (
    <div className={"flex items-start gap-2.5 " + (isCM ? "" : "flex-row-reverse")}>
      <div className={"w-9 h-9 rounded-2xl grid place-items-center text-[11px] font-medium shrink-0 " +
        (isCM ? "bg-ink-800 text-white" : "bg-accent-sage/15 text-accent-sage")}>
        {c.author.split(/\s+/).filter(Boolean).map(p => p.slice(0,1)).slice(0,2).join("")}
      </div>
      <div className={"flex-1 " + (isCM ? "" : "text-right")}>
        <div className="flex items-baseline gap-2" style={{ justifyContent: isCM ? "flex-start" : "flex-end" }}>
          <div className="text-[12px] font-medium text-ink-800">{c.author}</div>
          <div className="text-[10.5px] text-ink-400 tnum">{c.time}</div>
        </div>
        <div className={"mt-1 inline-block max-w-full text-left p-3 rounded-2xl text-[13px] text-ink-800 leading-snug " +
          (isCM ? "bg-white border border-ink-100 shadow-card rounded-tl-sm" : "bg-accent-sage/10 rounded-tr-sm")}>
          {c.text}
        </div>
      </div>
    </div>
  );
}

function StarRow({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => {
        const on = n <= value;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className="w-9 h-9 grid place-items-center active:scale-90 transition"
            aria-label={`คะแนน ${n}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={on ? "#b58a3c" : "none"} stroke={on ? "#b58a3c" : "#b3c0d6"} strokeWidth="1.6" strokeLinejoin="round">
              <path d="M12 2l3 7 7 .5-5.5 4.5L18 22l-6-4-6 4 1.5-8L2 9.5 9 9z"/>
            </svg>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { CaseManagerScreen, CaseDetailScreen });


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 7 · form-sections.jsx                                        ║
   ║  Visit-form sections (HEADER + Sections 1-9 of the visit form)        ║
   ║  Exposes: SectionHeader, SectionInitialHealth, SectionVitals,         ║
   ║   SectionADL, SectionMental, ChecklistSection, SectionPhotos,         ║
   ║   SectionGPS                                                          ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


// NOTE: useMemo is already destructured from React in SECTION 2 (shared.jsx).
// Because all sections share one module scope after merging, re-declaring it
// here would throw "Identifier 'useMemo' has already been declared" and blank
// the whole app. We reuse the existing useMemo and only alias the rest.
const { useState: us2, useEffect: ue2, useRef: ur2 } = React;

// ───────────────────────────────────────────────────────────── HEADER (Step 0)
function SectionHeader({ patient, value, set }) {
  const visitCount = (patient.visit_count || 0) + 1;
  const phoneErr =
    value.contact && !/^\d{9,10}$/.test(value.contact)
      ? "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก" : null;

  return (
    <SectionCard
      title="ข้อมูลส่วนหัว"
      subtitle="ข้อมูลผู้สูงอายุ · ผู้เยี่ยม · ผู้ดูแลในครัวเรือน"
      right={<ScoreChip tone="ok">ครั้งที่ {visitCount}</ScoreChip>}
    >
      {/* Patient identity locked card */}
      <div className="rounded-2xl bg-paper p-4 border border-ink-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white border border-ink-200 grid place-items-center font-medium text-ink-800">
            {patient.name.replace(/^น(าง|าย|.ส.)\s*/, "").slice(0,2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium text-ink-900 truncate">{patient.name}</div>
            <div className="text-[11.5px] text-ink-500 tnum">PID {patient.pid} · {patient.age} ปี · {patient.sex}</div>
          </div>
          <ScoreChip tone={patient.adl_group === "ติดเตียง" ? "danger" : patient.adl_group === "ติดบ้าน" ? "warning" : "ok"}>
            {patient.adl_group}
          </ScoreChip>
        </div>
        <div className="dotted-rule my-3"></div>
        <div className="text-[12px] text-ink-600">{patient.address}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="วันที่เยี่ยม">
          <TextInput value={value.visit_date} readOnly suffix="พ.ศ."/>
        </Field>
        <Field label="ครั้งที่เยี่ยม" hint="คำนวณอัตโนมัติ">
          <TextInput value={String(visitCount)} readOnly/>
        </Field>
        <Field label="เวลาเยี่ยม">
          <TextInput value={value.time_start} onChange={e => set({ time_start: e.target.value })} type="time"/>
        </Field>
        <Field label="เวลาสิ้นสุด">
          <TextInput value={value.time_end} onChange={e => set({ time_end: e.target.value })} type="time"/>
        </Field>
      </div>

      <Field label="ผู้เยี่ยม" hint="จากบัญชีที่เข้าสู่ระบบ">
        <TextInput value={CURRENT_USER.name} readOnly
          prefix={<span className="text-accent-sage">●</span>}/>
      </Field>

      <Field label="ชื่อผู้ดูแลในครัวเรือน" required>
        <TextInput
          value={value.cg_at_home}
          onChange={e => set({ cg_at_home: e.target.value })}
          placeholder="เช่น นายสมพร  สุขสมบัติ"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ความสัมพันธ์" required>
          <Select
            value={value.relation}
            onChange={e => set({ relation: e.target.value })}
            options={RELATIONS}
            placeholder="เลือก…"
          />
        </Field>
        <Field label="เบอร์ติดต่อ" required error={phoneErr}>
          <TextInput
            value={value.contact}
            onChange={e => {
              const v = e.target.value.replace(/[^\d]/g, "").slice(0,10);
              set({ contact: v });
            }}
            inputMode="numeric"
            placeholder="0812345678"
          />
        </Field>
      </div>
    </SectionCard>
  );
}

// ───────────────────────────────────────────────── SECTION 1 · BMI & Initial
function SectionInitialHealth({ value, set }) {
  const bmi = useMemo(() => {
    const w = parseFloat(value.weight), h = parseFloat(value.height) / 100;
    if (!w || !h) return null;
    return Math.round((w / (h*h)) * 10) / 10;
  }, [value.weight, value.height]);
  const interp = interpretBMI(bmi);

  return (
    <SectionCard title="1 · การประเมินสุขภาพแรกรับ" subtitle="น้ำหนัก · ส่วนสูง · ดัชนีมวลกาย">
      <div className="grid grid-cols-2 gap-3">
        <Field label="น้ำหนัก" required>
          <TextInput value={value.weight} onChange={e => set({ weight: e.target.value.replace(/[^\d.]/g,"") })}
            inputMode="decimal" suffix="กก."/>
        </Field>
        <Field label="ส่วนสูง" required>
          <TextInput value={value.height} onChange={e => set({ height: e.target.value.replace(/[^\d.]/g,"") })}
            inputMode="decimal" suffix="ซม."/>
        </Field>
      </div>
      <ResultBanner
        tone={interp.tone === "neutral" ? "neutral" : interp.tone}
        title="ดัชนีมวลกาย (BMI)"
        value={bmi ? bmi.toFixed(1) + " kg/m²" : "—"}
        sub={interp.label}
      />
    </SectionCard>
  );
}

// ───────────────────────────────────────────────── SECTION 2 · Vital signs
function SectionVitals({ value, set }) {
  const bpErr =
    value.bp && !/^\d{2,3}\/\d{2,3}$/.test(value.bp)
      ? "รูปแบบเช่น 110/86" : null;
  return (
    <SectionCard title="2 · การประเมินสัญญาณชีพ" subtitle="ตรวจวัด ณ จุดเยี่ยม">
      <div className="grid grid-cols-2 gap-3">
        <Field label="อุณหภูมิ"><TextInput value={value.temp} onChange={e => set({ temp: e.target.value })} inputMode="decimal" suffix="°C"/></Field>
        <Field label="ชีพจร"><TextInput value={value.pulse} onChange={e => set({ pulse: e.target.value.replace(/[^\d]/g,"") })} inputMode="numeric" suffix="ครั้ง/นาที"/></Field>
        <Field label="การหายใจ"><TextInput value={value.resp} onChange={e => set({ resp: e.target.value.replace(/[^\d]/g,"") })} inputMode="numeric" suffix="ครั้ง/นาที"/></Field>
        <Field label="ความดันโลหิต" error={bpErr}>
          <TextInput value={value.bp} onChange={e => set({ bp: e.target.value.replace(/[^\d/]/g,"") })}
            placeholder="110/86" suffix="mmHg"/>
        </Field>
      </div>
    </SectionCard>
  );
}

// ───────────────────────────────────────────────── SECTION 3 · ADL Barthel
function SectionADL({ value, set }) {
  const enabled = value.adl_enabled;
  const total = useMemo(
    () => ADL_ITEMS.reduce((s, it) => s + (value.adl[it.n] ?? 0), 0),
    [value.adl]
  );
  const interp = interpretADL(total);

  return (
    <SectionCard title="3 · ประเมิน ADL (Barthel Index)" subtitle="แบบประเมินกิจวัตรประจำวัน 10 ข้อ">
      <Toggle
        value={enabled}
        onChange={v => set({ adl_enabled: v })}
        label="เปิดการประเมิน ADL ครั้งนี้"
        sub="ปิดได้ในกรณีไม่สามารถประเมินได้ในการเยี่ยมครั้งนี้"
      />
      {enabled ? (
        <>
          {ADL_ITEMS.map(it => (
            <div key={it.n} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-[13.5px] font-medium text-ink-800">
                  <span className="text-ink-400 tnum mr-1.5">{String(it.n).padStart(2,"0")}</span>
                  {it.title}
                </div>
                <ScoreChip tone={value.adl[it.n] != null ? "ok" : "neutral"}>
                  {value.adl[it.n] ?? "—"} คะแนน
                </ScoreChip>
              </div>
              <RadioCardGroup
                items={it.options}
                value={value.adl[it.n]}
                onChange={v => set({ adl: { ...value.adl, [it.n]: v } })}
                columns={it.options.length}
              />
            </div>
          ))}
          <div className="dotted-rule"></div>
          <ResultBanner
            tone={interp.tone}
            title="คะแนน ADL รวม"
            value={`${total} / 20 คะแนน`}
            sub={interp.label + " · " + interp.sub}
          />
        </>
      ) : (
        <div className="text-[12.5px] text-ink-500 bg-paper rounded-2xl p-4 border border-dashed border-ink-200">
          การประเมิน ADL ถูกข้ามในการเยี่ยมครั้งนี้
        </div>
      )}
    </SectionCard>
  );
}

// ───────────────────────────────────────────────── SECTION 4 · Mental Health
function SectionMental({ value, set, onRisk }) {
  const enabled = value.mh_enabled;
  const twoQAny = (value.twoQ || []).some(Boolean);
  const nineTotal = useMemo(
    () => (value.nineQ || []).reduce((s, v) => s + (Number(v) || 0), 0),
    [value.nineQ]
  );
  const nine = interpret9Q(nineTotal);
  const showNine = enabled && twoQAny;
  const showEight = showNine && nineTotal >= 7;
  const eightTotal = useMemo(
    () => EIGHT_Q.reduce((s, q, i) => s + ((value.eightQ?.[i] === true) ? q.yes : 0), 0),
    [value.eightQ]
  );
  const eight = interpret8Q(eightTotal);

  // surface risk upward
  ue2(() => {
    const q9_9 = (value.nineQ?.[8] || 0) > 0;
    const risk = (showEight && eightTotal > 0) || q9_9;
    onRisk(risk, { nineTotal, eightTotal, q9_9 });
  }, [eightTotal, nineTotal, value.nineQ, showEight]);

  return (
    <SectionCard title="4 · ประเมินสุขภาพจิต" subtitle="2Q → 9Q → 8Q (ตามเกณฑ์กรมสุขภาพจิต)">
      <Toggle
        value={enabled}
        onChange={v => set({ mh_enabled: v })}
        label="เปิดการประเมินสุขภาพจิต"
        sub="ครั้งนี้ดำเนินการประเมินภาวะซึมเศร้าและการฆ่าตัวตาย"
      />

      {enabled ? (
        <>
          {/* 2Q */}
          <div className="space-y-3">
            <div className="text-[13px] font-medium text-ink-700">2Q · คัดกรองภาวะซึมเศร้าเบื้องต้น</div>
            {TWO_Q.map((t, i) => (
              <div key={i} className="rounded-2xl border border-ink-100 bg-white p-3 space-y-2">
                <div className="text-[13px] text-ink-800 leading-snug">
                  <span className="text-ink-400 tnum mr-1.5">{i+1}.</span>{t}
                </div>
                <YesNoGroup
                  value={value.twoQ?.[i]}
                  onChange={v => {
                    const next = [...(value.twoQ || [null,null])];
                    next[i] = v;
                    set({ twoQ: next });
                  }}
                />
              </div>
            ))}
            {!twoQAny && (value.twoQ || []).every(v => v === false) ? (
              <div className="text-[12px] text-accent-sage bg-accent-sage/10 px-3 py-2 rounded-xl">
                ✓ ตอบ "ไม่มี" ทั้ง 2 ข้อ — ไม่ต้องประเมิน 9Q
              </div>
            ) : null}
          </div>

          {/* 9Q */}
          {showNine ? (
            <>
              <div className="dotted-rule my-1"></div>
              <div className="text-[13px] font-medium text-ink-700">9Q · ระดับภาวะซึมเศร้า</div>
              {NINE_Q.map((t, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-[13px] text-ink-800 leading-snug flex items-baseline">
                    <span className="text-ink-400 tnum mr-1.5 shrink-0">{i+1}.</span>
                    <span className="flex-1">{t}</span>
                    <ScoreChip tone={value.nineQ?.[i] != null ? "ok" : "neutral"}>{value.nineQ?.[i] ?? "—"}</ScoreChip>
                  </div>
                  <RadioCardGroup
                    items={NINE_Q_OPTS}
                    value={value.nineQ?.[i]}
                    onChange={v => {
                      const next = [...(value.nineQ || Array(9).fill(null))];
                      next[i] = v;
                      set({ nineQ: next });
                    }}
                    columns={4}
                  />
                </div>
              ))}
              <ResultBanner tone={nine.tone} title="คะแนน 9Q รวม" value={`${nineTotal} คะแนน`} sub={nine.label}/>
            </>
          ) : null}

          {/* 8Q */}
          {showEight ? (
            <>
              <div className="dotted-rule my-1"></div>
              <div className="text-[13px] font-medium text-ink-700">8Q · แนวโน้มการฆ่าตัวตาย</div>
              <div className="text-[11.5px] text-ink-500 -mt-2">
                แสดงเนื่องจาก 9Q ≥ 7
              </div>
              {EIGHT_Q.map((q, i) => {
                const v = value.eightQ?.[i];
                return (
                  <div key={i} className="rounded-2xl border border-ink-100 bg-white p-3 space-y-2">
                    <div className="text-[13px] text-ink-800 leading-snug flex items-baseline">
                      <span className="text-ink-400 tnum mr-1.5 shrink-0">{q.n}.</span>
                      <span className="flex-1">{q.text}</span>
                      <span className="text-[11px] text-ink-500 tnum shrink-0 ml-2">มี = {q.yes}</span>
                    </div>
                    <YesNoGroup
                      value={v}
                      onChange={val => {
                        const next = [...(value.eightQ || Array(8).fill(null))];
                        next[i] = val;
                        set({ eightQ: next });
                      }}
                    />
                    {q.followUp && v === true ? (
                      <div className="pt-2">
                        <div className="text-[12px] text-ink-600 mb-1.5">{q.followUp}</div>
                        <div className="grid grid-cols-2 gap-2">
                          {["ควบคุมได้","ควบคุมไม่ได้"].map(opt => {
                            const on = value.eight_q3_control === opt;
                            return (
                              <button
                                key={opt}
                                onClick={() => set({ eight_q3_control: opt })}
                                className={
                                  "h-11 rounded-xl border text-[13px] " +
                                  (on
                                    ? (opt === "ควบคุมไม่ได้" ? "bg-accent-coral text-white border-accent-coral" : "bg-ink-800 text-white border-ink-800")
                                    : "bg-white border-ink-200 text-ink-700")
                                }
                              >{opt}</button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <ResultBanner tone={eight.tone} title="คะแนน 8Q รวม" value={`${eightTotal} คะแนน`} sub={eight.label}/>
            </>
          ) : null}

          {/* Risk alert */}
          {(() => {
            const q9_9 = (value.nineQ?.[8] || 0) > 0;
            const risk = (showEight && eightTotal > 0) || q9_9;
            if (!risk) return null;
            return (
              <div className="rounded-2xl bg-accent-coral text-white p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center text-[20px] shrink-0">!</div>
                <div className="text-[13px] leading-snug">
                  <div className="font-medium text-[14px]">พบความเสี่ยงด้านสุขภาพจิต</div>
                  <div className="opacity-90 mt-0.5">
                    {q9_9 ? "9Q ข้อ 9 (ความคิดทำร้ายตนเอง) > 0 · " : ""}
                    {eightTotal > 0 ? `8Q = ${eightTotal} · ` : ""}
                    ระบบจะบันทึก <span className="font-medium">risk_level</span> และแจ้งทีม Case Manager
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        <div className="text-[12.5px] text-ink-500 bg-paper rounded-2xl p-4 border border-dashed border-ink-200">
          การประเมินสุขภาพจิตถูกข้ามในการเยี่ยมครั้งนี้
        </div>
      )}
    </SectionCard>
  );
}

// ───────────────────────────────────────────────── Generic checklist section
function ChecklistSection({ title, subtitle, items, value, set, otherKey = "other" }) {
  const set_ = value || { checked: [], other: "" };
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="space-y-2">
        {items.map(label => {
          const on = set_.checked.includes(label);
          return (
            <CheckRow
              key={label}
              label={label}
              checked={on}
              onToggle={() => {
                const next = on ? set_.checked.filter(x => x !== label) : [...set_.checked, label];
                set({ checked: next, other: set_.other });
              }}
            />
          );
        })}
        <CheckRow
          label={set_.other ? `อื่น ๆ: ${set_.other}` : "อื่น ๆ (ระบุ)"}
          checked={!!set_.other}
          onToggle={() => set({ checked: set_.checked, other: set_.other ? "" : " " })}
        />
        {set_.other !== "" ? (
          <TextInput
            value={set_.other.trim()}
            onChange={e => set({ checked: set_.checked, other: e.target.value })}
            placeholder="ระบุกิจกรรมอื่น ๆ"
          />
        ) : null}
      </div>
      <div className="text-[11.5px] text-ink-500 tnum">
        เลือกแล้ว {set_.checked.length + (set_.other.trim() ? 1 : 0)} รายการ
      </div>
    </SectionCard>
  );
}

// ───────────────────────────────────────────────── SECTION 8 · Photos
function SectionPhotos({ value, set }) {
  const inputRef = ur2(null);
  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    const next = [...value.photos];
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      next.push({ name: f.name, url, size: f.size });
    });
    set({ photos: next });
    e.target.value = "";
  };
  const remove = (i) => {
    const next = value.photos.filter((_, idx) => idx !== i);
    set({ photos: next });
  };
  return (
    <SectionCard title="8 · อัปโหลดภาพกิจกรรมการดูแล" subtitle="รองรับหลายภาพ · เก็บใน Google Drive ของหน่วยงาน">
      <input ref={inputRef} type="file" accept="image/*" multiple capture="environment" onChange={onPick} className="hidden"/>
      <div className="grid grid-cols-3 gap-2">
        {value.photos.map((p, i) => (
          <div key={i} className="relative aspect-square rounded-2xl overflow-hidden bg-paper border border-ink-100">
            <img src={p.url} alt={p.name} className="w-full h-full object-cover"/>
            <button onClick={() => remove(i)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-[11px] grid place-items-center">×</button>
          </div>
        ))}
        <button
          onClick={() => inputRef.current?.click()}
          className="aspect-square rounded-2xl ph-stripes border border-dashed border-ink-300 text-ink-600 grid place-items-center text-[11px] font-mono"
        >
          + เพิ่มภาพ
        </button>
      </div>
      <div className="flex items-center justify-between text-[12px] text-ink-500">
        <span>เพิ่มแล้ว {value.photos.length} ภาพ</span>
        <button onClick={() => inputRef.current?.click()} className="text-ink-800 underline underline-offset-2">เลือกจากแกลเลอรี</button>
      </div>
    </SectionCard>
  );
}

// ───────────────────────────────────────────────── SECTION 9 · GPS / Leaflet
function SectionGPS({ value, set }) {
  const mapRef = ur2(null);
  const elRef = ur2(null);
  const markerRef = ur2(null);
  const enabled = value.gps_enabled;

  // initialize map when enabled
  ue2(() => {
    if (!enabled || !elRef.current || mapRef.current) return;
    const center = [value.lat || 16.5418, value.lng || 104.7237]; // Mukdahan
    const map = L.map(elRef.current, { zoomControl: false }).setView(center, 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap"
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const marker = L.marker(center, { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      set({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
    });
    mapRef.current = map;
    markerRef.current = marker;
    setTimeout(() => map.invalidateSize(), 100);
  }, [enabled]);

  // update marker if lat/lng changed externally
  ue2(() => {
    if (mapRef.current && markerRef.current && value.lat && value.lng) {
      markerRef.current.setLatLng([value.lat, value.lng]);
      mapRef.current.panTo([value.lat, value.lng]);
    }
  }, [value.lat, value.lng]);

  const getCurrent = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: "error", title: "ไม่รองรับ GPS", text: "อุปกรณ์ไม่รองรับการหาตำแหน่ง" });
      return;
    }
    Swal.fire({ title: "กำลังดึงพิกัด...", didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        Swal.close();
        set({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
      },
      () => {
        Swal.close();
        // fallback to a Mukdahan-ish coordinate so the prototype still feels live
        set({ lat: 16.541823, lng: 104.723712 });
        Swal.fire({ icon: "info", title: "ใช้พิกัดตัวอย่าง", text: "ไม่สามารถเข้าถึง GPS — ใช้พิกัด รพ.สต. แทน" });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const mapLink = value.lat && value.lng ? `https://maps.google.com/?q=${value.lat},${value.lng}` : "";

  return (
    <SectionCard title="9 · บันทึกพิกัดเยี่ยมบ้าน" subtitle="Latitude / Longitude · Google Maps link">
      <Toggle
        value={enabled}
        onChange={v => set({ gps_enabled: v })}
        label="เปิดบันทึกพิกัด"
        sub="ลากหมุดบนแผนที่หรือกดปุ่มดึงพิกัดปัจจุบัน"
      />
      {enabled ? (
        <>
          <div ref={elRef} className="rounded-2xl overflow-hidden border border-ink-200" style={{ height: 220 }}></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <TextInput value={value.lat ? String(value.lat) : ""} readOnly/>
            </Field>
            <Field label="Longitude">
              <TextInput value={value.lng ? String(value.lng) : ""} readOnly/>
            </Field>
          </div>
          {mapLink ? (
            <div className="text-[12px] text-ink-500 break-all">
              <span className="text-ink-400">Map link:</span>{" "}
              <a href={mapLink} target="_blank" rel="noreferrer" className="text-accent-sky underline underline-offset-2">{mapLink}</a>
            </div>
          ) : null}
          <PrimaryButton onClick={getCurrent} className="w-full" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
            </svg>
          }>ดึงพิกัดปัจจุบัน</PrimaryButton>
        </>
      ) : (
        <div className="text-[12.5px] text-ink-500 bg-paper rounded-2xl p-4 border border-dashed border-ink-200">
          ไม่บันทึกพิกัดสำหรับการเยี่ยมครั้งนี้
        </div>
      )}
    </SectionCard>
  );
}

Object.assign(window, {
  SectionHeader, SectionInitialHealth, SectionVitals,
  SectionADL, SectionMental,
  ChecklistSection,
  SectionPhotos, SectionGPS
});


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 8 · form.jsx                                                 ║
   ║  Visit-form Wizard — stitches header + 9 sections into a stepper      ║
   ║  Exposes: VisitFormScreen, blankForm, STEPS                           ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


const { useState: usF, useEffect: ueF, useRef: urF, useMemo: umF } = React;

const STEPS = [
  { id: "hdr",   short: "ส่วนหัว",        title: "ข้อมูลส่วนหัว" },
  { id: "s1",    short: "สุขภาพ",        title: "ประเมินสุขภาพแรกรับ" },
  { id: "s2",    short: "สัญญาณชีพ",     title: "สัญญาณชีพ" },
  { id: "s3",    short: "ADL",          title: "ประเมิน ADL" },
  { id: "s4",    short: "สุขภาพจิต",    title: "สุขภาพจิต 2Q/9Q/8Q" },
  { id: "s5",    short: "การช่วยเหลือ",  title: "กิจกรรมประจำวัน" },
  { id: "s6",    short: "สุขภาพพื้นฐาน", title: "กิจกรรมสุขภาพ" },
  { id: "s7",    short: "อื่น ๆ",          title: "กิจกรรมอื่น ๆ" },
  { id: "s8",    short: "ภาพถ่าย",       title: "อัปโหลดภาพ" },
  { id: "s9",    short: "พิกัด",         title: "GPS" }
];

function blankForm(patient) {
  return {
    // header
    visit_date: thaiDateString(),
    time_start: thaiTimeString(),
    time_end: "",
    cg_at_home: patient?.caregiver_at_home || "",
    relation: patient?.relation || "",
    contact: patient?.contact || "",
    // s1
    weight: "", height: "",
    // s2
    temp: "", pulse: "", resp: "", bp: "",
    // s3
    adl_enabled: true,
    adl: {},
    // s4
    mh_enabled: true,
    twoQ: [null, null],
    nineQ: Array(9).fill(null),
    eightQ: Array(8).fill(null),
    eight_q3_control: "",
    // s5/6/7
    daily: { checked: [], other: "" },
    health: { checked: [], other: "" },
    other: { checked: [], other: "" },
    // s8
    photos: [],
    // s9
    gps_enabled: true,
    lat: null, lng: null,
    // risk
    risk_level: "ปกติ"
  };
}

function VisitFormScreen({ patient, onSaved, onCancel }) {
  const [step, setStep] = usF(0);
  const [form, setForm] = usF(() => blankForm(patient));
  const [saving, setSaving] = usF(false);
  const [completed, setCompleted] = usF(Array(STEPS.length).fill(false));
  const [riskFlag, setRiskFlag] = usF(false);
  const scrollRef = urF(null);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  // Roll completed state forward when leaving a step
  const goto = (i) => {
    setCompleted(c => c.map((v, idx) => idx < i ? true : v));
    setStep(i);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const next = () => {
    if (step < STEPS.length - 1) goto(step + 1);
    else trySave();
  };
  const prev = () => {
    if (step > 0) goto(step - 1);
    else onCancel();
  };

  const onRisk = (risk, info) => {
    setRiskFlag(risk);
    set({ risk_level: risk ? "เสี่ยงสูง" : "ปกติ" });
  };

  const trySave = async () => {
    // light validation summary
    const issues = [];
    if (!form.cg_at_home) issues.push("ชื่อผู้ดูแลในครัวเรือน");
    if (!form.relation)   issues.push("ความสัมพันธ์");
    if (!form.contact || !/^\d{9,10}$/.test(form.contact)) issues.push("เบอร์ติดต่อ (9-10 หลัก)");
    if (!form.weight || !form.height) issues.push("น้ำหนัก / ส่วนสูง");

    if (issues.length) {
      Swal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ครบถ้วน",
        html: "กรุณาตรวจสอบ:<br/><br/>• " + issues.join("<br/>• "),
        confirmButtonText: "รับทราบ"
      });
      return;
    }

    const totalADL = Object.values(form.adl).reduce((s,v)=>s+(v||0),0);
    const total9Q = (form.nineQ || []).reduce((s,v)=>s+(v||0),0);

    setSaving(true);
    try {
      // Map the form state → backend submitVisit payload schema.
      const bp = String(form.bp || "").split("/");
      const num = (x) => (x === "" || x == null) ? "" : (isNaN(+x) ? "" : +x);
      const payload = {
        PID: patient.pid,
        // VisitDate intentionally omitted → backend defaults to today (Asia/Bangkok),
        // avoiding a Thai-string → ISO conversion.
        TimeStart: form.time_start || "",
        TimeEnd: form.time_end || "",
        HouseholdCaregiverName: form.cg_at_home || "",
        HouseholdRelationID: form.relation || "",
        HouseholdContact: form.contact || "",
        WeightKg: num(form.weight),
        HeightCm: num(form.height),
        TempC: num(form.temp),
        Pulse: num(form.pulse),
        Resp: num(form.resp),
        BPSystolic: num((bp[0] || "").trim()),
        BPDiastolic: num((bp[1] || "").trim()),
        ADLEnabled: !!form.adl_enabled,
        ADLScores: form.adl || {},
        MHEnabled: !!form.mh_enabled,
        TwoQ: (form.twoQ || []).map(v => v === true),
        NineQ: (form.nineQ || []).map(v => Number(v) || 0),
        EightQ: (form.eightQ || []).map(v => v === true),
        EightQ3Control: form.eight_q3_control || "",
        Care: { daily: form.daily, health: form.health, other: form.other },
        // Only forward photos that were already uploaded to Drive (have a fileId).
        Photos: (form.photos || []).filter(p => p && p.fileId),
        GPSEnabled: !!form.gps_enabled,
        Lat: form.lat != null ? form.lat : "",
        Lng: form.lng != null ? form.lng : "",
        Notes: form.notes || ""
      };
      await LTC_API.submitVisit(payload);
      setSaving(false);
      Swal.fire({
        icon: "success",
        title: "บันทึกการเยี่ยมสำเร็จ",
        html: `
          <div style="text-align:left; font-size:14px; color:#13224a">
            <div><b>${patient.name}</b></div>
            <div style="color:#506aa3; font-size:12px">PID ${patient.pid} · ครั้งที่ ${(patient.visit_count||0)+1}</div>
            <hr style="margin:10px 0; border-color:#ecf0f7"/>
            <div>ADL รวม: <b>${totalADL}/20</b> · ${interpretADL(totalADL).label}</div>
            <div>9Q รวม: <b>${total9Q}</b> · ${interpret9Q(total9Q).label}</div>
            <div>ภาพถ่าย: <b>${form.photos.length}</b> ภาพ</div>
            ${form.lat ? `<div>พิกัด: <b>${form.lat}, ${form.lng}</b></div>` : ""}
            ${riskFlag ? `<div style="color:#c0533f; margin-top:6px"><b>⚠︎ risk_level = เสี่ยงสูง</b></div>` : ""}
          </div>
        `,
        confirmButtonText: "เสร็จสิ้น"
      }).then(() => onSaved(form));
    } catch (e) {
      setSaving(false);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", text: e.message || String(e), confirmButtonText: "ลองใหม่" });
    }
  };

  const renderStep = () => {
    switch (STEPS[step].id) {
      case "hdr": return <SectionHeader patient={patient} value={form} set={set}/>;
      case "s1":  return <SectionInitialHealth value={form} set={set}/>;
      case "s2":  return <SectionVitals value={form} set={set}/>;
      case "s3":  return <SectionADL value={form} set={set}/>;
      case "s4":  return <SectionMental value={form} set={set} onRisk={onRisk}/>;
      case "s5":  return <ChecklistSection
                            title="5 · กิจกรรมการดูแลด้านการช่วยเหลือประจำวัน"
                            subtitle="เลือกได้หลายรายการ"
                            items={DAILY_CARE}
                            value={form.daily}
                            set={v => set({ daily: v })}/>;
      case "s6":  return <ChecklistSection
                            title="6 · กิจกรรมการดูแลด้านสุขภาพพื้นฐาน"
                            subtitle="เลือกได้หลายรายการ"
                            items={HEALTH_CARE}
                            value={form.health}
                            set={v => set({ health: v })}/>;
      case "s7":  return <ChecklistSection
                            title="7 · กิจกรรมการดูแลด้านอื่น ๆ"
                            subtitle="เลือกได้หลายรายการ"
                            items={OTHER_CARE}
                            value={form.other}
                            set={v => set({ other: v })}/>;
      case "s8":  return <SectionPhotos value={form} set={set}/>;
      case "s9":  return <SectionGPS value={form} set={set}/>;
      default: return null;
    }
  };

  const isLast = step === STEPS.length - 1;

  return (
    <div className="phone phone-bg pb-28">
      <StatusBar/>
      <AppHeader
        title="บันทึกการเยี่ยมบ้าน"
        subtitle={`${patient.name} · ครั้งที่ ${(patient.visit_count||0)+1}`}
        onBack={prev}
        right={
          <button
            onClick={() => {
              Swal.fire({
                icon: "question",
                title: "ออกจากการบันทึก?",
                text: "ข้อมูลที่กรอกยังไม่ได้บันทึกจะหายไป",
                showCancelButton: true,
                confirmButtonText: "ออก",
                cancelButtonText: "อยู่ต่อ"
              }).then(r => r.isConfirmed && onCancel());
            }}
            className="text-[12px] text-ink-700 px-3 h-9 rounded-full bg-ink-100"
          >ยกเลิก</button>
        }
      />
      <Stepper steps={STEPS} current={step} onJump={goto} completed={completed}/>

      <div ref={scrollRef} className="px-5 pt-3 space-y-5">
        {/* Risk pinned alert across all subsequent steps */}
        {riskFlag && step > 4 ? (
          <div className="rounded-2xl bg-accent-coral/10 border border-accent-coral/30 text-accent-coral px-4 py-3 flex items-center gap-3 text-[12.5px]">
            <span className="w-7 h-7 rounded-lg bg-accent-coral text-white grid place-items-center text-[14px]">!</span>
            <span>ผู้สูงอายุรายนี้ถูกระบุเป็น <b>เสี่ยงสูง</b> จากการประเมินสุขภาพจิต — กำหนดติดตามภายใน 7 วัน</span>
          </div>
        ) : null}

        {renderStep()}

        <div className="text-[11.5px] text-ink-500 text-center pt-2">
          ส่วนที่ {step + 1} จาก {STEPS.length} · {STEPS[step].title}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="phone-w pointer-events-auto px-4 pt-3 pb-4 bg-paper-warm/95 backdrop-blur border-t border-ink-100">
          <div className="flex gap-2">
            <GhostButton onClick={prev} className="px-4">
              {step === 0 ? "ยกเลิก" : "ย้อนกลับ"}
            </GhostButton>
            <PrimaryButton
              onClick={next}
              loading={saving}
              className="flex-1"
              icon={
                isLast ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>
                ) : null
              }
            >
              {saving ? "กำลังบันทึก..." : isLast ? "บันทึกการเยี่ยม" : "ขั้นตอนถัดไป"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VisitFormScreen, blankForm, STEPS });


/* ╔═══════════════════════════════════════════════════════════════════════╗
   ║  SECTION 9 · app.jsx                                                  ║
   ║  Root App — navigation between Login, Home, Admin, CM, Visit Form     ║
   ║  Mounts <App/> to #root via ReactDOM.createRoot                       ║
   ╚═══════════════════════════════════════════════════════════════════════╝ */


const { useState: uSA } = React;

function App() {
  const [route, setRoute] = uSA({ name: "login" });

  const goHomeForRole = (role) => {
    if (role === "admin") setRoute({ name: "admin" });
    else if (role === "case_manager") setRoute({ name: "cm" });
    else setRoute({ name: "home" });
  };

  const openNewVisit = async () => {
    // Pull the live roster so the picker reflects real patients.
    let patients = [];
    Swal.fire({ title: "กำลังโหลดรายชื่อ…", didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
      patients = await LTC_API.listPatients();
    } catch (e) {
      Swal.fire({ icon: "error", title: "โหลดรายชื่อไม่สำเร็จ", text: e.message || String(e) });
      return;
    }
    if (!Array.isArray(patients) || patients.length === 0) {
      Swal.fire({ icon: "info", title: "ยังไม่มีผู้สูงอายุในระบบ", text: "กรุณาเพิ่มข้อมูลผู้สูงอายุก่อน" });
      return;
    }
    const opts = patients.map(p => `<option value="${p.patient_id || p.pid}">${p.name}${p.village ? " · " + p.village : ""}</option>`).join("");
    Swal.fire({
      title: "เลือกผู้สูงอายุที่จะเยี่ยม",
      html: `<select id="pick" class="swal2-select" style="width:90%; height:44px; border:1px solid #d9e0eb; border-radius:12px; padding:0 12px; font-family:Mitr">${opts}</select>`,
      showCancelButton: true,
      confirmButtonText: "เริ่มบันทึก",
      cancelButtonText: "ยกเลิก",
      preConfirm: () => document.getElementById("pick").value
    }).then(r => {
      if (r.isConfirmed) {
        const p = patients.find(x => (x.patient_id || x.pid) === r.value);
        if (p) setRoute({ name: "visit", patient: p });
      }
    });
  };

  const openPatient = (p) => setRoute({ name: "visit", patient: p });

  const logout = () => {
    Swal.fire({
      icon: "question",
      title: "ออกจากระบบ?",
      showCancelButton: true,
      confirmButtonText: "ออก",
      cancelButtonText: "อยู่ต่อ"
    }).then(r => r.isConfirmed && setRoute({ name: "login" }));
  };

  switch (route.name) {
    case "login":
      return <LoginScreen onLogin={goHomeForRole}/>;
    case "home":
      return <HomeScreen
        onOpenNewVisit={openNewVisit}
        onOpenPatient={openPatient}
        onLogout={logout}
      />;
    case "admin":
      return <AdminDashboard onLogout={logout} onNav={(name) => setRoute({ name })}/>;
    case "users":
      return <UsersScreen onBack={() => setRoute({ name: "admin" })}/>;
    case "patients":
      return <PatientsScreen onBack={() => setRoute({ name: "admin" })}/>;
    case "assign":
      return <AssignScreen onBack={() => setRoute({ name: "admin" })}/>;
    case "settings":
      return <SettingsScreen onBack={() => setRoute({ name: "admin" })}/>;
    case "audit":
      return <AuditLogScreen onBack={() => setRoute({ name: "admin" })}/>;
    case "cm":
      return <CaseManagerScreen
        onLogout={logout}
        onOpenCase={(kase) => setRoute({ name: "cm_detail", kase })}
      />;
    case "cm_detail":
      return <CaseDetailScreen
        kase={route.kase}
        onBack={() => setRoute({ name: "cm" })}
      />;
    case "visit":
      return <VisitFormScreen
        patient={route.patient}
        onSaved={() => setRoute({ name: "home" })}
        onCancel={() => setRoute({ name: "home" })}
      />;
    default: return null;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);


/* ═══════════════════════════════════════════════════════════════════════════
 *  END OF FILE — bundle.jsx
 * ═══════════════════════════════════════════════════════════════════════════ */
