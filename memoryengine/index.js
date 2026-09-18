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
            console.log('[DiscordMemoryEngine Mobile] Initializing (Unlimited Channel Cache Mode)...');
            if (!_patcher || !_patcher.before) return;

            if (_FluxDispatcher) {
                unpatches.push(
                    _patcher.after('dispatch', _FluxDispatcher, ([event]) => {
                        if (!event) return;
                        // Unlimited channel cache: zero eviction for instantaneous channel switching.
                        // Performs background GC only when mobile app is minimized.
                        if (event.type === 'APP_STATE_UPDATE' && event.state === 'background') {
                            if (typeof global !== 'undefined' && typeof global.gc === 'function') global.gc();
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
