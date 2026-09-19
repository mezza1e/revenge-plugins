/**
 * @name BypassBlockedOrIgnored
 * @description Bypass the blocked or ignored user modal if present in voice channels.
 * @version 1.0.12
 * @author Antigravity (Parity with DevilBro & nicola02nb)
 */
(function(vendettaArg) {
    'use strict';

    // 1. Universal API Resolution
    const _vendetta = (typeof vendettaArg !== 'undefined' && vendettaArg) ||
                      (typeof vendetta !== 'undefined' && vendetta) ||
                      (typeof window !== 'undefined' && (window.vendetta || window.bunny || window.revenge)) ||
                      (typeof globalThis !== 'undefined' && (globalThis.vendetta || globalThis.bunny || globalThis.revenge)) ||
                      {};
    const _revenge = (typeof revenge !== 'undefined' && revenge) ||
                     (typeof window !== 'undefined' && window.revenge) ||
                     (typeof globalThis !== 'undefined' && (globalThis.revenge || _vendetta.revenge)) ||
                     {};
    let _metro = _revenge.modules?.finders || _vendetta.metro || (typeof metro !== 'undefined' && metro) || {};
    let _patcher = _revenge.patcher || _vendetta.patcher || (typeof patcher !== 'undefined' && patcher) || {};
    let _common = _vendetta.metro?.common || (typeof metroCommon !== 'undefined' && metroCommon) || {};
    let _storage = _vendetta.plugin?.storage ||
                   _vendetta.storage ||
                   _revenge.storage ||
                   (typeof storage !== 'undefined' && storage) ||
                   (typeof globalThis !== 'undefined' && (globalThis.__antigravity_storage = globalThis.__antigravity_storage || {})) ||
                   {};
    const unpatches = [];

    // Bulletproof Universal Patcher
    function safePatch(type, obj, prop, hook) {
        if (!obj || !prop) return;
        let orig;
        try { orig = obj[prop]; } catch (_) { return; }
        if (typeof orig !== 'function') return;

        // 1. Try mobile spitroast standard: (prop, obj, hook)
        if (_patcher && typeof _patcher[type] === 'function') {
            try {
                const unpatch = _patcher[type](prop, obj, function(args, resOrOrig) {
                    try {
                        return hook.call(this, args, resOrOrig);
                    } catch (err) {
                        if (type === 'instead' && typeof resOrOrig === 'function') {
                            return resOrOrig.apply(this, args);
                        }
                        return resOrOrig;
                    }
                });
                if (typeof unpatch === 'function') {
                    unpatches.push(unpatch);
                    return;
                }
            } catch (_) {}

            // 2. Try alternate order: (obj, prop, hook)
            try {
                const unpatch = _patcher[type](obj, prop, function(args, resOrOrig) {
                    try {
                        return hook.call(this, args, resOrOrig);
                    } catch (err) {
                        if (type === 'instead' && typeof resOrOrig === 'function') {
                            return resOrOrig.apply(this, args);
                        }
                        return resOrOrig;
                    }
                });
                if (typeof unpatch === 'function') {
                    unpatches.push(unpatch);
                    return;
                }
            } catch (_) {}
        }

        // 3. Fallback: Direct property wrapper
        try {
            if (type === 'instead') {
                obj[prop] = function(...args) {
                    try {
                        return hook.call(this, args, orig);
                    } catch (_) {
                        return orig.apply(this, args);
                    }
                };
            } else if (type === 'after') {
                obj[prop] = function(...args) {
                    const res = orig.apply(this, args);
                    try {
                        return hook.call(this, args, res);
                    } catch (_) {
                        return res;
                    }
                };
            } else if (type === 'before') {
                obj[prop] = function(...args) {
                    try { hook.call(this, args); } catch (_) {}
                    return orig.apply(this, args);
                };
            }
            unpatches.push(() => { try { obj[prop] = orig; } catch (_) {} });
        } catch (_) {}
    }

    let _FluxDispatcher = null;
    let React = null;
    let View = null;

    // Visual confirmation toast
    function notifyActive() {
        try {
            if (_revenge.discord?.actions?.ToastActionCreators?.open) {
                _revenge.discord.actions.ToastActionCreators.open({
                    key: 'plugin-active',
                    content: 'BypassBlockedOrIgnored v1.0.12: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('BypassBlockedOrIgnored v1.0.12: ACTIVE');
                return;
            }
        } catch (_) {}
    }

    // Dynamic relationship tracking sets
    const blockedUserIdsSet = new Set();
    const ignoredUserIdsSet = new Set();
    const blockedMessageIdsSet = new Set();

    let RelationshipStore = null;
    let GuildMemberStore = null;
    let ChannelMemberStore = null;
    let MemberListStore = null;
    let MessageStore = null;
    let UserStore = null;
    let TypingStore = null;
    let PresenceStore = null;
    let RowManager = null;

    let rawIsBlocked = null;
    let rawIsIgnored = null;
    let rawGetRelationships = null;
    let rawGetBlockedUserIds = null;
    let rawGetPresenceStatus = null;

    let cachedCurrentUserId = null;
    function getCurrentUserId() {
        if (cachedCurrentUserId) return cachedCurrentUserId;
        try {
            if (UserStore && typeof UserStore.getCurrentUser === 'function') {
                const u = UserStore.getCurrentUser();
                if (u && u.id) return (cachedCurrentUserId = String(u.id));
            }
            if (_common && _common.UserStore && typeof _common.UserStore.getCurrentUser === 'function') {
                const u = _common.UserStore.getCurrentUser();
                if (u && u.id) return (cachedCurrentUserId = String(u.id));
            }
        } catch (_) {}
        return null;
    }

    try {
        if (_storage && Array.isArray(_storage.blockedUserIds)) {
            for (const id of _storage.blockedUserIds) blockedUserIdsSet.add(String(id));
        }
        if (_storage && Array.isArray(_storage.ignoredUserIds)) {
            for (const id of _storage.ignoredUserIds) ignoredUserIdsSet.add(String(id));
        }
    } catch (_) {}

    function persistBlockedSets() {
        try {
            if (_storage && typeof _storage === 'object') {
                _storage.blockedUserIds = Array.from(blockedUserIdsSet);
                _storage.ignoredUserIds = Array.from(ignoredUserIdsSet);
            }
        } catch (_) {}
    }

    function isBlockedOrIgnored(userId) {
        if (!userId) return false;
        const s = String(userId);
        const myId = getCurrentUserId();
        if (myId && s === myId) return false;
        return blockedUserIdsSet.has(s) || ignoredUserIdsSet.has(s);
    }

    function isMemberBlockedOrIgnored(item) {
        if (!item || typeof item !== 'object') return false;
        try {
            const myId = getCurrentUserId();
            const uid = item.userId || item.user?.id || item.member?.userId || item.member?.user?.id ||
                        item.row?.userId || item.row?.user?.id || item.row?.member?.userId || item.row?.member?.user?.id ||
                        item.item?.userId || item.item?.user?.id || item.item?.member?.userId || item.item?.member?.user?.id ||
                        (typeof item.id === 'string' && /^\d{17,20}$/.test(item.id) ? item.id : (typeof item.id === 'string' ? item.id.match(/\d{17,20}/)?.[0] : null));
            if (myId && uid && String(uid) === myId) return false;
        } catch (_) {}

        if (!item.user && !item.member && !item.userId && !item.author && !item.record && !item.row && !item.item &&
            (item.guild != null || item.channel != null || item.guild_id != null || item.recipient_ids != null)) {
            return false;
        }

        const uid = item.userId ||
                    item.user?.id ||
                    item.member?.userId ||
                    item.member?.user?.id ||
                    item.member?.id ||
                    item.row?.userId ||
                    item.row?.user?.id ||
                    item.row?.member?.userId ||
                    item.row?.member?.user?.id ||
                    item.item?.userId ||
                    item.item?.user?.id ||
                    item.item?.member?.userId ||
                    item.item?.member?.user?.id ||
                    item.author?.id ||
                    item.record?.userId ||
                    item.record?.id ||
                    item.record?.user?.id ||
                    (typeof item.id === 'string' && /^\d{17,20}$/.test(item.id) ? item.id : (typeof item.id === 'string' ? item.id.match(/\d{17,20}/)?.[0] : null));

        if (uid) return isBlockedOrIgnored(uid);

        if (typeof item.key === 'string') {
            const match = item.key.match(/\d{17,20}/);
            if (match && isBlockedOrIgnored(match[0])) return true;
        }
        return false;
    }

    // Normalization handles ASCII and curly typographical apostrophes (' vs ’)
    function normalizeSettingsText(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
            .trim()
            .toLowerCase();
    }

    const dynamicBlockedPhrases = new Set([
        "accounts you've blocked or ignored",
        "accounts you've blocked",
        "blocked or ignored",
        "blocked accounts",
        "ignored accounts",
        "blocked users",
        "ignored users",
        "you're in control",
        "reducing unwanted interactions",
        "explore our feature guide",
        "feature guide"
    ]);

    function isSettingsBlockedString(str) {
        if (typeof str !== 'string') return false;
        const s = normalizeSettingsText(str);
        if (!s) return false;

        for (const phrase of dynamicBlockedPhrases) {
            if (s.includes(phrase)) return true;
        }
        return s === "blocked" || s === "ignored";
    }

    // Target detection for specific elements without falsely matching parent containers
    function isSettingsBlockedElement(val) {
        if (!val) return false;

        // 1. Plain string
        if (typeof val === 'string') {
            return isSettingsBlockedString(val);
        }

        // 2. React element or props object
        if (typeof val === 'object') {
            const p = val.props || val;

            // Direct title / label / text
            const directKeys = ['title', 'header', 'label', 'text', 'sectionTitle', 'titleText', 'name'];
            for (const k of directKeys) {
                if (typeof p[k] === 'string' && isSettingsBlockedString(p[k])) return true;
            }

            // Description / footer / helpText / subLabel
            const descKeys = ['footer', 'helpText', 'description', 'subLabel', 'note', 'body', 'trailingText'];
            for (const k of descKeys) {
                if (typeof p[k] === 'string' && isSettingsBlockedString(p[k])) return true;
            }

            // String children (e.g. Text component)
            if (typeof p.children === 'string' && isSettingsBlockedString(p.children)) {
                return true;
            }

            // Array of strings in children
            if (Array.isArray(p.children)) {
                const textOnly = p.children.filter(c => typeof c === 'string').join(' ');
                if (textOnly && isSettingsBlockedString(textOnly)) return true;
            }
        }

        return false;
    }

    function renderEmptyRow() {
        if (React && typeof React.createElement === 'function' && View) {
            try {
                return React.createElement(View, {
                    style: { display: 'none', height: 0, width: 0, opacity: 0, overflow: 'hidden' },
                    pointerEvents: 'none'
                });
            } catch (_) {}
        }
        return null;
    }

    // Pure React tree sanitizer that NEVER mutates frozen props
    function sanitizeTree(node, depth = 0) {
        if (!node || depth > 8) return node;

        if (isSettingsBlockedElement(node)) {
            return null;
        }

        if (node.props && node.props.children) {
            if (Array.isArray(node.props.children)) {
                const filtered = [];
                for (let i = 0; i < node.props.children.length; i++) {
                    const child = node.props.children[i];
                    if (!isSettingsBlockedElement(child)) {
                        const sanitized = sanitizeTree(child, depth + 1);
                        if (sanitized) filtered.push(sanitized);
                    }
                }
                return {
                    ...node,
                    props: {
                        ...node.props,
                        children: filtered
                    }
                };
            } else if (typeof node.props.children === 'object') {
                if (isSettingsBlockedElement(node.props.children)) {
                    return {
                        ...node,
                        props: {
                            ...node.props,
                            children: null
                        }
                    };
                }
                return {
                    ...node,
                    props: {
                        ...node.props,
                        children: sanitizeTree(node.props.children, depth + 1)
                    }
                };
            }
        }

        return node;
    }

    // Helper to gather all loaded Metro modules across Vendetta / Bunny / Revenge
    function getAllMetroModules() {
        const modules = new Set();
        if (typeof _metro.findAll === 'function') {
            try {
                const all = _metro.findAll(() => true);
                if (Array.isArray(all)) {
                    for (const m of all) if (m) modules.add(m);
                }
            } catch (_) {}
        }
        if (typeof __r === 'function' && typeof __r.getModules === 'function') {
            try {
                const raw = __r.getModules();
                for (const k in raw) {
                    const mod = raw[k];
                    if (mod?.publicModule?.exports) modules.add(mod.publicModule.exports);
                    else if (mod?.exports) modules.add(mod.exports);
                }
            } catch (_) {}
        }
        if (_vendetta.metro?.modules) {
            try {
                for (const k in _vendetta.metro.modules) {
                    const mod = _vendetta.metro.modules[k];
                    if (mod?.publicModule?.exports) modules.add(mod.publicModule.exports);
                    else if (mod?.exports) modules.add(mod.exports);
                    else if (mod) modules.add(mod);
                }
            } catch (_) {}
        }
        return Array.from(modules);
    }

    function updateHeaderCount(headerItem, diff) {
        if (!headerItem || typeof headerItem !== 'object' || diff <= 0) return headerItem;
        const clonedHeader = { ...headerItem };
        if (typeof clonedHeader.count === 'number') {
            clonedHeader.count = Math.max(0, clonedHeader.count - diff);
        }
        ['title', 'header', 'label', 'text', 'name'].forEach(prop => {
            if (typeof clonedHeader[prop] === 'string') {
                clonedHeader[prop] = clonedHeader[prop].replace(/(\d+)(?=[^\d]*$)/, m => String(Math.max(0, parseInt(m, 10) - diff)));
            }
        });
        return clonedHeader;
    }

    function sanitizeMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        try {
            const refMsg = msg.referenced_message || msg.referencedMessage;
            if (refMsg) {
                const refAuthorId = refMsg.author?.id || refMsg.authorId;
                const refMsgId = refMsg.id;
                if (isBlockedOrIgnored(refAuthorId) || blockedMessageIdsSet.has(String(refMsgId))) {
                    delete msg.referenced_message;
                    delete msg.referencedMessage;
                    delete msg.messageReference;
                    delete msg.message_reference;
                    if (typeof msg.type === 'number' && msg.type === 19) {
                        msg.type = 0;
                    }
                }
            }
        } catch (_) {}
    }

    function isDividerRow(r) {
        if (!r || typeof r !== 'object') return false;
        if (r.type === 3 || r.rowType === 3 || r.type === 'DIVIDER' || r.type === 'DATE' || r.isDivider === true) return true;
        if (typeof r.id === 'string' && (r.id.startsWith('divider') || r.id.startsWith('date'))) return true;
        if (r.date != null && !r.message && !r.author && !r.content) return true;
        return false;
    }

    function isMessageRow(r) {
        if (!r || typeof r !== 'object') return false;
        if (isDividerRow(r)) return false;
        if (r.type === 2 || r.rowType === 2 || r.hidden === true) return false;
        if (r.message && (isBlockedOrIgnored(r.message.author?.id) || blockedMessageIdsSet.has(String(r.message.id)))) return false;
        if (r.item && (isBlockedOrIgnored(r.item.author?.id) || blockedMessageIdsSet.has(String(r.item.id)))) return false;
        return !!(r.message || r.item || r.author || r.content || r.type === 0 || r.type === 'MESSAGE');
    }

    function pruneOrphanedDateDividers(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return rows;
        const result = [];
        let pendingDivider = null;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || typeof row !== 'object') continue;
            if (isDividerRow(row)) {
                pendingDivider = row;
            } else if (isMessageRow(row)) {
                if (pendingDivider) {
                    if (result.length === 0 || !isDividerRow(result[result.length - 1])) {
                        result.push(pendingDivider);
                    }
                    pendingDivider = null;
                }
                result.push(row);
            } else {
                result.push(row);
            }
        }
        return result;
    }

    function cleanChatRows(rows) {
        if (!Array.isArray(rows)) return rows;
        const temp = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || typeof row !== 'object' || row.type == null) continue;
            if (row.type === 2 || row.rowType === 2 || row.hidden === true) continue;
            if (row.message) {
                const authorId = row.message.author?.id || row.author?.id;
                if (isBlockedOrIgnored(authorId) || blockedMessageIdsSet.has(String(row.message.id))) continue;
                sanitizeMessage(row.message);
            }
            if (row.item) {
                const authorId = row.item.author?.id;
                if (isBlockedOrIgnored(authorId) || blockedMessageIdsSet.has(String(row.item.id))) continue;
                sanitizeMessage(row.item);
            }
            temp.push(row);
        }
        return pruneOrphanedDateDividers(temp);
    }

    function sanitizeDesktopStyleChannelMembers(props) {
        if (!props || typeof props !== 'object') return props;
        try {
            const cloned = { ...props };
            let hasFiltered = false;

            if (Array.isArray(cloned.rows)) {
                const origLen = cloned.rows.length;
                cloned.rows = cloned.rows.filter(r => !isMemberBlockedOrIgnored(r));
                if (cloned.rows.length !== origLen) hasFiltered = true;
            }

            if (Array.isArray(cloned.groups)) {
                const blockedCount = props.rows ? props.rows.length - (cloned.rows ? cloned.rows.length : 0) : 0;
                if (blockedCount > 0) {
                    cloned.groups = cloned.groups.map(g => updateHeaderCount(g, blockedCount));
                }
            }

            return hasFiltered ? cloned : props;
        } catch (_) {
            return props;
        }
    }

    function syncFromRelationshipStore() {
        if (!RelationshipStore) return;
        try {
            let updated = false;
            const rels = rawGetRelationships ? rawGetRelationships.call(RelationshipStore) : (typeof RelationshipStore.getRelationships === 'function' ? RelationshipStore.getRelationships() : null);
            if (rels && typeof rels === 'object') {
                for (const uid in rels) {
                    const sUid = String(uid);
                    if (rels[uid] === 2 && !blockedUserIdsSet.has(sUid)) {
                        blockedUserIdsSet.add(sUid);
                        updated = true;
                    }
                    if (rels[uid] === 5 && !ignoredUserIdsSet.has(sUid)) {
                        ignoredUserIdsSet.add(sUid);
                        updated = true;
                    }
                }
            }
            if (rawGetBlockedUserIds) {
                const bIds = rawGetBlockedUserIds.call(RelationshipStore);
                if (Array.isArray(bIds)) {
                    for (const id of bIds) {
                        const sId = String(id);
                        if (!blockedUserIdsSet.has(sId)) {
                            blockedUserIdsSet.add(sId);
                            updated = true;
                        }
                    }
                }
            }
            if (updated) persistBlockedSets();
        } catch (_) {}
    }

    function applyBypassBlockedOrIgnored() {
        try {
            // A. Bypass warning modal when connecting to voice
            const voiceMod = _metro.findByProps && _metro.findByProps('handleVoiceConnect');
            if (voiceMod && typeof voiceMod.handleVoiceConnect === 'function') {
                safePatch('before', voiceMod, 'handleVoiceConnect', function(args) {
                    try {
                        if (args[0] && typeof args[0] === 'object') {
                            args[0].bypassBlockedWarningModal = true;
                        }
                    } catch (_) {}
                });
            }

            // B. Force channel blocked/ignored sets to return empty sets
            const boiHelpers = _metro.findByProps && _metro.findByProps('getBlockedUsersForVoiceChannel', 'getIgnoredUsersForVoiceChannel');
            if (boiHelpers) {
                if (typeof boiHelpers.getBlockedUsersForVoiceChannel === 'function') {
                    safePatch('instead', boiHelpers, 'getBlockedUsersForVoiceChannel', function() {
                        return new Set();
                    });
                }
                if (typeof boiHelpers.getIgnoredUsersForVoiceChannel === 'function') {
                    safePatch('instead', boiHelpers, 'getIgnoredUsersForVoiceChannel', function() {
                        return new Set();
                    });
                }
            }

            // C. Suppress modal when a blocked or ignored user joins your voice channel
            const boiJoin = _metro.findByProps && _metro.findByProps('handleBlockedOrIgnoredUserVoiceChannelJoin');
            if (boiJoin && typeof boiJoin.handleBlockedOrIgnoredUserVoiceChannelJoin === 'function') {
                safePatch('instead', boiJoin, 'handleBlockedOrIgnoredUserVoiceChannelJoin', function() {
                    return;
                });
            }
        } catch (e) {
            console.error('[BypassBlockedOrIgnored Error]', e);
        }
    }

    function startPlugin() {
        try {
            console.log('[BypassBlockedOrIgnored v1.0.12] Initializing...');

            if (!_patcher || typeof _patcher.instead !== 'function') {
                _patcher = (typeof patcher !== 'undefined' && patcher) ||
                           _revenge.patcher ||
                           _vendetta.patcher ||
                           globalThis.vendetta?.patcher ||
                           globalThis.revenge?.patcher ||
                           _patcher;
            }
            if (!_metro || typeof _metro.findByProps !== 'function') {
                _metro = (typeof metro !== 'undefined' && metro) ||
                          _revenge.modules?.finders ||
                          _vendetta.metro ||
                          globalThis.vendetta?.metro ||
                          globalThis.revenge?.modules?.finders ||
                          _metro;
            }
            if (!_FluxDispatcher) {
                _FluxDispatcher = _revenge.discord?.flux?.Dispatcher ||
                                  _revenge.discord?.flux?.FluxDispatcher ||
                                  _common.FluxDispatcher ||
                                  (_metro.findByProps && (_metro.findByProps('dispatch', 'subscribe') || _metro.findByProps('dispatch')));
            }

            if (_metro.findByProps) {
                RelationshipStore = (_metro.findByStoreName && _metro.findByStoreName('RelationshipStore')) ||
                                    (_metro.find && _metro.find(m => m?.getName?.() === 'RelationshipStore' || m?.default?.getName?.() === 'RelationshipStore')) ||
                                    _metro.findByProps('getRelationships', 'isBlocked') ||
                                    _metro.findByProps('isBlocked') ||
                                    _metro.findByProps('getRelationships');
                GuildMemberStore = (_metro.findByStoreName && _metro.findByStoreName('GuildMemberStore')) ||
                                   _metro.findByProps('getMember', 'getMembers');
                ChannelMemberStore = (_metro.findByStoreName && (_metro.findByStoreName('ChannelMemberStore') || _metro.findByStoreName('ChannelMembersStore'))) ||
                                     _metro.findByProps('getProps', 'getRows');
                MemberListStore = (_metro.findByStoreName && (_metro.findByStoreName('GuildMemberListStore') || _metro.findByStoreName('ChannelMemberListStore'))) ||
                                  _metro.findByProps('getMemberListSections') ||
                                  _metro.findByProps('getRows', 'getGroups');
                MessageStore = (_metro.findByStoreName && _metro.findByStoreName('MessageStore')) ||
                               _metro.findByProps('getMessages', 'getMessage');
                UserStore = (_metro.findByStoreName && _metro.findByStoreName('UserStore')) ||
                            _metro.findByProps('getUser', 'getUsers');
                TypingStore = _metro.findByProps('getTypingUsers');
                PresenceStore = (_metro.findByStoreName && _metro.findByStoreName('PresenceStore')) ||
                                _metro.findByProps('getState', 'getStatus') ||
                                _metro.findByProps('getStatus');
                RowManager = _metro.findByProps('RowManager')?.RowManager ||
                             (_metro.findByName && _metro.findByName('RowManager'));
                if (!React) {
                    React = (typeof globalThis !== 'undefined' && globalThis.React) ||
                            _common.React ||
                            _metro.findByProps('createElement', 'Component') ||
                            _metro.findByProps('createElement');
                }
                if (!View) {
                    View = _metro.findByProps('View')?.View || (typeof uiComponents !== 'undefined' && uiComponents.View);
                }
            }

            if (RelationshipStore) {
                const store = RelationshipStore.default && typeof RelationshipStore.default.getRelationships === 'function' ? RelationshipStore.default : RelationshipStore;
                rawIsBlocked = store.isBlocked;
                rawIsIgnored = store.isIgnored;
                rawGetRelationships = store.getRelationships;
                rawGetBlockedUserIds = store.getBlockedUserIds;
                syncFromRelationshipStore();
            }
            if (PresenceStore) {
                const store = PresenceStore.default && typeof PresenceStore.default.getStatus === 'function' ? PresenceStore.default : PresenceStore;
                rawGetPresenceStatus = store.getStatus;
            }

            applyBypassBlockedOrIgnored();

            notifyActive();
            console.log('[BypassBlockedOrIgnored v1.0.12] Loaded and active successfully.');
        } catch (e) {
            console.error('[BypassBlockedOrIgnored v1.0.12 Error]', e);
        }
    }

    function stopPlugin() {
        try {
            console.log('[BypassBlockedOrIgnored v1.0.12] Stopping...');
            while (unpatches.length > 0) {
                const unpatch = unpatches.pop();
                try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
            }
            console.log('[BypassBlockedOrIgnored v1.0.12] Stopped cleanly.');
        } catch (e) {
            console.error('[BypassBlockedOrIgnored v1.0.12 Error stopping]', e);
        }
    }

    const pluginExport = {
        name: 'BypassBlockedOrIgnored',
        description: 'Bypass the blocked or ignored user modal if present in voice channels.',
        authors: [{ name: 'Antigravity', id: '698947564459917343' }],
        version: '1.0.12',
        start: startPlugin,
        stop: stopPlugin,
        onLoad: startPlugin,
        onUnload: stopPlugin
    };

    return {
        default: pluginExport,
        start: startPlugin,
        stop: stopPlugin,
        onLoad: startPlugin,
        onUnload: stopPlugin,
        __esModule: true
    };
})(
    typeof vendetta !== 'undefined' ? vendetta : (typeof window !== 'undefined' ? window.vendetta : (typeof revenge !== 'undefined' ? revenge : (typeof bunny !== 'undefined' ? bunny : undefined)))
);
