/* Lens: a small FrameTrail extension. Video overlays that cover the whole picture and play in sync with the film
   become layers that are only visible inside a round lens, which follows the pointer or a finger.
   Settings (config.json): layers { id: { label, match } } (match: a part of the layer's video file name), radius (percent of the picture's width).
   Event code can call window.frametrailLens.show(layerId, xPercent, yPercent) and .hide(). */
FrameTrail.registerExtension('lens', function (FrameTrail) {

    var settings = { layers: {}, radius: 13 },
        layer = null,                 // the layer in the lens, or null
        position = { x: 50, y: 50 },  // centre, in percent of the picture
        stage = null, ring = null, bar = null, observer = null, scheduled = false;

    function findStage() { return document.querySelector('.overlayContainer') || document.querySelector('.hypervideo'); }

    function tagLayers() {
        document.querySelectorAll('.overlayElement').forEach(function (element) {
            if (element.dataset.lensLayer) { return; }
            var video = element.querySelector('video'), src = video ? (video.currentSrc || video.src || '') : '';
            Object.keys(settings.layers).forEach(function (id) {
                if (src.indexOf(settings.layers[id].match) !== -1) { element.dataset.lensLayer = id; element.classList.add('lensLayer'); }
            });
        });
    }

    function draw() {
        scheduled = false;
        var now = findStage();
        if (!now) { return; }
        if (now !== stage) { stage = now; listen(); }
        tagLayers();
        var width = stage.clientWidth, r = settings.radius / 100 * width;
        stage.querySelectorAll('.lensLayer').forEach(function (element) {
            var on = element.dataset.lensLayer === layer,
                clip = 'circle(' + (on ? r : 0) + 'px at ' + position.x + '% ' + position.y + '%)';
            if (element.style.clipPath !== clip) { element.style.clipPath = clip; }
        });
        if (!ring) { ring = document.createElement('div'); ring.className = 'lensRing'; }
        if (ring.parentNode !== stage) { stage.appendChild(ring); }
        ring.style.display = layer ? '' : 'none';
        ring.style.width = ring.style.height = (2 * r) + 'px';
        ring.style.left = position.x + '%'; ring.style.top = position.y + '%';
        ring.dataset.label = layer ? settings.layers[layer].label : '';
        if (!bar) { buildBar(); }
        var host = document.querySelector('.videoContainer') || stage.parentNode;
        if (bar.parentNode !== host) { host.appendChild(bar); }
        bar.querySelectorAll('button').forEach(function (button) { button.classList.toggle('active', (button.dataset.layer || null) === layer); });
    }
    function schedule() { if (!scheduled) { scheduled = true; window.requestAnimationFrame(draw); } }

    function buildBar() {
        bar = document.createElement('div'); bar.className = 'lensBar';
        var html = '<span class="lensBarLabel">Lens</span>';
        Object.keys(settings.layers).forEach(function (id) { html += '<button type="button" data-layer="' + id + '">' + settings.layers[id].label + '</button>'; });
        bar.innerHTML = html + '<button type="button" data-layer="">Off</button>';
        bar.addEventListener('click', function (evt) {
            var button = evt.target.closest('button');
            if (button) { layer = button.dataset.layer || null; schedule(); }
        });
    }

    function move(evt) {
        if (!stage || !layer || document.querySelector('.editActive')) { return; }
        var rect = stage.getBoundingClientRect();
        if (!rect.width) { return; }
        position.x = Math.max(0, Math.min(100, (evt.clientX - rect.left) / rect.width * 100));
        position.y = Math.max(0, Math.min(100, (evt.clientY - rect.top) / rect.height * 100));
        schedule();
    }
    function listen() {
        // on the picture's parent, so overlays above the picture do not swallow the movement
        var target = stage.parentNode;
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerdown', move);
    }

    var api = {
        show: function (id, x, y) {
            if (!settings.layers[id]) { return; }
            layer = id;
            if (typeof x === 'number') { position.x = x; }
            if (typeof y === 'number') { position.y = y; }
            schedule();
        },
        hide: function () { layer = null; schedule(); }
    };

    return {
        init: function (given) {
            settings.layers = (given && given.layers) || {};
            if (given && given.radius) { settings.radius = given.radius; }
            if (given && given.start && settings.layers[given.start]) { layer = given.start; }
            window.frametrailLens = api;
        },
        onReady: function () {
            observer = new MutationObserver(schedule);
            observer.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('resize', schedule);
            schedule();
        },
        onHypervideoChange: schedule,
        onUnload: function () {
            if (observer) { observer.disconnect(); }
            window.removeEventListener('resize', schedule);
            [ring, bar].forEach(function (e) { if (e && e.parentNode) { e.parentNode.removeChild(e); } });
            if (window.frametrailLens === api) { delete window.frametrailLens; }
        }
    };
});
