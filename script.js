// SDU Homepage Main Script

let chartInstances = {};
let offsets = { philosophy: 0, iching: 0, saju: 0 };

document.addEventListener('DOMContentLoaded', () => {
    initWeather();
    initCalendar();
    
    // Timeframe buttons
    const btns = document.querySelectorAll('.timeframe-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            btns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const period = e.target.getAttribute('data-period');
            updateAllCharts(period);
        });
    });
    
    initKospi('today');
    initStocks('today');
    initIChing();
    initSaju();
    initPhilosophy();
});

async function updateAllCharts(period) {
    // We already have the current prices in the DOM, but for simplicity we re-fetch them.
    // However, it's faster to just redraw the charts. Let's just re-init everything for now.
    initKospi(period);
    initStocks(period);
}

// --- 1. Weather (Open-Meteo API) ---
const LOCATIONS = {
    paju: { lat: 37.7599, lon: 126.7779 },
    seoul: { lat: 37.5665, lon: 126.9780 },
    jeju: { lat: 33.4996, lon: 126.5312 }
};

const WMO_CODES = {
    0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림',
    45: '안개', 48: '안개', 51: '가벼운 비', 53: '비', 55: '강한 비',
    61: '가벼운 비', 63: '비', 65: '강한 비', 71: '가벼운 눈', 73: '눈', 75: '강한 눈',
    80: '소나기', 95: '뇌우', 96: '뇌우/우박', 99: '뇌우/우박'
};

async function updateWeatherWidget() {
    try {
        // Fallback: Goyang-si Deogi-dong coords (approx)
        let lat = 37.6970;
        let lon = 126.7380;
        let locName = "고양시 덕이동";
        
        // Attempt to get user's current location
        if (navigator.geolocation) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, maximumAge: 60000 });
                });
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;
                
                try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=ko`);
                    const geoData = await geoRes.json();
                    if (geoData && geoData.address) {
                        const addr = geoData.address;
                        const city = addr.city || addr.province || addr.county || '';
                        const neighborhood = addr.suburb || addr.borough || addr.village || addr.town || '';
                        locName = `${city} ${neighborhood}`.trim();
                    }
                } catch(e) {
                    console.log("Reverse geocoding failed", e);
                }
            } catch (e) {
                console.log("위치 정보를 가져올 수 없어 기본 지역을 사용합니다.", e);
            }
        }
        
        const locEl = document.getElementById('weather-location');
        if (locEl) locEl.textContent = locName || "현재 위치";
        
        // Fetch current, daily min/max, and hourly temp/weathercode
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul`;
        const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;
        
        const [weatherRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);
        const weatherData = await weatherRes.json();
        const aqiData = await aqiRes.json();
        
        const current = weatherData.current_weather;
        const temp = current.temperature;
        const code = current.weathercode;
        const desc = WMO_CODES[code] || '알 수 없음';
        
        const maxTemp = Math.round(weatherData.daily.temperature_2m_max[0]);
        const minTemp = Math.round(weatherData.daily.temperature_2m_min[0]);
        
        const pm10 = aqiData.current.pm10;
        const pm25 = aqiData.current.pm2_5;
        
        const getAqiDesc = (val, isPm25) => {
            let status = '';
            let color = '';
            if (isPm25) {
                if (val <= 15) { status = '좋음'; color = '#4fc3f7'; }
                else if (val <= 35) { status = '보통'; color = '#81c784'; }
                else if (val <= 75) { status = '나쁨'; color = '#ffb74d'; }
                else { status = '매우나쁨'; color = '#e57373'; }
            } else {
                if (val <= 30) { status = '좋음'; color = '#4fc3f7'; }
                else if (val <= 80) { status = '보통'; color = '#81c784'; }
                else if (val <= 150) { status = '나쁨'; color = '#ffb74d'; }
                else { status = '매우나쁨'; color = '#e57373'; }
            }
            return `<span style="color:${color}; font-weight:500;">${status}</span>`;
        };
        
        // Update DOM
        const tempEl = document.querySelector('.weather-temp');
        if (tempEl) {
            tempEl.textContent = `${temp}°`;
            document.querySelector('.weather-desc').textContent = desc;
            document.querySelector('.weather-highlow').innerHTML = `<span class="w-low">${minTemp}°</span> / <span class="w-high">${maxTemp}°</span>`;
            document.querySelector('.weather-dust').innerHTML = `미세 ${getAqiDesc(pm10, false)} · 초미세 ${getAqiDesc(pm25, true)}`;
        }
        
        // Chart: get next 5 points (every 2 hours)
        const hourIdx = weatherData.hourly.time.findIndex(t => new Date(t) > new Date());
        let startIdx = hourIdx > 0 ? hourIdx - 1 : 0;
        
        let chartData = [];
        let chartLabels = [];
        let chartIcons = [];
        for (let i = 0; i < 5; i++) {
            let idx = startIdx + (i * 2); // every 2 hours
            if (idx >= weatherData.hourly.time.length) break;
            
            const t = new Date(weatherData.hourly.time[idx]);
            const hour = t.getHours();
            chartLabels.push(hour + '시');
            chartData.push(weatherData.hourly.temperature_2m[idx]);
            
            const cCode = weatherData.hourly.weathercode[idx];
            const isNight = hour < 6 || hour >= 19;
            if (isNight && [0,1,2].includes(cCode)) {
                chartIcons.push(`<div class="fc-icon-moon"><svg viewBox="0 0 24 24" width="20" height="20" fill="#7baaf7"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></div>`);
            } else if ([0,1,2].includes(cCode)) {
                chartIcons.push(`<div class="fc-icon-sun"></div>`);
            } else if ([3].includes(cCode)) {
                chartIcons.push(`<span style="font-size:16px;">☁️</span>`);
            } else {
                chartIcons.push(`<span style="font-size:16px;">🌧️</span>`);
            }
        }
        
        // Render forecast items
        const fcRow = document.querySelector('.weather-forecast-row');
        if (fcRow) {
            fcRow.innerHTML = chartData.map((d, i) => `
                <div class="fc-item">
                    ${chartIcons[i]}
                    <div class="fc-time">${i === 0 ? chartLabels[i] : chartLabels[i].replace('시', '')}</div>
                </div>
            `).join('');
        }
        
        // Render Chart
        const ctx = document.getElementById('weatherMiniChart');
        if (ctx) {
            if (chartInstances['weatherMiniChart']) {
                chartInstances['weatherMiniChart'].destroy();
            }
            chartInstances['weatherMiniChart'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        data: chartData,
                        borderColor: 'rgba(255, 255, 255, 0.25)',
                        borderWidth: 1.5,
                        tension: 0.4,
                        pointRadius: 0,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    layout: { padding: { top: 12, bottom: 2, left: 8, right: 8 } },
                    scales: {
                        x: { display: false },
                        y: { display: false, min: Math.min(...chartData) - 3, max: Math.max(...chartData) + 6 }
                    },
                    animation: false
                },
                plugins: [{
                    id: 'topLabels',
                    afterDatasetsDraw(chart) {
                        const { ctx, data } = chart;
                        ctx.save();
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                        ctx.font = '10px "Inter", sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        
                        const meta = chart.getDatasetMeta(0);
                        meta.data.forEach((point, i) => {
                            const value = Math.round(data.datasets[0].data[i]);
                            ctx.fillText(value + '°', point.x, point.y - 4);
                        });
                        ctx.restore();
                    }
                }]
            });
        }
        
    } catch (error) {
        console.error('Weather error:', error);
    }
}

function initWeather() {
    updateWeatherWidget();
}

// --- 2. Calendar (Custom ICS Parser) ---
// ical.js 대신 직접 파싱하여 텍스트 깨짐이나 형식이 다른 파일을 더 유연하게 처리합니다.
async function initCalendar() {
    const eventsListEl = document.getElementById('events-list');
    if (!eventsListEl) return;
    
    let errorHtml = '';

    try {
        const response = await fetch('hb1392@gmail.com.ics');
        if (!response.ok) {
            throw new Error(`HTTP fetch 실패 (상태 코드: ${response.status}) - 로컬 서버 환경인지 확인해주세요.`);
        }
        
        // 텍스트 인코딩 문제(한글 깨짐 등)나 ical 포맷 오류를 피하기 위한 커스텀 정규식 기반 파서
        const icsText = await response.text();
        
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        
        const dayOfWeek = now.getDay();
        const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        const endOfNextWeek = new Date(endOfWeek);
        endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

        let upcomingEvents = [];
        let displayEvents = [];
        let isFallback = false;

        try {
            if (typeof ICAL === 'undefined') throw new Error('ICAL is not loaded');
            const jcalData = ICAL.parse(icsText);
            const comp = new ICAL.Component(jcalData);
            const vevents = comp.getAllSubcomponents('vevent');
            
            vevents.forEach(vevent => {
                const event = new ICAL.Event(vevent);
                if (event.isRecurring()) {
                    try {
                        const iter = event.iterator();
                        let next;
                        let i = 0;
                        while ((next = iter.next()) && i < 1000) {
                            i++;
                            const startJS = next.toJSDate();
                            if (startJS >= endOfNextWeek) break;
                            
                            let endJS = null;
                            if (event.endDate) {
                                const duration = event.endDate.subtractDateTz(event.startDate);
                                const nextEnd = next.clone();
                                nextEnd.addDuration(duration);
                                endJS = nextEnd.toJSDate();
                            }
                            
                            if (startJS >= todayStart && startJS < endOfNextWeek) {
                                upcomingEvents.push({ summary: event.summary, start: startJS, end: endJS, isAllDay: event.startDate.isDate });
                            }
                        }
                    } catch (err) {
                        console.warn('반복 일정 처리 오류 (건너뜀):', event.summary, err);
                    }
                } else {
                    const start = event.startDate;
                    if (start) {
                        const startJS = start.toJSDate();
                        const endJS = event.endDate ? event.endDate.toJSDate() : null;
                        if (startJS >= todayStart && startJS < endOfNextWeek) {
                            upcomingEvents.push({ summary: event.summary, start: startJS, end: endJS, isAllDay: start.isDate });
                        }
                    }
                }
            });
            
            upcomingEvents.sort((a, b) => a.start - b.start);
            displayEvents = upcomingEvents;
        } catch (icalError) {
            console.warn('ical.js 파싱 실패, 커스텀 파서로 폴백합니다.', icalError);
            let errorMessage = icalError.message || String(icalError);
            
            errorHtml = `<div class="calendar-error">⚠️ ical.js 오류: ${errorMessage} (기본 파서로 전환됨)</div>`;
            
            // 기존 커스텀 파서 (fallback)
            const lines = icsText.split(/\r?\n/);
            const allEvents = [];
            let currentEvent = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('BEGIN:VEVENT')) {
                    currentEvent = {};
                } else if (line.startsWith('END:VEVENT') && currentEvent) {
                    if (currentEvent.start) allEvents.push(currentEvent);
                    currentEvent = null;
                } else if (currentEvent) {
                    if (line.startsWith('SUMMARY:')) {
                        currentEvent.summary = line.substring(8).trim();
                    } else if (line.startsWith('DTSTART')) {
                        const match = line.match(/:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
                        if (match) {
                            if (match[4]) {
                                currentEvent.start = new Date(Date.UTC(+match[1], match[2]-1, +match[3], +match[4], +match[5], +match[6]));
                                currentEvent.isAllDay = false;
                            } else {
                                currentEvent.start = new Date(+match[1], match[2]-1, +match[3]);
                                currentEvent.isAllDay = true;
                            }
                        }
                    } else if (line.startsWith('DTEND')) {
                        const match = line.match(/:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
                        if (match) {
                            if (match[4]) {
                                currentEvent.end = new Date(Date.UTC(+match[1], match[2]-1, +match[3], +match[4], +match[5], +match[6]));
                            } else {
                                currentEvent.end = new Date(+match[1], match[2]-1, +match[3]);
                            }
                        }
                    }
                }
            }
            
            upcomingEvents = allEvents.filter(e => e.start && e.start >= todayStart && e.start < endOfNextWeek);
            displayEvents = upcomingEvents;
            displayEvents.sort((a, b) => a.start - b.start);
        }
        
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dateString = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;

        eventsListEl.innerHTML = errorHtml + `<div class="calendar-date">🗓️ ${dateString}</div>`;
        
        if (displayEvents.length === 0) {
            eventsListEl.innerHTML += '<p class="no-events">예정된 일정이 없습니다.</p>';
            return;
        }

        const todayEvents = [];
        const futureEvents = [];
        displayEvents.forEach(evt => {
            if (evt.start >= todayEnd) futureEvents.push(evt);
            else todayEvents.push(evt);
        });

        if (todayEvents.length === 0) {
            eventsListEl.innerHTML += '<p class="no-events">오늘 일정이 없습니다.</p>';
        }

        const createCard = (evt, isFuture) => {
            const card = document.createElement('div');
            card.className = isFuture ? 'future-event-card' : 'event-card';
            const title = document.createElement('div');
            title.className = 'event-title';
            title.textContent = evt.summary || '(제목 없음)';
            const time = document.createElement('div');
            time.className = 'event-time';
            const formatTime = (d) => d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            if (evt.isAllDay) time.textContent = evt.start.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }) + ' (종일)';
            else time.textContent = `${formatTime(evt.start)} - ${evt.end ? formatTime(evt.end) : ''}`;
            card.appendChild(title);
            card.appendChild(time);
            return card;
        };

        todayEvents.forEach(evt => {
            eventsListEl.appendChild(createCard(evt, false));
        });

        if (futureEvents.length > 0) {
            const wrap = document.createElement('div');
            wrap.style.marginTop = '20px';
            wrap.innerHTML = `
                <div class="calendar-section-title">
                    <div >다가오는 일정 (${futureEvents.length}개)</div>
                    <button onclick="window.toggleFutureEvents()" id="future-events-btn" class="nav-btn toggle-btn" title="접기/펼치기"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="chevron-icon"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
                </div>
                <div id="future-events-container" class="calendar-events-container" style="display: none;"></div>
            `;
            eventsListEl.appendChild(wrap);
            const futureContainer = eventsListEl.querySelector('#future-events-container');
            futureEvents.forEach(evt => {
                futureContainer.appendChild(createCard(evt, true));
            });
        }
        
    } catch (error) {
        console.error('Calendar parse error:', error);
        eventsListEl.innerHTML = `<p class="calendar-error">⚠️ 일정 불러오기 실패: ${error.message}</p>`;
    }
}

window.toggleStocks = function() {
    const grid = document.getElementById('stocks-grid');
    const btn = document.getElementById('stocks-toggle-btn');
    if (!grid || !btn) return;
    if (grid.style.display === 'none') {
        grid.style.display = 'grid';
        btn.classList.add('open');
    } else {
        grid.style.display = 'none';
        btn.classList.remove('open');
    }
};

window.toggleFutureEvents = function() {
    const container = document.getElementById('future-events-container');
    const btn = document.getElementById('future-events-btn');
    if (container.style.display === 'none') {
        container.style.display = 'flex';
        btn.classList.add('open');
    } else {
        container.style.display = 'none';
        btn.classList.remove('open');
    }
};

// --- 3. Daily I Ching ---
function initIChing(offset = 0) {
    const container = document.getElementById('iching-content');
    if (typeof ichingData === 'undefined' || ichingData.length === 0) {
        container.innerHTML = '<p>주역 데이터가 없습니다.</p>';
        return;
    }
    
    const now = new Date();
    now.setDate(now.getDate() + offset);
    
    // Populate select if empty
    const selectEl = document.getElementById('iching-select');
    if (selectEl && selectEl.options.length === 0) {
        ichingData.forEach((item, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${item.id}. ${String.fromCodePoint(0x4DC0 + item.id - 1)} ${item.name_korean}`;
            selectEl.appendChild(opt);
        });
    }

    // 2026년 9월 18일을 시작점(1번, index 0)으로 설정하여 매일 1씩 증가
    const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const baseZero = new Date(2026, 8, 18); // 9월은 8
    const diffDays = Math.round((nowZero - baseZero) / (1000 * 60 * 60 * 24));
    let index = diffDays % ichingData.length;
    if (index < 0) index += ichingData.length;

    // Update UI label
    const dateEl = document.getElementById('iching-date');
    if (dateEl) {
        dateEl.textContent = index === 0 ? '오늘' : `${index + 1}`;
    }
    
    if (selectEl) selectEl.value = index;
    
    const hexagram = ichingData[index];
    
    let html = `
        <div class="iching-header">
            <span class="iching-hexagram-icon">
                ${String.fromCodePoint(0x4DC0 + hexagram.id - 1)}
            </span>
            <span class="iching-hexagram-name">${hexagram.name_korean}(${hexagram.name_chinese})</span>
        </div>
        <div class="iching-text">
            ${hexagram.description ? `<p class="text-body"><span class="label-badge" >설명</span> ${hexagram.description.replace(/\n/g, '<br>')}</p>` : ''}
            <div class="iching-box">
                <p class="iching-box-title"><strong>卦辭</strong></p>
                <p class="iching-box-text">${hexagram.gwaesa_chinese}</p>
                <p class="text-body">${hexagram.gwaesa_korean}</p>
            </div>
            <div class="iching-box">
                <p class="iching-box-title"><strong>爻辭</strong></p>
                ${hexagram.lines ? hexagram.lines.map(l => `<div class="iching-line-item">
                    <span class="iching-line-name">[${l.name}]</span><br>
                    <div class="iching-line-text">${l.text_chinese}</div>
                    <div class="text-body">${l.text_korean}</div>
                </div>`).join('') : ''}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// --- 4. Today's Saju (Fortune) ---
function getFiveElements(year, month, day, hour, calendarType = 'solar') {
    if (typeof Lunar === 'undefined') {
        return { layoutHtml: '<div style="color:red; text-align:center;">로딩 중입니다... 잠시 후 다시 시도해주세요.</div>', counts: {'목':0,'화':0,'토':0,'금':0,'수':0} };
    }
    const stemElements = {
        '甲': '목(나무)', '乙': '목(나무)',
        '丙': '화(불)', '丁': '화(불)',
        '戊': '토(흙)', '己': '토(흙)',
        '庚': '금(쇠)', '辛': '금(쇠)',
        '壬': '수(물)', '癸': '수(물)'
    };
    
    const branchElements = {
        '子': '수(물)', '丑': '토(흙)', '寅': '목(나무)', '卯': '목(나무)',
        '辰': '토(흙)', '巳': '화(불)', '午': '화(불)', '未': '토(흙)',
        '申': '금(쇠)', '酉': '금(쇠)', '戌': '토(흙)', '亥': '수(물)'
    };

    let solarDate;
    try {
        if (calendarType === 'lunar') {
            solarDate = Lunar.fromYmdHms(year, month, day, hour, 0, 0).getSolar();
        } else {
            solarDate = Solar.fromYmdHms(year, month, day, hour, 0, 0);
        }
    } catch (e) {
        console.error(e);
        solarDate = Solar.fromYmdHms(year, month, day, hour, 0, 0);
    }
    
    const lunarDate = solarDate.getLunar();
    const bazi = lunarDate.getEightChar();
    
    const yStem = bazi.getYearGan() || '甲';
    const yBranch = bazi.getYearZhi() || '子';
    const mStem = bazi.getMonthGan() || '甲';
    const mBranch = bazi.getMonthZhi() || '子';
    const dStem = bazi.getDayGan() || '甲';
    const dBranch = bazi.getDayZhi() || '子';
    const hStem = bazi.getTimeGan() || '甲';
    const hBranch = bazi.getTimeZhi() || '子';
    
    let counts = { '목': 0, '화': 0, '토': 0, '금': 0, '수': 0 };
    [yStem, mStem, dStem, hStem].forEach(s => {
        const el = stemElements[s].substring(0, 1);
        counts[el] = (counts[el] || 0) + 1;
    });
    [yBranch, mBranch, dBranch, hBranch].forEach(b => {
        const el = branchElements[b].substring(0, 1);
        counts[el] = (counts[el] || 0) + 1;
    });
    
    const layoutHtml = `
        <div class="saju-grid">
            <div class="saju-pillar">
                <div class="saju-pillar-title">년(年)</div>
                <div class="saju-pillar-chars">${yStem}<br>${yBranch}</div>
                <div class="saju-pillar-elements">${stemElements[yStem]}<br>${branchElements[yBranch]}</div>
            </div>
            <div class="saju-pillar">
                <div class="saju-pillar-title">월(月)</div>
                <div class="saju-pillar-chars">${mStem}<br>${mBranch}</div>
                <div class="saju-pillar-elements">${stemElements[mStem]}<br>${branchElements[mBranch]}</div>
            </div>
            <div class="saju-pillar day-pillar">
                <div class="saju-pillar-title">일(日)</div>
                <div class="saju-pillar-chars">${dStem}<br>${dBranch}</div>
                <div class="saju-pillar-elements">${stemElements[dStem]}<br>${branchElements[dBranch]}</div>
            </div>
            <div class="saju-pillar">
                <div class="saju-pillar-title">시(時)</div>
                <div class="saju-pillar-chars">${hStem}<br>${hBranch}</div>
                <div class="saju-pillar-elements">${stemElements[hStem]}<br>${branchElements[hBranch]}</div>
            </div>
        </div>
    `;

    return {
        layoutHtml: layoutHtml,
        counts: counts,
        baziString: `${yStem}${yBranch}년 ${mStem}${mBranch}월 ${dStem}${dBranch}일 ${hStem}${hBranch}시`
    };
}

function initSaju(offset = 0) {
    // 확인 버튼이나 이전/다음으로 호출될 때는 항상 내용을 표시
    window.isSajuBaseInfoVisible = true;
    const toggleBtn = document.getElementById('saju-toggle-btn');
    if (toggleBtn) toggleBtn.classList.add('open');
    calculateSaju(offset);
}

async function calculateSaju(passedOffset) {
    if (window.isSajuBaseInfoVisible === undefined) {
        window.isSajuBaseInfoVisible = false;
    }
    
    if (passedOffset === undefined) {
        window.isSajuBaseInfoVisible = !window.isSajuBaseInfoVisible;
        const toggleBtn = document.getElementById('saju-toggle-btn');
        if (toggleBtn) {
            if (window.isSajuBaseInfoVisible) toggleBtn.classList.add('open');
            else toggleBtn.classList.remove('open');
        }
        const baseInfo = document.getElementById('saju-base-info');
        if (baseInfo) {
            baseInfo.style.display = window.isSajuBaseInfoVisible ? 'block' : 'none';
        }
        return;
    }

    let offset = offsets.saju;
    if (typeof passedOffset === 'number') {
        offset = passedOffset;
    }
    
    const container = document.getElementById('saju-content');
    const now = new Date();
    now.setDate(now.getDate() + offset);
    
    // Update date UI
    const dateEl = document.getElementById('saju-date');
    if (dateEl) {
        dateEl.textContent = offset === 0 ? '오늘' : (offset > 0 ? `+${offset}일` : `${offset}일`);
    }
    // Get user input
    const year = parseInt(document.getElementById('saju-year')?.value || 1970);
    const month = parseInt(document.getElementById('saju-month')?.value || 1);
    const day = parseInt(document.getElementById('saju-day')?.value || 30);
    const hour = parseInt(document.getElementById('saju-hour')?.value || 6);
    const calendarType = document.getElementById('saju-calendar')?.value || 'solar';
    const gender = document.getElementById('saju-gender')?.value || 'M';
    
    const sajuData = getFiveElements(year, month, day, hour, calendarType);
    const todaySaju = getFiveElements(now.getFullYear(), now.getMonth()+1, now.getDate(), 12, 'solar');
    
    const yearStr = now.getFullYear();
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const dayStr = String(now.getDate()).padStart(2, '0');
    const dateFormatted = `${yearStr}년 ${monthStr}월 ${dayStr}일`;
    const offsetStr = offset === 0 ? '(오늘)' : (offset > 0 ? '(+' + offset + '일)' : '(' + offset + '일)');

    let baseHtml = `
        <div id="saju-base-info" class="saju-section-box" style="display: ${window.isSajuBaseInfoVisible ? 'block' : 'none'};">
            <h4 class="saju-section-title">사주 오행 분포</h4>
            <div class="text-md text-bold" style="text-align: center; margin-bottom: 15px;">
                <strong>${year}년 ${month}월 ${day}일 ${hour}시 (${calendarType==='lunar'?'음':'양'}) (${gender === 'M' ? '남' : '여'})</strong>
            </div>
            ${sajuData.layoutHtml}
            <div class="saju-element-counts">
                <div class="saju-element-wood">목: ${sajuData.counts['목']}</div>
                <div class="saju-element-fire">화: ${sajuData.counts['화']}</div>
                <div class="saju-element-earth">토: ${sajuData.counts['토']}</div>
                <div class="saju-element-metal">금: ${sajuData.counts['금']}</div>
                <div class="saju-element-water">수: ${sajuData.counts['수']}</div>
            </div>
            
            <div style="padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div class="calendar-section-title">
                    <h5 class="saju-section-title text-sm">🤖 오행 정밀 분석</h5>
                    <div style="display: flex; gap: 4px;">
                        <button class="tts-btn tts-speed-btn" onclick="changeTTSSpeed()" title="속도 조절" style="width: auto; padding: 0 6px; font-size: 0.7rem; border-radius: var(--r-sm);">${window.ttsRate ? window.ttsRate.toFixed(2) : '1.00'}x</button>
                        <button class="tts-btn" onclick="toggleTTS('saju_analysis')" id="tts-btn-saju_analysis" title="읽기/정지">🔊</button>
                        <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-saju_analysis" title="일시정지/재개" style="display: none;">⏸️</button>
                    </div>
                </div>
                <div id="saju_analysis_text">
                    <div style="text-align: center; padding: 15px; color: var(--text-secondary); font-size: 0.9rem;">AI가 오행을 분석 중입니다...</div>
                </div>
            </div>
        </div>
        
        <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-bottom: 20px; padding: 10px; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1);">
            <button class="nav-btn" onclick="changeOffset('saju', -1)" title="이전">&#10094;</button>
            <span class="nav-date" style="font-weight: bold; min-width: 150px; text-align: center;">${dateFormatted} ${offsetStr}</span>
            <button class="nav-btn" onclick="changeOffset('saju', 1)" title="다음">&#10095;</button>
        </div>
        
        <div class="saju-section-box" style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4 class="text-md text-bold text-accent" style="margin: 0;">오늘의 일진 오행</h4>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 0.9rem; color: var(--text-secondary);">시간: </span>
                    <input type="number" id="today-saju-hour" value="${now.getHours()}" min="0" max="23" class="saju-input" onchange="updateTodaySaju(${offset})">
                </div>
            </div>
            <div id="today-saju-container">
                ${todaySaju.layoutHtml}
                <div class="saju-element-counts">
                    <div class="saju-element-wood">목: ${todaySaju.counts['목']}</div>
                    <div class="saju-element-fire">화: ${todaySaju.counts['화']}</div>
                    <div class="saju-element-earth">토: ${todaySaju.counts['토']}</div>
                    <div class="saju-element-metal">금: ${todaySaju.counts['금']}</div>
                    <div class="saju-element-water">수: ${todaySaju.counts['수']}</div>
                </div>
            </div>
        </div>

        <div style="padding: 10px 0; margin-bottom: 10px;" id="saju-fortune-container">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4 class="text-md text-bold" style="margin: 0;"><span class="tts-ignore">☯️</span> 사주와 오늘의 기운 교류</h4>
                <div style="display: flex; gap: 4px;">
                    <button class="tts-btn tts-speed-btn" onclick="changeTTSSpeed()" title="속도 조절" style="width: auto; padding: 0 6px; font-size: 0.7rem; border-radius: var(--r-sm);">${window.ttsRate ? window.ttsRate.toFixed(2) : '1.00'}x</button>
                    <button class="tts-btn" onclick="toggleTTS('saju_fortune')" id="tts-btn-saju_fortune" title="읽기/정지">🔊</button>
                    <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-saju_fortune" title="일시정지/재개" style="display: none;">⏸️</button>
                </div>
            </div>
            <div id="saju_fortune_text">
                <div style="text-align: center; padding: 20px; color: var(--text-secondary);">AI가 오늘의 운세를 분석 중입니다... 잠시만 기다려주세요.</div>
            </div>
        </div>
    `;
    
    container.innerHTML = baseHtml;

    try {
        const ohangParam = `목:${sajuData.counts['목']},화:${sajuData.counts['화']},토:${sajuData.counts['토']},금:${sajuData.counts['금']},수:${sajuData.counts['수']}`;
        const todayOhangParam = `목:${todaySaju.counts['목']},화:${todaySaju.counts['화']},토:${todaySaju.counts['토']},금:${todaySaju.counts['금']},수:${todaySaju.counts['수']}`;
        const queryParams = new URLSearchParams({
            bazi: sajuData.baziString,
            ohang: ohangParam,
            todayBazi: todaySaju.baziString || '',
            todayOhang: todayOhangParam
        });
        const response = await fetch(`/api/saju?${queryParams.toString()}`);
        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || '운세 데이터를 가져오는데 실패했습니다.');
        }
        const data = await response.json();
        
        const fortuneHtml = `
            <h5 class="text-md text-bold text-accent" style="margin: 0 0 5px 0;"><span class="tts-ignore">🌟</span> 총운</h5>
            <p class="text-body" style="margin-bottom: 15px;">${data.total || '정보 없음'}</p>
            
            <h5 class="text-md text-bold saju-element-earth" style="margin: 0 0 5px 0;"><span class="tts-ignore">💰</span> 재물운</h5>
            <p class="text-body" style="margin-bottom: 15px;">${data.wealth || '정보 없음'}</p>

            <h5 class="text-md text-bold saju-element-fire" style="margin: 0 0 5px 0;"><span class="tts-ignore">💕</span> 애정운</h5>
            <p class="text-body" style="margin-bottom: 15px;">${data.love || '정보 없음'}</p>
            
            <h5 class="text-md text-bold saju-element-water" style="margin: 0 0 5px 0;"><span class="tts-ignore">💼</span> 직장/학업운</h5>
            <p class="text-body" style="margin-bottom: 15px;">${data.career || '정보 없음'}</p>

            <h5 class="text-md text-bold saju-element-wood" style="margin: 0 0 5px 0;"><span class="tts-ignore">🌿</span> 건강운</h5>
            <p class="text-body" style="margin-bottom: 0;">${data.health || '정보 없음'}</p>
        `;
        document.getElementById('saju_fortune_text').innerHTML = fortuneHtml;

        // Update ohang analysis with AI data
        const analysisEl = document.getElementById('saju_analysis_text');
        if (analysisEl && (data.ohang_strength || data.ohang_advice)) {
            analysisEl.innerHTML = `
                <strong>[강점 요약]</strong><br>
                <span>${data.ohang_strength || ''}</span>
                <br><br>
                <strong>[보완점 및 조언]</strong><br>
                <span>${data.ohang_advice || ''}</span>
            `;
        }
    } catch (e) {
        console.error("Saju fetch error:", e);
        document.getElementById('saju_fortune_text').innerHTML = `
            <div style="color: var(--saju-fire); text-align: center; padding: 20px;">
                운세를 불러오지 못했습니다.<br>
                <small>${e.message}</small>
            </div>
        `;
    }
}

function updateTodaySaju(offset) {
    const now = new Date();
    now.setDate(now.getDate() + offset);
    const hour = parseInt(document.getElementById('today-saju-hour')?.value || now.getHours());
    const todaySaju = getFiveElements(now.getFullYear(), now.getMonth()+1, now.getDate(), hour, 'solar');
    const container = document.getElementById('today-saju-container');
    if (container) {
        container.innerHTML = `
            ${todaySaju.layoutHtml}
            <div class="saju-element-counts">
                <div class="saju-element-wood">목: ${todaySaju.counts['목']}</div>
                <div class="saju-element-fire">화: ${todaySaju.counts['화']}</div>
                <div class="saju-element-earth">토: ${todaySaju.counts['토']}</div>
                <div class="saju-element-metal">금: ${todaySaju.counts['금']}</div>
                <div class="saju-element-water">수: ${todaySaju.counts['수']}</div>
            </div>
        `;
    }
}

// --- 6. Today's Philosophy ---
function initPhilosophy(offset = 0) {
    const container = document.getElementById('philosophy-content');
    if (typeof philosophyData === 'undefined' || philosophyData.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary);">철학 데이터를 불러올 수 없습니다.</div>';
        return;
    }
    
    const now = new Date();
    now.setDate(now.getDate() + offset);
    
    // Populate select if empty
    const selectEl = document.getElementById('philosophy-select');
    if (selectEl && selectEl.options.length === 0) {
        philosophyData.forEach((item, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${i + 1}. ${item.title}`;
            selectEl.appendChild(opt);
        });
    }

    // 2026년 9월 18일을 시작점(1번, index 0)으로 설정하여 매일 1씩 증가
    const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const baseZero = new Date(2026, 8, 18); // 9월은 8
    const diffDays = Math.round((nowZero - baseZero) / (1000 * 60 * 60 * 24));
    let index = diffDays % philosophyData.length;
    if (index < 0) index += philosophyData.length;

    // Update UI label
    const dateEl = document.getElementById('philosophy-date');
    if (dateEl) {
        dateEl.textContent = index === 0 ? '오늘' : `${index + 1}번`;
    }

    if (selectEl) selectEl.value = index;
    const item = philosophyData[index];

    const chapterBadge = item.chapter
        ? `<div class="phil-chapter-badge tts-ignore">${item.chapter}</div>`
        : '';
    const sourceBadge = item.source
        ? `<div class="phil-source tts-ignore">📖 ${item.source}</div>`
        : '';

    container.innerHTML = `
        ${chapterBadge}
        <div class="text-lg text-bold text-accent" style="margin: 10px 0 14px;">${item.title}</div>
        <div class="philosophy-desc text-body">${item.content.replace(/\n/g, '<br>')}</div>
        ${sourceBadge}
    `;

    // 고정 섹션 (최초 1회만 렌더링)
    renderPhilosophyFixed();
}

function renderPhilosophyFixed() {
    if (document.getElementById('philosophy-fixed-section')) return; // 이미 있으면 skip
    if (typeof philosophyFixed === 'undefined') return;

    const section = document.querySelector('.philosophy-section');
    if (!section) return;

    const stepsHTML = philosophyFixed.steps.map(s =>
        `<li><span class="phil-step-change">${s.change}</span><span class="phil-step-desc"> — ${s.desc}</span></li>`
    ).join('');

    const bibHTML = philosophyFixed.bibliography.map(b =>
        `<li>${b}</li>`
    ).join('');

    const chaptersHTML = philosophyFixed.chapters.map(c => {
        const match = c.items.match(/^(\d+)/);
        const index = match ? parseInt(match[1], 10) - 1 : 0;
        return `<button class="phil-chapter-tag" onclick="showPhilChapterPreview(${index}, this)">${c.label} <em>${c.title}</em> <small>(${c.items})</small></button>`;
    }).join('');

    const fixedEl = document.createElement('div');
    fixedEl.id = 'philosophy-fixed-section';
    fixedEl.className = 'phil-fixed-wrap';
    fixedEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <button class="phil-fixed-toggle" onclick="togglePhilFixed()" id="phil-fixed-btn" style="flex: 1; margin: 0; text-align: left;">
                📚 들뢰즈 철학 전체 흐름 &amp; 문헌
                <span id="phil-fixed-chevron" style="float:right; margin-right: 8px;">▸</span>
            </button>
            <div style="display: flex; gap: 4px; margin-left: 8px;">
                <button class="tts-btn tts-speed-btn" onclick="changeTTSSpeed()" title="속도 조절" style="width: auto; padding: 0 6px; font-size: 0.7rem; border-radius: var(--r-sm);">${window.ttsRate ? window.ttsRate.toFixed(2) : '1.00'}x</button>
                <button class="tts-btn" onclick="toggleTTS('phil-fixed-body')" id="tts-btn-phil-fixed-body" title="읽기/정지">🔊</button>
                <button class="tts-btn" onclick="pauseTTS()" id="tts-pause-phil-fixed-body" title="일시정지/재개" style="display: none;">⏸️</button>
            </div>
        </div>
        <div id="phil-fixed-body" style="display:none;">
            <div class="phil-summary-box">
                <p>"${philosophyFixed.summary}"</p>
                <div class="phil-flow">${philosophyFixed.flow}</div>
            </div>
            <div class="phil-chapters-row">${chaptersHTML}</div>
            <div id="phil-chapter-preview" style="display:none; margin-bottom:16px; padding:15px; background:var(--bg-2); border-left:3px solid var(--accent); border-radius:4px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);"></div>
            <div class="phil-fixed-cols">
                <div class="phil-fixed-col">
                    <h4>이 100개를 이해하는 10단계</h4>
                    <ol class="phil-steps-list">${stepsHTML}</ol>
                </div>
                <div class="phil-fixed-col">
                    <h4>핵심 1차 문헌</h4>
                    <ul class="phil-bib-list">${bibHTML}</ul>
                </div>
            </div>
        </div>
    `;
    section.appendChild(fixedEl);
}

function togglePhilFixed() {
    const body = document.getElementById('phil-fixed-body');
    const chevron = document.getElementById('phil-fixed-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
}

window.showPhilChapterPreview = function(index, btnEl = null) {
    const previewEl = document.getElementById('phil-chapter-preview');
    if (!previewEl) return;
    
    if (btnEl) {
        if (btnEl.classList.contains('active')) {
            btnEl.classList.remove('active');
            previewEl.style.display = 'none';
            return;
        }
        document.querySelectorAll('.phil-chapter-tag').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }
    
    // Bounds check with wrap-around
    if (index < 0) index = philosophyData.length - 1;
    if (index >= philosophyData.length) index = 0;
    
    const item = philosophyData[index];
    if (item) {
        const prevIdx = (index - 1 + philosophyData.length) % philosophyData.length;
        const nextIdx = (index + 1) % philosophyData.length;
        
        previewEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <button onclick="showPhilChapterPreview(${prevIdx})" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-primary); cursor:pointer; font-size:0.9rem; padding:4px 10px; border-radius:4px; transition:background 0.2s;">◀</button>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">[${index + 1}번 항목 내용 미리보기]</div>
                <button onclick="showPhilChapterPreview(${nextIdx})" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-primary); cursor:pointer; font-size:0.9rem; padding:4px 10px; border-radius:4px; transition:background 0.2s;">▶</button>
            </div>
            <h4 style="margin: 0 0 8px 0; color: var(--accent-light); font-size: 1.05rem;">${item.title}</h4>
            <div class="text-body" style="font-size: 0.95rem; line-height: 1.6;">${item.content.replace(/\n/g, '<br>')}</div>
        `;
        previewEl.style.display = 'block';
    }
};

// --- 5. KOSPI & Stocks ---
async function initKospi(period = 'today') {
    const container = document.getElementById('kospi-container');
    try {
        const res = await fetch('/api/kospi');
        const data = await res.json();
        const info = data.datas[0];
        
        const price = info.closePrice;
        const priceRaw = info.closePriceRaw;
        const ratio = info.fluctuationsRatio;
        const change = info.compareToPreviousClosePrice;
        
        let colorClass = 'flat-color';
        let sign = '';
        let colorHex = '#888';
        if (ratio > 0) { colorClass = 'up-color'; sign = '▲'; colorHex = '#ff5252';}
        else if (ratio < 0) { colorClass = 'down-color'; sign = '▼'; colorHex = '#448aff';}
        
        container.innerHTML = `
            <div class="kospi-info">
                <div class="kospi-title">KOSPI</div>
                <div class="kospi-value-row" style="display:flex; align-items: baseline; margin-top:4px;">
                    <div class="kospi-value ${colorClass}">${price}</div>
                    <div class="kospi-change-info" style="margin-left: 12px; font-size: 0.95rem;" class="${colorClass}">
                        ${sign} ${Math.abs(change)} (${ratio > 0 ? '+' : ''}${ratio}%)
                    </div>
                </div>
            </div>
        `;
        
        
        
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="color:var(--text-secondary);">코스피 정보를 불러올 수 없습니다.</div>';
    }
}

async function initStocks(period = 'today') {
    const grid = document.getElementById('stocks-grid');
    const stocks = [
        { code: '005930', name: '삼성전자' },
        { code: '005935', name: '삼성전자(우)' },
        { code: '000660', name: 'SK하이닉스' },
        { code: '009150', name: '삼성전기' },
        { code: '069500', name: 'KODEX 200' },
        { code: '005380', name: '현대차' },
        { code: '012330', name: '현대모비스' },
        { code: '307950', name: '현대오토에버' }
    ];
    
    // Only rebuild DOM if grid is empty (first load)
    if (grid.children.length <= 1) {
        grid.innerHTML = '';
        for (const stock of stocks) {
            const card = document.createElement('div');
            card.className = 'stock-card';
            card.innerHTML = `
                <div class="stock-name">${stock.name}</div>
                <div class="stock-price" id="price-${stock.code}">-</div>
                <div class="stock-change" id="change-${stock.code}">-</div>
            `;
            grid.appendChild(card);
        }
    }
    
    for (const stock of stocks) {
        try {
            const res = await fetch(`/api/stock?code=${stock.code}`);
            const data = await res.json();
            const info = data.datas[0];
            
            const price = info.closePrice;
            const priceRaw = info.closePriceRaw;
            const ratio = info.fluctuationsRatio;
            const change = info.compareToPreviousClosePrice;
            
            let colorClass = 'flat-color';
            let sign = '';
            let colorHex = '#888';
            if (ratio > 0) { colorClass = 'up-color'; sign = '▲'; colorHex = '#ff5252'; }
            else if (ratio < 0) { colorClass = 'down-color'; sign = '▼'; colorHex = '#448aff'; }
            
            document.getElementById(`price-${stock.code}`).textContent = price;
            document.getElementById(`price-${stock.code}`).className = `stock-price ${colorClass}`;
            
            document.getElementById(`change-${stock.code}`).textContent = `${sign} ${Math.abs(change)} (${ratio > 0 ? '+' : ''}${ratio}%)`;
            document.getElementById(`change-${stock.code}`).className = `stock-change ${colorClass}`;
            
            
            
        } catch (e) {
            console.error(`Error fetching ${stock.name}:`, e);
        }
    }
}

async function drawHistoryChart(canvasId, code, period, currentPrice, colorHex) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    
    let points = [];
    
    if (period === 'today') {
        // Mock random walk for today
        let p = currentPrice * (1 - (Math.random() * 0.02 - 0.01));
        for (let i = 0; i < 19; i++) {
            points.push(p);
            p = p * (1 + (Math.random() * 0.01 - 0.005));
        }
        points.push(currentPrice); 
    } else {
        // Fetch history
        try {
            const res = await fetch(`/api/history?code=${code}&count=${period}`);
            const data = await res.json();
            points = data.history.map(item => item.close);
        } catch (e) {
            console.error(e);
            return;
        }
    }
    
    const ctx = document.getElementById(canvasId).getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: points.length}, (_, i) => i),
            datasets: [{
                data: points,
                borderColor: colorHex,
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false } // Removed min/max for auto-scaling
            },
            layout: { padding: { top: 5, bottom: 5 } },
            animation: { duration: 400 }
        }
    });
}

// --- Navigation ---
function changeOffset(type, direction) {
    if (type === 'philosophy') {
        const len = (typeof philosophyData !== 'undefined' && philosophyData.length) ? philosophyData.length : 100;
        offsets.philosophy = (offsets.philosophy + direction) % len;
        if (offsets.philosophy < 0) offsets.philosophy += len;
        initPhilosophy(offsets.philosophy);
    } else if (type === 'iching') {
        const len = (typeof ichingData !== 'undefined' && ichingData.length) ? ichingData.length : 64;
        offsets.iching = (offsets.iching + direction) % len;
        if (offsets.iching < 0) offsets.iching += len;
        initIChing(offsets.iching);
    } else if (type === 'saju') {
        offsets.saju += direction;
        initSaju(offsets.saju);
    }
}

function jumpToPhilosophy(index) {
    offsets.philosophy = parseInt(index);
    initPhilosophy(offsets.philosophy);
}

function jumpToIChing(index) {
    offsets.iching = parseInt(index);
    initIChing(offsets.iching);
}

// --- TTS 기능 ---
window.ttsRate = 1.0;

window.changeTTSSpeed = function() {
    const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
    let idx = rates.indexOf(window.ttsRate);
    window.ttsRate = rates[(idx + 1) % rates.length];
    
    const speedBtns = document.querySelectorAll('.tts-speed-btn');
    speedBtns.forEach(btn => {
        btn.textContent = window.ttsRate.toFixed(2) + 'x';
    });
};

let currentUtterance = null;
let currentPlayingSection = null;

window.toggleTTS = function(section) {
    if (!('speechSynthesis' in window)) {
        alert('이 브라우저는 TTS(텍스트 읽어주기) 기능을 지원하지 않습니다.');
        return;
    }

    const synth = window.speechSynthesis;
    const btn = document.getElementById(`tts-btn-${section}`);
    const pauseBtn = document.getElementById(`tts-pause-${section}`);
    
    // 이미 현재 섹션을 읽고 있다면 중지
    if (synth.speaking && currentPlayingSection === section) {
        synth.cancel();
        if (btn) {
            btn.textContent = '🔊';
            btn.classList.remove('playing');
        }
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
        return;
    }
    
    // 다른 섹션을 읽고 있다면 중지하고 초기화
    if (synth.speaking) {
        synth.cancel();
        if (currentPlayingSection) {
            const oldBtn = document.getElementById(`tts-btn-${currentPlayingSection}`);
            const oldPauseBtn = document.getElementById(`tts-pause-${currentPlayingSection}`);
            if (oldBtn) {
                oldBtn.textContent = '🔊';
                oldBtn.classList.remove('playing');
            }
            if (oldPauseBtn) oldPauseBtn.style.display = 'none';
        }
    }
    
    // 섹션별 텍스트 가져오기
    let textToRead = '';
    let contentEl = document.getElementById(section.startsWith('saju') ? 'saju-content' : `${section}-content`);
    if (!contentEl) contentEl = document.getElementById(section);
    
    if (contentEl) {
        const clone = contentEl.cloneNode(true);
        // 배지나 불필요한 라벨, 버튼, 네비게이션 날짜 제거
        const ignores = clone.querySelectorAll('.label-badge, .tts-ignore, button, select, input, .nav-date');
        ignores.forEach(b => b.remove());
        
        // 화면에 보이지 않는 요소(display:none)의 innerText를 제대로 가져오기 위해
        // 임시로 body에 보이게 추가한 뒤 텍스트를 추출합니다.
        clone.style.display = 'block';
        clone.style.position = 'absolute';
        clone.style.left = '-9999px';
        clone.style.visibility = 'hidden';
        document.body.appendChild(clone);
        
        textToRead = clone.innerText;
        
        document.body.removeChild(clone);
        
        if (section === 'saju_analysis') {
            const part1Start = textToRead.indexOf("오행 정밀 분석");
            const part1End = textToRead.indexOf("오늘의 일진 오행");
            
            if (part1Start !== -1 && part1End !== -1) {
                textToRead = textToRead.substring(part1Start, part1End);
            }
        } else if (section === 'saju_fortune') {
            const part2Start = textToRead.indexOf("사주와 오늘의 기운 교류");
            
            if (part2Start !== -1) {
                textToRead = textToRead.substring(part2Start);
            }
        }
        
        // 이모지 및 특수 기호 완벽 제거
        textToRead = textToRead.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
    }
    
    if (!textToRead.trim()) return;
    
    currentUtterance = new SpeechSynthesisUtterance(textToRead);
    currentUtterance.lang = 'ko-KR';
    currentUtterance.rate = window.ttsRate || 1.0;
    
    currentUtterance.onend = () => {
        if (btn) {
            btn.textContent = '🔊';
            btn.classList.remove('playing');
        }
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
    };
    
    currentUtterance.onerror = (e) => {
        console.error('TTS Error:', e);
        if (btn) {
            btn.textContent = '🔊';
            btn.classList.remove('playing');
        }
        if (pauseBtn) pauseBtn.style.display = 'none';
        currentPlayingSection = null;
    };
    
    if (btn) {
        btn.textContent = '⏹️';
        btn.classList.add('playing');
    }
    if (pauseBtn) {
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.textContent = '⏸️';
    }
    
    currentPlayingSection = section;
    synth.speak(currentUtterance);
};

window.pauseTTS = function() {
    const synth = window.speechSynthesis;
    if (synth.paused) {
        synth.resume();
        if (currentPlayingSection) {
            const pauseBtn = document.getElementById(`tts-pause-${currentPlayingSection}`);
            if (pauseBtn) pauseBtn.textContent = '⏸️';
        }
    } else if (synth.speaking) {
        synth.pause();
        if (currentPlayingSection) {
            const pauseBtn = document.getElementById(`tts-pause-${currentPlayingSection}`);
            if (pauseBtn) pauseBtn.textContent = '▶️';
        }
    }
};
