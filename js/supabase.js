(function() {
    const config = window.BUHLO_SUPABASE_CONFIG || {};
    const url = typeof config.url === 'string' ? config.url.replace(/\/$/, '') : '';
    const anonKey = typeof config.anonKey === 'string' ? config.anonKey.trim() : '';
    const configured = Boolean(url && anonKey && anonKey !== 'PASTE_SUPABASE_PUBLIC_ANON_KEY_HERE');
    let accessToken = '';
    let refreshToken = '';
    let isAdmin = false;
    let authUser = null;
    const BACKUP_BUCKET = 'BHCH_DATA';
    const MEMBER_SESSION_KEY = 'buhlo_member_session';

    // Сессия участника (не админа) живёт в sessionStorage вкладки, чтобы переход между страницами не требовал нового входа.
    function persistMemberSession() {
        try {
            if (accessToken && refreshToken && authUser && !isAdmin) {
                sessionStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    user: authUser
                }));
            } else {
                sessionStorage.removeItem(MEMBER_SESSION_KEY);
            }
        } catch (error) {
            // sessionStorage недоступен — работаем без сохранения
        }
    }

    function hasStoredMemberSession() {
        try {
            return Boolean(sessionStorage.getItem(MEMBER_SESSION_KEY));
        } catch (error) {
            return false;
        }
    }

    function requireConfiguration() {
        if (!configured) {
            throw new Error('Настройте URL и публичный anon key в js/supabase-config.js');
        }
    }

    async function authRequest(path, body, token) {
        requireConfiguration();
        const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${url}/auth/v1/${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Supabase Auth HTTP ${response.status}: ${detail}`);
        }
        return response.json();
    }

    async function refreshSession() {
        if (!refreshToken) {
            accessToken = '';
            refreshToken = '';
            isAdmin = false;
            authUser = null;
            persistMemberSession();
            throw new Error('Сессия истекла. Войдите снова.');
        }
        const session = await authRequest('token?grant_type=refresh_token', {
            refresh_token: refreshToken
        });
        accessToken = session.access_token;
        refreshToken = session.refresh_token;
        authUser = session.user || authUser;
        isAdmin = authUser?.app_metadata?.role === 'admin';
        persistMemberSession();
    }

    async function request(path, options = {}, authenticated = false, canRefresh = true) {
        requireConfiguration();
        if (authenticated && !accessToken) throw new Error('Сначала войдите в аккаунт.');

        const headers = {
            apikey: anonKey,
            Authorization: `Bearer ${authenticated ? accessToken : anonKey}`,
            ...options.headers
        };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(`${url}/rest/v1/${path}`, {
            ...options,
            headers,
            cache: 'no-store'
        });

        if (response.status === 401 && authenticated && canRefresh && refreshToken) {
            await refreshSession();
            return request(path, options, authenticated, false);
        }
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Supabase HTTP ${response.status}: ${detail}`);
        }
        if (response.status === 204) return null;
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    function eventToRow(event) {
        const row = {
            title: event.title,
            date: event.date,
            time: event.time || null,
            location: event.location || '',
            description: event.description || null,
            recurrence: event.recurrence || null,
            maxParticipants: event.maxParticipants
        };
        if (event.id !== undefined && event.id !== null) row.event_id = Number(event.id);
        return row;
    }

    function eventFromRow(row, participants = []) {
        return {
            id: row.event_id,
            title: row.title,
            date: row.date,
            time: row.time || '',
            location: row.location || '',
            description: row.description || '',
            recurrence: row.recurrence || undefined,
            participants,
            maxParticipants: row.maxParticipants
        };
    }

    async function getEvents() {
        const rows = await request('events?select=event_id,title,date,time,location,description,recurrence,maxParticipants&order=date.asc');
        const participants = await request('rpc/get_public_event_participants', {
            method: 'POST',
            body: '{}'
        });
        const byEvent = new Map();
        (participants || []).forEach(person => {
            if (!byEvent.has(person.event_id)) byEvent.set(person.event_id, []);
            byEvent.get(person.event_id).push({ name: person.name, notes: person.notes || '' });
        });
        return (rows || []).map(row => eventFromRow(row, byEvent.get(row.event_id) || []));
    }

    async function getBirthdays() {
        const rows = await request('birthdays?select=id,date,name&order=date.asc');
        return (rows || []).map(row => ({ date: row.date, name: row.name }));
    }

    async function getHolidays() {
        const rows = await request('holidays?select=id,date,name,event_type&order=date.asc');
        return (rows || []).map(row => ({
            id: row.id,
            date: row.date,
            name: row.name,
            event_type: row.event_type
        }));
    }

    async function createEvent(event) {
        const rows = await request('events', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(eventToRow(event))
        }, true);
        return eventFromRow(rows[0], []);
    }

    async function createHoliday(holiday) {
        const rows = await request('holidays', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(holiday)
        }, true);
        return rows[0];
    }

    async function replaceEvents(events) {
        if (events.some(event => !Number.isSafeInteger(event.id))) {
            throw new Error('У каждого события должен быть числовой id для безопасного импорта.');
        }
        await request('rpc/replace_events', {
            method: 'POST',
            body: JSON.stringify({
                p_events: events.map(event => ({
                    ...eventToRow(event),
                    participants: Array.isArray(event.participants) ? event.participants : []
                }))
            })
        }, true);
    }

    async function saveEvent(event) {
        const rows = await request('events?on_conflict=event_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(eventToRow(event))
        }, true);
        return eventFromRow(rows[0], event.participants || []);
    }

    async function deleteEvent(id) {
        await request(`events?event_id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }, true);
    }

    async function deleteRegistration(id) {
        const deleted = await request(`event_registrations?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' }
        }, true);
        if (!Array.isArray(deleted) || !deleted.length) {
            throw new Error('база не удалила запись (нет прав или записи уже нет)');
        }
    }

    async function addEventRegistrations(eventId, participants) {
        if (!participants.length) return 0;
        const rows = participants.map(person => ({
            event_id: Number(eventId),
            registration_key: crypto.randomUUID(),
            name: String(person.name || '').trim().slice(0, 120),
            contact: String(person.contact || 'не указан').slice(0, 200),
            notes: String(person.notes || '').slice(0, 2000),
            ...(person.registered_at ? { registered_at: person.registered_at } : {})
        })).filter(row => row.name);
        if (!rows.length) return 0;
        const saved = await request('event_registrations', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(rows)
        }, true);
        return Array.isArray(saved) ? saved.length : 0;
    }

    async function replaceBirthdays(birthdays) {
        await request('rpc/replace_birthdays', {
            method: 'POST',
            body: JSON.stringify({ p_birthdays: birthdays })
        }, true);
    }

    async function replaceHolidays(holidays) {
        await request('rpc/replace_holidays', {
            method: 'POST',
            body: JSON.stringify({ p_holidays: holidays })
        }, true);
    }

    async function deleteHoliday(id) {
        const deleted = await request(`holidays?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' }
        }, true);
        if (!Array.isArray(deleted) || !deleted.length) {
            throw new Error('база не удалила праздник (нет прав или его уже нет)');
        }
    }

    async function getAdminRegistrations() {
        return request('event_registrations?select=id,event_id,name,contact,notes,registered_at&order=registered_at.asc', {}, true);
    }

    async function hasRegistration(eventId, registrationKey) {
        return request('rpc/check_event_registration', {
            method: 'POST',
            body: JSON.stringify({ p_event_id: eventId, p_registration_key: registrationKey })
        });
    }

    async function submitRegistration(eventId, registrationKey, name, contact, notes) {
        return request('rpc/submit_event_registration', {
            method: 'POST',
            body: JSON.stringify({
                p_event_id: eventId,
                p_registration_key: registrationKey,
                p_name: name,
                p_contact: contact || 'не указан',
                p_notes: notes || ''
            })
        });
    }

    async function storageRequest(path, options = {}, canRefresh = true) {
        requireConfiguration();
        if (!accessToken) throw new Error('Сначала войдите в аккаунт.');
        const response = await fetch(`${url}/storage/v1/${path}`, {
            ...options,
            headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, ...options.headers },
            cache: 'no-store'
        });
        if ((response.status === 401 || response.status === 400) && canRefresh && refreshToken) {
            const detail = await response.clone().text();
            if (response.status === 401 || /expired|jwt/i.test(detail)) {
                await refreshSession();
                return storageRequest(path, options, false);
            }
        }
        if (!response.ok) {
            throw new Error(`Supabase Storage HTTP ${response.status}: ${await response.text()}`);
        }
        return response;
    }

    async function uploadBackup(name, data) {
        await storageRequest(`object/${BACKUP_BUCKET}/data/${name}.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: JSON.stringify(data, null, 2)
        });
    }

    async function downloadBackup(name) {
        const response = await storageRequest(`object/authenticated/${BACKUP_BUCKET}/data/${name}.json`);
        return response.json();
    }

    async function getGalleryCategories() {
        return request('gallery_categories?select=id,name&order=id.asc');
    }

    async function getGalleryPhotos() {
        return request('gallery_photos?select=id,category_id,path,thumb_path,caption,created_at&order=id.desc');
    }

    async function getStorageBlobUrl(path) {
        requireConfiguration();
        const token = accessToken || anonKey;
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        const response = await fetch(`${url}/storage/v1/object/authenticated/${BACKUP_BUCKET}/${encoded}`, {
            headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Файл ${path}: HTTP ${response.status}`);
        return URL.createObjectURL(await response.blob());
    }

    async function saveGalleryCategory(category) {
        const body = JSON.stringify({ name: category.name });
        if (category.id) {
            return request(`gallery_categories?id=eq.${encodeURIComponent(category.id)}`, {
                method: 'PATCH',
                headers: { Prefer: 'return=representation' },
                body
            }, true);
        }
        return request('gallery_categories', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body
        }, true);
    }

    async function createGalleryCategory(category) {
        const rows = await request('gallery_categories', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ name: category.name })
        }, true);
        return rows[0];
    }

    async function deleteGalleryCategory(id) {
        const deleted = await request(`gallery_categories?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' }
        }, true);
        if (!Array.isArray(deleted) || !deleted.length) {
            throw new Error('база не удалила категорию (нет прав или её уже нет)');
        }
    }

    async function addGalleryPhoto(photo) {
        const rows = await request('gallery_photos', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(photo)
        }, true);
        return rows[0];
    }

    async function createGalleryPhoto(photo) {
        const rows = await request('gallery_photos', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(photo)
        }, true);
        return rows[0];
    }

    const INFO_EDITOR_EMAIL = 'ssdavidchuk@gmail.com';

    async function getInfoPosts() {
        const [posts, photos] = await Promise.all([
            request('info_posts?select=id,title,body,link_url,created_at&order=created_at.desc,id.desc'),
            request('gallery_photos?select=id,path,thumb_path,info_post_id&info_post_id=not.is.null&order=id.asc')
        ]);
        return (posts || []).map(post => ({
            ...post,
            photos: (photos || []).filter(photo => photo.info_post_id === post.id)
        }));
    }

    async function getInfoCategoryId() {
        const rows = await request(`gallery_categories?select=id&name=eq.${encodeURIComponent('🍉Инфо от Арбузика🍉')}`);
        if (!rows?.length) throw new Error('Категория «🍉Инфо от Арбузика🍉» не найдена. Выполните schema.sql.');
        return rows[0].id;
    }

    async function createInfoPost(post) {
        const rows = await request('info_posts', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ title: post.title, body: post.body || '', link_url: post.link_url || null })
        }, true);
        return rows[0];
    }

    async function deleteInfoPost(id) {
        const photos = await request(`gallery_photos?select=path,thumb_path&info_post_id=eq.${encodeURIComponent(id)}`);
        const deleted = await request(`info_posts?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' }
        }, true);
        if (!Array.isArray(deleted) || !deleted.length) {
            throw new Error('база не удалила запись (нет прав или её уже нет)');
        }
        const files = (photos || []).flatMap(photo => [photo.path, photo.thumb_path]);
        await deleteStorageFiles(files).catch(() => {});
    }

    async function deleteGalleryPhoto(id) {
        const deleted = await request(`gallery_photos?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' }
        }, true);
        if (!Array.isArray(deleted) || !deleted.length) {
            throw new Error('база не удалила фото (нет прав или его уже нет)');
        }
    }

    async function uploadStorageFile(path, blob) {
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        await storageRequest(`object/${BACKUP_BUCKET}/${encoded}`, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'false' },
            body: blob
        });
    }

    async function deleteStorageFiles(paths) {
        const list = paths.filter(Boolean);
        if (!list.length) return;
        await storageRequest(`object/${BACKUP_BUCKET}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: list })
        });
    }
    async function getHubQuestion() {
        const rows = await request('rpc/get_hub_question', { method: 'POST', body: '{}' });
        return rows && rows[0] ? rows[0] : null;
    }

    async function checkHubAnswer(id, answer) {
        return request('rpc/check_hub_answer', {
            method: 'POST',
            body: JSON.stringify({ p_id: id, p_answer: answer })
        });
    }

    async function getHubQuestions() {
        return request('hub_questions?select=id,question,description,available_from,available_to&order=id.asc', {}, true);
    }

    async function saveHubQuestion(item) {
        return request('rpc/save_hub_question', {
            method: 'POST',
            body: JSON.stringify({
                p_id: item.id ?? null,
                p_question: item.question,
                p_answer: item.answer || '',
                p_description: item.description || '',
                p_from: item.availableFrom || null,
                p_to: item.availableTo || null
            })
        }, true);
    }

    async function deleteHubQuestion(id) {
        const deleted = await request('rpc/delete_hub_question', {
            method: 'POST',
            body: JSON.stringify({ p_id: id })
        }, true);
        if (deleted !== true) {
            throw new Error('база не удалила вопрос (его уже нет)');
        }
    }

    async function logSiteVisit(visitorId, page) {
        return request('rpc/log_site_visit', {
            method: 'POST',
            body: JSON.stringify({ p_visitor_id: visitorId, p_page: page })
        });
    }

    async function getVisitStats(days) {
        return request('rpc/get_visit_stats', {
            method: 'POST',
            body: JSON.stringify({ p_days: days })
        }, true);
    }

    async function getStorageStats() {
        return request('rpc/get_storage_stats', { method: 'POST', body: '{}' }, true);
    }

    function setSession(session) {
        accessToken = session.access_token;
        refreshToken = session.refresh_token;
        authUser = session.user || null;
        isAdmin = authUser?.app_metadata?.role === 'admin';
    }

    window.BuhloSupabase = {
        logSiteVisit,
        addEventRegistrations,
        getVisitStats,
        getStorageStats,
        getUsers: async function() {
            return request('rpc/admin_list_users', { method: 'POST', body: '{}' }, true);
        },
        renameUser: async function(id, username) {
            return request('rpc/admin_rename_user', {
                method: 'POST',
                body: JSON.stringify({ p_id: id, p_username: username })
            }, true);
        },
        deleteUser: async function(id) {
            return request('rpc/admin_delete_user', {
                method: 'POST',
                body: JSON.stringify({ p_id: id })
            }, true);
        },
        get configured() { return configured; },
        get isAdmin() { return isAdmin; },
        get isInfoEditor() { return Boolean(isAdmin && authUser?.email?.toLowerCase() === INFO_EDITOR_EMAIL); },
        get isMemberAuthenticated() { return Boolean(accessToken && authUser?.id); },
        get authUser() { return authUser; },
        signUp: async function(email, password, username, signupTicket, redirectTo) {
            const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
            return authRequest(`signup${query}`, {
                email,
                password,
                data: { username, signup_ticket: signupTicket }
            });
        },
        issueSignupTicket: async function(questionId, answer) {
            return request('rpc/issue_signup_ticket', {
                method: 'POST',
                body: JSON.stringify({ p_id: questionId, p_answer: answer })
            });
        },
        signInMember: async function(email, password) {
            const session = await authRequest('token?grant_type=password', { email, password });
            setSession(session);
            persistMemberSession();
            return session.user;
        },
        get hasStoredMemberSession() { return hasStoredMemberSession(); },
        restoreMemberSession: function() {
            try {
                const saved = JSON.parse(sessionStorage.getItem(MEMBER_SESSION_KEY) || 'null');
                if (!saved?.access_token || !saved.refresh_token || !saved.user?.id) return false;
                setSession(saved);
                if (isAdmin) throw new Error('not a member session');
                return true;
            } catch (error) {
                accessToken = '';
                refreshToken = '';
                isAdmin = false;
                authUser = null;
                persistMemberSession();
                return false;
            }
        },
        getMemberEvents: async function() {
            const rows = await request('events?select=event_id,title,date,time,location,description,recurrence,maxParticipants,created_by&order=date.asc');
            return (rows || []).map(row => ({ ...eventFromRow(row, []), createdBy: row.created_by }));
        },
        updateOwnEvent: async function(event) {
            const row = eventToRow(event);
            delete row.event_id;
            const rows = await request(`events?event_id=eq.${encodeURIComponent(event.id)}`, {
                method: 'PATCH',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify(row)
            }, true);
            if (!Array.isArray(rows) || !rows.length) {
                throw new Error('нельзя изменить это событие (оно не ваше или удалено)');
            }
            return eventFromRow(rows[0], []);
        },
        signIn: async function(email, password) {
            const session = await authRequest('token?grant_type=password', {
                email,
                password
            });
            if (session.user?.app_metadata?.role !== 'admin') {
                throw new Error('У этой учётной записи нет прав администратора.');
            }
            setSession(session);
        },
        signOut: function() {
            accessToken = '';
            refreshToken = '';
            isAdmin = false;
            authUser = null;
            persistMemberSession();
        },
        getMemberProfile: async function() {
            if (!authUser?.id) throw new Error('Войдите в аккаунт участника.');
            const rows = await request(
                `user_profiles?id=eq.${encodeURIComponent(authUser.id)}&select=username,role`,
                {},
                true
            );
            if (!Array.isArray(rows) || !rows.length) {
                throw new Error('Профиль не найден. Обратитесь к администратору.');
            }
            return rows[0];
        },
        changePassword: async function(password) {
            if (!accessToken || !isAdmin) throw new Error('Сначала войдите в админку.');
            const response = await fetch(`${url}/auth/v1/user`, {
                method: 'PUT',
                headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });
            if (!response.ok) {
                const detail = await response.text();
                throw new Error(`Supabase Auth HTTP ${response.status}: ${detail}`);
            }
        },
        getEvents,
        createEvent,
        getBirthdays,
        getHolidays,
        createHoliday,
        replaceEvents,
        saveEvent,
        deleteEvent,
        deleteRegistration,
        hasRegistration,
        deleteHoliday,
        getGalleryCategories,
        getGalleryPhotos,
        getStorageBlobUrl,
        createGalleryCategory,
        saveGalleryCategory,
        deleteGalleryCategory,
        addGalleryPhoto,
        createGalleryPhoto,
        getInfoPosts,
        getInfoCategoryId,
        createInfoPost,
        deleteInfoPost,
        deleteGalleryPhoto,
        uploadStorageFile,
        deleteStorageFiles,
        getHubQuestion,
        checkHubAnswer,
        getHubQuestions,
        saveHubQuestion,
        deleteHubQuestion,
        uploadBackup,
        downloadBackup,
        replaceBirthdays,
        replaceHolidays,
        getAdminRegistrations,
        submitRegistration
    };
})();
