// ------------------
// CONFIGURATION
// ------------------
// นำ URL ที่ได้จากการ Deploy Apps Script มาใส่ตรงนี้
const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL"; 

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

  // Init Flatpickr for Patient Birthdate
  flatpickr("#p-birth", {
    dateFormat: "d/m/Y",
    locale: "th"
  });

  // Add Patient Form
  document.getElementById('add-patient-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      PID: document.getElementById('p-pid').value,
      name: document.getElementById('p-name').value,
      birthdateBE: document.getElementById('p-birth').value,
      gender: document.getElementById('p-gender').value,
      address: document.getElementById('p-address').value,
      moo: document.getElementById('p-moo').value,
      caregiverName: document.getElementById('p-cgname').value,
      phone: document.getElementById('p-phone').value
    };
    
    // Handle Profile Image Upload
    const fileInput = document.getElementById('p-profile-img');
    if (fileInput && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      
      const filePromise = new Promise((resolve, reject) => {
        reader.onload = async (event) => {
          try {
            const base64Data = event.target.result;
            const res = await apiPost('uploadFileToDrive', {
              base64Data: base64Data,
              filename: file.name,
              type: 'profile'
            });
            if(res.success) resolve(res.data.url);
            else reject(new Error(res.message));
          } catch(err) {
            reject(err);
          }
        };
        reader.readAsDataURL(file);
      });

      try {
        Swal.fire({ title: 'กำลังอัปโหลดรูปภาพ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
        data.profileImageUrl = await filePromise;
      } catch(err) {
        hideLoading();
        Swal.fire('ผิดพลาด', 'อัปโหลดรูปไม่สำเร็จ: ' + err.message, 'error');
        return;
      }
    }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
    const res = await apiPost('createPatient', data);
    hideLoading();
    if(res.success) {
      Swal.fire('สำเร็จ', 'เพิ่มผู้ป่วยเรียบร้อย', 'success');
      document.getElementById('patient-modal').classList.add('hidden');
      document.getElementById('add-patient-form').reset();
      loadPatients();
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  });

  // Add CG Form
  document.getElementById('add-cg-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      username: document.getElementById('c-username').value,
      password: document.getElementById('c-password').value,
      name: document.getElementById('c-name').value,
      PID: document.getElementById('c-pid').value,
      address: document.getElementById('c-address').value,
      moo: document.getElementById('c-moo').value,
      phone: document.getElementById('c-phone').value
    };
    showLoading();
    const res = await apiPost('createCG', data);
    hideLoading();
    if(res.success) {
      Swal.fire('สำเร็จ', 'เพิ่ม Care Giver เรียบร้อย', 'success');
      document.getElementById('cg-modal').classList.add('hidden');
      document.getElementById('add-cg-form').reset();
      loadCareGivers();
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  });

  // Save Settings
  document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = document.querySelectorAll('#settings-container input');
    const payload = Array.from(inputs).map(input => ({
      Key: input.name,
      Value: input.value
    }));
    
    showLoading();
    const res = await apiPost('saveSettings', payload);
    hideLoading();
    if (res.success) {
      Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าแล้ว', 'success');
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  });

  // Import CSV Form
  document.getElementById('import-csv-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('import-file');
    const importType = document.getElementById('import-type').value;
    
    if (fileInput.files.length === 0) return;
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(event) {
      const text = event.target.result;
      const rows = text.split(/\r?\n/).map(row => row.split(',').map(cell => cell.trim()));
      // filter out empty rows
      const validRows = rows.filter(row => row.length > 1 || (row.length === 1 && row[0] !== ""));
      
      showLoading();
      try {
        const action = importType === 'patients' ? 'importCSVPatients' : 'importCSVCareGivers';
        const res = await apiPost(action, { csvData: validRows });
        hideLoading();
        
        if (res.success) {
          Swal.fire('สำเร็จ', `นำเข้าข้อมูลเรียบร้อยแล้ว\nเพิ่ม: ${res.data.added} รายการ\nอัปเดต: ${res.data.updated} รายการ`, 'success');
          document.getElementById('import-modal').classList.add('hidden');
          document.getElementById('import-csv-form').reset();
          if (importType === 'patients') loadPatients();
          else if (importType === 'caregivers') loadCareGivers();
          loadDashboard(); // Refresh counts
        } else {
          Swal.fire('ผิดพลาด', res.message, 'error');
        }
      } catch (err) {
        hideLoading();
        Swal.fire('ผิดพลาด', err.message, 'error');
      }
    };
    reader.readAsText(file);
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
  if (view === 'caregivers') await loadCareGivers();
  if (view === 'settings') await loadSettings();
  lucide.createIcons();
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

async function loadCareGivers() {
  showLoading();
  try {
    const res = await apiGet('listCG');
    hideLoading();
    if (res.success) {
      state.caregivers = res.data;
      const container = document.getElementById('cg-list');
      if (container) {
        container.innerHTML = state.caregivers.map(c => `
          <div class="glass-card p-4">
            <h3 class="font-bold text-lg">${c.name}</h3>
            <p class="text-sm text-gray-600">Username: ${c.username} | โทร: ${c.phone}</p>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    hideLoading();
    console.error(err);
  }
}

async function loadSettings() {
  showLoading();
  try {
    const res = await apiGet('getSettings');
    hideLoading();
    if (res.success) {
      state.settings = res.data;
      const container = document.getElementById('settings-container');
      if (container) {
        container.innerHTML = state.settings.map(s => `
          <div>
            <label class="block text-sm font-medium mb-1">${s.Key} <span class="text-xs text-gray-400">(${s.Detail})</span></label>
            <input type="text" name="${s.Key}" value="${s.Value || ''}" class="w-full border p-2 rounded">
          </div>
        `).join('');
      }
    }
  } catch (err) {
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
