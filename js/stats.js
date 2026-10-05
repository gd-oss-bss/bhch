function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} Б`;
    const units = ['КБ', 'МБ', 'ГБ'];
    let value = n / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

function card(label, value, hint = '') {
    return `<div class="stats-card"><div class="stats-value">${escapeHtml(value)}</div><div class="stats-label">${escapeHtml(label)}</div>${hint ? `<div class="stats-hint">${escapeHtml(hint)}</div>` : ''}</div>`;
}

function toggleStatsView() {
    const stats = document.getElementById('stats-view');
    const showStats = stats.classList.contains('hidden');
    stats.classList.toggle('hidden', !showStats);
    document.getElementById('dashboard').classList.toggle('hidden', showStats);
    document.getElementById('view-toggle').textContent = showStats ? 'Админка' : 'Статистика';
    if (showStats) loadStats();
}

async function loadStats() {
    const days = Number(document.getElementById('stats-days').value) || 30;
    const [visits, storage] = await Promise.all([
        window.BuhloSupabase.getVisitStats(days).catch(e => ({ error: e.message })),
        window.BuhloSupabase.getStorageStats().catch(e => ({ error: e.message }))
    ]);
    renderVisits(visits);
    renderStorage(storage);
}

function renderVisits(data) {
    const cards = document.getElementById('visit-cards');
    const chart = document.getElementById('visit-chart');
    if (!data || data.error) {
        cards.innerHTML = '';
        chart.innerHTML = `<p class="error-text">Не удалось загрузить: ${escapeHtml(data?.error || 'нет данных')}</p>`;
        return;
    }
    cards.innerHTML = [
        card('Сегодня', data.today_visits, `уникальных: ${data.today_unique}`),
        card('7 дней', data.week_visits, `уникальных: ${data.week_unique}`),
        card('30 дней', data.month_visits, `уникальных: ${data.month_unique}`)
    ].join('');

    const daily = data.daily || [];
    const max = Math.max(1, ...daily.map(d => d.visits));
    chart.innerHTML = daily.map(d => {
        const height = Math.round((d.visits / max) * 100);
        const label = d.date.slice(5).split('-').reverse().join('.');
        return `<div class="stats-bar" title="${escapeHtml(label)}: визитов ${d.visits}, уникальных ${d.uniques}">
            <span class="stats-bar-num">${d.visits || ''}</span>
            <div class="stats-bar-fill" style="height:${height}%"></div>
            <span class="stats-bar-label">${escapeHtml(label)}</span>
        </div>`;
    }).join('');
}

function renderStorage(data) {
    const cards = document.getElementById('storage-cards');
    const folders = document.getElementById('storage-folders');
    if (!data || data.error) {
        cards.innerHTML = '';
        folders.innerHTML = `<p class="error-text">Не удалось загрузить: ${escapeHtml(data?.error || 'нет данных')}</p>`;
        return;
    }
    cards.innerHTML = [
        card('Всего занято', formatBytes(data.total_bytes)),
        card('Файлов', data.total_files)
    ].join('');
    const total = Math.max(1, Number(data.total_bytes));
    folders.innerHTML = `<table class="stats-table"><thead><tr><th>Папка</th><th>Файлов</th><th>Размер</th><th>Доля</th></tr></thead><tbody>${
        (data.folders || []).map(f => `<tr><td>${escapeHtml(f.folder)}</td><td>${f.files}</td><td>${formatBytes(f.bytes)}</td><td>${Math.round(f.bytes / total * 100)}%</td></tr>`).join('')
    }</tbody></table>`;
}