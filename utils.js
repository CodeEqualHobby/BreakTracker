/**
 * Shared utility functions for the Break Tracker app
 */

export const formatTime = (seconds) => {
    const absSeconds = Math.abs(seconds);
    const h = Math.floor(absSeconds / 3600);
    const m = Math.floor((absSeconds % 3600) / 60);
    const s = absSeconds % 60;
    const formatted = [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
    return seconds < 0 ? `-${formatted}` : formatted;
};

export const getManilaTime = () => {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
        timeStyle: 'medium'
    }).format(new Date());
};

export const isResetTime = () => {
    const now = new Date();
    const manilaString = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
    return manilaString === "16:00:00";
};

export const getDeviceInfo = () => {
    return navigator.userAgent;
};

/**
 * Generates and triggers a download for a CSV file.
 * @param {string[]} headers - Array of column headers
 * @param {any[][]} data - 2D array representing rows and cells
 * @param {string} filename - The name of the file to download
 */
export const generateCSV = (headers, data, filename) => {
    const csvContent = [
        headers.join(","),
        ...data.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", filename);
    link.click();
};