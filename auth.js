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

// Admin Login Logic (Hardcoded)
adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('adminUsername').value.trim();
    const pin = document.getElementById('adminPin').value;

    try {
        // Query the 'agents' collection for a document with the matching username and role 'admin'
        const q = query(collection(db, "agents"), 
            where("username", "==", username), 
            where("role", "==", "admin")
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            showError("Admin account not found.");
            return;
        }

        let found = false;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.pin === pin) {
                found = true;
                localStorage.setItem('user', JSON.stringify({ ...data, id: doc.id, role: 'admin' }));
                window.location.href = 'admin.html';
            }
        });

        if (!found) showError("Invalid admin PIN.");
    } catch (error) {
        console.error("Admin Login Error:", error);
        showError("Connection failed.");
    }
});