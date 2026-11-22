/* Atlas: a small FrameTrail extension for the overview map.
   It marks the pins of the places a visitor has opened, and adds switches that dim the pins of other themes.
   Settings (config.json): themes { id: { label, colour } }, places { hypervideoId: themeId },
   labels { hypervideoId: 'left' | 'right' } for names that would collide below their pin. */
FrameTrail.registerExtension('atlas', function (FrameTrail) {

    var settings = { themes: {}, places: {}, labels: {} },
        seen = {},          // hypervideoId: true, for this visit
        shown = null,       // the one theme shown, or null for all
        bar = null, observer = null, scheduled = false;

    function noteVisit() {
        if (FrameTrail.getState('viewMode') !== 'video') { return; }
        var id = FrameTrail.module('RouteNavigation').hypervideoID;
        if (id && settings.places[id]) { seen[id] = true; }
    }

    function buildBar() {
        bar = document.createElement('div');
        bar.className = 'atlasBar';
        var html = '<span class="atlasTitle">Thirty years from above</span><span class="atlasThemes">';
        Object.keys(settings.themes).forEach(function (id) {
            var t = settings.themes[id];
            html += '<button type="button" class="atlasTheme" data-theme="' + id + '" style="--atlas-colour: ' + t.colour + '">'
                  + '<span class="atlasDot"></span>' + t.label + '</button>';
        });
        bar.innerHTML = html + '</span><span class="atlasCount"></span>';
        bar.addEventListener('click', function (evt) {
            var button = evt.target.closest('.atlasTheme');
            if (!button) { return; }
            shown = (shown === button.dataset.theme) ? null : button.dataset.theme;
            apply();
        });
    }

    function apply() {
        scheduled = false;
        var map = document.querySelector('.overviewMap');
        if (!map) { return; }
        if (!bar) { buildBar(); }
        if (bar.parentNode !== map) { map.appendChild(bar); }
        map.querySelectorAll('[data-hypervideoid]').forEach(function (pin) {
            var id = pin.getAttribute('data-hypervideoid'), theme = settings.places[id], t = settings.themes[theme];
            if (!t) { return; }
            if (pin.style.getPropertyValue('--atlas-colour') !== t.colour) { pin.style.setProperty('--atlas-colour', t.colour); }
            pin.classList.add('atlasPin');
            if (settings.labels[id]) { pin.classList.add('atlasLabel-' + settings.labels[id]); }
            pin.classList.toggle('atlasSeen', !!seen[id]);
            if (seen[id] && !pin.querySelector('.atlasCheck')) {
                var check = document.createElement('span');
                check.className = 'atlasCheck'; check.textContent = '✓';
                pin.appendChild(check);
            }
            pin.classList.toggle('atlasDimmed', !!shown && shown !== theme);
        });
        bar.querySelectorAll('.atlasTheme').forEach(function (button) {
            button.classList.toggle('active', shown === button.dataset.theme);
        });
        var total = Object.keys(settings.places).length, count = Object.keys(seen).length,
            text = count ? count + ' of ' + total + ' places seen' : total + ' places. Choose a pin.';
        var counter = bar.querySelector('.atlasCount');
        if (counter.textContent !== text) { counter.textContent = text; }
    }

    function schedule() {
        if (scheduled) { return; }
        scheduled = true;
        window.requestAnimationFrame(apply);
    }

    return {
        init: function (given) {
            settings.themes = (given && given.themes) || {};
            settings.places = (given && given.places) || {};
            settings.labels = (given && given.labels) || {};
        },
        onReady: function () {
            noteVisit();
            // the map draws its pins again when it changes, so the marks are put back whenever it does
            observer = new MutationObserver(schedule);
            observer.observe(document.body, { childList: true, subtree: true });
            schedule();
        },
        onHypervideoChange: function () { noteVisit(); schedule(); },
        onChange: function (state) { if (state === 'viewMode') { noteVisit(); schedule(); } },
        onUnload: function () {
            if (observer) { observer.disconnect(); }
            if (bar && bar.parentNode) { bar.parentNode.removeChild(bar); }
        }
    };
});
