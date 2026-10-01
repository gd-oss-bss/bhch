const HUB_ANSWER = 'лена';
const EVENTS_KEY = 'buhlo_events_data';
const BIRTHDAYS_KEY = 'buhlo_birthdays_data';
const REGISTRATIONS_KEY = 'buhlo_registrations';


const ENCRYPTED_ADMIN_PASSWORD = 'Oy_hy}hyq|tj\u0003';

const DEFAULT_EVENTS = [
    {
        id: 2,
        title: 'Глобальный выезд на Нёман',
        date: '2026-07-17',
        time: '09:00',
        location: 'р. Неман',
        description: 'Ежегодный эпический выезд: лодки, палатки, казаны, хорошее настроение',
        participants: [],
        maxParticipants: 30
    }
];

let appEvents = [];
let countdownInterval;
let targetDateString = '';
let isAuthenticated = false; // in-memory auth flag (session only)
let appBirthdays = [];

function simpleDecrypt(encrypted) {
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(encrypted.charCodeAt(i) ^ 7);
    }
    return decrypted;
}

function checkAuth() {
    const val = document.getElementById('auth-input').value.trim().toLowerCase();
    if (val === HUB_ANSWER.toLowerCase()) {
        isAuthenticated = true; // store only in memory, not in cookies or localStorage
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('auth-input').value = '';
        initPage();
    } else {
        document.getElementById('auth-error').style.display = 'block';
        document.getElementById('auth-input').value = '';
    }
}

function goToAdmin() {
    window.location.href = 'pages/admin.html';
}

window.onload = function() {
    // Session-only authentication: if user closes/refreshes, they need to re-auth
    if (!isAuthenticated) {
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('main-content').style.display = 'none';
    }
    const today = new Date().toISOString().split('T')[0];
    const destinationDateInput = document.getElementById('destination-date');
    if (destinationDateInput) destinationDateInput.min = today;
    initPage();
};

window.onbeforeunload = function() {
    // Clear auth on page unload to prevent auto-login
    isAuthenticated = false;
};

function initPage() {
    let savedDate = localStorage.getItem('buhlo_target_date');
    if (!savedDate) {
        const now = new Date();
        let currentYear = now.getFullYear();
        let defaultTarget = new Date(`${currentYear}-07-17T00:00:00`);
        if (now > defaultTarget) {
            defaultTarget = new Date(`${currentYear}-07-17T00:00:00`);
        }
        savedDate = defaultTarget.toISOString().split('T')[0];
    }

    const destinationDateInput = document.getElementById('destination-date');
    if (destinationDateInput) {
        destinationDateInput.value = savedDate;
    }

    targetDateString = savedDate + 'T00:00:00';
    startTimer();
    calculateAlcohol();
    loadEvents();
    loadBirthdays();
}

function updateCustomDate(val) {
    if (!val) return;
    localStorage.setItem('buhlo_target_date', val);
    targetDateString = val + 'T00:00:00';
    startTimer();
}

function startTimer() {
    if (countdownInterval) clearInterval(countdownInterval);

    function tick() {
        const target = new Date(targetDateString).getTime();
        const now = new Date().getTime();
        const difference = target - now;

        if (difference <= 0) {
            document.getElementById('days').innerText = '00';
            document.getElementById('hours').innerText = '00';
            document.getElementById('minutes').innerText = '00';
            document.getElementById('seconds').innerText = '00';
            clearInterval(countdownInterval);
            return;
        }

        const d = Math.floor(difference / (1000 * 60 * 60 * 24));
        const h = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((difference % (1000 * 60)) / 1000);

        document.getElementById('days').innerText = d < 10 ? '0' + d : d;
        document.getElementById('hours').innerText = h < 10 ? '0' + h : h;
        document.getElementById('minutes').innerText = m < 10 ? '0' + m : m;
        document.getElementById('seconds').innerText = s < 10 ? '0' + s : s;
    }

    tick();
    countdownInterval = setInterval(tick, 1000);
}

function calculateAlcohol() {
    const people = parseInt(document.getElementById('calc-people').value) || 0;
    const days = parseInt(document.getElementById('calc-days').value) || 0;
    const intensity = document.getElementById('calc-intensity').value;

    let coeffHard = 0.25;
    let coeffLight = 0.35;
    let coeffBeer = 0.7;
    let coeffWater = 1.5;

    if (intensity === 'light') {
        coeffHard = 0.15; coeffLight = 0.25; coeffBeer = 0.4; coeffWater = 1.0;
    } else if (intensity === 'hard') {
        coeffHard = 0.45; coeffLight = 0.4; coeffBeer = 1.2; coeffWater = 2.5;
    }

    const totalHard = (people * coeffHard * days).toFixed(1);
    const totalLight = (people * coeffLight * days).toFixed(1);
    const totalBeer = (people * coeffBeer * days).toFixed(1);
    const totalWater = (people * coeffWater * days).toFixed(1);
    const totalCoal = Math.ceil((people * days) / 5);

    document.getElementById('res-hard').innerText = totalHard + ' л';
    document.getElementById('res-light').innerText = totalLight + ' л';
    document.getElementById('res-beer').innerText = totalBeer + ' л';
    document.getElementById('res-water').innerText = totalWater + ' л';
    document.getElementById('res-coal').innerText = totalCoal + ' шт';
}

function getSavedEvents() {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) {
        localStorage.setItem(EVENTS_KEY, JSON.stringify(DEFAULT_EVENTS));
        return DEFAULT_EVENTS;
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : parsed.events || DEFAULT_EVENTS;
    } catch (error) {
        return DEFAULT_EVENTS;
    }
}

async function loadEvents() {
    appEvents = getSavedEvents();

    try {
        const response = await fetch('data/events.json');
        if (response.ok) {
            const json = await response.json();
            if (json && Array.isArray(json.events)) {
                appEvents = json.events;
                localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
            }
        }
    } catch (error) {
        console.log('Fallback to localStorage events');
    }

    renderEvents();
}

function loadBirthdays() {
    try {
        const response = fetch('data/birthdays.json')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data && Array.isArray(data.birthdays)) {
                    appBirthdays = data.birthdays;
                    localStorage.setItem(BIRTHDAYS_KEY, JSON.stringify(appBirthdays));
                } else {
                    const saved = localStorage.getItem(BIRTHDAYS_KEY);
                    appBirthdays = saved ? JSON.parse(saved) : [];
                }
                renderBirthdays();
            })
            .catch(() => {
                const saved = localStorage.getItem(BIRTHDAYS_KEY);
                appBirthdays = saved ? JSON.parse(saved) : [];
                renderBirthdays();
            });
    } catch (error) {
        const saved = localStorage.getItem(BIRTHDAYS_KEY);
        appBirthdays = saved ? JSON.parse(saved) : [];
        renderBirthdays();
    }
}

function renderBirthdays() {
    const bdaysSection = document.getElementById('bdays-sec');
    if (!bdaysSection) return;

    if (!appBirthdays.length) {
        bdaysSection.innerHTML = '<h2>Дни Рождения</h2><p>Дни рождения не добавлены.</p>';
        return;
    }

    // Group by month
    const months = {};
    appBirthdays.forEach(bd => {
        const date = new Date(bd.date + 'T00:00:00');
        const monthName = date.toLocaleDateString('ru-RU', { month: 'long' });
        if (!months[monthName]) months[monthName] = [];
        months[monthName].push(bd);
    });

    let html = '<h2>Дни Рождения</h2>';
    Object.keys(months).forEach(monthName => {
        html += `<h3>${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</h3><ul class="birthday-list">`;
        months[monthName].forEach(bd => {
            const date = new Date(bd.date + 'T00:00:00');
            const dayMonth = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            html += `<li class="birthday-item">🎉 ${dayMonth} — ${bd.name}</li>`;
        });
        html += '</ul>';
    });

    bdaysSection.innerHTML = html;
}

function formatDate(dateString) {
    if (!dateString) return 'Дата не указана';
    const date = new Date(dateString + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderEvents() {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    if (!appEvents.length) {
        eventsList.innerHTML = '<p>События пока не добавлены.</p>';
        return;
    }

    eventsList.innerHTML = appEvents.map(event => {
        const participants = Array.isArray(event.participants) ? event.participants : [];
        const registered = hasUserRegistered(event.id);
        return `
            <article class="event-card" data-id="${event.id}">
                <div class="event-header">
                    <div>
                        <span class="event-date">${formatDate(event.date)}</span>
                        <h3>${event.title}</h3>
                    </div>
                    <span class="event-badge">${participants.length}/${event.maxParticipants || 50}</span>
                </div>
                <p>${event.description || 'Описание события скоро появится.'}</p>
                <div class="event-meta">
                    <span>🕒 ${event.time || 'Время не указано'}</span>
                    <span>📍 ${event.location || 'Место не указано'}</span>
                </div>
                <div class="event-actions">
                    <button type="button" class="secondary-btn" onclick="showRegistrationForm(${event.id})">Записаться</button>
                </div>
                ${registered ? '<div class="registered-badge">Вы уже записаны</div>' : ''}
                <div class="registration-form hidden" id="form-${event.id}">
                    <input type="text" id="reg-name-${event.id}" placeholder="Ваше имя*" />
                    <input type="text" id="reg-contact-${event.id}" placeholder="Telegram / телефон" />
                    <textarea id="reg-notes-${event.id}" placeholder="Комментарий"></textarea>
                    <button type="button" onclick="submitRegistration(${event.id})">Подтвердить запись</button>
                </div>
                <div class="participants-list">
                    ${participants.map(person => `<span class="participant-pill">${person.name}</span>`).join('') || '<span class="participant-pill">Пока никого</span>'}
                </div>
            </article>
        `;
    }).join('');
}

function showRegistrationForm(eventId) {
    const form = document.getElementById(`form-${eventId}`);
    if (!form) return;
    form.classList.toggle('hidden');
}

function hasUserRegistered(eventId) {
    const registrations = JSON.parse(localStorage.getItem(REGISTRATIONS_KEY) || '{}');
    return !!(registrations[eventId]);
}

function submitRegistration(eventId) {
    const name = document.getElementById(`reg-name-${eventId}`)?.value.trim();
    const contact = document.getElementById(`reg-contact-${eventId}`)?.value.trim();
    const notes = document.getElementById(`reg-notes-${eventId}`)?.value.trim();

    if (!name) {
        alert('Введите имя для записи');
        return;
    }

    const event = appEvents.find(item => item.id === eventId);
    if (!event) return;

    event.participants = Array.isArray(event.participants) ? event.participants : [];
    const maxParticipants = Number(event.maxParticipants) || 50;

    if (event.participants.length >= maxParticipants) {
        alert('Мест уже нет, но можно оставить заявку в списке ожидания');
        return;
    }

    const entry = {
        name,
        contact: contact || 'не указан',
        notes: notes || '',
        registeredAt: new Date().toISOString()
    };

    event.participants.push(entry);

    const registrations = JSON.parse(localStorage.getItem(REGISTRATIONS_KEY) || '{}');
    registrations[eventId] = entry;
    localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify(registrations));
    localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));

    renderEvents();
}
