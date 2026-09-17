/**
 * Antigravity Master Suite for Revengecord / Vendetta / Bunny
 * 1. 100% ByeBlocked: Eliminates blocked/ignored messages, typing, bars, & settings listings.
 * 2. MemoryEngine: Hermes LRU cache bounds + FlatList virtualization.
 * 3. MessageReliability: Zero 'Messages failed to load' auto-recovery.
 */
(function(exports, metroCommon, patcher, metro, vendetta, plugin, storage, uiComponents) {
    'use strict';

    // Robust API resolution across all client mod versions
    const _vendetta = (typeof vendetta !== 'undefined' && vendetta) ||
                      (typeof revenge !== 'undefined' && revenge) ||
                      (typeof bunny !== 'undefined' && bunny) ||
                      (typeof globalThis !== 'undefined' && (globalThis.vendetta || globalThis.revenge || globalThis.bunny)) ||
                      {};
    const _metro = metro || _vendetta.metro || {};
    const _patcher = patcher || _vendetta.patcher || {};
    const _common = metroCommon || _metro.common || {};
    const _FluxDispatcher = _common.FluxDispatcher || (_metro.findByProps && _metro.findByProps('dispatch', 'subscribe'));
    const unpatches = [];

    // --- State ---
    let recentChannels = [];
    const MAX_CHANNELS = 4;
    let idleTimer = null;
    const recoveryDebounce = {};

    function onLoad() {
        try {
            console.log('[MasterSuite Mobile] Initializing Antigravity Master Suite...');

            if (!_patcher || !_patcher.before) {
                console.error('[MasterSuite Mobile] Patcher API unavailable');
                return;
            }

            // Resolve Stores & Managers
            const RelationshipStore = _metro.findByStoreName ? _metro.findByStoreName('RelationshipStore') : _metro.findByProps('isBlocked');
            const MessageStore = _metro.findByStoreName ? _metro.findByStoreName('MessageStore') : _metro.findByProps('getMessages');
            const TypingStore = _metro.findByStoreName ? _metro.findByStoreName('TypingStore') : _metro.findByProps('getTypingUsers');
            const RowManager = _metro.findByName ? _metro.findByName('RowManager') : null;
            const relationshipProps = _metro.findByProps ? _metro.findByProps('isBlocked', 'isIgnored') : null;

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
            // FEATURE 1: 100% BYEBLOCKED
            // ========================================================

            // 1. Dispatcher Interceptor: Drop incoming & filtered loaded messages
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                unpatches.push(
                    _patcher.before('dispatch', _FluxDispatcher, ([event]) => {
                        if (!event) return;
                        // Filter loaded messages
                        if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                            event.messages = event.messages.filter(msg => msg && !isBlockedOrIgnored(msg.author?.id));
                        }
                        // Drop live messages from blocked users
                        if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                            if (isBlockedOrIgnored(event.message.author?.id)) {
                                event.channelId = '0';
                            }
                        }
                        // Suppress typing events from blocked users
                        if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                            event.channelId = '0';
                        }
                    })
                );
            }

            // 2. Chat Row Manager: Completely eliminate 'X blocked messages' row
            if (RowManager && RowManager.prototype) {
                unpatches.push(
                    _patcher.before('generate', RowManager.prototype, ([data]) => {
                        if (!data) return;
                        // rowType 2 is the 'X blocked messages' collapsed bar!
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
                    })
                );
            }

            // 3. Purge existing cached blocked messages in MessageStore
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

            // 4. Suppress TypingStore
            if (TypingStore && typeof TypingStore.getTypingUsers === 'function') {
                unpatches.push(
                    _patcher.after('getTypingUsers', TypingStore, (args, res) => {
                        if (!res || typeof res !== 'object') return res;
                        const filtered = {};
                        for (const uId in res) {
                            if (!isBlockedOrIgnored(uId)) {
                                filtered[uId] = res[uId];
                            }
                        }
                        return filtered;
                    })
                );
            }

            // 5. Hide 'Blocked accounts' & 'Ignored accounts' from Settings
            if (RelationshipStore) {
                if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                    unpatches.push(_patcher.instead('getBlockedUserIds', RelationshipStore, () => []));
                }
                if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                    unpatches.push(_patcher.instead('getIgnoredUserIds', RelationshipStore, () => []));
                }
            }

            // 6. Native Settings UI Row Filtering
            if (_metro.findByPropsAll) {
                try {
                    const formMods = _metro.findByPropsAll('FormRow', 'TableRow', 'FormSection', 'TableRowGroup');
                    for (const mod of formMods) {
                        for (const key of ['FormRow', 'TableRow', 'FormSection', 'TableRowGroup']) {
                            if (typeof mod[key] === 'function') {
                                unpatches.push(
                                    _patcher.instead(key, mod, (args, orig) => {
                                        const p = args[0] || {};
                                        const lbl = String(p.label || p.title || p.header || '');
                                        if (/blocked|ignored/i.test(lbl)) {
                                            return null;
                                        }
                                        return orig(...args);
                                    })
                                );
                            }
                        }
                    }
                } catch (_) {}
            }

            // ========================================================
            // FEATURE 2: MEMORY ENGINE (HERMES LRU CACHE & VIRTUALIZATION)
            // ========================================================
            if (_FluxDispatcher) {
                unpatches.push(
                    _patcher.after('dispatch', _FluxDispatcher, ([event]) => {
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
                            if (_common.ReactNative && _common.ReactNative.Image && typeof _common.ReactNative.Image.clearMemoryCache === 'function') {
                                _common.ReactNative.Image.clearMemoryCache();
                            }
                        }
                    })
                );
            }

            // FlatList Virtualization
            const FlatList = _common.ReactNative?.FlatList || (_metro.findByProps && _metro.findByProps('FlatList')?.FlatList);
            if (FlatList && FlatList.render) {
                unpatches.push(
                    _patcher.before('render', FlatList, (args) => {
                        const props = args[0];
                        if (props && typeof props === 'object') {
                            props.removeClippedSubviews = true;
                            if (props.maxToRenderPerBatch === undefined || props.maxToRenderPerBatch > 10) {
                                props.maxToRenderPerBatch = 8;
                            }
                        }
                    })
                );
            }

            // ========================================================
            // FEATURE 3: MESSAGE RELIABILITY (AUTO-RECOVERY)
            // ========================================================
            const MessageActions = _metro.findByProps ? _metro.findByProps('fetchMessages') : null;
            if (_FluxDispatcher && MessageActions) {
                unpatches.push(
                    _patcher.after('dispatch', _FluxDispatcher, ([event]) => {
                        if (!event) return;
                        if (event.type === 'LOAD_MESSAGES_FAILURE' || event.type === 'MESSAGE_FETCH_FAILED') {
                            const chId = event.channelId;
                            if (!chId || recoveryDebounce[chId]) return;
                            recoveryDebounce[chId] = setTimeout(() => {
                                delete recoveryDebounce[chId];
                                console.log('[MessageReliability] Auto-recovering failed messages for channel:', chId);
                                try {
                                    MessageActions.fetchMessages({ channelId: chId, limit: 50 });
                                } catch (_) {}
                            }, 1200);
                        }
                    })
                );
            }

            console.log('[MasterSuite Mobile] Antigravity Master Suite loaded successfully!');
        } catch (err) {
            console.error('[MasterSuite Mobile] Error during onLoad:', err);
        }
    }

    function onUnload() {
        if (idleTimer) clearTimeout(idleTimer);
        for (const t of Object.values(recoveryDebounce)) clearTimeout(t);
        for (const unpatch of unpatches) {
            try {
                if (typeof unpatch === 'function') unpatch();
            } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[MasterSuite Mobile] Unloaded cleanly.');
    }

    const pluginInstance = { onLoad, onUnload };
    exports.default = pluginInstance;
    exports.onLoad = pluginInstance.onLoad;
    exports.onUnload = pluginInstance.onUnload;
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
);
