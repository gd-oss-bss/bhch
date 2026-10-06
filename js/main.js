const HUB_AUTH_KEY = 'buhlo_hub_authenticated';
const EVENTS_KEY = 'buhlo_events_data';
const HOLIDAYS_KEY = 'buhlo_holidays_data';
const BIRTHDAYS_KEY = 'buhlo_birthdays_data';
const REGISTRATIONS_KEY = 'buhlo_registrations';

const DEFAULT_EVENTS = [
    {
        id: 2,
        title: '🎂🎉🥃День рождения БХЧ🍹🥂🍻',
        date: '2026-10-02',
        recurrence: 'yearly',
        time: '09:00',
        location: 'Любое место, где продают алкашку',
        description: 'Веселиться, гулять, выпивать, смеяться  и дурить до самого утра в компании лучших собутыльников.',
        participants: [],
        maxParticipants: 30
    }
];

let appEvents = [];
let countdownInterval;
let visibilityListenerAdded = false;
let targetDateString = '';
let isAuthenticated = false;
let appBirthdays = [];
let appHolidays = [];
let eventRefreshTimeout;

let hubQuestionId = null;

async function loadHubQuestion() {
    const question = document.getElementById('hub-question');
    const form = document.getElementById('hub-form');
    if (!question || !form) return;

    hubQuestionId = null;
    form.classList.add('hidden');
    question.textContent = 'Загрузка вопроса…';
    try {
        if (!window.BuhloSupabase?.configured) throw new Error('Supabase не настроен');
        const item = await window.BuhloSupabase.getHubQuestion();
        if (!item) {
            question.textContent = 'Вход временно закрыт.';
            return;
        }
        hubQuestionId = item.id;
        question.textContent = item.question;
        form.classList.remove('hidden');
    } catch (error) {
        console.warn('Контрольный вопрос недоступен:', error.message);
        question.textContent = 'Не удалось загрузить вопрос. Попробуйте позже.';
    }
}

async function checkAuth() {
    const input = document.getElementById('auth-input');
    const error = document.getElementById('auth-error');
    const val = input.value.trim();
    if (hubQuestionId === null || !val) return;

    let correct = false;
    try {
        correct = await window.BuhloSupabase.checkHubAnswer(hubQuestionId, val) === true;
    } catch (requestError) {
        console.warn('Не удалось проверить ответ:', requestError.message);
        error.textContent = 'Не удалось проверить ответ. Попробуйте позже.';
        error.style.display = 'block';
        return;
    }

    input.value = '';
    if (correct) {
        isAuthenticated = true;
        if (document.getElementById('remember-auth').checked) {
            localStorage.setItem(HUB_AUTH_KEY, 'true');
        } else {
            localStorage.removeItem(HUB_AUTH_KEY);
        }
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        initPage();
    } else {
        error.textContent = 'Неверно! Директор расстроится.';
        error.style.display = 'block';
        loadHubQuestion();
    }
}
function logoutHub() {
    closeGalleryPhoto();
    isAuthenticated = false;
    localStorage.removeItem(HUB_AUTH_KEY);
    if (countdownInterval) clearInterval(countdownInterval);
    if (eventRefreshTimeout) clearTimeout(eventRefreshTimeout);
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('auth-input').value = '';
    document.getElementById('remember-auth').checked = false;
    document.getElementById('auth-error').style.display = 'none';
    window.scrollTo(0, 0);
    loadHubQuestion();
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

    isAuthenticated = localStorage.getItem(HUB_AUTH_KEY) === 'true';
    if (!isAuthenticated) {
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('main-content').style.display = 'none';
        loadHubQuestion();
    } else {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        initPage();
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (dateInput) dateInput.min = today;
};

window.onbeforeunload = function() {
    isAuthenticated = false;
};

const TIMER_EVENT_ID = 1790676565667;
let manualTargetDate = null;

function getFallbackTimerDate() {
    const now = new Date();
    const year = now.getFullYear();
    return now > new Date(`${year}-07-17`) ? `${year + 1}-07-17` : `${year}-07-17`;
}

function getTimerEventTarget() {
    const event = appEvents.find(item => Number(item.id) === TIMER_EVENT_ID);
    if (!event || !isValidEventDate(event.date)) return null;
    const today = new Date();
    const date = event.recurrence === 'yearly'
        ? getNextYearlyEventDate(event.date, today)
        : event.date;
    if (!date || date < getLocalDateString(today)) return null;
    const time = /^\d{2}:\d{2}/.test(event.time || '') ? event.time.slice(0, 5) : '00:00';
    return { date, time };
}

function updateTimerFromEvents() {
    if (manualTargetDate) return;
    const target = getTimerEventTarget() || { date: getFallbackTimerDate(), time: '00:00' };
    const dateInput = document.getElementById('destination-date');
    const dateDisplay = document.getElementById('destination-date-display');
    if (dateInput) dateInput.value = target.date;
    if (dateDisplay) dateDisplay.value = formatDateDisplay(target.date);
    targetDateString = `${target.date}T${target.time}:00`;
    startTimer();
}

function initPage() {
    updateTimerFromEvents();
    calculateAlcohol();
    loadEvents();
    loadBirthdays();
    loadHolidays();
    loadGallery();
    trackSiteVisit();
    scheduleEventRefresh();
    if (!visibilityListenerAdded) {
        visibilityListenerAdded = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isAuthenticated) loadEvents();
        });
    }
}

function trackSiteVisit() {
    if (!window.BuhloSupabase?.configured) return;
    try {
        let visitorId = localStorage.getItem('buhlo_visitor_id');
        if (!visitorId) {
            visitorId = crypto.randomUUID();
            localStorage.setItem('buhlo_visitor_id', visitorId);
        }
        window.BuhloSupabase.logSiteVisit(visitorId, 'hub').catch(() => {});
    } catch (error) {
        // статистика не должна ломать сайт
    }
}

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getRegistrationMap(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        throw new Error('Ожидался объект регистраций');
    } catch (error) {
        console.warn(`Повреждён локальный ключ ${key}:`, error.message);
        return {};
    }
}

function isValidEventDate(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
    const date = new Date(`${dateString}T00:00:00`);
    return !Number.isNaN(date.getTime()) && getLocalDateString(date) === dateString;
}

function getNextYearlyEventDate(dateString, today) {
    if (!isValidEventDate(dateString)) return null;
    const monthDay = dateString.slice(5);
    for (let year = today.getFullYear(); year <= today.getFullYear() + 8; year++) {
        const candidateString = `${year}-${monthDay}`;
        if (!isValidEventDate(candidateString)) continue;
        if (candidateString >= getLocalDateString(today)) return candidateString;
    }
    return null;
}

function getYearlyEventDisplayStart(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const previousMonth = new Date(year, month - 2, 1);
    const startDay = Math.min(day, new Date(year, month - 1, 0).getDate());
    previousMonth.setDate(startDay);
    return getLocalDateString(previousMonth);
}

function getVisibleEvents(today = new Date()) {
    const todayString = getLocalDateString(today);
    return appEvents.flatMap(event => {
        if (event.recurrence === 'yearly') {
            const date = getNextYearlyEventDate(event.date, today);
            if (!date || todayString < getYearlyEventDisplayStart(date)) return [];
            return [{ ...event, date }];
        }
        if (isValidEventDate(event.date) &&
            (event.date < todayString || todayString < getYearlyEventDisplayStart(event.date))) return [];
        return [event];
    });
}

function scheduleEventRefresh() {
    if (eventRefreshTimeout) clearTimeout(eventRefreshTimeout);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 50);
    eventRefreshTimeout = setTimeout(() => {
        renderEvents();
        scheduleEventRefresh();
    }, tomorrow.getTime() - Date.now());
}

function updateCustomDate(val) {
    if (!val) return;
    manualTargetDate = val;
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

async function syncLocalRegistrations() {
    const registrations = getRegistrationMap(REGISTRATIONS_KEY);
    const keys = getRegistrationMap('buhlo_registration_keys');
    let changed = false;
    for (const eventId of Object.keys(registrations)) {
        const key = registrations[eventId]?.key;
        if (typeof key !== 'string') continue;
        try {
            if (await window.BuhloSupabase.hasRegistration(Number(eventId), key) === false) {
                delete registrations[eventId];
                delete keys[eventId];
                changed = true;
            }
        } catch (error) {
            console.warn('Не удалось проверить регистрацию в базе:', error.message);
            return;
        }
    }
    if (changed) {
        localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify(registrations));
        localStorage.setItem('buhlo_registration_keys', JSON.stringify(keys));
    }
}

async function loadEvents() {
    if (window.BuhloSupabase?.configured) {
        try {
            const remoteEvents = await window.BuhloSupabase.getEvents();
            appEvents = remoteEvents;
            localStorage.setItem(EVENTS_KEY, JSON.stringify(appEvents));
            updateTimerFromEvents();
            await syncLocalRegistrations();
            renderEvents();
            return;
        } catch (error) {
            console.warn('Supabase events unavailable; using browser cache:', error.message);
        }
    }

    appEvents = getSavedEvents();
    updateTimerFromEvents();
    renderEvents();
}

let galleryCategories = [];
let galleryPhotos = [];
let galleryActiveCategory = 'all';
let galleryVisible = [];
let galleryObserver = null;
let galleryLightboxIndex = -1;
let galleryLightboxUrl = '';

async function loadGallery() {
    const container = document.getElementById('gallery-container');
    if (!container || !window.BuhloSupabase?.configured) return;
    try {
        [galleryCategories, galleryPhotos] = await Promise.all([
            window.BuhloSupabase.getGalleryCategories(),
            window.BuhloSupabase.getGalleryPhotos()
        ]);
        if (galleryActiveCategory !== 'all' &&
            !galleryCategories.some(category => category.id === galleryActiveCategory)) {
            galleryActiveCategory = 'all';
        }
        renderGallery();
    } catch (error) {
        console.warn('Галерея недоступна:', error.message);
        container.innerHTML = '<p class="muted-message">Не удалось загрузить галерею.</p>';
    }
}

function renderGallery() {
    const tabs = document.getElementById('gallery-tabs');
    const container = document.getElementById('gallery-container');
    if (!tabs || !container) return;

    const countFor = id => galleryPhotos.filter(photo => photo.category_id === id).length;
    const items = [{ id: 'all', name: 'Все', count: galleryPhotos.length }]
        .concat(galleryCategories.map(category => ({ ...category, count: countFor(category.id) })));
    tabs.innerHTML = galleryCategories.length ? items.map(item => `
        <button type="button" class="gallery-tab${item.id === galleryActiveCategory ? ' active' : ''}"
            onclick="selectGalleryCategory('${item.id}')">${escapeHtml(item.name)} (${item.count})</button>
    `).join('') : '';

    galleryVisible = galleryActiveCategory === 'all'
        ? galleryPhotos
        : galleryPhotos.filter(photo => photo.category_id === galleryActiveCategory);

    if (galleryObserver) galleryObserver.disconnect();
    container.querySelectorAll('img[data-blob]').forEach(image => URL.revokeObjectURL(image.dataset.blob));

    if (!galleryVisible.length) {
        container.innerHTML = '<p class="muted-message">Фотографий пока нет.</p>';
        return;
    }

    container.innerHTML = galleryVisible.map((photo, index) => `
        <figure class="film-frame" onclick="openGalleryPhoto(${index})">
            <div class="film-photo"><img alt="${escapeHtml(photo.caption || 'Фото встреч')}" data-path="${escapeHtml(photo.thumb_path || photo.path)}" data-full="${escapeHtml(photo.path)}" /></div>
            <figcaption>${escapeHtml(photo.caption || '')}</figcaption>
        </figure>
    `).join('');
    container.scrollLeft = 0;

    const loadThumb = async image => {
        try {
            image.src = await window.BuhloSupabase.getStorageBlobUrl(image.dataset.path);
            image.dataset.blob = image.src;
        } catch (error) {
            if (image.dataset.path !== image.dataset.full) {
                image.dataset.path = image.dataset.full;
                loadThumb(image);
            } else {
                image.closest('.film-photo').classList.add('film-error');
            }
        }
    };
    const images = container.querySelectorAll('img[data-path]');
    if ('IntersectionObserver' in window) {
        galleryObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                galleryObserver.unobserve(entry.target);
                loadThumb(entry.target);
            });
        }, { root: container, rootMargin: '300px' });
        images.forEach(image => galleryObserver.observe(image));
    } else {
        images.forEach(loadThumb);
    }
}

function selectGalleryCategory(id) {
    galleryActiveCategory = id === 'all' ? 'all' : Number(id);
    renderGallery();
}

function getGalleryLightbox() {
    let box = document.getElementById('gallery-lightbox');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'gallery-lightbox';
    box.className = 'gallery-lightbox hidden';
    box.innerHTML = `
        <button type="button" class="lightbox-close" aria-label="Закрыть">✕</button>
        <button type="button" class="lightbox-nav lightbox-prev" aria-label="Назад">‹</button>
        <div class="lightbox-content">
            <div class="lightbox-status">Загрузка…</div>
            <img class="lightbox-image hidden" alt="" />
            <div class="lightbox-caption"></div>
        </div>
        <button type="button" class="lightbox-nav lightbox-next" aria-label="Вперёд">›</button>
    `;
    box.addEventListener('click', event => {
        if (event.target === box) closeGalleryPhoto();
    });
    box.querySelector('.lightbox-close').addEventListener('click', closeGalleryPhoto);
    box.querySelector('.lightbox-prev').addEventListener('click', () => showGalleryPhoto(galleryLightboxIndex - 1));
    box.querySelector('.lightbox-next').addEventListener('click', () => showGalleryPhoto(galleryLightboxIndex + 1));
    document.addEventListener('keydown', event => {
        if (box.classList.contains('hidden')) return;
        if (event.key === 'Escape') closeGalleryPhoto();
        if (event.key === 'ArrowLeft') showGalleryPhoto(galleryLightboxIndex - 1);
        if (event.key === 'ArrowRight') showGalleryPhoto(galleryLightboxIndex + 1);
    });
    document.body.appendChild(box);
    return box;
}

function openGalleryPhoto(index) {
    getGalleryLightbox().classList.remove('hidden');
    document.body.classList.add('lightbox-open');
    showGalleryPhoto(index);
}

async function showGalleryPhoto(index) {
    if (index < 0 || index >= galleryVisible.length) return;
    galleryLightboxIndex = index;
    const box = getGalleryLightbox();
    const image = box.querySelector('.lightbox-image');
    const status = box.querySelector('.lightbox-status');
    const photo = galleryVisible[index];

    image.classList.add('hidden');
    status.textContent = 'Загрузка…';
    status.classList.remove('hidden');
    box.querySelector('.lightbox-caption').textContent = photo.caption || '';
    box.querySelector('.lightbox-prev').disabled = index === 0;
    box.querySelector('.lightbox-next').disabled = index === galleryVisible.length - 1;
    if (galleryLightboxUrl) {
        URL.revokeObjectURL(galleryLightboxUrl);
        galleryLightboxUrl = '';
    }

    try {
        const url = await window.BuhloSupabase.getStorageBlobUrl(photo.path);
        if (galleryLightboxIndex !== index || box.classList.contains('hidden')) {
            URL.revokeObjectURL(url);
            return;
        }
        galleryLightboxUrl = url;
        image.src = url;
        image.alt = photo.caption || 'Фото встреч';
        image.classList.remove('hidden');
        status.classList.add('hidden');
    } catch (error) {
        if (galleryLightboxIndex === index) status.textContent = 'Не удалось загрузить фото.';
    }
}

function closeGalleryPhoto() {
    const box = document.getElementById('gallery-lightbox');
    if (!box) return;
    box.classList.add('hidden');
    document.body.classList.remove('lightbox-open');
    galleryLightboxIndex = -1;
    if (galleryLightboxUrl) {
        URL.revokeObjectURL(galleryLightboxUrl);
        galleryLightboxUrl = '';
    }
    box.querySelector('.lightbox-image').removeAttribute('src');
}
async function loadBirthdays() {
    if (window.BuhloSupabase?.configured) {
        try {
            const remoteBirthdays = await window.BuhloSupabase.getBirthdays();
            appBirthdays = remoteBirthdays;
            localStorage.setItem(BIRTHDAYS_KEY, JSON.stringify(appBirthdays));
            renderBirthdays();
            renderUpcomingHighlights();
            celebrateBirthdayIfToday();
            return;
        } catch (error) {
            console.warn('Supabase birthdays unavailable; using browser cache:', error.message);
        }
    }

    try {
        const saved = localStorage.getItem(BIRTHDAYS_KEY);
        appBirthdays = saved ? JSON.parse(saved) : [];
    } catch (cacheError) {
        appBirthdays = [];
        console.warn('Browser birthday cache is invalid:', cacheError.message);
    }
    renderBirthdays();
    renderUpcomingHighlights();
    celebrateBirthdayIfToday();
}

function celebrateBirthdayIfToday() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hasBirthday = appBirthdays.some(birthday =>
        typeof birthday.date === 'string' && birthday.date.slice(5) === today
    );
    if (!hasBirthday || document.querySelector('.birthday-celebration')) return;

    const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
    const celebration = document.createElement('div');
    celebration.className = 'birthday-celebration';
    celebration.setAttribute('aria-hidden', 'true');

    for (let index = 0; index < 24; index++) {
        const particle = document.createElement('span');
        const isRibbon = index % 3 === 0;
        const sway = `${Math.round(Math.random() * 120 - 60)}px`;
        particle.className = isRibbon ? 'birthday-particle birthday-ribbon' : 'birthday-particle birthday-balloon';
        particle.style.left = `${Math.random() * 96 + 2}%`;
        particle.style.setProperty('--fall-duration', `${5.5 + Math.random() * 2}s`);
        particle.style.setProperty('--fall-delay', `${Math.random() * 1.2}s`);
        particle.style.setProperty('--sway', sway);
        particle.style.setProperty('--spin', `${Math.round(Math.random() * 180 - 90)}deg`);
        particle.style.setProperty('--particle-color', colors[index % colors.length]);
        celebration.appendChild(particle);
    }

    document.body.appendChild(celebration);
    window.setTimeout(() => celebration.remove(), 10000);
}

function loadHolidays() {
    const useCache = () => {
        try {
            const saved = localStorage.getItem(HOLIDAYS_KEY);
            appHolidays = saved ? JSON.parse(saved) : [];
        } catch (e) {
            appHolidays = [];
        }
        renderUpcomingHighlights();
    };
    const load = async () => {
        if (window.BuhloSupabase?.configured) {
            try {
                const remoteHolidays = await window.BuhloSupabase.getHolidays();
                appHolidays = remoteHolidays;
                localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(appHolidays));
                renderUpcomingHighlights();
                return;
            } catch (error) {
                console.warn('Supabase holidays unavailable; using browser cache:', error.message);
            }
        }

        useCache();
    };
    load();
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

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function renderEventLocation(location) {
    const value = String(location || '').trim();
    if (!/^https?:\/\//i.test(value)) return escapeHtml(value);

    let url;
    try {
        url = new URL(value);
    } catch {
        return escapeHtml(value);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return escapeHtml(value);
    return `<a class="event-location-link" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Открыть на карте</a>`;
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
   return appHolidays
       .map(holiday => ({ ...holiday, nextDate: getNextAnnualDate(holiday.date, today) }))
       .map(holiday => ({ ...holiday, days: daysBetween(today, holiday.nextDate) }))
       .filter(holiday => holiday.days >= 0 && holiday.days <= (holiday.event_type === 'moto' ? 14 : 3))
       .sort((a, b) => a.nextDate - b.nextDate)[0];
}


function renderUpcomingHighlights() {
    const container = document.getElementById('upcoming-highlights');
    if (!container) return;

    const birthday = getNextBirthday();
    const holiday = getUpcomingHoliday();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingEvents = getVisibleEvents(today)
        .map(event => ({ ...event, eventDate: new Date(`${event.date}T00:00:00`) }))
        .filter(event => !Number.isNaN(event.eventDate.getTime()) && event.eventDate >= today)
        .sort((a, b) => a.eventDate - b.eventDate);

    const items = [];
    if (upcomingEvents[0]) {
        items.push(`<div class="highlight-item"><span>📅 Ближайшее событие</span><strong>${escapeHtml(upcomingEvents[0].title)} — ${formatDate(upcomingEvents[0].date)}</strong></div>`);
    }
  //  if (birthday) {
    //    items.push(`<div class="highlight-item"><span>🎂 Ближайший день рождения</span><strong>${formatDate(birthday.nextDate.toISOString().slice(0, 10))} — ${birthday.name}</strong></div>`);
  //  }
        if (birthday) {
        const birthdayDateString = birthday.nextDate.toLocaleDateString('sv');
            items.push(`<div class="highlight-item"><span>🎂 Ближайший день рождения</span><strong>${formatDate(birthdayDateString)} — ${escapeHtml(birthday.name)}</strong></div>`);
    }
  //  if (holiday) {
   //     const when = holiday.days === 0 ? 'сегодня' : `через ${holiday.days} дн.`;
  //      items.push(`<div class="highlight-item"><span>🎉 Ближайший праздник (${when})</span><strong>${holiday.name} — ${formatDate(holiday.nextDate.toISOString().slice(0, 10))}</strong></div>`);
  //  }
     // ИСПРАВЛЕНО: здесь тоже убран баг со сдвигом даты праздника
    if (holiday) {
        const holidayDateString = holiday.nextDate.toLocaleDateString('sv');
        const when = holiday.days === 0 ? 'сегодня' : `через ${holiday.days} дн.`;
        items.push(`<div class="highlight-item"><span>🎉 Ближайший праздник (${when})</span><strong>${escapeHtml(holiday.name)} — ${formatDate(holidayDateString)}</strong></div>`);
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
        return `<li class="birthday-item">🎉 ${dayMonth} — ${escapeHtml(bd.name)}</li>`;
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

    const visibleEvents = getVisibleEvents();
    if (!visibleEvents.length) {
        eventsList.innerHTML = '<p>События пока не добавлены.</p>';
        renderUpcomingHighlights();
        return;
    }

    eventsList.innerHTML = visibleEvents.map((event, index) => {
        const participants = Array.isArray(event.participants) ? event.participants : [];
        const registered = hasUserRegistered(event.id);
        return `
            ${index > 0 ? '<div class="section-divider"></div>' : ''}
            <article class="event-card" data-id="${event.id}">
                <div class="event-header">
                    <div>
                        <span class="event-date">${formatDate(event.date)}</span>
                        <h3>${escapeHtml(event.title)}</h3>
                    </div>
                </div>
                <p>${escapeHtml(event.description || 'Описание события скоро появится.')}</p>
                <div class="event-meta">
                    <span>🕒 ${escapeHtml(event.time || 'Время не указано')}</span><br>
                    <span>📍 ${renderEventLocation(event.location || 'Место не указано')}</span><br>
                    <span  class="event-badge">✍️ ${participants.length} из ${event.maxParticipants || 50}</span>
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
                <details class="participants-more">
                    <summary>Записались (${participants.length})</summary>
                    <div class="participants-list">
                        ${participants.map(person => `<div class="participant-pill"><span class="participant-name">${escapeHtml(person.name)}</span>${person.notes ? `<span class="participant-note">${escapeHtml(person.notes)}</span>` : ''}</div>`).join('') || '<div class="participant-pill">Пока никого</div>'}
                    </div>
                </details>
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
    const registrations = getRegistrationMap(REGISTRATIONS_KEY);
    return typeof registrations[eventId]?.key === 'string';
}

function getRegistrationKey(eventId) {
    const keys = getRegistrationMap('buhlo_registration_keys');
    if (typeof keys[eventId] === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(keys[eventId])) {
        return keys[eventId];
    }
    if (!window.crypto?.randomUUID) {
        throw new Error('В этом браузере невозможно безопасно создать ключ регистрации.');
    }
    keys[eventId] = window.crypto.randomUUID();
    localStorage.setItem('buhlo_registration_keys', JSON.stringify(keys));
    return keys[eventId];
}

async function submitRegistration(eventId) {
    const name = document.getElementById(`reg-name-${eventId}`)?.value.trim();
    const contact = document.getElementById(`reg-contact-${eventId}`)?.value.trim();
    const notes = document.getElementById(`reg-notes-${eventId}`)?.value.trim();

    if (!name) {
        alert('Введите имя для записи');
        return;
    }

    if (hasUserRegistered(eventId)) {
        alert('Вы уже записаны на это событие.');
        return;
    }

    const button = document.querySelector(`#form-${eventId} button`);
    if (button) button.disabled = true;
    let savedToSupabase = false;
    try {
        if (!window.BuhloSupabase?.configured) {
            throw new Error('Регистрация временно недоступна: Supabase не настроен.');
        }
        const registrationKey = getRegistrationKey(eventId);
        await window.BuhloSupabase.submitRegistration(eventId, registrationKey, name, contact, notes);
        savedToSupabase = true;
        const registrations = getRegistrationMap(REGISTRATIONS_KEY);
        registrations[eventId] = { key: registrationKey };
        localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify(registrations));

        await loadEvents();
        alert('Вы записаны на событие!');
    } catch (error) {
        alert(savedToSupabase
            ? `Запись создана в Supabase, но не удалось обновить данные этого браузера: ${error.message}`
            : `Не удалось зарегистрироваться: ${error.message}`);
    } finally {
        if (button) button.disabled = false;
    }
}
