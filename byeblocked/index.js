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
                    content: 'Antigravity Master Suite: ACTIVE'
                });
                return;
            }
        } catch (_) {}
        try {
            const showToast = _vendetta.ui?.toasts?.showToast || _common.toasts?.open;
            if (typeof showToast === 'function') {
                showToast('Antigravity Master Suite: ACTIVE');
                return;
            }
        } catch (_) {}
    }

    // --- State ---
    let recentChannels = [];
    const MAX_CHANNELS = 4;
    const recoveryDebounce = {};

    function startPlugin(api) {
        try {
            console.log('[MasterSuite Mobile] Starting Antigravity Master Suite...');

            // Stores
            let RelationshipStore = null;
            let MessageStore = null;
            let TypingStore = null;
            let RowManager = null;
            let relationshipProps = null;

            if (_metro.findByStoreName) {
                RelationshipStore = _metro.findByStoreName('RelationshipStore');
                MessageStore = _metro.findByStoreName('MessageStore');
                TypingStore = _metro.findByStoreName('TypingStore');
            }
            if (!RelationshipStore && _revenge.discord?.stores?.RelationshipStore) {
                RelationshipStore = _revenge.discord.stores.RelationshipStore;
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
                if (!RelationshipStore) RelationshipStore = _metro.findByProps('isBlocked');
                if (!RowManager) RowManager = _metro.findByProps('RowManager')?.RowManager;
            }

            const isBlockedOrIgnored = (userId) => {
                if (!userId) return false;
                try {
                    if (RelationshipStore) {
                        if (typeof RelationshipStore.isBlocked === 'function' && RelationshipStore.isBlocked(userId)) return true;
                        if (typeof RelationshipStore.isIgnored === 'function' && RelationshipStore.isIgnored(userId)) return true;
                    }
                    if (relationshipProps) {
                        if (typeof relationshipProps.isBlocked === 'function' && relationshipProps.isBlocked(userId)) return true;
                        if (typeof relationshipProps.isIgnored === 'function' && relationshipProps.isIgnored(userId)) return true;
                    }
                } catch (_) {}
                return false;
            };

            // ========================================================
            // 1. 100% BYEBLOCKED
            // ========================================================

            // A. Flux Dispatcher Interceptor
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                safePatch('before', _FluxDispatcher, 'dispatch', ([event]) => {
                    if (!event) return;
                    // Filter loaded messages
                    if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                        event.messages = event.messages.filter(msg => msg && !isBlockedOrIgnored(msg.author?.id));
                    }
                    // Drop live messages and system join messages from blocked users
                    if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                        if (isBlockedOrIgnored(event.message.author?.id)) {
                            event.channelId = '0';
                        }
                    }
                    // Drop typing indicators
                    if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                        event.channelId = '0';
                    }
                });
            }

            // B. RowManager: Completely neutralize 'X blocked message(s)' collapsed bar
            if (RowManager && RowManager.prototype) {
                safePatch('before', RowManager.prototype, 'generate', ([data]) => {
                    if (!data) return;
                    // rowType 2 is the 'X blocked messages' row!
                    if (data.rowType === 2 || data.type === 2) {
                        data.renderContentOnly = true;
                        data.roleStyle = '';
                        data.text = '';
                        data.revealed = false;
                        data.content = [];
                        data.count = 0;
                    }
                    // Filter system messages or regular messages from blocked author
                    if (data.message && isBlockedOrIgnored(data.message.author?.id)) {
                        data.renderContentOnly = true;
                        data.message.content = '';
                        data.message.reactions = [];
                        data.message.canShowComponents = false;
                    }
                });
            }

            // C. Purge existing cached messages in MessageStore
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

            // D. Suppress TypingStore
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

            // E. Hide 'Blocked accounts' & 'Ignored accounts' from RelationshipStore
            if (RelationshipStore) {
                if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                    safePatch('instead', RelationshipStore, 'getBlockedUserIds', () => []);
                }
                if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                    safePatch('instead', RelationshipStore, 'getIgnoredUserIds', () => []);
                }
            }

            // F. Native Settings UI: Hide Blocked & Ignored rows / sections
            const patchSettingsComponent = (comp) => {
                if (comp && typeof comp === 'function') {
                    safePatch('instead', comp, 'render', (args, orig) => {
                        const p = args[0] || {};
                        const lbl = String(p.label || p.title || p.header || '');
                        if (/blocked|ignored/i.test(lbl)) return null;
                        return orig(...args);
                    });
                }
            };

            const Design = _revenge.discord?.design?.Design || 
                           (_metro.findByProps && _metro.findByProps('TableRowGroup', 'TableRow'));
            if (Design) {
                for (const k of ['TableRow', 'FormRow', 'TableRowGroup', 'FormSection']) {
                    patchSettingsComponent(Design[k]);
                }
            }
            if (_metro.findByPropsAll) {
                try {
                    const mods = _metro.findByPropsAll('TableRow', 'FormRow', 'FormSection', 'TableRowGroup');
                    for (const mod of mods) {
                        for (const k of ['TableRow', 'FormRow', 'FormSection', 'TableRowGroup']) {
                            if (typeof mod[k] === 'function') {
                                safePatch('instead', mod, k, (args, orig) => {
                                    const p = args[0] || {};
                                    const lbl = String(p.label || p.title || p.header || '');
                                    if (/blocked|ignored/i.test(lbl)) return null;
                                    return orig(...args);
                                });
                            }
                        }
                    }
                } catch (_) {}
            }

            // ========================================================
            // 2. MEMORY ENGINE (HERMES LRU CACHE & VIRTUALIZATION)
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

            // FlatList Virtualization
            const FlatList = _common.ReactNative?.FlatList || (_metro.findByProps && _metro.findByProps('FlatList')?.FlatList);
            if (FlatList && FlatList.render) {
                safePatch('before', FlatList, 'render', (args) => {
                    const props = args[0];
                    if (props && typeof props === 'object') {
                        props.removeClippedSubviews = true;
                        if (props.maxToRenderPerBatch === undefined || props.maxToRenderPerBatch > 10) {
                            props.maxToRenderPerBatch = 8;
                        }
                    }
                });
            }

            // ========================================================
            // 3. MESSAGE RELIABILITY (AUTO-RECOVERY)
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
                            console.log('[MessageReliability] Auto-recovering channel:', chId);
                            try { MessageActions.fetchMessages({ channelId: chId, limit: 50 }); } catch (_) {}
                        }, 1200);
                    }
                });
            }

            notifyActive();
            console.log('[MasterSuite Mobile] Antigravity Master Suite loaded and active!');
        } catch (err) {
            console.error('[MasterSuite Mobile] Error during startup:', err);
        }
    }

    function stopPlugin() {
        for (const t of Object.values(recoveryDebounce)) clearTimeout(t);
        for (const unpatch of unpatches) {
            try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[MasterSuite Mobile] Unloaded cleanly.');
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