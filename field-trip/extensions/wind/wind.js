/**
 * Wind: Field Trip's transition between episodes, as a FrameTrail extension.
 *
 * It is a transition of FrameTrail's (slots.transition), switched on by "hypervideoTransition": "wind" in config.json: FrameTrail holds a link into another episode back, covers the player and tells the wind when to blow. The link's picture fades, the wind blows in over a dark veil, circles while the next episode loads and blows out once it is ready. An episode opened from the map changes without it, as everywhere in FrameTrail.
 *
 * The animation (three Lottie files) and the three sounds are the original's, from https://github.com/OpenHypervideo/FieldTrip. See CREDITS.txt.
 */
(function() {

    var BASE       = ((document.currentScript && document.currentScript.src) || 'extensions/wind/wind.js').replace(/[^\/]*$/, ''),
        LOTTIE_SRC = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_light.min.js',
        LOTTIE_SRI = 'sha384-Vtbz3QbtSBqleuQry6kQy5smig1gPZCXUoTFN7RmN9QW47xpEDsV/J1w0Pw0rDJu',
        STAGES     = ['in', 'loading', 'out'],
        FADE       = 1000,   // the link's picture fades before the wind starts
        JUMP       = 3000,   // from the start of the wind to the change of hypervideo
        LIFT       = 1000;   // the veil lifts over the episode that has started (wind.css)

    FrameTrail.registerExtension('wind', function(FrameTrail) {

        var veil,
            animations = {},
            sounds     = {},
            ready      = false,    // library, animations and sounds are loaded
            phase      = 'idle',   // idle | fade | in | loading | out | lift
            arrived    = false,    // the episode the wind waits for is ready
            muted      = false,
            timer      = null,
            leaving    = [],       // the overlay elements of the link that was clicked
            whenGone   = null;     // resolves enter()

        function loadLottie() {
            if (window.lottie) { return Promise.resolve(); }
            return new Promise(function(resolve, reject) {
                var script = document.createElement('script');
                script.src = LOTTIE_SRC;
                script.integrity = LOTTIE_SRI;
                script.crossOrigin = 'anonymous';
                script.onload = resolve;
                script.onerror = function() { reject(new Error('could not load ' + LOTTIE_SRC)); };
                document.head.appendChild(script);
            });
        }

        function loadData(name) {
            return fetch(BASE + 'wind-' + name + '.json').then(function(response) {
                if (!response.ok) { throw new Error('could not load wind-' + name + '.json'); }
                return response.json();
            });
        }

        function build(data) {

            veil = document.createElement('div');
            veil.className = 'windVeil';

            STAGES.forEach(function(name, index) {

                var stage = document.createElement('div');
                stage.className = 'windStage';
                stage.setAttribute('data-stage', name);
                veil.appendChild(stage);

                animations[name] = window.lottie.loadAnimation({
                    container: stage,
                    renderer: 'svg',
                    loop: name === 'loading',
                    autoplay: false,
                    animationData: data[index],
                    rendererSettings: { preserveAspectRatio: 'xMidYMid slice' }
                });

                sounds[name] = new Audio(BASE + 'wind-' + name + '.mp3');
                sounds[name].preload = 'auto';
                sounds[name].loop = name === 'loading';

            });

            animations.loading.setSubframe(false);
            animations['in'].addEventListener('complete', circle);
            animations.loading.addEventListener('loopComplete', circled);
            animations.out.addEventListener('complete', lift);

            ready = true;

        }

        function show(name) {
            STAGES.forEach(function(other) {
                veil.querySelector('[data-stage="' + other + '"]').classList.toggle('active', other === name);
                if (other !== name) {
                    animations[other].stop();
                    sounds[other].pause();
                }
            });
            if (!name) { return; }
            animations[name].goToAndStop(0, true);
            animations[name].play();
            sounds[name].currentTime = 0;
            sounds[name].muted = muted;
            var playing = sounds[name].play();
            if (playing && playing['catch']) { playing['catch'](function() {}); }
        }

        function after(ms, callback) {
            window.clearTimeout(timer);
            timer = window.setTimeout(callback, ms);
        }

        function blowIn() {
            phase = 'in';
            veil.classList.add('active');
            show('in');
        }

        function circle() {
            if (phase !== 'in') { return; }
            phase = 'loading';
            show('loading');
        }

        // A circle is over: the wind blows out once the episode is there.
        function circled() {
            if (phase === 'loading' && arrived) {
                phase = 'out';
                show('out');
            }
        }

        // The wind is gone: the episode starts, and the veil lifts over it.
        function lift() {
            if (phase !== 'out') { return; }
            phase = 'lift';
            show(null);
            veil.classList.remove('active');
            if (whenGone) { whenGone.release(); }
            after(LIFT, gone);
        }

        function gone() {
            var resolve = whenGone && whenGone.resolve;
            phase = 'idle';
            arrived = false;
            whenGone = null;
            if (resolve) { resolve(); }
        }

        /**
         * The link's picture is an image overlay of its own, at the hotspot's place and time.
         */
        function fadeLink(element) {
            var overlays = FrameTrail.module('HypervideoModel').overlays || [],
                hotspot = null;
            if (!element) { return; }
            overlays.forEach(function(overlay) {
                if (overlay.overlayElement === element) { hotspot = overlay; }
            });
            if (!hotspot) { return; }
            overlays.forEach(function(overlay) {
                var a = hotspot.data, b = overlay.data;
                if (b.start === a.start && b.end === a.end && JSON.stringify(b.position) === JSON.stringify(a.position) && overlay.overlayElement) {
                    overlay.overlayElement.classList.add('windLeaving');
                    leaving.push(overlay.overlayElement);
                }
            });
        }

        return {

            init: function() {

                // With reduced motion FrameTrail shows a short fade instead and never asks for the wind.
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }

                Promise.all([loadLottie()].concat(STAGES.map(loadData))).then(function(results) {
                    build(results.slice(1));
                })['catch'](function(error) {
                    // Without the wind, links change the hypervideo at once.
                    console.warn('Wind extension: ' + error.message);
                });

            },

            slots: {

                transition: {

                    label: 'Wind',

                    available: function() { return ready; },

                    // A link into another episode was clicked. FrameTrail changes the hypervideo when the promise resolves.
                    leave: function(ctx) {

                        if (!veil.isConnected || veil.parentNode !== ctx.cover) { ctx.cover.appendChild(veil); }

                        phase = 'fade';
                        arrived = false;
                        muted = ctx.muted;
                        leaving = [];
                        fadeLink(ctx.source);

                        return new Promise(function(resolve) {
                            after(FADE, function() {
                                blowIn();
                                after(JUMP, resolve);
                            });
                        });

                    },

                    // The episode is ready, paused under the veil. FrameTrail takes its cover away when the promise resolves.
                    enter: function(ctx) {

                        muted = ctx.muted;
                        arrived = true;

                        return new Promise(function(resolve) {
                            whenGone = { resolve: resolve, release: ctx.release };
                            // The wind was not circling yet (the episode came quickly): it does one circle first.
                            if (phase !== 'in' && phase !== 'loading') {
                                phase = 'in';
                                circle();
                            }
                        });

                    },

                    // The jump was taken back (Back while the picture faded), or the episode did not come.
                    cancel: function() {
                        window.clearTimeout(timer);
                        show(null);
                        veil.classList.remove('active');
                        leaving.forEach(function(element) { element.classList.remove('windLeaving'); });
                        leaving = [];
                        gone();
                    }

                }

            },

            onUnload: function() {
                if (!ready) { return; }
                ready = false;
                window.clearTimeout(timer);
                STAGES.forEach(function(name) {
                    animations[name].destroy();
                    sounds[name].pause();
                });
                veil.remove();
            }

        };

    });

})();
