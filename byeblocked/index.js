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
                    content: 'Antigravity Master Suite v2.2.0: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('Antigravity Master Suite v2.2.0: ACTIVE');
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

    // IMMEDIATE ZERO-LATENCY CACHE RESTORATION (Triple-redundant synchronous store):
    try {
        if (_storage && Array.isArray(_storage.blockedUserIds)) {
            for (const id of _storage.blockedUserIds) blockedUserIdsSet.add(String(id));
        }
        if (_storage && Array.isArray(_storage.ignoredUserIds)) {
            for (const id of _storage.ignoredUserIds) ignoredUserIdsSet.add(String(id));
        }
        if (typeof localStorage !== 'undefined' && localStorage.getItem) {
            const b = localStorage.getItem('antigravity_blocked_ids');
            if (b) {
                const parsed = JSON.parse(b);
                if (Array.isArray(parsed)) {
                    for (const id of parsed) blockedUserIdsSet.add(String(id));
                }
            }
            const ig = localStorage.getItem('antigravity_ignored_ids');
            if (ig) {
                const parsed = JSON.parse(ig);
                if (Array.isArray(parsed)) {
                    for (const id of parsed) ignoredUserIdsSet.add(String(id));
                }
            }
        }
        if (typeof globalThis !== 'undefined') {
            if (Array.isArray(globalThis.__antigravity_blocked_ids)) {
                for (const id of globalThis.__antigravity_blocked_ids) blockedUserIdsSet.add(String(id));
            }
            if (Array.isArray(globalThis.__antigravity_ignored_ids)) {
                for (const id of globalThis.__antigravity_ignored_ids) ignoredUserIdsSet.add(String(id));
            }
        }
    } catch (_) {}

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
        persistBlockedSets();
        try {
            if (MessageStore && typeof MessageStore.emitChange === 'function') MessageStore.emitChange();
            if (GuildMemberStore && typeof GuildMemberStore.emitChange === 'function') GuildMemberStore.emitChange();
            if (RelationshipStore && typeof RelationshipStore.emitChange === 'function') RelationshipStore.emitChange();
        } catch (_) {}
    }

    function isBlockedOrIgnored(userId) {
        if (!userId) return false;
        const s = String(userId);
        return blockedUserIdsSet.has(s) || ignoredUserIdsSet.has(s);
    }

    function isMemberBlockedOrIgnored(item) {
        if (!item || typeof item !== 'object') return false;
        if (item.guild || item.channel) return false;
        if (item.user && isBlockedOrIgnored(item.user.id)) return true;
        if (item.member && item.member.user && isBlockedOrIgnored(item.member.user.id)) return true;
        if (item.userId && isBlockedOrIgnored(item.userId)) return true;
        if (item.id && (isBlockedOrIgnored(item.id) || (item.user && isBlockedOrIgnored(item.user.id)))) return true;
        return false;
    }

    function isSettingsBlockedSection(sectionOrTitle) {
        if (!sectionOrTitle) return false;
        const text = typeof sectionOrTitle === 'string' ? sectionOrTitle : (sectionOrTitle.title || sectionOrTitle.header || sectionOrTitle.key || '');
        if (typeof text !== 'string') return false;
        const lower = text.toLowerCase();
        return lower.includes('blocked user') || lower.includes('blocked') || lower.includes('ignored');
    }

    // Strip reply quote and reference if original message was from a blocked user
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
                        msg.type = 0; // Standard chat message type: completely removes reply string
                    }
                }
            }
        } catch (_) {}
    }

    // Hermes memory optimization: LRU channel cleanup (safe eviction of whole channel cache)
    function trimChannelMessages(keepChannelId) {
        if (!MessageStore) return;
        try {
            const cache = MessageStore._channelMessages || MessageStore._messages;
            if (!cache || typeof cache !== 'object') return;
            const channelKeys = Object.keys(cache);
            if (channelKeys.length <= MAX_CHANNELS) return;

            for (const chId of channelKeys) {
                if (chId === keepChannelId || recentChannels.includes(chId)) continue;
                delete cache[chId];
            }
        } catch (_) {}
    }

    // Sanitize cached messages without mutating ChannelMessages structure
    function sanitizeChannelCache(chId) {
        if (!MessageStore) return;
        try {
            const cache = MessageStore._channelMessages || MessageStore._messages;
            if (!cache || typeof cache !== 'object') return;
            const ch = cache[chId];
            if (!ch) return;

            // Safely sanitize content in-place without deleting map keys or altering array indices
            if (ch._map && typeof ch._map === 'object') {
                for (const mid in ch._map) {
                    const m = ch._map[mid];
                    if (m) sanitizeMessage(m);
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
            if (!row || typeof row !== 'object' || row.type == null) continue;
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
            if (!row || typeof row !== 'object' || row.type == null) continue;
            const isDivider = row.type === 3 || row.rowType === 3 || row.type === 'DIVIDER' || (typeof row.id === 'string' && row.id.startsWith('divider'));
            if (isDivider) {
                let hasContentBelow = false;
                for (let j = i + 1; j < temp.length; j++) {
                    const next = temp[j];
                    if (!next || typeof next !== 'object' || next.type == null) continue;
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
            const isChatList = props.inverted || props.data.some(it => it && (it.message || it.rowType === 'CHAT_MESSAGE'));
            if (isChatList) {
                cloned.data = cleanChatRows(props.data);
            } else {
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
            console.log('[MasterSuite Mobile v2.2.0] Starting Antigravity Master Suite...');

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

            if (_metro.findByProps) {
                RelationshipStore = _metro.findByProps('getRelationships', 'isBlocked') ||
                                    _metro.findByProps('isBlocked') ||
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
                    const rels = RelationshipStore.getRelationships();
                    if (rels && typeof rels === 'object') {
                        for (const uid in rels) {
                            if (rels[uid] === 2) blockedUserIdsSet.add(String(uid));
                            if (rels[uid] === 5) ignoredUserIdsSet.add(String(uid));
                        }
                        persistBlockedSets();
                    }
                    if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                        const bIds = RelationshipStore.getBlockedUserIds();
                        if (Array.isArray(bIds)) {
                            for (const id of bIds) blockedUserIdsSet.add(String(id));
                            persistBlockedSets();
                        }
                    }
                } catch (_) {}
            }

            console.log(`[MasterSuite v2.2.0] Tracking ${blockedUserIdsSet.size} blocked and ${ignoredUserIdsSet.size} ignored users.`);

            // --- 1. FluxDispatcher (Safe Gateway Passthrough + Message/Relationship Handler) ---
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    const event = args[0];
                    if (event && typeof event === 'object') {
                        try {
                            // 1. Sync relationship events
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

                            // 2. Initial sync from CONNECTION_OPEN (READ ONLY - NEVER MUTATE GUILDS)
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

                            // 3. Filter incoming chat messages in channels
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

                            // 4. Live incoming message
                            if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                                if (isBlockedOrIgnored(event.message.author?.id)) {
                                    if (event.message.id) blockedMessageIdsSet.add(String(event.message.id));
                                    event.channelId = "0"; // Safely drop from active channel
                                    return;
                                }
                                sanitizeMessage(event.message);
                            }

                            // 5. Live typing indicator
                            if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                                return;
                            }

                            // 6. Channel switch tracking for LRU cache
                            if (event.type === 'CHANNEL_SELECT' && event.channelId) {
                                recentChannels = recentChannels.filter(id => id !== event.channelId);
                                recentChannels.unshift(event.channelId);
                                if (recentChannels.length > MAX_CHANNELS) recentChannels.pop();
                                sanitizeChannelCache(event.channelId);
                                trimChannelMessages(event.channelId);
                            }

                            // 7. Auto-recover from "Messages failed to load"
                            if (event.type === 'LOAD_MESSAGES_FAILURE' && event.channelId) {
                                const chId = event.channelId;
                                const now = Date.now();
                                if (!recoveryDebounce[chId] || now - recoveryDebounce[chId] > 3000) {
                                    recoveryDebounce[chId] = now;
                                    setTimeout(() => {
                                        try {
                                            const MessageActions = _metro.findByProps('fetchMessages');
                                            if (MessageActions && typeof MessageActions.fetchMessages === 'function') {
                                                MessageActions.fetchMessages({ channelId: chId, limit: 50 });
                                            }
                                        } catch (_) {}
                                    }, 200);
                                }
                            }
                        } catch (_) {}
                    }
                    return orig ? orig.apply(this, args) : null;
                });
            }

            // --- 2. Store Layer Patches ---

            // A. GuildMemberStore (Filter Blocked Users from Member Queries)
            if (GuildMemberStore) {
                if (typeof GuildMemberStore.getMember === 'function') {
                    safePatch('instead', GuildMemberStore, 'getMember', function(args, orig) {
                        const userId = args[1];
                        if (isBlockedOrIgnored(userId)) return undefined;
                        return orig ? orig.apply(this, args) : undefined;
                    });
                }
                if (typeof GuildMemberStore.getMembers === 'function') {
                    safePatch('instead', GuildMemberStore, 'getMembers', function(args, orig) {
                        const res = orig ? orig.apply(this, args) : [];
                        if (!Array.isArray(res)) return res;
                        return res.filter(m => !isBlockedOrIgnored(m?.userId || (m?.user && m?.user?.id)));
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
                        const userId = args[1];
                        if (isBlockedOrIgnored(userId)) return false;
                        return orig ? orig.apply(this, args) : false;
                    });
                }
            }

            // B. MessageStore (Sanitize message replies in-place without deleting map keys or returning undefined)
            if (MessageStore && typeof MessageStore.getMessage === 'function') {
                safePatch('after', MessageStore, 'getMessage', function(args, res) {
                    if (res) sanitizeMessage(res);
                    return res;
                });
            }

            // C. RowManager (Chat Rows & Zero Gaps & Reply Sanitization)
            // NEVER return null from generate - returning null corrupts Discord's row list and crashes createRow!
            if (RowManager && RowManager.prototype) {
                safePatch('before', RowManager.prototype, 'generate', function(args) {
                    const data = args[0];
                    if (!data) return;

                    // 1. Sanitize or collapse blocked messages
                    if (data.message) {
                        if (isBlockedOrIgnored(data.message.author?.id) || blockedMessageIdsSet.has(String(data.message.id))) {
                            data.renderContentOnly = true;
                            data.message.content = '';
                            data.message.reactions = [];
                            data.message.canShowComponents = false;
                        }
                        sanitizeMessage(data.message);
                    }

                    // 2. Neutralize blocked group row (type 2)
                    if (data.rowType === 2 || data.type === 2) {
                        data.renderContentOnly = true;
                        data.roleStyle = '';
                        data.text = '';
                        data.revealed = false;
                        data.content = [];
                        data.count = 0;
                    }

                    // 3. Strip reply string referencing blocked users (normal message display)
                    if (data.reply || data.referencedMessage || data.referenced_message) {
                        const ref = data.referencedMessage || data.referenced_message || data.reply?.message;
                        if (ref && (isBlockedOrIgnored(ref.author?.id) || blockedMessageIdsSet.has(String(ref.id)))) {
                            delete data.reply;
                            delete data.referencedMessage;
                            delete data.referenced_message;
                            if (data.message) {
                                data.message.type = 0;
                                delete data.message.referenced_message;
                                delete data.message.referencedMessage;
                            }
                        }
                    }
                });

                safePatch('after', RowManager.prototype, 'generate', function(args, res) {
                    if (!res) return res;
                    if (res.message) {
                        sanitizeMessage(res.message);
                    }
                    if (res.reply) {
                        const ref = res.reply.message || res.referencedMessage || res.referenced_message;
                        if (ref && (isBlockedOrIgnored(ref.author?.id) || blockedMessageIdsSet.has(String(ref.id)))) {
                            delete res.reply;
                        }
                    }
                    if (res.rowType === 2 || res.type === 2) {
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

            // D. Comprehensive Defensive Guards for updateRows and createRow across Metro modules
            try {
                const modules = _metro.modules || (typeof vendetta !== 'undefined' && vendetta.metro?.modules) || {};
                for (const id in modules) {
                    const mod = modules[id]?.exports;
                    if (!mod || typeof mod !== 'object') continue;

                    // Guard updateRows on any module exporting it
                    if (typeof mod.updateRows === 'function') {
                        safePatch('before', mod, 'updateRows', function(args) {
                            for (let i = 0; i < args.length; i++) {
                                if (Array.isArray(args[i])) {
                                    args[i] = args[i].filter(r => r && typeof r === 'object' && r.type != null);
                                }
                            }
                        });
                    }

                    // Guard createRow on any module exporting it
                    if (typeof mod.createRow === 'function') {
                        safePatch('instead', mod, 'createRow', function(args, orig) {
                            const row = args[0];
                            if (!row || typeof row !== 'object' || row.type == null) {
                                return null;
                            }
                            return orig ? orig.apply(this, args) : null;
                        });
                    }
                }
            } catch (_) {}

            // Direct finder guards for updateRows & createRow
            try {
                const ChatModule = _metro.findByProps('updateRows');
                if (ChatModule && typeof ChatModule.updateRows === 'function') {
                    safePatch('before', ChatModule, 'updateRows', function(args) {
                        for (let i = 0; i < args.length; i++) {
                            if (Array.isArray(args[i])) {
                                args[i] = args[i].filter(r => r && typeof r === 'object' && r.type != null);
                            }
                        }
                    });
                }
            } catch (_) {}

            try {
                const RowCreator = _metro.findByProps('createRow');
                if (RowCreator && typeof RowCreator.createRow === 'function') {
                    safePatch('instead', RowCreator, 'createRow', function(args, orig) {
                        const row = args[0];
                        if (!row || typeof row !== 'object' || row.type == null) {
                            return null;
                        }
                        return orig ? orig.apply(this, args) : null;
                    });
                }
            } catch (_) {}

            // E. TypingStore
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

            // F. RelationshipStore (Virtualize 0 Blocked / Ignored)
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
                if (typeof RelationshipStore.isBlocked === 'function') {
                    safePatch('instead', RelationshipStore, 'isBlocked', () => false);
                }
                if (typeof RelationshipStore.isIgnored === 'function') {
                    safePatch('instead', RelationshipStore, 'isIgnored', () => false);
                }
            }

            // G. Profile Actions (Prevent accidental unblocking)
            const profileActions = _metro.findByProps('unblockUser', 'blockUser');
            if (profileActions) {
                ['unblockUser', 'unignoreUser'].forEach(k => {
                    if (typeof profileActions[k] === 'function') {
                        safePatch('instead', profileActions, k, function(args, orig) {
                            const uId = args[0];
                            if (uId) {
                                blockedUserIdsSet.delete(String(uId));
                                ignoredUserIdsSet.delete(String(uId));
                                persistBlockedSets();
                            }
                            return orig ? orig.apply(this, args) : null;
                        });
                    }
                });
            }

            // H. React Native Alert Suppressor (Prevent blocked user prompts)
            const RNAlert = _metro.findByProps('alert') || (typeof globalThis !== 'undefined' && globalThis.alert);
            if (RNAlert && typeof RNAlert.alert === 'function') {
                safePatch('instead', RNAlert, 'alert', function(args, orig) {
                    const title = String(args[0] || '');
                    const message = String(args[1] || '');
                    if (isSettingsBlockedSection(title) || isSettingsBlockedSection(message)) {
                        return;
                    }
                    return orig ? orig.apply(this, args) : null;
                });
            }

            // I. User & Member Store Methods (UI-Level Elimination)
            const UserStore = _metro.findByProps('getUser', 'getUsers');
            if (UserStore && typeof UserStore.getUser === 'function') {
                safePatch('after', UserStore, 'getUser', function(args, res) {
                    if (res && isBlockedOrIgnored(res.id)) {
                        res.isBlocked = false;
                        res.isIgnored = false;
                    }
                    return res;
                });
            }

            // J. Settings Modules (Zero Blocked User Rows in Settings Menus)
            try {
                const settingModules = [
                    _metro.findByProps('getBlockedUsers'),
                    _metro.findByProps('getIgnoredUsers'),
                    _metro.findByProps('renderBlockedUsersRow')
                ].filter(Boolean);

                for (const mod of settingModules) {
                    for (const k of ['getBlockedUsers', 'getIgnoredUsers']) {
                        if (typeof mod[k] === 'function') {
                            safePatch('instead', mod, k, function(args, orig) {
                                return [];
                            });
                        }
                    }
                }
            } catch (_) {}

            // --- 3. React List Component Patches (FlatList & SectionList) ---
            const ListComponents = _metro.findByProps('FlatList', 'SectionList') ||
                                   _metro.findByProps('FlatList') ||
                                   {};
            const FlatList = ListComponents.FlatList ||
                             (_metro.findByName && _metro.findByName('FlatList')) ||
                             (typeof uiComponents !== 'undefined' && uiComponents.FlatList);
            const SectionList = ListComponents.SectionList ||
                                (_metro.findByName && _metro.findByName('SectionList')) ||
                                (typeof uiComponents !== 'undefined' && uiComponents.SectionList);

            if (FlatList) {
                if (typeof FlatList.render === 'function') {
                    safePatch('instead', FlatList, 'render', function(args, orig) {
                        const safeProps = getSafeListProps(args[0]);
                        return orig ? orig.apply(this, [safeProps, ...args.slice(1)]) : null;
                    });
                }
                if (FlatList.prototype && typeof FlatList.prototype.render === 'function') {
                    safePatch('instead', FlatList.prototype, 'render', function(args, orig) {
                        if (this.props) {
                            const safeProps = getSafeListProps(this.props);
                            this.props = safeProps;
                        }
                        return orig ? orig.apply(this, args) : null;
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
                        if (this.props) {
                            const safeProps = getSafeSectionProps(this.props);
                            this.props = safeProps;
                        }
                        return orig ? orig.apply(this, args) : null;
                    });
                }
            }

            notifyActive();
            console.log('[MasterSuite Mobile v2.2.0] Antigravity Master Suite loaded and active!');
        } catch (e) {
            console.error('[MasterSuite Mobile v2.2.0 Error]', e);
        }
    }

    function stopPlugin() {
        try {
            console.log('[MasterSuite Mobile v2.2.0] Stopping Antigravity Master Suite...');
            while (unpatches.length > 0) {
                const unpatch = unpatches.pop();
                try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
            }
            console.log('[MasterSuite Mobile v2.2.0] Antigravity Master Suite stopped successfully.');
        } catch (e) {
            console.error('[MasterSuite Mobile v2.2.0 Error stopping]', e);
        }
    }

    exports.default = {
        name: 'Antigravity Master Suite',
        description: 'All-in-One: 100% Blocked user elimination, LRU Hermes memory optimization, FlatList virtualization, and zero \'Messages failed to load\' auto-recovery.',
        authors: [{ name: 'Antigravity', id: '698947564459917343' }],
        version: '2.2.0',
        start: startPlugin,
        stop: stopPlugin,
        onLoad: startPlugin,
        onUnload: stopPlugin
    };

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