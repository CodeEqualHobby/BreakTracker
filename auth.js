import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const agentForm = document.getElementById('agentForm');
const adminForm = document.getElementById('adminForm');
const errorMsg = document.getElementById('errorMsg');

const showError = (msg) => {
    errorMsg.innerText = msg;
    errorMsg.style.opacity = '1';
    setTimeout(() => {
        errorMsg.style.opacity = '0';
    }, 3000);
};

// Agent Login Logic
agentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('agentUsername').value.trim();
    const pin = document.getElementById('agentPin').value;

    try {
        const q = query(collection(db, "agents"), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            showError("Agent not found.");
            return;
        }

        let found = false;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.pin === pin) {
                found = true;
                // Store session in localStorage (Simple Auth)
                localStorage.setItem('user', JSON.stringify({ ...data, id: doc.id, role: 'agent' }));
                window.location.href = 'agent.html';
            }
        });

        if (!found) showError("Invalid PIN.");
    } catch (error) {
        console.error("Login Error:", error);
        showError("Connection failed.");
    }
});

// Admin Login Logic (Hardcoded as per request)
adminForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('adminUsername').value.trim();
    const pin = document.getElementById('adminPin').value;

    // Fixed Admin Credentials
    if (username === 'admin' && pin === '1234') {
        localStorage.setItem('user', JSON.stringify({ username: 'admin', role: 'admin' }));
        window.location.href = 'admin.html';
    } else {
        showError("Invalid admin credentials.");
    }
});