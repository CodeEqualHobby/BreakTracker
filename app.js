// ==================== Firebase Setup (Modular) ====================
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

// ==================== Globals ====================
const DAY_TOTAL = 5400;
let currentName = localStorage.getItem('bb2_name') || 'Agent';
let activeLogAgent = '';
let isAdmin = false;

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

// ==================== Clock ====================
function updateClock() {
    const clockEl = document.getElementById('clock');
    if (!clockEl) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' 
    });
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Manila' 
    });

    clockEl.innerHTML = `${dateStr}<br>${timeStr}<br><small class="muted">Asia/Manila</small>`;
}

// ==================== Portal Navigation ====================
function hideAll() {
    document.querySelectorAll('.card').forEach(card => card.classList.add('hidden'));
}

function showAgentLogin() {
    hideAll();
    document.getElementById('agentLogin').classList.remove('hidden');
}

function showAdminLogin() {
    hideAll();
    document.getElementById('adminLogin').classList.remove('hidden');
}

function goHome() {
    hideAll();
    document.getElementById('portalSelect').classList.remove('hidden');
    isAdmin = false;
}

// ==================== Authentication (Basic) ====================
function authAgent() {
    const name = document.getElementById('loginAgentName').value.trim();
    const pin = document.getElementById('loginAgentPin').value.trim();

    if (!name) {
        alert("Please enter your name");
        return;
    }

    currentName = name;
    localStorage.setItem('bb2_name', name);

    hideAll();
    document.getElementById('mainCard').classList.remove('hidden');
    document.getElementById('hello').textContent = currentName;
}

function authAdmin() {
    const password = document.getElementById('adminPasswordInput').value;
    
    // Change this password as needed
    if (password === "admin123") {  
        isAdmin = true;
        hideAll();
        document.getElementById('admin').classList.remove('hidden');
        renderAdminDashboard();
    } else {
        alert("Incorrect admin password");
    }
}

// ==================== Break Functions ====================
async function startBreak() {
    const agentRef = ref(db, `agents/${currentName}`);
    const snapshot = await get(agentRef);
    const data = snapshot.val();

    if (data?.start > 0) return;

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
        d: new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila' }),
        s: new Date(start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila' }),
        e: new Date(end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila' }),
        u: fmt(elapsed),
        r: fmt(newRemain),
        device: getDeviceInfo(),
        timestamp: end
    };

    await push(ref(db, `agents/${currentName}/logs`), logEntry);

    await update(agentRef, {
        start: 0,
        used: newUsed,
        remain: newRemain,
        count: (data.count || 0) + 1,
        status: 'Available',
        lastSeen: Date.now()
    });
}

// ==================== Admin Functions (Logs + Export) ====================
function renderAdminDashboard() {
    const container = document.getElementById('adminDashboardBody');
    if (!container) return;

    onValue(ref(db, 'agents'), (snapshot) => {
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
    const title = document.getElementById('logModalTitle');
    
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

    table.innerHTML = `<tr><th>Date</th><th>Start</th><th>End</th><th>Used</th><th>Remaining</th><th>Device</th></tr>`;

    const logsQuery = query(ref(db, `agents/${agentName}/logs`), orderByChild('timestamp'), limitToLast(100));
    const snapshot = await get(logsQuery);
    const logs = snapshot.val();

    if (!logs) {
        table.innerHTML += `<tr><td colspan="6" style="text-align:center;padding:20px;">No logs found.</td></tr>`;
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
            <td><small class="muted">${log.device || '-'}</small></td>
        `;
        table.appendChild(tr);
    });
}

async function exportCSV() {
    if (!activeLogAgent) return alert("Please open logs first.");
    
    const snapshot = await get(ref(db, `agents/${activeLogAgent}/logs`));
    const logsData = snapshot.val();
    if (!logsData) return alert("No logs to export.");

    const rows = Object.values(logsData);
    const header = 'Date,Start Time,End Time,Used Duration,Remaining Balance,Device Info\n';
    const csvContent = rows.map(r => `"${r.d||''}","${r.s||''}","${r.e||''}","${r.u||''}","${r.r||''}","${r.device||''}"`).join('\n');

    const blob = new Blob(['\ufeff' + header + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BreakLogs_${activeLogAgent}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Weekly Reset
function checkWeeklyReset() {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0) {
        onValue(ref(db, 'agents'), async (snapshot) => {
            const agents = snapshot.val() || {};
            for (const name in agents) {
                await update(ref(db, `agents/${name}`), { logs: null, used: 0, remain: DAY_TOTAL, count: 0 });
            }
        }, { onlyOnce: true });
    }
}

// Stub functions for remaining buttons (add more logic later if needed)
function addAgent() { alert("Add Agent feature coming soon"); }
function applyAdjustment() { alert("Time Adjustment feature coming soon"); }
function resetUser(name) { 
    if (name) alert(`Reset for ${name} coming soon`);
}

// ==================== Init ====================
function initApp() {
    hideAll();
    document.getElementById('portalSelect').classList.remove('hidden');

    updateClock();
    setInterval(updateClock, 1000);

    checkWeeklyReset();
    setInterval(checkWeeklyReset, 3600000);
}

// Expose functions to window for HTML onclick
window.showAgentLogin = showAgentLogin;
window.showAdminLogin = showAdminLogin;
window.goHome = goHome;
window.authAgent = authAgent;
window.authAdmin = authAdmin;
window.startBreak = startBreak;
window.endBreak = endBreak;
window.viewAgentLogs = viewAgentLogs;
window.closeModal = closeModal;
window.exportCSV = exportCSV;
window.renderAdminDashboard = renderAdminDashboard;
window.addAgent = addAgent;
window.applyAdjustment = applyAdjustment;
window.resetUser = resetUser;

initApp();