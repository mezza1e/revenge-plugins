/**
 * @name HideBlockedInSettings
 * @description Hides Blocked and Ignored Users sections and guide notes from Content & Social, all Settings tabs, and Friends navigation tablist.
 * @version 1.4.0
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
                    content: 'HideBlockedInSettings v1.4.0: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('HideBlockedInSettings v1.4.0: ACTIVE');
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

    function isSettingsBlockedString(str) {
        if (typeof str !== 'string') return false;
        const s = normalizeSettingsText(str);
        if (!s) return false;

        return s.includes("accounts you've blocked or ignored") ||
               s.includes("accounts you've blocked") ||
               s.includes("blocked or ignored") ||
               s.includes("blocked accounts") ||
               s.includes("ignored accounts") ||
               s.includes("blocked users") ||
               s.includes("ignored users") ||
               s.includes("you're in control") ||
               s.includes("reducing unwanted interactions") ||
               s.includes("explore our feature guide") ||
               s.includes("feature guide") ||
               s === "blocked" ||
               s === "ignored";
    }

    function isSettingsBlockedSection(val, depth = 0) {
        if (!val || depth > 6) return false;

        // 1. Plain string
        if (typeof val === 'string') {
            return isSettingsBlockedString(val);
        }

        // 2. Array of items / children
        if (Array.isArray(val)) {
            const combined = val
                .filter(c => typeof c === 'string')
                .join(' ');
            if (combined && isSettingsBlockedString(combined)) return true;

            for (let i = 0; i < val.length; i++) {
                if (isSettingsBlockedSection(val[i], depth + 1)) return true;
            }
            return false;
        }

        // 3. Object / React Element / Props
        if (typeof val === 'object') {
            const checkKeys = [
                'label', 'title', 'header', 'subLabel', 'text', 'description',
                'accessibilityLabel', 'aria-label', 'footer', 'helpText',
                'trailingText', 'leadingText', 'detail', 'value', 'subTitle',
                'hint', 'note', 'body', 'content', 'sectionTitle', 'titleText',
                'name', 'children'
            ];

            for (const k of checkKeys) {
                if (val[k] != null && isSettingsBlockedSection(val[k], depth + 1)) {
                    return true;
                }
            }

            if (val.props && typeof val.props === 'object') {
                if (isSettingsBlockedSection(val.props, depth + 1)) return true;
            }
        }

        return false;
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

    function applyHideBlockedInSettings() {
        // A. RelationshipStore: Neutralize Settings queries
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
        }

        // B. Multi-Component Interception across all Metro Form & Table modules
        try {
            const formKeys = [
                'TableSection',
                'TableRow',
                'TableRowGroup',
                'TableSwitchRow',
                'TableActionRow',
                'TableRadioRow',
                'TableCheckboxRow',
                'FormSection',
                'FormSectionTitle',
                'FormRow',
                'FormHelpText',
                'FormNotice',
                'FormText',
                'FormDivider',
                'SettingsSection',
                'SettingsRow',
                'SettingsRowGroup',
                'SettingsListSection',
                'SettingsNotice',
                'SettingsHelpText'
            ];

            const settingsTargetMods = new Set();
            if (_vendetta.ui?.components?.Forms) settingsTargetMods.add(_vendetta.ui.components.Forms);
            if (_vendetta.ui?.components) settingsTargetMods.add(_vendetta.ui.components);

            // 1. Find all modules via findAll
            if (typeof _metro.findAll === 'function') {
                try {
                    const all = _metro.findAll(m => {
                        if (!m || typeof m !== 'object') return false;
                        for (const p of formKeys) {
                            if (typeof m[p] === 'function' || (m.default && typeof m.default[p] === 'function')) {
                                return true;
                            }
                        }
                        return false;
                    });
                    if (Array.isArray(all)) {
                        for (const mod of all) settingsTargetMods.add(mod);
                    }
                } catch (_) {}
            }

            // 2. Find via findByProps, findByName, and findByDisplayName
            for (const p of formKeys) {
                if (_metro.findByProps) {
                    try {
                        const m = _metro.findByProps(p);
                        if (m && typeof m === 'object') settingsTargetMods.add(m);
                    } catch (_) {}
                }
                if (typeof _metro.findByName === 'function') {
                    try {
                        const c = _metro.findByName(p);
                        if (typeof c === 'function') settingsTargetMods.add({ [p]: c });
                    } catch (_) {}
                }
                if (typeof _metro.findByDisplayName === 'function') {
                    try {
                        const c = _metro.findByDisplayName(p);
                        if (typeof c === 'function') settingsTargetMods.add({ [p]: c });
                    } catch (_) {}
                }
            }

            // 3. Patch every found component
            for (const mod of settingsTargetMods) {
                for (const k of formKeys) {
                    if (typeof mod[k] === 'function') {
                        safePatch('instead', mod, k, function(args, orig) {
                            const p = args[0] || {};
                            if (isSettingsBlockedSection(p)) return renderEmptyRow();
                            if (Array.isArray(p.children)) {
                                p.children = p.children.filter(c => !isSettingsBlockedSection(c));
                            }
                            const res = orig ? orig.apply(this, args) : null;
                            if (res && res.props) {
                                if (isSettingsBlockedSection(res.props)) return renderEmptyRow();
                                if (Array.isArray(res.props.children)) {
                                    res.props.children = res.props.children.filter(c => !isSettingsBlockedSection(c));
                                }
                            }
                            return res;
                        });
                    }
                    if (mod.default && typeof mod.default === 'object' && typeof mod.default[k] === 'function') {
                        safePatch('instead', mod.default, k, function(args, orig) {
                            const p = args[0] || {};
                            if (isSettingsBlockedSection(p)) return renderEmptyRow();
                            if (Array.isArray(p.children)) {
                                p.children = p.children.filter(c => !isSettingsBlockedSection(c));
                            }
                            const res = orig ? orig.apply(this, args) : null;
                            if (res && res.props) {
                                if (isSettingsBlockedSection(res.props)) return renderEmptyRow();
                                if (Array.isArray(res.props.children)) {
                                    res.props.children = res.props.children.filter(c => !isSettingsBlockedSection(c));
                                }
                            }
                            return res;
                        });
                    }
                }
            }
        } catch (_) {}

        // C. Filter Section Data Builders & Layout Hooks
        try {
            const sectionBuilderKeys = [
                'getSettingsSections',
                'useSettingsSections',
                'getContentAndSocialSettings',
                'useContentAndSocialSettings',
                'getContentAndSocialSections',
                'useContentAndSocialSections',
                'getPrivacySettingsSections',
                'usePrivacySettingsSections',
                'getAccountSettingsSections',
                'useAccountSettingsSections',
                'getSettingListSections',
                'useSettingListSections'
            ];

            for (const fnName of sectionBuilderKeys) {
                if (_metro.findByProps) {
                    try {
                        const mod = _metro.findByProps(fnName);
                        if (mod && typeof mod[fnName] === 'function') {
                            safePatch('after', mod, fnName, function(args, res) {
                                if (Array.isArray(res)) {
                                    return res.filter(s => !isSettingsBlockedSection(s)).map(s => {
                                        if (!s || typeof s !== 'object') return s;
                                        const cloned = { ...s };
                                        for (const key of ['items', 'rows', 'data', 'children', 'sections']) {
                                            if (Array.isArray(cloned[key])) {
                                                cloned[key] = cloned[key].filter(it => !isSettingsBlockedSection(it));
                                            }
                                        }
                                        return cloned;
                                    });
                                }
                                return res;
                            });
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}

        // D. Friends Navigation Tablist Filter
        try {
            const friendsNavMod = _metro.findByProps && _metro.findByProps('FriendsTabs', 'getFriendsTabs');
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

    function startPlugin() {
        try {
            console.log('[HideBlockedInSettings v1.4.0] Initializing...');

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
                ChannelMemberStore = _metro.findByProps('getProps', 'getRows') ||
                                     (_metro.findByStoreName && (_metro.findByStoreName('ChannelMemberStore') || _metro.findByStoreName('ChannelMembersStore')));
                MemberListStore = _metro.findByProps('getMemberListSections') ||
                                  _metro.findByProps('getRows', 'getGroups') ||
                                  (_metro.findByStoreName && (_metro.findByStoreName('GuildMemberListStore') || _metro.findByStoreName('ChannelMemberListStore')));
                MessageStore = _metro.findByProps('getMessages', 'getMessage');
                UserStore = _metro.findByProps('getUser', 'getUsers');
                TypingStore = _metro.findByProps('getTypingUsers');
                PresenceStore = _metro.findByProps('getState', 'getStatus') || _metro.findByProps('getStatus');
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
                rawIsBlocked = RelationshipStore.isBlocked;
                rawIsIgnored = RelationshipStore.isIgnored;
                rawGetRelationships = RelationshipStore.getRelationships;
                rawGetBlockedUserIds = RelationshipStore.getBlockedUserIds;
                syncFromRelationshipStore();
            }
            if (PresenceStore) {
                rawGetPresenceStatus = PresenceStore.getStatus;
            }

            applyHideBlockedInSettings();

            notifyActive();
            console.log('[HideBlockedInSettings v1.4.0] Loaded and active successfully.');
        } catch (e) {
            console.error('[HideBlockedInSettings v1.4.0 Error]', e);
        }
    }

    function stopPlugin() {
        try {
            console.log('[HideBlockedInSettings v1.4.0] Stopping...');
            while (unpatches.length > 0) {
                const unpatch = unpatches.pop();
                try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
            }
            console.log('[HideBlockedInSettings v1.4.0] Stopped cleanly.');
        } catch (e) {
            console.error('[HideBlockedInSettings v1.4.0 Error stopping]', e);
        }
    }

    const pluginExport = {
        name: 'HideBlockedInSettings',
        description: 'Hides Blocked and Ignored Users sections and guide notes from Content & Social, all Settings tabs, and Friends navigation tablist.',
        authors: [{ name: 'Antigravity', id: '698947564459917343' }],
        version: '1.4.0',
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
