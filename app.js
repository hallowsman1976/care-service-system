/**
 * app.js — Care System Frontend Application
 * Complete SPA logic: routing, API, forms, visit stepper, mental health assessments
 */

// ============================================================
// CONFIG — เปลี่ยน WEBAPP_URL ตรงนี้หลัง Deploy
// ============================================================
const CONFIG = {
  WEBAPP_URL: localStorage.getItem('https://script.google.com/macros/s/AKfycbwAEJGrYFgQ2z3whJzkPleZUjqqeSnZP3iqt_NqqrunTPS3jRAz-9ZuHpkrlseSb9kC/exec') || '',
  APP_NAME: 'ระบบดูแลผู้มีภาวะพึ่งพิง'
};

// ============================================================
// STATE
// ============================================================
const state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  currentPage: 'dashboard',
  loading: false,
  sidebarOpen: false,
  // Data caches
  patients: [],
  caregivers: [],
  assignments: [],
  dashboardStats: null,
  // Visit form
  visitStep: 0,
  visitData: {},
  editingVisit: null,
  selectedPatient: null
};

// ============================================================
// API LAYER
// ============================================================
async function api(action, data = {}) {
  if (!CONFIG.WEBAPP_URL) {
    Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณาตั้งค่า WEBAPP_URL ก่อน', 'warning');
    return { success: false, message: 'ยังไม่ได้ตั้งค่า WEBAPP_URL' };
  }
  showLoading(true);
  try {
    const res = await fetch(CONFIG.WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data, token: state.token }),
      redirect: 'follow'
    });
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) {
      throw new Error('Server ตอบกลับ HTML แทน JSON — ตรวจ Deploy settings');
    }
    const result = JSON.parse(text);
    if (!result.success && result.message && result.message.includes('Session หมดอายุ')) {
      logout();
      return result;
    }
    return result;
  } catch (err) {
    console.error('API Error:', action, err);
    return { success: false, message: 'เชื่อมต่อ server ไม่สำเร็จ: ' + err.message };
  } finally {
    showLoading(false);
  }
}

// ============================================================
// AUTH
// ============================================================
async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) {
    Swal.fire('', 'กรุณากรอก username และ password', 'warning');
    return;
  }
  const res = await api('login', { username, password });
  if (res.success) {
    state.token = res.data.token;
    state.user = res.data;
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data));
    Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ', text: 'ยินดีต้อนรับ ' + res.data.fullName, timer: 1500, showConfirmButton: false });
    setTimeout(() => navigate('dashboard'), 1000);
  } else {
    Swal.fire('เข้าสู่ระบบไม่สำเร็จ', res.message, 'error');
  }
}

function logout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  navigate('login');
}

function isLoggedIn() { return state.token && state.user; }
function isAdmin() { return state.user && state.user.role === 'admin'; }

// ============================================================
// ROUTING
// ============================================================
function navigate(page, params = {}) {
  state.currentPage = page;
  state.sidebarOpen = false;
  document.body.classList.remove('sidebar-open');

  if (page !== 'login' && page !== 'setup' && !isLoggedIn()) {
    page = 'login';
    state.currentPage = 'login';
  }

  const app = document.getElementById('app');
  const sidebar = document.getElementById('sidebar-container');
  const bottomNav = document.getElementById('bottom-nav');

  if (page === 'login' || page === 'setup') {
    sidebar.style.display = 'none';
    bottomNav.style.display = 'none';
  } else {
    sidebar.style.display = '';
    bottomNav.style.display = '';
  }

  // Update active nav
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
  const sideEl = document.querySelector(`.sidebar-link[data-page="${page}"]`);
  if (sideEl) sideEl.classList.add('active');
  const botEl = document.querySelector(`.bottom-nav-item[data-page="${page}"]`);
  if (botEl) botEl.classList.add('active');

  renderPage(page, params);
}

function renderPage(page, params) {
  const app = document.getElementById('app');
  switch (page) {
    case 'login': app.innerHTML = renderLogin(); break;
    case 'setup': app.innerHTML = renderSetup(); break;
    case 'dashboard': renderDashboard(app); break;
    case 'patients': renderPatients(app); break;
    case 'caregivers': renderCaregivers(app); break;
    case 'visits': renderVisits(app, params); break;
    case 'visit-form': renderVisitForm(app, params); break;
    case 'reports': renderReports(app); break;
    case 'settings': renderSettings(app); break;
    case 'assignments': renderAssignments(app); break;
    case 'profile': app.innerHTML = renderProfile(); break;
    default: app.innerHTML = '<p class="p-8 text-gray-500">ไม่พบหน้านี้</p>';
  }
  window.scrollTo(0, 0);
}

// ============================================================
// RENDER: Login
// ============================================================
function renderLogin() {
  return `
  <div class="min-h-screen flex items-center justify-center p-4" style="background: linear-gradient(135deg, #1E3A5F, #2563EB)">
    <div class="glass-card p-8 w-full max-w-md">
      <div class="text-center mb-6">
        <div class="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
          <i data-lucide="heart-pulse" class="w-8 h-8 text-blue-600"></i>
        </div>
        <h1 class="text-xl font-bold text-gray-800">${CONFIG.APP_NAME}</h1>
        <p class="text-gray-500 text-sm mt-1">Care Dashboard</p>
      </div>
      <div class="form-group">
        <label>ชื่อผู้ใช้</label>
        <input type="text" id="login-username" class="form-input" placeholder="username" onkeydown="if(event.key==='Enter')login()">
      </div>
      <div class="form-group">
        <label>รหัสผ่าน</label>
        <input type="password" id="login-password" class="form-input" placeholder="password" onkeydown="if(event.key==='Enter')login()">
      </div>
      <button onclick="login()" class="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition mt-2">
        เข้าสู่ระบบ
      </button>
      <div class="mt-4 text-center">
        <button onclick="navigate('setup')" class="text-sm text-blue-500 hover:underline">ตั้งค่า WEBAPP_URL</button>
      </div>
    </div>
  </div>`;
}

function renderSetup() {
  return `
  <div class="min-h-screen flex items-center justify-center p-4" style="background: linear-gradient(135deg, #1E3A5F, #2563EB)">
    <div class="glass-card p-8 w-full max-w-lg">
      <h2 class="text-lg font-bold mb-4 text-gray-800">ตั้งค่า WEBAPP_URL</h2>
      <p class="text-sm text-gray-500 mb-4">วาง URL ที่ได้จากการ Deploy Apps Script Web App (ลงท้ายด้วย /exec)</p>
      <div class="form-group">
        <label>WEBAPP_URL</label>
        <input type="url" id="setup-url" class="form-input" placeholder="https://script.google.com/macros/s/xxx/exec" value="${CONFIG.WEBAPP_URL}">
      </div>
      <div class="flex gap-2">
        <button onclick="saveSetup()" class="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">บันทึก</button>
        <button onclick="navigate('login')" class="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">กลับ</button>
      </div>
    </div>
  </div>`;
}

function saveSetup() {
  const url = document.getElementById('setup-url').value.trim();
  if (!url) { Swal.fire('', 'กรุณากรอก URL', 'warning'); return; }
  CONFIG.WEBAPP_URL = url;
  localStorage.setItem('WEBAPP_URL', url);
  Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
  setTimeout(() => navigate('login'), 1200);
}

// ============================================================
// RENDER: Dashboard
// ============================================================
async function renderDashboard(app) {
  app.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';
  const res = await api('getDashboardStats');
  const d = res.success ? res.data : { totalPatients: 0, totalCareGivers: 0, totalVisitsThisMonth: 0, totalFollowUp: 0, casesToTrack: [], recentVisits: [] };

  app.innerHTML = `
  <!-- Hero -->
  <div class="hero-section mb-6">
    <div class="relative z-10">
      <div class="flex items-center gap-2 mb-2">
        <span class="badge badge-green">พบข้อมูลจริงแล้ว</span>
      </div>
      <h1 class="text-2xl md:text-3xl font-bold mb-1">Care Dashboard</h1>
      <p class="text-blue-100 text-sm mb-4">ระบบติดตามการดูแล บันทึกการเยี่ยม และวิเคราะห์ข้อมูลผู้มีภาวะพึ่งพิง</p>
      ${isAdmin() ? `<button onclick="showImportModal()" class="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium backdrop-blur transition">
        <i data-lucide="upload" class="w-4 h-4 inline mr-1"></i> นำเข้า Excel/CSV
      </button>` : ''}
      <div class="flex flex-wrap gap-4 mt-4 text-sm text-blue-100">
        <span>ผู้ป่วย <b class="text-white">${d.totalPatients}</b> คน</span>
        <span>Care Giver <b class="text-white">${d.totalCareGivers}</b> คน</span>
        <span>รายงาน <b class="text-white">${d.totalVisitsThisMonth}</b> ครั้ง/เดือน</span>
      </div>
    </div>
  </div>

  <!-- Action Cards -->
  ${isAdmin() ? `
  <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
    <div class="action-card" onclick="navigate('patients')">
      <div class="icon-wrap bg-blue-50"><i data-lucide="user-plus" class="w-5 h-5 text-blue-600"></i></div>
      <div class="text-sm font-medium text-gray-700">เพิ่มผู้มีภาวะพึ่งพิง</div>
    </div>
    <div class="action-card" onclick="navigate('caregivers')">
      <div class="icon-wrap bg-green-50"><i data-lucide="users" class="w-5 h-5 text-green-600"></i></div>
      <div class="text-sm font-medium text-gray-700">Care Giver</div>
    </div>
    <div class="action-card" onclick="navigate('assignments')">
      <div class="icon-wrap bg-purple-50"><i data-lucide="link" class="w-5 h-5 text-purple-600"></i></div>
      <div class="text-sm font-medium text-gray-700">มอบหมาย</div>
    </div>
    <div class="action-card" onclick="navigate('reports')">
      <div class="icon-wrap bg-yellow-50"><i data-lucide="bar-chart-3" class="w-5 h-5 text-yellow-600"></i></div>
      <div class="text-sm font-medium text-gray-700">วิเคราะห์ข้อมูล</div>
    </div>
    <div class="action-card" onclick="navigate('settings')">
      <div class="icon-wrap bg-gray-100"><i data-lucide="settings" class="w-5 h-5 text-gray-600"></i></div>
      <div class="text-sm font-medium text-gray-700">ตั้งค่า</div>
    </div>
  </div>` : ''}

  <!-- Stats -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    <div class="stat-card">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><i data-lucide="users" class="w-5 h-5 text-blue-600"></i></div>
        <div><div class="text-2xl font-bold text-gray-800">${d.totalPatients}</div><div class="text-xs text-gray-500">ผู้ป่วยทั้งหมด</div></div>
      </div>
    </div>
    <div class="stat-card">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><i data-lucide="heart-handshake" class="w-5 h-5 text-green-600"></i></div>
        <div><div class="text-2xl font-bold text-gray-800">${d.totalCareGivers}</div><div class="text-xs text-gray-500">Care Giver</div></div>
      </div>
    </div>
    <div class="stat-card">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center"><i data-lucide="clipboard-check" class="w-5 h-5 text-yellow-600"></i></div>
        <div><div class="text-2xl font-bold text-gray-800">${d.totalVisitsThisMonth}</div><div class="text-xs text-gray-500">เยี่ยมเดือนนี้</div></div>
      </div>
    </div>
    <div class="stat-card">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i></div>
        <div><div class="text-2xl font-bold text-gray-800">${d.totalFollowUp}</div><div class="text-xs text-gray-500">ติดตามพิเศษ</div></div>
      </div>
    </div>
  </div>

  <!-- Cases to track -->
  <div class="glass-card p-4 mb-6">
    <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2">
      <i data-lucide="eye" class="w-5 h-5 text-blue-600"></i> เคสที่ต้องติดตาม
    </h3>
    <div class="scroll-x">
      <table class="data-table">
        <thead><tr><th>ชื่อผู้ป่วย</th><th>หมู่</th><th>CG</th><th>เยี่ยมล่าสุด</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>
          ${(d.casesToTrack || []).slice(0, 10).map(c => `
          <tr>
            <td class="font-medium">${esc(c.patientName)}</td>
            <td>${esc(c.moo)}</td>
            <td>${esc(c.cgName)}</td>
            <td>${esc(c.lastVisitDate)}</td>
            <td><span class="badge ${c.status === 'ปกติ' ? 'badge-green' : c.status === 'ยังไม่เคยเยี่ยม' ? 'badge-yellow' : 'badge-red'}">${esc(c.status)}</span></td>
            <td><button onclick="navigate('visits',{patientId:'${c.patientId}'})" class="text-blue-600 text-sm hover:underline">ดูประวัติ</button></td>
          </tr>`).join('')}
          ${(!d.casesToTrack || d.casesToTrack.length === 0) ? '<tr><td colspan="6" class="text-center text-gray-400 py-8">ยังไม่มีข้อมูล</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  </div>`;
  lucide.createIcons();
}

// ============================================================
// RENDER: Patients
// ============================================================
async function renderPatients(app) {
  app.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';
  const res = await api('listPatients');
  state.patients = res.success ? res.data : [];

  app.innerHTML = `
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-bold text-gray-800">ผู้มีภาวะพึ่งพิง</h2>
    ${isAdmin() ? `<button onclick="showPatientModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1">
      <i data-lucide="plus" class="w-4 h-4"></i> เพิ่มผู้ป่วย
    </button>` : ''}
  </div>
  <div class="form-group mb-4">
    <input type="text" id="patient-search" class="form-input" placeholder="ค้นหาชื่อ, PID, หมู่..." oninput="filterPatients()">
  </div>
  <div id="patients-list" class="grid gap-3">
    ${state.patients.map(p => patientCard(p)).join('')}
    ${state.patients.length === 0 ? '<p class="text-center text-gray-400 py-8">ยังไม่มีข้อมูลผู้ป่วย</p>' : ''}
  </div>`;
  lucide.createIcons();
}

function patientCard(p) {
  const avatar = p.profileImageUrl ? `<img src="${p.profileImageUrl}" alt="">` : p.name.charAt(0);
  return `
  <div class="glass-card p-4 flex items-center gap-3">
    <div class="avatar">${avatar}</div>
    <div class="flex-1 min-w-0">
      <div class="font-medium text-gray-800 truncate">${esc(p.name)}</div>
      <div class="text-xs text-gray-500">${esc(p.pid)} • หมู่ ${esc(p.moo || '-')} • ${esc(p.phone || '-')}</div>
    </div>
    <div class="flex gap-1">
      <button onclick="navigate('visits',{patientId:'${p.patientId}'})" class="p-2 rounded-lg hover:bg-blue-50 text-blue-600" title="ดูประวัติ"><i data-lucide="history" class="w-4 h-4"></i></button>
      ${isAdmin() ? `
      <button onclick="showPatientModal('${p.patientId}')" class="p-2 rounded-lg hover:bg-yellow-50 text-yellow-600" title="แก้ไข"><i data-lucide="edit" class="w-4 h-4"></i></button>
      <button onclick="deletePatient('${p.patientId}','${esc(p.name)}')" class="p-2 rounded-lg hover:bg-red-50 text-red-500" title="ลบ"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
    </div>
  </div>`;
}

function filterPatients() {
  const q = document.getElementById('patient-search').value.toLowerCase();
  const filtered = state.patients.filter(p =>
    p.name.toLowerCase().includes(q) || (p.pid || '').includes(q) || (p.moo || '').includes(q)
  );
  document.getElementById('patients-list').innerHTML = filtered.map(p => patientCard(p)).join('') || '<p class="text-center text-gray-400 py-8">ไม่พบข้อมูล</p>';
  lucide.createIcons();
}

async function showPatientModal(patientId) {
  let p = {};
  if (patientId) {
    p = state.patients.find(x => x.patientId === patientId) || {};
  }
  const { value: formValues } = await Swal.fire({
    title: patientId ? 'แก้ไขผู้ป่วย' : 'เพิ่มผู้ป่วยใหม่',
    html: `
      <div style="text-align:left">
        <div class="form-group"><label>ชื่อ-สกุล *</label><input id="swal-name" class="swal2-input" value="${esc(p.name||'')}"></div>
        <div class="form-group"><label>เลขบัตรประชาชน *</label><input id="swal-pid" class="swal2-input" maxlength="13" value="${esc(p.pid||'')}"></div>
        <div class="form-group"><label>วันเกิด (พ.ศ. dd/mm/yyyy)</label><input id="swal-birthdate" class="swal2-input" placeholder="01/01/2530" value="${esc(p.birthdateBE||'')}"></div>
        <div class="form-group"><label>เพศ</label><select id="swal-gender" class="swal2-select"><option value="">เลือก</option><option value="ชาย" ${p.gender==='ชาย'?'selected':''}>ชาย</option><option value="หญิง" ${p.gender==='หญิง'?'selected':''}>หญิง</option></select></div>
        <div class="form-group"><label>ที่อยู่</label><input id="swal-address" class="swal2-input" value="${esc(p.address||'')}"></div>
        <div class="form-group"><label>หมู่</label><input id="swal-moo" class="swal2-input" value="${esc(p.moo||'')}"></div>
        <div class="form-group"><label>ชื่อผู้ดูแล</label><input id="swal-caregiver" class="swal2-input" value="${esc(p.caregiverName||'')}"></div>
        <div class="form-group"><label>เบอร์โทร</label><input id="swal-phone" class="swal2-input" value="${esc(p.phone||'')}"></div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: patientId ? 'บันทึก' : 'เพิ่ม',
    cancelButtonText: 'ยกเลิก',
    preConfirm: () => ({
      name: document.getElementById('swal-name').value,
      pid: document.getElementById('swal-pid').value,
      birthdateBE: document.getElementById('swal-birthdate').value,
      gender: document.getElementById('swal-gender').value,
      address: document.getElementById('swal-address').value,
      moo: document.getElementById('swal-moo').value,
      caregiverName: document.getElementById('swal-caregiver').value,
      phone: document.getElementById('swal-phone').value
    })
  });

  if (!formValues) return;
  const action = patientId ? 'updatePatient' : 'createPatient';
  if (patientId) formValues.patientId = patientId;
  const res = await api(action, formValues);
  if (res.success) {
    Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false });
    setTimeout(() => renderPatients(document.getElementById('app')), 1000);
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

async function deletePatient(patientId, name) {
  const confirm = await Swal.fire({
    title: 'ยืนยันลบ?',
    text: `ลบ "${name}" ข้อมูลจะหายถาวร`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#EF4444',
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก'
  });
  if (!confirm.isConfirmed) return;
  const res = await api('deletePatient', { patientId });
  if (res.success) {
    Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false });
    setTimeout(() => renderPatients(document.getElementById('app')), 1000);
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

// ============================================================
// RENDER: CareGivers
// ============================================================
async function renderCaregivers(app) {
  app.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';
  const res = await api('listCG');
  state.caregivers = res.success ? res.data : [];

  app.innerHTML = `
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-bold text-gray-800">Care Giver</h2>
    ${isAdmin() ? `<button onclick="showCGModal()" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center gap-1">
      <i data-lucide="plus" class="w-4 h-4"></i> เพิ่ม CG
    </button>` : ''}
  </div>
  <div class="grid gap-3">
    ${state.caregivers.map(c => `
    <div class="glass-card p-4 flex items-center gap-3">
      <div class="avatar bg-green-100 text-green-700">${c.name.charAt(0)}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-gray-800">${esc(c.name)}</div>
        <div class="text-xs text-gray-500">${esc(c.cgid)} • ${esc(c.phone || '-')} • Username: ${esc(c.username || '-')}</div>
      </div>
      ${isAdmin() ? `<div class="flex gap-1">
        <button onclick="showCGModal('${c.cgid}')" class="p-2 rounded-lg hover:bg-yellow-50 text-yellow-600"><i data-lucide="edit" class="w-4 h-4"></i></button>
        <button onclick="deleteCG('${c.cgid}','${esc(c.name)}')" class="p-2 rounded-lg hover:bg-red-50 text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>` : ''}
    </div>`).join('')}
    ${state.caregivers.length === 0 ? '<p class="text-center text-gray-400 py-8">ยังไม่มี Care Giver</p>' : ''}
  </div>`;
  lucide.createIcons();
}

async function showCGModal(cgid) {
  let c = {};
  if (cgid) c = state.caregivers.find(x => x.cgid === cgid) || {};
  const { value: fv } = await Swal.fire({
    title: cgid ? 'แก้ไข Care Giver' : 'เพิ่ม Care Giver',
    html: `<div style="text-align:left">
      <div class="form-group"><label>ชื่อ-สกุล *</label><input id="swal-name" class="swal2-input" value="${esc(c.name||'')}"></div>
      <div class="form-group"><label>เลขบัตรประชาชน</label><input id="swal-pid" class="swal2-input" maxlength="13" value="${esc(c.pid||'')}"></div>
      <div class="form-group"><label>ที่อยู่</label><input id="swal-address" class="swal2-input" value="${esc(c.address||'')}"></div>
      <div class="form-group"><label>หมู่</label><input id="swal-moo" class="swal2-input" value="${esc(c.moo||'')}"></div>
      <div class="form-group"><label>เบอร์โทร</label><input id="swal-phone" class="swal2-input" value="${esc(c.phone||'')}"></div>
      <div class="form-group"><label>Username</label><input id="swal-username" class="swal2-input" value="${esc(c.username||'')}" ${cgid ? 'disabled' : ''}></div>
      ${!cgid ? '<div class="form-group"><label>Password</label><input id="swal-password" class="swal2-input" type="password" placeholder="ค่าเริ่มต้น CG@1234"></div>' : ''}
    </div>`,
    showCancelButton: true,
    confirmButtonText: cgid ? 'บันทึก' : 'เพิ่ม',
    cancelButtonText: 'ยกเลิก',
    preConfirm: () => ({ name: document.getElementById('swal-name').value, pid: document.getElementById('swal-pid').value, address: document.getElementById('swal-address').value, moo: document.getElementById('swal-moo').value, phone: document.getElementById('swal-phone').value, username: document.getElementById('swal-username')?.value || '', password: document.getElementById('swal-password')?.value || '' })
  });
  if (!fv) return;
  const action = cgid ? 'updateCG' : 'createCG';
  if (cgid) fv.cgid = cgid;
  const res = await api(action, fv);
  if (res.success) {
    Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false });
    setTimeout(() => renderCaregivers(document.getElementById('app')), 1000);
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

async function deleteCG(cgid, name) {
  const confirm = await Swal.fire({ title: 'ยืนยันลบ?', text: `ลบ CG "${name}"`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' });
  if (!confirm.isConfirmed) return;
  const res = await api('deleteCG', { cgid });
  if (res.success) { Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false }); setTimeout(() => renderCaregivers(document.getElementById('app')), 1000); }
  else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}

// ============================================================
// RENDER: Assignments
// ============================================================
async function renderAssignments(app) {
  app.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';
  const [aRes, pRes, cRes] = await Promise.all([api('getAssignedPatients', {}), api('listPatients'), api('listCG')]);
  state.assignments = aRes.success ? aRes.data : [];
  state.patients = pRes.success ? pRes.data : [];
  state.caregivers = cRes.success ? cRes.data : [];

  app.innerHTML = `
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-bold text-gray-800">มอบหมายผู้ป่วย</h2>
    ${isAdmin() ? `<button onclick="showAssignModal()" class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition flex items-center gap-1">
      <i data-lucide="link" class="w-4 h-4"></i> มอบหมาย
    </button>` : ''}
  </div>
  <div class="grid gap-3">
    ${state.assignments.map(a => `
    <div class="glass-card p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-800">${esc(a.patientName || a.PatientName)}</div>
          <div class="text-xs text-gray-500">CG: ${esc(a.cgName || a.CGName)} • มอบหมายเมื่อ ${esc(a.assignedAt || a.AssignedAt || '')}</div>
        </div>
        ${isAdmin() ? `<button onclick="removeAssignment('${a.assignmentId || a.AssignmentID}')" class="p-2 rounded-lg hover:bg-red-50 text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button>` : ''}
      </div>
    </div>`).join('')}
    ${state.assignments.length === 0 ? '<p class="text-center text-gray-400 py-8">ยังไม่มีการมอบหมาย</p>' : ''}
  </div>`;
  lucide.createIcons();
}

async function showAssignModal() {
  const cgOpts = state.caregivers.map(c => `<option value="${c.cgid}">${c.name} (${c.cgid})</option>`).join('');
  const ptOpts = state.patients.map(p => `<option value="${p.patientId}">${p.name} (${p.pid})</option>`).join('');
  const { value: fv } = await Swal.fire({
    title: 'มอบหมายผู้ป่วยให้ CG',
    html: `<div style="text-align:left">
      <div class="form-group"><label>Care Giver</label><select id="swal-cgid" class="swal2-select">${cgOpts}</select></div>
      <div class="form-group"><label>ผู้ป่วย</label><select id="swal-pid" class="swal2-select">${ptOpts}</select></div>
    </div>`,
    showCancelButton: true, confirmButtonText: 'มอบหมาย', cancelButtonText: 'ยกเลิก',
    preConfirm: () => ({ cgid: document.getElementById('swal-cgid').value, patientId: document.getElementById('swal-pid').value })
  });
  if (!fv) return;
  const res = await api('assignPatient', fv);
  if (res.success) { Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false }); setTimeout(() => renderAssignments(document.getElementById('app')), 1000); }
  else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}

async function removeAssignment(id) {
  const confirm = await Swal.fire({ title: 'ยืนยันยกเลิก?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'ยกเลิกมอบหมาย', cancelButtonText: 'กลับ' });
  if (!confirm.isConfirmed) return;
  const res = await api('removeAssignment', { assignmentId: id });
  if (res.success) { Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false }); setTimeout(() => renderAssignments(document.getElementById('app')), 1000); }
}

// ============================================================
// RENDER: Visit History
// ============================================================
async function renderVisits(app, params) {
  const patientId = params?.patientId;
  if (!patientId) {
    // Show patient selector for member
    if (state.user.role === 'member') {
      app.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';
      const res = await api('getAssignedPatients', {});
      const list = res.success ? res.data : [];
      app.innerHTML = `
        <h2 class="text-lg font-bold text-gray-800 mb-4">เลือกผู้ป่วยเพื่อบันทึกการเยี่ยม</h2>
        <div class="grid gap-3">${list.map(a => `
          <div class="glass-card p-4 flex items-center gap-3 cursor-pointer hover:border-blue-300" onclick="navigate('visits',{patientId:'${a.patientId}'})">
            <div class="avatar">${(a.patientName||'?').charAt(0)}</div>
            <div class="flex-1"><div class="font-medium">${esc(a.patientName)}</div><div class="text-xs text-gray-500">${esc(a.patientPID||'')} • หมู่ ${esc(a.moo||'-')}</div></div>
            <i data-lucide="chevron-right" class="w-5 h-5 text-gray-400"></i>
          </div>`).join('')}
          ${list.length === 0 ? '<p class="text-center text-gray-400 py-8">ยังไม่มีผู้ป่วยที่ได้รับมอบหมาย</p>' : ''}
        </div>`;
      lucide.createIcons();
      return;
    }
    app.innerHTML = '<p class="text-gray-500 p-8">กรุณาเลือกผู้ป่วยจากหน้ารายชื่อ</p>';
    return;
  }

  app.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';
  const res = await api('getVisitHistoryByPatient', { patientId });
  const visits = res.success ? res.data : [];

  const patient = state.patients.find(p => p.patientId === patientId) || { name: patientId };

  app.innerHTML = `
  <div class="flex items-center justify-between mb-4">
    <div>
      <h2 class="text-lg font-bold text-gray-800">ประวัติการเยี่ยม</h2>
      <p class="text-sm text-gray-500">${esc(patient.name||'')}</p>
    </div>
    <button onclick="navigate('visit-form',{patientId:'${patientId}'})" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1">
      <i data-lucide="plus" class="w-4 h-4"></i> บันทึกเยี่ยมใหม่
    </button>
  </div>
  <div class="grid gap-3">
    ${visits.map(v => `
    <div class="glass-card p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="badge badge-blue">ครั้งที่ ${v.VisitNo}</span>
        <span class="text-sm text-gray-500">${esc(v.VisitDate)}</span>
      </div>
      <div class="text-sm text-gray-600 mb-2">
        ผู้เยี่ยม: ${esc(v.VisitorName)} • เวลา: ${esc(v.VisitTimeStart||'-')} - ${esc(v.VisitTimeEnd||'-')}
      </div>
      <div class="flex flex-wrap gap-2 text-xs">
        ${v.BMI ? `<span class="badge badge-green">BMI: ${v.BMI} (${v.BMIResult})</span>` : ''}
        ${v.Q2_Total !== '' && v.MentalHealthEnabled === 'true' ? `<span class="badge ${parseInt(v.Q9_Total)>=19?'badge-red':parseInt(v.Q9_Total)>=7?'badge-yellow':'badge-green'}">9Q: ${v.Q9_Total||'-'}</span>` : ''}
        ${v.SuicideRiskAlert === 'true' ? '<span class="badge badge-red">⚠ เสี่ยงฆ่าตัวตาย</span>' : ''}
      </div>
      <div class="flex gap-1 mt-2">
        <button onclick="deleteVisit('${v.VisitID}','${patientId}')" class="text-red-500 text-xs hover:underline">ลบ</button>
      </div>
    </div>`).join('')}
    ${visits.length === 0 ? '<p class="text-center text-gray-400 py-8">ยังไม่มีประวัติการเยี่ยม</p>' : ''}
  </div>`;
  lucide.createIcons();
}

async function deleteVisit(visitId, patientId) {
  const confirm = await Swal.fire({ title: 'ยืนยันลบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' });
  if (!confirm.isConfirmed) return;
  const res = await api('deleteVisit', { visitId });
  if (res.success) { Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false }); setTimeout(() => navigate('visits', { patientId }), 1000); }
}

// ============================================================
// RENDER: Visit Form (Stepper)
// ============================================================
const VISIT_STEPS = [
  { name: 'สุขภาพแรกรับ', icon: 'heart-pulse' },
  { name: 'สัญญาณชีพ', icon: 'activity' },
  { name: 'สุขภาพจิต', icon: 'brain' },
  { name: 'กิจกรรมประจำวัน', icon: 'list-checks' },
  { name: 'สุขภาพพื้นฐาน', icon: 'shield-check' },
  { name: 'กิจกรรมอื่น', icon: 'clipboard-list' },
  { name: 'รูปภาพ/พิกัด', icon: 'camera' }
];

function renderVisitForm(app, params) {
  const patientId = params?.patientId;
  if (!patientId) { app.innerHTML = '<p class="p-8 text-gray-500">ไม่พบรหัสผู้ป่วย</p>'; return; }

  state.visitStep = 0;
  state.visitData = { patientId, visitorName: state.user.fullName || state.user.username, vitalSignsEnabled: false, mentalHealthEnabled: false, locationEnabled: false };
  state.selectedPatient = state.patients.find(p => p.patientId === patientId);

  renderVisitStepUI(app);
}

function renderVisitStepUI(app) {
  const step = state.visitStep;
  const progress = ((step + 1) / VISIT_STEPS.length * 100).toFixed(0);

  app.innerHTML = `
  <div class="mb-4">
    <button onclick="navigate('visits',{patientId:'${state.visitData.patientId}'})" class="text-blue-600 text-sm hover:underline flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> กลับ</button>
    <h2 class="text-lg font-bold text-gray-800 mt-1">บันทึกการเยี่ยมบ้าน</h2>
    <p class="text-sm text-gray-500">${esc(state.selectedPatient?.name || '')}</p>
  </div>

  <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>

  <div class="stepper-bar scroll-x mb-4">
    ${VISIT_STEPS.map((s, i) => `
    <div class="step-item ${i === step ? 'active' : i < step ? 'completed' : ''}" onclick="goToStep(${i})">
      <span class="step-num">${i < step ? '✓' : i + 1}</span>
      <span class="hidden md:inline">${s.name}</span>
    </div>`).join('')}
  </div>

  <div class="glass-card p-4 mb-4" id="step-content">
    ${renderStepContent(step)}
  </div>

  <div class="flex justify-between">
    <button onclick="prevStep()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg ${step === 0 ? 'invisible' : ''}">ก่อนหน้า</button>
    ${step < VISIT_STEPS.length - 1 ?
      `<button onclick="nextStep()" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">ถัดไป</button>` :
      `<button onclick="submitVisit()" class="px-4 py-2 bg-green-600 text-white rounded-lg font-medium">บันทึกการเยี่ยม</button>`
    }
  </div>`;
  lucide.createIcons();
  initStepPlugins(step);
}

function goToStep(i) { state.visitStep = i; renderVisitStepUI(document.getElementById('app')); }
function prevStep() { if (state.visitStep > 0) { state.visitStep--; renderVisitStepUI(document.getElementById('app')); } }
function nextStep() { if (state.visitStep < VISIT_STEPS.length - 1) { state.visitStep++; renderVisitStepUI(document.getElementById('app')); } }

function renderStepContent(step) {
  const d = state.visitData;
  switch (step) {
    case 0: return renderStep0(d);
    case 1: return renderStep1(d);
    case 2: return renderStep2(d);
    case 3: return renderStep3(d);
    case 4: return renderStep4(d);
    case 5: return renderStep5(d);
    case 6: return renderStep6(d);
    default: return '';
  }
}

// Step 0: Basic health
function renderStep0(d) {
  return `
  <h3 class="font-bold text-gray-800 mb-3">สุขภาพแรกรับ</h3>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div class="form-group"><label>วันที่เยี่ยม *</label><input id="v-date" class="form-input flatpickr-date" value="${d.visitDate||''}"></div>
    <div class="form-group"><label>เวลาเริ่ม</label><input type="time" id="v-time-start" class="form-input" value="${d.visitTimeStart||''}" onchange="saveField('visitTimeStart',this.value)"></div>
    <div class="form-group"><label>เวลาสิ้นสุด</label><input type="time" id="v-time-end" class="form-input" value="${d.visitTimeEnd||''}" onchange="saveField('visitTimeEnd',this.value)"></div>
    <div class="form-group"><label>ผู้เยี่ยม</label><input class="form-input bg-gray-50" value="${esc(d.visitorName||'')}" readonly></div>
    <div class="form-group"><label>ชื่อผู้ดูแล</label><input class="form-input" value="${esc(d.caregiverName||'')}" onchange="saveField('caregiverName',this.value)"></div>
    <div class="form-group"><label>ความสัมพันธ์</label><input class="form-input" value="${esc(d.caregiverRelation||'')}" onchange="saveField('caregiverRelation',this.value)"></div>
  </div>
  <hr class="my-4">
  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div class="form-group"><label>น้ำหนัก (kg)</label><input type="number" step="0.1" id="v-weight" class="form-input" value="${d.weight||''}" oninput="calcBMI()"></div>
    <div class="form-group"><label>ส่วนสูง (cm)</label><input type="number" step="0.1" id="v-height" class="form-input" value="${d.height||''}" oninput="calcBMI()"></div>
    <div class="form-group"><label>BMI</label><input id="v-bmi" class="form-input bg-gray-50" readonly value="${d.bmi||''}"></div>
  </div>
  <div id="bmi-result" class="mt-2 ${d.bmiResult ? '' : 'hidden'}">
    <div class="score-display score-normal">${d.bmiResult || ''}</div>
  </div>`;
}

function calcBMI() {
  const w = parseFloat(document.getElementById('v-weight').value) || 0;
  const h = parseFloat(document.getElementById('v-height').value) || 0;
  state.visitData.weight = w;
  state.visitData.height = h;
  if (w > 0 && h > 0) {
    const bmi = (w / ((h / 100) ** 2)).toFixed(2);
    document.getElementById('v-bmi').value = bmi;
    state.visitData.bmi = bmi;
    let result = '', cls = 'score-normal';
    if (bmi < 18.5) { result = 'น้ำหนักต่ำกว่าเกณฑ์'; cls = 'score-mild'; }
    else if (bmi < 23) { result = 'น้ำหนักปกติ'; cls = 'score-normal'; }
    else if (bmi < 25) { result = 'ท้วม'; cls = 'score-moderate'; }
    else if (bmi < 30) { result = 'อ้วน'; cls = 'score-moderate'; }
    else { result = 'อ้วนมาก'; cls = 'score-severe'; }
    state.visitData.bmiResult = result;
    const el = document.getElementById('bmi-result');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="score-display ${cls}">${result} (BMI: ${bmi})</div>`;
  }
}

// Step 1: Vital Signs
function renderStep1(d) {
  return `
  <div class="flex items-center justify-between mb-4">
    <h3 class="font-bold text-gray-800">สัญญาณชีพ</h3>
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-500">เปิด/ปิด</span>
      <div class="toggle-switch ${d.vitalSignsEnabled ? 'on' : ''}" onclick="toggleVital()"><div class="toggle-knob"></div></div>
    </div>
  </div>
  <div id="vital-fields" class="${d.vitalSignsEnabled ? '' : 'hidden'}">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="form-group"><label>อุณหภูมิ (°C)</label><input type="number" step="0.1" class="form-input" value="${d.temperature||''}" onchange="saveField('temperature',this.value)"></div>
      <div class="form-group"><label>ชีพจร (ครั้ง/นาที)</label><input type="number" class="form-input" value="${d.pulse||''}" onchange="saveField('pulse',this.value)"></div>
      <div class="form-group"><label>อัตราการหายใจ (ครั้ง/นาที)</label><input type="number" class="form-input" value="${d.respiration||''}" onchange="saveField('respiration',this.value)"></div>
      <div class="form-group"><label>ความดันโลหิต (Systolic/Diastolic)</label>
        <div class="flex gap-2">
          <input type="number" class="form-input" placeholder="Systolic" value="${d.bpSystolic||''}" onchange="saveField('bpSystolic',this.value)">
          <span class="self-center">/</span>
          <input type="number" class="form-input" placeholder="Diastolic" value="${d.bpDiastolic||''}" onchange="saveField('bpDiastolic',this.value)">
        </div>
      </div>
    </div>
  </div>`;
}

function toggleVital() {
  state.visitData.vitalSignsEnabled = !state.visitData.vitalSignsEnabled;
  document.querySelector('.toggle-switch').classList.toggle('on');
  document.getElementById('vital-fields').classList.toggle('hidden');
}

// Step 2: Mental Health 2Q/9Q/8Q
function renderStep2(d) {
  return `
  <div class="flex items-center justify-between mb-4">
    <h3 class="font-bold text-gray-800">แบบประเมินสุขภาพจิต</h3>
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-500">เปิด/ปิด</span>
      <div class="toggle-switch ${d.mentalHealthEnabled ? 'on' : ''}" onclick="toggleMH()"><div class="toggle-knob"></div></div>
    </div>
  </div>
  <div id="mh-fields" class="${d.mentalHealthEnabled ? '' : 'hidden'}">
    <!-- 2Q -->
    <div class="mb-4 p-3 rounded-lg bg-blue-50">
      <h4 class="font-bold text-blue-800 mb-2">2Q — แบบคัดกรองโรคซึมเศร้า</h4>
      <div class="mb-3">
        <p class="text-sm mb-2">1. ใน 2 สัปดาห์ที่ผ่านมา ท่านรู้สึก หดหู่ เศร้า หรือท้อแท้สิ้นหวัง หรือไม่</p>
        <div class="flex gap-2">
          <div class="mh-option flex-1 ${d.q2_1===0?'selected':''}" onclick="setMH('q2_1',0)">ไม่มี (0)</div>
          <div class="mh-option flex-1 ${d.q2_1===1?'selected-risk':''}" onclick="setMH('q2_1',1)">มี (1)</div>
        </div>
      </div>
      <div class="mb-3">
        <p class="text-sm mb-2">2. ใน 2 สัปดาห์ที่ผ่านมา ท่านรู้สึก เบื่อ ทำอะไรก็ไม่เพลิดเพลิน หรือไม่</p>
        <div class="flex gap-2">
          <div class="mh-option flex-1 ${d.q2_2===0?'selected':''}" onclick="setMH('q2_2',0)">ไม่มี (0)</div>
          <div class="mh-option flex-1 ${d.q2_2===1?'selected-risk':''}" onclick="setMH('q2_2',1)">มี (1)</div>
        </div>
      </div>
      <div id="q2-result"></div>
    </div>

    <!-- 9Q -->
    <div id="q9-section" class="mb-4 p-3 rounded-lg bg-yellow-50 ${(d.q2_1||0)+(d.q2_2||0)>=1?'':'hidden'}">
      <h4 class="font-bold text-yellow-800 mb-2">9Q — แบบประเมินโรคซึมเศร้า</h4>
      <p class="text-xs text-gray-500 mb-3">ในช่วง 2 สัปดาห์ที่ผ่านมา ท่านมีอาการเหล่านี้บ่อยแค่ไหน</p>
      ${renderQ9Items(d)}
      <div id="q9-result" class="mt-3"></div>
    </div>

    <!-- 8Q -->
    <div id="q8-section" class="mb-4 p-3 rounded-lg bg-red-50 ${(d.q9_total||0)>=7?'':'hidden'}">
      <h4 class="font-bold text-red-800 mb-2">8Q — แบบประเมินความเสี่ยงต่อการฆ่าตัวตาย</h4>
      ${renderQ8Items(d)}
      <div id="q8-result" class="mt-3"></div>
    </div>
  </div>`;
}

const Q9_QUESTIONS = [
  'เบื่อ ไม่สนใจอยากทำอะไร',
  'ไม่สบายใจ ซึมเศร้า ท้อแท้',
  'หลับยาก หลับๆตื่นๆ หรือหลับมากไป',
  'เหนื่อยง่าย ไม่ค่อยมีแรง',
  'เบื่ออาหาร หรือกินมากเกินไป',
  'รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลว หรือทำให้ครอบครัวผิดหวัง',
  'สมาธิไม่ดี เช่น อ่านหนังสือ ดูโทรทัศน์ ไม่รู้เรื่อง',
  'พูดช้า ทำอะไรช้าลง หรือกระสับกระส่าย อยู่ไม่สุข',
  'คิดทำร้ายตนเอง หรือคิดว่าตายไปคงจะดี'
];
const Q9_OPTIONS = ['ไม่มีเลย (0)', 'บางวัน (1)', 'บ่อย (2)', 'ทุกวัน (3)'];

function renderQ9Items(d) {
  return Q9_QUESTIONS.map((q, i) => `
  <div class="mb-3">
    <p class="text-sm mb-1">${i + 1}. ${q}</p>
    <div class="grid grid-cols-4 gap-1">
      ${Q9_OPTIONS.map((opt, val) => `<div class="mh-option text-xs ${d['q9_'+(i+1)]===val?'selected':''}" onclick="setQ9(${i+1},${val})">${opt}</div>`).join('')}
    </div>
  </div>`).join('');
}

function renderQ8Items(d) {
  const items = [
    { key: 'q8_1', q: '1. คิดอยากตาย หรือคิดว่าตายไปจะดีกว่า', vals: [{l:'ไม่มี',v:0},{l:'มี',v:1}] },
    { key: 'q8_2', q: '2. อยากทำร้ายตัวเอง', vals: [{l:'ไม่มี',v:0},{l:'มี',v:2}] },
    { key: 'q8_3', q: '3. คิดเกี่ยวกับการฆ่าตัวตาย (ในช่วง 1 เดือนที่ผ่านมา)', vals: [{l:'ไม่มี',v:0},{l:'มี',v:6}] },
    { key: 'q8_4', q: '4. มีแผนจะฆ่าตัวตาย', vals: [{l:'ไม่มี',v:0},{l:'มี',v:8}] },
    { key: 'q8_5', q: '5. ได้เตรียมการ/เตรียมอุปกรณ์ เพื่อจะฆ่าตัวตาย', vals: [{l:'ไม่มี',v:0},{l:'มี',v:9}] },
    { key: 'q8_6', q: '6. เคยทำร้ายตนเองแต่ไม่ได้ตั้งใจจะให้ตาย', vals: [{l:'ไม่มี',v:0},{l:'มี',v:4}] },
    { key: 'q8_7', q: '7. เคยพยายามฆ่าตัวตาย โดยตั้งใจให้ตาย', vals: [{l:'ไม่มี',v:0},{l:'มี',v:10}] },
    { key: 'q8_8', q: '8. เคยพยายามฆ่าตัวตายมาตลอดชีวิต', vals: [{l:'ไม่มี',v:0},{l:'มี',v:4}] }
  ];

  return items.map(item => `
  <div class="mb-3">
    <p class="text-sm mb-1">${item.q}</p>
    <div class="flex gap-2">
      ${item.vals.map(v => `<div class="mh-option flex-1 text-xs ${d[item.key]===v.v?(v.v>0?'selected-risk':'selected'):''}" onclick="setQ8('${item.key}',${v.v})">${v.l} (${v.v})</div>`).join('')}
    </div>
    ${item.key === 'q8_3' && d.q8_3 > 0 ? `
    <div class="mt-2 ml-4">
      <p class="text-sm mb-1">3.1 ถ้ามี: สามารถควบคุมความคิดนั้นได้หรือไม่</p>
      <div class="flex gap-2">
        <div class="mh-option flex-1 text-xs ${d.q8_3_1===0?'selected':''}" onclick="setQ8('q8_3_1',0)">ควบคุมได้ (0)</div>
        <div class="mh-option flex-1 text-xs ${d.q8_3_1===8?'selected-risk':''}" onclick="setQ8('q8_3_1',8)">ควบคุมไม่ได้ (8)</div>
      </div>
    </div>` : ''}
  </div>`).join('');
}

function toggleMH() {
  state.visitData.mentalHealthEnabled = !state.visitData.mentalHealthEnabled;
  document.querySelector('#mh-fields')?.closest('.glass-card')?.querySelector('.toggle-switch')?.classList.toggle('on');
  document.getElementById('mh-fields').classList.toggle('hidden');
}

function setMH(key, val) {
  state.visitData[key] = val;
  updateMHDisplay();
  renderVisitStepUI(document.getElementById('app'));
}

function setQ9(num, val) {
  state.visitData['q9_' + num] = val;
  calcQ9();
  renderVisitStepUI(document.getElementById('app'));
}

function setQ8(key, val) {
  state.visitData[key] = val;
  calcQ8();
  renderVisitStepUI(document.getElementById('app'));
}

function updateMHDisplay() {
  const d = state.visitData;
  const q2Total = (d.q2_1 || 0) + (d.q2_2 || 0);
  d.q2_total = q2Total;
  if (q2Total === 0) {
    d.q2_result = 'ไม่มีอาการ';
  } else {
    d.q2_result = 'มีอาการ ต้องประเมิน 9Q';
  }
}

function calcQ9() {
  const d = state.visitData;
  let total = 0;
  for (let i = 1; i <= 9; i++) total += (d['q9_' + i] || 0);
  d.q9_total = total;
  if (total < 7) d.q9_result = 'ไม่มีอาการ/น้อยมาก';
  else if (total <= 12) d.q9_result = 'มีอาการน้อย';
  else if (total <= 18) d.q9_result = 'มีอาการปานกลาง';
  else d.q9_result = 'มีอาการรุนแรง';
}

function calcQ8() {
  const d = state.visitData;
  const total = (d.q8_1||0) + (d.q8_2||0) + (d.q8_3||0) + (d.q8_3_1||0) + (d.q8_4||0) + (d.q8_5||0) + (d.q8_6||0) + (d.q8_7||0) + (d.q8_8||0);
  d.q8_total = total;
  if (total === 0) d.q8_result = 'ไม่มีแนวโน้มฆ่าตัวตาย';
  else if (total <= 8) d.q8_result = 'มีแนวโน้มน้อย';
  else if (total <= 16) d.q8_result = 'มีแนวโน้มปานกลาง';
  else {
    d.q8_result = 'มีแนวโน้มรุนแรง — ส่งต่อด่วน';
    d.suicideRiskAlert = true;
    Swal.fire({
      icon: 'error',
      title: '⚠ เตือน: ความเสี่ยงสูง',
      html: '<p class="text-red-600 font-bold">ผู้ป่วยมีแนวโน้มฆ่าตัวตายรุนแรง<br>กรุณาส่งต่อจิตแพทย์ด่วน!</p>',
      confirmButtonColor: '#EF4444'
    });
  }
}

// Step 3-5: Activities
const DAILY_ACTIVITIES = ['การรับประทานอาหาร', 'การแต่งตัว/เปลี่ยนเสื้อผ้า', 'การอาบน้ำ/ทำความสะอาดร่างกาย', 'การเคลื่อนย้ายตัว', 'การใช้ห้องน้ำ', 'การกลั้นปัสสาวะ/อุจจาระ'];
const HEALTH_ACTIVITIES = ['ตรวจวัดความดันโลหิต', 'ตรวจระดับน้ำตาลในเลือด', 'ดูแลแผล/ให้ยา', 'กายภาพบำบัด/ออกกำลังกาย', 'สอนการดูแลตนเอง', 'ประเมินสุขภาพจิต'];
const OTHER_ACTIVITIES = ['ทำความสะอาดบ้าน', 'จัดสิ่งแวดล้อม', 'ให้คำปรึกษาครอบครัว', 'ประสานงานกับ อสม./รพ.สต.', 'ส่งต่อ/นัดพบแพทย์', 'อื่นๆ'];

function renderStep3(d) { return renderActivityStep('กิจกรรมช่วยเหลือประจำวัน', DAILY_ACTIVITIES, 'dailyActivities', d); }
function renderStep4(d) { return renderActivityStep('กิจกรรมสุขภาพพื้นฐาน', HEALTH_ACTIVITIES, 'healthActivities', d); }
function renderStep5(d) { return renderActivityStep('กิจกรรมอื่นๆ', OTHER_ACTIVITIES, 'otherActivities', d); }

function renderActivityStep(title, items, key, d) {
  const selected = (d[key] || '').split(',').filter(Boolean);
  return `
  <h3 class="font-bold text-gray-800 mb-3">${title}</h3>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
    ${items.map(item => `
    <div class="checkbox-card ${selected.includes(item)?'checked':''}" onclick="toggleActivity('${key}','${item}',this)">
      <div class="w-5 h-5 rounded border-2 flex items-center justify-center ${selected.includes(item)?'bg-green-500 border-green-500 text-white':'border-gray-300'}">
        ${selected.includes(item)?'✓':''}
      </div>
      <span>${item}</span>
    </div>`).join('')}
  </div>`;
}

function toggleActivity(key, item, el) {
  let selected = (state.visitData[key] || '').split(',').filter(Boolean);
  const idx = selected.indexOf(item);
  if (idx >= 0) selected.splice(idx, 1);
  else selected.push(item);
  state.visitData[key] = selected.join(',');
  renderVisitStepUI(document.getElementById('app'));
}

// Step 6: Images & Location
function renderStep6(d) {
  return `
  <h3 class="font-bold text-gray-800 mb-3">รูปภาพและพิกัด</h3>

  <div class="form-group">
    <label>รูปโปรไฟล์ (1 รูป)</label>
    <input type="file" accept="image/*" capture="environment" onchange="handleProfileImage(event)" class="form-input">
    <div id="profile-preview" class="mt-2"></div>
  </div>

  <div class="form-group">
    <label>รูปกิจกรรมการดูแล (อย่างน้อย 3 รูป)</label>
    <input type="file" accept="image/*" multiple onchange="handleServiceImages(event)" class="form-input">
    <div id="service-preview" class="image-grid mt-2"></div>
  </div>

  <hr class="my-4">

  <div class="flex items-center justify-between mb-3">
    <label class="font-medium text-gray-700">ตำแหน่ง GPS</label>
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-500">เปิด/ปิด</span>
      <div class="toggle-switch ${d.locationEnabled ? 'on' : ''}" onclick="toggleLocation()"><div class="toggle-knob"></div></div>
    </div>
  </div>
  <div id="location-fields" class="${d.locationEnabled ? '' : 'hidden'}">
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div class="form-group"><label>Latitude</label><input id="v-lat" class="form-input bg-gray-50" readonly value="${d.latitude||''}"></div>
      <div class="form-group"><label>Longitude</label><input id="v-lng" class="form-input bg-gray-50" readonly value="${d.longitude||''}"></div>
    </div>
    <button onclick="getLocation()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm mb-3">
      <i data-lucide="map-pin" class="w-4 h-4 inline mr-1"></i> ดึงตำแหน่งปัจจุบัน
    </button>
    <div id="map-container" class="map-container"></div>
  </div>

  <div class="form-group mt-4">
    <label>หมายเหตุ</label>
    <textarea class="form-input" rows="3" onchange="saveField('notes',this.value)">${esc(d.notes||'')}</textarea>
  </div>`;
}

function toggleLocation() {
  state.visitData.locationEnabled = !state.visitData.locationEnabled;
  renderVisitStepUI(document.getElementById('app'));
}

function getLocation() {
  if (!navigator.geolocation) { Swal.fire('', 'เบราว์เซอร์ไม่รองรับ GPS', 'warning'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    state.visitData.latitude = pos.coords.latitude.toFixed(6);
    state.visitData.longitude = pos.coords.longitude.toFixed(6);
    document.getElementById('v-lat').value = state.visitData.latitude;
    document.getElementById('v-lng').value = state.visitData.longitude;
    initMap(state.visitData.latitude, state.visitData.longitude);
  }, err => {
    Swal.fire('', 'ไม่สามารถดึงตำแหน่งได้: ' + err.message, 'warning');
  });
}

let mapInstance = null;
function initMap(lat, lng) {
  const container = document.getElementById('map-container');
  if (!container) return;
  if (mapInstance) mapInstance.remove();
  mapInstance = L.map(container).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapInstance);
  L.marker([lat, lng]).addTo(mapInstance).bindPopup('ตำแหน่งเยี่ยม').openPopup();
}

// Image handlers
let profileImageData = null;
let serviceImagesData = [];

async function handleProfileImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await compressImage(await fileToDataUrl(file));
  profileImageData = dataUrl;
  document.getElementById('profile-preview').innerHTML = `<img src="${dataUrl}" class="w-24 h-24 rounded-lg object-cover">`;
}

async function handleServiceImages(e) {
  const files = Array.from(e.target.files);
  serviceImagesData = [];
  const preview = document.getElementById('service-preview');
  preview.innerHTML = '';
  for (const file of files) {
    const dataUrl = await compressImage(await fileToDataUrl(file));
    serviceImagesData.push(dataUrl);
    preview.innerHTML += `<div class="img-thumb"><img src="${dataUrl}" alt=""></div>`;
  }
}

function fileToDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxWidth = 1280, quality = 0.85) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

function saveField(key, val) { state.visitData[key] = val; }

function initStepPlugins(step) {
  if (step === 0) {
    setTimeout(() => {
      const el = document.getElementById('v-date');
      if (el && window.flatpickr) {
        flatpickr(el, {
          dateFormat: 'd/m/Y',
          locale: 'th',
          onChange: (sel, dateStr) => { state.visitData.visitDate = dateStr; }
        });
      }
    }, 100);
  }
  if (step === 6 && state.visitData.locationEnabled && state.visitData.latitude) {
    setTimeout(() => initMap(state.visitData.latitude, state.visitData.longitude), 200);
  }
}

// Submit visit
async function submitVisit() {
  const d = state.visitData;
  if (!d.visitDate) { Swal.fire('', 'กรุณากรอกวันที่เยี่ยม (Step 1)', 'warning'); return; }

  // Upload images
  if (profileImageData) {
    const imgRes = await api('uploadFileToDrive', { base64: profileImageData, folderType: 'profile', filename: 'visit_profile_' + Date.now() });
    if (imgRes.success) {
      d.profileImageUrl = imgRes.data.url;
      d.profileImageFileId = imgRes.data.fileId;
    }
  }

  if (serviceImagesData.length > 0) {
    const urls = [], ids = [];
    for (const img of serviceImagesData) {
      const r = await api('uploadFileToDrive', { base64: img, folderType: 'service', filename: 'service_' + Date.now() });
      if (r.success) { urls.push(r.data.url); ids.push(r.data.fileId); }
    }
    d.serviceImageUrls = urls.join(',');
    d.serviceImageFileIds = ids.join(',');
  }

  const res = await api('createVisit', d);
  if (res.success) {
    Swal.fire({ icon: 'success', title: res.message, timer: 2000, showConfirmButton: false });
    profileImageData = null;
    serviceImagesData = [];
    setTimeout(() => navigate('visits', { patientId: d.patientId }), 1500);
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

// ============================================================
// RENDER: Reports
// ============================================================
async function renderReports(app) {
  app.innerHTML = `
  <h2 class="text-lg font-bold text-gray-800 mb-4">รายงาน</h2>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
    <div class="glass-card p-4">
      <h3 class="font-medium text-gray-700 mb-2">รายงานรายวัน</h3>
      <input type="text" id="report-date" class="form-input flatpickr-date mb-2" placeholder="เลือกวันที่">
      <button onclick="reportByDate()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm w-full">ค้นหา</button>
    </div>
    <div class="glass-card p-4">
      <h3 class="font-medium text-gray-700 mb-2">รายงานรายเดือน</h3>
      <div class="flex gap-2 mb-2">
        <select id="report-month" class="form-input">${[...Array(12)].map((_, i) => `<option value="${i + 1}">เดือน ${i + 1}</option>`).join('')}</select>
        <input type="number" id="report-year" class="form-input" placeholder="ปี พ.ศ." value="${new Date().getFullYear() + 543}">
      </div>
      <button onclick="reportByMonth()" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm w-full">ค้นหา</button>
    </div>
  </div>
  <div id="report-results" class="glass-card p-4">
    <p class="text-center text-gray-400">เลือกเงื่อนไขแล้วกดค้นหา</p>
  </div>`;
  lucide.createIcons();
  setTimeout(() => {
    if (window.flatpickr) {
      flatpickr('#report-date', { dateFormat: 'd/m/Y', locale: 'th' });
    }
  }, 100);
}

async function reportByDate() {
  const date = document.getElementById('report-date').value;
  if (!date) { Swal.fire('', 'กรุณาเลือกวันที่', 'warning'); return; }
  const res = await api('getVisitsByDate', { date });
  const visits = res.success ? res.data : [];
  document.getElementById('report-results').innerHTML = `
    <h3 class="font-medium mb-2">ผลลัพธ์: ${visits.length} รายการ (${date})</h3>
    ${visits.length > 0 ? `<div class="scroll-x"><table class="data-table"><thead><tr><th>ครั้งที่</th><th>ผู้ป่วย</th><th>ผู้เยี่ยม</th><th>เวลา</th><th>BMI</th></tr></thead><tbody>
      ${visits.map(v => `<tr><td>${v.VisitNo}</td><td>${esc(v.PatientName)}</td><td>${esc(v.VisitorName)}</td><td>${esc(v.VisitTimeStart||'-')}</td><td>${v.BMI||'-'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="text-gray-400">ไม่พบข้อมูล</p>'}`;
}

async function reportByMonth() {
  const month = document.getElementById('report-month').value;
  const year = document.getElementById('report-year').value;
  if (!month || !year) { Swal.fire('', 'กรุณาเลือกเดือนและปี', 'warning'); return; }
  const res = await api('getVisitsByMonth', { month, year });
  const visits = res.success ? res.data : [];
  document.getElementById('report-results').innerHTML = `
    <h3 class="font-medium mb-2">ผลลัพธ์: ${visits.length} รายการ (เดือน ${month}/${year})</h3>
    ${visits.length > 0 ? `<div class="scroll-x"><table class="data-table"><thead><tr><th>วันที่</th><th>ครั้งที่</th><th>ผู้ป่วย</th><th>ผู้เยี่ยม</th></tr></thead><tbody>
      ${visits.map(v => `<tr><td>${esc(v.VisitDate)}</td><td>${v.VisitNo}</td><td>${esc(v.PatientName)}</td><td>${esc(v.VisitorName)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="text-gray-400">ไม่พบข้อมูล</p>'}`;
}

// ============================================================
// RENDER: Settings
// ============================================================
async function renderSettings(app) {
  if (!isAdmin()) { app.innerHTML = '<p class="p-8 text-gray-500">เฉพาะ Admin เท่านั้น</p>'; return; }
  app.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';
  const res = await api('getSettings');
  const settings = res.success ? res.data : {};

  app.innerHTML = `
  <h2 class="text-lg font-bold text-gray-800 mb-4">ตั้งค่าระบบ</h2>
  <div class="glass-card p-4">
    ${Object.entries(settings).map(([key, val]) => `
    <div class="form-group">
      <label>${key} <span class="text-xs text-gray-400">${esc(val.detail || '')}</span></label>
      <input class="form-input setting-input" data-key="${key}" value="${esc(val.value || '')}">
    </div>`).join('')}
    <button onclick="saveAllSettings()" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium mt-2">บันทึกการตั้งค่า</button>
  </div>`;
  lucide.createIcons();
}

async function saveAllSettings() {
  const entries = [];
  document.querySelectorAll('.setting-input').forEach(el => {
    entries.push({ key: el.dataset.key, value: el.value });
  });
  const res = await api('saveSettings', { entries });
  if (res.success) Swal.fire({ icon: 'success', title: res.message, timer: 1500, showConfirmButton: false });
  else Swal.fire('ข้อผิดพลาด', res.message, 'error');
}

// ============================================================
// RENDER: Profile
// ============================================================
function renderProfile() {
  if (!state.user) return '<p class="p-8">ไม่พบข้อมูลผู้ใช้</p>';
  const u = state.user;
  return `
  <div class="max-w-md mx-auto">
    <div class="glass-card p-6 text-center">
      <div class="avatar w-20 h-20 text-2xl mx-auto mb-3">${(u.fullName || u.username).charAt(0)}</div>
      <h2 class="text-lg font-bold text-gray-800">${esc(u.fullName || u.username)}</h2>
      <p class="text-sm text-gray-500 mb-1">@${esc(u.username)}</p>
      <span class="badge ${u.role === 'admin' ? 'badge-blue' : 'badge-green'}">${u.role}</span>
      ${u.cgid ? `<p class="text-sm text-gray-500 mt-2">CGID: ${u.cgid}</p>` : ''}
      <button onclick="logout()" class="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg text-sm w-full">ออกจากระบบ</button>
    </div>
  </div>`;
}

// ============================================================
// IMPORT Modal
// ============================================================
async function showImportModal() {
  const { value: result } = await Swal.fire({
    title: 'นำเข้าข้อมูล CSV',
    html: `<div style="text-align:left">
      <div class="form-group">
        <label>ประเภทข้อมูล</label>
        <select id="import-type" class="swal2-select">
          <option value="patients">ผู้ป่วย (Patients)</option>
          <option value="caregivers">Care Giver</option>
        </select>
      </div>
      <div class="form-group">
        <label>ไฟล์ CSV</label>
        <input type="file" id="import-file" accept=".csv,.txt" class="swal2-file">
      </div>
      <p class="text-xs text-gray-400 mt-2">CSV ต้องมี header row: Name/ชื่อ, PID/เลขบัตร, Phone/โทรศัพท์, ...</p>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'นำเข้า',
    cancelButtonText: 'ยกเลิก',
    preConfirm: () => {
      return new Promise(resolve => {
        const type = document.getElementById('import-type').value;
        const file = document.getElementById('import-file').files[0];
        if (!file) { Swal.showValidationMessage('กรุณาเลือกไฟล์'); resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ type, csvData: reader.result });
        reader.readAsText(file, 'UTF-8');
      });
    }
  });
  if (!result) return;

  const action = result.type === 'patients' ? 'importCSVPatients' : 'importCSVCareGivers';
  const res = await api(action, { csvData: result.csvData });
  if (res.success) {
    let msg = res.message;
    if (res.data.errors && res.data.errors.length > 0) {
      msg += '<br><br><b>ข้อผิดพลาด:</b><br>' + res.data.errors.slice(0, 10).map(e => `<span class="text-xs text-red-500">• ${esc(e)}</span>`).join('<br>');
    }
    Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ', html: msg });
  } else {
    Swal.fire('ข้อผิดพลาด', res.message, 'error');
  }
}

// ============================================================
// UTILITIES
// ============================================================
function showLoading(show) {
  state.loading = show;
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function esc(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open', state.sidebarOpen);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (!CONFIG.WEBAPP_URL) {
    navigate('setup');
  } else if (isLoggedIn()) {
    navigate('dashboard');
  } else {
    navigate('login');
  }
});
