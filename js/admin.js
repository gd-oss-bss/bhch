const EVENTS_KEY = 'buhlo_events_data';
const BIRTHDAYS_DRAFT_KEY = 'buhlo_birthdays_admin_draft';
const HOLIDAYS_DRAFT_KEY = 'buhlo_holidays_admin_draft';

// Encrypted admin password: Pvfxbycrbq1981
const ENCRYPTED_ADMIN_PASSWORD = 'Wqa\u007fe~duev6>?6';

// Optional server-side proxy. The GitHub token must be stored only on that server.
// Example: window.BUHLO_API_URL = 'https://your-api.example.com';
const API_URL = (window.BUHLO_API_URL || '').replace(/\/$/, '');

let appEvents = [];
let appBirthdays = [];
let appHolidays = [];
let editingEventId = null;
let editingBirthdayIndex = null;
let editingHolidayIndex = null;
let isAdminAuthenticated = false; // in-memory auth flag (session only)

function simpleDecrypt(encrypted) {
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(encrypted.charCodeAt(i) ^ 7);
    }
    return decrypted;
}

function getCurrentPassword() {
    return simpleDecrypt(ENCRYPTED_ADMIN_PASSWORD);
}

function goBackToHub() {
    window.location.href = '../index.html';
}

function showDashboard() {
    document.getElementById('auth-block').classList.add('hidden');
    document.getElementById('topbar').classList.remove('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

function showAuth() {
    document.getElementById('auth-block').classList.remove('hidden');
    document.getElementById('topbar').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

function checkAdminLogin() {
    const value = document.getElementById('admin-password').value.trim();
    if (value === getCurrentPassword()) {
        isAdminAuthenticated = true; // store only in memory, never in localStorage or cookies
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-error').style.display = 'none';
        showDashboard();
        loadEvents();
        loadAdminBirthdays();
        loadAdminHolidays();
    } else {
        document.getElementById('admin-error').style.display = 'block';
        document.getElementById('admin-password').value = '';
        isAdminAuthenticated = false;
    }
}

function logoutAdmin() {
    isAdminAuthenticated = false; // clear in-memory auth
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-error').style.display = 'none';
    showAuth();
}

function getDefaultEvents() {
    return [
        {
            id: 1,
            title: 'Пятничный сбор',
            date: '2026-10-03',
            time: '19:00',
            location: 'Наше стандартное место / беседки',
            description: 'Еженедельный сбор компании для хорошего настроения',
            participants: [],
            maxParticipants: 50
        },
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
}

function parseEvents(value) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const events = Array.isArray(parsed) ? parsed : parsed?.events;
    return Array.isArray(events) ? events : getDefaultEvents();
}

function getSavedEvents() {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) {
        const defaults = getDefaultEvents();
        localStorage.setItem(EVENTS_KEY, JSON.stringify(defaults));
        return defaults;
    }

    try {
        return parseEvents(raw);
    } catch (error) {
        return getDefaultEvents();
    }
}

async function loadEvents() {
    appEvents = getSavedEvents();

    try {
        const response = await fetch('../data/events.json', { cache: 'no-store' });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data.events)) {
                appEvents = data.events;
                localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
            }
        }
    } catch (error) {
        console.log('Using localStorage events:', error.message);
    }

    renderEvents();
}

function parseBirthdays(value) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const birthdays = Array.isArray(parsed) ? parsed : parsed?.birthdays;
    if (!Array.isArray(birthdays)) {
        throw new Error('Ожидается массив birthdays');
    }

    return birthdays.map((birthday, index) => {
        if (!birthday || typeof birthday !== 'object') {
            throw new Error(`Некорректная запись №${index + 1}`);
        }
        const name = typeof birthday.name === 'string' ? birthday.name.trim() : '';
        const date = typeof birthday.date === 'string' ? birthday.date : '';
        if (!name || name.length > 120 || !isValidBirthdayDate(date)) {
            throw new Error(`Проверьте имя и дату в записи №${index + 1}`);
        }
        return { date, name };
    });
}

function isValidBirthdayDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

async function loadAdminBirthdays() {
    const status = document.getElementById('birthday-status');
    status.classList.add('hidden');

    try {
        const draft = localStorage.getItem(BIRTHDAYS_DRAFT_KEY);
        if (draft !== null) {
            appBirthdays = parseBirthdays(draft);
            renderAdminBirthdays();
            setBirthdayStatus('Загружен локальный черновик. Скачайте JSON и опубликуйте его, чтобы изменения увидели все.');
            return;
        }

        const response = await fetch('../data/birthdays.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        appBirthdays = parseBirthdays(await response.json());
        renderAdminBirthdays();
    } catch (error) {
        appBirthdays = [];
        renderAdminBirthdays();
        setBirthdayStatus(`Не удалось загрузить дни рождения: ${error.message}`, true);
    }
}

function setBirthdayStatus(message, isError = false) {
    const status = document.getElementById('birthday-status');
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (isError) status.classList.add('error');
}

function parseHolidays(value) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const holidays = Array.isArray(parsed) ? parsed : parsed?.holidays;
    if (!Array.isArray(holidays)) {
        throw new Error('Ожидается массив holidays');
    }

    return holidays.map((holiday, index) => {
        if (!holiday || typeof holiday !== 'object') {
            throw new Error(`Некорректная запись №${index + 1}`);
        }
        const name = typeof holiday.name === 'string' ? holiday.name.trim() : '';
        const date = typeof holiday.date === 'string' ? holiday.date : '';
        const eventType = holiday.event_type === undefined ? 'general' : holiday.event_type;
        if (!name || name.length > 120 || !isValidHolidayDate(date) ||
            !['general', 'moto'].includes(eventType)) {
            throw new Error(`Проверьте название, дату и тип в записи №${index + 1}`);
        }
        return { date, name, event_type: eventType };
    });
}

function isValidHolidayDate(date) {
    const match = /^(\d{2})-(\d{2})$/.exec(date);
    if (!match) return false;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const parsed = new Date(Date.UTC(2000, month - 1, day));
    return parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

async function loadAdminHolidays() {
    try {
        const draft = localStorage.getItem(HOLIDAYS_DRAFT_KEY);
        if (draft !== null) {
            appHolidays = parseHolidays(draft);
            renderAdminHolidays();
            setHolidayStatus('Загружен локальный черновик. Скачайте holidays.json и опубликуйте его, чтобы изменения увидели все.');
            return;
        }

        const response = await fetch('../data/holidays.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        appHolidays = parseHolidays(await response.json());
        renderAdminHolidays();
    } catch (error) {
        appHolidays = [];
        renderAdminHolidays();
        setHolidayStatus(`Не удалось загрузить праздники: ${error.message}`, true);
    }
}

function renderAdminHolidays() {
    const list = document.getElementById('holidays-list');
    if (!list) return;

    if (!appHolidays.length) {
        list.innerHTML = '<div class="empty">Праздники пока не добавлены.</div>';
        return;
    }

    list.innerHTML = appHolidays.map((holiday, index) => `
        <div class="event-item">
            <h4>${escapeHtml(holiday.name)}</h4>
            <div class="event-meta">
                <span class="tag">${escapeHtml(holiday.date)}</span>
                <span class="tag">${holiday.event_type === 'moto' ? 'Мото-событие' : 'Общий праздник'}</span>
            </div>
            <div class="event-actions">
                <button type="button" onclick="editHoliday(${index})">Редактировать</button>
                <button type="button" class="danger" onclick="deleteHoliday(${index})">Удалить</button>
            </div>
        </div>
    `).join('');
}

function saveHoliday() {
    const name = document.getElementById('holiday-name').value.trim();
    const date = document.getElementById('holiday-date').value.trim();
    const eventType = document.getElementById('holiday-event-type').value;

    if (!name || name.length > 120 || !isValidHolidayDate(date) ||
        !['general', 'moto'].includes(eventType)) {
        setHolidayStatus('Укажите название, дату в формате ММ-ДД и тип праздника.', true);
        return;
    }

    const updated = [...appHolidays];
    const holiday = { date, name, event_type: eventType };
    if (editingHolidayIndex !== null) {
        updated[editingHolidayIndex] = holiday;
    } else {
        updated.push(holiday);
    }

    try {
        localStorage.setItem(HOLIDAYS_DRAFT_KEY, JSON.stringify(updated));
        appHolidays = updated;
        renderAdminHolidays();
        resetHolidayForm();
        setHolidayStatus('Черновик сохранён в этом браузере. Скачайте holidays.json и опубликуйте изменения.');
    } catch (error) {
        setHolidayStatus(`Не удалось сохранить черновик: ${error.message}`, true);
    }
}

function editHoliday(index) {
    const holiday = appHolidays[index];
    if (!holiday) return;

    editingHolidayIndex = index;
    document.getElementById('holiday-name').value = holiday.name;
    document.getElementById('holiday-date').value = holiday.date;
    document.getElementById('holiday-event-type').value = holiday.event_type;
    document.getElementById('save-holiday-button').textContent = 'Обновить праздник';
    document.getElementById('holiday-form-title').textContent = 'Редактировать праздник';
}

function deleteHoliday(index) {
    const holiday = appHolidays[index];
    if (!holiday || !confirm(`Удалить праздник «${holiday.name}»?`)) return;

    const updated = appHolidays.filter((_, itemIndex) => itemIndex !== index);
    try {
        localStorage.setItem(HOLIDAYS_DRAFT_KEY, JSON.stringify(updated));
        appHolidays = updated;
        renderAdminHolidays();
        if (editingHolidayIndex === index) {
            resetHolidayForm();
        } else if (editingHolidayIndex !== null && editingHolidayIndex > index) {
            editingHolidayIndex -= 1;
        }
        setHolidayStatus('Праздник удалён из черновика. Скачайте holidays.json и опубликуйте изменения.');
    } catch (error) {
        setHolidayStatus(`Не удалось сохранить черновик: ${error.message}`, true);
    }
}

function resetHolidayForm() {
    editingHolidayIndex = null;
    document.getElementById('holiday-name').value = '';
    document.getElementById('holiday-date').value = '';
    document.getElementById('holiday-event-type').value = 'general';
    document.getElementById('save-holiday-button').textContent = 'Сохранить праздник';
    document.getElementById('holiday-form-title').textContent = 'Добавить праздник';
}

async function discardHolidayDraft() {
    try {
        if (localStorage.getItem(HOLIDAYS_DRAFT_KEY) !== null &&
            !confirm('Удалить локальный черновик и загрузить опубликованные праздники?')) {
            return;
        }
        localStorage.removeItem(HOLIDAYS_DRAFT_KEY);
        resetHolidayForm();
        await loadAdminHolidays();
    } catch (error) {
        setHolidayStatus(`Не удалось загрузить опубликованный список: ${error.message}`, true);
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function renderAdminBirthdays() {
    const list = document.getElementById('birthdays-list');
    if (!list) return;

    if (!appBirthdays.length) {
        list.innerHTML = '<div class="empty">Дни рождения пока не добавлены.</div>';
        return;
    }

    list.innerHTML = appBirthdays.map((birthday, index) => `
        <div class="event-item">
            <h4>${escapeHtml(birthday.name)}</h4>
            <div class="event-meta"><span class="tag">${formatDate(birthday.date)}</span></div>
            <div class="event-actions">
                <button type="button" onclick="editBirthday(${index})">Редактировать</button>
                <button type="button" class="danger" onclick="deleteBirthday(${index})">Удалить</button>
            </div>
        </div>
    `).join('');
}

function saveBirthday() {
    const nameInput = document.getElementById('birthday-name');
    const dateInput = document.getElementById('birthday-date');
    const name = nameInput.value.trim();
    const date = dateInput.value;

    if (!name || !isValidBirthdayDate(date)) {
        setBirthdayStatus('Укажите имя и корректную дату рождения.', true);
        return;
    }

    const updated = [...appBirthdays];
    if (editingBirthdayIndex !== null) {
        updated[editingBirthdayIndex] = { date, name };
    } else {
        updated.push({ date, name });
    }

    try {
        localStorage.setItem(BIRTHDAYS_DRAFT_KEY, JSON.stringify(updated));
        appBirthdays = updated;
        renderAdminBirthdays();
        resetBirthdayForm();
        setBirthdayStatus('Черновик сохранён в этом браузере. Скачайте birthdays.json и опубликуйте изменения.');
    } catch (error) {
        setBirthdayStatus(`Не удалось сохранить черновик: ${error.message}`, true);
    }
}

function editBirthday(index) {
    const birthday = appBirthdays[index];
    if (!birthday) return;

    editingBirthdayIndex = index;
    document.getElementById('birthday-name').value = birthday.name;
    document.getElementById('birthday-date').value = birthday.date;
    document.getElementById('save-birthday-button').textContent = 'Обновить день рождения';
    document.getElementById('birthday-form-title').textContent = 'Редактировать день рождения';
}

function deleteBirthday(index) {
    const birthday = appBirthdays[index];
    if (!birthday || !confirm(`Удалить день рождения «${birthday.name}»?`)) return;

    const updated = appBirthdays.filter((_, itemIndex) => itemIndex !== index);
    try {
        localStorage.setItem(BIRTHDAYS_DRAFT_KEY, JSON.stringify(updated));
        appBirthdays = updated;
        renderAdminBirthdays();
        if (editingBirthdayIndex === index) {
            resetBirthdayForm();
        } else if (editingBirthdayIndex !== null && editingBirthdayIndex > index) {
            editingBirthdayIndex -= 1;
        }
        setBirthdayStatus('Запись удалена из черновика. Скачайте birthdays.json и опубликуйте изменения.');
    } catch (error) {
        setBirthdayStatus(`Не удалось сохранить черновик: ${error.message}`, true);
    }
}

function resetBirthdayForm() {
    editingBirthdayIndex = null;
    document.getElementById('birthday-name').value = '';
    document.getElementById('birthday-date').value = '';
    document.getElementById('save-birthday-button').textContent = 'Сохранить день рождения';
    document.getElementById('birthday-form-title').textContent = 'Добавить день рождения';
}

async function discardBirthdayDraft() {
    try {
        if (localStorage.getItem(BIRTHDAYS_DRAFT_KEY) !== null &&
            !confirm('Удалить локальный черновик и загрузить опубликованные дни рождения?')) {
            return;
        }
        localStorage.removeItem(BIRTHDAYS_DRAFT_KEY);
        resetBirthdayForm();
        await loadAdminBirthdays();
    } catch (error) {
        setBirthdayStatus(`Не удалось загрузить опубликованный список: ${error.message}`, true);
    }
}

function downloadBirthdaysJson() {
    const blob = new Blob([JSON.stringify({ birthdays: appBirthdays }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'birthdays.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBirthdayStatus('Файл birthdays.json скачан. Добавьте его в data/ и опубликуйте сайт.');
}

function downloadHolidaysJson() {
    const blob = new Blob([JSON.stringify({ holidays: appHolidays }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'holidays.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setHolidayStatus('Файл holidays.json скачан. Добавьте его в data/ и опубликуйте сайт.');
}

function setHolidayStatus(message, isError = false) {
    const status = document.getElementById('holiday-status');
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (isError) status.classList.add('error');
}

function importHolidaysJson(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            if (typeof reader.result !== 'string') throw new Error('Не удалось прочитать файл');
            const imported = parseHolidays(reader.result);
            localStorage.setItem(HOLIDAYS_DRAFT_KEY, JSON.stringify(imported));
            appHolidays = imported;
            renderAdminHolidays();
            setHolidayStatus('JSON импортирован в локальный черновик.');
        } catch (error) {
            setHolidayStatus(`Ошибка импорта: ${error.message}`, true);
        } finally {
            input.value = '';
        }
    };
    reader.onerror = () => {
        setHolidayStatus('Не удалось прочитать выбранный файл.', true);
        input.value = '';
    };
    reader.readAsText(file);
}

function importBirthdaysJson(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            if (typeof reader.result !== 'string') throw new Error('Не удалось прочитать файл');
            const imported = parseBirthdays(reader.result);
            localStorage.setItem(BIRTHDAYS_DRAFT_KEY, JSON.stringify(imported));
            appBirthdays = imported;
            renderAdminBirthdays();
            setBirthdayStatus('JSON импортирован в локальный черновик.');
        } catch (error) {
            setBirthdayStatus(`Ошибка импорта: ${error.message}`, true);
        } finally {
            input.value = '';
        }
    };
    reader.onerror = () => {
        setBirthdayStatus('Не удалось прочитать выбранный файл.', true);
        input.value = '';
    };
    reader.readAsText(file);
}

async function loadBirthdaysFromServer() {
    if (!API_URL) throw new Error('BUHLO_API_URL не настроен');
    const response = await fetch(`${API_URL}/birthdays`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const birthdays = parseBirthdays(await response.json());
    localStorage.removeItem(BIRTHDAYS_DRAFT_KEY);
    appBirthdays = birthdays;
    renderAdminBirthdays();
}

async function saveBirthdaysToServer() {
    if (!API_URL) throw new Error('BUHLO_API_URL не настроен');
    const response = await fetch(`${API_URL}/birthdays`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthdays: appBirthdays })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    localStorage.removeItem(BIRTHDAYS_DRAFT_KEY);
}

async function syncBirthdaysWithServer(action) {
    try {
        if (action === 'save') {
            await saveBirthdaysToServer();
            setBirthdayStatus('Дни рождения сохранены на сервере.');
        } else {
            await loadBirthdaysFromServer();
            setBirthdayStatus('Дни рождения загружены с сервера.');
        }
    } catch (error) {
        setBirthdayStatus(`Синхронизация не удалась: ${error.message}`, true);
    }
}

function renderEvents() {
    const list = document.getElementById('events-list');
    if (!list) return;

    if (!appEvents.length) {
        list.innerHTML = '<div class="empty">События пока не добавлены.</div>';
        return;
    }

    list.innerHTML = appEvents.map(event => {
        const participants = Array.isArray(event.participants) ? event.participants : [];
        return `
            <div class="event-item">
                <h4>${event.title || 'Без названия'}</h4>
                <p>${event.description || 'Описание отсутствует'}</p>
                <div class="event-meta">
                    <span class="tag">${event.date ? formatDate(event.date) : 'Дата не указана'}</span>
                    ${event.recurrence === 'yearly' ? '<span class="tag">Ежегодно</span>' : ''}
                    <span class="tag">${event.time || 'Время не указано'}</span>
                    <span class="tag">${event.location || 'Место не указано'}</span>
                    <span class="tag">${participants.length}/${event.maxParticipants || 30}</span>
                </div>
                <div class="event-actions">
                    <button type="button" onclick="editEvent(${event.id})">Редактировать</button>
                    <button type="button" class="danger" onclick="deleteEvent(${event.id})">Удалить</button>
                </div>
            </div>
        `;
    }).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function saveEvent() {
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const recurrence = document.getElementById('event-yearly').checked ? 'yearly' : undefined;
    const time = document.getElementById('event-time').value;
    const location = document.getElementById('event-location').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const limit = Number(document.getElementById('event-limit').value) || 30;

    if (!title || !date) {
        alert('Заполните название и дату события');
        return;
    }

    if (editingEventId !== null) {
        const index = appEvents.findIndex(item => item.id === editingEventId);
        if (index >= 0) {
            appEvents[index] = {
                ...appEvents[index], title, date, time,
                recurrence,
                location: location || appEvents[index].location || 'Место не указано',
                description: description || appEvents[index].description || 'Описание события скоро появится.',
                maxParticipants: limit
            };
        }
    } else {
        appEvents.unshift({
            id: Date.now(), title, date, time,
            recurrence,
            location: location || 'Место не указано',
            description: description || 'Описание события скоро появится.',
            participants: [], maxParticipants: limit
        });
    }

    localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
    renderEvents();
    resetForm();

    if (API_URL) {
        try {
            await saveEventsToServer();
        } catch (error) {
            alert('Локально сохранено, но серверная синхронизация не удалась: ' + error.message);
        }
    }
}

function editEvent(eventId) {
    const event = appEvents.find(item => item.id === eventId);
    if (!event) return;

    editingEventId = eventId;
    document.getElementById('event-title').value = event.title || '';
    document.getElementById('event-date').value = event.date || '';
    document.getElementById('event-yearly').checked = event.recurrence === 'yearly';
    document.getElementById('event-time').value = event.time || '';
    document.getElementById('event-location').value = event.location || '';
    document.getElementById('event-description').value = event.description || '';
    document.getElementById('event-limit').value = event.maxParticipants || 30;

    const button = document.querySelector('.admin-actions button');
    if (button) button.textContent = 'Обновить событие';
}

async function deleteEvent(eventId) {
    if (!confirm('Удалить событие?')) return;
    appEvents = appEvents.filter(item => item.id !== eventId);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
    renderEvents();
    if (editingEventId === eventId) resetForm();

    if (API_URL) {
        try {
            await saveEventsToServer();
        } catch (error) {
            alert('Локально удалено, но серверная синхронизация не удалась: ' + error.message);
        }
    }
}

function resetForm() {
    editingEventId = null;
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    document.getElementById('event-yearly').checked = false;
    document.getElementById('event-time').value = '';
    document.getElementById('event-location').value = '';
    document.getElementById('event-description').value = '';
    document.getElementById('event-limit').value = 30;

    const button = document.querySelector('.admin-actions button');
    if (button) button.textContent = 'Сохранить событие';
}

function downloadEventsJson() {
    const blob = new Blob([JSON.stringify({ events: appEvents }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'events.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function importEventsJson(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
        try {
            appEvents = parseEvents(event.target.result);
            localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
            renderEvents();
            alert('JSON успешно импортирован');
            if (API_URL) await saveEventsToServer();
        } catch (error) {
            alert('Ошибка импорта: ' + error.message);
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

// These functions call your own backend. The backend, not this browser code,
// must keep the GitHub token and update data/events.json through GitHub API.
async function loadEventsFromServer() {
    if (!API_URL) throw new Error('BUHLO_API_URL не настроен');
    const response = await fetch(`${API_URL}/events`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    appEvents = parseEvents(await response.json());
    localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
    renderEvents();
}

async function saveEventsToServer() {
    if (!API_URL) throw new Error('BUHLO_API_URL не настроен');
    const response = await fetch(`${API_URL}/events`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: appEvents })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

// Backwards-compatible names for the existing admin HTML buttons.
function loadEventsFromGitHub() {
    return loadEventsFromServer();
}

function saveEventsToGitHub() {
    return saveEventsToServer();
}

function changeAdminPassword() {
    // NOTE: Password changes are NOT persisted to localStorage (session-only)
    // Only the original ENCRYPTED_ADMIN_PASSWORD is valid per session
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const messageBox = document.getElementById('password-message');

    if (!currentPassword || !newPassword || !confirmPassword) {
        messageBox.textContent = 'Заполните все поля';
    } else if (currentPassword !== getCurrentPassword()) {
        messageBox.textContent = 'Текущий пароль введён неверно';
    } else if (newPassword.length < 3) {
        messageBox.textContent = 'Новый пароль должен быть не короче 3 символов';
    } else if (newPassword !== confirmPassword) {
        messageBox.textContent = 'Новый пароль и подтверждение не совпадают';
    } else {
        // For security: password changes are NOT saved to localStorage
        // Only applies during current session in memory
        messageBox.textContent = 'Примечание: пароли не сохраняются постоянно (сессионные только)';
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
    }

    messageBox.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', function () {
    // Session-only auth: admin must login on each page load
    if (!isAdminAuthenticated) {
        showAuth();
    }
});

window.onbeforeunload = function() {
    // Clear auth on page unload to prevent auto-login
    isAdminAuthenticated = false;
};
