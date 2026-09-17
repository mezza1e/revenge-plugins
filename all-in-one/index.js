(function(exports, metroCommon, patcher, metro, vendetta, plugin, storage, uiComponents) {
    'use strict';

    // 1. Universal API Resolution
    const _revenge = (typeof revenge !== 'undefined' && revenge) ||
                     (typeof globalThis !== 'undefined' && globalThis.revenge) ||
                     {};
    const _vendetta = (typeof vendetta !== 'undefined' && vendetta) ||
                      (typeof globalThis !== 'undefined' && (globalThis.vendetta || globalThis.bunny)) ||
                      _revenge;
    const _metro = metro || _revenge.modules?.finders || _vendetta.metro || {};
    const _patcher = patcher || _revenge.patcher || _vendetta.patcher || {};
    const _common = metroCommon || _vendetta.metro?.common || {};
    const _FluxDispatcher = _revenge.discord?.flux?.Dispatcher ||
                           _revenge.discord?.flux?.FluxDispatcher ||
                           _common.FluxDispatcher ||
                           (_metro.findByProps && _metro.findByProps('dispatch', 'subscribe'));
    const unpatches = [];

    // Universal instead/before patcher wrapper that safely handles both Revenge and Vendetta calling conventions
    function safePatch(type, obj, prop, hook) {
        if (!obj || !prop || !_patcher) return;
        try {
            // Normalize hook arguments so (args, orig) is always consistent
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
                    content: 'Antigravity Master Suite v1.5.0: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('Antigravity Master Suite v1.5.0: ACTIVE');
                return;
            }
        } catch (_) {}
    }

    // --- State & Blocked Sets ---
    const blockedUserIdsSet = new Set();
    const ignoredUserIdsSet = new Set();
    let recentChannels = [];
    const MAX_CHANNELS = 4;
    const recoveryDebounce = {};

    function isBlockedOrIgnored(userId) {
        if (!userId) return false;
        const s = String(userId);
        return blockedUserIdsSet.has(s) || ignoredUserIdsSet.has(s);
    }

    function isMemberBlockedOrIgnored(item) {
        if (!item) return false;
        const uid = item.userId || item.user?.id || item.member?.user?.id || item.member?.userId || item.memberId || (typeof item.id === 'string' && item.type !== 'GROUP' ? item.id : null);
        return uid ? isBlockedOrIgnored(uid) : false;
    }

    // Deep text & element inspector
    function hasBlockedOrIgnored(val, depth = 0) {
        if (!val || depth > 6) return false;
        if (typeof val === 'string') return /blocked|ignored/i.test(val);
        if (typeof val === 'number' || typeof val === 'boolean') return false;
        if (Array.isArray(val)) return val.some(v => hasBlockedOrIgnored(v, depth + 1));
        if (typeof val === 'object') {
            for (const k of ['label', 'text', 'title', 'header', 'name', 'subText', 'description', 'value', 'ariaLabel', 'accessibilityLabel']) {
                if (val[k] && typeof val[k] === 'string' && /blocked|ignored/i.test(val[k])) return true;
            }
            if (val.props) return hasBlockedOrIgnored(val.props, depth + 1);
            if (val.children) return hasBlockedOrIgnored(val.children, depth + 1);
        }
        return false;
    }

    // Deep cleaner for referenced messages (replies to blocked users)
    function cleanMessageReplies(msg) {
        if (!msg || typeof msg !== 'object') return;
        try {
            const refAuthorId = msg.referenced_message?.author?.id ||
                                msg.referencedMessage?.author?.id ||
                                msg.message_reference?.author_id ||
                                msg.message_reference?.user_id;
            if (refAuthorId && isBlockedOrIgnored(refAuthorId)) {
                msg.referenced_message = null;
                msg.referencedMessage = null;
                msg.message_reference = null;
                msg.messageReference = null;
            }
        } catch (_) {}
    }

    // Deep message collection sanitizer (purges array and map caches)
    function cleanMessageCollection(ch) {
        if (!ch || typeof ch !== 'object') return;
        try {
            if (Array.isArray(ch._array)) {
                ch._array = ch._array.filter(m => m && !isBlockedOrIgnored(m.author?.id));
                for (const m of ch._array) cleanMessageReplies(m);
            }
            if (ch._map && typeof ch._map === 'object') {
                for (const mid in ch._map) {
                    const m = ch._map[mid];
                    if (isBlockedOrIgnored(m?.author?.id)) {
                        delete ch._map[mid];
                    } else {
                        cleanMessageReplies(m);
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
            if (row.message && isBlockedOrIgnored(row.message.author?.id)) continue;
            if (row.item && isBlockedOrIgnored(row.item.author?.id)) continue;
            // Clean replies in remaining visible messages
            if (row.message) cleanMessageReplies(row.message);
            if (row.item) cleanMessageReplies(row.item);
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

    function startPlugin() {
        try {
            console.log('[MasterSuite Mobile v1.5.0] Starting Antigravity Master Suite...');

            // Stores Resolution
            let RelationshipStore = null;
            let GuildMemberStore = null;
            let MessageStore = null;
            let TypingStore = null;
            let RowManager = null;

            if (_revenge.discord?.stores) {
                RelationshipStore = _revenge.discord.stores.RelationshipStore;
                GuildMemberStore = _revenge.discord.stores.GuildMemberStore;
                MessageStore = _revenge.discord.stores.MessageStore;
            }
            if (_metro.findByProps) {
                if (!RelationshipStore) RelationshipStore = _metro.findByProps('isBlocked', 'getRelationships');
                if (!GuildMemberStore) GuildMemberStore = _metro.findByProps('getMember', 'isMember') || _metro.findByProps('getMember');
                if (!MessageStore) MessageStore = _metro.findByProps('getMessages', 'getMessage');
                if (!TypingStore) TypingStore = _metro.findByProps('getTypingUsers');
                if (!RowManager) RowManager = _metro.findByProps('RowManager')?.RowManager;
            }
            if (_metro.findByName && !RowManager) {
                RowManager = _metro.findByName('RowManager');
            }

            // --- 1. Populate Private Blocked / Ignored Sets ---
            if (RelationshipStore) {
                try {
                    const rels = RelationshipStore.getRelationships ? RelationshipStore.getRelationships() : null;
                    if (rels && typeof rels === 'object') {
                        for (const [id, type] of Object.entries(rels)) {
                            if (type === 2) blockedUserIdsSet.add(String(id));
                            if (type === 5) ignoredUserIdsSet.add(String(id));
                        }
                    }
                    if (RelationshipStore.getBlockedUserIds) {
                        const bIds = RelationshipStore.getBlockedUserIds();
                        if (Array.isArray(bIds)) bIds.forEach(id => blockedUserIdsSet.add(String(id)));
                    }
                    if (RelationshipStore.getIgnoredUserIds) {
                        const iIds = RelationshipStore.getIgnoredUserIds();
                        if (Array.isArray(iIds)) iIds.forEach(id => ignoredUserIdsSet.add(String(id)));
                    }
                } catch (_) {}
            }

            console.log('[MasterSuite v1.5.0] Tracking', blockedUserIdsSet.size, 'blocked and', ignoredUserIdsSet.size, 'ignored users.');

            // ========================================================
            // 2. GATEWAY INTERCEPTION (FLUX DISPATCHER) VIA 'INSTEAD'
            // ========================================================
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    const event = args[0];
                    if (!event) return orig ? orig.apply(this, args) : undefined;

                    // Sync sets on live relationship events
                    if (event.type === 'RELATIONSHIP_ADD' && event.relationship) {
                        const rid = String(event.relationship.id);
                        if (event.relationship.type === 2) blockedUserIdsSet.add(rid);
                        if (event.relationship.type === 5) ignoredUserIdsSet.add(rid);
                    }
                    if (event.type === 'RELATIONSHIP_REMOVE') {
                        const rid = String(event.relationship?.id || event.userId || '');
                        if (rid) {
                            blockedUserIdsSet.delete(rid);
                            ignoredUserIdsSet.delete(rid);
                        }
                    }

                    // --- A. CONNECTION_OPEN (Full Initial Sync for Small Servers like "ihh") ---
                    if (event.type === 'CONNECTION_OPEN') {
                        if (Array.isArray(event.relationships)) {
                            for (const r of event.relationships) {
                                const rid = String(r.id);
                                if (r.type === 2) blockedUserIdsSet.add(rid);
                                if (r.type === 5) ignoredUserIdsSet.add(rid);
                            }
                        }
                        if (Array.isArray(event.guilds)) {
                            for (const g of event.guilds) {
                                if (Array.isArray(g.members)) {
                                    const origLen = g.members.length;
                                    g.members = g.members.filter(m => !isBlockedOrIgnored(m?.user?.id || m?.userId));
                                    const diff = origLen - g.members.length;
                                    if (typeof g.member_count === 'number') g.member_count = Math.max(0, g.member_count - diff);
                                }
                            }
                        }
                    }

                    // --- B. GUILD_CREATE (Small Servers like "ihh") ---
                    if (event.type === 'GUILD_CREATE' && Array.isArray(event.members)) {
                        const origLen = event.members.length;
                        event.members = event.members.filter(m => !isBlockedOrIgnored(m?.user?.id || m?.userId));
                        const diff = origLen - event.members.length;
                        if (typeof event.member_count === 'number') event.member_count = Math.max(0, event.member_count - diff);
                    }

                    // --- C. GUILD_MEMBERS_CHUNK ---
                    if (event.type === 'GUILD_MEMBERS_CHUNK' && Array.isArray(event.members)) {
                        event.members = event.members.filter(m => !isBlockedOrIgnored(m?.user?.id || m?.userId));
                    }

                    // --- D. GUILD_MEMBER_ADD / UPDATE / PRESENCE ---
                    if ((event.type === 'GUILD_MEMBER_ADD' || event.type === 'GUILD_MEMBER_UPDATE') && isBlockedOrIgnored(event.user?.id || event.member?.user?.id)) {
                        return; // Completely drop from member store
                    }
                    if (event.type === 'PRESENCE_UPDATE' && isBlockedOrIgnored(event.user?.id)) {
                        return; // Completely drop presence
                    }

                    // --- E. GUILD_MEMBER_LIST_UPDATE (Large Guilds) ---
                    if (event.type === 'GUILD_MEMBER_LIST_UPDATE') {
                        let totalRemoved = 0;
                        const groupDeltas = {};

                        if (Array.isArray(event.ops)) {
                            for (const op of event.ops) {
                                if (op.op === 'SYNC' && Array.isArray(op.items)) {
                                    const filtered = [];
                                    let currentGroupId = null;

                                    for (const item of op.items) {
                                        if (item.group) {
                                            currentGroupId = item.group.id;
                                            filtered.push(item);
                                        } else if (item.member) {
                                            const uid = item.member.user?.id || item.member.userId;
                                            if (isBlockedOrIgnored(uid)) {
                                                totalRemoved++;
                                                if (currentGroupId) {
                                                    groupDeltas[currentGroupId] = (groupDeltas[currentGroupId] || 0) + 1;
                                                }
                                                continue;
                                            }
                                            filtered.push(item);
                                        } else {
                                            filtered.push(item);
                                        }
                                    }

                                    for (const item of filtered) {
                                        if (item.group && groupDeltas[item.group.id]) {
                                            item.group.count = Math.max(0, (item.group.count || 0) - groupDeltas[item.group.id]);
                                        }
                                    }

                                    op.items = filtered;
                                    if (Array.isArray(op.range) && op.range.length === 2) {
                                        op.range[1] = Math.max(op.range[0], op.items.length - 1);
                                    }
                                } else if (op.op === 'INSERT' || op.op === 'UPDATE') {
                                    const uid = op.item?.member?.user?.id || op.item?.member?.userId;
                                    if (isBlockedOrIgnored(uid)) {
                                        op.op = 'INVALIDATE';
                                        op.range = [0, 0];
                                        delete op.item;
                                    }
                                }
                            }
                        }

                        if (Array.isArray(event.groups)) {
                            for (const grp of event.groups) {
                                if (grp && groupDeltas[grp.id]) {
                                    grp.count = Math.max(0, (grp.count || 0) - groupDeltas[grp.id]);
                                }
                            }
                        }
                        if (typeof event.online_count === 'number') {
                            event.online_count = Math.max(0, event.online_count - totalRemoved);
                        }
                        if (typeof event.member_count === 'number') {
                            event.member_count = Math.max(0, event.member_count - totalRemoved);
                        }
                    }

                    // --- F. CHAT MESSAGES & REPLIES (ZERO GAPS, ZERO "BLOCKED MESSAGE" PREVIEWS) ---
                    if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                        event.messages = event.messages.filter(msg => msg && !isBlockedOrIgnored(msg.author?.id));
                        for (const msg of event.messages) {
                            cleanMessageReplies(msg);
                        }
                    }

                    if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                        // Completely swallow message from blocked user so it never reaches MessageStore or RowManager!
                        if (isBlockedOrIgnored(event.message.author?.id)) {
                            return;
                        }
                        // Clean reply if referencing a blocked user so no "[icon] Blocked message" preview renders
                        cleanMessageReplies(event.message);
                    }

                    if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                        return; // Drop typing indicator
                    }

                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            // ========================================================
            // 3. STORE INTERCEPTION (USING FOOLPROOF 'INSTEAD' PATTERN)
            // ========================================================

            // A. GuildMemberStore
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
                        return res.filter(m => !isBlockedOrIgnored(m?.userId || m?.user?.id));
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
                                cleanMessageReplies(m);
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
                        if (msg) cleanMessageReplies(msg);
                        return msg;
                    });
                }
            }

            // C. RowManager (Chat Rows & Zero Gaps)
            if (RowManager && RowManager.prototype) {
                safePatch('instead', RowManager.prototype, 'generate', function(args, orig) {
                    const data = args[0];
                    if (data) {
                        // 1. Sanitize replies to blocked users so no "[icon] Blocked message" renders
                        if (data.message) {
                            cleanMessageReplies(data.message);
                        }

                        // 2. Drop blocked group rows (rowType 2) or messages from blocked users
                        const isBlockedGroup = data.rowType === 2 || data.type === 2;
                        const isBlockedMsg = data.message && isBlockedOrIgnored(data.message.author?.id);

                        if (isBlockedGroup || isBlockedMsg) {
                            // By returning null, RowManager does NOT emit an empty row container! Zero gaps!
                            return null;
                        }
                    }
                    const res = orig ? orig.apply(this, args) : null;
                    if (res) {
                        if (res.rowType === 2 || res.type === 2 || (res.message && isBlockedOrIgnored(res.message.author?.id))) {
                            return null;
                        }
                        if (res.message) cleanMessageReplies(res.message);
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

            // E. RelationshipStore (Make Discord UI see 0 Blocked & 0 Ignored)
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
                                console.log('[MasterSuite v1.5.0] Suppressed profile open for blocked user:', uid);
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
                        console.log('[MasterSuite v1.5.0] Suppressed Show Profile dialog:', title);
                        return;
                    }
                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            // ========================================================
            // 5. UI COMPONENT ELIMINATION (SETTINGS + MEMBER ITEMS)
            // ========================================================
            const uiTargetMods = new Set();
            const addMod = (m) => { if (m && typeof m === 'object') uiTargetMods.add(m); };

            if (_revenge.discord?.design?.Design) addMod(_revenge.discord.design.Design);
            if (_vendetta.ui?.components?.Forms) addMod(_vendetta.ui.components.Forms);

            const searchKeys = [
                'TableRow', 'TableRowGroup', 'TableSwitchRow', 'FormRow', 'FormSection',
                'SettingsRow', 'MemberListItem', 'GuildMemberListItem', 'MemberRow',
                'isMobileOnline', 'statusColor'
            ];
            for (const p of searchKeys) {
                if (_metro.findByProps) {
                    try { addMod(_metro.findByProps(p)); } catch (_) {}
                }
            }

            for (const mod of uiTargetMods) {
                for (const k of Object.keys(mod)) {
                    if (typeof mod[k] === 'function') {
                        safePatch('instead', mod, k, function(args, orig) {
                            const p = args[0] || {};
                            if (hasBlockedOrIgnored(p)) return null;
                            if (isMemberBlockedOrIgnored(p)) return null;
                            const res = orig ? orig.apply(this, args) : null;
                            if (res && res.props && (hasBlockedOrIgnored(res.props) || isMemberBlockedOrIgnored(res.props))) {
                                return null;
                            }
                            return res;
                        });
                    }
                }
            }

            // ========================================================
            // 6. FLATLIST & SECTIONLIST (CHAT DATES + MEMBER LIST + SETTINGS)
            // NOTE: REMOVED removeClippedSubviews TO PREVENT PFP DISTORTION!
            // ========================================================
            const RN = _common.ReactNative || (_metro.findByProps && _metro.findByProps('FlatList', 'SectionList')) || (_metro.findByProps && _metro.findByProps('FlatList'));
            const FlatList = RN?.FlatList || (_metro.findByProps && _metro.findByProps('FlatList')?.FlatList);
            const SectionList = RN?.SectionList || (_metro.findByProps && _metro.findByProps('SectionList')?.SectionList);

            if (FlatList) {
                const patchListProps = (props) => {
                    if (!props || typeof props !== 'object') return;
                    // Clean chat rows and filter blocked items
                    if (Array.isArray(props.data)) {
                        props.data = cleanChatRows(props.data.filter(it => !isMemberBlockedOrIgnored(it) && !hasBlockedOrIgnored(it)));
                    }
                    if (typeof props.renderItem === 'function' && !props.renderItem.__antigravity_wrapped) {
                        const origRenderItem = props.renderItem;
                        props.renderItem = function(info) {
                            if (info && (isMemberBlockedOrIgnored(info.item) || hasBlockedOrIgnored(info.item))) {
                                return null;
                            }
                            return origRenderItem.apply(this, arguments);
                        };
                        props.renderItem.__antigravity_wrapped = true;
                    }
                };

                if (typeof FlatList.render === 'function') {
                    safePatch('before', FlatList, 'render', (args) => { patchListProps(args[0]); });
                }
                if (FlatList.prototype && typeof FlatList.prototype.render === 'function') {
                    safePatch('before', FlatList.prototype, 'render', function(args) { patchListProps(this.props); });
                }
            }

            if (SectionList) {
                const patchSectionProps = (props) => {
                    if (!props || typeof props !== 'object') return;
                    if (Array.isArray(props.sections)) {
                        props.sections = props.sections
                            .filter(sec => !hasBlockedOrIgnored(sec?.title) && !hasBlockedOrIgnored(sec?.header))
                            .map(sec => {
                                if (Array.isArray(sec.data)) {
                                    const origLen = sec.data.length;
                                    const filteredData = sec.data.filter(it => !isMemberBlockedOrIgnored(it) && !hasBlockedOrIgnored(it));
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
                    if (typeof props.renderItem === 'function' && !props.renderItem.__antigravity_wrapped) {
                        const origRenderItem = props.renderItem;
                        props.renderItem = function(info) {
                            if (info && (isMemberBlockedOrIgnored(info.item) || hasBlockedOrIgnored(info.item) || hasBlockedOrIgnored(info.section))) {
                                return null;
                            }
                            return origRenderItem.apply(this, arguments);
                        };
                        props.renderItem.__antigravity_wrapped = true;
                    }
                    if (typeof props.renderSectionHeader === 'function' && !props.renderSectionHeader.__antigravity_wrapped) {
                        const origRenderHeader = props.renderSectionHeader;
                        props.renderSectionHeader = function(info) {
                            if (info && hasBlockedOrIgnored(info.section)) {
                                return null;
                            }
                            return origRenderHeader.apply(this, arguments);
                        };
                        props.renderSectionHeader.__antigravity_wrapped = true;
                    }
                };

                if (typeof SectionList.render === 'function') {
                    safePatch('before', SectionList, 'render', (args) => { patchSectionProps(args[0]); });
                }
                if (SectionList.prototype && typeof SectionList.prototype.render === 'function') {
                    safePatch('before', SectionList.prototype, 'render', function(args) { patchSectionProps(this.props); });
                }
            }

            // ========================================================
            // 7. SAFE MESSAGE RELIABILITY & LRU BOUNDS
            // ========================================================
            if (_FluxDispatcher) {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    const event = args[0];
                    if (event && event.type === 'CHANNEL_SELECT' && event.channelId) {
                        recentChannels = recentChannels.filter(id => id !== event.channelId);
                        recentChannels.unshift(event.channelId);
                        if (recentChannels.length > MAX_CHANNELS) {
                            recentChannels = recentChannels.slice(0, MAX_CHANNELS);
                            if (MessageStore) {
                                const cache = MessageStore._channelMessages || MessageStore._messages;
                                if (cache && typeof cache === 'object') {
                                    const allowed = new Set(recentChannels);
                                    for (const chId in cache) {
                                        if (!allowed.has(chId)) delete cache[chId];
                                    }
                                }
                            }
                        }
                    }
                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            const MessageActions = _metro.findByProps ? _metro.findByProps('fetchMessages') : null;
            if (_FluxDispatcher && MessageActions) {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    const event = args[0];
                    if (event && (event.type === 'LOAD_MESSAGES_FAILURE' || event.type === 'MESSAGE_FETCH_FAILED')) {
                        const chId = event.channelId;
                        if (chId && !recoveryDebounce[chId]) {
                            recoveryDebounce[chId] = setTimeout(() => {
                                delete recoveryDebounce[chId];
                                console.log('[MessageReliability v1.5.0] Auto-recovering channel:', chId);
                                try { MessageActions.fetchMessages({ channelId: chId, limit: 50 }); } catch (_) {}
                            }, 1200);
                        }
                    }
                    return orig ? orig.apply(this, args) : undefined;
                });
            }

            // Pre-warm action handlers
            try {
                if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                    _FluxDispatcher.dispatch({ type: 'LOAD_MESSAGES_SUCCESS', messages: [] });
                }
            } catch (_) {}

            notifyActive();
            console.log('[MasterSuite Mobile v1.5.0] Antigravity Master Suite loaded and active!');
        } catch (err) {
            console.error('[MasterSuite Mobile v1.5.0] Error during startup:', err);
        }
    }

    function stopPlugin() {
        for (const t of Object.values(recoveryDebounce)) clearTimeout(t);
        for (const unpatch of unpatches) {
            try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[MasterSuite Mobile v1.5.0] Unloaded cleanly.');
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
})({},
    (typeof vendetta !== 'undefined' ? vendetta.metro?.common : (typeof revenge !== 'undefined' ? revenge.metro?.common : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.patcher : (typeof revenge !== 'undefined' ? revenge.patcher : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.metro : (typeof revenge !== 'undefined' ? revenge.metro : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta : (typeof revenge !== 'undefined' ? revenge : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.plugin : (typeof revenge !== 'undefined' ? revenge.plugin : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.storage : (typeof revenge !== 'undefined' ? revenge.storage : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.ui?.components : (typeof revenge !== 'undefined' ? revenge.ui?.components : undefined))
)