var io = ('undefined' === typeof module ? {} : module.exports);(function() {
/**
 * almond 0.2.5 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                    hasProp(waiting, depName) ||
                    hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                    cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
define("almond", function(){});

/*!
 * jQuery JavaScript Library v1.7.1
 * http://jquery.com/
 *
 * Copyright 2011, John Resig
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * http://jquery.org/license
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 * Copyright 2011, The Dojo Foundation
 * Released under the MIT, BSD, and GPL Licenses.
 *
 * Date: Mon Nov 21 21:11:03 2011 -0500
 */

define('jquery1.7.1',[], function () {

    function initJquery( window, undefined ) {

        // Use the correct document accordingly with window argument (sandbox)
        var document = window.document,
            navigator = window.navigator,
            location = window.location;
        var jQuery = (function() {

        // Define a local copy of jQuery
            var jQuery = function( selector, context ) {
                    // The jQuery object is actually just the init constructor 'enhanced'
                    return new jQuery.fn.init( selector, context, rootjQuery );
                },

            // Map over jQuery in case of overwrite
                _jQuery = window.jQuery,

            // Map over the $ in case of overwrite
                _$ = window.$,

            // A central reference to the root jQuery(document)
                rootjQuery,

            // A simple way to check for HTML strings or ID strings
            // Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
                quickExpr = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,

            // Check if a string has a non-whitespace character in it
                rnotwhite = /\S/,

            // Used for trimming whitespace
                trimLeft = /^\s+/,
                trimRight = /\s+$/,

            // Match a standalone tag
                rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>)?$/,

            // JSON RegExp
                rvalidchars = /^[\],:{}\s]*$/,
                rvalidescape = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,
                rvalidtokens = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
                rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g,

            // Useragent RegExp
                rwebkit = /(webkit)[ \/]([\w.]+)/,
                ropera = /(opera)(?:.*version)?[ \/]([\w.]+)/,
                rmsie = /(msie) ([\w.]+)/,
                rmozilla = /(mozilla)(?:.*? rv:([\w.]+))?/,

            // Matches dashed string for camelizing
                rdashAlpha = /-([a-z]|[0-9])/ig,
                rmsPrefix = /^-ms-/,

            // Used by jQuery.camelCase as callback to replace()
                fcamelCase = function( all, letter ) {
                    return ( letter + "" ).toUpperCase();
                },

            // Keep a UserAgent string for use with jQuery.browser
                userAgent = navigator.userAgent,

            // For matching the engine and version of the browser
                browserMatch,

            // The deferred used on DOM ready
                readyList,

            // The ready event handler
                DOMContentLoaded,

            // Save a reference to some core methods
                toString = Object.prototype.toString,
                hasOwn = Object.prototype.hasOwnProperty,
                push = Array.prototype.push,
                slice = Array.prototype.slice,
                trim = String.prototype.trim,
                indexOf = Array.prototype.indexOf,

            // [[Class]] -> type pairs
                class2type = {};

            jQuery.fn = jQuery.prototype = {
                constructor: jQuery,
                init: function( selector, context, rootjQuery ) {
                    var match, elem, ret, doc;

                    // Handle $(""), $(null), or $(undefined)
                    if ( !selector ) {
                        return this;
                    }

                    // Handle $(DOMElement)
                    if ( selector.nodeType ) {
                        this.context = this[0] = selector;
                        this.length = 1;
                        return this;
                    }

                    // The body element only exists once, optimize finding it
                    if ( selector === "body" && !context && document.body ) {
                        this.context = document;
                        this[0] = document.body;
                        this.selector = selector;
                        this.length = 1;
                        return this;
                    }

                    // Handle HTML strings
                    if ( typeof selector === "string" ) {
                        // Are we dealing with HTML string or an ID?
                        if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
                            // Assume that strings that start and end with <> are HTML and skip the regex check
                            match = [ null, selector, null ];

                        } else {
                            match = quickExpr.exec( selector );
                        }

                        // Verify a match, and that no context was specified for #id
                        if ( match && (match[1] || !context) ) {

                            // HANDLE: $(html) -> $(array)
                            if ( match[1] ) {
                                context = context instanceof jQuery ? context[0] : context;
                                doc = ( context ? context.ownerDocument || context : document );

                                // If a single string is passed in and it's a single tag
                                // just do a createElement and skip the rest
                                ret = rsingleTag.exec( selector );

                                if ( ret ) {
                                    if ( jQuery.isPlainObject( context ) ) {
                                        selector = [ document.createElement( ret[1] ) ];
                                        jQuery.fn.attr.call( selector, context, true );

                                    } else {
                                        selector = [ doc.createElement( ret[1] ) ];
                                    }

                                } else {
                                    ret = jQuery.buildFragment( [ match[1] ], [ doc ] );
                                    selector = ( ret.cacheable ? jQuery.clone(ret.fragment) : ret.fragment ).childNodes;
                                }

                                return jQuery.merge( this, selector );

                                // HANDLE: $("#id")
                            } else {
                                elem = document.getElementById( match[2] );

                                // Check parentNode to catch when Blackberry 4.6 returns
                                // nodes that are no longer in the document #6963
                                if ( elem && elem.parentNode ) {
                                    // Handle the case where IE and Opera return items
                                    // by name instead of ID
                                    if ( elem.id !== match[2] ) {
                                        return rootjQuery.find( selector );
                                    }

                                    // Otherwise, we inject the element directly into the jQuery object
                                    this.length = 1;
                                    this[0] = elem;
                                }

                                this.context = document;
                                this.selector = selector;
                                return this;
                            }

                            // HANDLE: $(expr, $(...))
                        } else if ( !context || context.jquery ) {
                            return ( context || rootjQuery ).find( selector );

                            // HANDLE: $(expr, context)
                            // (which is just equivalent to: $(context).find(expr)
                        } else {
                            return this.constructor( context ).find( selector );
                        }

                        // HANDLE: $(function)
                        // Shortcut for document ready
                    } else if ( jQuery.isFunction( selector ) ) {
                        return rootjQuery.ready( selector );
                    }

                    if ( selector.selector !== undefined ) {
                        this.selector = selector.selector;
                        this.context = selector.context;
                    }

                    return jQuery.makeArray( selector, this );
                },

                // Start with an empty selector
                selector: "",

                // The current version of jQuery being used
                jquery: "1.7.1",

                // The default length of a jQuery object is 0
                length: 0,

                // The number of elements contained in the matched element set
                size: function() {
                    return this.length;
                },

                toArray: function() {
                    return slice.call( this, 0 );
                },

                // Get the Nth element in the matched element set OR
                // Get the whole matched element set as a clean array
                get: function( num ) {
                    return num == null ?

                        // Return a 'clean' array
                        this.toArray() :

                        // Return just the object
                        ( num < 0 ? this[ this.length + num ] : this[ num ] );
                },

                // Take an array of elements and push it onto the stack
                // (returning the new matched element set)
                pushStack: function( elems, name, selector ) {
                    // Build a new jQuery matched element set
                    var ret = this.constructor();

                    if ( jQuery.isArray( elems ) ) {
                        push.apply( ret, elems );

                    } else {
                        jQuery.merge( ret, elems );
                    }

                    // Add the old object onto the stack (as a reference)
                    ret.prevObject = this;

                    ret.context = this.context;

                    if ( name === "find" ) {
                        ret.selector = this.selector + ( this.selector ? " " : "" ) + selector;
                    } else if ( name ) {
                        ret.selector = this.selector + "." + name + "(" + selector + ")";
                    }

                    // Return the newly-formed element set
                    return ret;
                },

                // Execute a callback for every element in the matched set.
                // (You can seed the arguments with an array of args, but this is
                // only used internally.)
                each: function( callback, args ) {
                    return jQuery.each( this, callback, args );
                },

                ready: function( fn ) {
                    // Attach the listeners
                    jQuery.bindReady();

                    // Add the callback
                    readyList.add( fn );

                    return this;
                },

                eq: function( i ) {
                    i = +i;
                    return i === -1 ?
                        this.slice( i ) :
                        this.slice( i, i + 1 );
                },

                first: function() {
                    return this.eq( 0 );
                },

                last: function() {
                    return this.eq( -1 );
                },

                slice: function() {
                    return this.pushStack( slice.apply( this, arguments ),
                        "slice", slice.call(arguments).join(",") );
                },

                map: function( callback ) {
                    return this.pushStack( jQuery.map(this, function( elem, i ) {
                        return callback.call( elem, i, elem );
                    }));
                },

                end: function() {
                    return this.prevObject || this.constructor(null);
                },

                // For internal use only.
                // Behaves like an Array's method, not like a jQuery method.
                push: push,
                sort: [].sort,
                splice: [].splice
            };

    // Give the init function the jQuery prototype for later instantiation
            jQuery.fn.init.prototype = jQuery.fn;

            jQuery.extend = jQuery.fn.extend = function() {
                var options, name, src, copy, copyIsArray, clone,
                    target = arguments[0] || {},
                    i = 1,
                    length = arguments.length,
                    deep = false;

                // Handle a deep copy situation
                if ( typeof target === "boolean" ) {
                    deep = target;
                    target = arguments[1] || {};
                    // skip the boolean and the target
                    i = 2;
                }

                // Handle case when target is a string or something (possible in deep copy)
                if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
                    target = {};
                }

                // extend jQuery itself if only one argument is passed
                if ( length === i ) {
                    target = this;
                    --i;
                }

                for ( ; i < length; i++ ) {
                    // Only deal with non-null/undefined values
                    if ( (options = arguments[ i ]) != null ) {
                        // Extend the base object
                        for ( name in options ) {
                            src = target[ name ];
                            copy = options[ name ];

                            // Prevent never-ending loop
                            if ( target === copy ) {
                                continue;
                            }

                            // Recurse if we're merging plain objects or arrays
                            if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
                                if ( copyIsArray ) {
                                    copyIsArray = false;
                                    clone = src && jQuery.isArray(src) ? src : [];

                                } else {
                                    clone = src && jQuery.isPlainObject(src) ? src : {};
                                }

                                // Never move original objects, clone them
                                target[ name ] = jQuery.extend( deep, clone, copy );

                                // Don't bring in undefined values
                            } else if ( copy !== undefined ) {
                                target[ name ] = copy;
                            }
                        }
                    }
                }

                // Return the modified object
                return target;
            };

            jQuery.extend({
                noConflict: function( deep ) {
                    if ( window.$ === jQuery ) {
                        window.$ = _$;
                    }

                    if ( deep && window.jQuery === jQuery ) {
                        window.jQuery = _jQuery;
                    }

                    return jQuery;
                },

                // Is the DOM ready to be used? Set to true once it occurs.
                isReady: false,

                // A counter to track how many items to wait for before
                // the ready event fires. See #6781
                readyWait: 1,

                // Hold (or release) the ready event
                holdReady: function( hold ) {
                    if ( hold ) {
                        jQuery.readyWait++;
                    } else {
                        jQuery.ready( true );
                    }
                },

                // Handle when the DOM is ready
                ready: function( wait ) {
                    // Either a released hold or an DOMready/load event and not yet ready
                    if ( (wait === true && !--jQuery.readyWait) || (wait !== true && !jQuery.isReady) ) {
                        // Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
                        if ( !document.body ) {
                            return setTimeout( jQuery.ready, 1 );
                        }

                        // Remember that the DOM is ready
                        jQuery.isReady = true;

                        // If a normal DOM Ready event fired, decrement, and wait if need be
                        if ( wait !== true && --jQuery.readyWait > 0 ) {
                            return;
                        }

                        // If there are functions bound, to execute
                        readyList.fireWith( document, [ jQuery ] );

                        // Trigger any bound ready events
                        if ( jQuery.fn.trigger ) {
                            jQuery( document ).trigger( "ready" ).off( "ready" );
                        }
                    }
                },

                bindReady: function() {
                    if ( readyList ) {
                        return;
                    }

                    readyList = jQuery.Callbacks( "once memory" );

                    // Catch cases where $(document).ready() is called after the
                    // browser event has already occurred.
                    if ( document.readyState === "complete" ) {
                        // Handle it asynchronously to allow scripts the opportunity to delay ready
                        return setTimeout( jQuery.ready, 1 );
                    }

                    // Mozilla, Opera and webkit nightlies currently support this event
                    if ( document.addEventListener ) {
                        // Use the handy event callback
                        document.addEventListener( "DOMContentLoaded", DOMContentLoaded, false );

                        // A fallback to window.onload, that will always work
                        window.addEventListener( "load", jQuery.ready, false );

                        // If IE event model is used
                    } else if ( document.attachEvent ) {
                        // ensure firing before onload,
                        // maybe late but safe also for iframes
                        document.attachEvent( "onreadystatechange", DOMContentLoaded );

                        // A fallback to window.onload, that will always work
                        window.attachEvent( "onload", jQuery.ready );

                        // If IE and not a frame
                        // continually check to see if the document is ready
                        var toplevel = false;

                        try {
                            toplevel = window.frameElement == null;
                        } catch(e) {}

                        if ( document.documentElement.doScroll && toplevel ) {
                            doScrollCheck();
                        }
                    }
                },

                // See test/unit/core.js for details concerning isFunction.
                // Since version 1.3, DOM methods and functions like alert
                // aren't supported. They return false on IE (#2968).
                isFunction: function( obj ) {
                    return jQuery.type(obj) === "function";
                },

                isArray: Array.isArray || function( obj ) {
                    return jQuery.type(obj) === "array";
                },

                // A crude way of determining if an object is a window
                isWindow: function( obj ) {
                    return obj && typeof obj === "object" && "setInterval" in obj;
                },

                isNumeric: function( obj ) {
                    return !isNaN( parseFloat(obj) ) && isFinite( obj );
                },

                type: function( obj ) {
                    return obj == null ?
                        String( obj ) :
                        class2type[ toString.call(obj) ] || "object";
                },

                isPlainObject: function( obj ) {
                    // Must be an Object.
                    // Because of IE, we also have to check the presence of the constructor property.
                    // Make sure that DOM nodes and window objects don't pass through, as well
                    if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
                        return false;
                    }

                    try {
                        // Not own constructor property must be Object
                        if ( obj.constructor &&
                            !hasOwn.call(obj, "constructor") &&
                            !hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
                            return false;
                        }
                    } catch ( e ) {
                        // IE8,9 Will throw exceptions on certain host objects #9897
                        return false;
                    }

                    // Own properties are enumerated firstly, so to speed up,
                    // if last one is own, then all properties are own.

                    var key;
                    for ( key in obj ) {}

                    return key === undefined || hasOwn.call( obj, key );
                },

                isEmptyObject: function( obj ) {
                    for ( var name in obj ) {
                        return false;
                    }
                    return true;
                },

                error: function( msg ) {
                    throw new Error( msg );
                },

                parseJSON: function( data ) {
                    if ( typeof data !== "string" || !data ) {
                        return null;
                    }

                    // Make sure leading/trailing whitespace is removed (IE can't handle it)
                    data = jQuery.trim( data );

                    // Attempt to parse using the native JSON parser first
                    if ( window.JSON && window.JSON.parse ) {
                        return window.JSON.parse( data );
                    }

                    // Make sure the incoming data is actual JSON
                    // Logic borrowed from http://json.org/json2.js
                    if ( rvalidchars.test( data.replace( rvalidescape, "@" )
                        .replace( rvalidtokens, "]" )
                        .replace( rvalidbraces, "")) ) {

                        return ( new Function( "return " + data ) )();

                    }
                    jQuery.error( "Invalid JSON: " + data );
                },

                // Cross-browser xml parsing
                parseXML: function( data ) {
                    var xml, tmp;
                    try {
                        if ( window.DOMParser ) { // Standard
                            tmp = new DOMParser();
                            xml = tmp.parseFromString( data , "text/xml" );
                        } else { // IE
                            xml = new ActiveXObject( "Microsoft.XMLDOM" );
                            xml.async = "false";
                            xml.loadXML( data );
                        }
                    } catch( e ) {
                        xml = undefined;
                    }
                    if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
                        jQuery.error( "Invalid XML: " + data );
                    }
                    return xml;
                },

                noop: function() {},

                // Evaluates a script in a global context
                // Workarounds based on findings by Jim Driscoll
                // http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
                globalEval: function( data ) {
                    if ( data && rnotwhite.test( data ) ) {
                        // We use execScript on Internet Explorer
                        // We use an anonymous function so that context is window
                        // rather than jQuery in Firefox
                        ( window.execScript || function( data ) {
                            window[ "eval" ].call( window, data );
                        } )( data );
                    }
                },

                // Convert dashed to camelCase; used by the css and data modules
                // Microsoft forgot to hump their vendor prefix (#9572)
                camelCase: function( string ) {
                    return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
                },

                nodeName: function( elem, name ) {
                    return elem.nodeName && elem.nodeName.toUpperCase() === name.toUpperCase();
                },

                // args is for internal usage only
                each: function( object, callback, args ) {
                    var name, i = 0,
                        length = object.length,
                        isObj = length === undefined || jQuery.isFunction( object );

                    if ( args ) {
                        if ( isObj ) {
                            for ( name in object ) {
                                if ( callback.apply( object[ name ], args ) === false ) {
                                    break;
                                }
                            }
                        } else {
                            for ( ; i < length; ) {
                                if ( callback.apply( object[ i++ ], args ) === false ) {
                                    break;
                                }
                            }
                        }

                        // A special, fast, case for the most common use of each
                    } else {
                        if ( isObj ) {
                            for ( name in object ) {
                                if ( callback.call( object[ name ], name, object[ name ] ) === false ) {
                                    break;
                                }
                            }
                        } else {
                            for ( ; i < length; ) {
                                if ( callback.call( object[ i ], i, object[ i++ ] ) === false ) {
                                    break;
                                }
                            }
                        }
                    }

                    return object;
                },

                // Use native String.trim function wherever possible
                trim: trim ?
                    function( text ) {
                        return text == null ?
                            "" :
                            trim.call( text );
                    } :

                    // Otherwise use our own trimming functionality
                    function( text ) {
                        return text == null ?
                            "" :
                            text.toString().replace( trimLeft, "" ).replace( trimRight, "" );
                    },

                // results is for internal usage only
                makeArray: function( array, results ) {
                    var ret = results || [];

                    if ( array != null ) {
                        // The window, strings (and functions) also have 'length'
                        // Tweaked logic slightly to handle Blackberry 4.7 RegExp issues #6930
                        var type = jQuery.type( array );

                        if ( array.length == null || type === "string" || type === "function" || type === "regexp" || jQuery.isWindow( array ) ) {
                            push.call( ret, array );
                        } else {
                            jQuery.merge( ret, array );
                        }
                    }

                    return ret;
                },

                inArray: function( elem, array, i ) {
                    var len;

                    if ( array ) {
                        if ( indexOf ) {
                            return indexOf.call( array, elem, i );
                        }

                        len = array.length;
                        i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

                        for ( ; i < len; i++ ) {
                            // Skip accessing in sparse arrays
                            if ( i in array && array[ i ] === elem ) {
                                return i;
                            }
                        }
                    }

                    return -1;
                },

                merge: function( first, second ) {
                    var i = first.length,
                        j = 0;

                    if ( typeof second.length === "number" ) {
                        for ( var l = second.length; j < l; j++ ) {
                            first[ i++ ] = second[ j ];
                        }

                    } else {
                        while ( second[j] !== undefined ) {
                            first[ i++ ] = second[ j++ ];
                        }
                    }

                    first.length = i;

                    return first;
                },

                grep: function( elems, callback, inv ) {
                    var ret = [], retVal;
                    inv = !!inv;

                    // Go through the array, only saving the items
                    // that pass the validator function
                    for ( var i = 0, length = elems.length; i < length; i++ ) {
                        retVal = !!callback( elems[ i ], i );
                        if ( inv !== retVal ) {
                            ret.push( elems[ i ] );
                        }
                    }

                    return ret;
                },

                // arg is for internal usage only
                map: function( elems, callback, arg ) {
                    var value, key, ret = [],
                        i = 0,
                        length = elems.length,
                    // jquery objects are treated as arrays
                        isArray = elems instanceof jQuery || length !== undefined && typeof length === "number" && ( ( length > 0 && elems[ 0 ] && elems[ length -1 ] ) || length === 0 || jQuery.isArray( elems ) ) ;

                    // Go through the array, translating each of the items to their
                    if ( isArray ) {
                        for ( ; i < length; i++ ) {
                            value = callback( elems[ i ], i, arg );

                            if ( value != null ) {
                                ret[ ret.length ] = value;
                            }
                        }

                        // Go through every key on the object,
                    } else {
                        for ( key in elems ) {
                            value = callback( elems[ key ], key, arg );

                            if ( value != null ) {
                                ret[ ret.length ] = value;
                            }
                        }
                    }

                    // Flatten any nested arrays
                    return ret.concat.apply( [], ret );
                },

                // A global GUID counter for objects
                guid: 1,

                // Bind a function to a context, optionally partially applying any
                // arguments.
                proxy: function( fn, context ) {
                    if ( typeof context === "string" ) {
                        var tmp = fn[ context ];
                        context = fn;
                        fn = tmp;
                    }

                    // Quick check to determine if target is callable, in the spec
                    // this throws a TypeError, but we will just return undefined.
                    if ( !jQuery.isFunction( fn ) ) {
                        return undefined;
                    }

                    // Simulated bind
                    var args = slice.call( arguments, 2 ),
                        proxy = function() {
                            return fn.apply( context, args.concat( slice.call( arguments ) ) );
                        };

                    // Set the guid of unique handler to the same of original handler, so it can be removed
                    proxy.guid = fn.guid = fn.guid || proxy.guid || jQuery.guid++;

                    return proxy;
                },

                // Mutifunctional method to get and set values to a collection
                // The value/s can optionally be executed if it's a function
                access: function( elems, key, value, exec, fn, pass ) {
                    var length = elems.length;

                    // Setting many attributes
                    if ( typeof key === "object" ) {
                        for ( var k in key ) {
                            jQuery.access( elems, k, key[k], exec, fn, value );
                        }
                        return elems;
                    }

                    // Setting one attribute
                    if ( value !== undefined ) {
                        // Optionally, function values get executed if exec is true
                        exec = !pass && exec && jQuery.isFunction(value);

                        for ( var i = 0; i < length; i++ ) {
                            fn( elems[i], key, exec ? value.call( elems[i], i, fn( elems[i], key ) ) : value, pass );
                        }

                        return elems;
                    }

                    // Getting an attribute
                    return length ? fn( elems[0], key ) : undefined;
                },

                now: function() {
                    return ( new Date() ).getTime();
                },

                // Use of jQuery.browser is frowned upon.
                // More details: http://docs.jquery.com/Utilities/jQuery.browser
                uaMatch: function( ua ) {
                    ua = ua.toLowerCase();

                    var match = rwebkit.exec( ua ) ||
                        ropera.exec( ua ) ||
                        rmsie.exec( ua ) ||
                        ua.indexOf("compatible") < 0 && rmozilla.exec( ua ) ||
                        [];

                    return { browser: match[1] || "", version: match[2] || "0" };
                },

                sub: function() {
                    function jQuerySub( selector, context ) {
                        return new jQuerySub.fn.init( selector, context );
                    }
                    jQuery.extend( true, jQuerySub, this );
                    jQuerySub.superclass = this;
                    jQuerySub.fn = jQuerySub.prototype = this();
                    jQuerySub.fn.constructor = jQuerySub;
                    jQuerySub.sub = this.sub;
                    jQuerySub.fn.init = function init( selector, context ) {
                        if ( context && context instanceof jQuery && !(context instanceof jQuerySub) ) {
                            context = jQuerySub( context );
                        }

                        return jQuery.fn.init.call( this, selector, context, rootjQuerySub );
                    };
                    jQuerySub.fn.init.prototype = jQuerySub.fn;
                    var rootjQuerySub = jQuerySub(document);
                    return jQuerySub;
                },

                browser: {}
            });

    // Populate the class2type map
            jQuery.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(i, name) {
                class2type[ "[object " + name + "]" ] = name.toLowerCase();
            });

            browserMatch = jQuery.uaMatch( userAgent );
            if ( browserMatch.browser ) {
                jQuery.browser[ browserMatch.browser ] = true;
                jQuery.browser.version = browserMatch.version;
            }

    // Deprecated, use jQuery.browser.webkit instead
            if ( jQuery.browser.webkit ) {
                jQuery.browser.safari = true;
            }

    // IE doesn't match non-breaking spaces with \s
            if ( rnotwhite.test( "\xA0" ) ) {
                trimLeft = /^[\s\xA0]+/;
                trimRight = /[\s\xA0]+$/;
            }

    // All jQuery objects should point back to these
            rootjQuery = jQuery(document);

    // Cleanup functions for the document ready method
            if ( document.addEventListener ) {
                DOMContentLoaded = function() {
                    document.removeEventListener( "DOMContentLoaded", DOMContentLoaded, false );
                    jQuery.ready();
                };

            } else if ( document.attachEvent ) {
                DOMContentLoaded = function() {
                    // Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
                    if ( document.readyState === "complete" ) {
                        document.detachEvent( "onreadystatechange", DOMContentLoaded );
                        jQuery.ready();
                    }
                };
            }

    // The DOM ready check for Internet Explorer
            function doScrollCheck() {
                if ( jQuery.isReady ) {
                    return;
                }

                try {
                    // If IE is used, use the trick by Diego Perini
                    // http://javascript.nwbox.com/IEContentLoaded/
                    document.documentElement.doScroll("left");
                } catch(e) {
                    setTimeout( doScrollCheck, 1 );
                    return;
                }

                // and execute any waiting functions
                jQuery.ready();
            }

            return jQuery;

        })();


    // String to Object flags format cache
        var flagsCache = {};

    // Convert String-formatted flags into Object-formatted ones and store in cache
        function createFlags( flags ) {
            var object = flagsCache[ flags ] = {},
                i, length;
            flags = flags.split( /\s+/ );
            for ( i = 0, length = flags.length; i < length; i++ ) {
                object[ flags[i] ] = true;
            }
            return object;
        }

        /*
         * Create a callback list using the following parameters:
         *
         *	flags:	an optional list of space-separated flags that will change how
         *			the callback list behaves
         *
         * By default a callback list will act like an event callback list and can be
         * "fired" multiple times.
         *
         * Possible flags:
         *
         *	once:			will ensure the callback list can only be fired once (like a Deferred)
         *
         *	memory:			will keep track of previous values and will call any callback added
         *					after the list has been fired right away with the latest "memorized"
         *					values (like a Deferred)
         *
         *	unique:			will ensure a callback can only be added once (no duplicate in the list)
         *
         *	stopOnFalse:	interrupt callings when a callback returns false
         *
         */
        jQuery.Callbacks = function( flags ) {

            // Convert flags from String-formatted to Object-formatted
            // (we check in cache first)
            flags = flags ? ( flagsCache[ flags ] || createFlags( flags ) ) : {};

            var // Actual callback list
                list = [],
            // Stack of fire calls for repeatable lists
                stack = [],
            // Last fire value (for non-forgettable lists)
                memory,
            // Flag to know if list is currently firing
                firing,
            // First callback to fire (used internally by add and fireWith)
                firingStart,
            // End of the loop when firing
                firingLength,
            // Index of currently firing callback (modified by remove if needed)
                firingIndex,
            // Add one or several callbacks to the list
                add = function( args ) {
                    var i,
                        length,
                        elem,
                        type,
                        actual;
                    for ( i = 0, length = args.length; i < length; i++ ) {
                        elem = args[ i ];
                        type = jQuery.type( elem );
                        if ( type === "array" ) {
                            // Inspect recursively
                            add( elem );
                        } else if ( type === "function" ) {
                            // Add if not in unique mode and callback is not in
                            if ( !flags.unique || !self.has( elem ) ) {
                                list.push( elem );
                            }
                        }
                    }
                },
            // Fire callbacks
                fire = function( context, args ) {
                    args = args || [];
                    memory = !flags.memory || [ context, args ];
                    firing = true;
                    firingIndex = firingStart || 0;
                    firingStart = 0;
                    firingLength = list.length;
                    for ( ; list && firingIndex < firingLength; firingIndex++ ) {
                        if ( list[ firingIndex ].apply( context, args ) === false && flags.stopOnFalse ) {
                            memory = true; // Mark as halted
                            break;
                        }
                    }
                    firing = false;
                    if ( list ) {
                        if ( !flags.once ) {
                            if ( stack && stack.length ) {
                                memory = stack.shift();
                                self.fireWith( memory[ 0 ], memory[ 1 ] );
                            }
                        } else if ( memory === true ) {
                            self.disable();
                        } else {
                            list = [];
                        }
                    }
                },
            // Actual Callbacks object
                self = {
                    // Add a callback or a collection of callbacks to the list
                    add: function() {
                        if ( list ) {
                            var length = list.length;
                            add( arguments );
                            // Do we need to add the callbacks to the
                            // current firing batch?
                            if ( firing ) {
                                firingLength = list.length;
                                // With memory, if we're not firing then
                                // we should call right away, unless previous
                                // firing was halted (stopOnFalse)
                            } else if ( memory && memory !== true ) {
                                firingStart = length;
                                fire( memory[ 0 ], memory[ 1 ] );
                            }
                        }
                        return this;
                    },
                    // Remove a callback from the list
                    remove: function() {
                        if ( list ) {
                            var args = arguments,
                                argIndex = 0,
                                argLength = args.length;
                            for ( ; argIndex < argLength ; argIndex++ ) {
                                for ( var i = 0; i < list.length; i++ ) {
                                    if ( args[ argIndex ] === list[ i ] ) {
                                        // Handle firingIndex and firingLength
                                        if ( firing ) {
                                            if ( i <= firingLength ) {
                                                firingLength--;
                                                if ( i <= firingIndex ) {
                                                    firingIndex--;
                                                }
                                            }
                                        }
                                        // Remove the element
                                        list.splice( i--, 1 );
                                        // If we have some unicity property then
                                        // we only need to do this once
                                        if ( flags.unique ) {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        return this;
                    },
                    // Control if a given callback is in the list
                    has: function( fn ) {
                        if ( list ) {
                            var i = 0,
                                length = list.length;
                            for ( ; i < length; i++ ) {
                                if ( fn === list[ i ] ) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    },
                    // Remove all callbacks from the list
                    empty: function() {
                        list = [];
                        return this;
                    },
                    // Have the list do nothing anymore
                    disable: function() {
                        list = stack = memory = undefined;
                        return this;
                    },
                    // Is it disabled?
                    disabled: function() {
                        return !list;
                    },
                    // Lock the list in its current state
                    lock: function() {
                        stack = undefined;
                        if ( !memory || memory === true ) {
                            self.disable();
                        }
                        return this;
                    },
                    // Is it locked?
                    locked: function() {
                        return !stack;
                    },
                    // Call all callbacks with the given context and arguments
                    fireWith: function( context, args ) {
                        if ( stack ) {
                            if ( firing ) {
                                if ( !flags.once ) {
                                    stack.push( [ context, args ] );
                                }
                            } else if ( !( flags.once && memory ) ) {
                                fire( context, args );
                            }
                        }
                        return this;
                    },
                    // Call all the callbacks with the given arguments
                    fire: function() {
                        self.fireWith( this, arguments );
                        return this;
                    },
                    // To know if the callbacks have already been called at least once
                    fired: function() {
                        return !!memory;
                    }
                };

            return self;
        };




        var // Static reference to slice
            sliceDeferred = [].slice;

        jQuery.extend({

            Deferred: function( func ) {
                var doneList = jQuery.Callbacks( "once memory" ),
                    failList = jQuery.Callbacks( "once memory" ),
                    progressList = jQuery.Callbacks( "memory" ),
                    state = "pending",
                    lists = {
                        resolve: doneList,
                        reject: failList,
                        notify: progressList
                    },
                    promise = {
                        done: doneList.add,
                        fail: failList.add,
                        progress: progressList.add,

                        state: function() {
                            return state;
                        },

                        // Deprecated
                        isResolved: doneList.fired,
                        isRejected: failList.fired,

                        then: function( doneCallbacks, failCallbacks, progressCallbacks ) {
                            deferred.done( doneCallbacks ).fail( failCallbacks ).progress( progressCallbacks );
                            return this;
                        },
                        always: function() {
                            deferred.done.apply( deferred, arguments ).fail.apply( deferred, arguments );
                            return this;
                        },
                        pipe: function( fnDone, fnFail, fnProgress ) {
                            return jQuery.Deferred(function( newDefer ) {
                                jQuery.each( {
                                    done: [ fnDone, "resolve" ],
                                    fail: [ fnFail, "reject" ],
                                    progress: [ fnProgress, "notify" ]
                                }, function( handler, data ) {
                                    var fn = data[ 0 ],
                                        action = data[ 1 ],
                                        returned;
                                    if ( jQuery.isFunction( fn ) ) {
                                        deferred[ handler ](function() {
                                            returned = fn.apply( this, arguments );
                                            if ( returned && jQuery.isFunction( returned.promise ) ) {
                                                returned.promise().then( newDefer.resolve, newDefer.reject, newDefer.notify );
                                            } else {
                                                newDefer[ action + "With" ]( this === deferred ? newDefer : this, [ returned ] );
                                            }
                                        });
                                    } else {
                                        deferred[ handler ]( newDefer[ action ] );
                                    }
                                });
                            }).promise();
                        },
                        // Get a promise for this deferred
                        // If obj is provided, the promise aspect is added to the object
                        promise: function( obj ) {
                            if ( obj == null ) {
                                obj = promise;
                            } else {
                                for ( var key in promise ) {
                                    obj[ key ] = promise[ key ];
                                }
                            }
                            return obj;
                        }
                    },
                    deferred = promise.promise({}),
                    key;

                for ( key in lists ) {
                    deferred[ key ] = lists[ key ].fire;
                    deferred[ key + "With" ] = lists[ key ].fireWith;
                }

                // Handle state
                deferred.done( function() {
                    state = "resolved";
                }, failList.disable, progressList.lock ).fail( function() {
                        state = "rejected";
                    }, doneList.disable, progressList.lock );

                // Call given func if any
                if ( func ) {
                    func.call( deferred, deferred );
                }

                // All done!
                return deferred;
            },

            // Deferred helper
            when: function( firstParam ) {
                var args = sliceDeferred.call( arguments, 0 ),
                    i = 0,
                    length = args.length,
                    pValues = new Array( length ),
                    count = length,
                    pCount = length,
                    deferred = length <= 1 && firstParam && jQuery.isFunction( firstParam.promise ) ?
                        firstParam :
                        jQuery.Deferred(),
                    promise = deferred.promise();
                function resolveFunc( i ) {
                    return function( value ) {
                        args[ i ] = arguments.length > 1 ? sliceDeferred.call( arguments, 0 ) : value;
                        if ( !( --count ) ) {
                            deferred.resolveWith( deferred, args );
                        }
                    };
                }
                function progressFunc( i ) {
                    return function( value ) {
                        pValues[ i ] = arguments.length > 1 ? sliceDeferred.call( arguments, 0 ) : value;
                        deferred.notifyWith( promise, pValues );
                    };
                }
                if ( length > 1 ) {
                    for ( ; i < length; i++ ) {
                        if ( args[ i ] && args[ i ].promise && jQuery.isFunction( args[ i ].promise ) ) {
                            args[ i ].promise().then( resolveFunc(i), deferred.reject, progressFunc(i) );
                        } else {
                            --count;
                        }
                    }
                    if ( !count ) {
                        deferred.resolveWith( deferred, args );
                    }
                } else if ( deferred !== firstParam ) {
                    deferred.resolveWith( deferred, length ? [ firstParam ] : [] );
                }
                return promise;
            }
        });




        jQuery.support = (function() {

            var support,
                all,
                a,
                select,
                opt,
                input,
                marginDiv,
                fragment,
                tds,
                events,
                eventName,
                i,
                isSupported,
                div = document.createElement( "div" ),
                documentElement = document.documentElement;

            // Preliminary tests
            div.setAttribute("className", "t");
            div.innerHTML = "   <link/><table></table><a href='/a' style='top:1px;float:left;opacity:.55;'>a</a><input type='checkbox'/>";

            all = div.getElementsByTagName( "*" );
            a = div.getElementsByTagName( "a" )[ 0 ];

            // Can't get basic test support
            if ( !all || !all.length || !a ) {
                return {};
            }

            // First batch of supports tests
            select = document.createElement( "select" );
            opt = select.appendChild( document.createElement("option") );
            input = div.getElementsByTagName( "input" )[ 0 ];

            support = {
                // IE strips leading whitespace when .innerHTML is used
                leadingWhitespace: ( div.firstChild.nodeType === 3 ),

                // Make sure that tbody elements aren't automatically inserted
                // IE will insert them into empty tables
                tbody: !div.getElementsByTagName("tbody").length,

                // Make sure that link elements get serialized correctly by innerHTML
                // This requires a wrapper element in IE
                htmlSerialize: !!div.getElementsByTagName("link").length,

                // Get the style information from getAttribute
                // (IE uses .cssText instead)
                style: /top/.test( a.getAttribute("style") ),

                // Make sure that URLs aren't manipulated
                // (IE normalizes it by default)
                hrefNormalized: ( a.getAttribute("href") === "/a" ),

                // Make sure that element opacity exists
                // (IE uses filter instead)
                // Use a regex to work around a WebKit issue. See #5145
                opacity: /^0.55/.test( a.style.opacity ),

                // Verify style float existence
                // (IE uses styleFloat instead of cssFloat)
                cssFloat: !!a.style.cssFloat,

                // Make sure that if no value is specified for a checkbox
                // that it defaults to "on".
                // (WebKit defaults to "" instead)
                checkOn: ( input.value === "on" ),

                // Make sure that a selected-by-default option has a working selected property.
                // (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
                optSelected: opt.selected,

                // Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
                getSetAttribute: div.className !== "t",

                // Tests for enctype support on a form(#6743)
                enctype: !!document.createElement("form").enctype,

                // Makes sure cloning an html5 element does not cause problems
                // Where outerHTML is undefined, this still works
                html5Clone: document.createElement("nav").cloneNode( true ).outerHTML !== "<:nav></:nav>",

                // Will be defined later
                submitBubbles: true,
                changeBubbles: true,
                focusinBubbles: false,
                deleteExpando: true,
                noCloneEvent: true,
                inlineBlockNeedsLayout: false,
                shrinkWrapBlocks: false,
                reliableMarginRight: true
            };

            // Make sure checked status is properly cloned
            input.checked = true;
            support.noCloneChecked = input.cloneNode( true ).checked;

            // Make sure that the options inside disabled selects aren't marked as disabled
            // (WebKit marks them as disabled)
            select.disabled = true;
            support.optDisabled = !opt.disabled;

            // Test to see if it's possible to delete an expando from an element
            // Fails in Internet Explorer
            try {
                delete div.test;
            } catch( e ) {
                support.deleteExpando = false;
            }

            if ( !div.addEventListener && div.attachEvent && div.fireEvent ) {
                div.attachEvent( "onclick", function() {
                    // Cloning a node shouldn't copy over any
                    // bound event handlers (IE does this)
                    support.noCloneEvent = false;
                });
                div.cloneNode( true ).fireEvent( "onclick" );
            }

            // Check if a radio maintains its value
            // after being appended to the DOM
            input = document.createElement("input");
            input.value = "t";
            input.setAttribute("type", "radio");
            support.radioValue = input.value === "t";

            input.setAttribute("checked", "checked");
            div.appendChild( input );
            fragment = document.createDocumentFragment();
            fragment.appendChild( div.lastChild );

            // WebKit doesn't clone checked state correctly in fragments
            support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

            // Check if a disconnected checkbox will retain its checked
            // value of true after appended to the DOM (IE6/7)
            support.appendChecked = input.checked;

            fragment.removeChild( input );
            fragment.appendChild( div );

            div.innerHTML = "";

            // Check if div with explicit width and no margin-right incorrectly
            // gets computed margin-right based on width of container. For more
            // info see bug #3333
            // Fails in WebKit before Feb 2011 nightlies
            // WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
            if ( window.getComputedStyle ) {
                marginDiv = document.createElement( "div" );
                marginDiv.style.width = "0";
                marginDiv.style.marginRight = "0";
                div.style.width = "2px";
                div.appendChild( marginDiv );
                support.reliableMarginRight =
                    ( parseInt( ( window.getComputedStyle( marginDiv, null ) || { marginRight: 0 } ).marginRight, 10 ) || 0 ) === 0;
            }

            // Technique from Juriy Zaytsev
            // http://perfectionkills.com/detecting-event-support-without-browser-sniffing/
            // We only care about the case where non-standard event systems
            // are used, namely in IE. Short-circuiting here helps us to
            // avoid an eval call (in setAttribute) which can cause CSP
            // to go haywire. See: https://developer.mozilla.org/en/Security/CSP
            if ( div.attachEvent ) {
                for( i in {
                    submit: 1,
                    change: 1,
                    focusin: 1
                }) {
                    eventName = "on" + i;
                    isSupported = ( eventName in div );
                    if ( !isSupported ) {
                        div.setAttribute( eventName, "return;" );
                        isSupported = ( typeof div[ eventName ] === "function" );
                    }
                    support[ i + "Bubbles" ] = isSupported;
                }
            }

            fragment.removeChild( div );

            // Null elements to avoid leaks in IE
            fragment = select = opt = marginDiv = div = input = null;

            // Run tests that need a body at doc ready
            jQuery(function() {
                var container, outer, inner, table, td, offsetSupport,
                    conMarginTop, ptlm, vb, style, html,
                    body = document.getElementsByTagName("body")[0];

                if ( !body ) {
                    // Return for frameset docs that don't have a body
                    return;
                }

                conMarginTop = 1;
                ptlm = "position:absolute;top:0;left:0;width:1px;height:1px;margin:0;";
                vb = "visibility:hidden;border:0;";
                style = "style='" + ptlm + "border:5px solid #000;padding:0;'";
                html = "<div " + style + "><div></div></div>" +
                    "<table " + style + " cellpadding='0' cellspacing='0'>" +
                    "<tr><td></td></tr></table>";

                container = document.createElement("div");
                container.style.cssText = vb + "width:0;height:0;position:static;top:0;margin-top:" + conMarginTop + "px";
                body.insertBefore( container, body.firstChild );

                // Construct the test element
                div = document.createElement("div");
                container.appendChild( div );

                // Check if table cells still have offsetWidth/Height when they are set
                // to display:none and there are still other visible table cells in a
                // table row; if so, offsetWidth/Height are not reliable for use when
                // determining if an element has been hidden directly using
                // display:none (it is still safe to use offsets if a parent element is
                // hidden; don safety goggles and see bug #4512 for more information).
                // (only IE 8 fails this test)
                div.innerHTML = "<table><tr><td style='padding:0;border:0;display:none'></td><td>t</td></tr></table>";
                tds = div.getElementsByTagName( "td" );
                isSupported = ( tds[ 0 ].offsetHeight === 0 );

                tds[ 0 ].style.display = "";
                tds[ 1 ].style.display = "none";

                // Check if empty table cells still have offsetWidth/Height
                // (IE <= 8 fail this test)
                support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );

                // Figure out if the W3C box model works as expected
                div.innerHTML = "";
                div.style.width = div.style.paddingLeft = "1px";
                jQuery.boxModel = support.boxModel = div.offsetWidth === 2;

                if ( typeof div.style.zoom !== "undefined" ) {
                    // Check if natively block-level elements act like inline-block
                    // elements when setting their display to 'inline' and giving
                    // them layout
                    // (IE < 8 does this)
                    div.style.display = "inline";
                    div.style.zoom = 1;
                    support.inlineBlockNeedsLayout = ( div.offsetWidth === 2 );

                    // Check if elements with layout shrink-wrap their children
                    // (IE 6 does this)
                    div.style.display = "";
                    div.innerHTML = "<div style='width:4px;'></div>";
                    support.shrinkWrapBlocks = ( div.offsetWidth !== 2 );
                }

                div.style.cssText = ptlm + vb;
                div.innerHTML = html;

                outer = div.firstChild;
                inner = outer.firstChild;
                td = outer.nextSibling.firstChild.firstChild;

                offsetSupport = {
                    doesNotAddBorder: ( inner.offsetTop !== 5 ),
                    doesAddBorderForTableAndCells: ( td.offsetTop === 5 )
                };

                inner.style.position = "fixed";
                inner.style.top = "20px";

                // safari subtracts parent border width here which is 5px
                offsetSupport.fixedPosition = ( inner.offsetTop === 20 || inner.offsetTop === 15 );
                inner.style.position = inner.style.top = "";

                outer.style.overflow = "hidden";
                outer.style.position = "relative";

                offsetSupport.subtractsBorderForOverflowNotVisible = ( inner.offsetTop === -5 );
                offsetSupport.doesNotIncludeMarginInBodyOffset = ( body.offsetTop !== conMarginTop );

                body.removeChild( container );
                div  = container = null;

                jQuery.extend( support, offsetSupport );
            });

            return support;
        })();




        var rbrace = /^(?:\{.*\}|\[.*\])$/,
            rmultiDash = /([A-Z])/g;

        jQuery.extend({
            cache: {},

            // Please use with caution
            uuid: 0,

            // Unique for each copy of jQuery on the page
            // Non-digits removed to match rinlinejQuery
            expando: "jQuery" + ( jQuery.fn.jquery + Math.random() ).replace( /\D/g, "" ),

            // The following elements throw uncatchable exceptions if you
            // attempt to add expando properties to them.
            noData: {
                "embed": true,
                // Ban all objects except for Flash (which handle expandos)
                "object": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
                "applet": true
            },

            hasData: function( elem ) {
                elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
                return !!elem && !isEmptyDataObject( elem );
            },

            data: function( elem, name, data, pvt /* Internal Use Only */ ) {
                if ( !jQuery.acceptData( elem ) ) {
                    return;
                }

                var privateCache, thisCache, ret,
                    internalKey = jQuery.expando,
                    getByName = typeof name === "string",

                // We have to handle DOM nodes and JS objects differently because IE6-7
                // can't GC object references properly across the DOM-JS boundary
                    isNode = elem.nodeType,

                // Only DOM nodes need the global jQuery cache; JS object data is
                // attached directly to the object so GC can occur automatically
                    cache = isNode ? jQuery.cache : elem,

                // Only defining an ID for JS objects if its cache already exists allows
                // the code to shortcut on the same path as a DOM node with no cache
                    id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey,
                    isEvents = name === "events";

                // Avoid doing any more work than we need to when trying to get data on an
                // object that has no data at all
                if ( (!id || !cache[id] || (!isEvents && !pvt && !cache[id].data)) && getByName && data === undefined ) {
                    return;
                }

                if ( !id ) {
                    // Only DOM nodes need a new unique ID for each element since their data
                    // ends up in the global cache
                    if ( isNode ) {
                        elem[ internalKey ] = id = ++jQuery.uuid;
                    } else {
                        id = internalKey;
                    }
                }

                if ( !cache[ id ] ) {
                    cache[ id ] = {};

                    // Avoids exposing jQuery metadata on plain JS objects when the object
                    // is serialized using JSON.stringify
                    if ( !isNode ) {
                        cache[ id ].toJSON = jQuery.noop;
                    }
                }

                // An object can be passed to jQuery.data instead of a key/value pair; this gets
                // shallow copied over onto the existing cache
                if ( typeof name === "object" || typeof name === "function" ) {
                    if ( pvt ) {
                        cache[ id ] = jQuery.extend( cache[ id ], name );
                    } else {
                        cache[ id ].data = jQuery.extend( cache[ id ].data, name );
                    }
                }

                privateCache = thisCache = cache[ id ];

                // jQuery data() is stored in a separate object inside the object's internal data
                // cache in order to avoid key collisions between internal data and user-defined
                // data.
                if ( !pvt ) {
                    if ( !thisCache.data ) {
                        thisCache.data = {};
                    }

                    thisCache = thisCache.data;
                }

                if ( data !== undefined ) {
                    thisCache[ jQuery.camelCase( name ) ] = data;
                }

                // Users should not attempt to inspect the internal events object using jQuery.data,
                // it is undocumented and subject to change. But does anyone listen? No.
                if ( isEvents && !thisCache[ name ] ) {
                    return privateCache.events;
                }

                // Check for both converted-to-camel and non-converted data property names
                // If a data property was specified
                if ( getByName ) {

                    // First Try to find as-is property data
                    ret = thisCache[ name ];

                    // Test for null|undefined property data
                    if ( ret == null ) {

                        // Try to find the camelCased property
                        ret = thisCache[ jQuery.camelCase( name ) ];
                    }
                } else {
                    ret = thisCache;
                }

                return ret;
            },

            removeData: function( elem, name, pvt /* Internal Use Only */ ) {
                if ( !jQuery.acceptData( elem ) ) {
                    return;
                }

                var thisCache, i, l,

                // Reference to internal data cache key
                    internalKey = jQuery.expando,

                    isNode = elem.nodeType,

                // See jQuery.data for more information
                    cache = isNode ? jQuery.cache : elem,

                // See jQuery.data for more information
                    id = isNode ? elem[ internalKey ] : internalKey;

                // If there is already no cache entry for this object, there is no
                // purpose in continuing
                if ( !cache[ id ] ) {
                    return;
                }

                if ( name ) {

                    thisCache = pvt ? cache[ id ] : cache[ id ].data;

                    if ( thisCache ) {

                        // Support array or space separated string names for data keys
                        if ( !jQuery.isArray( name ) ) {

                            // try the string as a key before any manipulation
                            if ( name in thisCache ) {
                                name = [ name ];
                            } else {

                                // split the camel cased version by spaces unless a key with the spaces exists
                                name = jQuery.camelCase( name );
                                if ( name in thisCache ) {
                                    name = [ name ];
                                } else {
                                    name = name.split( " " );
                                }
                            }
                        }

                        for ( i = 0, l = name.length; i < l; i++ ) {
                            delete thisCache[ name[i] ];
                        }

                        // If there is no data left in the cache, we want to continue
                        // and let the cache object itself get destroyed
                        if ( !( pvt ? isEmptyDataObject : jQuery.isEmptyObject )( thisCache ) ) {
                            return;
                        }
                    }
                }

                // See jQuery.data for more information
                if ( !pvt ) {
                    delete cache[ id ].data;

                    // Don't destroy the parent cache unless the internal data object
                    // had been the only thing left in it
                    if ( !isEmptyDataObject(cache[ id ]) ) {
                        return;
                    }
                }

                // Browsers that fail expando deletion also refuse to delete expandos on
                // the window, but it will allow it on all other JS objects; other browsers
                // don't care
                // Ensure that `cache` is not a window object #10080
                if ( jQuery.support.deleteExpando || !cache.setInterval ) {
                    delete cache[ id ];
                } else {
                    cache[ id ] = null;
                }

                // We destroyed the cache and need to eliminate the expando on the node to avoid
                // false lookups in the cache for entries that no longer exist
                if ( isNode ) {
                    // IE does not allow us to delete expando properties from nodes,
                    // nor does it have a removeAttribute function on Document nodes;
                    // we must handle all of these cases
                    if ( jQuery.support.deleteExpando ) {
                        delete elem[ internalKey ];
                    } else if ( elem.removeAttribute ) {
                        elem.removeAttribute( internalKey );
                    } else {
                        elem[ internalKey ] = null;
                    }
                }
            },

            // For internal use only.
            _data: function( elem, name, data ) {
                return jQuery.data( elem, name, data, true );
            },

            // A method for determining if a DOM node can handle the data expando
            acceptData: function( elem ) {
                if ( elem.nodeName ) {
                    var match = jQuery.noData[ elem.nodeName.toLowerCase() ];

                    if ( match ) {
                        return !(match === true || elem.getAttribute("classid") !== match);
                    }
                }

                return true;
            }
        });

        jQuery.fn.extend({
            data: function( key, value ) {
                var parts, attr, name,
                    data = null;

                if ( typeof key === "undefined" ) {
                    if ( this.length ) {
                        data = jQuery.data( this[0] );

                        if ( this[0].nodeType === 1 && !jQuery._data( this[0], "parsedAttrs" ) ) {
                            attr = this[0].attributes;
                            for ( var i = 0, l = attr.length; i < l; i++ ) {
                                name = attr[i].name;

                                if ( name.indexOf( "data-" ) === 0 ) {
                                    name = jQuery.camelCase( name.substring(5) );

                                    dataAttr( this[0], name, data[ name ] );
                                }
                            }
                            jQuery._data( this[0], "parsedAttrs", true );
                        }
                    }

                    return data;

                } else if ( typeof key === "object" ) {
                    return this.each(function() {
                        jQuery.data( this, key );
                    });
                }

                parts = key.split(".");
                parts[1] = parts[1] ? "." + parts[1] : "";

                if ( value === undefined ) {
                    data = this.triggerHandler("getData" + parts[1] + "!", [parts[0]]);

                    // Try to fetch any internally stored data first
                    if ( data === undefined && this.length ) {
                        data = jQuery.data( this[0], key );
                        data = dataAttr( this[0], key, data );
                    }

                    return data === undefined && parts[1] ?
                        this.data( parts[0] ) :
                        data;

                } else {
                    return this.each(function() {
                        var self = jQuery( this ),
                            args = [ parts[0], value ];

                        self.triggerHandler( "setData" + parts[1] + "!", args );
                        jQuery.data( this, key, value );
                        self.triggerHandler( "changeData" + parts[1] + "!", args );
                    });
                }
            },

            removeData: function( key ) {
                return this.each(function() {
                    jQuery.removeData( this, key );
                });
            }
        });

        function dataAttr( elem, key, data ) {
            // If nothing was found internally, try to fetch any
            // data from the HTML5 data-* attribute
            if ( data === undefined && elem.nodeType === 1 ) {

                var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

                data = elem.getAttribute( name );

                if ( typeof data === "string" ) {
                    try {
                        data = data === "true" ? true :
                            data === "false" ? false :
                                data === "null" ? null :
                                    jQuery.isNumeric( data ) ? parseFloat( data ) :
                                        rbrace.test( data ) ? jQuery.parseJSON( data ) :
                                            data;
                    } catch( e ) {}

                    // Make sure we set the data so it isn't changed later
                    jQuery.data( elem, key, data );

                } else {
                    data = undefined;
                }
            }

            return data;
        }

    // checks a cache object for emptiness
        function isEmptyDataObject( obj ) {
            for ( var name in obj ) {

                // if the public data object is empty, the private is still empty
                if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
                    continue;
                }
                if ( name !== "toJSON" ) {
                    return false;
                }
            }

            return true;
        }




        function handleQueueMarkDefer( elem, type, src ) {
            var deferDataKey = type + "defer",
                queueDataKey = type + "queue",
                markDataKey = type + "mark",
                defer = jQuery._data( elem, deferDataKey );
            if ( defer &&
                ( src === "queue" || !jQuery._data(elem, queueDataKey) ) &&
                ( src === "mark" || !jQuery._data(elem, markDataKey) ) ) {
                // Give room for hard-coded callbacks to fire first
                // and eventually mark/queue something else on the element
                setTimeout( function() {
                    if ( !jQuery._data( elem, queueDataKey ) &&
                        !jQuery._data( elem, markDataKey ) ) {
                        jQuery.removeData( elem, deferDataKey, true );
                        defer.fire();
                    }
                }, 0 );
            }
        }

        jQuery.extend({

            _mark: function( elem, type ) {
                if ( elem ) {
                    type = ( type || "fx" ) + "mark";
                    jQuery._data( elem, type, (jQuery._data( elem, type ) || 0) + 1 );
                }
            },

            _unmark: function( force, elem, type ) {
                if ( force !== true ) {
                    type = elem;
                    elem = force;
                    force = false;
                }
                if ( elem ) {
                    type = type || "fx";
                    var key = type + "mark",
                        count = force ? 0 : ( (jQuery._data( elem, key ) || 1) - 1 );
                    if ( count ) {
                        jQuery._data( elem, key, count );
                    } else {
                        jQuery.removeData( elem, key, true );
                        handleQueueMarkDefer( elem, type, "mark" );
                    }
                }
            },

            queue: function( elem, type, data ) {
                var q;
                if ( elem ) {
                    type = ( type || "fx" ) + "queue";
                    q = jQuery._data( elem, type );

                    // Speed up dequeue by getting out quickly if this is just a lookup
                    if ( data ) {
                        if ( !q || jQuery.isArray(data) ) {
                            q = jQuery._data( elem, type, jQuery.makeArray(data) );
                        } else {
                            q.push( data );
                        }
                    }
                    return q || [];
                }
            },

            dequeue: function( elem, type ) {
                type = type || "fx";

                var queue = jQuery.queue( elem, type ),
                    fn = queue.shift(),
                    hooks = {};

                // If the fx queue is dequeued, always remove the progress sentinel
                if ( fn === "inprogress" ) {
                    fn = queue.shift();
                }

                if ( fn ) {
                    // Add a progress sentinel to prevent the fx queue from being
                    // automatically dequeued
                    if ( type === "fx" ) {
                        queue.unshift( "inprogress" );
                    }

                    jQuery._data( elem, type + ".run", hooks );
                    fn.call( elem, function() {
                        jQuery.dequeue( elem, type );
                    }, hooks );
                }

                if ( !queue.length ) {
                    jQuery.removeData( elem, type + "queue " + type + ".run", true );
                    handleQueueMarkDefer( elem, type, "queue" );
                }
            }
        });

        jQuery.fn.extend({
            queue: function( type, data ) {
                if ( typeof type !== "string" ) {
                    data = type;
                    type = "fx";
                }

                if ( data === undefined ) {
                    return jQuery.queue( this[0], type );
                }
                return this.each(function() {
                    var queue = jQuery.queue( this, type, data );

                    if ( type === "fx" && queue[0] !== "inprogress" ) {
                        jQuery.dequeue( this, type );
                    }
                });
            },
            dequeue: function( type ) {
                return this.each(function() {
                    jQuery.dequeue( this, type );
                });
            },
            // Based off of the plugin by Clint Helfers, with permission.
            // http://blindsignals.com/index.php/2009/07/jquery-delay/
            delay: function( time, type ) {
                time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
                type = type || "fx";

                return this.queue( type, function( next, hooks ) {
                    var timeout = setTimeout( next, time );
                    hooks.stop = function() {
                        clearTimeout( timeout );
                    };
                });
            },
            clearQueue: function( type ) {
                return this.queue( type || "fx", [] );
            },
            // Get a promise resolved when queues of a certain type
            // are emptied (fx is the type by default)
            promise: function( type, object ) {
                if ( typeof type !== "string" ) {
                    object = type;
                    type = undefined;
                }
                type = type || "fx";
                var defer = jQuery.Deferred(),
                    elements = this,
                    i = elements.length,
                    count = 1,
                    deferDataKey = type + "defer",
                    queueDataKey = type + "queue",
                    markDataKey = type + "mark",
                    tmp;
                function resolve() {
                    if ( !( --count ) ) {
                        defer.resolveWith( elements, [ elements ] );
                    }
                }
                while( i-- ) {
                    if (( tmp = jQuery.data( elements[ i ], deferDataKey, undefined, true ) ||
                        ( jQuery.data( elements[ i ], queueDataKey, undefined, true ) ||
                            jQuery.data( elements[ i ], markDataKey, undefined, true ) ) &&
                            jQuery.data( elements[ i ], deferDataKey, jQuery.Callbacks( "once memory" ), true ) )) {
                        count++;
                        tmp.add( resolve );
                    }
                }
                resolve();
                return defer.promise();
            }
        });




        var rclass = /[\n\t\r]/g,
            rspace = /\s+/,
            rreturn = /\r/g,
            rtype = /^(?:button|input)$/i,
            rfocusable = /^(?:button|input|object|select|textarea)$/i,
            rclickable = /^a(?:rea)?$/i,
            rboolean = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,
            getSetAttribute = jQuery.support.getSetAttribute,
            nodeHook, boolHook, fixSpecified;

        jQuery.fn.extend({
            attr: function( name, value ) {
                return jQuery.access( this, name, value, true, jQuery.attr );
            },

            removeAttr: function( name ) {
                return this.each(function() {
                    jQuery.removeAttr( this, name );
                });
            },

            prop: function( name, value ) {
                return jQuery.access( this, name, value, true, jQuery.prop );
            },

            removeProp: function( name ) {
                name = jQuery.propFix[ name ] || name;
                return this.each(function() {
                    // try/catch handles cases where IE balks (such as removing a property on window)
                    try {
                        this[ name ] = undefined;
                        delete this[ name ];
                    } catch( e ) {}
                });
            },

            addClass: function( value ) {
                var classNames, i, l, elem,
                    setClass, c, cl;

                if ( jQuery.isFunction( value ) ) {
                    return this.each(function( j ) {
                        jQuery( this ).addClass( value.call(this, j, this.className) );
                    });
                }

                if ( value && typeof value === "string" ) {
                    classNames = value.split( rspace );

                    for ( i = 0, l = this.length; i < l; i++ ) {
                        elem = this[ i ];

                        if ( elem.nodeType === 1 ) {
                            if ( !elem.className && classNames.length === 1 ) {
                                elem.className = value;

                            } else {
                                setClass = " " + elem.className + " ";

                                for ( c = 0, cl = classNames.length; c < cl; c++ ) {
                                    if ( !~setClass.indexOf( " " + classNames[ c ] + " " ) ) {
                                        setClass += classNames[ c ] + " ";
                                    }
                                }
                                elem.className = jQuery.trim( setClass );
                            }
                        }
                    }
                }

                return this;
            },

            removeClass: function( value ) {
                var classNames, i, l, elem, className, c, cl;

                if ( jQuery.isFunction( value ) ) {
                    return this.each(function( j ) {
                        jQuery( this ).removeClass( value.call(this, j, this.className) );
                    });
                }

                if ( (value && typeof value === "string") || value === undefined ) {
                    classNames = ( value || "" ).split( rspace );

                    for ( i = 0, l = this.length; i < l; i++ ) {
                        elem = this[ i ];

                        if ( elem.nodeType === 1 && elem.className ) {
                            if ( value ) {
                                className = (" " + elem.className + " ").replace( rclass, " " );
                                for ( c = 0, cl = classNames.length; c < cl; c++ ) {
                                    className = className.replace(" " + classNames[ c ] + " ", " ");
                                }
                                elem.className = jQuery.trim( className );

                            } else {
                                elem.className = "";
                            }
                        }
                    }
                }

                return this;
            },

            toggleClass: function( value, stateVal ) {
                var type = typeof value,
                    isBool = typeof stateVal === "boolean";

                if ( jQuery.isFunction( value ) ) {
                    return this.each(function( i ) {
                        jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
                    });
                }

                return this.each(function() {
                    if ( type === "string" ) {
                        // toggle individual class names
                        var className,
                            i = 0,
                            self = jQuery( this ),
                            state = stateVal,
                            classNames = value.split( rspace );

                        while ( (className = classNames[ i++ ]) ) {
                            // check each className given, space seperated list
                            state = isBool ? state : !self.hasClass( className );
                            self[ state ? "addClass" : "removeClass" ]( className );
                        }

                    } else if ( type === "undefined" || type === "boolean" ) {
                        if ( this.className ) {
                            // store className if set
                            jQuery._data( this, "__className__", this.className );
                        }

                        // toggle whole className
                        this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
                    }
                });
            },

            hasClass: function( selector ) {
                var className = " " + selector + " ",
                    i = 0,
                    l = this.length;
                for ( ; i < l; i++ ) {
                    if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) > -1 ) {
                        return true;
                    }
                }

                return false;
            },

            val: function( value ) {
                var hooks, ret, isFunction,
                    elem = this[0];

                if ( !arguments.length ) {
                    if ( elem ) {
                        hooks = jQuery.valHooks[ elem.nodeName.toLowerCase() ] || jQuery.valHooks[ elem.type ];

                        if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
                            return ret;
                        }

                        ret = elem.value;

                        return typeof ret === "string" ?
                            // handle most common string cases
                            ret.replace(rreturn, "") :
                            // handle cases where value is null/undef or number
                            ret == null ? "" : ret;
                    }

                    return;
                }

                isFunction = jQuery.isFunction( value );

                return this.each(function( i ) {
                    var self = jQuery(this), val;

                    if ( this.nodeType !== 1 ) {
                        return;
                    }

                    if ( isFunction ) {
                        val = value.call( this, i, self.val() );
                    } else {
                        val = value;
                    }

                    // Treat null/undefined as ""; convert numbers to string
                    if ( val == null ) {
                        val = "";
                    } else if ( typeof val === "number" ) {
                        val += "";
                    } else if ( jQuery.isArray( val ) ) {
                        val = jQuery.map(val, function ( value ) {
                            return value == null ? "" : value + "";
                        });
                    }

                    hooks = jQuery.valHooks[ this.nodeName.toLowerCase() ] || jQuery.valHooks[ this.type ];

                    // If set returns undefined, fall back to normal setting
                    if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
                        this.value = val;
                    }
                });
            }
        });

        jQuery.extend({
            valHooks: {
                option: {
                    get: function( elem ) {
                        // attributes.value is undefined in Blackberry 4.7 but
                        // uses .value. See #6932
                        var val = elem.attributes.value;
                        return !val || val.specified ? elem.value : elem.text;
                    }
                },
                select: {
                    get: function( elem ) {
                        var value, i, max, option,
                            index = elem.selectedIndex,
                            values = [],
                            options = elem.options,
                            one = elem.type === "select-one";

                        // Nothing was selected
                        if ( index < 0 ) {
                            return null;
                        }

                        // Loop through all the selected options
                        i = one ? index : 0;
                        max = one ? index + 1 : options.length;
                        for ( ; i < max; i++ ) {
                            option = options[ i ];

                            // Don't return options that are disabled or in a disabled optgroup
                            if ( option.selected && (jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null) &&
                                (!option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" )) ) {

                                // Get the specific value for the option
                                value = jQuery( option ).val();

                                // We don't need an array for one selects
                                if ( one ) {
                                    return value;
                                }

                                // Multi-Selects return an array
                                values.push( value );
                            }
                        }

                        // Fixes Bug #2551 -- select.val() broken in IE after form.reset()
                        if ( one && !values.length && options.length ) {
                            return jQuery( options[ index ] ).val();
                        }

                        return values;
                    },

                    set: function( elem, value ) {
                        var values = jQuery.makeArray( value );

                        jQuery(elem).find("option").each(function() {
                            this.selected = jQuery.inArray( jQuery(this).val(), values ) >= 0;
                        });

                        if ( !values.length ) {
                            elem.selectedIndex = -1;
                        }
                        return values;
                    }
                }
            },

            attrFn: {
                val: true,
                css: true,
                html: true,
                text: true,
                data: true,
                width: true,
                height: true,
                offset: true
            },

            attr: function( elem, name, value, pass ) {
                var ret, hooks, notxml,
                    nType = elem.nodeType;

                // don't get/set attributes on text, comment and attribute nodes
                if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
                    return;
                }

                if ( pass && name in jQuery.attrFn ) {
                    return jQuery( elem )[ name ]( value );
                }

                // Fallback to prop when attributes are not supported
                if ( typeof elem.getAttribute === "undefined" ) {
                    return jQuery.prop( elem, name, value );
                }

                notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

                // All attributes are lowercase
                // Grab necessary hook if one is defined
                if ( notxml ) {
                    name = name.toLowerCase();
                    hooks = jQuery.attrHooks[ name ] || ( rboolean.test( name ) ? boolHook : nodeHook );
                }

                if ( value !== undefined ) {

                    if ( value === null ) {
                        jQuery.removeAttr( elem, name );
                        return;

                    } else if ( hooks && "set" in hooks && notxml && (ret = hooks.set( elem, value, name )) !== undefined ) {
                        return ret;

                    } else {
                        elem.setAttribute( name, "" + value );
                        return value;
                    }

                } else if ( hooks && "get" in hooks && notxml && (ret = hooks.get( elem, name )) !== null ) {
                    return ret;

                } else {

                    ret = elem.getAttribute( name );

                    // Non-existent attributes return null, we normalize to undefined
                    return ret === null ?
                        undefined :
                        ret;
                }
            },

            removeAttr: function( elem, value ) {
                var propName, attrNames, name, l,
                    i = 0;

                if ( value && elem.nodeType === 1 ) {
                    attrNames = value.toLowerCase().split( rspace );
                    l = attrNames.length;

                    for ( ; i < l; i++ ) {
                        name = attrNames[ i ];

                        if ( name ) {
                            propName = jQuery.propFix[ name ] || name;

                            // See #9699 for explanation of this approach (setting first, then removal)
                            jQuery.attr( elem, name, "" );
                            elem.removeAttribute( getSetAttribute ? name : propName );

                            // Set corresponding property to false for boolean attributes
                            if ( rboolean.test( name ) && propName in elem ) {
                                elem[ propName ] = false;
                            }
                        }
                    }
                }
            },

            attrHooks: {
                type: {
                    set: function( elem, value ) {
                        // We can't allow the type property to be changed (since it causes problems in IE)
                        if ( rtype.test( elem.nodeName ) && elem.parentNode ) {
                            jQuery.error( "type property can't be changed" );
                        } else if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
                            // Setting the type on a radio button after the value resets the value in IE6-9
                            // Reset value to it's default in case type is set after value
                            // This is for element creation
                            var val = elem.value;
                            elem.setAttribute( "type", value );
                            if ( val ) {
                                elem.value = val;
                            }
                            return value;
                        }
                    }
                },
                // Use the value property for back compat
                // Use the nodeHook for button elements in IE6/7 (#1954)
                value: {
                    get: function( elem, name ) {
                        if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
                            return nodeHook.get( elem, name );
                        }
                        return name in elem ?
                            elem.value :
                            null;
                    },
                    set: function( elem, value, name ) {
                        if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
                            return nodeHook.set( elem, value, name );
                        }
                        // Does not return so that setAttribute is also used
                        elem.value = value;
                    }
                }
            },

            propFix: {
                tabindex: "tabIndex",
                readonly: "readOnly",
                "for": "htmlFor",
                "class": "className",
                maxlength: "maxLength",
                cellspacing: "cellSpacing",
                cellpadding: "cellPadding",
                rowspan: "rowSpan",
                colspan: "colSpan",
                usemap: "useMap",
                frameborder: "frameBorder",
                contenteditable: "contentEditable"
            },

            prop: function( elem, name, value ) {
                var ret, hooks, notxml,
                    nType = elem.nodeType;

                // don't get/set properties on text, comment and attribute nodes
                if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
                    return;
                }

                notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

                if ( notxml ) {
                    // Fix name and attach hooks
                    name = jQuery.propFix[ name ] || name;
                    hooks = jQuery.propHooks[ name ];
                }

                if ( value !== undefined ) {
                    if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
                        return ret;

                    } else {
                        return ( elem[ name ] = value );
                    }

                } else {
                    if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
                        return ret;

                    } else {
                        return elem[ name ];
                    }
                }
            },

            propHooks: {
                tabIndex: {
                    get: function( elem ) {
                        // elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
                        // http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
                        var attributeNode = elem.getAttributeNode("tabindex");

                        return attributeNode && attributeNode.specified ?
                            parseInt( attributeNode.value, 10 ) :
                            rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
                                0 :
                                undefined;
                    }
                }
            }
        });

    // Add the tabIndex propHook to attrHooks for back-compat (different case is intentional)
        jQuery.attrHooks.tabindex = jQuery.propHooks.tabIndex;

    // Hook for boolean attributes
        boolHook = {
            get: function( elem, name ) {
                // Align boolean attributes with corresponding properties
                // Fall back to attribute presence where some booleans are not supported
                var attrNode,
                    property = jQuery.prop( elem, name );
                return property === true || typeof property !== "boolean" && ( attrNode = elem.getAttributeNode(name) ) && attrNode.nodeValue !== false ?
                    name.toLowerCase() :
                    undefined;
            },
            set: function( elem, value, name ) {
                var propName;
                if ( value === false ) {
                    // Remove boolean attributes when set to false
                    jQuery.removeAttr( elem, name );
                } else {
                    // value is true since we know at this point it's type boolean and not false
                    // Set boolean attributes to the same name and set the DOM property
                    propName = jQuery.propFix[ name ] || name;
                    if ( propName in elem ) {
                        // Only set the IDL specifically if it already exists on the element
                        elem[ propName ] = true;
                    }

                    elem.setAttribute( name, name.toLowerCase() );
                }
                return name;
            }
        };

    // IE6/7 do not support getting/setting some attributes with get/setAttribute
        if ( !getSetAttribute ) {

            fixSpecified = {
                name: true,
                id: true
            };

            // Use this for any attribute in IE6/7
            // This fixes almost every IE6/7 issue
            nodeHook = jQuery.valHooks.button = {
                get: function( elem, name ) {
                    var ret;
                    ret = elem.getAttributeNode( name );
                    return ret && ( fixSpecified[ name ] ? ret.nodeValue !== "" : ret.specified ) ?
                        ret.nodeValue :
                        undefined;
                },
                set: function( elem, value, name ) {
                    // Set the existing or create a new attribute node
                    var ret = elem.getAttributeNode( name );
                    if ( !ret ) {
                        ret = document.createAttribute( name );
                        elem.setAttributeNode( ret );
                    }
                    return ( ret.nodeValue = value + "" );
                }
            };

            // Apply the nodeHook to tabindex
            jQuery.attrHooks.tabindex.set = nodeHook.set;

            // Set width and height to auto instead of 0 on empty string( Bug #8150 )
            // This is for removals
            jQuery.each([ "width", "height" ], function( i, name ) {
                jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
                    set: function( elem, value ) {
                        if ( value === "" ) {
                            elem.setAttribute( name, "auto" );
                            return value;
                        }
                    }
                });
            });

            // Set contenteditable to false on removals(#10429)
            // Setting to empty string throws an error as an invalid value
            jQuery.attrHooks.contenteditable = {
                get: nodeHook.get,
                set: function( elem, value, name ) {
                    if ( value === "" ) {
                        value = "false";
                    }
                    nodeHook.set( elem, value, name );
                }
            };
        }


    // Some attributes require a special call on IE
        if ( !jQuery.support.hrefNormalized ) {
            jQuery.each([ "href", "src", "width", "height" ], function( i, name ) {
                jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
                    get: function( elem ) {
                        var ret = elem.getAttribute( name, 2 );
                        return ret === null ? undefined : ret;
                    }
                });
            });
        }

        if ( !jQuery.support.style ) {
            jQuery.attrHooks.style = {
                get: function( elem ) {
                    // Return undefined in the case of empty string
                    // Normalize to lowercase since IE uppercases css property names
                    return elem.style.cssText.toLowerCase() || undefined;
                },
                set: function( elem, value ) {
                    return ( elem.style.cssText = "" + value );
                }
            };
        }

    // Safari mis-reports the default selected property of an option
    // Accessing the parent's selectedIndex property fixes it
        if ( !jQuery.support.optSelected ) {
            jQuery.propHooks.selected = jQuery.extend( jQuery.propHooks.selected, {
                get: function( elem ) {
                    var parent = elem.parentNode;

                    if ( parent ) {
                        parent.selectedIndex;

                        // Make sure that it also works with optgroups, see #5701
                        if ( parent.parentNode ) {
                            parent.parentNode.selectedIndex;
                        }
                    }
                    return null;
                }
            });
        }

    // IE6/7 call enctype encoding
        if ( !jQuery.support.enctype ) {
            jQuery.propFix.enctype = "encoding";
        }

    // Radios and checkboxes getter/setter
        if ( !jQuery.support.checkOn ) {
            jQuery.each([ "radio", "checkbox" ], function() {
                jQuery.valHooks[ this ] = {
                    get: function( elem ) {
                        // Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
                        return elem.getAttribute("value") === null ? "on" : elem.value;
                    }
                };
            });
        }
        jQuery.each([ "radio", "checkbox" ], function() {
            jQuery.valHooks[ this ] = jQuery.extend( jQuery.valHooks[ this ], {
                set: function( elem, value ) {
                    if ( jQuery.isArray( value ) ) {
                        return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
                    }
                }
            });
        });




        var rformElems = /^(?:textarea|input|select)$/i,
            rtypenamespace = /^([^\.]*)?(?:\.(.+))?$/,
            rhoverHack = /\bhover(\.\S+)?\b/,
            rkeyEvent = /^key/,
            rmouseEvent = /^(?:mouse|contextmenu)|click/,
            rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
            rquickIs = /^(\w*)(?:#([\w\-]+))?(?:\.([\w\-]+))?$/,
            quickParse = function( selector ) {
                var quick = rquickIs.exec( selector );
                if ( quick ) {
                    //   0  1    2   3
                    // [ _, tag, id, class ]
                    quick[1] = ( quick[1] || "" ).toLowerCase();
                    quick[3] = quick[3] && new RegExp( "(?:^|\\s)" + quick[3] + "(?:\\s|$)" );
                }
                return quick;
            },
            quickIs = function( elem, m ) {
                var attrs = elem.attributes || {};
                return (
                    (!m[1] || elem.nodeName.toLowerCase() === m[1]) &&
                        (!m[2] || (attrs.id || {}).value === m[2]) &&
                        (!m[3] || m[3].test( (attrs[ "class" ] || {}).value ))
                    );
            },
            hoverHack = function( events ) {
                return jQuery.event.special.hover ? events : events.replace( rhoverHack, "mouseenter$1 mouseleave$1" );
            };

        /*
         * Helper functions for managing events -- not part of the public interface.
         * Props to Dean Edwards' addEvent library for many of the ideas.
         */
        jQuery.event = {

            add: function( elem, types, handler, data, selector ) {

                var elemData, eventHandle, events,
                    t, tns, type, namespaces, handleObj,
                    handleObjIn, quick, handlers, special;

                // Don't attach events to noData or text/comment nodes (allow plain objects tho)
                if ( elem.nodeType === 3 || elem.nodeType === 8 || !types || !handler || !(elemData = jQuery._data( elem )) ) {
                    return;
                }

                // Caller can pass in an object of custom data in lieu of the handler
                if ( handler.handler ) {
                    handleObjIn = handler;
                    handler = handleObjIn.handler;
                }

                // Make sure that the handler has a unique ID, used to find/remove it later
                if ( !handler.guid ) {
                    handler.guid = jQuery.guid++;
                }

                // Init the element's event structure and main handler, if this is the first
                events = elemData.events;
                if ( !events ) {
                    elemData.events = events = {};
                }
                eventHandle = elemData.handle;
                if ( !eventHandle ) {
                    elemData.handle = eventHandle = function( e ) {
                        // Discard the second event of a jQuery.event.trigger() and
                        // when an event is called after a page has unloaded
                        return typeof jQuery !== "undefined" && (!e || jQuery.event.triggered !== e.type) ?
                            jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
                            undefined;
                    };
                    // Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
                    eventHandle.elem = elem;
                }

                // Handle multiple events separated by a space
                // jQuery(...).bind("mouseover mouseout", fn);
                types = jQuery.trim( hoverHack(types) ).split( " " );
                for ( t = 0; t < types.length; t++ ) {

                    tns = rtypenamespace.exec( types[t] ) || [];
                    type = tns[1];
                    namespaces = ( tns[2] || "" ).split( "." ).sort();

                    // If event changes its type, use the special event handlers for the changed type
                    special = jQuery.event.special[ type ] || {};

                    // If selector defined, determine special event api type, otherwise given type
                    type = ( selector ? special.delegateType : special.bindType ) || type;

                    // Update special based on newly reset type
                    special = jQuery.event.special[ type ] || {};

                    // handleObj is passed to all event handlers
                    handleObj = jQuery.extend({
                        type: type,
                        origType: tns[1],
                        data: data,
                        handler: handler,
                        guid: handler.guid,
                        selector: selector,
                        quick: quickParse( selector ),
                        namespace: namespaces.join(".")
                    }, handleObjIn );

                    // Init the event handler queue if we're the first
                    handlers = events[ type ];
                    if ( !handlers ) {
                        handlers = events[ type ] = [];
                        handlers.delegateCount = 0;

                        // Only use addEventListener/attachEvent if the special events handler returns false
                        if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
                            // Bind the global event handler to the element
                            if ( elem.addEventListener ) {
                                elem.addEventListener( type, eventHandle, false );

                            } else if ( elem.attachEvent ) {
                                elem.attachEvent( "on" + type, eventHandle );
                            }
                        }
                    }

                    if ( special.add ) {
                        special.add.call( elem, handleObj );

                        if ( !handleObj.handler.guid ) {
                            handleObj.handler.guid = handler.guid;
                        }
                    }

                    // Add to the element's handler list, delegates in front
                    if ( selector ) {
                        handlers.splice( handlers.delegateCount++, 0, handleObj );
                    } else {
                        handlers.push( handleObj );
                    }

                    // Keep track of which events have ever been used, for event optimization
                    jQuery.event.global[ type ] = true;
                }

                // Nullify elem to prevent memory leaks in IE
                elem = null;
            },

            global: {},

            // Detach an event or set of events from an element
            remove: function( elem, types, handler, selector, mappedTypes ) {

                var elemData = jQuery.hasData( elem ) && jQuery._data( elem ),
                    t, tns, type, origType, namespaces, origCount,
                    j, events, special, handle, eventType, handleObj;

                if ( !elemData || !(events = elemData.events) ) {
                    return;
                }

                // Once for each type.namespace in types; type may be omitted
                types = jQuery.trim( hoverHack( types || "" ) ).split(" ");
                for ( t = 0; t < types.length; t++ ) {
                    tns = rtypenamespace.exec( types[t] ) || [];
                    type = origType = tns[1];
                    namespaces = tns[2];

                    // Unbind all events (on this namespace, if provided) for the element
                    if ( !type ) {
                        for ( type in events ) {
                            jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
                        }
                        continue;
                    }

                    special = jQuery.event.special[ type ] || {};
                    type = ( selector? special.delegateType : special.bindType ) || type;
                    eventType = events[ type ] || [];
                    origCount = eventType.length;
                    namespaces = namespaces ? new RegExp("(^|\\.)" + namespaces.split(".").sort().join("\\.(?:.*\\.)?") + "(\\.|$)") : null;

                    // Remove matching events
                    for ( j = 0; j < eventType.length; j++ ) {
                        handleObj = eventType[ j ];

                        if ( ( mappedTypes || origType === handleObj.origType ) &&
                            ( !handler || handler.guid === handleObj.guid ) &&
                            ( !namespaces || namespaces.test( handleObj.namespace ) ) &&
                            ( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
                            eventType.splice( j--, 1 );

                            if ( handleObj.selector ) {
                                eventType.delegateCount--;
                            }
                            if ( special.remove ) {
                                special.remove.call( elem, handleObj );
                            }
                        }
                    }

                    // Remove generic event handler if we removed something and no more handlers exist
                    // (avoids potential for endless recursion during removal of special event handlers)
                    if ( eventType.length === 0 && origCount !== eventType.length ) {
                        if ( !special.teardown || special.teardown.call( elem, namespaces ) === false ) {
                            jQuery.removeEvent( elem, type, elemData.handle );
                        }

                        delete events[ type ];
                    }
                }

                // Remove the expando if it's no longer used
                if ( jQuery.isEmptyObject( events ) ) {
                    handle = elemData.handle;
                    if ( handle ) {
                        handle.elem = null;
                    }

                    // removeData also checks for emptiness and clears the expando if empty
                    // so use it instead of delete
                    jQuery.removeData( elem, [ "events", "handle" ], true );
                }
            },

            // Events that are safe to short-circuit if no handlers are attached.
            // Native DOM events should not be added, they may have inline handlers.
            customEvent: {
                "getData": true,
                "setData": true,
                "changeData": true
            },

            trigger: function( event, data, elem, onlyHandlers ) {
                // Don't do events on text and comment nodes
                if ( elem && (elem.nodeType === 3 || elem.nodeType === 8) ) {
                    return;
                }

                // Event object or event type
                var type = event.type || event,
                    namespaces = [],
                    cache, exclusive, i, cur, old, ontype, special, handle, eventPath, bubbleType;

                // focus/blur morphs to focusin/out; ensure we're not firing them right now
                if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
                    return;
                }

                if ( type.indexOf( "!" ) >= 0 ) {
                    // Exclusive events trigger only for the exact event (no namespaces)
                    type = type.slice(0, -1);
                    exclusive = true;
                }

                if ( type.indexOf( "." ) >= 0 ) {
                    // Namespaced trigger; create a regexp to match event type in handle()
                    namespaces = type.split(".");
                    type = namespaces.shift();
                    namespaces.sort();
                }

                if ( (!elem || jQuery.event.customEvent[ type ]) && !jQuery.event.global[ type ] ) {
                    // No jQuery handlers for this event type, and it can't have inline handlers
                    return;
                }

                // Caller can pass in an Event, Object, or just an event type string
                event = typeof event === "object" ?
                    // jQuery.Event object
                    event[ jQuery.expando ] ? event :
                        // Object literal
                        new jQuery.Event( type, event ) :
                    // Just the event type (string)
                    new jQuery.Event( type );

                event.type = type;
                event.isTrigger = true;
                event.exclusive = exclusive;
                event.namespace = namespaces.join( "." );
                event.namespace_re = event.namespace? new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.)?") + "(\\.|$)") : null;
                ontype = type.indexOf( ":" ) < 0 ? "on" + type : "";

                // Handle a global trigger
                if ( !elem ) {

                    // TODO: Stop taunting the data cache; remove global events and always attach to document
                    cache = jQuery.cache;
                    for ( i in cache ) {
                        if ( cache[ i ].events && cache[ i ].events[ type ] ) {
                            jQuery.event.trigger( event, data, cache[ i ].handle.elem, true );
                        }
                    }
                    return;
                }

                // Clean up the event in case it is being reused
                event.result = undefined;
                if ( !event.target ) {
                    event.target = elem;
                }

                // Clone any incoming data and prepend the event, creating the handler arg list
                data = data != null ? jQuery.makeArray( data ) : [];
                data.unshift( event );

                // Allow special events to draw outside the lines
                special = jQuery.event.special[ type ] || {};
                if ( special.trigger && special.trigger.apply( elem, data ) === false ) {
                    return;
                }

                // Determine event propagation path in advance, per W3C events spec (#9951)
                // Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
                eventPath = [[ elem, special.bindType || type ]];
                if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

                    bubbleType = special.delegateType || type;
                    cur = rfocusMorph.test( bubbleType + type ) ? elem : elem.parentNode;
                    old = null;
                    for ( ; cur; cur = cur.parentNode ) {
                        eventPath.push([ cur, bubbleType ]);
                        old = cur;
                    }

                    // Only add window if we got to document (e.g., not plain obj or detached DOM)
                    if ( old && old === elem.ownerDocument ) {
                        eventPath.push([ old.defaultView || old.parentWindow || window, bubbleType ]);
                    }
                }

                // Fire handlers on the event path
                for ( i = 0; i < eventPath.length && !event.isPropagationStopped(); i++ ) {

                    cur = eventPath[i][0];
                    event.type = eventPath[i][1];

                    handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
                    if ( handle ) {
                        handle.apply( cur, data );
                    }
                    // Note that this is a bare JS function and not a jQuery handler
                    handle = ontype && cur[ ontype ];
                    if ( handle && jQuery.acceptData( cur ) && handle.apply( cur, data ) === false ) {
                        event.preventDefault();
                    }
                }
                event.type = type;

                // If nobody prevented the default action, do it now
                if ( !onlyHandlers && !event.isDefaultPrevented() ) {

                    if ( (!special._default || special._default.apply( elem.ownerDocument, data ) === false) &&
                        !(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

                        // Call a native DOM method on the target with the same name name as the event.
                        // Can't use an .isFunction() check here because IE6/7 fails that test.
                        // Don't do default actions on window, that's where global variables be (#6170)
                        // IE<9 dies on focus/blur to hidden element (#1486)
                        if ( ontype && elem[ type ] && ((type !== "focus" && type !== "blur") || event.target.offsetWidth !== 0) && !jQuery.isWindow( elem ) ) {

                            // Don't re-trigger an onFOO event when we call its FOO() method
                            old = elem[ ontype ];

                            if ( old ) {
                                elem[ ontype ] = null;
                            }

                            // Prevent re-triggering of the same event, since we already bubbled it above
                            jQuery.event.triggered = type;
                            elem[ type ]();
                            jQuery.event.triggered = undefined;

                            if ( old ) {
                                elem[ ontype ] = old;
                            }
                        }
                    }
                }

                return event.result;
            },

            dispatch: function( event ) {

                // Make a writable jQuery.Event from the native event object
                event = jQuery.event.fix( event || window.event );

                var handlers = ( (jQuery._data( this, "events" ) || {} )[ event.type ] || []),
                    delegateCount = handlers.delegateCount,
                    args = [].slice.call( arguments, 0 ),
                    run_all = !event.exclusive && !event.namespace,
                    handlerQueue = [],
                    i, j, cur, jqcur, ret, selMatch, matched, matches, handleObj, sel, related;

                // Use the fix-ed jQuery.Event rather than the (read-only) native event
                args[0] = event;
                event.delegateTarget = this;

                // Determine handlers that should run if there are delegated events
                // Avoid disabled elements in IE (#6911) and non-left-click bubbling in Firefox (#3861)
                if ( delegateCount && !event.target.disabled && !(event.button && event.type === "click") ) {

                    // Pregenerate a single jQuery object for reuse with .is()
                    jqcur = jQuery(this);
                    jqcur.context = this.ownerDocument || this;

                    for ( cur = event.target; cur != this; cur = cur.parentNode || this ) {
                        selMatch = {};
                        matches = [];
                        jqcur[0] = cur;
                        for ( i = 0; i < delegateCount; i++ ) {
                            handleObj = handlers[ i ];
                            sel = handleObj.selector;

                            if ( selMatch[ sel ] === undefined ) {
                                selMatch[ sel ] = (
                                    handleObj.quick ? quickIs( cur, handleObj.quick ) : jqcur.is( sel )
                                    );
                            }
                            if ( selMatch[ sel ] ) {
                                matches.push( handleObj );
                            }
                        }
                        if ( matches.length ) {
                            handlerQueue.push({ elem: cur, matches: matches });
                        }
                    }
                }

                // Add the remaining (directly-bound) handlers
                if ( handlers.length > delegateCount ) {
                    handlerQueue.push({ elem: this, matches: handlers.slice( delegateCount ) });
                }

                // Run delegates first; they may want to stop propagation beneath us
                for ( i = 0; i < handlerQueue.length && !event.isPropagationStopped(); i++ ) {
                    matched = handlerQueue[ i ];
                    event.currentTarget = matched.elem;

                    for ( j = 0; j < matched.matches.length && !event.isImmediatePropagationStopped(); j++ ) {
                        handleObj = matched.matches[ j ];

                        // Triggered event must either 1) be non-exclusive and have no namespace, or
                        // 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
                        if ( run_all || (!event.namespace && !handleObj.namespace) || event.namespace_re && event.namespace_re.test( handleObj.namespace ) ) {

                            event.data = handleObj.data;
                            event.handleObj = handleObj;

                            ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
                                .apply( matched.elem, args );

                            if ( ret !== undefined ) {
                                event.result = ret;
                                if ( ret === false ) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }
                            }
                        }
                    }
                }

                return event.result;
            },

            // Includes some event props shared by KeyEvent and MouseEvent
            // *** attrChange attrName relatedNode srcElement  are not normalized, non-W3C, deprecated, will be removed in 1.8 ***
            props: "attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

            fixHooks: {},

            keyHooks: {
                props: "char charCode key keyCode".split(" "),
                filter: function( event, original ) {

                    // Add which for key events
                    if ( event.which == null ) {
                        event.which = original.charCode != null ? original.charCode : original.keyCode;
                    }

                    return event;
                }
            },

            mouseHooks: {
                props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
                filter: function( event, original ) {
                    var eventDoc, doc, body,
                        button = original.button,
                        fromElement = original.fromElement;

                    // Calculate pageX/Y if missing and clientX/Y available
                    if ( event.pageX == null && original.clientX != null ) {
                        eventDoc = event.target.ownerDocument || document;
                        doc = eventDoc.documentElement;
                        body = eventDoc.body;

                        event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
                        event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
                    }

                    // Add relatedTarget, if necessary
                    if ( !event.relatedTarget && fromElement ) {
                        event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
                    }

                    // Add which for click: 1 === left; 2 === middle; 3 === right
                    // Note: button is not normalized, so don't use it
                    if ( !event.which && button !== undefined ) {
                        event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
                    }

                    return event;
                }
            },

            fix: function( event ) {
                if ( event[ jQuery.expando ] ) {
                    return event;
                }

                // Create a writable copy of the event object and normalize some properties
                var i, prop,
                    originalEvent = event,
                    fixHook = jQuery.event.fixHooks[ event.type ] || {},
                    copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

                event = jQuery.Event( originalEvent );

                for ( i = copy.length; i; ) {
                    prop = copy[ --i ];
                    event[ prop ] = originalEvent[ prop ];
                }

                // Fix target property, if necessary (#1925, IE 6/7/8 & Safari2)
                if ( !event.target ) {
                    event.target = originalEvent.srcElement || document;
                }

                // Target should not be a text node (#504, Safari)
                if ( event.target.nodeType === 3 ) {
                    event.target = event.target.parentNode;
                }

                // For mouse/key events; add metaKey if it's not there (#3368, IE6/7/8)
                if ( event.metaKey === undefined ) {
                    event.metaKey = event.ctrlKey;
                }

                return fixHook.filter? fixHook.filter( event, originalEvent ) : event;
            },

            special: {
                ready: {
                    // Make sure the ready event is setup
                    setup: jQuery.bindReady
                },

                load: {
                    // Prevent triggered image.load events from bubbling to window.load
                    noBubble: true
                },

                focus: {
                    delegateType: "focusin"
                },
                blur: {
                    delegateType: "focusout"
                },

                beforeunload: {
                    setup: function( data, namespaces, eventHandle ) {
                        // We only want to do this special case on windows
                        if ( jQuery.isWindow( this ) ) {
                            this.onbeforeunload = eventHandle;
                        }
                    },

                    teardown: function( namespaces, eventHandle ) {
                        if ( this.onbeforeunload === eventHandle ) {
                            this.onbeforeunload = null;
                        }
                    }
                }
            },

            simulate: function( type, elem, event, bubble ) {
                // Piggyback on a donor event to simulate a different one.
                // Fake originalEvent to avoid donor's stopPropagation, but if the
                // simulated event prevents default then we do the same on the donor.
                var e = jQuery.extend(
                    new jQuery.Event(),
                    event,
                    { type: type,
                        isSimulated: true,
                        originalEvent: {}
                    }
                );
                if ( bubble ) {
                    jQuery.event.trigger( e, null, elem );
                } else {
                    jQuery.event.dispatch.call( elem, e );
                }
                if ( e.isDefaultPrevented() ) {
                    event.preventDefault();
                }
            }
        };

    // Some plugins are using, but it's undocumented/deprecated and will be removed.
    // The 1.7 special event interface should provide all the hooks needed now.
        jQuery.event.handle = jQuery.event.dispatch;

        jQuery.removeEvent = document.removeEventListener ?
            function( elem, type, handle ) {
                if ( elem.removeEventListener ) {
                    elem.removeEventListener( type, handle, false );
                }
            } :
            function( elem, type, handle ) {
                if ( elem.detachEvent ) {
                    elem.detachEvent( "on" + type, handle );
                }
            };

        jQuery.Event = function( src, props ) {
            // Allow instantiation without the 'new' keyword
            if ( !(this instanceof jQuery.Event) ) {
                return new jQuery.Event( src, props );
            }

            // Event object
            if ( src && src.type ) {
                this.originalEvent = src;
                this.type = src.type;

                // Events bubbling up the document may have been marked as prevented
                // by a handler lower down the tree; reflect the correct value.
                this.isDefaultPrevented = ( src.defaultPrevented || src.returnValue === false ||
                    src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

                // Event type
            } else {
                this.type = src;
            }

            // Put explicitly provided properties onto the event object
            if ( props ) {
                jQuery.extend( this, props );
            }

            // Create a timestamp if incoming event doesn't have one
            this.timeStamp = src && src.timeStamp || jQuery.now();

            // Mark it as fixed
            this[ jQuery.expando ] = true;
        };

        function returnFalse() {
            return false;
        }
        function returnTrue() {
            return true;
        }

    // jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
    // http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
        jQuery.Event.prototype = {
            preventDefault: function() {
                this.isDefaultPrevented = returnTrue;

                var e = this.originalEvent;
                if ( !e ) {
                    return;
                }

                // if preventDefault exists run it on the original event
                if ( e.preventDefault ) {
                    e.preventDefault();

                    // otherwise set the returnValue property of the original event to false (IE)
                } else {
                    e.returnValue = false;
                }
            },
            stopPropagation: function() {
                this.isPropagationStopped = returnTrue;

                var e = this.originalEvent;
                if ( !e ) {
                    return;
                }
                // if stopPropagation exists run it on the original event
                if ( e.stopPropagation ) {
                    e.stopPropagation();
                }
                // otherwise set the cancelBubble property of the original event to true (IE)
                e.cancelBubble = true;
            },
            stopImmediatePropagation: function() {
                this.isImmediatePropagationStopped = returnTrue;
                this.stopPropagation();
            },
            isDefaultPrevented: returnFalse,
            isPropagationStopped: returnFalse,
            isImmediatePropagationStopped: returnFalse
        };

    // Create mouseenter/leave events using mouseover/out and event-time checks
        jQuery.each({
            mouseenter: "mouseover",
            mouseleave: "mouseout"
        }, function( orig, fix ) {
            jQuery.event.special[ orig ] = {
                delegateType: fix,
                bindType: fix,

                handle: function( event ) {
                    var target = this,
                        related = event.relatedTarget,
                        handleObj = event.handleObj,
                        selector = handleObj.selector,
                        ret;

                    // For mousenter/leave call the handler if related is outside the target.
                    // NB: No relatedTarget if the mouse left/entered the browser window
                    if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
                        event.type = handleObj.origType;
                        ret = handleObj.handler.apply( this, arguments );
                        event.type = fix;
                    }
                    return ret;
                }
            };
        });

    // IE submit delegation
        if ( !jQuery.support.submitBubbles ) {

            jQuery.event.special.submit = {
                setup: function() {
                    // Only need this for delegated form submit events
                    if ( jQuery.nodeName( this, "form" ) ) {
                        return false;
                    }

                    // Lazy-add a submit handler when a descendant form may potentially be submitted
                    jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
                        // Node name check avoids a VML-related crash in IE (#9807)
                        var elem = e.target,
                            form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
                        if ( form && !form._submit_attached ) {
                            jQuery.event.add( form, "submit._submit", function( event ) {
                                // If form was submitted by the user, bubble the event up the tree
                                if ( this.parentNode && !event.isTrigger ) {
                                    jQuery.event.simulate( "submit", this.parentNode, event, true );
                                }
                            });
                            form._submit_attached = true;
                        }
                    });
                    // return undefined since we don't need an event listener
                },

                teardown: function() {
                    // Only need this for delegated form submit events
                    if ( jQuery.nodeName( this, "form" ) ) {
                        return false;
                    }

                    // Remove delegated handlers; cleanData eventually reaps submit handlers attached above
                    jQuery.event.remove( this, "._submit" );
                }
            };
        }

    // IE change delegation and checkbox/radio fix
        if ( !jQuery.support.changeBubbles ) {

            jQuery.event.special.change = {

                setup: function() {

                    if ( rformElems.test( this.nodeName ) ) {
                        // IE doesn't fire change on a check/radio until blur; trigger it on click
                        // after a propertychange. Eat the blur-change in special.change.handle.
                        // This still fires onchange a second time for check/radio after blur.
                        if ( this.type === "checkbox" || this.type === "radio" ) {
                            jQuery.event.add( this, "propertychange._change", function( event ) {
                                if ( event.originalEvent.propertyName === "checked" ) {
                                    this._just_changed = true;
                                }
                            });
                            jQuery.event.add( this, "click._change", function( event ) {
                                if ( this._just_changed && !event.isTrigger ) {
                                    this._just_changed = false;
                                    jQuery.event.simulate( "change", this, event, true );
                                }
                            });
                        }
                        return false;
                    }
                    // Delegated event; lazy-add a change handler on descendant inputs
                    jQuery.event.add( this, "beforeactivate._change", function( e ) {
                        var elem = e.target;

                        if ( rformElems.test( elem.nodeName ) && !elem._change_attached ) {
                            jQuery.event.add( elem, "change._change", function( event ) {
                                if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
                                    jQuery.event.simulate( "change", this.parentNode, event, true );
                                }
                            });
                            elem._change_attached = true;
                        }
                    });
                },

                handle: function( event ) {
                    var elem = event.target;

                    // Swallow native change events from checkbox/radio, we already triggered them above
                    if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
                        return event.handleObj.handler.apply( this, arguments );
                    }
                },

                teardown: function() {
                    jQuery.event.remove( this, "._change" );

                    return rformElems.test( this.nodeName );
                }
            };
        }

    // Create "bubbling" focus and blur events
        if ( !jQuery.support.focusinBubbles ) {
            jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

                // Attach a single capturing handler while someone wants focusin/focusout
                var attaches = 0,
                    handler = function( event ) {
                        jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
                    };

                jQuery.event.special[ fix ] = {
                    setup: function() {
                        if ( attaches++ === 0 ) {
                            document.addEventListener( orig, handler, true );
                        }
                    },
                    teardown: function() {
                        if ( --attaches === 0 ) {
                            document.removeEventListener( orig, handler, true );
                        }
                    }
                };
            });
        }

        jQuery.fn.extend({

            on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
                var origFn, type;

                // Types can be a map of types/handlers
                if ( typeof types === "object" ) {
                    // ( types-Object, selector, data )
                    if ( typeof selector !== "string" ) {
                        // ( types-Object, data )
                        data = selector;
                        selector = undefined;
                    }
                    for ( type in types ) {
                        this.on( type, selector, data, types[ type ], one );
                    }
                    return this;
                }

                if ( data == null && fn == null ) {
                    // ( types, fn )
                    fn = selector;
                    data = selector = undefined;
                } else if ( fn == null ) {
                    if ( typeof selector === "string" ) {
                        // ( types, selector, fn )
                        fn = data;
                        data = undefined;
                    } else {
                        // ( types, data, fn )
                        fn = data;
                        data = selector;
                        selector = undefined;
                    }
                }
                if ( fn === false ) {
                    fn = returnFalse;
                } else if ( !fn ) {
                    return this;
                }

                if ( one === 1 ) {
                    origFn = fn;
                    fn = function( event ) {
                        // Can use an empty set, since event contains the info
                        jQuery().off( event );
                        return origFn.apply( this, arguments );
                    };
                    // Use same guid so caller can remove using origFn
                    fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
                }
                return this.each( function() {
                    jQuery.event.add( this, types, fn, data, selector );
                });
            },
            one: function( types, selector, data, fn ) {
                return this.on.call( this, types, selector, data, fn, 1 );
            },
            off: function( types, selector, fn ) {
                if ( types && types.preventDefault && types.handleObj ) {
                    // ( event )  dispatched jQuery.Event
                    var handleObj = types.handleObj;
                    jQuery( types.delegateTarget ).off(
                        handleObj.namespace? handleObj.type + "." + handleObj.namespace : handleObj.type,
                        handleObj.selector,
                        handleObj.handler
                    );
                    return this;
                }
                if ( typeof types === "object" ) {
                    // ( types-object [, selector] )
                    for ( var type in types ) {
                        this.off( type, selector, types[ type ] );
                    }
                    return this;
                }
                if ( selector === false || typeof selector === "function" ) {
                    // ( types [, fn] )
                    fn = selector;
                    selector = undefined;
                }
                if ( fn === false ) {
                    fn = returnFalse;
                }
                return this.each(function() {
                    jQuery.event.remove( this, types, fn, selector );
                });
            },

            bind: function( types, data, fn ) {
                return this.on( types, null, data, fn );
            },
            unbind: function( types, fn ) {
                return this.off( types, null, fn );
            },

            live: function( types, data, fn ) {
                jQuery( this.context ).on( types, this.selector, data, fn );
                return this;
            },
            die: function( types, fn ) {
                jQuery( this.context ).off( types, this.selector || "**", fn );
                return this;
            },

            delegate: function( selector, types, data, fn ) {
                return this.on( types, selector, data, fn );
            },
            undelegate: function( selector, types, fn ) {
                // ( namespace ) or ( selector, types [, fn] )
                return arguments.length == 1? this.off( selector, "**" ) : this.off( types, selector, fn );
            },

            trigger: function( type, data ) {
                return this.each(function() {
                    jQuery.event.trigger( type, data, this );
                });
            },
            triggerHandler: function( type, data ) {
                if ( this[0] ) {
                    return jQuery.event.trigger( type, data, this[0], true );
                }
            },

            toggle: function( fn ) {
                // Save reference to arguments for access in closure
                var args = arguments,
                    guid = fn.guid || jQuery.guid++,
                    i = 0,
                    toggler = function( event ) {
                        // Figure out which function to execute
                        var lastToggle = ( jQuery._data( this, "lastToggle" + fn.guid ) || 0 ) % i;
                        jQuery._data( this, "lastToggle" + fn.guid, lastToggle + 1 );

                        // Make sure that clicks stop
                        event.preventDefault();

                        // and execute the function
                        return args[ lastToggle ].apply( this, arguments ) || false;
                    };

                // link all the functions, so any of them can unbind this click handler
                toggler.guid = guid;
                while ( i < args.length ) {
                    args[ i++ ].guid = guid;
                }

                return this.click( toggler );
            },

            hover: function( fnOver, fnOut ) {
                return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
            }
        });

        jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
            "mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
            "change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

            // Handle event binding
            jQuery.fn[ name ] = function( data, fn ) {
                if ( fn == null ) {
                    fn = data;
                    data = null;
                }

                return arguments.length > 0 ?
                    this.on( name, null, data, fn ) :
                    this.trigger( name );
            };

            if ( jQuery.attrFn ) {
                jQuery.attrFn[ name ] = true;
            }

            if ( rkeyEvent.test( name ) ) {
                jQuery.event.fixHooks[ name ] = jQuery.event.keyHooks;
            }

            if ( rmouseEvent.test( name ) ) {
                jQuery.event.fixHooks[ name ] = jQuery.event.mouseHooks;
            }
        });



        /*!
         * Sizzle CSS Selector Engine
         *  Copyright 2011, The Dojo Foundation
         *  Released under the MIT, BSD, and GPL Licenses.
         *  More information: http://sizzlejs.com/
         */
        (function(){

            var chunker = /((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g,
                expando = "sizcache" + (Math.random() + '').replace('.', ''),
                done = 0,
                toString = Object.prototype.toString,
                hasDuplicate = false,
                baseHasDuplicate = true,
                rBackslash = /\\/g,
                rReturn = /\r\n/g,
                rNonWord = /\W/;

    // Here we check if the JavaScript engine is using some sort of
    // optimization where it does not always call our comparision
    // function. If that is the case, discard the hasDuplicate value.
    //   Thus far that includes Google Chrome.
            [0, 0].sort(function() {
                baseHasDuplicate = false;
                return 0;
            });

            var Sizzle = function( selector, context, results, seed ) {
                results = results || [];
                context = context || document;

                var origContext = context;

                if ( context.nodeType !== 1 && context.nodeType !== 9 ) {
                    return [];
                }

                if ( !selector || typeof selector !== "string" ) {
                    return results;
                }

                var m, set, checkSet, extra, ret, cur, pop, i,
                    prune = true,
                    contextXML = Sizzle.isXML( context ),
                    parts = [],
                    soFar = selector;

                // Reset the position of the chunker regexp (start from head)
                do {
                    chunker.exec( "" );
                    m = chunker.exec( soFar );

                    if ( m ) {
                        soFar = m[3];

                        parts.push( m[1] );

                        if ( m[2] ) {
                            extra = m[3];
                            break;
                        }
                    }
                } while ( m );

                if ( parts.length > 1 && origPOS.exec( selector ) ) {

                    if ( parts.length === 2 && Expr.relative[ parts[0] ] ) {
                        set = posProcess( parts[0] + parts[1], context, seed );

                    } else {
                        set = Expr.relative[ parts[0] ] ?
                            [ context ] :
                            Sizzle( parts.shift(), context );

                        while ( parts.length ) {
                            selector = parts.shift();

                            if ( Expr.relative[ selector ] ) {
                                selector += parts.shift();
                            }

                            set = posProcess( selector, set, seed );
                        }
                    }

                } else {
                    // Take a shortcut and set the context if the root selector is an ID
                    // (but not if it'll be faster if the inner selector is an ID)
                    if ( !seed && parts.length > 1 && context.nodeType === 9 && !contextXML &&
                        Expr.match.ID.test(parts[0]) && !Expr.match.ID.test(parts[parts.length - 1]) ) {

                        ret = Sizzle.find( parts.shift(), context, contextXML );
                        context = ret.expr ?
                            Sizzle.filter( ret.expr, ret.set )[0] :
                            ret.set[0];
                    }

                    if ( context ) {
                        ret = seed ?
                        { expr: parts.pop(), set: makeArray(seed) } :
                            Sizzle.find( parts.pop(), parts.length === 1 && (parts[0] === "~" || parts[0] === "+") && context.parentNode ? context.parentNode : context, contextXML );

                        set = ret.expr ?
                            Sizzle.filter( ret.expr, ret.set ) :
                            ret.set;

                        if ( parts.length > 0 ) {
                            checkSet = makeArray( set );

                        } else {
                            prune = false;
                        }

                        while ( parts.length ) {
                            cur = parts.pop();
                            pop = cur;

                            if ( !Expr.relative[ cur ] ) {
                                cur = "";
                            } else {
                                pop = parts.pop();
                            }

                            if ( pop == null ) {
                                pop = context;
                            }

                            Expr.relative[ cur ]( checkSet, pop, contextXML );
                        }

                    } else {
                        checkSet = parts = [];
                    }
                }

                if ( !checkSet ) {
                    checkSet = set;
                }

                if ( !checkSet ) {
                    Sizzle.error( cur || selector );
                }

                if ( toString.call(checkSet) === "[object Array]" ) {
                    if ( !prune ) {
                        results.push.apply( results, checkSet );

                    } else if ( context && context.nodeType === 1 ) {
                        for ( i = 0; checkSet[i] != null; i++ ) {
                            if ( checkSet[i] && (checkSet[i] === true || checkSet[i].nodeType === 1 && Sizzle.contains(context, checkSet[i])) ) {
                                results.push( set[i] );
                            }
                        }

                    } else {
                        for ( i = 0; checkSet[i] != null; i++ ) {
                            if ( checkSet[i] && checkSet[i].nodeType === 1 ) {
                                results.push( set[i] );
                            }
                        }
                    }

                } else {
                    makeArray( checkSet, results );
                }

                if ( extra ) {
                    Sizzle( extra, origContext, results, seed );
                    Sizzle.uniqueSort( results );
                }

                return results;
            };

            Sizzle.uniqueSort = function( results ) {
                if ( sortOrder ) {
                    hasDuplicate = baseHasDuplicate;
                    results.sort( sortOrder );

                    if ( hasDuplicate ) {
                        for ( var i = 1; i < results.length; i++ ) {
                            if ( results[i] === results[ i - 1 ] ) {
                                results.splice( i--, 1 );
                            }
                        }
                    }
                }

                return results;
            };

            Sizzle.matches = function( expr, set ) {
                return Sizzle( expr, null, null, set );
            };

            Sizzle.matchesSelector = function( node, expr ) {
                return Sizzle( expr, null, null, [node] ).length > 0;
            };

            Sizzle.find = function( expr, context, isXML ) {
                var set, i, len, match, type, left;

                if ( !expr ) {
                    return [];
                }

                for ( i = 0, len = Expr.order.length; i < len; i++ ) {
                    type = Expr.order[i];

                    if ( (match = Expr.leftMatch[ type ].exec( expr )) ) {
                        left = match[1];
                        match.splice( 1, 1 );

                        if ( left.substr( left.length - 1 ) !== "\\" ) {
                            match[1] = (match[1] || "").replace( rBackslash, "" );
                            set = Expr.find[ type ]( match, context, isXML );

                            if ( set != null ) {
                                expr = expr.replace( Expr.match[ type ], "" );
                                break;
                            }
                        }
                    }
                }

                if ( !set ) {
                    set = typeof context.getElementsByTagName !== "undefined" ?
                        context.getElementsByTagName( "*" ) :
                        [];
                }

                return { set: set, expr: expr };
            };

            Sizzle.filter = function( expr, set, inplace, not ) {
                var match, anyFound,
                    type, found, item, filter, left,
                    i, pass,
                    old = expr,
                    result = [],
                    curLoop = set,
                    isXMLFilter = set && set[0] && Sizzle.isXML( set[0] );

                while ( expr && set.length ) {
                    for ( type in Expr.filter ) {
                        if ( (match = Expr.leftMatch[ type ].exec( expr )) != null && match[2] ) {
                            filter = Expr.filter[ type ];
                            left = match[1];

                            anyFound = false;

                            match.splice(1,1);

                            if ( left.substr( left.length - 1 ) === "\\" ) {
                                continue;
                            }

                            if ( curLoop === result ) {
                                result = [];
                            }

                            if ( Expr.preFilter[ type ] ) {
                                match = Expr.preFilter[ type ]( match, curLoop, inplace, result, not, isXMLFilter );

                                if ( !match ) {
                                    anyFound = found = true;

                                } else if ( match === true ) {
                                    continue;
                                }
                            }

                            if ( match ) {
                                for ( i = 0; (item = curLoop[i]) != null; i++ ) {
                                    if ( item ) {
                                        found = filter( item, match, i, curLoop );
                                        pass = not ^ found;

                                        if ( inplace && found != null ) {
                                            if ( pass ) {
                                                anyFound = true;

                                            } else {
                                                curLoop[i] = false;
                                            }

                                        } else if ( pass ) {
                                            result.push( item );
                                            anyFound = true;
                                        }
                                    }
                                }
                            }

                            if ( found !== undefined ) {
                                if ( !inplace ) {
                                    curLoop = result;
                                }

                                expr = expr.replace( Expr.match[ type ], "" );

                                if ( !anyFound ) {
                                    return [];
                                }

                                break;
                            }
                        }
                    }

                    // Improper expression
                    if ( expr === old ) {
                        if ( anyFound == null ) {
                            Sizzle.error( expr );

                        } else {
                            break;
                        }
                    }

                    old = expr;
                }

                return curLoop;
            };

            Sizzle.error = function( msg ) {
                throw new Error( "Syntax error, unrecognized expression: " + msg );
            };

            /**
             * Utility function for retreiving the text value of an array of DOM nodes
             * @param {Array|Element} elem
             */
            var getText = Sizzle.getText = function( elem ) {
                var i, node,
                    nodeType = elem.nodeType,
                    ret = "";

                if ( nodeType ) {
                    if ( nodeType === 1 || nodeType === 9 ) {
                        // Use textContent || innerText for elements
                        if ( typeof elem.textContent === 'string' ) {
                            return elem.textContent;
                        } else if ( typeof elem.innerText === 'string' ) {
                            // Replace IE's carriage returns
                            return elem.innerText.replace( rReturn, '' );
                        } else {
                            // Traverse it's children
                            for ( elem = elem.firstChild; elem; elem = elem.nextSibling) {
                                ret += getText( elem );
                            }
                        }
                    } else if ( nodeType === 3 || nodeType === 4 ) {
                        return elem.nodeValue;
                    }
                } else {

                    // If no nodeType, this is expected to be an array
                    for ( i = 0; (node = elem[i]); i++ ) {
                        // Do not traverse comment nodes
                        if ( node.nodeType !== 8 ) {
                            ret += getText( node );
                        }
                    }
                }
                return ret;
            };

            var Expr = Sizzle.selectors = {
                order: [ "ID", "NAME", "TAG" ],

                match: {
                    ID: /#((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
                    CLASS: /\.((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
                    NAME: /\[name=['"]*((?:[\w\u00c0-\uFFFF\-]|\\.)+)['"]*\]/,
                    ATTR: /\[\s*((?:[\w\u00c0-\uFFFF\-]|\\.)+)\s*(?:(\S?=)\s*(?:(['"])(.*?)\3|(#?(?:[\w\u00c0-\uFFFF\-]|\\.)*)|)|)\s*\]/,
                    TAG: /^((?:[\w\u00c0-\uFFFF\*\-]|\\.)+)/,
                    CHILD: /:(only|nth|last|first)-child(?:\(\s*(even|odd|(?:[+\-]?\d+|(?:[+\-]?\d*)?n\s*(?:[+\-]\s*\d+)?))\s*\))?/,
                    POS: /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^\-]|$)/,
                    PSEUDO: /:((?:[\w\u00c0-\uFFFF\-]|\\.)+)(?:\((['"]?)((?:\([^\)]+\)|[^\(\)]*)+)\2\))?/
                },

                leftMatch: {},

                attrMap: {
                    "class": "className",
                    "for": "htmlFor"
                },

                attrHandle: {
                    href: function( elem ) {
                        return elem.getAttribute( "href" );
                    },
                    type: function( elem ) {
                        return elem.getAttribute( "type" );
                    }
                },

                relative: {
                    "+": function(checkSet, part){
                        var isPartStr = typeof part === "string",
                            isTag = isPartStr && !rNonWord.test( part ),
                            isPartStrNotTag = isPartStr && !isTag;

                        if ( isTag ) {
                            part = part.toLowerCase();
                        }

                        for ( var i = 0, l = checkSet.length, elem; i < l; i++ ) {
                            if ( (elem = checkSet[i]) ) {
                                while ( (elem = elem.previousSibling) && elem.nodeType !== 1 ) {}

                                checkSet[i] = isPartStrNotTag || elem && elem.nodeName.toLowerCase() === part ?
                                    elem || false :
                                    elem === part;
                            }
                        }

                        if ( isPartStrNotTag ) {
                            Sizzle.filter( part, checkSet, true );
                        }
                    },

                    ">": function( checkSet, part ) {
                        var elem,
                            isPartStr = typeof part === "string",
                            i = 0,
                            l = checkSet.length;

                        if ( isPartStr && !rNonWord.test( part ) ) {
                            part = part.toLowerCase();

                            for ( ; i < l; i++ ) {
                                elem = checkSet[i];

                                if ( elem ) {
                                    var parent = elem.parentNode;
                                    checkSet[i] = parent.nodeName.toLowerCase() === part ? parent : false;
                                }
                            }

                        } else {
                            for ( ; i < l; i++ ) {
                                elem = checkSet[i];

                                if ( elem ) {
                                    checkSet[i] = isPartStr ?
                                        elem.parentNode :
                                        elem.parentNode === part;
                                }
                            }

                            if ( isPartStr ) {
                                Sizzle.filter( part, checkSet, true );
                            }
                        }
                    },

                    "": function(checkSet, part, isXML){
                        var nodeCheck,
                            doneName = done++,
                            checkFn = dirCheck;

                        if ( typeof part === "string" && !rNonWord.test( part ) ) {
                            part = part.toLowerCase();
                            nodeCheck = part;
                            checkFn = dirNodeCheck;
                        }

                        checkFn( "parentNode", part, doneName, checkSet, nodeCheck, isXML );
                    },

                    "~": function( checkSet, part, isXML ) {
                        var nodeCheck,
                            doneName = done++,
                            checkFn = dirCheck;

                        if ( typeof part === "string" && !rNonWord.test( part ) ) {
                            part = part.toLowerCase();
                            nodeCheck = part;
                            checkFn = dirNodeCheck;
                        }

                        checkFn( "previousSibling", part, doneName, checkSet, nodeCheck, isXML );
                    }
                },

                find: {
                    ID: function( match, context, isXML ) {
                        if ( typeof context.getElementById !== "undefined" && !isXML ) {
                            var m = context.getElementById(match[1]);
                            // Check parentNode to catch when Blackberry 4.6 returns
                            // nodes that are no longer in the document #6963
                            return m && m.parentNode ? [m] : [];
                        }
                    },

                    NAME: function( match, context ) {
                        if ( typeof context.getElementsByName !== "undefined" ) {
                            var ret = [],
                                results = context.getElementsByName( match[1] );

                            for ( var i = 0, l = results.length; i < l; i++ ) {
                                if ( results[i].getAttribute("name") === match[1] ) {
                                    ret.push( results[i] );
                                }
                            }

                            return ret.length === 0 ? null : ret;
                        }
                    },

                    TAG: function( match, context ) {
                        if ( typeof context.getElementsByTagName !== "undefined" ) {
                            return context.getElementsByTagName( match[1] );
                        }
                    }
                },
                preFilter: {
                    CLASS: function( match, curLoop, inplace, result, not, isXML ) {
                        match = " " + match[1].replace( rBackslash, "" ) + " ";

                        if ( isXML ) {
                            return match;
                        }

                        for ( var i = 0, elem; (elem = curLoop[i]) != null; i++ ) {
                            if ( elem ) {
                                if ( not ^ (elem.className && (" " + elem.className + " ").replace(/[\t\n\r]/g, " ").indexOf(match) >= 0) ) {
                                    if ( !inplace ) {
                                        result.push( elem );
                                    }

                                } else if ( inplace ) {
                                    curLoop[i] = false;
                                }
                            }
                        }

                        return false;
                    },

                    ID: function( match ) {
                        return match[1].replace( rBackslash, "" );
                    },

                    TAG: function( match, curLoop ) {
                        return match[1].replace( rBackslash, "" ).toLowerCase();
                    },

                    CHILD: function( match ) {
                        if ( match[1] === "nth" ) {
                            if ( !match[2] ) {
                                Sizzle.error( match[0] );
                            }

                            match[2] = match[2].replace(/^\+|\s*/g, '');

                            // parse equations like 'even', 'odd', '5', '2n', '3n+2', '4n-1', '-n+6'
                            var test = /(-?)(\d*)(?:n([+\-]?\d*))?/.exec(
                                match[2] === "even" && "2n" || match[2] === "odd" && "2n+1" ||
                                    !/\D/.test( match[2] ) && "0n+" + match[2] || match[2]);

                            // calculate the numbers (first)n+(last) including if they are negative
                            match[2] = (test[1] + (test[2] || 1)) - 0;
                            match[3] = test[3] - 0;
                        }
                        else if ( match[2] ) {
                            Sizzle.error( match[0] );
                        }

                        // TODO: Move to normal caching system
                        match[0] = done++;

                        return match;
                    },

                    ATTR: function( match, curLoop, inplace, result, not, isXML ) {
                        var name = match[1] = match[1].replace( rBackslash, "" );

                        if ( !isXML && Expr.attrMap[name] ) {
                            match[1] = Expr.attrMap[name];
                        }

                        // Handle if an un-quoted value was used
                        match[4] = ( match[4] || match[5] || "" ).replace( rBackslash, "" );

                        if ( match[2] === "~=" ) {
                            match[4] = " " + match[4] + " ";
                        }

                        return match;
                    },

                    PSEUDO: function( match, curLoop, inplace, result, not ) {
                        if ( match[1] === "not" ) {
                            // If we're dealing with a complex expression, or a simple one
                            if ( ( chunker.exec(match[3]) || "" ).length > 1 || /^\w/.test(match[3]) ) {
                                match[3] = Sizzle(match[3], null, null, curLoop);

                            } else {
                                var ret = Sizzle.filter(match[3], curLoop, inplace, true ^ not);

                                if ( !inplace ) {
                                    result.push.apply( result, ret );
                                }

                                return false;
                            }

                        } else if ( Expr.match.POS.test( match[0] ) || Expr.match.CHILD.test( match[0] ) ) {
                            return true;
                        }

                        return match;
                    },

                    POS: function( match ) {
                        match.unshift( true );

                        return match;
                    }
                },

                filters: {
                    enabled: function( elem ) {
                        return elem.disabled === false && elem.type !== "hidden";
                    },

                    disabled: function( elem ) {
                        return elem.disabled === true;
                    },

                    checked: function( elem ) {
                        return elem.checked === true;
                    },

                    selected: function( elem ) {
                        // Accessing this property makes selected-by-default
                        // options in Safari work properly
                        if ( elem.parentNode ) {
                            elem.parentNode.selectedIndex;
                        }

                        return elem.selected === true;
                    },

                    parent: function( elem ) {
                        return !!elem.firstChild;
                    },

                    empty: function( elem ) {
                        return !elem.firstChild;
                    },

                    has: function( elem, i, match ) {
                        return !!Sizzle( match[3], elem ).length;
                    },

                    header: function( elem ) {
                        return (/h\d/i).test( elem.nodeName );
                    },

                    text: function( elem ) {
                        var attr = elem.getAttribute( "type" ), type = elem.type;
                        // IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
                        // use getAttribute instead to test this case
                        return elem.nodeName.toLowerCase() === "input" && "text" === type && ( attr === type || attr === null );
                    },

                    radio: function( elem ) {
                        return elem.nodeName.toLowerCase() === "input" && "radio" === elem.type;
                    },

                    checkbox: function( elem ) {
                        return elem.nodeName.toLowerCase() === "input" && "checkbox" === elem.type;
                    },

                    file: function( elem ) {
                        return elem.nodeName.toLowerCase() === "input" && "file" === elem.type;
                    },

                    password: function( elem ) {
                        return elem.nodeName.toLowerCase() === "input" && "password" === elem.type;
                    },

                    submit: function( elem ) {
                        var name = elem.nodeName.toLowerCase();
                        return (name === "input" || name === "button") && "submit" === elem.type;
                    },

                    image: function( elem ) {
                        return elem.nodeName.toLowerCase() === "input" && "image" === elem.type;
                    },

                    reset: function( elem ) {
                        var name = elem.nodeName.toLowerCase();
                        return (name === "input" || name === "button") && "reset" === elem.type;
                    },

                    button: function( elem ) {
                        var name = elem.nodeName.toLowerCase();
                        return name === "input" && "button" === elem.type || name === "button";
                    },

                    input: function( elem ) {
                        return (/input|select|textarea|button/i).test( elem.nodeName );
                    },

                    focus: function( elem ) {
                        return elem === elem.ownerDocument.activeElement;
                    }
                },
                setFilters: {
                    first: function( elem, i ) {
                        return i === 0;
                    },

                    last: function( elem, i, match, array ) {
                        return i === array.length - 1;
                    },

                    even: function( elem, i ) {
                        return i % 2 === 0;
                    },

                    odd: function( elem, i ) {
                        return i % 2 === 1;
                    },

                    lt: function( elem, i, match ) {
                        return i < match[3] - 0;
                    },

                    gt: function( elem, i, match ) {
                        return i > match[3] - 0;
                    },

                    nth: function( elem, i, match ) {
                        return match[3] - 0 === i;
                    },

                    eq: function( elem, i, match ) {
                        return match[3] - 0 === i;
                    }
                },
                filter: {
                    PSEUDO: function( elem, match, i, array ) {
                        var name = match[1],
                            filter = Expr.filters[ name ];

                        if ( filter ) {
                            return filter( elem, i, match, array );

                        } else if ( name === "contains" ) {
                            return (elem.textContent || elem.innerText || getText([ elem ]) || "").indexOf(match[3]) >= 0;

                        } else if ( name === "not" ) {
                            var not = match[3];

                            for ( var j = 0, l = not.length; j < l; j++ ) {
                                if ( not[j] === elem ) {
                                    return false;
                                }
                            }

                            return true;

                        } else {
                            Sizzle.error( name );
                        }
                    },

                    CHILD: function( elem, match ) {
                        var first, last,
                            doneName, parent, cache,
                            count, diff,
                            type = match[1],
                            node = elem;

                        switch ( type ) {
                            case "only":
                            case "first":
                                while ( (node = node.previousSibling) )	 {
                                    if ( node.nodeType === 1 ) {
                                        return false;
                                    }
                                }

                                if ( type === "first" ) {
                                    return true;
                                }

                                node = elem;

                            case "last":
                                while ( (node = node.nextSibling) )	 {
                                    if ( node.nodeType === 1 ) {
                                        return false;
                                    }
                                }

                                return true;

                            case "nth":
                                first = match[2];
                                last = match[3];

                                if ( first === 1 && last === 0 ) {
                                    return true;
                                }

                                doneName = match[0];
                                parent = elem.parentNode;

                                if ( parent && (parent[ expando ] !== doneName || !elem.nodeIndex) ) {
                                    count = 0;

                                    for ( node = parent.firstChild; node; node = node.nextSibling ) {
                                        if ( node.nodeType === 1 ) {
                                            node.nodeIndex = ++count;
                                        }
                                    }

                                    parent[ expando ] = doneName;
                                }

                                diff = elem.nodeIndex - last;

                                if ( first === 0 ) {
                                    return diff === 0;

                                } else {
                                    return ( diff % first === 0 && diff / first >= 0 );
                                }
                        }
                    },

                    ID: function( elem, match ) {
                        return elem.nodeType === 1 && elem.getAttribute("id") === match;
                    },

                    TAG: function( elem, match ) {
                        return (match === "*" && elem.nodeType === 1) || !!elem.nodeName && elem.nodeName.toLowerCase() === match;
                    },

                    CLASS: function( elem, match ) {
                        return (" " + (elem.className || elem.getAttribute("class")) + " ")
                            .indexOf( match ) > -1;
                    },

                    ATTR: function( elem, match ) {
                        var name = match[1],
                            result = Sizzle.attr ?
                                Sizzle.attr( elem, name ) :
                                Expr.attrHandle[ name ] ?
                                    Expr.attrHandle[ name ]( elem ) :
                                    elem[ name ] != null ?
                                        elem[ name ] :
                                        elem.getAttribute( name ),
                            value = result + "",
                            type = match[2],
                            check = match[4];

                        return result == null ?
                            type === "!=" :
                            !type && Sizzle.attr ?
                                result != null :
                                type === "=" ?
                                    value === check :
                                    type === "*=" ?
                                        value.indexOf(check) >= 0 :
                                        type === "~=" ?
                                            (" " + value + " ").indexOf(check) >= 0 :
                                            !check ?
                                                value && result !== false :
                                                type === "!=" ?
                                                    value !== check :
                                                    type === "^=" ?
                                                        value.indexOf(check) === 0 :
                                                        type === "$=" ?
                                                            value.substr(value.length - check.length) === check :
                                                            type === "|=" ?
                                                                value === check || value.substr(0, check.length + 1) === check + "-" :
                                                                false;
                    },

                    POS: function( elem, match, i, array ) {
                        var name = match[2],
                            filter = Expr.setFilters[ name ];

                        if ( filter ) {
                            return filter( elem, i, match, array );
                        }
                    }
                }
            };

            var origPOS = Expr.match.POS,
                fescape = function(all, num){
                    return "\\" + (num - 0 + 1);
                };

            for ( var type in Expr.match ) {
                Expr.match[ type ] = new RegExp( Expr.match[ type ].source + (/(?![^\[]*\])(?![^\(]*\))/.source) );
                Expr.leftMatch[ type ] = new RegExp( /(^(?:.|\r|\n)*?)/.source + Expr.match[ type ].source.replace(/\\(\d+)/g, fescape) );
            }

            var makeArray = function( array, results ) {
                array = Array.prototype.slice.call( array, 0 );

                if ( results ) {
                    results.push.apply( results, array );
                    return results;
                }

                return array;
            };

    // Perform a simple check to determine if the browser is capable of
    // converting a NodeList to an array using builtin methods.
    // Also verifies that the returned array holds DOM nodes
    // (which is not the case in the Blackberry browser)
            try {
                Array.prototype.slice.call( document.documentElement.childNodes, 0 )[0].nodeType;

    // Provide a fallback method if it does not work
            } catch( e ) {
                makeArray = function( array, results ) {
                    var i = 0,
                        ret = results || [];

                    if ( toString.call(array) === "[object Array]" ) {
                        Array.prototype.push.apply( ret, array );

                    } else {
                        if ( typeof array.length === "number" ) {
                            for ( var l = array.length; i < l; i++ ) {
                                ret.push( array[i] );
                            }

                        } else {
                            for ( ; array[i]; i++ ) {
                                ret.push( array[i] );
                            }
                        }
                    }

                    return ret;
                };
            }

            var sortOrder, siblingCheck;

            if ( document.documentElement.compareDocumentPosition ) {
                sortOrder = function( a, b ) {
                    if ( a === b ) {
                        hasDuplicate = true;
                        return 0;
                    }

                    if ( !a.compareDocumentPosition || !b.compareDocumentPosition ) {
                        return a.compareDocumentPosition ? -1 : 1;
                    }

                    return a.compareDocumentPosition(b) & 4 ? -1 : 1;
                };

            } else {
                sortOrder = function( a, b ) {
                    // The nodes are identical, we can exit early
                    if ( a === b ) {
                        hasDuplicate = true;
                        return 0;

                        // Fallback to using sourceIndex (in IE) if it's available on both nodes
                    } else if ( a.sourceIndex && b.sourceIndex ) {
                        return a.sourceIndex - b.sourceIndex;
                    }

                    var al, bl,
                        ap = [],
                        bp = [],
                        aup = a.parentNode,
                        bup = b.parentNode,
                        cur = aup;

                    // If the nodes are siblings (or identical) we can do a quick check
                    if ( aup === bup ) {
                        return siblingCheck( a, b );

                        // If no parents were found then the nodes are disconnected
                    } else if ( !aup ) {
                        return -1;

                    } else if ( !bup ) {
                        return 1;
                    }

                    // Otherwise they're somewhere else in the tree so we need
                    // to build up a full list of the parentNodes for comparison
                    while ( cur ) {
                        ap.unshift( cur );
                        cur = cur.parentNode;
                    }

                    cur = bup;

                    while ( cur ) {
                        bp.unshift( cur );
                        cur = cur.parentNode;
                    }

                    al = ap.length;
                    bl = bp.length;

                    // Start walking down the tree looking for a discrepancy
                    for ( var i = 0; i < al && i < bl; i++ ) {
                        if ( ap[i] !== bp[i] ) {
                            return siblingCheck( ap[i], bp[i] );
                        }
                    }

                    // We ended someplace up the tree so do a sibling check
                    return i === al ?
                        siblingCheck( a, bp[i], -1 ) :
                        siblingCheck( ap[i], b, 1 );
                };

                siblingCheck = function( a, b, ret ) {
                    if ( a === b ) {
                        return ret;
                    }

                    var cur = a.nextSibling;

                    while ( cur ) {
                        if ( cur === b ) {
                            return -1;
                        }

                        cur = cur.nextSibling;
                    }

                    return 1;
                };
            }

    // Check to see if the browser returns elements by name when
    // querying by getElementById (and provide a workaround)
            (function(){
                // We're going to inject a fake input element with a specified name
                var form = document.createElement("div"),
                    id = "script" + (new Date()).getTime(),
                    root = document.documentElement;

                form.innerHTML = "<a name='" + id + "'/>";

                // Inject it into the root element, check its status, and remove it quickly
                root.insertBefore( form, root.firstChild );

                // The workaround has to do additional checks after a getElementById
                // Which slows things down for other browsers (hence the branching)
                if ( document.getElementById( id ) ) {
                    Expr.find.ID = function( match, context, isXML ) {
                        if ( typeof context.getElementById !== "undefined" && !isXML ) {
                            var m = context.getElementById(match[1]);

                            return m ?
                                m.id === match[1] || typeof m.getAttributeNode !== "undefined" && m.getAttributeNode("id").nodeValue === match[1] ?
                                    [m] :
                                    undefined :
                                [];
                        }
                    };

                    Expr.filter.ID = function( elem, match ) {
                        var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");

                        return elem.nodeType === 1 && node && node.nodeValue === match;
                    };
                }

                root.removeChild( form );

                // release memory in IE
                root = form = null;
            })();

            (function(){
                // Check to see if the browser returns only elements
                // when doing getElementsByTagName("*")

                // Create a fake element
                var div = document.createElement("div");
                div.appendChild( document.createComment("") );

                // Make sure no comments are found
                if ( div.getElementsByTagName("*").length > 0 ) {
                    Expr.find.TAG = function( match, context ) {
                        var results = context.getElementsByTagName( match[1] );

                        // Filter out possible comments
                        if ( match[1] === "*" ) {
                            var tmp = [];

                            for ( var i = 0; results[i]; i++ ) {
                                if ( results[i].nodeType === 1 ) {
                                    tmp.push( results[i] );
                                }
                            }

                            results = tmp;
                        }

                        return results;
                    };
                }

                // Check to see if an attribute returns normalized href attributes
                div.innerHTML = "<a href='#'></a>";

                if ( div.firstChild && typeof div.firstChild.getAttribute !== "undefined" &&
                    div.firstChild.getAttribute("href") !== "#" ) {

                    Expr.attrHandle.href = function( elem ) {
                        return elem.getAttribute( "href", 2 );
                    };
                }

                // release memory in IE
                div = null;
            })();

            if ( document.querySelectorAll ) {
                (function(){
                    var oldSizzle = Sizzle,
                        div = document.createElement("div"),
                        id = "__sizzle__";

                    div.innerHTML = "<p class='TEST'></p>";

                    // Safari can't handle uppercase or unicode characters when
                    // in quirks mode.
                    if ( div.querySelectorAll && div.querySelectorAll(".TEST").length === 0 ) {
                        return;
                    }

                    Sizzle = function( query, context, extra, seed ) {
                        context = context || document;

                        // Only use querySelectorAll on non-XML documents
                        // (ID selectors don't work in non-HTML documents)
                        if ( !seed && !Sizzle.isXML(context) ) {
                            // See if we find a selector to speed up
                            var match = /^(\w+$)|^\.([\w\-]+$)|^#([\w\-]+$)/.exec( query );

                            if ( match && (context.nodeType === 1 || context.nodeType === 9) ) {
                                // Speed-up: Sizzle("TAG")
                                if ( match[1] ) {
                                    return makeArray( context.getElementsByTagName( query ), extra );

                                    // Speed-up: Sizzle(".CLASS")
                                } else if ( match[2] && Expr.find.CLASS && context.getElementsByClassName ) {
                                    return makeArray( context.getElementsByClassName( match[2] ), extra );
                                }
                            }

                            if ( context.nodeType === 9 ) {
                                // Speed-up: Sizzle("body")
                                // The body element only exists once, optimize finding it
                                if ( query === "body" && context.body ) {
                                    return makeArray( [ context.body ], extra );

                                    // Speed-up: Sizzle("#ID")
                                } else if ( match && match[3] ) {
                                    var elem = context.getElementById( match[3] );

                                    // Check parentNode to catch when Blackberry 4.6 returns
                                    // nodes that are no longer in the document #6963
                                    if ( elem && elem.parentNode ) {
                                        // Handle the case where IE and Opera return items
                                        // by name instead of ID
                                        if ( elem.id === match[3] ) {
                                            return makeArray( [ elem ], extra );
                                        }

                                    } else {
                                        return makeArray( [], extra );
                                    }
                                }

                                try {
                                    return makeArray( context.querySelectorAll(query), extra );
                                } catch(qsaError) {}

                                // qSA works strangely on Element-rooted queries
                                // We can work around this by specifying an extra ID on the root
                                // and working up from there (Thanks to Andrew Dupont for the technique)
                                // IE 8 doesn't work on object elements
                            } else if ( context.nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
                                var oldContext = context,
                                    old = context.getAttribute( "id" ),
                                    nid = old || id,
                                    hasParent = context.parentNode,
                                    relativeHierarchySelector = /^\s*[+~]/.test( query );

                                if ( !old ) {
                                    context.setAttribute( "id", nid );
                                } else {
                                    nid = nid.replace( /'/g, "\\$&" );
                                }
                                if ( relativeHierarchySelector && hasParent ) {
                                    context = context.parentNode;
                                }

                                try {
                                    if ( !relativeHierarchySelector || hasParent ) {
                                        return makeArray( context.querySelectorAll( "[id='" + nid + "'] " + query ), extra );
                                    }

                                } catch(pseudoError) {
                                } finally {
                                    if ( !old ) {
                                        oldContext.removeAttribute( "id" );
                                    }
                                }
                            }
                        }

                        return oldSizzle(query, context, extra, seed);
                    };

                    for ( var prop in oldSizzle ) {
                        Sizzle[ prop ] = oldSizzle[ prop ];
                    }

                    // release memory in IE
                    div = null;
                })();
            }

            (function(){
                var html = document.documentElement,
                    matches = html.matchesSelector || html.mozMatchesSelector || html.webkitMatchesSelector || html.msMatchesSelector;

                if ( matches ) {
                    // Check to see if it's possible to do matchesSelector
                    // on a disconnected node (IE 9 fails this)
                    var disconnectedMatch = !matches.call( document.createElement( "div" ), "div" ),
                        pseudoWorks = false;

                    try {
                        // This should fail with an exception
                        // Gecko does not error, returns false instead
                        matches.call( document.documentElement, "[test!='']:sizzle" );

                    } catch( pseudoError ) {
                        pseudoWorks = true;
                    }

                    Sizzle.matchesSelector = function( node, expr ) {
                        // Make sure that attribute selectors are quoted
                        expr = expr.replace(/\=\s*([^'"\]]*)\s*\]/g, "='$1']");

                        if ( !Sizzle.isXML( node ) ) {
                            try {
                                if ( pseudoWorks || !Expr.match.PSEUDO.test( expr ) && !/!=/.test( expr ) ) {
                                    var ret = matches.call( node, expr );

                                    // IE 9's matchesSelector returns false on disconnected nodes
                                    if ( ret || !disconnectedMatch ||
                                        // As well, disconnected nodes are said to be in a document
                                        // fragment in IE 9, so check for that
                                        node.document && node.document.nodeType !== 11 ) {
                                        return ret;
                                    }
                                }
                            } catch(e) {}
                        }

                        return Sizzle(expr, null, null, [node]).length > 0;
                    };
                }
            })();

            (function(){
                var div = document.createElement("div");

                div.innerHTML = "<div class='test e'></div><div class='test'></div>";

                // Opera can't find a second classname (in 9.6)
                // Also, make sure that getElementsByClassName actually exists
                if ( !div.getElementsByClassName || div.getElementsByClassName("e").length === 0 ) {
                    return;
                }

                // Safari caches class attributes, doesn't catch changes (in 3.2)
                div.lastChild.className = "e";

                if ( div.getElementsByClassName("e").length === 1 ) {
                    return;
                }

                Expr.order.splice(1, 0, "CLASS");
                Expr.find.CLASS = function( match, context, isXML ) {
                    if ( typeof context.getElementsByClassName !== "undefined" && !isXML ) {
                        return context.getElementsByClassName(match[1]);
                    }
                };

                // release memory in IE
                div = null;
            })();

            function dirNodeCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
                for ( var i = 0, l = checkSet.length; i < l; i++ ) {
                    var elem = checkSet[i];

                    if ( elem ) {
                        var match = false;

                        elem = elem[dir];

                        while ( elem ) {
                            if ( elem[ expando ] === doneName ) {
                                match = checkSet[elem.sizset];
                                break;
                            }

                            if ( elem.nodeType === 1 && !isXML ){
                                elem[ expando ] = doneName;
                                elem.sizset = i;
                            }

                            if ( elem.nodeName.toLowerCase() === cur ) {
                                match = elem;
                                break;
                            }

                            elem = elem[dir];
                        }

                        checkSet[i] = match;
                    }
                }
            }

            function dirCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
                for ( var i = 0, l = checkSet.length; i < l; i++ ) {
                    var elem = checkSet[i];

                    if ( elem ) {
                        var match = false;

                        elem = elem[dir];

                        while ( elem ) {
                            if ( elem[ expando ] === doneName ) {
                                match = checkSet[elem.sizset];
                                break;
                            }

                            if ( elem.nodeType === 1 ) {
                                if ( !isXML ) {
                                    elem[ expando ] = doneName;
                                    elem.sizset = i;
                                }

                                if ( typeof cur !== "string" ) {
                                    if ( elem === cur ) {
                                        match = true;
                                        break;
                                    }

                                } else if ( Sizzle.filter( cur, [elem] ).length > 0 ) {
                                    match = elem;
                                    break;
                                }
                            }

                            elem = elem[dir];
                        }

                        checkSet[i] = match;
                    }
                }
            }

            if ( document.documentElement.contains ) {
                Sizzle.contains = function( a, b ) {
                    return a !== b && (a.contains ? a.contains(b) : true);
                };

            } else if ( document.documentElement.compareDocumentPosition ) {
                Sizzle.contains = function( a, b ) {
                    return !!(a.compareDocumentPosition(b) & 16);
                };

            } else {
                Sizzle.contains = function() {
                    return false;
                };
            }

            Sizzle.isXML = function( elem ) {
                // documentElement is verified for cases where it doesn't yet exist
                // (such as loading iframes in IE - #4833)
                var documentElement = (elem ? elem.ownerDocument || elem : 0).documentElement;

                return documentElement ? documentElement.nodeName !== "HTML" : false;
            };

            var posProcess = function( selector, context, seed ) {
                var match,
                    tmpSet = [],
                    later = "",
                    root = context.nodeType ? [context] : context;

                // Position selectors must be done after the filter
                // And so must :not(positional) so we move all PSEUDOs to the end
                while ( (match = Expr.match.PSEUDO.exec( selector )) ) {
                    later += match[0];
                    selector = selector.replace( Expr.match.PSEUDO, "" );
                }

                selector = Expr.relative[selector] ? selector + "*" : selector;

                for ( var i = 0, l = root.length; i < l; i++ ) {
                    Sizzle( selector, root[i], tmpSet, seed );
                }

                return Sizzle.filter( later, tmpSet );
            };

    // EXPOSE
    // Override sizzle attribute retrieval
            Sizzle.attr = jQuery.attr;
            Sizzle.selectors.attrMap = {};
            jQuery.find = Sizzle;
            jQuery.expr = Sizzle.selectors;
            jQuery.expr[":"] = jQuery.expr.filters;
            jQuery.unique = Sizzle.uniqueSort;
            jQuery.text = Sizzle.getText;
            jQuery.isXMLDoc = Sizzle.isXML;
            jQuery.contains = Sizzle.contains;


        })();


        var runtil = /Until$/,
            rparentsprev = /^(?:parents|prevUntil|prevAll)/,
        // Note: This RegExp should be improved, or likely pulled from Sizzle
            rmultiselector = /,/,
            isSimple = /^.[^:#\[\.,]*$/,
            slice = Array.prototype.slice,
            POS = jQuery.expr.match.POS,
        // methods guaranteed to produce a unique set when starting from a unique set
            guaranteedUnique = {
                children: true,
                contents: true,
                next: true,
                prev: true
            };

        jQuery.fn.extend({
            find: function( selector ) {
                var self = this,
                    i, l;

                if ( typeof selector !== "string" ) {
                    return jQuery( selector ).filter(function() {
                        for ( i = 0, l = self.length; i < l; i++ ) {
                            if ( jQuery.contains( self[ i ], this ) ) {
                                return true;
                            }
                        }
                    });
                }

                var ret = this.pushStack( "", "find", selector ),
                    length, n, r;

                for ( i = 0, l = this.length; i < l; i++ ) {
                    length = ret.length;
                    jQuery.find( selector, this[i], ret );

                    if ( i > 0 ) {
                        // Make sure that the results are unique
                        for ( n = length; n < ret.length; n++ ) {
                            for ( r = 0; r < length; r++ ) {
                                if ( ret[r] === ret[n] ) {
                                    ret.splice(n--, 1);
                                    break;
                                }
                            }
                        }
                    }
                }

                return ret;
            },

            has: function( target ) {
                var targets = jQuery( target );
                return this.filter(function() {
                    for ( var i = 0, l = targets.length; i < l; i++ ) {
                        if ( jQuery.contains( this, targets[i] ) ) {
                            return true;
                        }
                    }
                });
            },

            not: function( selector ) {
                return this.pushStack( winnow(this, selector, false), "not", selector);
            },

            filter: function( selector ) {
                return this.pushStack( winnow(this, selector, true), "filter", selector );
            },

            is: function( selector ) {
                return !!selector && (
                    typeof selector === "string" ?
                        // If this is a positional selector, check membership in the returned set
                        // so $("p:first").is("p:last") won't return true for a doc with two "p".
                        POS.test( selector ) ?
                            jQuery( selector, this.context ).index( this[0] ) >= 0 :
                            jQuery.filter( selector, this ).length > 0 :
                        this.filter( selector ).length > 0 );
            },

            closest: function( selectors, context ) {
                var ret = [], i, l, cur = this[0];

                // Array (deprecated as of jQuery 1.7)
                if ( jQuery.isArray( selectors ) ) {
                    var level = 1;

                    while ( cur && cur.ownerDocument && cur !== context ) {
                        for ( i = 0; i < selectors.length; i++ ) {

                            if ( jQuery( cur ).is( selectors[ i ] ) ) {
                                ret.push({ selector: selectors[ i ], elem: cur, level: level });
                            }
                        }

                        cur = cur.parentNode;
                        level++;
                    }

                    return ret;
                }

                // String
                var pos = POS.test( selectors ) || typeof selectors !== "string" ?
                    jQuery( selectors, context || this.context ) :
                    0;

                for ( i = 0, l = this.length; i < l; i++ ) {
                    cur = this[i];

                    while ( cur ) {
                        if ( pos ? pos.index(cur) > -1 : jQuery.find.matchesSelector(cur, selectors) ) {
                            ret.push( cur );
                            break;

                        } else {
                            cur = cur.parentNode;
                            if ( !cur || !cur.ownerDocument || cur === context || cur.nodeType === 11 ) {
                                break;
                            }
                        }
                    }
                }

                ret = ret.length > 1 ? jQuery.unique( ret ) : ret;

                return this.pushStack( ret, "closest", selectors );
            },

            // Determine the position of an element within
            // the matched set of elements
            index: function( elem ) {

                // No argument, return index in parent
                if ( !elem ) {
                    return ( this[0] && this[0].parentNode ) ? this.prevAll().length : -1;
                }

                // index in selector
                if ( typeof elem === "string" ) {
                    return jQuery.inArray( this[0], jQuery( elem ) );
                }

                // Locate the position of the desired element
                return jQuery.inArray(
                    // If it receives a jQuery object, the first element is used
                    elem.jquery ? elem[0] : elem, this );
            },

            add: function( selector, context ) {
                var set = typeof selector === "string" ?
                        jQuery( selector, context ) :
                        jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
                    all = jQuery.merge( this.get(), set );

                return this.pushStack( isDisconnected( set[0] ) || isDisconnected( all[0] ) ?
                    all :
                    jQuery.unique( all ) );
            },

            andSelf: function() {
                return this.add( this.prevObject );
            }
        });

    // A painfully simple check to see if an element is disconnected
    // from a document (should be improved, where feasible).
        function isDisconnected( node ) {
            return !node || !node.parentNode || node.parentNode.nodeType === 11;
        }

        jQuery.each({
            parent: function( elem ) {
                var parent = elem.parentNode;
                return parent && parent.nodeType !== 11 ? parent : null;
            },
            parents: function( elem ) {
                return jQuery.dir( elem, "parentNode" );
            },
            parentsUntil: function( elem, i, until ) {
                return jQuery.dir( elem, "parentNode", until );
            },
            next: function( elem ) {
                return jQuery.nth( elem, 2, "nextSibling" );
            },
            prev: function( elem ) {
                return jQuery.nth( elem, 2, "previousSibling" );
            },
            nextAll: function( elem ) {
                return jQuery.dir( elem, "nextSibling" );
            },
            prevAll: function( elem ) {
                return jQuery.dir( elem, "previousSibling" );
            },
            nextUntil: function( elem, i, until ) {
                return jQuery.dir( elem, "nextSibling", until );
            },
            prevUntil: function( elem, i, until ) {
                return jQuery.dir( elem, "previousSibling", until );
            },
            siblings: function( elem ) {
                return jQuery.sibling( elem.parentNode.firstChild, elem );
            },
            children: function( elem ) {
                return jQuery.sibling( elem.firstChild );
            },
            contents: function( elem ) {
                return jQuery.nodeName( elem, "iframe" ) ?
                    elem.contentDocument || elem.contentWindow.document :
                    jQuery.makeArray( elem.childNodes );
            }
        }, function( name, fn ) {
            jQuery.fn[ name ] = function( until, selector ) {
                var ret = jQuery.map( this, fn, until );

                if ( !runtil.test( name ) ) {
                    selector = until;
                }

                if ( selector && typeof selector === "string" ) {
                    ret = jQuery.filter( selector, ret );
                }

                ret = this.length > 1 && !guaranteedUnique[ name ] ? jQuery.unique( ret ) : ret;

                if ( (this.length > 1 || rmultiselector.test( selector )) && rparentsprev.test( name ) ) {
                    ret = ret.reverse();
                }

                return this.pushStack( ret, name, slice.call( arguments ).join(",") );
            };
        });

        jQuery.extend({
            filter: function( expr, elems, not ) {
                if ( not ) {
                    expr = ":not(" + expr + ")";
                }

                return elems.length === 1 ?
                    jQuery.find.matchesSelector(elems[0], expr) ? [ elems[0] ] : [] :
                    jQuery.find.matches(expr, elems);
            },

            dir: function( elem, dir, until ) {
                var matched = [],
                    cur = elem[ dir ];

                while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
                    if ( cur.nodeType === 1 ) {
                        matched.push( cur );
                    }
                    cur = cur[dir];
                }
                return matched;
            },

            nth: function( cur, result, dir, elem ) {
                result = result || 1;
                var num = 0;

                for ( ; cur; cur = cur[dir] ) {
                    if ( cur.nodeType === 1 && ++num === result ) {
                        break;
                    }
                }

                return cur;
            },

            sibling: function( n, elem ) {
                var r = [];

                for ( ; n; n = n.nextSibling ) {
                    if ( n.nodeType === 1 && n !== elem ) {
                        r.push( n );
                    }
                }

                return r;
            }
        });

    // Implement the identical functionality for filter and not
        function winnow( elements, qualifier, keep ) {

            // Can't pass null or undefined to indexOf in Firefox 4
            // Set to 0 to skip string check
            qualifier = qualifier || 0;

            if ( jQuery.isFunction( qualifier ) ) {
                return jQuery.grep(elements, function( elem, i ) {
                    var retVal = !!qualifier.call( elem, i, elem );
                    return retVal === keep;
                });

            } else if ( qualifier.nodeType ) {
                return jQuery.grep(elements, function( elem, i ) {
                    return ( elem === qualifier ) === keep;
                });

            } else if ( typeof qualifier === "string" ) {
                var filtered = jQuery.grep(elements, function( elem ) {
                    return elem.nodeType === 1;
                });

                if ( isSimple.test( qualifier ) ) {
                    return jQuery.filter(qualifier, filtered, !keep);
                } else {
                    qualifier = jQuery.filter( qualifier, filtered );
                }
            }

            return jQuery.grep(elements, function( elem, i ) {
                return ( jQuery.inArray( elem, qualifier ) >= 0 ) === keep;
            });
        }




        function createSafeFragment( document ) {
            var list = nodeNames.split( "|" ),
                safeFrag = document.createDocumentFragment();

            if ( safeFrag.createElement ) {
                while ( list.length ) {
                    safeFrag.createElement(
                        list.pop()
                    );
                }
            }
            return safeFrag;
        }

        var nodeNames = "abbr|article|aside|audio|canvas|datalist|details|figcaption|figure|footer|" +
                "header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
            rinlinejQuery = / jQuery\d+="(?:\d+|null)"/g,
            rleadingWhitespace = /^\s+/,
            rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/ig,
            rtagName = /<([\w:]+)/,
            rtbody = /<tbody/i,
            rhtml = /<|&#?\w+;/,
            rnoInnerhtml = /<(?:script|style)/i,
            rnocache = /<(?:script|object|embed|option|style)/i,
            rnoshimcache = new RegExp("<(?:" + nodeNames + ")", "i"),
        // checked="checked" or checked
            rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
            rscriptType = /\/(java|ecma)script/i,
            rcleanScript = /^\s*<!(?:\[CDATA\[|\-\-)/,
            wrapMap = {
                option: [ 1, "<select multiple='multiple'>", "</select>" ],
                legend: [ 1, "<fieldset>", "</fieldset>" ],
                thead: [ 1, "<table>", "</table>" ],
                tr: [ 2, "<table><tbody>", "</tbody></table>" ],
                td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
                col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
                area: [ 1, "<map>", "</map>" ],
                _default: [ 0, "", "" ]
            },
            safeFragment = createSafeFragment( document );

        wrapMap.optgroup = wrapMap.option;
        wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
        wrapMap.th = wrapMap.td;

    // IE can't serialize <link> and <script> tags normally
        if ( !jQuery.support.htmlSerialize ) {
            wrapMap._default = [ 1, "div<div>", "</div>" ];
        }

        jQuery.fn.extend({
            text: function( text ) {
                if ( jQuery.isFunction(text) ) {
                    return this.each(function(i) {
                        var self = jQuery( this );

                        self.text( text.call(this, i, self.text()) );
                    });
                }

                if ( typeof text !== "object" && text !== undefined ) {
                    return this.empty().append( (this[0] && this[0].ownerDocument || document).createTextNode( text ) );
                }

                return jQuery.text( this );
            },

            wrapAll: function( html ) {
                if ( jQuery.isFunction( html ) ) {
                    return this.each(function(i) {
                        jQuery(this).wrapAll( html.call(this, i) );
                    });
                }

                if ( this[0] ) {
                    // The elements to wrap the target around
                    var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

                    if ( this[0].parentNode ) {
                        wrap.insertBefore( this[0] );
                    }

                    wrap.map(function() {
                        var elem = this;

                        while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
                            elem = elem.firstChild;
                        }

                        return elem;
                    }).append( this );
                }

                return this;
            },

            wrapInner: function( html ) {
                if ( jQuery.isFunction( html ) ) {
                    return this.each(function(i) {
                        jQuery(this).wrapInner( html.call(this, i) );
                    });
                }

                return this.each(function() {
                    var self = jQuery( this ),
                        contents = self.contents();

                    if ( contents.length ) {
                        contents.wrapAll( html );

                    } else {
                        self.append( html );
                    }
                });
            },

            wrap: function( html ) {
                var isFunction = jQuery.isFunction( html );

                return this.each(function(i) {
                    jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
                });
            },

            unwrap: function() {
                return this.parent().each(function() {
                    if ( !jQuery.nodeName( this, "body" ) ) {
                        jQuery( this ).replaceWith( this.childNodes );
                    }
                }).end();
            },

            append: function() {
                return this.domManip(arguments, true, function( elem ) {
                    if ( this.nodeType === 1 ) {
                        this.appendChild( elem );
                    }
                });
            },

            prepend: function() {
                return this.domManip(arguments, true, function( elem ) {
                    if ( this.nodeType === 1 ) {
                        this.insertBefore( elem, this.firstChild );
                    }
                });
            },

            before: function() {
                if ( this[0] && this[0].parentNode ) {
                    return this.domManip(arguments, false, function( elem ) {
                        this.parentNode.insertBefore( elem, this );
                    });
                } else if ( arguments.length ) {
                    var set = jQuery.clean( arguments );
                    set.push.apply( set, this.toArray() );
                    return this.pushStack( set, "before", arguments );
                }
            },

            after: function() {
                if ( this[0] && this[0].parentNode ) {
                    return this.domManip(arguments, false, function( elem ) {
                        this.parentNode.insertBefore( elem, this.nextSibling );
                    });
                } else if ( arguments.length ) {
                    var set = this.pushStack( this, "after", arguments );
                    set.push.apply( set, jQuery.clean(arguments) );
                    return set;
                }
            },

            // keepData is for internal use only--do not document
            remove: function( selector, keepData ) {
                for ( var i = 0, elem; (elem = this[i]) != null; i++ ) {
                    if ( !selector || jQuery.filter( selector, [ elem ] ).length ) {
                        if ( !keepData && elem.nodeType === 1 ) {
                            jQuery.cleanData( elem.getElementsByTagName("*") );
                            jQuery.cleanData( [ elem ] );
                        }

                        if ( elem.parentNode ) {
                            elem.parentNode.removeChild( elem );
                        }
                    }
                }

                return this;
            },

            empty: function() {
                for ( var i = 0, elem; (elem = this[i]) != null; i++ ) {
                    // Remove element nodes and prevent memory leaks
                    if ( elem.nodeType === 1 ) {
                        jQuery.cleanData( elem.getElementsByTagName("*") );
                    }

                    // Remove any remaining nodes
                    while ( elem.firstChild ) {
                        elem.removeChild( elem.firstChild );
                    }
                }

                return this;
            },

            clone: function( dataAndEvents, deepDataAndEvents ) {
                dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
                deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

                return this.map( function () {
                    return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
                });
            },

            html: function( value ) {
                if ( value === undefined ) {
                    return this[0] && this[0].nodeType === 1 ?
                        this[0].innerHTML.replace(rinlinejQuery, "") :
                        null;

                    // See if we can take a shortcut and just use innerHTML
                } else if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
                    (jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value )) &&
                    !wrapMap[ (rtagName.exec( value ) || ["", ""])[1].toLowerCase() ] ) {

                    value = value.replace(rxhtmlTag, "<$1></$2>");

                    try {
                        for ( var i = 0, l = this.length; i < l; i++ ) {
                            // Remove element nodes and prevent memory leaks
                            if ( this[i].nodeType === 1 ) {
                                jQuery.cleanData( this[i].getElementsByTagName("*") );
                                this[i].innerHTML = value;
                            }
                        }

                        // If using innerHTML throws an exception, use the fallback method
                    } catch(e) {
                        this.empty().append( value );
                    }

                } else if ( jQuery.isFunction( value ) ) {
                    this.each(function(i){
                        var self = jQuery( this );

                        self.html( value.call(this, i, self.html()) );
                    });

                } else {
                    this.empty().append( value );
                }

                return this;
            },

            replaceWith: function( value ) {
                if ( this[0] && this[0].parentNode ) {
                    // Make sure that the elements are removed from the DOM before they are inserted
                    // this can help fix replacing a parent with child elements
                    if ( jQuery.isFunction( value ) ) {
                        return this.each(function(i) {
                            var self = jQuery(this), old = self.html();
                            self.replaceWith( value.call( this, i, old ) );
                        });
                    }

                    if ( typeof value !== "string" ) {
                        value = jQuery( value ).detach();
                    }

                    return this.each(function() {
                        var next = this.nextSibling,
                            parent = this.parentNode;

                        jQuery( this ).remove();

                        if ( next ) {
                            jQuery(next).before( value );
                        } else {
                            jQuery(parent).append( value );
                        }
                    });
                } else {
                    return this.length ?
                        this.pushStack( jQuery(jQuery.isFunction(value) ? value() : value), "replaceWith", value ) :
                        this;
                }
            },

            detach: function( selector ) {
                return this.remove( selector, true );
            },

            domManip: function( args, table, callback ) {
                var results, first, fragment, parent,
                    value = args[0],
                    scripts = [];

                // We can't cloneNode fragments that contain checked, in WebKit
                if ( !jQuery.support.checkClone && arguments.length === 3 && typeof value === "string" && rchecked.test( value ) ) {
                    return this.each(function() {
                        jQuery(this).domManip( args, table, callback, true );
                    });
                }

                if ( jQuery.isFunction(value) ) {
                    return this.each(function(i) {
                        var self = jQuery(this);
                        args[0] = value.call(this, i, table ? self.html() : undefined);
                        self.domManip( args, table, callback );
                    });
                }

                if ( this[0] ) {
                    parent = value && value.parentNode;

                    // If we're in a fragment, just use that instead of building a new one
                    if ( jQuery.support.parentNode && parent && parent.nodeType === 11 && parent.childNodes.length === this.length ) {
                        results = { fragment: parent };

                    } else {
                        results = jQuery.buildFragment( args, this, scripts );
                    }

                    fragment = results.fragment;

                    if ( fragment.childNodes.length === 1 ) {
                        first = fragment = fragment.firstChild;
                    } else {
                        first = fragment.firstChild;
                    }

                    if ( first ) {
                        table = table && jQuery.nodeName( first, "tr" );

                        for ( var i = 0, l = this.length, lastIndex = l - 1; i < l; i++ ) {
                            callback.call(
                                table ?
                                    root(this[i], first) :
                                    this[i],
                                // Make sure that we do not leak memory by inadvertently discarding
                                // the original fragment (which might have attached data) instead of
                                // using it; in addition, use the original fragment object for the last
                                // item instead of first because it can end up being emptied incorrectly
                                // in certain situations (Bug #8070).
                                // Fragments from the fragment cache must always be cloned and never used
                                // in place.
                                results.cacheable || ( l > 1 && i < lastIndex ) ?
                                    jQuery.clone( fragment, true, true ) :
                                    fragment
                            );
                        }
                    }

                    if ( scripts.length ) {
                        jQuery.each( scripts, evalScript );
                    }
                }

                return this;
            }
        });

        function root( elem, cur ) {
            return jQuery.nodeName(elem, "table") ?
                (elem.getElementsByTagName("tbody")[0] ||
                    elem.appendChild(elem.ownerDocument.createElement("tbody"))) :
                elem;
        }

        function cloneCopyEvent( src, dest ) {

            if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
                return;
            }

            var type, i, l,
                oldData = jQuery._data( src ),
                curData = jQuery._data( dest, oldData ),
                events = oldData.events;

            if ( events ) {
                delete curData.handle;
                curData.events = {};

                for ( type in events ) {
                    for ( i = 0, l = events[ type ].length; i < l; i++ ) {
                        jQuery.event.add( dest, type + ( events[ type ][ i ].namespace ? "." : "" ) + events[ type ][ i ].namespace, events[ type ][ i ], events[ type ][ i ].data );
                    }
                }
            }

            // make the cloned public data object a copy from the original
            if ( curData.data ) {
                curData.data = jQuery.extend( {}, curData.data );
            }
        }

        function cloneFixAttributes( src, dest ) {
            var nodeName;

            // We do not need to do anything for non-Elements
            if ( dest.nodeType !== 1 ) {
                return;
            }

            // clearAttributes removes the attributes, which we don't want,
            // but also removes the attachEvent events, which we *do* want
            if ( dest.clearAttributes ) {
                dest.clearAttributes();
            }

            // mergeAttributes, in contrast, only merges back on the
            // original attributes, not the events
            if ( dest.mergeAttributes ) {
                dest.mergeAttributes( src );
            }

            nodeName = dest.nodeName.toLowerCase();

            // IE6-8 fail to clone children inside object elements that use
            // the proprietary classid attribute value (rather than the type
            // attribute) to identify the type of content to display
            if ( nodeName === "object" ) {
                dest.outerHTML = src.outerHTML;

            } else if ( nodeName === "input" && (src.type === "checkbox" || src.type === "radio") ) {
                // IE6-8 fails to persist the checked state of a cloned checkbox
                // or radio button. Worse, IE6-7 fail to give the cloned element
                // a checked appearance if the defaultChecked value isn't also set
                if ( src.checked ) {
                    dest.defaultChecked = dest.checked = src.checked;
                }

                // IE6-7 get confused and end up setting the value of a cloned
                // checkbox/radio button to an empty string instead of "on"
                if ( dest.value !== src.value ) {
                    dest.value = src.value;
                }

                // IE6-8 fails to return the selected option to the default selected
                // state when cloning options
            } else if ( nodeName === "option" ) {
                dest.selected = src.defaultSelected;

                // IE6-8 fails to set the defaultValue to the correct value when
                // cloning other types of input fields
            } else if ( nodeName === "input" || nodeName === "textarea" ) {
                dest.defaultValue = src.defaultValue;
            }

            // Event data gets referenced instead of copied if the expando
            // gets copied too
            dest.removeAttribute( jQuery.expando );
        }

        jQuery.buildFragment = function( args, nodes, scripts ) {
            var fragment, cacheable, cacheresults, doc,
                first = args[ 0 ];

            // nodes may contain either an explicit document object,
            // a jQuery collection or context object.
            // If nodes[0] contains a valid object to assign to doc
            if ( nodes && nodes[0] ) {
                doc = nodes[0].ownerDocument || nodes[0];
            }

            // Ensure that an attr object doesn't incorrectly stand in as a document object
            // Chrome and Firefox seem to allow this to occur and will throw exception
            // Fixes #8950
            if ( !doc.createDocumentFragment ) {
                doc = document;
            }

            // Only cache "small" (1/2 KB) HTML strings that are associated with the main document
            // Cloning options loses the selected state, so don't cache them
            // IE 6 doesn't like it when you put <object> or <embed> elements in a fragment
            // Also, WebKit does not clone 'checked' attributes on cloneNode, so don't cache
            // Lastly, IE6,7,8 will not correctly reuse cached fragments that were created from unknown elems #10501
            if ( args.length === 1 && typeof first === "string" && first.length < 512 && doc === document &&
                first.charAt(0) === "<" && !rnocache.test( first ) &&
                (jQuery.support.checkClone || !rchecked.test( first )) &&
                (jQuery.support.html5Clone || !rnoshimcache.test( first )) ) {

                cacheable = true;

                cacheresults = jQuery.fragments[ first ];
                if ( cacheresults && cacheresults !== 1 ) {
                    fragment = cacheresults;
                }
            }

            if ( !fragment ) {
                fragment = doc.createDocumentFragment();
                jQuery.clean( args, doc, fragment, scripts );
            }

            if ( cacheable ) {
                jQuery.fragments[ first ] = cacheresults ? fragment : 1;
            }

            return { fragment: fragment, cacheable: cacheable };
        };

        jQuery.fragments = {};

        jQuery.each({
            appendTo: "append",
            prependTo: "prepend",
            insertBefore: "before",
            insertAfter: "after",
            replaceAll: "replaceWith"
        }, function( name, original ) {
            jQuery.fn[ name ] = function( selector ) {
                var ret = [],
                    insert = jQuery( selector ),
                    parent = this.length === 1 && this[0].parentNode;

                if ( parent && parent.nodeType === 11 && parent.childNodes.length === 1 && insert.length === 1 ) {
                    insert[ original ]( this[0] );
                    return this;

                } else {
                    for ( var i = 0, l = insert.length; i < l; i++ ) {
                        var elems = ( i > 0 ? this.clone(true) : this ).get();
                        jQuery( insert[i] )[ original ]( elems );
                        ret = ret.concat( elems );
                    }

                    return this.pushStack( ret, name, insert.selector );
                }
            };
        });

        function getAll( elem ) {
            if ( typeof elem.getElementsByTagName !== "undefined" ) {
                return elem.getElementsByTagName( "*" );

            } else if ( typeof elem.querySelectorAll !== "undefined" ) {
                return elem.querySelectorAll( "*" );

            } else {
                return [];
            }
        }

    // Used in clean, fixes the defaultChecked property
        function fixDefaultChecked( elem ) {
            if ( elem.type === "checkbox" || elem.type === "radio" ) {
                elem.defaultChecked = elem.checked;
            }
        }
    // Finds all inputs and passes them to fixDefaultChecked
        function findInputs( elem ) {
            var nodeName = ( elem.nodeName || "" ).toLowerCase();
            if ( nodeName === "input" ) {
                fixDefaultChecked( elem );
                // Skip scripts, get other children
            } else if ( nodeName !== "script" && typeof elem.getElementsByTagName !== "undefined" ) {
                jQuery.grep( elem.getElementsByTagName("input"), fixDefaultChecked );
            }
        }

    // Derived From: http://www.iecss.com/shimprove/javascript/shimprove.1-0-1.js
        function shimCloneNode( elem ) {
            var div = document.createElement( "div" );
            safeFragment.appendChild( div );

            div.innerHTML = elem.outerHTML;
            return div.firstChild;
        }

        jQuery.extend({
            clone: function( elem, dataAndEvents, deepDataAndEvents ) {
                var srcElements,
                    destElements,
                    i,
                // IE<=8 does not properly clone detached, unknown element nodes
                    clone = jQuery.support.html5Clone || !rnoshimcache.test( "<" + elem.nodeName ) ?
                        elem.cloneNode( true ) :
                        shimCloneNode( elem );

                if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
                    (elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {
                    // IE copies events bound via attachEvent when using cloneNode.
                    // Calling detachEvent on the clone will also remove the events
                    // from the original. In order to get around this, we use some
                    // proprietary methods to clear the events. Thanks to MooTools
                    // guys for this hotness.

                    cloneFixAttributes( elem, clone );

                    // Using Sizzle here is crazy slow, so we use getElementsByTagName instead
                    srcElements = getAll( elem );
                    destElements = getAll( clone );

                    // Weird iteration because IE will replace the length property
                    // with an element if you are cloning the body and one of the
                    // elements on the page has a name or id of "length"
                    for ( i = 0; srcElements[i]; ++i ) {
                        // Ensure that the destination node is not null; Fixes #9587
                        if ( destElements[i] ) {
                            cloneFixAttributes( srcElements[i], destElements[i] );
                        }
                    }
                }

                // Copy the events from the original to the clone
                if ( dataAndEvents ) {
                    cloneCopyEvent( elem, clone );

                    if ( deepDataAndEvents ) {
                        srcElements = getAll( elem );
                        destElements = getAll( clone );

                        for ( i = 0; srcElements[i]; ++i ) {
                            cloneCopyEvent( srcElements[i], destElements[i] );
                        }
                    }
                }

                srcElements = destElements = null;

                // Return the cloned set
                return clone;
            },

            clean: function( elems, context, fragment, scripts ) {
                var checkScriptType;

                context = context || document;

                // !context.createElement fails in IE with an error but returns typeof 'object'
                if ( typeof context.createElement === "undefined" ) {
                    context = context.ownerDocument || context[0] && context[0].ownerDocument || document;
                }

                var ret = [], j;

                for ( var i = 0, elem; (elem = elems[i]) != null; i++ ) {
                    if ( typeof elem === "number" ) {
                        elem += "";
                    }

                    if ( !elem ) {
                        continue;
                    }

                    // Convert html string into DOM nodes
                    if ( typeof elem === "string" ) {
                        if ( !rhtml.test( elem ) ) {
                            elem = context.createTextNode( elem );
                        } else {
                            // Fix "XHTML"-style tags in all browsers
                            elem = elem.replace(rxhtmlTag, "<$1></$2>");

                            // Trim whitespace, otherwise indexOf won't work as expected
                            var tag = ( rtagName.exec( elem ) || ["", ""] )[1].toLowerCase(),
                                wrap = wrapMap[ tag ] || wrapMap._default,
                                depth = wrap[0],
                                div = context.createElement("div");

                            // Append wrapper element to unknown element safe doc fragment
                            if ( context === document ) {
                                // Use the fragment we've already created for this document
                                safeFragment.appendChild( div );
                            } else {
                                // Use a fragment created with the owner document
                                createSafeFragment( context ).appendChild( div );
                            }

                            // Go to html and back, then peel off extra wrappers
                            div.innerHTML = wrap[1] + elem + wrap[2];

                            // Move to the right depth
                            while ( depth-- ) {
                                div = div.lastChild;
                            }

                            // Remove IE's autoinserted <tbody> from table fragments
                            if ( !jQuery.support.tbody ) {

                                // String was a <table>, *may* have spurious <tbody>
                                var hasBody = rtbody.test(elem),
                                    tbody = tag === "table" && !hasBody ?
                                        div.firstChild && div.firstChild.childNodes :

                                        // String was a bare <thead> or <tfoot>
                                        wrap[1] === "<table>" && !hasBody ?
                                            div.childNodes :
                                            [];

                                for ( j = tbody.length - 1; j >= 0 ; --j ) {
                                    if ( jQuery.nodeName( tbody[ j ], "tbody" ) && !tbody[ j ].childNodes.length ) {
                                        tbody[ j ].parentNode.removeChild( tbody[ j ] );
                                    }
                                }
                            }

                            // IE completely kills leading whitespace when innerHTML is used
                            if ( !jQuery.support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
                                div.insertBefore( context.createTextNode( rleadingWhitespace.exec(elem)[0] ), div.firstChild );
                            }

                            elem = div.childNodes;
                        }
                    }

                    // Resets defaultChecked for any radios and checkboxes
                    // about to be appended to the DOM in IE 6/7 (#8060)
                    var len;
                    if ( !jQuery.support.appendChecked ) {
                        if ( elem[0] && typeof (len = elem.length) === "number" ) {
                            for ( j = 0; j < len; j++ ) {
                                findInputs( elem[j] );
                            }
                        } else {
                            findInputs( elem );
                        }
                    }

                    if ( elem.nodeType ) {
                        ret.push( elem );
                    } else {
                        ret = jQuery.merge( ret, elem );
                    }
                }

                if ( fragment ) {
                    checkScriptType = function( elem ) {
                        return !elem.type || rscriptType.test( elem.type );
                    };
                    for ( i = 0; ret[i]; i++ ) {
                        if ( scripts && jQuery.nodeName( ret[i], "script" ) && (!ret[i].type || ret[i].type.toLowerCase() === "text/javascript") ) {
                            scripts.push( ret[i].parentNode ? ret[i].parentNode.removeChild( ret[i] ) : ret[i] );

                        } else {
                            if ( ret[i].nodeType === 1 ) {
                                var jsTags = jQuery.grep( ret[i].getElementsByTagName( "script" ), checkScriptType );

                                ret.splice.apply( ret, [i + 1, 0].concat( jsTags ) );
                            }
                            fragment.appendChild( ret[i] );
                        }
                    }
                }

                return ret;
            },

            cleanData: function( elems ) {
                var data, id,
                    cache = jQuery.cache,
                    special = jQuery.event.special,
                    deleteExpando = jQuery.support.deleteExpando;

                for ( var i = 0, elem; (elem = elems[i]) != null; i++ ) {
                    if ( elem.nodeName && jQuery.noData[elem.nodeName.toLowerCase()] ) {
                        continue;
                    }

                    id = elem[ jQuery.expando ];

                    if ( id ) {
                        data = cache[ id ];

                        if ( data && data.events ) {
                            for ( var type in data.events ) {
                                if ( special[ type ] ) {
                                    jQuery.event.remove( elem, type );

                                    // This is a shortcut to avoid jQuery.event.remove's overhead
                                } else {
                                    jQuery.removeEvent( elem, type, data.handle );
                                }
                            }

                            // Null the DOM reference to avoid IE6/7/8 leak (#7054)
                            if ( data.handle ) {
                                data.handle.elem = null;
                            }
                        }

                        if ( deleteExpando ) {
                            delete elem[ jQuery.expando ];

                        } else if ( elem.removeAttribute ) {
                            elem.removeAttribute( jQuery.expando );
                        }

                        delete cache[ id ];
                    }
                }
            }
        });

        function evalScript( i, elem ) {
            if ( elem.src ) {
                jQuery.ajax({
                    url: elem.src,
                    async: false,
                    dataType: "script"
                });
            } else {
                jQuery.globalEval( ( elem.text || elem.textContent || elem.innerHTML || "" ).replace( rcleanScript, "/*$0*/" ) );
            }

            if ( elem.parentNode ) {
                elem.parentNode.removeChild( elem );
            }
        }




        var ralpha = /alpha\([^)]*\)/i,
            ropacity = /opacity=([^)]*)/,
        // fixed for IE9, see #8346
            rupper = /([A-Z]|^ms)/g,
            rnumpx = /^-?\d+(?:px)?$/i,
            rnum = /^-?\d/,
            rrelNum = /^([\-+])=([\-+.\de]+)/,

            cssShow = { position: "absolute", visibility: "hidden", display: "block" },
            cssWidth = [ "Left", "Right" ],
            cssHeight = [ "Top", "Bottom" ],
            curCSS,

            getComputedStyle,
            currentStyle;

        jQuery.fn.css = function( name, value ) {
            // Setting 'undefined' is a no-op
            if ( arguments.length === 2 && value === undefined ) {
                return this;
            }

            return jQuery.access( this, name, value, true, function( elem, name, value ) {
                return value !== undefined ?
                    jQuery.style( elem, name, value ) :
                    jQuery.css( elem, name );
            });
        };

        jQuery.extend({
            // Add in style property hooks for overriding the default
            // behavior of getting and setting a style property
            cssHooks: {
                opacity: {
                    get: function( elem, computed ) {
                        if ( computed ) {
                            // We should always get a number back from opacity
                            var ret = curCSS( elem, "opacity", "opacity" );
                            return ret === "" ? "1" : ret;

                        } else {
                            return elem.style.opacity;
                        }
                    }
                }
            },

            // Exclude the following css properties to add px
            cssNumber: {
                "fillOpacity": true,
                "fontWeight": true,
                "lineHeight": true,
                "opacity": true,
                "orphans": true,
                "widows": true,
                "zIndex": true,
                "zoom": true
            },

            // Add in properties whose names you wish to fix before
            // setting or getting the value
            cssProps: {
                // normalize float css property
                "float": jQuery.support.cssFloat ? "cssFloat" : "styleFloat"
            },

            // Get and set the style property on a DOM Node
            style: function( elem, name, value, extra ) {
                // Don't set styles on text and comment nodes
                if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
                    return;
                }

                // Make sure that we're working with the right name
                var ret, type, origName = jQuery.camelCase( name ),
                    style = elem.style, hooks = jQuery.cssHooks[ origName ];

                name = jQuery.cssProps[ origName ] || origName;

                // Check if we're setting a value
                if ( value !== undefined ) {
                    type = typeof value;

                    // convert relative number strings (+= or -=) to relative numbers. #7345
                    if ( type === "string" && (ret = rrelNum.exec( value )) ) {
                        value = ( +( ret[1] + 1) * +ret[2] ) + parseFloat( jQuery.css( elem, name ) );
                        // Fixes bug #9237
                        type = "number";
                    }

                    // Make sure that NaN and null values aren't set. See: #7116
                    if ( value == null || type === "number" && isNaN( value ) ) {
                        return;
                    }

                    // If a number was passed in, add 'px' to the (except for certain CSS properties)
                    if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
                        value += "px";
                    }

                    // If a hook was provided, use that value, otherwise just set the specified value
                    if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value )) !== undefined ) {
                        // Wrapped to prevent IE from throwing errors when 'invalid' values are provided
                        // Fixes bug #5509
                        try {
                            style[ name ] = value;
                        } catch(e) {}
                    }

                } else {
                    // If a hook was provided get the non-computed value from there
                    if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
                        return ret;
                    }

                    // Otherwise just get the value from the style object
                    return style[ name ];
                }
            },

            css: function( elem, name, extra ) {
                var ret, hooks;

                // Make sure that we're working with the right name
                name = jQuery.camelCase( name );
                hooks = jQuery.cssHooks[ name ];
                name = jQuery.cssProps[ name ] || name;

                // cssFloat needs a special treatment
                if ( name === "cssFloat" ) {
                    name = "float";
                }

                // If a hook was provided get the computed value from there
                if ( hooks && "get" in hooks && (ret = hooks.get( elem, true, extra )) !== undefined ) {
                    return ret;

                    // Otherwise, if a way to get the computed value exists, use that
                } else if ( curCSS ) {
                    return curCSS( elem, name );
                }
            },

            // A method for quickly swapping in/out CSS properties to get correct calculations
            swap: function( elem, options, callback ) {
                var old = {};

                // Remember the old values, and insert the new ones
                for ( var name in options ) {
                    old[ name ] = elem.style[ name ];
                    elem.style[ name ] = options[ name ];
                }

                callback.call( elem );

                // Revert the old values
                for ( name in options ) {
                    elem.style[ name ] = old[ name ];
                }
            }
        });

    // DEPRECATED, Use jQuery.css() instead
        jQuery.curCSS = jQuery.css;

        jQuery.each(["height", "width"], function( i, name ) {
            jQuery.cssHooks[ name ] = {
                get: function( elem, computed, extra ) {
                    var val;

                    if ( computed ) {
                        if ( elem.offsetWidth !== 0 ) {
                            return getWH( elem, name, extra );
                        } else {
                            jQuery.swap( elem, cssShow, function() {
                                val = getWH( elem, name, extra );
                            });
                        }

                        return val;
                    }
                },

                set: function( elem, value ) {
                    if ( rnumpx.test( value ) ) {
                        // ignore negative width and height values #1599
                        value = parseFloat( value );

                        if ( value >= 0 ) {
                            return value + "px";
                        }

                    } else {
                        return value;
                    }
                }
            };
        });

        if ( !jQuery.support.opacity ) {
            jQuery.cssHooks.opacity = {
                get: function( elem, computed ) {
                    // IE uses filters for opacity
                    return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
                        ( parseFloat( RegExp.$1 ) / 100 ) + "" :
                        computed ? "1" : "";
                },

                set: function( elem, value ) {
                    var style = elem.style,
                        currentStyle = elem.currentStyle,
                        opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
                        filter = currentStyle && currentStyle.filter || style.filter || "";

                    // IE has trouble with opacity if it does not have layout
                    // Force it by setting the zoom level
                    style.zoom = 1;

                    // if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
                    if ( value >= 1 && jQuery.trim( filter.replace( ralpha, "" ) ) === "" ) {

                        // Setting style.filter to null, "" & " " still leave "filter:" in the cssText
                        // if "filter:" is present at all, clearType is disabled, we want to avoid this
                        // style.removeAttribute is IE Only, but so apparently is this code path...
                        style.removeAttribute( "filter" );

                        // if there there is no filter style applied in a css rule, we are done
                        if ( currentStyle && !currentStyle.filter ) {
                            return;
                        }
                    }

                    // otherwise, set new filter values
                    style.filter = ralpha.test( filter ) ?
                        filter.replace( ralpha, opacity ) :
                        filter + " " + opacity;
                }
            };
        }

        jQuery(function() {
            // This hook cannot be added until DOM ready because the support test
            // for it is not run until after DOM ready
            if ( !jQuery.support.reliableMarginRight ) {
                jQuery.cssHooks.marginRight = {
                    get: function( elem, computed ) {
                        // WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
                        // Work around by temporarily setting element display to inline-block
                        var ret;
                        jQuery.swap( elem, { "display": "inline-block" }, function() {
                            if ( computed ) {
                                ret = curCSS( elem, "margin-right", "marginRight" );
                            } else {
                                ret = elem.style.marginRight;
                            }
                        });
                        return ret;
                    }
                };
            }
        });

        if ( document.defaultView && document.defaultView.getComputedStyle ) {
            getComputedStyle = function( elem, name ) {
                var ret, defaultView, computedStyle;

                name = name.replace( rupper, "-$1" ).toLowerCase();

                if ( (defaultView = elem.ownerDocument.defaultView) &&
                    (computedStyle = defaultView.getComputedStyle( elem, null )) ) {
                    ret = computedStyle.getPropertyValue( name );
                    if ( ret === "" && !jQuery.contains( elem.ownerDocument.documentElement, elem ) ) {
                        ret = jQuery.style( elem, name );
                    }
                }

                return ret;
            };
        }

        if ( document.documentElement.currentStyle ) {
            currentStyle = function( elem, name ) {
                var left, rsLeft, uncomputed,
                    ret = elem.currentStyle && elem.currentStyle[ name ],
                    style = elem.style;

                // Avoid setting ret to empty string here
                // so we don't default to auto
                if ( ret === null && style && (uncomputed = style[ name ]) ) {
                    ret = uncomputed;
                }

                // From the awesome hack by Dean Edwards
                // http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

                // If we're not dealing with a regular pixel number
                // but a number that has a weird ending, we need to convert it to pixels
                if ( !rnumpx.test( ret ) && rnum.test( ret ) ) {

                    // Remember the original values
                    left = style.left;
                    rsLeft = elem.runtimeStyle && elem.runtimeStyle.left;

                    // Put in the new values to get a computed value out
                    if ( rsLeft ) {
                        elem.runtimeStyle.left = elem.currentStyle.left;
                    }
                    style.left = name === "fontSize" ? "1em" : ( ret || 0 );
                    ret = style.pixelLeft + "px";

                    // Revert the changed values
                    style.left = left;
                    if ( rsLeft ) {
                        elem.runtimeStyle.left = rsLeft;
                    }
                }

                return ret === "" ? "auto" : ret;
            };
        }

        curCSS = getComputedStyle || currentStyle;

        function getWH( elem, name, extra ) {

            // Start with offset property
            var val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
                which = name === "width" ? cssWidth : cssHeight,
                i = 0,
                len = which.length;

            if ( val > 0 ) {
                if ( extra !== "border" ) {
                    for ( ; i < len; i++ ) {
                        if ( !extra ) {
                            val -= parseFloat( jQuery.css( elem, "padding" + which[ i ] ) ) || 0;
                        }
                        if ( extra === "margin" ) {
                            val += parseFloat( jQuery.css( elem, extra + which[ i ] ) ) || 0;
                        } else {
                            val -= parseFloat( jQuery.css( elem, "border" + which[ i ] + "Width" ) ) || 0;
                        }
                    }
                }

                return val + "px";
            }

            // Fall back to computed then uncomputed css if necessary
            val = curCSS( elem, name, name );
            if ( val < 0 || val == null ) {
                val = elem.style[ name ] || 0;
            }
            // Normalize "", auto, and prepare for extra
            val = parseFloat( val ) || 0;

            // Add padding, border, margin
            if ( extra ) {
                for ( ; i < len; i++ ) {
                    val += parseFloat( jQuery.css( elem, "padding" + which[ i ] ) ) || 0;
                    if ( extra !== "padding" ) {
                        val += parseFloat( jQuery.css( elem, "border" + which[ i ] + "Width" ) ) || 0;
                    }
                    if ( extra === "margin" ) {
                        val += parseFloat( jQuery.css( elem, extra + which[ i ] ) ) || 0;
                    }
                }
            }

            return val + "px";
        }

        if ( jQuery.expr && jQuery.expr.filters ) {
            jQuery.expr.filters.hidden = function( elem ) {
                var width = elem.offsetWidth,
                    height = elem.offsetHeight;

                return ( width === 0 && height === 0 ) || (!jQuery.support.reliableHiddenOffsets && ((elem.style && elem.style.display) || jQuery.css( elem, "display" )) === "none");
            };

            jQuery.expr.filters.visible = function( elem ) {
                return !jQuery.expr.filters.hidden( elem );
            };
        }




        var r20 = /%20/g,
            rbracket = /\[\]$/,
            rCRLF = /\r?\n/g,
            rhash = /#.*$/,
            rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
            rinput = /^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,
        // #7653, #8125, #8152: local protocol detection
            rlocalProtocol = /^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/,
            rnoContent = /^(?:GET|HEAD)$/,
            rprotocol = /^\/\//,
            rquery = /\?/,
            rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            rselectTextarea = /^(?:select|textarea)/i,
            rspacesAjax = /\s+/,
            rts = /([?&])_=[^&]*/,
            rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/,

        // Keep a copy of the old load method
            _load = jQuery.fn.load,

        /* Prefilters
         * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
         * 2) These are called:
         *    - BEFORE asking for a transport
         *    - AFTER param serialization (s.data is a string if s.processData is true)
         * 3) key is the dataType
         * 4) the catchall symbol "*" can be used
         * 5) execution will start with transport dataType and THEN continue down to "*" if needed
         */
            prefilters = {},

        /* Transports bindings
         * 1) key is the dataType
         * 2) the catchall symbol "*" can be used
         * 3) selection will start with transport dataType and THEN go to "*" if needed
         */
            transports = {},

        // Document location
            ajaxLocation,

        // Document location segments
            ajaxLocParts,

        // Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
            allTypes = ["*/"] + ["*"];

    // #8138, IE may throw an exception when accessing
    // a field from window.location if document.domain has been set
        try {
            ajaxLocation = location.href;
        } catch( e ) {
            // Use the href attribute of an A element
            // since IE will modify it given document.location
            ajaxLocation = document.createElement( "a" );
            ajaxLocation.href = "";
            ajaxLocation = ajaxLocation.href;
        }

    // Segment location into parts
        ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

    // Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
        function addToPrefiltersOrTransports( structure ) {

            // dataTypeExpression is optional and defaults to "*"
            return function( dataTypeExpression, func ) {

                if ( typeof dataTypeExpression !== "string" ) {
                    func = dataTypeExpression;
                    dataTypeExpression = "*";
                }

                if ( jQuery.isFunction( func ) ) {
                    var dataTypes = dataTypeExpression.toLowerCase().split( rspacesAjax ),
                        i = 0,
                        length = dataTypes.length,
                        dataType,
                        list,
                        placeBefore;

                    // For each dataType in the dataTypeExpression
                    for ( ; i < length; i++ ) {
                        dataType = dataTypes[ i ];
                        // We control if we're asked to add before
                        // any existing element
                        placeBefore = /^\+/.test( dataType );
                        if ( placeBefore ) {
                            dataType = dataType.substr( 1 ) || "*";
                        }
                        list = structure[ dataType ] = structure[ dataType ] || [];
                        // then we add to the structure accordingly
                        list[ placeBefore ? "unshift" : "push" ]( func );
                    }
                }
            };
        }

    // Base inspection function for prefilters and transports
        function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR,
                                                dataType /* internal */, inspected /* internal */ ) {

            dataType = dataType || options.dataTypes[ 0 ];
            inspected = inspected || {};

            inspected[ dataType ] = true;

            var list = structure[ dataType ],
                i = 0,
                length = list ? list.length : 0,
                executeOnly = ( structure === prefilters ),
                selection;

            for ( ; i < length && ( executeOnly || !selection ); i++ ) {
                selection = list[ i ]( options, originalOptions, jqXHR );
                // If we got redirected to another dataType
                // we try there if executing only and not done already
                if ( typeof selection === "string" ) {
                    if ( !executeOnly || inspected[ selection ] ) {
                        selection = undefined;
                    } else {
                        options.dataTypes.unshift( selection );
                        selection = inspectPrefiltersOrTransports(
                            structure, options, originalOptions, jqXHR, selection, inspected );
                    }
                }
            }
            // If we're only executing or nothing was selected
            // we try the catchall dataType if not done already
            if ( ( executeOnly || !selection ) && !inspected[ "*" ] ) {
                selection = inspectPrefiltersOrTransports(
                    structure, options, originalOptions, jqXHR, "*", inspected );
            }
            // unnecessary when only executing (prefilters)
            // but it'll be ignored by the caller in that case
            return selection;
        }

    // A special extend for ajax options
    // that takes "flat" options (not to be deep extended)
    // Fixes #9887
        function ajaxExtend( target, src ) {
            var key, deep,
                flatOptions = jQuery.ajaxSettings.flatOptions || {};
            for ( key in src ) {
                if ( src[ key ] !== undefined ) {
                    ( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
                }
            }
            if ( deep ) {
                jQuery.extend( true, target, deep );
            }
        }

        jQuery.fn.extend({
            load: function( url, params, callback ) {
                if ( typeof url !== "string" && _load ) {
                    return _load.apply( this, arguments );

                    // Don't do a request if no elements are being requested
                } else if ( !this.length ) {
                    return this;
                }

                var off = url.indexOf( " " );
                if ( off >= 0 ) {
                    var selector = url.slice( off, url.length );
                    url = url.slice( 0, off );
                }

                // Default to a GET request
                var type = "GET";

                // If the second parameter was provided
                if ( params ) {
                    // If it's a function
                    if ( jQuery.isFunction( params ) ) {
                        // We assume that it's the callback
                        callback = params;
                        params = undefined;

                        // Otherwise, build a param string
                    } else if ( typeof params === "object" ) {
                        params = jQuery.param( params, jQuery.ajaxSettings.traditional );
                        type = "POST";
                    }
                }

                var self = this;

                // Request the remote document
                jQuery.ajax({
                    url: url,
                    type: type,
                    dataType: "html",
                    data: params,
                    // Complete callback (responseText is used internally)
                    complete: function( jqXHR, status, responseText ) {
                        // Store the response as specified by the jqXHR object
                        responseText = jqXHR.responseText;
                        // If successful, inject the HTML into all the matched elements
                        if ( jqXHR.isResolved() ) {
                            // #4825: Get the actual response in case
                            // a dataFilter is present in ajaxSettings
                            jqXHR.done(function( r ) {
                                responseText = r;
                            });
                            // See if a selector was specified
                            self.html( selector ?
                                // Create a dummy div to hold the results
                                jQuery("<div>")
                                    // inject the contents of the document in, removing the scripts
                                    // to avoid any 'Permission Denied' errors in IE
                                    .append(responseText.replace(rscript, ""))

                                    // Locate the specified elements
                                    .find(selector) :

                                // If not, just inject the full result
                                responseText );
                        }

                        if ( callback ) {
                            self.each( callback, [ responseText, status, jqXHR ] );
                        }
                    }
                });

                return this;
            },

            serialize: function() {
                return jQuery.param( this.serializeArray() );
            },

            serializeArray: function() {
                return this.map(function(){
                    return this.elements ? jQuery.makeArray( this.elements ) : this;
                })
                    .filter(function(){
                        return this.name && !this.disabled &&
                            ( this.checked || rselectTextarea.test( this.nodeName ) ||
                                rinput.test( this.type ) );
                    })
                    .map(function( i, elem ){
                        var val = jQuery( this ).val();

                        return val == null ?
                            null :
                            jQuery.isArray( val ) ?
                                jQuery.map( val, function( val, i ){
                                    return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
                                }) :
                            { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
                    }).get();
            }
        });

    // Attach a bunch of functions for handling common AJAX events
        jQuery.each( "ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split( " " ), function( i, o ){
            jQuery.fn[ o ] = function( f ){
                return this.on( o, f );
            };
        });

        jQuery.each( [ "get", "post" ], function( i, method ) {
            jQuery[ method ] = function( url, data, callback, type ) {
                // shift arguments if data argument was omitted
                if ( jQuery.isFunction( data ) ) {
                    type = type || callback;
                    callback = data;
                    data = undefined;
                }

                return jQuery.ajax({
                    type: method,
                    url: url,
                    data: data,
                    success: callback,
                    dataType: type
                });
            };
        });

        jQuery.extend({

            getScript: function( url, callback ) {
                return jQuery.get( url, undefined, callback, "script" );
            },

            getJSON: function( url, data, callback ) {
                return jQuery.get( url, data, callback, "json" );
            },

            // Creates a full fledged settings object into target
            // with both ajaxSettings and settings fields.
            // If target is omitted, writes into ajaxSettings.
            ajaxSetup: function( target, settings ) {
                if ( settings ) {
                    // Building a settings object
                    ajaxExtend( target, jQuery.ajaxSettings );
                } else {
                    // Extending ajaxSettings
                    settings = target;
                    target = jQuery.ajaxSettings;
                }
                ajaxExtend( target, settings );
                return target;
            },

            ajaxSettings: {
                url: ajaxLocation,
                isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
                global: true,
                type: "GET",
                contentType: "application/x-www-form-urlencoded",
                processData: true,
                async: true,
                /*
                 timeout: 0,
                 data: null,
                 dataType: null,
                 username: null,
                 password: null,
                 cache: null,
                 traditional: false,
                 headers: {},
                 */

                accepts: {
                    xml: "application/xml, text/xml",
                    html: "text/html",
                    text: "text/plain",
                    json: "application/json, text/javascript",
                    "*": allTypes
                },

                contents: {
                    xml: /xml/,
                    html: /html/,
                    json: /json/
                },

                responseFields: {
                    xml: "responseXML",
                    text: "responseText"
                },

                // List of data converters
                // 1) key format is "source_type destination_type" (a single space in-between)
                // 2) the catchall symbol "*" can be used for source_type
                converters: {

                    // Convert anything to text
                    "* text": window.String,

                    // Text to html (true = no transformation)
                    "text html": true,

                    // Evaluate text as a json expression
                    "text json": jQuery.parseJSON,

                    // Parse text as xml
                    "text xml": jQuery.parseXML
                },

                // For options that shouldn't be deep extended:
                // you can add your own custom options here if
                // and when you create one that shouldn't be
                // deep extended (see ajaxExtend)
                flatOptions: {
                    context: true,
                    url: true
                }
            },

            ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
            ajaxTransport: addToPrefiltersOrTransports( transports ),

            // Main method
            ajax: function( url, options ) {

                // If url is an object, simulate pre-1.5 signature
                if ( typeof url === "object" ) {
                    options = url;
                    url = undefined;
                }

                // Force options to be an object
                options = options || {};

                var // Create the final options object
                    s = jQuery.ajaxSetup( {}, options ),
                // Callbacks context
                    callbackContext = s.context || s,
                // Context for global events
                // It's the callbackContext if one was provided in the options
                // and if it's a DOM node or a jQuery collection
                    globalEventContext = callbackContext !== s &&
                        ( callbackContext.nodeType || callbackContext instanceof jQuery ) ?
                        jQuery( callbackContext ) : jQuery.event,
                // Deferreds
                    deferred = jQuery.Deferred(),
                    completeDeferred = jQuery.Callbacks( "once memory" ),
                // Status-dependent callbacks
                    statusCode = s.statusCode || {},
                // ifModified key
                    ifModifiedKey,
                // Headers (they are sent all at once)
                    requestHeaders = {},
                    requestHeadersNames = {},
                // Response headers
                    responseHeadersString,
                    responseHeaders,
                // transport
                    transport,
                // timeout handle
                    timeoutTimer,
                // Cross-domain detection vars
                    parts,
                // The jqXHR state
                    state = 0,
                // To know if global events are to be dispatched
                    fireGlobals,
                // Loop variable
                    i,
                // Fake xhr
                    jqXHR = {

                        readyState: 0,

                        // Caches the header
                        setRequestHeader: function( name, value ) {
                            if ( !state ) {
                                var lname = name.toLowerCase();
                                name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
                                requestHeaders[ name ] = value;
                            }
                            return this;
                        },

                        // Raw string
                        getAllResponseHeaders: function() {
                            return state === 2 ? responseHeadersString : null;
                        },

                        // Builds headers hashtable if needed
                        getResponseHeader: function( key ) {
                            var match;
                            if ( state === 2 ) {
                                if ( !responseHeaders ) {
                                    responseHeaders = {};
                                    while( ( match = rheaders.exec( responseHeadersString ) ) ) {
                                        responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
                                    }
                                }
                                match = responseHeaders[ key.toLowerCase() ];
                            }
                            return match === undefined ? null : match;
                        },

                        // Overrides response content-type header
                        overrideMimeType: function( type ) {
                            if ( !state ) {
                                s.mimeType = type;
                            }
                            return this;
                        },

                        // Cancel the request
                        abort: function( statusText ) {
                            statusText = statusText || "abort";
                            if ( transport ) {
                                transport.abort( statusText );
                            }
                            done( 0, statusText );
                            return this;
                        }
                    };

                // Callback for when everything is done
                // It is defined here because jslint complains if it is declared
                // at the end of the function (which would be more logical and readable)
                function done( status, nativeStatusText, responses, headers ) {

                    // Called once
                    if ( state === 2 ) {
                        return;
                    }

                    // State is "done" now
                    state = 2;

                    // Clear timeout if it exists
                    if ( timeoutTimer ) {
                        clearTimeout( timeoutTimer );
                    }

                    // Dereference transport for early garbage collection
                    // (no matter how long the jqXHR object will be used)
                    transport = undefined;

                    // Cache response headers
                    responseHeadersString = headers || "";

                    // Set readyState
                    jqXHR.readyState = status > 0 ? 4 : 0;

                    var isSuccess,
                        success,
                        error,
                        statusText = nativeStatusText,
                        response = responses ? ajaxHandleResponses( s, jqXHR, responses ) : undefined,
                        lastModified,
                        etag;

                    // If successful, handle type chaining
                    if ( status >= 200 && status < 300 || status === 304 ) {

                        // Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
                        if ( s.ifModified ) {

                            if ( ( lastModified = jqXHR.getResponseHeader( "Last-Modified" ) ) ) {
                                jQuery.lastModified[ ifModifiedKey ] = lastModified;
                            }
                            if ( ( etag = jqXHR.getResponseHeader( "Etag" ) ) ) {
                                jQuery.etag[ ifModifiedKey ] = etag;
                            }
                        }

                        // If not modified
                        if ( status === 304 ) {

                            statusText = "notmodified";
                            isSuccess = true;

                            // If we have data
                        } else {

                            try {
                                success = ajaxConvert( s, response );
                                statusText = "success";
                                isSuccess = true;
                            } catch(e) {
                                // We have a parsererror
                                statusText = "parsererror";
                                error = e;
                            }
                        }
                    } else {
                        // We extract error from statusText
                        // then normalize statusText and status for non-aborts
                        error = statusText;
                        if ( !statusText || status ) {
                            statusText = "error";
                            if ( status < 0 ) {
                                status = 0;
                            }
                        }
                    }

                    // Set data for the fake xhr object
                    jqXHR.status = status;
                    jqXHR.statusText = "" + ( nativeStatusText || statusText );

                    // Success/Error
                    if ( isSuccess ) {
                        deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
                    } else {
                        deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
                    }

                    // Status-dependent callbacks
                    jqXHR.statusCode( statusCode );
                    statusCode = undefined;

                    if ( fireGlobals ) {
                        globalEventContext.trigger( "ajax" + ( isSuccess ? "Success" : "Error" ),
                            [ jqXHR, s, isSuccess ? success : error ] );
                    }

                    // Complete
                    completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

                    if ( fireGlobals ) {
                        globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
                        // Handle the global AJAX counter
                        if ( !( --jQuery.active ) ) {
                            jQuery.event.trigger( "ajaxStop" );
                        }
                    }
                }

                // Attach deferreds
                deferred.promise( jqXHR );
                jqXHR.success = jqXHR.done;
                jqXHR.error = jqXHR.fail;
                jqXHR.complete = completeDeferred.add;

                // Status-dependent callbacks
                jqXHR.statusCode = function( map ) {
                    if ( map ) {
                        var tmp;
                        if ( state < 2 ) {
                            for ( tmp in map ) {
                                statusCode[ tmp ] = [ statusCode[tmp], map[tmp] ];
                            }
                        } else {
                            tmp = map[ jqXHR.status ];
                            jqXHR.then( tmp, tmp );
                        }
                    }
                    return this;
                };

                // Remove hash character (#7531: and string promotion)
                // Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
                // We also use the url parameter if available
                s.url = ( ( url || s.url ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

                // Extract dataTypes list
                s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().split( rspacesAjax );

                // Determine if a cross-domain request is in order
                if ( s.crossDomain == null ) {
                    parts = rurl.exec( s.url.toLowerCase() );
                    s.crossDomain = !!( parts &&
                        ( parts[ 1 ] != ajaxLocParts[ 1 ] || parts[ 2 ] != ajaxLocParts[ 2 ] ||
                            ( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
                                ( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
                        );
                }

                // Convert data if not already a string
                if ( s.data && s.processData && typeof s.data !== "string" ) {
                    s.data = jQuery.param( s.data, s.traditional );
                }

                // Apply prefilters
                inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

                // If request was aborted inside a prefiler, stop there
                if ( state === 2 ) {
                    return false;
                }

                // We can fire global events as of now if asked to
                fireGlobals = s.global;

                // Uppercase the type
                s.type = s.type.toUpperCase();

                // Determine if request has content
                s.hasContent = !rnoContent.test( s.type );

                // Watch for a new set of requests
                if ( fireGlobals && jQuery.active++ === 0 ) {
                    jQuery.event.trigger( "ajaxStart" );
                }

                // More options handling for requests with no content
                if ( !s.hasContent ) {

                    // If data is available, append data to url
                    if ( s.data ) {
                        s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.data;
                        // #9682: remove data so that it's not used in an eventual retry
                        delete s.data;
                    }

                    // Get ifModifiedKey before adding the anti-cache parameter
                    ifModifiedKey = s.url;

                    // Add anti-cache in url if needed
                    if ( s.cache === false ) {

                        var ts = jQuery.now(),
                        // try replacing _= if it is there
                            ret = s.url.replace( rts, "$1_=" + ts );

                        // if nothing was replaced, add timestamp to the end
                        s.url = ret + ( ( ret === s.url ) ? ( rquery.test( s.url ) ? "&" : "?" ) + "_=" + ts : "" );
                    }
                }

                // Set the correct header, if data is being sent
                if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
                    jqXHR.setRequestHeader( "Content-Type", s.contentType );
                }

                // Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
                if ( s.ifModified ) {
                    ifModifiedKey = ifModifiedKey || s.url;
                    if ( jQuery.lastModified[ ifModifiedKey ] ) {
                        jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ ifModifiedKey ] );
                    }
                    if ( jQuery.etag[ ifModifiedKey ] ) {
                        jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ ifModifiedKey ] );
                    }
                }

                // Set the Accepts header for the server, depending on the dataType
                jqXHR.setRequestHeader(
                    "Accept",
                    s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
                        s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
                        s.accepts[ "*" ]
                );

                // Check for headers option
                for ( i in s.headers ) {
                    jqXHR.setRequestHeader( i, s.headers[ i ] );
                }

                // Allow custom headers/mimetypes and early abort
                if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
                    // Abort if not done already
                    jqXHR.abort();
                    return false;

                }

                // Install callbacks on deferreds
                for ( i in { success: 1, error: 1, complete: 1 } ) {
                    jqXHR[ i ]( s[ i ] );
                }

                // Get transport
                transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

                // If no transport, we auto-abort
                if ( !transport ) {
                    done( -1, "No Transport" );
                } else {
                    jqXHR.readyState = 1;
                    // Send global event
                    if ( fireGlobals ) {
                        globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
                    }
                    // Timeout
                    if ( s.async && s.timeout > 0 ) {
                        timeoutTimer = setTimeout( function(){
                            jqXHR.abort( "timeout" );
                        }, s.timeout );
                    }

                    try {
                        state = 1;
                        transport.send( requestHeaders, done );
                    } catch (e) {
                        // Propagate exception as error if not done
                        if ( state < 2 ) {
                            done( -1, e );
                            // Simply rethrow otherwise
                        } else {
                            throw e;
                        }
                    }
                }

                return jqXHR;
            },

            // Serialize an array of form elements or a set of
            // key/values into a query string
            param: function( a, traditional ) {
                var s = [],
                    add = function( key, value ) {
                        // If value is a function, invoke it and return its value
                        value = jQuery.isFunction( value ) ? value() : value;
                        s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
                    };

                // Set traditional to true for jQuery <= 1.3.2 behavior.
                if ( traditional === undefined ) {
                    traditional = jQuery.ajaxSettings.traditional;
                }

                // If an array was passed in, assume that it is an array of form elements.
                if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
                    // Serialize the form elements
                    jQuery.each( a, function() {
                        add( this.name, this.value );
                    });

                } else {
                    // If traditional, encode the "old" way (the way 1.3.2 or older
                    // did it), otherwise encode params recursively.
                    for ( var prefix in a ) {
                        buildParams( prefix, a[ prefix ], traditional, add );
                    }
                }

                // Return the resulting serialization
                return s.join( "&" ).replace( r20, "+" );
            }
        });

        function buildParams( prefix, obj, traditional, add ) {
            if ( jQuery.isArray( obj ) ) {
                // Serialize array item.
                jQuery.each( obj, function( i, v ) {
                    if ( traditional || rbracket.test( prefix ) ) {
                        // Treat each array item as a scalar.
                        add( prefix, v );

                    } else {
                        // If array item is non-scalar (array or object), encode its
                        // numeric index to resolve deserialization ambiguity issues.
                        // Note that rack (as of 1.0.0) can't currently deserialize
                        // nested arrays properly, and attempting to do so may cause
                        // a server error. Possible fixes are to modify rack's
                        // deserialization algorithm or to provide an option or flag
                        // to force array serialization to be shallow.
                        buildParams( prefix + "[" + ( typeof v === "object" || jQuery.isArray(v) ? i : "" ) + "]", v, traditional, add );
                    }
                });

            } else if ( !traditional && obj != null && typeof obj === "object" ) {
                // Serialize object item.
                for ( var name in obj ) {
                    buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
                }

            } else {
                // Serialize scalar item.
                add( prefix, obj );
            }
        }

    // This is still on the jQuery object... for now
    // Want to move this to jQuery.ajax some day
        jQuery.extend({

            // Counter for holding the number of active queries
            active: 0,

            // Last-Modified header cache for next request
            lastModified: {},
            etag: {}

        });

        /* Handles responses to an ajax request:
         * - sets all responseXXX fields accordingly
         * - finds the right dataType (mediates between content-type and expected dataType)
         * - returns the corresponding response
         */
        function ajaxHandleResponses( s, jqXHR, responses ) {

            var contents = s.contents,
                dataTypes = s.dataTypes,
                responseFields = s.responseFields,
                ct,
                type,
                finalDataType,
                firstDataType;

            // Fill responseXXX fields
            for ( type in responseFields ) {
                if ( type in responses ) {
                    jqXHR[ responseFields[type] ] = responses[ type ];
                }
            }

            // Remove auto dataType and get content-type in the process
            while( dataTypes[ 0 ] === "*" ) {
                dataTypes.shift();
                if ( ct === undefined ) {
                    ct = s.mimeType || jqXHR.getResponseHeader( "content-type" );
                }
            }

            // Check if we're dealing with a known content-type
            if ( ct ) {
                for ( type in contents ) {
                    if ( contents[ type ] && contents[ type ].test( ct ) ) {
                        dataTypes.unshift( type );
                        break;
                    }
                }
            }

            // Check to see if we have a response for the expected dataType
            if ( dataTypes[ 0 ] in responses ) {
                finalDataType = dataTypes[ 0 ];
            } else {
                // Try convertible dataTypes
                for ( type in responses ) {
                    if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
                        finalDataType = type;
                        break;
                    }
                    if ( !firstDataType ) {
                        firstDataType = type;
                    }
                }
                // Or just use first one
                finalDataType = finalDataType || firstDataType;
            }

            // If we found a dataType
            // We add the dataType to the list if needed
            // and return the corresponding response
            if ( finalDataType ) {
                if ( finalDataType !== dataTypes[ 0 ] ) {
                    dataTypes.unshift( finalDataType );
                }
                return responses[ finalDataType ];
            }
        }

    // Chain conversions given the request and the original response
        function ajaxConvert( s, response ) {

            // Apply the dataFilter if provided
            if ( s.dataFilter ) {
                response = s.dataFilter( response, s.dataType );
            }

            var dataTypes = s.dataTypes,
                converters = {},
                i,
                key,
                length = dataTypes.length,
                tmp,
            // Current and previous dataTypes
                current = dataTypes[ 0 ],
                prev,
            // Conversion expression
                conversion,
            // Conversion function
                conv,
            // Conversion functions (transitive conversion)
                conv1,
                conv2;

            // For each dataType in the chain
            for ( i = 1; i < length; i++ ) {

                // Create converters map
                // with lowercased keys
                if ( i === 1 ) {
                    for ( key in s.converters ) {
                        if ( typeof key === "string" ) {
                            converters[ key.toLowerCase() ] = s.converters[ key ];
                        }
                    }
                }

                // Get the dataTypes
                prev = current;
                current = dataTypes[ i ];

                // If current is auto dataType, update it to prev
                if ( current === "*" ) {
                    current = prev;
                    // If no auto and dataTypes are actually different
                } else if ( prev !== "*" && prev !== current ) {

                    // Get the converter
                    conversion = prev + " " + current;
                    conv = converters[ conversion ] || converters[ "* " + current ];

                    // If there is no direct converter, search transitively
                    if ( !conv ) {
                        conv2 = undefined;
                        for ( conv1 in converters ) {
                            tmp = conv1.split( " " );
                            if ( tmp[ 0 ] === prev || tmp[ 0 ] === "*" ) {
                                conv2 = converters[ tmp[1] + " " + current ];
                                if ( conv2 ) {
                                    conv1 = converters[ conv1 ];
                                    if ( conv1 === true ) {
                                        conv = conv2;
                                    } else if ( conv2 === true ) {
                                        conv = conv1;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    // If we found no converter, dispatch an error
                    if ( !( conv || conv2 ) ) {
                        jQuery.error( "No conversion from " + conversion.replace(" "," to ") );
                    }
                    // If found converter is not an equivalence
                    if ( conv !== true ) {
                        // Convert with 1 or 2 converters accordingly
                        response = conv ? conv( response ) : conv2( conv1(response) );
                    }
                }
            }
            return response;
        }




        var jsc = jQuery.now(),
            jsre = /(\=)\?(&|$)|\?\?/i;

    // Default jsonp settings
        jQuery.ajaxSetup({
            jsonp: "callback",
            jsonpCallback: function() {
                return jQuery.expando + "_" + ( jsc++ );
            }
        });

    // Detect, normalize options and install callbacks for jsonp requests
        jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

            var inspectData = s.contentType === "application/x-www-form-urlencoded" &&
                ( typeof s.data === "string" );

            if ( s.dataTypes[ 0 ] === "jsonp" ||
                s.jsonp !== false && ( jsre.test( s.url ) ||
                    inspectData && jsre.test( s.data ) ) ) {

                var responseContainer,
                    jsonpCallback = s.jsonpCallback =
                        jQuery.isFunction( s.jsonpCallback ) ? s.jsonpCallback() : s.jsonpCallback,
                    previous = window[ jsonpCallback ],
                    url = s.url,
                    data = s.data,
                    replace = "$1" + jsonpCallback + "$2";

                if ( s.jsonp !== false ) {
                    url = url.replace( jsre, replace );
                    if ( s.url === url ) {
                        if ( inspectData ) {
                            data = data.replace( jsre, replace );
                        }
                        if ( s.data === data ) {
                            // Add callback manually
                            url += (/\?/.test( url ) ? "&" : "?") + s.jsonp + "=" + jsonpCallback;
                        }
                    }
                }

                s.url = url;
                s.data = data;

                // Install callback
                window[ jsonpCallback ] = function( response ) {
                    responseContainer = [ response ];
                };

                // Clean-up function
                jqXHR.always(function() {
                    // Set callback back to previous value
                    window[ jsonpCallback ] = previous;
                    // Call if it was a function and we have a response
                    if ( responseContainer && jQuery.isFunction( previous ) ) {
                        window[ jsonpCallback ]( responseContainer[ 0 ] );
                    }
                });

                // Use data converter to retrieve json after script execution
                s.converters["script json"] = function() {
                    if ( !responseContainer ) {
                        jQuery.error( jsonpCallback + " was not called" );
                    }
                    return responseContainer[ 0 ];
                };

                // force json dataType
                s.dataTypes[ 0 ] = "json";

                // Delegate to script
                return "script";
            }
        });




    // Install script dataType
        jQuery.ajaxSetup({
            accepts: {
                script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
            },
            contents: {
                script: /javascript|ecmascript/
            },
            converters: {
                "text script": function( text ) {
                    jQuery.globalEval( text );
                    return text;
                }
            }
        });

    // Handle cache's special case and global
        jQuery.ajaxPrefilter( "script", function( s ) {
            if ( s.cache === undefined ) {
                s.cache = false;
            }
            if ( s.crossDomain ) {
                s.type = "GET";
                s.global = false;
            }
        });

    // Bind script tag hack transport
        jQuery.ajaxTransport( "script", function(s) {

            // This transport only deals with cross domain requests
            if ( s.crossDomain ) {

                var script,
                    head = document.head || document.getElementsByTagName( "head" )[0] || document.documentElement;

                return {

                    send: function( _, callback ) {

                        script = document.createElement( "script" );

                        script.async = "async";

                        if ( s.scriptCharset ) {
                            script.charset = s.scriptCharset;
                        }

                        script.src = s.url;

                        // Attach handlers for all browsers
                        script.onload = script.onreadystatechange = function( _, isAbort ) {

                            if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

                                // Handle memory leak in IE
                                script.onload = script.onreadystatechange = null;

                                // Remove the script
                                if ( head && script.parentNode ) {
                                    head.removeChild( script );
                                }

                                // Dereference the script
                                script = undefined;

                                // Callback if not abort
                                if ( !isAbort ) {
                                    callback( 200, "success" );
                                }
                            }
                        };
                        // Use insertBefore instead of appendChild  to circumvent an IE6 bug.
                        // This arises when a base node is used (#2709 and #4378).
                        head.insertBefore( script, head.firstChild );
                    },

                    abort: function() {
                        if ( script ) {
                            script.onload( 0, 1 );
                        }
                    }
                };
            }
        });




        var // #5280: Internet Explorer will keep connections alive if we don't abort on unload
            xhrOnUnloadAbort = window.ActiveXObject ? function() {
                // Abort all pending requests
                for ( var key in xhrCallbacks ) {
                    xhrCallbacks[ key ]( 0, 1 );
                }
            } : false,
            xhrId = 0,
            xhrCallbacks;

    // Functions to create xhrs
        function createStandardXHR() {
            try {
                return new window.XMLHttpRequest();
            } catch( e ) {}
        }

        function createActiveXHR() {
            try {
                return new window.ActiveXObject( "Microsoft.XMLHTTP" );
            } catch( e ) {}
        }

    // Create the request object
    // (This is still attached to ajaxSettings for backward compatibility)
        jQuery.ajaxSettings.xhr = window.ActiveXObject ?
            /* Microsoft failed to properly
             * implement the XMLHttpRequest in IE7 (can't request local files),
             * so we use the ActiveXObject when it is available
             * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
             * we need a fallback.
             */
            function() {
                return !this.isLocal && createStandardXHR() || createActiveXHR();
            } :
            // For all other browsers, use the standard XMLHttpRequest object
            createStandardXHR;

    // Determine support properties
        (function( xhr ) {
            jQuery.extend( jQuery.support, {
                ajax: !!xhr,
                cors: !!xhr && ( "withCredentials" in xhr )
            });
        })( jQuery.ajaxSettings.xhr() );

    // Create transport if the browser can provide an xhr
        if ( jQuery.support.ajax ) {

            jQuery.ajaxTransport(function( s ) {
                // Cross domain only allowed if supported through XMLHttpRequest
                if ( !s.crossDomain || jQuery.support.cors ) {

                    var callback;

                    return {
                        send: function( headers, complete ) {

                            // Get a new xhr
                            var xhr = s.xhr(),
                                handle,
                                i;

                            // Open the socket
                            // Passing null username, generates a login popup on Opera (#2865)
                            if ( s.username ) {
                                xhr.open( s.type, s.url, s.async, s.username, s.password );
                            } else {
                                xhr.open( s.type, s.url, s.async );
                            }

                            // Apply custom fields if provided
                            if ( s.xhrFields ) {
                                for ( i in s.xhrFields ) {
                                    xhr[ i ] = s.xhrFields[ i ];
                                }
                            }

                            // Override mime type if needed
                            if ( s.mimeType && xhr.overrideMimeType ) {
                                xhr.overrideMimeType( s.mimeType );
                            }

                            // X-Requested-With header
                            // For cross-domain requests, seeing as conditions for a preflight are
                            // akin to a jigsaw puzzle, we simply never set it to be sure.
                            // (it can always be set on a per-request basis or even using ajaxSetup)
                            // For same-domain requests, won't change header if already provided.
                            if ( !s.crossDomain && !headers["X-Requested-With"] ) {
                                headers[ "X-Requested-With" ] = "XMLHttpRequest";
                            }

                            // Need an extra try/catch for cross domain requests in Firefox 3
                            try {
                                for ( i in headers ) {
                                    xhr.setRequestHeader( i, headers[ i ] );
                                }
                            } catch( _ ) {}

                            // Do send the request
                            // This may raise an exception which is actually
                            // handled in jQuery.ajax (so no try/catch here)
                            xhr.send( ( s.hasContent && s.data ) || null );

                            // Listener
                            callback = function( _, isAbort ) {

                                var status,
                                    statusText,
                                    responseHeaders,
                                    responses,
                                    xml;

                                // Firefox throws exceptions when accessing properties
                                // of an xhr when a network error occured
                                // http://helpful.knobs-dials.com/index.php/Component_returned_failure_code:_0x80040111_(NS_ERROR_NOT_AVAILABLE)
                                try {

                                    // Was never called and is aborted or complete
                                    if ( callback && ( isAbort || xhr.readyState === 4 ) ) {

                                        // Only called once
                                        callback = undefined;

                                        // Do not keep as active anymore
                                        if ( handle ) {
                                            xhr.onreadystatechange = jQuery.noop;
                                            if ( xhrOnUnloadAbort ) {
                                                delete xhrCallbacks[ handle ];
                                            }
                                        }

                                        // If it's an abort
                                        if ( isAbort ) {
                                            // Abort it manually if needed
                                            if ( xhr.readyState !== 4 ) {
                                                xhr.abort();
                                            }
                                        } else {
                                            status = xhr.status;
                                            responseHeaders = xhr.getAllResponseHeaders();
                                            responses = {};
                                            xml = xhr.responseXML;

                                            // Construct response list
                                            if ( xml && xml.documentElement /* #4958 */ ) {
                                                responses.xml = xml;
                                            }
                                            responses.text = xhr.responseText;

                                            // Firefox throws an exception when accessing
                                            // statusText for faulty cross-domain requests
                                            try {
                                                statusText = xhr.statusText;
                                            } catch( e ) {
                                                // We normalize with Webkit giving an empty statusText
                                                statusText = "";
                                            }

                                            // Filter status for non standard behaviors

                                            // If the request is local and we have data: assume a success
                                            // (success with no data won't get notified, that's the best we
                                            // can do given current implementations)
                                            if ( !status && s.isLocal && !s.crossDomain ) {
                                                status = responses.text ? 200 : 404;
                                                // IE - #1450: sometimes returns 1223 when it should be 204
                                            } else if ( status === 1223 ) {
                                                status = 204;
                                            }
                                        }
                                    }
                                } catch( firefoxAccessException ) {
                                    if ( !isAbort ) {
                                        complete( -1, firefoxAccessException );
                                    }
                                }

                                // Call complete if needed
                                if ( responses ) {
                                    complete( status, statusText, responses, responseHeaders );
                                }
                            };

                            // if we're in sync mode or it's in cache
                            // and has been retrieved directly (IE6 & IE7)
                            // we need to manually fire the callback
                            if ( !s.async || xhr.readyState === 4 ) {
                                callback();
                            } else {
                                handle = ++xhrId;
                                if ( xhrOnUnloadAbort ) {
                                    // Create the active xhrs callbacks list if needed
                                    // and attach the unload handler
                                    if ( !xhrCallbacks ) {
                                        xhrCallbacks = {};
                                        jQuery( window ).unload( xhrOnUnloadAbort );
                                    }
                                    // Add to list of active xhrs callbacks
                                    xhrCallbacks[ handle ] = callback;
                                }
                                xhr.onreadystatechange = callback;
                            }
                        },

                        abort: function() {
                            if ( callback ) {
                                callback(0,1);
                            }
                        }
                    };
                }
            });
        }




        var elemdisplay = {},
            iframe, iframeDoc,
            rfxtypes = /^(?:toggle|show|hide)$/,
            rfxnum = /^([+\-]=)?([\d+.\-]+)([a-z%]*)$/i,
            timerId,
            fxAttrs = [
                // height animations
                [ "height", "marginTop", "marginBottom", "paddingTop", "paddingBottom" ],
                // width animations
                [ "width", "marginLeft", "marginRight", "paddingLeft", "paddingRight" ],
                // opacity animations
                [ "opacity" ]
            ],
            fxNow;

        jQuery.fn.extend({
            show: function( speed, easing, callback ) {
                var elem, display;

                if ( speed || speed === 0 ) {
                    return this.animate( genFx("show", 3), speed, easing, callback );

                } else {
                    for ( var i = 0, j = this.length; i < j; i++ ) {
                        elem = this[ i ];

                        if ( elem.style ) {
                            display = elem.style.display;

                            // Reset the inline display of this element to learn if it is
                            // being hidden by cascaded rules or not
                            if ( !jQuery._data(elem, "olddisplay") && display === "none" ) {
                                display = elem.style.display = "";
                            }

                            // Set elements which have been overridden with display: none
                            // in a stylesheet to whatever the default browser style is
                            // for such an element
                            if ( display === "" && jQuery.css(elem, "display") === "none" ) {
                                jQuery._data( elem, "olddisplay", defaultDisplay(elem.nodeName) );
                            }
                        }
                    }

                    // Set the display of most of the elements in a second loop
                    // to avoid the constant reflow
                    for ( i = 0; i < j; i++ ) {
                        elem = this[ i ];

                        if ( elem.style ) {
                            display = elem.style.display;

                            if ( display === "" || display === "none" ) {
                                elem.style.display = jQuery._data( elem, "olddisplay" ) || "";
                            }
                        }
                    }

                    return this;
                }
            },

            hide: function( speed, easing, callback ) {
                if ( speed || speed === 0 ) {
                    return this.animate( genFx("hide", 3), speed, easing, callback);

                } else {
                    var elem, display,
                        i = 0,
                        j = this.length;

                    for ( ; i < j; i++ ) {
                        elem = this[i];
                        if ( elem.style ) {
                            display = jQuery.css( elem, "display" );

                            if ( display !== "none" && !jQuery._data( elem, "olddisplay" ) ) {
                                jQuery._data( elem, "olddisplay", display );
                            }
                        }
                    }

                    // Set the display of the elements in a second loop
                    // to avoid the constant reflow
                    for ( i = 0; i < j; i++ ) {
                        if ( this[i].style ) {
                            this[i].style.display = "none";
                        }
                    }

                    return this;
                }
            },

            // Save the old toggle function
            _toggle: jQuery.fn.toggle,

            toggle: function( fn, fn2, callback ) {
                var bool = typeof fn === "boolean";

                if ( jQuery.isFunction(fn) && jQuery.isFunction(fn2) ) {
                    this._toggle.apply( this, arguments );

                } else if ( fn == null || bool ) {
                    this.each(function() {
                        var state = bool ? fn : jQuery(this).is(":hidden");
                        jQuery(this)[ state ? "show" : "hide" ]();
                    });

                } else {
                    this.animate(genFx("toggle", 3), fn, fn2, callback);
                }

                return this;
            },

            fadeTo: function( speed, to, easing, callback ) {
                return this.filter(":hidden").css("opacity", 0).show().end()
                    .animate({opacity: to}, speed, easing, callback);
            },

            animate: function( prop, speed, easing, callback ) {
                var optall = jQuery.speed( speed, easing, callback );

                if ( jQuery.isEmptyObject( prop ) ) {
                    return this.each( optall.complete, [ false ] );
                }

                // Do not change referenced properties as per-property easing will be lost
                prop = jQuery.extend( {}, prop );

                function doAnimation() {
                    // XXX 'this' does not always have a nodeName when running the
                    // test suite

                    if ( optall.queue === false ) {
                        jQuery._mark( this );
                    }

                    var opt = jQuery.extend( {}, optall ),
                        isElement = this.nodeType === 1,
                        hidden = isElement && jQuery(this).is(":hidden"),
                        name, val, p, e,
                        parts, start, end, unit,
                        method;

                    // will store per property easing and be used to determine when an animation is complete
                    opt.animatedProperties = {};

                    for ( p in prop ) {

                        // property name normalization
                        name = jQuery.camelCase( p );
                        if ( p !== name ) {
                            prop[ name ] = prop[ p ];
                            delete prop[ p ];
                        }

                        val = prop[ name ];

                        // easing resolution: per property > opt.specialEasing > opt.easing > 'swing' (default)
                        if ( jQuery.isArray( val ) ) {
                            opt.animatedProperties[ name ] = val[ 1 ];
                            val = prop[ name ] = val[ 0 ];
                        } else {
                            opt.animatedProperties[ name ] = opt.specialEasing && opt.specialEasing[ name ] || opt.easing || 'swing';
                        }

                        if ( val === "hide" && hidden || val === "show" && !hidden ) {
                            return opt.complete.call( this );
                        }

                        if ( isElement && ( name === "height" || name === "width" ) ) {
                            // Make sure that nothing sneaks out
                            // Record all 3 overflow attributes because IE does not
                            // change the overflow attribute when overflowX and
                            // overflowY are set to the same value
                            opt.overflow = [ this.style.overflow, this.style.overflowX, this.style.overflowY ];

                            // Set display property to inline-block for height/width
                            // animations on inline elements that are having width/height animated
                            if ( jQuery.css( this, "display" ) === "inline" &&
                                jQuery.css( this, "float" ) === "none" ) {

                                // inline-level elements accept inline-block;
                                // block-level elements need to be inline with layout
                                if ( !jQuery.support.inlineBlockNeedsLayout || defaultDisplay( this.nodeName ) === "inline" ) {
                                    this.style.display = "inline-block";

                                } else {
                                    this.style.zoom = 1;
                                }
                            }
                        }
                    }

                    if ( opt.overflow != null ) {
                        this.style.overflow = "hidden";
                    }

                    for ( p in prop ) {
                        e = new jQuery.fx( this, opt, p );
                        val = prop[ p ];

                        if ( rfxtypes.test( val ) ) {

                            // Tracks whether to show or hide based on private
                            // data attached to the element
                            method = jQuery._data( this, "toggle" + p ) || ( val === "toggle" ? hidden ? "show" : "hide" : 0 );
                            if ( method ) {
                                jQuery._data( this, "toggle" + p, method === "show" ? "hide" : "show" );
                                e[ method ]();
                            } else {
                                e[ val ]();
                            }

                        } else {
                            parts = rfxnum.exec( val );
                            start = e.cur();

                            if ( parts ) {
                                end = parseFloat( parts[2] );
                                unit = parts[3] || ( jQuery.cssNumber[ p ] ? "" : "px" );

                                // We need to compute starting value
                                if ( unit !== "px" ) {
                                    jQuery.style( this, p, (end || 1) + unit);
                                    start = ( (end || 1) / e.cur() ) * start;
                                    jQuery.style( this, p, start + unit);
                                }

                                // If a +=/-= token was provided, we're doing a relative animation
                                if ( parts[1] ) {
                                    end = ( (parts[ 1 ] === "-=" ? -1 : 1) * end ) + start;
                                }

                                e.custom( start, end, unit );

                            } else {
                                e.custom( start, val, "" );
                            }
                        }
                    }

                    // For JS strict compliance
                    return true;
                }

                return optall.queue === false ?
                    this.each( doAnimation ) :
                    this.queue( optall.queue, doAnimation );
            },

            stop: function( type, clearQueue, gotoEnd ) {
                if ( typeof type !== "string" ) {
                    gotoEnd = clearQueue;
                    clearQueue = type;
                    type = undefined;
                }
                if ( clearQueue && type !== false ) {
                    this.queue( type || "fx", [] );
                }

                return this.each(function() {
                    var index,
                        hadTimers = false,
                        timers = jQuery.timers,
                        data = jQuery._data( this );

                    // clear marker counters if we know they won't be
                    if ( !gotoEnd ) {
                        jQuery._unmark( true, this );
                    }

                    function stopQueue( elem, data, index ) {
                        var hooks = data[ index ];
                        jQuery.removeData( elem, index, true );
                        hooks.stop( gotoEnd );
                    }

                    if ( type == null ) {
                        for ( index in data ) {
                            if ( data[ index ] && data[ index ].stop && index.indexOf(".run") === index.length - 4 ) {
                                stopQueue( this, data, index );
                            }
                        }
                    } else if ( data[ index = type + ".run" ] && data[ index ].stop ){
                        stopQueue( this, data, index );
                    }

                    for ( index = timers.length; index--; ) {
                        if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
                            if ( gotoEnd ) {

                                // force the next step to be the last
                                timers[ index ]( true );
                            } else {
                                timers[ index ].saveState();
                            }
                            hadTimers = true;
                            timers.splice( index, 1 );
                        }
                    }

                    // start the next in the queue if the last step wasn't forced
                    // timers currently will call their complete callbacks, which will dequeue
                    // but only if they were gotoEnd
                    if ( !( gotoEnd && hadTimers ) ) {
                        jQuery.dequeue( this, type );
                    }
                });
            }

        });

    // Animations created synchronously will run synchronously
        function createFxNow() {
            setTimeout( clearFxNow, 0 );
            return ( fxNow = jQuery.now() );
        }

        function clearFxNow() {
            fxNow = undefined;
        }

    // Generate parameters to create a standard animation
        function genFx( type, num ) {
            var obj = {};

            jQuery.each( fxAttrs.concat.apply([], fxAttrs.slice( 0, num )), function() {
                obj[ this ] = type;
            });

            return obj;
        }

    // Generate shortcuts for custom animations
        jQuery.each({
            slideDown: genFx( "show", 1 ),
            slideUp: genFx( "hide", 1 ),
            slideToggle: genFx( "toggle", 1 ),
            fadeIn: { opacity: "show" },
            fadeOut: { opacity: "hide" },
            fadeToggle: { opacity: "toggle" }
        }, function( name, props ) {
            jQuery.fn[ name ] = function( speed, easing, callback ) {
                return this.animate( props, speed, easing, callback );
            };
        });

        jQuery.extend({
            speed: function( speed, easing, fn ) {
                var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
                    complete: fn || !fn && easing ||
                        jQuery.isFunction( speed ) && speed,
                    duration: speed,
                    easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
                };

                opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
                    opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

                // normalize opt.queue - true/undefined/null -> "fx"
                if ( opt.queue == null || opt.queue === true ) {
                    opt.queue = "fx";
                }

                // Queueing
                opt.old = opt.complete;

                opt.complete = function( noUnmark ) {
                    if ( jQuery.isFunction( opt.old ) ) {
                        opt.old.call( this );
                    }

                    if ( opt.queue ) {
                        jQuery.dequeue( this, opt.queue );
                    } else if ( noUnmark !== false ) {
                        jQuery._unmark( this );
                    }
                };

                return opt;
            },

            easing: {
                linear: function( p, n, firstNum, diff ) {
                    return firstNum + diff * p;
                },
                swing: function( p, n, firstNum, diff ) {
                    return ( ( -Math.cos( p*Math.PI ) / 2 ) + 0.5 ) * diff + firstNum;
                }
            },

            timers: [],

            fx: function( elem, options, prop ) {
                this.options = options;
                this.elem = elem;
                this.prop = prop;

                options.orig = options.orig || {};
            }

        });

        jQuery.fx.prototype = {
            // Simple function for setting a style value
            update: function() {
                if ( this.options.step ) {
                    this.options.step.call( this.elem, this.now, this );
                }

                ( jQuery.fx.step[ this.prop ] || jQuery.fx.step._default )( this );
            },

            // Get the current size
            cur: function() {
                if ( this.elem[ this.prop ] != null && (!this.elem.style || this.elem.style[ this.prop ] == null) ) {
                    return this.elem[ this.prop ];
                }

                var parsed,
                    r = jQuery.css( this.elem, this.prop );
                // Empty strings, null, undefined and "auto" are converted to 0,
                // complex values such as "rotate(1rad)" are returned as is,
                // simple values such as "10px" are parsed to Float.
                return isNaN( parsed = parseFloat( r ) ) ? !r || r === "auto" ? 0 : r : parsed;
            },

            // Start an animation from one number to another
            custom: function( from, to, unit ) {
                var self = this,
                    fx = jQuery.fx;

                this.startTime = fxNow || createFxNow();
                this.end = to;
                this.now = this.start = from;
                this.pos = this.state = 0;
                this.unit = unit || this.unit || ( jQuery.cssNumber[ this.prop ] ? "" : "px" );

                function t( gotoEnd ) {
                    return self.step( gotoEnd );
                }

                t.queue = this.options.queue;
                t.elem = this.elem;
                t.saveState = function() {
                    if ( self.options.hide && jQuery._data( self.elem, "fxshow" + self.prop ) === undefined ) {
                        jQuery._data( self.elem, "fxshow" + self.prop, self.start );
                    }
                };

                if ( t() && jQuery.timers.push(t) && !timerId ) {
                    timerId = setInterval( fx.tick, fx.interval );
                }
            },

            // Simple 'show' function
            show: function() {
                var dataShow = jQuery._data( this.elem, "fxshow" + this.prop );

                // Remember where we started, so that we can go back to it later
                this.options.orig[ this.prop ] = dataShow || jQuery.style( this.elem, this.prop );
                this.options.show = true;

                // Begin the animation
                // Make sure that we start at a small width/height to avoid any flash of content
                if ( dataShow !== undefined ) {
                    // This show is picking up where a previous hide or show left off
                    this.custom( this.cur(), dataShow );
                } else {
                    this.custom( this.prop === "width" || this.prop === "height" ? 1 : 0, this.cur() );
                }

                // Start by showing the element
                jQuery( this.elem ).show();
            },

            // Simple 'hide' function
            hide: function() {
                // Remember where we started, so that we can go back to it later
                this.options.orig[ this.prop ] = jQuery._data( this.elem, "fxshow" + this.prop ) || jQuery.style( this.elem, this.prop );
                this.options.hide = true;

                // Begin the animation
                this.custom( this.cur(), 0 );
            },

            // Each step of an animation
            step: function( gotoEnd ) {
                var p, n, complete,
                    t = fxNow || createFxNow(),
                    done = true,
                    elem = this.elem,
                    options = this.options;

                if ( gotoEnd || t >= options.duration + this.startTime ) {
                    this.now = this.end;
                    this.pos = this.state = 1;
                    this.update();

                    options.animatedProperties[ this.prop ] = true;

                    for ( p in options.animatedProperties ) {
                        if ( options.animatedProperties[ p ] !== true ) {
                            done = false;
                        }
                    }

                    if ( done ) {
                        // Reset the overflow
                        if ( options.overflow != null && !jQuery.support.shrinkWrapBlocks ) {

                            jQuery.each( [ "", "X", "Y" ], function( index, value ) {
                                elem.style[ "overflow" + value ] = options.overflow[ index ];
                            });
                        }

                        // Hide the element if the "hide" operation was done
                        if ( options.hide ) {
                            jQuery( elem ).hide();
                        }

                        // Reset the properties, if the item has been hidden or shown
                        if ( options.hide || options.show ) {
                            for ( p in options.animatedProperties ) {
                                jQuery.style( elem, p, options.orig[ p ] );
                                jQuery.removeData( elem, "fxshow" + p, true );
                                // Toggle data is no longer needed
                                jQuery.removeData( elem, "toggle" + p, true );
                            }
                        }

                        // Execute the complete function
                        // in the event that the complete function throws an exception
                        // we must ensure it won't be called twice. #5684

                        complete = options.complete;
                        if ( complete ) {

                            options.complete = false;
                            complete.call( elem );
                        }
                    }

                    return false;

                } else {
                    // classical easing cannot be used with an Infinity duration
                    if ( options.duration == Infinity ) {
                        this.now = t;
                    } else {
                        n = t - this.startTime;
                        this.state = n / options.duration;

                        // Perform the easing function, defaults to swing
                        this.pos = jQuery.easing[ options.animatedProperties[this.prop] ]( this.state, n, 0, 1, options.duration );
                        this.now = this.start + ( (this.end - this.start) * this.pos );
                    }
                    // Perform the next step of the animation
                    this.update();
                }

                return true;
            }
        };

        jQuery.extend( jQuery.fx, {
            tick: function() {
                var timer,
                    timers = jQuery.timers,
                    i = 0;

                for ( ; i < timers.length; i++ ) {
                    timer = timers[ i ];
                    // Checks the timer has not already been removed
                    if ( !timer() && timers[ i ] === timer ) {
                        timers.splice( i--, 1 );
                    }
                }

                if ( !timers.length ) {
                    jQuery.fx.stop();
                }
            },

            interval: 13,

            stop: function() {
                clearInterval( timerId );
                timerId = null;
            },

            speeds: {
                slow: 600,
                fast: 200,
                // Default speed
                _default: 400
            },

            step: {
                opacity: function( fx ) {
                    jQuery.style( fx.elem, "opacity", fx.now );
                },

                _default: function( fx ) {
                    if ( fx.elem.style && fx.elem.style[ fx.prop ] != null ) {
                        fx.elem.style[ fx.prop ] = fx.now + fx.unit;
                    } else {
                        fx.elem[ fx.prop ] = fx.now;
                    }
                }
            }
        });

    // Adds width/height step functions
    // Do not set anything below 0
        jQuery.each([ "width", "height" ], function( i, prop ) {
            jQuery.fx.step[ prop ] = function( fx ) {
                jQuery.style( fx.elem, prop, Math.max(0, fx.now) + fx.unit );
            };
        });

        if ( jQuery.expr && jQuery.expr.filters ) {
            jQuery.expr.filters.animated = function( elem ) {
                return jQuery.grep(jQuery.timers, function( fn ) {
                    return elem === fn.elem;
                }).length;
            };
        }

    // Try to restore the default display value of an element
        function defaultDisplay( nodeName ) {

            if ( !elemdisplay[ nodeName ] ) {

                var body = document.body,
                    elem = jQuery( "<" + nodeName + ">" ).appendTo( body ),
                    display = elem.css( "display" );
                elem.remove();

                // If the simple way fails,
                // get element's real default display by attaching it to a temp iframe
                if ( display === "none" || display === "" ) {
                    // No iframe to use yet, so create it
                    if ( !iframe ) {
                        iframe = document.createElement( "iframe" );
                        iframe.frameBorder = iframe.width = iframe.height = 0;
                    }

                    body.appendChild( iframe );

                    // Create a cacheable copy of the iframe document on first call.
                    // IE and Opera will allow us to reuse the iframeDoc without re-writing the fake HTML
                    // document to it; WebKit & Firefox won't allow reusing the iframe document.
                    if ( !iframeDoc || !iframe.createElement ) {
                        iframeDoc = ( iframe.contentWindow || iframe.contentDocument ).document;
                        iframeDoc.write( ( document.compatMode === "CSS1Compat" ? "<!doctype html>" : "" ) + "<html><body>" );
                        iframeDoc.close();
                    }

                    elem = iframeDoc.createElement( nodeName );

                    iframeDoc.body.appendChild( elem );

                    display = jQuery.css( elem, "display" );
                    body.removeChild( iframe );
                }

                // Store the correct default display
                elemdisplay[ nodeName ] = display;
            }

            return elemdisplay[ nodeName ];
        }




        var rtable = /^t(?:able|d|h)$/i,
            rroot = /^(?:body|html)$/i;

        if ( "getBoundingClientRect" in document.documentElement ) {
            jQuery.fn.offset = function( options ) {
                var elem = this[0], box;

                if ( options ) {
                    return this.each(function( i ) {
                        jQuery.offset.setOffset( this, options, i );
                    });
                }

                if ( !elem || !elem.ownerDocument ) {
                    return null;
                }

                if ( elem === elem.ownerDocument.body ) {
                    return jQuery.offset.bodyOffset( elem );
                }

                try {
                    box = elem.getBoundingClientRect();
                } catch(e) {}

                var doc = elem.ownerDocument,
                    docElem = doc.documentElement;

                // Make sure we're not dealing with a disconnected DOM node
                if ( !box || !jQuery.contains( docElem, elem ) ) {
                    return box ? { top: box.top, left: box.left } : { top: 0, left: 0 };
                }

                var body = doc.body,
                    win = getWindow(doc),
                    clientTop  = docElem.clientTop  || body.clientTop  || 0,
                    clientLeft = docElem.clientLeft || body.clientLeft || 0,
                    scrollTop  = win.pageYOffset || jQuery.support.boxModel && docElem.scrollTop  || body.scrollTop,
                    scrollLeft = win.pageXOffset || jQuery.support.boxModel && docElem.scrollLeft || body.scrollLeft,
                    top  = box.top  + scrollTop  - clientTop,
                    left = box.left + scrollLeft - clientLeft;

                return { top: top, left: left };
            };

        } else {
            jQuery.fn.offset = function( options ) {
                var elem = this[0];

                if ( options ) {
                    return this.each(function( i ) {
                        jQuery.offset.setOffset( this, options, i );
                    });
                }

                if ( !elem || !elem.ownerDocument ) {
                    return null;
                }

                if ( elem === elem.ownerDocument.body ) {
                    return jQuery.offset.bodyOffset( elem );
                }

                var computedStyle,
                    offsetParent = elem.offsetParent,
                    prevOffsetParent = elem,
                    doc = elem.ownerDocument,
                    docElem = doc.documentElement,
                    body = doc.body,
                    defaultView = doc.defaultView,
                    prevComputedStyle = defaultView ? defaultView.getComputedStyle( elem, null ) : elem.currentStyle,
                    top = elem.offsetTop,
                    left = elem.offsetLeft;

                while ( (elem = elem.parentNode) && elem !== body && elem !== docElem ) {
                    if ( jQuery.support.fixedPosition && prevComputedStyle.position === "fixed" ) {
                        break;
                    }

                    computedStyle = defaultView ? defaultView.getComputedStyle(elem, null) : elem.currentStyle;
                    top  -= elem.scrollTop;
                    left -= elem.scrollLeft;

                    if ( elem === offsetParent ) {
                        top  += elem.offsetTop;
                        left += elem.offsetLeft;

                        if ( jQuery.support.doesNotAddBorder && !(jQuery.support.doesAddBorderForTableAndCells && rtable.test(elem.nodeName)) ) {
                            top  += parseFloat( computedStyle.borderTopWidth  ) || 0;
                            left += parseFloat( computedStyle.borderLeftWidth ) || 0;
                        }

                        prevOffsetParent = offsetParent;
                        offsetParent = elem.offsetParent;
                    }

                    if ( jQuery.support.subtractsBorderForOverflowNotVisible && computedStyle.overflow !== "visible" ) {
                        top  += parseFloat( computedStyle.borderTopWidth  ) || 0;
                        left += parseFloat( computedStyle.borderLeftWidth ) || 0;
                    }

                    prevComputedStyle = computedStyle;
                }

                if ( prevComputedStyle.position === "relative" || prevComputedStyle.position === "static" ) {
                    top  += body.offsetTop;
                    left += body.offsetLeft;
                }

                if ( jQuery.support.fixedPosition && prevComputedStyle.position === "fixed" ) {
                    top  += Math.max( docElem.scrollTop, body.scrollTop );
                    left += Math.max( docElem.scrollLeft, body.scrollLeft );
                }

                return { top: top, left: left };
            };
        }

        jQuery.offset = {

            bodyOffset: function( body ) {
                var top = body.offsetTop,
                    left = body.offsetLeft;

                if ( jQuery.support.doesNotIncludeMarginInBodyOffset ) {
                    top  += parseFloat( jQuery.css(body, "marginTop") ) || 0;
                    left += parseFloat( jQuery.css(body, "marginLeft") ) || 0;
                }

                return { top: top, left: left };
            },

            setOffset: function( elem, options, i ) {
                var position = jQuery.css( elem, "position" );

                // set position first, in-case top/left are set even on static elem
                if ( position === "static" ) {
                    elem.style.position = "relative";
                }

                var curElem = jQuery( elem ),
                    curOffset = curElem.offset(),
                    curCSSTop = jQuery.css( elem, "top" ),
                    curCSSLeft = jQuery.css( elem, "left" ),
                    calculatePosition = ( position === "absolute" || position === "fixed" ) && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
                    props = {}, curPosition = {}, curTop, curLeft;

                // need to be able to calculate position if either top or left is auto and position is either absolute or fixed
                if ( calculatePosition ) {
                    curPosition = curElem.position();
                    curTop = curPosition.top;
                    curLeft = curPosition.left;
                } else {
                    curTop = parseFloat( curCSSTop ) || 0;
                    curLeft = parseFloat( curCSSLeft ) || 0;
                }

                if ( jQuery.isFunction( options ) ) {
                    options = options.call( elem, i, curOffset );
                }

                if ( options.top != null ) {
                    props.top = ( options.top - curOffset.top ) + curTop;
                }
                if ( options.left != null ) {
                    props.left = ( options.left - curOffset.left ) + curLeft;
                }

                if ( "using" in options ) {
                    options.using.call( elem, props );
                } else {
                    curElem.css( props );
                }
            }
        };


        jQuery.fn.extend({

            position: function() {
                if ( !this[0] ) {
                    return null;
                }

                var elem = this[0],

                // Get *real* offsetParent
                    offsetParent = this.offsetParent(),

                // Get correct offsets
                    offset       = this.offset(),
                    parentOffset = rroot.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset();

                // Subtract element margins
                // note: when an element has margin: auto the offsetLeft and marginLeft
                // are the same in Safari causing offset.left to incorrectly be 0
                offset.top  -= parseFloat( jQuery.css(elem, "marginTop") ) || 0;
                offset.left -= parseFloat( jQuery.css(elem, "marginLeft") ) || 0;

                // Add offsetParent borders
                parentOffset.top  += parseFloat( jQuery.css(offsetParent[0], "borderTopWidth") ) || 0;
                parentOffset.left += parseFloat( jQuery.css(offsetParent[0], "borderLeftWidth") ) || 0;

                // Subtract the two offsets
                return {
                    top:  offset.top  - parentOffset.top,
                    left: offset.left - parentOffset.left
                };
            },

            offsetParent: function() {
                return this.map(function() {
                    var offsetParent = this.offsetParent || document.body;
                    while ( offsetParent && (!rroot.test(offsetParent.nodeName) && jQuery.css(offsetParent, "position") === "static") ) {
                        offsetParent = offsetParent.offsetParent;
                    }
                    return offsetParent;
                });
            }
        });


    // Create scrollLeft and scrollTop methods
        jQuery.each( ["Left", "Top"], function( i, name ) {
            var method = "scroll" + name;

            jQuery.fn[ method ] = function( val ) {
                var elem, win;

                if ( val === undefined ) {
                    elem = this[ 0 ];

                    if ( !elem ) {
                        return null;
                    }

                    win = getWindow( elem );

                    // Return the scroll offset
                    return win ? ("pageXOffset" in win) ? win[ i ? "pageYOffset" : "pageXOffset" ] :
                        jQuery.support.boxModel && win.document.documentElement[ method ] ||
                            win.document.body[ method ] :
                        elem[ method ];
                }

                // Set the scroll offset
                return this.each(function() {
                    win = getWindow( this );

                    if ( win ) {
                        win.scrollTo(
                            !i ? val : jQuery( win ).scrollLeft(),
                            i ? val : jQuery( win ).scrollTop()
                        );

                    } else {
                        this[ method ] = val;
                    }
                });
            };
        });

        function getWindow( elem ) {
            return jQuery.isWindow( elem ) ?
                elem :
                elem.nodeType === 9 ?
                    elem.defaultView || elem.parentWindow :
                    false;
        }




    // Create width, height, innerHeight, innerWidth, outerHeight and outerWidth methods
        jQuery.each([ "Height", "Width" ], function( i, name ) {

            var type = name.toLowerCase();

            // innerHeight and innerWidth
            jQuery.fn[ "inner" + name ] = function() {
                var elem = this[0];
                return elem ?
                    elem.style ?
                        parseFloat( jQuery.css( elem, type, "padding" ) ) :
                        this[ type ]() :
                    null;
            };

            // outerHeight and outerWidth
            jQuery.fn[ "outer" + name ] = function( margin ) {
                var elem = this[0];
                return elem ?
                    elem.style ?
                        parseFloat( jQuery.css( elem, type, margin ? "margin" : "border" ) ) :
                        this[ type ]() :
                    null;
            };

            jQuery.fn[ type ] = function( size ) {
                // Get window width or height
                var elem = this[0];
                if ( !elem ) {
                    return size == null ? null : this;
                }

                if ( jQuery.isFunction( size ) ) {
                    return this.each(function( i ) {
                        var self = jQuery( this );
                        self[ type ]( size.call( this, i, self[ type ]() ) );
                    });
                }

                if ( jQuery.isWindow( elem ) ) {
                    // Everyone else use document.documentElement or document.body depending on Quirks vs Standards mode
                    // 3rd condition allows Nokia support, as it supports the docElem prop but not CSS1Compat
                    var docElemProp = elem.document.documentElement[ "client" + name ],
                        body = elem.document.body;
                    return elem.document.compatMode === "CSS1Compat" && docElemProp ||
                        body && body[ "client" + name ] || docElemProp;

                    // Get document width or height
                } else if ( elem.nodeType === 9 ) {
                    // Either scroll[Width/Height] or offset[Width/Height], whichever is greater
                    return Math.max(
                        elem.documentElement["client" + name],
                        elem.body["scroll" + name], elem.documentElement["scroll" + name],
                        elem.body["offset" + name], elem.documentElement["offset" + name]
                    );

                    // Get or set width or height on the element
                } else if ( size === undefined ) {
                    var orig = jQuery.css( elem, type ),
                        ret = parseFloat( orig );

                    return jQuery.isNumeric( ret ) ? ret : orig;

                    // Set the width or height on the element (default to pixels if value is unitless)
                } else {
                    return this.css( type, typeof size === "string" ? size : size + "px" );
                }
            };

        });

        // Expose jQuery to the global object
        //window.jQuery = window.$ = jQuery;
        return jQuery;
    };

    return initJquery(window);
});
/*! Socket.IO.js build:0.9.11, development. Copyright(c) 2011 LearnBoost <dev@learnboost.com> MIT Licensed */

//var io = ('undefined' === typeof module ? {} : module.exports);
(function() {

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * IO namespace.
   *
   * @namespace
   */

  var io = exports;

  /**
   * Socket.IO version
   *
   * @api public
   */

  io.version = '0.9.11';

  /**
   * Protocol implemented.
   *
   * @api public
   */

  io.protocol = 1;

  /**
   * Available transports, these will be populated with the available transports
   *
   * @api public
   */

  io.transports = [];

  /**
   * Keep track of jsonp callbacks.
   *
   * @api private
   */

  io.j = [];

  /**
   * Keep track of our io.Sockets
   *
   * @api private
   */
  io.sockets = {};


  /**
   * Manages connections to hosts.
   *
   * @param {String} uri
   * @Param {Boolean} force creation of new socket (defaults to false)
   * @api public
   */

  io.connect = function (host, details) {
    var uri = io.util.parseUri(host)
      , uuri
      , socket;

    if (global && global.location) {
      uri.protocol = uri.protocol || global.location.protocol.slice(0, -1);
      uri.host = uri.host || (global.document
        ? global.document.domain : global.location.hostname);
      uri.port = uri.port || global.location.port;
    }

    uuri = io.util.uniqueUri(uri);

    var options = {
        host: uri.host
      , secure: 'https' == uri.protocol
      , port: uri.port || ('https' == uri.protocol ? 443 : 80)
      , query: uri.query || ''
    };

    io.util.merge(options, details);

    if (options['force new connection'] || !io.sockets[uuri]) {
      socket = new io.Socket(options);
    }

    if (!options['force new connection'] && socket) {
      io.sockets[uuri] = socket;
    }

    socket = socket || io.sockets[uuri];

    // if path is different from '' or /
    return socket.of(uri.path.length > 1 ? uri.path : '');
  };

})('object' === typeof module ? module.exports : io, this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * Utilities namespace.
   *
   * @namespace
   */

  var util = exports.util = {};

  /**
   * Parses an URI
   *
   * @author Steven Levithan <stevenlevithan.com> (MIT license)
   * @api public
   */

  var re = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

  var parts = ['source', 'protocol', 'authority', 'userInfo', 'user', 'password',
               'host', 'port', 'relative', 'path', 'directory', 'file', 'query',
               'anchor'];

  util.parseUri = function (str) {
    var m = re.exec(str || '')
      , uri = {}
      , i = 14;

    while (i--) {
      uri[parts[i]] = m[i] || '';
    }

    return uri;
  };

  /**
   * Produces a unique url that identifies a Socket.IO connection.
   *
   * @param {Object} uri
   * @api public
   */

  util.uniqueUri = function (uri) {
    var protocol = uri.protocol
      , host = uri.host
      , port = uri.port;

    if ('document' in global) {
      host = host || document.domain;
      port = port || (protocol == 'https'
        && document.location.protocol !== 'https:' ? 443 : document.location.port);
    } else {
      host = host || 'localhost';

      if (!port && protocol == 'https') {
        port = 443;
      }
    }

    return (protocol || 'http') + '://' + host + ':' + (port || 80);
  };

  /**
   * Mergest 2 query strings in to once unique query string
   *
   * @param {String} base
   * @param {String} addition
   * @api public
   */

  util.query = function (base, addition) {
    var query = util.chunkQuery(base || '')
      , components = [];

    util.merge(query, util.chunkQuery(addition || ''));
    for (var part in query) {
      if (query.hasOwnProperty(part)) {
        components.push(part + '=' + query[part]);
      }
    }

    return components.length ? '?' + components.join('&') : '';
  };

  /**
   * Transforms a querystring in to an object
   *
   * @param {String} qs
   * @api public
   */

  util.chunkQuery = function (qs) {
    var query = {}
      , params = qs.split('&')
      , i = 0
      , l = params.length
      , kv;

    for (; i < l; ++i) {
      kv = params[i].split('=');
      if (kv[0]) {
        query[kv[0]] = kv[1];
      }
    }

    return query;
  };

  /**
   * Executes the given function when the page is loaded.
   *
   *     io.util.load(function () { console.log('page loaded'); });
   *
   * @param {Function} fn
   * @api public
   */

  var pageLoaded = false;

  util.load = function (fn) {
    if ('document' in global && document.readyState === 'complete' || pageLoaded) {
      return fn();
    }

    util.on(global, 'load', fn, false);
  };

  /**
   * Adds an event.
   *
   * @api private
   */

  util.on = function (element, event, fn, capture) {
    if (element.attachEvent) {
      element.attachEvent('on' + event, fn);
    } else if (element.addEventListener) {
      element.addEventListener(event, fn, capture);
    }
  };

  /**
   * Generates the correct `XMLHttpRequest` for regular and cross domain requests.
   *
   * @param {Boolean} [xdomain] Create a request that can be used cross domain.
   * @returns {XMLHttpRequest|false} If we can create a XMLHttpRequest.
   * @api private
   */

  util.request = function (xdomain) {

    if (xdomain && 'undefined' != typeof XDomainRequest && !util.ua.hasCORS) {
      return new XDomainRequest();
    }

    if ('undefined' != typeof XMLHttpRequest && (!xdomain || util.ua.hasCORS)) {
      return new XMLHttpRequest();
    }

    if (!xdomain) {
      try {
        return new window[(['Active'].concat('Object').join('X'))]('Microsoft.XMLHTTP');
      } catch(e) { }
    }

    return null;
  };

  /**
   * XHR based transport constructor.
   *
   * @constructor
   * @api public
   */

  /**
   * Change the internal pageLoaded value.
   */

  if ('undefined' != typeof window) {
    util.load(function () {
      pageLoaded = true;
    });
  }

  /**
   * Defers a function to ensure a spinner is not displayed by the browser
   *
   * @param {Function} fn
   * @api public
   */

  util.defer = function (fn) {
    if (!util.ua.webkit || 'undefined' != typeof importScripts) {
      return fn();
    }

    util.load(function () {
      setTimeout(fn, 100);
    });
  };

  /**
   * Merges two objects.
   *
   * @api public
   */

  util.merge = function merge (target, additional, deep, lastseen) {
    var seen = lastseen || []
      , depth = typeof deep == 'undefined' ? 2 : deep
      , prop;

    for (prop in additional) {
      if (additional.hasOwnProperty(prop) && util.indexOf(seen, prop) < 0) {
        if (typeof target[prop] !== 'object' || !depth) {
          target[prop] = additional[prop];
          seen.push(additional[prop]);
        } else {
          util.merge(target[prop], additional[prop], depth - 1, seen);
        }
      }
    }

    return target;
  };

  /**
   * Merges prototypes from objects
   *
   * @api public
   */

  util.mixin = function (ctor, ctor2) {
    util.merge(ctor.prototype, ctor2.prototype);
  };

  /**
   * Shortcut for prototypical and static inheritance.
   *
   * @api private
   */

  util.inherit = function (ctor, ctor2) {
    function f() {};
    f.prototype = ctor2.prototype;
    ctor.prototype = new f;
  };

  /**
   * Checks if the given object is an Array.
   *
   *     io.util.isArray([]); // true
   *     io.util.isArray({}); // false
   *
   * @param Object obj
   * @api public
   */

  util.isArray = Array.isArray || function (obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  /**
   * Intersects values of two arrays into a third
   *
   * @api public
   */

  util.intersect = function (arr, arr2) {
    var ret = []
      , longest = arr.length > arr2.length ? arr : arr2
      , shortest = arr.length > arr2.length ? arr2 : arr;

    for (var i = 0, l = shortest.length; i < l; i++) {
      if (~util.indexOf(longest, shortest[i]))
        ret.push(shortest[i]);
    }

    return ret;
  };

  /**
   * Array indexOf compatibility.
   *
   * @see bit.ly/a5Dxa2
   * @api public
   */

  util.indexOf = function (arr, o, i) {

    for (var j = arr.length, i = i < 0 ? i + j < 0 ? 0 : i + j : i || 0;
         i < j && arr[i] !== o; i++) {}

    return j <= i ? -1 : i;
  };

  /**
   * Converts enumerables to array.
   *
   * @api public
   */

  util.toArray = function (enu) {
    var arr = [];

    for (var i = 0, l = enu.length; i < l; i++)
      arr.push(enu[i]);

    return arr;
  };

  /**
   * UA / engines detection namespace.
   *
   * @namespace
   */

  util.ua = {};

  /**
   * Whether the UA supports CORS for XHR.
   *
   * @api public
   */

  util.ua.hasCORS = 'undefined' != typeof XMLHttpRequest && (function () {
    try {
      var a = new XMLHttpRequest();
    } catch (e) {
      return false;
    }

    return a.withCredentials != undefined;
  })();

  /**
   * Detect webkit.
   *
   * @api public
   */

  util.ua.webkit = 'undefined' != typeof navigator
    && /webkit/i.test(navigator.userAgent);

   /**
   * Detect iPad/iPhone/iPod.
   *
   * @api public
   */

  util.ua.iDevice = 'undefined' != typeof navigator
      && /iPad|iPhone|iPod/i.test(navigator.userAgent);

})('undefined' != typeof io ? io : module.exports, this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.EventEmitter = EventEmitter;

  /**
   * Event emitter constructor.
   *
   * @api public.
   */

  function EventEmitter () {};

  /**
   * Adds a listener
   *
   * @api public
   */

  EventEmitter.prototype.on = function (name, fn) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = fn;
    } else if (io.util.isArray(this.$events[name])) {
      this.$events[name].push(fn);
    } else {
      this.$events[name] = [this.$events[name], fn];
    }

    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  /**
   * Adds a volatile listener.
   *
   * @api public
   */

  EventEmitter.prototype.once = function (name, fn) {
    var self = this;

    function on () {
      self.removeListener(name, on);
      fn.apply(this, arguments);
    };

    on.listener = fn;
    this.on(name, on);

    return this;
  };

  /**
   * Removes a listener.
   *
   * @api public
   */

  EventEmitter.prototype.removeListener = function (name, fn) {
    if (this.$events && this.$events[name]) {
      var list = this.$events[name];

      if (io.util.isArray(list)) {
        var pos = -1;

        for (var i = 0, l = list.length; i < l; i++) {
          if (list[i] === fn || (list[i].listener && list[i].listener === fn)) {
            pos = i;
            break;
          }
        }

        if (pos < 0) {
          return this;
        }

        list.splice(pos, 1);

        if (!list.length) {
          delete this.$events[name];
        }
      } else if (list === fn || (list.listener && list.listener === fn)) {
        delete this.$events[name];
      }
    }

    return this;
  };

  /**
   * Removes all listeners for an event.
   *
   * @api public
   */

  EventEmitter.prototype.removeAllListeners = function (name) {
    if (name === undefined) {
      this.$events = {};
      return this;
    }

    if (this.$events && this.$events[name]) {
      this.$events[name] = null;
    }

    return this;
  };

  /**
   * Gets all listeners for a certain event.
   *
   * @api publci
   */

  EventEmitter.prototype.listeners = function (name) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = [];
    }

    if (!io.util.isArray(this.$events[name])) {
      this.$events[name] = [this.$events[name]];
    }

    return this.$events[name];
  };

  /**
   * Emits an event.
   *
   * @api public
   */

  EventEmitter.prototype.emit = function (name) {
    if (!this.$events) {
      return false;
    }

    var handler = this.$events[name];

    if (!handler) {
      return false;
    }

    var args = Array.prototype.slice.call(arguments, 1);

    if ('function' == typeof handler) {
      handler.apply(this, args);
    } else if (io.util.isArray(handler)) {
      var listeners = handler.slice();

      for (var i = 0, l = listeners.length; i < l; i++) {
        listeners[i].apply(this, args);
      }
    } else {
      return false;
    }

    return true;
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Based on JSON2 (http://www.JSON.org/js.html).
 */

(function (exports, nativeJSON) {
  

  // use native JSON if it's available
  if (nativeJSON && nativeJSON.parse){
    return exports.JSON = {
      parse: nativeJSON.parse
    , stringify: nativeJSON.stringify
    };
  }

  var JSON = exports.JSON = {};

  function f(n) {
      // Format integers to have at least two digits.
      return n < 10 ? '0' + n : n;
  }

  function date(d, key) {
    return isFinite(d.valueOf()) ?
        d.getUTCFullYear()     + '-' +
        f(d.getUTCMonth() + 1) + '-' +
        f(d.getUTCDate())      + 'T' +
        f(d.getUTCHours())     + ':' +
        f(d.getUTCMinutes())   + ':' +
        f(d.getUTCSeconds())   + 'Z' : null;
  };

  var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      gap,
      indent,
      meta = {    // table of character substitutions
          '\b': '\\b',
          '\t': '\\t',
          '\n': '\\n',
          '\f': '\\f',
          '\r': '\\r',
          '"' : '\\"',
          '\\': '\\\\'
      },
      rep;


  function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

      escapable.lastIndex = 0;
      return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
          var c = meta[a];
          return typeof c === 'string' ? c :
              '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      }) + '"' : '"' + string + '"';
  }


  function str(key, holder) {

// Produce a string from holder[key].

      var i,          // The loop counter.
          k,          // The member key.
          v,          // The member value.
          length,
          mind = gap,
          partial,
          value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

      if (value instanceof Date) {
          value = date(key);
      }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

      if (typeof rep === 'function') {
          value = rep.call(holder, key, value);
      }

// What happens next depends on the value's type.

      switch (typeof value) {
      case 'string':
          return quote(value);

      case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

          return isFinite(value) ? String(value) : 'null';

      case 'boolean':
      case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

          return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

      case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

          if (!value) {
              return 'null';
          }

// Make an array to hold the partial results of stringifying this object value.

          gap += indent;
          partial = [];

// Is the value an array?

          if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

              length = value.length;
              for (i = 0; i < length; i += 1) {
                  partial[i] = str(i, value) || 'null';
              }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

              v = partial.length === 0 ? '[]' : gap ?
                  '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' :
                  '[' + partial.join(',') + ']';
              gap = mind;
              return v;
          }

// If the replacer is an array, use it to select the members to be stringified.

          if (rep && typeof rep === 'object') {
              length = rep.length;
              for (i = 0; i < length; i += 1) {
                  if (typeof rep[i] === 'string') {
                      k = rep[i];
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          } else {

// Otherwise, iterate through all of the keys in the object.

              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

          v = partial.length === 0 ? '{}' : gap ?
              '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' :
              '{' + partial.join(',') + '}';
          gap = mind;
          return v;
      }
  }

// If the JSON object does not yet have a stringify method, give it one.

  JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

      var i;
      gap = '';
      indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

      if (typeof space === 'number') {
          for (i = 0; i < space; i += 1) {
              indent += ' ';
          }

// If the space parameter is a string, it will be used as the indent string.

      } else if (typeof space === 'string') {
          indent = space;
      }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

      rep = replacer;
      if (replacer && typeof replacer !== 'function' &&
              (typeof replacer !== 'object' ||
              typeof replacer.length !== 'number')) {
          throw new Error('JSON.stringify');
      }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

      return str('', {'': value});
  };

// If the JSON object does not yet have a parse method, give it one.

  JSON.parse = function (text, reviver) {
  // The parse method takes a text and an optional reviver function, and returns
  // a JavaScript value if the text is a valid JSON text.

      var j;

      function walk(holder, key) {

  // The walk method is used to recursively walk the resulting structure so
  // that modifications can be made.

          var k, v, value = holder[key];
          if (value && typeof value === 'object') {
              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = walk(value, k);
                      if (v !== undefined) {
                          value[k] = v;
                      } else {
                          delete value[k];
                      }
                  }
              }
          }
          return reviver.call(holder, key, value);
      }


  // Parsing happens in four stages. In the first stage, we replace certain
  // Unicode characters with escape sequences. JavaScript handles many characters
  // incorrectly, either silently deleting them, or treating them as line endings.

      text = String(text);
      cx.lastIndex = 0;
      if (cx.test(text)) {
          text = text.replace(cx, function (a) {
              return '\\u' +
                  ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
          });
      }

  // In the second stage, we run the text against regular expressions that look
  // for non-JSON patterns. We are especially concerned with '()' and 'new'
  // because they can cause invocation, and '=' because it can cause mutation.
  // But just to be safe, we want to reject all unexpected forms.

  // We split the second stage into 4 regexp operations in order to work around
  // crippling inefficiencies in IE's and Safari's regexp engines. First we
  // replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
  // replace all simple value tokens with ']' characters. Third, we delete all
  // open brackets that follow a colon or comma or that begin the text. Finally,
  // we look to see that the remaining characters are only whitespace or ']' or
  // ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

      if (/^[\],:{}\s]*$/
              .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                  .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                  .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

  // In the third stage we use the eval function to compile the text into a
  // JavaScript structure. The '{' operator is subject to a syntactic ambiguity
  // in JavaScript: it can begin a block or an object literal. We wrap the text
  // in parens to eliminate the ambiguity.

          j = eval('(' + text + ')');

  // In the optional fourth stage, we recursively walk the new structure, passing
  // each name/value pair to a reviver function for possible transformation.

          return typeof reviver === 'function' ?
              walk({'': j}, '') : j;
      }

  // If the text is not JSON parseable, then a SyntaxError is thrown.

      throw new SyntaxError('JSON.parse');
  };

})(
    'undefined' != typeof io ? io : module.exports
  , typeof JSON !== 'undefined' ? JSON : undefined
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Parser namespace.
   *
   * @namespace
   */

  var parser = exports.parser = {};

  /**
   * Packet types.
   */

  var packets = parser.packets = [
      'disconnect'
    , 'connect'
    , 'heartbeat'
    , 'message'
    , 'json'
    , 'event'
    , 'ack'
    , 'error'
    , 'noop'
  ];

  /**
   * Errors reasons.
   */

  var reasons = parser.reasons = [
      'transport not supported'
    , 'client not handshaken'
    , 'unauthorized'
  ];

  /**
   * Errors advice.
   */

  var advice = parser.advice = [
      'reconnect'
  ];

  /**
   * Shortcuts.
   */

  var JSON = io.JSON
    , indexOf = io.util.indexOf;

  /**
   * Encodes a packet.
   *
   * @api private
   */

  parser.encodePacket = function (packet) {
    var type = indexOf(packets, packet.type)
      , id = packet.id || ''
      , endpoint = packet.endpoint || ''
      , ack = packet.ack
      , data = null;

    switch (packet.type) {
      case 'error':
        var reason = packet.reason ? indexOf(reasons, packet.reason) : ''
          , adv = packet.advice ? indexOf(advice, packet.advice) : '';

        if (reason !== '' || adv !== '')
          data = reason + (adv !== '' ? ('+' + adv) : '');

        break;

      case 'message':
        if (packet.data !== '')
          data = packet.data;
        break;

      case 'event':
        var ev = { name: packet.name };

        if (packet.args && packet.args.length) {
          ev.args = packet.args;
        }

        data = JSON.stringify(ev);
        break;

      case 'json':
        data = JSON.stringify(packet.data);
        break;

      case 'connect':
        if (packet.qs)
          data = packet.qs;
        break;

      case 'ack':
        data = packet.ackId
          + (packet.args && packet.args.length
              ? '+' + JSON.stringify(packet.args) : '');
        break;
    }

    // construct packet with required fragments
    var encoded = [
        type
      , id + (ack == 'data' ? '+' : '')
      , endpoint
    ];

    // data fragment is optional
    if (data !== null && data !== undefined)
      encoded.push(data);

    return encoded.join(':');
  };

  /**
   * Encodes multiple messages (payload).
   *
   * @param {Array} messages
   * @api private
   */

  parser.encodePayload = function (packets) {
    var decoded = '';

    if (packets.length == 1)
      return packets[0];

    for (var i = 0, l = packets.length; i < l; i++) {
      var packet = packets[i];
      decoded += '\ufffd' + packet.length + '\ufffd' + packets[i];
    }

    return decoded;
  };

  /**
   * Decodes a packet
   *
   * @api private
   */

  var regexp = /([^:]+):([0-9]+)?(\+)?:([^:]+)?:?([\s\S]*)?/;

  parser.decodePacket = function (data) {
    var pieces = data.match(regexp);

    if (!pieces) return {};

    var id = pieces[2] || ''
      , data = pieces[5] || ''
      , packet = {
            type: packets[pieces[1]]
          , endpoint: pieces[4] || ''
        };

    // whether we need to acknowledge the packet
    if (id) {
      packet.id = id;
      if (pieces[3])
        packet.ack = 'data';
      else
        packet.ack = true;
    }

    // handle different packet types
    switch (packet.type) {
      case 'error':
        var pieces = data.split('+');
        packet.reason = reasons[pieces[0]] || '';
        packet.advice = advice[pieces[1]] || '';
        break;

      case 'message':
        packet.data = data || '';
        break;

      case 'event':
        try {
          var opts = JSON.parse(data);
          packet.name = opts.name;
          packet.args = opts.args;
        } catch (e) { }

        packet.args = packet.args || [];
        break;

      case 'json':
        try {
          packet.data = JSON.parse(data);
        } catch (e) { }
        break;

      case 'connect':
        packet.qs = data || '';
        break;

      case 'ack':
        var pieces = data.match(/^([0-9]+)(\+)?(.*)/);
        if (pieces) {
          packet.ackId = pieces[1];
          packet.args = [];

          if (pieces[3]) {
            try {
              packet.args = pieces[3] ? JSON.parse(pieces[3]) : [];
            } catch (e) { }
          }
        }
        break;

      case 'disconnect':
      case 'heartbeat':
        break;
    };

    return packet;
  };

  /**
   * Decodes data payload. Detects multiple messages
   *
   * @return {Array} messages
   * @api public
   */

  parser.decodePayload = function (data) {
    // IE doesn't like data[i] for unicode chars, charAt works fine
    if (data.charAt(0) == '\ufffd') {
      var ret = [];

      for (var i = 1, length = ''; i < data.length; i++) {
        if (data.charAt(i) == '\ufffd') {
          ret.push(parser.decodePacket(data.substr(i + 1).substr(0, length)));
          i += Number(length) + 1;
          length = '';
        } else {
          length += data.charAt(i);
        }
      }

      return ret;
    } else {
      return [parser.decodePacket(data)];
    }
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.Transport = Transport;

  /**
   * This is the transport template for all supported transport methods.
   *
   * @constructor
   * @api public
   */

  function Transport (socket, sessid) {
    this.socket = socket;
    this.sessid = sessid;
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Transport, io.EventEmitter);


  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  Transport.prototype.heartbeats = function () {
    return true;
  };

  /**
   * Handles the response from the server. When a new response is received
   * it will automatically update the timeout, decode the message and
   * forwards the response to the onMessage function for further processing.
   *
   * @param {String} data Response from the server.
   * @api private
   */

  Transport.prototype.onData = function (data) {
    this.clearCloseTimeout();

    // If the connection in currently open (or in a reopening state) reset the close
    // timeout since we have just received data. This check is necessary so
    // that we don't reset the timeout on an explicitly disconnected connection.
    if (this.socket.connected || this.socket.connecting || this.socket.reconnecting) {
      this.setCloseTimeout();
    }

    if (data !== '') {
      // todo: we should only do decodePayload for xhr transports
      var msgs = io.parser.decodePayload(data);

      if (msgs && msgs.length) {
        for (var i = 0, l = msgs.length; i < l; i++) {
          this.onPacket(msgs[i]);
        }
      }
    }

    return this;
  };

  /**
   * Handles packets.
   *
   * @api private
   */

  Transport.prototype.onPacket = function (packet) {
    this.socket.setHeartbeatTimeout();

    if (packet.type == 'heartbeat') {
      return this.onHeartbeat();
    }

    if (packet.type == 'connect' && packet.endpoint == '') {
      this.onConnect();
    }

    if (packet.type == 'error' && packet.advice == 'reconnect') {
      this.isOpen = false;
    }

    this.socket.onPacket(packet);

    return this;
  };

  /**
   * Sets close timeout
   *
   * @api private
   */

  Transport.prototype.setCloseTimeout = function () {
    if (!this.closeTimeout) {
      var self = this;

      this.closeTimeout = setTimeout(function () {
        self.onDisconnect();
      }, this.socket.closeTimeout);
    }
  };

  /**
   * Called when transport disconnects.
   *
   * @api private
   */

  Transport.prototype.onDisconnect = function () {
    if (this.isOpen) this.close();
    this.clearTimeouts();
    this.socket.onDisconnect();
    return this;
  };

  /**
   * Called when transport connects
   *
   * @api private
   */

  Transport.prototype.onConnect = function () {
    this.socket.onConnect();
    return this;
  };

  /**
   * Clears close timeout
   *
   * @api private
   */

  Transport.prototype.clearCloseTimeout = function () {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  };

  /**
   * Clear timeouts
   *
   * @api private
   */

  Transport.prototype.clearTimeouts = function () {
    this.clearCloseTimeout();

    if (this.reopenTimeout) {
      clearTimeout(this.reopenTimeout);
    }
  };

  /**
   * Sends a packet
   *
   * @param {Object} packet object.
   * @api private
   */

  Transport.prototype.packet = function (packet) {
    this.send(io.parser.encodePacket(packet));
  };

  /**
   * Send the received heartbeat message back to server. So the server
   * knows we are still connected.
   *
   * @param {String} heartbeat Heartbeat response from the server.
   * @api private
   */

  Transport.prototype.onHeartbeat = function (heartbeat) {
    this.packet({ type: 'heartbeat' });
  };

  /**
   * Called when the transport opens.
   *
   * @api private
   */

  Transport.prototype.onOpen = function () {
    this.isOpen = true;
    this.clearCloseTimeout();
    this.socket.onOpen();
  };

  /**
   * Notifies the base when the connection with the Socket.IO server
   * has been disconnected.
   *
   * @api private
   */

  Transport.prototype.onClose = function () {
    var self = this;

    /* FIXME: reopen delay causing a infinit loop
    this.reopenTimeout = setTimeout(function () {
      self.open();
    }, this.socket.options['reopen delay']);*/

    this.isOpen = false;
    this.socket.onClose();
    this.onDisconnect();
  };

  /**
   * Generates a connection url based on the Socket.IO URL Protocol.
   * See <https://github.com/learnboost/socket.io-node/> for more details.
   *
   * @returns {String} Connection url
   * @api private
   */

  Transport.prototype.prepareUrl = function () {
    var options = this.socket.options;

    return this.scheme() + '://'
      + options.host + ':' + options.port + '/'
      + options.resource + '/' + io.protocol
      + '/' + this.name + '/' + this.sessid;
  };

  /**
   * Checks if the transport is ready to start a connection.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Transport.prototype.ready = function (socket, fn) {
    fn.call(this);
  };
})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.Socket = Socket;

  /**
   * Create a new `Socket.IO client` which can establish a persistent
   * connection with a Socket.IO enabled server.
   *
   * @api public
   */

  function Socket (options) {
    this.options = {
        port: 80
      , secure: false
      , document: 'document' in global ? document : false
      , resource: 'socket.io'
      , transports: io.transports
      , 'connect timeout': 10000
      , 'try multiple transports': true
      , 'reconnect': true
      , 'reconnection delay': 500
      , 'reconnection limit': Infinity
      , 'reopen delay': 3000
      , 'max reconnection attempts': 10
      , 'sync disconnect on unload': false
      , 'auto connect': true
      , 'flash policy port': 10843
      , 'manualFlush': false
    };

    io.util.merge(this.options, options);

    this.connected = false;
    this.open = false;
    this.connecting = false;
    this.reconnecting = false;
    this.namespaces = {};
    this.buffer = [];
    this.doBuffer = false;

    if (this.options['sync disconnect on unload'] &&
        (!this.isXDomain() || io.util.ua.hasCORS)) {
      var self = this;
      io.util.on(global, 'beforeunload', function () {
        self.disconnectSync();
      }, false);
    }

    if (this.options['auto connect']) {
      this.connect();
    }
};

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Socket, io.EventEmitter);

  /**
   * Returns a namespace listener/emitter for this socket
   *
   * @api public
   */

  Socket.prototype.of = function (name) {
    if (!this.namespaces[name]) {
      this.namespaces[name] = new io.SocketNamespace(this, name);

      if (name !== '') {
        this.namespaces[name].packet({ type: 'connect' });
      }
    }

    return this.namespaces[name];
  };

  /**
   * Emits the given event to the Socket and all namespaces
   *
   * @api private
   */

  Socket.prototype.publish = function () {
    this.emit.apply(this, arguments);

    var nsp;

    for (var i in this.namespaces) {
      if (this.namespaces.hasOwnProperty(i)) {
        nsp = this.of(i);
        nsp.$emit.apply(nsp, arguments);
      }
    }
  };

  /**
   * Performs the handshake
   *
   * @api private
   */

  function empty () { };

  Socket.prototype.handshake = function (fn) {
    var self = this
      , options = this.options;

    function complete (data) {
      if (data instanceof Error) {
        self.connecting = false;
        self.onError(data.message);
      } else {
        fn.apply(null, data.split(':'));
      }
    };

    var url = [
          'http' + (options.secure ? 's' : '') + ':/'
        , options.host + ':' + options.port
        , options.resource
        , io.protocol
        , io.util.query(this.options.query, 't=' + +new Date)
      ].join('/');

    if (this.isXDomain() && !io.util.ua.hasCORS) {
      var insertAt = document.getElementsByTagName('script')[0]
        , script = document.createElement('script');

      script.src = url + '&jsonp=' + io.j.length;
      insertAt.parentNode.insertBefore(script, insertAt);

      io.j.push(function (data) {
        complete(data);
        script.parentNode.removeChild(script);
      });
    } else {
      var xhr = io.util.request();

      xhr.open('GET', url, true);
      if (this.isXDomain()) {
        xhr.withCredentials = true;
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
          xhr.onreadystatechange = empty;

          if (xhr.status == 200) {
            complete(xhr.responseText);
          } else if (xhr.status == 403) {
            self.onError(xhr.responseText);
          } else {
            self.connecting = false;            
            !self.reconnecting && self.onError(xhr.responseText);
          }
        }
      };
      xhr.send(null);
    }
  };

  /**
   * Find an available transport based on the options supplied in the constructor.
   *
   * @api private
   */

  Socket.prototype.getTransport = function (override) {
    var transports = override || this.transports, match;

    for (var i = 0, transport; transport = transports[i]; i++) {
      if (io.Transport[transport]
        && io.Transport[transport].check(this)
        && (!this.isXDomain() || io.Transport[transport].xdomainCheck(this))) {
        return new io.Transport[transport](this, this.sessionid);
      }
    }

    return null;
  };

  /**
   * Connects to the server.
   *
   * @param {Function} [fn] Callback.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.connect = function (fn) {
    if (this.connecting) {
      return this;
    }

    var self = this;
    self.connecting = true;
    
    this.handshake(function (sid, heartbeat, close, transports) {
      self.sessionid = sid;
      self.closeTimeout = close * 1000;
      self.heartbeatTimeout = heartbeat * 1000;
      if(!self.transports)
          self.transports = self.origTransports = (transports ? io.util.intersect(
              transports.split(',')
            , self.options.transports
          ) : self.options.transports);

      self.setHeartbeatTimeout();

      function connect (transports){
        if (self.transport) self.transport.clearTimeouts();

        self.transport = self.getTransport(transports);
        if (!self.transport) return self.publish('connect_failed');

        // once the transport is ready
        self.transport.ready(self, function () {
          self.connecting = true;
          self.publish('connecting', self.transport.name);
          self.transport.open();

          if (self.options['connect timeout']) {
            self.connectTimeoutTimer = setTimeout(function () {
              if (!self.connected) {
                self.connecting = false;

                if (self.options['try multiple transports']) {
                  var remaining = self.transports;

                  while (remaining.length > 0 && remaining.splice(0,1)[0] !=
                         self.transport.name) {}

                    if (remaining.length){
                      connect(remaining);
                    } else {
                      self.publish('connect_failed');
                    }
                }
              }
            }, self.options['connect timeout']);
          }
        });
      }

      connect(self.transports);

      self.once('connect', function (){
        clearTimeout(self.connectTimeoutTimer);

        fn && typeof fn == 'function' && fn();
      });
    });

    return this;
  };

  /**
   * Clears and sets a new heartbeat timeout using the value given by the
   * server during the handshake.
   *
   * @api private
   */

  Socket.prototype.setHeartbeatTimeout = function () {
    clearTimeout(this.heartbeatTimeoutTimer);
    if(this.transport && !this.transport.heartbeats()) return;

    var self = this;
    this.heartbeatTimeoutTimer = setTimeout(function () {
      self.transport.onClose();
    }, this.heartbeatTimeout);
  };

  /**
   * Sends a message.
   *
   * @param {Object} data packet.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.packet = function (data) {
    if (this.connected && !this.doBuffer) {
      this.transport.packet(data);
    } else {
      this.buffer.push(data);
    }

    return this;
  };

  /**
   * Sets buffer state
   *
   * @api private
   */

  Socket.prototype.setBuffer = function (v) {
    this.doBuffer = v;

    if (!v && this.connected && this.buffer.length) {
      if (!this.options['manualFlush']) {
        this.flushBuffer();
      }
    }
  };

  /**
   * Flushes the buffer data over the wire.
   * To be invoked manually when 'manualFlush' is set to true.
   *
   * @api public
   */

  Socket.prototype.flushBuffer = function() {
    this.transport.payload(this.buffer);
    this.buffer = [];
  };
  

  /**
   * Disconnect the established connect.
   *
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.disconnect = function () {
    if (this.connected || this.connecting) {
      if (this.open) {
        this.of('').packet({ type: 'disconnect' });
      }

      // handle disconnection immediately
      this.onDisconnect('booted');
    }

    return this;
  };

  /**
   * Disconnects the socket with a sync XHR.
   *
   * @api private
   */

  Socket.prototype.disconnectSync = function () {
    // ensure disconnection
    var xhr = io.util.request();
    var uri = [
        'http' + (this.options.secure ? 's' : '') + ':/'
      , this.options.host + ':' + this.options.port
      , this.options.resource
      , io.protocol
      , ''
      , this.sessionid
    ].join('/') + '/?disconnect=1';

    xhr.open('GET', uri, false);
    xhr.send(null);

    // handle disconnection immediately
    this.onDisconnect('booted');
  };

  /**
   * Check if we need to use cross domain enabled transports. Cross domain would
   * be a different port or different domain name.
   *
   * @returns {Boolean}
   * @api private
   */

  Socket.prototype.isXDomain = function () {

    var port = global.location.port ||
      ('https:' == global.location.protocol ? 443 : 80);

    return this.options.host !== global.location.hostname 
      || this.options.port != port;
  };

  /**
   * Called upon handshake.
   *
   * @api private
   */

  Socket.prototype.onConnect = function () {
    if (!this.connected) {
      this.connected = true;
      this.connecting = false;
      if (!this.doBuffer) {
        // make sure to flush the buffer
        this.setBuffer(false);
      }
      this.emit('connect');
    }
  };

  /**
   * Called when the transport opens
   *
   * @api private
   */

  Socket.prototype.onOpen = function () {
    this.open = true;
  };

  /**
   * Called when the transport closes.
   *
   * @api private
   */

  Socket.prototype.onClose = function () {
    this.open = false;
    clearTimeout(this.heartbeatTimeoutTimer);
  };

  /**
   * Called when the transport first opens a connection
   *
   * @param text
   */

  Socket.prototype.onPacket = function (packet) {
    this.of(packet.endpoint).onPacket(packet);
  };

  /**
   * Handles an error.
   *
   * @api private
   */

  Socket.prototype.onError = function (err) {
    if (err && err.advice) {
      if (err.advice === 'reconnect' && (this.connected || this.connecting)) {
        this.disconnect();
        if (this.options.reconnect) {
          this.reconnect();
        }
      }
    }

    this.publish('error', err && err.reason ? err.reason : err);
  };

  /**
   * Called when the transport disconnects.
   *
   * @api private
   */

  Socket.prototype.onDisconnect = function (reason) {
    var wasConnected = this.connected
      , wasConnecting = this.connecting;

    this.connected = false;
    this.connecting = false;
    this.open = false;

    if (wasConnected || wasConnecting) {
      this.transport.close();
      this.transport.clearTimeouts();
      if (wasConnected) {
        this.publish('disconnect', reason);

        if ('booted' != reason && this.options.reconnect && !this.reconnecting) {
          this.reconnect();
        }
      }
    }
  };

  /**
   * Called upon reconnection.
   *
   * @api private
   */

  Socket.prototype.reconnect = function () {
    this.reconnecting = true;
    this.reconnectionAttempts = 0;
    this.reconnectionDelay = this.options['reconnection delay'];

    var self = this
      , maxAttempts = this.options['max reconnection attempts']
      , tryMultiple = this.options['try multiple transports']
      , limit = this.options['reconnection limit'];

    function reset () {
      if (self.connected) {
        for (var i in self.namespaces) {
          if (self.namespaces.hasOwnProperty(i) && '' !== i) {
              self.namespaces[i].packet({ type: 'connect' });
          }
        }
        self.publish('reconnect', self.transport.name, self.reconnectionAttempts);
      }

      clearTimeout(self.reconnectionTimer);

      self.removeListener('connect_failed', maybeReconnect);
      self.removeListener('connect', maybeReconnect);

      self.reconnecting = false;

      delete self.reconnectionAttempts;
      delete self.reconnectionDelay;
      delete self.reconnectionTimer;
      delete self.redoTransports;

      self.options['try multiple transports'] = tryMultiple;
    };

    function maybeReconnect () {
      if (!self.reconnecting) {
        return;
      }

      if (self.connected) {
        return reset();
      };

      if (self.connecting && self.reconnecting) {
        return self.reconnectionTimer = setTimeout(maybeReconnect, 1000);
      }

      if (self.reconnectionAttempts++ >= maxAttempts) {
        if (!self.redoTransports) {
          self.on('connect_failed', maybeReconnect);
          self.options['try multiple transports'] = true;
          self.transports = self.origTransports;
          self.transport = self.getTransport();
          self.redoTransports = true;
          self.connect();
        } else {
          self.publish('reconnect_failed');
          reset();
        }
      } else {
        if (self.reconnectionDelay < limit) {
          self.reconnectionDelay *= 2; // exponential back off
        }

        self.connect();
        self.publish('reconnecting', self.reconnectionDelay, self.reconnectionAttempts);
        self.reconnectionTimer = setTimeout(maybeReconnect, self.reconnectionDelay);
      }
    };

    this.options['try multiple transports'] = false;
    this.reconnectionTimer = setTimeout(maybeReconnect, this.reconnectionDelay);

    this.on('connect', maybeReconnect);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.SocketNamespace = SocketNamespace;

  /**
   * Socket namespace constructor.
   *
   * @constructor
   * @api public
   */

  function SocketNamespace (socket, name) {
    this.socket = socket;
    this.name = name || '';
    this.flags = {};
    this.json = new Flag(this, 'json');
    this.ackPackets = 0;
    this.acks = {};
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(SocketNamespace, io.EventEmitter);

  /**
   * Copies emit since we override it
   *
   * @api private
   */

  SocketNamespace.prototype.$emit = io.EventEmitter.prototype.emit;

  /**
   * Creates a new namespace, by proxying the request to the socket. This
   * allows us to use the synax as we do on the server.
   *
   * @api public
   */

  SocketNamespace.prototype.of = function () {
    return this.socket.of.apply(this.socket, arguments);
  };

  /**
   * Sends a packet.
   *
   * @api private
   */

  SocketNamespace.prototype.packet = function (packet) {
    packet.endpoint = this.name;
    this.socket.packet(packet);
    this.flags = {};
    return this;
  };

  /**
   * Sends a message
   *
   * @api public
   */

  SocketNamespace.prototype.send = function (data, fn) {
    var packet = {
        type: this.flags.json ? 'json' : 'message'
      , data: data
    };

    if ('function' == typeof fn) {
      packet.id = ++this.ackPackets;
      packet.ack = true;
      this.acks[packet.id] = fn;
    }

    return this.packet(packet);
  };

  /**
   * Emits an event
   *
   * @api public
   */
  
  SocketNamespace.prototype.emit = function (name) {
    var args = Array.prototype.slice.call(arguments, 1)
      , lastArg = args[args.length - 1]
      , packet = {
            type: 'event'
          , name: name
        };

    if ('function' == typeof lastArg) {
      packet.id = ++this.ackPackets;
      packet.ack = 'data';
      this.acks[packet.id] = lastArg;
      args = args.slice(0, args.length - 1);
    }

    packet.args = args;

    return this.packet(packet);
  };

  /**
   * Disconnects the namespace
   *
   * @api private
   */

  SocketNamespace.prototype.disconnect = function () {
    if (this.name === '') {
      this.socket.disconnect();
    } else {
      this.packet({ type: 'disconnect' });
      this.$emit('disconnect');
    }

    return this;
  };

  /**
   * Handles a packet
   *
   * @api private
   */

  SocketNamespace.prototype.onPacket = function (packet) {
    var self = this;

    function ack () {
      self.packet({
          type: 'ack'
        , args: io.util.toArray(arguments)
        , ackId: packet.id
      });
    };

    switch (packet.type) {
      case 'connect':
        this.$emit('connect');
        break;

      case 'disconnect':
        if (this.name === '') {
          this.socket.onDisconnect(packet.reason || 'booted');
        } else {
          this.$emit('disconnect', packet.reason);
        }
        break;

      case 'message':
      case 'json':
        var params = ['message', packet.data];

        if (packet.ack == 'data') {
          params.push(ack);
        } else if (packet.ack) {
          this.packet({ type: 'ack', ackId: packet.id });
        }

        this.$emit.apply(this, params);
        break;

      case 'event':
        var params = [packet.name].concat(packet.args);

        if (packet.ack == 'data')
          params.push(ack);

        this.$emit.apply(this, params);
        break;

      case 'ack':
        if (this.acks[packet.ackId]) {
          this.acks[packet.ackId].apply(this, packet.args);
          delete this.acks[packet.ackId];
        }
        break;

      case 'error':
        if (packet.advice){
          this.socket.onError(packet);
        } else {
          if (packet.reason == 'unauthorized') {
            this.$emit('connect_failed', packet.reason);
          } else {
            this.$emit('error', packet.reason);
          }
        }
        break;
    }
  };

  /**
   * Flag interface.
   *
   * @api private
   */

  function Flag (nsp, name) {
    this.namespace = nsp;
    this.name = name;
  };

  /**
   * Send a message
   *
   * @api public
   */

  Flag.prototype.send = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.send.apply(this.namespace, arguments);
  };

  /**
   * Emit an event
   *
   * @api public
   */

  Flag.prototype.emit = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.emit.apply(this.namespace, arguments);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.websocket = WS;

  /**
   * The WebSocket transport uses the HTML5 WebSocket API to establish an
   * persistent connection with the Socket.IO server. This transport will also
   * be inherited by the FlashSocket fallback as it provides a API compatible
   * polyfill for the WebSockets.
   *
   * @constructor
   * @extends {io.Transport}
   * @api public
   */

  function WS (socket) {
    io.Transport.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(WS, io.Transport);

  /**
   * Transport name
   *
   * @api public
   */

  WS.prototype.name = 'websocket';

  /**
   * Initializes a new `WebSocket` connection with the Socket.IO server. We attach
   * all the appropriate listeners to handle the responses from the server.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.open = function () {
    var query = io.util.query(this.socket.options.query)
      , self = this
      , Socket


    if (!Socket) {
      Socket = global.MozWebSocket || global.WebSocket;
    }

    this.websocket = new Socket(this.prepareUrl() + query);

    this.websocket.onopen = function () {
      self.onOpen();
      self.socket.setBuffer(false);
    };
    this.websocket.onmessage = function (ev) {
      self.onData(ev.data);
    };
    this.websocket.onclose = function () {
      self.onClose();
      self.socket.setBuffer(true);
    };
    this.websocket.onerror = function (e) {
      self.onError(e);
    };

    return this;
  };

  /**
   * Send a message to the Socket.IO server. The message will automatically be
   * encoded in the correct message format.
   *
   * @returns {Transport}
   * @api public
   */

  // Do to a bug in the current IDevices browser, we need to wrap the send in a 
  // setTimeout, when they resume from sleeping the browser will crash if 
  // we don't allow the browser time to detect the socket has been closed
  if (io.util.ua.iDevice) {
    WS.prototype.send = function (data) {
      var self = this;
      setTimeout(function() {
         self.websocket.send(data);
      },0);
      return this;
    };
  } else {
    WS.prototype.send = function (data) {
      this.websocket.send(data);
      return this;
    };
  }

  /**
   * Payload
   *
   * @api private
   */

  WS.prototype.payload = function (arr) {
    for (var i = 0, l = arr.length; i < l; i++) {
      this.packet(arr[i]);
    }
    return this;
  };

  /**
   * Disconnect the established `WebSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.close = function () {
    this.websocket.close();
    return this;
  };

  /**
   * Handle the errors that `WebSocket` might be giving when we
   * are attempting to connect or send messages.
   *
   * @param {Error} e The error.
   * @api private
   */

  WS.prototype.onError = function (e) {
    this.socket.onError(e);
  };

  /**
   * Returns the appropriate scheme for the URI generation.
   *
   * @api private
   */
  WS.prototype.scheme = function () {
    return this.socket.options.secure ? 'wss' : 'ws';
  };

  /**
   * Checks if the browser has support for native `WebSockets` and that
   * it's not the polyfill created for the FlashSocket transport.
   *
   * @return {Boolean}
   * @api public
   */

  WS.check = function () {
    return ('WebSocket' in global && !('__addTask' in WebSocket))
          || 'MozWebSocket' in global;
  };

  /**
   * Check if the `WebSocket` transport support cross domain communications.
   *
   * @returns {Boolean}
   * @api public
   */

  WS.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('websocket');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.flashsocket = Flashsocket;

  /**
   * The FlashSocket transport. This is a API wrapper for the HTML5 WebSocket
   * specification. It uses a .swf file to communicate with the server. If you want
   * to serve the .swf file from a other server than where the Socket.IO script is
   * coming from you need to use the insecure version of the .swf. More information
   * about this can be found on the github page.
   *
   * @constructor
   * @extends {io.Transport.websocket}
   * @api public
   */

  function Flashsocket () {
    io.Transport.websocket.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(Flashsocket, io.Transport.websocket);

  /**
   * Transport name
   *
   * @api public
   */

  Flashsocket.prototype.name = 'flashsocket';

  /**
   * Disconnect the established `FlashSocket` connection. This is done by adding a 
   * new task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.open = function () {
    var self = this
      , args = arguments;

    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.open.apply(self, args);
    });
    return this;
  };
  
  /**
   * Sends a message to the Socket.IO server. This is done by adding a new
   * task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.send = function () {
    var self = this, args = arguments;
    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.send.apply(self, args);
    });
    return this;
  };

  /**
   * Disconnects the established `FlashSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.close = function () {
    WebSocket.__tasks.length = 0;
    io.Transport.websocket.prototype.close.call(this);
    return this;
  };

  /**
   * The WebSocket fall back needs to append the flash container to the body
   * element, so we need to make sure we have access to it. Or defer the call
   * until we are sure there is a body element.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Flashsocket.prototype.ready = function (socket, fn) {
    function init () {
      var options = socket.options
        , port = options['flash policy port']
        , path = [
              'http' + (options.secure ? 's' : '') + ':/'
            , options.host + ':' + options.port
            , options.resource
            , 'static/flashsocket'
            , 'WebSocketMain' + (socket.isXDomain() ? 'Insecure' : '') + '.swf'
          ];

      // Only start downloading the swf file when the checked that this browser
      // actually supports it
      if (!Flashsocket.loaded) {
        if (typeof WEB_SOCKET_SWF_LOCATION === 'undefined') {
          // Set the correct file based on the XDomain settings
          WEB_SOCKET_SWF_LOCATION = path.join('/');
        }

        if (port !== 843) {
          WebSocket.loadFlashPolicyFile('xmlsocket://' + options.host + ':' + port);
        }

        WebSocket.__initialize();
        Flashsocket.loaded = true;
      }

      fn.call(self);
    }

    var self = this;
    if (document.body) return init();

    io.util.load(init);
  };

  /**
   * Check if the FlashSocket transport is supported as it requires that the Adobe
   * Flash Player plug-in version `10.0.0` or greater is installed. And also check if
   * the polyfill is correctly loaded.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.check = function () {
    if (
        typeof WebSocket == 'undefined'
      || !('__initialize' in WebSocket) || !swfobject
    ) return false;

    return swfobject.getFlashPlayerVersion().major >= 10;
  };

  /**
   * Check if the FlashSocket transport can be used as cross domain / cross origin 
   * transport. Because we can't see which type (secure or insecure) of .swf is used
   * we will just return true.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.xdomainCheck = function () {
    return true;
  };

  /**
   * Disable AUTO_INITIALIZATION
   */

  if (typeof window != 'undefined') {
    WEB_SOCKET_DISABLE_AUTO_INITIALIZATION = true;
  }

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('flashsocket');
})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/*	SWFObject v2.2 <http://code.google.com/p/swfobject/> 
	is released under the MIT License <http://www.opensource.org/licenses/mit-license.php> 
*/
if ('undefined' != typeof window) {
var swfobject=function(){var D="undefined",r="object",S="Shockwave Flash",W="ShockwaveFlash.ShockwaveFlash",q="application/x-shockwave-flash",R="SWFObjectExprInst",x="onreadystatechange",O=window,j=document,t=navigator,T=false,U=[h],o=[],N=[],I=[],l,Q,E,B,J=false,a=false,n,G,m=true,M=function(){var aa=typeof j.getElementById!=D&&typeof j.getElementsByTagName!=D&&typeof j.createElement!=D,ah=t.userAgent.toLowerCase(),Y=t.platform.toLowerCase(),ae=Y?/win/.test(Y):/win/.test(ah),ac=Y?/mac/.test(Y):/mac/.test(ah),af=/webkit/.test(ah)?parseFloat(ah.replace(/^.*webkit\/(\d+(\.\d+)?).*$/,"$1")):false,X=!+"\v1",ag=[0,0,0],ab=null;if(typeof t.plugins!=D&&typeof t.plugins[S]==r){ab=t.plugins[S].description;if(ab&&!(typeof t.mimeTypes!=D&&t.mimeTypes[q]&&!t.mimeTypes[q].enabledPlugin)){T=true;X=false;ab=ab.replace(/^.*\s+(\S+\s+\S+$)/,"$1");ag[0]=parseInt(ab.replace(/^(.*)\..*$/,"$1"),10);ag[1]=parseInt(ab.replace(/^.*\.(.*)\s.*$/,"$1"),10);ag[2]=/[a-zA-Z]/.test(ab)?parseInt(ab.replace(/^.*[a-zA-Z]+(.*)$/,"$1"),10):0}}else{if(typeof O[(['Active'].concat('Object').join('X'))]!=D){try{var ad=new window[(['Active'].concat('Object').join('X'))](W);if(ad){ab=ad.GetVariable("$version");if(ab){X=true;ab=ab.split(" ")[1].split(",");ag=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}}catch(Z){}}}return{w3:aa,pv:ag,wk:af,ie:X,win:ae,mac:ac}}(),k=function(){if(!M.w3){return}if((typeof j.readyState!=D&&j.readyState=="complete")||(typeof j.readyState==D&&(j.getElementsByTagName("body")[0]||j.body))){f()}if(!J){if(typeof j.addEventListener!=D){j.addEventListener("DOMContentLoaded",f,false)}if(M.ie&&M.win){j.attachEvent(x,function(){if(j.readyState=="complete"){j.detachEvent(x,arguments.callee);f()}});if(O==top){(function(){if(J){return}try{j.documentElement.doScroll("left")}catch(X){setTimeout(arguments.callee,0);return}f()})()}}if(M.wk){(function(){if(J){return}if(!/loaded|complete/.test(j.readyState)){setTimeout(arguments.callee,0);return}f()})()}s(f)}}();function f(){if(J){return}try{var Z=j.getElementsByTagName("body")[0].appendChild(C("span"));Z.parentNode.removeChild(Z)}catch(aa){return}J=true;var X=U.length;for(var Y=0;Y<X;Y++){U[Y]()}}function K(X){if(J){X()}else{U[U.length]=X}}function s(Y){if(typeof O.addEventListener!=D){O.addEventListener("load",Y,false)}else{if(typeof j.addEventListener!=D){j.addEventListener("load",Y,false)}else{if(typeof O.attachEvent!=D){i(O,"onload",Y)}else{if(typeof O.onload=="function"){var X=O.onload;O.onload=function(){X();Y()}}else{O.onload=Y}}}}}function h(){if(T){V()}else{H()}}function V(){var X=j.getElementsByTagName("body")[0];var aa=C(r);aa.setAttribute("type",q);var Z=X.appendChild(aa);if(Z){var Y=0;(function(){if(typeof Z.GetVariable!=D){var ab=Z.GetVariable("$version");if(ab){ab=ab.split(" ")[1].split(",");M.pv=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}else{if(Y<10){Y++;setTimeout(arguments.callee,10);return}}X.removeChild(aa);Z=null;H()})()}else{H()}}function H(){var ag=o.length;if(ag>0){for(var af=0;af<ag;af++){var Y=o[af].id;var ab=o[af].callbackFn;var aa={success:false,id:Y};if(M.pv[0]>0){var ae=c(Y);if(ae){if(F(o[af].swfVersion)&&!(M.wk&&M.wk<312)){w(Y,true);if(ab){aa.success=true;aa.ref=z(Y);ab(aa)}}else{if(o[af].expressInstall&&A()){var ai={};ai.data=o[af].expressInstall;ai.width=ae.getAttribute("width")||"0";ai.height=ae.getAttribute("height")||"0";if(ae.getAttribute("class")){ai.styleclass=ae.getAttribute("class")}if(ae.getAttribute("align")){ai.align=ae.getAttribute("align")}var ah={};var X=ae.getElementsByTagName("param");var ac=X.length;for(var ad=0;ad<ac;ad++){if(X[ad].getAttribute("name").toLowerCase()!="movie"){ah[X[ad].getAttribute("name")]=X[ad].getAttribute("value")}}P(ai,ah,Y,ab)}else{p(ae);if(ab){ab(aa)}}}}}else{w(Y,true);if(ab){var Z=z(Y);if(Z&&typeof Z.SetVariable!=D){aa.success=true;aa.ref=Z}ab(aa)}}}}}function z(aa){var X=null;var Y=c(aa);if(Y&&Y.nodeName=="OBJECT"){if(typeof Y.SetVariable!=D){X=Y}else{var Z=Y.getElementsByTagName(r)[0];if(Z){X=Z}}}return X}function A(){return !a&&F("6.0.65")&&(M.win||M.mac)&&!(M.wk&&M.wk<312)}function P(aa,ab,X,Z){a=true;E=Z||null;B={success:false,id:X};var ae=c(X);if(ae){if(ae.nodeName=="OBJECT"){l=g(ae);Q=null}else{l=ae;Q=X}aa.id=R;if(typeof aa.width==D||(!/%$/.test(aa.width)&&parseInt(aa.width,10)<310)){aa.width="310"}if(typeof aa.height==D||(!/%$/.test(aa.height)&&parseInt(aa.height,10)<137)){aa.height="137"}j.title=j.title.slice(0,47)+" - Flash Player Installation";var ad=M.ie&&M.win?(['Active'].concat('').join('X')):"PlugIn",ac="MMredirectURL="+O.location.toString().replace(/&/g,"%26")+"&MMplayerType="+ad+"&MMdoctitle="+j.title;if(typeof ab.flashvars!=D){ab.flashvars+="&"+ac}else{ab.flashvars=ac}if(M.ie&&M.win&&ae.readyState!=4){var Y=C("div");X+="SWFObjectNew";Y.setAttribute("id",X);ae.parentNode.insertBefore(Y,ae);ae.style.display="none";(function(){if(ae.readyState==4){ae.parentNode.removeChild(ae)}else{setTimeout(arguments.callee,10)}})()}u(aa,ab,X)}}function p(Y){if(M.ie&&M.win&&Y.readyState!=4){var X=C("div");Y.parentNode.insertBefore(X,Y);X.parentNode.replaceChild(g(Y),X);Y.style.display="none";(function(){if(Y.readyState==4){Y.parentNode.removeChild(Y)}else{setTimeout(arguments.callee,10)}})()}else{Y.parentNode.replaceChild(g(Y),Y)}}function g(ab){var aa=C("div");if(M.win&&M.ie){aa.innerHTML=ab.innerHTML}else{var Y=ab.getElementsByTagName(r)[0];if(Y){var ad=Y.childNodes;if(ad){var X=ad.length;for(var Z=0;Z<X;Z++){if(!(ad[Z].nodeType==1&&ad[Z].nodeName=="PARAM")&&!(ad[Z].nodeType==8)){aa.appendChild(ad[Z].cloneNode(true))}}}}}return aa}function u(ai,ag,Y){var X,aa=c(Y);if(M.wk&&M.wk<312){return X}if(aa){if(typeof ai.id==D){ai.id=Y}if(M.ie&&M.win){var ah="";for(var ae in ai){if(ai[ae]!=Object.prototype[ae]){if(ae.toLowerCase()=="data"){ag.movie=ai[ae]}else{if(ae.toLowerCase()=="styleclass"){ah+=' class="'+ai[ae]+'"'}else{if(ae.toLowerCase()!="classid"){ah+=" "+ae+'="'+ai[ae]+'"'}}}}}var af="";for(var ad in ag){if(ag[ad]!=Object.prototype[ad]){af+='<param name="'+ad+'" value="'+ag[ad]+'" />'}}aa.outerHTML='<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"'+ah+">"+af+"</object>";N[N.length]=ai.id;X=c(ai.id)}else{var Z=C(r);Z.setAttribute("type",q);for(var ac in ai){if(ai[ac]!=Object.prototype[ac]){if(ac.toLowerCase()=="styleclass"){Z.setAttribute("class",ai[ac])}else{if(ac.toLowerCase()!="classid"){Z.setAttribute(ac,ai[ac])}}}}for(var ab in ag){if(ag[ab]!=Object.prototype[ab]&&ab.toLowerCase()!="movie"){e(Z,ab,ag[ab])}}aa.parentNode.replaceChild(Z,aa);X=Z}}return X}function e(Z,X,Y){var aa=C("param");aa.setAttribute("name",X);aa.setAttribute("value",Y);Z.appendChild(aa)}function y(Y){var X=c(Y);if(X&&X.nodeName=="OBJECT"){if(M.ie&&M.win){X.style.display="none";(function(){if(X.readyState==4){b(Y)}else{setTimeout(arguments.callee,10)}})()}else{X.parentNode.removeChild(X)}}}function b(Z){var Y=c(Z);if(Y){for(var X in Y){if(typeof Y[X]=="function"){Y[X]=null}}Y.parentNode.removeChild(Y)}}function c(Z){var X=null;try{X=j.getElementById(Z)}catch(Y){}return X}function C(X){return j.createElement(X)}function i(Z,X,Y){Z.attachEvent(X,Y);I[I.length]=[Z,X,Y]}function F(Z){var Y=M.pv,X=Z.split(".");X[0]=parseInt(X[0],10);X[1]=parseInt(X[1],10)||0;X[2]=parseInt(X[2],10)||0;return(Y[0]>X[0]||(Y[0]==X[0]&&Y[1]>X[1])||(Y[0]==X[0]&&Y[1]==X[1]&&Y[2]>=X[2]))?true:false}function v(ac,Y,ad,ab){if(M.ie&&M.mac){return}var aa=j.getElementsByTagName("head")[0];if(!aa){return}var X=(ad&&typeof ad=="string")?ad:"screen";if(ab){n=null;G=null}if(!n||G!=X){var Z=C("style");Z.setAttribute("type","text/css");Z.setAttribute("media",X);n=aa.appendChild(Z);if(M.ie&&M.win&&typeof j.styleSheets!=D&&j.styleSheets.length>0){n=j.styleSheets[j.styleSheets.length-1]}G=X}if(M.ie&&M.win){if(n&&typeof n.addRule==r){n.addRule(ac,Y)}}else{if(n&&typeof j.createTextNode!=D){n.appendChild(j.createTextNode(ac+" {"+Y+"}"))}}}function w(Z,X){if(!m){return}var Y=X?"visible":"hidden";if(J&&c(Z)){c(Z).style.visibility=Y}else{v("#"+Z,"visibility:"+Y)}}function L(Y){var Z=/[\\\"<>\.;]/;var X=Z.exec(Y)!=null;return X&&typeof encodeURIComponent!=D?encodeURIComponent(Y):Y}var d=function(){if(M.ie&&M.win){window.attachEvent("onunload",function(){var ac=I.length;for(var ab=0;ab<ac;ab++){I[ab][0].detachEvent(I[ab][1],I[ab][2])}var Z=N.length;for(var aa=0;aa<Z;aa++){y(N[aa])}for(var Y in M){M[Y]=null}M=null;for(var X in swfobject){swfobject[X]=null}swfobject=null})}}();return{registerObject:function(ab,X,aa,Z){if(M.w3&&ab&&X){var Y={};Y.id=ab;Y.swfVersion=X;Y.expressInstall=aa;Y.callbackFn=Z;o[o.length]=Y;w(ab,false)}else{if(Z){Z({success:false,id:ab})}}},getObjectById:function(X){if(M.w3){return z(X)}},embedSWF:function(ab,ah,ae,ag,Y,aa,Z,ad,af,ac){var X={success:false,id:ah};if(M.w3&&!(M.wk&&M.wk<312)&&ab&&ah&&ae&&ag&&Y){w(ah,false);K(function(){ae+="";ag+="";var aj={};if(af&&typeof af===r){for(var al in af){aj[al]=af[al]}}aj.data=ab;aj.width=ae;aj.height=ag;var am={};if(ad&&typeof ad===r){for(var ak in ad){am[ak]=ad[ak]}}if(Z&&typeof Z===r){for(var ai in Z){if(typeof am.flashvars!=D){am.flashvars+="&"+ai+"="+Z[ai]}else{am.flashvars=ai+"="+Z[ai]}}}if(F(Y)){var an=u(aj,am,ah);if(aj.id==ah){w(ah,true)}X.success=true;X.ref=an}else{if(aa&&A()){aj.data=aa;P(aj,am,ah,ac);return}else{w(ah,true)}}if(ac){ac(X)}})}else{if(ac){ac(X)}}},switchOffAutoHideShow:function(){m=false},ua:M,getFlashPlayerVersion:function(){return{major:M.pv[0],minor:M.pv[1],release:M.pv[2]}},hasFlashPlayerVersion:F,createSWF:function(Z,Y,X){if(M.w3){return u(Z,Y,X)}else{return undefined}},showExpressInstall:function(Z,aa,X,Y){if(M.w3&&A()){P(Z,aa,X,Y)}},removeSWF:function(X){if(M.w3){y(X)}},createCSS:function(aa,Z,Y,X){if(M.w3){v(aa,Z,Y,X)}},addDomLoadEvent:K,addLoadEvent:s,getQueryParamValue:function(aa){var Z=j.location.search||j.location.hash;if(Z){if(/\?/.test(Z)){Z=Z.split("?")[1]}if(aa==null){return L(Z)}var Y=Z.split("&");for(var X=0;X<Y.length;X++){if(Y[X].substring(0,Y[X].indexOf("="))==aa){return L(Y[X].substring((Y[X].indexOf("=")+1)))}}}return""},expressInstallCallback:function(){if(a){var X=c(R);if(X&&l){X.parentNode.replaceChild(l,X);if(Q){w(Q,true);if(M.ie&&M.win){l.style.display="block"}}if(E){E(B)}}a=false}}}}();
}
// Copyright: Hiroshi Ichikawa <http://gimite.net/en/>
// License: New BSD License
// Reference: http://dev.w3.org/html5/websockets/
// Reference: http://tools.ietf.org/html/draft-hixie-thewebsocketprotocol

(function() {
  
  if ('undefined' == typeof window || window.WebSocket) return;

  var console = window.console;
  if (!console || !console.log || !console.error) {
    console = {log: function(){ }, error: function(){ }};
  }
  
  if (!swfobject.hasFlashPlayerVersion("10.0.0")) {
    console.error("Flash Player >= 10.0.0 is required.");
    return;
  }
  if (location.protocol == "file:") {
    console.error(
      "WARNING: web-socket-js doesn't work in file:///... URL " +
      "unless you set Flash Security Settings properly. " +
      "Open the page via Web server i.e. http://...");
  }

  /**
   * This class represents a faux web socket.
   * @param {string} url
   * @param {array or string} protocols
   * @param {string} proxyHost
   * @param {int} proxyPort
   * @param {string} headers
   */
  WebSocket = function(url, protocols, proxyHost, proxyPort, headers) {
    var self = this;
    self.__id = WebSocket.__nextId++;
    WebSocket.__instances[self.__id] = self;
    self.readyState = WebSocket.CONNECTING;
    self.bufferedAmount = 0;
    self.__events = {};
    if (!protocols) {
      protocols = [];
    } else if (typeof protocols == "string") {
      protocols = [protocols];
    }
    // Uses setTimeout() to make sure __createFlash() runs after the caller sets ws.onopen etc.
    // Otherwise, when onopen fires immediately, onopen is called before it is set.
    setTimeout(function() {
      WebSocket.__addTask(function() {
        WebSocket.__flash.create(
            self.__id, url, protocols, proxyHost || null, proxyPort || 0, headers || null);
      });
    }, 0);
  };

  /**
   * Send data to the web socket.
   * @param {string} data  The data to send to the socket.
   * @return {boolean}  True for success, false for failure.
   */
  WebSocket.prototype.send = function(data) {
    if (this.readyState == WebSocket.CONNECTING) {
      throw "INVALID_STATE_ERR: Web Socket connection has not been established";
    }
    // We use encodeURIComponent() here, because FABridge doesn't work if
    // the argument includes some characters. We don't use escape() here
    // because of this:
    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Functions#escape_and_unescape_Functions
    // But it looks decodeURIComponent(encodeURIComponent(s)) doesn't
    // preserve all Unicode characters either e.g. "\uffff" in Firefox.
    // Note by wtritch: Hopefully this will not be necessary using ExternalInterface.  Will require
    // additional testing.
    var result = WebSocket.__flash.send(this.__id, encodeURIComponent(data));
    if (result < 0) { // success
      return true;
    } else {
      this.bufferedAmount += result;
      return false;
    }
  };

  /**
   * Close this web socket gracefully.
   */
  WebSocket.prototype.close = function() {
    if (this.readyState == WebSocket.CLOSED || this.readyState == WebSocket.CLOSING) {
      return;
    }
    this.readyState = WebSocket.CLOSING;
    WebSocket.__flash.close(this.__id);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.addEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) {
      this.__events[type] = [];
    }
    this.__events[type].push(listener);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.removeEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) return;
    var events = this.__events[type];
    for (var i = events.length - 1; i >= 0; --i) {
      if (events[i] === listener) {
        events.splice(i, 1);
        break;
      }
    }
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {Event} event
   * @return void
   */
  WebSocket.prototype.dispatchEvent = function(event) {
    var events = this.__events[event.type] || [];
    for (var i = 0; i < events.length; ++i) {
      events[i](event);
    }
    var handler = this["on" + event.type];
    if (handler) handler(event);
  };

  /**
   * Handles an event from Flash.
   * @param {Object} flashEvent
   */
  WebSocket.prototype.__handleEvent = function(flashEvent) {
    if ("readyState" in flashEvent) {
      this.readyState = flashEvent.readyState;
    }
    if ("protocol" in flashEvent) {
      this.protocol = flashEvent.protocol;
    }
    
    var jsEvent;
    if (flashEvent.type == "open" || flashEvent.type == "error") {
      jsEvent = this.__createSimpleEvent(flashEvent.type);
    } else if (flashEvent.type == "close") {
      // TODO implement jsEvent.wasClean
      jsEvent = this.__createSimpleEvent("close");
    } else if (flashEvent.type == "message") {
      var data = decodeURIComponent(flashEvent.message);
      jsEvent = this.__createMessageEvent("message", data);
    } else {
      throw "unknown event type: " + flashEvent.type;
    }
    
    this.dispatchEvent(jsEvent);
  };
  
  WebSocket.prototype.__createSimpleEvent = function(type) {
    if (document.createEvent && window.Event) {
      var event = document.createEvent("Event");
      event.initEvent(type, false, false);
      return event;
    } else {
      return {type: type, bubbles: false, cancelable: false};
    }
  };
  
  WebSocket.prototype.__createMessageEvent = function(type, data) {
    if (document.createEvent && window.MessageEvent && !window.opera) {
      var event = document.createEvent("MessageEvent");
      event.initMessageEvent("message", false, false, data, null, null, window, null);
      return event;
    } else {
      // IE and Opera, the latter one truncates the data parameter after any 0x00 bytes.
      return {type: type, data: data, bubbles: false, cancelable: false};
    }
  };
  
  /**
   * Define the WebSocket readyState enumeration.
   */
  WebSocket.CONNECTING = 0;
  WebSocket.OPEN = 1;
  WebSocket.CLOSING = 2;
  WebSocket.CLOSED = 3;

  WebSocket.__flash = null;
  WebSocket.__instances = {};
  WebSocket.__tasks = [];
  WebSocket.__nextId = 0;
  
  /**
   * Load a new flash security policy file.
   * @param {string} url
   */
  WebSocket.loadFlashPolicyFile = function(url){
    WebSocket.__addTask(function() {
      WebSocket.__flash.loadManualPolicyFile(url);
    });
  };

  /**
   * Loads WebSocketMain.swf and creates WebSocketMain object in Flash.
   */
  WebSocket.__initialize = function() {
    if (WebSocket.__flash) return;
    
    if (WebSocket.__swfLocation) {
      // For backword compatibility.
      window.WEB_SOCKET_SWF_LOCATION = WebSocket.__swfLocation;
    }
    if (!window.WEB_SOCKET_SWF_LOCATION) {
      console.error("[WebSocket] set WEB_SOCKET_SWF_LOCATION to location of WebSocketMain.swf");
      return;
    }
    var container = document.createElement("div");
    container.id = "webSocketContainer";
    // Hides Flash box. We cannot use display: none or visibility: hidden because it prevents
    // Flash from loading at least in IE. So we move it out of the screen at (-100, -100).
    // But this even doesn't work with Flash Lite (e.g. in Droid Incredible). So with Flash
    // Lite, we put it at (0, 0). This shows 1x1 box visible at left-top corner but this is
    // the best we can do as far as we know now.
    container.style.position = "absolute";
    if (WebSocket.__isFlashLite()) {
      container.style.left = "0px";
      container.style.top = "0px";
    } else {
      container.style.left = "-100px";
      container.style.top = "-100px";
    }
    var holder = document.createElement("div");
    holder.id = "webSocketFlash";
    container.appendChild(holder);
    document.body.appendChild(container);
    // See this article for hasPriority:
    // http://help.adobe.com/en_US/as3/mobile/WS4bebcd66a74275c36cfb8137124318eebc6-7ffd.html
    swfobject.embedSWF(
      WEB_SOCKET_SWF_LOCATION,
      "webSocketFlash",
      "1" /* width */,
      "1" /* height */,
      "10.0.0" /* SWF version */,
      null,
      null,
      {hasPriority: true, swliveconnect : true, allowScriptAccess: "always"},
      null,
      function(e) {
        if (!e.success) {
          console.error("[WebSocket] swfobject.embedSWF failed");
        }
      });
  };
  
  /**
   * Called by Flash to notify JS that it's fully loaded and ready
   * for communication.
   */
  WebSocket.__onFlashInitialized = function() {
    // We need to set a timeout here to avoid round-trip calls
    // to flash during the initialization process.
    setTimeout(function() {
      WebSocket.__flash = document.getElementById("webSocketFlash");
      WebSocket.__flash.setCallerUrl(location.href);
      WebSocket.__flash.setDebug(!!window.WEB_SOCKET_DEBUG);
      for (var i = 0; i < WebSocket.__tasks.length; ++i) {
        WebSocket.__tasks[i]();
      }
      WebSocket.__tasks = [];
    }, 0);
  };
  
  /**
   * Called by Flash to notify WebSockets events are fired.
   */
  WebSocket.__onFlashEvent = function() {
    setTimeout(function() {
      try {
        // Gets events using receiveEvents() instead of getting it from event object
        // of Flash event. This is to make sure to keep message order.
        // It seems sometimes Flash events don't arrive in the same order as they are sent.
        var events = WebSocket.__flash.receiveEvents();
        for (var i = 0; i < events.length; ++i) {
          WebSocket.__instances[events[i].webSocketId].__handleEvent(events[i]);
        }
      } catch (e) {
        console.error(e);
      }
    }, 0);
    return true;
  };
  
  // Called by Flash.
  WebSocket.__log = function(message) {
    console.log(decodeURIComponent(message));
  };
  
  // Called by Flash.
  WebSocket.__error = function(message) {
    console.error(decodeURIComponent(message));
  };
  
  WebSocket.__addTask = function(task) {
    if (WebSocket.__flash) {
      task();
    } else {
      WebSocket.__tasks.push(task);
    }
  };
  
  /**
   * Test if the browser is running flash lite.
   * @return {boolean} True if flash lite is running, false otherwise.
   */
  WebSocket.__isFlashLite = function() {
    if (!window.navigator || !window.navigator.mimeTypes) {
      return false;
    }
    var mimeType = window.navigator.mimeTypes["application/x-shockwave-flash"];
    if (!mimeType || !mimeType.enabledPlugin || !mimeType.enabledPlugin.filename) {
      return false;
    }
    return mimeType.enabledPlugin.filename.match(/flashlite/i) ? true : false;
  };
  
  if (!window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION) {
    if (window.addEventListener) {
      window.addEventListener("load", function(){
        WebSocket.__initialize();
      }, false);
    } else {
      window.attachEvent("onload", function(){
        WebSocket.__initialize();
      });
    }
  }
  
})();

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   *
   * @api public
   */

  exports.XHR = XHR;

  /**
   * XHR constructor
   *
   * @costructor
   * @api public
   */

  function XHR (socket) {
    if (!socket) return;

    io.Transport.apply(this, arguments);
    this.sendBuffer = [];
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(XHR, io.Transport);

  /**
   * Establish a connection
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.open = function () {
    this.socket.setBuffer(false);
    this.onOpen();
    this.get();

    // we need to make sure the request succeeds since we have no indication
    // whether the request opened or not until it succeeded.
    this.setCloseTimeout();

    return this;
  };

  /**
   * Check if we need to send data to the Socket.IO server, if we have data in our
   * buffer we encode it and forward it to the `post` method.
   *
   * @api private
   */

  XHR.prototype.payload = function (payload) {
    var msgs = [];

    for (var i = 0, l = payload.length; i < l; i++) {
      msgs.push(io.parser.encodePacket(payload[i]));
    }

    this.send(io.parser.encodePayload(msgs));
  };

  /**
   * Send data to the Socket.IO server.
   *
   * @param data The message
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.send = function (data) {
    this.post(data);
    return this;
  };

  /**
   * Posts a encoded message to the Socket.IO server.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  function empty () { };

  XHR.prototype.post = function (data) {
    var self = this;
    this.socket.setBuffer(true);

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;
        self.posting = false;

        if (this.status == 200){
          self.socket.setBuffer(false);
        } else {
          self.onClose();
        }
      }
    }

    function onload () {
      this.onload = empty;
      self.socket.setBuffer(false);
    };

    this.sendXHR = this.request('POST');

    if (global.XDomainRequest && this.sendXHR instanceof XDomainRequest) {
      this.sendXHR.onload = this.sendXHR.onerror = onload;
    } else {
      this.sendXHR.onreadystatechange = stateChange;
    }

    this.sendXHR.send(data);
  };

  /**
   * Disconnects the established `XHR` connection.
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.close = function () {
    this.onClose();
    return this;
  };

  /**
   * Generates a configured XHR request
   *
   * @param {String} url The url that needs to be requested.
   * @param {String} method The method the request should use.
   * @returns {XMLHttpRequest}
   * @api private
   */

  XHR.prototype.request = function (method) {
    var req = io.util.request(this.socket.isXDomain())
      , query = io.util.query(this.socket.options.query, 't=' + +new Date);

    req.open(method || 'GET', this.prepareUrl() + query, true);

    if (method == 'POST') {
      try {
        if (req.setRequestHeader) {
          req.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
        } else {
          // XDomainRequest
          req.contentType = 'text/plain';
        }
      } catch (e) {}
    }

    return req;
  };

  /**
   * Returns the scheme to use for the transport URLs.
   *
   * @api private
   */

  XHR.prototype.scheme = function () {
    return this.socket.options.secure ? 'https' : 'http';
  };

  /**
   * Check if the XHR transports are supported
   *
   * @param {Boolean} xdomain Check if we support cross domain requests.
   * @returns {Boolean}
   * @api public
   */

  XHR.check = function (socket, xdomain) {
    try {
      var request = io.util.request(xdomain),
          usesXDomReq = (global.XDomainRequest && request instanceof XDomainRequest),
          socketProtocol = (socket && socket.options && socket.options.secure ? 'https:' : 'http:'),
          isXProtocol = (global.location && socketProtocol != global.location.protocol);
      if (request && !(usesXDomReq && isXProtocol)) {
        return true;
      }
    } catch(e) {}

    return false;
  };

  /**
   * Check if the XHR transport supports cross domain requests.
   *
   * @returns {Boolean}
   * @api public
   */

  XHR.xdomainCheck = function (socket) {
    return XHR.check(socket, true);
  };

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.htmlfile = HTMLFile;

  /**
   * The HTMLFile transport creates a `forever iframe` based transport
   * for Internet Explorer. Regular forever iframe implementations will 
   * continuously trigger the browsers buzy indicators. If the forever iframe
   * is created inside a `htmlfile` these indicators will not be trigged.
   *
   * @constructor
   * @extends {io.Transport.XHR}
   * @api public
   */

  function HTMLFile (socket) {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(HTMLFile, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  HTMLFile.prototype.name = 'htmlfile';

  /**
   * Creates a new Ac...eX `htmlfile` with a forever loading iframe
   * that can be used to listen to messages. Inside the generated
   * `htmlfile` a reference will be made to the HTMLFile transport.
   *
   * @api private
   */

  HTMLFile.prototype.get = function () {
    this.doc = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
    this.doc.open();
    this.doc.write('<html></html>');
    this.doc.close();
    this.doc.parentWindow.s = this;

    var iframeC = this.doc.createElement('div');
    iframeC.className = 'socketio';

    this.doc.body.appendChild(iframeC);
    this.iframe = this.doc.createElement('iframe');

    iframeC.appendChild(this.iframe);

    var self = this
      , query = io.util.query(this.socket.options.query, 't='+ +new Date);

    this.iframe.src = this.prepareUrl() + query;

    io.util.on(window, 'unload', function () {
      self.destroy();
    });
  };

  /**
   * The Socket.IO server will write script tags inside the forever
   * iframe, this function will be used as callback for the incoming
   * information.
   *
   * @param {String} data The message
   * @param {document} doc Reference to the context
   * @api private
   */

  HTMLFile.prototype._ = function (data, doc) {
    this.onData(data);
    try {
      var script = doc.getElementsByTagName('script')[0];
      script.parentNode.removeChild(script);
    } catch (e) { }
  };

  /**
   * Destroy the established connection, iframe and `htmlfile`.
   * And calls the `CollectGarbage` function of Internet Explorer
   * to release the memory.
   *
   * @api private
   */

  HTMLFile.prototype.destroy = function () {
    if (this.iframe){
      try {
        this.iframe.src = 'about:blank';
      } catch(e){}

      this.doc = null;
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;

      CollectGarbage();
    }
  };

  /**
   * Disconnects the established connection.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  HTMLFile.prototype.close = function () {
    this.destroy();
    return io.Transport.XHR.prototype.close.call(this);
  };

  /**
   * Checks if the browser supports this transport. The browser
   * must have an `Ac...eXObject` implementation.
   *
   * @return {Boolean}
   * @api public
   */

  HTMLFile.check = function (socket) {
    if (typeof window != "undefined" && (['Active'].concat('Object').join('X')) in window){
      try {
        var a = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
        return a && io.Transport.XHR.check(socket);
      } catch(e){}
    }
    return false;
  };

  /**
   * Check if cross domain requests are supported.
   *
   * @returns {Boolean}
   * @api public
   */

  HTMLFile.xdomainCheck = function () {
    // we can probably do handling for sub-domains, we should
    // test that it's cross domain but a subdomain here
    return false;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('htmlfile');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports['xhr-polling'] = XHRPolling;

  /**
   * The XHR-polling transport uses long polling XHR requests to create a
   * "persistent" connection with the server.
   *
   * @constructor
   * @api public
   */

  function XHRPolling () {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(XHRPolling, io.Transport.XHR);

  /**
   * Merge the properties from XHR transport
   */

  io.util.merge(XHRPolling, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  XHRPolling.prototype.name = 'xhr-polling';

  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  XHRPolling.prototype.heartbeats = function () {
    return false;
  };

  /** 
   * Establish a connection, for iPhone and Android this will be done once the page
   * is loaded.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  XHRPolling.prototype.open = function () {
    var self = this;

    io.Transport.XHR.prototype.open.call(self);
    return false;
  };

  /**
   * Starts a XHR request to wait for incoming messages.
   *
   * @api private
   */

  function empty () {};

  XHRPolling.prototype.get = function () {
    if (!this.isOpen) return;

    var self = this;

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;

        if (this.status == 200) {
          self.onData(this.responseText);
          self.get();
        } else {
          self.onClose();
        }
      }
    };

    function onload () {
      this.onload = empty;
      this.onerror = empty;
      self.retryCounter = 1;
      self.onData(this.responseText);
      self.get();
    };

    function onerror () {
      self.retryCounter ++;
      if(!self.retryCounter || self.retryCounter > 3) {
        self.onClose();  
      } else {
        self.get();
      }
    };

    this.xhr = this.request();

    if (global.XDomainRequest && this.xhr instanceof XDomainRequest) {
      this.xhr.onload = onload;
      this.xhr.onerror = onerror;
    } else {
      this.xhr.onreadystatechange = stateChange;
    }

    this.xhr.send(null);
  };

  /**
   * Handle the unclean close behavior.
   *
   * @api private
   */

  XHRPolling.prototype.onClose = function () {
    io.Transport.XHR.prototype.onClose.call(this);

    if (this.xhr) {
      this.xhr.onreadystatechange = this.xhr.onload = this.xhr.onerror = empty;
      try {
        this.xhr.abort();
      } catch(e){}
      this.xhr = null;
    }
  };

  /**
   * Webkit based browsers show a infinit spinner when you start a XHR request
   * before the browsers onload event is called so we need to defer opening of
   * the transport until the onload event is called. Wrapping the cb in our
   * defer method solve this.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  XHRPolling.prototype.ready = function (socket, fn) {
    var self = this;

    io.util.defer(function () {
      fn.call(self);
    });
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('xhr-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {
  /**
   * There is a way to hide the loading indicator in Firefox. If you create and
   * remove a iframe it will stop showing the current loading indicator.
   * Unfortunately we can't feature detect that and UA sniffing is evil.
   *
   * @api private
   */

  var indicator = global.document && "MozAppearance" in
    global.document.documentElement.style;

  /**
   * Expose constructor.
   */

  exports['jsonp-polling'] = JSONPPolling;

  /**
   * The JSONP transport creates an persistent connection by dynamically
   * inserting a script tag in the page. This script tag will receive the
   * information of the Socket.IO server. When new information is received
   * it creates a new script tag for the new data stream.
   *
   * @constructor
   * @extends {io.Transport.xhr-polling}
   * @api public
   */

  function JSONPPolling (socket) {
    io.Transport['xhr-polling'].apply(this, arguments);

    this.index = io.j.length;

    var self = this;

    io.j.push(function (msg) {
      self._(msg);
    });
  };

  /**
   * Inherits from XHR polling transport.
   */

  io.util.inherit(JSONPPolling, io.Transport['xhr-polling']);

  /**
   * Transport name
   *
   * @api public
   */

  JSONPPolling.prototype.name = 'jsonp-polling';

  /**
   * Posts a encoded message to the Socket.IO server using an iframe.
   * The iframe is used because script tags can create POST based requests.
   * The iframe is positioned outside of the view so the user does not
   * notice it's existence.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  JSONPPolling.prototype.post = function (data) {
    var self = this
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (!this.form) {
      var form = document.createElement('form')
        , area = document.createElement('textarea')
        , id = this.iframeId = 'socketio_iframe_' + this.index
        , iframe;

      form.className = 'socketio';
      form.style.position = 'absolute';
      form.style.top = '0px';
      form.style.left = '0px';
      form.style.display = 'none';
      form.target = id;
      form.method = 'POST';
      form.setAttribute('accept-charset', 'utf-8');
      area.name = 'd';
      form.appendChild(area);
      document.body.appendChild(form);

      this.form = form;
      this.area = area;
    }

    this.form.action = this.prepareUrl() + query;

    function complete () {
      initIframe();
      self.socket.setBuffer(false);
    };

    function initIframe () {
      if (self.iframe) {
        self.form.removeChild(self.iframe);
      }

      try {
        // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
        iframe = document.createElement('<iframe name="'+ self.iframeId +'">');
      } catch (e) {
        iframe = document.createElement('iframe');
        iframe.name = self.iframeId;
      }

      iframe.id = self.iframeId;

      self.form.appendChild(iframe);
      self.iframe = iframe;
    };

    initIframe();

    // we temporarily stringify until we figure out how to prevent
    // browsers from turning `\n` into `\r\n` in form inputs
    this.area.value = io.JSON.stringify(data);

    try {
      this.form.submit();
    } catch(e) {}

    if (this.iframe.attachEvent) {
      iframe.onreadystatechange = function () {
        if (self.iframe.readyState == 'complete') {
          complete();
        }
      };
    } else {
      this.iframe.onload = complete;
    }

    this.socket.setBuffer(true);
  };

  /**
   * Creates a new JSONP poll that can be used to listen
   * for messages from the Socket.IO server.
   *
   * @api private
   */

  JSONPPolling.prototype.get = function () {
    var self = this
      , script = document.createElement('script')
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (this.script) {
      this.script.parentNode.removeChild(this.script);
      this.script = null;
    }

    script.async = true;
    script.src = this.prepareUrl() + query;
    script.onerror = function () {
      self.onClose();
    };

    var insertAt = document.getElementsByTagName('script')[0];
    insertAt.parentNode.insertBefore(script, insertAt);
    this.script = script;

    if (indicator) {
      setTimeout(function () {
        var iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        document.body.removeChild(iframe);
      }, 100);
    }
  };

  /**
   * Callback function for the incoming message stream from the Socket.IO server.
   *
   * @param {String} data The message
   * @api private
   */

  JSONPPolling.prototype._ = function (msg) {
    this.onData(msg);
    if (this.isOpen) {
      this.get();
    }
    return this;
  };

  /**
   * The indicator hack only works after onload
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  JSONPPolling.prototype.ready = function (socket, fn) {
    var self = this;
    if (!indicator) return fn.call(this);

    io.util.load(function () {
      fn.call(self);
    });
  };

  /**
   * Checks if browser supports this transport.
   *
   * @return {Boolean}
   * @api public
   */

  JSONPPolling.check = function () {
    return 'document' in global;
  };

  /**
   * Check if cross domain requests are supported
   *
   * @returns {Boolean}
   * @api public
   */

  JSONPPolling.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('jsonp-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

if (typeof define === "function" && define.amd) {
  define('socket.io',[], function () { return io; });
}
})();

function SBSocket(){};
define('SBSocket',['jquery1.7.1', 'socket.io'], function ($) {

    var jQuery = $;

    SBSocket.useSocketio = true;
    SBSocket.jsonpPolling = false;
    SBSocket.version = [1, 1, 0, 0];
    SBSocket.versionDetectionFailed = true; // for debug
    SBSocket.startPort = 54740;
    SBSocket.endport = 54760;

    SBSocket.init = function () {
        tryPort(SBSocket.startPort);
    }

    function tryPort(port) {
        var _url = "http://127.0.0.1:";
        var _port = port;
        if ($.browser.msie) {
            var ver = $.browser.version.split(".");
            var ieVer = parseInt(ver[0], 10);
            if (ieVer < 10 && window.XDomainRequest) { var httpRegEx = /^https?:\/\//i; var getOrPostRegEx = /^get|post$/i; var sameSchemeRegEx = new RegExp("^" + location.protocol, "i"); var xmlRegEx = /\/xml/i; jQuery.ajaxTransport("text html xml json", function (a, b, c) { if (a.crossDomain && getOrPostRegEx.test(a.type) && httpRegEx.test(b.url) && sameSchemeRegEx.test(b.url)) { var d = null; var e = (b.dataType || "").toLowerCase(); return { send: function (c, f) { d = new XDomainRequest; if (/^\d+$/.test(b.timeout)) { d.timeout = b.timeout } d.ontimeout = function () { f(500, "timeout") }; d.onload = function () { var a = "Content-Length: " + d.responseText.length + "\r\nContent-Type: " + d.contentType; var b = { code: 200, message: "success" }; var c = { text: d.responseText }; try { if (e === "json") { try { c.json = JSON.parse(d.responseText) } catch (g) { b.code = 500; b.message = "parseerror" } } else if (e === "xml" || e !== "text" && xmlRegEx.test(d.contentType)) { var h = new ActiveXObject("Microsoft.XMLDOM"); h.async = false; try { h.loadXML(d.responseText) } catch (g) { h = undefined } if (!h || !h.documentElement || h.getElementsByTagName("parsererror").length) { b.code = 500; b.message = "parseerror"; throw "Invalid XML: " + d.responseText } c.xml = h } } catch (i) { throw i } finally { f(b.code, b.message, c, a) } }; d.onerror = function () { f(500, "error", { text: d.responseText }) }; d.open(a.type, a.url); if (a.type == "POST") { d.send(JSON.stringify(b.data)) } else { d.send() } }, abort: function () { if (d) { d.abort() } } } } }) }

            if (location.protocol === "https:") {
                _url = "https://localhost:"
                _port = port + 1;
            }
        }

        $.ajax({ url: _url + _port + "/version",
            dataType: 'json',
            type: "GET",
            crossDomain: true,
            success: function (data) {
                SBSocket.versionDetectionFailed = false;
                try {
                    var verArray = data.split(".");
                    if (verArray.length == 4) {
                        var ver = [1, 0, 0, 0];
                        var i = 0;
                        verArray.forEach(function (e) {
                            if ((ver[i] = parseInt(e, 10)) != NaN) i++;
                        });
                        setUpBackend(ver);
                    }
                } catch (e) {
                }
            },
            error: function (xhr, e, t) {
                if (t.number == -2147024891 && $.browser.msie && location.protocol === "https:") {
                    SBSocket.jsonpPolling = true;
                    io.util.ua.hasCORS = false;
                    io.transports = ["jsonp-polling"];
                    var ver = [1, 2, 0, 0];
                    setUpBackend(ver);
                    return;
                }

                if (port < SBSocket.endport) {
                    tryPort(port + 5);
                }
                else {
                    var ver = [1, 0, 0, 0];
                    setUpBackend(ver);
                }
            },
            timeout: 500,
            async: false,
            cache: false
        });
    }

    function setUpBackend(version) {

        if (version[0] <= 1 && version[1] <= 1) {
            SBSocket.useSocketio = false;

            // replace the WebSocket for IE
            if (navigator.userAgent.indexOf('MSIE') > 0) {
                window.WebSocket = undefined;
                window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION = false;
                window.WEB_SOCKET_SWF_LOCATION = "http://api.smarttech.com/lib/" + "lib/WebSocketMain.swf";

                var swfobject_ = function () { var D = "undefined", r = "object", S = "Shockwave Flash", W = "ShockwaveFlash.ShockwaveFlash", q = "application/x-shockwave-flash", R = "SWFObjectExprInst", x = "onreadystatechange", O = window, j = document, t = navigator, T = false, U = [h], o = [], N = [], I = [], l, Q, E, B, J = false, a = false, n, G, m = true, M = function () { var aa = typeof j.getElementById != D && typeof j.getElementsByTagName != D && typeof j.createElement != D, ah = t.userAgent.toLowerCase(), Y = t.platform.toLowerCase(), ae = Y ? /win/.test(Y) : /win/.test(ah), ac = Y ? /mac/.test(Y) : /mac/.test(ah), af = /webkit/.test(ah) ? parseFloat(ah.replace(/^.*webkit\/(\d+(\.\d+)?).*$/, "$1")) : false, X = ! +"\v1", ag = [0, 0, 0], ab = null; if (typeof t.plugins != D && typeof t.plugins[S] == r) { ab = t.plugins[S].description; if (ab && !(typeof t.mimeTypes != D && t.mimeTypes[q] && !t.mimeTypes[q].enabledPlugin)) { T = true; X = false; ab = ab.replace(/^.*\s+(\S+\s+\S+$)/, "$1"); ag[0] = parseInt(ab.replace(/^(.*)\..*$/, "$1"), 10); ag[1] = parseInt(ab.replace(/^.*\.(.*)\s.*$/, "$1"), 10); ag[2] = /[a-zA-Z]/.test(ab) ? parseInt(ab.replace(/^.*[a-zA-Z]+(.*)$/, "$1"), 10) : 0 } } else { if (typeof O.ActiveXObject != D) { try { var ad = new ActiveXObject(W); if (ad) { ab = ad.GetVariable("$version"); if (ab) { X = true; ab = ab.split(" ")[1].split(","); ag = [parseInt(ab[0], 10), parseInt(ab[1], 10), parseInt(ab[2], 10)] } } } catch (Z) { } } } return { w3: aa, pv: ag, wk: af, ie: X, win: ae, mac: ac} } (), k = function () { if (!M.w3) { return } if ((typeof j.readyState != D && j.readyState == "complete") || (typeof j.readyState == D && (j.getElementsByTagName("body")[0] || j.body))) { f() } if (!J) { if (typeof j.addEventListener != D) { j.addEventListener("DOMContentLoaded", f, false) } if (M.ie && M.win) { j.attachEvent(x, function () { if (j.readyState == "complete") { j.detachEvent(x, arguments.callee); f() } }); if (O == top) { (function () { if (J) { return } try { j.documentElement.doScroll("left") } catch (X) { setTimeout(arguments.callee, 0); return } f() })() } } if (M.wk) { (function () { if (J) { return } if (!/loaded|complete/.test(j.readyState)) { setTimeout(arguments.callee, 0); return } f() })() } s(f) } } (); function f() { if (J) { return } try { var Z = j.getElementsByTagName("body")[0].appendChild(C("span")); Z.parentNode.removeChild(Z) } catch (aa) { return } J = true; var X = U.length; for (var Y = 0; Y < X; Y++) { U[Y]() } } function K(X) { if (J) { X() } else { U[U.length] = X } } function s(Y) { if (typeof O.addEventListener != D) { O.addEventListener("load", Y, false) } else { if (typeof j.addEventListener != D) { j.addEventListener("load", Y, false) } else { if (typeof O.attachEvent != D) { i(O, "onload", Y) } else { if (typeof O.onload == "function") { var X = O.onload; O.onload = function () { X(); Y() } } else { O.onload = Y } } } } } function h() { if (T) { V() } else { H() } } function V() { var X = j.getElementsByTagName("body")[0]; var aa = C(r); aa.setAttribute("type", q); var Z = X.appendChild(aa); if (Z) { var Y = 0; (function () { if (typeof Z.GetVariable != D) { var ab = Z.GetVariable("$version"); if (ab) { ab = ab.split(" ")[1].split(","); M.pv = [parseInt(ab[0], 10), parseInt(ab[1], 10), parseInt(ab[2], 10)] } } else { if (Y < 10) { Y++; setTimeout(arguments.callee, 10); return } } X.removeChild(aa); Z = null; H() })() } else { H() } } function H() { var ag = o.length; if (ag > 0) { for (var af = 0; af < ag; af++) { var Y = o[af].id; var ab = o[af].callbackFn; var aa = { success: false, id: Y }; if (M.pv[0] > 0) { var ae = c(Y); if (ae) { if (F(o[af].swfVersion) && !(M.wk && M.wk < 312)) { w(Y, true); if (ab) { aa.success = true; aa.ref = z(Y); ab(aa) } } else { if (o[af].expressInstall && A()) { var ai = {}; ai.data = o[af].expressInstall; ai.width = ae.getAttribute("width") || "0"; ai.height = ae.getAttribute("height") || "0"; if (ae.getAttribute("class")) { ai.styleclass = ae.getAttribute("class") } if (ae.getAttribute("align")) { ai.align = ae.getAttribute("align") } var ah = {}; var X = ae.getElementsByTagName("param"); var ac = X.length; for (var ad = 0; ad < ac; ad++) { if (X[ad].getAttribute("name").toLowerCase() != "movie") { ah[X[ad].getAttribute("name")] = X[ad].getAttribute("value") } } P(ai, ah, Y, ab) } else { p(ae); if (ab) { ab(aa) } } } } } else { w(Y, true); if (ab) { var Z = z(Y); if (Z && typeof Z.SetVariable != D) { aa.success = true; aa.ref = Z } ab(aa) } } } } } function z(aa) { var X = null; var Y = c(aa); if (Y && Y.nodeName == "OBJECT") { if (typeof Y.SetVariable != D) { X = Y } else { var Z = Y.getElementsByTagName(r)[0]; if (Z) { X = Z } } } return X } function A() { return !a && F("6.0.65") && (M.win || M.mac) && !(M.wk && M.wk < 312) } function P(aa, ab, X, Z) { a = true; E = Z || null; B = { success: false, id: X }; var ae = c(X); if (ae) { if (ae.nodeName == "OBJECT") { l = g(ae); Q = null } else { l = ae; Q = X } aa.id = R; if (typeof aa.width == D || (!/%$/.test(aa.width) && parseInt(aa.width, 10) < 310)) { aa.width = "310" } if (typeof aa.height == D || (!/%$/.test(aa.height) && parseInt(aa.height, 10) < 137)) { aa.height = "137" } j.title = j.title.slice(0, 47) + " - Flash Player Installation"; var ad = M.ie && M.win ? "ActiveX" : "PlugIn", ac = "MMredirectURL=" + O.location.toString().replace(/&/g, "%26") + "&MMplayerType=" + ad + "&MMdoctitle=" + j.title; if (typeof ab.flashvars != D) { ab.flashvars += "&" + ac } else { ab.flashvars = ac } if (M.ie && M.win && ae.readyState != 4) { var Y = C("div"); X += "SWFObjectNew"; Y.setAttribute("id", X); ae.parentNode.insertBefore(Y, ae); ae.style.display = "none"; (function () { if (ae.readyState == 4) { ae.parentNode.removeChild(ae) } else { setTimeout(arguments.callee, 10) } })() } u(aa, ab, X) } } function p(Y) { if (M.ie && M.win && Y.readyState != 4) { var X = C("div"); Y.parentNode.insertBefore(X, Y); X.parentNode.replaceChild(g(Y), X); Y.style.display = "none"; (function () { if (Y.readyState == 4) { Y.parentNode.removeChild(Y) } else { setTimeout(arguments.callee, 10) } })() } else { Y.parentNode.replaceChild(g(Y), Y) } } function g(ab) { var aa = C("div"); if (M.win && M.ie) { aa.innerHTML = ab.innerHTML } else { var Y = ab.getElementsByTagName(r)[0]; if (Y) { var ad = Y.childNodes; if (ad) { var X = ad.length; for (var Z = 0; Z < X; Z++) { if (!(ad[Z].nodeType == 1 && ad[Z].nodeName == "PARAM") && !(ad[Z].nodeType == 8)) { aa.appendChild(ad[Z].cloneNode(true)) } } } } } return aa } function u(ai, ag, Y) { var X, aa = c(Y); if (M.wk && M.wk < 312) { return X } if (aa) { if (typeof ai.id == D) { ai.id = Y } if (M.ie && M.win) { var ah = ""; for (var ae in ai) { if (ai[ae] != Object.prototype[ae]) { if (ae.toLowerCase() == "data") { ag.movie = ai[ae] } else { if (ae.toLowerCase() == "styleclass") { ah += ' class="' + ai[ae] + '"' } else { if (ae.toLowerCase() != "classid") { ah += " " + ae + '="' + ai[ae] + '"' } } } } } var af = ""; for (var ad in ag) { if (ag[ad] != Object.prototype[ad]) { af += '<param name="' + ad + '" value="' + ag[ad] + '" />' } } aa.outerHTML = '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"' + ah + ">" + af + "</object>"; N[N.length] = ai.id; X = c(ai.id) } else { var Z = C(r); Z.setAttribute("type", q); for (var ac in ai) { if (ai[ac] != Object.prototype[ac]) { if (ac.toLowerCase() == "styleclass") { Z.setAttribute("class", ai[ac]) } else { if (ac.toLowerCase() != "classid") { Z.setAttribute(ac, ai[ac]) } } } } for (var ab in ag) { if (ag[ab] != Object.prototype[ab] && ab.toLowerCase() != "movie") { e(Z, ab, ag[ab]) } } aa.parentNode.replaceChild(Z, aa); X = Z } } return X } function e(Z, X, Y) { var aa = C("param"); aa.setAttribute("name", X); aa.setAttribute("value", Y); Z.appendChild(aa) } function y(Y) { var X = c(Y); if (X && X.nodeName == "OBJECT") { if (M.ie && M.win) { X.style.display = "none"; (function () { if (X.readyState == 4) { b(Y) } else { setTimeout(arguments.callee, 10) } })() } else { X.parentNode.removeChild(X) } } } function b(Z) { var Y = c(Z); if (Y) { for (var X in Y) { if (typeof Y[X] == "function") { Y[X] = null } } Y.parentNode.removeChild(Y) } } function c(Z) { var X = null; try { X = j.getElementById(Z) } catch (Y) { } return X } function C(X) { return j.createElement(X) } function i(Z, X, Y) { Z.attachEvent(X, Y); I[I.length] = [Z, X, Y] } function F(Z) { var Y = M.pv, X = Z.split("."); X[0] = parseInt(X[0], 10); X[1] = parseInt(X[1], 10) || 0; X[2] = parseInt(X[2], 10) || 0; return (Y[0] > X[0] || (Y[0] == X[0] && Y[1] > X[1]) || (Y[0] == X[0] && Y[1] == X[1] && Y[2] >= X[2])) ? true : false } function v(ac, Y, ad, ab) { if (M.ie && M.mac) { return } var aa = j.getElementsByTagName("head")[0]; if (!aa) { return } var X = (ad && typeof ad == "string") ? ad : "screen"; if (ab) { n = null; G = null } if (!n || G != X) { var Z = C("style"); Z.setAttribute("type", "text/css"); Z.setAttribute("media", X); n = aa.appendChild(Z); if (M.ie && M.win && typeof j.styleSheets != D && j.styleSheets.length > 0) { n = j.styleSheets[j.styleSheets.length - 1] } G = X } if (M.ie && M.win) { if (n && typeof n.addRule == r) { n.addRule(ac, Y) } } else { if (n && typeof j.createTextNode != D) { n.appendChild(j.createTextNode(ac + " {" + Y + "}")) } } } function w(Z, X) { if (!m) { return } var Y = X ? "visible" : "hidden"; if (J && c(Z)) { c(Z).style.visibility = Y } else { v("#" + Z, "visibility:" + Y) } } function L(Y) { var Z = /[\\\"<>\.;]/; var X = Z.exec(Y) != null; return X && typeof encodeURIComponent != D ? encodeURIComponent(Y) : Y } var d = function () { if (M.ie && M.win) { window.attachEvent("onunload", function () { var ac = I.length; for (var ab = 0; ab < ac; ab++) { I[ab][0].detachEvent(I[ab][1], I[ab][2]) } var Z = N.length; for (var aa = 0; aa < Z; aa++) { y(N[aa]) } for (var Y in M) { M[Y] = null } M = null; for (var X in swfobject_) { swfobject_[X] = null } swfobject_ = null }) } } (); return { registerObject: function (ab, X, aa, Z) { if (M.w3 && ab && X) { var Y = {}; Y.id = ab; Y.swfVersion = X; Y.expressInstall = aa; Y.callbackFn = Z; o[o.length] = Y; w(ab, false) } else { if (Z) { Z({ success: false, id: ab }) } } }, getObjectById: function (X) { if (M.w3) { return z(X) } }, embedSWF: function (ab, ah, ae, ag, Y, aa, Z, ad, af, ac) { var X = { success: false, id: ah }; if (M.w3 && !(M.wk && M.wk < 312) && ab && ah && ae && ag && Y) { w(ah, false); K(function () { ae += ""; ag += ""; var aj = {}; if (af && typeof af === r) { for (var al in af) { aj[al] = af[al] } } aj.data = ab; aj.width = ae; aj.height = ag; var am = {}; if (ad && typeof ad === r) { for (var ak in ad) { am[ak] = ad[ak] } } if (Z && typeof Z === r) { for (var ai in Z) { if (typeof am.flashvars != D) { am.flashvars += "&" + ai + "=" + Z[ai] } else { am.flashvars = ai + "=" + Z[ai] } } } if (F(Y)) { var an = u(aj, am, ah); if (aj.id == ah) { w(ah, true) } X.success = true; X.ref = an } else { if (aa && A()) { aj.data = aa; P(aj, am, ah, ac); return } else { w(ah, true) } } if (ac) { ac(X) } }) } else { if (ac) { ac(X) } } }, switchOffAutoHideShow: function () { m = false }, ua: M, getFlashPlayerVersion: function () { return { major: M.pv[0], minor: M.pv[1], release: M.pv[2]} }, hasFlashPlayerVersion: F, createSWF: function (Z, Y, X) { if (M.w3) { return u(Z, Y, X) } else { return undefined } }, showExpressInstall: function (Z, aa, X, Y) { if (M.w3 && A()) { P(Z, aa, X, Y) } }, removeSWF: function (X) { if (M.w3) { y(X) } }, createCSS: function (aa, Z, Y, X) { if (M.w3) { v(aa, Z, Y, X) } }, addDomLoadEvent: K, addLoadEvent: s, getQueryParamValue: function (aa) { var Z = j.location.search || j.location.hash; if (Z) { if (/\?/.test(Z)) { Z = Z.split("?")[1] } if (aa == null) { return L(Z) } var Y = Z.split("&"); for (var X = 0; X < Y.length; X++) { if (Y[X].substring(0, Y[X].indexOf("=")) == aa) { return L(Y[X].substring((Y[X].indexOf("=") + 1))) } } } return "" }, expressInstallCallback: function () { if (a) { var X = c(R); if (X && l) { X.parentNode.replaceChild(l, X); if (Q) { w(Q, true); if (M.ie && M.win) { l.style.display = "block" } } if (E) { E(B) } } a = false } } } } ();
                window.swfobject_ = swfobject_;

                (function () {
                    if (window.WEB_SOCKET_FORCE_FLASH) {
                        // Keeps going.
                    } else if (window.WebSocket) {
                        return;
                    } else if (window.MozWebSocket) {
                        window.WebSocket = MozWebSocket;
                        return;
                    }

                    var swfobject_ = window.swfobject_;
                    var logger;
                    if (window.WEB_SOCKET_LOGGER) {
                        logger = WEB_SOCKET_LOGGER;
                    } else if (window.console && window.console.log && window.console.error) {
                        logger = window.console;
                    } else {
                        logger = { log: function () { }, error: function () { } };
                    }

                    if (swfobject_.getFlashPlayerVersion().major < 10) {
                        logger.error("Flash Player >= 10.0.0 is required.");
                        return;
                    }
                    if (location.protocol == "file:") {
                        logger.error(
                            "WARNING: web-socket-js doesn't work in file:///... URL " +
                                "unless you set Flash Security Settings properly. " +
                                "Open the page via Web server i.e. http://...");
                    }

                    window.WebSocket = function (url, protocols, proxyHost, proxyPort, headers) {
                        var self = this;
                        self.__id = WebSocket.__nextId++;
                        WebSocket.__instances[self.__id] = self;
                        self.readyState = WebSocket.CONNECTING;
                        self.bufferedAmount = 0;
                        self.__events = {};
                        if (!protocols) {
                            protocols = [];
                        } else if (typeof protocols == "string") {
                            protocols = [protocols];
                        }
                        self.__createTask = setTimeout(function () {
                            WebSocket.__addTask(function () {
                                self.__createTask = null;
                                WebSocket.__flash.create(
                                    self.__id, url, protocols, proxyHost || null, proxyPort || 0, headers || null);
                            });
                        }, 0);
                    };

                    WebSocket.prototype.send = function (data) {
                        if (this.readyState == WebSocket.CONNECTING) {
                            throw "INVALID_STATE_ERR: Web Socket connection has not been established";
                        }
                        var result = WebSocket.__flash.send(this.__id, encodeURIComponent(data));
                        if (result < 0) {
                            return true;
                        } else {
                            this.bufferedAmount += result;
                            return false;
                        }
                    };

                    WebSocket.prototype.close = function () {
                        if (this.__createTask) {
                            clearTimeout(this.__createTask);
                            this.__createTask = null;
                            this.readyState = WebSocket.CLOSED;
                            return;
                        }
                        if (this.readyState == WebSocket.CLOSED || this.readyState == WebSocket.CLOSING) {
                            return;
                        }
                        this.readyState = WebSocket.CLOSING;
                        WebSocket.__flash.close(this.__id);
                    };

                    WebSocket.prototype.addEventListener = function (type, listener, useCapture) {
                        if (!(type in this.__events)) {
                            this.__events[type] = [];
                        }
                        this.__events[type].push(listener);
                    };

                    WebSocket.prototype.removeEventListener = function (type, listener, useCapture) {
                        if (!(type in this.__events)) return;
                        var events = this.__events[type];
                        for (var i = events.length - 1; i >= 0; --i) {
                            if (events[i] === listener) {
                                events.splice(i, 1);
                                break;
                            }
                        }
                    };

                    WebSocket.prototype.dispatchEvent = function (event) {
                        var events = this.__events[event.type] || [];
                        for (var i = 0; i < events.length; ++i) {
                            events[i](event);
                        }
                        var handler = this["on" + event.type];
                        if (handler) handler.apply(this, [event]);
                    };

                    WebSocket.prototype.__handleEvent = function (flashEvent) {

                        if ("readyState" in flashEvent) {
                            this.readyState = flashEvent.readyState;
                        }
                        if ("protocol" in flashEvent) {
                            this.protocol = flashEvent.protocol;
                        }

                        var jsEvent;
                        if (flashEvent.type == "open" || flashEvent.type == "error") {
                            jsEvent = this.__createSimpleEvent(flashEvent.type);
                        } else if (flashEvent.type == "close") {
                            jsEvent = this.__createSimpleEvent("close");
                            jsEvent.wasClean = flashEvent.wasClean ? true : false;
                            jsEvent.code = flashEvent.code;
                            jsEvent.reason = flashEvent.reason;
                        } else if (flashEvent.type == "message") {
                            var data = decodeURIComponent(flashEvent.message);
                            jsEvent = this.__createMessageEvent("message", data);
                        } else {
                            throw "unknown event type: " + flashEvent.type;
                        }

                        this.dispatchEvent(jsEvent);

                    };

                    WebSocket.prototype.__createSimpleEvent = function (type) {
                        if (document.createEvent && window.Event) {
                            var event = document.createEvent("Event");
                            event.initEvent(type, false, false);
                            return event;
                        } else {
                            return { type: type, bubbles: false, cancelable: false };
                        }
                    };

                    WebSocket.prototype.__createMessageEvent = function (type, data) {
                        if (document.createEvent && window.MessageEvent && !window.opera) {
                            var event = document.createEvent("MessageEvent");
                            event.initMessageEvent("message", false, false, data, null, null, window, null);
                            return event;
                        } else {
                            return { type: type, data: data, bubbles: false, cancelable: false };
                        }
                    };

                    WebSocket.CONNECTING = 0;
                    WebSocket.OPEN = 1;
                    WebSocket.CLOSING = 2;
                    WebSocket.CLOSED = 3;

                    WebSocket.__isFlashImplementation = true;
                    WebSocket.__initialized = false;
                    WebSocket.__flash = null;
                    WebSocket.__instances = {};
                    WebSocket.__tasks = [];
                    WebSocket.__nextId = 0;

                    WebSocket.loadFlashPolicyFile = function (url) {
                        WebSocket.__addTask(function () {
                            WebSocket.__flash.loadManualPolicyFile(url);
                        });
                    };

                    WebSocket.__initialize = function () {

                        if (WebSocket.__initialized) return;
                        WebSocket.__initialized = true;

                        if (WebSocket.__swfLocation) {
                            window.WEB_SOCKET_SWF_LOCATION = WebSocket.__swfLocation;
                        }
                        if (!window.WEB_SOCKET_SWF_LOCATION) {
                            logger.error("[WebSocket] set WEB_SOCKET_SWF_LOCATION to location of WebSocketMain.swf");
                            return;
                        }
                        if (!window.WEB_SOCKET_SUPPRESS_CROSS_DOMAIN_SWF_ERROR &&
                            !window.WEB_SOCKET_SWF_LOCATION.match(/(^|\/)WebSocketMainInsecure\.swf(\?.*)?$/) &&
                            window.WEB_SOCKET_SWF_LOCATION.match(/^\w+:\/\/([^\/]+)/)) {
                            var swfHost = RegExp.$1;
                            if (location.host != swfHost) {
                                logger.error(
                                    "[WebSocket] You must host HTML and WebSocketMain.swf in the same host " +
                                        "('" + location.host + "' != '" + swfHost + "'). " +
                                        "See also 'How to host HTML file and SWF file in different domains' section " +
                                        "in README.md. If you use WebSocketMainInsecure.swf, you can suppress this message " +
                                        "by WEB_SOCKET_SUPPRESS_CROSS_DOMAIN_SWF_ERROR = true;");
                            }
                        }
                        var container = document.createElement("div");
                        container.id = "webSocketContainer";
                        container.style.position = "absolute";
                        if (WebSocket.__isFlashLite()) {
                            container.style.left = "0px";
                            container.style.top = "0px";
                        } else {
                            container.style.left = "-100px";
                            container.style.top = "-100px";
                        }
                        var holder = document.createElement("div");
                        holder.id = "webSocketFlash";
                        container.appendChild(holder);
                        document.body.appendChild(container);
                        swfobject_.embedSWF(
                            window.WEB_SOCKET_SWF_LOCATION,
                            "webSocketFlash",
                            "1" /* width */,
                            "1" /* height */,
                            "10.0.0" /* SWF version */,
                            null,
                            null,
                            { hasPriority: true, swliveconnect: true, allowScriptAccess: "always" },
                            null,
                            function (e) {
                                if (!e.success) {
                                    logger.error("[WebSocket] swfobject.embedSWF failed");
                                }
                            }
                        );

                    };

                    WebSocket.__onFlashInitialized = function () {
                        setTimeout(function () {
                            WebSocket.__flash = document.getElementById("webSocketFlash");
                            WebSocket.__flash.setCallerUrl(location.href);
                            WebSocket.__flash.setDebug(!!window.WEB_SOCKET_DEBUG);
                            for (var i = 0; i < WebSocket.__tasks.length; ++i) {
                                WebSocket.__tasks[i]();
                            }
                            WebSocket.__tasks = [];
                        }, 0);
                    };

                    WebSocket.__onFlashEvent = function () {
                        setTimeout(function () {
                            try {
                                var events = WebSocket.__flash.receiveEvents();
                                for (var i = 0; i < events.length; ++i) {
                                    WebSocket.__instances[events[i].webSocketId].__handleEvent(events[i]);
                                }
                            } catch (e) {
                                logger.error(e);
                            }
                        }, 0);
                        return true;
                    };

                    WebSocket.__log = function (message) {
                        logger.log(decodeURIComponent(message));
                    };

                    WebSocket.__error = function (message) {
                        logger.error(decodeURIComponent(message));
                    };

                    WebSocket.__addTask = function (task) {
                        if (WebSocket.__flash) {
                            task();
                        } else {
                            WebSocket.__tasks.push(task);
                        }
                    };

                    WebSocket.__isFlashLite = function () {
                        if (!window.navigator || !window.navigator.mimeTypes) {
                            return false;
                        }
                        var mimeType = window.navigator.mimeTypes["application/x-shockwave-flash"];
                        if (!mimeType || !mimeType.enabledPlugin || !mimeType.enabledPlugin.filename) {
                            return false;
                        }
                        return mimeType.enabledPlugin.filename.match(/flashlite/i) ? true : false;
                    };

                    if (!window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION) {
                        swfobject_.addDomLoadEvent(function () {
                            WebSocket.__initialize();
                        });
                    }

                })();
            }
        }
        // use socket.io
        else {
            SBSocket.useSocketio = true;
        }
    }

    SBSocket.connect = function (host, port) {
        var Sbsocket = new SBSocket;
        Sbsocket.socket = null;
        if (SBSocket.useSocketio) {
            Sbsocket.socket = io.connect(host, (location.protocol === 'https:') ? { 'force new connection': true, secure: true, transports: ($.browser.msie && location.protocol === "https:")? ['jsonp-polling']:['websocket', 'flashsocket', 'htmlfile', 'jsonp-polling', 'xhr-polling']} : { 'force new connection': true });
        }
        else {
            if (typeof WebSocket !== "undefined") {
                if (!(typeof (WebSocket.loadFlashPolicyFile) == "undefined")) {
                    WebSocket.loadFlashPolicyFile("xmlsocket://127.0.0.1:" + port);
                }
                Sbsocket.socket = new WebSocket(host);
            } else if (typeof MozWebSocket !== "undefined") {
                this.socket = new MozWebSocket(host);
            } else {
                console.log("Unable to connect, websockets not available");
            }
        }

        return Sbsocket;
    }

    SBSocket.prototype.disconnect = function () {
        if (SBSocket.useSocketio) {
            this.socket.disconnect();
        }
        else {
            this.socket.close();
        }
    }

    SBSocket.prototype.sendMessage = function (packet) {
        if (SBSocket.useSocketio) {
            this.socket.emit('message', packet);
        }
        else {
            if (this.socket.readyState == 1) {
                this.socket.send(JSON.stringify(packet));
            }
        }
    }

    SBSocket.prototype.onConnect = function (onConnect) {
        if (SBSocket.useSocketio) {
            this.socket.on('connect', onConnect);
        }
        else {
            this.socket.onopen = onConnect;
        }
    }

    SBSocket.prototype.onDisconnect = function (onDisconnect) {
        if (SBSocket.useSocketio) {
            this.socket.on('disconnect', onDisconnect)
        }
        else {
            this.socket.onclose = onDisconnect;
        }
    }

    SBSocket.prototype.onMessage = function (onMessage) {
        if (SBSocket.useSocketio) {
            this.socket.on('message', onMessage);
        }
        else {
            this.socket.onmessage = onMessage;
        }
    }
});
define('smartboard-amd-1.1.0',['jquery1.7.1', 'SBSocket'],function ($) {

    var jQuery = $;

    /**
     * @namespace
     * @name SB
     * @desc
     * The SMART Board Web Development Kit (SBWDK) exposes SMART Board functionality through the window.SB object.
     *
     * See [SMART Board WDK](http://api.smarttech.com/wdk/) for an introduction, and the [Quick Start and FAQ](http://api.smarttech.com/wdk/tutorial/) for details and demos
     */
    var SB = {};

    SB.jQuery = $;

    /**
     * Default value: false
     *
     * When set to true, the SBWDK will call {@link SB.onPoint} if it is defined.
     * @type boolean
     */
    SB.wantsSDKEvents = false;

    /**
     * @function
     * @fieldOf SB
     * @name onPoint
     * @type function
     * @desc If {@link SB.wantsSDKEvents} is set to true, this user defined function on SB (SB.onPoint) will be called
     * @param {float} x in page co-ordinates
     * @param {float} y in page co-ordinates
     * @param {integer} contactId A contact ID for this particular touch, and is guaranteed to be the same for a touch down, move, and up session.
     * @param {object} toolData A tool data structure, same as the one from onToolChange.  See {@link SB.onToolChange}.
     * @example
     * // To receive points from the SMART Board directly:
     * SB.wantsSDKEvents = true;
     * SB.onPoint = function(x, y, contactId, toolData) { console.log(x, y, contactId, toolData); };
     */

    /**
     * Default value: false
     *
     * When set to true, the SBWDK will send W3C compatible touch events to DOM elements
     *
     * See [Touch event types with SBWDK](http://api.smarttech.com/wdk/tutorial/index.html#touches)
     *
     * See [W3C touch events](http://www.w3.org/TR/2011/WD-touch-events-20110505/)
     *
     * @type boolean
     */
    SB.wantsTouches = false;

    /**
     * Default value: false
     *
     * By default, the SBWDK adds visualizations for touch points
     *
     * When set to true, the SBWDK will no longer visualize touch points (grey circles)
     *
     * @type boolean
     */
    SB.disableTouchPointers = false;

    /**
     * Default value: false
     *
     * When set to true, the touch points visualizations will contain debug data.
     * {@link SB.disableTouchPointers} has to be false.
     * @type boolean
     */
    SB.debugTouches = false;

    /**
     * Default value: false
     *
     * When set to true, SBWDK will no longer display banners when connecting to the SMART Board
     * @type boolean
     */
    SB.disableBanners = true;

    /**
     * Default value: false
     *
     * When set to true, SBWDK will no longer automatically turn controls created by INPUT and
     * TEXTAREA tags to be ink aware, see [Text entry example](http://api.smarttech.com/wdk/tutorial/samples/wdk-textentry.html)
     *
     * By default, the SBWDK will bind to the *touchstart* event on INPUT and TEXTAREA elements
     *
     * When *touchstart* event happens on that element, and if that touch is from a SMART Board, it will allow add a new element which represents a handwriting field for the user&#46;
     * This makes it easy for users to input text on a SMART Board.
     *
     * @type boolean
     */
    SB.disableInkFields = false;

    /**
     * Called when the user or other SMART software changes the tool.
     *
     * Your user defined function will be passed a toolData event, with fields explained below:
     * @example
     * // Sample tool change event, also the same format in touch event
     * SB.onToolChange = function(toolChangeEvent) { ... };
     * toolChangeEvent = {
            *     "color": [ 0, 0, 255 ],  // Color in [R,G,B] format
            *     "colorAsHTML": "#0000ff",  // Color in HTML format as a string
            *     "width": 3,  // Radius of pen in pixels
            *     "opacity": 1,  // Opacity of the pen (alpha value, 0 transparent, 1 opaque)
            *     "tool": "pen",  // Can be "pen", "eraser", or "finger"
            *     "_rawData": {   // Raw SBSDK data.  Not guaranteed to be available in future.
            *         "_rawXML": "<board id=\"10\">...",  // Raw data tool change XML
            *         "boardNumber": 10,  // Board ID
            *         "name": "polyline",
            *         "toolAttributes": {
            *             "fill": "none",
            *             "stroke-width": "3",
            *             "stroke": "#0000ff",
            *             "opacity": "1.0",
            *             "strokeAsRGB": [ 0, 0, 255 ]
            *         }
            *     }
            * }
     * @type function
     */
    SB.onToolChange = null;

    /**
     * Called when the user has moved in front of the SMART Board on supported boards.
     *
     * Your user defined function will be called with an event, which will contain an array which denotes where the presence, if detected, is in front of the SMART Board.
     *
     * - *"left"*
     * - *"right"*
     * - *"center"*
     *
     * @example
     * SB.onProximityStateChange = function(proximityStateChangeEvent) { ... };
     * proximityStateChangeEvent = {
            *     "proximityState": ["center"]  // Array containing one or more strings, one or combination of "left", "right", and "center".
            * }
     * @type function
     */
    SB.onProximityStateChange = null;


    /**
     * @function
     * @desc
     * Called at certain stages while the SBWDK is loading and attempting to connect.
     * Statuses that can be fired are:
     *
     * - *"Connecting"*
     *   - When the SBWDK is attempting to connect to the SMART Board
     * - *"Connected"*
     *   - When the SBWDK has successfully connected to the SMART Board
     * - *"Disconnected"*
     *   - When the SBWDK has disconnected from the SMART Board
     * - *"Unable to find service"*
     *   - When the SBWDK has not been able to connect to a SBWDK service (e.g. service is not running.)
     * - *"No boards attached"*
     *   - When the SBWDK has connected to the SMART Board Service, but there are no boards attached
     * - *"Server version out of date"*
     *   - WDK server version is not upt to date.
     * @param {string} status
     * @type function
     */
    SB.statusChanged = null;

    /**
     * @desc enable displaying of debug banners.
     * @type {boolean}
     */
    SB.enableDebugBanners = false;

    /**
     * Required minimum WDK server version.
     * @type {string}
     */
    SB.requiredVersion = "1.1.0.0";

    /**
     * @desc Generates real touch events.
     */
    SB.realTouchEvents = false;

    /**
     * @desc Disable simulating mouse down/up/click event on touch up event.
     * @type {boolean}
     */
    SB.generateMouseEventsOnTouchUp = true;

    SB.initializeSMARTBoard = initializeSMARTBoard;

    function initializeSMARTBoard() {
        var debugOn = false;
        var yourLocationOfSmartboardJS = "http://api.smarttech.com/lib/";
        // if embedding WDK client locally, change to this and copy WebSocketMain.swf to /lib on where web page is.
        //var yourLocationOfSmartboardJS = "";

        _SB_load_dependencies(window, yourLocationOfSmartboardJS, debugOn);

        SBSocket.init();

        // FireFox 4+ zoom level detection code from https://github.com/yonran/detect-zoom/blob/master/detect-zoom.js
        /* Detect-zoom
         * -----------
         * Cross Browser Zoom and Pixel Ratio Detector
         * Version 1.0.0 | Feb 5 2013
         * dual-licensed under the WTFPL and MIT license
         * Maintained by https://github/tombigel
         * Original developer https://github.com/yonran
         */

        function getFFZoomLevel() {

            var zoom = mediaQueryBinarySearch('min--moz-device-pixel-ratio', '', 0, 10, 20, 0.0001);
            zoom = Math.round(zoom * 100) / 100;
            return zoom;

            function mediaQueryBinarySearch (property, unit, a, b, maxIter, epsilon) {
                var matchMedia;
                var head, style, div;
                if (window.matchMedia) {
                    matchMedia = window.matchMedia;
                } else {
                    head = document.getElementsByTagName('head')[0];
                    style = document.createElement('style');
                    head.appendChild(style);


                    div = document.createElement('div');
                    div.className = 'mediaQueryBinarySearch';
                    div.style.display = 'none';
                    document.body.appendChild(div);


                    matchMedia = function (query) {
                        style.sheet.insertRule('@media ' + query + '{.mediaQueryBinarySearch ' + '{text-decoration: underline} }', 0);
                        var matched = getComputedStyle(div, null).textDecoration == 'underline';
                        style.sheet.deleteRule(0);
                        return { matches: matched };
                    };
                }
                var ratio = binarySearch(a, b, maxIter);
                if (div) {
                    head.removeChild(style);
                    document.body.removeChild(div);
                }
                return ratio;


                function binarySearch(a, b, maxIter) {
                    var mid = (a + b) / 2;
                    if (maxIter <= 0 || b - a < epsilon) {
                        return mid;
                    }
                    var query = "(" + property + ":" + mid + unit + ")";
                    if (matchMedia(query).matches) {
                        return binarySearch(mid, b, maxIter - 1);
                    } else {
                        return binarySearch(a, mid, maxIter - 1);
                    }
                }
            }
        }

        function getZoomLevel() {
            if ($.browser.msie) {
                return screen.deviceXDPI / screen.logicalXDPI;
            }
            else if ($.browser.webkit) {
                var zoom = Math.floor((window.outerWidth - 16) / window.innerWidth * 100) / 100;
                //if (zoom > 1.1 && zoom < 2.5) zoom = zoom - 0.01;
                //else if (zoom > 2.5 && zoom < 4) zoom = zoom - 0.02;
                //else if (zoom > 4) zoom = zoom - 0.03;
                return zoom;
            }
            else if ($.browser.mozilla) {
                return getFFZoomLevel();
            }
            else if ($.browser.opera) {
                return 1;
            }
            else {
                return 1;
            }
        }

        (function ($) {
            var debug = window._SB_debug;
            var isDefined = window._SB_isDefined;

            var SBScreen = {};
            window.SBScreen = SBScreen;

            var oldX = window.screenX;
            var oldY = window.screenY;
            var titleBarHeight = 0;
            var sideBarOnLeft = 0;
            var calibrationOffsetY = 0;
            var calibrationOffsetX = 0;
            var resized = false;
            var SB_SCREEN_DEBUG_ON = false;

            var interval = setInterval(function () {
                if (oldX != window.screenX || oldY != window.screenY || resized) {
                    debug("Moved:");
                    if (resized) {
                        debug("Resized:");
                        resized = false;
                    }
                    if (SB.invalidateCalibration) {
                        SB.invalidateCalibration();
                    }
                    if (SB.updateWindowRect) {
                        SB.updateWindowRect();
                    }
                }

                oldX = window.screenX;
                oldY = window.screenY;
            }, 500);

            window.onresize = function (event) {
                resized = true;
            };

            var _screen = {};

            function windowDebug() {
                var s = _screen;
                debug("(" + s.width + ", " + s.height + ")@[" + s.x + ', ' + s.y + "]");
            }

            function updateScreen() {
                _screen.x = window.screenX;
                _screen.y = window.screenY;

                var zoom = getZoomLevel();
                _screen.clientWidth = window.innerWidth * zoom;
                _screen.clientHeight = window.innerHeight * zoom;
                _screen.clientX = _screen.x + sideBarOnLeft;
                _screen.clientY = _screen.y + titleBarHeight;

                var scrollBarSize = 16;
                if (document.body.scrollHeight > _screen.clientHeight) {
                    _screen.clientWidth -= scrollBarSize;
                }

                if (document.body.scrollWidth > _screen.clientWidth) {
                    _screen.clientHeight -= scrollBarSize;
                }

                if (SBScreen.onWindowMoved) {
                    SBScreen.onWindowMoved();
                }

                if (SB_SCREEN_DEBUG_ON) {
                    windowDebug();
                }
            }

            function onCalibrate(evt) {
                var event = evt;
                if (event.type == "touchend") {
                    event = evt.changedTouches[0];
                }

                debug(event);
                var zoom = getZoomLevel();
                titleBarHeight = event.screenY - (event.pageY - window.pageYOffset) * zoom - window.screenY;
                sideBarOnLeft = event.screenX - (event.pageX - window.pageXOffset) * zoom - window.screenX;

                calibrationOffsetX = sideBarOnLeft - _screen.x;
                calibrationOffsetY = titleBarHeight - _screen.y;

                updateScreen();

                debug("The toolbars are: " + titleBarHeight + "px high");
                debug("Sidebar on left is: " + sideBarOnLeft + "px wide");
                windowDebug();
            }

            function convertX(x) {
                return parseInt(x);
            }

            function convertY(y) {
                return parseInt(y);
            }

            function clientToScreenX(x) {
                return _screen.x + x;
            }

            function clientToScreenY(y) {
                return _screen.y + titleBarHeight + y;
            }

            function fakeSDK(event) {
                var sx = event.screenX;
                var sy = event.screenY;
                debug("Screen:     " + sx + ", " + sy);
                debug("Page:       " + event.pageX + ", " + event.pageY);
                debug("Calibrated: " + convertX(sx) + ", " + convertY(sy));
            }

            SBScreen.getScreen = function () {
                return _screen;
            };

            SBScreen.calibrate = onCalibrate;
            SBScreen.onWindowMoved = null;
            SBScreen.convertX = convertX;
            SBScreen.convertY = convertY;
            SBScreen.clientToScreenX = clientToScreenX;
            SBScreen.clientToScreenY = clientToScreenY;

            $(window).ready(function () {
                windowDebug();
            });
        })($);

        var __touchIdentifierForPid = {};
        var __nextTouchIdentifer = 0;
        var SB_CALIBRATED = false;
        var wsUrl = "ws://127.0.0.1";
        var httpUrl = "http://127.0.0.1";

        (function ($) {
            window.__SB_PORT = 54740;
            if (SBSocket.useSocketio && location.protocol === 'https:') {
                window.__SB_PORT = 54741;
                httpUrl = wsUrl = "https://localhost";
            }
            var serverURL = httpUrl + ':' + window.__SB_PORT + "/";

            var debug = window._SB_debug;
            var isDefined = window._SB_isDefined;

            if (isDefined(window.SB)) {
                if (isDefined(window.SB.loaded)) {
                    debug("SB already loaded.  Double include?");
                    return;
                } else {
                    window.SB.loaded = true;
                }
            }

            var SB_PORT = window.__SB_PORT;
            var SB_CONNECTED = false;
            var SB_NUMBER_OF_BOARDS = 0;
            var SB_HAS_CONNECTED_ONCE = false;
            var SB_WINDOW_HAS_FOCUS = true;
            var SB_ATTEMPTING_TO_CONNECT = false;

            var _dialogs = {};
            _dialogs.webSocketsError = function () {
                $.notification({
                    title: "Sorry, your browser doesn't support web applications that are SMART Board aware.",
                    content: "You need Internet Explorer 9 or later, Safari, Chrome or Firefox.",
                    error: true,
                    timeout: 10000,
                    border: false
                });
            };
            _dialogs.stillConnecting = function () {
                if (!SB.enableDebugBanners) {
                    return;
                }
                $.notification({
                    title: "Connecting...",
                    content: "We're trying to connect to your SMART interactive product.",
                    timeout: 5000,
                    border: true
                });
            };
            _dialogs.unableToConnect = function () {
                $.notification({
                    title: "Whoops, we couldn't connect to your SMART interactive product.",
                    content: "Either the drivers are out-of-date or there isn't a SMART interactive product connected. Unfortunately, you're unable to take advantage of additional features. <br/><br/>Get a <a href='http://smarttech.com'>SMART Board</a> interactive whiteboard or interactive flat panel now.",
                    error: true,
                    timeout: 15000,
                    border: false
                });
            };
            _dialogs.displayBoardAwareBanner = function () {
                $.notification({
                    title: "This web application is SMART Board aware",
                    timeout: 4000,
                    border: true,
                    boardAware: true
                });
            };
            _dialogs.connectionSuccess = function () {
                if (SB.enableDebugBanners) {
                    $.notification({
                        title: "Connected!",
                        content: "You can now take advantage of your SMART product in this web application.",
                        okay: true,
                        timeout: 3000,
                        border: false
                    });
                } else {
                    _dialogs.displayBoardAwareBanner();
                }
            };

            _dialogs.serverVersionError = function () {
                $.notification({
                    title: "Sorry, this version of SMART Product Drivers does not meet the minimum requirements. Please update SMART Product Drivers.",
                    error: true,
                    timeout: 15000,
                    border: false
                });
            };

            var _portsToTry = (SBSocket.useSocketio && location.protocol === 'https:') ? [54741, 54746, 54751, 54756, 54761] : [54740, 54745, 54750, 54755, 54760];
            var _portsToTryIndex = -1;
            var _numberOfPortsTried = 0;

            var nextPort = function () {
                _portsToTryIndex = ++_portsToTryIndex % _portsToTry.length;
                return _portsToTry[_portsToTryIndex];
            };

            var _SB_connect = function () {
                if (!SB_WINDOW_HAS_FOCUS) return;

                var tryPort = function (p) {
                    debug("Trying port..");
                    if (SB_CONNECTED) return;
                    if (SB_ATTEMPTING_TO_CONNECT) return;

                    if (SB.statusChanged) { SB.statusChanged("Looking for service"); }

                    SB_ATTEMPTING_TO_CONNECT = true;

                    var port = window.__SB_PORT;

                    if (!SB_HAS_CONNECTED_ONCE) {
                        _numberOfPortsTried++;

                        if (_numberOfPortsTried == 5) {
                            _dialogs.stillConnecting();
                        }

                        if (_numberOfPortsTried > 20) {
                            _dialogs.unableToConnect();
                            if (SB.statusChanged) { SB.statusChanged("Unable to find service"); }
                            return;
                        }

                        port = nextPort();
                    }

                    try {
                        debug('Connecting to SBWDK on port ' + port);

                        var host = wsUrl + ':' + port + '/';
                        
                        var socket = SBSocket.connect(host, port);
                        socket.onConnect(function (data) {
                            socket.disconnect();
                            window.__SB_PORT = SB_PORT = port;
                            serverURL = httpUrl + ':' + window.__SB_PORT + "/";
                            _SB_connectUsingPort();
                        });

                        socket.onDisconnect(function (event) { SB_ATTEMPTING_TO_CONNECT = false; setTimeout(tryPort, 750); })
                    } catch (e) {

                    }
                };

                tryPort();
            };

            var boardSocket;

            /**
             * Control whether the SMART Board will send touches from the board as
             * mouse events or as SDK events.
             *
             * For example, if you have an existing web application that depends on
             * mouse events and you are not interested in multi-touch, you can set
             * this to true, in which case your application would behave as if the
             * user was using the mouse.
             * @param {boolean}
             */
            SB.useMouseEvents = function () { };

            function checkWDKServerVersion (successCallback, errorCallback) {

                function errorFunc () {
                    if (errorCallback != undefined && errorCallback) {
                        errorCallback();
                    }
                }

                $.ajax({ url: serverURL + "version",
                    dataType: 'json',
                    type: "GET",
                    success: function (data) {
                        try {
                            var version = data.split('.');
                            if (version.length != 4) {
                                errorFunc();
                                return;
                            } else {
                                var majorVer = version[0],
                                    minorVer = version[1],
                                    revision = version[2],
                                    buildVer = version[3],
                                    minVersion = SB.requiredVersion.split('.'),
                                    minMajorVer = minVersion[0],
                                    minMinorVer = minVersion[1],
                                    minRevision = minVersion[2],
                                    minBuildVer = minVersion[3];
                                if (minMajorVer > majorVer) {
                                    errorFunc();
                                    return;
                                } else if (minMajorVer === majorVer) {
                                    if (minMinorVer > minorVer) {
                                        errorFunc();
                                        return;
                                    } else if (minMinorVer === minorVer) {
                                        if (minRevision > revision) {
                                            errorFunc();
                                            return;
                                        } else if (minBuildVer > buildVer) {
                                            errorFunc();
                                            return;
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            errorFunc();
                            return;
                        }
                        if (successCallback != undefined && successCallback) {
                            successCallback();
                        }
                    },
                    error: function () {
                        errorFunc();
                    },
                    timeout: 500,
                    async: true,
                    cache: false
                });
            }

            var _SB_connectUsingPort = function () {
                if (SB.statusChanged) { SB.statusChanged("Connecting"); }
                if (SB_CONNECTED) return;
                SB.invalidateCalibration();

                var setupTimersAndCallbacks = function () {
                    var _SB_OnBlur = function () {
                        debug("Window: blur");
                        sendData("windowRect", { origin: [0, 0], size: [0, 0] });
                        SB.invalidateCalibration();
                        SB_CONNECTED = false;
                        boardSocket.disconnect();
                        SB_WINDOW_HAS_FOCUS = false;
                    };

                    var _SB_OnFocus = function () {
                        if (SB_WINDOW_HAS_FOCUS) return;

                        debug("Window: focus");
                        if (SB.updateWindowRect) {
                            SB.updateWindowRect();
                        }
                        SB_WINDOW_HAS_FOCUS = true;
                        _SB_connect();
                    };

                    (function () {
                        var hidden, change, vis = {
                            hidden: "visibilitychange",
                            mozHidden: "mozvisibilitychange",
                            webkitHidden: "webkitvisibilitychange",
                            msHidden: "msvisibilitychange",
                            oHidden: "ovisibilitychange"
                        };
                        for (hidden in vis) {
                            if (vis.hasOwnProperty(hidden) && hidden in document) {
                                change = vis[hidden];
                                break;
                            }
                        }
                        if (change)
                            document.addEventListener(change, onchange);
                        else if (/*@cc_on!@*/false)
                            document.onfocusin = document.onfocusout = onchange;
                        else
                            window.onfocus = window.onblur = onchange;

                        window.onfocus = window.onblur = onchange;

                        function onchange(evt) {
                            var body = document.body;
                            evt = evt || window.event;

                            if (evt.type == "focus" || evt.type == "focusin")
                                _SB_OnFocus();
                            else if (evt.type == "blur" || evt.type == "focusout") {
                                if ($.browser.msie && evt.relatedTarget != null) return;
                                _SB_OnBlur();
                            }
                            else
                            if (this[hidden]) {
                                if ($.browser.msie && evt.relatedTarget != null) return;
                                _SB_OnBlur();
                            } else {
                                _SB_OnFocus();
                            }
                        }
                    })();

                    setInterval(function () {
                        if (!SB_CONNECTED) {
                            _SB_connect();
                        }
                    }, 10000);
                };

                try {
                    var host = wsUrl + ":" + SB_PORT + "/";
                    boardSocket = SBSocket.connect(host, window.__SB_PORT);
                } catch (e) {
                    _dialogs.webSocketsError();
                    debug("Could not connect.");
                    if (SB.statusChanged) { SB.statusChanged("Unable to connect"); }
                }

                function versionErrorStatusOnly () {
                    if (SB.statusChanged) { SB.statusChanged("Server version out of date"); }
                }

                function versionError() {
                    _dialogs.serverVersionError();
                    versionErrorStatusOnly();
                }

                boardSocket.onConnect(function () {
                    if (SB.updateWindowRect) {
                        SB.updateWindowRect();
                    }
                    if (SB.statusChanged) { SB.statusChanged("Connected"); }
                    SB_CONNECTED = true;

                    if (!SB_HAS_CONNECTED_ONCE) {
                        debug("Connected.");
                        setupTimersAndCallbacks();
                        $.ajax({ url: serverURL + "api/1.0.0/numberOfBoards",
                            dataType: 'json',
                            type: "GET",
                            success: function (data) {
                                try {
                                    SB_NUMBER_OF_BOARDS = parseInt(JSON.parse(data), 10);
                                    if (SB_NUMBER_OF_BOARDS > 0) {
                                        checkWDKServerVersion(_dialogs.connectionSuccess, versionError);
                                    } else {
                                        _dialogs.unableToConnect();
                                        if (SB.statusChanged) { SB.statusChanged("No boards attached"); }
                                    }
                                } catch (e) {
                                    _dialogs.unableToConnect();
                                    if (SB.statusChanged) { SB.statusChanged("No boards attached"); }
                                }
                            },
                            error: function () {
                                _dialogs.unableToConnect();
                                if (SB.statusChanged) { SB.statusChanged("No boards attached"); }
                            },
                            timeout: 500,
                            async: true,
                            cache: false
                        });
                    } else if (SB_NUMBER_OF_BOARDS > 0) {
                        var packet = {};
                        packet["type"] = "toolChange";
                        $.ajax({ url: serverURL + "api/1.0.0/currentTool",
                            dataType: 'json',
                            success: function (result) {
                                packet["data"] = result;
                            },
                            timeout: 150,
                            async: false,
                            cache: false
                        });
                        _SB_dispatch(packet);
                        checkWDKServerVersion(null, versionErrorStatusOnly);
                        debug("Reconnected.");
                    } else {
                        if (SB.statusChanged) { SB.statusChanged("No boards attached"); }
                    }


                    SB_HAS_CONNECTED_ONCE = true;
                    SB_ATTEMPTING_TO_CONNECT = false;
                });

                boardSocket.onDisconnect(function () {
                    // send an empty packet so current touches are canceled
                    var packet = {type: "points", data: []};
                    window._SB_dispatch(packet);
                    SB.invalidateCalibration();
                    SB_CONNECTED = false;
                    debug("Disconnected.");
                    if (SB.statusChanged) { SB.statusChanged("Disconnected"); }
                });

                boardSocket.onMessage(function (msg) {
                    debug("Received: " + msg);
                    processData(SBSocket.useSocketio ? msg:msg.data, sendData);
                });

                var sendData = function (type, data) {
                    var packet = {};
                    packet.type = type;
                    packet.data = data;
                    boardSocket.sendMessage(packet);
                };

                SB.useMouseEvents = function (useMouse) {
                    if (useMouse) {
                        sendData("mouseMode", { mouseMode: true });
                    } else {
                        sendData("mouseMode", { mouseMode: false });
                    }
                };

                SB.updateWindowRect = function () {
                    if (!SB_CALIBRATED) {
                        var x = window.screenX;
                        var y = window.screenY;
                        var width = window.outerWidth;
                        var height = window.outerHeight;
                        var factor = 1.0;
                        if ($.browser.msie) {
                            factor = getZoomLevel();
                        }

                        sendData("windowRect", { origin: [x, y], size: [width * factor, height * factor] });
                        SB.useMouseEvents(true);
                        return;
                    }

                    var s = SBScreen.getScreen();
                    sendData("windowRect", { origin: [s.clientX, s.clientY], size: [s.clientWidth, s.clientHeight] });
                    if (SB.realTouchEvents) {
                        SB.useMouseEvents(true);
                    } else {
                        SB.useMouseEvents(false);
                    }
                };

                SBScreen.onWindowMoved = SB.updateWindowRect;
            };

            var applyZoom = function (packet) {

                if (packet["type"] == "points") {
                    var zoom = getZoomLevel();
                    var numPoints = packet["data"].length;
                    for (var i = 0; i < numPoints; i++) {
                        packet["data"][i].x = packet["data"][i].x / zoom;
                        packet["data"][i].y = packet["data"][i].y / zoom;
                    }
                }
            };

            function isHiddenElement(element) {
                var ele = element;
                if (ele == null || ele == undefined) return false;
                while (ele != null && ele.offsetParent != null) {
                    if (ele.clientWidth == 0 || ele.clientHeight == 0 || $(element).is(':hidden')) {
                        return true;
                    }
                    ele = ele.offsetParent;
                }

                return false;
            }

            function hitTestTextInputXbutton(x, y, element) {
                // detect if is microsoft ie, only 10.0 supports x button
                if (!$.browser.msie || $.browser.version != "10.0") {
                    return false;
                }
                // detect single line text input
                if (element.tagName.toLowerCase() != "input" || element.type.toLowerCase() != "text") {
                    return false;
                }
                // detect has text
                if (element.value.length === 0) {
                    return false;
                }
                // detect has focus
                if (document.activeElement != element) {
                    return false;
                }
                var offset = $(element).offset();
                // detect y value
                if (y < offset.top || y > offset.top + element.offsetHeight) {
                    return false;
                }
                // detect x value
                var rightEdge = offset.left + element.offsetWidth;
                // 15 pixels width for the x button
                var leftEdge = rightEdge - 15;
                if (x < leftEdge || x > rightEdge) {
                    return false;
                }
                // clear the element's value
                $(element).val('');
                return true;
            }

            function hitHtmlControl(element, x1, y1) {
                var x = x1 + $(document).scrollLeft();
                var y = y1 + $(document).scrollTop();

                if (hitTestTextInputXbutton(x, y, element)) {
                    return true;
                }

                var hasHorizontalScrollbar = ($.browser.mozilla ? element.scrollWidth - 2 : element.scrollWidth) > element.clientWidth;
                if (hasHorizontalScrollbar) {
                    var offset = $(element).offset();
                    if (x >= offset.left && x < offset.left + element.offsetWidth
                     && y >= offset.top + element.clientHeight && y < offset.top + element.offsetHeight + 16) {
                        if (!isHiddenElement(element)) {
                            return true;
                        }
                    }
                }
                var hasVerticalScrollbar = (($.browser.mozilla ? element.scrollHeight - 2 : element.scrollHeight)) > element.clientHeight;
                if (hasVerticalScrollbar) {
                    var offset = $(element).offset();
                    if (x >= offset.left + element.clientWidth && x < offset.left + element.clientWidth + 16
                         && y >= offset.top && y < offset.top + element.offsetHeight) {
                        if (!isHiddenElement(element)) {
                            return true;
                        }
                    }
                }
                if (element.tagName.toLowerCase() == "select" || (element.tagName.toLowerCase() == "input" && element.type.toLowerCase() == "file")
                 || element.hasAttribute("contenteditable")) {
                    var offset = $(element).offset();
                    if (x >= offset.left && x < offset.left + element.offsetWidth
                            && y >= offset.top && y < offset.top + element.offsetHeight) {
                        if (!isHiddenElement(element)) {
                            return true;
                        }
                    }
                }
                return false;
            }

            function htmlControlHittest(x, y) {

                var elems = document.body.getElementsByTagName("*");
                for (var i = 0; i < elems.length; i++) {
                    if (hitHtmlControl(elems[i], x, y)) return true;
                }

                return false;
            }

            var _hitHtmlControl = false;
            var processData = function (data, sendData) {
                try {
                    var packet = SBSocket.useSocketio ? data : JSON.parse(data);
                    if (!packet.type) throw "No type defined";
                    if (packet.data === undefined) throw "No data defined";
                    switch (packet.type) {
                        case "points":
                            {
                                if (packet["data"] && packet["data"].length > 0) {
                                    var original_x = packet["data"][0].x;
                                    var original_y = packet["data"][0].y;
                                    applyZoom(packet);

                                    if (SB_CALIBRATED) {
                                        if (!_hitHtmlControl && packet["data"][0].contactState == "down" && htmlControlHittest(packet["data"][0].x, packet["data"][0].y)) {
                                            sendData("hitHtmlControl", { x: original_x, y: original_y, hit: true });
                                            _hitHtmlControl = true;
                                            break;
                                        }
                                        else if (_hitHtmlControl && packet["data"][0].contactState == "up") {
                                            sendData("hitHtmlControl", { x: original_x, y: original_y, hit: false });
                                            _hitHtmlControl = false;
                                            break;
                                        }

                                        if (_hitHtmlControl) break;
                                    }
                                }
                            }
                        case "toolChange":
                        case "onProximityStateChange":
                        case "onBoardStateChange":
                            _SB_dispatch(packet);
                            break;
                        case "status":
                            sendData("statusReply", {});
                            break;
                    }
                } catch (e) {
                    debug(packet);
                    throw e;
                }
            };

            var _SB_notifyTool = function (evt) {
                if (isDefined(_SB_trackingFirstTouch) && _SB_trackingFirstTouch === true) {
                    return;
                }

                if (SB.enableDebugBanners) {
                    var icon = "";
                    var color = "#000000";
                    var toolName = "A";

                    switch (evt.tool) {
                        case "pen":
                            toolName = "Pen";
                            icon = "&";
                            color = "rgb(" + evt.color[0] + "," + evt.color[1] + "," + evt.color[2] + ")";
                            break;
                        case "eraser":
                            toolName = "Eraser";
                            icon = "n";
                            break;
                        case "finger":
                            toolName = "No";
                            icon = "#";
                            break;
                    }

                    $.notification({
                        title: toolName + " Tool",
                        content: "Selected",
                        icon: icon,
                        color: color,
                        timeout: 2000,
                        border: false,
                        debug: true
                    });
                }
            };

            window._SB_dispatch = function (packet) {
                debug("Dispatching: " + JSON.stringify(packet));

                if (packet["type"] == "points") {
                    if (packet["data"].length > 0) {
                        var x = SBScreen.convertX(packet["data"][0].x);
                        var y = SBScreen.convertY(packet["data"][0].y);

                        if (SB.wantsSDKEvents && SB.onSinglePoint) {
                            debug("SB.onSinglePoint(" + x + ", " + y + ")");
                            SB.onSinglePoint(x, y);
                        }

                        if (SB.wantsSDKEvents && SB.onPoint) {
                            var numPoints = packet["data"].length;
                            for (var i = 0; i < numPoints; i++) {
                                var x = packet["data"][i].x;
                                var y = packet["data"][i].y;

                                var pid = packet["data"][i]._pointerID;
                                var toolData = packet["data"][i].toolData;

                                SB.onPoint(x, y, pid, toolData);
                            }
                        }
                    }
                    if (SB.wantsSDKEvents && SB.onMultiPoint) {
                        SB.onMultiPoint(packet["data"]);
                    }
                    if (SB.wantsTouches) {
                        smartDispatch.generateTouchEventsFromBoardData(packet["data"]);
                    }
                }

                if (packet["type"] == "toolChange") {
                    var evt = packet["data"];

                    if (!isDefined(evt.tool)) {
                        switch (evt._rawData.name) {
                            case "no_tool":
                                evt.tool = "finger";
                                break;
                            case "polyline":
                                evt.tool = "pen";
                                break;
                            case "eraser_tool":
                                evt.tool = "eraser";
                                break;
                            default:
                                evt.tool = "finger"
                        }
                    }

                    if (SB.onToolChange) {
                        try {
                            SB.onToolChange(evt);
                        } catch (e) {
                            throw "Error in user tool change function: " + e;
                        }
                    }

                    _SB_notifyTool(evt);
                }

                if (packet["type"] == "onProximityStateChange") {
                    var evt = packet["data"];

                    if (SB.onProximityStateChange) {
                        try {
                            SB.onProximityStateChange(evt);
                        } catch (e) {
                            throw "Error in proximity state change function: " + e;
                        }
                    }

                }

                if (packet['type'] == "onBoardStateChange") {
                    if (SB.statusChanged) {
                        var boardAttached = packet["data"];
                        if (boardAttached) {
                            checkWDKServerVersion(function() {SB.statusChanged("Connected");}, function() {SB.statusChanged("Server version out of date");});
                        } else {
                            if (SB.statusChanged) { SB.statusChanged("No boards attached"); }
                        }
                    }
                }
            };

            SB.init = function () {
                debug("smartboard.js init");
                smartDispatch.init();

                if (window.Prototype) {
                    delete Array.prototype.toJSON;
                }

                debug("Connecting...");
                var features = "";

                (function () {
                    var featureList = "";
                    var addFeature = function (str) { featureList += "<li>" + str + "</li>"; };

                    if (SB.wantsSDKEvents) addFeature("SDK events");
                    if (SB.wantsTouches) addFeature("Touch events");
                    if (SB.onToolChange) addFeature("Tool changes");
                    if (SB.onProximityStateChange) addFeature("Proximity Change");

                    if (featureList.length > 0) {
                        features = "<br/><br/>Additional features:<ul>" + featureList + "</ul>";
                    }
                })();

                function displayDebugBoardAwareBanner() {
                    $.notification({
                        title: "This web application is SMART Board aware.",
                        content: "With a SMART Board interactive whiteboard or interactive flat panel, you can access additional features in this web application." + features,
                        timeout: 4000,
                        border: true
                    });
                }

                if (SB.enableDebugBanners) {
                    displayDebugBoardAwareBanner();
                }

                _SB_connect();

                debug("Waiting for first mouse...");

                if (SB.wantsSDKEvents || SB.wantsTouches) {

                    // bind window resize to overlay size
                    $(window).resize(function() {
                        if (SB.overlay && SB.overlay.length) {
                            SB.overlay.css({
                                width: Math.max($(window).width(), $(document).width()),
                                height: Math.max($(window).height(), $(document).height())
                            });
                        }
                    });

                    var makeOverlay = function () {
                        var $body = $('body');
                        SB.overlay = $('<div id="_smartboard-event-overlay"></div>').css({
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: Math.max($(window).width(), $(document).width()),
                            height: Math.max($(window).height(), $(document).height())
                        });
                        SB.overlay.css('background-color', 'rgba(0, 0, 255, 0.0)');
                        SB.overlay.css('z-index', '999990');
                        $('#_smartboard-event-overlay').remove();
                        $body.append(SB.overlay);

                        SB.overlay.disable = function () {
                            if (SB.overlay) {
                                SB.overlay.remove();
                            }
                        };
                        SB.overlay.enable = function () {
                            var overlay = document.getElementById("_smartboard-event-overlay");
                            if (!overlay) {
                                makeOverlay();
                                overlay = document.getElementById("_smartboard-event-overlay");
                            }

                            overlay.addEventListener('touchstart', _SB_trackFirstMouseDown, true);
                            overlay.addEventListener('touchend', _SB_trackFirstMouseUp, true);

                            overlay.addEventListener('mousedown', _SB_trackFirstMouseDown, true);
                            overlay.addEventListener('mousemove', _SB_trackFirstMouseMove, true);
                            overlay.addEventListener('mouseup', _SB_trackFirstMouseUp, true);
                        };
                    };
                    makeOverlay();
                    SB.overlay.enable();
                }

                if (!SB.disableInkFields) {
                    SBInput.attachToDocument();
                }
            };

            SB.invalidateCalibration = function () {
                SB_CALIBRATED = false;
                // re-enable mouse overlay so that window can be calibrated again
                if (SB.wantsSDKEvents || SB.wantsTouches) {
                    SB.overlay.enable();
                }
            };

            SB.calibrate = function (evt) {
                SB_CALIBRATED = true;
                SBScreen.calibrate(evt);
                // if want to disable mouse overlay, disable it now
                SB.overlay.disable();
            };

            /**
            * Perform handwriting recognition on a set of points.
            * The set of points is an array containing strokes, where each stroke is also an array of arrays with 2 entries.
            * Points are expected to be in a co-ordinate system where top left is 0, 0 and Y increases downwards.
            * @param {array} points an array representing points on which to perform HWR
            * @param {function} callback a function which takes one parameter as arguments which will be called when HWR is complete.  The argument is a string containing the best match resulting words from the points.
            *
            * @example
            * //var sample = [ [ [x1, y1], [x2, y2], [x3, y3] ], [ [sx1, sy1] , [sx2, sy2] ] ];
            * //             ^ first stroke          ^           ^second stroke
            * //                                     L point is an array of two elements x, y
            *
            * var points = [[[0, -10], [5, -10]], [[2, -10], [2, 5]], [[6, 3], [10, 3], [10, 5], [6, 5], [6, 3]]];
            * SB.getTextForPoints(points, function(str) { alert(str); });   // will alert "To"
            */

            SB.getTextForPoints = function (points, callback) {
                $.ajax({ url: serverURL + "api/1.0.0/hwr",
                    dataType: 'json',
                    data: { "ink": points },
                    success: function (data) {
                        var text = data[0];
                        callback(text);
                    },
                    error: function () {
                        callback("...");
                    },
                    timeout: 5000,
                    type: "POST",
                    async: true,
                    cache: false
                });
            };

            SB.getShapeForPoints = function (points, callback) {
                $.ajax({ url: serverURL + "api/1.0.0/swr",
                    dataType: 'json',
                    data: { "ink": points },
                    success: function (data) {
                        callback(data);
                    },
                    error: function () {
                        callback("...");
                    },
                    timeout: 5000,
                    type: "POST",
                    async: true,
                    cache: false
                });
            };

            /**
             * @fieldOf SB
             * @name numberOfBoards
             * @desc
             * Returns the number of boards attached
             * @type integer
             */
            if (isDefined(SB.__defineGetter__)) {
                SB.__defineGetter__("numberOfBoards", function () {
                    return SB_NUMBER_OF_BOARDS;
                });
            }

            var _SB_trackingFirstTouch = false;
            var _SB_firstTarget = null;
            var _SB_firstTargetCursorCSS = "auto";

            var _SB_lastToolForPacketForEvent = { "tool": "finger" };
            var _SB_packetForEvent = function (evt) {
                var packet = {};
                packet.type = "points";
                packet.data = [[]];
                packet.data[0].x = evt.clientX;
                packet.data[0].y = evt.clientY;
                packet.data[0]._pointerID = 0;
                switch (evt.type) {
                    case "mousedown":
                        packet.data[0].contactState = "down";
                        // firefox will miss mouseup if we send data here
                        if (SB_CONNECTED && !_SB_trackingFirstTouch) {
                            $.ajax({ url: serverURL + "api/1.0.0/currentTool",
                                dataType: 'json',
                                success: function (result) {
                                    _SB_lastToolForPacketForEvent = result;
                                },
                                timeout: 150,
                                async: false,
                                cache: false
                            });
                        }
                        break;
                    case "mousemove": packet.data[0].contactState = "move"; break;
                    case "mouseup": packet.data[0].contactState = "up"; break;
                }

                if (isDefined(evt.toolData)) {
                    packet.data[0].toolData = evt.toolData;
                } else {
                    // Get the tool and fill it in the fake event
                    if (SB_CONNECTED) {
                        packet.data[0].toolData = _SB_lastToolForPacketForEvent;
                    } else {
                        // Default to finger
                        packet.data[0].toolData = { "tool": "finger" };
                    }
                }

                return packet;
            };

            var _SB_finishedTrackingFirstMouse = false;

            var _SB_trackFirstMouseDown = function (evt) {
                if (_SB_trackingFirstTouch || evt.synthetic) { return; }
                if (!SB_CALIBRATED && (SB.wantsSDKEvents || SB.wantsTouches) || !SB_CONNECTED) {

                    SB.overlay.disable();

                    _SB_trackingFirstTouch = true;
                    // dispatch the event so that it is not lost to the apps using sdk
                    _SB_dispatch(_SB_packetForEvent(evt));
                    _SB_firstTarget = $(document.elementFromPoint(evt.clientX, evt.clientY));

                    _SB_firstTargetCursorCSS = $(_SB_firstTarget).css('cursor');
                    $(_SB_firstTarget).css('cursor', 'none');
                    if (SB_CONNECTED) {
                        evt.stopPropagation();
                        evt.preventDefault();
                    }

                    SB.overlay.enable();
                }
                evt.stopPropagation();
                evt.preventDefault();
            };

            var _SB_trackFirstMouseMove = function (evt) {
                if (!_SB_trackingFirstTouch || evt.synthetic) { return; }
                if (isDefined(evt.which) && evt.which == 0) {
                    evt.type = "mouseup";
                    _SB_trackFirstMouseUp(evt);
                    return;
                }
                //dispatch event
                SB.overlay.disable();
                _SB_dispatch(_SB_packetForEvent(evt));
                SB.overlay.enable();
                if (SB_CONNECTED) {
                    evt.stopPropagation();
                    evt.preventDefault();
                }
                evt.stopPropagation();
                evt.preventDefault();
            };

            var _SB_trackFirstMouseUp = function (evt) {
                if (!_SB_trackingFirstTouch || evt.synthetic) { return; }

                SB.calibrate(evt);

                _SB_dispatch(_SB_packetForEvent(evt));

                _SB_trackingFirstTouch = false;

                $(_SB_firstTarget).css('cursor', _SB_firstTargetCursorCSS);

                _SB_finishedTrackingFirstMouse = true;

                if (SB_CONNECTED) {
                    evt.stopPropagation();
                    evt.preventDefault();
                }
                evt.stopPropagation();
                evt.preventDefault();
            };

            $(document).ready(function () {
                setTimeout(SB.init, 250);
            });
        })($);

        function _SB_load_dependencies(GLOBAL, smartboardJSUrl, debugOn) {

            GLOBAL._SB_debugMessages = [];
            var isDefined = GLOBAL._SB_isDefined = function (v) { return (!(typeof (v) == "undefined")); };
            var turnDebugOn = GLOBAL._SB_debugToConsole = false;
            var debug = GLOBAL._SB_debug = function (str) { _SB_debugMessages.push(str); if (_SB_debugMessages.length > 30) { _SB_debugMessages.splice(0, 1); } if (GLOBAL._SB_debugToConsole) { console.log(str); } };
            if (isDefined(debugOn) && debugOn == true) { GLOBAL._SB_debugToConsole = true; }

            if (!isDefined(window.console)) {
                window.console = {};
                window.console.log = function () { };
            }

            if (window.XDomainRequest) { var httpRegEx = /^https?:\/\//i; var getOrPostRegEx = /^get|post$/i; var sameSchemeRegEx = new RegExp("^" + location.protocol, "i"); var xmlRegEx = /\/xml/i; jQuery.ajaxTransport("text html xml json", function (a, b, c) { if (a.crossDomain && a.async && getOrPostRegEx.test(a.type) && httpRegEx.test(b.url) && sameSchemeRegEx.test(b.url)) { var d = null; var e = (b.dataType || "").toLowerCase(); return { send: function (c, f) { d = new XDomainRequest; if (/^\d+$/.test(b.timeout)) { d.timeout = b.timeout } d.ontimeout = function () { f(500, "timeout") }; d.onload = function () { var a = "Content-Length: " + d.responseText.length + "\r\nContent-Type: " + d.contentType; var b = { code: 200, message: "success" }; var c = { text: d.responseText }; try { if (e === "json") { try { c.json = JSON.parse(d.responseText) } catch (g) { b.code = 500; b.message = "parseerror" } } else if (e === "xml" || e !== "text" && xmlRegEx.test(d.contentType)) { var h = new ActiveXObject("Microsoft.XMLDOM"); h.async = false; try { h.loadXML(d.responseText) } catch (g) { h = undefined } if (!h || !h.documentElement || h.getElementsByTagName("parsererror").length) { b.code = 500; b.message = "parseerror"; throw "Invalid XML: " + d.responseText } c.xml = h } } catch (i) { throw i } finally { f(b.code, b.message, c, a) } }; d.onerror = function () { f(500, "error", { text: d.responseText }) }; d.open(a.type, a.url); if (a.type == "POST") { d.send(JSON.stringify(b.data)) } else { d.send() } }, abort: function () { if (d) { d.abort() } } } } }) }

            (function (GLOBAL, $) {

                var debug = window._SB_debug,
                    isDefined = window._SB_isDefined,
                    mouseIsDown = false,
                    pointersDown = {};

                function Finger() {
                    if(SB.disableTouchPointers) { return; }

                    this.node = document.createElement('span');
                    $(this.node).addClass('_smartboard-touch-point');

                    document.body.appendChild(this.node);
                }

                Finger.prototype = {
                    node: null,

                    x: NaN,
                    y: NaN,

                    target: null,

                    retarget: function () {
                        this.target = null;
                    },

                    place: function () {
                        if(SB.disableTouchPointers) { return; }
                        document.body.appendChild(this.node);
                    },

                    hide: function () {
                        if(SB.disableTouchPointers) { return; }
                        this.node.style.display = 'none';
                    },

                    remove: function () {
                        if(SB.disableTouchPointers) { return; }
                        document.body.removeChild(this.node);
                    },

                    show: function () {
                        if (SB.disableTouchPointers) { return; }
                        this.node.style.display = '';
                    },

                    move: function (x, y, e) {
                        if (isNaN(x) || isNaN(y)) {
                            this.hide();
                            this.target = null;
                        } else {
                            this.show();

                            if(!SB.disableTouchPointers) {
                                this.node.style.left = x + 'px';
                                this.node.style.top = y + 'px';
                            }

                            if (SB.debugTouches && !SB.disableTouchPointers) {
                                this.node.style.background = "rgba(128, 128, 128, 0.5)";
                                this.node.innerHTML = "F";
                                if (isDefined(e.toolData)) {
                                    var c = e.toolData.color;
                                    if (isDefined(c)) {
                                        var colorStr = "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", 0.5)";
                                        this.node.style.background = colorStr;
                                        this.node.innerHTML = "P";
                                    } else {
                                        if (e.toolData.tool == "eraser") {
                                            this.node.style.background = "rgba(128, 128, 128, 0.1)";
                                            this.node.innerHTML = "E";
                                        }
                                    }
                                }

                                this.node.innerHTML = this.node.innerHTML + ": " + x + ", " + y + ", " + e.angle;
                            }

                            this.x = x;
                            this.y = y;

                            if (this.target === null) {
                                this.hide();
                                this.target = document.elementFromPoint(x, y);
                                debug("debug: finger target is " + this.target);
                                this.show();
                            }
                        }
                    }
                };

                var fingers = {};

                // If a DOM element is removed, it could be the one that we are
                // targetting.  If this is the case, retarget.
                document.addEventListener("DOMNodeRemoved", function(evt) {
                    for (var i in fingers) {
                        if($(evt.target).has(fingers[i].target).length > 0) {
                            fingers[i].retarget();
                        }
                    }
                });

                function anEventForXY(eventName, x, y, pid, toolData) {
                    var e = document.createEvent('MouseEvent');
                    e.initMouseEvent(eventName, true, true,
                        window, 1,
                        SBScreen.clientToScreenX(x), SBScreen.clientToScreenY(y),
                        x, y,
                        false, false, false, false, 0, null);
                    e._pointerID = pid;
                    e.toolData = toolData;
                    return e;
                }

                function removeFinger(pid) {
                    if (fingers[pid] === undefined) {
                        return;
                    }
                    fingers[pid].remove();
                    delete fingers[pid];
                }

                // return canceled touches as list, return newPreviousTouches excluding canceled touches.
                // ignore events with no down event from previous frame.
                // canceled touches' Fingers are removed
                function removeInvalidBoardEvents(previousTouches, boardEvents, canceledTouches, previousTouchesList, newPreviousTouchesList) {
                    var i, pid, boardEvent,
                        boardEventIds = {},
                        newBoardEvents = [];
                    for(i = 0; i < boardEvents.length; i++) {
                        boardEvent = boardEvents[i];
                        pid = boardEvent._pointerID;
                        boardEventIds[pid] = 1;
                        if (boardEvent.type === "mousemove" || boardEvent.type === "mouseup") {
                            if (previousTouches[pid] === undefined) {
                                // down event was never fired, ignore
                                continue;
                            } else {
                                newBoardEvents.push(boardEvent);
                            }
                        } else {
                            if (previousTouches[pid] !== undefined) {
                                // down event on already existing pointer, send cancel touch
                                removeFinger(pid);
                                canceledTouches.push(previousTouches[pid]);
                            }
                            newBoardEvents.push(boardEvent);
                        }
                    }

                    // find canceled events, and create newPrevioiusTouchesList without canceled touches
                    for (var property in previousTouches) {
                        if (previousTouches.hasOwnProperty(property)) {
                            previousTouchesList.push(previousTouches[property]);
                            if (!(property in boardEventIds)) {
                                canceledTouches.push(previousTouches[property]);
                                removeFinger(property);
                            } else {
                                if (canceledTouches.indexOf(previousTouches[property]) === -1) {
                                    newPreviousTouchesList.push(previousTouches[property]);
                                }
                            }
                        }
                    }

                    return newBoardEvents;
                }

                function createMouseEventFromTouch (type, touch) {
                    return createMouseEvent(type, touch, touch._finger);
                }

                function createNewTargetValue() {
                    return { targetTouches : [], touchStarts: [], touchMoves: [], touchEnds: []};
                }

                function splitTouchesIntoTargets(touches) {
                    // target's index is index to its values in targetValues
                    var targetedTouches = { touches: [], targets: [], targetValues: []};

                    touches.forEach(function (touch) {
                        var target = touch._finger.target;
                        var valueIdx = targetedTouches.targets.indexOf(target);
                        if (valueIdx === -1) {
                            targetedTouches.targets.push(target);
                            targetedTouches.targetValues.push(createNewTargetValue());
                            valueIdx = targetedTouches.targets.length -1;
                        }
                        var value = targetedTouches.targetValues[valueIdx];
                        var newTouch = createTouch(touch.type, touch, touch._finger);
                        if (touch.type !== "touchend") {
                            value.targetTouches.push(newTouch);
                            targetedTouches.touches.push(newTouch);
                        }
                        if (touch.type === "touchstart") {
                            value.touchStarts.push(newTouch);
                        }
                        if (touch.type === "touchmove") {
                            value.touchMoves.push(newTouch);
                        }
                        if (touch.type === "touchend") {
                            value.touchEnds.push(newTouch);
                        }
                    });
                    return targetedTouches;
                }

                function convertTargetEventHandlers(target, eventName) {
                    var onEventName = 'on' + eventName;

                    if (onEventName in target) {
                        debug('Converting `' + onEventName + '` property to event listener.', target);
                        target.addEventListener(eventName, target[onEventName], false);
                        delete target[onEventName];
                    }

                    if (target.hasAttribute(onEventName)) {
                        debug('Converting `' + onEventName + '` attribute to event listener.', target);
                        var handler = new GLOBAL.Function('event', target.getAttribute(onEventName));
                        target.addEventListener(eventName, handler, false);
                        target.removeAttribute(onEventName);
                    }
                }

                function sendTouchCancel(splitTouches, canceledTouches) {
                    var splitCanceledTouches = splitTouchesIntoTargets(canceledTouches);
                    // for each canceled touch's target, send cancel touch event
                    var targets = splitCanceledTouches.targets;
                    for(var idx = 0; idx < targets.length; idx++ ) {
                        var target = targets[idx];
                        var targetValue = splitCanceledTouches.targetValues[idx];
                        if (targetValue.targetTouches.length == 0) {
                            continue;
                        }
                        var targetTouchesIdx = splitTouches.targets.indexOf(target);
                        var targetTouches = [];
                        if (targetTouchesIdx !== -1) {
                            targetTouches = splitTouches.targetValues[targetTouchesIdx];
                        }
                        // type, canBubble, cancelable, view, detail, ctrlKey, altKey, shiftKey, metaKey, touches (not touch end), targetTouches (no touch end), changedTouches
                        var evt = document.createEvent('MouseEvent');
                        evt.initMouseEvent("touchcancel", true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
                        evt.touches = splitTouches.touches || [];
                        evt.targetTouches = targetValue.targetTouches || [];
                        evt.changedTouches = targetValue.targetTouches || [];
                        if (target) {
                            debug("debug: touchcancel");
                            convertTargetEventHandlers(target, 'touchcancel');
                            target.dispatchEvent(evt);
                        }
                    }
                }

                function sendTargetTouchEvent(type, splitTouches) {
                    var targets = splitTouches.targets;
                    for(var idx = 0; idx < targets.length; idx++ ) {
                        var target = targets[idx];
                        var targetValue = splitTouches.targetValues[idx];
                        var changedTouches;
                        if (type === "touchstart") {
                            changedTouches =  targetValue.touchStarts;
                        } else if (type === "touchmove") {
                            changedTouches = targetValue.touchMoves;
                        } else {
                            changedTouches = targetValue.touchEnds;
                        }
                        if (changedTouches.length === 0) {
                            continue;
                        }

                        var evt = document.createEvent('MouseEvent');
                        // init touch event, touch event detail set to 1.
                        evt.initMouseEvent(type, true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
                        evt.touches = splitTouches.touches || [];
                        evt.targetTouches = targetValue.targetTouches || [];
                        evt.changedTouches = changedTouches || [];
                        if(target) {
                            debug("debug: " + type);
                            convertTargetEventHandlers(target, type);
                            target.dispatchEvent(evt);
                        }
                    }
                }

                function simulateMouseUpEvents(touches) {
                    if (!SB.generateMouseEventsOnTouchUp) {
                        return;
                    }
                    touches.forEach ( function(touch) {
                        var target = touch._finger.target;
                        if (target && touch.type === "touchend" && !isDefined(SB.disableEventDispatch)) {
                            //simulate mouse events on touch end event
                            target.dispatchEvent(createMouseEventFromTouch('mouseover', touch));
                            target.dispatchEvent(createMouseEventFromTouch('mousemove', touch));
                            target.dispatchEvent(createMouseEventFromTouch('mousedown', touch));

                            target.dispatchEvent(createMouseEventFromTouch('mouseup', touch));
                            target.dispatchEvent(createMouseEventFromTouch('click', touch));
                        }
                    });
                }

                function sendTouchEvents(touches, canceledTouches) {
                    var splitTouches = splitTouchesIntoTargets(touches);
                    // cancel touches
                    sendTouchCancel(splitTouches, canceledTouches);
                    // send touch start
                    sendTargetTouchEvent("touchstart", splitTouches);
                    sendTargetTouchEvent("touchmove", splitTouches);
                    sendTargetTouchEvent("touchend", splitTouches);
                    // simulate mouse up events
                    simulateMouseUpEvents(touches);
                }

                function getScaleAndRotateValues(event1, event2) {
                    // use first two touches
                    var x = event1.clientX - event2.clientX;
                    var y = event1.clientY - event2.clientY;

                    var distance = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
                    var angle = Math.atan2(x, y) * (180 / Math.PI);
                    return {distance: distance, angle: angle};
                }

                function gestureStartEvent(currentTouches) {
                    debug("debug: gesturestart");
                    var touch1 = currentTouches[0];
                    var touch2 = currentTouches[1];
                    var target = touch1._finger.target;
                    // remove old target if it exists
                    var targetIdx = SB.previousGestures.targets.indexOf(target);
                    if (targetIdx !== -1) {
                        SB.previousGestures.targets.splice(targetIdx,1);
                        SB.previousGestures.gestureInfo.splice(targetIdx,1);
                    }
                    var transform = getScaleAndRotateValues(touch1, touch2);
                    var gestureInfo = {sdist: transform.distance, sangle: transform.angle, touch1: touch1, touch2: touch2};
                    SB.previousGestures.targets.push(target);
                    SB.previousGestures.gestureInfo.push(gestureInfo);
                    var evt = createMouseEvent("gesturestart", touch1, touch1._finger);
                    evt.scale = 1;
                    evt.rotation = 0;
                    return [evt];
                }

                function gestureEndEvent(touch) {
                    debug("debug: gesture end");
                    return [createMouseEvent("gestureend", touch, touch._finger)];
                }

                function getTouchWithId(touches, id) {
                    for (var i = 0; i < touches.length; i++) {
                        if (touches[i]._pointerID === id) {
                            return touches[i];
                        }
                    }
                    return null;
                }

                function gestureChangeEvent(lastTouches, currentTouches) {
                    // make sure the events used for initial value are still there
                    var gestureInfoIdx = SB.previousGestures.targets.indexOf(currentTouches[0]._finger.target);
                    if (gestureInfoIdx === -1) {
                        debug("error, gestureInfoIdx is -1.")
                        return [];
                    }
                    var gestureInfo = SB.previousGestures.gestureInfo[gestureInfoIdx];
                    var touch1 = getTouchWithId(currentTouches, gestureInfo.touch1._pointerID);
                    var touch2 = getTouchWithId(currentTouches,gestureInfo.touch2._pointerID);
                    if (!touch1 || !touch2) {
                        // send gesture end event and restart gesture
                        var gestureEnd = gestureEndEvent(currentTouches[0]);
                        // remove gesture from cache
                        SB.previousGestures.targets.splice(gestureInfoIdx, 1);
                        SB.previousGestures.gestureInfo.splice(gestureInfoIdx, 1);
                        var newGestureStart = gestureStartEvent(currentTouches);
                        // add gesture end to begining
                        return gestureEnd.concat(newGestureStart);
                    } else {
                        var evt = createMouseEvent("gesturechange", currentTouches[0], currentTouches[0]._finger);
                        var trans = getScaleAndRotateValues(touch1, touch2);
                        evt.scale = trans.distance / gestureInfo.sdist;
                        evt.rotation = gestureInfo.sangle - trans.angle;
                        return [evt];
                    }
                }

                // return list of gesture events
                function createGesturesFromTouches(lastTouches, currentTouches) {
                    // remove touch ends from current touches
                    currentTouches = currentTouches.filter(function(touch){
                        if (touch.type === "touchend") {
                            return false;
                        }
                        return true;
                    });
                    // detect previous gesture state and current touches
                    if (lastTouches.length <= 1 && currentTouches.length > 1) {
                        // gesture start
                        return gestureStartEvent(currentTouches);
                    } else if (lastTouches.length <= 1 && currentTouches.length <= 1) {
                        // no gesture
                        return null;
                    } else if (lastTouches.length > 1 && currentTouches.length > 1) {
                        // gesture continue
                        return gestureChangeEvent(lastTouches, currentTouches);
                    } else if (lastTouches.length > 1 && currentTouches.length <= 1) {
                        // gesture end
                        return gestureEndEvent(lastTouches[0]);
                    }
                    return null;
                }

                function generateGesturesEvents(previousTouches, touches) {
                    if(SB.previousGestures === undefined) {
                        // targets contains each targets, index of a target is index into corresponding gestureInfo.
                        // gestureInfo contains gesture data for the corresponding target.
                        // gestureInfo contains: { sdist (starting distance), sangle (starting angle), touch1, touch2}
                        SB.previousGestures = { targets: [], gestureInfo: []};
                    }

                    function selectionToolOnly(touch) {
                        if (touch.toolData["tool"] === "finger") {
                            return true;
                        }
                        return false;
                    }
                    // consider touch events that are selection tool only
                    previousTouches = previousTouches.filter(selectionToolOnly);
                    touches = touches.filter(selectionToolOnly);
                    // split touches by their target
                    var splitPreviousTouches = splitTouchesIntoTargets(previousTouches);
                    var splitTouches = splitTouchesIntoTargets(touches);
                    // get all targets from previous and current touches
                    var targets = splitPreviousTouches.targets.slice(0);
                    splitTouches.targets.forEach(function(target) {
                       if (targets.indexOf(target) === -1) {
                           targets.push(target);
                       }
                    });
                    // loop through each target and generate gestures
                    var gestureEvents = [];
                    targets.forEach(function(target) {
                        var lastTouches = [];
                        var currentTouches = [];
                        var targetIdx;
                        targetIdx = splitPreviousTouches.targets.indexOf(target);
                        if (targetIdx !== -1) {
                            //get touches belonging to this target
                            lastTouches = splitPreviousTouches.targetValues[targetIdx].targetTouches;
                        }
                        targetIdx = splitTouches.targets.indexOf(target);
                        if (targetIdx !== -1) {
                            currentTouches = splitTouches.targetValues[targetIdx].targetTouches;
                        }
                        // now we have previous touches and current touches on the same target, generate gesture events
                        var gestures = createGesturesFromTouches(lastTouches, currentTouches);
                        if (gestures) {
                            gestureEvents = gestureEvents.concat(gestures);
                        }
                    });
                    return gestureEvents;
                }

                function removeUpEvents(touchEvents) {
                    return touchEvents.filter( function(value) {
                        if (value.type === "touchend") {
                            return false;
                        }
                        return true;
                    });
                }

                function getFinger(pid) {
                    return fingers[pid];
                }
                function boardEventToTouchEvent(boardEvent) {
                    var finger, touch;
                    if (boardEvent.type === "mousedown") {
                        finger = getOrCreateNewFinger(boardEvent);
                        touch = createMouseEvent("touchstart", boardEvent, finger);
                    } else if (boardEvent.type === "mouseup") {
                        finger = getFinger(boardEvent._pointerID);
                        touch = createMouseEvent("touchend", boardEvent, finger);
                    } else {
                        finger = getFinger(boardEvent._pointerID);
                        touch = createMouseEvent("touchmove", boardEvent, finger);
                    }
                    touch._pointerID = boardEvent._pointerID;
                    touch.toolData = finger.toolData;
                    touch.identifier = boardEvent._pointerID;
                    return touch;
                }

                function getOrCreateNewFinger (event) {
                    if (!(event._pointerID in fingers)) {
                        var f = new Finger();
                        f.toolData = event.toolData;
                        fingers[event._pointerID] = f;
                    }
                    return fingers[event._pointerID];
                }

                function createOrMoveFingers(events) {
                    events.forEach (function (e) {
                        var finger = getOrCreateNewFinger(e);
                        finger.move(e.clientX, e.clientY, e);
                    });
                }

                function removeFingers(touchEvents) {
                    touchEvents.forEach( function(event) {
                        if (event.type === "touchend") {
                            removeFinger(event._pointerID);
                        }
                    } );
                }

                function generateTouchEventsFromBoardData(data) {
                    var boardEvents = [];
                    for(var i = 0; i < data.length; i++) {
                        var x = data[i].x;
                        var y = data[i].y;

                        var pid = data[i]._pointerID;
                        var toolData = data[i].toolData;
                        var eventType;
                        if (data[i].contactState === "down") {
                            eventType = "mousedown";
                        } else if (data[i].contactState == "up") {
                            eventType = "mouseup";
                        } else {
                            eventType = "mousemove";
                        }

                        var domEvt = anEventForXY(eventType, x, y, pid, toolData);
                        boardEvents.push(domEvt);
                    }
                    generateTouchEvents(boardEvents);
                }

                function saveToPreviousTouches(previousTouches, touches) {
                    touches.forEach (function (touch) {
                        previousTouches[touch._pointerID] = touch;
                    });
                }

                function generateTouchEvents(boardEvents) {
                    var touches = [], canceledTouches = [], previousTouchesList = [], newPreviousTouchesList = [];
                    if(SB.previousTouches === undefined) {
                        SB.previousTouches = {};
                    }
                    // comparing current board events and previous saved state and detect changes
                    boardEvents = removeInvalidBoardEvents(SB.previousTouches, boardEvents, canceledTouches, previousTouchesList, newPreviousTouchesList);
                    // create new fingers and move existing fingers
                    createOrMoveFingers(boardEvents);
                    // create touch data to be dispatched for each touch event from the board
                    for (var i = 0; i < boardEvents.length; i++) {
                        var boardEvent = boardEvents[i];
                        var touchEvent = boardEventToTouchEvent(boardEvent);
                        if (touchEvent) {
                            touches.push(touchEvent);
                        }
                    }

                    if (!SB.disableGestures) {
                        // generate canceled gestures
                        var canceledGestures = generateGesturesEvents(previousTouchesList, newPreviousTouchesList);
                        // detect and send gesture events
                        var touchesNoUp = removeUpEvents(touches);
                        var gestureEvents = generateGesturesEvents(newPreviousTouchesList, touchesNoUp);
                        gestureEvents = canceledGestures.concat(gestureEvents);
                        gestureEvents.forEach(function(event) {
                            if(event._finger.target) {
                                event._finger.target.dispatchEvent(event);
                            }
                        });
                    }
                    // fire touches events
                    sendTouchEvents(touches, canceledTouches);
                    // remove fingers on touch event types touch end.
                    removeFingers(touches);
                    // saves current touch states, removing up events
                    SB.previousTouches = {};
                    saveToPreviousTouches(SB.previousTouches, touchesNoUp);
                }
                // end new touch evnet genreation

                function createTouch(type, originalEvent, finger) {
                    var clientX = finger.x || originalEvent.clientX;
                    var clientY = finger.y || originalEvent.clientY;
                    return {
                        type : type,
                        identifier : originalEvent._pointerID,
                        screenX : finger.x || originalEvent.screenX,
                        screenY : finger.y || originalEvent.screenY,
                        clientX : clientX,
                        clientY : clientY,
                        pageX :  clientX + $(window).scrollLeft(),
                        pageY : clientY + $(window).scrollTop(),
                        radiusX : 1,
                        radiusY : 1,
                        rotationAngle : 0,
                        force : 0,
                        target : finger.target,
                        _finger : finger,
                        _pointerID : originalEvent._pointerID,
                        toolData : finger.toolData
                    }
                }

                function createMouseEvent(eventName, originalEvent, finger) {
                    var e = document.createEvent('MouseEvent');

                    e.initMouseEvent(eventName, true, true,
                        originalEvent.view, originalEvent.detail,
                        finger.x || originalEvent.screenX, finger.y || originalEvent.screenY,
                        finger.x || originalEvent.clientX, finger.y || originalEvent.clientY,
                        originalEvent.ctrlKey, originalEvent.shiftKey,
                        originalEvent.altKey, originalEvent.metaKey,
                        originalEvent.button, finger.target || originalEvent.relatedTarget
                    );

                    e.synthetic = true;
                    e.syntheticTarget = finger.target;
                    e._finger = finger;
                    return e;
                }

                function moveFingers(e) {
                    if (!isDefined(fingers[e._pointerID])) {
                        var f = new Finger();
                        f.toolData = e.toolData;
                        fingers[e._pointerID] = f;
                    }
                    fingers[e._pointerID].move(e.clientX, e.clientY, e);
                }

                var defaultCSS = ([
                    '<style type="text/css" id="_smartboard-js-style">',
                    '._smartboard-js,',
                    '._smartboard-js a {',
                    '}',
                    '._smartboard-touch-point {',
                    'background: rgba(128, 128, 128, 0.5);',
                    'border: 2px solid rgb(128, 128, 128);',
                    'border-radius: 50%;',
                    'display: none;',
                    'height: 24px;',
                    'margin: -13px 0 0 -13px;',
                    'position: fixed;',
                    'width: 24px;',
                    'font-size: 8px;',
                    'font-family: arial;',
                    'z-index: 999989',
                    '}',
                    '._smartboard-js ._smartboard-touch-point {',
                    'display: block;',
                    '}',
                    '.smartboard-no-touch {',
                    'position: relative;',
                    'z-index: 999999;',
                    '}',
                    '</style>'
                ]).join('\n');

                $(defaultCSS).appendTo('head');

                function start() {
                    $(document.documentElement).addClass('_smartboard-js');
                }

                function stop() {
                    $(document.documentElement).removeClass('_smartboard-js');
                }

                var smartDispatch = {
                    start: start,
                    stop: stop
                };

                smartDispatch.init = function () { };

                if (typeof GLOBAL.define === 'function') {
                    GLOBAL.define(smartDispatch);
                } else if (typeof GLOBAL.exports !== 'undefined') {
                    GLOBAL.exports = smartDispatch;
                } else {
                    GLOBAL.smartDispatch = smartDispatch;
                }

                window.smartDispatch = smartDispatch;

                smartDispatch.generateTouchEventsFromBoardData = generateTouchEventsFromBoardData;

                start();

            } (this, jQuery));

        }

        (function ($) {
            var debug = window._SB_debug;
            var isDefined = window._SB_isDefined;
            var defaultCSS = ([
                '<style type="text/css" id="_owlCSSStyle">',
                '#_SB_notifications {',
                'top: 20px;',
                'left: 50%;',
                'width: 400px;',
                'margin-left: -200px;',
                'background: #fff;',
                'background: -webkit-linear-gradient(#fff, #dbdbdb);',
                'background: -moz-linear-gradient(#fff, #dbdbdb);',
                'border-radius: 6px;',
                '-webkit-box-shadow: 0px -1px 0px white, inset 0px 4px 30px rgba(0,0,0,0.5);',
                '-moz-box-shadow: 0px -1px 0px white, inset 0px 4px 30px rgba(0,0,0,0.5);',
                'box-shadow: 0px -1px 0px white, inset 0px 4px 30px rgba(0,0,0,0.5);',
                'overflow: hidden;',
                'position: absolute;',
                'z-index: 999999;',
                'max-height: 529px;',
                'overflow-y: hidden;',
                'color: #000000;',
                'text-shadow: white 0px 1px 0px;',
                'font: normal 12px HelveticaNeue, Helvetica, Arial, sans-serif;',
                'font-family: HelveticaNeue, Helvetica, Arial, sans-serif;',
                '-webkit-text-stroke: 1px transparent;',
                'text-align: left;',
                '}',
                '._SB_notifications {',
                'z-index: 999998;',
                'position: relative;',
                '}',
                '._SB_notifications h2 {',
                'font: normal 12px HelveticaNeue, Helvetica, Arial, sans-serif;',
                'line-height: normal;',
                'display: block;',
                'font-weight: bold;',
                'position: static;',
                'letter-spacing: 0px;',
                'text-transform: none;',
                'color: #000000;',
                'padding: 0px;',
                'margin: 0px;',
                'vertical-align: baseline;',
                '}',
                '._SB_notifications ul {',
                'font: normal 12px HelveticaNeue, Helvetica, Arial, sans-serif;',
                'list-style: disc outside none;',
                'margin: 1em;',
                'margin-left: 40px;',
                'padding: 0;',
                '}',
                '._SB_notifications li {',
                'font: normal 12px HelveticaNeue, Helvetica, Arial, sans-serif;',
                'list-style: disc outside none;',
                'padding: 0;',
                '}',
                '._SB_notifications li::before {',
                'content: "";',
                '}',
                '._SB_notifications._SB_more {',
                'border-bottom: 1px solid #c1c1c1;',
                '-webkit-box-shadow: white 0px 1px 0px;',
                '-moz-box-shadow: white 0px 1px 0px;',
                'box-shadow: 0px 1px 0px white;',
                'text-align: left',
                '}',
                '._SB_notifications._SB_error {',
                'background: #FA565D;',
                'background: -webkit-linear-gradient(#FA565D, #D1363D);',
                'background: -moz-linear-gradient(#FA565D, #D1363D);',
                '-moz-border-radius: 5px;',
                '-webkit-border-radius: 5px;',
                'border-radius: 5px;',
                'text-align: left',
                '}',
                '._SB_notifications._SB_error * {',
                'color: white!important;',
                'text-shadow: rgba(0,0,0,0.4) 0px 1px 1px!important;',
                '}',
                '._SB_notifications._SB_error ._SB_left:after {',
                'background: rgba(255,255,255,0.5)!important;',
                'box-shadow: rgba(0,0,0,0.4) 0px 1px 1px!important;',
                '}',
                '._SB_notifications.green {',
                'background: #A8DBA8;',
                'background-image: -webkit-linear-gradient(rgba(0, 0, 0, 0.0), rgba(0, 0, 0, 0.2));',
                '-moz-border-radius: 5px;',
                '-webkit-border-radius: 5px;',
                'border-radius: 5px;',
                '}',
                '._SB_notifications.green * {',
                'color: white!important;',
                'text-shadow: rgba(0,0,0,0.4) 0px 1px 1px!important;',
                '}',
                '._SB_notifications.green ._SB_left:after {',
                'background: rgba(255,255,255,0.5)!important;',
                'box-shadow: rgba(0,0,0,0.4) 0px 1px 1px!important;',
                '}',
                '._SB_notifications.click {',
                'cursor: pointer;',
                '}',
                '._SB_notifications .hide, .modal .hide {',
                'position: absolute;',
                'display: block;',
                'right: 5px;',
                'top: 7px;',
                'cursor: pointer;',
                'color: white;',
                'font-weight: bold;',
                'width: 12px;',
                'height: 12px;',
                'background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAKMWlDQ1BJQ0MgUHJvZmlsZQAASImllndU01kWx9/v90svlCREOqHX0BQIIFJCL9KrqMQkQCgBQgKCXREVHFFEpCmCDAo44OhQZKyIYmFQ7H2CDALKODiKDZVJZM+Muzu7O7v7/eOdz7nv3vt77977zvkBQPINFAgzYCUA0oViUZiPByMmNo6BHQAwwAMMsAGAw83ODAr3jgAy+XmxGdkyJ/A3QZ/X17dm4TrTN4TBAP+dlLmZIrEsU4iM5/L42VwZF8g4LVecKbdPypi2LFXOMErOItkBZawq56RZtvjsM8tucualC3kylp85k5fOk3OvjDfnSPgyRgJlXJgj4OfK+IaMDdIk6QIZv5XHpvM52QCgSHK7mM9NlrG1jEmiiDC2jOcDgCMlfcHLvmAxf7lYfil2RmaeSJCULGaYcE0ZNo6OLIYvPzeNLxYzQzjcVI6Ix2BnpGdyhHkAzN75syjy2jJkRba3cbS3Z9pa2nxRqH+7+Rcl7+0svQz93DOI3v+H7c/8MuoBYE3JarP9D9uySgA6NwKgeu8Pm8E+ABRlfeu48sV96PJ5SRaLM52srHJzcy0FfK6lvKC/6z86/AV98T1Lebrfy8Pw5CdyJGlihrxu3Iy0DImIkZ3J4fIZzL8b4v8n8M/PYRHGT+SL+EJZRJRsygTCJFm7hTyBWJAhZAiE/6qJ/2PYP2h2rmWiNnwCtKWWQOkKDSA/9wMUlQiQ+L2yHej3vgXio4D85UXrjM7O/WdB/5wVLpEv2YKkz3HssAgGVyLKmd2TP0uABgSgCGhADWgDfWACmMAWOABn4Aa8gD8IBhEgFiwBXJAM0oEI5IKVYB0oBMVgO9gFqkAtaABNoBUcAZ3gODgDzoPL4Cq4Ce4DKRgBz8AkeA2mIQjCQmSICqlBOpAhZA7ZQixoAeQFBUJhUCyUACVBQkgCrYQ2QMVQKVQF1UFN0LfQMegMdBEahO5CQ9A49Cv0HkZgEkyDtWAj2Apmwe5wABwBL4aT4Cw4Hy6At8EVcD18CO6Az8CX4ZuwFH4GTyEAISJ0RBdhIiyEjQQjcUgiIkJWI0VIOVKPtCLdSB9yHZEiE8g7FAZFRTFQTJQzyhcVieKislCrUVtRVaiDqA5UL+o6agg1ifqEJqM10eZoJ7QfOgadhM5FF6LL0Y3odvQ59E30CPo1BoOhY4wxDhhfTCwmBbMCsxWzB9OGOY0ZxAxjprBYrBrWHOuCDcZysGJsIbYSewh7CnsNO4J9iyPidHC2OG9cHE6IW48rxzXjTuKu4UZx03glvCHeCR+M5+Hz8CX4Bnw3/gp+BD9NUCYYE1wIEYQUwjpCBaGVcI7wgPCSSCTqER2JoUQBcS2xgniYeIE4RHxHopDMSGxSPElC2kY6QDpNukt6SSaTjchu5DiymLyN3EQ+S35EfqtAVbBU8FPgKaxRqFboULim8FwRr2io6K64RDFfsVzxqOIVxQklvJKREluJo7RaqVrpmNJtpSllqrKNcrByuvJW5Wbli8pjFCzFiOJF4VEKKPspZynDVISqT2VTudQN1AbqOeoIDUMzpvnRUmjFtG9oA7RJFYrKPJUoleUq1SonVKR0hG5E96On0UvoR+i36O/naM1xn8Ofs2VO65xrc96oaqi6qfJVi1TbVG+qvldjqHmppartUOtUe6iOUjdTD1XPVd+rfk59QoOm4azB1SjSOKJxTxPWNNMM01yhuV+zX3NKS1vLRytTq1LrrNaENl3bTTtFu0z7pPa4DlVngY5Ap0znlM5ThgrDnZHGqGD0MiZ1NXV9dSW6dboDutN6xnqReuv12vQe6hP0WfqJ+mX6PfqTBjoGQQYrDVoM7hniDVmGyYa7DfsM3xgZG0UbbTLqNBozVjX2M843bjF+YEI2cTXJMqk3uWGKMWWZppruMb1qBpvZmSWbVZtdMYfN7c0F5nvMBy3QFo4WQot6i9tMEtOdmcNsYQ5Z0i0DLddbdlo+tzKwirPaYdVn9cnazjrNusH6vg3Fxt9mvU23za+2ZrZc22rbG3PJc73nrpnbNffFPPN5/Hl7592xo9oF2W2y67H7aO9gL7JvtR93MHBIcKhxuM2isUJYW1kXHNGOHo5rHI87vnOydxI7HXH6xZnpnOrc7Dw233g+f37D/GEXPReOS52LdAFjQcKCfQukrrquHNd618du+m48t0a3UXdT9xT3Q+7PPaw9RB7tHm/YTuxV7NOeiKePZ5HngBfFK9KryuuRt553kneL96SPnc8Kn9O+aN8A3x2+t/20/Lh+TX6T/g7+q/x7A0gB4QFVAY8DzQJFgd1BcJB/0M6gBwsNFwoXdgaDYL/gncEPQ4xDskK+D8WEhoRWhz4JswlbGdYXTg1fGt4c/jrCI6Ik4n6kSaQksidKMSo+qinqTbRndGm0NMYqZlXM5Vj1WEFsVxw2LiquMW5qkdeiXYtG4u3iC+NvLTZevHzxxSXqS9KWnFiquJSz9GgCOiE6oTnhAyeYU8+ZWua3rGbZJJfN3c19xnPjlfHG+S78Uv5ooktiaeJYkkvSzqTxZNfk8uQJAVtQJXiR4ptSm/ImNTj1QOpMWnRaWzouPSH9mJAiTBX2ZmhnLM8YzDTPLMyUZjll7cqaFAWIGrOh7MXZXWKa7GeqX2Ii2SgZylmQU53zNjcq9+hy5eXC5f15Znlb8kbzvfO/XoFawV3Rs1J35bqVQ6vcV9WthlYvW92zRn9NwZqRtT5rD64jrEtd98N66/Wl619tiN7QXaBVsLZgeKPPxpZChUJR4e1NzptqN6M2CzYPbJm7pXLLpyJe0aVi6+Ly4g9buVsvfWXzVcVXM9sStw2U2Jfs3Y7ZLtx+a4frjoOlyqX5pcM7g3Z2lDHKispe7Vq662L5vPLa3YTdkt3SisCKrkqDyu2VH6qSq25We1S31WjWbKl5s4e359pet72ttVq1xbXv9wn23anzqeuoN6ov34/Zn7P/SUNUQ9/XrK+bGtUbixs/HhAekB4MO9jb5NDU1KzZXNICt0haxg/FH7r6jec3Xa3M1ro2elvxYXBYcvjptwnf3joScKTnKOto63eG39W0U9uLOqCOvI7JzuROaVds1+Ax/2M93c7d7d9bfn/guO7x6hMqJ0pOEk4WnJw5lX9q6nTm6YkzSWeGe5b23D8bc/ZGb2jvwLmAcxfOe58/2+fed+qCy4XjF50uHrvEutR52f5yR79df/sPdj+0D9gPdFxxuNJ11fFq9+D8wZPXXK+due55/fwNvxuXby68OXgr8tad2/G3pXd4d8bupt19cS/n3vT9tQ/QD4oeKj0sf6T5qP5H0x/bpPbSE0OeQ/2Pwx/fH+YOP/sp+6cPIwVPyE/KR3VGm8Zsx46Pe49ffbro6cizzGfTE4U/K/9c89zk+Xe/uP3SPxkzOfJC9GLm160v1V4eeDXvVc9UyNSj1+mvp98UvVV7e/Ad613f++j3o9O5H7AfKj6afuz+FPDpwUz6zMxvA5vz/J7VfrcAAAAJcEhZcwAACxMAAAsTAQCanBgAAADdSURBVCiRfdGxSgNBFAXQs4OktvcbhBWWgJVaBiyFtIowtX/gJ1iPTepAihSCrYKYRnDBH0iTn9jKwheyLtELjxneu9x7501VShEYIeMKp9FbYYFHdHAQgyM8ofYbZ1G3uMQmhfLzHnIfdXBGKWIcx+AFF2ix7N0FJydMe0rncd5E1QPnacJ4YD/LObc4xMNgNk578i4h57yOiH10VSnl3W6Na5zgLrK3+Aw3WCXMewptkO8xw3WIbDGvSikjfNht6i98oUl+fnASjf/IE3TbR2/QRJzXHvEtek1wfAOPOzLTfVs7MAAAAABJRU5ErkJggg==) no-repeat;',
                'opacity: 0.7;',
                'display: none;',
                'text-indent: -999px;',
                'overflow: hidden;',
                '}',
                '.modal .hide:before {',
                'position: relative;',
                'top: 3px;',
                '}',
                '._SB_notifications .hide:before, .modal .hide:before {',
                'content: "x";',
                '}',
                '._SB_notifications .hide:hover {',
                'opacity: 1;',
                '}',
                '._SB_notifications ._SB_right, ._SB_notifications ._SB_left {',
                'width: 350px;',
                'height: 100%;',
                'float: left;',
                'position: relative;',
                '}',
                '._SB_notifications .time {',
                'font-size: 9px;',
                'position: relative;',
                '}',
                '._SB_notifications ._SB_right .time {',
                'margin-left: 10px;',
                'margin-top: -8px;',
                'margin-bottom: 10px;',
                'opacity: 0.4;',
                '}',
                '._SB_notifications ._SB_left {',
                'height: 100%;',
                'width: 30px;',
                'padding: 10px;',
                'position: absolute;',
                'padding-top: 0px;',
                'padding-bottom: 0px;',
                'overflow: hidden;',
                '}',
                '._SB_notifications ._SB_right {',
                'margin-left: 50px;',
                '}',
                '._SB_notifications ._SB_right ._SB_inner {',
                'font: normal 12px HelveticaNeue, Helvetica, Arial, sans-serif;',
                'padding: 10px;',
                '}',
                '._SB_notifications ._SB_left:after {',
                'content: "";',
                'background: #c1c1c1;',
                '-moz-box-shadow: white 1px 0px 0px;',
                '-webkit-box-shadow: white 1px 0px 0px;',
                'box-shadow: white 1px 0px 0px;',
                'width: 1px;',
                'height: 100%;',
                'position: absolute;',
                'top: 0px;',
                'right: 0px;',
                '}',
                '._SB_notifications .img {',
                'width: 30px;',
                'background-size: auto 100%;',
                'background-position: center;',
                'height: 30px;',
                '-moz-border-radius: 6px;',
                '-webkit-border-radius: 6px;',
                'border-radius: 6px;',
                '-webkit-box-shadow: rgba(255,255,255,0.9) 0px -1px 0px inset, rgba(0,0,0,0.2) 0px 1px 2px;',
                '-moz-box-shadow: rgba(255,255,255,0.9) 0px -1px 0px inset, rgba(0,0,0,0.2) 0px 1px 2px;',
                'box-shadow: rgba(255,255,255,0.9) 0px -1px 0px inset, rgba(0,0,0,0.2) 0px 1px 2px;',
                'border: 1px solid rgba(0,0,0,0.55);',
                'position: absolute;',
                'top: 50%;',
                'margin-top: -15px;',
                '}',
                '._SB_notifications .img.border {',
                'box-shadow: none;',
                'border: none;',
                '}',
                '._SB_notifications .img.fill {',
                'top: 0px;',
                'margin: 0px;',
                'border: none;',
                'left: 0px;',
                'width: 100%;',
                'height: 100%;',
                '-moz-border-radius: 0px;',
                '-webkit-border-radius: 0px;',
                'border-radius: 0px;',
                '-webkit-box-shadow: rgba(0,0,0,0.2) 0px 1px 0px inset, black -1px 0px 16px inset;',
                '-moz-box-shadow: rgba(0,0,0,0.2) 0px 1px 0px inset, black -1px 0px 16px inset;',
                'box-shadow: rgba(0,0,0,0.2) 0px 1px 0px inset, black -1px 0px 16px inset;',
                'background-color: #333;',
                '}',
                '._SB_notifications:first-child .img.fill {',
                '-moz-border-radius-topleft: 5px;',
                '-webkit-border-top-left-radius: 5px;',
                'border-top-left-radius: 5px;',
                '}',
                '._SB_notifications:last-child .img.fill {',
                '-moz-border-radius-bottomleft: 5px;',
                '-webkit-border-bottom-left-radius: 5px;',
                'border-bottom-left-radius: 5px;',
                '}',
                '._SB_notifications ._SB_left > ._SB_icon {',
                'position: absolute;',
                'top: 7px;',
                'left: 0px;',
                'height: 100%;',
                'width: 100%;',
                'text-align: center;',
                'line-height: 50px;',
                'font: normal 40px/28px "EntypoRegular";',
                'text-shadow: white 0px 1px 0px;',
                '}',
                '._SB_notifications._SB_big ._SB_left > ._SB_icon {',
                'font-size: 60px;',
                'line-height: 38px;',
                '}',
                '._SB_notifications:after {',
                'content: "."; ',
                'visibility: hidden; ',
                'display: block; ',
                'clear: both; ',
                'height: 0; ',
                'font-size: 0;',
                '}',
                '._SB_notifications h2 {',
                'font-size: 14px;',
                'margin: 0px;',
                '}',
                '',
                '._SB_animated {',
                '-webkit-animation: 1s ease;',
                '-moz-animation: 1s ease;',
                '-ms-animation: 1s ease;',
                '-o-animation: 1s ease;',
                'animation: 1s ease;',
                '-webkit-animation-fill-mode: both;',
                '-moz-animation-fill-mode: both;',
                '-ms-animation-fill-mode: both;',
                '-o-animation-fill-mode: both;',
                'animation-fill-mode: both;',
                '}',
                '._SB_animated._SB_fast {',
                '-webkit-animation-duration: 0.4s;',
                '-moz-animation-duration: 0.4s;',
                '-ms-animation-duration: 0.4s;',
                '-o-animation-duration: 0.4s;',
                'animation-duration: 0.4s;',
                '}',
                '',
                '@-webkit-keyframes fadeInLeftMiddle {',
                '0% {',
                'opacity: 0.5;',
                '-webkit-transform: translateX(-400px);',
                '}',
                '',
                '100% {',
                'opacity: 1;',
                '-webkit-transform: translateX(0);',
                '}',
                '}',
                '@-moz-keyframes fadeInLeftMiddle {',
                '0% {',
                'opacity: 0.5;',
                '-moz-transform: translateX(-400px);',
                '}',
                '',
                '100% {',
                'opacity: 1;',
                '-moz-transform: translateX(0);',
                '}',
                '}',
                '@-ms-keyframes fadeInLeftMiddle {',
                '0% {',
                'opacity: 0.5;',
                '-ms-transform: translateX(-400px);',
                '}',
                '',
                '100% {',
                'opacity: 1;',
                '-ms-transform: translateX(0);',
                '}',
                '}',
                '@-o-keyframes fadeInLeftMiddle {',
                '0% {',
                'opacity: 0.5;',
                '-o-transform: translateX(-400px);',
                '}',
                '',
                '100% {',
                'opacity: 1;',
                '-o-transform: translateX(0);',
                '}',
                '}',
                '@keyframes fadeInLeftMiddle {',
                '0% {',
                'opacity: 0.5;',
                'transform: translateX(-400px);',
                '}',
                '',
                '100% {',
                'opacity: 1;',
                'transform: translateX(0);',
                '}',
                '}',
                '',
                '.fadeInLeftMiddle {',
                '-webkit-animation-name: fadeInLeftMiddle;',
                '-moz-animation-name: fadeInLeftMiddle;',
                '-ms-animation-name: fadeInLeftMiddle;',
                '-o-animation-name: fadeInLeftMiddle;',
                'animation-name: fadeInLeftMiddle;',
                '}',
                '@-webkit-keyframes flipInX {',
                '0% {',
                '-webkit-transform: perspective(400px) rotateX(90deg);',
                'opacity: 0;',
                '}',
                '',
                '40% {',
                '-webkit-transform: perspective(400px) rotateX(-10deg);',
                '}',
                '',
                '70% {',
                '-webkit-transform: perspective(400px) rotateX(10deg);',
                '}',
                '',
                '100% {',
                '-webkit-transform: perspective(400px) rotateX(0deg);',
                'opacity: 1;',
                '}',
                '}',
                '@-moz-keyframes flipInX {',
                '0% {',
                '-moz-transform: perspective(400px) rotateX(90deg);',
                'opacity: 0;',
                '}',
                '',
                '40% {',
                '-moz-transform: perspective(400px) rotateX(-10deg);',
                '}',
                '',
                '70% {',
                '-moz-transform: perspective(400px) rotateX(10deg);',
                '}',
                '',
                '100% {',
                '-moz-transform: perspective(400px) rotateX(0deg);',
                'opacity: 1;',
                '}',
                '}',
                '@-ms-keyframes flipInX {',
                '0% {',
                '-ms-transform: perspective(400px) rotateX(90deg);',
                'opacity: 0;',
                '}',
                '',
                '40% {',
                '-ms-transform: perspective(400px) rotateX(-10deg);',
                '}',
                '',
                '70% {',
                '-ms-transform: perspective(400px) rotateX(10deg);',
                '}',
                '',
                '100% {',
                '-ms-transform: perspective(400px) rotateX(0deg);',
                'opacity: 1;',
                '}',
                '}',
                '@-o-keyframes flipInX {',
                '0% {',
                '-o-transform: perspective(400px) rotateX(90deg);',
                'opacity: 0;',
                '}',
                '',
                '40% {',
                '-o-transform: perspective(400px) rotateX(-10deg);',
                '}',
                '',
                '70% {',
                '-o-transform: perspective(400px) rotateX(10deg);',
                '}',
                '',
                '100% {',
                '-o-transform: perspective(400px) rotateX(0deg);',
                'opacity: 1;',
                '}',
                '}',
                '@keyframes flipInX {',
                '0% {',
                'transform: perspective(400px) rotateX(90deg);',
                'opacity: 0;',
                '}',
                '',
                '40% {',
                'transform: perspective(400px) rotateX(-10deg);',
                '}',
                '',
                '70% {',
                'transform: perspective(400px) rotateX(10deg);',
                '}',
                '',
                '100% {',
                'transform: perspective(400px) rotateX(0deg);',
                'opacity: 1;',
                '}',
                '}',
                '',
                '.flipInX {',
                '-webkit-backface-visibility: visible !important;',
                '-webkit-animation-name: flipInX;',
                '-moz-backface-visibility: visible !important;',
                '-moz-animation-name: flipInX;',
                '-ms-backface-visibility: visible !important;',
                '-ms-animation-name: flipInX;',
                '-o-backface-visibility: visible !important;',
                '-o-animation-name: flipInX;',
                'backface-visibility: visible !important;',
                'animation-name: flipInX;',
                '}',
                '@font-face {',
                'font-family: "EntypoRegular";',
                'src: url(data:application/x-font-woff;charset=utf-8;base64,d09GRgABAAAAAEJoABEAAAAAaTAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABGRlRNAAABgAAAABwAAAAcZCqMVEdERUYAAAGcAAAAHQAAACAArAAET1MvMgAAAbwAAABCAAAAYBn9OLxjbWFwAAACAAAAAPUAAAGyqcFWm2N2dCAAAAL4AAAAFgAAABYKXQTiZnBnbQAAAxAAAAGxAAACZVO0L6dnYXNwAAAExAAAAAgAAAAIAAAAEGdseWYAAATMAAA44gAAXESxYNksaGVhZAAAPbAAAAAxAAAANgZDqV5oaGVhAAA95AAAACAAAAAkEf8OumhtdHgAAD4EAAABDAAAAfz/GCqybG9jYQAAPxAAAADyAAABABM+KQZtYXhwAABABAAAAB8AAAAgAakCvG5hbWUAAEAkAAAAvwAAAU4Xvja+cG9zdAAAQOQAAAEeAAAByhZSPFJwcmVwAABCBAAAAFwAAABczmbTkHdlYmYAAEJgAAAABgAAAAZ/CVBkAAAAAQAAAADMPaLPAAAAAMtiuf0AAAAAzIovh3jaY2BkYGDgA2IJBhBgYmAEwjogZgHzGAAJtACxAAAAeNpjYGZhYJzAwMrAwmrMcpaBgWEWhGYCYkZjBlTAiMxxcQISDgy8DxjYGP4BmSyMDFowNcxnma8DKQUGRgC4WgkEAAB42mNgYGBmgGAZBkYGEFgD5DGC+SwME4C0AhCygGV4GeoYFjCsZFinwKUgoiCpIKugpqCvEK+o9IDh/3+oCgWwirVATQIKEgoyKCoY/3/9//j/of+7/m9/kPYg8UHcg5gHIQ98Hsjej1aog9qOFzCyMcCVMTIBCSZ0BUCvsLCysXNwcnHz8PLxCwgKCYuIiolLSEpJy8jKySsoKimrqKqpa2hqaevo6ukbGBoZm5iamVtYWlnb2NrZOzg6Obu4url7eHp5+/j6+QcEBgWHhIaFR0RGRcfExsUnJDIQC1KTa/ErqEoCUyWlFZVl5UQbywAAlRA7MQAAAAEAAwoDMwBmAI8AZgA+AMgATABEBREAAHjaXVG7TltBEN0NDwOBxNggOdoUs5mQxnuhBQnE1Y1iZDuF5QhpN3KRi3EBH0CBRA3arxmgoaRImwYhF0h8Qj4hEjNriKI0Ozuzc86ZM0vKkap36WvPU+ckkMLdBs02/U5ItbMA96Tr642MtIMHWmxm9Mp1+/4LBpvRlDtqAOU9bykPGU07gVq0p/7R/AqG+/wf8zsYtDTT9NQ6CekhBOabcUuD7xnNussP+oLV4WIwMKSYpuIuP6ZS/rc052rLsLWR0byDMxH5yTRAU2ttBJr+1CHV83EUS5DLprE2mJiy/iQTwYXJdFVTtcz42sFdsrPoYIMqzYEH2MNWeQweDg8mFNK3JMosDRH2YqvECBGTHAo55dzJ/qRA+UgSxrxJSjvjhrUGxpHXwKA2T7P/PJtNbW8dwvhZHMF3vxlLOvjIhtoYEWI7YimACURCRlX5hhrPvSwG5FL7z0CUgOXxj3+dCLTu2EQ8l7V1DjFWCHp+29zyy4q7VrnOi0J3b6pqqNIpzftezr7HA54eC8NBY8Gbz/v+SoH6PCyuNGgOBEN6N3r/orXqiKu8Fz6yJ9O/sVoAAAAAAQAB//8AD3ja7bwNfBvXdSd678xgBgBBYAYYYACCIAiAAARBIEgMPgjxS6IoiVZohqZpWZZp2pFlkJat2Ipe4iiqq3VVxXb8ITtuVJOxHcdVU/+8ftoZCHaU1GkSu4mbOmziTS2t23WTbF7Sp43b5qVZvzY/CXnn3AElOrH727fvvf7e/nb5MXPnA5h7zj33nP/5uEM4Mk4It9d2DeGJRHpNSvJDdUlw/F3BFG3/cajOc9AkJo+nbXi6LonOC0N1iud1JaYkY0psnOtu9tDHm4u2a375b8eFFUIIJQvkBD/DHyHdJEDqKkeybEONWN6M0yzp6x/hKyO0i2oBkk6lU5URrtDFaQGOCHnaS2scF9bS1bwaztJKpiA4N3p74lrCleTy+5o/bJ7Pq6rjbTUZ80Y7vHIkSwczBW3DDq2TCznTXL75n5s/vLXP52sDqmrEyZ3h3yEe4iMR8kFSbyck29B40iVk653Ylq22QEnW9AnnqdGVN8jZhmwj24WsIcumQrMNBzsyozRrKrLiNdVQtQpEVJRiWY8VAn5FFROxeKoC7PCqAb1QLqYS8dpIhh7LDg5mm4czIzP0VHPmkfWRaCYTjRzguzIjI5kL/yk7NHQvd/KiE87lIjAUZD9xcU/wF6C3XYT4UpVylJYDmi8gSmIqzafKlS4O+JbupZK439sdc9dmHu+4L3zD/E1f0D6sFkcicikS7nTai51h/rWoV+7+hjY13Twy83QssmOGPjh+X/reasTpLHdEIk47Pq9GdKHGr5BOsoFcTepe4Eg9AiPV2CAQL9AvdZ9VGgHWrrfhMLaxYczlDfWsYS80PIwxddXjzJ7epBJH1uyF4TWlDYrX6Kn29fuKo7RcKQ/SUrGiF4BPUiKeVuA/laepZKygBaI0oHoo0JeI1do+bve5PS/6c6qaU+mLdr8qfdxJf0znXYrXfsjlOiTCwDdf44447TN2m/iySv0XHoENfVmw22aF86Jgn3Go4qxgF4C2RXJO4PgM0cg6UgYpxNF2CMQH/e2A0W4kBOIRgJhM3lyPnU44oNNi1ehQ6u28p1rF7sMAawFBgyGtlHsq5dWB5tiwi5IA3QZakqlFTtFoza2GQ6qbLmhqQr7wmhznHCq/R3V425sPuNRQWHXBntrpXS5BcL0kOZ3iV1zOQPN+ORbjOjStQ/yWCOe+JbJxOcAf448TB/SejFIHhW5IDpoOaAFtlKZAAPJUqhVphnKVHROOZrN5rhFza+6ZINev9be3awf+kaap0LbjigG8Nu9VtKAvkNO1Dp4LwfxcJHYhzP+cVGDc6yXkTI4HUcjW3UwCCA7yQN6gZxvrRVIF0a+yWVsGiSSVsoYTV8JBS4NIsr5REZiEbZzOcBSAe+AILwCH9gk7k/ThK2Zuzm1tD1/VDGfz/bGomKU7w4FwuPl8LmRX1DD9sS67N1X1pjAm6P0PTtJ/DpU6msI1i7Udy396c4Ie3z7T4dqW3wOfz3FiLFTL0dlwOISfD9q5IP1JqTqsyPDxyft1XdhML4T6w01hdgfqoxo5KRB+jjhJkdSdQJ4h6qDGgFbcNDiHSNthJxAFJaItb7pQIjiUCIJyQP3dvoDWSxP+Gj1AR/6w6N114Q1OppPfbP7Z3p1P7P4BG7OTMJfmiI14cS7Z4Cmm26tbzzEka9+wK258lL31KF/eaD/bcItkIzBZxYcqNnioUDXsSp0H3lerBvUanNUJSfPz1A+qMkqtvhx8882D9OC+pyfzgrDr2Yc4L91x/9f/7BG6i+745sKjv6frT+36wVr6XUg/Qfodel1C+nHTEJ1Egk6JrU615003dkV0Qlfs8OjKiKCXHLQUF2uCb/bAXxyhB5rH37hwUh1/7uj+bzZfbD77g+uJ9RxdyIA+yZC7SN2PX00EIoFcsXaGtamxPm+4zhreQqPDRpygZbTC6XiHyw4dsBEVjsV8I85a9biIiiW+zpGti3FsiqhjsqCHRdAJdUFWgUFmRxx0sj9o6WTQNCOgbnCOpItlnCypciHgoQHNzUtu6ldhDkVorPb6TRN5O5cVnDabUxDmfnyjze2lnMft5u35ifnXm1F9f34qsXWTViy4ggVZ5QU9XTl0qLLbnohEBaervxwY3ZaYyu+39OgkjH0dNM3V5JUWh7fr9QJymG38bENxXs2uob7916gPXqI++H7UGx2ymaFZI1doDNhwvIxS4fTIQAa+YMpG+uF4Kt8YYa3TE+z0dhvqb/Ma4FoGOFX3B5MoVgOKWZ4E7o1MwSgXqsQsEGCjHETF9/5c9K/lIr96SW9do6vXYPpHaQK/oGx9S23X5MaknYuBbhbsnHDFlz4gON2c0+Xk7Mnq5EtHRJ4XOa6ybbzK2Z1ciBM7stUDAUGk9MfDR7IRkQtNNnKJ6HBFLWSdWtbt4/lcon/fvv5pezQc5pzObL+/Mhyd7L+X63R6OC4WTn5wumdI1GKyPZZ0Z/q1XNy+0Nf3WKk8HC25kzG7ssb+ZUiJ/Jk1bmzToAKTRJDUft3M8ueNfKG+PotjsL4Iw5Fdj81szgHjWcYpbPgKjYglzaHCaSnSDnxP2JixSUh4byIDH5MS2JRwFCOyWYRR3FAwddt5o7dQ14t4Te+H24o6NovrQdQrMGhSOwyQUjUSihGoGhGvEa4aRcVIwZCtpzCeUiKF45lVzJjDGrwR+pujB0ME1gpmweUx8vMlvaT7dX/CnyjVvEPCu6bE/EcPzgtuqlIhy9n7Jm76Ml1ZWlhaWtBX7D7uvSdGf6g1LbZV9tPl2jL+ATtF4HMN+LzMcJhGwiQKeugHFhozZf58XeAQfvHnG6q/XWgHTQgc7y4YqtyIM7vUCIbY+SDcEulkzQjckilQo4R4zZSBiQDWQIOawc5CoaHZiAwy39FVKBiabKYBxG2wEQ3mRH5DGsamRyTXwlj15Bt51qrne5DneRzcnjw2e7phlDYw/Gc6bOfNMuzTGoxEvGrme2CfAf7HVWjoVTPoh6nTk4fZ1BmCVnoDG4f3gIe+UsyfbP37ijpOjlIRhsavijAmUa42lOX1zPBw5sJKdmiB1y+s1Cj5FbH+F4RdG2/QMwPZgF9a4WqIIS8uA4bMcrWmMDe3PDe3dMMNzZWJUFae6T8wUO2fkb09kjQBQ2BhChiD48RPesD+133I+zbgfRRVE9swEOwEvnYh7IsLyC9qJBmD24DBbTLaRdMD3EjB3tWmeBu2QFc01qMhL+Cw7g7EUCM7fcCX7ks8cFMPTSixUsVvcSJZHLGtGpSIRtOxjW1tR7mlhah6kWgR6uHkyPDs/bN0tvn8c0+e5HStM6S3tzf1ys6vqdGuV+3R2an58fznfkWa77y406KtxqF8uUmQXEnqDpzHPJqcAE/GkYgQQ/UAV7fBqHuYoDRs7MjsAFJUD/Qd3B3oOzEDYPbBfCsWBCyWcXR4UeoVKmrAgvZi7cQbn/mbGHUmdm0Z+OjMwenpjYPT3PK+Eyf2/fvmaxuoq+/eo89tql41fXBmGnhva8n/CcDZ3cD9dYC6brTQtuHXGZwGDkfE86gVuqA7MWjGZHSVzCQ0kzLjdwaaGRnBqukWzyPSNmNdwOdg1UyCXjekqplJwV5t+SYAvaMUXQiUQEmMA2QU8T+dGqWK5NOUtK9i7WvKP3iVt37glX/mlu2K/ftvwdH3wdHZ8vzzP3v++X9g2/u5Xd62x53OBx90Oh93+i4+q7YJAh7gv/Pq2znx9mYNtxcfvtwmYP4XQZOO8m+TNpC8JOklO6zxMT0gezxKHEx2auQZD1wgZS5rzokgZX3ocIGhPx3oSm9gQoYDBUfr8AgGJwVolIATKYmk0kV7yqDwBNE3gk7SKHVzoOmkshgA8F4RpUWOhl9boXGBa/5vr60037pF+BEd/z7H/bj50vefFJTxbO4Lw8OCezwH+1toZkgtJe8v0V++RhPwiR+vvNb8j7xAIytP/1D426ef+b7w4+bd4asb2dxYmys8y/YXRzL+0gPJEpPHCf4v+S8CEvSDH9eTHOG7OOiOyHkoXwFPgX6DclolEFVk0e6MOitf2TK2cTJCw5zQvBuO7aLs69Sq/oPNJz5+iB6b+3uufXUOT/Dn+DPgrUfJn5K6hKaqjWeuqrtQb2OWps3laAl/h3VFK9Q7eLzSEXIA8oxIfHvW8OkNO1OthgJKtJthfbvl9EYKdTvF++1RUIF22WyjaNUQpVbZ1xluNkSGWsA5hA6gYsP7FS9YrBiMWZsdlKDEgSJQ3NASeZxWdtAPpo0gXotAS6A4vbwyzAj458GlAFMEhitR0sFqgUGCsdMB4nJ0P+XAiXnMcL9wZOJIw/3qq+4GNjyv0h30dnbt95pN+tiRhutP/9SFl150ffObrhePML3HMCm/DDY+SRYIc20aQYG4Ww5tw8PajR4+0gYIuIcdUSOVN6JnDbHQCNvwhOEqoAkxw1HouBJAaoJAA5pjXjlt8/rjII5GG1CqMKJA5xW0JGh20B0qOkC2gCrZ0ASrYhxOV5Jwsnb9aClNXdz1v3399aP9ueYvBIG6svro9XCCa/4io4/Sr//29bFn7PLo9buP7O76nKwon++G1u5Nsv3pKKNtkSzzb/J7wa5WiOW7oSU17DrbU0Nm4+qyIe5u7XDkiCm4mbOLfa2UC6gmwBdXwcVcnBhrjA5Vx06PTUw0H2ke53r/eKxaLZWq1bGXNjdP0ZkWT4f5t/lXwD9Nkbq95U9xaEM49lxnHoUGPCg700swU2NhGrP5kjZfjU4cPkR3NP9xvvl28/yN3D56XfOP/rz55Btv0JvJKpYmgKVRxvdbI1YXCaOqwQsMYjkKdQUfprCHdTPdbrN8B5tsekC3+2ykAEPsY4EJH8h93ePDpsfeElGfx9KUpsJjQCfQMtiDVEnEY4peKFdGOL3gl2DQIlQFXzWeqmWfeTpHwS4c94mCv3OH857Bux6dPqcf/BEdyjVrdPn3N2rXph96WvjMO8MfrZG18RUviZODrRFC0GN4dPS2AtBFsZ0hewG6qKFA+gTwzbNGFGZlghEmMhEEFrD7HDAlRdn0AY2d1nj2oLIE6G64q4ZPMdqBJhERY6wVwACSYjozvFIpAbZ3DSrJUn+6NpJ5mS44B7O/Ist6ZoQuDGfoCoat9GWqUzjTfHkuO7i8PPgNuoSIo7mCR0wGlmFe1YC27jWy15Ct/rsK6Nwyl9bqxtpnQjdqiFrw+1a+DUiHLtMaop4mwJmlpaEW707xe/kZQIxpsqflU6l6g1pay1+ou1DUu/WGxCatEYYnrssbzrMGAV1l+VZuZk9RUcXZCfScTLfT8rC7FMNTNeJoQJnjCGYinUrHU2z2AliWxNh7nKsd3DYQUfLD1147/Jl0+oMzj8Xog79x6tTEh68b7qEwWT/zyB8+n7L/2iHQwjM5nwE5R/qy5BpS96BVXAdWMYx8TAmIYI2UjBimC1qxQj0E5tKI6GYKYLCQ9YRBYwkC2QwXBbmhCC1VRY0NeTNnMb5kMd4SYV/MB5z3gmjTQQoAFPQR+GmIyHwxPlZL+PnDajKp3pK78E6upvZkJLv2B94+eiznPanZRVf7hWXX57mRieYMvb+hpdNaQ80gLM3QKS/nHFhaGnByXqVJ6BSjbx/oiMf5rwPazxAdNJQRzVOjmDdLrGesF8VypRzQy9ALXsMYZw/4KWno0ggPhtzNg9kuV/x44UPeRW+7yxdeH7v3wXm5P5tv1/7sc882/4+AutmdFuYbjU9XBXH2+dc/nd919UP2qHtTdQ9X/Ktd7qhPlZwZ7oGVRNKeTo6+NlQNjVY/OvCaS3ON3T7lUTX/1J6J/ol+oY3L7PSnW3IHSJJ/nMTIGGLJKI6KH0Dx5ryZwgDxFoZUFEAqimxuAHkaAqQyDvsNiuL9YrsUTqwrljYztLLZz+CZkVKMda1o6AhFPeum6ZSHipqqBcA9w4Cah+K5ZIopYjiVLrI70imEceisYZQUjMbGpYkTFVl2b3D3zy6HaUd4qiOTTMhUyVSfrlbplYmEe73cv+MkXBov6cmE261XTgxW6MDJyStHaXqq+viEd8CdkeET/bOPh3sSUbgzG0u4s+4M3FX9Mn6kf8fnw8lE13CxGOuBe/WSWK3MTFeembR0/yR/gX+eBHDeB1ioUMsbgbOmH/gQBD74A6sg1IdBfh4HWXJzvZwo+RK1G+eObN+49YZ/e5dbse95eOfwyNZD03OLfD42vq5726TuzItu10PL0XB/ND3ePMHGY4Z/hT8FyLFMfkTqadQDCb2eREteEEgH+HS5QtKOE6NBLMQTLtTdOIfK1mXRXYbLAb0hWJeDLd0h62xPjUre4M42+mzs7kwfB3c79UbagkOugtHHnHUM2OANsY6i5d3jVdDRst6IWQfegjmAbmIGTIpjfRVd9tP9hVIZ0UHMa/q6ETkUknC1CzxEUwCtfTrfpxfxuqiYkp95HOAUpsuVAGge2OqFSkATtQBuVU2UUpKI20RcSqVBNUkpr+WUxGszMy5tcrSiZjP6ztliJquWR68MeGZnPYHJTRU/nL1mpw5nK5VZ7Sd3fHb//s/SQ/ldU/ls1jsKp1z48dnKqHddb/6JfO867+jgtHVyehC+k5Inbr/9idtxXi+C/uX5v4BZXSFXkxKpx1H3IyMbVzFNxUJc2842VJE8acWdiHlVHH1FtVcfY8C9UqxQxEEo/KhY8dffygPE0yjoGFfHX6qy6PsITQEeFOEIgCKGnzEiD3wCqMhuA59ssY1+nhOdyv3usNa9fXhTsM3zoJzvinp9zXmnwnEudzq5zmWjN7e55WCXKkXyGYFSP2/LRCNTQTeAc04Qs5FoKhX0iILwPZ+Lft7rjXb1KffLruDw6PaY1uF6QHZKHHyfzd2TXCfTbqXN3an2ddozQRv9I8kd+kA0krHxHBUkd/DKSFT1wzeBD1QjGcA054BneTJMtpCvkHp41UdFXLPeMmqbC3UR+TjY4uN43sifNfvF8/V8PwtPYOSoX0YA0/Db0LOt+2N4wR8E+BDzYzPWBff4ZSaIY/DJsQE8OwZOgbkVTvXnMW6azKGX7o+B/Inh4iDK34BieKvGmLduV0aYG7w+DEOmpHLFEbwMOBeGbcByuxBU4LixwAVzsyK0iyLGQHRbrrDQEw8emQZCqnZRvQC6vpfCIFFE+GLNLxv6N17VDbc/u3OsOr1lx/wnb5o/Nr9jfKa6aVd2h/3Gq/rFTcn50bH5RGJ+bHSeLs7M2+/h+FnZPz+vuafuni8lSxP6uD0fS5dK6VjePq5vq6T7b7o7O39Xdd/JZCgejcZDiWi0+Vzl0PyTqNcXf9UURgUK3vc44oke5L8PE0FDAz0+sKRDjOkN+yZ2ZGeqghpbMbpnauBvbwPuaQisfMCcgR6YxCQPU3xIOZ3RwyXk0SavsRkD90YbY1IF8yGjNBClKKmg2VHS/eCJS1oARZ2lRvhUUkXpb8mzlVCqFCqpBIKNRSrI9K1Q1zNROfK77c5Ou6jY5VDvTq9s111aM+H1KO1vOrh97WrMLoUCcRoVnGBdOvlAMNgbFim9RbQF2uiMTDlBy+z5WHJdxMn7+3PV0o1jMEuejsrNU24v3eh6J+iLiNQTzNgdXk4Oyy6fosbBTWeya8XuwiQBOKVITpF6CG1iFJCKk7MSaYi8EzCm3WcVANTnDaHQyKZDTuBjtuVRsTAdhkgR1ERkMwkinLGcq4wl0DlLh+Zksx8jMq2QWxJ9RckOjM4op6PxRFdLl7rb4VROMeSq0Y/RUWKms4r3xUh3rDPXm8ebdMXob0WgBmkBFU0MHJ0AtC9F5EhLd3KWoxZnx6Uiy90ejtm77VE6lxBjYuwwAuILKwCPyYk3PvOZN/Lohh2hj2oRNeFeoSuZ4chNEfgDBKtnh4boZ/CmE82v4V276XREVT1Jy3bO8af4k0TFjCTGfzDnFHx3ctWfNxwsVAXnzQAqzzYOhc3DjANm2WAOoayA1MiS2J1O1W452NV94q98wsZK9ujRo82Hjmbp2CAV1P9wIhr9X/ZGs8eax48dPZq1YggL5LBwDX8M5kEBdJFlRzdYvsiGJOqKDRKGtfW80XvWDNsAjvbi2XA3aJAidmdDshXc8xVZVywFzgRbRLCMez8qatQNCVDOSYutqbi4QJ2vHL7lpj/+ww90aZwjLKejMXBoMkHOqed2Pr3nT26/mf51bnMO/ujL7a5DP+uJfLh/c1+P25kVBXcbpUK2J2SXIpNub3k4S2vzW6O5XDSWy1m8/V1hPf9bZAPo13qGtGoOGk6GAViQTT6LJhx9JoyddWAm355GVefMYOhSjmIYXVWMiGWhRvhRGnfzEjNUl4iEEzhHLUuVqnG5f/fSqYGqXH7qsS9vExr3/eX09f9rJ8dP3aHPlq645aZD43lJbvNEnrPZal89PO9XubB+aDba+e3FD7b5ozzHc5mH7nkgWeydXPBI7S2fvov7Mv9D0kM+ZKFP9BTRA3SgjDiYjCTzhp0RgzPGWajbO1i8ppUeCmCQVrSCtIEOIK3dpzKVLkZZQs9wwCwNVS0qy4w2RVe7OBXHr1Lu5dJKoEVfOrXYuW4qtz7dMzM6uTnrFzneKfq39nMzY/lsZ+e4Ji2l1w11KR7uyeTOK27dNxnzig7v9PS4/eJb+nxIsatVH2CGBcBw/wEwXAfpArnb0crGxyy6WAqyy9K+4agqtSO+M8MYFVzNzUfBUhmpqhFWEE53eesk1MrQt0QwVmCoAMaHx5md5tIpLZaOaV694EuIUjy90GG/WfQm6d8nAtDQ6B5n9OKzUee8jV7Fvf6RpjfZ/8zT/TemPzCV5r1Rn31SlGXYqJ2SdPHWSIS7u0N0ffR7zR/T8J/Qr67GlaKgF39IQmTWwsHMdlsGPCgExHa07GZQOA+wsB4UcICCIRigoNxoZ05bvT2IJ9t5nG4deTOMlLYHgVKKlFXSuqbzui+mF7o4sK0eGuMTvoQEQG/hI188UvsJdcrOcqb7ylSq+c5Pake++BE6c+pUjS41FxzuiBpLcFxzgS7VMP+yCPhDA/yhgQ7PkSrMkEny9dYo9FkVMBVsp602o2HMag+jidzQAiRXMt8nKJ4HKszI5fA0xqQnoTkpm9tb4ekp2EeAGLMDUK+RVMwwTC9jvfcF1d5b3LgJNfSkYo7vgJPbvebWK1A+K31wf28RTqUVs4SzcYO3wXV3bL0Cbx9WzMHRKmIUc+Mma/BxZlYKbG4C1ALFw3BjRdUqOGnToIbKl+pxeGiAlU0zq6uh0IORFalWLqXSUkBdPHbvKzz/1U89aKOfvO9l0faV+x4cyu2LRPblzhydn/vksRvmb7pxThDmd28a3jQ2tGnT8ObRkU3XL+6l+27Lc7nbovSXPAef5j95n/U13LFPvbxndnRgy9aNozv3Cje9dPToS0cv1nN9iyBOt8NmsU+4+Heju/bBTcP/huXIMoIKY6SQCEmTfkDXWzDGy6ICWbC1OCjmZmiwXHrKGp0Yjk7YmjsDBY+/PWsO4MQZx4FCf2Sd7XwjKpLfAj2xTsZYUSNoHcEAgiduDoIfOyibI60sF0LEnnUAC8MxfwqZHlTqAt+HQ1HyNjzZXAEhoDGo1F3iZqZTCmB2T5O+UgtE1nkHwkdzM8xYM5popVBgklpJLoCKgBExHMQOoX15gHzYqgCiFxE5wr4Q0FgaExMu+3e5zj62/FfffCTx5J4jXxzJZYeHs7mRvnhIi8e1kP/w7F3D+57Qat9zH5ji7pq9u8Htvmt53/wj9Kabnkocf/Wvlx99w7Xrjhe5Y9lNm7K54eFt/YlEf+ziyzsPLWhL+4Z3T35Ymbnr1tNH5E/P7Vv+WCs+80OY31FWi5XDjJm8pnZMRL5HLL7n4jJM9kaO1RZRo5fFXFUbVhcZqoz5pUYbOzLzaHZUxfuC6JFt0fVW2iwHx9TZRjpUBq69xRG+0MWrbj7ey1UYc5jpDCDP3KDjRqgGUKWW2XXw1FdOfWRXJrPrI9A4uOvnx26a/+Sxr9x7cEveLSlOcSgrbL6R/rxzZHZS1ydnR1Ybk3P33DO3++jRe3eP9fW77U6XOzdm0WvJnwQSqJE7rewCyxCil8LStD5WwBBEAlFaDIdsetEVsZKp4HS4gUAbiFEI9l5HKwlg+BVTboO9G7wNPqAxsn1tgNaoYLMTt2bR3coEcDKSLKM8KLpfk2rUT49Rtfl28/Cps8uPv/nm48sf276s02H6SXb2E823uTua333zTdr3ZvMeGryw1E9a40e4dwQCc6kPNN4XSb0L6UkAOtUKDPVgRMBplT2VcDj7rVRAprer1M6KVRQYMt5TKFBjI0OvkpUAkWRzHQU/DDCuBWAHCqe17Do7zBzgSU/e1AA0aSyfrIUxn6xdyidnWQa14bOKqgaBS1mYbKbTATNGQ5eit4RzKtOLrHOxyVMqAmKNUDXQXR6m2NZwGvl13KOlw+ulXlopxaz5pJTY5IrQmj+qHqLuQ/4ulT587zGV+ptYLHfs3odP0eKO6ZmJiZnpHfTth1T1ofGP3jWG+/nfc92njqjwd5/rsRs///morlP7m7CNvklavoAOfuxKK4efII+Ruh+5GlzN4dtdut4IW3YdCwmNmN7oZBAX8/lhGbGMyjALBU4xY2JjxqQT2BK1+BuVzW44SlhSlZCZNCkgVeAzmJ1oUkQb8Ks7irUPyLqqGUrAWVfbparMQerXMcBZ0t+dfq+UdH8M/mtD2dxJmvmDPgw6XwTIvsCtXNTnJuix7ctcLTNcg5/hVnKdLr19Cn5a2EznOKA/QtaTy+Z+tWjUwwpAWJmoB2tpfFZJkq8FsvoDgIsRpWCkr4wQvh/x1c7rb9htp8JVH+S+KnCNPxaE6Uyau3EvF5T33bl4s/DHLzqFacX91ncE7ks3Xu+g4rr1l+X7JMh3DHD8Isp3N2KQFBqHBUtJeVCqe1um+1ZmEdoK5gQY57heKBgTsilCV0fAbo/I5mRbtjHNIjbGtGze0JZFpxdrJ2bhnvV7CwWWoFYK5j7MN0yA0hLc3QPjO1DtjygGTO9pEN8F2GuKcV3VmPW+4PF3RK/+EJvuC92Kt+HwD0zgodmbAu7ot7QqjUa4UrGXA+Eus0C1G8BOF4cR63jKh76x5Rmn0oCAxChGgMCsuwVJjFD8ZBnsCCYPi+leAVQn3FsBGFAbmRwenhwx3zJGPjACf8Zb5pC4G3SezX/T/rt3ejmOmxNj7pDTJbXZI66MOGc/tC0Y3nrIPi/orogdzunCPLfv0OGDH0vOjmwPhbeOzPQcSkxPJw4lrxrZGg5tH5lNfgyO+R6Br1Cdtzk9FUorMt9bTFwrRj1BXyDkcke9sfaUtCu5RUjr4K17vAk9LWxJ7BYK7mS0J5p0F4Td3UVQPzieh/kD4Je1gcUJY4SCZcnloM7SXt7VIjqVVTQ02l0OMPaNdp5sxdHttNLnaqGA+SIs3RWt0mWZhYmwNiaEtp+lxRC54URZY4WVUoH4E8VUutRNlIRMauP5/vHx/vz4W3TjoV88R8fotw437/lZfssWOL+FXv/x5qtvPf/zfzzUrDS/SmV6TytOMMMvg/3wMgRziNRTLZSPpXyYGDRF/nwj7E9xAFMA32NS2SnjkeHWsfCEJXCiZxs9NuJvJWt6MOUqu1ErhhFSaBFmUE57fa4Aip7sNdswOuBUTvPg2lnxqXK3JqW6JY3tE31SHJoF1kzEJWZIWVq29jo3+Z2JetNenzhB/+D3Ju76Av2jQxO7f7l7+9Asnd2YHczg/M9wr37vexONxsSJE1ccoh+f2L17YmjopZ2DgztX81STvM7XQR8myRypdyDNAkuCme7uAvhmSHgPEpdiWsJnZWOt3Wmbj4Dh6LadP+1mrRiow1jedIO6w4xzrBudVOcaxYblQky/t1SbhyVwsGye6qVi3F+L+muvUbr31jk10+kfLvU1z+VLw2onJSsrdfqIlpr46eE7JzJq804V8LEs+8U0/eHcgQOXcuU6y5XfZumTFiWGamVcTQcoeoeC9szR7siukhSySLJ2p9tDSIgLSFJZCwCBYcuziA6SZHPhiCqWqx29XEfPgJ7kT5QsPXCZPMkiDwijS5V8jdYWv9UiLruxea6aBeKW6XEt9Uhp8M6MeuDw4QOHgbwD6nrRK1PFK6bJpVy5yi/COIVb0dd2rrXBHDLGoC4p60CU0vIapx9DdVkK3UgtUiGoDcqHaN7d5bCr3pDEuZpPBOKUConAix767222Lq9sDzxN/3e8xG5SLn6tu/PnPsbfd7gJ3klSZCupt1ErEdxjsbgLTGI6bxJUr/YCKw91wGlfAdGG2YEGhddwHrQhUGiPVVsZpXSq1Ic8ayXxQXF6KNu1Sn4wSuF76CFfT1G5/15vUfbhgU/WfffeLxe9PqqHvM88I3fQUI/3iSe8Xi+05GeeYTuvd3nZC8CsJedWHkYCDXVDq/bELpA2oVVt0sba1HCt1pKg0bfLpsMqtcJoVjt6GXbwF3hR4phdsEurRSE8lodQwSoKKXcHZLGbj5VitQv0lgsXmp+d4aSL/0yn6F44eOICPbz4a33ykZ2tPjmtiBrrk8La1FB/rU/tl/vkhz61Y584UeJZnxQnHAE0JS1c2uqMjnCilCgl/InVTk1/59bvwN/lbh1aWVn8znfIb/TtCmL1R7Kqode0V/tms6aQtWOdslGc+i4ccR655PC8izdaRaukK2kpLWmr3dmy68kndn32s7ueeHLXZy/3Sd711FO7nnpi91NP7X6CzXG6wn2J06FfMWJIeZPjz+M/NexrOoKjhlnaoh4r4NKMKOeP0q6LP6UrtRqT43Pcl/gMUDZq+UWWQ+Tj5FbYwwfaHTPRQJxy1uALqNAMCZSImxUKUQejkT0BVVoB5zuWBqjxYZqoRc8tnIPHwRaedy4aPcc2rI5u1UfxgK8QJCEy3fJTfKt+SjuS0sFcFDs8026Fw9ApCWM4DEb6BZS+NoWNdbtP8X4Rx9opB0Pv8kN4VaPoefo0ywXL0zWeyMlp+k97/s2J7y6G9x557C9nQmu9EXru6E30/5z5bvP20Ae/e+KePWEmC4QbBqwWIHGy1KqWWF2GwNjHVqR0MzPP6j40Fiv3WuUdRrnjy8P/9DNC/FmnIfa6DeFrpkf6Z0P5Glj50zZR8GVthkc+LXsUX7YOx92f6v5UQnQrXqDQpvT2UrhJhn1vr7Gpg5oRDasdnd3Mf+92omJh9S8+9NIlXqwUKhr66RVfOR0XJd8anFCbe608tWG7HMhOd+06o9fyw7Lsno18Y8dwf2W62l+hfzt98xeafzdGhzO75hpUGKRJP301N1PN6lMVC7euxqKcwOcscIbVD2HZy+qsNTPC+UZPl53Hgizmn2FFA9qZmFVhHbMKegHouIBBOTSTmElt83h9CAnSSkPr6Ir0sKwqFmmR1UpBLxYKJjH2A2YFa3wwGDRKyzDMFdEaZkwkclR+5RUatDX/4eVXmv+Z5uR81G5Pd45GP1zy9odc9mw4Hz28mUvE0vnhbB/9JdzLCc2/bx5unhfgs9+IJBJL+yvlYDL9zJ7qK5FoLjqYX9UJOneG1ZtvJQ+Q+hiLv1n4iLlPSeF8PclChUmC5nUbIztjIyErT7IeyN7ICp1O+zeutzN4h5c2yuh1NCRW4sxCcBvXA+BuFzoTSQTcsh+Own2FERZ3iyqGC0Y+idE2yWvlnCvWGEvM4ALAlhLxUpmVUZYt+I0pWbjgK5bYvfALplEK+FmgGH7BlamJ+7ftPWZk1YlcxikqR2VB844FQyEpEg6Ocdx4Z0TkujtTlOP5fFcnpVx3OMNRns91dXKNZ8dzRw6PD4cqsUi3N+ymnr1htaTIqicZyyd6cvn8xR/xQl9nB9cVXo+NEBcJv0ueNLIJtMGtrajmVla9bEUyh1i7MZlXMU4z2XKIrsobISZSEUukqsBAtxWnmUGRCoFmUO25fN/QBAs/VhWjCFwbyiut9TjvE31EGFYpay1usrJPcNdbyW7kJcIcmFXo2qAMFtMgc/73ij/S8AGvnMxEZHubKDv9mugWbreJwUjeHr5jZjg3Lu73qhEukua2cZHUe8QfaZ/UGQ7RdWGv5rYJbZLst8sjTsHpl73+tDORn56KZBebpzu8Kk1GxvlUhLf4OSWM8A3QgSpo2JKlrTCrV7chXrIxJ8TvtrUzX0S3qqsxygW6ButdUImWixWWIKYBVWLx+CRaTl1JLNroN11+zU6/abM51Qt3qk76R3fDz4LXzse83gvftytOWd65cCUttvJlQoY/Cf24itQ17If3XXo+xPR8q/jf2aoaxoJup4wow+HXrNIKw4663guTgBLRrq4adiyA0qW0zlLTGHeqaOgW/OLUc78Qjrz0lU8LXzxy9MUXj9au2X7w+Ck6Q+fe+dlzr79+pH6m+cszw1O7VvMAq32cafls7jUrGlb7GIA+BqzKZqnVxwC1qoMU5bRDaGuFxdwYDRQl4gparozOIqcyBq0rq4ExUdKl2t3CL5479c47p44fnJitYS+PvCg8+hLnfO5n7zRPvrNravgMFc/Uj7zeihVMCDXAIiHSQ3RyLan3ra50wfUtVDhvbLBqYqxNGMuyO+Csp3CpZMukWGOYxPWRmxySW/V3x9Pre5G9YUCjXZYvj4n+yggHJl3DYkNca8IneDit4fRIJWACFMuVwOr12v7KrYOV0as+d1383Ll45bahSn9l4SPj+/c/cFdVdMjTu+lD+bCL2309Xn505fjY1onZ3bsPn/nSArRGx+aydOX4/gmnS51ufm6wh3MLu2tnzhxmY7LCr/A6yPCVgLNxTFygWdcs+PO0UfBBOaznUtgSPInpgXo7K6Fux2oJLxLtAWcFc8ycYi0ErPgvLegowa+/do5jTuLFEW6pSbjDZ+4cyjbPZQePn7vT0vcrwHcdELOGmgmRiuHTTaHVGcNlrQo0NexIEIsXG4KlkAQZAVJDYUcsAiY4WWYInV9OdKEMG61iBE0AoeEIAGhLsn0VLaHoWiyeKilJ1l8UciVRe+WVwz862jyQHQIkczwz8omX4Zirraw03zk+mKX6ymC2ubKyQp2WzFACviBhfU/ALwMsJg/ALpDH4n0jnreSdD15jMwRq+45xlzrGKuYfK92LaJxNTUaVS8ua5H3adNopqsrE317XTS6LvrTTBQOMb5AibBwqT+DiPcZhCrrq53Sq7qOPTNTGwqFVvfYGqGhvDFw1kgXzBLMwmyhXmI1MaW8I1sfKGFzoAcGfPi/mgjbZdAKSl5dxa1xdFF1rTMSaK6o3e/Tpj+JPrtwCtDtqYVno+9B6ROlU9HoqX7w5nHP4ior3EpLhhIkj9lGRneMxYVkq9zNg9KU1nGtNp7JAdF9LODnKqBoy6w4DSPXQYCTPYVG1Dq3voDFFmRNmBm8XGVNm77P+drM3MylP7rwrqOotTvDds231x5Za2GsGMPltWB3vP9KMDQx14PtvrzoqxEKsgshdqFV/f1e6788a9Z/rS7isnz891uYhTWxNpzUQ1mOsHJkgpFh0iR30mjzh/D/Ixpd5r7NFl4V2cKrb1/8wq5d9NO7d782N2fhu0u09b0HVcwhutzd1W7537dbtZEMfBRfIkAyI6wrv/b81Viw9dwQ+BcpcpNVW4K5Dstodqx2IQ78cyS9yEoHzI0oCzlghzqgQx1M5YA0mQk4SrAo/GqaB4vMMSa17l313JeiNNhdnACpim4FqWI+7DxGbLTOZa2zU2vC5F5SuxdqkcAyKBmqN+GfW8AZvwyTfslqbKdwpnaxyBELLxOyLBC+9t/GzxD9TX4OZ/giq+X5dma4xhcvfJuSS0MNp63nYr1CCPT23wIC6iEbcMZhjaOZhCcn2ULcJK4okFbtJSsu8Z81k7ZLa7W6bNYCrVQSkxTtTuZqSXjg9K5brVwoV5IIknyJNKBtMUL5lO83RKCU9tC0tGCT3NwZpz3guK125G9erEzewf+FJnM/krWAcjEia/u52o7njz00z33N4fAITaGz+f3l5anKSdovXbyf/kgOheRmRA4Fp09+YeR+469bvsiyMAO8TZP1GLfsadV0GbRQl5G9Lmj7C2CPemTw6cNgteBEpNBw2NmJkM5ESAMRyuaxDpqYApaXrKuC382WRxoOxVhvwQIEf63/VclJsHWn1r9FbI6rLbCfkMwve7Ua+9G8F2pyCLxr8ivyynBtAX6HgRDlcrPB1piunXtl8uHWmz4CVl2TwLVWJ7BSX3q20ctcR/SewDEwemWMDeCK6qhISlYGCh1Muw0/zSope2W23Ae8LBjCeCLLxlPAQufce630vFzSp7RKo1brVblSQrEcAPFdc/tFmzOrqsHgrqLssAmiTergnP36sE8NhnOaZ+2k/3OXK+YS7eErqNOeDfplT1tbIuVyFkYmvM37JKfS7bfmziKpCbfyy2zVXV+r2kxkocZ6N2KgJKtwrHdwFp80a90TEk5WnRssqwHfRuLdFMlK+9jKAayiQ2qjdFG0x/nPx+wipVlOjV34Rkzlsx4hpj6rJyNJnc6rKcHJ1Ww21elyOVWbrVkMh0JhbvsxLQI3hOQM2LeFVt4gTnrJANlGbiHWm1kG2fs56uu4libTsaN5K+XeNt6pt7OQIyYT2+TGNmsZxGaQxu15c4JVzY1jUM8X6EYHOLHNwnHrFBMnY4tArPDyx0pal6BKzE8DTyXFpVOVEq6ajhW6aIQmV5t+qgLVcFBKwGcSC5RrE71ClN8dgU87OU5MJDmnfrFUcohbJO6RjnYXt1dUIhc/G3a56OOiHGmWirRf66B0ovlPE9zvCIIo2mW7T4jOzEQFn132BJXIn79lL3DFEP39TvlaHe/lOjR9SQtDI6w1Z/RQe/vCzExrfOf4KPgdPrCgV7eqE4JWfFG8XFG1ujzKL5IBK0cfxnoEdsQWQoX9WARs88jM/+jC9KqDu1xd043i6+fdXLyXpmW1i1qlvHFxcX4vLe+5YQc3dvSxY2Pc2L2wHTv22L18jOc2rFu/ft0Gnrv4tKsvk8m3c3tCia6uBG5W4yBTwiL4mF0gm9e0ciY2lnA32gvs0HQARkY5ZRuWaOg5i0X3mJTHNEKih1UhgtOJdQbEV60a3cpp3iMnWjXKo1SXdJDVGL5/Jq1bBeZMkPM05XNQtug9cXLvqRccfJb2Z3nHC/9u4Zk41ykktQtf0T0R7u+pSv3L/4Xmenx33CsePCjee4cadzifUsP5pxz0QSo0L1y4gPT8qtlasxYF67uGHvnX6IkjPXFGD5jdGEt0IT0Y4O+xStzW0hNn9KQYPfy/QA++TMfHVvJTDglqIEEFIKhxau/JBBcR0uqFl9S0CBQtvbPUfBsJ2n8MCTq2X+2xO55SI51+oOjTFy40L7TG54jA8UdgfMrkYaveF/UFlkrYLL8FQ/+rifwKkzCAlNdbuhOjVF7rlUkDVvTy665f3IXRS7cRkY3Or5kx+z8b8a+R052RWBzDkvRSiwUo14MhOW13ukQrR5DECiOHt681sBUfMEBK2JKJNFrPd/NBUwFaU2uiFltxqxgqW9/TWvE2/wNUpML96mJJe0bmEkJSvZgBHZXgrqXtXCLAzWkJzu1s81Pu4j6f20k/lYrRe3LfefPN7+SaR7riXvdXEad8tb3XZtuhRrv8O3je64KntzGfswGYYYoEQYuxqghcCudYXWcasGbmmvblsAlG59h7VqxIq56ySji0Vp4SCKvtnxTcgvD0gbnj4ZBcO368dvHU5H66OHkbF3Lf8dnbZoUHvvXAbavxiDr0Y5JEyHYrFga2u+G2usJCYyEBs6tGoLC2orQrjxFEYoZU9s4bw62cpqISbJUkAcPXdsqPq8lKeloC8w1O/FQAerb70bArUnvo+N5v7H+hfltzikZ+/9aQC/o2wz2wd8/Dr/z0p6+s9u91rsbnmT+D2SLMeKGPYrcSRC0grNGAX6JiqhYL0RdlubkjFPsnTo6ocvPnLk+4+XNZteR0iTsGGAbzAf1WjsVw6mzPFr9a60I1a12oHZ7TbkVIldXn4DupcEkk29e+9CW6cObMX3MTW7ZcPDNGN682Wv1eBnxRIw6MibEMjn1NNsfeGlMnwxeilc2xdmwp7Gq8SWZ55xOPfe97j52g++iG7363+ZffbX3/qp+3+v3ONd/vbH2/y6pEsr7f2rW4BthRiyEdafCyp+jK5GRTn4KJ8Z/G6ZZmFxLx7rX4/WSSPPMea/EbvWkHrhAf01u1I8YVhUZHjJ0b1nFROZ4rF1arQVtr9gP08poo2SzA0ah1NHp5PT/WhBYSMJs7OlnoyFRG4aA8wOo7iRlLK95Nzs5AJLO+MFAd3/ovrPHXrJJsiS398VtrhLRWzXJy7TVJXXvpX3oHwOF0cnhXcpPTLbeNynI0Iw/JyURyMJukMrsy6vTIToAC0bR3UI0lE3jl/d8O8MR4Kr0lponO2USHlolEg2oqve3SuXQuE0mocOp/voPmX+kdNCyOAjZaJzaQfq9VtS0Qy5bRS6YalSGuMhatM74CyyUS9i4A3qr2cxYMnpXxIb89TG8ZwQKr3sY4CjiZGCnRY4pPYSV5VGH+To0Wm/8lk6FtNY5E1aZOV8BSkZVfEVpb0X9FmstwAGdqFK6ukF+TC/L/O37+z/79P+vf5fdS8Kjv6Zp3pa1pU0Ng+p639L21M20t6xVTanwRvuRCrfV9kvV9Pf/i9639uLT68f+h87L/o70P8b+396L+99ZfL9ZCtjd/7X1n42QCENc02J1bySFyN7mHHCP3k6e4UCuuufljuo7BTXPrJwoFK8JZ/bDOSmnM7b9VKKy+G23HETiJOK37imt++1M92prXpJnXPgj3td6VNnUU7gvCh6/8HTjZCqBf9Uk4iVH0zMz8vY/1YPTuc/86L1DDKDIuONkKza2yeQU0r7wKHjRpPeiDV8ODJmVzDh70IetBez80Bw+6znrQdfnGXutBe6/Db997Kzzour3YvO4aeNCHZLZAd8TGipmxRvkT0PyEbP42NH/nk/Cge6wH/e598KB7ZPNReNAJ60FLJx6FBz1sPejhfGPJetDSw/jtS0/Bgx5ewubDn4IHnZDNw/CVBwHOPv2br4Qz5yZhf23V3Hsd7Oer5qP3wP7Bqrn0MOwfa70yrq4vPoll6/jauBd68tftfXgJ0TC+O+6F9Ia5Dz16wlol/9/wAjnbv9Jn/qtfVEcf/3//zv87L7/b9//RvS1MSfhtgCKDYDPxLScly+O+nGm2FgnY2LqZS4l0kIAXhXB3Yt2GfjbOYTAfmk+TwEZIohQALJKnUton5tlqn1Se+lp7qbLaUGtfPzze8Ub19tGpXKZS6y9nlqbGbh98Y3xbfHPp5mpE39w5VtqzMayPcTFoVDv0sXvoL+gHtqbH6B2Jl9K5x7feIOyem+jJpv4kRj/sTM+lI+Gb90Z7mm3paHhPLZIWq0k8E0n/jWDZSAQJR/gjoI1JP2AHbF+45/8C5T+YewAAeNpjYGRgYABiez8/kXh+m68M8hwMIHCmS78dRv//9/8f7z/WUCCXg4EJJAoAKZcMOQAAAHjaY2BkYGBh/H+NgYEv5f8/BgbefwxAERRQDwCFXgXWeNpVUbFqQkEQHG8vICJCmpRimf7VIoKdlUU6y/DeQ8gPWGhpJWJpLSKkSGUh/kCaR7DLB6RM8gvq7N2Kz2KYvb3d2Ztb94deFYB7BzxZCmTSRCp1vPkCqc+Ryz95jtynZM0pLywuwV3jLWvbZAWILs8D6ytiTr7Je8JhFGr07jnOC/GGrLVPxAGZX7KnxVyHseYnjMemR5Zh1HAjvrd205eVYYzcfdgMQ/DZjP1uHTXDWbV1/qLkM4msWoGTkvYqeALz2XWmP7Kf75YZ+Uvvzyd6u/sr92v9ifVvzbP64D4eXuJelCufBBk/BuYrj+R+mHvbA/+yCvMwj34UjVekWq8asmNuClwAcxtsinjaY2Bg0IHCAoYTjAyMeYxnGP8wlTAtY/rCrMG8hKWB1YT1G1sK2xZ2I/Y17Dc4ijgecMpwenFu4JLj8uPax63H3cUjxRPEK8W7ha+MX4h/B/8vgTSBU4ImgvMEvwgdE+4TYRPJE5UQnSF6T+yYuJr4IgkOiTKJHZJikgmS6yR/SclIRUhtkbaS3iGTJMslGyC7SPaLXI7cBnk++TD5SwpWCisUnigGKPYo/lNKU3qn7KR8T8VGZYkqj+oy1VdqVmoJatPUjqn9UPuhfkijTOMcdqgpp5mnuU/zmRabVovWH+0Q7TW6C0BQT0xPCQA8j084AAB42mNgZGBgqGeYzyDEAAJMDIxALMYAoiRBAgAglwFpAHjaXY7NCgFRGIafYSiSpZXF3AAZFko2TMoakSUZP+WvMcjO2gW4ChfCXXmNk9DpfD3f+d73PR+QIiCOZaeAuu6bLTLq3hwjS9twXNw3bJNnYjhBmrPhpLwXw3dyXA0/KHHD038+I0IWHESOXjasdDas2UW9p9pkSIEuDXFZTle1JUXIia20HXln7FkqK+Cobsw0ygh/dM6f0qWotNf5Vg1+/I5R9ZjL52gLX6rXHtVoVqZGRfNalPPZ7wltfyqhAHjabc7HToJhEIXhdwCp0ou99/7/FAE7Cth775KoQGKM0bhw5V69E3fWy1MD39KzeTJnkslgoJSfKP/nEcQgRoyYqMCMBSs27DioxIkLNx68+PATIEiIKqqpoZY66mmgkSaaaaGVNtrpoJMuuumhlz76GWCQITR0wkSIEmOYOAmSjDDKGONMMMkUKaaZIU2GLLPMMc8CiyyxzAqrrLHOBptssc0Ou+yxzwGHHHHMCaeckRMTz1LBk5jFIlaxiV0cUilOcYlbPOIVn/h5450vvvngk1cJSJAXCZnzVw83Bd1yf13UNC1dNqUpS3P4b6HUlWFlRBlVxpTDyrgyoUwqU2V1dVfX7ZfF/P3txXnurlCuwtmysZKZvxd+AW/dSrwAALgB/4WwAY0AS7AIUFixAQGOWbFGBitYIbAQWUuwFFJYIbCAWR2wBitcWACwAyBFsAMrRLAEIEWyAx0CK7ADK0QBsAUgRbADK0SwBiBFsgUeAiuxA0Z2K0RZsBQrAAFQZH8IAAA=) format("woff"),',
                'url("entypo-webfont-webfont.ttf") format("truetype");',
                'font-weight: normal;',
                'font-style: normal;',
                '',
                '}',
                '</style>'
            ]).join('\n');

            $(defaultCSS).appendTo('head');

            $.notification = function (settings) {
                var con, notification, hide, image, right, left, inner;

                settings = $.extend({
                    title: undefined,
                    content: undefined,
                    timeout: 0,
                    img: undefined,
                    border: true,
                    fill: false,
                    showTime: false,
                    click: undefined,
                    icon: undefined,
                    color: undefined,
                    error: false,
                    okay: false,
                    boardAware: false
                }, settings);

                if (isDefined(SB) && SB.disableBanners) {
                    return;
                }

                con = $("#_SB_notifications");
                if (!con.length) {
                    con = $("<div>", { id: "_SB_notifications" }).appendTo($("body"));
                }

                notification = $("<div>");
                notification.addClass("_SB_notifications _SB_animated fadeInLeftMiddle _SB_fast");

                if (settings.error === true) {
                    notification.addClass("_SB_error");
                }

                if (settings.okay === true) {
                    notification.addClass("green");
                }

                if ($("#_SB_notifications ._SB_notifications").length > 0) {
                    notification.addClass("_SB_more");
                } else {
                    con.addClass("_SB_animated flipInX").delay(1000).queue(function () {
                        con.removeClass("_SB_animated flipInX");
                        con.clearQueue();
                    });
                }

                hide = $("<div>", {
                    click: function () {
                        if ($(this).parent().is(':last-child')) {
                            $(this).parent().remove();
                            $('#_SB_notifications ._SB_notifications:last-child').removeClass("_SB_more");
                        } else {
                            $(this).parent().remove();
                        }
                    }
                });

                hide.addClass("hide");

                left = $("<div class='_SB_left'>");
                right = $("<div class='_SB_right'>");

                if (settings.title !== undefined) {
                    var htmlTitle = "<h2>" + settings.title + "</h2>";
                    notification.addClass("_SB_big");
                } else {
                    var htmlTitle = "";
                }

                if (settings.content !== undefined) {
                    var htmlContent = settings.content;
                } else {
                    var htmlContent = "";
                }

                inner = $("<div>", { html: htmlTitle + htmlContent });
                inner.addClass("_SB_inner");

                inner.appendTo(right);

                if (settings.img !== undefined) {
                    image = $("<div>", {
                        style: "background-image: url('" + settings.img + "')"
                    });

                    image.addClass("img");
                    image.appendTo(left);

                    if (settings.border === false) {
                        image.addClass("border");
                    }

                    if (settings.fill == true) {
                        image.addClass("fill");
                    }

                } else {
                    if (settings.icon !== undefined) {
                        var iconType = settings.icon;
                    } else {
                        var iconType = 'o';
                        if (settings.error === true) { var iconType = 'c'; }
                        if (settings.okay === true) { var iconType = 'W'; }
                        if (settings.boardAware === true) { var iconType = '';}
                    }
                    var icon = $('<div class="_SB_icon">').html(iconType);

                    if (settings.color !== undefined) {
                        icon.css("color", settings.color);
                    }

                    icon.appendTo(left);
                }

                left.appendTo(notification);
                right.appendTo(notification);

                hide.appendTo(notification);

                function timeSince(time) {
                    var time_formats = [
                        [2, "One second", "1 second from now"],
                        [60, "seconds", 1],
                        [120, "One minute", "1 minute from now"],
                        [3600, "minutes", 60],
                        [7200, "One hour", "1 hour from now"],
                        [86400, "hours", 3600],
                        [172800, "One day", "tomorrow"],
                        [604800, "days", 86400],
                        [1209600, "One week", "next week"],
                        [2419200, "weeks", 604800],
                        [4838400, "One month", "next month"],
                        [29030400, "months", 2419200],
                        [58060800, "One year", "next year"],
                        [2903040000, "years", 29030400],
                        [5806080000, "One century", "next century"],
                        [58060800000, "centuries", 2903040000]
                    ];

                    var seconds = (new Date() - time) / 1000;
                    var token = "ago", list_choice = 1;
                    if (seconds < 0) {
                        seconds = Math.abs(seconds);
                        token = "from now";
                        list_choice = 1;
                    }
                    var i = 0, format;

                    while (format = time_formats[i++]) if (seconds < format[0]) {
                        if (typeof format[2] == "string")
                            return format[list_choice];
                        else
                            return Math.floor(seconds / format[2]) + " " + format[1];
                    }
                    return time;
                }

                if (settings.showTime !== false) {
                    var timestamp = Number(new Date()),
                        timeHTML = $("<div>", { html: "<strong>" + timeSince(timestamp) + "</strong> ago" });
                    timeHTML.addClass("time").attr("title", timestamp);
                    timeHTML.appendTo(right);

                    setInterval(
                        function () {
                            $(".time").each(function () {
                                var timing = $(this).attr("title");
                                $(this).html("<strong>" + timeSince(timing) + "</strong> ago");
                            });
                        }, 4000);

                }

                notification.hover(
                    function () {
                        hide.show();
                    },
                    function () {
                        hide.hide();
                    }
                );

                notification.prependTo(con);
                notification.show();

                if (settings.timeout) {
                    setTimeout(function () {
                        var prev = notification.prev();
                        if (prev.hasClass("_SB_more")) {
                            if (prev.is(":first-child") || notification.is(":last-child")) {
                                prev.removeClass("_SB_more");
                            }
                        }
                        notification.remove();
                        if ($("#_SB_notifications ._SB_notifications").length == 0) {
                            con.remove();
                        }
                    }, settings.timeout);
                }

                if (settings.click !== undefined) {
                    notification.addClass("click");
                    notification.bind("click", function (event) {
                        var target = $(event.target);
                        if (!target.is(".hide")) {
                            settings.click.call(this);
                        }
                    });
                }
                return this;
            };
        })($);


        (function ($) {
            var debug = window._SB_debug;
            var isDefined = window._SB_isDefined;
            var SBInput = {};
            window.SBInput = SBInput;

            var defaultCSS = (['<style type="text/css" id="_smartboard-ink-panel-style">',
                '._smartboard-ink-panel {',
                '    background-color: rgba(0, 0, 0, 0.0);',
                '    z-index: 999988; ',
                '    cursor: none;',
                '}',
                '._smartboard-ink-panel canvas {',
                '    background-color: rgba(0,0,0,0.1);',
                '	 border-radius: 15px;',
                '    position: relative;',
                '    top: 1px #0A0 solid; ',
                '}',
                '</style>'
            ]).join('\n');

            $(defaultCSS).appendTo('head');

            var _currentIcon = null;
            var _currentPanel = null;
            var _currentElement = null;
            var _currentRawElement = null;
            var _currentSketchObject = null;
            var _currentElementBorderProperties = "";

            var _addIcon = function (el) {
                var elem = $(el);
                var offset = elem.offset();
                var height = Math.min(elem.outerHeight() + 2, 32);

                _currentElement = elem;
                _currentRawElement = el;
            };

            var _showPanel = function (el) {
                var elem = $(el),
                    offset = elem.offset(),
                    borders = 20,
                    width = 0,
                    height = 0,
                    top,
                    left;

                width = Math.max(width, elem.width() + borders);
                height = Math.max(height, elem.height() + borders);
                top = offset.top - (borders / 2.0);
                left = offset.left - (borders / 2.0);

                if (_currentPanel) {
                    _currentSketchObject.upInk(null, 0);
                    _currentPanel.remove();
                    _currentPanel = null;
                }
                _currentPanel = $('<div class="_smartboard-ink-panel"></div>')
                    .css("position", "absolute")
                    .css("width", width + "px")
                    .offset({ top: top, left: left })
                    .appendTo($(document.body));
                var _sketch = $('<canvas width="' + width + '" height="' + height + '"></canvas>');
                _sketch.sketch({ SBInputElement: el });
                _currentSketchObject = _sketch.sketch();
                _sketch.appendTo(_currentPanel);
                _sketch.trigger("touchstart");
            };

            SBInput.attach = function (el) {
                if (el && el == _currentRawElement) {
                    debug("already attached");
                    return;
                }
                _addIcon(el);
                debug("attached");
            };

            SBInput.detach = function (el) {
                _currentElement = null;
                _currentRawElement = null;
            };

            SBInput.removePanel = function () {
                if (_currentPanel) {
                    _currentPanel.fadeOut("fast", function () { $(this).remove(); });
                }
                _currentElement = null;
                _currentRawElement = null;
            };

            window.SBInput._alreadyLoaded = false;
            SBInput.attachToDocument = function () {
                if (window.SBInput._alreadyLoaded) { debug("input again?"); return; }
                window.SBInput._alreadyLoaded = true;
                $(document).on('touchstart', 'input[type=text], input[type=search], textarea', function (evt) {
                    var orgEvent = evt.originalEvent,
                        firstTouch = orgEvent.changedTouches[0];
                    if (isDefined(orgEvent) && isDefined(firstTouch.toolData)) {
                        if (firstTouch.toolData["tool"] == "pen") {
                            _currentRawElement = this;
                            _currentElement = $(this);
                            _showPanel(this);
                            firstTouch._finger.retarget();
                            window.SBInput._currentElementBorderProperties = _currentElementBorderProperties = $(this)[0].style.border;
                            $(this).css("border", "1px #F00 solid");
                        }

                        if (firstTouch.toolData["tool"] == "eraser") {
                            var el = $(this);
                            if (isDefined(el) && el && isDefined(el.val)) {
                                el.val("");
                            }
                        }

                        if (firstTouch.toolData["tool"] == "finger") {
                            this.focus();
                            this.select();
                        }
                    } else {
                    }
                });

                $(document).on("touchend", function () {
                    try {
                        this.form.submit();
                    } catch (e) {
                    }
                });
            };
        })($);

        (function ($) {
            var __slice = Array.prototype.slice;
            var debug = window._SB_debug;
            var isDefined = window._SB_isDefined;
            var Sketch;
            $.fn.sketch = function () {
                var args, key, sketch;
                key = arguments[0];
                args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
                if (this.length > 1) {
                    $.error('Sketch.js can only be called on one element at a time.');
                }
                sketch = this.data('sketch');
                if (typeof key === 'string' && sketch) {
                    if (sketch[key]) {
                        if (typeof sketch[key] === 'function') {
                            return sketch[key].apply(sketch, args);
                        } else if (args.length === 0) {
                            return sketch[key];
                        } else if (args.length === 1) {
                            return sketch[key] = args[0];
                        }
                    } else {
                        return $.error('Sketch.js did not recognize the given command.');
                    }
                } else if (sketch) {
                    return sketch;
                } else {
                    this.data('sketch', new Sketch(this.get(0), key));
                    return this;
                }
            };
            Sketch = (function ($) {
                function Sketch(el, opts) {
                    this.el = el;
                    this.canvas = $(el);
                    this.context = el.getContext('2d');
                    this.options = $.extend({
                        toolLinks: true,
                        defaultTool: 'marker',
                        defaultColor: '#00caee',
                        defaultSize: 2,
                        forSBInput: false,
                        SBInputElement: null
                    }, opts);
                    this.painting = false;
                    this.color = this.options.defaultColor;
                    this.size = this.options.defaultSize;
                    this.tool = this.options.defaultTool;
                    this.actions = [];
                    this.action = [];
                    this.canvas.bind('touchstart touchmove touchend touchcancel', this.onEvent);

                    this.invalidTimer = -1;
                    this.alreadyInvalid = false;
                    this.writingInProgress = false;
                    var writing = [[]];
                    this.forSBInput = this.options.forSBInput;
                    this.SBInputElement = this.options.SBInputElement;

                    Sketch.prototype.inking = function (x, y) {
                        if (!this.writingInProgress) {
                            this.writingInProgress = true;
                        }

                        writing[writing.length - 1].push([parseInt(x, 10), parseInt(y, 10)]);

                        clearTimeout(window.SBInput.currentWaitingTimer);

                    };


                    Sketch.prototype.upInk = function (evt, secondsToWait) {
                        clearTimeout(window.SBInput.currentWaitingTimer);

                        if (!this.writingInProgress) {
                            debug("got an up while not inking");
                            return;
                        }

                        writing.push([]);

                        var s = this;
                        if (secondsToWait === 0) {
                            s.finishedInking();
                            s.writingInProgress = false;
                            s.painting = false;
                        } else {
                            window.SBInput.currentWaitingTimer = setTimeout(function () { s.finishedInking(); }, secondsToWait * 1000);
                        }
                    };

                    function getInputSelection(el) {
                        if (!isDefined(el)) { return; }
                        if (el === null) { return; }

                        var start = 0, end = 0, normalizedValue, range,
                            textInputRange, len, endRange;

                        if (typeof el.selectionStart == "number" && typeof el.selectionEnd == "number") {
                            start = el.selectionStart;
                            end = el.selectionEnd;
                        } else {
                            range = document.selection.createRange();

                            if (range && range.parentElement() == el) {
                                len = el.value.length;
                                normalizedValue = el.value.replace(/\r\n/g, "\n");

                                textInputRange = el.createTextRange();
                                textInputRange.moveToBookmark(range.getBookmark());

                                endRange = el.createTextRange();
                                endRange.collapse(false);

                                if (textInputRange.compareEndPoints("StartToEnd", endRange) > -1) {
                                    start = end = len;
                                } else {
                                    start = -textInputRange.moveStart("character", -len);
                                    start += normalizedValue.slice(0, start).split("\n").length - 1;

                                    if (textInputRange.compareEndPoints("EndToEnd", endRange) > -1) {
                                        end = len;
                                    } else {
                                        end = -textInputRange.moveEnd("character", -len);
                                        end += normalizedValue.slice(0, end).split("\n").length - 1;
                                    }
                                }
                            }
                        }

                        return {
                            start: start,
                            end: end
                        };
                    }

                    function replaceSelectedText(el, text) {
                        if (!isDefined(el)) { return; }
                        if (el === null) { return; }

                        var sel = getInputSelection(el), val = el.value;
                        el.value = val.slice(0, sel.start) + text + val.slice(sel.end);
                        $(el).trigger('change');
                    }


                    Sketch.prototype.finishedInking = function (evt) {
                        clearTimeout(window.SBInput.currentWaitingTimer);
                        window.SBInput.currentWaitingTimer = this.invalidTimer;

                        var thisElem = this.SBInputElement;
                        SB.getTextForPoints(writing, function (text) {
                            debug("HWR set text: " + text);
                            if (isDefined(thisElem)) {
                                $(thisElem).css("border", window.SBInput._currentElementBorderProperties);
                                replaceSelectedText(thisElem, text + " ");
                            }
                        });

                        SBInput.removePanel();

                        writing = [[]];
                        this.writingInProgress = false;
                    };

                    if (this.options.toolLinks) {
                        $('body').delegate("a[href=\"#" + (this.canvas.attr('id')) + "\"]", 'click', function (e) {
                            var $canvas, $this, key, sketch, _i, _len, _ref;
                            $this = $(this);
                            $canvas = $($this.attr('href'));
                            sketch = $canvas.data('sketch');
                            _ref = ['color', 'size', 'tool'];
                            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                                key = _ref[_i];
                                if ($this.attr("data-" + key)) {
                                    sketch.set(key, $(this).attr("data-" + key));
                                }
                            }
                            if ($(this).attr('data-download')) {
                                sketch.download($(this).attr('data-download'));
                            }
                            return false;
                        });
                    }
                }
                Sketch.prototype.download = function (format) {
                    var mime;
                    format || (format = "png");
                    if (format === "jpg") {
                        format = "jpeg";
                    }
                    mime = "image/" + format;
                    return window.open(this.el.toDataURL(mime));
                };
                Sketch.prototype.set = function (key, value) {
                    this[key] = value;
                    return this.canvas.trigger("sketch.change" + key, value);
                };
                Sketch.prototype.startPainting = function () {
                    if (this.painting) return;
                    this.painting = true;
                    return this.action = {
                        tool: this.tool,
                        color: this.color,
                        size: parseFloat(this.size),
                        events: []
                    };
                };
                Sketch.prototype.stopPainting = function () {
                    if (this.action) {
                        this.actions.push(this.action);
                    }
                    if (this.painting) {
                        this.upInk(null, 3);
                    }
                    this.painting = false;
                    this.action = null;
                    return this.redraw();
                };
                Sketch.prototype.onEvent = function (e) {
                    if (e.originalEvent && isDefined(e.originalEvent.targetTouches) && e.type != "touchend") {
                        e.pageX = e.originalEvent.targetTouches[0].pageX;
                        e.pageY = e.originalEvent.targetTouches[0].pageY;
                        if ($.browser.msie) {
                            e.pageX = e.originalEvent.targetTouches[0].clientX + $(window).scrollLeft();
                            e.pageY = e.originalEvent.targetTouches[0].clientY + $(window).scrollTop();
                        }
                    }

                    if (isDefined(e.originalEvent) && isDefined(e.originalEvent.toolData)) {
                        if (e.originalEvent.toolData["tool"] === "finger") {
                            if (e.type == "touchstart") {
                                $(this).sketch().upInk(e, 0);
                                SBInput.removePanel();
                                this.painting = false;
                                e.preventDefault();
                                return false;
                            }
                            if (e.type == "touchmove") {
                                return false;
                            }
                        }
                    }

                    var currentTool = $.sketch.tools[$(this).data('sketch').tool];
                    if (isDefined(currentTool) && isDefined(currentTool.onEvent)) {
                        currentTool.onEvent.call($(this).data('sketch'), e);
                    }
                    e.preventDefault();
                    return false;
                };
                Sketch.prototype.redraw = function () {
                    var sketch;
                    this.el.width = this.canvas.width();
                    this.context = this.el.getContext('2d');
                    sketch = this;
                    $.each(this.actions, function () {
                        if (this.tool) {
                            return $.sketch.tools[this.tool].draw.call(sketch, this);
                        }
                    });
                    if (this.painting && this.action) {
                        return $.sketch.tools[this.action.tool].draw.call(sketch, this.action);
                    }
                };
                return Sketch;
            })($);
            $.sketch = {
                tools: {}
            };
            $.sketch.tools.marker = {
                onEvent: function (e) {
                    switch (e.type) {
                        case 'touchstart':
                            this.startPainting();
                            break;
                        case 'touchend':
                            this.stopPainting();
                    }
                    if (this.painting) {
                        var x = e.pageX - this.canvas.offset().left;
                        var y = e.pageY - this.canvas.offset().top;
                        this.action.events.push({
                            x: x,
                            y: y,
                            event: e.type
                        });
                        if (!isNaN(x) && !isNaN(y)) {
                            this.inking(x, y);
                        }
                        if (!isNaN(x) && !isNaN(y) && isDefined(this.SBInputElement) && this.SBInputElement !== null) {
                            var characterHeight = 0.75 * this.el.height;
                            if ((x + characterHeight) > this.el.width) {
                                this.el.width = (x + characterHeight);
                            }
                            if ((y + 20) > this.el.height) {
                                this.el.height = (y + 20);
                            }
                        }
                        return this.redraw();
                    }
                },
                draw: function (action) {
                    var event, previous, _i, _len, _ref;
                    this.context.lineJoin = "round";
                    this.context.lineCap = "round";
                    this.context.beginPath();
                    this.context.moveTo(action.events[0].x, action.events[0].y);
                    _ref = action.events;
                    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                        event = _ref[_i];
                        this.context.lineTo(event.x, event.y);
                        previous = event;
                    }
                    this.context.strokeStyle = action.color;
                    this.context.lineWidth = action.size;
                    return this.context.stroke();
                }
            };
            return $.sketch.tools.eraser = {
                onEvent: function (e) {
                    return $.sketch.tools.marker.onEvent.call(this, e);
                },
                draw: function (action) {
                    var oldcomposite;
                    oldcomposite = this.context.globalCompositeOperation;
                    this.context.globalCompositeOperation = "destination-out";
                    action.color = "rgba(0,0,0,1)";
                    $.sketch.tools.marker.draw.call(this, action);
                    return this.context.globalCompositeOperation = oldcomposite;
                }
            };
        })($);
    }

    return SB;
});
require(["smartboard-amd-1.1.0"], function (SB) {
    window.SB = SB;
}, null, true);

define("smartboard-1.1.0", function(){});
}()); if ( typeof define === 'function' && define.amd ) { define( 'smartboard-1.1.0', [], function () { return window.SB; } ); }