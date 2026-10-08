const MEMBER_GALLERY_MAX_BYTES = 10 * 1024 * 1024;
const MEMBER_GALLERY_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

let hubQuestion = null;

function setMemberStatus(id, message, isError = false) {
    const status = document.getElementById(id);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

function updateMemberPanel(profile = null) {
    const signedIn = Boolean(window.BuhloSupabase?.isMemberAuthenticated);
    document.getElementById('member-auth').classList.toggle('hidden', signedIn);
    document.getElementById('member-contributions').classList.toggle('hidden', !signedIn);
    document.getElementById('member-logout-item').classList.toggle('hidden', !signedIn);
    if (signedIn) {
        const name = profile?.username || window.BuhloSupabase.authUser?.email || '';
        setMemberStatus('member-session-name', `Вы вошли как ${name}`);
    }
}

async function loadMemberCategories() {
    const select = document.getElementById('member-photo-category');
    try {
        const categories = await window.BuhloSupabase.getGalleryCategories();
        select.innerHTML = categories.length
            ? categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')
            : '<option value="">Сначала создайте категорию</option>';
        select.disabled = !categories.length;
    } catch (error) {
        select.innerHTML = '<option value="">Не удалось загрузить категории</option>';
        select.disabled = true;
    }
}

async function loadSignupQuestion() {
    const label = document.getElementById('member-question');
    try {
        hubQuestion = await window.BuhloSupabase.getHubQuestion();
        label.textContent = hubQuestion ? hubQuestion.question : 'Контрольный вопрос сейчас недоступен.';
    } catch (error) {
        hubQuestion = null;
        label.textContent = 'Не удалось загрузить контрольный вопрос.';
    }
}

function toggleMemberSignup() {
    const box = document.getElementById('member-signup');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) loadSignupQuestion();
}

async function registerMember() {
    const email = document.getElementById('member-email').value.trim();
    const password = document.getElementById('member-password').value;
    const username = document.getElementById('member-username').value.trim();
    const answer = document.getElementById('member-answer').value.trim();
    const statusId = 'member-signup-status';

    if (!hubQuestion) return setMemberStatus(statusId, 'Контрольный вопрос недоступен. Попробуйте позже.', true);
    if (!answer) return setMemberStatus(statusId, 'Ответьте на контрольный вопрос.', true);
    if (!email || !email.includes('@')) return setMemberStatus(statusId, 'Укажите корректный email.', true);
    if (password.length < 8) return setMemberStatus(statusId, 'Пароль — не менее 8 символов.', true);
    if (username.length < 2 || username.length > 40) return setMemberStatus(statusId, 'Имя — от 2 до 40 символов.', true);

    try {
        setMemberStatus(statusId, 'Проверяем ответ…');
        const ticket = await window.BuhloSupabase.issueSignupTicket(hubQuestion.id, answer);
        if (!ticket) return setMemberStatus(statusId, 'Неверно! Регистрация только для своих.', true);
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        await window.BuhloSupabase.signUp(email, password, username, ticket, redirectTo);
        document.getElementById('member-password').value = '';
        document.getElementById('member-answer').value = '';
        setMemberStatus(statusId, 'Аккаунт создан. Подтвердите email по ссылке из письма, затем войдите.');
    } catch (error) {
        const message = /Database error saving new user/i.test(error.message)
            ? 'Регистрация отклонена: ответ устарел или уже использован. Повторите.'
            : error.message;
        setMemberStatus(statusId, `Ошибка регистрации: ${message}`, true);
    }
}

async function loginMember() {
    const email = document.getElementById('member-email').value.trim();
    const password = document.getElementById('member-password').value;
    if (!email || !password) {
        setMemberStatus('member-account-message', 'Введите email и пароль.', true);
        return;
    }
    try {
        setMemberStatus('member-account-message', 'Входим…');
        await window.BuhloSupabase.signInMember(email, password);
        const profile = await window.BuhloSupabase.getMemberProfile();
        document.getElementById('member-password').value = '';
        setMemberStatus('member-account-message', '');
        updateMemberPanel(profile);
        loadMemberCategories();
    } catch (error) {
        window.BuhloSupabase.signOut();
        setMemberStatus('member-account-message', `Не удалось войти: ${error.message}`, true);
    }
}

function logoutMember() {
    window.BuhloSupabase.signOut();
    setMemberStatus('member-account-message', 'Вы вышли из аккаунта.');
    updateMemberPanel();
}

function isValidMemberHolidayDate(value) {
    const match = /^(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const month = Number(match[1]);
    const day = Number(match[2]);
    // 2000 — високосный год, допускает 02-29
    const date = new Date(Date.UTC(2000, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function createMemberEvent() {
    const statusId = 'member-event-status';
    const title = document.getElementById('member-event-title').value.trim();
    const date = document.getElementById('member-event-date').value;
    const maxParticipants = Number(document.getElementById('member-event-limit').value);
    if (!title || !date) return setMemberStatus(statusId, 'Укажите название и дату.', true);
    if (!Number.isInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 500) {
        return setMemberStatus(statusId, 'Максимум участников — от 1 до 500.', true);
    }
    try {
        setMemberStatus(statusId, 'Публикуем…');
        await window.BuhloSupabase.createEvent({
            id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
            title,
            date,
            time: document.getElementById('member-event-time').value,
            location: document.getElementById('member-event-location').value.trim(),
            description: document.getElementById('member-event-description').value.trim(),
            recurrence: document.getElementById('member-event-yearly').checked ? 'yearly' : undefined,
            maxParticipants
        });
        document.getElementById('member-event-form').reset();
        setMemberStatus(statusId, 'Событие опубликовано.');
    } catch (error) {
        setMemberStatus(statusId, `Ошибка: ${error.message}`, true);
    }
}

async function createMemberHoliday() {
    const statusId = 'member-holiday-status';
    const name = document.getElementById('member-holiday-name').value.trim();
    const date = document.getElementById('member-holiday-date').value.trim();
    if (!name) return setMemberStatus(statusId, 'Укажите название.', true);
    if (!isValidMemberHolidayDate(date)) return setMemberStatus(statusId, 'Дата — в формате ММ-ДД, например 05-09.', true);
    try {
        setMemberStatus(statusId, 'Публикуем…');
        await window.BuhloSupabase.createHoliday({
            date,
            name,
            event_type: document.getElementById('member-holiday-type').value
        });
        document.getElementById('member-holiday-form').reset();
        setMemberStatus(statusId, 'Праздник опубликован.');
    } catch (error) {
        setMemberStatus(statusId, `Ошибка: ${error.message}`, true);
    }
}

async function createMemberGalleryCategory() {
    const statusId = 'member-category-status';
    const name = document.getElementById('member-category-name').value.trim();
    if (!name) return setMemberStatus(statusId, 'Укажите название категории.', true);
    try {
        setMemberStatus(statusId, 'Создаём…');
        const category = await window.BuhloSupabase.createGalleryCategory({ name });
        document.getElementById('member-category-form').reset();
        await loadMemberCategories();
        if (category?.id) document.getElementById('member-photo-category').value = String(category.id);
        setMemberStatus(statusId, 'Категория создана.');
    } catch (error) {
        setMemberStatus(statusId, `Ошибка: ${error.message}`, true);
    }
}

async function uploadMemberGalleryPhotos() {
    const statusId = 'member-photo-status';
    const categoryId = Number(document.getElementById('member-photo-category').value);
    const caption = document.getElementById('member-photo-caption').value.trim();
    const files = Array.from(document.getElementById('member-photo-files').files || []);
    const button = document.querySelector('#member-photo-form button[type="submit"]');

    if (!categoryId) return setMemberStatus(statusId, 'Сначала выберите категорию.', true);
    if (!files.length) return setMemberStatus(statusId, 'Выберите хотя бы один файл.', true);
    const invalid = files.find(file => !MEMBER_GALLERY_TYPES[file.type] || file.size > MEMBER_GALLERY_MAX_BYTES);
    if (invalid) {
        return setMemberStatus(statusId, `Файл «${invalid.name}» не подходит: нужен JPG, PNG, WebP или GIF до 10 МБ.`, true);
    }

    button.disabled = true;
    let uploaded = 0;
    try {
        for (const file of files) {
            setMemberStatus(statusId, `Загрузка ${uploaded + 1} из ${files.length}: ${file.name}`);
            const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
            const path = `gallery/${categoryId}/${key}.${MEMBER_GALLERY_TYPES[file.type]}`;
            const thumbPath = `gallery/${categoryId}/thumbs/${key}.jpg`;
            const thumb = await window.createGalleryThumbnail(file);
            await window.BuhloSupabase.uploadStorageFile(path, file);
            try {
                await window.BuhloSupabase.uploadStorageFile(thumbPath, thumb);
                await window.BuhloSupabase.createGalleryPhoto({ category_id: categoryId, path, thumb_path: thumbPath, caption });
            } catch (error) {
                await window.BuhloSupabase.deleteStorageFiles([path, thumbPath]).catch(() => {});
                throw error;
            }
            uploaded += 1;
        }
        document.getElementById('member-photo-files').value = '';
        document.getElementById('member-photo-caption').value = '';
        setMemberStatus(statusId, `Загружено фото: ${uploaded}.`);
    } catch (error) {
        setMemberStatus(statusId, `Загружено ${uploaded} из ${files.length}. Ошибка: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
}

window.addEventListener('load', () => {
    const redirect = new URLSearchParams(window.location.hash.slice(1));
    if (redirect.has('access_token') || redirect.has('refresh_token')) {
        // Токены из ссылки подтверждения не сохраняем: убираем их из адреса, вход — вручную.
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        if (redirect.get('type') === 'signup') {
            setMemberStatus('member-account-message', 'Email подтверждён. Теперь войдите в аккаунт.');
        }
    }

    const forms = {
        'member-event-form': createMemberEvent,
        'member-holiday-form': createMemberHoliday,
        'member-category-form': createMemberGalleryCategory,
        'member-photo-form': uploadMemberGalleryPhotos
    };
    Object.entries(forms).forEach(([id, handler]) => {
        document.getElementById(id).addEventListener('submit', event => {
            event.preventDefault();
            handler();
        });
    });
    ['member-email', 'member-password'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                loginMember();
            }
        });
    });
    updateMemberPanel();
});
