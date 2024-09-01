(function() {
    const originalOpen = window.open;
    const blockedMethods = new Set(['open', 'showModalDialog', 'showModelessDialog']);

    function blockMethod(obj, methodName) {
        const original = obj[methodName];
        Object.defineProperty(obj, methodName, {
            configurable: false,
            enumerable: true,
            writable: false,
            value: function(...args) {
                console.log(`Blocked ${methodName}:`, args);
                window.postMessage({ type: 'BLOCKED_POPUP', method: methodName, args }, '*');
                return null;
            }
        });
        return original;
    }

    function recursivelyBlockMethods(obj) {
        if (obj === null || typeof obj !== 'object') return;

        blockedMethods.forEach(method => {
            if (typeof obj[method] === 'function') {
                blockMethod(obj, method);
            }
        });

        const proto = Object.getPrototypeOf(obj);
        if (proto && proto !== Object.prototype) {
            recursivelyBlockMethods(proto);
        }
    }

    // Block methods on window and its prototype chain
    recursivelyBlockMethods(window);

    // Block methods on Window.prototype
    recursivelyBlockMethods(Window.prototype);

    // Intercept property definitions
    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, descriptor) {
        if (blockedMethods.has(prop) && typeof descriptor.value === 'function') {
            console.log(`Blocked attempt to define ${prop}`);
            return obj;
        }
        return originalDefineProperty.call(this, obj, prop, descriptor);
    };

    // Intercept property assignments
    window = new Proxy(window, {
        set: function(target, prop, value) {
            if (blockedMethods.has(prop) && typeof value === 'function') {
                console.log(`Blocked attempt to set ${prop}`);
                return true;
            }
            target[prop] = value;
            return true;
        }
    });

    // Block location methods
    ['assign', 'replace', 'reload'].forEach(method => {
        const original = window.location[method];
        window.location[method] = function(...args) {
            console.log(`Blocked ${method} redirection:`, args);
            window.postMessage({ type: 'BLOCKED_REDIRECT', method, args }, '*');
        };
    });

    // Re-apply protections periodically
    setInterval(function() {
        recursivelyBlockMethods(window);
        recursivelyBlockMethods(Window.prototype);
    }, 1000);

    console.log('Popup blocking protections applied');
})();