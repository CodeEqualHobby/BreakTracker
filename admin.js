import { db } from './firebase-config.js';
import { 
    collection, onSnapshot, addDoc, query, where, orderBy, getDocs, deleteDoc, doc, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { formatTime, getManilaTime, getManilaDate, generateCSV } from './utils.js';
import { limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Check Auth
const sessionUser = JSON.parse(localStorage.getItem('user'));

// --- Improved Weekly Reset Helpers ---
function getThisSundayResetPoint() {
    const now = new Date();
    // Convert to Manila time
    const manilaNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    
    // Create this week's Sunday at 12:00 PM Manila
    const reset = new Date(manilaNow);
    reset.setHours(12, 0, 0, 0);                    // 12:00 PM
    reset.setDate(reset.getDate() - reset.getDay()); // Move to Sunday (0 = Sunday)
    
    return reset.getTime();
}

async function autoCleanLogs() {
    try {
        const resetPoint = getThisSundayResetPoint();
        const lastResetStored = parseInt(localStorage.getItem('lastWeeklyReset') || '0', 10);

        // Skip if we already did this week's reset
        if (resetPoint <= lastResetStored) {
            console.log("Weekly logs cleanup already done this week.");
            return;
        }

        // Find logs older than this Sunday 12PM
        const cutoff = new Date(resetPoint);
        const q = query(
            collection(db, "breakLogs"), 
            where("timestamp", "<", cutoff)
        );
        
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log("No old logs to clean this week.");
            localStorage.setItem('lastWeeklyReset', String(resetPoint));
            return;
        }

        console.log(`Found ${snapshot.size} old logs to archive...`);
        await performWeeklyResetArchive(resetPoint);

    } catch (err) {
        console.error("Weekly cleanup failed:", err);
    }
}

async function performWeeklyResetArchive(mostRecent) {
    // Archive all logs before the reset point into localStorage and Firestore archive
    const q = query(collection(db, "breakLogs"), where("timestamp", "<", new Date(mostRecent)));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        // Save a lightweight JSON archive in localStorage keyed by date
        const archiveDate = new Date(mostRecent).toISOString().split('T')[0];
        const arr = [];
        snapshot.forEach(docSnap => arr.push(docSnap.data()));
        try { localStorage.setItem(`breakLogs_archived_${archiveDate}`, JSON.stringify(arr)); } catch (e) { console.warn('archive to localStorage failed', e); }

        // Also move into Firestore archive collection and delete originals
        const batch = writeBatch(db);
        snapshot.forEach((d) => {
            const archiveRef = doc(db, 'breakLogsArchive', d.id);
            batch.set(archiveRef, { ...d.data(), archivedAt: serverTimestamp() });
            batch.delete(d.ref);
        });
        await batch.commit();
        console.log(`Archived ${snapshot.size} old logs`);
    }

    // Mark reset in localStorage
    localStorage.setItem('lastWeeklyReset', String(mostRecent));
}
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
const resetTimersBtn = document.getElementById('resetTimersBtn');

let currentViewedAgent = null;
let currentLogs = [];

// --- Initialization ---
const init = () => {
    startAdminClock();
    autoCleanLogs();
    listenToAgents();
    
    // Periodically check for pending resets (every 5 minutes to catch missed windows)
    setInterval(() => {
        autoCleanLogs();
    }, 5 * 60 * 1000); // 5 minutes
};

const startAdminClock = () => {
    const clock = document.getElementById('adminTime');
    setInterval(() => { clock.innerText = getManilaTime(); }, 1000);
};

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});

// --- Manual Timer Reset ---
async function resetAllAgentTimers() {
    if (!confirm('⚠️ Are you sure you want to reset ALL agent timers to 1h 30m?\n\nThis action cannot be undone and will affect all agents.')) {
        return;
    }

    if (!confirm('⚠️ CONFIRM: Click OK to reset all agent timers NOW.')) {
        return;
    }

    try {
        resetTimersBtn.disabled = true;
        resetTimersBtn.innerText = 'Resetting...';
        
        const agentsSnap = await getDocs(collection(db, 'agents'));
        const batch = writeBatch(db);
        const DEFAULT_TIME = 5400; // 1h 30m

        agentsSnap.forEach(agentDoc => {
            const agentRef = doc(db, 'agents', agentDoc.id);
            batch.update(agentRef, {
                remainingBreakTime: DEFAULT_TIME,
                totalBreakTime: DEFAULT_TIME,
                lastReset: new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })
            });
        });

        await batch.commit();
        console.log(`✓ Reset timers for ${agentsSnap.size} agents to 1h 30m`);
        alert(`✓ Successfully reset timers for ${agentsSnap.size} agents`);
        
        resetTimersBtn.innerText = 'Reset Timers';
        resetTimersBtn.disabled = false;
    } catch (err) {
        console.error('Error resetting timers:', err);
        alert('❌ Error resetting timers. Check console for details.');
        resetTimersBtn.innerText = 'Reset Timers';
        resetTimersBtn.disabled = false;
    }
}

resetTimersBtn.addEventListener('click', resetAllAgentTimers);

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
            const fmtActionTime = (t) => {
                if (!t) return 'N/A';
                try {
                    if (typeof t.toDate === 'function') return t.toDate().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
                } catch (e) {}
                return String(t);
            };

            // render placeholder for last action; if agent doc lacks it, we'll fetch latest log
            const lastActionText = agent.lastAction ? `${String(agent.lastAction).toUpperCase()} (${fmtActionTime(agent.lastActionTime)})` : 'Loading...';

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
                <td class="px-8 py-5 last-action-cell">
                    <div class="text-xs font-semibold text-slate-400">${lastActionText}</div>
                </td>
                <td class="px-8 py-5 text-right">
                    <button type="button" class="view-logs-btn bg-slate-700 hover:bg-slate-600 text-xs font-bold px-4 py-2 rounded-lg transition-all">View Logs</button>
                </td>
            `;
            tableBody.appendChild(row);
            row.querySelector('.view-logs-btn')?.addEventListener('click', () => viewLogs(id, agent.fullName || 'N/A'));

            // If agent doc doesn't include lastAction, fetch latest log as fallback
            if (!agent.lastAction) {
                (async () => {
                    try {
                        const q = query(collection(db, 'breakLogs'), where('agentId', '==', id), orderBy('timestamp', 'desc'), limit(1));
                        const snaps = await getDocs(q);
                        if (!snaps.empty) {
                            const latest = snaps.docs[0].data();
                            const text = `${String(latest.action || 'N/A').toUpperCase()} (${latest.manilaTime || 'N/A'})`;
                            const cell = row.querySelector('.last-action-cell div');
                            if (cell) cell.innerText = text;
                        } else {
                            const cell = row.querySelector('.last-action-cell div');
                            if (cell) cell.innerText = 'No activity';
                        }
                    } catch (e) {
                        console.error('Failed to fetch fallback last log for agent', id, e);
                    }
                })();
            }
        });
    });
}

// --- Logs & Modal Logic ---

const viewLogs = async (agentId, fullName) => {
    currentViewedAgent = { id: agentId, name: fullName };
    modalAgentName.innerText = `Logs: ${fullName}`;
    logsTableBody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500">Loading logs...</td></tr>';
    logsModal.classList.remove('hidden');

    try {
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
                <td class="px-8 py-4 text-[10px] text-slate-500 max-w-xs">
                    <div title="${log.deviceInfo || ''}">${log.deviceInfo || '—'}</div>
                    <div class="text-[10px] text-slate-400 truncate" title="Device Token: ${log.deviceToken || ''}">Token: ${log.deviceToken ? log.deviceToken : '—'}</div>
                </td>
            `;
            logsTableBody.appendChild(row);
        });
    } catch (err) {
        console.error('Failed to load logs:', err);
        logsTableBody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-orange-400">Unable to load logs. Check console for details.</td></tr>';
        currentLogs = [];
    }

    exportCsvBtn.disabled = currentLogs.length === 0;
};

closeModalBtn.onclick = () => logsModal.classList.add('hidden');

exportCsvBtn.onclick = () => {
    if (!currentLogs.length) return;
    
    const headers = ["Timestamp", "Action", "Remaining Time", "Device Info", "Device Token"];
    const rows = currentLogs.map(l => [
        l.manilaTime,
        l.action,
        formatTime(l.remainingTime),
        l.deviceInfo,
        l.deviceToken || ''
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

init();
