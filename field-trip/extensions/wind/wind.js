/**
 * Wind: Field Trip's transition between episodes, as a FrameTrail extension.
 *
 * A click on a link into another episode (a hotspot with the action "jumpToHypervideo") is held back: the link's picture fades, the wind blows in over a dark veil, and only then the hypervideo changes. The wind circles while the next episode loads and blows out once it is ready. An episode opened from the map gets the circling and the blowing out.
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
        MAX_LOOPS  = 6;      // circles to wait for a hypervideo that never arrives

    FrameTrail.registerExtension('wind', function(FrameTrail) {

        var root, veil,
            animations  = {},
            sounds      = {},
            ready       = false,    // library, animations and sounds are loaded
            booted      = false,    // the interface is up
            phase       = 'idle',   // idle | fade | in | loading | out
            jumpPending = false,    // a held-back link has not changed the hypervideo yet
            arrived     = false,    // the hypervideo the wind waits for is ready
            resume      = false,    // the arrived hypervideo was playing and is held
            loops       = 0,
            leftEditing = false,    // edit mode was left in this very frame
            currentID   = null,
            lastVolume  = 1,
            lastMuted   = false;

        /**
         * A timer on animation frames: switching the hypervideo clears every setTimeout on the page.
         */
        function after(ms, callback) {
            var start = performance.now();
            (function tick() {
                if (performance.now() - start >= ms) { callback(); } else { requestAnimationFrame(tick); }
            })();
        }

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
            root.appendChild(veil);

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
            animations.out.addEventListener('complete', finish);

            root.addEventListener('click', linkClicked, true);
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
            sounds[name].volume = lastVolume;
            sounds[name].muted = lastMuted;
            var playing = sounds[name].play();
            if (playing && playing['catch']) { playing['catch'](function() {}); }
        }

        function rememberVolume() {
            var video = root.querySelector('.hypervideo video.video');
            if (video) {
                lastVolume = video.volume;
                lastMuted = video.muted;
            }
        }

        function cover() {
            if (!veil.isConnected) { root.appendChild(veil); }
            veil.classList.add('active');
            root.classList.add('windBlowing');
        }

        function blowIn() {
            phase = 'in';
            cover();
            show('in');
        }

        function circle() {
            phase = 'loading';
            loops = 0;
            cover();
            show('loading');
        }

        function circled() {
            if (phase !== 'loading') { return; }
            loops++;
            if (arrived || loops >= MAX_LOOPS) {
                phase = 'out';
                show('out');
            }
        }

        function finish() {
            show(null);
            veil.classList.remove('active');
            root.classList.remove('windBlowing');
            phase = 'idle';
            arrived = false;
            if (resume) {
                resume = false;
                FrameTrail.module('HypervideoController').play();
            }
        }

        function overlayOf(element) {
            var overlays = FrameTrail.module('HypervideoModel').overlays || [];
            for (var i = 0; i < overlays.length; i++) {
                if (overlays[i].overlayElement && overlays[i].overlayElement.contains(element)) { return overlays[i]; }
            }
            return null;
        }

        /**
         * The link's picture is an image overlay of its own, at the hotspot's place and time.
         */
        function fadeLink(hotspot) {
            var overlays = FrameTrail.module('HypervideoModel').overlays || [],
                a = hotspot.data;
            overlays.forEach(function(overlay) {
                var b = overlay.data;
                if (b.start === a.start && b.end === a.end && JSON.stringify(b.position) === JSON.stringify(a.position) && overlay.overlayElement) {
                    overlay.overlayElement.classList.add('windLeaving');
                }
            });
        }

        function linkClicked(event) {

            if (!ready || phase !== 'idle' || FrameTrail.getState('editMode') || FrameTrail.getState('unsavedChanges')) { return; }

            var element = event.target.closest && event.target.closest('.hotspot-element');
            if (!element) { return; }

            var hotspot = overlayOf(element),
                attributes = (hotspot && hotspot.data.attributes) || {},
                target = attributes.actionTarget,
                time = parseFloat(attributes.actionTargetTime);

            if (attributes.action !== 'jumpToHypervideo' || !target || String(target) === String(FrameTrail.module('RouteNavigation').hypervideoID)) { return; }

            // FrameTrail's own click handler would change the hypervideo at once.
            event.preventDefault();
            event.stopPropagation();

            phase = 'fade';
            jumpPending = true;
            rememberVolume();
            fadeLink(hotspot);

            after(FADE, function() {
                blowIn();
                after(JUMP, function() {
                    jumpPending = false;
                    window.location.hash = 'hypervideo=' + target + ((!isNaN(time) && time > 0) ? '&t=' + time : '');
                });
            });

        }

        return {

            init: function() {

                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }

                root = document.querySelector(FrameTrail.getState('target'));

                Promise.all([loadLottie()].concat(STAGES.map(loadData))).then(function(results) {
                    build(results.slice(1));
                })['catch'](function(error) {
                    // Without the wind, links change the hypervideo at once.
                    console.warn('Wind extension: ' + error.message);
                });

            },

            onReady: function() {
                booted = true;
            },

            onHypervideoChange: function(hypervideoID) {

                currentID = hypervideoID;
                if (!ready || phase === 'idle' || jumpPending) { return; }

                arrived = true;

                // The episode starts when the wind is gone.
                var video = root.querySelector('.hypervideo video.video');
                if (video && !video.paused) {
                    resume = true;
                    FrameTrail.module('HypervideoController').pause();
                }

            },

            onChange: {

                // Opening an episode from the map: FrameTrail shows the video view first, then loads the hypervideo.
                viewMode: function(viewMode) {

                    if (!ready || !booted || phase !== 'idle' || viewMode !== 'video' || FrameTrail.getState('editMode') || leftEditing) { return; }

                    Promise.resolve().then(function() {
                        var hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
                        if (phase !== 'idle' || !hypervideoID || String(hypervideoID) === String(currentID)) { return; }
                        rememberVolume();
                        circle();
                    });

                },

                // A change of hypervideo in edit mode leaves edit mode for a moment and comes back to it: no wind for editors.
                editMode: function(editMode, oldEditMode) {
                    if (oldEditMode && !editMode) {
                        leftEditing = true;
                        requestAnimationFrame(function() { leftEditing = false; });
                    }
                }

            },

            onUnload: function() {
                if (!ready) { return; }
                ready = false;
                root.removeEventListener('click', linkClicked, true);
                STAGES.forEach(function(name) {
                    animations[name].destroy();
                    sounds[name].pause();
                });
                veil.remove();
                root.classList.remove('windBlowing');
            }

        };

    });

})();
