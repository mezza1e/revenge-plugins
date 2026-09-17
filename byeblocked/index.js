/**
 * ByeBlocked for Revengecord / Vendetta / Bunny
 */
(function(exports, metroCommon, patcher, metro, vendetta, plugin, storage, uiComponents) {
    'use strict';

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

    
    function onLoad() {
        try {
            console.log('[ByeBlocked Mobile] Initializing ByeBlocked...');
            if (!_patcher || !_patcher.before) return;

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

            // 1. Dispatcher
            if (_FluxDispatcher && typeof _FluxDispatcher.dispatch === 'function') {
                unpatches.push(
                    _patcher.before('dispatch', _FluxDispatcher, ([event]) => {
                        if (!event) return;
                        if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                            event.messages = event.messages.filter(msg => msg && !isBlockedOrIgnored(msg.author?.id));
                        }
                        if ((event.type === 'MESSAGE_CREATE' || event.type === 'MESSAGE_UPDATE') && event.message) {
                            if (isBlockedOrIgnored(event.message.author?.id)) event.channelId = '0';
                        }
                        if (event.type === 'TYPING_START' && isBlockedOrIgnored(event.userId)) {
                            event.channelId = '0';
                        }
                    })
                );
            }

            // 2. RowManager
            if (RowManager && RowManager.prototype) {
                unpatches.push(
                    _patcher.before('generate', RowManager.prototype, ([data]) => {
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
                    })
                );
            }

            // 3. Purge cached messages
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

            // 4. TypingStore
            if (TypingStore && typeof TypingStore.getTypingUsers === 'function') {
                unpatches.push(
                    _patcher.after('getTypingUsers', TypingStore, (args, res) => {
                        if (!res || typeof res !== 'object') return res;
                        const filtered = {};
                        for (const uId in res) {
                            if (!isBlockedOrIgnored(uId)) filtered[uId] = res[uId];
                        }
                        return filtered;
                    })
                );
            }

            // 5. Hide from Settings
            if (RelationshipStore) {
                if (typeof RelationshipStore.getBlockedUserIds === 'function') {
                    unpatches.push(_patcher.instead('getBlockedUserIds', RelationshipStore, () => []));
                }
                if (typeof RelationshipStore.getIgnoredUserIds === 'function') {
                    unpatches.push(_patcher.instead('getIgnoredUserIds', RelationshipStore, () => []));
                }
            }

            // 6. Native Settings UI
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
                                        if (/blocked|ignored/i.test(lbl)) return null;
                                        return orig(...args);
                                    })
                                );
                            }
                        }
                    }
                } catch (_) {}
            }

            console.log('[ByeBlocked Mobile] Loaded successfully!');
        } catch (err) {
            console.error('[ByeBlocked Mobile] Error during onLoad:', err);
        }
    }

    function onUnload() {
        for (const unpatch of unpatches) {
            try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[ByeBlocked Mobile] Unloaded cleanly.');
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
    (typeof vendetta !== 'undefined' ? vendetta : (typeof revenge !== 'undefined' ? revenge.metro : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.plugin : (typeof revenge !== 'undefined' ? revenge.plugin : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.storage : (typeof revenge !== 'undefined' ? revenge.storage : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.ui?.components : (typeof revenge !== 'undefined' ? revenge.ui?.components : undefined))
);
