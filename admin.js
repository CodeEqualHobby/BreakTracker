import { db } from './firebase-config.js';
import { 
    collection, onSnapshot, addDoc, query, where, orderBy, getDocs, deleteDoc, doc, serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { formatTime, getManilaTime, getManilaDate, generateCSV } from './utils.js';
import { limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Check Auth
const sessionUser = JSON.parse(localStorage.getItem('user'));

// --- Weekly reset helpers (migrated from previous localStorage snippet) ---
// Calculates the most recent Sunday 12:00 PM Manila (04:00 UTC)
function getMostRecentResetPoint() {
    const now = new Date();
    const reset = new Date(now.getTime());
    // Manila is UTC+8. Sunday 12:00 PM Manila = Sunday 04:00 AM UTC.
    reset.setUTCHours(4, 0, 0, 0);
    const day = reset.getUTCDay(); // 0 is Sunday
    reset.setUTCDate(reset.getUTCDate() - day);

    // If 'now' is earlier than this week's Sunday 12PM Manila, the last reset was last week.
    if (now.getTime() < reset.getTime()) {
        reset.setUTCDate(reset.getUTCDate() - 7);
    }
    return reset.getTime();
}

function shouldResetLogs() {
    const lastResetStored = parseInt(localStorage.getItem('lastWeeklyReset') || '0', 10);
    return getMostRecentResetPoint() > lastResetStored;
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
    }

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

// --- Auto-Clean Logic ---

async function autoCleanLogs() {
    // Compute the UTC timestamp that corresponds to the most recent Sunday at 12:00 PM Manila time.
    const MANILA_OFFSET_HOURS = 8;
    const nowUtcMs = Date.now();
    const manilaMs = nowUtcMs + MANILA_OFFSET_HOURS * 3600 * 1000;
    const manilaNow = new Date(manilaMs);
    const manilaYear = manilaNow.getUTCFullYear();
    const manilaMonth = manilaNow.getUTCMonth();
    const manilaDate = manilaNow.getUTCDate();
    const manilaDay = manilaNow.getUTCDay();

    // Manila local: Sunday at 12:00 -> UTC hour = 12 - MANILA_OFFSET_HOURS
    const lastSundayUtcMs = Date.UTC(
        manilaYear,
        manilaMonth,
        manilaDate - manilaDay,
        12 - MANILA_OFFSET_HOURS,
        0, 0, 0
    );
    // If the computed Manila Sunday noon maps to a UTC moment in the future
    // (e.g., today is Sunday before 12:00 PM Manila), move the cutoff back one week
    let adjustedLastSundayUtcMs = lastSundayUtcMs;
    if (adjustedLastSundayUtcMs > nowUtcMs) {
        adjustedLastSundayUtcMs -= 7 * 24 * 3600 * 1000;
    }
    const lastSunday = new Date(adjustedLastSundayUtcMs);

    const q = query(collection(db, "breakLogs"), where("timestamp", "<", lastSunday));
    const snapshot = await getDocs(q);

    // Only perform cleanup once per computed reset point
    const mostRecentResetPoint = getMostRecentResetPoint();
    const lastResetStored = parseInt(localStorage.getItem('lastWeeklyReset') || '0', 10);
    if (!(mostRecentResetPoint > lastResetStored)) {
        return;
    }

    if (snapshot.empty) {
        // mark reset point so we don't try again this week
        localStorage.setItem('lastWeeklyReset', String(mostRecentResetPoint));
        return;
    }

    // Archive and delete
    await performWeeklyResetArchive(mostRecentResetPoint);
}

init();
