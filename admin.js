import { db } from './firebase-config.js';
import { 
    collection, onSnapshot, addDoc, query, where, orderBy, getDocs, deleteDoc, doc, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { formatTime, getManilaTime, generateCSV } from './utils.js';

// Check Auth
const sessionUser = JSON.parse(localStorage.getItem('user'));
if (!sessionUser || sessionUser.role !== 'admin') {
    window.location.href = 'index.html';
}

// --- DOM Elements ---
const tableBody = document.getElementById('agentTableBody');
const addAgentForm = document.getElementById('addAgentForm');
const logsModal = document.getElementById('logsModal');
const logsTableBody = document.getElementById('logsTableBody');
const closeModalBtn = document.getElementById('closeModalBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const modalAgentName = document.getElementById('modalAgentName');

let currentViewedAgent = null;
let currentLogs = [];

// --- Initialization ---
const init = () => {
    startAdminClock();
    autoCleanLogs();
    listenToAgents();
};

const startAdminClock = () => {
    const clock = document.getElementById('adminTime');
    setInterval(() => { clock.innerText = getManilaTime(); }, 1000);
};

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});

// --- Agent Management ---

addAgentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('newFullName').value;
    const username = document.getElementById('newUsername').value.trim();
    const pin = document.getElementById('newPin').value;

    try {
        await addDoc(collection(db, "agents"), {
            fullName,
            username,
            pin,
            role: "agent",
            status: "available",
            totalBreakTime: 5400,
            remainingBreakTime: 5400,
            lastReset: ""
        });
        addAgentForm.reset();
        alert(`Agent ${username} added successfully.`);
    } catch (err) {
        console.error(err);
        alert("Error adding agent.");
    }
});

function listenToAgents() {
    onSnapshot(collection(db, "agents"), (snapshot) => {
        tableBody.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const agent = docSnap.data();
            const id = docSnap.id;
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-700/30 transition-colors border-b border-slate-700/30";
            
            const isBreak = agent.status === 'break';
            const remaining = agent.remainingBreakTime || 0;
            const lastActionText = agent.lastAction ? `${agent.lastAction.toUpperCase()} (${agent.lastActionTime || 'N/A'})` : 'No activity';

            row.innerHTML = `
                <td class="px-8 py-5">
                    <div class="font-bold text-white">${agent.fullName || 'N/A'}</div>
                    <div class="text-xs text-slate-500">@${agent.username}</div>
                </td>
                <td class="px-8 py-5">
                    <span class="px-3 py-1 rounded-full text-[10px] uppercase font-black ${isBreak ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}">
                        ${agent.status}
                    </span>
                </td>
                <td class="px-8 py-5 font-mono ${remaining < 0 ? 'text-red-400' : 'text-slate-300'}">
                    ${formatTime(remaining)}
                </td>
                <td class="px-8 py-5">
                    <div class="text-xs font-semibold text-slate-400">${lastActionText}</div>
                </td>
                <td class="px-8 py-5 text-right">
                    <button onclick="window.viewLogs('${id}', '${agent.fullName}')" class="bg-slate-700 hover:bg-slate-600 text-xs font-bold px-4 py-2 rounded-lg transition-all">View Logs</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    });
}

// --- Logs & Modal Logic ---

window.viewLogs = async (agentId, fullName) => {
    currentViewedAgent = { id: agentId, name: fullName };
    modalAgentName.innerText = `Logs: ${fullName}`;
    logsTableBody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500">Loading logs...</td></tr>';
    logsModal.classList.remove('hidden');

    const q = query(collection(db, "breakLogs"), where("agentId", "==", agentId), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    
    logsTableBody.innerHTML = '';
    currentLogs = [];

    snap.forEach(doc => {
        const log = doc.data();
        currentLogs.push(log);
        const row = document.createElement('tr');
        row.className = "border-b border-slate-700/20 hover:bg-slate-700/10";
        row.innerHTML = `
            <td class="px-8 py-4 text-xs text-slate-300">${log.manilaTime || '---'}</td>
            <td class="px-8 py-4">
                <span class="text-[10px] font-bold uppercase ${log.action === 'start' ? 'text-blue-400' : 'text-purple-400'}">${log.action}</span>
            </td>
            <td class="px-8 py-4 font-mono text-xs">${formatTime(log.remainingTime)}</td>
            <td class="px-8 py-4 text-[10px] text-slate-500 max-w-xs truncate" title="${log.deviceInfo}">${log.deviceInfo}</td>
        `;
        logsTableBody.appendChild(row);
    });
};

closeModalBtn.onclick = () => logsModal.classList.add('hidden');

exportCsvBtn.onclick = () => {
    if (!currentLogs.length) return;
    
    const headers = ["Timestamp", "Action", "Remaining Time", "Device Info"];
    const rows = currentLogs.map(l => [
        l.manilaTime,
        l.action,
        formatTime(l.remainingTime),
        l.deviceInfo
    ]);

    // Calculate Week Range for Filename
    const now = new Date();
    const sun = new Date(now);
    sun.setDate(now.getDate() - now.getDay());
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    
    const fDate = (d) => d.toISOString().split('T')[0];
    const filename = `${currentViewedAgent.name.replace(/\s/g, '_')}_Weekof_${fDate(sun)}-${fDate(sat)}.csv`;

    generateCSV(headers, rows, filename);
};

// --- Auto-Clean Logic ---

async function autoCleanLogs() {
    // Find the most recent Sunday at 12:00 PM MNL
    const now = new Date();
    const lastSunday = new Date();
    lastSunday.setDate(now.getDate() - now.getDay());
    lastSunday.setHours(12, 0, 0, 0);

    // Only delete if logs are actually from before this week's start
    const q = query(collection(db, "breakLogs"), where("timestamp", "<", lastSunday));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Cleaned up ${snapshot.size} old logs.`);
}

init();
