const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf8');

const targetFunctionStart = "function initPhilosophy(offset = 0) {";
const nextFunctionStart = "function changeOffset(";

const startIndex = content.indexOf(targetFunctionStart);
const endIndex = content.indexOf(nextFunctionStart);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = unction initPhilosophy(forceIndex = null) {
    const container = document.getElementById('philosophy-content');
    const gridContainer = document.getElementById('philosophy-chapter-grid');
    if (typeof philosophyData === 'undefined' || philosophyData.length === 0) {
        if (container) container.innerHTML = '<div style="color:var(--text-secondary);">철학 데이터를 불러올 수 없습니다.</div>';
        return;
    }
    
    // 1. Calculate today's default index
    const nowZero = new Date();
    nowZero.setHours(0,0,0,0);
    const baseZero = new Date(2026, 8, 18);
    const diffDays = Math.round((nowZero - baseZero) / (1000 * 60 * 60 * 24));
    let todayIndex = diffDays % philosophyData.length;
    if (todayIndex < 0) todayIndex += philosophyData.length;
    
    // 2. Initialize offsets.philosophy ONCE as absolute index
    if (typeof window._philInitIndex === 'undefined') {
        window._philInitIndex = true;
        offsets.philosophy = todayIndex;
    }
    
    let index = offsets.philosophy;

    // Generate chapter buttons ONCE
    if (gridContainer && gridContainer.innerHTML.trim() === '') {
        const chapters = [];
        const chapterIndices = {};
        philosophyData.forEach((item, idx) => {
            if (item.chapter && !chapterIndices.hasOwnProperty(item.chapter)) {
                chapters.push(item.chapter);
                chapterIndices[item.chapter] = idx;
            }
        });

        chapters.forEach(chap => {
            const btn = document.createElement('button');
            btn.className = 'phil-chapter-btn';
            btn.textContent = chap.replace(/^[0-9A-ZIVX]+\\.\\s*/, '').replace(/^[①-?]\\s*/, '').trim();
            btn.onclick = () => {
                offsets.philosophy = chapterIndices[chap];
                initPhilosophy();
            };
            gridContainer.appendChild(btn);
        });
    }

    // Hide old select if it still exists
    const selectEl = document.getElementById('philosophy-select');
    if (selectEl) selectEl.style.display = 'none';

    // Update UI label
    const dateEl = document.getElementById('philosophy-date');
    if (dateEl) {
        dateEl.textContent = index === todayIndex ? '오늘' : \\ / \\;
    }

    const item = philosophyData[index];

    const chapterBadge = item.chapter
        ? \<div class="phil-chapter-badge tts-ignore">\</div>\
        : '';
    const sourceBadge = item.source
        ? \<div class="phil-source tts-ignore">?? \</div>\
        : '';

    if (container) {
        container.innerHTML = \
            \
            <div class="text-lg text-bold text-accent" style="margin: 10px 0 14px;">\</div>
            <div class="philosophy-desc text-body">\</div>
            \
        \;
    }

    // Highlight active button
    if (gridContainer) {
        gridContainer.querySelectorAll('.phil-chapter-btn').forEach(btn => {
            if (item.chapter && btn.textContent === item.chapter.replace(/^[0-9A-ZIVX]+\\.\\s*/, '').replace(/^[①-?]\\s*/, '').trim()) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

// --- 7. Navigation & Actions ---
;
    content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync('script.js', content, 'utf8');
    console.log('Replaced successfully');
} else {
    console.log('Target not found', startIndex, endIndex);
}
