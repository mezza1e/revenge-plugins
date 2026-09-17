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

    // React and View resolution for valid empty cell rendering
    let React = (typeof globalThis !== 'undefined' && globalThis.React) ||
                _common.React ||
                (_metro.findByProps && (_metro.findByProps('createElement', 'Component') || _metro.findByProps('createElement')));
    let View = (_metro.findByProps && _metro.findByProps('View')?.View) ||
               (typeof uiComponents !== 'undefined' && uiComponents.View);

    // Universal instead/before/after patcher wrapper that safely handles both Revenge and Vendetta calling conventions
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
                    content: 'Antigravity Master Suite v2.8.0: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('Antigravity Master Suite v2.8.0: ACTIVE');
                return;
            }
        } catch (_) {}
    }

    // --- State & Blocked Sets (PURELY DYNAMIC TRACKING) ---
    const blockedUserIdsSet = new Set();
    const ignoredUserIdsSet = new Set();
    const blockedMessageIdsSet = new Set();
    let recentChannels = [];
    const MAX_CHANNELS = 4;
    const recoveryDebounce = {};

    let RelationshipStore = null;
    let GuildMemberStore = null;
    let MemberListStore = null;
    let MessageStore = null;
    let UserStore = null;
    let UserProfileStore = null;
    let TypingStore = null;
    let RowManager = null;

    // References to raw unpatched store functions for accurate internal lookups
    let rawIsBlocked = null;
    let rawIsIgnored = null;
    let rawGetRelationships = null;
    let rawGetBlockedUserIds = null;

    // IMMEDIATE ZERO-LATENCY CACHE RESTORATION:
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
            if (MemberListStore && typeof MemberListStore.emitChange === 'function') MemberListStore.emitChange();
            if (RelationshipStore && typeof RelationshipStore.emitChange === 'function') RelationshipStore.emitChange();
            if (UserStore && typeof UserStore.emitChange === 'function') UserStore.emitChange();
        } catch (_) {}
    }

    // Dynamic relationship check: checks in-memory set, with seamless fallback to raw store if available
    function isBlockedOrIgnored(userId) {
        if (!userId) return false;
        const s = String(userId);
        if (blockedUserIdsSet.has(s) || ignoredUserIdsSet.has(s)) return true;

        if (rawIsBlocked && RelationshipStore) {
            try {
                if (rawIsBlocked.call(RelationshipStore, s) === true) {
                    blockedUserIdsSet.add(s);
                    persistBlockedSets();
                    return true;
                }
            } catch (_) {}
        }
        if (rawIsIgnored && RelationshipStore) {
            try {
                if (rawIsIgnored.call(RelationshipStore, s) === true) {
                    ignoredUserIdsSet.add(s);
                    persistBlockedSets();
                    return true;
                }
            } catch (_) {}
        }
        return false;
    }

    // Member discriminator: dynamically checks member's Snowflake User ID against relationship tracker
    function isMemberBlockedOrIgnored(item) {
        if (!item || typeof item !== 'object') return false;

        // Guard against pure Channel or Guild navigation items that have no user/member data
        if (!item.user && !item.member && !item.userId && !item.author && !item.record &&
            (item.guild != null || item.channel != null || item.guild_id != null || item.recipient_ids != null)) {
            return false;
        }

        const uid = item.userId ||
                    item.id ||
                    item.user?.id ||
                    item.member?.userId ||
                    item.member?.user?.id ||
                    item.member?.id ||
                    item.author?.id ||
                    item.record?.userId ||
                    item.record?.id ||
                    item.record?.user?.id;

        if (uid) {
            return isBlockedOrIgnored(uid);
        }

        return false;
    }

    function isSettingsBlockedSection(sectionOrTitle) {
        if (!sectionOrTitle) return false;
        const text = typeof sectionOrTitle === 'string' ? sectionOrTitle : (sectionOrTitle.title || sectionOrTitle.header || sectionOrTitle.key || '');
        if (typeof text !== 'string') return false;
        const lower = text.toLowerCase();
        return lower.includes('blocked user') || lower.includes('blocked') || lower.includes('ignored');
    }

    // Decrement count in header strings (e.g. "Online — 2" -> "Online — 1") targeting the count at the end
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

    // Safely render an empty, zero-height element
    function renderEmptyRow() {
        if (React && typeof React.createElement === 'function' && View) {
            try {
                return React.createElement(View, {
                    style: { height: 0, width: 0, opacity: 0, overflow: 'hidden' },
                    pointerEvents: 'none'
                });
            } catch (_) {}
        }
        return null;
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

    // Hermes memory optimization: LRU channel cleanup
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

            if (ch._map && typeof ch._map === 'object') {
                for (const mid in ch._map) {
                    const m = ch._map[mid];
                    if (m) {
                        if (isBlockedOrIgnored(m.author?.id)) {
                            m.content = '';
                            m.attachments = [];
                            m.embeds = [];
                            blockedMessageIdsSet.add(String(mid));
                        }
                        sanitizeMessage(m);
                    }
                }
            }
        } catch (_) {}
    }

    // Helper to identify date divider rows
    function isDividerRow(r) {
        if (!r || typeof r !== 'object') return false;
        if (r.type === 3 || r.rowType === 3 || r.type === 'DIVIDER' || r.type === 'DATE' || r.isDivider === true) return true;
        if (typeof r.id === 'string' && (r.id.startsWith('divider') || r.id.startsWith('date'))) return true;
        if (r.date != null && !r.message && !r.author && !r.content) return true;
        return false;
    }

    // Helper to identify real visible message rows
    function isMessageRow(r) {
        if (!r || typeof r !== 'object') return false;
        if (isDividerRow(r)) return false;
        if (r.type === 2 || r.rowType === 2 || r.type === -1 || r.hidden === true) return false;
        if (r.message && (isBlockedOrIgnored(r.message.author?.id) || blockedMessageIdsSet.has(String(r.message.id)))) return false;
        if (r.item && (isBlockedOrIgnored(r.item.author?.id) || blockedMessageIdsSet.has(String(r.item.id)))) return false;
        return !!(r.message || r.item || r.author || r.content || r.type === 0 || r.type === 'MESSAGE');
    }

    // Prune orphaned and adjacent date dividers (eliminates dates sent by blocked users)
    function pruneOrphanedDateDividers(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return rows;

        const result = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!isDividerRow(row)) {
                result.push(row);
                continue;
            }

            // Check forward for any visible message before reaching another divider
            let hasMessageForward = false;
            for (let j = i + 1; j < rows.length; j++) {
                if (isDividerRow(rows[j])) break;
                if (isMessageRow(rows[j])) {
                    hasMessageForward = true;
                    break;
                }
            }

            // Check backward for any visible message before reaching another divider
            let hasMessageBackward = false;
            for (let j = i - 1; j >= 0; j--) {
                if (isDividerRow(rows[j])) break;
                if (isMessageRow(rows[j])) {
                    hasMessageBackward = true;
                    break;
                }
            }

            // Drop divider if it has zero visible messages in either direction
            if (!hasMessageForward && !hasMessageBackward) {
                continue;
            }

            // Drop consecutive duplicate divider
            if (result.length > 0 && isDividerRow(result[result.length - 1])) {
                continue;
            }

            result.push(row);
        }

        // Drop trailing/leading lone dividers with no messages in the list
        while (result.length > 0 && isDividerRow(result[0]) && !result.some(r => isMessageRow(r))) {
            result.shift();
        }
        while (result.length > 0 && isDividerRow(result[result.length - 1]) && !result.some(r => isMessageRow(r))) {
            result.pop();
        }

        return result;
    }

    // Chat row sanitizer: removes blocked groups, blocked messages, and eliminates orphaned date dividers
    function cleanChatRows(rows) {
        if (!Array.isArray(rows)) return rows;
        const temp = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || typeof row !== 'object' || row.type == null) continue;
            // Drop blocked group (type 2) or message from blocked user
            if (row.type === 2 || row.rowType === 2 || row.type === -1 || row.hidden === true) continue;
            if (row.message && (isBlockedOrIgnored(row.message.author?.id) || blockedMessageIdsSet.has(String(row.message.id)))) continue;
            if (row.item && (isBlockedOrIgnored(row.item.author?.id) || blockedMessageIdsSet.has(String(row.item.id)))) continue;

            // Sanitize reply on remaining visible messages
            if (row.message) sanitizeMessage(row.message);
            if (row.item) sanitizeMessage(row.item);
            if (row.reply) delete row.reply;
            temp.push(row);
        }

        return pruneOrphanedDateDividers(temp);
    }

    // Helper to safely clone and filter SectionList props with accurate header counts
    function getSafeSectionProps(props) {
        if (!props || typeof props !== 'object' || !Array.isArray(props.sections)) return props;

        const hasBlockedOrSettings = props.sections.some(sec =>
            isSettingsBlockedSection(sec?.title) ||
            isSettingsBlockedSection(sec?.header) ||
            (Array.isArray(sec?.data) && sec.data.some(it => isMemberBlockedOrIgnored(it))) ||
            (Array.isArray(sec?.rows) && sec.rows.some(it => isMemberBlockedOrIgnored(it))) ||
            (Array.isArray(sec?.items) && sec.items.some(it => isMemberBlockedOrIgnored(it)))
        );

        if (!hasBlockedOrSettings) return props;

        const cloned = { ...props };
        cloned.sections = props.sections
            .filter(sec => !isSettingsBlockedSection(sec?.title) && !isSettingsBlockedSection(sec?.header))
            .map(sec => {
                let updated = { ...sec };
                ['data', 'rows', 'items', 'members'].forEach(key => {
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

        if (typeof props.renderItem === 'function') {
            const origRenderItem = props.renderItem;
            cloned.renderItem = function(info) {
                if (info && (isMemberBlockedOrIgnored(info.item) || isMemberBlockedOrIgnored(info) || isSettingsBlockedSection(info.section))) {
                    return renderEmptyRow();
                }
                return origRenderItem.apply(this, arguments);
            };
        }
        if (typeof props.renderSectionHeader === 'function') {
            const origRenderHeader = props.renderSectionHeader;
            cloned.renderSectionHeader = function(info) {
                if (info && isSettingsBlockedSection(info.section)) {
                    return renderEmptyRow();
                }
                return origRenderHeader.apply(this, arguments);
            };
        }
        return cloned;
    }

    // Helper to safely clone and filter FlatList & FlashList props with recycling safety
    function getSafeListProps(props) {
        if (!props || typeof props !== 'object') return props;

        const isChatList = props.inverted || (Array.isArray(props.data) && props.data.some(it => it && (it.message || it.rowType === 'CHAT_MESSAGE')));
        if (isChatList) {
            const cloned = { ...props };
            if (Array.isArray(props.data)) {
                cloned.data = cleanChatRows(props.data);
            }
            return cloned;
        }

        if (Array.isArray(props.data)) {
            const hasBlocked = props.data.some(it => isMemberBlockedOrIgnored(it));
            if (!hasBlocked) return props;

            const rawData = props.data;
            const cleanedData = [];
            let currentHeaderIndex = -1;
            let currentHeaderBlockedCount = 0;

            for (let i = 0; i < rawData.length; i++) {
                const item = rawData[i];
                if (!item || typeof item !== 'object') {
                    cleanedData.push(item);
                    continue;
                }

                // Detect section header items in a flat array
                const isHeader = item.header === true ||
                                 item.isHeader === true ||
                                 item.type === 'HEADER' ||
                                 item.type === 'SECTION_HEADER' ||
                                 item.rowType === 'HEADER' ||
                                 item.rowType === 'SECTION_HEADER' ||
                                 (typeof item.title === 'string' && (item.title.includes('—') || item.title.includes('Online') || item.title.includes('Offline')) && !item.user && !item.member && !item.userId);

                if (isHeader) {
                    if (currentHeaderIndex !== -1 && currentHeaderBlockedCount > 0) {
                        cleanedData[currentHeaderIndex] = updateHeaderCount(cleanedData[currentHeaderIndex], currentHeaderBlockedCount);
                    }
                    currentHeaderIndex = cleanedData.length;
                    currentHeaderBlockedCount = 0;
                    cleanedData.push(item);
                    continue;
                }

                if (isMemberBlockedOrIgnored(item)) {
                    currentHeaderBlockedCount++;
                    continue; // Filter out blocked member completely
                }

                cleanedData.push(item);
            }

            if (currentHeaderIndex !== -1 && currentHeaderBlockedCount > 0) {
                cleanedData[currentHeaderIndex] = updateHeaderCount(cleanedData[currentHeaderIndex], currentHeaderBlockedCount);
            }

            const cloned = { ...props, data: cleanedData };
            if (typeof props.renderItem === 'function') {
                const origRenderItem = props.renderItem;
                cloned.renderItem = function(info) {
                    if (info && (isMemberBlockedOrIgnored(info.item) || isMemberBlockedOrIgnored(info))) {
                        return renderEmptyRow();
                    }
                    return origRenderItem.apply(this, arguments);
                };
            }
            return cloned;
        }

        return props;
    }

    // Helper to hook list components cleanly
    function patchListComponent(Comp, isSectionList) {
        if (!Comp) return;
        const propSanitizer = isSectionList ? getSafeSectionProps : getSafeListProps;
        if (typeof Comp.render === 'function') {
            safePatch('instead', Comp, 'render', function(args, orig) {
                const safeProps = propSanitizer(args[0]);
                return orig ? orig.apply(this, [safeProps, ...args.slice(1)]) : null;
            });
        }
        if (Comp.prototype && typeof Comp.prototype.render === 'function') {
            safePatch('instead', Comp.prototype, 'render', function(args, orig) {
                if (!this.props) return orig ? orig.apply(this, args) : null;
                const origProps = this.props;
                const safeProps = propSanitizer(origProps);
                if (safeProps === origProps) {
                    return orig ? orig.apply(this, args) : null;
                }
                this.props = safeProps;
                try {
                    return orig ? orig.apply(this, args) : null;
                } finally {
                    this.props = origProps;
                }
            });
        }
    }

    // Strict check if element props indicate a blocked user by ID
    function shouldAbsorbElement(props) {
        if (!props || typeof props !== 'object') return false;
        if (!props.userId && !props.user && !props.member && !props.author && !props.item && !props.message && !props.record) {
            return false;
        }
        const uid = props.userId ||
                    props.user?.id ||
                    props.member?.userId ||
                    props.member?.user?.id ||
                    props.member?.id ||
                    props.author?.id ||
                    props.message?.author?.id ||
                    props.item?.userId ||
                    props.item?.id ||
                    props.item?.user?.id ||
                    props.item?.member?.userId ||
                    props.record?.userId ||
                    props.record?.id ||
                    props.record?.user?.id;

        if (uid && isBlockedOrIgnored(uid)) return true;
        return false;
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
            if (updated) {
                persistBlockedSets();
                markRelationshipsReady();
            }
        } catch (_) {}
    }

    function startPlugin() {
        try {
            console.log('[MasterSuite Mobile v2.8.0] Starting Antigravity Master Suite...');

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
                MemberListStore = _metro.findByProps('getMemberListSections') ||
                                  _metro.findByProps('getRows', 'getGroups') ||
                                  _metro.findByProps('getGroups', 'getItem') ||
                                  (_metro.findByStoreName && (_metro.findByStoreName('GuildMemberListStore') || _metro.findByStoreName('ChannelMemberListStore')));
                MessageStore = _metro.findByProps('getMessages', 'getMessage');
                UserStore = _metro.findByProps('getUser', 'getUsers');
                UserProfileStore = _metro.findByProps('getUserProfile');
                TypingStore = _metro.findByProps('getTypingUsers');
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

            // Capture raw unpatched RelationshipStore references before patching
            if (RelationshipStore) {
                rawIsBlocked = RelationshipStore.isBlocked;
                rawIsIgnored = RelationshipStore.isIgnored;
                rawGetRelationships = RelationshipStore.getRelationships;
                rawGetBlockedUserIds = RelationshipStore.getBlockedUserIds;
                syncFromRelationshipStore();
            }

            // IMMEDIATE COLD-BOOT PURGE: sanitize any cached messages loaded before WebSocket connection
            try {
                if (MessageStore) {
                    const cache = MessageStore._channelMessages || MessageStore._messages;
                    if (cache && typeof cache === 'object') {
                        for (const chId in cache) {
                            sanitizeChannelCache(chId);
                        }
                    }
                }
            } catch (_) {}

            console.log(`[MasterSuite v2.8.0] Active: Tracking ${blockedUserIdsSet.size} blocked, ${ignoredUserIdsSet.size} ignored users.`);

            // --- 1. FluxDispatcher ---
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                safePatch('instead', _FluxDispatcher, 'dispatch', function(args, orig) {
                    const event = args[0];
                    if (event && typeof event === 'object') {
                        try {
                            // 1. Sync relationship events dynamically in real time
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
                                    markRelationshipsReady();
                                }
                            }

                            // 2. Initial sync from CONNECTION_OPEN
                            if (event.type === 'CONNECTION_OPEN') {
                                if (Array.isArray(event.relationships)) {
                                    const currentBlocked = new Set();
                                    const currentIgnored = new Set();
                                    for (const r of event.relationships) {
                                        const rid = String(r.id);
                                        if (r.type === 2) currentBlocked.add(rid);
                                        if (r.type === 5) currentIgnored.add(rid);
                                    }
                                    blockedUserIdsSet.clear();
                                    ignoredUserIdsSet.clear();
                                    for (const id of currentBlocked) blockedUserIdsSet.add(id);
                                    for (const id of currentIgnored) ignoredUserIdsSet.add(id);
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
                                    event.channelId = "0";
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

                            // 8. Safe Gateway Member Filtering (GUILD_MEMBERS_CHUNK)
                            if (event.type === 'GUILD_MEMBERS_CHUNK') {
                                let modified = false;
                                let cleanMembers = event.members;
                                let cleanPresences = event.presences;
                                if (Array.isArray(event.members)) {
                                    cleanMembers = event.members.filter(m => !isMemberBlockedOrIgnored(m));
                                    if (cleanMembers.length !== event.members.length) modified = true;
                                }
                                if (Array.isArray(event.presences)) {
                                    cleanPresences = event.presences.filter(p => !isBlockedOrIgnored(p?.user?.id));
                                    if (cleanPresences.length !== event.presences.length) modified = true;
                                }
                                if (modified) {
                                    args[0] = {
                                        ...event,
                                        members: cleanMembers,
                                        presences: cleanPresences
                                    };
                                }
                            }
                        } catch (_) {}
                    }
                    return orig ? orig.apply(this, args) : null;
                });
            }

            // --- 2. Store Layer Patches ---

            // A. MemberListStore (Complete elimination from member lists & cards, zero black space, exact header counts)
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

            // B. GuildMemberStore
            if (GuildMemberStore) {
                if (typeof GuildMemberStore.getMember === 'function') {
                    safePatch('instead', GuildMemberStore, 'getMember', function(args, orig) {
                        const uid = args[1];
                        if (uid && isBlockedOrIgnored(uid)) return undefined;
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
                        if (uid && isBlockedOrIgnored(uid)) return false;
                        return orig ? orig.apply(this, args) : false;
                    });
                }
                if (typeof GuildMemberStore.getNick === 'function') {
                    safePatch('instead', GuildMemberStore, 'getNick', function(args, orig) {
                        const uid = args[1];
                        if (uid && isBlockedOrIgnored(uid)) return undefined;
                        return orig ? orig.apply(this, args) : undefined;
                    });
                }
            }

            // C. MessageStore
            if (MessageStore && typeof MessageStore.getMessage === 'function') {
                safePatch('after', MessageStore, 'getMessage', function(args, res) {
                    if (res) sanitizeMessage(res);
                    return res;
                });
            }

            // D. RowManager (Chat Rows & Zero Orphaned Date Dividers)
            if (RowManager && RowManager.prototype) {
                safePatch('before', RowManager.prototype, 'generate', function(args) {
                    const data = args[0];
                    if (!data) return;

                    // Neutralize blocked message completely: eliminate content, timestamps, and dates
                    if (data.message) {
                        if (isBlockedOrIgnored(data.message.author?.id) || blockedMessageIdsSet.has(String(data.message.id))) {
                            data.type = -1;
                            data.rowType = -1;
                            data.hidden = true;
                            data.renderContentOnly = true;
                            data.message.content = '';
                            data.message.reactions = [];
                            data.message.canShowComponents = false;
                            delete data.timestamp;
                            delete data.timestampFormatted;
                            delete data.date;
                            delete data.time;
                        }
                        sanitizeMessage(data.message);
                    }

                    // Neutralize blocked group row (type 2)
                    if (data.rowType === 2 || data.type === 2) {
                        data.type = -1;
                        data.rowType = -1;
                        data.hidden = true;
                        data.renderContentOnly = true;
                        data.roleStyle = '';
                        data.text = '';
                        data.revealed = false;
                        data.content = [];
                        data.count = 0;
                    }

                    // Strip reply quote referencing blocked user
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
                        if (isBlockedOrIgnored(res.message.author?.id) || blockedMessageIdsSet.has(String(res.message.id))) {
                            res.type = -1;
                            res.rowType = -1;
                            res.hidden = true;
                            res.renderContentOnly = true;
                            res.text = '';
                            res.content = [];
                            delete res.timestamp;
                            delete res.timestampFormatted;
                            delete res.date;
                            delete res.time;
                            return res;
                        }
                        sanitizeMessage(res.message);
                    }
                    if (res.reply) {
                        const ref = res.reply.message || res.referencedMessage || res.referenced_message;
                        if (ref && (isBlockedOrIgnored(ref.author?.id) || blockedMessageIdsSet.has(String(ref.id)))) {
                            delete res.reply;
                        }
                    }
                    if (res.rowType === 2 || res.type === 2) {
                        res.type = -1;
                        res.rowType = -1;
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

            // E. Defensive Guards for updateRows and createRow
            try {
                const modules = _metro.modules || (typeof vendetta !== 'undefined' && vendetta.metro?.modules) || {};
                for (const id in modules) {
                    const mod = modules[id]?.exports;
                    if (!mod || typeof mod !== 'object') continue;

                    if (typeof mod.updateRows === 'function') {
                        safePatch('before', mod, 'updateRows', function(args) {
                            for (let i = 0; i < args.length; i++) {
                                if (Array.isArray(args[i])) {
                                    args[i] = cleanChatRows(args[i]);
                                }
                            }
                        });
                    }

                    if (typeof mod.createRow === 'function') {
                        safePatch('instead', mod, 'createRow', function(args, orig) {
                            const row = args[0];
                            if (!row || typeof row !== 'object' || row.type == null || row.type === -1 || row.hidden === true) {
                                return null;
                            }
                            return orig ? orig.apply(this, args) : null;
                        });
                    }
                }
            } catch (_) {}

            try {
                const ChatModule = _metro.findByProps('updateRows');
                if (ChatModule && typeof ChatModule.updateRows === 'function') {
                    safePatch('before', ChatModule, 'updateRows', function(args) {
                        for (let i = 0; i < args.length; i++) {
                            if (Array.isArray(args[i])) {
                                args[i] = cleanChatRows(args[i]);
                            }
                        }
                    });
                }
            } catch (_) {}

            // F. TypingStore
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

            // G. RelationshipStore
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

            // H. UserStore
            if (UserStore && typeof UserStore.getUser === 'function') {
                safePatch('after', UserStore, 'getUser', function(args, res) {
                    if (res && isBlockedOrIgnored(res.id)) {
                        res.isBlocked = false;
                        res.isIgnored = false;
                    }
                    return res;
                });
            }

            // --- 3. React List Component Patches ---
            const ListComponents = _metro.findByProps('FlatList', 'SectionList') ||
                                   _metro.findByProps('FlatList') ||
                                   {};
            const FlatList = ListComponents.FlatList ||
                             (_metro.findByName && _metro.findByName('FlatList')) ||
                             (typeof uiComponents !== 'undefined' && uiComponents.FlatList);
            const SectionList = ListComponents.SectionList ||
                                (_metro.findByName && _metro.findByName('SectionList')) ||
                                (typeof uiComponents !== 'undefined' && uiComponents.SectionList);
            const FlashList = ListComponents.FlashList ||
                              (_metro.findByProps && _metro.findByProps('FlashList')?.FlashList) ||
                              (_metro.findByName && _metro.findByName('FlashList')) ||
                              (typeof uiComponents !== 'undefined' && uiComponents.FlashList);
            const VirtualizedList = ListComponents.VirtualizedList ||
                                    (_metro.findByProps && _metro.findByProps('VirtualizedList')?.VirtualizedList) ||
                                    (_metro.findByName && _metro.findByName('VirtualizedList')) ||
                                    (typeof uiComponents !== 'undefined' && uiComponents.VirtualizedList);

            patchListComponent(FlatList, false);
            patchListComponent(SectionList, true);
            patchListComponent(FlashList, false);
            patchListComponent(VirtualizedList, false);

            // --- 4. Direct Member Row Component Hooks ---
            try {
                const memberRowNames = ['MemberListItem', 'GuildMemberRow', 'ChannelMemberRow', 'MemberRow', 'GuildMemberListItem', 'ChannelMembers'];
                for (const name of memberRowNames) {
                    const holder = _metro.findByProps && _metro.findByProps(name);
                    if (holder && typeof holder[name] === 'function') {
                        safePatch('instead', holder, name, function(args, orig) {
                            const props = args[0];
                            if (isMemberBlockedOrIgnored(props)) return renderEmptyRow();
                            return orig ? orig.apply(this, args) : null;
                        });
                    }

                    const found = (_metro.findByName && _metro.findByName(name)) || (holder && holder[name]);
                    if (found) {
                        if (typeof found.render === 'function') {
                            safePatch('instead', found, 'render', function(args, orig) {
                                const props = args[0] || (this && this.props);
                                if (isMemberBlockedOrIgnored(props)) return renderEmptyRow();
                                return orig ? orig.apply(this, args) : null;
                            });
                        }
                        if (found.prototype && typeof found.prototype.render === 'function') {
                            safePatch('instead', found.prototype, 'render', function(args, orig) {
                                const props = this.props || args[0];
                                if (isMemberBlockedOrIgnored(props)) return renderEmptyRow();
                                return orig ? orig.apply(this, args) : null;
                            });
                        }
                    }
                }
            } catch (_) {}

            // --- 5. Universal React.createElement & JSX Runtime Interceptor ---
            // Filters member arrays directly in props, preventing black spaces and updating header counts!
            function sanitizeElementProps(props) {
                if (!props || typeof props !== 'object') return props;
                let modified = false;
                let newProps = props;

                // 1. Sanitize sections array
                if (Array.isArray(newProps.sections)) {
                    const safe = getSafeSectionProps(newProps);
                    if (safe !== newProps) {
                        newProps = safe;
                        modified = true;
                    }
                }

                // 2. Sanitize members array in card/list components
                if (Array.isArray(newProps.members)) {
                    const origLen = newProps.members.length;
                    const filtered = newProps.members.filter(m => !isMemberBlockedOrIgnored(m));
                    const diff = origLen - filtered.length;
                    if (diff > 0) {
                        newProps = { ...newProps, members: filtered };
                        newProps = updateHeaderCount(newProps, diff);
                        modified = true;
                    }
                }

                // 3. Sanitize rows array in member list components
                if (Array.isArray(newProps.rows) && newProps.rows.some(r => r && (r.userId || r.user || r.member))) {
                    const origLen = newProps.rows.length;
                    const filtered = newProps.rows.filter(m => !isMemberBlockedOrIgnored(m));
                    const diff = origLen - filtered.length;
                    if (diff > 0) {
                        newProps = { ...newProps, rows: filtered };
                        newProps = updateHeaderCount(newProps, diff);
                        modified = true;
                    }
                }

                // 4. Sanitize items array in member list components
                if (Array.isArray(newProps.items) && newProps.items.some(r => r && (r.userId || r.user || r.member))) {
                    const origLen = newProps.items.length;
                    const filtered = newProps.items.filter(m => !isMemberBlockedOrIgnored(m));
                    const diff = origLen - filtered.length;
                    if (diff > 0) {
                        newProps = { ...newProps, items: filtered };
                        newProps = updateHeaderCount(newProps, diff);
                        modified = true;
                    }
                }

                // 5. Sanitize data array in lists
                if (Array.isArray(newProps.data)) {
                    const safe = getSafeListProps(newProps);
                    if (safe !== newProps) {
                        newProps = safe;
                        modified = true;
                    }
                }

                return newProps;
            }

            try {
                if (React && typeof React.createElement === 'function') {
                    const origCreateElement = React.createElement;
                    safePatch('instead', React, 'createElement', function(args, orig) {
                        let props = args[1];
                        if (props && typeof props === 'object') {
                            if (shouldAbsorbElement(props)) {
                                return orig.call(React, View, {
                                    style: { height: 0, width: 0, opacity: 0, overflow: 'hidden' },
                                    pointerEvents: 'none'
                                });
                            }
                            props = sanitizeElementProps(props);
                            args[1] = props;
                        }
                        return orig.apply(React, args);
                    });
                }

                const JsxRuntime = (_metro.findByProps && (_metro.findByProps('jsx', 'jsxs') || _metro.findByProps('jsx')));
                if (JsxRuntime) {
                    ['jsx', 'jsxs'].forEach(fnKey => {
                        if (typeof JsxRuntime[fnKey] === 'function') {
                            safePatch('instead', JsxRuntime, fnKey, function(args, orig) {
                                let props = args[1];
                                if (props && typeof props === 'object') {
                                    if (shouldAbsorbElement(props)) {
                                        return orig.call(this, View, {
                                            style: { height: 0, width: 0, opacity: 0, overflow: 'hidden' },
                                            pointerEvents: 'none'
                                        });
                                    }
                                    props = sanitizeElementProps(props);
                                    args[1] = props;
                                }
                                return orig ? orig.apply(this, args) : null;
                            });
                        }
                    });
                }
            } catch (_) {}

            notifyActive();
            console.log('[MasterSuite Mobile v2.8.0] Antigravity Master Suite loaded and active!');
        } catch (e) {
            console.error('[MasterSuite Mobile v2.8.0 Error]', e);
        }
    }

    function stopPlugin() {
        try {
            console.log('[MasterSuite Mobile v2.8.0] Stopping Antigravity Master Suite...');
            while (unpatches.length > 0) {
                const unpatch = unpatches.pop();
                try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
            }
            console.log('[MasterSuite Mobile v2.8.0] Antigravity Master Suite stopped successfully.');
        } catch (e) {
            console.error('[MasterSuite Mobile v2.8.0 Error stopping]', e);
        }
    }

    exports.default = {
        name: 'Antigravity Master Suite',
        description: 'All-in-One: Complete zero-gap member elimination (no black spaces, exact header count), orphaned date divider removal, and dynamic relationship tracking.',
        authors: [{ name: 'Antigravity', id: '698947564459917343' }],
        version: '2.8.0',
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
    typeof vendetta !== 'undefined' ? vendetta : (typeof revenge !== 'undefined' ? revenge.undefined : undefined),
    typeof plugin !== 'undefined' ? plugin : (typeof vendetta !== 'undefined' ? vendetta.plugin : (typeof revenge !== 'undefined' ? revenge.plugin : undefined)),
    typeof storage !== 'undefined' ? storage : (typeof vendetta !== 'undefined' ? vendetta.storage : (typeof revenge !== 'undefined' ? revenge.storage : undefined)),
    typeof uiComponents !== 'undefined' ? uiComponents : (typeof vendetta !== 'undefined' ? vendetta.ui?.components : (typeof revenge !== 'undefined' ? revenge.ui?.components : undefined))
)