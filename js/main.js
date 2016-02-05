require(['./js/compactscada.js', './js/ractive.min.js'], function (CompactScada, Ractive) {
    
    // Literals ------------------------
    var lit = {
        compactScadaUrl: "http://localhost:8081/compactscada",
        queryPattern: ".*",
        interval: "4000"
    };
    // ---------------------------------

    // Utility functions ---------------
    function download(urls, callback) {
        var data = [], xhrs = [];
        if (typeof urls === "string") {
            urls = [urls];
        }
        var onreadystatechange = function () {
            if (this.readyState == 4) {
                data[this.index] = this.responseText;
                var completed = true;
                for (var j = 0; j < urls.length; j++) {
                    if (typeof data[j] === "undefined") {
                        completed = false;
                        break;
                    }
                }
                if (completed) {
                    callback.apply(this, data);
                }
            }
        };
        for (var i = 0; i < urls.length; i++) {
            xhrs.push(new XMLHttpRequest());
            xhrs[i].index = i;
            xhrs[i].onreadystatechange = onreadystatechange; 
            xhrs[i].open('GET', urls[i], true);
            xhrs[i].send(null);
        }
    }

    function sort(array, column, up) {
        array = array.slice(); // clone, so we don't modify the underlying data
        return array.sort(function (a, b) {
            var isLess = a[column] < b[column];
            return up
                ? (isLess ? -1 : 1)
                : (isLess ? 1 : -1);
        });
    }
    // ----------------------------------

    var itemsDic = {},
        itemsArray = [],
        generator = {
            highLimit: 100,
            lowLimit: 0,
            increment: 1,
        },
        variation = {
            initialValue: 100,
            variation: 5,
        },
        compactScada = new CompactScada({
            url: lit.compactScadaUrl,
            interval: lit.interval,
            queryPattern: lit.queryPattern
        }),
        ractive = new Ractive({
            el: "#table-container",
            template: "#table-template",
            data: {
                items: itemsArray,
                url: lit.compactScadaUrl,
                interval: lit.interval,
                queryPattern: lit.queryPattern,
                generator: generator,
                variation: variation,
                sort: sort,
                sortUp: true,
                sortColumn: 'itemName'
            }
        });

    // Event subscription
    ractive.on('sort', function (ev, col, dir) {
        var currentCol = this.get('sortColumn'),
            currentDir = this.get('sortUp');
        var up = col == currentCol
            ? (!currentDir)
            : (dir === 'up' ? true : false);
        this.set({
            sortColumn: col,
            sortUp: up
        });
    });
    
    function runIfNew(oldValue, newValue, actionIfNew) {
        if (newValue !== null && newValue !== "" && newValue !== oldValue) {
            actionIfNew(newValue);
            return newValue;
        }
        return oldValue;
    }

    ractive.on('urlEdit', function (ev) {
        ev.node.value = runIfNew(compactScada.url, ev.node.value, function(v) {
            compactScada.url = v;
            itemsDic = {};
            itemsArray = [];
        });
    });

    ractive.on('intervalEdit', function (ev) {
        ev.node.value = runIfNew(compactScada.interval, ev.node.value, function(v) {
            compactScada.interval = v;
        });
    });

    ractive.on('queryEdit', function (ev) {
        ev.node.value = runIfNew(compactScada.queryPattern, ev.node.value, function(v) {
            compactScada.queryPattern = v;
            itemsDic = {};
            itemsArray = [];
        });
    });
    ractive.on('itemEdit', function (ev, name) {
        if (ev.original.which === 13) { // ENTER KEY CODE
            compactScada.set({
                key: name,
                value: ev.node.value
            });
            var item = itemsArray[itemsDic[name]];
            item.value = item.editValue;
//            ev.node.blur();
        }
        if (ev.original.which === 27) { // ESCAPE KEY CODE
            ev.node.blur();
        }
    });

    ractive.on('itemFocus', function (ev, name) {
        var item = itemsArray[itemsDic[name]];
        item.editValue = item.value;
    });

    ractive.on('itemBlur', function (ev, name) {
        var item = itemsArray[itemsDic[name]];
        delete item.editValue;
        ractive.update(ev.keypath);
    });

    ractive.on('itemGenerate', function (ev, name) {
        var item = itemsArray[itemsDic[name]];
        if (item.generatorId) {
            clearInterval(item.generatorId);
            delete item.generatorId;
        }
        else {
            item.generatorId = setInterval(function() {
                var newValue = Number(item.value) + Number(generator.increment);
                if (newValue > generator.highLimit) {
                    newValue = generator.lowLimit;
                }
                else if (newValue < generator.lowLimit) {
                    newValue = generator.highLimit;
                }
                compactScada.set({
                    key: name,
                    value: newValue
                });
            }, compactScada.interval);
        }
    });
    
    ractive.on('variationPercentage', function (ev, name) {
        var item = itemsArray[itemsDic[name]];
        if (item.varPercentage) {
            clearInterval(item.varPercentage);
            delete item.varPercentage;
        }
        else {
            item.varPercentage = setInterval(function() {
                var randomv = Math.random();
                var newValue = variation.initialValue * (1 + (variation.variation / 100) * randomv);
                
                compactScada.set({
                    key: name,
                    value: newValue
                });
            }, compactScada.interval);
        }
    });

    compactScada.on(function (items) {
        var getValue = function() {
            return typeof this.editValue !== "undefined"
                ? this.editValue : this.value;
        };
        var setValue = function(val) {
            this.editValue = val;
        };
        
        itemsArray.forEach(function(x) {
            x.deleted = true;
        });
        
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (typeof itemsDic[item.itemName] === "undefined") {
                Object.defineProperty(item, "bindValue", {
                    get: getValue, set: setValue
                });
                itemsDic[item.itemName] = itemsArray.length;
                itemsArray.push(item);
            }
            else {
                var j = itemsDic[item.itemName];
                itemsArray[j].value = item.value;
                itemsArray[j].timestamp = item.timestamp;
                itemsArray[j].quality = item.quality;
                delete itemsArray[j].deleted;
            }
        }

        for (var i = itemsArray.length - 1; i >= 0; i--) {
            if (itemsArray[i].deleted) {
                delete itemsDic[itemsArray[i].itemName];
                itemsArray.splice(i, 1);
            }
        }
        
        ractive.set("items", itemsArray);
    });
});
