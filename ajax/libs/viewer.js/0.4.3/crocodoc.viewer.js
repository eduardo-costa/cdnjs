/*! Crocodoc Viewer - v0.4.3 | (c) 2014 Box */

var Crocodoc = (function ($) {

/*global Crocodoc:true*/

/**
 * The one global object for Crocodoc JavaScript.
 * @namespace
 */
var Crocodoc = (function () {

    'use strict';

    var components = {},
        utilities = {};

    /**
     * Find circular dependencies in component mixins
     * @param   {string} componentName   The component name that is being added
     * @param   {Array} dependencies  Array of component mixin dependencies
     * @param   {void} path           String used to keep track of depencency graph
     * @returns {void}
     */
    function findCircularDependencies(componentName, dependencies, path) {
        var i;
        path = path || componentName;
        for (i = 0; i < dependencies.length; ++i) {
            if (componentName === dependencies[i]) {
                throw new Error('Circular dependency detected: ' + path + '->' + dependencies[i]);
            } else if (components[dependencies[i]]) {
                findCircularDependencies(componentName, components[dependencies[i]].mixins, path + '->' + dependencies[i]);
            }
        }
    }

    return {
        // Zoom, scroll, page status, layout constants
        ZOOM_FIT_WIDTH:                 'fitwidth',
        ZOOM_FIT_HEIGHT:                'fitheight',
        ZOOM_AUTO:                      'auto',
        ZOOM_IN:                        'in',
        ZOOM_OUT:                       'out',

        SCROLL_PREVIOUS:                'previous',
        SCROLL_NEXT:                    'next',

        LAYOUT_VERTICAL:                'vertical',
        LAYOUT_VERTICAL_SINGLE_COLUMN:  'vertical-single-column',
        LAYOUT_HORIZONTAL:              'horizontal',
        LAYOUT_PRESENTATION:            'presentation',
        LAYOUT_PRESENTATION_TWO_PAGE:   'presentation-two-page',

        PAGE_STATUS_CONVERTING:         'converting',
        PAGE_STATUS_NOT_LOADED:         'not loaded',
        PAGE_STATUS_LOADING:            'loading',
        PAGE_STATUS_LOADED:             'loaded',
        PAGE_STATUS_ERROR:              'error',

        // exposed for testing purposes only
        // should not be accessed directly otherwise
        components: components,
        utilities: utilities,

        /**
         * Create and return a viewer instance initialized with the given parameters
         * @param {string|Element|jQuery} el The element to bind the viewer to
         * @param {Object} config            The viewer configuration parameters
         * @returns {Object}                 The viewer instance
         */
        createViewer: function (el, config) {
            return new Crocodoc.Viewer(el, config);
        },

        /**
         * Register a new component
         * @param  {string} name      The (unique) name of the component
         * @param  {Array} mixins     Array of component names to instantiate and pass as mixinable objects to the creator method
         * @param  {Function} creator Factory function used to create an instance of the component
         * @returns {void}
         */
        addComponent: function (name, mixins, creator) {
            if (mixins instanceof Function) {
                creator = mixins;
                mixins = [];
            }
            // make sure this component won't cause a circular mixin dependency
            findCircularDependencies(name, mixins);
            components[name] = {
                mixins: mixins,
                creator: creator
            };
        },

        /**
         * Create and return an instance of the named component
         * @param  {string} name The name of the component to create
         * @param  {Crocodoc.Scope} scope The scope object to create the component on
         * @returns {?Object}     The component instance or null if the component doesn't exist
         */
        createComponent: function (name, scope) {
            var component = components[name];

            if (component) {
                var args = [];
                for (var i = 0; i < component.mixins.length; ++i) {
                    args.push(this.createComponent(component.mixins[i], scope));
                }
                args.unshift(scope);
                return component.creator.apply(component.creator, args);
            }

            return null;
        },

        /**
         * Register a new Crocodoc plugin
         * @param  {string} name      The (unique) name of the plugin
         * @param  {Function} creator Factory function used to create an instance of the plugin
         * @returns {void}
         */
        addPlugin: function (name, creator) {
            this.addComponent('plugin-' + name, creator);
        },

        /**
         * Register a new utility
         * @param  {string} name    The (unique) name of the utility
         * @param  {Function} creator Factory function used to create an instance of the utility
         * @returns {void}
         */
        addUtility: function (name, creator) {
            utilities[name] = {
                creator: creator,
                instance: null
            };
        },

        /**
         * Retrieve the named utility
         * @param {string} name The name of the utility to retrieve
         * @returns {?Object}    The utility or null if the utility doesn't exist
         */
        getUtility: function (name) {
            var utility = utilities[name];

            if (utility) {
                if (!utility.instance) {
                    utility.instance = utility.creator(this);
                }

                return utility.instance;
            }

            return null;
        }
    };
})();

(function () {

    'use strict';

    /**
     * Scope class used for component scoping (creating, destroying, broadcasting messages)
     * @constructor
     */
    Crocodoc.Scope = function Scope(config) {

        var util = Crocodoc.getUtility('common');

        var instances = [];

        /**
         * Create and return an instance of the named component,
         * and add it to the list of instances in this scope
         * @param  {string} componentName The name of the component to create
         * @returns {?Object}     The component instance or null if the component doesn't exist
         */
        this.createComponent = function (componentName) {
            var instance = Crocodoc.createComponent(componentName, this);
            if (instance) {
                instance.componentName = componentName;
                instances.push(instance);
            }
            return instance;
        };

        /**
         * Remove and call the destroy method on a component instance
         * @param  {Object} instance The component instance to remove
         * @returns {void}
         */
        this.destroyComponent = function (instance) {
            var i, len;

            for (i = 0, len = instances.length; i < len; ++i) {
                if (instance === instances[i]) {
                    if (typeof instance.destroy === 'function') {
                        instance.destroy();
                    }
                    instances.splice(i, 1);
                    break;
                }
            }
        };

        /**
         * Remove and call the destroy method on all instances in this scope
         * @returns {void}
         */
        this.destroy = function () {
            var i, len, instance;

            for (i = 0, len = instances.length; i < len; ++i) {
                instance = instances[i];
                if (typeof instance.destroy === 'function') {
                    instance.destroy();
                }
            }
            instances = [];
        };

        /**
         * Broadcast a message to all components in this scope that have registered
         * a listener for the named message type
         * @param  {string} messageName The message name
         * @param  {any} data The message data
         * @returns {void}
         */
        this.broadcast = function (messageName, data) {
            var i, len, instance, messages;
            for (i = 0, len = instances.length; i < len; ++i) {
                instance = instances[i];
                if (!instance) {
                    continue;
                }
                messages = instance.messages || [];

                if (util.inArray(messageName, messages) !== -1) {
                    if (typeof instance.onmessage === 'function') {
                        instance.onmessage.call(instance, messageName, data);
                    }
                }
            }
        };

        /**
         * Passthrough method to the framework that retrieves utilities.
         * @param {string} name The name of the utility to retrieve
         * @returns {?Object}    An object if the utility is found or null if not
         */
        this.getUtility = function (name) {
            return Crocodoc.getUtility(name);
        };

        /**
         * Get the config object associated with this scope
         * @returns {Object} The config object
         */
        this.getConfig = function () {
            return config;
        };
    };
})();

(function () {
    'use strict';

    /**
     * An object that is capable of generating custom events and also
     * executing handlers for events when they occur.
     * @constructor
     */
    Crocodoc.EventTarget = function() {

        /**
         * Map of events to handlers. The keys in the object are the event names.
         * The values in the object are arrays of event handler functions.
         * @type {Object}
         * @private
         */
        this._handlers = {};
    };

    Crocodoc.EventTarget.prototype = {

        // restore constructor
        constructor: Crocodoc.EventTarget,

        /**
         * Adds a new event handler for a particular type of event.
         * @param {string} type The name of the event to listen for.
         * @param {Function} handler The function to call when the event occurs.
         * @returns {void}
         */
        on: function(type, handler) {
            if (typeof this._handlers[type] === 'undefined') {
                this._handlers[type] = [];
            }

            this._handlers[type].push(handler);
        },

        /**
         * Fires an event with the given name and data.
         * @param {string} type The type of event to fire.
         * @param {Object} data An object with properties that should end up on
         *      the event object for the given event.
         * @returns {void}
         */
        fire: function(type, data) {
            var handlers,
                i,
                len,
                event = {
                    type: type,
                    data: data
                };

            // if there are handlers for the event, call them in order
            handlers = this._handlers[event.type];
            if (handlers instanceof Array) {
                // @NOTE: do a concat() here to create a copy of the handlers array,
                // so that if another handler is removed of the same type, it doesn't
                // interfere with the handlers array
                handlers = handlers.concat();
                for (i = 0, len = handlers.length; i < len; i++) {
                    if (handlers[i]) {
                        handlers[i].call(this, event);
                    }
                }
            }

            // call handlers for `all` event type
            handlers = this._handlers.all;
            if (handlers instanceof Array) {
                // @NOTE: do a concat() here to create a copy of the handlers array,
                // so that if another handler is removed of the same type, it doesn't
                // interfere with the handlers array
                handlers = handlers.concat();
                for (i = 0, len = handlers.length; i < len; i++) {
                    if (handlers[i]) {
                        handlers[i].call(this, event);
                    }
                }
            }
        },

        /**
         * Removes an event handler from a given event.
         * If the handler is not provided, remove all handlers of the given type.
         * @param {string} type The name of the event to remove from.
         * @param {Function} handler The function to remove as a handler.
         * @returns {void}
         */
        off: function(type, handler) {
            var handlers = this._handlers[type],
                i,
                len;

            if (handlers instanceof Array) {
                if (!handler) {
                    handlers.length = 0;
                    return;
                }
                for (i = 0, len = handlers.length; i < len; i++) {
                    if (handlers[i] === handler || handlers[i].handler === handler) {
                        handlers.splice(i, 1);
                        break;
                    }
                }
            }
        },


        /**
         * Adds a new event handler that should be removed after it's been triggered once.
         * @param {string} type The name of the event to listen for.
         * @param {Function} handler The function to call when the event occurs.
         * @returns {void}
         */
        one: function(type, handler) {
            var self = this,
                proxy = function (event) {
                    self.off(type, proxy);
                    handler.call(self, event);
                };
            proxy.handler = handler;
            this.on(type, proxy);
        }
    };

})();

/**
 * The Crocodoc.Viewer namespace
 * @namespace
 */
(function () {
    'use strict';

    var CSS_CLASS_TEXT_DISABLED  = 'crocodoc-text-disabled',
        CSS_CLASS_LINKS_DISABLED = 'crocodoc-links-disabled';

    var viewerInstanceCount = 0;

    /**
     * Crocodoc.Viewer constructor
     * @param {jQuery|string|Element} el The element to wrap
     * @param {Object} options           Configuration options
     * @constructor
     */
    Crocodoc.Viewer = function (el, options) {
        // call the EventTarget constructor to init handlers
        Crocodoc.EventTarget.call(this);

        var util = Crocodoc.getUtility('common');
        var layout,
            $el = $(el),
            ready = false,
            messageQueue = [],
            config = util.extend(true, {}, Crocodoc.Viewer.defaults, options),
            scope = new Crocodoc.Scope(config),
            viewerBase = scope.createComponent('viewer-base');

        //Container exists?
        if ($el.length === 0) {
            throw new Error('Invalid container element');
        }

        config.id = ++viewerInstanceCount;
        config.api = this;
        config.$el = $el;
        viewerBase.init();

        /**
         * Broadcast a message or queue it until the viewer is ready
         * @param   {string} name The name of the message
         * @param   {*} data The message data
         * @returns {void}
         */
        function broadcastMessageWhenReady(name, data) {
            if (ready) {
                scope.broadcast(name, data);
            } else {
                messageQueue.push({ name: name, data: data });
            }
        }

        /**
         * Broadcasts any (pageavailable) messages that were queued up
         * before the viewer was ready
         * @returns {void}
         */
        function broadcastQueuedMessages() {
            var message;
            while (messageQueue.length) {
                message = messageQueue.shift();
                scope.broadcast(message.name, message.data);
            }
        }

        /**
         * Handle ready message from the viewer
         * @returns {void}
         */
        function handleReadyMessage() {
            ready = true;
            broadcastQueuedMessages();
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * Destroy the viewer instance
         * @returns {void}
         */
        this.destroy = function () {
            // broadcast a destroy message
            scope.broadcast('destroy');

            // destroy all components and plugins in this scope
            scope.destroy();
        };

        /**
         * Intiate loading of document assets
         * @returns {void}
         */
        this.load = function () {
            // add a / to the end of the base url if necessary
            if (config.url) {
                if (!/\/$/.test(config.url)) {
                    config.url += '/';
                }
            } else {
                scope.broadcast('fail', { error: 'no URL given for assets' });
                return;
            }

            viewerBase.loadAssets();
        };

        /**
         * Set the layout to the given mode, destroying and cleaning up the current
         * layout if there is one
         * @param  {string} mode The layout mode
         * @returns {void}
         */
        this.setLayout = function (mode) {
            layout = viewerBase.setLayout(mode);
        };

        /**
         * Zoom to the given value
         * @param  {float|string} val Numeric zoom level to zoom to or one of:
         *                            Crocodoc.ZOOM_IN
         *                            Crocodoc.ZOOM_OUT
         *                            Crocodoc.ZOOM_AUTO
         *                            Crocodoc.ZOOM_FIT_WIDTH
         *                            Crocodoc.ZOOM_FIT_HEIGHT
         * @returns {void}
         */
        this.zoom = function (val) {
            // adjust for page scale if passed value is a number
            var valFloat = parseFloat(val);
            if (layout) {
                if (valFloat) {
                    val = valFloat / (config.pageScale || 1);
                }
                layout.setZoom(val);
            }
        };

        /**
         * Scroll to the given page
         * @param  {int|string} page Page number or one of:
         *                           Crocodoc.SCROLL_PREVIOUS
         *                           Crocodoc.SCROLL_NEXT
         * @returns {void}
         */
        this.scrollTo = function (page) {
            if (layout) {
                layout.scrollTo(page);
            }
        };

        /**
         * Scrolls by the given pixel amount from the current location
         * @param  {int} left Left offset to scroll to
         * @param  {int} top  Top offset to scroll to
         * @returns {void}
         */
        this.scrollBy = function (left, top) {
            if (layout) {
                layout.scrollBy(left, top);
            }
        };

        /**
         * Focuses the viewport so it can be natively scrolled with the keyboard
         * @returns {void}
         */
        this.focus = function () {
            if (layout) {
                layout.focus();
            }
        };

        /**
         * Enable text selection, loading text assets per page if necessary
         * @returns {void}
         */
        this.enableTextSelection = function () {
            if (!config.enableTextSelection) {
                $el.removeClass(CSS_CLASS_TEXT_DISABLED);
                config.enableTextSelection = true;
                scope.broadcast('textenabledchange', { enabled: true });
            }
        };

        /**
         * Disable text selection, hiding text layer on pages if it's already there
         * and disabling the loading of new text assets
         * @returns {void}
         */
        this.disableTextSelection = function () {
            if (config.enableTextSelection) {
                $el.addClass(CSS_CLASS_TEXT_DISABLED);
                config.enableTextSelection = false;
                scope.broadcast('textenabledchange', { enabled: false });
            }
        };

        /**
         * Enable links
         * @returns {void}
         */
        this.enableLinks = function () {
            if (!config.enableLinks) {
                $el.removeClass(CSS_CLASS_LINKS_DISABLED);
                config.enableLinks = true;
            }
        };

        /**
         * Disable links
         * @returns {void}
         */
        this.disableLinks = function () {
            if (config.enableLinks) {
                $el.addClass(CSS_CLASS_LINKS_DISABLED);
                config.enableLinks = false;
            }
        };

        /**
         * Force layout update
         * @returns {void}
         */
        this.updateLayout = function () {
            if (layout) {
                // force update layout (incl. calculating page paddings)
                layout.updatePageStates(true);
                layout.setZoom();
            }
        };

        /**
         * Notify the viewer that a page is available (ie., it's finished converting)
         * @param  {int} page The page that's available
         * @returns {void}
         * @TODO(clakenen): maybe come up with a better name for this?
         * @TODO(clakenen): if this is called before the viewer has recieved document metadata
         * it will be ignored; perhaps we should cache these messages in that condition?
         */
        this.setPageAvailable = function (page) {
            broadcastMessageWhenReady('pageavailable',  { page: page });
        };

        /**
         * Notify the viewer that all pages up to a given page are available
         * @param  {int} page The page that is (and all pages up to are) available
         * @returns {void}
         * @TODO(clakenen): see TODOs on setPageAvailable
         */
        this.setPagesAvailableUpTo = function (page) {
            broadcastMessageWhenReady('pageavailable',  { upto: page });
        };

        /**
         * Notify the viewer that all pages are available
         * @returns {void}
         */
        this.setAllPagesAvailable = function () {
            if (!ready) {
                config.conversionIsComplete = true;
            } else {
                scope.broadcast('pageavailable', { upto: config.numPages });
            }
        };

        this.one('ready', handleReadyMessage);
    };

    Crocodoc.Viewer.prototype = new Crocodoc.EventTarget();
    Crocodoc.Viewer.prototype.constructor = Crocodoc.Viewer;

    // Global defaults
    Crocodoc.Viewer.defaults = {
        // the url to load the assets from (required)
        url: null,

        // document viewer layout
        layout: Crocodoc.LAYOUT_VERTICAL,

        // initial zoom level
        zoom: Crocodoc.ZOOM_AUTO,

        // page to start on
        page: 1,

        // enable/disable text layer
        enableTextSelection: true,

        // enable/disable links layer
        enableLinks: true,

        // enable/disable click-and-drag
        enableDragging: false,

        // query string parameters to append to all asset requests
        queryParams: null,

        // plugin configs
        plugins: {},


        //--------------------------------------------------------------------------
        // The following are undocumented, internal, or experimental options,
        // which are very subject to change and likely to be broken.
        // --
        // USE AT YOUR OWN RISK!
        //--------------------------------------------------------------------------

        // whether to use the browser window as the viewport into the document (this
        // is useful when the document should take up the entire browser window, e.g.,
        // on mobile devices)
        useWindowAsViewport: false,

        // whether or not the conversion is finished (eg., pages are ready to be loaded)
        conversionIsComplete: true,

        // template for loading assets... this should rarely (if ever) change
        template: {
            svg: 'page-{{page}}.svg',
            img: 'page-{{page}}.png',
            html: 'text-{{page}}.html',
            css: 'stylesheet.css',
            json: 'info.json'
        },

        // page to start/end on (pages outside this range will not be shown)
        pageStart: null,
        pageEnd: null,

        // zoom levels are relative to the viewport size,
        // and the dynamic zoom levels (auto, fitwidth, etc) will be added into the mix
        zoomLevels: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]
    };
})();


Crocodoc.addUtility('ajax', function (framework) {

    'use strict';

    var util = framework.getUtility('common');

    /**
     * Creates a request object to call the success/fail handlers on
     * @param {XMLHttpRequest} req The request object to wrap
     * @returns {Object} The request object
     * @private
     */
    function createRequestWrapper(req) {
        var status,
            statusText,
            responseText;
        try {
            status = req.status;
            statusText = req.statusText;
            responseText = req.responseText;
        } catch (e) {
            status = 0;
            statusText = '';
            responseText = null;
        }
        return {
            status: status,
            statusText: statusText,
            responseText: responseText
        };
    }

    /**
     * Get a XHR object
     * @returns {XMLHttpRequest} An XHR object
     * @private
     */
    function getXMLHttpRequest() {
        if (window.XMLHttpRequest) {
            return new window.XMLHttpRequest();
        } else {
            try {
                return new ActiveXObject('MSXML2.XMLHTTP.3.0');
            }
            catch(ex) {
                return null;
            }
        }
    }

    return {
        /**
         * Basic AJAX request
         * @param   {string}     url               request URL
         * @param   {Object}     [options]         AJAX request options
         * @param   {string}     [options.method]  request method, eg. 'GET', 'POST' (defaults to 'GET')
         * @param   {Function}   [options.success] success callback function
         * @param   {Function}   [options.fail]    fail callback function
         * @returns {XMLHttpRequest|XDomainRequest} Request object
         */
        request: function (url, options) {
            options = options || {};
            var method = options.method || 'GET',
                req = getXMLHttpRequest();

            /**
             * Function to call on successful AJAX request
             * @returns {void}
             * @private
             */
            function ajaxSuccess() {
                if (util.isFn(options.success)) {
                    options.success.call(createRequestWrapper(req));
                }
            }

            /**
             * Function to call on failed AJAX request
             * @returns {void}
             * @private
             */
            function ajaxFail() {
                if (util.isFn(options.fail)) {
                    options.fail.call(createRequestWrapper(req));
                }
            }

            if (util.isCrossDomain(url) && !('withCredentials' in req)) {
                if ('XDomainRequest' in window) {
                    req = new window.XDomainRequest();
                    try {
                        req.open(method, url);
                        req.onload = ajaxSuccess;
                        // NOTE: IE (8/9) requires onerror, ontimeout, and onprogress
                        // to be defined when making XDR to https servers
                        req.onerror = ajaxFail;
                        req.ontimeout = ajaxFail;
                        req.onprogress = function () {};
                        req.send();
                    } catch (e) {
                        req = {
                            status: 0,
                            statusText: e.message
                        };
                        ajaxFail();
                    }
                } else {
                    // CORS is not supported!
                    req = {
                        status: 0,
                        statusText: 'CORS not supported'
                    };
                    ajaxFail();
                }
            } else if (req) {
                req.open(method, url, true);
                req.onreadystatechange = function () {
                    if (req.readyState === 4) { // DONE
                        // remove the onreadystatechange handler,
                        // because it could be called again
                        // @NOTE: we replace it with a noop function, because
                        // IE8 will throw an error if the value is not of type
                        // 'function' when using ActiveXObject
                        req.onreadystatechange = function () {};

                        try {
                            if (req.status === 200) {
                                ajaxSuccess();
                            } else {
                                ajaxFail();
                            }
                        } catch (e) {
                            // NOTE: IE (9?) throws an error when the request is aborted
                            ajaxFail();
                        }
                    }
                };
                req.send();
            } else {
                req = {
                    status: 0,
                    statusText: 'AJAX not supported'
                };
                ajaxFail();
            }

            return req;
        }
    };
});

Crocodoc.addUtility('browser', function () {

    'use strict';

    var ua = navigator.userAgent,
        browser = {},
        ios, android, blackberry,
        webos, silk, ie;

    ios = /iphone|ipod|ipad/i.test(ua);
    android = /android/i.test(ua);
    webos = /webos/i.test(ua);
    blackberry = /blackberry/i.test(ua);
    silk = /blackberry/i.test(ua);
    ie = /MSIE/i.test(ua);

    if (ie) {
        browser.ie = true;
        browser.version = parseFloat(/MSIE\s+(\d+\.\d+)/i.exec(ua)[1]);
        browser.ielt9 = browser.version < 9;
        browser.ielt10 = browser.version < 10;
    }
    if (ios) {
        browser.ios = true;
    }
    browser.mobile = /mobile/i.test(ua) || ios || android || blackberry || webos || silk;
    browser.firefox = /firefox/i.test(ua);
    if (/safari/i.test(ua)) {
        browser.chrome = /chrome/i.test(ua);
        browser.safari = !browser.chrome;
    }

    return browser;
});

/**
 * Common utility functions used throughout Crocodoc JS
 */
Crocodoc.addUtility('common', function () {

    'use strict';

    var util = {};

    util.extend = $.extend;
    util.each = $.each;
    util.map = $.map;
    util.parseJSON = $.parseJSON;

    return $.extend(util, {

        /**
         * Left bistect of list, optionally of property of objects in list
         * @param   {Array} list List of items to bisect
         * @param   {number} x    The number to bisect against
         * @param   {string} [prop] Optional property to check on list items instead of using the item itself
         * @returns {int}      The index of the bisection
         */
        bisectLeft: function (list, x, prop) {
            var val, mid, low = 0, high = list.length;
            while (low < high) {
                mid = Math.floor((low + high) / 2);
                val = prop ? list[mid][prop] : list[mid];
                if (val < x) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }
            return low;
        },

        /**
         * Right bistect of list, optionally of property of objects in list
         * @param   {Array} list List of items to bisect
         * @param   {number} x    The number to bisect against
         * @param   {string} [prop] Optional property to check on list items instead of using the item itself
         * @returns {int}      The index of the bisection
         */
        bisectRight: function (list, x, prop) {
            var val, mid, low = 0, high = list.length;
            while (low < high) {
                mid = Math.floor((low + high) / 2);
                val = prop ? list[mid][prop] : list[mid];
                if (x < val) {
                    high = mid;
                } else {
                    low = mid + 1;
                }
            }
            return low;
        },

        /**
         * Clamp x to range [a,b]
         * @param   {number} x The value to clamp
         * @param   {number} a Low value
         * @param   {number} b High value
         * @returns {number}   The clamped value
         */
        clamp: function (x, a, b) {
            if (x < a) {
                return a;
            } else if (x > b) {
                return b;
            }
            return x;
        },

        /**
         * Returns the sign of the given number
         * @param   {number} value The number
         * @returns {number}       The sign (-1 or 1), or 0 if value === 0
         */
        sign: function(value) {
            var number = parseInt(value, 10);
            if (!number) {
                return number;
            }
            return number < 0 ? -1 : 1;
        },

        /**
         * Returns true if the given value is a function
         * @param   {*} val Any value
         * @returns {Boolean} true if val is a function, false otherwise
         */
        isFn: function (val) {
            return typeof val === 'function';
        },

        /**
         * Search for a specified value within an array, and return its index (or -1 if not found)
         * @param   {*} value       The value to search for
         * @param   {Array} array   The array to search
         * @returns {int}           The index of value in array or -1 if not found
         */
        inArray: function (value, array) {
            if (util.isFn(array.indexOf)) {
                return array.indexOf(value);
            } else {
                return $.inArray(value, array);
            }
        },

        /**
         * Constrains the range [low,high] to the range [0,max]
         * @param   {number} low  The low value
         * @param   {number} high The high value
         * @param   {number} max  The max value (0 is implicit min)
         * @returns {Object}      The range object containing min and max values
         */
        constrainRange: function (low, high, max) {
            var length = high - low;
            low = util.clamp(low, 0, max);
            high = util.clamp(low + length, 0, max);
            if (high - low < length) {
                low = util.clamp(high - length, 0, max);
            }
            return {
                min: low,
                max: high
            };
        },

        /**
         * Make the given path absolute
         *  - if path doesn't contain protocol and domain, prepend the current protocol and domain
         *  - if the path is relative (eg. doesn't begin with /), also fill in the current path
         * @param   {string} path The path to make absolute
         * @returns {string}      The absolute path
         */
        makeAbsolute: function (path) {
            var location = window.location,
                pathname = location.pathname;
            if (/^http|^\/\//i.test(path)) {
                return path;
            }
            if (path.charAt(0) !== '/') {
                if (pathname.lastIndexOf('/') !== pathname.length - 1) {
                    pathname = pathname.substring(0, pathname.lastIndexOf('/') + 1);
                }
                path = pathname + path;
            }
            return location.protocol + '//' + location.host + path;
        },

        /**
         * Return the current time since epoch in ms
         * @returns {int} The current time
         */
        now: function () {
            return (new Date()).getTime();
        },

        /**
         * Creates and returns a new, throttled version of the passed function,
         * that, when invoked repeatedly, will only actually call the original
         * function at most once per every wait milliseconds
         * @param   {int}      wait Time to wait between calls in ms
         * @param   {Function} fn   The function to throttle
         * @returns {Function}      The throttled function
         */
        throttle: function (wait, fn) {
            var context,
                args,
                timeout,
                result,
                previous = 0;

            function later () {
                previous = util.now();
                timeout = null;
                result = fn.apply(context, args);
            }

            return function throttled() {
                var now = util.now(),
                    remaining = wait - (now - previous);
                context = this;
                args = arguments;
                if (remaining <= 0) {
                    clearTimeout(timeout);
                    timeout = null;
                    previous = now;
                    result = fn.apply(context, args);
                } else if (!timeout) {
                    timeout = setTimeout(later, remaining);
                }
                return result;
            };
        },

        /**
         * Creates and returns a new debounced version of the passed function
         * which will postpone its execution until after wait milliseconds
         * have elapsed since the last time it was invoked.
         * @param   {int}      wait Time to wait between calls in ms
         * @param   {Function} fn   The function to debounced
         * @returns {Function}      The debounced function
         */
        debounce: function (wait, fn) {
            var context,
                args,
                timeout,
                timestamp,
                result;

            function later() {
                var last = util.now() - timestamp;
                if (last < wait) {
                    timeout = setTimeout(later, wait - last);
                } else {
                    timeout = null;
                    result = fn.apply(context, args);
                    context = args = null;
                }
            }

            return function debounced() {
                context = this;
                args = arguments;
                timestamp = util.now();
                if (!timeout) {
                    timeout = setTimeout(later, wait);
                }
                return result;
            };
        },

        /**
         * Insert the given CSS string into the DOM and return the resulting DOMElement
         * @param   {string} css The CSS string to insert
         * @returns {Element}    The <style> element that was created and inserted
         */
        insertCSS: function (css) {
            var styleEl = document.createElement('style'),
                cssTextNode = document.createTextNode(css);
            try {
                styleEl.setAttribute('type', 'text/css');
                styleEl.appendChild(cssTextNode);
            } catch (err) {
                // uhhh IE < 9
            }
            document.getElementsByTagName('head')[0].appendChild(styleEl);
            return styleEl;
        },

        /**
         * Append a CSS rule to the given stylesheet
         * @param   {CSSStyleSheet} sheet The stylesheet object
         * @param   {string} selector     The selector
         * @param   {string} rule         The rule
         * @returns {int}                 The index of the new rule
         */
        appendCSSRule: function (sheet, selector, rule) {
            var index;
            if (sheet.insertRule) {
                return sheet.insertRule(selector + '{' + rule + '}', sheet.cssRules.length);
            } else {
                index = sheet.addRule(selector, rule, sheet.rules.length);
                if (index < 0) {
                    index = sheet.rules.length - 1;
                }
                return index;
            }
        },

        /**
         * Delete a CSS rule at the given index from the given stylesheet
         * @param   {CSSStyleSheet} sheet The stylesheet object
         * @param   {int} index           The index of the rule to delete
         * @returns {void}
         */
        deleteCSSRule: function (sheet, index) {
            if (sheet.deleteRule) {
                sheet.deleteRule(index);
            } else {
                sheet.removeRule(index);
            }
        },

        /**
         * Get the parent element of the (first) text node that is currently selected
         * @returns {Element} The selected element
         * @TODO: return all selected elements
         */
        getSelectedNode: function () {
            var node, sel, range;
            if (window.getSelection) {
                sel = window.getSelection();
                if (sel.rangeCount) {
                    range = sel.getRangeAt(0);
                    if (!range.collapsed) {
                        node = sel.anchorNode.parentNode;
                    }
                }
            } else if (document.selection) {
                node = document.selection.createRange().parentElement();
            }
            return node;
        },

        /**
         * Cross-browser getComputedStyle, which is faster than jQuery.css
         * @param   {HTMLElement} el      The element
         * @returns {CSSStyleDeclaration} The computed styles
         */
        getComputedStyle: function (el) {
            if ('getComputedStyle' in window) {
                return window.getComputedStyle(el);
            }
            return el.currentStyle;
        },

        /**
         * Calculates the size of 1pt in pixels
         * @returns {number} The pixel value
         */
        calculatePtSize: function () {
            var width,
                px,
                testSize = 10000,
                div = document.createElement('div');
            div.style.display = 'block';
            div.style.position = 'absolute';
            div.style.width = testSize + 'pt';
            document.body.appendChild(div);
            width = util.getComputedStyle(div).width;
            px = parseFloat(width) / testSize;
            document.body.removeChild(div);
            return px;
        },

        /**
         * Count and return the number of occurrences of token in str
         * @param   {string} str   The string to search
         * @param   {string} token The string to search for
         * @returns {int}          The number of occurrences
         */
        countInStr: function (str, token) {
            var total = 0, i;
            while ((i = str.indexOf(token, i) + 1)) {
                total++;
            }
            return total;
        },

        /**
         * Apply the given data to a template
         * @param   {string} template  The template
         * @param   {Object} data The data to apply to the template
         * @returns {string}      The filled template
         */
        template: function (template, data) {
            var p;
            for (p in data) {
                if (data.hasOwnProperty(p)) {
                    template = template.replace(new RegExp('\\{\\{' + p + '\\}\\}', 'g'), data[p]);
                }
            }
            return template;
        },

        /**
         * Returns true if the given url is external to the current domain
         * @param   {string}  url The URL
         * @returns {Boolean} Whether or not the url is external
         */
        isCrossDomain: function (url) {
            var protocolRegExp = /^(http(s)?|file)+:\/\//;
            function getDomain(url) {
                return url.replace(protocolRegExp, '').split('/')[0];
            }
            return protocolRegExp.test(url) &&
                getDomain(location.href) !== getDomain(url);
        }
    });
});

/*global window, document*/
Crocodoc.addUtility('subpx', function (framework) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var CSS_CLASS_SUBPX_FIX = 'crocodoc-subpx-fix',
        TEST_SPAN_TEMPLATE = '<span style="font:{{size}}px serif; color:transparent; white-space:nowrap;">' +
            (new Array(100)).join('A') + '</span>'; // repeat 'A' character;

    var util = framework.getUtility('common');

    /**
     * Return true if subpixel rendering is supported
     * @returns {Boolean}
     * @private
     */
    function isSubpixelRenderingSupported() {
        // Test if subpixel rendering is supported
        // @NOTE: jQuery.support.leadingWhitespace is apparently false if browser is IE6-8
        if (!$.support.leadingWhitespace) {
            return false;
        } else {
            //span #1 - desired font-size: 12.5px
            var span = $(util.template(TEST_SPAN_TEMPLATE, { size: 12.5 }))
                .appendTo(document.documentElement).get(0);
            var fontsize1 = $(span).css('font-size');
            var width1 = $(span).width();
            $(span).remove();

            //span #2 - desired font-size: 12.6px
            span = $(util.template(TEST_SPAN_TEMPLATE, { size: 12.6 }))
                .appendTo(document.documentElement).get(0);
            var fontsize2 = $(span).css('font-size');
            var width2 = $(span).width();
            $(span).remove();

            // is not mobile device?
            // @NOTE(plai): Mobile WebKit supports subpixel rendering even though the browser fails the following tests.
            // @NOTE(plai): When modifying these tests, make sure that these tests will work even when the browser zoom is changed.
            // @TODO(plai): Find a better way of testing for mobile Safari.
            if (!('ontouchstart' in window)) {

                //font sizes are the same? (Chrome and Safari will fail this)
                if (fontsize1 === fontsize2) {
                    return false;
                }

                //widths are the same? (Firefox on Windows without GPU will fail this)
                if (width1 === width2) {
                    return false;
                }
            }
        }

        return true;
    }

    var subpixelRenderingIsSupported = isSubpixelRenderingSupported();

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
        /**
         * Apply the subpixel rendering fix to the given element if necessary.
         * @NOTE: Fix is only applied if the "zoom" CSS property exists
         *        (ie., this fix is never applied in Firefox)
         * @param   {Element} el The element
         * @returns {Element} The element
         */
        fix: function (el) {
            if (!subpixelRenderingIsSupported) {
                if (document.body.style.zoom !== undefined) {
                    var $wrap = $('<div>').addClass(CSS_CLASS_SUBPX_FIX);
                    $(el).children().wrapAll($wrap);
                }
            }
            return el;
        },

        /**
         * Is sub-pixel text rendering supported?
         * @param   {void}
         * @returns {boolean} true if sub-pixel tex rendering is supported
         */
        isSubpxSupported: function() {
            return subpixelRenderingIsSupported;
        }
    };
});

Crocodoc.addUtility('support', function () {

    'use strict';
    var prefixes = ['Moz', 'Webkit', 'O', 'ms'];

    /**
     * Helper function to get the proper vendor property name
     * (`transition` => `WebkitTransition`)
     * @param {string} prop The property name to test for
     * @returns {string|boolean} The vendor-prefixed property name or false if the property is not supported
     */
    function getVendorCSSPropertyName(prop) {
        var testDiv = document.createElement('div'),
            prop_, i, vendorProp;

        // Handle unprefixed versions (FF16+, for example)
        if (prop in testDiv.style) {
            return prop;
        }

        prop_ = prop.charAt(0).toUpperCase() + prop.substr(1);

        if (prop in testDiv.style) {
            return prop;
        }

        for (i = 0; i < prefixes.length; ++i) {
            vendorProp = prefixes[i] + prop_;
            if (vendorProp in testDiv.style) {
                if (vendorProp.indexOf('ms') === 0) {
                    vendorProp = '-' + vendorProp;
                }
                return uncamel(vendorProp);
            }
        }

        return false;
    }

    /**
     * Converts a camelcase string to a dasherized string.
     * (`marginLeft` => `margin-left`)
     * @param {stirng} str The camelcase string to convert
     * @returns {string} The dasherized string
     */
    function uncamel(str) {
        return str.replace(/([A-Z])/g, function(letter) { return '-' + letter.toLowerCase(); });
    }

    // requestAnimationFrame based on:
    // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    // http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
    var raf, caf;
    (function() {
        var lastTime = 0;
        var vendors = ['ms', 'moz', 'webkit', 'o'];
        for (var x = 0; x < vendors.length && !raf; ++x) {
            raf = window[vendors[x] + 'RequestAnimationFrame'];
            caf = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
        }
        if (!raf) {
            raf = function(callback) {
                var currTime = new Date().getTime();
                var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                var id = window.setTimeout(function() { callback(currTime + timeToCall); },
                  timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
        }
        if (!caf) {
            caf = function(id) {
                clearTimeout(id);
            };
        }
    }());


    return {
        svg: document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1'),
        csstransform: getVendorCSSPropertyName('transform'),
        csstransition: getVendorCSSPropertyName('transition'),
        csszoom: getVendorCSSPropertyName('zoom'),

        /**
         * Request an animation frame with the given arguments
         * @returns {int} The frame id
         */
        requestAnimationFrame: function () {
            return raf.apply(window, arguments);
        },

        /**
         * Cancel the animation frame with the given id
         * @returns {void}
         */
        cancelAnimationFrame: function () {
            caf.apply(window, arguments);
        }
    };
});

/**
 * Dragger component definition
 */
Crocodoc.addComponent('dragger', function (scope) {

    'use strict';

    var $el,
        $window = $(window),
        downScrollPosition,
        downMousePosition;

    /**
     * Handle mousemove events
     * @param   {Event} event The event object
     * @returns {void}
     */
    function handleMousemove(event) {
        $el.scrollTop(downScrollPosition.top - (event.clientY - downMousePosition.y));
        $el.scrollLeft(downScrollPosition.left - (event.clientX - downMousePosition.x));
        event.preventDefault();
    }

    /**
     * Handle mouseup events
     * @param   {Event} event The event object
     * @returns {void}
     */
    function handleMouseup(event) {
        scope.broadcast('dragend');
        $window.off('mousemove', handleMousemove);
        $window.off('mouseup', handleMouseup);
        event.preventDefault();
    }

    /**
     * Handle mousedown events
     * @param   {Event} event The event object
     * @returns {void}
     */
    function handleMousedown(event) {
        scope.broadcast('dragstart');
        downScrollPosition = {
            top: $el.scrollTop(),
            left: $el.scrollLeft()
        };
        downMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
        $window.on('mousemove', handleMousemove);
        $window.on('mouseup', handleMouseup);
        event.preventDefault();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
        /**
         * Initialize the scroller component
         * @param   {Element} el The Element
         * @returns {void}
         */
        init: function (el) {
            $el = $(el);
            $el.on('mousedown', handleMousedown);
        },

        /**
         * Destroy the scroller component
         * @returns {void}
         */
        destroy: function () {
            $el.off('mousedown', handleMousedown);
            $el.off('mousemove', handleMousemove);
            $window.off('mouseup', handleMouseup);
        }
    };
});

/**
 * Base layout component for controlling viewer layout and viewport
 */
Crocodoc.addComponent('layout-base', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var CSS_CLASS_LAYOUT_PREFIX = 'crocodoc-layout-',
        CSS_CLASS_CURRENT_PAGE = 'crocodoc-current-page',
        CSS_CLASS_PAGE_PREFIX = 'crocodoc-page-',
        CSS_CLASS_PAGE_VISIBLE = CSS_CLASS_PAGE_PREFIX + 'visible',
        CSS_CLASS_PAGE_AUTOSCALE = CSS_CLASS_PAGE_PREFIX + 'autoscale',
        STYLE_PADDING_PREFIX = 'padding-',
        STYLE_PADDING_TOP = STYLE_PADDING_PREFIX + 'top',
        STYLE_PADDING_RIGHT = STYLE_PADDING_PREFIX + 'right',
        STYLE_PADDING_LEFT = STYLE_PADDING_PREFIX + 'left',
        STYLE_PADDING_BOTTOM = STYLE_PADDING_PREFIX + 'bottom',
        // threshold for removing similar zoom levels (closer to 1 is more similar)
        ZOOM_LEVEL_SIMILARITY_THRESHOLD = 0.95,
        // threshold for removing similar zoom presets (e.g., auto, fit-width, etc)
        ZOOM_LEVEL_PRESETS_SIMILARITY_THRESHOLD = 0.99;

    var util = scope.getUtility('common'),
        support = scope.getUtility('support');

    /**
     * Apply a zoom transform to the layout using width/height
     * (using width/height instead)
     * @param   {float} zoom The zoom value
     * @returns {void}
     * @private
     */
    function applyZoomResize(layout, zoom) {
        // manually resize pages width/height
        var i, len, pageState, cssRule,
            state = layout.state,
            selector = '.' + layout.config.namespace + ' .' + CSS_CLASS_PAGE_AUTOSCALE,
            stylesheet = layout.config.stylesheet,
            pages = state.pages,
            scale = zoom * layout.config.pageScale,
            percent = 100 / scale;

        // apply css transform or zoom to autoscale layer (eg., text, links, user content)
        if (support.csstransform) {
            cssRule = support.csstransform + ':scale(' + scale + ');' +
                'width:' + percent + '%;' +
                'height:' + percent + '%;';
        } else if (support.csszoom) {
            cssRule = 'zoom:' + scale;
        } else {
            // should not happen...
            cssRule = '';
        }

        // remove the previous style if there is one
        if (state.previousStyleIndex) {
            util.deleteCSSRule(stylesheet, state.previousStyleIndex);
        }
        // create a new rule for the autoscale layer
        state.previousStyleIndex = util.appendCSSRule(stylesheet, selector, cssRule);

        // update width/height/padding on all pages
        for (i = 0, len = pages.length; i < len; ++i) {
            pageState = pages[i];
            layout.$pages.eq(i).css({
                width: pageState.actualWidth * zoom,
                height: pageState.actualHeight * zoom,
                paddingTop: pageState.paddingTop * zoom,
                paddingRight: pageState.paddingRight * zoom,
                paddingBottom: pageState.paddingBottom * zoom,
                paddingLeft: pageState.paddingLeft * zoom
            });
        }
    }

    /**
     * Get the maximum y1 value for pages in the current row
     * (or Infinity if there are no pages in the current row yet)
     * @param {Array} pages Array of pages to search
     * @param {Array} row   Array of page indexes (i.e., the row)
     * @returns {number} The max y1 value
     * @private
     */
    function getMaxY1InRow(pages, row) {
        if (!row || row.length === 0) {
            return Infinity;
        }
        var y1s = util.map(row, function (pageIndex) {
            return pages[pageIndex].y1;
        });
        return Math.max.apply(Math, y1s);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
        messages: ['resize', 'scroll', 'scrollend'],

        /**
         * Handle framework messages
         * @param {string} name The name of the message
         * @param {Object} data The related data for the message
         * @returns {void}
         */
        onmessage: function (name, data) {
            switch (name) {
                case 'resize':
                    this.handleResize(data);
                    break;
                case 'scroll':
                    this.handleScroll(data);
                    break;
                case 'scrollend':
                    this.handleScrollEnd(data);
                    break;
                // no default
            }
        },

        /**
         * Initialize the Layout component
         * @returns {void}
         */
        init: function () {
            var config = scope.getConfig();
            this.config = config;
            // shortcut references to jq DOM objects
            this.$el = config.$el;
            this.$doc = config.$doc;
            this.$viewport = config.$viewport;
            this.$pages = config.$pages;
            this.numPages = config.numPages;

            // add the layout css class
            this.layoutClass = CSS_CLASS_LAYOUT_PREFIX + config.layout;
            this.$el.addClass(this.layoutClass);

            this.initState();
            this.updatePageStates();
            this.updateZoomLevels();
        },

        /**
         * Initalize the state object
         * @returns {void}
         */
        initState: function () {
            var viewportEl = this.$viewport[0],
                dimensionsEl = viewportEl;

            // use the documentElement for viewport dimensions
            // if we are using the window as the viewport
            if (viewportEl === window) {
                dimensionsEl = document.documentElement;
            }
            // setup initial state
            this.state = {
                pages: [],
                widestPage: {
                    index: 0,
                    actualWidth: 0
                },
                tallestPage: {
                    index: 0,
                    actualHeight: 0
                },
                sumWidths: 0,
                sumHeights: 0,
                rows: [],
                scrollTop: viewportEl.scrollTop,
                scrollLeft: viewportEl.scrollLeft,
                viewportDimensions: {
                    clientWidth: dimensionsEl.clientWidth,
                    clientHeight: dimensionsEl.clientHeight,
                    offsetWidth: dimensionsEl.offsetWidth,
                    offsetHeight: dimensionsEl.offsetHeight
                },
                zoomState: {
                    zoom: 1,
                    prevZoom: 0,
                    zoomMode: null
                },
                currentPage: null,
                visiblePages: [],
                fullyVisiblePages: [],
                initialWidth: 0,
                initialHeight: 0
            };
            this.zoomLevels = [];
        },

        /**
         * Destroy the Layout component
         * @returns {void}
         */
        destroy: function () {
            this.$doc.removeAttr('style');
            this.$pages.css('padding', '');
            this.$el.removeClass(this.layoutClass);
        },

        /**
         * Set the zoom level for the layout
         * @param {float|string} val The zoom level (float or one of the zoom constants)
         */
        setZoom: function (val) {
            var state = this.state,
                zoom = this.parseZoomValue(val),
                zoomState = state.zoomState,
                currentZoom = zoomState.zoom,
                zoomMode,
                shouldNotCenter;

            // update the zoom mode if we landed on a named mode
            zoomMode = this.calculateZoomMode(val, zoom);

            //respect zoom constraints
            zoom = util.clamp(zoom, state.minZoom, state.maxZoom);

            scope.broadcast('beforezoom', util.extend({
                page: state.currentPage,
                visiblePages: util.extend([], state.visiblePages),
                fullyVisiblePages: util.extend([], state.fullyVisiblePages)
            }, zoomState));

            // update the zoom state
            zoomState.prevZoom = currentZoom;
            zoomState.zoom = zoom;
            zoomState.zoomMode = zoomMode;

            // apply the zoom to the actual DOM element(s)
            this.applyZoom(zoom);

            // can the document be zoomed in/out further?
            zoomState.canZoomIn = this.calculateNextZoomLevel(Crocodoc.ZOOM_IN) !== false;
            zoomState.canZoomOut = this.calculateNextZoomLevel(Crocodoc.ZOOM_OUT) !== false;

            // update page states, because they will have changed after zooming
            this.updatePageStates();

            // layout mode specific stuff
            this.updateLayout();

            // update scroll position for the new zoom
            // @NOTE: updateScrollPosition() must be called AFTER updateLayout(),
            // because the scrollable space may change in updateLayout
            // @NOTE: shouldNotCenter is true when using a named zoom level
            // so that resizing the browser zooms to the current page offset
            // rather than to the center like when zooming in/out
            shouldNotCenter = val === Crocodoc.ZOOM_AUTO ||
                              val === Crocodoc.ZOOM_FIT_WIDTH ||
                              val === Crocodoc.ZOOM_FIT_HEIGHT;
            this.updateScrollPosition(shouldNotCenter);

            // update again, because updateLayout could have changed page positions
            this.updatePageStates();

            // make sure the visible pages are accurate (also update css classes)
            this.updateVisiblePages(true);

            // broadcast zoom event with new zoom state
            scope.broadcast('zoom', util.extend({
                page: state.currentPage,
                visiblePages: util.extend([], state.visiblePages),
                fullyVisiblePages: util.extend([], state.fullyVisiblePages),
                isDraggable: this.isDraggable()
            }, zoomState));
        },

        /**
         * Returns true if the layout is currently draggable
         * (in this case that means that the viewport is scrollable)
         * @returns {Boolean} Whether this layout is draggable
         */
        isDraggable: function () {
            var state = this.state;
            return (state.viewportDimensions.clientHeight < state.totalHeight) ||
                   (state.viewportDimensions.clientWidth < state.totalWidth);
        },

        /**
         * Parse the given zoom value into a number to zoom to.
         * @param   {float|string} val The zoom level (float or one of the zoom constants)
         * @returns {float} The parsed zoom level
         */
        parseZoomValue: function (val) {
            var zoomVal = parseFloat(val),
                state = this.state,
                zoomState = state.zoomState,
                currentZoom = zoomState.zoom,
                nextZoom = currentZoom;

            // number
            if (zoomVal) {
                nextZoom = zoomVal;
            } else {
                switch (val) {
                    case Crocodoc.ZOOM_FIT_WIDTH:
                        // falls through
                    case Crocodoc.ZOOM_FIT_HEIGHT:
                        // falls through
                    case Crocodoc.ZOOM_AUTO:
                        nextZoom = this.calculateZoomValue(val);
                        break;

                    case Crocodoc.ZOOM_IN:
                        // falls through
                    case Crocodoc.ZOOM_OUT:
                        nextZoom = this.calculateNextZoomLevel(val) || currentZoom;
                        break;

                    // bad mode or no value
                    default:
                        // if there hasn't been a zoom set yet
                        if (!currentZoom) {
                            //use default zoom
                            nextZoom = this.calculateZoomValue(this.config.zoom || Crocodoc.ZOOM_AUTO);
                        }
                        else if (zoomState.zoomMode) {
                            //adjust zoom
                            nextZoom = this.calculateZoomValue(zoomState.zoomMode);
                        } else {
                            nextZoom = currentZoom;
                        }
                        break;
                }
            }

            return nextZoom;
        },

        /**
         * Calculates the new zoomMode given the input val and the parsed zoom value
         * @param   {float|string} val  The input zoom value
         * @param   {float} parsedZoom  The parsed zoom value
         * @returns {string|null}       The new zoom move
         */
        calculateZoomMode: function (val, parsedZoom) {
            // check if we landed on a named mode
            switch (parsedZoom) {
                case this.calculateZoomValue(Crocodoc.ZOOM_AUTO):
                    // if the value passed is a named zoom mode, use that, because
                    // fitheight and fitwidth can sometimes clash with auto (else use auto)
                    if (typeof val === 'string' &&
                        (val === Crocodoc.ZOOM_FIT_WIDTH || val === Crocodoc.ZOOM_FIT_HEIGHT))
                    {
                        return val;
                    }
                    return Crocodoc.ZOOM_AUTO;
                case this.calculateZoomValue(Crocodoc.ZOOM_FIT_WIDTH):
                    return Crocodoc.ZOOM_FIT_WIDTH;
                case this.calculateZoomValue(Crocodoc.ZOOM_FIT_HEIGHT):
                    return Crocodoc.ZOOM_FIT_HEIGHT;
                default:
                    return null;
            }
        },

        /**
         * Update zoom levels and the min and max zoom
         * @returns {void}
         */
        updateZoomLevels: function () {
            var i, lastZoomLevel,
                zoomLevels = this.config.zoomLevels.slice() || [1],
                auto = this.calculateZoomValue(Crocodoc.ZOOM_AUTO),
                fitWidth = this.calculateZoomValue(Crocodoc.ZOOM_FIT_WIDTH),
                fitHeight = this.calculateZoomValue(Crocodoc.ZOOM_FIT_HEIGHT),
                presets = [fitWidth, fitHeight];

            // update min and max zoom before adding presets into the mix
            // because presets should not be able to override min/max zoom
            this.state.minZoom = this.config.minZoom || zoomLevels[0];
            this.state.maxZoom = this.config.maxZoom || zoomLevels[zoomLevels.length - 1];

            // if auto is not the same as fitWidth or fitHeight,
            // add it as a possible next zoom
            if (auto !== fitWidth && auto !== fitHeight) {
                presets.push(auto);
            }

            // add auto-zoom levels and sort
            zoomLevels = zoomLevels.concat(presets);
            zoomLevels.sort(function sortZoomLevels(a, b){
                return a - b;
            });

            this.zoomLevels = [];

            /**
             * Return true if we should use this zoom level
             * @param   {number} zoomLevel The zoom level to consider
             * @returns {boolean}          True if we should keep this level
             * @private
             */
            function shouldUseZoomLevel(zoomLevel) {
                var similarity = lastZoomLevel / zoomLevel;
                // remove duplicates
                if (zoomLevel === lastZoomLevel) {
                    return false;
                }
                // keep anything that is within the similarity threshold
                if (similarity < ZOOM_LEVEL_SIMILARITY_THRESHOLD) {
                    return true;
                }
                // check if it's a preset
                if (util.inArray(zoomLevel, presets) > -1) {
                    // keep presets if they are within a higher threshold
                    if (similarity < ZOOM_LEVEL_PRESETS_SIMILARITY_THRESHOLD) {
                        return true;
                    }
                }
                return false;
            }

            // remove duplicates from sorted list, and remove unnecessary levels
            // @NOTE: some zoom levels end up being very close to the built-in
            // presets (fit-width/fit-height/auto), which makes zooming previous
            // or next level kind of annoying when the zoom level barely changes.
            // This fixes that by applying a threshold to the zoom levels to
            // each preset, and removing the non-preset version if the
            // ratio is below the threshold.
            lastZoomLevel = 0;
            for (i = 0; i < zoomLevels.length; ++i) {
                if (shouldUseZoomLevel(zoomLevels[i])) {
                    lastZoomLevel = zoomLevels[i];
                    this.zoomLevels.push(lastZoomLevel);
                }
            }
        },

        /**
         * Calculate the next zoom level for zooming in or out
         * @param   {string} direction Can be either Crocodoc.ZOOM_IN or Crocodoc.ZOOM_OUT
         * @returns {number|boolean} The next zoom level or false if the viewer cannot be
         *                               zoomed in the given direction
         */
        calculateNextZoomLevel: function (direction) {
            var i,
                zoom = false,
                currentZoom = this.state.zoomState.zoom,
                zoomLevels = this.zoomLevels;

            if (direction === Crocodoc.ZOOM_IN) {
                for (i = 0; i < zoomLevels.length; ++i) {
                    if (zoomLevels[i] > currentZoom) {
                        zoom = zoomLevels[i];
                        break;
                    }
                }
            } else if (direction === Crocodoc.ZOOM_OUT) {
                for (i = zoomLevels.length - 1; i >= 0; --i) {
                    if (zoomLevels[i] < currentZoom) {
                        zoom = zoomLevels[i];
                        break;
                    }
                }
            }

            return zoom;
        },

        /**
         * Calculate the numeric value for a given zoom mode (or return the value if it's already numeric)
         * @param   {string} mode The mode to zoom to
         * @returns {float}       The zoom value
         */
        calculateZoomValue: function (mode) {
            var state = this.state,
                val = parseFloat(mode);
            if (val) {
                return val;
            }
            if (mode === Crocodoc.ZOOM_FIT_WIDTH) {
                return state.viewportDimensions.clientWidth / state.widestPage.totalActualWidth;
            }
            else if (mode === Crocodoc.ZOOM_FIT_HEIGHT) {
                return state.viewportDimensions.clientHeight / state.tallestPage.totalActualHeight;
            }
            else if (mode === Crocodoc.ZOOM_AUTO) {
                return this.calculateZoomAutoValue();
            } else {
                return state.zoomState.zoom;
            }
        },

        /**
         * Apply the given zoom to the pages
         * @param   {float} zoom The zoom value
         * @returns {void}
         */
        applyZoom: function (zoom) {
            applyZoomResize(this, zoom);
        },

        /**
         * Scroll to the given value (page number or one of the scroll constants)
         * @param   {int|string} val  The value to scroll to
         * @returns {void}
         */
        scrollTo: function (val) {
            var state = this.state,
                pageNum = parseInt(val, 10);
            if (typeof val === 'string') {
                if (val === Crocodoc.SCROLL_PREVIOUS && state.currentPage > 1) {
                    pageNum = this.calculatePreviousPage();
                }
                else if (val === Crocodoc.SCROLL_NEXT && state.currentPage < this.numPages) {
                    pageNum = this.calculateNextPage();
                }
                else if (!pageNum) {
                    return;
                }
            }
            else if (!pageNum && pageNum !== 0) {
                // pageNum is not a number
                return;
            }
            pageNum = util.clamp(pageNum, 1, this.numPages);
            this.scrollToPage(pageNum);
        },

        /**
         * Scrolls by the given pixel amount from the current location
         * @param  {int} left Left offset to scroll to
         * @param  {int} top  Top offset to scroll to
         * @returns {void}
         */
        scrollBy: function (left, top) {
            left = parseInt(left, 10) || 0;
            top = parseInt(top, 10) || 0;
            this.scrollToOffset(left + this.state.scrollLeft, top + this.state.scrollTop);
        },

        /**
         * Scroll to the given page number
         * @param   {int} page The page number to scroll to
         * @returns {void}
         */
        scrollToPage: function (page) {
            var offset = this.calculateScrollPositionForPage(page);
            this.scrollToOffset(offset.left, offset.top);
        },

        /**
         * Calculate which page is currently the "focused" page.
         * By default, it's just the state's current page.
         * @NOTE: this method will be overridden in most layouts.
         * @returns {int} The current page
         */
        calculateCurrentPage: function () {
            return this.state.currentPage;
        },

        /**
         * Given a page number, return an object with top and left properties
         * of the scroll position for that page
         * @param   {int} pageNum The page number
         * @returns {Object}      The scroll position object
         */
        calculateScrollPositionForPage: function (pageNum) {
            var index = util.clamp(pageNum - 1, 0, this.numPages - 1),
                page = this.state.pages[index];
            return { top: page.y0, left: page.x0 };
        },

        /**
         * Calculates the current range of pages that are visible
         * @returns {Object} Range object with min and max values
         */
        calculateVisibleRange: function () {
            var state = this.state,
                viewportY0 = state.scrollTop,
                viewportY1 = viewportY0 + state.viewportDimensions.clientHeight,
                viewportX0 = state.scrollLeft,
                viewportX1 = viewportX0 + state.viewportDimensions.clientWidth,
                lowY = util.bisectLeft(state.pages, viewportY0, 'y1'),
                highY = util.bisectRight(state.pages, viewportY1, 'y0') - 1,
                lowX = util.bisectLeft(state.pages, viewportX0, 'x1'),
                highX = util.bisectRight(state.pages, viewportX1, 'x0') - 1,
                low = Math.max(lowX, lowY),
                high = Math.min(highX, highY);
            return util.constrainRange(low, high, this.numPages - 1);
        },

        /**
         * Calculates the current range of pages that are fully visible
         * @returns {Object} Range object with min and max values
         */
        calculateFullyVisibleRange: function () {
            var state = this.state,
                viewportY0 = state.scrollTop,
                viewportY1 = viewportY0 + state.viewportDimensions.clientHeight,
                viewportX0 = state.scrollLeft,
                viewportX1 = viewportX0 + state.viewportDimensions.clientWidth,
                lowY = util.bisectLeft(state.pages, viewportY0, 'y0'),
                highY = util.bisectRight(state.pages, viewportY1, 'y1') - 1,
                lowX = util.bisectLeft(state.pages, viewportX0, 'x0'),
                highX = util.bisectRight(state.pages, viewportX1, 'x1') - 1,
                low = Math.max(lowX, lowY),
                high = Math.min(highX, highY);
            return util.constrainRange(low, high, this.numPages - 1);
        },

        /**
         * Scroll to the given left and top offset
         * @param   {int} left The left offset
         * @param   {int} top  The top offset
         * @returns {void}
         */
        scrollToOffset: function (left, top) {
            this.$viewport.scrollLeft(left);
            this.$viewport.scrollTop(top);
        },

        /**
         * Set the current page, update the visible pages, and broadcast a
         * pagefocus  message if the given page is not already the current page
         * @param {int} page The page number
         */
        setCurrentPage: function (page) {
            var state = this.state;
            if (state.currentPage !== page) {
                // page has changed
                state.currentPage = page;
                this.updateVisiblePages();
                scope.broadcast('pagefocus', {
                    page: state.currentPage,
                    numPages: this.numPages,
                    visiblePages: util.extend([], state.visiblePages),
                    fullyVisiblePages: util.extend([], state.fullyVisiblePages)
                });
            } else {
                // still update visible pages!
                this.updateVisiblePages();
            }
        },

        /**
         * Calculate and update which pages are visible,
         * possibly updating CSS classes on the pages
         * @param {boolean} updateClasses Wheter to update page CSS classes as well
         * @returns {void}
         */
        updateVisiblePages: function (updateClasses) {
            var i, len, $page,
                state = this.state,
                visibleRange = this.calculateVisibleRange(),
                fullyVisibleRange = this.calculateFullyVisibleRange();
            state.visiblePages.length = 0;
            state.fullyVisiblePages.length = 0;
            for (i = 0, len = this.$pages.length; i < len; ++i) {
                $page = this.$pages.eq(i);
                if (i < visibleRange.min || i > visibleRange.max) {
                    if (updateClasses && $page.hasClass(CSS_CLASS_PAGE_VISIBLE)) {
                        $page.removeClass(CSS_CLASS_PAGE_VISIBLE);
                    }
                } else {
                    if (updateClasses && !$page.hasClass(CSS_CLASS_PAGE_VISIBLE)) {
                        $page.addClass(CSS_CLASS_PAGE_VISIBLE);
                    }
                    state.visiblePages.push(i + 1);
                }
                if (i >= fullyVisibleRange.min && i <= fullyVisibleRange.max) {
                    state.fullyVisiblePages.push(i + 1);
                }
            }
        },

        /**
         * Update page positions, sizes, and rows
         * @param {boolean} [forceUpdatePaddings] If true, force update page paddings
         * @returns {void}
         */
        updatePageStates: function (forceUpdatePaddings) {
            var state = this.state,
                pages = state.pages,
                rows = state.rows,
                scrollTop = this.$viewport.scrollTop(),
                scrollLeft = this.$viewport.scrollLeft(),
                rowIndex = 0,
                lastY1 = 0,
                rightmostPageIndex = 0,
                bottommostPageIndex = 0,
                i,
                len,
                page,
                pageEl,
                $pageEl;

            rows.length = state.sumWidths = state.sumHeights = state.totalWidth = state.totalHeight = 0;
            state.widestPage.totalActualWidth = state.tallestPage.totalActualHeight = 0;

            // update the x/y positions and sizes of each page
            // this is basically used as a cache, since accessing the DOM is slow
            for (i = 0, len = this.$pages.length; i < len; ++i) {
                $pageEl = this.$pages.eq(i);
                pageEl = $pageEl[0];
                page = pages[i];
                if (!page || forceUpdatePaddings) {
                    $pageEl.css('padding', '');
                    page = {
                        index: i,
                        // only get paddings on the first updatePageStates
                        // @TODO: look into using numeric versions of these styles in IE for better perf
                        paddingLeft: parseFloat($pageEl.css(STYLE_PADDING_LEFT)),
                        paddingRight: parseFloat($pageEl.css(STYLE_PADDING_RIGHT)),
                        paddingTop: parseFloat($pageEl.css(STYLE_PADDING_TOP)),
                        paddingBottom: parseFloat($pageEl.css(STYLE_PADDING_BOTTOM))
                    };
                }

                if (!page.actualWidth) {
                    page.actualWidth = parseFloat(pageEl.getAttribute('data-width'));
                }
                if (!page.actualHeight) {
                    page.actualHeight = parseFloat(pageEl.getAttribute('data-height'));
                }

                page.totalActualWidth = page.actualWidth + page.paddingLeft + page.paddingRight;
                page.totalActualHeight = page.actualHeight + page.paddingTop + page.paddingBottom;

                page.width = pageEl.offsetWidth;
                page.height = pageEl.offsetHeight;
                page.x0 = pageEl.offsetLeft;
                page.y0 = pageEl.offsetTop;

                page.x1 = page.width + page.x0;
                page.y1 = page.height + page.y0;

                // it is in the same rowIndex as the prev if y0 >= prev rowIndex max y1
                // @NOTE: we add two pixels to y0, because sometimes there
                // seems to be a little overlap #youcantexplainthat
                // @TODO: #explainthat
                if (lastY1 && getMaxY1InRow(pages, rows[rowIndex]) <= page.y0 + 2) {
                    rowIndex++;
                }
                lastY1 = page.y1;
                if (!rows[rowIndex]) {
                    rows[rowIndex] = [];
                }
                // all pages are not created equal
                if (page.totalActualWidth > state.widestPage.totalActualWidth) {
                    state.widestPage = page;
                }
                if (page.totalActualHeight > state.tallestPage.totalActualHeight) {
                    state.tallestPage = page;
                }
                state.sumWidths += page.width;
                state.sumHeights += page.height;
                page.rowIndex = rowIndex;
                pages[i] = page;
                rows[rowIndex].push(i);

                if (pages[rightmostPageIndex].x0 + pages[rightmostPageIndex].width < page.x0 + page.width) {
                    rightmostPageIndex = i;
                }
                if (pages[bottommostPageIndex].y0 + pages[bottommostPageIndex].height < page.y0 + page.height) {
                    bottommostPageIndex = i;
                }
            }

            state.totalWidth = pages[rightmostPageIndex].x0 + pages[rightmostPageIndex].width;
            state.totalHeight = pages[bottommostPageIndex].y0 + pages[bottommostPageIndex].height;
            state.scrollTop = scrollTop;
            state.scrollLeft = scrollLeft;
            this.setCurrentPage(this.calculateCurrentPage());
        },

        /**
         * Calculate and update the current page
         * @returns {void}
         */
        updateCurrentPage: function () {
            var currentPage = this.calculateCurrentPage();
            this.setCurrentPage(currentPage);
        },

        /**
         * Handle resize messages
         * @param   {Object} data Object containing width and height of the viewport
         * @returns {void}
         */
        handleResize: function (data) {
            var zoomMode = this.state.zoomState.zoomMode;
            this.state.viewportDimensions = data;
            this.updateZoomLevels();
            this.setZoom(zoomMode);
        },

        /**
         * Handle scroll messages
         * @param   {Object} data Object containing scrollTop and scrollLeft of the viewport
         * @returns {void}
         */
        handleScroll: function (data) {
            this.state.scrollTop = data.scrollTop;
            this.state.scrollLeft = data.scrollLeft;
        },

        /**
         * Handle scrollend messages (forwarded to handleScroll)
         * @param   {Object} data Object containing scrollTop and scrollLeft of the viewport
         * @returns {void}
         */
        handleScrollEnd: function (data) {
            // update CSS classes
            this.$doc.find('.' + CSS_CLASS_CURRENT_PAGE).removeClass(CSS_CLASS_CURRENT_PAGE);
            this.$pages.eq(this.state.currentPage - 1).addClass(CSS_CLASS_CURRENT_PAGE);
            this.updateVisiblePages(true);
            this.handleScroll(data);
        },

        /**
         * Update the scroll position after a zoom
         * @param {bool} shouldNotCenter Whether or not the scroll position
         *                               should be updated to center the new
         *                               zoom level
         * @returns {void}
         */
        updateScrollPosition: function (shouldNotCenter) {
            var state = this.state,
                zoomState = state.zoomState,
                ratio = zoomState.zoom / zoomState.prevZoom,
                newScrollLeft, newScrollTop;

            // update scroll position
            newScrollLeft = state.scrollLeft * ratio;
            newScrollTop = state.scrollTop * ratio;

            // zoom to center
            if (shouldNotCenter !== true) {
                newScrollTop += state.viewportDimensions.offsetHeight * (ratio - 1) / 2;
                newScrollLeft += state.viewportDimensions.offsetWidth * (ratio - 1) / 2;
            }

            // scroll!
            this.scrollToOffset(newScrollLeft, newScrollTop);
        },

        /**
         * Focuses the viewport so it can be natively scrolled with the keyboard
         * @returns {void}
         */
        focus: function () {
            this.$viewport.focus();
        },

        /** MUST BE IMPLEMENTED IN LAYOUT **/
        updateLayout: function () {},
        calculateZoomAutoValue: function () { return 1; },
        calculateNextPage: function () { return 1; },
        calculatePreviousPage: function () { return 1; }
    };
});

/**
 * The horizontal layout
 */
Crocodoc.addComponent('layout-' + Crocodoc.LAYOUT_HORIZONTAL, ['layout-base'], function (scope, base) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var util = scope.getUtility('common'),
        browser = scope.getUtility('browser');

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return util.extend({}, base, {

        /**
         * Calculate the numeric value for zoom 'auto' for this layout mode
         * @returns {float} The zoom value
         */
        calculateZoomAutoValue: function () {
            var state = this.state,
                fitWidth = this.calculateZoomValue(Crocodoc.ZOOM_FIT_WIDTH),
                fitHeight = this.calculateZoomValue(Crocodoc.ZOOM_FIT_HEIGHT);

            // landscape
            if (state.widestPage.actualWidth > state.tallestPage.actualHeight) {
                return Math.min(fitWidth, fitHeight);
            }
            // portrait
            else {
                if (browser.mobile) {
                    return fitHeight;
                }
                // limit max zoom to 1.0
                return Math.min(1, fitHeight);
            }
        },

        /**
         * Calculate which page is currently the "focused" page.
         * In horizontal mode, this is the page farthest to the left,
         * where at least half of the page is showing.
         * @returns {int} The current page
         */
        calculateCurrentPage: function () {
            var prev, page,
                state = this.state,
                pages = state.pages;

            prev = util.bisectRight(pages, state.scrollLeft, 'x0') - 1;
            page = util.bisectRight(pages, state.scrollLeft + pages[prev].width / 2, 'x0') - 1;
            return 1 + page;
        },

        /**
         * Calculates the next page
         * @returns {int} The next page number
         */
        calculateNextPage: function () {
            return this.state.currentPage + 1;
        },

        /**
         * Calculates the previous page
         * @returns {int} The previous page number
         */
        calculatePreviousPage: function () {
            return this.state.currentPage - 1;
        },

        /**
         * Handle resize mesages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleResize: function (data) {
            base.handleResize.call(this, data);
            this.updateCurrentPage();
        },

        /**
         * Handle scroll mesages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleScroll: function (data) {
            base.handleScroll.call(this, data);
            this.updateCurrentPage();
        },

        /**
         * Updates the layout elements (pages, doc, etc) CSS
         * appropriately for the current zoom level
         * @returns {void}
         */
        updateLayout: function () {
            var state = this.state,
                zoomState = state.zoomState,
                zoom = zoomState.zoom,
                zoomedWidth = state.sumWidths,
                zoomedHeight = Math.floor(state.tallestPage.totalActualHeight * zoom),
                docWidth = Math.max(zoomedWidth, state.viewportDimensions.clientWidth),
                docHeight = Math.max(zoomedHeight, state.viewportDimensions.clientHeight);

            this.$doc.css({
                height: docHeight,
                lineHeight: docHeight + 'px',
                width: docWidth
            });
        }
    });
});


/**
 * The presentation-two-page layout
 */
Crocodoc.addComponent('layout-' + Crocodoc.LAYOUT_PRESENTATION_TWO_PAGE, ['layout-' + Crocodoc.LAYOUT_PRESENTATION], function (scope, presentation) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var util = scope.getUtility('common');

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return util.extend({}, presentation, {
        /**
         * Initialize the presentation-two-page layout component
         * @returns {void}
         */
        init: function () {
            this.twoPageMode = true;
            presentation.init.call(this);
        },

        /**
         * Calculates the next page
         * @returns {int} The next page number
         */
        calculateNextPage: function () {
            return this.state.currentPage + 2;
        },

        /**
         * Calculates the previous page
         * @returns {int} The previous page number
         */
        calculatePreviousPage: function () {
            return this.state.currentPage - 2;
        },

        /**
         * Calculate the numeric value for a given zoom mode (or return the value if it's already numeric)
         * @param   {string} mode The mode to zoom to
         * @returns {float}       The zoom value
         */
        calculateZoomValue: function (mode) {
            var baseVal = presentation.calculateZoomValue.call(this, mode);
            if (mode === Crocodoc.ZOOM_FIT_WIDTH) {
                baseVal /= 2;
            }
            return baseVal;
        },

        /**
         * Scroll to the given page number
         * @param   {int} page The page number to scroll to
         * @returns {void}
         */
        scrollToPage: function (page) {
            // pick the left page
            presentation.scrollToPage.call(this, page - (page + 1) % 2);
        },

        /**
         * Calculates the current range of pages that are visible
         * @returns {Object} Range object with min and max values
         */
        calculateVisibleRange: function () {
            var min = this.state.currentPage - 1,
                max = min + 1;
            return util.constrainRange(min, max, this.numPages);
        },

        /**
         * Calculates the current range of pages that are fully visible
         * @NOTE: this can be incorrect for presentations that are zoomed in
         * past the size of the viewport... I'll fix it if it becomes an issue
         * @returns {Object} Range object with min and max values
         */
        calculateFullyVisibleRange: function () {
            return this.calculateVisibleRange();
        }
    });
});

/**
 *The presentation layout
 */
Crocodoc.addComponent('layout-' + Crocodoc.LAYOUT_PRESENTATION, ['layout-base'], function (scope, base) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var CSS_CLASS_PAGE_PREFIX = 'crocodoc-page-',
        CSS_CLASS_PAGE_PREV = CSS_CLASS_PAGE_PREFIX + 'prev',
        CSS_CLASS_PAGE_NEXT = CSS_CLASS_PAGE_PREFIX + 'next',
        CSS_CLASS_PAGE_BEFORE = CSS_CLASS_PAGE_PREFIX + 'before',
        CSS_CLASS_PAGE_AFTER = CSS_CLASS_PAGE_PREFIX + 'after',
        CSS_CLASS_PAGE_BEFORE_BUFFER = CSS_CLASS_PAGE_PREFIX + 'before-buffer',
        CSS_CLASS_PAGE_AFTER_BUFFER = CSS_CLASS_PAGE_PREFIX + 'after-buffer',
        CSS_CLASS_CURRENT_PAGE = 'crocodoc-current-page',
        PRESENTATION_CSS_CLASSES = [
            CSS_CLASS_PAGE_NEXT,
            CSS_CLASS_PAGE_AFTER,
            CSS_CLASS_PAGE_PREV,
            CSS_CLASS_PAGE_BEFORE,
            CSS_CLASS_PAGE_BEFORE_BUFFER,
            CSS_CLASS_PAGE_AFTER_BUFFER
        ].join(' ');

    var util = scope.getUtility('common');

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return util.extend({}, base, {
        /**
         * Initialize the presentation layout component
         * @returns {void}
         */
        init: function () {
            base.init.call(this);
            this.updatePageMargins();
            this.updatePageClasses();
        },

        /**
         * Destroy the component
         * @returns {void}
         */
        destroy: function () {
            base.destroy.call(this);
            this.$pages.css({ margin: '', left: '' }).removeClass(PRESENTATION_CSS_CLASSES);
        },

        /**
         * Calculate the numeric value for zoom 'auto' for this layout mode
         * @returns {float} The zoom value
         */
        calculateZoomAutoValue: function () {
            var fitWidth = this.calculateZoomValue(Crocodoc.ZOOM_FIT_WIDTH),
                fitHeight = this.calculateZoomValue(Crocodoc.ZOOM_FIT_HEIGHT);
            return Math.min(fitWidth, fitHeight);
        },

        /**
         * Calculate which page is currently the "focused" page.
         * In presentation mode, it's just the state's current page.
         * @returns {int} The current page
         */
        calculateCurrentPage: function () {
            return this.state.currentPage;
        },

        /**
         * Calculates the next page
         * @returns {int} The next page number
         */
        calculateNextPage: function () {
            return this.state.currentPage + 1;
        },

        /**
         * Calculates the previous page
         * @returns {int} The previous page number
         */
        calculatePreviousPage: function () {
            return this.state.currentPage - 1;
        },

        /**
         * Calculates the current range of pages that are visible
         * @returns {Object} Range object with min and max values
         */
        calculateVisibleRange: function () {
            var index = this.state.currentPage - 1;
            return util.constrainRange(index, index, this.numPages);
        },

        /**
         * Calculates the current range of pages that are fully visible
         * @NOTE: this can be incorrect for presentations that are zoomed in
         * past the size of the viewport... I'll fix it if it becomes an issue
         * @returns {Object} Range object with min and max values
         */
        calculateFullyVisibleRange: function () {
            return this.calculateVisibleRange();
        },

        /**
         * Set the current page and updatePageClasses
         * @param {int} page The page number
         */
        setCurrentPage: function (page) {
            var index = util.clamp(page - 1, 0, this.numPages);
            base.setCurrentPage.call(this, page);
            // update CSS classes
            this.$doc.find('.' + CSS_CLASS_CURRENT_PAGE).removeClass(CSS_CLASS_CURRENT_PAGE);
            this.$pages.eq(this.state.currentPage - 1).addClass(CSS_CLASS_CURRENT_PAGE);
            this.updateVisiblePages(true);
            this.updatePageClasses(index);
        },

        /**
         * Scroll to the given page number
         * @param   {int} page The page number to scroll to
         * @returns {void}
         */
        scrollToPage: function (page) {
            this.setCurrentPage(page);
        },

        /**
         * Updates the layout elements (pages, doc, etc) CSS
         * appropriately for the current zoom level
         * @returns {void}
         */
        updateLayout: function () {
            var state = this.state,
                zoomState = state.zoomState,
                zoom = zoomState.zoom,
                page = this.currentPage || 1,
                currentPage = state.pages[page - 1],
                secondPage = this.twoPageMode ? state.pages[page] : currentPage,
                viewportWidth = state.viewportDimensions.clientWidth,
                viewportHeight = state.viewportDimensions.clientHeight,
                secondPageWidth,
                currentPageWidth,
                currentPageHeight,
                zoomedWidth, zoomedHeight,
                docWidth, docHeight;

            secondPageWidth = secondPage.actualWidth;
            currentPageWidth = currentPage.actualWidth + (this.twoPageMode ? secondPageWidth : 0);
            currentPageHeight = currentPage.actualHeight;

            zoomedWidth = Math.floor((currentPageWidth + currentPage.paddingLeft + secondPage.paddingRight) * zoom);
            zoomedHeight = Math.floor((currentPage.totalActualHeight) * zoom);

            docWidth = Math.max(zoomedWidth, viewportWidth);
            docHeight = Math.max(zoomedHeight, viewportHeight);

            this.$doc.css({
                width: docWidth,
                height: docHeight
            });

            this.updatePageMargins();

            if (docWidth > viewportWidth || docHeight > viewportHeight) {
                this.$el.addClass('crocodoc-scrollable');
            } else {
                this.$el.removeClass('crocodoc-scrollable');
            }
        },

        /**
         * Update page margins for the viewport size and zoom level
         * @returns {void}
         */
        updatePageMargins: function () {
            var i, len, page, $page,
                width, height, left, top, paddingH,
                state = this.state,
                viewportWidth = state.viewportDimensions.clientWidth,
                viewportHeight = state.viewportDimensions.clientHeight;
            // update pages so they are centered (preserving margins)
            for (i = 0, len = this.$pages.length; i < len; ++i) {
                $page = this.$pages.eq(i);
                page = state.pages[i];

                if (this.twoPageMode) {
                    paddingH = (i % 2 === 1) ? page.paddingRight : page.paddingLeft;
                } else {
                    paddingH = page.paddingRight + page.paddingLeft;
                }
                width = (page.actualWidth + paddingH) * state.zoomState.zoom;
                height = (page.actualHeight + page.paddingTop + page.paddingBottom) * state.zoomState.zoom;

                if (this.twoPageMode) {
                    left = Math.max(0, (viewportWidth - width * 2) / 2);
                    if (i % 2 === 1) {
                        left += width;
                    }
                } else {
                    left = (viewportWidth - width) / 2;
                }
                top = (viewportHeight - height) / 2;
                left = Math.max(left, 0);
                top = Math.max(top, 0);
                $page.css({
                    marginLeft: left,
                    marginTop: top
                });
            }
        },

        /**
         * Update page classes for presentation mode transitions
         * @returns {void}
         */
        updatePageClasses: function () {
            var $pages = this.$pages,
                index = this.state.currentPage - 1,
                next = index + 1,
                prev = index - 1,
                buffer = 20;

            // @TODO: optimize this a bit
            // add/removeClass is expensive, so try using hasClass
            $pages.removeClass(PRESENTATION_CSS_CLASSES);
            if (this.twoPageMode) {
                next = index + 2;
                prev = index - 2;
                $pages.slice(Math.max(prev, 0), index).addClass(CSS_CLASS_PAGE_PREV);
                $pages.slice(next, next + 2).addClass(CSS_CLASS_PAGE_NEXT);
            } else {
                if (prev >= 0) {
                    $pages.eq(prev).addClass(CSS_CLASS_PAGE_PREV);
                }
                if (next < this.numPages) {
                    $pages.eq(next).addClass(CSS_CLASS_PAGE_NEXT);
                }
            }
            $pages.slice(0, index).addClass(CSS_CLASS_PAGE_BEFORE);
            $pages.slice(Math.max(0, index - buffer), index).addClass(CSS_CLASS_PAGE_BEFORE_BUFFER);
            $pages.slice(next).addClass(CSS_CLASS_PAGE_AFTER);
            $pages.slice(next, Math.min(this.numPages, next + buffer)).addClass(CSS_CLASS_PAGE_AFTER_BUFFER);

            /*
            // OPTIMIZATION CODE NOT YET WORKING PROPERLY
            $pages.slice(0, index).each(function () {
                var $p = $(this),
                    i = $p.index(),
                    toAdd = '',
                    toRm = '';
                if (!$p.hasClass(beforeClass.trim())) toAdd += beforeClass;
                if ($p.hasClass(nextClass.trim())) toRm += nextClass;
                if ($p.hasClass(afterClass.trim())) toRm += afterClass;
                if ($p.hasClass(afterBufferClass.trim())) toRm += afterBufferClass;
                if (i >= index - buffer && !$p.hasClass(beforeBufferClass.trim()))
                    toAdd += beforeBufferClass;
                else if ($p.hasClass(beforeBufferClass.trim()))
                    toRm += beforeBufferClass;
                if (i >= prev && !$p.hasClass(prevClass.trim()))
                    toAdd += prevClass;
                else if ($p.hasClass(prevClass.trim()))
                    toRm += prevClass;
                $p.addClass(toAdd).removeClass(toRm);
//                console.log('before', $p.index(), toRm, toAdd);
            });
            $pages.slice(next).each(function () {
                var $p = $(this),
                    i = $p.index(),
                    toAdd = '',
                    toRm = '';
                if (!$p.hasClass(afterClass.trim())) toAdd += afterClass;
                if ($p.hasClass(prevClass.trim())) toRm += prevClass;
                if ($p.hasClass(beforeClass.trim())) toRm += beforeClass;
                if ($p.hasClass(beforeBufferClass.trim())) toRm += beforeBufferClass;
                if (i <= index + buffer && !$p.hasClass(afterBufferClass.trim()))
                    toAdd += afterBufferClass;
                else if ($p.hasClass(afterBufferClass.trim()))
                    toRm += afterBufferClass;
                if (i <= next + 1 && !$p.hasClass(nextClass.trim()))
                    toAdd += nextClass;
                else if ($p.hasClass(nextClass.trim()))
                    toRm += nextClass;
                $p.addClass(toAdd).removeClass(toRm);
//                console.log('after', $p.index(), toRm, toAdd);
            });*/
        }
    });
});

/**
 * The vertical-single-column layout
 */
Crocodoc.addComponent('layout-' + Crocodoc.LAYOUT_VERTICAL_SINGLE_COLUMN, ['layout-' + Crocodoc.LAYOUT_VERTICAL], function (scope, vertical) {

    'use strict';

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    // there is nothing different about this layout aside from the name (and CSS class name)
    // so we can just return the vertical layout
    return vertical;
});

/**
 * The vertical layout
 */
Crocodoc.addComponent('layout-' + Crocodoc.LAYOUT_VERTICAL, ['layout-base'], function (scope, base) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var util = scope.getUtility('common'),
        browser = scope.getUtility('browser');

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return util.extend({}, base, {

        /**
         * Calculate the numeric value for zoom 'auto' for this layout mode
         * @returns {float} The zoom value
         */
        calculateZoomAutoValue: function () {
            var state = this.state,
                fitWidth = this.calculateZoomValue(Crocodoc.ZOOM_FIT_WIDTH),
                fitHeight = this.calculateZoomValue(Crocodoc.ZOOM_FIT_HEIGHT);

            if (state.widestPage.actualWidth > state.tallestPage.actualHeight) {
                // landscape
                // max zoom 1 for vertical mode
                return Math.min(1, fitWidth, fitHeight);
            } else {
                // portrait
                if (browser.mobile) {
                    return fitWidth;
                }
                // limit max zoom to 100% of the doc
                return Math.min(1, fitWidth);
            }
        },

        /**
         * Calculate which page is currently the "focused" page.
         * In vertical mode, this is the page at the top (and if multiple columns, the leftmost page),
         * where at least half of the page is showing.
         * @returns {int} The current page
         */
        calculateCurrentPage: function () {
            var prevPageIndex,
                currentPageIndex,
                rowIndex,
                row,
                offset,
                state = this.state,
                pages = state.pages;

            prevPageIndex = util.bisectRight(pages, state.scrollTop, 'y0') - 1;
            if (prevPageIndex < 0) {
                return 1;
            }
            offset = state.scrollTop + pages[prevPageIndex].height / 2;
            currentPageIndex = util.bisectRight(pages, offset, 'y0') - 1;
            rowIndex = pages[currentPageIndex].rowIndex;
            row = state.rows[rowIndex];
            return 1 + row[0];

        },

        /**
         * Calculates the next page
         * @returns {int} The next page number
         */
        calculateNextPage: function () {
            var state = this.state,
                currentPage = state.pages[state.currentPage - 1],
                rowIndex = currentPage.rowIndex,
                nextRow = state.rows[rowIndex + 1];
            return nextRow && nextRow[0] + 1 || state.currentPage;
        },

        /**
         * Calculates the previous page
         * @returns {int} The previous page number
         */
        calculatePreviousPage: function () {
            var state = this.state,
                currentPage = state.pages[state.currentPage - 1],
                rowIndex = currentPage.rowIndex,
                prevRow = state.rows[rowIndex - 1];
            return prevRow && prevRow[0] + 1 || state.currentPage;
        },

        /**
         * Handle resize mesages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleResize: function (data) {
            base.handleResize.call(this, data);
            this.updateCurrentPage();
        },

        /**
         * Handle scroll mesages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleScroll: function (data) {
            base.handleScroll.call(this, data);
            this.updateCurrentPage();
        },

        /**
         * Updates the layout elements (pages, doc, etc) CSS
         * appropriately for the current zoom level
         * @returns {void}
         */
        updateLayout: function () {
            // vertical stuff
            var state = this.state,
                zoom = state.zoomState.zoom,
                zoomedWidth,
                docWidth;

            zoomedWidth = Math.floor(state.widestPage.totalActualWidth * zoom);

            // use clientWidth for the doc (prevent scrollbar)
            // use width:auto when possible
            if (zoomedWidth <= state.viewportDimensions.clientWidth) {
                docWidth = 'auto';
            } else {
                docWidth = zoomedWidth;
            }

            this.$doc.css({
                width: docWidth
            });
        }
    });
});


/*global setTimeout, clearTimeout*/

/**
 * lazy-loader component for controlling when pages should be loaded and unloaded
 */
Crocodoc.addComponent('lazy-loader', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var util = scope.getUtility('common'),
        browser = scope.getUtility('browser'),
        api = {},
        pages,
        numPages,
        pagefocusTriggerLoadingTID,
        pageLoadTID,
        pageLoadQueue = [],
        pageLoadRange = 1,
        pageLoadingStopped = true,
        scrollDirection = 1,
        layoutState = {
            page: 1,
            visiblePages: [1]
        };

    var PAGE_LOAD_ERROR_MAX_RETRIES = 1,
        PAGE_LOAD_INTERVAL = (browser.mobile || browser.ielt10) ? 100 : 50, //ms between initiating page loads
        MAX_PAGE_LOAD_RANGE = (browser.mobile || browser.ielt10) ? 8 : 32;

    /**
     * Create and return a range object (eg., { min: x, max: y })
     * for the current pageLoadRange constrained to the number of pages
     * @param  {int} range The range from current page
     * @returns {Object}    The range object
     * @private
     */
    function calculateRange(range) {
        range = range || pageLoadRange;
        var currentIndex = layoutState.page - 1,
            low = currentIndex - range,
            high = currentIndex + range;
        return util.constrainRange(low, high, numPages - 1);
    }

    /**
     * Loop through the pageLoadQueue and load pages sequentially,
     * setting a timeout to run again after PAGE_LOAD_INTERVAL ms
     * until the queue is empty
     * @returns {void}
     * @private
     */
    function pageLoadLoop() {
        var index;
        clearTimeout(pageLoadTID);
        if (pageLoadQueue.length > 0) {
            // found a page to load
            index = pageLoadQueue.shift();
            // page exists and not reached max errors?
            if (pages[index] && pages[index].errorCount <= PAGE_LOAD_ERROR_MAX_RETRIES) {
                api.loadPage(index, function loadPageCallback(pageIsLoading) {
                    if (pageIsLoading === false) {
                        // don't wait if the page is not loading
                        pageLoadLoop();
                    } else {
                        pageLoadTID = setTimeout(pageLoadLoop, PAGE_LOAD_INTERVAL);
                    }
                });
            } else {
                pageLoadLoop();
            }
        } else {
            stopPageLoadLoop();
        }
    }

    /**
     * Start the page load loop
     * @returns {void}
     * @private
     */
    function startPageLoadLoop() {
        clearTimeout(pageLoadTID);
        pageLoadingStopped = false;
        pageLoadTID = setTimeout(pageLoadLoop, PAGE_LOAD_INTERVAL);
    }

    /**
     * Stop the page load loop
     * @returns {void}
     * @private
     */
    function stopPageLoadLoop() {
        clearTimeout(pageLoadTID);
        pageLoadingStopped = true;
    }

    /**
     * Add a page to the page load queue and start the page
     * load loop if necessary
     * @param  {int} index The index of the page to add
     * @returns {void}
     * @private
     */
    function pushPageLoadQueue(index) {
        pageLoadQueue.push(index);
        if (pageLoadingStopped) {
            startPageLoadLoop();
        }
    }

    /**
     * Clear all pages from the page load queue and stop the loop
     * @returns {void}
     * @private
     */
    function clearPageLoadQueue() {
        pageLoadQueue.length = 0;
        stopPageLoadLoop();
    }

    /**
     * Returns true if the given index is in the page load range, and false otherwise
     * @param   {int} index The page index
     * @param   {int} rangeLength The page range length
     * @returns {bool}      Whether the page index is in the page load range
     * @private
     */
    function indexInRange(index, rangeLength) {
        var range = calculateRange(rangeLength);
        if (index >= range.min && index <= range.max) {
            return true;
        }
        return false;
    }

    /**
     * Returns true if the given page index should be loaded, and false otherwise
     * @param   {int} index The page index
     * @returns {bool}      Whether the page should be loaded
     * @private
     */
    function shouldLoadPage(index) {
        var page = pages[index];

        // does the page exist?
        if (page) {

            // within page load range?
            if (indexInRange(index)) {
                return true;
            }

            // is it visible?
            if (pageIsVisible(index)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Returns true if the given page index should be unloaded, and false otherwise
     * @param   {int} index The page index
     * @param   {int} rangeLength The range length
     * @returns {bool}      Whether the page should be unloaded
     * @private
     */
    function shouldUnloadPage(index, rangeLength) {

        // within page load range?
        if (indexInRange(index, rangeLength)) {
            return false;
        }

        // is it visible?
        if (pageIsVisible(index)) {
            return false;
        }

        return true;
    }

    /**
     * Returns true if the given page is visible, and false otherwise
     * @param   {int} index The page index
     * @returns {bool}      Whether the page is visible
     * @private
     */
    function pageIsVisible(index) {
        // is it visible?
        return util.inArray(index + 1, layoutState.visiblePages) > -1;
    }

    /**
     * Queues pages to load in order from indexFrom to indexTo
     * @param   {number} start The page index to start at
     * @param   {number} end   The page index to end at
     * @returns {void}
     */
    function queuePagesToLoadInOrder(start, end) {
        var increment = util.sign(end - start);

        while (start !== end) {
            api.queuePageToLoad(start);
            start += increment;
        }
        api.queuePageToLoad(start);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return util.extend(api, {
        messages: [
            'beforezoom',
            'pageavailable',
            'pagefocus',
            'scroll',
            'scrollend',
            'zoom'
        ],

        /**
         * Handle framework messages
         * @param {string} name The name of the message
         * @param {Object} data The related data for the message
         * @returns {void}
         */
        onmessage: function (name, data) {
            switch (name) {
                case 'beforezoom':
                    this.handleBeforeZoom(data);
                    break;
                case 'pageavailable':
                    this.handlePageAvailable(data);
                    break;
                case 'pagefocus':
                    this.handlePageFocus(data);
                    break;
                case 'scroll':
                    this.handleScroll(data);
                    break;
                case 'scrollend':
                    this.handleScrollEnd(data);
                    break;
                case 'zoom':
                    this.handleZoom(data);
                    break;
                // no default
            }
        },

        /**
         * Initialize the LazyLoader component
         * @param {Array} pageComponents The array of page components to lazily load
         * @returns {void}
         */
        init: function (pageComponents) {
            pages = pageComponents;
            numPages = pages.length;
            pageLoadRange = Math.min(MAX_PAGE_LOAD_RANGE, numPages);
        },

        /**
         * Destroy the LazyLoader component
         * @returns {void}
         */
        destroy: function () {
            this.cancelAllLoading();
        },

        /**
         * Updates the current layout state and scroll direction
         * @param   {Object} state The layout state
         * @returns {void}
         */
        updateLayoutState: function (state) {
            scrollDirection = util.sign(state.page - layoutState.page);
            layoutState = state;
        },

        /**
         * Queue pages to load in the following order:
         * 1) current page
         * 2) visible pages
         * 3) pages within pageLoadRange of the viewport
         * @returns {void}
         * @NOTE: this function is debounced so it will not load and abort
         * several times if called a lot in a short time
         */
        loadNecessaryPages: util.debounce(100, function () {
            // cancel anything that happens to be loading first
            this.cancelAllLoading();

            // load current page first
            this.queuePageToLoad(layoutState.page - 1);

            // then load pages that are visible in the viewport
            this.loadVisiblePages();

            // then load pages beyond the viewport
            this.loadPagesInRange(pageLoadRange);
        }),

        /**
         * Queue pages to load within the given range such that
         * proceeding pages are added before preceding pages
         * @param  {int} range The range to load beyond the current page
         * @returns {void}
         */
        loadPagesInRange: function (range) {
            var currentIndex = layoutState.page - 1;
            if (range > 0) {
                range = calculateRange(range);
                // load pages in the order of priority based on the direction
                // the user is scrolling (load nearest page first, working in
                // the scroll direction, then start on the opposite side of
                // scroll direction and work outward)
                // NOTE: we're assuming that a negative scroll direction means
                // direction of previous pages, and positive is next pages...
                if (scrollDirection >= 0) {
                    queuePagesToLoadInOrder(currentIndex + 1, range.max);
                    queuePagesToLoadInOrder(currentIndex - 1, range.min);
                } else {
                    queuePagesToLoadInOrder(currentIndex - 1, range.min);
                    queuePagesToLoadInOrder(currentIndex + 1, range.max);
                }
            }
        },

        /**
         * Queue to load all pages that are visible according
         * to the current layoutState
         * @returns {void}
         */
        loadVisiblePages: function () {
            var i, len;
            for (i = 0, len = layoutState.visiblePages.length; i < len; ++i) {
                this.queuePageToLoad(layoutState.visiblePages[i] - 1);
            }
        },

        /**
         * Add the page at the given index to the page load queue
         * and call the preload function on the page
         * @param  {int} index The index of the page to load
         * @returns {void}
         */
        queuePageToLoad: function (index) {
            if (shouldLoadPage(index)) {
                pages[index].preload();
                pushPageLoadQueue(index);
            }
        },

        /**
         * Clear the page load queue
         * @returns {void}
         */
        cancelAllLoading: function () {
            clearTimeout(pagefocusTriggerLoadingTID);
            clearPageLoadQueue();
        },

        /**
         * Call the load method on the page object at the specified index
         * @param  {int}      index    The index of the page to load
         * @param  {Function} callback Callback function to call always (regardless of page load success/fail)
         * @returns {void}
         */
        loadPage: function (index, callback) {
            $.when(pages[index] && pages[index].load())
                .fail(function handlePageLoadFail(err) {
                    pages[index].errorCount = pages[index].errorCount || 0;
                    // the page failed for some reason...
                    // put it back in the queue to be loaded again immediately
                    // try reloading a page PAGE_LOAD_ERROR_MAX_RETRIES times before giving up
                    if (pages[index].errorCount < PAGE_LOAD_ERROR_MAX_RETRIES) {
                        pageLoadQueue.unshift(index);
                    } else {
                        // the page failed to load after retry
                        pages[index].fail(err);
                    }
                    pages[index].errorCount++;
                })
                .always(callback);
        },

        /**
         * Call the unload method on the page object at the specified index
         * @param  {int} index The page index
         * @returns {void}
         */
        unloadPage: function (index) {
            var page = pages[index];
            if (page) {
                page.unload();
            }
        },

        /**
         * Unload all pages that are not within the given range (nor visible)
         * @param {int} rangeLength The page range length
         * @returns {void}
         */
        unloadUnnecessaryPages: function (rangeLength) {
            var i, l;
            // remove out-of-range SVG from DOM
            for (i = 0, l = pages.length; i < l; ++i) {
                if (shouldUnloadPage(i, rangeLength)) {
                    this.unloadPage(i);
                }
            }
        },

        /**
         * Handle pageavailable messages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handlePageAvailable: function (data) {
            var i;
            if (data.page) {
                this.queuePageToLoad(data.page - 1);
            } else if (data.upto) {
                for (i = 0; i < data.upto; ++i) {
                    this.queuePageToLoad(i);
                }
            }
        },

        /**
         * Handle pagefocus messages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handlePageFocus: function (data) {
            this.updateLayoutState(data);
            this.cancelAllLoading();
            // set a timeout to trigger loading so we dont cause unnecessary layouts while scrolling
            pagefocusTriggerLoadingTID = setTimeout(function () {
                api.loadNecessaryPages();
            }, 200);
        },

        /**
         * Handle beforezoom messages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleBeforeZoom: function (data) {
            this.cancelAllLoading();
            // @NOTE: for performance reasons, we unload as many pages as possible just before zooming
            // so we don't have to layout as many pages at a time immediately after the zoom.
            // This is arbitrarily set to 2x the number of visible pages before the zoom, and
            // it seems to work alright.
            this.unloadUnnecessaryPages(data.visiblePages.length * 2);
        },

        /**
         * Handle zoom messages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleZoom: function (data) {
            this.updateLayoutState(data);
            this.loadNecessaryPages();
        },

        /**
         * Handle scroll messages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleScroll: function () {
            this.cancelAllLoading();
        },

        /**
         * Handle scrollend messages
         * @param   {Object} data The message data
         * @returns {void}
         */
        handleScrollEnd: function () {
            this.loadNecessaryPages();
            this.unloadUnnecessaryPages(pageLoadRange);
        }
    });
});

/**
 * page-img component used to display raster image instead of SVG content for
 * browsers that do not support SVG
 */
Crocodoc.addComponent('page-img', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var browser = scope.getUtility('browser');

    var $img, $el,
        imgSrc,
        loading = false,
        removeOnUnload = browser.mobile;

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
        /**
         * Initialize the page-img component
         * @param  {Object} config Configuration object
         * @returns {void}
         */
        init: function (el, config) {
            $el = $(el);
            imgSrc = config.imgSrc + (config.queryString || '');
        },

        /**
         * Destroy the page-img component
         * @returns {void}
         */
        destroy: function () {
            $el.empty();
        },

        /**
         * Preload does nothing in this component -- it's here for
         * consistency with the page-svg component API
         * @returns {void}
         */
        preload: function () { /* noop */ },

        /**
         * Load the image
         * @returns {$.Deferred}    A jQuery Deferred object
         */
        load: function () {
            var $deferred = $.Deferred();
            if (!$img) {
                // image hasn't been loaded yet, so create an image
                var img = new window.Image();
                loading = true;
                // add load and error handlers
                img.onload = function () {
                    loading = false;
                    $deferred.resolve();
                };
                img.onerror = function () {
                    $img = null;
                    $deferred.reject({
                        error: 'failed to load image'
                    });
                };
                // load the image
                img.src = imgSrc;
                // insert into the DOM
                $img = $(img);
                $el.html($img);
            } else {
                if (!loading) {
                    $deferred.resolve();
                }
            }
            $img.show();
            return $deferred;
        },

        /**
         * Unload (or hide) the img
         * @returns {void}
         */
        unload: function () {
            loading = false;
            if (removeOnUnload) {
                $img.remove();
                $img = null;
            } else if ($img) {
                $img.hide();
            }
        }
    };
});

/**
 * page-links component definition
 */
Crocodoc.addComponent('page-links', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var CSS_CLASS_PAGE_LINK = 'crocodoc-page-link';

    var $el;

    /**
     * Create a link element given link data
     * @param   {Object} link The link data
     * @returns {void}
     * @private
     */
    function createLink(link) {
        var $link = $('<a>').addClass(CSS_CLASS_PAGE_LINK),
            left = link.bbox[0],
            top = link.bbox[1],
            attr = {};
        $link.css({
            left: left + 'pt',
            top: top + 'pt',
            width: link.bbox[2] - left + 'pt',
            height: link.bbox[3] - top + 'pt'
        });
        if (link.uri) {
            if (/^http|^mailto/.test(link.uri)) {
                attr.href = encodeURI(link.uri);
                attr.target = '_blank';
            } else {
                // don't embed this link... we don't trust the protocol
                return;
            }
        } else if (link.destination) {
            attr.href = '#page-' + link.destination.pagenum;
        }
        $link.attr(attr);
        $link.data('link', link);
        $link.appendTo($el);
    }

    /**
     * Handle link clicks
     * @param   {Event} ev The event object
     * @returns {void}
     * @private
     */
    function handleClick(ev) {
        var $link = $(ev.target),
            data = $link.data('link');
        if (data) {
            scope.broadcast('linkclicked', data);
        }
        ev.preventDefault();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
        /**
         * Initialize the page-links component
         * @param  {Array} links Links configuration array
         * @returns {void}
         */
        init: function (el, links) {
            $el = $(el);
            this.createLinks(links);
            $el.on('click', '.'+CSS_CLASS_PAGE_LINK, handleClick);
        },

        /**
         * Destroy the page-links component
         * @returns {void}
         */
        destroy: function () {
            $el.empty().off('click');
        },

        /**
         * Create and insert link elements into the element
         * @param   {Array} links Array of link data
         * @returns {void}
         */
        createLinks: function (links) {
            var i, len;
            for (i = 0, len = links.length; i < len; ++i) {
                createLink(links[i]);
            }
        }
    };
});

/**
 * page-svg component
 */
Crocodoc.addComponent('page-svg', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    // @NOTE: MAX_DATA_URLS is the maximum allowed number of data-urls in svg
    // content before we give up and stop rendering them
    var MAX_DATA_URLS = 1000,
        SVG_MIME_TYPE = 'image/svg+xml',
        HTML_TEMPLATE = '<style>html,body{width:100%;height:100%;margin:0;overflow:hidden;}</style>',
        SVG_CONTAINER_TEMPLATE = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"><script><![CDATA[('+proxySVG+')()]]></script></svg>',

        // Embed the svg in an iframe (initialized to about:blank), and inject
        // the SVG directly to the iframe window using document.write()
        // @NOTE: this breaks images in Safari because [?]
        EMBED_STRATEGY_IFRAME_INNERHTML = 1,

        // Embed the svg with a data-url
        // @NOTE: ff allows direct script access to objects embedded with a data url,
        //        and this method prevents a throbbing spinner because document.write
        //        causes a spinner in ff
        // @NOTE: NOT CURRENTLY USED - this breaks images in firefox because:
        //        https://bugzilla.mozilla.org/show_bug.cgi?id=922433
        EMBED_STRATEGY_DATA_URL = 2,

        // Embed the svg directly in html via inline svg.
        // @NOTE: NOT CURRENTLY USED -  seems to be slow everywhere, but I'm keeping
        //        this here because it's very little extra code, and inline SVG might
        //        be better some day?
        EMBED_STRATEGY_INLINE_SVG = 3,

        // Embed the svg directly with an object tag; don't replace linked resources
        // @NOTE: NOT CURRENTLY USED - this is only here for testing purposes, because
        //        it works in every browser; it doesn't support query string params
        //        and causes a spinner
        EMBED_STRATEGY_BASIC_OBJECT = 4,

        // Embed the svg directly with an img tag; don't replace linked resources
        // @NOTE: NOT CURRENTLY USED - this is only here for testing purposes
        EMBED_STRATEGY_BASIC_IMG = 5,

        // Embed a proxy svg script as an object tag via data:url, which exposes a
        // loadSVG method on its contentWindow, then call the loadSVG method directly
        // with the svg text as the argument
        // @NOTE: only works in firefox because of its security policy on data:uri
        EMBED_STRATEGY_DATA_URL_PROXY = 6,

        // Embed in a way similar to the EMBED_STRATEGY_DATA_URL_PROXY, but in this
        // method we use an iframe initialized to about:blank and document.write()
        // the proxy script before calling loadSVG on the iframe's contentWindow
        // @NOTE: this is a workaround for the image issue with EMBED_STRATEGY_IFRAME_INNERHTML
        //        in safari; it also works in firefox, but causes a spinner because of
        //        document.write()
        EMBED_STRATEGY_IFRAME_PROXY = 7,

        // Embed in an img tag via data:url, downloading stylesheet separately, and
        // injecting it into the data:url of SVG text before embedding
        // @NOTE: this method seems to be more performant on IE
        EMBED_STRATEGY_DATA_URL_IMG = 8;

    var util = scope.getUtility('common'),
        ajax    = scope.getUtility('ajax'),
        browser = scope.getUtility('browser'),
        subpx = scope.getUtility('subpx'),
        DOMParser = window.DOMParser;

    var $svg, $svgLayer,
        $loadSVGTextPromise,
        request,
        config,
        baseURL,
        queryString,
        svgSrc,
        svgText,
        destroyed = false,
        unloaded = false,
        svgLoaded = false,
        viewerConfig = scope.getConfig(),
        removeOnUnload = browser.mobile || browser.ielt10,
        embedStrategy = browser.ie ? EMBED_STRATEGY_DATA_URL_IMG :
                        browser.firefox ? EMBED_STRATEGY_DATA_URL_IMG :
                        browser.safari ? EMBED_STRATEGY_IFRAME_PROXY :
                        EMBED_STRATEGY_IFRAME_INNERHTML;

    /**
     * Create and return a jQuery object for the SVG element
     * @returns {Object} The SVG $element
     * @private
     */
    function createSVGEl() {
        switch (embedStrategy) {
            case EMBED_STRATEGY_IFRAME_INNERHTML:
            case EMBED_STRATEGY_IFRAME_PROXY:
                return $('<iframe>');

            case EMBED_STRATEGY_DATA_URL_PROXY:
            case EMBED_STRATEGY_DATA_URL:
                return $('<object>').attr({
                    type: SVG_MIME_TYPE,
                    data: 'data:'+SVG_MIME_TYPE+';base64,' + window.btoa(SVG_CONTAINER_TEMPLATE)
                });

            case EMBED_STRATEGY_INLINE_SVG:
                // just return a div with 100% w/h and the svg will be inserted on load
                return $('<div style="width:100%; height:100%;">');

            case EMBED_STRATEGY_BASIC_OBJECT:
                return $('<object>');

            case EMBED_STRATEGY_BASIC_IMG:
            case EMBED_STRATEGY_DATA_URL_IMG:
                return $('<img>');

            // no default
        }
    }

    /**
     * Create the svg element if it hasn't been created,
     * insert the SVG into the DOM if necessary
     * @returns {void}
     * @private
     */
    function prepareSVGContainer() {
        if (!$svg || $svg.length === 0) {
            svgLoaded = false;
            $svg = createSVGEl();
        }
        if ($svg.parent().length === 0) {
            $svg.appendTo($svgLayer);
        }
    }

    /**
     * Process SVG text and return the embeddable result
     * @param   {string} text The original SVG text
     * @returns {string}      The processed SVG text
     */
    function processSVGText(text) {
        var query = queryString.replace('&', '&#38;'),
            dataUrlCount,
            stylesheetHTML;

        dataUrlCount = util.countInStr(text, 'xlink:href="data:image');
        // remove data:urls from the SVG content if the number exceeds MAX_DATA_URLS
        if (dataUrlCount > MAX_DATA_URLS) {
            // remove all data:url images that are smaller than 5KB
            text = text.replace(/<image[\s\w-_="]*xlink:href="data:image\/[^"]{0,5120}"[^>]*>/ig, '');
        }

        // @TODO: remove this, because we no longer use any external assets in this way
        // modify external asset urls for absolute path
        text = text.replace(/href="([^"#:]*)"/g, function (match, group) {
            return 'href="' + baseURL + group + query + '"';
        });

        // CSS text
        stylesheetHTML = '<style>' + viewerConfig.cssText + '</style>';

        // If using Firefox with no subpx support, add "text-rendering" CSS.
        // @NOTE(plai): We are not adding this to Chrome because Chrome supports "textLength"
        // on tspans and because the "text-rendering" property slows Chrome down significantly.
        // In Firefox, we're waiting on this bug: https://bugzilla.mozilla.org/show_bug.cgi?id=890692
        // @TODO: Use feature detection instead (textLength)
        if (browser.firefox && !subpx.isSubpxSupported()) {
            stylesheetHTML += '<style>text { text-rendering: geometricPrecision; }</style>';
        }

        // inline the CSS!
        text = text.replace(/<xhtml:link[^>]*>/, stylesheetHTML);

        return text;
    }

    /**
     * Load svg text if necessary
     * @returns {$.Promise}
     * @private
     */
    function loadSVGText() {
        // already load(ed|ing)?
        if ($loadSVGTextPromise) {
            return $loadSVGTextPromise;
        }
        var url = svgSrc + queryString,
            $deferred = $.Deferred();

        if (!$svg) {
            $deferred.reject({
                error: 'Error creating SVG element',
                status: 200,
                resource: url
            });
            return;
        }

        request = ajax.request(url, {
            success: function () {
                if (destroyed) {
                    return;
                }
                // we need to replace & characters in the query string, because they are invalid in SVG
                var text = this.responseText;

                // if the response comes back empty,
                if (!text) {
                    $deferred.reject({
                        error: 'Response was empty',
                        status: 200,
                        resource: url
                    });
                    return;
                }

                text = processSVGText(text);

                svgText = text;

                $deferred.resolve();
            },
            fail: function () {
                if (destroyed) {
                    return;
                }
                svgText = null;
                $deferred.reject({
                    error: this.statusText,
                    status: this.status,
                    resource: url
                });
            }
        });

        $loadSVGTextPromise = $deferred.promise();
        return $loadSVGTextPromise;
    }


    /**
     * Embed the SVG into the page
     * @returns {void}
     * @private
     */
    function embedSVG() {
        var domParser,
            svgDoc,
            svgEl,
            html,
            dataURLPrefix,
            contentDocument = $svg[0].contentDocument,
            contentWindow = $svg[0].contentWindow ||
                             // @NOTE: supports older versions of ff
                            contentDocument && contentDocument.defaultView;

        switch (embedStrategy) {
            case EMBED_STRATEGY_IFRAME_INNERHTML:
                // @NOTE: IE 9 fix. This line in the file is causing the page not to render in IE 9.
                // The link is not needed here anymore because we are including the stylesheet separately.
                if (browser.ie && browser.version < 10) {
                    svgText = svgText.replace(/<xhtml:link.*/,'');
                }
                html = HTML_TEMPLATE + svgText;
                // @NOTE: documentElement.innerHTML is read-only in IE
                if (browser.ie && browser.version < 10) {
                    contentDocument.body.innerHTML = html;
                } else {
                    contentDocument.documentElement.innerHTML = html;
                }
                svgEl = contentDocument.getElementsByTagName('svg')[0];
                break;

            case EMBED_STRATEGY_IFRAME_PROXY:
                contentDocument.documentElement.innerHTML = HTML_TEMPLATE;
                var head = contentDocument.getElementsByTagName('head')[0] || contentDocument.documentElement,
                    script = contentDocument.createElement('script'),
                    data = '('+proxySVG+')()'; // IIFE to create window.loadSVG
                script.type = 'text/javascript';
                try {
                    // doesn't work on ie...
                    script.appendChild(document.createTextNode(data));
                } catch(e) {
                    // IE has funky script nodes
                    script.text = data;
                }
                head.insertBefore(script, head.firstChild);
                if (contentDocument.readyState === 'complete') {
                    contentWindow.loadSVG(svgText);
                    if (!removeOnUnload) {
                        svgText = null;
                    }
                } else {
                    contentWindow.onload = function () {
                        this.loadSVG(svgText);
                        if (!removeOnUnload) {
                            svgText = null;
                        }
                    };
                }
                // NOTE: return is necessary here because we are waiting for a callback
                // before unsetting svgText
                return;

            case EMBED_STRATEGY_DATA_URL:
                domParser = new DOMParser();
                svgDoc = domParser.parseFromString(svgText, SVG_MIME_TYPE);
                svgEl = contentDocument.importNode(svgDoc.documentElement, true);
                contentDocument.documentElement.appendChild(svgEl);
                break;

            case EMBED_STRATEGY_DATA_URL_PROXY:
                contentWindow.loadSVG(svgText);
                svgEl = contentDocument.querySelector('svg');
                break;

            case EMBED_STRATEGY_INLINE_SVG:
                domParser = new DOMParser();
                svgDoc = domParser.parseFromString(svgText, SVG_MIME_TYPE);
                svgEl = document.importNode(svgDoc.documentElement, true);
                $svg.append(svgEl);
                break;

            case EMBED_STRATEGY_BASIC_OBJECT:
                $svg.attr({
                    type: SVG_MIME_TYPE,
                    data: svgSrc + queryString
                });
                svgEl = $svg[0];
                break;

            case EMBED_STRATEGY_BASIC_IMG:
                svgEl = $svg[0];
                svgEl.src = svgSrc + queryString;
                break;

            case EMBED_STRATEGY_DATA_URL_IMG:
                svgEl = $svg[0];
                dataURLPrefix = 'data:' + SVG_MIME_TYPE;
                if (!browser.ie && window.btoa) {
                    svgEl.src = dataURLPrefix + ';base64,' + window.btoa(svgText);
                } else {
                    svgEl.src = dataURLPrefix + ',' + encodeURIComponent(svgText);
                }
                break;

            // no default
        }
        if (!removeOnUnload) {
            svgText = null;
        }

        // make sure the svg width/height are explicity set to 100%
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
    }

    /**
     * Creates a global method for loading svg text into the proxy svg object
     * @NOTE: this function should never be called directly in this context;
     * it's converted to a string and encoded into the proxy svg data:url
     * @returns {void}
     * @private
     */
    function proxySVG() {
        window.loadSVG = function (svgText) {
            var domParser = new window.DOMParser(),
                svgDoc = domParser.parseFromString(svgText, 'image/svg+xml'),
                svgEl = document.importNode(svgDoc.documentElement, true);
            // make sure the svg width/height are explicity set to 100%
            svgEl.setAttribute('width', '100%');
            svgEl.setAttribute('height', '100%');

            if (document.body) {
                document.body.appendChild(svgEl);
            } else {
                document.documentElement.appendChild(svgEl);
            }
        };
    }

    /**
     * Function to call when loading is complete (success or not)
     * @param   {*} error Error param; if truthy, assume there was an error
     * @returns {void}
     * @private
     */
    function completeLoad(error) {
        if (error) {
            scope.broadcast('asseterror', error);
            svgLoaded = false;
            $loadSVGTextPromise = null;
        } else {
            if ($svg.parent().length === 0) {
                $svg.appendTo($svgLayer);
            }
            $svg.show();
            svgLoaded = true;
        }
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------


    return {
        /**
         * Initialize the page-svg component
         * @param {jQuery} $el The element to load SVG layer into
         * @param  {Object} conf Configuration object
         * @returns {void}
         */
        init: function ($el, conf) {
            $svgLayer = $el;
            config = conf;
            baseURL = config.url;
            svgSrc = config.svgSrc;
            queryString = config.queryString || '';
            embedStrategy = viewerConfig.embedStrategy || embedStrategy;
        },

        /**
         * Destroy the page-svg component
         * @returns {void}
         */
        destroy: function () {
            destroyed = true;
            this.unload();
            $svgLayer.empty();
        },

        /**
         * Prepare the SVG object to be loaded and start loading SVG text
         * @returns {void}
         */
        preload: function () {
            prepareSVGContainer();
            loadSVGText();
        },

        /**
         * Load the SVG and call callback when complete.
         * If there was an error, callback's first argument will be
         * an error message, and falsy otherwise.
         * @returns {$.Deferred}    A jQuery Deferred object
         */
        load: function () {
            unloaded = false;
            var $deferred = $.Deferred();

            if (svgLoaded) {
                completeLoad();
                $deferred.resolve();
            } else {
                prepareSVGContainer();
                if (embedStrategy === EMBED_STRATEGY_BASIC_OBJECT ||
                    embedStrategy === EMBED_STRATEGY_BASIC_IMG)
                {
                    // don't load the SVG text, just embed the object with
                    // the source pointed at the correct location
                    embedSVG();
                    completeLoad();
                    $deferred.resolve();
                } else {
                    loadSVGText()
                        .then(function loadSVGTextSuccess() {
                            if (destroyed || unloaded) {
                                return;
                            }
                            embedSVG();
                            completeLoad();
                            $deferred.resolve();
                        })
                        .fail(function loadSVGTextFail(error) {
                            completeLoad(error);
                            $deferred.reject(error);
                        })
                        .always(function loadSVGAlways() {
                            request = null;
                        });
                }
            }
            return $deferred;
        },

        /**
         * Unload (or hide) the SVG object
         * @returns {void}
         */
        unload: function () {
            unloaded = true;
            // stop loading the page if it hasn't finished yet
            if (request && request.abort) {
                request.abort();
                request = null;
                $loadSVGTextPromise = null;
            }
            if (removeOnUnload) {
                if ($svg) {
                    $svg.remove();
                    $svg = null;
                }
                svgLoaded = false;
            } else if (svgLoaded) {
                // @NOTE: still consider SVG to be loaded here,
                // since we're merely hiding the DOM element
                $svg.hide();
            }
        }
    };
});

/**
 * page-text component
 */
Crocodoc.addComponent('page-text', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var CSS_CLASS_PAGE_TEXT = 'crocodoc-page-text',
        MAX_TEXT_BOXES = 256;

    var browser = scope.getUtility('browser'),
        subpx   = scope.getUtility('subpx'),
        ajax    = scope.getUtility('ajax'),
        util    = scope.getUtility('common');

    var destroyed = false,
        loaded = false,
        $textLayer,
        request,
        $loadTextLayerHTMLPromise,
        textSrc,
        viewerConfig = scope.getConfig();

    /**
     * Return true if we should use the text layer, false otherwise
     * @returns {bool}
     * @private
     */
    function shouldUseTextLayer() {
        return viewerConfig.enableTextSelection && !browser.ielt9;
    }

    /**
     * Handle success loading HTML text
     * @param {string} text The HTML text
     * @returns {void}
     * @private
     */
    function completeLoad(text) {
        var doc, textEl;

        if (!text || loaded) {
            return;
        }

        loaded = true;

        // in the text layer, divs are only used for text boxes, so
        // they should provide an accurate count
        var numTextBoxes = util.countInStr(text, '<div');
        // too many textboxes... don't load this page for performance reasons
        if (numTextBoxes > MAX_TEXT_BOXES) {
            return;
        }

        // remove reference to the styles
        // @TODO: stylesheet should not be referenced in text layer html
        text = text.replace(/<link rel="stylesheet".*/, '');

        // create a document to parse the html text
        doc = document.implementation.createHTMLDocument('');
        doc.getElementsByTagName('body')[0].innerHTML = text;
        text = null;

        // select just the element we want (CSS_CLASS_PAGE_TEXT)
        textEl = document.importNode(doc.querySelector('.' + CSS_CLASS_PAGE_TEXT), true);
        $textLayer.attr('class', textEl.getAttribute('class'));
        $textLayer.html(textEl.innerHTML);
        subpx.fix($textLayer);
    }

    /**
     * Handle failure loading HTML text
     * @returns {void}
     * @private
     */
    function handleHTMLTextFail(error) {
        scope.broadcast('asseterror', error);
    }

    /**
     * Load text html if necessary and insert it into the element
     * @returns {$.Promise}
     * @private
     */
    function loadTextLayerHTML() {
        // already load(ed|ing)?
        if ($loadTextLayerHTMLPromise) {
            return $loadTextLayerHTMLPromise;
        }
        var $deferred = $.Deferred();

        request = ajax.request(textSrc, {
            success: function () {
                if (destroyed) {
                    return;
                }

                request = null;
                if (this.responseText.length === 0) {
                    handleHTMLTextFail({
                        error: 'empty response',
                        status: this.status,
                        resource: textSrc
                    });
                }

                // always reslove, because text layer failure shouldn't
                // prevent a page from being viewed
                $deferred.resolve(this.responseText);
            },
            fail: function () {
                if (destroyed) {
                    return;
                }

                request = null;
                handleHTMLTextFail({
                    error: this.statusText,
                    status: this.status,
                    resource: textSrc
                });

                // always reslove, because text layer failure shouldn't
                // prevent a page from being viewed
                $deferred.resolve();
            }
        });

        $loadTextLayerHTMLPromise = $deferred.promise();
        return $loadTextLayerHTMLPromise;
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
        /**
         * Initialize the page-text component
         * @param {jQuery} $el The jQuery element to load the text layer into
         * @param  {Object} config Configuration options
         * @returns {void}
         */
        init: function ($el, config) {
            $textLayer = $el;
            textSrc = config.textSrc + config.queryString;
        },

        /**
         * Destroy the page-text component
         * @returns {void}
         */
        destroy: function () {
            destroyed = true;
            $textLayer.empty();
        },

        /**
         * Start loading HTML text
         * @returns {void}
         */
        preload: function () {
            if (shouldUseTextLayer()) {
                loadTextLayerHTML();
            }
        },

        /**
         * Load the html text for the text layer and insert it into the element
         * if text layer is enabled and is not loading/has not already been loaded
         * @returns {$.Promise} A promise to load the text layer or false if the
         * text layer should not be loaded
         */
        load: function () {
            if (shouldUseTextLayer()) {
                return loadTextLayerHTML()
                    .then(completeLoad);
            }
            return false;
        },

        /**
         * Stop loading the text layer (no need to actually remove it)
         * @returns {void}
         */
        unload: function () {
            if (request && request.abort) {
                request.abort();
                request = null;
                $loadTextLayerHTMLPromise = null;
            }
        },

        /**
         * Enable text selection
         * @returns {void}
         */
        enable: function () {
            $textLayer.css('display', '');
        },

        /**
         * Disable text selection
         * @returns {void}
         */
        disable: function () {
            $textLayer.css('display', 'none');
        }
    };
});

/**
 * Page component
 */
Crocodoc.addComponent('page', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var CSS_CLASS_PAGE_PREFIX = 'crocodoc-page-',
        CSS_CLASS_PAGE_LOADING = CSS_CLASS_PAGE_PREFIX + 'loading',
        CSS_CLASS_PAGE_ERROR = CSS_CLASS_PAGE_PREFIX + 'error',
        CSS_CLASS_PAGE_TEXT = CSS_CLASS_PAGE_PREFIX + 'text',
        CSS_CLASS_PAGE_SVG = CSS_CLASS_PAGE_PREFIX + 'svg',
        CSS_CLASS_PAGE_LINKS = CSS_CLASS_PAGE_PREFIX + 'links';

    var support = scope.getUtility('support'),
        util = scope.getUtility('common');

    var $el,
        pageText, pageContent, pageLinks,
        pageNum, index,
        isVisible, status,
        loadRequested = false;

    return {
        errorCount: 0,

        messages: ['pageavailable', 'textenabledchange', 'pagefocus', 'zoom'],

        /**
         * Handle framework messages
         * @param {string} name The name of the message
         * @param {Object} data The related data for the message
         * @returns {void}
         */
        onmessage: function (name, data) {
            switch (name) {
                case 'pageavailable':
                    if (data.page === index + 1 || data.upto > index) {
                        if (status === Crocodoc.PAGE_STATUS_CONVERTING) {
                            status = Crocodoc.PAGE_STATUS_NOT_LOADED;
                        }
                    }
                    break;
                case 'textenabledchange':
                    if (data.enabled === true) {
                        this.enableTextSelection();
                    } else {
                        this.disableTextSelection();
                    }
                    break;
                case 'pagefocus':
                    // falls through
                case 'zoom':
                    isVisible = pageNum === data.page || (util.inArray(pageNum, data.visiblePages) > -1);
                    break;

                // no default
            }
        },

        /**
         * Initialize the Page component
         * @returns {void}
         */
        init: function ($pageEl, config) {
            var $text, $svg, $links;
            $el = $pageEl;
            $svg = $pageEl.find('.' + CSS_CLASS_PAGE_SVG);
            $text = $pageEl.find('.' + CSS_CLASS_PAGE_TEXT);
            $links = $pageEl.find('.' + CSS_CLASS_PAGE_LINKS);

            config.url = config.url || '';
            pageText = scope.createComponent('page-text');
            pageContent = support.svg ?
                    scope.createComponent('page-svg') :
                    scope.createComponent('page-img');

            pageText.init($text, config);
            pageContent.init($svg, config);

            if (config.enableLinks && config.links.length) {
                pageLinks = scope.createComponent('page-links');
                pageLinks.init($links, config.links);
            }

            status = config.status || Crocodoc.PAGE_STATUS_NOT_LOADED;
            index = config.index;
            pageNum = index + 1;
            this.config = config;
        },

        /**
         * Destroy the page component
         * @returns {void}
         */
        destroy: function () {
            this.unload();
        },

        /**
         * Preload the SVG if the page is not loaded
         * @returns {void}
         */
        preload: function () {
            if (status === Crocodoc.PAGE_STATUS_NOT_LOADED) {
                pageContent.preload();
                pageText.preload();
            }
        },

        /**
         * Load and show SVG and text assets for this page
         * @returns {$.Promise}    jQuery Promise object or false if the page is not loading
         */
        load: function () {
            var page = this,
                $pageTextPromise;
            loadRequested = true;

            if (status === Crocodoc.PAGE_STATUS_LOADED || status === Crocodoc.PAGE_STATUS_LOADING) {
                // try to load the text layer even though status is loaded,
                // because it might have been disabled the last time page
                // load was requested
                $pageTextPromise = pageText.load();
                // if the page is not loading, return false
                if ($pageTextPromise && $pageTextPromise.state() !== 'pending') {
                    return false;
                }
                return $pageTextPromise;
            }

            // don't actually load if the page is converting
            if (status === Crocodoc.PAGE_STATUS_CONVERTING) {
                return false;
            }

            $el.removeClass(CSS_CLASS_PAGE_ERROR);

            //load page
            status = Crocodoc.PAGE_STATUS_LOADING;
            return $.when(pageContent.load(), pageText.load())
                .done(function handleLoadDone() {
                    if (loadRequested) {
                        status = Crocodoc.PAGE_STATUS_LOADED;
                        $el.removeClass(CSS_CLASS_PAGE_LOADING);
                        scope.broadcast('pageload', { page: pageNum });
                    } else {
                        page.unload();
                    }
                })
                .fail(function handleLoadFail() {
                    status = Crocodoc.PAGE_STATUS_NOT_LOADED;
                    $el.removeClass(CSS_CLASS_PAGE_LOADING);
                });
        },


        /**
         * Mark the page as failed, i.e., loading will not be retried again for this page
         * and broadcast a pagefail event for this page
         * @param {Object} error The error object
         * @returns {void}
         */
        fail: function (error) {
            status = Crocodoc.PAGE_STATUS_ERROR;
            $el.addClass(CSS_CLASS_PAGE_ERROR);
            scope.broadcast('pagefail', { page: index + 1, error: error });
        },

        /**
         * Unload/hide SVG and text assets for this page
         * @returns {void}
         */
        unload: function () {
            loadRequested = false;
            pageContent.unload();
            pageText.unload();
            if (status === Crocodoc.PAGE_STATUS_LOADED) {
                status = Crocodoc.PAGE_STATUS_NOT_LOADED;
                $el.addClass(CSS_CLASS_PAGE_LOADING);
                $el.removeClass(CSS_CLASS_PAGE_ERROR);
                scope.broadcast('pageunload', { page: pageNum });
            }
        },

        /**
         * Enable text selection, loading text assets if the page is visible
         * @returns {void}
         */
        enableTextSelection: function () {
            pageText.enable();
            if (isVisible) {
                pageText.load();
            }
        },

        /**
         * Disable text selection
         * @returns {void}
         */
        disableTextSelection: function () {
            pageText.disable();
        }
    };
});



/**
 * resizer component definition
 */
Crocodoc.addComponent('resizer', function (scope) {

    'use strict';

    var support = scope.getUtility('support');

    // shorter way of defining
    // 'fullscreenchange webkitfullscreenchange mozfullscreenchange MSFullscreenChange'
    var FULLSCREENCHANGE_EVENT = ['', ' webkit', ' moz', ' ']
        .join('fullscreenchange') +
        // @NOTE: IE 11 uses upper-camel-case for this, which is apparently necessary
        'MSFullscreenChange';

    var $window = $(window),
        $document = $(document),
        element,
        currentClientWidth,
        currentClientHeight,
        currentOffsetWidth,
        currentOffsetHeight,
        resizeFrameID;

    /**
     * Fire the resize event with the proper data
     * @returns {void}
     * @private
     */
    function broadcast() {
        scope.broadcast('resize', {
            // shortcuts for offsetWidth/height
            width: currentOffsetWidth,
            height: currentOffsetHeight,
            // client width is width of the inner, visible area
            clientWidth: currentClientWidth,
            clientHeight: currentClientHeight,
            // offset width is the width of the element, including border,
            // padding, and scrollbars
            offsetWidth: currentOffsetWidth,
            offsetHeight: currentOffsetHeight
        });
    }

    /**
     * Check if the element has resized every animation frame
     * @returns {void}
     * @private
     */
    function loop() {
        support.cancelAnimationFrame(resizeFrameID);
        checkResize();
        resizeFrameID = support.requestAnimationFrame(loop, element);
    }

    /**
     * Check if the element has resized, and broadcast the resize event if so
     * @returns {void}
     * @private
     */
    function checkResize () {
        var newOffsetHeight = element.offsetHeight,
            newOffsetWidth = element.offsetWidth;
        //on touch devices, the offset height is sometimes zero as content is loaded
        if (newOffsetHeight) {
            if (newOffsetHeight !== currentOffsetHeight || newOffsetWidth !== currentOffsetWidth) {
                currentOffsetHeight = newOffsetHeight;
                currentOffsetWidth = newOffsetWidth;
                currentClientHeight = element.clientHeight;
                currentClientWidth = element.clientWidth;
                broadcast();
            }
        }
    }

    return {

        messages: ['layoutchange'],

        /**
         * Handle framework messages
         * @returns {void}
         */
        onmessage: function () {
            // force trigger resize when layout changes
            // @NOTE: we do this because the clientWidth/Height
            // could be different based on the layout (and whether
            // or not the new layout changes scrollbars)
            currentOffsetHeight = null;
            checkResize();
        },

        /**
         * Initialize the Resizer component with an element to watch
         * @param  {HTMLElement} el The element to watch
         * @returns {void}
         */
        init: function (el) {
            element = $(el).get(0);

            // use the documentElement for viewport dimensions
            // if we are using the window as the viewport
            if (element === window) {
                element = document.documentElement;
                $window.on('resize', checkResize);
                // @NOTE: we don't need to loop with
                // requestAnimationFrame in this case,
                // because we can rely on window.resize
                // events if the window is our viewport
                checkResize();
            } else {
                loop();
            }
           $document.on(FULLSCREENCHANGE_EVENT, broadcast);
        },

        /**
         * Destroy the Resizer component
         * @returns {void}
         */
        destroy: function () {
            $document.off(FULLSCREENCHANGE_EVENT, broadcast);
            $window.off('resize', checkResize);
            support.cancelAnimationFrame(resizeFrameID);
        }
    };
});

/*global setTimeout, clearTimeout */

Crocodoc.addComponent('scroller', function (scope) {

    'use strict';

    var util = scope.getUtility('common'),
        browser = scope.getUtility('browser');

    var GHOST_SCROLL_TIMEOUT = 3000,
        GHOST_SCROLL_INTERVAL = 30,
        SCROLL_EVENT_THROTTLE_INTERVAL = 200,
        SCROLL_END_TIMEOUT = browser.mobile ? 500 : 250;

    var $el,
        scrollendTID,
        scrollingStarted = false,
        touchStarted = false,
        touchEnded = false,
        touchMoved = false,
        touchEndTime = 0,
        ghostScrollStart = null;

    /**
     * Build event data object for firing scroll events
     * @returns {Object} Scroll event data object
     * @private
     */
    function buildEventData() {
        return {
            scrollTop: $el.scrollTop(),
            scrollLeft: $el.scrollLeft()
        };
    }

    /**
     * Broadcast a scroll event
     * @returns {void}
     * @private
     */
    var fireScroll = util.throttle(SCROLL_EVENT_THROTTLE_INTERVAL, function () {
        scope.broadcast('scroll', buildEventData());
    });

    /**
     * Handle scrollend
     * @returns {void}
     * @private
     */
    function handleScrollEnd() {
        scrollingStarted = false;
        ghostScrollStart = null;
        clearTimeout(scrollendTID);
        scope.broadcast('scrollend', buildEventData());
    }

    /**
     * Handle scroll events
     * @returns {void}
     * @private
     */
    function handleScroll() {
        // if we are just starting scrolling, fire scrollstart event
        if (!scrollingStarted) {
            scrollingStarted = true;
            scope.broadcast('scrollstart', buildEventData());
        }
        clearTimeout(scrollendTID);
        scrollendTID = setTimeout(handleScrollEnd, SCROLL_END_TIMEOUT);
        fireScroll();
    }

    /**
     * Handle touch start events
     * @returns {void}
     * @private
     */
    function handleTouchstart() {
        touchStarted = true;
        touchEnded = false;
        touchMoved = false;
        handleScroll();
    }

    /**
     * Handle touchmove events
     * @returns {void}
     * @private
     */
    function handleTouchmove() {
        touchMoved = true;
        handleScroll();
    }

    /**
     * Handle touchend events
     * @returns {void}
     * @private
     */
    function handleTouchend() {
        touchStarted = false;
        touchEnded = true;
        touchEndTime = new Date().getTime();
        if (touchMoved) {
            ghostScroll();
        }
    }

    /**
     * Fire fake scroll events.
     * iOS doesn't fire events during the 'momentum' part of scrolling
     * so this is used to fake these events until the page stops moving.
     * @returns {void}
     * @private
     */
    function ghostScroll() {
        clearTimeout(scrollendTID);
        if (ghostScrollStart === null) {
            ghostScrollStart = new Date().getTime();
        }
        if (new Date().getTime() - ghostScrollStart > GHOST_SCROLL_TIMEOUT) {
            handleScrollEnd();
            return;
        }
        fireScroll();
        scrollendTID = setTimeout(ghostScroll, GHOST_SCROLL_INTERVAL);
    }

    return {
        /**
         * Initialize the scroller component
         * @param   {Element} el The Element
         * @returns {void}
         */
        init: function (el) {
            $el = $(el);
            $el.on('scroll', handleScroll);
            $el.on('touchstart', handleTouchstart);
            $el.on('touchmove', handleTouchmove);
            $el.on('touchend', handleTouchend);
        },

        /**
         * Destroy the scroller component
         * @returns {void}
         */
        destroy: function () {
            clearTimeout(scrollendTID);
            $el.off('scroll', handleScroll);
            $el.off('touchstart', handleTouchstart);
            $el.off('touchmove', handleTouchmove);
            $el.off('touchend', handleTouchend);
        }
    };
});

Crocodoc.addComponent('viewer-base', function (scope) {

    'use strict';

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    var CSS_CLASS_PREFIX         = 'crocodoc-',
        ATTR_SVG_VERSION         = 'data-svg-version',
        CSS_CLASS_VIEWER         = CSS_CLASS_PREFIX + 'viewer',
        CSS_CLASS_DOC            = CSS_CLASS_PREFIX + 'doc',
        CSS_CLASS_VIEWPORT       = CSS_CLASS_PREFIX + 'viewport',
        CSS_CLASS_LOGO           = CSS_CLASS_PREFIX + 'viewer-logo',
        CSS_CLASS_DRAGGABLE      = CSS_CLASS_PREFIX + 'draggable',
        CSS_CLASS_DRAGGING       = CSS_CLASS_PREFIX + 'dragging',
        CSS_CLASS_TEXT_SELECTED  = CSS_CLASS_PREFIX + 'text-selected',
        CSS_CLASS_MOBILE         = CSS_CLASS_PREFIX + 'mobile',
        CSS_CLASS_IELT9          = CSS_CLASS_PREFIX + 'ielt9',
        CSS_CLASS_SUPPORTS_SVG   = CSS_CLASS_PREFIX + 'supports-svg',
        CSS_CLASS_WINDOW_AS_VIEWPORT = CSS_CLASS_PREFIX + 'window-as-viewport',
        CSS_CLASS_PAGE           = CSS_CLASS_PREFIX + 'page',
        CSS_CLASS_PAGE_INNER     = CSS_CLASS_PAGE + '-inner',
        CSS_CLASS_PAGE_CONTENT   = CSS_CLASS_PAGE + '-content',
        CSS_CLASS_PAGE_SVG       = CSS_CLASS_PAGE + '-svg',
        CSS_CLASS_PAGE_TEXT      = CSS_CLASS_PAGE + '-text',
        CSS_CLASS_PAGE_LINKS     = CSS_CLASS_PAGE + '-links',
        CSS_CLASS_PAGE_AUTOSCALE = CSS_CLASS_PAGE + '-autoscale',
        CSS_CLASS_PAGE_LOADING   = CSS_CLASS_PAGE + '-loading';

    var VIEWER_HTML_TEMPLATE =
        '<div tabindex="-1" class="' + CSS_CLASS_VIEWPORT + '">' +
            '<div class="' + CSS_CLASS_DOC + '">' +
            '</div>' +
        '</div>' +
        '<div class="' + CSS_CLASS_LOGO + '"></div>';

    var PAGE_HTML_TEMPLATE =
        '<div class="' + CSS_CLASS_PAGE + ' ' + CSS_CLASS_PAGE_LOADING + '" ' +
            'style="width:{{w}}px; height:{{h}}px;" data-width="{{w}}" data-height="{{h}}">' +
            '<div class="' + CSS_CLASS_PAGE_INNER + '">' +
                '<div class="' + CSS_CLASS_PAGE_CONTENT + '">' +
                    '<div class="' + CSS_CLASS_PAGE_SVG + '"></div>' +
                    '<div class="' + CSS_CLASS_PAGE_AUTOSCALE + '">' +
                        '<div class="' + CSS_CLASS_PAGE_TEXT + '"></div>' +
                        '<div class="' + CSS_CLASS_PAGE_LINKS + '"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    // the width to consider the 100% zoom level; zoom levels are calculated based
    // on this width relative to the actual document width
    var DOCUMENT_100_PERCENT_WIDTH = 1024;

    var util = scope.getUtility('common'),
        ajax = scope.getUtility('ajax'),
        browser = scope.getUtility('browser'),
        support = scope.getUtility('support');

    var api, // the viewer API object
        config,
        $el,
        stylesheetEl,
        lazyLoader,
        layout,
        scroller,
        resizer,
        dragger,
        destroyed = false;

    /**
     * Add CSS classes to the element for necessary feature/support flags
     * @returns {void}
     * @private
     */
    function setCSSFlags() {
        // add SVG version number flag
        $el.attr(ATTR_SVG_VERSION, config.metadata.version || '0.0.0');

        //add CSS flags
        if (browser.mobile) {
            $el.addClass(CSS_CLASS_MOBILE);      //Mobile?
        }
        if (browser.ielt9) {
            $el.addClass(CSS_CLASS_IELT9);       //IE7 or IE8?
        }
        if (support.svg) {
            $el.addClass(CSS_CLASS_SUPPORTS_SVG);
        }
    }

    /**
     * Validates the config options
     * @returns {void}
     * @private
     */
    function validateConfig() {
        var metadata = config.metadata;
        config.numPages = metadata.numpages;
        if (!config.pageStart) {
            config.pageStart = 1;
        } else if (config.pageStart < 0) {
            config.pageStart = metadata.numpages + config.pageStart;
        }
        config.pageStart = util.clamp(config.pageStart, 1, metadata.numpages);
        if (!config.pageEnd) {
            config.pageEnd = metadata.numpages;
        } else if (config.pageEnd < 0) {
            config.pageEnd = metadata.numpages + config.pageEnd;
        }
        config.pageEnd = util.clamp(config.pageEnd, config.pageStart, metadata.numpages);
        config.numPages = config.pageEnd - config.pageStart + 1;
    }

    /**
     * Create and insert basic viewer DOM structure
     * @returns {void}
     * @private
     */
    function initViewerHTML() {
        // create viewer HTML
        $el.html(VIEWER_HTML_TEMPLATE);
        if (config.useWindowAsViewport) {
            config.$viewport = $(window);
            $el.addClass(CSS_CLASS_WINDOW_AS_VIEWPORT);
        } else {
            config.$viewport = $el.find('.' + CSS_CLASS_VIEWPORT);
        }
        config.$doc = $el.find('.' + CSS_CLASS_DOC);
    }

    /**
     * Create the html skeleton for the viewer and pages
     * @returns {void}
     * @private
     */
    function prepareDOM() {
        var i, pageNum,
            zoomLevel, maxZoom,
            ptWidth, ptHeight,
            pxWidth, pxHeight,
            pt2px = util.calculatePtSize(),
            dimensions = config.metadata.dimensions,
            skeleton = '';

        // adjust page scale if the pages are too small/big
        // it's adjusted so 100% == DOCUMENT_100_PERCENT_WIDTH px;
        config.pageScale = DOCUMENT_100_PERCENT_WIDTH / (dimensions.width * pt2px);

        // add zoom levels to accomodate the scale
        zoomLevel = config.zoomLevels[config.zoomLevels.length - 1];
        maxZoom = 3 / config.pageScale;
        while (zoomLevel < maxZoom) {
            zoomLevel += zoomLevel / 2;
            config.zoomLevels.push(zoomLevel);
        }

        dimensions.exceptions = dimensions.exceptions || {};

        // create skeleton
        for (i = config.pageStart - 1; i < config.pageEnd; i++) {
            pageNum = i + 1;
            if (pageNum in dimensions.exceptions) {
                ptWidth = dimensions.exceptions[pageNum].width;
                ptHeight = dimensions.exceptions[pageNum].height;
            } else {
                ptWidth = dimensions.width;
                ptHeight = dimensions.height;
            }
            pxWidth = ptWidth * pt2px;
            pxHeight = ptHeight * pt2px;
            pxWidth *= config.pageScale;
            pxHeight *= config.pageScale;
            skeleton += util.template(PAGE_HTML_TEMPLATE, {
                w: pxWidth,
                h: pxHeight
            });
        }

        // insert skeleton and keep a reference to the jq object
        config.$pages = $(skeleton).appendTo(config.$doc);
    }

    /**
     * Initialize all plugins specified for this viewer instance
     * @returns {void}
     * @private
     */
    function initPlugins() {
        var name,
            plugin,
            plugins = config.plugins || {};
        for (name in plugins) {
            plugin = scope.createComponent('plugin-' + name);
            if (plugin && util.isFn(plugin.init)) {
                plugin.init(config.plugins[name]);
            }
        }
    }

    /**
     * Complete intialization after document metadata has been loaded;
     * ie., bind events, init lazyloader and layout, broadcast ready message
     * @returns {void}
     * @private
     */
    function completeInit() {
        setCSSFlags();

        // create viewer skeleton
        prepareDOM();

        // setup pages
        createPages();

        initHandlers();

        // Setup lazy loader and layout manager
        lazyLoader = scope.createComponent('lazy-loader');
        lazyLoader.init(config.pages);

        // initialize scroller and resizer components
        scroller = scope.createComponent('scroller');
        scroller.init(config.$viewport);
        resizer = scope.createComponent('resizer');
        resizer.init(config.$viewport);

        // disable links if necessary
        // @NOTE: links are disabled in IE < 9
        if (!config.enableLinks || browser.ielt9) {
            api.disableLinks();
        }

        // set the initial layout
        api.setLayout(config.layout);

        // broadcast ready message
        scope.broadcast('ready', {
            page: config.page || 1,
            numPages: config.numPages
        });
    }

    /**
     * Create and init all necessary page component instances
     * @returns {void}
     * @private
     */
    function createPages() {
        var i,
            pages = [],
            page,
            svgSrc,
            imgSrc,
            textSrc,
            cssSrc,
            start = config.pageStart - 1,
            end = config.pageEnd,
            url = util.makeAbsolute(config.url),
            status = config.conversionIsComplete ? Crocodoc.PAGE_STATUS_NOT_LOADED : Crocodoc.PAGE_STATUS_CONVERTING,
            links = sortPageLinks();

        //initialize pages
        for (i = start; i < end; i++) {
            svgSrc = url + util.template(config.template.svg, {page: i + 1});
            textSrc = url + util.template(config.template.html, {page: i + 1});
            imgSrc = url + util.template(config.template.img, {page: i + 1});
            cssSrc = url + config.template.css;
            page = scope.createComponent('page');
            page.init(config.$pages.eq(i - start), {
                index: i,
                url: url,
                imgSrc: imgSrc,
                svgSrc: svgSrc,
                textSrc: textSrc,
                cssSrc: cssSrc,
                status: status,
                queryString: config.queryString,
                enableLinks: config.enableLinks,
                links: links[i],
                pageScale: config.pageScale
            });
            pages.push(page);
        }
        config.pages = pages;
    }

    /**
     * Returns all links associated with the given page
     * @param  {int} page The page
     * @returns {Array}   Array of links
     * @private
     */
    function sortPageLinks() {
        var i, len, link,
            links = config.metadata.links || [],
            sorted = [];

        for (i = 0, len = config.metadata.numpages; i < len; ++i) {
            sorted[i] = [];
        }

        for (i = 0, len = links.length; i < len; ++i) {
            link = links[i];
            sorted[link.pagenum - 1].push(link);
        }

        return sorted;
    }

    /**
     * Init window and document events
     * @returns {void}
     * @private
     */
    function initHandlers() {
        $(document).on('mouseup', handleMouseUp);
    }

    /**
     * Handler for linkclicked messages
     * @returns {void}
     * @private
     */
    function handleLinkClicked(data) {
        if (data.uri) {
            window.open(data.uri);
        } else if (data.destination) {
            api.scrollTo(data.destination.pagenum);
        }
    }

    /**
     * Handle mouseup events
     * @returns {void}
     * @private
     */
    function handleMouseUp() {
        updateSelectedPages();
    }

    /**
     * Load the given resource via AJAX request, and retry if necessary
     * @param {boolean} retry Whether to retry if the resource fails to load
     * @returns {$.Promise}
     * @private
     */
    function loadResource(url, retry) {
        var $deferred = $.Deferred();

        function retryOrFail(error) {
            scope.broadcast('asseterror', error);
            if (retry) {
                // don't retry next time
                loadResource(url, false)
                    .then(function (responseText) {
                        $deferred.resolve(responseText);
                    })
                    .fail(function (err) {
                        $deferred.reject(err);
                    });
            } else {
                $deferred.reject(error);
            }
        }

        ajax.request(url, {
            success: function () {
                if (destroyed) {
                    return;
                }
                if (!this.responseText) {
                    retryOrFail({
                        error: 'empty response',
                        status: this.status,
                        resource: url
                    });
                    return;
                }
                $deferred.resolve(this.responseText);
            },
            fail: function () {
                if (destroyed) {
                    return;
                }
                retryOrFail({
                    error: this.statusText,
                    status: this.status,
                    resource: url
                });
            }
        });
        return $deferred.promise();
    }

    /**
     * Check if text is selected on any page, and if so, add a css class to that page
     * @returns {void}
     * @TODO(clakenen): this method currently only adds the selected class to one page,
     * so we should modify it to add the class to all pages with selected text
     * @private
     */
    function updateSelectedPages() {
        var node = util.getSelectedNode();
        var $page = $(node).closest('.'+CSS_CLASS_PAGE);
        $el.find('.'+CSS_CLASS_TEXT_SELECTED).removeClass(CSS_CLASS_TEXT_SELECTED);
        if (node && $el.has(node)) {
            $page.addClass(CSS_CLASS_TEXT_SELECTED);
        }
    }

    /**
     * Enable or disable the dragger given the `isDraggable` flag
     * @param   {Boolean} isDraggable Whether or not the layout is draggable
     * @returns {void}
     * @private
     */
    function updateDragger(isDraggable) {
        if (isDraggable) {
            if (!dragger) {
                $el.addClass(CSS_CLASS_DRAGGABLE);
                dragger = scope.createComponent('dragger');
                dragger.init(config.$viewport);
            }
        } else {
            if (dragger) {
                $el.removeClass(CSS_CLASS_DRAGGABLE);
                scope.destroyComponent(dragger);
                dragger = null;
            }
        }
    }

    /**
     * Validates and normalizes queryParams config option
     * @returns {void}
     */
    function validateQueryParams() {
        var queryString;
        if (config.queryParams) {
            if (typeof config.queryParams === 'string') {
                // strip '?' if it's there, because we add it below
                queryString = config.queryParams.replace(/^\?/, '');
            } else {
                queryString = $.param(config.queryParams);
            }
        }
        config.queryString = queryString ? '?' + queryString : '';
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {

        messages: [
            'asseterror',
            'destroy',
            'dragend',
            'dragstart',
            'fail',
            'linkclicked',
            'pagefail',
            'pagefocus',
            'pageload',
            'pageunload',
            'ready',
            'resize',
            'scrollstart',
            'scrollend',
            'zoom'
        ],

        /**
         * Handle framework messages
         * @param {string} name The name of the message
         * @param {any} data The related data for the message
         * @returns {void}
         */
        onmessage: function (name, data) {
            switch (name) {
                case 'linkclicked':
                    handleLinkClicked(data);
                    break;

                case 'zoom':
                    // artificially adjust the reported zoom to be accuate given the page scale
                    data.zoom *= config.pageScale;
                    data.prevZoom *= config.pageScale;
                    if (config.enableDragging) {
                        updateDragger(data.isDraggable);
                    }

                    // forward zoom event to external event handlers
                    api.fire(name, data);
                    break;

                case 'dragstart':
                    if (!$el.hasClass(CSS_CLASS_DRAGGING)) {
                        $el.addClass(CSS_CLASS_DRAGGING);
                    }
                    // forward zoom event to external event handlers
                    api.fire(name, data);
                    break;

                case 'dragend':
                    if ($el.hasClass(CSS_CLASS_DRAGGING)) {
                        $el.removeClass(CSS_CLASS_DRAGGING);
                    }
                    // forward zoom event to external event handlers
                    api.fire(name, data);
                    break;

                default:
                    // forward subscribed framework messages to external event handlers
                    api.fire(name, data);
                    break;
            }
        },

        /**
         * Initialize the viewer api
         * @returns {void}
         */
        init: function () {
            config = scope.getConfig();
            api = config.api;

            // create a unique CSS namespace for this viewer instance
            config.namespace = CSS_CLASS_VIEWER + '-' + config.id;

            // Setup container
            $el = config.$el;

            // add crocodoc viewer and namespace classes
            $el.addClass(CSS_CLASS_VIEWER);
            $el.addClass(config.namespace);

            initViewerHTML();
            initPlugins();
        },

        /**
         * Destroy the viewer-base component
         * @returns {void}
         */
        destroy: function () {
            // remove document event handlers
            $(document).off('mouseup', handleMouseUp);

            // empty container and remove all class names that contain "crocodoc"
            $el.empty().removeClass(function (i, cls) {
                var match = cls.match(new RegExp('crocodoc\\S+', 'g'));
                return match && match.join(' ');
            });

            // remove the stylesheet
            $(stylesheetEl).remove();

            destroyed = true;
        },

        /**
         * Set the layout to the given mode, destroying and cleaning up the current
         * layout if there is one
         * @param  {string} layoutMode The layout mode
         * @returns {Layout} The layout object
         */
        setLayout: function (layoutMode) {
            var lastPage = config.page,
                lastZoom = config.zoom || 1,
                // create a layout component with the new layout config
                newLayout;

            // if there is already a layout, save some state
            if (layout) {
                // ignore this if we already have the specified layout
                if (layoutMode === config.layout) {
                    return layout;
                }
                lastPage = layout.state.currentPage;
                lastZoom = layout.state.zoomState;
            }

            newLayout = scope.createComponent('layout-' + layoutMode);
            if (!newLayout) {
                throw new Error('Invalid layout ' +  layoutMode);
            }

            // remove and destroy the existing layout component
            // @NOTE: this must be done after we decide if the
            // new layout exists!
            if (layout) {
                scope.destroyComponent(layout);
            }


            var previousLayoutMode = config.layout;
            config.layout = layoutMode;

            layout = newLayout;
            layout.init();
            layout.setZoom(lastZoom.zoomMode || lastZoom.zoom || lastZoom);
            layout.scrollTo(lastPage);

            config.currentLayout = layout;

            scope.broadcast('layoutchange', {
                // in the context of event data, `layout` and `previousLayout`
                // are actually the name of those layouts, and not the layout
                // objects themselves
                previousLayout: previousLayoutMode,
                layout: layoutMode
            });
            return layout;
        },

        /**
         * Load the metadata and css for this document
         * @returns {void}
         */
        loadAssets: function () {
            var absolutePath = util.makeAbsolute(config.url),
                stylesheetURL = absolutePath + config.template.css,
                metadataURL = absolutePath + config.template.json,
                $loadStylesheetPromise,
                $loadMetadataPromise;

            validateQueryParams();
            stylesheetURL += config.queryString;
            metadataURL += config.queryString;

            $loadMetadataPromise = loadResource(metadataURL, true);
            $loadMetadataPromise.then(function handleMetadataResponse(responseText) {
                config.metadata = $.parseJSON(responseText);
                validateConfig();
            });

            // don't load the stylesheet for IE < 9
            if (browser.ielt9) {
                stylesheetEl = util.insertCSS('');
                config.stylesheet = stylesheetEl.styleSheet;
                $loadStylesheetPromise = $.when();
            } else {
                $loadStylesheetPromise = loadResource(stylesheetURL, true);
                $loadStylesheetPromise.then(function handleStylesheetResponse(responseText) {
                    config.cssText = responseText;
                    stylesheetEl = util.insertCSS(responseText);
                    config.stylesheet = stylesheetEl.sheet;
                });
            }

            // when both metatadata and stylesheet are done or if either fails...
            $.when($loadMetadataPromise, $loadStylesheetPromise)
                .fail(function (error) {
                    scope.broadcast('fail', error);
                })
                .then(completeInit);
        }
    };
});


return Crocodoc;
})(jQuery);