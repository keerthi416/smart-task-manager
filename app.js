/**
 * SMART TASK MANAGER - FRONTEND CLIENT ENGINE
 * Real-time client-side task monitoring, Web Notifications API desktop popups,
 * Web Audio API synthesizer alarm sound, high-priority overdue modal alerts,
 * and REST API database integration.
 */

// Application State
const state = {
  currentUser: null,
  tasks: [],
  activeFilter: 'all',
  searchQuery: '',
  audioCtx: null,
  alarmIntervalId: null,
  activeOverdueTask: null
};

// DOM Elements
const DOM = {
  // Auth
  authSection: document.getElementById('auth-section'),
  dashboardSection: document.getElementById('dashboard-section'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  loginEmail: document.getElementById('login-email'),
  loginEmailError: document.getElementById('login-email-error'),
  loginPassword: document.getElementById('login-password'),
  loginPassError: document.getElementById('login-pass-error'),
  loginAuthError: document.getElementById('login-auth-error'),
  regName: document.getElementById('reg-name'),
  regNameError: document.getElementById('reg-name-error'),
  regEmail: document.getElementById('reg-email'),
  regEmailError: document.getElementById('reg-email-error'),
  regPassword: document.getElementById('reg-password'),
  regPassError: document.getElementById('reg-pass-error'),
  regAuthError: document.getElementById('reg-auth-error'),
  btnLogout: document.getElementById('btn-logout'),
  userNameDisplay: document.getElementById('user-name-display'),

  // Overdue Modal & Alarm
  overdueModal: document.getElementById('overdue-modal'),
  overdueTaskName: document.getElementById('overdue-task-name'),
  overdueModalText: document.getElementById('overdue-modal-text'),
  btnCompleteOverdue: document.getElementById('btn-complete-overdue'),
  btnDismissOverdue: document.getElementById('btn-dismiss-overdue'),

  // Task Creation
  addTaskForm: document.getElementById('add-task-form'),
  taskTitleInput: document.getElementById('task-title-input'),
  taskPrioritySelect: document.getElementById('task-priority-select'),
  taskDateInput: document.getElementById('task-date-input'),
  taskTimeInput: document.getElementById('task-time-input'),

  // Tasks & Filtering
  searchInput: document.getElementById('search-input'),
  statusFilterSelect: document.getElementById('status-filter-select'),
  taskList: document.getElementById('task-list'),
  emptyState: document.getElementById('empty-state'),

  // Stats Counters
  countTotal: document.getElementById('count-total'),
  countPending: document.getElementById('count-pending'),
  countCompleted: document.getElementById('count-completed'),
  countOverdue: document.getElementById('count-overdue'),

  // Toast Container
  toastContainer: document.getElementById('toast-container')
};

const PASSWORD_ERROR_MSG = "Password must be at least 8 characters long, contain 1 uppercase letter, 1 special character, numbers, and no spaces.";

// ==========================================
// 1. INITIALIZATION & SESSION RESTORATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initDateInputs();
  loadStoredSession();
  setupEventListeners();
  startTaskMonitoringEngine();
});

function initDateInputs() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  if (DOM.taskDateInput) DOM.taskDateInput.value = `${year}-${month}-${day}`;

  now.setHours(now.getHours() + 2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  if (DOM.taskTimeInput) DOM.taskTimeInput.value = `${hours}:${minutes}`;
}

function loadStoredSession() {
  const savedUser = localStorage.getItem('smart_task_logged_user');
  if (savedUser) {
    state.currentUser = JSON.parse(savedUser);
    showDashboard();
  } else {
    DOM.authSection.classList.remove('hidden');
    DOM.dashboardSection.classList.add('hidden');
    DOM.btnLogout.classList.add('hidden');
  }
}

// ==========================================
// 2. WEB NOTIFICATIONS API (DESKTOP POPUPS)
// Requirement 1: Request permission immediately upon login or dashboard load
// ==========================================
function requestDesktopNotificationPermission() {
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          showToast('Browser desktop notifications enabled!', 'info');
        }
      });
    }
  }
}

function sendDesktopNotification(title, body, tag) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: 'https://cdn-icons-png.flaticon.com/512/906/906334.png',
        tag: tag || 'task-alert',
        requireInteraction: true
      });
    } catch (err) {
      console.log('Desktop notification error:', err);
    }
  }
}

// ==========================================
// 3. FORM VALIDATION & AUTHENTICATION
// ==========================================
function isValidEmail(emailStr) {
  if (!emailStr || typeof emailStr !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(emailStr.trim());
}

function isValidPasswordComplexity(passStr) {
  if (!passStr || typeof passStr !== 'string') return false;
  if (passStr.length < 8) return false;
  if (/\s/.test(passStr)) return false; // No spaces allowed
  if (!/[A-Z]/.test(passStr)) return false; // Minimum 1 uppercase
  if (!/[0-9]/.test(passStr)) return false; // Contains numbers
  if (!/[a-zA-Z]/.test(passStr)) return false; // Contains letters
  if (!/[^a-zA-Z0-9]/.test(passStr)) return false; // Minimum 1 special char
  return true;
}

function switchAuthTab(tab) {
  clearAuthErrors();
  if (tab === 'login') {
    DOM.loginForm.classList.remove('hidden');
    DOM.registerForm.classList.add('hidden');
  } else {
    DOM.registerForm.classList.remove('hidden');
    DOM.loginForm.classList.add('hidden');
  }
}

function clearAuthErrors() {
  document.querySelectorAll('.error-message').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));
}

// REGISTER FORM SUBMIT
DOM.registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthErrors();

  const nameVal = DOM.regName ? DOM.regName.value.trim() : '';
  const emailVal = DOM.regEmail.value.trim().toLowerCase();
  const passwordVal = DOM.regPassword.value;
  let isValid = true;

  if (!nameVal) {
    if (DOM.regName) DOM.regName.classList.add('is-invalid');
    if (DOM.regNameError) DOM.regNameError.classList.add('visible');
    isValid = false;
  }

  if (!isValidEmail(emailVal)) {
    DOM.regEmail.classList.add('is-invalid');
    DOM.regEmailError.innerText = "Enter a valid E-mail";
    DOM.regEmailError.classList.add('visible');
    isValid = false;
  }

  if (!isValidPasswordComplexity(passwordVal)) {
    DOM.regPassword.classList.add('is-invalid');
    DOM.regPassError.innerText = PASSWORD_ERROR_MSG;
    DOM.regPassError.classList.add('visible');
    isValid = false;
  }

  if (!isValid) return;

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameVal, email: emailVal, password: passwordVal })
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.error.includes('E-mail') || data.error.includes('email')) {
        DOM.regEmail.classList.add('is-invalid');
        DOM.regEmailError.innerText = data.error;
        DOM.regEmailError.classList.add('visible');
      } else if (data.error.includes('Password') || data.error.includes('8 characters')) {
        DOM.regPassword.classList.add('is-invalid');
        DOM.regPassError.innerText = data.error;
        DOM.regPassError.classList.add('visible');
      } else {
        if (DOM.regAuthError) {
          DOM.regAuthError.innerText = data.error;
          DOM.regAuthError.classList.add('visible');
        }
      }
      return;
    }

    DOM.regName.value = '';
    DOM.regEmail.value = '';
    DOM.regPassword.value = '';

    showToast('Account created successfully! Please login with your credentials.', 'info');
    switchAuthTab('login');
    DOM.loginEmail.value = emailVal;
    DOM.loginPassword.focus();

  } catch (err) {
    console.error('Registration fetch error:', err);
    showToast('Network error during registration', 'danger');
  }
});

// LOGIN FORM SUBMIT
DOM.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthErrors();

  const emailVal = DOM.loginEmail.value.trim().toLowerCase();
  const passwordVal = DOM.loginPassword.value;
  let isValid = true;

  if (!isValidEmail(emailVal)) {
    DOM.loginEmail.classList.add('is-invalid');
    DOM.loginEmailError.innerText = "Enter a valid E-mail";
    DOM.loginEmailError.classList.add('visible');
    isValid = false;
  }

  if (!passwordVal) {
    DOM.loginPassword.classList.add('is-invalid');
    DOM.loginPassError.innerText = "Password is required";
    DOM.loginPassError.classList.add('visible');
    isValid = false;
  }

  if (!isValid) return;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, password: passwordVal })
    });

    const data = await response.json();

    if (!response.ok) {
      DOM.loginEmail.classList.add('is-invalid');
      DOM.loginPassword.classList.add('is-invalid');
      if (DOM.loginAuthError) {
        DOM.loginAuthError.innerText = data.error || 'Invalid email or password';
        DOM.loginAuthError.classList.add('visible');
      }
      return;
    }

    state.currentUser = data.user;
    localStorage.setItem('smart_task_logged_user', JSON.stringify(state.currentUser));
    showDashboard();

  } catch (err) {
    console.error('Login fetch error:', err);
    showToast('Network error during login', 'danger');
  }
});

// Real-time Input Clearing
if (DOM.regName) {
  DOM.regName.addEventListener('input', () => {
    DOM.regName.classList.remove('is-invalid');
    if (DOM.regNameError) DOM.regNameError.classList.remove('visible');
  });
}
DOM.loginEmail.addEventListener('input', () => {
  DOM.loginEmail.classList.remove('is-invalid');
  DOM.loginEmailError.classList.remove('visible');
  if (DOM.loginAuthError) DOM.loginAuthError.classList.remove('visible');
});
DOM.regEmail.addEventListener('input', () => {
  DOM.regEmail.classList.remove('is-invalid');
  DOM.regEmailError.classList.remove('visible');
  if (DOM.regAuthError) DOM.regAuthError.classList.remove('visible');
});
DOM.regPassword.addEventListener('input', () => {
  if (isValidPasswordComplexity(DOM.regPassword.value)) {
    DOM.regPassword.classList.remove('is-invalid');
    DOM.regPassError.classList.remove('visible');
  }
});

function showDashboard() {
  DOM.authSection.classList.add('hidden');
  DOM.dashboardSection.classList.remove('hidden');
  DOM.btnLogout.classList.remove('hidden');

  DOM.userNameDisplay.innerText = state.currentUser.name || 'User';

  // Request browser notification permissions immediately when dashboard opens
  requestDesktopNotificationPermission();

  fetchTasks();
}

DOM.btnLogout.addEventListener('click', () => {
  localStorage.removeItem('smart_task_logged_user');
  state.currentUser = null;
  DOM.dashboardSection.classList.add('hidden');
  DOM.authSection.classList.remove('hidden');
  DOM.btnLogout.classList.add('hidden');
  stopAlarmSound();
});

// ==========================================
// 4. TASK API & RENDERING
// ==========================================
async function fetchTasks() {
  if (!state.currentUser) return;
  try {
    const res = await fetch(`/api/tasks?email=${encodeURIComponent(state.currentUser.email)}`, {
      headers: { 'x-user-email': state.currentUser.email }
    });
    if (res.ok) {
      state.tasks = await res.json();
      renderTasks();
      updateStats();
    }
  } catch (err) {
    console.error('Fetch tasks error:', err);
  }
}

DOM.addTaskForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = DOM.taskTitleInput.value.trim();
  const priority = DOM.taskPrioritySelect.value;
  const dateVal = DOM.taskDateInput.value;
  const timeVal = DOM.taskTimeInput.value;

  if (!title || !dateVal || !timeVal) return;

  const dueTimestamp = new Date(`${dateVal}T${timeVal}:00`).toISOString();

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_email: state.currentUser.email,
        title: title,
        priority: priority,
        dueTimestamp: dueTimestamp
      })
    });

    if (res.ok) {
      DOM.taskTitleInput.value = '';
      showToast(`Task "${title}" created successfully!`, 'info');
      fetchTasks();
    }
  } catch (err) {
    console.error('Add task error:', err);
  }
});

async function toggleTaskComplete(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/toggle`, { method: 'PATCH' });
    if (res.ok) {
      if (state.activeOverdueTask && state.activeOverdueTask.id === taskId) {
        closeOverdueModal();
      }
      fetchTasks();
    }
  } catch (err) {
    console.error('Toggle task error:', err);
  }
}

async function deleteTask(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) {
      if (state.activeOverdueTask && state.activeOverdueTask.id === taskId) {
        closeOverdueModal();
      }
      showToast('Task removed successfully.', 'warning');
      fetchTasks();
    }
  } catch (err) {
    console.error('Delete task error:', err);
  }
}

DOM.searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value.toLowerCase().trim();
  renderTasks();
});

DOM.statusFilterSelect.addEventListener('change', (e) => {
  state.activeFilter = e.target.value;
  renderTasks();
});

function renderTasks() {
  const filtered = state.tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(state.searchQuery);
    let matchesFilter = true;

    if (state.activeFilter === 'pending') {
      matchesFilter = !task.completed && task.status !== 'overdue';
    } else if (state.activeFilter === 'completed') {
      matchesFilter = task.completed;
    } else if (state.activeFilter === 'overdue') {
      matchesFilter = !task.completed && task.status === 'overdue';
    } else if (state.activeFilter === 'high') {
      matchesFilter = task.priority === 'High';
    }

    return matchesSearch && matchesFilter;
  });

  DOM.taskList.innerHTML = '';

  if (filtered.length === 0) {
    DOM.emptyState.classList.remove('hidden');
    return;
  }

  DOM.emptyState.classList.add('hidden');

  filtered.forEach(task => {
    const taskEl = document.createElement('div');
    const isOverdue = !task.completed && task.status === 'overdue';
    taskEl.className = `task-item ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`;

    const formattedDate = formatDueDate(task.dueTimestamp);
    const priorityClass = `badge-${task.priority.toLowerCase()}`;

    taskEl.innerHTML = `
      <div class="task-left">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete('${task.id}')">
        <div class="task-details">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <div class="task-meta">
            <span class="badge ${priorityClass}">${task.priority}</span>
            <span><i class="fa-regular fa-clock"></i> ${formattedDate}</span>
            ${isOverdue ? '<span class="badge badge-status overdue">Overdue</span>' : ''}
          </div>
        </div>
      </div>
      <div class="task-actions">
        <button class="action-btn delete-btn" title="Delete Task" onclick="deleteTask('${task.id}')">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    DOM.taskList.appendChild(taskEl);
  });
}

function updateStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const overdue = state.tasks.filter(t => !t.completed && t.status === 'overdue').length;
  const pending = state.tasks.filter(t => !t.completed && t.status !== 'overdue').length;

  DOM.countTotal.innerText = total;
  DOM.countPending.innerText = pending;
  DOM.countCompleted.innerText = completed;
  DOM.countOverdue.innerText = overdue;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const progressBar = document.getElementById('progress-bar-fill');
  const progressText = document.getElementById('progress-percent');
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (progressText) progressText.innerText = `${percent}%`;
}

function formatDueDate(isoStr) {
  const dateObj = new Date(isoStr);
  const now = new Date();
  const isToday = dateObj.toDateString() === now.toDateString();

  const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${timeString}`;
  const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dateString} at ${timeString}`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, match => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[match];
  });
}

// ==========================================
// 5. DIRECT CLIENT-SIDE TASK MONITORING, DESKTOP NOTIFICATIONS & ALARMS
// ==========================================
function startTaskMonitoringEngine() {
  // Real-time task monitoring loop executing every 1 second
  setInterval(checkClientTaskDeadlines, 1000);
}

function checkClientTaskDeadlines() {
  if (!state.currentUser || state.tasks.length === 0) return;

  const now = Date.now();

  state.tasks.forEach(task => {
    if (task.completed) return;

    const dueTime = new Date(task.dueTimestamp).getTime();
    const diffMs = dueTime - now;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // STAGE 1: 1 Hour Before Deadline
    // Desktop Notification Rule: "Reminder: You have to complete [Task Name] in 1 hour."
    if (diffMinutes >= 55 && diffMinutes <= 60 && !task.notified1h) {
      const msg = `Reminder: You have to complete ${task.title} in 1 hour.`;
      showToast(msg, 'warning');
      sendDesktopNotification('Task Reminder (1 Hour Left)', msg, `1h-${task.id}`);
      task.notified1h = true;
    }

    // STAGE 2: Exact Due Time
    // Desktop Notification Rule: "Task Due Now: It is time to perform [Task Name]."
    if (diffMinutes >= -1 && diffMinutes <= 0 && !task.notifiedDue) {
      const msg = `Task Due Now: It is time to perform ${task.title}.`;
      showToast(msg, 'warning');
      sendDesktopNotification('Task Due Now!', msg, `due-${task.id}`);
      task.notifiedDue = true;
    }

    // STAGE 3: Overdue Audio Alarm & On-Screen Alert Modal
    // Rule: Trigger active Web Audio API synthesizer alarm & high-priority centered modal
    if (diffMs < 0 && task.status !== 'overdue') {
      task.status = 'overdue';
      renderTasks();
      updateStats();

      const overdueMsg = `ALERT: You have pending work! Task '${task.title}' is overdue. Please complete it.`;
      sendDesktopNotification('Task Overdue Alert!', overdueMsg, `overdue-${task.id}`);

      // Trigger high-priority modal and audio alarm
      triggerOverdueAlarm(task);
    }
  });
}

// Overdue Audio Alarm & High-Priority Centered Modal Dialog
function triggerOverdueAlarm(task) {
  state.activeOverdueTask = task;
  if (DOM.overdueTaskName) DOM.overdueTaskName.innerText = task.title;

  if (DOM.overdueModalText) {
    DOM.overdueModalText.innerHTML = `ALERT: You have pending work! Task '<strong>${escapeHtml(task.title)}</strong>' is overdue. Please complete it.`;
  }

  if (DOM.overdueModal) DOM.overdueModal.classList.remove('hidden');

  // Play Web Audio API synthesizer alarm sound chime loop
  playAlarmSound();
}

function closeOverdueModal() {
  if (DOM.overdueModal) DOM.overdueModal.classList.add('hidden');
  stopAlarmSound();
  state.activeOverdueTask = null;
}

// Synthesizer Audio Alarm
function playAlarmSound() {
  stopAlarmSound();

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    state.audioCtx = new AudioCtx();

    state.alarmIntervalId = setInterval(() => {
      if (!state.audioCtx) return;

      const now = state.audioCtx.currentTime;
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.connect(gain);
      gain.connect(state.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    }, 800);
  } catch (err) {
    console.warn("Audio playback exception:", err);
  }
}

function stopAlarmSound() {
  if (state.alarmIntervalId) {
    clearInterval(state.alarmIntervalId);
    state.alarmIntervalId = null;
  }
  if (state.audioCtx) {
    state.audioCtx.close();
    state.audioCtx = null;
  }
}

// Modal Buttons Event Listeners
if (DOM.btnCompleteOverdue) {
  DOM.btnCompleteOverdue.addEventListener('click', () => {
    if (state.activeOverdueTask) {
      toggleTaskComplete(state.activeOverdueTask.id);
    }
  });
}

if (DOM.btnDismissOverdue) {
  DOM.btnDismissOverdue.addEventListener('click', () => {
    closeOverdueModal();
  });
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const typeClass = type === 'warning' ? 'toast-warning' : (type === 'danger' ? 'toast-danger' : '');
  const icon = type === 'warning' ? 'fa-bell' : (type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info');

  toast.className = `toast ${typeClass}`;
  toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <div class="toast-body">${escapeHtml(message)}</div>
  `;

  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 6000);
}

function setupEventListeners() {
  document.body.addEventListener('click', () => {
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }, { once: true });

  const btnSoundTest = document.getElementById('btn-sound-test');
  if (btnSoundTest) {
    btnSoundTest.addEventListener('click', () => {
      showToast('Testing Web Audio API synthesizer alarm & desktop notification...', 'info');
      sendDesktopNotification('Smart Task Manager Test', 'Desktop notifications are working perfectly!');
      playAlarmSound();
      setTimeout(() => stopAlarmSound(), 3000);
    });
  }
}
