if (!window.originalWindowOpen) {
    window.originalWindowOpen = window.open;
    window.open = function(...args) {
        console.log('Intercepted window.open:', args);
        window.postMessage({ type: 'BLOCKED_POPUP', args }, '*');
        return null;
    };
    console.log('window.open overridden');
}