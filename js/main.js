const HUB_ANSWER = 'лена';
const EVENTS_KEY = 'buhlo_events_data';
const BIRTHDAYS_KEY = 'buhlo_birthdays_data';
const REGISTRATIONS_KEY = 'buhlo_registrations';

const ENCRYPTED_ADMIN_PASSWORD = 'Oy_hy}hyq|tj\u0003';

const DEFAULT_EVENTS = [
    {
        id: 2,
        title: '🎂🎉🥃День рождения БХЧ🍹🥂🍻',
        date: '2026-10-02',
        time: '09:00',
        location: 'Любое место, где продают алкашку',
        description: 'Веселиться, гулять, выпивать, смеяться  и дурить до самого утра в компании лучших собутыльников.',
        participants: [],
        maxParticipants: 30
    }
];

const HOLIDAYS = [
    { date: '10-02', name: 'Всемирный день без алкоголя'},
    { date: '01-01', name: 'Новый год' },
    { date: '02-23', name: 'День защитника Отечества' },
    { date: '03-08', name: 'Международный женский день' },
    { date: '05-01', name: 'Праздник Весны и Труда' },
    { date: '05-09', name: 'День Победы' },
	 { date: '12-25', name: 'Рождество Христово (католическое)' },
	 { date: '04-18', name: 'Республиканское открытие мотосезона (Минск)' }, 
     { date: '05-16', name: 'Международный день барбекю (День барбекю на байке)' }, 
     { date: '05-29', name: 'Мотофестиваль MotoPovodBrest (база Орлёнок)' }, 
     { date: '06-12', name: 'Мотофестиваль Village Party (Беловежская пуща)' }, 
     { date: '06-26', name: 'Байк-рок фестиваль MotoFestWest (Барановичи)' }, 
     { date: '07-24', name: 'Фестиваль Brest Motor Music Weekend' }, 
     { date: '08-15', name: 'Фестиваль Тачки Пікнік и Мотошоу FERZ (Лида)' }, 
     { date: '08-28', name: 'Лидский байк-фестиваль (Lida Bike Fest)' }, 
     { date: '09-19', name: 'Официальное закрытие мотосезона в Беларуси' }, 
     { date: '10-17', name: 'Мото-встреча OCTOBER DAY (Route P98)' }
];

let appEvents = [];
let countdownInterval;
let targetDateString = '';
let isAuthenticated = false;
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
        isAuthenticated = true;
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

// Форматирование даты из YYYY-MM-DD в DD.MM.YYYY
function formatDateDisplay(dateString) {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}.${month}.${year}`;
}

// Парсинг даты из DD.MM.YYYY в YYYY-MM-DD
function parseDateInput(displayString) {
    if (!displayString) return '';
    const parts = displayString.split('.');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    if (!/^\d{2}$/.test(day) || !/^\d{2}$/.test(month) || !/^\d{4}$/.test(year)) return '';
    return `${year}-${month}-${day}`;
}

window.onload = function() {
    const authInput = document.getElementById('auth-input');
    if (authInput) {
        authInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                checkAuth();
            }
        });
    }

    const dateInput = document.getElementById('destination-date');
    const dateDisplay = document.getElementById('destination-date-display');
    
    if (dateDisplay && dateInput) {
        dateDisplay.addEventListener('input', (e) => {
            const parsed = parseDateInput(e.target.value);
            if (parsed) {
                dateInput.value = parsed;
                updateCustomDate(parsed);
            }
        });
    }

    if (!isAuthenticated) {
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('main-content').style.display = 'none';
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (dateInput) dateInput.min = today;
    
    initPage();
};

window.onbeforeunload = function() {
    isAuthenticated = false;
};

function initPage() {
    let savedDate = localStorage.getItem('buhlo_target_date');
    
    if (!savedDate) {
        const now = new Date();
        const currentYear = now.getFullYear();
        // Проверяем, прошла ли дата 17 июля этого года
        const julyDate = new Date(`${currentYear}-07-17`);
        
        if (now > julyDate) {
            // Если дата в прошлом, ставим на следующий год
            savedDate = `${currentYear + 1}-07-17`;
        } else {
            // Иначе на эту дату
            savedDate = `${currentYear}-07-17`;
        }
        localStorage.setItem('buhlo_target_date', savedDate);
    }

    const dateInput = document.getElementById('destination-date');
    const dateDisplay = document.getElementById('destination-date-display');
    
    if (dateInput) dateInput.value = savedDate;
    if (dateDisplay) dateDisplay.value = formatDateDisplay(savedDate);

    targetDateString = savedDate + 'T00:00:00';
    console.log('Timer initialized with:', targetDateString, 'Current:', new Date());
    startTimer();
    calculateAlcohol();
    loadEvents();
    loadBirthdays();
}

function updateCustomDate(val) {
    if (!val) return;
    localStorage.setItem('buhlo_target_date', val);
    targetDateString = val + 'T00:00:00';
    
    const dateDisplay = document.getElementById('destination-date-display');
    if (dateDisplay) {
        dateDisplay.value = formatDateDisplay(val);
    }
    
    console.log('Date updated to:', targetDateString);
    startTimer();
}

function startTimer() {
    if (countdownInterval) clearInterval(countdownInterval);

    function tick() {
        try {
            const target = new Date(targetDateString);
            const now = new Date();
            const difference = target.getTime() - now.getTime();

            console.log('Tick - Target:', target, 'Now:', now, 'Diff:', difference);

            if (difference <= 0) {
                ['days', 'hours', 'minutes', 'seconds'].forEach(id => {
                    const elem = document.getElementById(id);
                    if (elem) elem.innerText = '00';
                });
                console.log('Timer reached 00');
                if (countdownInterval) clearInterval(countdownInterval);
                return;
            }

            const d = Math.floor(difference / (1000 * 60 * 60 * 24));
            const h = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((difference % (1000 * 60)) / 1000);

            const daysElem = document.getElementById('days');
            const hoursElem = document.getElementById('hours');
            const minutesElem = document.getElementById('minutes');
            const secondsElem = document.getElementById('seconds');

            if (daysElem) daysElem.innerText = d < 10 ? '0' + d : d;
            if (hoursElem) hoursElem.innerText = h < 10 ? '0' + h : h;
            if (minutesElem) minutesElem.innerText = m < 10 ? '0' + m : m;
            if (secondsElem) secondsElem.innerText = s < 10 ? '0' + s : s;
        } catch (e) {
            console.error('Timer error:', e);
        }
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

    document.getElementById('res-hard').innerText = (people * coeffHard * days).toFixed(1) + ' л';
    document.getElementById('res-light').innerText = (people * coeffLight * days).toFixed(1) + ' л';
    document.getElementById('res-beer').innerText = (people * coeffBeer * days).toFixed(1) + ' л';
    document.getElementById('res-water').innerText = (people * coeffWater * days).toFixed(1) + ' л';
    document.getElementById('res-coal').innerText = Math.ceil((people * days) / 5) + ' шт';
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
    fetch('data/birthdays.json')
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
            renderUpcomingHighlights();
        })
        .catch(() => {
            const saved = localStorage.getItem(BIRTHDAYS_KEY);
            appBirthdays = saved ? JSON.parse(saved) : [];
            renderBirthdays();
            renderUpcomingHighlights();
        });
}

function getNextAnnualDate(monthDay, from = new Date()) {
    const [month, day] = monthDay.split('-').map(Number);
    let date = new Date(from.getFullYear(), month - 1, day);
    date.setHours(0, 0, 0, 0);
    const today = new Date(from);
    today.setHours(0, 0, 0, 0);
    if (date < today) date = new Date(from.getFullYear() + 1, month - 1, day);
    return date;
}

function daysBetween(from, to) {
    return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function getNextBirthday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return appBirthdays
        .map(bd => ({ ...bd, nextDate: getNextAnnualDate(bd.date.slice(5), today) }))
        .sort((a, b) => a.nextDate - b.nextDate)[0];
}

 function getUpcomingHoliday() {
   const today = new Date();
   today.setHours(0, 0, 0, 0);
   return HOLIDAYS
       .map(holiday => ({ ...holiday, nextDate: getNextAnnualDate(holiday.date, today) }))
       .map(holiday => ({ ...holiday, days: daysBetween(today, holiday.nextDate) }))
       .filter(holiday => holiday.days >= 0 && holiday.days <= 3)
       .sort((a, b) => a.nextDate - b.nextDate)[0];
}


function renderUpcomingHighlights() {
    const container = document.getElementById('upcoming-highlights');
    if (!container) return;

    const birthday = getNextBirthday();
    const holiday = getUpcomingHoliday();
    const upcomingEvents = appEvents
        .map(event => ({ ...event, eventDate: new Date(`${event.date}T00:00:00`) }))
        .filter(event => !Number.isNaN(event.eventDate.getTime()) && event.eventDate >= new Date())
        .sort((a, b) => a.eventDate - b.eventDate);

    const items = [];
    if (upcomingEvents[0]) {
        items.push(`<div class="highlight-item"><span>📅 Ближайшее событие</span><strong>${upcomingEvents[0].title} — ${formatDate(upcomingEvents[0].date)}</strong></div>`);
    }
  //  if (birthday) {
    //    items.push(`<div class="highlight-item"><span>🎂 Ближайший день рождения</span><strong>${formatDate(birthday.nextDate.toISOString().slice(0, 10))} — ${birthday.name}</strong></div>`);
  //  }
        if (birthday) {
        const birthdayDateString = birthday.nextDate.toLocaleDateString('sv');
        items.push(`<div class="highlight-item"><span>🎂 Ближайший день рождения</span><strong>${formatDate(birthdayDateString)} — ${birthday.name}</strong></div>`);
    }
  //  if (holiday) {
   //     const when = holiday.days === 0 ? 'сегодня' : `через ${holiday.days} дн.`;
  //      items.push(`<div class="highlight-item"><span>🎉 Ближайший праздник (${when})</span><strong>${holiday.name} — ${formatDate(holiday.nextDate.toISOString().slice(0, 10))}</strong></div>`);
  //  }
     // ИСПРАВЛЕНО: здесь тоже убран баг со сдвигом даты праздника
    if (holiday) {
        const holidayDateString = holiday.nextDate.toLocaleDateString('sv');
        const when = holiday.days === 0 ? 'сегодня' : `через ${holiday.days} дн.`;
        items.push(`<div class="highlight-item"><span>🎉 Ближайший праздник (${when})</span><strong>${holiday.name} — ${formatDate(holidayDateString)}</strong></div>`);
    }

    container.innerHTML = items.length ? items.join('') : '<p class="muted-message">Ближайших событий пока нет.</p>';
}

function renderBirthdays() {
    const bdaysSection = document.getElementById('bdays-sec');
    if (!bdaysSection) return;

    if (!appBirthdays.length) {
        bdaysSection.innerHTML = '<h2>Дни Рождения</h2><p>Дни рождения не добавлены.</p>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sorted = appBirthdays
        .map(bd => ({ ...bd, nextDate: getNextAnnualDate(bd.date.slice(5), today) }))
        .sort((a, b) => a.nextDate - b.nextDate);

    const renderItem = bd => {
        const dayMonth = new Date(bd.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        return `<li class="birthday-item">🎉 ${dayMonth} — ${bd.name}</li>`;
    };

    const firstFour = sorted.slice(0, 4).map(renderItem).join('');
    const remaining = sorted.slice(4).map(renderItem).join('');
    let html = '<h2>Дни Рождения</h2><ul class="birthday-list birthday-list-short">' + firstFour + '</ul>';
    if (remaining) {
        html += `<details class="birthday-more"><summary>Показать остальные (${sorted.length - 4})</summary><ul class="birthday-list">${remaining}</ul></details>`;
    }
    bdaysSection.innerHTML = html;
}

function formatDate(dateString) {
    if (!dateString) return 'Дата не указана';
    const date = dateString instanceof Date ? dateString : new Date(dateString + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return String(dateString);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderEvents() {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    if (!appEvents.length) {
        eventsList.innerHTML = '<p>События пока не добавлены.</p>';
        renderUpcomingHighlights();
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
    renderUpcomingHighlights();
}

function showRegistrationForm(eventId) {
    const form = document.getElementById(`form-${eventId}`);
    if (form) form.classList.toggle('hidden');
}

function hasUserRegistered(eventId) {
    const registrations = JSON.parse(localStorage.getItem(REGISTRATIONS_KEY) || '{}');
    return !!registrations[eventId];
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

    const entry = { name, contact: contact || 'не указан', notes: notes || '', registeredAt: new Date().toISOString() };
    event.participants.push(entry);

    const registrations = JSON.parse(localStorage.getItem(REGISTRATIONS_KEY) || '{}');
    registrations[eventId] = entry;
    localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify(registrations));
    localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));

    renderEvents();
}
