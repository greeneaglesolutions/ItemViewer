/*
 Developed by Green Eagle Solutions S.L. (Spain)
 Visit us http://www.greeneaglesolutions.com

 Release Date: 2015-05-06

 For further information about CompactSCADA
 visit http://www.compactscada.com
 */
;(function (global) {
    function postJSON(url, jsonObject, callback) {
        var xhr = new global.XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (this.readyState === 4) {
                callback(this.responseText);
            }
        };
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "text/plain");
        xhr.send(JSON.stringify(jsonObject));
    }
    
    function getJSON(getUrl, getInterval, callback) {
        var makeRequest,
            disposed = false;

        // If we're running in a browser environment, use the JSONP trick
        if (typeof global.document !== "undefined") {
            var scriptTag,
                responseCallbackName = 'compactScadaJsonp' + Math.random().toString().substr(2),
                responseCallback = function (response) {
                    if (scriptTag) {
                        scriptTag.parentNode.removeChild(scriptTag);
                    }
                    if (global[responseCallbackName]) {
                        delete global[responseCallbackName];
                    }
                    if (!disposed) {
                        callback(response);
                    }
                };
            
            makeRequest = function() {
                var url = getUrl(),
                    interval = getInterval();
                    
                url += "?callback_method=" + responseCallbackName;
                if (!disposed) {
                    scriptTag = global.document.createElement('script');
                    scriptTag.setAttribute("src", url + "&_=" + Math.random().toString().substr(2));
                    global.document.getElementsByTagName("head")[0].appendChild(scriptTag);
                    global[responseCallbackName] = responseCallback;

                    if (interval) {
                        global.setTimeout(makeRequest, interval);
                    }
                }
            };
        }
        else {
            // Node.js
            var http = require('http');
            makeRequest = function() {
                var url = getUrl(),
                    interval = getInterval();

                url = url.replace(/https?\:\/\//, "");
                var slashIndex = url.indexOf('/'),
                    splits = url.substr(0, slashIndex).split(':'),
                    hostname = splits[0],
                    port = splits.length > 1 ? splits[1] : 80;
    
                var options = {
                    hostname: hostname,
                    port: port,
                    path: url.substr(slashIndex),
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                };

                if (!disposed) {
                    var req = http.request(options, function (res) {
                        res.setEncoding('utf8');
                        res.on('data', function (response) {
                            callback(global.JSON.parse(response));
                        });
                    });
                    req.on('error', function (e) {
                        global.console.log('problem with request: ' + e.message);
                    });
                    req.end();

                    if (interval) {
                        global.setTimeout(makeRequest, interval);
                    }
                }
            };
        }
        makeRequest();
        return getInterval()
            ? { dispose: function () { disposed = true; } }
            : undefined;
    }

    /**
    * @class
    * @param {Object} string
    * @param {string} url - CompactScada URL (e.g. "http://localhost:8081/compactscada")
    * @param {string} interval - Number of milliseconds between calls to CompactScada
    * @param {string} queryPattern - Pattern to query items from CompactScada (RegExp syntax)
    * @param {string[]} itemNames - If queryPattern is empty, the API will query items matching the strings in this array
    * @param {boolean} [debug] - When it evaluates to true, the response from CompactScadaw will be printed to the console
    */
    var CompactScada = function (config) {
        this.url = config.url ? config.url : "http://localhost:8081/compactscada";
        this.url = this.url.lastIndexOf('/') === (this.url.length - 1)
            ? this.url.substr(0, this.url.length - 1)
            : this.url;

        this.interval = config.interval !== undefined ? config.interval : 5000;
        this.debug = config.debug;

        if (config.queryPattern) {
            this.queryPattern = config.queryPattern;
        }
        else if (config.itemNames instanceof Array) {
            this.itemNames = config.itemNames;
        }
        else if (typeof config.itemNames === "string") {
            this.itemNames = [config.itemNames];
        }
        else {
            throw "queryPattern or itemNames must be set in the config object";
        }
    };

    /**
     * Enum for OPC Masks
     * @readonly
     * @enum {number}
     */
    CompactScada.opcMask = {
        quality: 0xC0,
        status: 0xFC,
        limit: 0x03
    };

    /**
     * Enum for OPC Quality values
     * @readonly
     * @enum {string}
     */
    CompactScada.opcQuality = {
        0x00: 'BAD',
        0x40: 'UNCERTAIN',
        0xC0: 'GOOD',
    };

    /**
     * Enum for OPC Status for Bad Quality
     * @readonly
     * @enum {string}
     */
    CompactScada.opcStatusBadQuality = {
        0x04: 'CONFIG_ERROR',
        0x0C: 'DEVICE_FAILURE',
        0x10: 'SENSOR_FAILURE',
        0x14: 'LAST_KNOWN',
        0x18: 'COMM_FAILURE',
        0x1C: 'OUT_OF_SERVICE',
        0x20: 'WAITING_FOR_INITIAL_DATA',
    };

    /**
     * Enum for OPC Status for Uncertain Quality
     * @readonly
     * @enum {string}
     */
    CompactScada.opcStatusUncertainQuality = {
        0x50: 'SENSOR_CAL',
        0x54: 'EGU_EXCEEDED',
    };
        
    /**
     * Enum for OPC Status for Good Quality
     * @readonly
     * @enum {string}
     */
    CompactScada.opcStatusGoodQuality = {
        0xD8: 'LOCAL_OVERRIDE',
    };

    /**
     * Enum for OPC Limit values
     * @readonly
     * @enum {string}
     */
    CompactScada.opcLimit = {
        0x00: 'OK',
        0x01: 'LOW',
        0x02: 'HIGH',
        0x03: 'CONST'
    };    
    
    /**
    * @typedef {Object} Item
    * @param {string} itemName
    * @param {number} quality
    * @param {Date} timestamp
    * @param {string} value
    * @param {number} writePermission
    */

    /**
    * @callback CompactScada~eventCallback
    * @param {Item[]} items
    */
  
    /**
    * Starts querying CompactScada.
    * @function
    * @param {CompactScada~eventCallback} callback - The callback that handles the event
    */
    CompactScada.prototype.on = function (callback) {
        var cs = this;
        var getInterval = function () {
            return cs.interval;
        };
        var getUrl = function () {
            var url = cs.url;
            url += typeof cs.queryPattern !== "undefined"
                ? "/read/patterns/" + global.encodeURIComponent(cs.queryPattern)
                : "/read/items/" + cs.itemNames.map(function (n) {
                        return global.encodeURIComponent(n);
                    }).join(',');
            
            if (cs.debug) {
                global.console.log("GET: " + url);
            }
            return url;
        };

        if (cs._disposable) {
            throw "This instance of CompactScada is already active";
        }

        cs._disposable = getJSON(getUrl, getInterval, function (response) {
            if (cs.debug) {
                global.console.log("Received from CompactScada:");
                global.console.log(response);
            }
            if (callback) {
                var itemList = [];
                for (var i = 0; i < response.length ; i++) {
                    var quality = response[i].Quality & CompactScada.opcMask.quality;
                    itemList[i] = {
                        itemName: response[i].Name,
                        quality: CompactScada.opcQuality[quality],
                        timestamp: new Date(parseInt(response[i].Timestamp.replace('/Date(', '').replace(')/', ''))),
                        value: response[i].Value,
                        writePermission: response[i].WritePermission
                    };
                }
                callback(itemList);
            }
        });
    };
  
    /**
    * Call this method to stop querying items from CompactScada
    * @function
    */
    CompactScada.prototype.off = function() {
        if (this._disposable && typeof this._disposable.dispose === "function") {
            if (this.debug) {
                global.console.log("Requests to CompactScada stopped.");
            }
            this._disposable.dispose();
            delete this._disposable;
        }
    };

    /**
    * @typedef {Object} KeyValuePair
    * @param {string} key
    * @param {number|boolean|string} value
    */

    /**
    * @typedef {Object} ErrorInfo
    * @param {number} errorCode
    * @param {string} itemName
    */

    /**
    * @typedef {Object} SetResponse
    * @param {ErrorInfo[]} errorInfos
    * @param {number} writtenItems
    */

    /**
    * @callback CompactScada~setCallback
    * @param {SetResponse} items
    */

    /**
    * Writes to CompactScada
    * @function
    * @param {KeyValuePair[]} keyValuePairs - An array with the names of the items to write and their new values
    * @param {CompactScada~setCallback} callback - The callback that handles the response
    */
    CompactScada.prototype.set = function (keyValuePairs, callback) {
        // Check if user has sent a single object
        if (keyValuePairs instanceof Array === false) {
            keyValuePairs = [keyValuePairs];
        }

        var cs = this;
        var arr = [],
            url = this.url + "/write/items";

        if (this.debug) {
            global.console.log("POST: " + url);
        }
        
        var ts = "/Date(" + (new Date()).valueOf() + ")/";
        for (var i = 0; i < keyValuePairs.length; i++) {
            arr.push({
                Name: keyValuePairs[i].key,
                Value: keyValuePairs[i].value,
                Quality: 192,
                Timestamp: ts
            });
        }
        
        postJSON(url, arr, function (response) {
            if (cs.debug) {
                global.console.log("Received from CompactScada:");
                global.console.log(response);
            }

            if (callback) {
                // Turn properties into lowercase to make them more idiomatic in JS
                callback({
                    errorInfos: response.ErrorInfos.map(function (e) {
                        return { errorCode: e.ErrorCode, itemName: e.Name };
                    }),
                    writtenItems: response.WrittenItems
                });
            }
        });
    };

    // export as Common JS module...
    if (typeof module !== "undefined" && module.exports) {
        module.exports = CompactScada;
    }
    // ... or as AMD module
    else if (typeof global.define === "function" && global.define.amd) {
        global.define(function () {
            return CompactScada;
        } );
    }
    // ... or as browser global
    else {
        global.CompactScada = CompactScada;
    }
}(typeof window !== "undefined" ? window : global));
