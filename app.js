// ==================== Firebase Setup (v9 Modular) ====================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getDatabase, ref, get, update, push, onValue, query, orderByChild, limitToLast
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyDdFnFZOZxrcII9cI6xHLeTIBDnLDvNyLM",
  authDomain: "breaktracker-57174.firebaseapp.com",
  databaseURL: "https://breaktracker-57174-default-rtdb.firebaseio.com",
  projectId: "breaktracker-57174",
  storageBucket: "breaktracker-57174.firebasestorage.app",
  messagingSenderId: "401629085687",
  appId: "1:401629085687:web:c31a8d9c77d2743b45f8f2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==================== Constants & Globals ====================
const DAY_TOTAL = 5400; // 90 minutes
const ASIA_MANILA_TZ = 'Asia/Manila';
let currentName = localStorage.getItem('bb2_name') || 'Agent'; 
let activeLogAgent = '';

// ==================== Utilities ====================
const fmt = (s) => {
  if (s === undefined || s === null || isNaN(s)) return "00:00:00";
  const isNeg = s < 0;
  const absS = Math.abs(s);
  const h = Math.floor(absS / 3600);
  const m = Math.floor((absS % 3600) / 60);
  const sec = absS % 60;
  const ts = [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
  return isNeg ? `- ${ts}` : ts;
};

const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "MacOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone")) return "iOS";
  return "Unknown Device";
};

// ==================== Break Functions ====================
async function startBreak() {
  const agentRef = ref(db, `agents/${currentName}`);
  const snapshot = await get(agentRef);
  const data = snapshot.val();

  if (data?.start > 0) return; // Already on break

  await update(agentRef, {
    start: Date.now(),
    status: 'On Break',
    lastSeen: Date.now()
  });
}

async function endBreak() {
  const agentRef = ref(db, `agents/${currentName}`);
  const snapshot = await get(agentRef);
  const data = snapshot.val();

  if (!data || !data.start) return;

  const start = data.start;
  const end = Date.now();
  const elapsed = Math.floor((end - start) / 1000);
  const newUsed = (data.used || 0) + elapsed;
  const newRemain = Math.max(0, (data.remain || DAY_TOTAL) - elapsed);

  const logEntry = {
    d: new Date().toLocaleDateString('en-US', { timeZone: ASIA_MANILA_TZ }),
    s: new Date(start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: ASIA_MANILA_TZ }),
    e: new Date(end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: ASIA_MANILA_TZ }),
    u: fmt(elapsed),
    r: fmt(newRemain),
    device: getDeviceInfo(),
    timestamp: end
  };

  // Save log
  const logsRef = ref(db, `agents/${currentName}/logs`);
  await push(logsRef, logEntry);

  // Update agent state
  await update(agentRef, {
    start: 0,
    used: newUsed,
    remain: newRemain,
    count: (data.count || 0) + 1,
    status: 'Available',
    lastSeen: Date.now()
  });
}

// ==================== Admin Functions ====================
function renderAdminDashboard() {
  const container = document.getElementById('adminAgentsList') || document.getElementById('adminDashboardBody');
  if (!container) return;

  const agentsRef = ref(db, 'agents');
  onValue(agentsRef, (snapshot) => {
    const agents = snapshot.val() || {};
    container.innerHTML = '';

    Object.keys(agents).sort().forEach(name => {
      const a = agents[name];
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${name}</td>
        <td>${fmt(a.remain || 0)}</td>
        <td>${fmt(a.used || 0)}</td>
        <td>${a.count || 0}</td>
        <td><button class="btn s" onclick="viewAgentLogs('${name}')">View Logs</button></td>
      `;
      container.appendChild(row);
    });
  });
}

function viewAgentLogs(agentName) {
  activeLogAgent = agentName;
  const modal = document.getElementById('logModal');
  const title = document.getElementById('logModalTitle') || document.querySelector('#logModal h2');
  
  if (title) title.textContent = `Session Logs: ${agentName}`;
  if (modal) {
    modal.style.display = 'block';
    drawLogs(agentName);
  }
}

function closeModal() {
  const modal = document.getElementById('logModal');
  if (modal) modal.style.display = 'none';
}

async function drawLogs(agentName) {
  const table = document.getElementById('logs');
  if (!table) return;

  table.innerHTML = `
    <tr>
      <th>Date</th><th>Start</th><th>End</th><th>Used</th><th>Remaining</th><th>Device</th>
    </tr>`;

  const logsRef = query(ref(db, `agents/${agentName}/logs`), orderByChild('timestamp'), limitToLast(100));
  
  const snapshot = await get(logsRef);
  const logs = snapshot.val();

  if (!logs) {
    table.innerHTML += `<tr><td colspan="6" style="text-align:center;">No logs found.</td></tr>`;
    return;
  }

  Object.values(logs).reverse().forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${log.d || '-'}</td>
      <td>${log.s || '-'}</td>
      <td>${log.e || '-'}</td>
      <td>${log.u || '-'}</td>
      <td>${log.r || '-'}</td>
      <td><small>${log.device || '-'}</small></td>
    `;
    table.appendChild(tr);
  });
}

async function exportCSV() {
  if (!activeLogAgent) {
    alert("Please open logs for an agent first.");
    return;
  }

  const logsRef = ref(db, `agents/${activeLogAgent}/logs`);
  const snapshot = await get(logsRef);
  const logsData = snapshot.val();

  if (!logsData) {
    alert("No logs to export.");
    return;
  }

  const rows = Object.values(logsData);
  const header = 'Date,Start Time,End Time,Used,Remaining,Device\n';
  const csvContent = rows.map(r => 
    `"${r.d||''}","${r.s||''}","${r.e||''}","${r.u||''}","${r.r||''}","${r.device||''}"`
  ).join('\n');

  const blob = new Blob(['\ufeff' + header + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BreakLogs_${activeLogAgent}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Weekly Reset (every Monday 00:00 Manila time)
function checkWeeklyReset() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday
  const hour = now.getHours();

  if (day === 1 && hour === 0) { // Monday at midnight
    const agentsRef = ref(db, 'agents');
    onValue(agentsRef, async (snapshot) => {
      const agents = snapshot.val() || {};
      for (const name in agents) {
        await update(ref(db, `agents/${name}`), {
          logs: {},        // Clear logs weekly
          used: 0,
          remain: DAY_TOTAL,
          count: 0
        });
      }
    }, { onlyOnce: true });
  }
}

// ==================== Init ====================
function initApp() {
  // Existing agent name display etc.
  const nameDisplay = document.getElementById('hello');
  if (nameDisplay) nameDisplay.textContent = currentName;

  renderAdminDashboard();
  setInterval(updateClock, 1000); // if you have updateClock
  checkWeeklyReset();
  setInterval(checkWeeklyReset, 3600000); // check every hour
}

window.startBreak = startBreak;
window.endBreak = endBreak;
window.viewAgentLogs = viewAgentLogs;
window.closeModal = closeModal;
window.exportCSV = exportCSV;
window.renderAdminDashboard = renderAdminDashboard;

// Run on load
initApp();