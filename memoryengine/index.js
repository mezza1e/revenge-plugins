/**
 * DiscordMemoryEngine for Revengecord / Vendetta / Bunny
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

    
    let recentChannels = [];
    const MAX_CHANNELS = 4;

    function onLoad() {
        try {
            console.log('[DiscordMemoryEngine Mobile] Initializing...');
            if (!_patcher || !_patcher.before) return;
            const MessageStore = _metro.findByStoreName ? _metro.findByStoreName('MessageStore') : null;

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

            console.log('[DiscordMemoryEngine Mobile] Loaded successfully!');
        } catch (err) {
            console.error('[DiscordMemoryEngine Mobile] Error during onLoad:', err);
        }
    }

    function onUnload() {
        for (const unpatch of unpatches) {
            try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[DiscordMemoryEngine Mobile] Unloaded.');
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
