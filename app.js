// ------------------
// CONFIGURATION
// ------------------
// นำ URL ที่ได้จากการ Deploy Apps Script มาใส่ตรงนี้
const API_URL = "https://script.google.com/macros/s/AKfycbwAEJGrYFgQ2z3whJzkPleZUjqqeSnZP3iqt_NqqrunTPS3jRAz-9ZuHpkrlseSb9kC/exec"; 

// ------------------
// STATE MANAGEMENT
// ------------------
const state = {
  user: null,
  currentView: 'login',
  patients: [],
  caregivers: [],
  settings: [],
  dashboardStats: null,
  recentPatients: []
};

// ------------------
// API HELPERS
// ------------------
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.append('action', action);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  
  const response = await fetch(url.toString());
  return await response.json();
}

async function apiPost(action, payload = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    mode: 'cors',
    body: JSON.stringify({ action: action, payload: payload })
  });
  return await response.json();
}

// ------------------
// UI HELPERS
// ------------------
function showLoading() {
  Swal.fire({
    title: 'กำลังประมวลผล...',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });
}

function hideLoading() {
  Swal.close();
}

function navigateTo(view) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) {
    viewEl.classList.remove('hidden');
    state.currentView = view;
    renderDataForView(view);
  }
}

// ------------------
// INITIALIZATION
// ------------------
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Check login state from localStorage
  const savedUser = localStorage.getItem('ltc_user');
  if (savedUser) {
    state.user = JSON.parse(savedUser);
    setupAppForUser();
  } else {
    navigateTo('login');
  }

  attachEventListeners();
});

// ------------------
// EVENT LISTENERS
// ------------------
function attachEventListeners() {
  // Login form
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    
    showLoading();
    try {
      const res = await apiPost('login', { username: u, password: p });
      if (res.success && res.data) {
        state.user = res.data;
        localStorage.setItem('ltc_user', JSON.stringify(res.data));
        setupAppForUser();
        Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ', timer: 1500, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบล้มเหลว', text: res.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
    }
  });

  // Logout buttons
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.removeItem('ltc_user');
      state.user = null;
      window.location.reload();
    });
  });

  // Sidebar navigation
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = el.getAttribute('data-nav');
      navigateTo(target);
      // close sidebar on mobile
      if(window.innerWidth <= 768) {
        document.getElementById('sidebar')?.classList.remove('open');
      }
    });
  });

  // Mobile menu toggle
  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });
}

function setupAppForUser() {
  // Hide login, show main layout
  document.getElementById('login-layout').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Adjust UI based on Role
  if (state.user.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  }

  // Load username
  document.querySelectorAll('.display-name').forEach(el => {
    el.textContent = state.user.name;
  });

  navigateTo('dashboard');
}

// ------------------
// RENDER VIEWS
// ------------------
async function renderDataForView(view) {
  if (view === 'dashboard') await loadDashboard();
  if (view === 'patients') await loadPatients();
  // TODO: Add other views (visits, settings, etc.) based on requirements.
}

async function loadDashboard() {
  try {
    const res = await apiGet('getDashboardStats');
    if (res.success) {
      document.getElementById('stat-patients').textContent = res.data.totalPatients;
      document.getElementById('stat-cg').textContent = res.data.totalCareGivers;
      document.getElementById('stat-visits').textContent = res.data.visitsThisMonth;
      document.getElementById('stat-followup').textContent = res.data.followUpCases;
    }
    
    const recentRes = await apiGet('getRecentPatients');
    if (recentRes.success) {
      const container = document.getElementById('recent-patients-list');
      if (container) {
        container.innerHTML = recentRes.data.map(p => `
          <div class="flex items-center justify-between p-4 border-b last:border-0 hover:bg-gray-50">
            <div>
              <p class="font-medium text-gray-800">${p.name}</p>
              <p class="text-xs text-gray-500">เยี่ยมล่าสุด: ${p.lastVisit} | โดย: ${p.caregiverName}</p>
            </div>
            <div>
              <span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">${p.status}</span>
            </div>
          </div>
        `).join('') || '<div class="p-4 text-center text-gray-500">ไม่มีเคสที่ต้องติดตาม</div>';
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadPatients() {
  showLoading();
  try {
    let res;
    if (state.user.role === 'admin') {
      res = await apiGet('listPatients');
    } else {
      res = await apiGet('getAssignedPatients', { cgid: state.user.id });
    }
    
    hideLoading();
    if (res.success) {
      state.patients = res.data;
      const container = document.getElementById('patients-list');
      if (container) {
        container.innerHTML = state.patients.map(p => `
          <div class="glass-card p-4 flex flex-col md:flex-row items-center gap-4">
            <img src="${p.profileImageUrl}" class="w-16 h-16 rounded-full object-cover">
            <div class="flex-1">
              <h3 class="font-bold text-lg">${p.name}</h3>
              <p class="text-sm text-gray-600">PID: ${p.PID} | ที่อยู่: ${p.address} ม.${p.moo}</p>
            </div>
            <button class="btn-primary px-4 py-2 rounded-lg text-sm" onclick="startVisit('${p.patient_id}')">บันทึกเยี่ยม</button>
          </div>
        `).join('');
      }
    }
  } catch(err) {
    hideLoading();
    console.error(err);
  }
}

// ------------------
// VISIT LOGIC (Stepper & Mental Health)
// ------------------
window.startVisit = (patient_id) => {
  const p = state.patients.find(x => x.patient_id === patient_id);
  if (!p) return;
  // Initialize visit form logic here
  navigateTo('visit-form');
  document.getElementById('vf-patient-name').textContent = p.name;
  
  // Set default visit date
  flatpickr("#vf-date", {
    dateFormat: "d/m/Y",
    defaultDate: new Date(),
    locale: "th" // Requires flatpickr th locale included in HTML
  });
  
  // Mental Health Calculate Listeners
  setupMentalHealthCalculations();
}

function setupMentalHealthCalculations() {
  // Listeners for 2Q, 9Q, 8Q to calculate scores on the fly
  const calculateTotal = (prefix, count) => {
    let sum = 0;
    for(let i=1; i<=count; i++) {
      const val = document.querySelector(`input[name="${prefix}_${i}"]:checked`)?.value;
      if(val) sum += parseInt(val);
    }
    return sum;
  };

  // 2Q Logic
  document.querySelectorAll('input[name^="q2_"]').forEach(el => {
    el.addEventListener('change', () => {
      const score = calculateTotal('q2', 2);
      if(score > 0) {
        document.getElementById('section-9q').classList.remove('hidden');
      } else {
        document.getElementById('section-9q').classList.add('hidden');
        document.getElementById('section-8q').classList.add('hidden');
      }
    });
  });

  // 9Q Logic
  document.querySelectorAll('input[name^="q9_"]').forEach(el => {
    el.addEventListener('change', () => {
      const score = calculateTotal('q9', 9);
      document.getElementById('q9-score').textContent = score;
      if(score >= 7) {
        document.getElementById('section-8q').classList.remove('hidden');
      } else {
        document.getElementById('section-8q').classList.add('hidden');
      }
    });
  });

  // 8Q Logic
  document.querySelectorAll('input[name^="q8_"]').forEach(el => {
    el.addEventListener('change', () => {
      // Custom 8Q logic calculation goes here
      // Handle 3.1 logic, etc.
      let sum = 0;
      //... logic sum mapping
      if(sum >= 17) {
        Swal.fire('เตือน', 'มีความเสี่ยงฆ่าตัวตายรุนแรง กรุณาส่งต่อด่วน', 'warning');
      }
    });
  });
}
