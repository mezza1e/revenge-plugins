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
    const _FluxDispatcher = _revenge.discord?.flux?.FluxDispatcher ||
                           _common.FluxDispatcher ||
                           (_metro.findByProps && _metro.findByProps('dispatch', 'subscribe'));
    const unpatches = [];

    // Helper for universal patcher argument compatibility (parent, key vs key, parent)
    function safePatch(type, obj, prop, hook) {
        if (!obj || !prop || !_patcher) return;
        try {
            // Revenge convention: patcher[type](parent, key, hook)
            if (typeof _patcher[type] === 'function') {
                try {
                    const unpatch = _patcher[type](obj, prop, hook);
                    if (typeof unpatch === 'function') unpatches.push(unpatch);
                    return;
                } catch (_) {}
                // Vendetta convention: patcher[type](key, parent, hook)
                try {
                    const unpatch = _patcher[type](prop, obj, hook);
                    if (typeof unpatch === 'function') unpatches.push(unpatch);
                    return;
                } catch (_) {}
            }
        } catch (_) {}
    }

    // Toast notification for user confirmation on mobile screen
    function notifyActive() {
        try {
            if (_revenge.discord?.actions?.ToastActionCreators?.open) {
                _revenge.discord.actions.ToastActionCreators.open({
                    key: 'antigravity-active',
                    content: 'Antigravity Master Suite v1.3.0: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('Antigravity Master Suite v1.3.0: ACTIVE');
                return;
            }
        } catch (_) {}
    }

    // --- State & Robust Tracking Sets ---
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

    // Deep text / element inspector to find blocked or ignored keywords in props
    function hasBlockedOrIgnored(val, depth = 0) {
        if (!val || depth > 6) return false;
        if (typeof val === 'string') return /blocked|ignored/i.test(val);
        if (typeof val === 'number' || typeof val === 'boolean') return false;
        if (Array.isArray(val)) return val.some(v => hasBlockedOrIgnored(v, depth + 1));
        if (typeof val === 'object') {
            for (const k of Object.keys(val)) {
                if (k.startsWith('_') || k === 'navigation' || k === 'navigator' || k === 'theme') continue;
                try {
                    if (hasBlockedOrIgnored(val[k], depth + 1)) return true;
                } catch (_) {}
            }
        }
        return false;
    }

    function startPlugin(api) {
        try {
            console.log('[MasterSuite Mobile v1.3.0] Starting Antigravity Master Suite...');

            // Stores Resolution
            let RelationshipStore = null;
            let GuildMemberStore = null;
            let ChannelMemberStore = null;
            let MessageStore = null;
            let TypingStore = null;
            let RowManager = null;
            let relationshipProps = null;

            if (_metro.findByStoreName) {
                RelationshipStore = _metro.findByStoreName('RelationshipStore');
                GuildMemberStore = _metro.findByStoreName('GuildMemberStore');
                ChannelMemberStore = _metro.findByStoreName('ChannelMemberStore') ||
                                     _metro.findByStoreName('ChannelMembersStore') ||
                                     _metro.findByStoreName('GuildMemberListStore');
                MessageStore = _metro.findByStoreName('MessageStore');
                TypingStore = _metro.findByStoreName('TypingStore');
            }
            if (!RelationshipStore && _revenge.discord?.stores?.RelationshipStore) {
                RelationshipStore = _revenge.discord.stores.RelationshipStore;
            }
            if (!GuildMemberStore && _revenge.discord?.stores?.GuildMemberStore) {
                GuildMemberStore = _revenge.discord.stores.GuildMemberStore;
            }
            if (!MessageStore && _revenge.discord?.stores?.MessageStore) {
                MessageStore = _revenge.discord.stores.MessageStore;
            }
            if (_metro.findByName) {
                RowManager = _metro.findByName('RowManager');
            }
            if (_metro.findByProps) {
                relationshipProps = _metro.findByProps('isBlocked', 'isIgnored');
                if (!MessageStore) MessageStore = _metro.findByProps('getMessages');
                if (!RelationshipStore) RelationshipStore = _metro.findByProps('isBlocked', 'getRelationships');
                if (!GuildMemberStore) GuildMemberStore = _metro.findByProps('getMember', 'getMembers');
                if (!ChannelMemberStore) ChannelMemberStore = _metro.findByProps('getProps', 'getRows');
                if (!RowManager) RowManager = _metro.findByProps('RowManager')?.RowManager;
            }

            // --- 1. Populate Private Blocked / Ignored Sets ---
            try {
                if (RelationshipStore) {
                    if (typeof RelationshipStore.getRelationships === 'function') {
                        const rels = RelationshipStore.getRelationships();
                        if (rels && typeof rels === 'object') {
                            for (const [id, type] of Object.entries(rels)) {
                                if (type === 2) blockedUserIdsSet.add(String(id));
                                if (type === 5) ignoredUserIdsSet.add(String(id));
                            }
                        }
                    }
                    if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                        const bList = RelationshipStore.getBlockedUserIds();
                        if (Array.isArray(bList)) bList.forEach(id => blockedUserIdsSet.add(String(id)));
                    }
                    if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                        const iList = RelationshipStore.getIgnoredUserIds();
                        if (Array.isArray(iList)) iList.forEach(id => ignoredUserIdsSet.add(String(id)));
                    }
                }
            } catch (_) {}

            console.log('[MasterSuite v1.3.0] Initialized with', blockedUserIdsSet.size, 'blocked and', ignoredUserIdsSet.size, 'ignored users.');

            // ========================================================
            // 2. 100% BYEBLOCKED (CHAT + MEMBER LIST + RELATIONS)
            // ========================================================

            // A. Flux Dispatcher Gateway Interceptor
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                safePatch('before', _FluxDispatcher, 'dispatch', ([event]) => {
                    if (!event) return;

                    // Sync sets on relationship events
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
                    if (event.type === 'CONNECTION_OPEN' && Array.isArray(event.relationships)) {
                        for (const r of event.relationships) {
                            const rid = String(r.id);
                            if (r.type === 2) blockedUserIdsSet.add(rid);
                            if (r.type === 5) ignoredUserIdsSet.add(rid);
                        }
                    }

                    // --- CHAT MESSAGES ---
                    if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                        event.messages = event.messages.filter(msg => msg && !isBlockedOrIgnored(msg.author?.id));
                    }
                    if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                        if (isBlockedOrIgnored(event.message.author?.id)) {
                            event.channelId = '0';
                        }
                    }
                    if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                        event.channelId = '0';
                    }

                    // --- MEMBER LIST GATEWAY INTERCEPTION (GUILD_MEMBER_LIST_UPDATE) ---
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
                                                continue; // Drop blocked member!
                                            }
                                            filtered.push(item);
                                        } else {
                                            filtered.push(item);
                                        }
                                    }

                                    // Update group counts inside items
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

                    // Member chunks
                    if (event.type === 'GUILD_MEMBERS_CHUNK' && Array.isArray(event.members)) {
                        event.members = event.members.filter(m => !isBlockedOrIgnored(m.user?.id || m.userId));
                    }
                    if ((event.type === 'GUILD_MEMBER_ADD' || event.type === 'GUILD_MEMBER_UPDATE') && isBlockedOrIgnored(event.user?.id || event.member?.user?.id)) {
                        event.guildId = '0';
                    }
                    if (event.type === 'PRESENCE_UPDATE' && isBlockedOrIgnored(event.user?.id)) {
                        event.guildId = '0';
                    }
                });
            }

            // B. RowManager: Neutralize 'X blocked message(s)' collapsed bar
            if (RowManager && RowManager.prototype) {
                safePatch('before', RowManager.prototype, 'generate', ([data]) => {
                    if (!data) return;
                    if (data.rowType === 2 || data.type === 2) {
                        data.renderContentOnly = true;
                        data.roleStyle = '';
                        data.text = '';
                        data.revealed = false;
                        data.content = [];
                        data.count = 0;
                    }
                    if (data.message && isBlockedOrIgnored(data.message.author?.id)) {
                        data.renderContentOnly = true;
                        data.message.content = '';
                        data.message.reactions = [];
                        data.message.canShowComponents = false;
                    }
                });
            }

            // C. ChannelMemberStore: Neutralize Member List Rows & Groups
            if (ChannelMemberStore) {
                if (typeof ChannelMemberStore.getProps === 'function') {
                    safePatch('after', ChannelMemberStore, 'getProps', (args, res) => {
                        if (!res || !Array.isArray(res.rows)) return res;
                        let removed = 0;
                        const filteredRows = [];

                        for (const r of res.rows) {
                            if (!r) continue;
                            if (isMemberBlockedOrIgnored(r)) {
                                removed++;
                                continue;
                            }
                            filteredRows.push(r);
                        }
                        if (removed === 0) return res;

                        return {
                            ...res,
                            rows: filteredRows
                        };
                    });
                }
                if (typeof ChannelMemberStore.getRows === 'function') {
                    safePatch('after', ChannelMemberStore, 'getRows', (args, res) => {
                        if (!Array.isArray(res)) return res;
                        return res.filter(r => !isMemberBlockedOrIgnored(r));
                    });
                }
            }

            // D. GuildMemberStore: Blocked Users are not members
            if (GuildMemberStore) {
                if (typeof GuildMemberStore.getMember === 'function') {
                    safePatch('after', GuildMemberStore, 'getMember', (args, res) => {
                        const uid = args[1];
                        if (isBlockedOrIgnored(uid)) return undefined;
                        return res;
                    });
                }
                if (typeof GuildMemberStore.getMembers === 'function') {
                    safePatch('after', GuildMemberStore, 'getMembers', (args, res) => {
                        if (!Array.isArray(res)) return res;
                        return res.filter(m => !isBlockedOrIgnored(m?.userId || m?.user?.id));
                    });
                }
                if (typeof GuildMemberStore.getMemberIds === 'function') {
                    safePatch('after', GuildMemberStore, 'getMemberIds', (args, res) => {
                        if (!Array.isArray(res)) return res;
                        return res.filter(id => !isBlockedOrIgnored(id));
                    });
                }
                if (typeof GuildMemberStore.isMember === 'function') {
                    safePatch('after', GuildMemberStore, 'isMember', (args, res) => {
                        const uid = args[1];
                        if (isBlockedOrIgnored(uid)) return false;
                        return res;
                    });
                }
            }

            // E. Purge MessageStore & TypingStore
            if (MessageStore) {
                try {
                    const cache = MessageStore._channelMessages || MessageStore._messages;
                    if (cache && typeof cache === 'object') {
                        for (const chId in cache) {
                            const ch = cache[chId];
                            if (ch && Array.isArray(ch._array)) {
                                ch._array = ch._array.filter(m => m && !isBlockedOrIgnored(m.author?.id));
                            }
                        }
                    }
                } catch (_) {}
            }
            if (TypingStore && typeof TypingStore.getTypingUsers === 'function') {
                safePatch('after', TypingStore, 'getTypingUsers', (args, res) => {
                    if (!res || typeof res !== 'object') return res;
                    const filtered = {};
                    for (const uId in res) {
                        if (!isBlockedOrIgnored(uId)) filtered[uId] = res[uId];
                    }
                    return filtered;
                });
            }

            // F. RelationshipStore: Make Discord Think There are 0 Blocked / Ignored Users
            if (RelationshipStore) {
                if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                    safePatch('instead', RelationshipStore, 'getBlockedUserIds', () => []);
                }
                if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                    safePatch('instead', RelationshipStore, 'getIgnoredUserIds', () => []);
                }
                if (typeof RelationshipStore.getRelationships === 'function') {
                    safePatch('after', RelationshipStore, 'getRelationships', (args, res) => {
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
                    safePatch('instead', RelationshipStore, 'getRelationshipType', (args, orig) => {
                        const uid = args[0];
                        if (isBlockedOrIgnored(uid)) return 0;
                        return orig(...args);
                    });
                }
                if (typeof RelationshipStore.getRelationshipCount === 'function') {
                    safePatch('instead', RelationshipStore, 'getRelationshipCount', (args, orig) => {
                        const type = args[0];
                        if (type === 2 || type === 5) return 0;
                        return orig(...args);
                    });
                }
                // Suppress "Show Profile? You blocked X" dialog by telling internal Discord isBlocked = false
                if (typeof RelationshipStore.isBlocked === 'function') {
                    safePatch('instead', RelationshipStore, 'isBlocked', () => false);
                }
                if (typeof RelationshipStore.isIgnored === 'function') {
                    safePatch('instead', RelationshipStore, 'isIgnored', () => false);
                }
            }

            // G. Suppress "Show Profile?" Dialogs, Alerts, & Profile Open Actions
            const profileActions = (_metro.findByProps && (_metro.findByProps('openUserProfile') || _metro.findByProps('showUserProfile')));
            if (profileActions) {
                for (const k of ['openUserProfile', 'showUserProfile', 'openUserProfileModal']) {
                    if (typeof profileActions[k] === 'function') {
                        safePatch('instead', profileActions, k, (args, orig) => {
                            const target = args[0];
                            const uid = typeof target === 'string' ? target : (target?.userId || target?.user?.id);
                            if (isBlockedOrIgnored(uid)) {
                                console.log('[MasterSuite v1.3.0] Blocked profile navigation for:', uid);
                                return;
                            }
                            return orig(...args);
                        });
                    }
                }
            }

            const RNAlert = _common.ReactNative?.Alert || (_metro.findByProps && (_metro.findByProps('alert')?.Alert || _metro.findByProps('Alert')?.Alert));
            if (RNAlert && typeof RNAlert.alert === 'function') {
                safePatch('instead', RNAlert, 'alert', (args, orig) => {
                    const title = String(args[0] || '');
                    const msg = String(args[1] || '');
                    if (/Show Profile/i.test(title) || /You blocked/i.test(msg) || /blocked/i.test(title)) {
                        console.log('[MasterSuite v1.3.0] Suppressed confirmation Alert dialog:', title);
                        return;
                    }
                    return orig(...args);
                });
            }

            // H. UI Component Elimination (Settings Rows, Sections & Member Items)
            const settingsMods = new Set();
            const addMod = (m) => { if (m && typeof m === 'object') settingsMods.add(m); };

            if (_revenge.discord?.design?.Design) addMod(_revenge.discord.design.Design);
            if (_vendetta.ui?.components?.Forms) addMod(_vendetta.ui.components.Forms);

            const searchKeys = ['TableRow', 'TableRowGroup', 'TableSwitchRow', 'FormRow', 'FormSection', 'SettingsRow'];
            for (const p of searchKeys) {
                if (_metro.findByProps) {
                    try { addMod(_metro.findByProps(p)); } catch (_) {}
                }
                if (_metro.findByPropsAll) {
                    try {
                        const all = _metro.findByPropsAll(p);
                        if (Array.isArray(all)) all.forEach(addMod);
                    } catch (_) {}
                }
            }

            for (const mod of settingsMods) {
                for (const k of ['TableRow', 'TableRowGroup', 'TableSwitchRow', 'FormRow', 'FormSection', 'SettingsRow']) {
                    if (typeof mod[k] === 'function') {
                        safePatch('instead', mod, k, (args, orig) => {
                            const p = args[0] || {};
                            if (hasBlockedOrIgnored(p)) {
                                return null;
                            }
                            const res = orig(...args);
                            if (res && res.props && hasBlockedOrIgnored(res.props)) {
                                return null;
                            }
                            return res;
                        });
                    }
                }
            }

            // Member list items
            const memberRowMods = [
                _metro.findByProps && _metro.findByProps('MemberListItem'),
                _metro.findByProps && _metro.findByProps('GuildMemberListItem'),
                _metro.findByProps && _metro.findByProps('MemberRow'),
                _metro.findByProps && _metro.findByProps('MemberListRow')
            ].filter(Boolean);

            for (const mod of memberRowMods) {
                for (const k of ['MemberListItem', 'GuildMemberListItem', 'MemberRow', 'MemberListRow']) {
                    if (typeof mod[k] === 'function') {
                        safePatch('instead', mod, k, (args, orig) => {
                            const p = args[0] || {};
                            if (isMemberBlockedOrIgnored(p)) {
                                return null;
                            }
                            return orig(...args);
                        });
                    }
                }
            }

            // ========================================================
            // 3. MEMORY ENGINE (HERMES LRU CACHE & VIRTUALIZATION)
            // ========================================================
            if (_FluxDispatcher) {
                safePatch('after', _FluxDispatcher, 'dispatch', ([event]) => {
                    if (!event) return;
                    if (event.type === 'CHANNEL_SELECT' && event.channelId) {
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
                    if (event.type === 'APP_STATE_UPDATE' && event.state === 'background') {
                        if (typeof global !== 'undefined' && typeof global.gc === 'function') global.gc();
                        if (_common.ReactNative?.Image?.clearMemoryCache) {
                            _common.ReactNative.Image.clearMemoryCache();
                        }
                    }
                });
            }

            // FlatList & SectionList Virtualization & Data Filtering
            const RN = _common.ReactNative || (_metro.findByProps && _metro.findByProps('FlatList', 'SectionList')) || (_metro.findByProps && _metro.findByProps('FlatList'));
            const FlatList = RN?.FlatList || (_metro.findByProps && _metro.findByProps('FlatList')?.FlatList);
            const SectionList = RN?.SectionList || (_metro.findByProps && _metro.findByProps('SectionList')?.SectionList);

            if (FlatList) {
                const patchListProps = (props) => {
                    if (!props || typeof props !== 'object') return;
                    props.removeClippedSubviews = true;
                    if (props.maxToRenderPerBatch === undefined || props.maxToRenderPerBatch > 10) {
                        props.maxToRenderPerBatch = 8;
                    }
                    if (Array.isArray(props.data)) {
                        props.data = props.data.filter(it => !isMemberBlockedOrIgnored(it) && !hasBlockedOrIgnored(it));
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
                                    return {
                                        ...sec,
                                        data: sec.data.filter(it => !isMemberBlockedOrIgnored(it) && !hasBlockedOrIgnored(it))
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
            // 4. MESSAGE RELIABILITY (AUTO-RECOVERY)
            // ========================================================
            const MessageActions = _metro.findByProps ? _metro.findByProps('fetchMessages') : null;
            if (_FluxDispatcher && MessageActions) {
                safePatch('after', _FluxDispatcher, 'dispatch', ([event]) => {
                    if (!event) return;
                    if (event.type === 'LOAD_MESSAGES_FAILURE' || event.type === 'MESSAGE_FETCH_FAILED') {
                        const chId = event.channelId;
                        if (!chId || recoveryDebounce[chId]) return;
                        recoveryDebounce[chId] = setTimeout(() => {
                            delete recoveryDebounce[chId];
                            console.log('[MessageReliability v1.3.0] Auto-recovering channel:', chId);
                            try { MessageActions.fetchMessages({ channelId: chId, limit: 50 }); } catch (_) {}
                        }, 1200);
                    }
                });
            }

            notifyActive();
            console.log('[MasterSuite Mobile v1.3.0] Antigravity Master Suite loaded and active!');
        } catch (err) {
            console.error('[MasterSuite Mobile v1.3.0] Error during startup:', err);
        }
    }

    function stopPlugin() {
        for (const t of Object.values(recoveryDebounce)) clearTimeout(t);
        for (const unpatch of unpatches) {
            try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[MasterSuite Mobile v1.3.0] Unloaded cleanly.');
    }

    // Support ALL client lifecycles: start/stop (Revenge Next), onLoad/onUnload (Vendetta/Classic)
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