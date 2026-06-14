import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, query, where, orderBy, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { formatTime, getManilaTime, isResetTime, getDeviceInfo, getDeviceToken } from './utils.js';

// --- State & Elements ---
const sessionUser = JSON.parse(localStorage.getItem('user'));
if (!sessionUser || sessionUser.role !== 'agent') window.location.href = 'index.html';

const timerEl = document.getElementById('timer');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const statusBadge = document.getElementById('statusBadge');
const startBtn = document.getElementById('startBreakBtn');
const endBtn = document.getElementById('endBreakBtn');
const clockEl = document.getElementById('manilaClock');
const overbreakFlash = document.getElementById('overbreakFlash');
const breakCountEl = document.getElementById('breakCount');
const totalBreakTimeEl = document.getElementById('totalBreakTime');

let agentData = null;
let timerInterval = null;
const DEFAULT_BREAK_SEC = 5400; // 1h 30m
const BREAK_STATE_KEY = `breakState-${sessionUser.id}`;

const toMs = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.getTime();
};

// --- Initialization ---
function loadLocalBreakState() {
    try {
        const raw = localStorage.getItem(BREAK_STATE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved?.status !== 'break') return;

        if (saved.breakStartMs != null) agentData._localStartMs = Number(saved.breakStartMs);
        if (saved.breakEndMs != null) agentData.breakEndMs = Number(saved.breakEndMs);
        if (saved.breakRemainingAtStart != null) agentData.breakRemainingAtStart = Number(saved.breakRemainingAtStart);
    } catch (err) {
        localStorage.removeItem(BREAK_STATE_KEY);
    }
}

function saveLocalBreakState() {
    const state = {
        status: agentData.status,
        breakStartMs: agentData._localStartMs ?? null,
        breakEndMs: agentData.breakEndMs ?? null,
        breakRemainingAtStart: agentData.breakRemainingAtStart ?? null
    };
    localStorage.setItem(BREAK_STATE_KEY, JSON.stringify(state));
}

function clearLocalBreakState() {
    localStorage.removeItem(BREAK_STATE_KEY);
}

async function init() {
    const agentRef = doc(db, "agents", sessionUser.id);
    const snap = await getDoc(agentRef);
    
    if (snap.exists()) {
        agentData = snap.data();
        document.getElementById('userNameDisplay').innerText = agentData.username;
        document.getElementById('userFullName').innerText = agentData.fullName || 'Standard Agent';
        
        if (agentData.status === 'break') {
            loadLocalBreakState();

            if (!agentData.breakEndMs && agentData.breakStartedAt && agentData.breakRemainingAtStart != null) {
                const startMs = toMs(agentData.breakStartedAt);
                if (startMs) {
                    agentData.breakEndMs = startMs + Number(agentData.breakRemainingAtStart) * 1000;
                }
            }

            if (agentData.breakEndMs) {
                agentData._localStartMs = agentData._localStartMs || toMs(agentData.breakStartedAt);
                refreshBreakTimer();
            }
        } else {
            clearLocalBreakState();
        }

        updateUI();
        startClockAndLogic();
        loadTodayStats();
    }

    // Realtime sync: keep agentData updated when other devices change the agent doc
    onSnapshot(agentRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const serverData = docSnap.data();
        
        // If server says available, clear our local session anchor
            if (serverData.status === 'available') {
            agentData._localStartMs = null;
            agentData.breakEndMs = null;
            agentData.breakRemainingAtStart = null;
            clearLocalBreakState();
        }

        // Only update status and other fields, but DON'T overwrite timing if we are mid-break
        // to prevent the "jump" caused by latency or stale 10s syncs.
        if (agentData.status !== 'break') {
            agentData.remainingBreakTime = serverData.remainingBreakTime;
        }
        
        agentData.status = serverData.status;
        agentData.lastReset = serverData.lastReset;

        // Only accept server timing if we don't have a local session active
        if (!agentData._localStartMs) {
            agentData.breakStartedAt = serverData.breakStartedAt;
            agentData.breakRemainingAtStart = serverData.breakRemainingAtStart;
        }

        // Mirror last action fields so UI can display them without extra fetch
        if (serverData.lastAction) agentData.lastAction = serverData.lastAction;
        if (serverData.lastActionTime) agentData.lastActionTime = serverData.lastActionTime;

        updateUI();
        loadTodayStats();
    });
}

function updateUI() {
    const isBreak = agentData.status === 'break';
    
    // Timer Color & Text
    const remaining = agentData.remainingBreakTime;
    timerEl.innerText = formatTime(remaining);
    timerEl.className = `text-7xl md:text-8xl font-mono font-black mb-10 tracking-tighter transition-colors ${remaining < 0 ? 'text-red-500' : 'text-white'}`;
    overbreakFlash.classList.toggle('hidden', remaining >= 0 || !isBreak);

    // Status Badge
    statusText.innerText = isBreak ? 'On Break' : 'Available';
    statusDot.className = `w-2 h-2 rounded-full mr-2 ${isBreak ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`;
    statusBadge.className = `inline-flex items-center px-4 py-2 rounded-full font-bold mb-8 transition-all ${isBreak ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`;

    // Buttons
    startBtn.disabled = isBreak;
    endBtn.disabled = !isBreak;
    endBtn.className = isBreak 
        ? 'bg-red-500 text-white font-black py-5 rounded-2xl hover:bg-red-400 transition-all text-lg shadow-lg shadow-red-500/20'
        : 'bg-slate-700 text-slate-400 font-black py-5 rounded-2xl transition-all text-lg disabled:opacity-20 opacity-50 cursor-not-allowed';
}

function refreshBreakTimer() {
    if (agentData.breakEndMs != null) {
        agentData.remainingBreakTime = Math.ceil((agentData.breakEndMs - Date.now()) / 1000);
        return;
    }

    const startMs = agentData._localStartMs || toMs(agentData.breakStartedAt);
    if (!startMs) return;

    if (agentData.breakRemainingAtStart == null) {
        agentData.breakRemainingAtStart = Number(agentData.remainingBreakTime ?? DEFAULT_BREAK_SEC);
    }

    const remainingAtStart = Number(agentData.breakRemainingAtStart);
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    agentData.remainingBreakTime = remainingAtStart - elapsed;
}

function startClockAndLogic() {
    setInterval(() => {
        const now = new Date();
        clockEl.innerText = getManilaTime().split(', ')[1];

        if (agentData.status === 'break') {
            refreshBreakTimer();
            updateUI();
        }
    }, 1000);
}

async function syncFirestore() {
    if (!sessionUser.id) return;
    const agentRef = doc(db, "agents", sessionUser.id);
    await updateDoc(agentRef, {
        remainingBreakTime: agentData.remainingBreakTime,
        status: agentData.status,
        lastReset: agentData.lastReset || null
    });
}

async function logBreakAction(action, duration = null) {
    const payload = {
        agentId: sessionUser.id,
        agentName: agentData.username,
        timestamp: serverTimestamp(),
        manilaTime: getManilaTime(),
        action,
        remainingTime: agentData.remainingBreakTime,
        deviceInfo: getDeviceInfo(),
        deviceToken: getDeviceToken()
    };

    if (action === 'end') {
        payload.duration = duration;
    }

    await addDoc(collection(db, "breakLogs"), payload);
}

const startBreakFirestore = async () => {
    const agentRef = doc(db, "agents", sessionUser.id);
    await updateDoc(agentRef, {
        status: 'break',
        breakStartedAt: serverTimestamp(),
        breakRemainingAtStart: agentData.remainingBreakTime,
        lastAction: 'start',
        lastActionTime: getManilaTime()
    });
};

const endBreakFirestore = async () => {
    const agentRef = doc(db, "agents", sessionUser.id);
    await updateDoc(agentRef, {
        status: 'available',
        remainingBreakTime: agentData.remainingBreakTime,
        breakStartedAt: null,
        breakRemainingAtStart: null,
        lastAction: 'end',
        lastActionTime: getManilaTime()
    });
    agentData.breakStartedAt = null;
    agentData.breakRemainingAtStart = null;
};

const formatMinutes = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}m`;

const isSameManilaDay = (date, reference = new Date()) => {
    return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) === reference.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
};

const loadTodayStats = async () => {
    try {
        const q = query(collection(db, "breakLogs"), where("agentId", "==", sessionUser.id), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        const today = new Date();
        let breakCount = 0;
        let totalSeconds = 0;

        snap.forEach(docSnap => {
            const log = docSnap.data();
            const timestamp = log.timestamp && log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.manilaTime || '');
            if (!timestamp || !isSameManilaDay(timestamp, today)) return;

            if (log.action === 'start') breakCount += 1;
            if (log.action === 'end') totalSeconds += Number(log.duration || 0);
        });

        if (agentData?.status === 'break') {
            totalSeconds += Math.max(0, DEFAULT_BREAK_SEC - agentData.remainingBreakTime);
        }

        breakCountEl.innerText = breakCount;
        totalBreakTimeEl.innerText = formatMinutes(totalSeconds);
    } catch (err) {
        console.error('Failed to load daily stats:', err);
    }
}

// --- Event Listeners ---

startBtn.addEventListener('click', async () => {
    const now = Date.now();
    startBtn.disabled = true;
    
    // Set local state IMMEDIATELY for smooth UI
    const currentRemaining = Number(agentData.remainingBreakTime ?? DEFAULT_BREAK_SEC);
    agentData.status = 'break';
    agentData._localStartMs = now;
    agentData.breakRemainingAtStart = currentRemaining;
    agentData.breakEndMs = now + currentRemaining * 1000;
    agentData.remainingBreakTime = currentRemaining;
    saveLocalBreakState();

    refreshBreakTimer();
    updateUI();
    loadTodayStats();

    try {
        await startBreakFirestore();
        await logBreakAction('start');
    } catch (err) {
        console.error('Failed to start break:', err);
    }
});

endBtn.addEventListener('click', async () => {
    endBtn.disabled = true;
    agentData.status = 'available';

    const startMs = agentData._localStartMs || toMs(agentData.breakStartedAt) || Date.now();
    const duration = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    agentData._localStartMs = null;
    agentData.breakEndMs = null;

    const remainingAtStart = Number(agentData.breakRemainingAtStart ?? DEFAULT_BREAK_SEC);
    agentData.remainingBreakTime = remainingAtStart - duration;
    agentData.breakRemainingAtStart = null;
    clearLocalBreakState();

    await logBreakAction('end', duration);
    await endBreakFirestore();
    updateUI();
    loadTodayStats();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    if (agentData.status === 'break') {
        alert("Please end your break before logging out.");
        return;
    }
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});

// Init on load
init();