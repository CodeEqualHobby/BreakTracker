import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { formatTime, getManilaTime, isResetTime, getDeviceInfo } from './utils.js';

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

let agentData = null;
let timerInterval = null;
const DEFAULT_BREAK_SEC = 5400; // 1h 30m

// --- Initialization ---
async function init() {
    const agentRef = doc(db, "agents", sessionUser.id);
    const snap = await getDoc(agentRef);
    
    if (snap.exists()) {
        agentData = snap.data();
        document.getElementById('userNameDisplay').innerText = agentData.username;
        document.getElementById('userFullName').innerText = agentData.fullName || 'Standard Agent';
        updateUI();
        startClockAndLogic();
    }
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

function startClockAndLogic() {
    setInterval(() => {
        const now = new Date();
        clockEl.innerText = getManilaTime().split(', ')[1];

        // Auto-reset logic (4:00 PM Manila)
        const todayStr = now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
        if (isResetTime() && agentData.lastReset !== todayStr) {
            performReset(todayStr);
        }

        if (agentData.status === 'break') {
            agentData.remainingBreakTime--;
            updateUI();
            // Persist to Firestore every 10 seconds to save on writes but maintain "real-time"
            if (agentData.remainingBreakTime % 10 === 0) syncFirestore();
        }
    }, 1000);
}

async function performReset(dateStr) {
    agentData.remainingBreakTime = DEFAULT_BREAK_SEC;
    agentData.lastReset = dateStr;
    await syncFirestore();
    updateUI();
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

async function logBreakAction(action) {
    await addDoc(collection(db, "breakLogs"), {
        agentId: sessionUser.id,
        agentName: agentData.username,
        timestamp: serverTimestamp(),
        manilaTime: getManilaTime(),
        action: action,
        remainingTime: agentData.remainingBreakTime,
        deviceInfo: getDeviceInfo()
    });
}

// --- Event Listeners ---

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    agentData.status = 'break';
    await logBreakAction('start');
    await syncFirestore();
    updateUI();
});

endBtn.addEventListener('click', async () => {
    endBtn.disabled = true;
    agentData.status = 'available';
    await logBreakAction('end');
    await syncFirestore();
    updateUI();
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