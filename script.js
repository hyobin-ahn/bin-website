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

async function fetchWeather(locKey, elementId, name) {
    const el = document.getElementById(elementId);
    try {
        const { lat, lon } = LOCATIONS[locKey];
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul`;
        const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;
        
        const [weatherRes, aqiRes] = await Promise.all([
            fetch(weatherUrl),
            fetch(aqiUrl)
        ]);
        
        if (!weatherRes.ok || !aqiRes.ok) throw new Error('Network response was not ok');
        
        const weatherData = await weatherRes.json();
        const aqiData = await aqiRes.json();
        
        const temp = weatherData.current_weather.temperature;
        const code = weatherData.current_weather.weathercode;
        const desc = WMO_CODES[code] || '알 수 없음';
        
        const maxTemp = weatherData.daily.temperature_2m_max[0];
        const minTemp = weatherData.daily.temperature_2m_min[0];
        
        const pm10 = aqiData.current.pm10;
        const pm25 = aqiData.current.pm2_5;
        
        const getAqiDesc = (val, isPm25) => {
            if (isPm25) {
                if (val <= 15) return '좋음';
                if (val <= 35) return '보통';
                if (val <= 75) return '나쁨';
                return '매우나쁨';
            } else {
                if (val <= 30) return '좋음';
                if (val <= 80) return '보통';
                if (val <= 150) return '나쁨';
                return '매우나쁨';
            }
        };
        const pm10Desc = getAqiDesc(pm10, false);
        const pm25Desc = getAqiDesc(pm25, true);
        
        el.innerHTML = `
            <strong>${name}</strong>: ${temp}°C (최저 ${minTemp}°C ~ 최고 ${maxTemp}°C), ${desc}
            <span style="font-size: 0.9em; margin-left: 12px; color: var(--text-secondary);">
                | 미세먼지: ${pm10Desc}(${Math.round(pm10)})
                | 초미세먼지: ${pm25Desc}(${Math.round(pm25)})
            </span>
        `;
    } catch (error) {
        console.error('Error fetching weather/AQI:', error);
        el.textContent = `${name}: 날씨/미세먼지 정보 불러오기 실패`;
    }
}

function initWeather() {
    fetchWeather('paju', 'weather-paju', '파주');
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
            
            errorHtml = `<div style="font-size: 0.8rem; color: #ff6b6b; margin-bottom: 5px;">⚠️ ical.js 오류: ${errorMessage} (기본 파서로 전환됨)</div>`;
            
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

        eventsListEl.innerHTML = errorHtml + `<div style="font-size: 0.9rem; color: var(--accent-color); margin-bottom: 12px; font-weight: 600;">🗓️ ${dateString} (예정된 일정)</div>`;
        
        if (displayEvents.length === 0) {
            eventsListEl.innerHTML += '<p class="no-events">예정된 일정이 없습니다.</p>';
            return;
        }
        
        displayEvents.forEach(evt => {
            const card = document.createElement('div');
            card.className = (evt.start >= todayEnd) ? 'future-event-card' : 'event-card';
            
            const title = document.createElement('div');
            title.className = 'event-title';
            title.textContent = evt.summary || '(제목 없음)';
            
            const time = document.createElement('div');
            time.className = 'event-time';
            
            const formatTime = (d) => {
                return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            };

            if (evt.isAllDay) {
                time.textContent = evt.start.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }) + ' (종일)';
            } else {
                time.textContent = `${formatTime(evt.start)} - ${evt.end ? formatTime(evt.end) : ''}`;
            }
            
            card.appendChild(title);
            card.appendChild(time);
            eventsListEl.appendChild(card);
        });
        
    } catch (error) {
        console.error('Calendar parse error:', error);
        eventsListEl.innerHTML = `<p class="loading" style="color: #ff6b6b; font-size: 0.9rem;">⚠️ 일정 불러오기 실패: ${error.message}</p>`;
    }
}

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

    // 1번(index 0)부터 시작
    let index = offset % ichingData.length;
    if (index < 0) index += ichingData.length;

    // Update UI label
    const dateEl = document.getElementById('iching-date');
    if (dateEl) {
        dateEl.textContent = index === 0 ? '오늘 (1번)' : `${index + 1}번 / ${ichingData.length}`;
    }
    
    if (selectEl) selectEl.value = index;
    
    const hexagram = ichingData[index];
    
    let html = `
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 1.4rem; color: var(--accent-color); font-weight: bold; margin-right: 8px;">${hexagram.id}.</span>
            <span style="font-size: 2.2rem; line-height: 1; color: var(--accent-color); margin-right: 8px; font-family: 'Segoe UI Symbol', 'Apple Symbols', sans-serif;">
                ${String.fromCodePoint(0x4DC0 + hexagram.id - 1)}
            </span>
            <span style="font-size: 1.4rem; color: var(--accent-color); font-weight: bold;">${hexagram.name_korean}(${hexagram.name_chinese})</span>
        </div>
        <div class="iching-text" style="font-size: 1.05rem; line-height: 1.6; color: var(--text-color);">
            ${hexagram.description ? `<p><span class="label-badge">설명</span> ${hexagram.description.replace(/\n/g, '<br>')}</p>` : ''}
            <div style="margin-top:15px; padding: 10px; background: rgba(255, 235, 59, 0.1); border-left: 3px solid #ffeb3b; border-radius: 4px;">
                <p style="color: #ffeb3b; margin-bottom: 5px;"><strong>卦辭</strong></p>
                <p style="margin-bottom: 8px;">${hexagram.gwaesa_chinese}</p>
                <p>${hexagram.gwaesa_korean}</p>
            </div>
            <div style="margin-top:15px; padding: 10px; background: rgba(255, 255, 255, 0.05); border-left: 3px solid var(--accent-color); border-radius: 4px;">
                <p style="color: var(--accent-color); margin-bottom: 10px;"><strong>爻辭</strong></p>
                ${hexagram.lines ? hexagram.lines.map(l => `<div style="margin-bottom:12px; font-size: 0.95rem;">
                    <span style="color:#fbc531; font-weight:bold;">[${l.name}]</span><br>
                    <span style="color:#dcdde1;">${l.text_chinese}</span><br>
                    <span>${l.text_korean}</span>
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
        <div style="display: flex; gap: 10px; text-align: center; margin-bottom: 15px; flex-wrap: wrap;">
            <div style="flex:1; min-width: 60px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom: 5px;">년(年)</div>
                <div style="font-size:1.1rem; font-weight:bold;">${yStem}<br>${yBranch}</div>
                <div style="font-size:0.75rem; color:#888; margin-top:4px;">${stemElements[yStem]}<br>${branchElements[yBranch]}</div>
            </div>
            <div style="flex:1; min-width: 60px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom: 5px;">월(月)</div>
                <div style="font-size:1.1rem; font-weight:bold;">${mStem}<br>${mBranch}</div>
                <div style="font-size:0.75rem; color:#888; margin-top:4px;">${stemElements[mStem]}<br>${branchElements[mBranch]}</div>
            </div>
            <div style="flex:1; min-width: 60px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border: 1px solid var(--accent-color);">
                <div style="font-size:0.8rem; color:var(--accent-color); margin-bottom: 5px;">일(日)</div>
                <div style="font-size:1.1rem; font-weight:bold; color:var(--accent-color);">${dStem}<br>${dBranch}</div>
                <div style="font-size:0.75rem; color:var(--accent-color); margin-top:4px; opacity: 0.8;">${stemElements[dStem]}<br>${branchElements[dBranch]}</div>
            </div>
            <div style="flex:1; min-width: 60px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom: 5px;">시(時)</div>
                <div style="font-size:1.1rem; font-weight:bold;">${hStem}<br>${hBranch}</div>
                <div style="font-size:0.75rem; color:#888; margin-top:4px;">${stemElements[hStem]}<br>${branchElements[hBranch]}</div>
            </div>
        </div>
    `;

    return {
        layoutHtml: layoutHtml,
        counts: counts
    };
}

function initSaju(offset = 0) {
    calculateSaju(offset);
}

function calculateSaju(passedOffset) {
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
    
    const seed = year + month + day + hour + (gender==='M'?1:2) + now.getDate();
    
    const fortunesTotal = [
        "천간과 지지가 상생하는 형국으로 음양의 조화가 아름답게 어우러지는 날입니다. 오랫동안 묵혀두었던 계획을 실행에 옮기기에 최적의 타이밍이며, 뜻밖의 귀인이 나타나 막혔던 문제를 시원하게 해결해 줄 수 있는 길운이 흐릅니다. 긍정적인 마음가짐이 곧 운을 끌어당기는 자석이 될 것입니다.",
        "비견과 겁재의 기운이 교차하여 주관과 고집이 강해지기 쉬운 날입니다. 독립적이고 진취적인 에너지가 넘치지만, 대인관계에서는 타인과의 사소한 의견 충돌이나 마찰이 발생할 수 있습니다. 오늘은 주장을 앞세우기보다 한 발 양보하고 경청하는 여유를 가질 때 오히려 더 큰 실리를 챙길 수 있습니다.",
        "인성(문서운)이 발복하여 학업이나 문서, 계약과 관련된 일에서 빛을 발하는 하루입니다. 깊은 사고력과 직관력이 살아나므로 중요한 결정이나 도장을 찍어야 하는 일에 유리합니다. 윗사람이나 선배의 조언 속에 당신의 운을 트이게 할 중요한 열쇠가 숨어 있으니 귀를 기울여 보십시오.",
        "관성의 기운이 강하게 작용하여 책임감과 중압감이 동시에 느껴지는 날입니다. 스스로를 통제하고 조직 내에서 능력을 인정받을 수 있는 기회이지만, 과도한 스트레스나 피로가 누적될 위험이 있습니다. 완벽주의를 잠시 내려놓고 적절한 휴식과 마음의 안정을 취하는 것이 내일을 위한 훌륭한 전략입니다.",
        "식상의 기운이 활발히 움직이며 내면의 창의력과 언변, 표현력이 최고조에 달하는 날입니다. 예술적 감각이 요구되는 기획, 창작, 프레젠테이션 등에서 두각을 나타내어 사람들의 이목을 사로잡을 수 있습니다. 머릿속의 아이디어를 과감하게 세상 밖으로 꺼내어 적극적으로 어필해 보시길 권합니다."
    ];
    
    const fortunesWealth = [
        "정재의 기운이 뚜렷하여 금전의 흐름이 매우 안정적이고 예측 가능합니다. 일확천금보다는 땀 흘려 노력한 만큼의 정직한 대가가 통장에 차곡차곡 쌓이는 흐름입니다. 철저한 계획 하에 이루어지는 소비와 저축은 향후 튼튼한 자산의 밑거름이 될 것입니다.",
        "편재운이 강하게 들어와 돈의 융통과 스케일이 커지는 시기입니다. 예상치 못한 뜻밖의 부수입, 보너스, 혹은 투자에서의 단기적인 성과를 기대해 볼 만합니다. 그러나 재물이 크게 들어오는 만큼 충동구매나 과시성 지출로 크게 빠져나갈 수 있으니 자금 관리에 각별히 유의해야 합니다.",
        "재성(재물운)의 기운이 일시적으로 위축되거나 숨어있는 형국입니다. 무리한 투자나 새로운 사업 확장, 금전 거래는 가급적 피하고 현재의 자산을 안전하게 지키는 수성(守城)의 지혜가 필요합니다. 오늘은 지갑을 열기보다 재정 상태를 꼼꼼히 점검하고 재정비하는 시간을 가지는 것이 이롭습니다.",
        "식신생재(食神生財)의 훌륭한 흐름이 형성되어, 나의 재능과 노력이 자연스럽게 재물로 연결되는 길한 하루입니다. 아이디어가 곧 돈이 되는 형국이니, 부업이나 새로운 수익 창출 방안을 모색하기에 아주 좋습니다. 부지런히 움직이는 만큼 금전 창고가 풍성해질 것입니다."
    ];
    
    const loveFortunes = [
        "애정운이 강하게 상승 곡선을 그리는 날입니다. 솔로라면 모임이나 우연한 자리에서 마음을 사로잡을 매력적인 인연을 만날 가능성이 높습니다. 커플은 서로의 감정이 깊어지고 로맨틱한 에너지가 충만하여, 평소 하지 못했던 진솔한 대화를 나누며 사랑을 견고히 다질 수 있습니다.",
        "감정의 기복이 심해지고 예민해져 연인이나 배우자에게 서운함을 느끼기 쉬운 하루입니다. 오해는 아주 사소한 말실수에서 비롯될 수 있으므로, 말을 내뱉기 전에 한 번 더 생각하는 지혜가 필요합니다. 상대방의 입장에서 이해하려 노력하면 위기가 오히려 신뢰를 쌓는 기회가 됩니다.",
        "잔잔하고 안정적인 애정의 기운이 흐르는 평화로운 날입니다. 자극적이고 화려한 데이트보다는 익숙한 공간에서의 편안하고 따뜻한 시간이 어울립니다. 서로의 일상을 공유하며 담백하게 마음을 주고받는 과정 속에서 소박하지만 진정한 사랑의 가치를 재확인하게 될 것입니다."
    ];
    
    const fortunesCareer = [
        "관운(직장운)이 밝게 빛나며 당신의 리더십과 업무 능력이 상사나 동료들에게 깊은 인상을 남깁니다. 승진, 이직, 중요한 프로젝트 발탁 등 긍정적인 소식을 기대해도 좋습니다. 자신감을 가지고 당당하게 앞으로 나서면 기대 이상의 훌륭한 성과를 거머쥘 수 있습니다.",
        "식상운의 영향으로 직장 내에서 창의적이고 획기적인 아이디어가 샘솟습니다. 틀에 박힌 방식에서 벗어나 새로운 해결책을 제시하여 능력을 인정받는 하루입니다. 다만, 상사나 규율과 부딪힐 수 있는 반항심도 함께 커질 수 있으니 부드러운 화술로 의견을 포장하는 것이 중요합니다.",
        "인성운이 강해져 배움과 자격증 취득, 학업에 매우 유리한 시기입니다. 꼼꼼한 문서 검토나 연구 개발 분야에서 탁월한 집중력을 발휘합니다. 실무에 쫓기기보다는 업무의 내실을 다지고 미래를 위한 역량을 한 단계 업그레이드하기에 완벽한 하루입니다."
    ];
    
    const fortunesHealth = [
        "생기(生氣)가 가득하여 몸과 마음의 컨디션이 최상입니다. 활력이 넘치니 밀린 업무나 운동을 소화하기에 무리가 없습니다. 이 좋은 에너지를 유지하기 위해 가벼운 스트레칭이나 규칙적인 유산소 운동으로 땀을 배출하면 건강의 선순환이 이루어집니다.",
        "사주의 기운이 다소 정체되어 피로감이나 무기력증을 느끼기 쉬운 하루입니다. 특히 소화기 계통이나 신경성 스트레스에 취약할 수 있으니 자극적인 음식은 피하고 속을 편안하게 해주는 따뜻한 차를 가까이 하세요. 무리한 일정보다는 충분한 수면이 최고의 보약입니다.",
        "음양오행의 불균형으로 인해 면역력이 일시적으로 떨어질 수 있는 시기입니다. 갑작스러운 온도 변화나 무리한 야외 활동에 주의가 필요합니다. 반신욕이나 가벼운 명상으로 심신의 긴장을 풀고, 비타민이 풍부한 제철 과일로 몸속 깊은 곳의 에너지를 충전하시길 바랍니다."
    ];
    
    const yearStr = now.getFullYear();
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const dayStr = String(now.getDate()).padStart(2, '0');
    const dateFormatted = `${yearStr}년 ${monthStr}월 ${dayStr}일`;
    const offsetStr = offset === 0 ? '(오늘)' : (offset > 0 ? '(+' + offset + '일)' : '(' + offset + '일)');

    let html = `
        <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="color: var(--accent-color); margin-top: 0; margin-bottom: 15px;">사주 오행 분포</h4>
            <div style="font-size: 0.95rem; color: var(--text-color); margin-bottom: 15px; text-align: center;">
                <strong>${year}년 ${month}월 ${day}일 ${hour}시 (${calendarType==='lunar'?'음':'양'}) (${gender === 'M' ? '남' : '여'})</strong>
            </div>
            ${sajuData.layoutHtml}
            <div style="display: flex; gap: 15px; justify-content: center; font-size: 0.95rem; margin-top: 10px; margin-bottom: 15px;">
                <div style="color: #4cd137;">목: ${sajuData.counts['목']}</div>
                <div style="color: #e84118;">화: ${sajuData.counts['화']}</div>
                <div style="color: #e1b12c;">토: ${sajuData.counts['토']}</div>
                <div style="color: #dcdde1;">금: ${sajuData.counts['금']}</div>
                <div style="color: #00a8ff;">수: ${sajuData.counts['수']}</div>
            </div>
            
            <div style="padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                <h5 style="color: var(--text-color); margin: 0 0 10px 0; font-size: 0.95rem;">🤖 오행 정밀 분석</h5>
                <p style="color: var(--text-secondary); line-height: 1.7; font-size: 0.9rem; margin: 0;">
                    ${(function() {
                        let dominantElement = '';
                        let weakElement = '';
                        let maxCount = -1;
                        let minCount = 99;
                        for (const [el, count] of Object.entries(sajuData.counts)) {
                            if (count > maxCount) {
                                maxCount = count;
                                dominantElement = el;
                            }
                            if (count < minCount) {
                                minCount = count;
                                weakElement = el;
                            }
                        }
                        const elementExpl = {
                            '목': '성장과 의욕, 창의성, 기획력',
                            '화': '열정과 명예, 표현력, 확산',
                            '토': '안정과 신용, 포용력, 중재',
                            '금': '결단력과 원칙, 결실, 분석',
                            '수': '지혜와 유연성, 수용력, 유동성'
                        };
                        const dominantTraits = {
                            '목': '본 사주는 목(木) 기운이 중심을 이루어 끊임없는 성장 욕구와 도전 의식을 가지고 있습니다. 하늘을 향해 곧게 뻗어 나가는 나무처럼 진취적이고 창의적인 기획력이 매우 뛰어나며, 무에서 유를 창조하는 능력이 탁월합니다. 시작하는 힘이 강해 리더나 기획자로서 큰 역량을 발휘할 수 있습니다.',
                            '화': '본 사주는 화(火) 기운이 중심을 이루어 감정 표현이 매우 풍부하고 열정적입니다. 어둠을 밝히는 태양이나 불꽃처럼 주변을 환하게 만드는 리더십과 카리스마가 돋보입니다. 예술적 감각이나 언변이 뛰어나며 자기 자신을 표현하는 분야에서 큰 성과를 거둘 수 있는 강력한 확산의 에너지를 지녔습니다.',
                            '토': '본 사주는 토(土) 기운이 중심을 이루어 성향이 신중하고 포용력이 넓습니다. 만물을 길러내는 대지처럼 사람들에게 깊은 믿음을 주며, 어떠한 상황에서도 쉽게 흔들리지 않는 굳건함과 안정감을 추구합니다. 치우치지 않는 균형 감각이 뛰어나 조직 내에서 갈등을 중재하고 화합을 이끌어내는 능력이 탁월합니다.',
                            '금': '본 사주는 금(金) 기운이 중심을 이루어 옳고 그름을 가려내는 판단력과 원칙이 명확합니다. 잘 제련된 금속처럼 한 번 결정한 일은 끝까지 밀어붙여 결실을 맺는 뚝심이 있습니다. 맺고 끊음이 확실하고 고도의 집중력과 치밀함을 바탕으로 전문적인 분야에서 큰 두각을 나타냅니다.',
                            '수': '본 사주는 수(水) 기운이 중심을 이루어 상황 판단이 매우 빠르고 환경 변화에 대한 적응력이 탁월합니다. 그릇에 따라 형태를 바꾸는 물처럼 유연하고 수용성이 넓으며, 깊고 차분한 사고력과 뛰어난 지혜를 갖추고 있습니다. 겉으로는 조용해 보여도 내면에는 직관적이고 철학적인 통찰력을 품고 있습니다.'
                        };
                        const weakAdvice = {
                            '목': '반면, 추진의 씨앗인 목(木) 기운이 부족하여 시작하는 힘이나 초기 의욕이 다소 약할 수 있습니다. 아이디어는 있으나 실천으로 옮기는 데 주저할 수 있으니, 아주 작은 목표부터 세워 성취감을 맛보고 꾸준히 실천하는 습관을 기르는 것이 좋습니다. 식물을 가꾸거나 숲을 산책하며 생기를 보충하는 것도 큰 도움이 됩니다.',
                            '화': '한편, 확산과 표현의 화(火) 기운이 부족하여 감정을 밖으로 드러내는 데 서툴거나 폭발적인 추진력이 떨어질 수 있습니다. 마음속의 열정을 표출할 수 있는 동적인 취미를 가지고 적극적으로 의견을 내는 연습이 필요합니다. 밝은 햇볕을 자주 쬐며 긍정적인 확신의 에너지를 채워보세요.',
                            '토': '아울러, 중심을 잡아주는 토(土) 기운이 약해 심리적인 안정감이 흔들리거나 한 곳에 정착하는 데 시간이 걸릴 수 있습니다. 현실적인 감각과 끈기를 기르기 위해 규칙적인 생활 습관을 유지하고, 타인과의 신뢰를 쌓는 관계 맺기에 신경 써 보세요. 흙을 밟는 맨발 걷기나 등산을 추천합니다.',
                            '금': '또한, 수렴과 결실의 금(金) 기운이 부족하여 결단력이 약하거나 마무리가 다소 흐지부지될 수 있습니다. 온정주의에 이끌려 맺고 끊음을 명확히 하지 못할 수 있으므로, 스스로 분명한 원칙과 기준을 세우고 이를 단호하게 지켜나가는 훈련과 계획을 완수하는 연습이 필요합니다.',
                            '수': '한편, 유연성과 지혜의 수(水) 기운이 약해 삶의 융통성이 부족하거나 스트레스를 풀지 못해 조급해지기 쉽습니다. 생각의 유연성이 떨어져 한 가지에 갇힐 수 있으니, 명상이나 독서 등을 통해 마음의 여유와 깊이를 다지는 시간이 꼭 필요합니다. 충분한 수분 섭취와 물가 산책으로 내면의 흐름을 원활히 해보세요.'
                        };
                        
                        let text = `<strong>[강점 요약]</strong><br>${dominantTraits[dominantElement]}<br><br>`;
                        
                        if (minCount === 0) {
                            text += `<strong>[보완점 및 조언]</strong><br>${weakAdvice[weakElement]} (비어 있는 기운 보완)`;
                        } else {
                            text += `<strong>[보완점 및 조언]</strong><br>${weakAdvice[weakElement]} (상대적으로 약한 기운 보완)`;
                        }
                        return text;
                    })()}
                </p>
            </div>
        </div>
        
        <div style="padding: 10px 0; margin-bottom: 10px;">
            <h4 style="color: var(--text-color); margin-bottom: 15px;">☯️ 사주와 오늘의 기운 교류</h4>
            
            <h5 style="color: var(--accent-color); margin: 0 0 5px 0;">🌟 총운</h5>
            <p style="line-height: 1.6; color: var(--text-secondary); margin-bottom: 15px; font-size: 0.95rem;">
                ${fortunesTotal[seed % fortunesTotal.length]}
            </p>
            
            <h5 style="color: #e1b12c; margin: 0 0 5px 0;">💰 재물운</h5>
            <p style="line-height: 1.6; color: var(--text-secondary); margin-bottom: 15px; font-size: 0.95rem;">
                ${fortunesWealth[seed % fortunesWealth.length]}
            </p>

            <h5 style="color: #e84118; margin: 0 0 5px 0;">💕 애정운</h5>
            <p style="line-height: 1.6; color: var(--text-secondary); margin-bottom: 15px; font-size: 0.95rem;">
                ${loveFortunes[seed % loveFortunes.length]}
            </p>
            
            <h5 style="color: #00a8ff; margin: 0 0 5px 0;">💼 직장/학업운</h5>
            <p style="line-height: 1.6; color: var(--text-secondary); margin-bottom: 15px; font-size: 0.95rem;">
                ${fortunesCareer[seed % fortunesCareer.length]}
            </p>

            <h5 style="color: #4cd137; margin: 0 0 5px 0;">🌿 건강운</h5>
            <p style="line-height: 1.6; color: var(--text-secondary); margin-bottom: 0; font-size: 0.95rem;">
                ${fortunesHealth[seed % fortunesHealth.length]}
            </p>
        </div>

        <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4 style="color: var(--accent-color); margin: 0;">오늘의 일진 오행</h4>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 0.9rem; color: var(--text-secondary);">시간: </span>
                    <input type="number" id="today-saju-hour" value="${now.getHours()}" min="0" max="23" style="width: 50px; padding: 4px; background: transparent; border: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px;" onchange="updateTodaySaju(${offset})">
                </div>
            </div>
            <div id="today-saju-container">
                ${todaySaju.layoutHtml}
                <div style="display: flex; gap: 15px; justify-content: center; font-size: 0.95rem; margin-top: 10px;">
                    <div style="color: #4cd137;">목: ${todaySaju.counts['목']}</div>
                    <div style="color: #e84118;">화: ${todaySaju.counts['화']}</div>
                    <div style="color: #e1b12c;">토: ${todaySaju.counts['토']}</div>
                    <div style="color: #dcdde1;">금: ${todaySaju.counts['금']}</div>
                    <div style="color: #00a8ff;">수: ${todaySaju.counts['수']}</div>
                </div>
            </div>
        </div>
        
        <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-bottom: 20px; padding: 10px; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1);">
            <button class="nav-btn" onclick="changeOffset('saju', -1)" title="이전">&#10094;</button>
            <span class="nav-date" style="font-weight: bold; min-width: 150px; text-align: center;">${dateFormatted} ${offsetStr}</span>
            <button class="nav-btn" onclick="changeOffset('saju', 1)" title="다음">&#10095;</button>
        </div>
    `;
    
    container.innerHTML = html;
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
            <div style="display: flex; gap: 15px; justify-content: center; font-size: 0.95rem; margin-top: 10px;">
                <div style="color: #4cd137;">목: ${todaySaju.counts['목']}</div>
                <div style="color: #e84118;">화: ${todaySaju.counts['화']}</div>
                <div style="color: #e1b12c;">토: ${todaySaju.counts['토']}</div>
                <div style="color: #dcdde1;">금: ${todaySaju.counts['금']}</div>
                <div style="color: #00a8ff;">수: ${todaySaju.counts['수']}</div>
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
            opt.textContent = `${i + 1}. ${item.title.split('(')[0].trim()}`;
            selectEl.appendChild(opt);
        });
    }

    // 1번(index 0)부터 시작
    let index = offset % philosophyData.length;
    if (index < 0) index += philosophyData.length;

    // Update UI label
    const dateEl = document.getElementById('philosophy-date');
    if (dateEl) {
        dateEl.textContent = index === 0 ? '오늘 (1번)' : `${index + 1}번 / ${philosophyData.length}`;
    }

    if (selectEl) selectEl.value = index;
    const item = philosophyData[index];
    
    container.innerHTML = `
        <div style="font-weight: 600; color: #fff; margin-bottom: 15px; font-size: 1.25rem; color: var(--accent-color);">${index + 1}. ${item.title}</div>
        <div class="philosophy-desc" style="line-height: 1.7; font-size: 1.05rem;">${item.content.replace(/\n/g, '<br>')}</div>
    `;
}


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
                <div class="kospi-title">KOSPI 종합주가지수</div>
                <div style="display:flex; align-items: baseline; margin-top:4px;">
                    <div class="kospi-value ${colorClass}">${price}</div>
                    <div style="margin-left: 12px; font-size: 0.95rem;" class="${colorClass}">
                        ${sign} ${Math.abs(change)} (${ratio > 0 ? '+' : ''}${ratio}%)
                    </div>
                </div>
            </div>
            <div class="kospi-chart-container">
                <canvas id="chart-KOSPI"></canvas>
            </div>
        `;
        
        drawHistoryChart('chart-KOSPI', 'KOSPI', period, priceRaw, colorHex);
        
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
                <div class="stock-chart-container">
                    <canvas id="chart-${stock.code}"></canvas>
                </div>
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
            
            drawHistoryChart(`chart-${stock.code}`, stock.code, period, priceRaw, colorHex);
            
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
    const contentEl = document.getElementById(`${section}-content`);
    
    if (contentEl) {
        const clone = contentEl.cloneNode(true);
        // 배지나 불필요한 라벨은 TTS가 읽지 않도록 DOM 클론에서 제거
        const badges = clone.querySelectorAll('.label-badge');
        badges.forEach(b => b.remove());
        
        // innerText를 사용하면 화면에 보이는 텍스트를 자연스럽게 줄바꿈하여 가져옵니다.
        textToRead = clone.innerText;
        
        if (section === 'saju') {
            const startIdx = textToRead.indexOf("오행 정밀 분석");
            if (startIdx !== -1) {
                textToRead = textToRead.substring(startIdx);
            }
            
            const endIdx = textToRead.indexOf("오늘의 일진 오행");
            if (endIdx !== -1) {
                textToRead = textToRead.substring(0, endIdx);
            }
        }
    }
    
    if (!textToRead.trim()) return;
    
    currentUtterance = new SpeechSynthesisUtterance(textToRead);
    currentUtterance.lang = 'ko-KR';
    currentUtterance.rate = 1.0;
    
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
