/**
 * @name RemoveBlockedUsers
 * @description Removes blocked and ignored messages, collapsed bars, member list rows, typing indicators, and reactions with 1:1 desktop parity.
 * @version 1.8.5
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
    let isStarted = false;

    // Universal Metro Finders across Vendetta, Revenge, and Bunny
    function findByProps(...props) {
        try {
            if (_metro && typeof _metro.findByProps === 'function') return _metro.findByProps(...props);
            if (_metro && typeof _metro.byProps === 'function') return _metro.byProps(...props);
            if (_vendetta.metro && typeof _vendetta.metro.findByProps === 'function') return _vendetta.metro.findByProps(...props);
            if (_revenge.modules?.finders && typeof _revenge.modules.finders.byProps === 'function') return _revenge.modules.finders.byProps(...props);
            if (typeof vendetta !== 'undefined' && vendetta.metro?.findByProps) return vendetta.metro.findByProps(...props);
            if (typeof revenge !== 'undefined' && revenge.modules?.finders?.byProps) return revenge.modules.finders.byProps(...props);
            if (typeof bunny !== 'undefined' && bunny.metro?.findByProps) return bunny.metro.findByProps(...props);
        } catch (_) {}
        return null;
    }

    function findByName(name, defaultExp = true) {
        try {
            if (_metro && typeof _metro.findByName === 'function') return _metro.findByName(name, defaultExp);
            if (_metro && typeof _metro.byName === 'function') return _metro.byName(name, defaultExp);
            if (_vendetta.metro && typeof _vendetta.metro.findByName === 'function') return _vendetta.metro.findByName(name, defaultExp);
            if (_revenge.modules?.finders && typeof _revenge.modules.finders.byName === 'function') return _revenge.modules.finders.byName(name, defaultExp);
            if (typeof vendetta !== 'undefined' && vendetta.metro?.findByName) return vendetta.metro.findByName(name, defaultExp);
            if (typeof revenge !== 'undefined' && revenge.modules?.finders?.byName) return revenge.modules.finders.byName(name, defaultExp);
        } catch (_) {}
        return null;
    }

    function findByStoreName(name) {
        try {
            if (_metro && typeof _metro.findByStoreName === 'function') return _metro.findByStoreName(name);
            const found = findByProps(name);
            if (found) return found;
        } catch (_) {}
        return null;
    }

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

    // React Component Patcher supporting Functions, React.forwardRef, and React.memo
    function safePatchComponent(mod, prop, hook) {
        if (!mod || !prop) return;
        let target;
        try { target = mod[prop]; } catch (_) { return; }
        if (!target) return;

        // A. Direct function component
        if (typeof target === 'function') {
            safePatch('instead', mod, prop, function(args, orig) {
                return hook.call(this, args, orig);
            });
            return;
        }

        // B. Unwrap memo / forwardRef layers
        let current = target;
        for (let depth = 0; depth < 5; depth++) {
            if (!current || typeof current !== 'object') break;

            if (typeof current.render === 'function') {
                safePatch('instead', current, 'render', function(args, orig) {
                    return hook.call(this, args, orig);
                });
                return;
            }

            if (typeof current.type === 'function') {
                safePatch('instead', current, 'type', function(args, orig) {
                    return hook.call(this, args, orig);
                });
                return;
            }

            if (current.type && typeof current.type === 'object') {
                current = current.type;
                continue;
            }

            if (current.default && typeof current.default === 'object') {
                current = current.default;
                continue;
            }

            break;
        }
    }

    let _FluxDispatcher = null;
    let React = null;
    let View = null;

    function notifyActive() {
        try {
            if (_revenge.discord?.actions?.ToastActionCreators?.open) {
                _revenge.discord.actions.ToastActionCreators.open({
                    key: 'plugin-active',
                    content: 'RemoveBlockedUsers v1.8.5: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('RemoveBlockedUsers v1.8.5: ACTIVE');
                return;
            }
        } catch (_) {}
    }

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
        if (blockedUserIdsSet.has(s) || ignoredUserIdsSet.has(s)) return true;

        // Fallback to raw store methods
        try {
            if (rawIsBlocked && rawIsBlocked(s)) {
                blockedUserIdsSet.add(s);
                return true;
            }
            if (rawIsIgnored && rawIsIgnored(s)) {
                ignoredUserIdsSet.add(s);
                return true;
            }
        } catch (_) {}
        return false;
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

    // Exact string detection handling typographical curly apostrophes (' vs ’)
    function isSettingsBlockedSection(val, depth = 0) {
        if (!val || depth > 6) return false;
        if (typeof val === 'string') {
            const lower = val.replace(/[\u2018\u2019\u0060\u00B4]/g, "'").trim().toLowerCase();
            return lower.includes("accounts you've blocked or ignored") ||
                   lower.includes("accounts you've blocked") ||
                   lower.includes("blocked or ignored") ||
                   lower.startsWith("blocked accounts") ||
                   lower.startsWith("ignored accounts") ||
                   lower === "blocked users" ||
                   lower === "ignored users" ||
                   lower.includes("you're in control") ||
                   lower.includes("reducing unwanted interactions") ||
                   lower.includes("explore our feature guide") ||
                   lower.includes("feature guide") ||
                   (lower === "blocked" && depth > 0) ||
                   (lower === "ignored" && depth > 0);
        }
        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                if (isSettingsBlockedSection(val[i], depth + 1)) return true;
            }
            const joined = val.filter(x => typeof x === 'string').join(' ');
            if (joined && isSettingsBlockedSection(joined, depth + 1)) return true;
            return false;
        }
        if (typeof val === 'object') {
            for (const k of [
                'label', 'text', 'title', 'header', 'subLabel', 'sublabel',
                'description', 'footer', 'helpText', 'note', 'accessibilityLabel',
                'aria-label', 'children', 'content', 'body', 'hint'
            ]) {
                if (val[k] && isSettingsBlockedSection(val[k], depth + 1)) return true;
            }
            if (val.props && isSettingsBlockedSection(val.props, depth + 1)) return true;
        }
        return false;
    }

    function renderEmptyRow() {
        if (React && typeof React.createElement === 'function') {
            try {
                const V = View || 'View';
                return React.createElement(V, {
                    style: { height: 0, width: 0, opacity: 0, overflow: 'hidden' },
                    pointerEvents: 'none'
                });
            } catch (_) {}
        }
        return null;
    }

    function updateHeaderCount(headerItem, diff) {
        if (!headerItem || typeof headerItem !== 'object' || diff <= 0) return headerItem;
        const cloned = { ...headerItem };
        if (typeof cloned.count === 'number') {
            cloned.count = Math.max(0, cloned.count - diff);
        }
        ['title', 'header', 'label', 'text', 'name'].forEach(prop => {
            if (typeof cloned[prop] === 'string') {
                cloned[prop] = cloned[prop].replace(/(\d+)(?=[^\d]*$)/, m => String(Math.max(0, parseInt(m, 10) - diff)));
            }
        });
        return cloned;
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

    // Proven DevilBro Algorithm with DENSE, Contiguous React Native Array Safety
    function sanitizeDesktopStyleChannelMembers(props) {
        if (!props || typeof props !== 'object') return props;
        if (!Array.isArray(props.rows) || !Array.isArray(props.groups)) return props;

        let hiddenRows = false;
        const newGroups = props.groups.map(g => (g && typeof g === 'object') ? { ...g } : g);
        const newRows = new Array(props.rows.length);

        const groupMap = new Map();
        newGroups.forEach(g => { if (g && g.id) groupMap.set(g.id, g); });

        const isGroupRow = row => {
            if (!row || typeof row !== 'object') return false;
            return row.type === 'GROUP' || row.rowType === 'GROUP' || row.header === true ||
                   (typeof row.id === 'string' && groupMap.has(row.id));
        };

        const isMemberRow = row => {
            if (!row || typeof row !== 'object') return false;
            if (isGroupRow(row)) return false;
            return row.type === 'MEMBER' || row.rowType === 'MEMBER' || !!(row.user || row.member || row.userId || row.nick);
        };

        for (let i = 0; i < props.rows.length; i++) {
            const row = props.rows[i];
            if (!row || typeof row !== 'object') {
                newRows[i] = row;
                continue;
            }
            if (!isMemberRow(row)) {
                newRows[i] = row;
                continue;
            }
            if (!isMemberBlockedOrIgnored(row)) {
                newRows[i] = row;
                continue;
            }

            hiddenRows = true;
            newRows[i] = undefined;

            let found = false;
            let rowIndex = i - 1;
            while (!found && rowIndex > -1) {
                const prev = newRows[rowIndex];
                if (prev && isGroupRow(prev)) {
                    found = true;
                    const groupIndex = newGroups.findIndex(g => g && g.id === prev.id);
                    if (groupIndex > -1 && typeof newGroups[groupIndex].count === 'number') {
                        newGroups[groupIndex].count = Math.max(0, newGroups[groupIndex].count - 1);
                        if (typeof newGroups[groupIndex].title === 'string') {
                            newGroups[groupIndex].title = newGroups[groupIndex].title.replace(/(\d+)(?=[^\d]*$)/, String(newGroups[groupIndex].count));
                        }
                        prev.count = newGroups[groupIndex].count;
                        prev.title = newGroups[groupIndex].title;
                    }
                } else {
                    rowIndex--;
                }
            }
        }

        if (!hiddenRows) return props;

        for (let i = 0; i < newRows.length; i++) {
            const r = newRows[i];
            if (r && isGroupRow(r) && typeof r.count === 'number' && r.count <= 0) {
                newRows[i] = undefined;
            }
        }

        // Return dense contiguous arrays without undefined slots (safe for React Native FlatList/FlashList)
        const finalRows = newRows.filter(r => r != null);
        const finalGroups = newGroups.filter(g => g != null && (typeof g.count !== 'number' || g.count > 0));

        for (let i = 0; i < finalGroups.length; i++) {
            const grp = finalGroups[i];
            if (!grp) continue;
            let actualIdx = finalRows.findIndex(r => r && r.id === grp.id);
            if (actualIdx !== -1) grp.index = actualIdx;
        }

        if (finalGroups[0] && finalGroups[0].id === 'content-inventory-feed') {
            finalGroups[0].index = Math.max(0, finalRows.length - (finalGroups[0].count + 1));
        }

        return {
            ...props,
            rows: finalRows,
            groups: finalGroups
        };
    }

    function syncFromRelationshipStore() {
        if (!RelationshipStore) return;
        try {
            let updated = false;
            const rels = rawGetRelationships ? rawGetRelationships() : (typeof RelationshipStore.getRelationships === 'function' ? RelationshipStore.getRelationships() : null);
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
                const bIds = rawGetBlockedUserIds();
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

    // =========================================================================
    // FEATURE 1: RemoveBlockedUsers (Chat, Member Lists, Reactions, Typing)
    // =========================================================================
    function applyRemoveBlockedUsers() {
        if (!true) return;

        // A. FluxDispatcher: Chat Message Filtering & Realtime Relationship Sync
        if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
            safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                const event = args[0];
                if (event && typeof event === 'object') {
                    try {
                        if (event.type === 'RELATIONSHIP_ADD' && event.relationship) {
                            const rid = String(event.relationship.id);
                            if (event.relationship.type === 2) blockedUserIdsSet.add(rid);
                            if (event.relationship.type === 5) ignoredUserIdsSet.add(rid);
                            persistBlockedSets();
                        }
                        if (event.type === 'RELATIONSHIP_REMOVE') {
                            const rid = String(event.relationship?.id || event.userId || '');
                            if (rid) {
                                blockedUserIdsSet.delete(rid);
                                ignoredUserIdsSet.delete(rid);
                                persistBlockedSets();
                            }
                        }
                        if (event.type === 'CONNECTION_OPEN') {
                            cachedCurrentUserId = event.user?.id ? String(event.user.id) : null;
                            if (Array.isArray(event.relationships)) {
                                blockedUserIdsSet.clear();
                                ignoredUserIdsSet.clear();
                                for (const r of event.relationships) {
                                    const rid = String(r.id);
                                    if (r.type === 2) blockedUserIdsSet.add(rid);
                                    if (r.type === 5) ignoredUserIdsSet.add(rid);
                                }
                                persistBlockedSets();
                            }
                        }

                        // Filter incoming messages
                        if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                            event.messages = event.messages.filter(msg => {
                                if (!msg) return false;
                                if (isBlockedOrIgnored(msg.author?.id)) {
                                    if (msg.id) blockedMessageIdsSet.add(String(msg.id));
                                    return false;
                                }
                                return true;
                            });
                            for (const msg of event.messages) sanitizeMessage(msg);
                        }
                        if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                            if (isBlockedOrIgnored(event.message.author?.id)) {
                                if (event.message.id) blockedMessageIdsSet.add(String(event.message.id));
                                event.channelId = '0';
                                return;
                            }
                            sanitizeMessage(event.message);
                        }
                        if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                            return;
                        }
                        if (event.type === 'PRESENCE_UPDATE') {
                            const uid = event.user?.id || event.userId;
                            if (uid && isBlockedOrIgnored(uid)) return;
                        }
                    } catch (_) {}
                }
                return orig ? orig.apply(this, args) : null;
            });
        }

        // B. ChannelMemberStore
        if (ChannelMemberStore) {
            if (typeof ChannelMemberStore.getProps === 'function') {
                safePatch('after', ChannelMemberStore, 'getProps', function(args, res) {
                    return sanitizeDesktopStyleChannelMembers(res);
                });
            }
            if (typeof ChannelMemberStore.getRows === 'function') {
                safePatch('after', ChannelMemberStore, 'getRows', function(args, res) {
                    if (!Array.isArray(res)) return res;
                    return res.filter(r => !isMemberBlockedOrIgnored(r));
                });
            }
        }

        // C. MemberListStore
        if (MemberListStore) {
            if (typeof MemberListStore.getMemberListSections === 'function') {
                safePatch('instead', MemberListStore, 'getMemberListSections', function(args, orig) {
                    const sections = orig ? orig.apply(this, args) : [];
                    if (!Array.isArray(sections)) return sections;
                    return sections.map(sec => {
                        if (!sec || typeof sec !== 'object') return sec;
                        let updated = { ...sec };
                        ['rows', 'items', 'data', 'members'].forEach(key => {
                            if (Array.isArray(updated[key])) {
                                const origLen = updated[key].length;
                                const filtered = updated[key].filter(it => !isMemberBlockedOrIgnored(it));
                                const diff = origLen - filtered.length;
                                if (diff > 0) {
                                    updated[key] = filtered;
                                    updated = updateHeaderCount(updated, diff);
                                }
                            }
                        });
                        return updated;
                    });
                });
            }
            if (typeof MemberListStore.getRows === 'function') {
                safePatch('instead', MemberListStore, 'getRows', function(args, orig) {
                    const rows = orig ? orig.apply(this, args) : [];
                    if (!Array.isArray(rows)) return rows;
                    return rows.filter(r => !isMemberBlockedOrIgnored(r));
                });
            }
        }

        // D. GuildMemberStore
        if (GuildMemberStore) {
            if (typeof GuildMemberStore.getMember === 'function') {
                safePatch('instead', GuildMemberStore, 'getMember', function(args, orig) {
                    const uid = args[1];
                    try {
                        const myId = getCurrentUserId();
                        if (myId && String(uid) === myId) return orig ? orig.apply(this, args) : null;
                    } catch (_) {}
                    if (uid && isBlockedOrIgnored(uid)) return null;
                    return orig ? orig.apply(this, args) : null;
                });
            }
            if (typeof GuildMemberStore.getMembers === 'function') {
                safePatch('instead', GuildMemberStore, 'getMembers', function(args, orig) {
                    const res = orig ? orig.apply(this, args) : [];
                    if (!Array.isArray(res)) return res;
                    return res.filter(m => !isMemberBlockedOrIgnored(m));
                });
            }
            if (typeof GuildMemberStore.getMemberIds === 'function') {
                safePatch('instead', GuildMemberStore, 'getMemberIds', function(args, orig) {
                    const res = orig ? orig.apply(this, args) : [];
                    if (!Array.isArray(res)) return res;
                    return res.filter(id => !isBlockedOrIgnored(id));
                });
            }
            if (typeof GuildMemberStore.isMember === 'function') {
                safePatch('instead', GuildMemberStore, 'isMember', function(args, orig) {
                    const uid = args[1];
                    if (uid && isBlockedOrIgnored(uid)) return false;
                    return orig ? orig.apply(this, args) : false;
                });
            }
        }

        // E. PresenceStore
        if (PresenceStore) {
            if (typeof PresenceStore.getStatus === 'function') {
                safePatch('instead', PresenceStore, 'getStatus', function(args, orig) {
                    const uid = args[0];
                    if (uid && isBlockedOrIgnored(uid)) return 'offline';
                    return orig ? orig.apply(this, args) : 'offline';
                });
            }
            if (typeof PresenceStore.getState === 'function') {
                safePatch('after', PresenceStore, 'getState', function(args, res) {
                    if (!res || typeof res !== 'object') return res;
                    const cloned = { ...res };
                    for (const uid of blockedUserIdsSet) delete cloned[uid];
                    return cloned;
                });
            }
        }

        // F. MessageStore
        if (MessageStore && typeof MessageStore.getMessage === 'function') {
            safePatch('after', MessageStore, 'getMessage', function(args, res) {
                if (res) sanitizeMessage(res);
                return res;
            });
        }

        // G. RowManager: Chat Row Elimination
        if (RowManager && RowManager.prototype) {
            safePatch('before', RowManager.prototype, 'generate', function(args) {
                const data = args[0];
                if (!data) return;
                if (data.message) {
                    if (isBlockedOrIgnored(data.message.author?.id) || blockedMessageIdsSet.has(String(data.message.id))) {
                        data.hidden = true;
                        data.renderContentOnly = true;
                        data.message.content = '';
                        data.message.reactions = [];
                        data.message.canShowComponents = false;
                        delete data.timestamp;
                        delete data.date;
                    }
                    sanitizeMessage(data.message);
                }
                if (data.rowType === 2 || data.type === 2) {
                    data.hidden = true;
                    data.renderContentOnly = true;
                    data.roleStyle = '';
                    data.text = '';
                    data.revealed = false;
                    data.content = [];
                    data.count = 0;
                }
                if (data.reply || data.referencedMessage || data.referenced_message) {
                    const ref = data.referencedMessage || data.referenced_message || data.reply?.message;
                    if (ref && (isBlockedOrIgnored(ref.author?.id) || blockedMessageIdsSet.has(String(ref.id)))) {
                        delete data.reply;
                        delete data.referencedMessage;
                        delete data.referenced_message;
                        if (data.message) {
                            data.message.type = 0;
                            delete data.message.referenced_message;
                        }
                    }
                }
            });

            safePatch('after', RowManager.prototype, 'generate', function(args, res) {
                if (!res) return res;
                if (res.message) {
                    if (isBlockedOrIgnored(res.message.author?.id) || blockedMessageIdsSet.has(String(res.message.id))) {
                        res.hidden = true;
                        res.renderContentOnly = true;
                        res.text = '';
                        res.content = [];
                        delete res.timestamp;
                        delete res.date;
                        return res;
                    }
                    sanitizeMessage(res.message);
                }
                if (res.rowType === 2 || res.type === 2) {
                    res.hidden = true;
                    res.renderContentOnly = true;
                    res.roleStyle = '';
                    res.text = '';
                    res.revealed = false;
                    res.content = [];
                    res.count = 0;
                }
                return res;
            });

            if (typeof RowManager.prototype.getRows === 'function') {
                safePatch('instead', RowManager.prototype, 'getRows', function(args, orig) {
                    const res = orig ? orig.apply(this, args) : [];
                    if (!Array.isArray(res)) return res;
                    return cleanChatRows(res);
                });
            }
        }

        try {
            const ChatModule = findByProps('updateRows');
            if (ChatModule && typeof ChatModule.updateRows === 'function') {
                safePatch('before', ChatModule, 'updateRows', function(args) {
                    for (let i = 0; i < args.length; i++) {
                        if (Array.isArray(args[i])) args[i] = cleanChatRows(args[i]);
                    }
                });
            }
        } catch (_) {}

        // H. TypingStore
        if (TypingStore && typeof TypingStore.getTypingUsers === 'function') {
            safePatch('instead', TypingStore, 'getTypingUsers', function(args, orig) {
                const res = orig ? orig.apply(this, args) : {};
                if (!res || typeof res !== 'object') return res;
                const filtered = {};
                for (const uId in res) {
                    if (!isBlockedOrIgnored(uId)) filtered[uId] = res[uId];
                }
                return filtered;
            });
        }

        // I. Direct Member & Blocked Row Component Hooks
        try {
            const memberRowNames = ['MemberListItem', 'GuildMemberRow', 'ChannelMemberRow', 'MemberRow', 'GuildMemberListItem'];
            for (const name of memberRowNames) {
                const holder = findByProps(name);
                if (holder) {
                    safePatchComponent(holder, name, function(args, orig) {
                        const props = args[0];
                        if (isMemberBlockedOrIgnored(props)) return renderEmptyRow();
                        return orig ? orig.apply(this, args) : null;
                    });
                }
            }

            const blockedRowNames = ['BlockedMessageRow', 'BlockedRow', 'BlockedGroup', 'BlockedMessageGroup', 'BlockedMessages'];
            for (const name of blockedRowNames) {
                const holder = findByProps(name);
                if (holder) {
                    safePatchComponent(holder, name, function() {
                        return renderEmptyRow();
                    });
                }
            }
        } catch (_) {}
    }

    // =========================================================================
    // FEATURE 2: HideBlockedInSettings (Settings & Friends Navigation Hiding)
    // =========================================================================
    function applyHideBlockedInSettings() {
        if (!false) return;

        // A. RelationshipStore: Neutralize isBlocked & queries for Discord UI components
        if (RelationshipStore) {
            if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                safePatch('instead', RelationshipStore, 'getBlockedUserIds', () => []);
            }
            if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                safePatch('instead', RelationshipStore, 'getIgnoredUserIds', () => []);
            }
            if (typeof RelationshipStore.getBlockedOrIgnoredUserIds === 'function') {
                safePatch('instead', RelationshipStore, 'getBlockedOrIgnoredUserIds', () => []);
            }
            if (typeof RelationshipStore.getBlockedOrIgnoredIDs === 'function') {
                safePatch('instead', RelationshipStore, 'getBlockedOrIgnoredIDs', () => []);
            }
            if (typeof RelationshipStore.getBlockedCount === 'function') {
                safePatch('instead', RelationshipStore, 'getBlockedCount', () => 0);
            }
            if (typeof RelationshipStore.getIgnoredCount === 'function') {
                safePatch('instead', RelationshipStore, 'getIgnoredCount', () => 0);
            }
            if (typeof RelationshipStore.hasBlocked === 'function') {
                safePatch('instead', RelationshipStore, 'hasBlocked', () => false);
            }
            if (typeof RelationshipStore.hasIgnored === 'function') {
                safePatch('instead', RelationshipStore, 'hasIgnored', () => false);
            }
            if (typeof RelationshipStore.isBlocked === 'function') {
                safePatch('instead', RelationshipStore, 'isBlocked', () => false);
            }
            if (typeof RelationshipStore.isIgnored === 'function') {
                safePatch('instead', RelationshipStore, 'isIgnored', () => false);
            }
            if (typeof RelationshipStore.getRelationships === 'function') {
                safePatch('instead', RelationshipStore, 'getRelationships', function(args, orig) {
                    const res = orig ? orig.apply(this, args) : {};
                    if (!res || typeof res !== 'object') return res;
                    const cloned = { ...res };
                    for (const uid in cloned) {
                        if (cloned[uid] === 2 || cloned[uid] === 5) delete cloned[uid];
                    }
                    return cloned;
                });
            }
            if (typeof RelationshipStore.getRelationshipType === 'function') {
                safePatch('instead', RelationshipStore, 'getRelationshipType', function(args, orig) {
                    const targetId = args[0];
                    if (isBlockedOrIgnored(targetId)) return 0;
                    return orig ? orig.apply(this, args) : 0;
                });
            }
            if (typeof RelationshipStore.getRelationshipCount === 'function') {
                safePatch('instead', RelationshipStore, 'getRelationshipCount', function(args, orig) {
                    const type = args[0];
                    if (type === 2 || type === 5) return 0;
                    return orig ? orig.apply(this, args) : 0;
                });
            }
        }

        // B. Native Settings Form Components (TableRow, TableSection, TableRowGroup, FormRow, FormSection)
        try {
            const settingsTargetMods = new Set();
            if (_vendetta.ui?.components?.Forms) settingsTargetMods.add(_vendetta.ui.components.Forms);
            if (_vendetta.ui?.components) settingsTargetMods.add(_vendetta.ui.components);

            const formKeys = [
                'TableRow', 'TableSection', 'TableRowGroup',
                'TableSwitchRow', 'TableRadioRow', 'TableCheckboxRow',
                'FormRow', 'FormSection', 'FormHelpText', 'FormNotice', 'FormLabel', 'FormTitle',
                'FormSectionTitle', 'TableSectionHeader', 'SettingsSection', 'SettingsRow',
                'SettingsRowGroup', 'SettingsNotice', 'SettingsHelpText'
            ];
            for (const p of formKeys) {
                const m = findByProps(p);
                if (m && typeof m === 'object') {
                    settingsTargetMods.add(m);
                    if (m.default && typeof m.default === 'object') settingsTargetMods.add(m.default);
                }
            }
            for (const mod of settingsTargetMods) {
                for (const k of formKeys) {
                    safePatchComponent(mod, k, function(args, orig) {
                        const p = args[0] || {};
                        if (isSettingsBlockedSection(p)) return renderEmptyRow();
                        if (p.children) {
                            const flatChildren = Array.isArray(p.children) ? p.children.flat(Infinity) : [p.children];
                            const validChildren = flatChildren.filter(c => c != null && c !== false);
                            if (validChildren.length > 0) {
                                const nonBlocked = validChildren.filter(c => !isSettingsBlockedSection(c));
                                if (nonBlocked.length === 0) return renderEmptyRow();
                            }
                        }
                        const res = orig ? orig.apply(this, args) : null;
                        if (res && res.props) {
                            if (isSettingsBlockedSection(res.props)) return renderEmptyRow();
                            if (res.props.children) {
                                const flatRes = Array.isArray(res.props.children) ? res.props.children.flat(Infinity) : [res.props.children];
                                const validRes = flatRes.filter(c => c != null && c !== false);
                                if (validRes.length > 0 && validRes.every(c => isSettingsBlockedSection(c))) {
                                    return renderEmptyRow();
                                }
                            }
                        }
                        return res;
                    });
                }
            }
        } catch (_) {}

        // C. Friends Navigation Tablist Filter
        try {
            const friendsNavMod = findByProps('FriendsTabs', 'getFriendsTabs');
            if (friendsNavMod) {
                for (const key of ['FriendsTabs', 'getFriendsTabs']) {
                    if (typeof friendsNavMod[key] === 'function') {
                        safePatch('after', friendsNavMod, key, function(args, res) {
                            if (Array.isArray(res)) {
                                return res.filter(t => !/blocked/i.test(t?.id || t?.title || t?.key || ''));
                            }
                            return res;
                        });
                    }
                }
            }
        } catch (_) {}
    }

    // =========================================================================
    // FEATURE 3: BypassBlockedOrIgnored (Voice Channel Modal Bypass)
    // =========================================================================
    function applyBypassBlockedOrIgnored() {
        if (!false) return;
        try {
            // A. Bypass warning modal when connecting to voice
            const voiceMod = findByProps('handleVoiceConnect');
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
            const boiHelpers = findByProps('getBlockedUsersForVoiceChannel', 'getIgnoredUsersForVoiceChannel');
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
            const boiJoin = findByProps('handleBlockedOrIgnoredUserVoiceChannelJoin');
            if (boiJoin && typeof boiJoin.handleBlockedOrIgnoredUserVoiceChannelJoin === 'function') {
                safePatch('instead', boiJoin, 'handleBlockedOrIgnoredUserVoiceChannelJoin', function() {
                    return;
                });
            }
        } catch (e) {
            console.error('[BypassBlockedOrIgnored Error]', e);
        }
    }

    // =========================================================================
    // Plugin Lifecycle
    // =========================================================================
    function startPlugin() {
        if (isStarted) {
            console.log('[RemoveBlockedUsers v1.8.5] Already started, ignoring duplicate call.');
            return;
        }
        isStarted = true;

        try {
            console.log('[RemoveBlockedUsers v1.8.5] Initializing...');

            if (!_patcher || typeof _patcher.instead !== 'function') {
                _patcher = (typeof patcher !== 'undefined' && patcher) ||
                           _vendetta.patcher ||
                           _revenge.patcher ||
                           globalThis.vendetta?.patcher ||
                           globalThis.revenge?.patcher ||
                           _patcher;
            }
            if (!_metro) {
                _metro = (typeof metro !== 'undefined' && metro) ||
                          _vendetta.metro ||
                          _revenge.modules?.finders ||
                          globalThis.vendetta?.metro ||
                          globalThis.revenge?.modules?.finders ||
                          {};
            }
            if (!_FluxDispatcher) {
                _FluxDispatcher = _revenge.discord?.flux?.Dispatcher ||
                                  _revenge.discord?.flux?.FluxDispatcher ||
                                  _common.FluxDispatcher ||
                                  findByProps('dispatch', 'subscribe') ||
                                  findByProps('dispatch');
            }

            RelationshipStore = findByProps('getRelationships', 'isBlocked') ||
                                findByProps('isBlocked') ||
                                findByProps('getRelationships');
            GuildMemberStore = findByProps('getMember', 'getMembers');
            ChannelMemberStore = findByProps('getProps', 'getRows') ||
                                 findByStoreName('ChannelMemberStore') ||
                                 findByStoreName('ChannelMembersStore');
            MemberListStore = findByProps('getMemberListSections') ||
                              findByProps('getRows', 'getGroups') ||
                              findByStoreName('GuildMemberListStore') ||
                              findByStoreName('ChannelMemberListStore');
            MessageStore = findByProps('getMessages', 'getMessage');
            UserStore = findByProps('getUser', 'getUsers');
            TypingStore = findByProps('getTypingUsers');
            PresenceStore = findByProps('getState', 'getStatus') || findByProps('getStatus');
            RowManager = findByProps('RowManager')?.RowManager || findByName('RowManager');
            if (!React) {
                React = (typeof globalThis !== 'undefined' && globalThis.React) ||
                        _common.React ||
                        findByProps('createElement', 'Component') ||
                        findByProps('createElement');
            }
            if (!View) {
                View = findByProps('View')?.View || (typeof uiComponents !== 'undefined' && uiComponents.View);
            }

            if (RelationshipStore) {
                if (!rawIsBlocked && typeof RelationshipStore.isBlocked === 'function') {
                    rawIsBlocked = RelationshipStore.isBlocked.bind(RelationshipStore);
                }
                if (!rawIsIgnored && typeof RelationshipStore.isIgnored === 'function') {
                    rawIsIgnored = RelationshipStore.isIgnored.bind(RelationshipStore);
                }
                if (!rawGetRelationships && typeof RelationshipStore.getRelationships === 'function') {
                    rawGetRelationships = RelationshipStore.getRelationships.bind(RelationshipStore);
                }
                if (!rawGetBlockedUserIds && typeof RelationshipStore.getBlockedUserIds === 'function') {
                    rawGetBlockedUserIds = RelationshipStore.getBlockedUserIds.bind(RelationshipStore);
                }
                syncFromRelationshipStore();
            }
            if (PresenceStore) {
                rawGetPresenceStatus = PresenceStore.getStatus;
            }

            try { applyRemoveBlockedUsers(); } catch (err) { console.error('[applyRemoveBlockedUsers Error]', err); }
            try { applyHideBlockedInSettings(); } catch (err) { console.error('[applyHideBlockedInSettings Error]', err); }
            try { applyBypassBlockedOrIgnored(); } catch (err) { console.error('[applyBypassBlockedOrIgnored Error]', err); }

            notifyActive();
            console.log('[RemoveBlockedUsers v1.8.5] Loaded and active successfully.');
        } catch (e) {
            console.error('[RemoveBlockedUsers v1.8.5 Error]', e);
        }
    }

    function stopPlugin() {
        if (!isStarted) return;
        isStarted = false;

        try {
            console.log('[RemoveBlockedUsers v1.8.5] Stopping...');
            while (unpatches.length > 0) {
                const unpatch = unpatches.pop();
                try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
            }
            console.log('[RemoveBlockedUsers v1.8.5] Stopped cleanly.');
        } catch (e) {
            console.error('[RemoveBlockedUsers v1.8.5 Error stopping]', e);
        }
    }

    const pluginExport = {
        name: 'RemoveBlockedUsers',
        description: 'Removes blocked and ignored messages, collapsed bars, member list rows, typing indicators, and reactions with 1:1 desktop parity.',
        authors: [{ name: 'Antigravity', id: '698947564459917343' }],
        version: '1.8.5',
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
