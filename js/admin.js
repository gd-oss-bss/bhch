const EVENTS_KEY = 'buhlo_events_data';
const BIRTHDAYS_DRAFT_KEY = 'buhlo_birthdays_admin_draft';
const HOLIDAYS_DRAFT_KEY = 'buhlo_holidays_admin_draft';

let appEvents = [];
let appBirthdays = [];
let appHolidays = [];
let appRegistrations = [];
const pendingRegistrationDeletes = new Set();
let editingEventId = null;
let editingBirthdayIndex = null;
let editingHolidayIndex = null;
let isAdminAuthenticated = false;

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

async function checkAdminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const error = document.getElementById('admin-error');

    try {
        await window.BuhloSupabase.signIn(email, password);
        isAdminAuthenticated = true;
        document.getElementById('admin-password').value = '';
        error.style.display = 'none';
        showDashboard();
        await Promise.all([loadEvents(), loadAdminBirthdays(), loadAdminHolidays()]);
    } catch (loginError) {
        error.textContent = loginError.message;
        error.style.display = 'block';
        document.getElementById('admin-password').value = '';
        window.BuhloSupabase.signOut();
        isAdminAuthenticated = false;
    }
}

function logoutAdmin() {
    window.BuhloSupabase.signOut();
    isAdminAuthenticated = false;
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
    try {
        appEvents = await window.BuhloSupabase.getEvents();
        if (appEvents.length) {
            localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
        } else {
            const response = await fetch('../data/events.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Опубликованные события: HTTP ${response.status}`);
            appEvents = parseEvents(await response.json());
            setEventsStatus('Supabase пока пуст; загружены события из data/events.json. Импортируйте JSON, чтобы заполнить базу.');
        }
    } catch (error) {
        appEvents = getSavedEvents();
        setEventsStatus(`Не удалось загрузить данные из Supabase: ${error.message}`, true);
        appRegistrations = [];
        renderEvents();
        return;
    }

    try {
        appRegistrations = await window.BuhloSupabase.getAdminRegistrations();
        if (appRegistrations.length || appEvents.length) {
            setEventsStatus('Данные загружены. Если список пришёл из JSON, импортируйте его для сохранения в Supabase.');
        }
    } catch (error) {
        appRegistrations = [];
        setEventsStatus(`События загружены, но список записей недоступен: ${error.message}`, true);
    }

    renderEvents();
}

function setEventsStatus(message, isError = false) {
    const status = document.getElementById('events-status');
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (isError) status.classList.add('error');
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
        appBirthdays = await window.BuhloSupabase.getBirthdays();
        if (!appBirthdays.length) {
            const response = await fetch('../data/birthdays.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Опубликованные дни рождения: HTTP ${response.status}`);
            appBirthdays = parseBirthdays(await response.json());
            setBirthdayStatus(`Supabase пока пуст; загружены ${appBirthdays.length} записей из data/birthdays.json. Нажмите «Сохранить в Supabase», чтобы импортировать их.`);
        }
        renderAdminBirthdays();
        const hasDraft = localStorage.getItem(BIRTHDAYS_DRAFT_KEY) !== null;
        document.getElementById('legacy-birthday-draft').classList.toggle('hidden', !hasDraft);
        if (hasDraft) setBirthdayStatus('Найден старый локальный черновик; он не удалён. Импортируйте его отдельно, если он нужен.');
    } catch (error) {
        try {
            const response = await fetch('../data/birthdays.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            appBirthdays = parseBirthdays(await response.json());
        } catch (fallbackError) {
            appBirthdays = [];
            setBirthdayStatus(`Не удалось загрузить дни рождения: ${fallbackError.message}`, true);
        }
        renderAdminBirthdays();
        if (!document.getElementById('birthday-status').classList.contains('error')) {
            setBirthdayStatus(`Supabase недоступен; показан опубликованный список. ${error.message}`, true);
        }
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
        appHolidays = await window.BuhloSupabase.getHolidays();
        if (!appHolidays.length) {
            const response = await fetch('../data/holidays.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Опубликованные праздники: HTTP ${response.status}`);
            appHolidays = parseHolidays(await response.json());
            setHolidayStatus(`Supabase пока пуст; загружены ${appHolidays.length} записей из data/holidays.json. Сохраните изменения, чтобы внести их в базу.`);
        }
        renderAdminHolidays();
        const hasDraft = localStorage.getItem(HOLIDAYS_DRAFT_KEY) !== null;
        document.getElementById('legacy-holiday-draft').classList.toggle('hidden', !hasDraft);
        if (hasDraft) setHolidayStatus('Найден старый локальный черновик; он не удалён. Импортируйте его отдельно, если он нужен.');
    } catch (error) {
        try {
            const response = await fetch('../data/holidays.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            appHolidays = parseHolidays(await response.json());
        } catch (fallbackError) {
            appHolidays = [];
            setHolidayStatus(`Не удалось загрузить праздники: ${fallbackError.message}`, true);
        }
        renderAdminHolidays();
        if (!document.getElementById('holiday-status').classList.contains('error')) {
            setHolidayStatus(`Supabase недоступен; показан опубликованный список. ${error.message}`, true);
        }
    }
}

function renderAdminHolidays() {
    const list = document.getElementById('holidays-list');
    if (!list) return;

    if (!appHolidays.length) {
        list.innerHTML = '<div class="empty">Праздники пока не добавлены.</div>';
        return;
    }

    list.innerHTML = renderCollapsibleList(appHolidays, (holiday, index) => `
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
    `);
}

async function saveHoliday() {
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
        await window.BuhloSupabase.replaceHolidays(updated);
        appHolidays = updated;
        renderAdminHolidays();
        resetHolidayForm();
        setHolidayStatus('Праздники сохранены в Supabase.');
    } catch (error) {
        setHolidayStatus(`Не удалось сохранить праздники: ${error.message}`, true);
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

async function deleteHoliday(index) {
    const holiday = appHolidays[index];
    if (!holiday || !confirm(`Удалить праздник «${holiday.name}»?`)) return;

    const updated = appHolidays.filter((_, itemIndex) => itemIndex !== index);
    try {
        await window.BuhloSupabase.replaceHolidays(updated);
        appHolidays = updated;
        renderAdminHolidays();
        if (editingHolidayIndex === index) {
            resetHolidayForm();
        } else if (editingHolidayIndex !== null && editingHolidayIndex > index) {
            editingHolidayIndex -= 1;
        }
        setHolidayStatus('Праздник удалён из Supabase.');
    } catch (error) {
        setHolidayStatus(`Не удалось удалить праздник: ${error.message}`, true);
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

async function migrateHolidayDraft() {
    try {
        const draft = localStorage.getItem(HOLIDAYS_DRAFT_KEY);
        if (draft === null || !confirm('Заменить список праздников в Supabase старым локальным черновиком?')) return;
        const holidays = parseHolidays(draft);
        await window.BuhloSupabase.replaceHolidays(holidays);
        appHolidays = holidays;
        localStorage.removeItem(HOLIDAYS_DRAFT_KEY);
        document.getElementById('legacy-holiday-draft').classList.add('hidden');
        renderAdminHolidays();
        setHolidayStatus('Старый черновик перенесён в Supabase.');
    } catch (error) {
        setHolidayStatus(`Не удалось перенести черновик: ${error.message}`, true);
    }
}

async function syncHolidaysWithServer(action) {
    try {
        if (action === 'save') {
            if (appHolidays.length === 0) {
                const response = await fetch('../data/holidays.json', { cache: 'no-store' });
                if (!response.ok) throw new Error(`Не удалось загрузить data/holidays.json (HTTP ${response.status})`);
                const published = parseHolidays(await response.json());
                if (published.length === 0) {
                    setHolidayStatus('Опубликованный файл holidays.json тоже пуст.', true);
                    return;
                }
                if (!confirm(`В Supabase список пуст. Импортировать ${published.length} записей из data/holidays.json?`)) {
                    return;
                }
                await window.BuhloSupabase.replaceHolidays(published);
                appHolidays = published;
                renderAdminHolidays();
                setHolidayStatus(`${published.length} праздников импортировано из data/holidays.json в Supabase.`);
                return;
            }
            await window.BuhloSupabase.replaceHolidays(appHolidays);
            setHolidayStatus('Праздники сохранены в Supabase.');
        } else {
            appHolidays = await window.BuhloSupabase.getHolidays();
            renderAdminHolidays();
            setHolidayStatus('Праздники загружены из Supabase.');
        }
    } catch (error) {
        setHolidayStatus(`Синхронизация не удалась: ${error.message}`, true);
    }
}

async function syncEventsWithServer(action) {
    try {
        if (action === 'save') {
            let events = appEvents;
            if (events.length === 0) {
                const response = await fetch('../data/events.json', { cache: 'no-store' });
                if (!response.ok) throw new Error(`Не удалось загрузить data/events.json (HTTP ${response.status})`);
                events = parseEvents(await response.json());
                if (events.length === 0) {
                    setEventsStatus('Опубликованный файл events.json тоже пуст.', true);
                    return;
                }
                if (!confirm(`В Supabase список пуст. Импортировать ${events.length} записей из data/events.json?`)) {
                    return;
                }
            }
            await window.BuhloSupabase.replaceEvents(events);
            appEvents = await window.BuhloSupabase.getEvents();
            localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
            renderEvents();
            setEventsStatus('События сохранены в Supabase.');
        } else {
            appEvents = await window.BuhloSupabase.getEvents();
            localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
            appRegistrations = await window.BuhloSupabase.getAdminRegistrations();
            renderEvents();
            setEventsStatus('События загружены из Supabase.');
        }
    } catch (error) {
        setEventsStatus(`Синхронизация не удалась: ${error.message}`, true);
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

const ADMIN_LIST_LIMIT = 5;

function renderCollapsibleList(items, renderItem) {
    const head = items.slice(0, ADMIN_LIST_LIMIT).map(renderItem).join('');
    if (items.length <= ADMIN_LIST_LIMIT) return head;
    const rest = items.slice(ADMIN_LIST_LIMIT).map((item, offset) => renderItem(item, offset + ADMIN_LIST_LIMIT)).join('');
    return `${head}<details class="list-more"><summary>Показать остальные (${items.length - ADMIN_LIST_LIMIT})</summary>${rest}</details>`;
}

function renderAdminBirthdays() {
    const list = document.getElementById('birthdays-list');
    if (!list) return;

    if (!appBirthdays.length) {
        list.innerHTML = '<div class="empty">Дни рождения пока не добавлены.</div>';
        return;
    }

    list.innerHTML = renderCollapsibleList(appBirthdays, (birthday, index) => `
        <div class="event-item">
            <h4>${escapeHtml(birthday.name)}</h4>
            <div class="event-meta"><span class="tag">${formatDate(birthday.date)}</span></div>
            <div class="event-actions">
                <button type="button" onclick="editBirthday(${index})">Редактировать</button>
                <button type="button" class="danger" onclick="deleteBirthday(${index})">Удалить</button>
            </div>
        </div>
    `);
}

async function saveBirthday() {
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
        await window.BuhloSupabase.replaceBirthdays(updated);
        appBirthdays = updated;
        renderAdminBirthdays();
        resetBirthdayForm();
        setBirthdayStatus('Дни рождения сохранены в Supabase.');
    } catch (error) {
        setBirthdayStatus(`Не удалось сохранить дни рождения: ${error.message}`, true);
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

async function deleteBirthday(index) {
    const birthday = appBirthdays[index];
    if (!birthday || !confirm(`Удалить день рождения «${birthday.name}»?`)) return;

    const updated = appBirthdays.filter((_, itemIndex) => itemIndex !== index);
    try {
        await window.BuhloSupabase.replaceBirthdays(updated);
        appBirthdays = updated;
        renderAdminBirthdays();
        if (editingBirthdayIndex === index) {
            resetBirthdayForm();
        } else if (editingBirthdayIndex !== null && editingBirthdayIndex > index) {
            editingBirthdayIndex -= 1;
        }
        setBirthdayStatus('Запись удалена из Supabase.');
    } catch (error) {
        setBirthdayStatus(`Не удалось удалить день рождения: ${error.message}`, true);
    }
}

function resetBirthdayForm() {
    editingBirthdayIndex = null;
    document.getElementById('birthday-name').value = '';
    document.getElementById('birthday-date').value = '';
    document.getElementById('save-birthday-button').textContent = 'Сохранить день рождения';
    document.getElementById('birthday-form-title').textContent = 'Добавить день рождения';
}

async function migrateBirthdayDraft() {
    try {
        const draft = localStorage.getItem(BIRTHDAYS_DRAFT_KEY);
        if (draft === null || !confirm('Заменить дни рождения в Supabase старым локальным черновиком?')) return;
        const birthdays = parseBirthdays(draft);
        await window.BuhloSupabase.replaceBirthdays(birthdays);
        appBirthdays = birthdays;
        localStorage.removeItem(BIRTHDAYS_DRAFT_KEY);
        document.getElementById('legacy-birthday-draft').classList.add('hidden');
        renderAdminBirthdays();
        setBirthdayStatus('Старый черновик перенесён в Supabase.');
    } catch (error) {
        setBirthdayStatus(`Не удалось перенести черновик: ${error.message}`, true);
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
    setBirthdayStatus('Резервная копия birthdays.json скачана.');
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
    setHolidayStatus('Резервная копия holidays.json скачана.');
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
    reader.onload = async () => {
        try {
            if (typeof reader.result !== 'string') throw new Error('Не удалось прочитать файл');
            const imported = parseHolidays(reader.result);
            if (!confirm('Полностью заменить список праздников в общей базе данными из этого файла?')) return;
            await window.BuhloSupabase.replaceHolidays(imported);
            appHolidays = imported;
            renderAdminHolidays();
            setHolidayStatus('JSON импортирован в Supabase.');
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
    reader.onload = async () => {
        try {
            if (typeof reader.result !== 'string') throw new Error('Не удалось прочитать файл');
            const imported = parseBirthdays(reader.result);
            if (!confirm('Полностью заменить список дней рождения в общей базе данными из этого файла?')) return;
            await window.BuhloSupabase.replaceBirthdays(imported);
            appBirthdays = imported;
            renderAdminBirthdays();
            setBirthdayStatus('JSON импортирован в Supabase.');
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
    appBirthdays = await window.BuhloSupabase.getBirthdays();
    renderAdminBirthdays();
}

async function saveBirthdaysToServer() {
    await window.BuhloSupabase.replaceBirthdays(appBirthdays);
}

async function syncBirthdaysWithServer(action) {
    try {
        if (action === 'save') {
            if (appBirthdays.length === 0) {
                const response = await fetch('../data/birthdays.json', { cache: 'no-store' });
                if (!response.ok) throw new Error(`Не удалось загрузить data/birthdays.json (HTTP ${response.status})`);
                const published = parseBirthdays(await response.json());
                if (published.length === 0) {
                    setBirthdayStatus('Опубликованный файл birthdays.json тоже пуст.', true);
                    return;
                }
                if (!confirm(`В Supabase список пуст. Импортировать ${published.length} записей из data/birthdays.json?`)) {
                    return;
                }
                await window.BuhloSupabase.replaceBirthdays(published);
                appBirthdays = published;
                renderAdminBirthdays();
                setBirthdayStatus(`${published.length} дней рождения импортировано из data/birthdays.json в Supabase.`);
                return;
            }
            await saveBirthdaysToServer();
            setBirthdayStatus('Дни рождения сохранены в Supabase.');
        } else {
            await loadBirthdaysFromServer();
            setBirthdayStatus('Дни рождения загружены из Supabase.');
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

    list.innerHTML = renderCollapsibleList(appEvents, event => {
        const participants = Array.isArray(event.participants) ? event.participants : [];
        const registrations = appRegistrations.filter(item => item.event_id === event.id);
        return `
            <div class="event-item">
                <h4>${escapeHtml(event.title || 'Без названия')}</h4>
                <p>${escapeHtml(event.description || 'Описание отсутствует')}</p>
                <div class="event-meta">
                    <span class="tag">${event.date ? formatDate(event.date) : 'Дата не указана'}</span>
                    ${event.recurrence === 'yearly' ? '<span class="tag">Ежегодно</span>' : ''}
                    <span class="tag">${escapeHtml(event.time || 'Время не указано')}</span>
                    <span class="tag">${escapeHtml(event.location || 'Место не указано')}</span>
                    <span class="tag">${participants.length}/${event.maxParticipants || 30}</span>
                </div>
                ${registrations.length ? `<div class="registration-list"><strong>Записи:</strong>${registrations.map(person =>
                    `<div class="registration-row${pendingRegistrationDeletes.has(person.id) ? ' pending-delete' : ''}"><p>${escapeHtml(person.name)} — ${escapeHtml(person.contact || 'не указан')}${person.notes ? `; ${escapeHtml(person.notes)}` : ''}</p>${pendingRegistrationDeletes.has(person.id)
                    ? `<button type="button" class="secondary" onclick="toggleRegistrationDelete(${person.id})">Отмена</button>`
                    : `<button type="button" class="danger" onclick="toggleRegistrationDelete(${person.id})">Удалить</button>`}</div>`
                ).join('')}</div>` : ''}
                ${registrations.some(person => pendingRegistrationDeletes.has(person.id))
                    ? `<button type="button" class="danger" onclick="confirmRegistrationDeletes(${event.id})">Подтвердить удаление в базе (${registrations.filter(person => pendingRegistrationDeletes.has(person.id)).length})</button>` : ''}
                <div class="event-actions">
                    <button type="button" onclick="editEvent(${event.id})">Редактировать</button>
                    <button type="button" class="danger" onclick="deleteEvent(${event.id})">Удалить</button>
                </div>
            </div>
        `;
    });
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

    const existingIndex = appEvents.findIndex(item => item.id === editingEventId);
    const previous = existingIndex >= 0 ? appEvents[existingIndex] : null;
    const event = {
        ...(previous || {}),
        title,
        date,
        time,
        recurrence,
        location: location || previous?.location || 'Место не указано',
        description: description || previous?.description || 'Описание события скоро появится.',
        participants: previous?.participants || [],
        maxParticipants: limit
    };

    try {
        const saved = await window.BuhloSupabase.saveEvent(event);
        if (existingIndex >= 0) appEvents[existingIndex] = saved;
        else appEvents.unshift(saved);
        localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
        renderEvents();
        resetForm();
        setEventsStatus('Событие сохранено в Supabase.');
    } catch (error) {
        setEventsStatus(`Не удалось сохранить событие: ${error.message}`, true);
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

    document.getElementById('save-event-button').textContent = 'Обновить событие';
    document.getElementById('event-form-title').textContent = 'Редактировать событие';
}

async function deleteEvent(eventId) {
    if (!confirm('Удалить событие?')) return;
    try {
        await window.BuhloSupabase.deleteEvent(eventId);
    } catch (error) {
        setEventsStatus(`Не удалось удалить событие: ${error.message}`, true);
        return;
    }
    appEvents = appEvents.filter(item => item.id !== eventId);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
    renderEvents();
    if (editingEventId === eventId) resetForm();
    appRegistrations = appRegistrations.filter(item => item.event_id !== eventId);
    setEventsStatus('Событие удалено из Supabase.');
}

function toggleRegistrationDelete(registrationId) {
    if (pendingRegistrationDeletes.has(registrationId)) pendingRegistrationDeletes.delete(registrationId);
    else pendingRegistrationDeletes.add(registrationId);
    renderEvents();
}

async function confirmRegistrationDeletes(eventId) {
    const ids = appRegistrations
        .filter(item => item.event_id === eventId && pendingRegistrationDeletes.has(item.id))
        .map(item => item.id);
    if (!ids.length || !confirm(`Удалить из базы участников: ${ids.length}?`)) return;
    try {
        for (const id of ids) {
            await window.BuhloSupabase.deleteRegistration(id);
            pendingRegistrationDeletes.delete(id);
            appRegistrations = appRegistrations.filter(item => item.id !== id);
        }
        setEventsStatus('Участники удалены из базы.');
    } catch (error) {
        setEventsStatus(`Не удалось удалить участника в базе: ${error.message}`, true);
    }
    renderEvents();
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

    document.getElementById('save-event-button').textContent = 'Сохранить событие';
    document.getElementById('event-form-title').textContent = 'Добавить событие';
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
            const imported = parseEvents(event.target.result);
            if (!confirm('Заменить список событий в общей базе данными из файла? Удалённые из файла события и их регистрации будут удалены.')) return;
            await window.BuhloSupabase.replaceEvents(imported);
            appEvents = imported;
            await loadEvents();
            localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
            renderEvents();
            setEventsStatus('JSON импортирован в Supabase.');
        } catch (error) {
            setEventsStatus(`Ошибка импорта: ${error.message}`, true);
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

async function loadEventsFromServer() {
    await loadEvents();
}

async function changeAdminPassword() {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const messageBox = document.getElementById('password-message');

    if (!newPassword || !confirmPassword) {
        messageBox.textContent = 'Заполните все поля';
        messageBox.classList.remove('hidden', 'error');
        messageBox.classList.add('error');
        return;
    }
    if (newPassword.length < 8) {
        messageBox.textContent = 'Новый пароль должен быть не короче 8 символов';
        messageBox.classList.remove('hidden', 'error');
        messageBox.classList.add('error');
        return;
    }
    if (newPassword !== confirmPassword) {
        messageBox.textContent = 'Новый пароль и подтверждение не совпадают';
        messageBox.classList.remove('hidden', 'error');
        messageBox.classList.add('error');
        return;
    }

    try {
        await window.BuhloSupabase.changePassword(newPassword);
        messageBox.textContent = 'Пароль обновлён в Supabase Auth.';
        messageBox.classList.remove('hidden', 'error');
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
    } catch (error) {
        messageBox.textContent = `Не удалось сменить пароль: ${error.message}`;
        messageBox.classList.remove('hidden');
        messageBox.classList.add('error');
    }
}

document.addEventListener('click', function (event) {
    const button = event.target.closest('.btn, button');
    if (!button || button.disabled ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${(event.clientX || rect.left + rect.width / 2) - rect.left - size / 2}px`;
    ripple.style.top = `${(event.clientY || rect.top + rect.height / 2) - rect.top - size / 2}px`;
    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
});

document.addEventListener('DOMContentLoaded', function () {
    // Session-only auth: admin must login on each page load
    if (!isAdminAuthenticated) {
        showAuth();
    }
});

window.onbeforeunload = function() {
    window.BuhloSupabase.signOut();
    isAdminAuthenticated = false;
};
