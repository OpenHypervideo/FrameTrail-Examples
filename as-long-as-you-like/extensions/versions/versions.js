/*
 * Versions — a FrameTrail extension that plays one film at several lengths.
 *
 * The film is divided into parts, and each part has a level: what the film cannot do without, what
 * explains it, and detail. A version plays the parts of its levels and jumps over the others. The viewer
 * chooses the version before the film starts, and can change it at any time. Just before a part is
 * skipped, a button offers to keep it this once. Rows of a Chapters view whose part is skipped are marked.
 *
 * Settings (config.json → extensions → settings):
 *
 *     "question": "How much time do you have?",
 *     "parts":    [ { "start": 0, "level": "core" }, { "start": 30.51, "level": "detail" }, … ],
 *     "versions": [ { "id": "short", "label": "The essentials", "levels": ["core"] }, … ]
 *
 * A part runs from its start to the next part's start. Jumps happen only where playback runs into a
 * skipped part: seeking into one by hand plays it.
 */
FrameTrail.registerExtension('versions', function (FrameTrail) {

    var settings = { question: 'How much time do you have?', parts: [], versions: [] },
        version  = null,       // the chosen version (an entry of settings.versions), null: everything
        kept     = {},         // parts kept this once, by start
        lastTime = 0,
        frame    = null,
        elements = null;

    function controller() { return FrameTrail.module('HypervideoController'); }
    function duration() { var m = FrameTrail.module('HypervideoModel'); return (m && m.duration) || 0; }

    // the parts a version jumps over, as [start, end] (neighbours joined)
    function skipsOf(v) {
        var out = [], total = duration();
        if (!v) return out;
        settings.parts.forEach(function (part, i) {
            if (v.levels.indexOf(part.level) !== -1) return;
            var end = (i + 1 < settings.parts.length) ? settings.parts[i + 1].start : total;
            if (out.length && Math.abs(out[out.length - 1][1] - part.start) < 0.01) { out[out.length - 1][1] = end; }
            else { out.push([part.start, end]); }
        });
        return out;
    }
    function lengthOf(v) { return duration() - skipsOf(v).reduce(function (sum, s) { return sum + (s[1] - s[0]); }, 0); }
    function clock(seconds) { seconds = Math.round(seconds); return Math.floor(seconds / 60) + ':' + ('0' + (seconds % 60)).slice(-2); }

    function build() {
        var target = document.querySelector(FrameTrail.getState('target') + ' .videoContainer');
        if (!target || (elements && elements.chooser.isConnected)) return;
        var chooser = document.createElement('div'), pill = document.createElement('button'), keep = document.createElement('button');
        chooser.className = 'versionsChooser'; pill.className = 'versionsPill'; keep.className = 'versionsKeep';
        pill.type = keep.type = 'button';
        pill.addEventListener('click', function () { controller().pause(); show(true); });
        keep.addEventListener('click', function () { if (keep._part !== undefined) { kept[keep._part] = true; keep.classList.remove('active'); } });
        target.append(chooser, pill, keep);
        elements = { chooser: chooser, pill: pill, keep: keep };
        show(true);
    }

    function show(open) {
        if (!elements) return;
        var chooser = elements.chooser;
        chooser.innerHTML = '';
        if (open) {
            var box = document.createElement('div'), heading = document.createElement('h2'), row = document.createElement('div');
            box.className = 'versionsBox'; row.className = 'versionsRow';
            heading.textContent = settings.question;
            settings.versions.forEach(function (v) {
                var button = document.createElement('button'), length = document.createElement('strong'), label = document.createElement('span');
                button.type = 'button'; if (version === v) button.className = 'chosen';
                length.textContent = clock(lengthOf(v)); label.textContent = v.label;
                button.append(length, label);
                button.addEventListener('click', function () { choose(v); });
                row.append(button);
            });
            box.append(heading, row); chooser.append(box);
        }
        chooser.classList.toggle('active', open);
        elements.pill.classList.toggle('active', !open && !!version);
        elements.pill.textContent = version ? version.label + ' · ' + clock(lengthOf(version)) + ' · change' : '';
    }

    function choose(v) {
        var c = controller(), atEnd = c.currentTime > duration() - 1;
        version = v; kept = {};
        show(false); markChapters();
        if (atEnd || inSkip(c.currentTime)) c.currentTime = 0;
        lastTime = c.currentTime;
        c.play();
    }
    function inSkip(t) { return skipsOf(version).some(function (s) { return t >= s[0] && t < s[1]; }); }
    function titleAt(t) {
        var title = '';
        (FrameTrail.module('HypervideoModel').chapters || []).forEach(function (ch) { var d = ch.data || ch; if (d.start <= t + 0.05) title = d.title; });
        return title;
    }
    function markChapters() {
        var skips = skipsOf(version);
        document.querySelectorAll(FrameTrail.getState('target') + ' .chapterElement[data-start]').forEach(function (row) {
            var start = parseFloat(row.getAttribute('data-start'));
            row.classList.toggle('versionsSkipped', skips.some(function (s) { return start >= s[0] - 0.05 && start < s[1] - 0.05 && !kept[s[0]]; }));
        });
    }

    var ticks = 0;
    function tick() {
        frame = requestAnimationFrame(tick);
        var c = controller(); if (!c || !elements) return;
        var t = c.currentTime, coming = null;
        if (version && !FrameTrail.getState('editMode')) {
            skipsOf(version).forEach(function (s) {
                if (kept[s[0]]) return;
                // playback ran into the part: the time before was before it, and close
                if (lastTime < s[0] && t >= s[0] && t - lastTime < 1) {
                    if (s[1] >= duration() - 0.5) { c.pause(); show(true); }
                    else { c.currentTime = s[1]; t = s[1]; }
                } else if (t < s[0] && s[0] - t < 5 && s[1] < duration() - 0.5) { coming = s; }
            });
        }
        if (coming) { elements.keep._part = coming[0]; elements.keep.textContent = 'Next up, skipped: “' + titleAt(coming[0]) + '” · Keep it'; }
        elements.keep.classList.toggle('active', !!coming);
        lastTime = t;
        if (++ticks % 30 === 0) markChapters();
    }

    return {
        init: function (given) { Object.keys(given || {}).forEach(function (key) { settings[key] = given[key]; }); },
        onReady: function () { build(); if (!frame) tick(); },
        onHypervideoChange: function () { version = null; kept = {}; build(); show(true); },
        onUnload: function () { if (frame) cancelAnimationFrame(frame); frame = null; }
    };
});
