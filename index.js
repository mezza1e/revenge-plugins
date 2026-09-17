(function(exports, metroCommon, patcher, metro, vendetta, plugin, storage, uiComponents) {
    'use strict';

    // 1. Universal API Resolution
    const _revenge = (typeof revenge !== 'undefined' && revenge) ||
                     (typeof globalThis !== 'undefined' && (globalThis.revenge || globalThis.vendetta?.revenge)) ||
                     {};
    const _vendetta = (typeof vendetta !== 'undefined' && vendetta) ||
                      (typeof globalThis !== 'undefined' && (globalThis.vendetta || globalThis.bunny)) ||
                      _revenge;
    let _metro = (typeof metro !== 'undefined' && metro) || _revenge.modules?.finders || _vendetta.metro || {};
    let _patcher = (typeof patcher !== 'undefined' && patcher) || _revenge.patcher || _vendetta.patcher || {};
    let _common = (typeof metroCommon !== 'undefined' && metroCommon) || _vendetta.metro?.common || {};
    let _FluxDispatcher = _revenge.discord?.flux?.Dispatcher ||
                          _revenge.discord?.flux?.FluxDispatcher ||
                          _common.FluxDispatcher ||
                          (_metro.findByProps && (_metro.findByProps('dispatch', 'subscribe') || _metro.findByProps('dispatch')));
    let _storage = (typeof storage !== 'undefined' && storage) ||
                    (typeof plugin !== 'undefined' && plugin?.storage) ||
                    _vendetta.plugin?.storage ||
                    _vendetta.storage ||
                    _revenge.storage ||
                    (typeof globalThis !== 'undefined' && (globalThis.__antigravity_storage = globalThis.__antigravity_storage || {})) ||
                    {};
    const unpatches = [];

    // Universal instead/before patcher wrapper that safely handles both Revenge and Vendetta calling conventions
    function safePatch(type, obj, prop, hook) {
        if (!obj || !prop || !_patcher) return;
        try {
            const safeHook = function(p1, p2) {
                const originalFn = typeof p2 === 'function' ? p2 : (typeof p1 === 'function' ? p1 : null);
                const actualArgs = Array.isArray(p1) ? p1 : (Array.isArray(p2) ? p2 : []);
                return hook.call(this, actualArgs, originalFn);
            };

            // Revenge convention: patcher[type](parent, key, hook)
            if (typeof _patcher[type] === 'function') {
                try {
                    const unpatch = _patcher[type](obj, prop, type === 'instead' ? safeHook : hook);
                    if (typeof unpatch === 'function') unpatches.push(unpatch);
                    return;
                } catch (_) {}
                // Vendetta convention: patcher[type](key, parent, hook)
                try {
                    const unpatch = _patcher[type](prop, obj, type === 'instead' ? safeHook : hook);
                    if (typeof unpatch === 'function') unpatches.push(unpatch);
                    return;
                } catch (_) {}
            }
        } catch (_) {}
    }

    // Visual confirmation toast
    function notifyActive() {
        try {
            if (_revenge.discord?.actions?.ToastActionCreators?.open) {
                _revenge.discord.actions.ToastActionCreators.open({
                    key: 'antigravity-active',
                    content: 'Antigravity Master Suite v1.9.0: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('Antigravity Master Suite v1.9.0: ACTIVE');
                return;
            }
        } catch (_) {}
    }

    // --- State & Blocked Sets ---
    const blockedUserIdsSet = new Set();
    const ignoredUserIdsSet = new Set();
    const blockedMessageIdsSet = new Set();
    let recentChannels = [];
    const MAX_CHANNELS = 4;
    const recoveryDebounce = {};

    let RelationshipStore = null;
    let GuildMemberStore = null;
    let MessageStore = null;
    let TypingStore = null;
    let RowManager = null;

    // Loading Gate: prevents cached blocked user messages/members from flashing on startup/updates
    let isRelationshipsReady = false;

    // IMMEDIATE ZERO-LATENCY CACHE RESTORATION (Triple-redundant synchronous store):
    try {
        // Source 1: Plugin persistent storage
        if (_storage && Array.isArray(_storage.blockedUserIds)) {
            for (const id of _storage.blockedUserIds) blockedUserIdsSet.add(String(id));
        }
        if (_storage && Array.isArray(_storage.ignoredUserIds)) {
            for (const id of _storage.ignoredUserIds) ignoredUserIdsSet.add(String(id));
        }
        // Source 2: LocalStorage / MMKV if available
        if (typeof localStorage !== 'undefined' && localStorage.getItem) {
            const rawB = localStorage.getItem('antigravity_blocked_ids');
            if (rawB) {
                const arr = JSON.parse(rawB);
                if (Array.isArray(arr)) arr.forEach(id => blockedUserIdsSet.add(String(id)));
            }
            const rawI = localStorage.getItem('antigravity_ignored_ids');
            if (rawI) {
                const arr = JSON.parse(rawI);
                if (Array.isArray(arr)) arr.forEach(id => ignoredUserIdsSet.add(String(id)));
            }
        }
        // Source 3: Global memory across re-evaluations
        if (typeof globalThis !== 'undefined') {
            if (Array.isArray(globalThis.__antigravity_blocked_ids)) {
                globalThis.__antigravity_blocked_ids.forEach(id => blockedUserIdsSet.add(String(id)));
            }
            if (Array.isArray(globalThis.__antigravity_ignored_ids)) {
                globalThis.__antigravity_ignored_ids.forEach(id => ignoredUserIdsSet.add(String(id)));
            }
        }
    } catch (_) {}

    // If persistent storage already had blocked users, we are ready instantly at 0ms!
    if (blockedUserIdsSet.size > 0) {
        isRelationshipsReady = true;
    }

    function persistBlockedSets() {
        try {
            if (_storage && typeof _storage === 'object') {
                _storage.blockedUserIds = Array.from(blockedUserIdsSet);
                _storage.ignoredUserIds = Array.from(ignoredUserIdsSet);
            }
        } catch (_) {}
        try {
            if (typeof localStorage !== 'undefined' && localStorage.setItem) {
                localStorage.setItem('antigravity_blocked_ids', JSON.stringify(Array.from(blockedUserIdsSet)));
                localStorage.setItem('antigravity_ignored_ids', JSON.stringify(Array.from(ignoredUserIdsSet)));
            }
        } catch (_) {}
        try {
            if (typeof globalThis !== 'undefined') {
                globalThis.__antigravity_blocked_ids = Array.from(blockedUserIdsSet);
                globalThis.__antigravity_ignored_ids = Array.from(ignoredUserIdsSet);
            }
        } catch (_) {}
    }

    function markRelationshipsReady() {
        if (isRelationshipsReady) return;
        isRelationshipsReady = true;
        persistBlockedSets();
        try {
            if (MessageStore && typeof MessageStore.emitChange === 'function') MessageStore.emitChange();
            if (GuildMemberStore && typeof GuildMemberStore.emitChange === 'function') GuildMemberStore.emitChange();
            if (RelationshipStore && typeof RelationshipStore.emitChange === 'function') RelationshipStore.emitChange();
        } catch (_) {}
    }

    // Safety timeout fallback: unlock after 2.5s if account has 0 blocked users or is offline
    setTimeout(() => {
        markRelationshipsReady();
    }, 2500);

    function isBlockedOrIgnored(userId) {
        if (!userId) return false;
        const s = String(userId);
        return blockedUserIdsSet.has(s) || ignoredUserIdsSet.has(s);
    }

    // Robust member check matching any Discord member / user object structure
    function isMemberBlockedOrIgnored(item) {
        if (!item) return false;
        if (typeof item === 'string') return isBlockedOrIgnored(item);
        if (typeof item !== 'object') return false;

        // Never match headers, dividers, guilds, or channels
        if (item.type === 'HEADER' || item.type === 1 || item.header) return false;
        if (item.features || item.mfaLevel !== undefined || item.vanityURLCode !== undefined) return false;
        if (item.bitrate !== undefined || item.topic !== undefined || item.rateLimitPerUser !== undefined) return false;
        if (item.type === 'GUILD' || item.type === 'CHANNEL' || item.type === 'FOLDER') return false;

        const uid = item.userId ||
                   item.user?.id ||
                   item.member?.user?.id ||
                   item.member?.userId ||
                   item.memberId ||
                   item.author?.id ||
                   (item.user && typeof item.user === 'string' ? item.user : null) ||
                   (item.id && !item.channels && !item.features && !item.guild && !item.title ? item.id : null);

        return uid ? isBlockedOrIgnored(uid) : false;
    }

    // Strict inspector for Settings rows only
    function isSettingsBlockedSection(val, depth = 0) {
        if (!val || depth > 5) return false;
        if (typeof val === 'string') {
            return /accounts you've blocked or ignored|^blocked accounts|^ignored accounts/i.test(val);
        }
        if (typeof val === 'object') {
            for (const k of ['label', 'text', 'title', 'header']) {
                if (val[k] && typeof val[k] === 'string' && isSettingsBlockedSection(val[k], depth + 1)) return true;
            }
            if (val.props && isSettingsBlockedSection(val.props, depth + 1)) return true;
        }
        return false;
    }

    // Check if message is a reply to a blocked user
    function isReplyToBlocked(msg) {
        if (!msg || typeof msg !== 'object') return false;
        try {
            const ref = msg.referenced_message || msg.referencedMessage;
            if (ref) {
                if (ref.author && isBlockedOrIgnored(ref.author.id)) {
                    if (ref.id) blockedMessageIdsSet.add(String(ref.id));
                    return true;
                }
                if (ref.state === 'BLOCKED' || ref.state === 2) return true;
                if (ref.id && blockedMessageIdsSet.has(String(ref.id))) return true;
            }

            const refRef = msg.message_reference || msg.messageReference;
            if (refRef) {
                const authorId = refRef.author_id || refRef.authorId || refRef.user_id || refRef.userId;
                if (authorId && isBlockedOrIgnored(authorId)) return true;

                const refMsgId = refRef.message_id || refRef.messageId;
                if (refMsgId && blockedMessageIdsSet.has(String(refMsgId))) return true;

                const refChId = refRef.channel_id || refRef.channelId || msg.channel_id || msg.channelId;
                if (refMsgId && refChId && MessageStore && typeof MessageStore.getMessage === 'function') {
                    try {
                        const cached = MessageStore.getMessage(refChId, refMsgId);
                        if (cached && cached.author && isBlockedOrIgnored(cached.author.id)) {
                            blockedMessageIdsSet.add(String(refMsgId));
                            return true;
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}
        return false;
    }

    // Convert reply referencing a blocked user into a 100% normal message (type 0, zero reply strings)
    function convertReplyToNormalMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        try {
            msg.type = 0; // MessageType.DEFAULT (0) prevents Discord from rendering any reply string
            delete msg.message_reference;
            delete msg.messageReference;
            delete msg.referenced_message;
            delete msg.referencedMessage;
            delete msg.reply;

            if (msg.message && typeof msg.message === 'object') {
                msg.message.type = 0;
                delete msg.message.message_reference;
                delete msg.message.messageReference;
                delete msg.message.referenced_message;
                delete msg.message.referencedMessage;
                delete msg.message.reply;
            }
        } catch (_) {}
    }

    // Sanitize any message: if reply to blocked, convert to standard message
    function sanitizeMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        if (msg.author && isBlockedOrIgnored(msg.author.id)) {
            if (msg.id) blockedMessageIdsSet.add(String(msg.id));
            return;
        }
        if (isReplyToBlocked(msg)) {
            convertReplyToNormalMessage(msg);
        }
    }

    // Deep message collection sanitizer (purges array and map caches)
    function cleanMessageCollection(ch) {
        if (!ch || typeof ch !== 'object') return;
        try {
            if (Array.isArray(ch._array)) {
                ch._array = ch._array.filter(m => {
                    if (!m) return false;
                    if (isBlockedOrIgnored(m.author?.id)) {
                        if (m.id) blockedMessageIdsSet.add(String(m.id));
                        return false;
                    }
                    return true;
                });
                for (const m of ch._array) sanitizeMessage(m);
            }
            if (ch._map && typeof ch._map === 'object') {
                for (const mid in ch._map) {
                    const m = ch._map[mid];
                    if (isBlockedOrIgnored(m?.author?.id)) {
                        blockedMessageIdsSet.add(String(mid));
                        delete ch._map[mid];
                    } else {
                        sanitizeMessage(m);
                    }
                }
            }
        } catch (_) {}
    }

    // Chat row sanitizer: removes blocked groups, blocked messages, and eliminates orphaned date dividers
    function cleanChatRows(rows) {
        if (!Array.isArray(rows)) return rows;
        const temp = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            // Drop blocked group (type 2) or message from blocked user
            if (row.type === 2 || row.rowType === 2) continue;
            if (row.message && (isBlockedOrIgnored(row.message.author?.id) || blockedMessageIdsSet.has(String(row.message.id)))) continue;
            if (row.item && (isBlockedOrIgnored(row.item.author?.id) || blockedMessageIdsSet.has(String(row.item.id)))) continue;

            // Sanitize reply on remaining visible messages
            if (row.message) sanitizeMessage(row.message);
            if (row.item) sanitizeMessage(row.item);
            if (row.reply) delete row.reply;
            temp.push(row);
        }

        // Lookahead to prune orphaned date dividers
        const cleaned = [];
        for (let i = 0; i < temp.length; i++) {
            const row = temp[i];
            const isDivider = row.type === 3 || row.rowType === 3 || row.type === 'DIVIDER' || (typeof row.id === 'string' && row.id.startsWith('divider'));
            if (isDivider) {
                let hasContentBelow = false;
                for (let j = i + 1; j < temp.length; j++) {
                    const next = temp[j];
                    const nextIsDivider = next.type === 3 || next.rowType === 3 || next.type === 'DIVIDER' || (typeof next.id === 'string' && next.id.startsWith('divider'));
                    if (nextIsDivider) break;
                    hasContentBelow = true;
                    break;
                }
                if (!hasContentBelow) continue;
            }
            cleaned.push(row);
        }
        return cleaned;
    }

    // Helper to safely clone and filter SectionList props even if original props are frozen
    function getSafeSectionProps(props) {
        if (!props || typeof props !== 'object') return props;
        const cloned = { ...props };
        if (Array.isArray(props.sections)) {
            cloned.sections = props.sections
                .filter(sec => !isSettingsBlockedSection(sec?.title) && !isSettingsBlockedSection(sec?.header))
                .map(sec => {
                    if (Array.isArray(sec.data)) {
                        const origLen = sec.data.length;
                        const filteredData = sec.data.filter(it => !isMemberBlockedOrIgnored(it));
                        const diff = origLen - filteredData.length;
                        let updatedTitle = sec.title;
                        if (typeof sec.count === 'number') sec.count = Math.max(0, sec.count - diff);
                        if (typeof updatedTitle === 'string' && diff > 0) {
                            updatedTitle = updatedTitle.replace(/\d+/, (m) => String(Math.max(0, parseInt(m) - diff)));
                        }
                        return {
                            ...sec,
                            title: updatedTitle,
                            data: filteredData
                        };
                    }
                    return sec;
                });
        }
        if (typeof props.renderItem === 'function') {
            const origRenderItem = props.renderItem;
            cloned.renderItem = function(info) {
                if (info && (isMemberBlockedOrIgnored(info.item) || isSettingsBlockedSection(info.section))) {
                    return null;
                }
                return origRenderItem.apply(this, arguments);
            };
        }
        if (typeof props.renderSectionHeader === 'function') {
            const origRenderHeader = props.renderSectionHeader;
            cloned.renderSectionHeader = function(info) {
                if (info && isSettingsBlockedSection(info.section)) {
                    return null;
                }
                return origRenderHeader.apply(this, arguments);
            };
        }
        return cloned;
    }

    // Helper to safely clone and filter FlatList props even if original props are frozen
    function getSafeListProps(props) {
        if (!props || typeof props !== 'object') return props;
        const cloned = { ...props };
        if (Array.isArray(props.data)) {
            // Check if this list is specifically the chat messages scroller
            const isChatList = props.inverted || props.data.some(it => it && (it.message || it.rowType === 'CHAT_MESSAGE'));
            if (isChatList) {
                cloned.data = cleanChatRows(props.data);
            } else {
                // For member list and other lists: ONLY filter blocked members, never cleanChatRows!
                cloned.data = props.data.filter(it => !isMemberBlockedOrIgnored(it));
            }
        }
        if (typeof props.renderItem === 'function') {
            const origRenderItem = props.renderItem;
            cloned.renderItem = function(info) {
                if (info && isMemberBlockedOrIgnored(info.item)) {
                    return null;
                }
                return origRenderItem.apply(this, arguments);
            };
        }
        return cloned;
    }

    function startPlugin() {
        try {
            console.log('[MasterSuite Mobile v1.9.0] Starting Antigravity Master Suite...');

            // Dynamic resolution refresh
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
            if (!_storage || Object.keys(_storage).length === 0) {
                _storage = (typeof storage !== 'undefined' && storage) ||
                           (typeof plugin !== 'undefined' && plugin?.storage) ||
                           _vendetta.plugin?.storage ||
                           _vendetta.storage ||
                           _revenge.storage ||
                           globalThis.__antigravity_storage ||
                           _storage;
            }

            // Resolve Discord Stores
            if (_metro.findByProps) {
                RelationshipStore = _metro.findByProps('getBlockedUserIds', 'getRelationships') ||
                                    _metro.findByProps('getRelationships');
                GuildMemberStore = _metro.findByProps('getMember', 'getMembers');
                MessageStore = _metro.findByProps('getMessages', 'getMessage');
                TypingStore = _metro.findByProps('getTypingUsers');
                RowManager = _metro.findByProps('RowManager')?.RowManager ||
                             (_metro.findByName && _metro.findByName('RowManager'));
            }

            // Hydrate sets from RelationshipStore if already loaded
            if (RelationshipStore) {
                try {
                    if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                        const bArr = RelationshipStore.getBlockedUserIds();
                        if (Array.isArray(bArr)) {
                            bArr.forEach(id => blockedUserIdsSet.add(String(id)));
                            if (bArr.length > 0) markRelationshipsReady();
                        }
                    }
                    if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                        const iArr = RelationshipStore.getIgnoredUserIds();
                        if (Array.isArray(iArr)) iArr.forEach(id => ignoredUserIdsSet.add(String(id)));
                    }
                    if (typeof RelationshipStore.getRelationships === 'function') {
                        const rels = RelationshipStore.getRelationships();
                        if (rels && typeof rels === 'object') {
                            for (const [id, type] of Object.entries(rels)) {
                                if (type === 2) blockedUserIdsSet.add(String(id));
                                if (type === 5) ignoredUserIdsSet.add(String(id));
                            }
                            markRelationshipsReady();
                        }
                    }
                } catch (_) {}
            }

            console.log('[MasterSuite v1.9.0] Tracking', blockedUserIdsSet.size, 'blocked and', ignoredUserIdsSet.size, 'ignored users.');

            // ========================================================
            // 2. GATEWAY INTERCEPTION (BULLETPROOF ERROR-SAFE DISPATCHER)
            // ========================================================
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    try {
                        const event = args[0];
                        if (event && typeof event === 'object') {
                            // Sync relationship events
                            if (event.type === 'RELATIONSHIP_ADD' && event.relationship) {
                                const rid = String(event.relationship.id);
                                if (event.relationship.type === 2) blockedUserIdsSet.add(rid);
                                if (event.relationship.type === 5) ignoredUserIdsSet.add(rid);
                                persistBlockedSets();
                                markRelationshipsReady();
                            }
                            if (event.type === 'RELATIONSHIP_REMOVE') {
                                const rid = String(event.relationship?.id || event.userId || '');
                                if (rid) {
                                    blockedUserIdsSet.delete(rid);
                                    ignoredUserIdsSet.delete(rid);
                                    persistBlockedSets();
                                }
                            }

                            // Full initial sync from CONNECTION_OPEN (READ ONLY - DO NOT MUTATE GUILDS ARRAY)
                            if (event.type === 'CONNECTION_OPEN') {
                                if (Array.isArray(event.relationships)) {
                                    for (const r of event.relationships) {
                                        const rid = String(r.id);
                                        if (r.type === 2) blockedUserIdsSet.add(rid);
                                        if (r.type === 5) ignoredUserIdsSet.add(rid);
                                    }
                                    persistBlockedSets();
                                }
                                markRelationshipsReady();
                            }

                            // Filter members chunk in small servers like "ihh"
                            if (event.type === 'GUILD_MEMBERS_CHUNK') {
                                if (Array.isArray(event.members)) {
                                    event.members = event.members.filter(m => !isMemberBlockedOrIgnored(m));
                                }
                                if (Array.isArray(event.presences)) {
                                    event.presences = event.presences.filter(p => !isBlockedOrIgnored(p?.user?.id || p?.userId));
                                }
                            }

                            // Filter initial guild members in GUILD_CREATE
                            if (event.type === 'GUILD_CREATE') {
                                if (Array.isArray(event.members)) {
                                    const origLen = event.members.length;
                                    event.members = event.members.filter(m => !isMemberBlockedOrIgnored(m));
                                    const diff = origLen - event.members.length;
                                    if (typeof event.member_count === 'number') event.member_count = Math.max(0, event.member_count - diff);
                                }
                                if (Array.isArray(event.presences)) {
                                    event.presences = event.presences.filter(p => !isBlockedOrIgnored(p?.user?.id || p?.userId));
                                }
                            }

                            // Swallow live blocked member additions
                            if ((event.type === 'GUILD_MEMBER_ADD' || event.type === 'GUILD_MEMBER_UPDATE') && isMemberBlockedOrIgnored(event.user || event.member || event.userId)) {
                                return;
                            }
                            if (event.type === 'PRESENCE_UPDATE' && isMemberBlockedOrIgnored(event.user?.id || event.userId)) {
                                return;
                            }

                            // Filter incoming chat messages in channels
                            if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                                event.messages = event.messages.filter(msg => {
                                    if (!msg) return false;
                                    if (isBlockedOrIgnored(msg.author?.id)) {
                                        if (msg.id) blockedMessageIdsSet.add(String(msg.id));
                                        return false;
                                    }
                                    return true;
                                });
                                for (const msg of event.messages) {
                                    sanitizeMessage(msg);
                                }
                            }

                            // Live incoming message
                            if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                                if (isBlockedOrIgnored(event.message.author?.id)) {
                                    if (event.message.id) blockedMessageIdsSet.add(String(event.message.id));
                                    return; // Silently swallow blocked user message
                                }
                                sanitizeMessage(event.message);
                            }

                            // Live typing indicator
                            if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                                return;
                            }
                        }
                    } catch (err) {
                        console.error('[MasterSuite Dispatch Hook Error]', err);
                    }

                    // ALWAYS call orig so GuildStore and Discord internal state machines never break!
                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            // ========================================================
            // 3. STORE INTERCEPTION (USING FOOLPROOF 'INSTEAD' PATTERN)
            // ========================================================

            // A. GuildMemberStore (Purges blocked members in all servers)
            if (GuildMemberStore) {
                try {
                    const cache = GuildMemberStore._members || GuildMemberStore._guildMembers || GuildMemberStore.members;
                    if (cache && typeof cache === 'object') {
                        for (const gid in cache) {
                            const guildMap = cache[gid];
                            if (guildMap && typeof guildMap === 'object') {
                                for (const uid in guildMap) {
                                    if (isBlockedOrIgnored(uid)) delete guildMap[uid];
                                }
                            }
                        }
                    }
                } catch (_) {}

                if (typeof GuildMemberStore.getMember === 'function') {
                    safePatch('instead', GuildMemberStore, 'getMember', function(args, orig) {
                        const uid = args[1];
                        if (isBlockedOrIgnored(uid)) return undefined;
                        return orig ? orig.apply(this, args) : undefined;
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
                        if (isBlockedOrIgnored(uid)) return false;
                        return orig ? orig.apply(this, args) : false;
                    });
                }
            }

            // B. MessageStore (Deep Cache Purging & Clean Replies)
            if (MessageStore) {
                try {
                    const cache = MessageStore._channelMessages || MessageStore._messages;
                    if (cache && typeof cache === 'object') {
                        for (const chId in cache) {
                            cleanMessageCollection(cache[chId]);
                        }
                    }
                } catch (_) {}

                if (typeof MessageStore.getMessages === 'function') {
                    safePatch('instead', MessageStore, 'getMessages', function(args, orig) {
                        const res = orig ? orig.apply(this, args) : null;
                        if (!res) return res;
                        cleanMessageCollection(res);
                        if (Array.isArray(res)) {
                            return res.filter(m => {
                                if (!m || isBlockedOrIgnored(m.author?.id)) return false;
                                sanitizeMessage(m);
                                return true;
                            });
                        }
                        return res;
                    });
                }
                if (typeof MessageStore.getMessage === 'function') {
                    safePatch('instead', MessageStore, 'getMessage', function(args, orig) {
                        const msg = orig ? orig.apply(this, args) : null;
                        if (msg && isBlockedOrIgnored(msg.author?.id)) return undefined;
                        if (msg) sanitizeMessage(msg);
                        return msg;
                    });
                }
            }

            // C. RowManager (Chat Rows & Zero Gaps & Loading Gate Protection)
            if (RowManager && RowManager.prototype) {
                safePatch('instead', RowManager.prototype, 'generate', function(args, orig) {
                    if (!isRelationshipsReady) {
                        return null; // Hold generation until blocked sets are verified
                    }
                    const data = args[0];
                    if (data) {
                        if (data.message) {
                            if (isBlockedOrIgnored(data.message.author?.id) || blockedMessageIdsSet.has(String(data.message.id))) {
                                return null; // Drop blocked message row entirely (zero gaps)
                            }
                            sanitizeMessage(data.message);
                        }

                        if (data.rowType === 2 || data.type === 2) {
                            return null; // Drop blocked message group row
                        }

                        if (data.reply || data.referencedMessage || data.referenced_message) {
                            const ref = data.referencedMessage || data.referenced_message || data.reply?.message;
                            if (ref && (isBlockedOrIgnored(ref.author?.id) || blockedMessageIdsSet.has(String(ref.id)))) {
                                delete data.reply;
                                delete data.referencedMessage;
                                delete data.referenced_message;
                                if (data.message) data.message.type = 0;
                            }
                        }
                    }

                    const res = orig ? orig.apply(this, args) : null;
                    if (res) {
                        if (res.rowType === 2 || res.type === 2 || (res.message && (isBlockedOrIgnored(res.message.author?.id) || blockedMessageIdsSet.has(String(res.message.id))))) {
                            return null;
                        }
                        if (res.message) {
                            sanitizeMessage(res.message);
                        }
                        if (res.reply) {
                            const ref = res.reply.message || res.referencedMessage || res.referenced_message;
                            if (ref && (isBlockedOrIgnored(ref.author?.id) || blockedMessageIdsSet.has(String(ref.id)))) {
                                delete res.reply;
                            }
                        }
                    }
                    return res;
                });

                if (typeof RowManager.prototype.getRows === 'function') {
                    safePatch('instead', RowManager.prototype, 'getRows', function(args, orig) {
                        if (!isRelationshipsReady) {
                            return []; // Hold returning rows during startup until blocked sets are verified
                        }
                        const res = orig ? orig.apply(this, args) : [];
                        if (!Array.isArray(res)) return res;
                        return cleanChatRows(res);
                    });
                }
            }

            // D. TypingStore
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

            // E. RelationshipStore (Virtualize 0 Blocked / Ignored)
            if (RelationshipStore) {
                if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                    safePatch('instead', RelationshipStore, 'getBlockedUserIds', () => []);
                }
                if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                    safePatch('instead', RelationshipStore, 'getIgnoredUserIds', () => []);
                }
                if (typeof RelationshipStore.getRelationships === 'function') {
                    safePatch('instead', RelationshipStore, 'getRelationships', function(args, orig) {
                        const res = orig ? orig.apply(this, args) : {};
                        if (!res || typeof res !== 'object') return res;
                        const filtered = {};
                        for (const [id, type] of Object.entries(res)) {
                            if (type !== 2 && type !== 5 && !isBlockedOrIgnored(id)) {
                                filtered[id] = type;
                            }
                        }
                        return filtered;
                    });
                }
                if (typeof RelationshipStore.getRelationshipType === 'function') {
                    safePatch('instead', RelationshipStore, 'getRelationshipType', function(args, orig) {
                        const uid = args[0];
                        if (isBlockedOrIgnored(uid)) return 0;
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
                if (typeof RelationshipStore.isBlocked === 'function') {
                    safePatch('instead', RelationshipStore, 'isBlocked', () => false);
                }
                if (typeof RelationshipStore.isIgnored === 'function') {
                    safePatch('instead', RelationshipStore, 'isIgnored', () => false);
                }
            }

            // ========================================================
            // 4. SUPPRESS "SHOW PROFILE?" DIALOGS & PROFILE CLICKS
            // ========================================================
            const profileActions = (_metro.findByProps && (_metro.findByProps('openUserProfile') || _metro.findByProps('showUserProfile')));
            if (profileActions) {
                for (const k of ['openUserProfile', 'showUserProfile', 'openUserProfileModal']) {
                    if (typeof profileActions[k] === 'function') {
                        safePatch('instead', profileActions, k, function(args, orig) {
                            const target = args[0];
                            const uid = typeof target === 'string' ? target : (target?.userId || target?.user?.id);
                            if (isBlockedOrIgnored(uid)) {
                                console.log('[MasterSuite v1.9.0] Suppressed profile open for blocked user:', uid);
                                return;
                            }
                            return orig ? orig.apply(this, args) : undefined;
                        });
                    }
                }
            }

            const RNAlert = _common.ReactNative?.Alert || (_metro.findByProps && (_metro.findByProps('alert')?.Alert || _metro.findByProps('Alert')?.Alert));
            if (RNAlert && typeof RNAlert.alert === 'function') {
                safePatch('instead', RNAlert, 'alert', function(args, orig) {
                    const title = String(args[0] || '');
                    const msg = String(args[1] || '');
                    if (/Show Profile/i.test(title) || /You blocked/i.test(msg) || /blocked/i.test(title)) {
                        console.log('[MasterSuite v1.9.0] Suppressed Show Profile dialog:', title);
                        return;
                    }
                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            // ========================================================
            // 5. SETTINGS UI ELIMINATION (STRICT & SURGICAL - DO NOT TOUCH ICONS/AVATARS)
            // ========================================================
            const settingsTargetMods = new Set();
            if (_vendetta.ui?.components?.Forms) settingsTargetMods.add(_vendetta.ui.components.Forms);

            const formKeys = ['TableRow', 'TableRowGroup', 'TableSwitchRow', 'FormRow', 'FormSection'];
            for (const p of formKeys) {
                if (_metro.findByProps) {
                    try {
                        const m = _metro.findByProps(p);
                        if (m && typeof m === 'object') settingsTargetMods.add(m);
                    } catch (_) {}
                }
            }

            for (const mod of settingsTargetMods) {
                for (const k of formKeys) {
                    if (typeof mod[k] === 'function') {
                        safePatch('instead', mod, k, function(args, orig) {
                            const p = args[0] || {};
                            if (isSettingsBlockedSection(p)) return null;
                            const res = orig ? orig.apply(this, args) : null;
                            if (res && res.props && isSettingsBlockedSection(res.props)) return null;
                            return res;
                        });
                    }
                }
            }

            // ========================================================
            // 6. FLATLIST & SECTIONLIST (WITH FROZEN PROPS & REF PROTECTION)
            // ========================================================
            const RN = _common.ReactNative || (_metro.findByProps && _metro.findByProps('FlatList', 'SectionList')) || (_metro.findByProps && _metro.findByProps('FlatList'));
            const FlatList = RN?.FlatList || (_metro.findByProps && _metro.findByProps('FlatList')?.FlatList);
            const SectionList = RN?.SectionList || (_metro.findByProps && _metro.findByProps('SectionList')?.SectionList);

            if (FlatList) {
                if (typeof FlatList.render === 'function') {
                    safePatch('instead', FlatList, 'render', function(args, orig) {
                        const safeProps = getSafeListProps(args[0]);
                        return orig ? orig.apply(this, [safeProps, ...args.slice(1)]) : null;
                    });
                }
                if (FlatList.prototype && typeof FlatList.prototype.render === 'function') {
                    safePatch('instead', FlatList.prototype, 'render', function(args, orig) {
                        const origProps = this.props;
                        const safeProps = getSafeListProps(origProps);
                        try {
                            Object.defineProperty(this, 'props', { value: safeProps, configurable: true, writable: true });
                        } catch (_) {}
                        const res = orig ? orig.apply(this, args) : null;
                        try {
                            Object.defineProperty(this, 'props', { value: origProps, configurable: true, writable: true });
                        } catch (_) {}
                        return res;
                    });
                }
            }

            if (SectionList) {
                if (typeof SectionList.render === 'function') {
                    safePatch('instead', SectionList, 'render', function(args, orig) {
                        const safeProps = getSafeSectionProps(args[0]);
                        return orig ? orig.apply(this, [safeProps, ...args.slice(1)]) : null;
                    });
                }
                if (SectionList.prototype && typeof SectionList.prototype.render === 'function') {
                    safePatch('instead', SectionList.prototype, 'render', function(args, orig) {
                        const origProps = this.props;
                        const safeProps = getSafeSectionProps(origProps);
                        try {
                            Object.defineProperty(this, 'props', { value: safeProps, configurable: true, writable: true });
                        } catch (_) {}
                        const res = orig ? orig.apply(this, args) : null;
                        try {
                            Object.defineProperty(this, 'props', { value: origProps, configurable: true, writable: true });
                        } catch (_) {}
                        return res;
                    });
                }
            }

            // ========================================================
            // 7. SAFE MESSAGE RELIABILITY & LRU BOUNDS
            // ========================================================
            if (_FluxDispatcher) {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    try {
                        const event = args[0];
                        if (event && event.type === 'CHANNEL_SELECT' && event.channelId) {
                            recentChannels = recentChannels.filter(id => id !== event.channelId);
                            recentChannels.unshift(event.channelId);
                            if (recentChannels.length > MAX_CHANNELS) {
                                recentChannels = recentChannels.slice(0, MAX_CHANNELS);
                            }
                        }
                    } catch (_) {}
                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            const MessageActions = _metro.findByProps ? _metro.findByProps('fetchMessages') : null;
            if (_FluxDispatcher && MessageActions) {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    try {
                        const event = args[0];
                        if (event && (event.type === 'LOAD_MESSAGES_FAILURE' || event.type === 'MESSAGE_FETCH_FAILED')) {
                            const chId = event.channelId;
                            if (chId && !recoveryDebounce[chId]) {
                                recoveryDebounce[chId] = setTimeout(() => {
                                    delete recoveryDebounce[chId];
                                    console.log('[MessageReliability v1.9.0] Auto-recovering channel:', chId);
                                    try { MessageActions.fetchMessages({ channelId: chId, limit: 50 }); } catch (_) {}
                                }, 1200);
                            }
                        }
                    } catch (_) {}
                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            notifyActive();
            console.log('[MasterSuite Mobile v1.9.0] Antigravity Master Suite loaded and active!');
        } catch (err) {
            console.error('[MasterSuite Mobile v1.9.0] Error during startup:', err);
        }
    }

    function stopPlugin() {
        for (const t of Object.values(recoveryDebounce)) clearTimeout(t);
        for (const unpatch of unpatches) {
            try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[MasterSuite Mobile v1.9.0] Unloaded cleanly.');
    }

    // Dual lifecycle exports
    const pluginDef = {
        start: startPlugin,
        stop: stopPlugin,
        onLoad: startPlugin,
        onUnload: stopPlugin
    };

    exports.default = pluginDef;
    exports.start = startPlugin;
    exports.stop = stopPlugin;
    exports.onLoad = startPlugin;
    exports.onUnload = stopPlugin;
    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;
})(
    typeof exports !== 'undefined' ? exports : {},
    typeof metroCommon !== 'undefined' ? metroCommon : (typeof vendetta !== 'undefined' ? vendetta.metro?.common : (typeof revenge !== 'undefined' ? revenge.metro?.common : undefined)),
    typeof patcher !== 'undefined' ? patcher : (typeof vendetta !== 'undefined' ? vendetta.patcher : (typeof revenge !== 'undefined' ? revenge.patcher : undefined)),
    typeof metro !== 'undefined' ? metro : (typeof vendetta !== 'undefined' ? vendetta.metro : (typeof revenge !== 'undefined' ? revenge.metro : undefined)),
    typeof vendetta !== 'undefined' ? vendetta : (typeof revenge !== 'undefined' ? revenge : undefined),
    typeof plugin !== 'undefined' ? plugin : (typeof vendetta !== 'undefined' ? vendetta.plugin : (typeof revenge !== 'undefined' ? revenge.plugin : undefined)),
    typeof storage !== 'undefined' ? storage : (typeof vendetta !== 'undefined' ? vendetta.storage : (typeof revenge !== 'undefined' ? revenge.storage : undefined)),
    typeof uiComponents !== 'undefined' ? uiComponents : (typeof vendetta !== 'undefined' ? vendetta.ui?.components : (typeof revenge !== 'undefined' ? revenge.ui?.components : undefined))
)