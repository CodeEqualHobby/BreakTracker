// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  push,
  query,
  orderByChild,
  limitToLast
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDdFnFZOZxrcII9cI6xHLeTIBDnLDvNyLM",
  authDomain: "breaktracker-57174.firebaseapp.com",
  databaseURL: "https://breaktracker-57174-default-rtdb.firebaseio.com",
  projectId: "breaktracker-57174",
  storageBucket: "breaktracker-57174.firebasestorage.app",
  messagingSenderId: "401629085687",
  appId: "1:401629085687:web:c31a8d9c77d2743b45f8f2",
  measurementId: "G-F3R349VLKQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
// Constants
const DAY_TOTAL = 5400;
const RESET_HOUR = 16;
const ADMIN_PASS = "1234";
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

let currentAgent = null;
let viewingAgentLogsFor = null;
let agentCache = null;
let adminLoggedIn = false;
let allAgentsCache = null;
let adminUnsubscribe = null;
let agentListener = null; // For real-time updates

/* --- Utilities & Helpers --- */

// Formats seconds into HH:MM:SS (taken from your offline version)
const fmt = (s) => {
    const isNeg = s < 0;
    const absS = Math.abs(s);
    const h = Math.floor(absS / 3600), m = Math.floor((absS % 3600) / 60), x = absS % 60;
    const ts = [h, m, x].map(v => String(v).padStart(2, '0')).join(':');
    return isNeg ? `- ${ts}` : ts;
};

// Global reference for the agent currently being viewed in the modal
let activeLogAgent = '';

/* --- Session Logging Logic --- */

// Call this inside your existing endBreak function logic
function endBreak() {
    const name = currentName; // Adjust based on how you store the current user's name
    const agentRef = firebase.database().ref(`agents/`);

    agentRef.once('value').then(snapshot => {
        const data = snapshot.val();
        if (!data || !data.start) return;

        const start = data.start;
        const end = Date.now();
        const elapsed = Math.floor((end - start) / 1000);
        const newUsed = (data.used || 0) + elapsed;
        const newRemain = (data.remain || 5400) - elapsed;
        
        // Capture device info
        const device = navigator.userAgent.match(/\(([^)]+)\)/) ? navigator.userAgent.match(/\(([^)]+)\)/)[1].split(';')[0] : "Unknown";

        const logEntry = {
            d: new Date().toLocaleDateString(),
            s: new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            e: new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            u: fmt(elapsed),
            r: fmt(newRemain),
            device: device,
            timestamp: end // for sorting
        };

        // 1. Push log to Firebase
        firebase.database().ref(`agents//logs`).push(logEntry);

        // 2. Update the agent's main state
        agentRef.update({
            start: 0,
            used: newUsed,
            remain: newRemain,
            count: (data.count || 0) + 1,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Local render if applicable
        if(typeof render === 'function') render();
    });
}

/* --- Admin Portal Functions --- */

function viewAgentLogs(agentName) {
    activeLogAgent = agentName;
    const modal = document.getElementById('logModal');
    const modalTitle = document.querySelector('#logModal h2');
    
    if (modalTitle) modalTitle.innerText = `Session Logs: `;
    modal.style.display = 'block';
    
    drawLogs(agentName);
}

function drawLogs(agentName) {
    const logTable = document.getElementById('logs'); // Ensure this ID matches your <table>
    if (!logTable) return;

    // Table Header
    logTable.innerHTML = `
        <tr>
            <th>Date</th>
            <th>Start</th>
            <th>End</th>
            <th>Used</th>
            <th>Remaining</th>
            <th>Device</th>
        </tr>`;

    firebase.database().ref(`agents//logs`).orderByChild('timestamp').once('value', (snapshot) => {
        const logs = snapshot.val();
        if (!logs) {
            logTable.innerHTML += '<tr><td colspan="6" style="text-align:center;">No logs found for this agent.</td></tr>';
            return;
        }

        // Convert to array and reverse to show newest first
        const logEntries = Object.values(logs).reverse();

        logEntries.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${log.d || '-'}</td>
                <td>${log.s || '-'}</td>
                <td>${log.e || '-'}</td>
                <td>${log.u || '-'}</td>
                <td>${log.r || '-'}</td>
                <td><small class="muted">${log.device || '-'}</small></td>
            `;
            logTable.appendChild(tr);
        });
    });
}

/**
 * Exports logs of the active agent to CSV
 */
function exportCSV() {
    if (!activeLogAgent) return;

    firebase.database().ref(`agents//logs`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            alert("No logs to export!");
            return;
        }

        const rows = Object.values(data);
        const header = 'Date,Start,End,Used,Remaining,Device\n';
        const csvContent = rows.map(r => 
            `"${r.d||''}","${r.s||''}","${r.e||''}","${r.u||''}","${r.r||''}","${r.device||''}"`
        ).join('\n');

        // Create the download
        const blob = new Blob(['\ufeff' + header + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const dateStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `BreakTracker_Logs__.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}



const fmt = (s) => {
  const isNeg = s < 0;
  const absS = Math.abs(s);
  const h = Math.floor(absS / 3600);
  const m = Math.floor((absS % 3600) / 60);
  const x = absS % 60;
  const ts = [h, m, x].map(v => String(v).padStart(2, '0')).join(':');
  return isNeg ? `- ${ts}` : ts;
};

async function getDeviceInfo() {
  let token = localStorage.getItem('bb3_device_token');
  if (!token) {
    token = 'DEV-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    localStorage.setItem('bb3_device_token', token);
  }

  let ip = '0.0.0.0';
  try {
    const res = await fetch('https://api.ipify.org?format=json', { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      ip = data.ip;
    }
  } catch (e) {
    ip = 'IP Blocked';
  }

  const ua = navigator.userAgent;
  const os = ua.match(/Win/) ? 'Win' : ua.match(/Mac/) ? 'Mac' : ua.match(/Android/) ? 'Andr' : ua.match(/iPhone|iPad/) ? 'iOS' : 'Linux';
  return `${os} [${token}] (${ip})`;
}

// Firebase Database Helper Functions
async function firebaseGet(path) {
  try {
    const snapshot = await get(ref(database, path));
    return snapshot.val();
  } catch (error) {
    throw new Error(`Firebase get error: ${error.message}`);
  }
}

async function firebaseSet(path, data) {
  try {
    await set(ref(database, path), data);
    return data;
  } catch (error) {
    throw new Error(`Firebase set error: ${error.message}`);
  }
}

async function firebaseUpdate(path, data) {
  try {
    await update(ref(database, path), data);
    return data;
  } catch (error) {
    throw new Error(`Firebase update error: ${error.message}`);
  }
}

async function firebasePush(path, data) {
  try {
    const newRef = push(ref(database, path));
    await set(newRef, data);
    return newRef.key;
  } catch (error) {
    throw new Error(`Firebase push error: ${error.message}`);
  }
}

/**
 * Calculates the most recent 16:00 Manila (UTC+8) threshold.
 * 16:00 Manila is always 08:00 UTC.
 */
function getManilaResetThreshold() {
  const now = new Date();
  const threshold = new Date(now);
  threshold.setUTCHours(RESET_HOUR - 8, 0, 0, 0);
  
  if (now.getTime() < threshold.getTime()) {
    threshold.setUTCDate(threshold.getUTCDate() - 1);
  }
  return threshold.getTime();
}

async function checkAndPerformReset(agentName, agentData) {
  if (!agentName || !agentData) return agentData;
  
  const threshold = getManilaResetThreshold();
  const lastReset = agentData.lastReset || 0;

  if (lastReset < threshold) {
    const now = Date.now();
    const updateData = {
      remain: DAY_TOTAL,
      used: 0,
      count: 0,
      start: 0,
      lastActivity: now,
      lastReset: now,
      logs: {} // Clear logs on reset
    };
    await firebaseUpdate(`agents/${agentName}`, updateData);
    return { ...agentData, ...updateData };
  }
  return agentData;
}

function updateClock() {
  const now = new Date();
  const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const dateStr = now.toLocaleString('en-US', dateOptions);
  const timeStr = now.toLocaleString('en-US', timeOptions);
  document.getElementById('clock').innerHTML = `${dateStr}<br>${timeStr}<br><small class='muted'>${LOCAL_TZ}</small>`;
}

function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('bb2_theme', isLight ? 'light' : 'dark');
}

function initApp() {
  const savedTheme = localStorage.getItem('bb2_theme');
  if (savedTheme === 'light') document.body.classList.add('light-mode');
  updateClock();
}

function hideAll() {
  ['portalSelect', 'agentLogin', 'adminLogin', 'mainCard', 'admin'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
}

function goHome() {
  currentAgent = null;
  agentCache = null;
  adminLoggedIn = false;
  allAgentsCache = null;
  viewingAgentLogsFor = null;

  // Clean up Firebase listener
  if (agentListener) {
    agentListener();
    agentListener = null;
  }
  if (adminUnsubscribe) {
    adminUnsubscribe();
    agentListener = null;
  }

  hideAll();
  document.getElementById('portalSelect').classList.remove('hidden');
}

function showAgentLogin() {
  hideAll();
  const lastAgent = localStorage.getItem('bb3_last_agent');
  const nameInput = document.getElementById('loginAgentName');
  const pinInput = document.getElementById('loginAgentPin');
  if (lastAgent) {
    nameInput.value = lastAgent;
    setTimeout(() => pinInput.focus(), 50);
  } else {
    nameInput.value = '';
    pinInput.value = '';
  }
  document.getElementById('agentLogin').classList.remove('hidden');
}

function showAdminLogin() {
  hideAll();
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('adminLogin').classList.remove('hidden');
}

async function authAdmin() {
  const pass = document.getElementById('adminPasswordInput').value;
  if (pass !== ADMIN_PASS) {
    alert('Incorrect Admin Password');
    return;
  }

  try {
    // Check if admin data exists, create if not
    const adminData = await firebaseGet('admin');
    if (!adminData) {
      await firebaseSet('admin', { initialized: true });
    }
    adminLoggedIn = true;
    hideAll();
    setupAdminListener();
    document.getElementById('admin').classList.remove('hidden');
  } catch (error) {
    alert('Unable to authenticate admin: ' + error.message);
  }
}

function setupAdminListener() {
  if (!adminLoggedIn) return;
  
  const agentsRef = ref(database, 'agents');
  adminUnsubscribe = onValue(agentsRef, async (snapshot) => {
    const data = snapshot.val() || {};
    // Perform reset check for all agents when data changes
    for (const name in data) {
      data[name] = await checkAndPerformReset(name, data[name]);
    }
    allAgentsCache = data;
    renderAdminDashboard();
  });
}

async function authAgent() {
  const name = document.getElementById('loginAgentName').value.trim();
  const pin = document.getElementById('loginAgentPin').value.trim();
  if (!name || !pin) return alert('Please enter both name and PIN.');

  try {
    // Get agents list from Firebase
    const agents = await firebaseGet('agents') || {};
    const agentData = Object.values(agents).find(a => a.name.toLowerCase() === name.toLowerCase() && a.pin === pin);

    if (!agentData) {
      alert('Invalid Name or PIN. Please contact your administrator.');
      return;
    }

    currentAgent = agentData.name;
    localStorage.setItem('bb3_last_agent', currentAgent);

    // Set up real-time listener for this agent
    setupAgentListener();

    await refreshAgentData(true);
    hideAll();
    document.getElementById('mainCard').classList.remove('hidden');
    document.getElementById('hello').innerText = currentAgent;
  } catch (error) {
    alert('Authentication failed: ' + error.message);
  }
}

// Real-time listener for agent data updates
function setupAgentListener() {
  if (!currentAgent) return;

  // Remove existing listener
  if (agentListener) {
    // Firebase listeners are automatically cleaned up, but we can reset
    agentListener = null;
  }

  // Set up real-time listener for this agent's data
  const agentRef = ref(database, `agents/${currentAgent}`);
  agentListener = onValue(agentRef, async (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const checkedData = await checkAndPerformReset(currentAgent, data);
      agentCache = checkedData;
      render(); // Update UI when data changes
    }
  });
}

async function refreshAgentData(force = false) {
  if (!currentAgent) return;
  try {
    let data = await firebaseGet(`agents/${currentAgent}`);
    data = await checkAndPerformReset(currentAgent, data);
    agentCache = data;
    if (force) render();
    return data;
  } catch (error) {
    console.error('Unable to refresh agent state:', error);
  }
}

async function render() {
  if (!currentAgent) return;
  if (!agentCache) await refreshAgentData(true);
  if (!agentCache) return;

  const baseRemain = parseInt(agentCache.remain || DAY_TOTAL, 10);
  const baseUsed = parseInt(agentCache.used || 0, 10);
  const start = parseInt(agentCache.start || 0, 10);
  const count = parseInt(agentCache.count || 0, 10);
  let elapsed = 0;

  if (start > 0) {
    elapsed = Math.floor((Date.now() - start) / 1000);
    document.getElementById('status').innerText = 'Status: On Break';
  } else {
    document.getElementById('status').innerText = 'Status: Available';
  }

  const r = baseRemain - elapsed;
  const u = baseUsed + elapsed;
  document.getElementById('timer').innerText = fmt(r);
  document.getElementById('used').innerText = `Used: ${fmt(u)}`;
  document.getElementById('sessions').innerText = `Sessions: ${count}`;

  const btnStart = document.getElementById('btnStart');
  const btnEnd = document.getElementById('btnEnd');
  if (start > 0) {
    btnStart.disabled = true;
    btnStart.classList.remove('btn-glow');
    btnEnd.disabled = false;
    btnEnd.classList.add('btn-glow');
  } else {
    btnStart.disabled = false;
    btnStart.classList.add('btn-glow');
    btnEnd.disabled = true;
    btnEnd.classList.remove('btn-glow');
  }

  const card = document.getElementById('mainCard');
  const h = document.getElementById('health');
  card.classList.remove('breathe-good', 'breathe-warn', 'breathe-bad');

  const pulseDuration = r <= 0 ? 0.7 : Math.max(0.7, Math.min(4, (r / DAY_TOTAL) * 4));
  card.style.animationDuration = pulseDuration + 's';

  h.className = r > 1800 ? 'good' : (r > 600 ? 'warn' : 'bad');
  h.innerText = r > 1800 ? 'Healthy Balance' : (r > 600 ? 'Low Balance' : 'Critical Balance');
  if (r > 1800) card.classList.add('breathe-good');
  else if (r > 600) card.classList.add('breathe-warn');
  else card.classList.add('breathe-bad');
}

async function startBreak() {
  if (!currentAgent) return;
  if (agentCache?.start > 0) return;

  const info = await getDeviceInfo();
  const now = Date.now();

  try {
    // Update agent data in Firebase
    await firebaseUpdate(`agents/${currentAgent}`, {
      start: now,
      deviceInfo: info,
      tz: LOCAL_TZ,
      lastActivity: now
    });

    // Add log entry
    const logData = {
      type: 'start',
      timestamp: now,
      deviceInfo: info,
      tz: LOCAL_TZ
    };
    await firebasePush(`agents/${currentAgent}/logs`, logData);

    // Data will be updated via real-time listener
  } catch (error) {
    alert('Unable to start break: ' + error.message);
  }
}

async function endBreak() {
  if (!currentAgent) return;
  if (!agentCache?.start) return;

  const info = await getDeviceInfo();
  const now = Date.now();
  const startTime = agentCache.start;
  const sessionId = agentCache.currentSessionId;
  const duration = Math.floor((now - startTime) / 1000);
  const isoEnd = new Date(now).toISOString();

  try {
    const currentUsed = parseInt(agentCache.used || 0, 10);
    const currentRemain = parseInt(agentCache.remain || DAY_TOTAL, 10);
    const currentCount = parseInt(agentCache.count || 0, 10);
    const newRemain = currentRemain - duration;

    await firebaseUpdate(`agents/${currentAgent}`, {
      start: 0,
      currentSessionId: null,
      used: currentUsed + duration,
      remain: newRemain,
      count: currentCount + 1,
      deviceInfo: info,
      tz: LOCAL_TZ,
      lastActivity: now
    });

    if (sessionId) {
      await firebaseUpdate(`agents/${currentAgent}/logs/${sessionId}`, {
        endTime: isoEnd,
        duration: duration
      });
    }

  } catch (error) {
    alert('Unable to end break: ' + error.message);
  }
}

async function drawLogs(agentName = currentAgent) {
  if (!agentName) return;
  try {
    const agentData = await firebaseGet(`agents/${agentName}`);
    const logs = agentData?.logs || {};

    const table = document.getElementById('logs');
    table.innerHTML = '<tr><th>Start Time</th><th>End Time</th><th>Duration (Min)</th><th>Device Token</th></tr>';

    // Convert logs object to array and sort by timestamp
    const logEntries = Object.values(logs).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    logEntries.forEach(log => {
      const start = log.startTime ? new Date(log.startTime).toLocaleTimeString() : '---';
      const end = log.endTime ? new Date(log.endTime).toLocaleTimeString() : 'In Progress';
      const dur = log.duration ? (log.duration / 60).toFixed(2) : '---';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${start}</td>
        <td>${end}</td>
        <td>${dur}</td>
        <td><code>${log.deviceToken || '---'}</code></td>
      `;
      table.appendChild(tr);
    });

  } catch (error) {
    console.error('Failed to load logs:', error);
  }
}

function openModal() {
  viewingAgentLogsFor = currentAgent;
  document.getElementById('logModal').style.display = 'block';
  document.getElementById('logModalTitle').innerText = `Session Logs: ${currentAgent}`;
  drawLogs(currentAgent);
}

function viewAgentLogs(agentName) {
  viewingAgentLogsFor = agentName;
  document.getElementById('logModal').style.display = 'block';
  document.getElementById('logModalTitle').innerText = `Session Logs: ${agentName}`;
  drawLogs(agentName);
}

function closeModal() {
  document.getElementById('logModal').style.display = 'none';
  viewingAgentLogsFor = null;
}

async function applyAdjustment() {
  const target = document.getElementById('adminAgentSelect').value;
  const val = parseInt(document.getElementById('adjVal').value, 10);
  const reason = document.getElementById('adjReason').value.trim();
  if (!target || Number.isNaN(val)) return alert('Please choose an agent and enter a valid seconds value.');
  if (!reason) return alert('Please provide a reason for the adjustment.');

  try {
    const dev = await getDeviceInfo();
    const now = Date.now();

    // Get current agent data
    const agentData = await firebaseGet(`agents/${target}`);
    const currentRemain = parseInt(agentData.remain || DAY_TOTAL, 10);

    // Update agent data
    await firebaseUpdate(`agents/${target}`, {
      remain: currentRemain + val,
      lastActivity: now
    });

    document.getElementById('adjVal').value = '';
    document.getElementById('adjReason').value = '';
    renderAdminDashboard();
  } catch (error) {
    alert('Unable to apply adjustment: ' + error.message);
  }
}

async function addAgent() {
  const nameInput = document.getElementById('newAgentName');
  const pinInput = document.getElementById('newAgentPin');
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();
  if (!name || !pin) return alert('Please enter both Name and PIN.');

  try {
    // Check if agent already exists
    const agents = await firebaseGet('agents') || {};
    const existingAgent = Object.values(agents).find(a => a.name.toLowerCase() === name.toLowerCase());
    if (existingAgent) {
      alert('An agent with this name already exists.');
      return;
    }

    // Create new agent
    const agentData = {
      name: name,
      pin: pin,
      remain: DAY_TOTAL,
      used: 0,
      count: 0,
      start: 0,
      lastActivity: Date.now(),
      lastReset: Date.now(),
      logs: {}
    };

    await firebaseSet(`agents/${name}`, agentData);

    nameInput.value = '';
    pinInput.value = '';
    renderAdminDashboard();
  } catch (error) {
    alert('Unable to add agent: ' + error.message);
  }
}

async function deleteAgent(name) {
  if (!confirm(`Are you sure you want to delete "${name}"? This will remove their data.`)) return;
  try {
    await firebaseSet(`agents/${name}`, null); // Delete by setting to null
    renderAdminDashboard();
  } catch (error) {
    alert('Unable to delete agent: ' + error.message);
  }
}

async function editAgent(oldName) {
  try {
    const agentData = await firebaseGet(`agents/${oldName}`);
    if (!agentData) {
      alert('Agent not found.');
      return;
    }

    const newName = prompt('Edit Agent Name:', oldName);
    if (!newName || !newName.trim()) return;
    const newPin = prompt('Edit PIN:', agentData.pin || '');
    if (!newPin || !newPin.trim()) return;

    // If name changed, we need to create new entry and delete old one
    if (newName.trim() !== oldName) {
      // Check if new name already exists
      const agents = await firebaseGet('agents') || {};
      const existingAgent = Object.values(agents).find(a => a.name.toLowerCase() === newName.toLowerCase() && a.name !== oldName);
      if (existingAgent) {
        alert('An agent with this name already exists.');
        return;
      }

      // Create new agent with updated data
      const updatedData = { ...agentData, name: newName.trim(), pin: newPin.trim() };
      await firebaseSet(`agents/${newName.trim()}`, updatedData);

      // Delete old agent
      await firebaseSet(`agents/${oldName}`, null);
    } else {
      // Just update PIN
      await firebaseUpdate(`agents/${oldName}`, { pin: newPin.trim() });
    }

    renderAdminDashboard();
  } catch (error) {
    alert('Unable to update agent: ' + error.message);
  }
}

function renderAdminDashboard() {
  if (!adminLoggedIn) return;
  if (!allAgentsCache) return;

  try {
    const searchTerm = document.getElementById('adminSearchInput').value.toLowerCase();
    const agentList = Object.values(allAgentsCache);
    const filteredAgents = agentList.filter(a => a.name.toLowerCase().includes(searchTerm));

    const tableBody = document.getElementById('adminDashboardBody');
    const mgtTable = document.getElementById('agentManagementTable');
    const select = document.getElementById('adminAgentSelect');

    // Cache select's current value to restore it
    const currentSelected = select.value;

    if (tableBody) tableBody.innerHTML = '';
    mgtTable.innerHTML = '<tr><th>Agent Name</th><th>PIN</th><th>Actions</th></tr>';
    
    // Only rebuild select options if the agent list size changed to avoid flicker
    select.innerHTML = '';

    agentList.forEach(agent => {
      const option = document.createElement('option');
      option.value = agent.name;
      option.textContent = agent.name;
      select.appendChild(option);

      const mgtTr = document.createElement('tr');
      mgtTr.innerHTML = `
        <td>${agent.name}</td>
        <td><code>${agent.pin}</code></td>
        <td>
          <button class="btn s" style="padding:4px 8px; font-size:11px;" onclick="editAgent('${agent.name}')">Edit</button>
          <button class="btn r" style="padding:4px 8px; font-size:11px;" onclick="deleteAgent('${agent.name}')">Delete</button>
        </td>
      `;
      mgtTable.appendChild(mgtTr);
    });

    select.value = currentSelected;

    filteredAgents.forEach(agent => {
      const remain = parseInt(agent.remain || DAY_TOTAL, 10);
      const start = parseInt(agent.start || 0, 10);
      const status = start > 0 ? 'On Break' : 'Working';
      const elapsed = start > 0 ? Math.floor((Date.now() - start) / 1000) : 0;
      const currentRemain = remain - elapsed;
      
      const lastAction = agent.lastActivity ? new Date(agent.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
      const tokenMatch = agent.deviceInfo?.match(/\[(.*?)\]/);
      const token = tokenMatch ? tokenMatch[1] : '---';

      const colorClass = currentRemain > 1800 ? 'good' : (currentRemain > 600 ? 'warn' : 'bad');
      const statusClass = status === 'On Break' ? 'bad' : 'good';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${agent.name}</td>
        <td class="${colorClass}" style="font-family:monospace; font-weight:bold;">${fmt(currentRemain)}</td>
        <td class="${statusClass}">${status}</td>
        <td><small>${lastAction}</small></td>
        <td><code>${token}</code></td>
        <td>
          <button class="btn b" style="padding:4px 8px; font-size:11px;" onclick="viewAgentLogs('${agent.name}')">Logs</button>
          <button class="btn s" style="padding:4px 8px; font-size:11px;" onclick="resetUser('${agent.name}')">Reset</button>
          ${status === 'On Break' ? `<button class="btn r" style="padding:4px 8px; font-size:11px;" onclick="forceEndBreak('${agent.name}')">Force Stop</button>` : ''}
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (error) {
    console.error('Unable to render admin dashboard:', error);
  }
}

async function forceEndBreak(agentName) {
  try {
    const agentData = await firebaseGet(`agents/${agentName}`);
    if (!agentData || !agentData.start) {
      alert('Agent is not currently on break.');
      return;
    }

    const now = Date.now();
    const startTime = agentData.start;
    const duration = Math.floor((now - startTime) / 1000);
    const sessionId = agentData.currentSessionId;
    const currentUsed = parseInt(agentData.used || 0, 10);
    const currentCount = parseInt(agentData.count || 0, 10);
    const currentRemain = parseInt(agentData.remain || DAY_TOTAL, 10);
    const newRemain = currentRemain - duration;
    
    // Update agent data
    await firebaseUpdate(`agents/${agentName}`, {
      start: 0,
      currentSessionId: null,
      used: currentUsed + duration,
      count: currentCount + 1,
      deviceInfo: 'Admin Force',
      tz: LOCAL_TZ,
      lastActivity: now
    });
    
    if (sessionId) {
      await firebaseUpdate(`agents/${agentName}/logs/${sessionId}`, {
        endTime: new Date(now).toISOString(),
        duration: duration
      });
    }

    renderAdminDashboard();
    if (currentAgent === agentName) await refreshAgentData(true);
  } catch (error) {
    alert('Unable to force stop the break: ' + error.message);
  }
}

async function resetUser(agentName = currentAgent) {
  if (!agentName) return;
  const msg = 'Are you sure you want to perform a full daily reset?\n\nThis will reset the agent balance and clear its current break status.';
  if (!confirm(msg)) return;

  try {
    const agentData = await firebaseGet(`agents/${agentName}`);
    const now = Date.now();

    // Reset agent data
    await firebaseUpdate(`agents/${agentName}`, {
      remain: DAY_TOTAL,
      used: 0,
      count: 0,
      start: 0,
      currentSessionId: null,
      lastActivity: now,
      lastReset: now,
      logs: {}
    });

    if (currentAgent === agentName) await refreshAgentData(true);
    renderAdminDashboard();
  } catch (error) {
    alert('Unable to reset the user: ' + error.message);
  }
}

setInterval(() => {
  updateClock();
  if (currentAgent) render();
  if (!document.getElementById('admin').classList.contains('hidden')) renderAdminDashboard();
  if (viewingAgentLogsFor) drawLogs(viewingAgentLogsFor);
}, 1000);

setInterval(async () => {
  if (currentAgent) await refreshAgentData();
  if (!document.getElementById('admin').classList.contains('hidden')) renderAdminDashboard();
}, 5000);

window.onclick = function(event) {
  const modal = document.getElementById('logModal');
  if (event.target === modal) closeModal();
};

window.addEventListener('load', initApp);
window.showAgentLogin = showAgentLogin;
window.showAdminLogin = showAdminLogin;
window.goHome = goHome;
window.authAdmin = authAdmin;
window.authAgent = authAgent;
window.startBreak = startBreak;
window.endBreak = endBreak;
window.openModal = openModal;
window.closeModal = closeModal;
window.applyAdjustment = applyAdjustment;
window.addAgent = addAgent;
window.editAgent = editAgent;
window.deleteAgent = deleteAgent;
window.viewAgentLogs = viewAgentLogs;
window.forceEndBreak = forceEndBreak;
window.resetUser = resetUser;
window.toggleTheme = toggleTheme;
