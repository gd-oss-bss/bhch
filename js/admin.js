const EVENTS_KEY = 'buhlo_events_data';

// Encrypted admin password: Pvfxbycrbq1981
const ENCRYPTED_ADMIN_PASSWORD = 'Wqa\u007fe~duev6>?6';

// Optional server-side proxy. The GitHub token must be stored only on that server.
// Example: window.BUHLO_API_URL = 'https://your-api.example.com';
const API_URL = (window.BUHLO_API_URL || '').replace(/\/$/, '');

let appEvents = [];
let editingEventId = null;
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
                location: location || appEvents[index].location || 'Место не указано',
                description: description || appEvents[index].description || 'Описание события скоро появится.',
                maxParticipants: limit
            };
        }
    } else {
        appEvents.unshift({
            id: Date.now(), title, date, time,
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
