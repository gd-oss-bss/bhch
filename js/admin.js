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
    document.getElementById('stats-view').classList.add('hidden');
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
        await Promise.all([loadEvents(), loadAdminBirthdays(), loadAdminHolidays(), loadAdminHubQuestions(), loadAdminGallery()]);
    } catch (loginError) {
        error.textContent = /invalid_credentials/.test(loginError.message)
            ? 'Отрезвей, а потом заходи в админку! Забыл пароль? Проверь под крышкой! Алкач'
            : loginError.message;
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
    document.getElementById('stats-view').classList.add('hidden');
    document.getElementById('view-toggle').textContent = 'Статистика';
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
            setEventsStatus('База событий пуста. Добавьте события или восстановите их из бэкапа.');
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
            setBirthdayStatus('База дней рождения пуста. Добавьте записи или восстановите их из бэкапа.');
        }
        renderAdminBirthdays();
        const hasDraft = localStorage.getItem(BIRTHDAYS_DRAFT_KEY) !== null;
        document.getElementById('legacy-birthday-draft').classList.toggle('hidden', !hasDraft);
        if (hasDraft) setBirthdayStatus('Найден старый локальный черновик; он не удалён. Импортируйте его отдельно, если он нужен.');
    } catch (error) {
        appBirthdays = [];
        renderAdminBirthdays();
        setBirthdayStatus(`Не удалось загрузить дни рождения из Supabase: ${error.message}`, true);
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
            setHolidayStatus('База праздников пуста. Добавьте записи или восстановите их из бэкапа.');
        }
        renderAdminHolidays();
        const hasDraft = localStorage.getItem(HOLIDAYS_DRAFT_KEY) !== null;
        document.getElementById('legacy-holiday-draft').classList.toggle('hidden', !hasDraft);
        if (hasDraft) setHolidayStatus('Найден старый локальный черновик; он не удалён. Импортируйте его отдельно, если он нужен.');
    } catch (error) {
        appHolidays = [];
        renderAdminHolidays();
        setHolidayStatus(`Не удалось загрузить праздники из Supabase: ${error.message}`, true);
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
        appHolidays = await window.BuhloSupabase.getHolidays();
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

    try {
        if (holiday.id === undefined) {
            appHolidays = await window.BuhloSupabase.getHolidays();
            const fresh = appHolidays.find(item => item.date === holiday.date && item.name === holiday.name);
            if (!fresh) throw new Error('праздник уже удалён в базе');
            holiday.id = fresh.id;
        }
        await window.BuhloSupabase.deleteHoliday(holiday.id);
        appHolidays = await window.BuhloSupabase.getHolidays();
        renderAdminHolidays();
        if (editingHolidayIndex === index) {
            resetHolidayForm();
        } else if (editingHolidayIndex !== null && editingHolidayIndex > index) {
            editingHolidayIndex -= 1;
        }
        setHolidayStatus('Праздник удалён из Supabase.');
    } catch (error) {
        renderAdminHolidays();
        setHolidayStatus(`Не удалось удалить праздник: ${error.message}`, true);
        alert(`Не удалось удалить праздник: ${error.message}`);
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
        appHolidays = await window.BuhloSupabase.getHolidays();
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
                setHolidayStatus('Список пуст: сохранение очистило бы базу. Восстановите данные из бэкапа.', true);
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
            const events = appEvents;
            if (events.length === 0) {
                setEventsStatus('Список пуст. Восстановите события из бэкапа или добавьте их вручную.', true);
                return;
            }
            // Только добавляем и обновляем: события, которых нет в этом списке, не удаляются.
            for (const item of events) {
                await window.BuhloSupabase.saveEvent(item);
            }
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

function setHolidayStatus(message, isError = false) {
    const status = document.getElementById('holiday-status');
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (isError) status.classList.add('error');
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
                setBirthdayStatus('Список пуст: сохранение очистило бы базу. Восстановите данные из бэкапа.', true);
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

function parseBackupList(data, key) {
    const list = Array.isArray(data) ? data : data?.[key];
    if (!Array.isArray(list)) throw new Error(`В бэкапе нет списка "${key}"`);
    return list;
}

async function backupEventsToStorage() {
    try {
        await window.BuhloSupabase.uploadBackup('events', { events: appEvents });
        setEventsStatus(`Бэкап событий сохранён в Storage (${appEvents.length}).`);
    } catch (error) {
        setEventsStatus(`Не удалось сохранить бэкап: ${error.message}`, true);
    }
}

async function restoreEventsFromStorage() {
    try {
        const events = parseBackupList(await window.BuhloSupabase.downloadBackup('events'), 'events');
        if (!confirm(`Восстановить из бэкапа события: ${events.length}? Существующие события с теми же id будут перезаписаны, остальные не удаляются.`)) return;
        for (const item of events) {
            await window.BuhloSupabase.saveEvent(item);
        }
        await loadEvents();
        setEventsStatus(`События восстановлены из бэкапа (${events.length}).`);
    } catch (error) {
        setEventsStatus(`Не удалось восстановить из бэкапа: ${error.message}`, true);
    }
}

async function backupBirthdaysToStorage() {
    try {
        await window.BuhloSupabase.uploadBackup('birthdays', { birthdays: appBirthdays });
        setBirthdayStatus(`Бэкап дней рождения сохранён в Storage (${appBirthdays.length}).`);
    } catch (error) {
        setBirthdayStatus(`Не удалось сохранить бэкап: ${error.message}`, true);
    }
}

async function restoreBirthdaysFromStorage() {
    try {
        const birthdays = parseBackupList(await window.BuhloSupabase.downloadBackup('birthdays'), 'birthdays');
        if (!confirm(`Заменить дни рождения в базе данными из бэкапа (${birthdays.length})?`)) return;
        await window.BuhloSupabase.replaceBirthdays(birthdays);
        appBirthdays = birthdays;
        renderAdminBirthdays();
        setBirthdayStatus(`Дни рождения восстановлены из бэкапа (${birthdays.length}).`);
    } catch (error) {
        setBirthdayStatus(`Не удалось восстановить из бэкапа: ${error.message}`, true);
    }
}

async function backupHolidaysToStorage() {
    try {
        await window.BuhloSupabase.uploadBackup('holidays', { holidays: appHolidays });
        setHolidayStatus(`Бэкап праздников сохранён в Storage (${appHolidays.length}).`);
    } catch (error) {
        setHolidayStatus(`Не удалось сохранить бэкап: ${error.message}`, true);
    }
}

async function restoreHolidaysFromStorage() {
    try {
        const holidays = parseBackupList(await window.BuhloSupabase.downloadBackup('holidays'), 'holidays');
        if (!confirm(`Заменить праздники в базе данными из бэкапа (${holidays.length})?`)) return;
        await window.BuhloSupabase.replaceHolidays(holidays);
        appHolidays = await window.BuhloSupabase.getHolidays();
        renderAdminHolidays();
        setHolidayStatus(`Праздники восстановлены из бэкапа (${holidays.length}).`);
    } catch (error) {
        setHolidayStatus(`Не удалось восстановить из бэкапа: ${error.message}`, true);
    }
}
async function loadEventsFromServer() {
    await loadEvents();
}

let appHubQuestions = [];
let editingHubQuestionId = null;

function setHubQuestionStatus(message, isError = false) {
    const status = document.getElementById('hub-question-status');
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (isError) status.classList.add('error');
}

function getHubQuestionState(item) {
    const today = new Date().toLocaleDateString('sv', { timeZone: 'Europe/Moscow' });
    if (item.available_from && item.available_from > today) return 'ещё не начался';
    if (item.available_to && item.available_to < today) return 'истёк';
    return 'активен';
}

function renderAdminHubQuestions() {
    const list = document.getElementById('hub-questions-list');
    if (!list) return;

    if (!appHubQuestions.length) {
        list.innerHTML = '<div class="empty">Вопросов пока нет: вход на хаб закрыт.</div>';
        return;
    }

    list.innerHTML = renderCollapsibleList(appHubQuestions, item => `
        <div class="event-item">
            <h4>${escapeHtml(item.question)}</h4>
            ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
            <div class="event-meta">
                <span class="tag">${escapeHtml(getHubQuestionState(item))}</span>
                <span class="tag">с ${item.available_from ? formatDate(item.available_from) : '—'}</span>
                <span class="tag">по ${item.available_to ? formatDate(item.available_to) : '—'}</span>
            </div>
            <div class="event-actions">
                <button type="button" onclick="editHubQuestion(${item.id})">Редактировать</button>
                <button type="button" class="danger" onclick="deleteHubQuestion(${item.id})">Удалить</button>
            </div>
        </div>
    `);
}

async function loadAdminHubQuestions() {
    try {
        appHubQuestions = await window.BuhloSupabase.getHubQuestions();
        setHubQuestionStatus(appHubQuestions.length
            ? 'Вопросы загружены из Supabase.'
            : 'Вопросов пока нет: вход на хаб закрыт. Добавьте вопрос.');
    } catch (error) {
        appHubQuestions = [];
        setHubQuestionStatus(`Не удалось загрузить вопросы: ${error.message}`, true);
    }
    renderAdminHubQuestions();
}

async function saveHubQuestion() {
    const question = document.getElementById('hub-question-text').value.trim();
    const answer = document.getElementById('hub-question-answer').value;
    const description = document.getElementById('hub-question-description').value.trim();
    const availableFrom = document.getElementById('hub-question-from').value;
    const availableTo = document.getElementById('hub-question-to').value;

    if (!question) {
        setHubQuestionStatus('Укажите вопрос.', true);
        return;
    }
    if (editingHubQuestionId === null && !answer.trim()) {
        setHubQuestionStatus('Для нового вопроса укажите правильный ответ.', true);
        return;
    }
    if (availableFrom && availableTo && availableTo < availableFrom) {
        setHubQuestionStatus('Дата «по» не может быть раньше даты «с».', true);
        return;
    }

    try {
        await window.BuhloSupabase.saveHubQuestion({
            id: editingHubQuestionId,
            question,
            answer,
            description,
            availableFrom,
            availableTo
        });
        resetHubQuestionForm();
        await loadAdminHubQuestions();
        setHubQuestionStatus('Вопрос сохранён в Supabase.');
    } catch (error) {
        setHubQuestionStatus(`Не удалось сохранить вопрос: ${error.message}`, true);
    }
}

function editHubQuestion(id) {
    const item = appHubQuestions.find(entry => entry.id === id);
    if (!item) return;
    editingHubQuestionId = id;
    document.getElementById('hub-question-text').value = item.question;
    document.getElementById('hub-question-answer').value = '';
    document.getElementById('hub-question-answer').placeholder = 'Новый ответ (пусто — не менять)';
    document.getElementById('hub-question-description').value = item.description || '';
    document.getElementById('hub-question-from').value = item.available_from || '';
    document.getElementById('hub-question-to').value = item.available_to || '';
    document.getElementById('save-hub-question-button').textContent = 'Сохранить изменения';
    document.getElementById('hub-question-form-title').textContent = 'Редактировать вопрос входа';
    document.getElementById('hub-question-text').focus();
}

function resetHubQuestionForm() {
    editingHubQuestionId = null;
    ['hub-question-text', 'hub-question-answer', 'hub-question-description', 'hub-question-from', 'hub-question-to']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('hub-question-answer').placeholder = 'Правильный ответ';
    document.getElementById('save-hub-question-button').textContent = 'Сохранить вопрос';
    document.getElementById('hub-question-form-title').textContent = 'Добавить вопрос входа';
}

async function deleteHubQuestion(id) {
    if (!confirm('Удалить вопрос входа из базы?')) return;
    try {
        await window.BuhloSupabase.deleteHubQuestion(id);
        if (editingHubQuestionId === id) resetHubQuestionForm();
        await loadAdminHubQuestions();
        setHubQuestionStatus('Вопрос удалён.');
    } catch (error) {
        setHubQuestionStatus(`Не удалось удалить вопрос: ${error.message}`, true);
    }
}

let appGalleryCategories = [];
let appGalleryPhotos = [];
let editingGalleryCategoryId = null;
const GALLERY_MAX_BYTES = 10 * 1024 * 1024;
const GALLERY_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function setGalleryCategoryStatus(message, isError = false) {
    const status = document.getElementById('gallery-category-status');
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (isError) status.classList.add('error');
}

function setGalleryPhotoStatus(message, isError = false) {
    const status = document.getElementById('gallery-photo-status');
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (isError) status.classList.add('error');
}

async function loadAdminGallery() {
    try {
        [appGalleryCategories, appGalleryPhotos] = await Promise.all([
            window.BuhloSupabase.getGalleryCategories(),
            window.BuhloSupabase.getGalleryPhotos()
        ]);
        setGalleryCategoryStatus(appGalleryCategories.length
            ? 'Галерея загружена из Supabase.'
            : 'Категорий пока нет. Добавьте первую, затем загрузите фото.');
    } catch (error) {
        appGalleryCategories = [];
        appGalleryPhotos = [];
        setGalleryCategoryStatus(`Не удалось загрузить галерею: ${error.message}`, true);
    }
    renderAdminGallery();
}

function renderAdminGallery() {
    const select = document.getElementById('gallery-upload-category');
    const previous = select.value;
    select.innerHTML = appGalleryCategories.length
        ? appGalleryCategories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')
        : '<option value="">Сначала добавьте категорию</option>';
    if (appGalleryCategories.some(category => String(category.id) === previous)) select.value = previous;

    const categories = document.getElementById('gallery-categories-list');
    categories.innerHTML = appGalleryCategories.length
        ? renderCollapsibleList(appGalleryCategories, category => `
            <div class="event-item">
                <h4>${escapeHtml(category.name)}</h4>
                <div class="event-meta"><span class="tag">Фото: ${appGalleryPhotos.filter(photo => photo.category_id === category.id).length}</span></div>
                <div class="event-actions">
                    <button type="button" onclick="editGalleryCategory(${category.id})">Переименовать</button>
                    <button type="button" class="danger" onclick="deleteGalleryCategory(${category.id})">Удалить</button>
                </div>
            </div>
        `)
        : '<div class="empty">Категорий пока нет.</div>';

    const photos = document.getElementById('gallery-photos-list');
    photos.querySelectorAll('img[data-blob]').forEach(image => URL.revokeObjectURL(image.dataset.blob));
    photos.innerHTML = appGalleryPhotos.length
        ? renderCollapsibleList(appGalleryPhotos, photo => {
            const category = appGalleryCategories.find(item => item.id === photo.category_id);
            return `
            <div class="event-item gallery-admin-item">
                <img class="gallery-admin-thumb" alt="" data-path="${escapeHtml(photo.thumb_path || photo.path)}" />
                <div>
                    <h4>${escapeHtml(photo.caption || 'Без подписи')}</h4>
                    <div class="event-meta"><span class="tag">${escapeHtml(category ? category.name : '—')}</span></div>
                    <div class="event-actions">
                        <button type="button" class="danger" onclick="deleteGalleryPhoto(${photo.id})">Удалить</button>
                    </div>
                </div>
            </div>`;
        })
        : '<div class="empty">Фото пока нет.</div>';
    photos.querySelectorAll('img[data-path]').forEach(async image => {
        try {
            image.src = await window.BuhloSupabase.getStorageBlobUrl(image.dataset.path);
            image.dataset.blob = image.src;
        } catch (error) {
            image.alt = 'Нет превью';
        }
    });
}

async function saveGalleryCategory() {
    const name = document.getElementById('gallery-category-name').value.trim();
    if (!name || name.length > 60) {
        setGalleryCategoryStatus('Укажите название категории (до 60 символов).', true);
        return;
    }
    try {
        await window.BuhloSupabase.saveGalleryCategory({ id: editingGalleryCategoryId, name });
        resetGalleryCategoryForm();
        await loadAdminGallery();
        setGalleryCategoryStatus('Категория сохранена в Supabase.');
    } catch (error) {
        const duplicate = /23505|duplicate/i.test(error.message);
        setGalleryCategoryStatus(duplicate ? 'Категория с таким названием уже есть.' : `Не удалось сохранить категорию: ${error.message}`, true);
    }
}

function editGalleryCategory(id) {
    const category = appGalleryCategories.find(item => item.id === id);
    if (!category) return;
    editingGalleryCategoryId = id;
    document.getElementById('gallery-category-name').value = category.name;
    document.getElementById('save-gallery-category-button').textContent = 'Сохранить изменения';
    document.getElementById('gallery-category-form-title').textContent = 'Переименовать категорию';
    document.getElementById('gallery-category-name').focus();
}

function resetGalleryCategoryForm() {
    editingGalleryCategoryId = null;
    document.getElementById('gallery-category-name').value = '';
    document.getElementById('save-gallery-category-button').textContent = 'Сохранить категорию';
    document.getElementById('gallery-category-form-title').textContent = 'Добавить категорию галереи';
}

async function deleteGalleryCategory(id) {
    const category = appGalleryCategories.find(item => item.id === id);
    if (!category) return;
    const photos = appGalleryPhotos.filter(photo => photo.category_id === id);
    const warning = photos.length ? ` Вместе с ней будут удалены фото: ${photos.length}.` : '';
    if (!confirm(`Удалить категорию «${category.name}»?${warning}`)) return;
    try {
        await window.BuhloSupabase.deleteStorageFiles(photos.flatMap(photo => [photo.path, photo.thumb_path]));
        await window.BuhloSupabase.deleteGalleryCategory(id);
        if (editingGalleryCategoryId === id) resetGalleryCategoryForm();
        await loadAdminGallery();
        setGalleryCategoryStatus('Категория удалена.');
    } catch (error) {
        setGalleryCategoryStatus(`Не удалось удалить категорию: ${error.message}`, true);
        alert(`Не удалось удалить категорию: ${error.message}`);
    }
}

async function createGalleryThumbnail(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 480 / bitmap.height, 640 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('не удалось создать превью');
    return blob;
}

async function uploadGalleryPhotos() {
    const categoryId = Number(document.getElementById('gallery-upload-category').value);
    const caption = document.getElementById('gallery-upload-caption').value.trim();
    const input = document.getElementById('gallery-upload-files');
    const files = Array.from(input.files || []);
    const button = document.getElementById('upload-gallery-button');

    if (!categoryId) {
        setGalleryPhotoStatus('Сначала выберите категорию.', true);
        return;
    }
    if (!files.length) {
        setGalleryPhotoStatus('Выберите хотя бы один файл.', true);
        return;
    }
    const invalid = files.find(file => !GALLERY_TYPES[file.type] || file.size > GALLERY_MAX_BYTES);
    if (invalid) {
        setGalleryPhotoStatus(`Файл «${invalid.name}» не подходит: нужен JPG, PNG, WebP или GIF до 10 МБ.`, true);
        return;
    }

    button.disabled = true;
    let uploaded = 0;
    try {
        for (const file of files) {
            setGalleryPhotoStatus(`Загрузка ${uploaded + 1} из ${files.length}: ${file.name}`);
            const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
            const path = `gallery/${categoryId}/${key}.${GALLERY_TYPES[file.type]}`;
            const thumbPath = `gallery/${categoryId}/thumbs/${key}.jpg`;
            const thumb = await createGalleryThumbnail(file);
            await window.BuhloSupabase.uploadStorageFile(path, file);
            try {
                await window.BuhloSupabase.uploadStorageFile(thumbPath, thumb);
                await window.BuhloSupabase.addGalleryPhoto({ category_id: categoryId, path, thumb_path: thumbPath, caption });
            } catch (error) {
                await window.BuhloSupabase.deleteStorageFiles([path, thumbPath]).catch(() => {});
                throw error;
            }
            uploaded += 1;
        }
        input.value = '';
        document.getElementById('gallery-upload-caption').value = '';
        await loadAdminGallery();
        setGalleryPhotoStatus(`Загружено фото: ${uploaded}.`);
    } catch (error) {
        await loadAdminGallery();
        setGalleryPhotoStatus(`Загружено ${uploaded} из ${files.length}. Ошибка: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
}

async function deleteGalleryPhoto(id) {
    const photo = appGalleryPhotos.find(item => item.id === id);
    if (!photo || !confirm('Удалить фото из галереи и из Storage?')) return;
    try {
        await window.BuhloSupabase.deleteGalleryPhoto(id);
        await window.BuhloSupabase.deleteStorageFiles([photo.path, photo.thumb_path]).catch(error => {
            console.warn('Файлы фото не удалены из Storage:', error.message);
        });
        await loadAdminGallery();
        setGalleryPhotoStatus('Фото удалено.');
    } catch (error) {
        setGalleryPhotoStatus(`Не удалось удалить фото: ${error.message}`, true);
        alert(`Не удалось удалить фото: ${error.message}`);
    }
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
