window.COUNTER_PATH = window.COUNTER_PATH || 'Znap-OsuBackground';
// Served by tosu over http -> use its host; hosted elsewhere (e.g. GitHub Pages) -> local tosu, overridable with ?host=
const params = new URLSearchParams(window.location.search);
const WS_HOST = params.get('host')
    || (window.location.protocol === 'http:' && window.location.host)
    || '127.0.0.1:24050';

import WebSocketManager from './socket.js';
const socket = new WebSocketManager(WS_HOST);

const cache = {
    BackgroundDim: params.has('dim') ? Number(params.get('dim')) : 65,
    BackgroundAnimationDuration: 500,
    BackgroundSwitchTime: 20,
    BackgroundBlurAnimation: '0-30/80-0/100-0',
    BackgroundBrightnessAnimation: '0-60/20-20/100-35',
    GameWidth: params.has('w') ? Number(params.get('w')) : 1280,
    GameHeight: params.has('h') ? Number(params.get('h')) : 720,
    GameOffsetX: params.has('ox') ? Number(params.get('ox')) : 0,
    GameOffsetY: params.has('oy') ? Number(params.get('oy')) : 0,
    GameBorderShadow: params.has('shadow') ? Number(params.get('shadow')) : 0,
    EnableBeatmapVideo: true,
    VideoOnlyInMenu: false
};

updateCutout(cache.GameWidth, cache.GameHeight, cache.GameOffsetX, cache.GameOffsetY, cache.GameBorderShadow);
applyCurrentFilter();

////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////// SETTINGS /////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

socket.commands((data) => {
  try {
    const { command, message } = data;
    if (!message || typeof message !== 'object') return;

    if (command === 'getSettings') {
      console.log(command, message);
    }

    let animChanged = false;

    // Update Background Dim setting
    if (message.BackgroundDim !== undefined && cache.BackgroundDim !== Number(message.BackgroundDim)) {
        cache.BackgroundDim = Number(message.BackgroundDim);
        applyCurrentFilter();
        animChanged = true;
    }

    // Update animation duration
    if (message.BackgroundAnimationDuration !== undefined && cache.BackgroundAnimationDuration !== Number(message.BackgroundAnimationDuration)) {
        cache.BackgroundAnimationDuration = Number(message.BackgroundAnimationDuration);
    }

    // Update switch time
    if (message.BackgroundSwitchTime !== undefined && cache.BackgroundSwitchTime !== Number(message.BackgroundSwitchTime)) {
        cache.BackgroundSwitchTime = Number(message.BackgroundSwitchTime);
    }

    // Update Blur animation
    if (message.BackgroundBlurAnimation !== undefined && cache.BackgroundBlurAnimation !== message.BackgroundBlurAnimation) {
        cache.BackgroundBlurAnimation = message.BackgroundBlurAnimation;
        setCustomAnimation('blur', cache.BackgroundBlurAnimation);
        applyCurrentFilter();
        animChanged = true;
    }

    // Update Brightness animation
    if (message.BackgroundBrightnessAnimation !== undefined && cache.BackgroundBrightnessAnimation !== message.BackgroundBrightnessAnimation) {
        cache.BackgroundBrightnessAnimation = message.BackgroundBrightnessAnimation;
        setCustomAnimation('brightness', cache.BackgroundBrightnessAnimation);
        applyCurrentFilter();
        animChanged = true;
    }

    // Update Game Cutout settings
    let cutoutChanged = false;
    if (message.GameWidth !== undefined && cache.GameWidth !== Number(message.GameWidth)) {
        cache.GameWidth = Number(message.GameWidth);
        cutoutChanged = true;
    }
    if (message.GameHeight !== undefined && cache.GameHeight !== Number(message.GameHeight)) {
        cache.GameHeight = Number(message.GameHeight);
        cutoutChanged = true;
    }
    if (message.GameOffsetX !== undefined && cache.GameOffsetX !== Number(message.GameOffsetX)) {
        cache.GameOffsetX = Number(message.GameOffsetX);
        cutoutChanged = true;
    }
    if (message.GameOffsetY !== undefined && cache.GameOffsetY !== Number(message.GameOffsetY)) {
        cache.GameOffsetY = Number(message.GameOffsetY);
        cutoutChanged = true;
    }
    if (message.GameBorderShadow !== undefined && cache.GameBorderShadow !== Number(message.GameBorderShadow)) {
        cache.GameBorderShadow = Number(message.GameBorderShadow);
        cutoutChanged = true;
    }
    if (cutoutChanged) {
        updateCutout(cache.GameWidth, cache.GameHeight, cache.GameOffsetX, cache.GameOffsetY, cache.GameBorderShadow);
    }

    // Update Beatmap Video setting
    if (message.EnableBeatmapVideo !== undefined) {
        const isVideoEnabled = message.EnableBeatmapVideo === true || message.EnableBeatmapVideo === 'true' || message.EnableBeatmapVideo === 1 || message.EnableBeatmapVideo === '1';
        if (cache.EnableBeatmapVideo !== isVideoEnabled) {
            cache.EnableBeatmapVideo = isVideoEnabled;
            if (!isVideoFeatureEnabled()) {
                stopVideo();
            } else if (cache.beatmapFolder && cache.beatmapFile && cache.beatmapChecksum) {
                updateVideo(cache.beatmapFolder, cache.beatmapFile, cache.beatmapChecksum);
            } else {
                handleStateChange(cache.stateName);
            }
        }
    }

    // Update Video Only In Menu setting
    if (message.VideoOnlyInMenu !== undefined) {
        const isOnlyMenu = message.VideoOnlyInMenu === true || message.VideoOnlyInMenu === 'true' || message.VideoOnlyInMenu === 1 || message.VideoOnlyInMenu === '1';
        if (cache.VideoOnlyInMenu !== isOnlyMenu) {
            cache.VideoOnlyInMenu = isOnlyMenu;
            if (isVideoFeatureEnabled() && !activeVideoUrl && cache.beatmapFolder && cache.beatmapFile && cache.beatmapChecksum) {
                updateVideo(cache.beatmapFolder, cache.beatmapFile, cache.beatmapChecksum);
            } else {
                handleStateChange(cache.stateName);
            }
        }
    }

    // Print all custom animations if changed
    if (animChanged) {
        printAllCustomAnimations();
    }

  } catch (error) {
    console.log(error);
  }
});

// Request settings from server
const counterPath = window.COUNTER_PATH || 'Znap-OsuBackground';
socket.sendCommand('getSettings', counterPath);
if (counterPath !== encodeURI(counterPath)) {
    socket.sendCommand('getSettings', encodeURI(counterPath));
}

////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////// MAIN FUNCTION //////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

socket.api_v2((data) => {
    let shouldUpdateBg = false;

    // Track beatmap folder and .osu file
    if (data?.folders?.beatmap !== undefined) {
        cache.beatmapFolder = data.folders.beatmap;
    }
    if (data?.files?.beatmap !== undefined) {
        cache.beatmapFile = data.files.beatmap;
    }

    // Update beatmap background
    if (data?.beatmap?.checksum !== undefined && cache.beatmapChecksum !== data.beatmap.checksum) {
        cache.beatmapChecksum = data.beatmap.checksum;
        shouldUpdateBg = true;
    }

    if (shouldUpdateBg) {
        updateBackground(cache.beatmapChecksum);
        if (isVideoFeatureEnabled()) {
            updateVideo(cache.beatmapFolder, cache.beatmapFile, cache.beatmapChecksum);
        } else {
            stopVideo();
        }
    } else if (isVideoFeatureEnabled() && cache.beatmapChecksum && cache.beatmapChecksum !== lastAttemptedChecksum && cache.beatmapFolder && cache.beatmapFile) {
        // Trigger video if folder/file arrived right after checksum
        updateVideo(cache.beatmapFolder, cache.beatmapFile, cache.beatmapChecksum);
    }

    // Sync live video time with song time
    if (data?.beatmap?.time?.live !== undefined) {
        cache.songTimeLive = data.beatmap.time.live;
        syncVideoTime(cache.songTimeLive);
    }

    // Game state tracking
    if (data?.state?.name !== undefined) {
        cache.stateName = data.state.name;
        handleStateChange(cache.stateName);
    }
},
[
    {
        field: 'beatmap',
        keys: [
            'checksum',
            {
                field: 'time',
                keys: ['live', 'mp3Length']
            }
        ]
    },
    {
        field: 'directPath',
        keys: ['skinFolder', 'beatmapBackground']
    },
    {
        field: 'folders',
        keys: ['beatmap', 'songs']
    },
    {
        field: 'files',
        keys: ['beatmap', 'background']
    },
    {
        field: 'state',
        keys: ['name']
    }
]);

////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////// FUNCTIONS ////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

// Update Game Cutout dimensions and styling
function updateCutout(w, h, offsetX = 0, offsetY = 0, shadow = 0) {
    const width = Number(w);
    const height = Number(h);
    const offX = Number(offsetX) || 0;
    const offY = Number(offsetY) || 0;
    const shadowPx = Number(shadow) || 0;
    const bgElement = document.getElementById('background');
    const shadowElement = document.getElementById('game-shadow');

    if (width > 0 && height > 0) {
        const wVw = (width / 1920) * 100;
        const hVh = (height / 1080) * 100;
        const offXVw = (offX / 1920) * 100;
        const offYVh = (offY / 1080) * 100;
        document.documentElement.style.setProperty('--game-w', `${wVw}vw`);
        document.documentElement.style.setProperty('--game-h', `${hVh}vh`);
        document.documentElement.style.setProperty('--game-half-w', `${wVw / 2}vw`);
        document.documentElement.style.setProperty('--game-half-h', `${hVh / 2}vh`);
        document.documentElement.style.setProperty('--game-offset-x', `${offXVw}vw`);
        document.documentElement.style.setProperty('--game-offset-y', `${offYVh}vh`);
        document.documentElement.style.setProperty('--game-shadow', `${shadowPx}px`);
        if (bgElement) bgElement.classList.add('cutout');
        if (shadowElement) shadowElement.style.display = shadowPx > 0 ? 'block' : 'none';
    } else {
        if (bgElement) bgElement.classList.remove('cutout');
        document.documentElement.style.setProperty('--game-shadow', '0px');
        if (shadowElement) shadowElement.style.display = 'none';
    }
}

// Load URL (returns a Promise)
function urlFallback(urls) {
    return new Promise((resolve) => {
        let currentIndex = 0;

        function tryLoadImage() {
            if (currentIndex >= urls.length) {
                resolve('');
                return;
            }
            const currentUrl = urls[currentIndex];
            if (!currentUrl) {
                currentIndex++;
                tryLoadImage();
                return;
            }
            const testImg = new Image();
            testImg.onload = () => resolve(currentUrl);
            testImg.onerror = () => {
                currentIndex++;
                tryLoadImage();
            };
            testImg.src = currentUrl;
        }
        tryLoadImage();
    });
}

// Dynamically generate blur/brightness animation and insert style
function setCustomAnimation(type, animStr) {
    if (!animStr) return;
    const animName = `bg-${type}-custom`;
    const styleId = `bg-${type}-style`;
    const keyframesArr = animStr.split('/').map((seg) => {
        const [percent, value] = seg.split('-').map(Number);
        let percentStr = percent + '%';
        if (type === 'blur') {
            return `${percentStr.padEnd(6, ' ')}{ filter: blur(${value}px) brightness(var(--bg-brightness, 35%)); }`;
        } else if (type === 'brightness') {
            return `${percentStr.padEnd(6, ' ')}{ filter: blur(var(--bg-blur, 0px)) brightness(${value}%); }`;
        }
        return '';
    });
    const keyframes = keyframesArr.join('\n');

    const oldStyle = document.getElementById(styleId);
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `@keyframes ${animName} {\n${keyframes}\n}`;
    document.head.appendChild(style);

    if (!window._bgAnimPrintCache) window._bgAnimPrintCache = {};
    window._bgAnimPrintCache[type] = `@keyframes ${animName} {\n${keyframes}\n}`;
}

// Unified print animation format
function printAllCustomAnimations() {
    if (!window._bgAnimPrintCache) return;
    const blurAnim = window._bgAnimPrintCache['blur'] || '';
    const brightAnim = window._bgAnimPrintCache['brightness'] || '';
    if (blurAnim || brightAnim) {
        console.log(
            'Custom background animation format:\n' +
            (blurAnim ? '[blur]\n' + blurAnim + '\n' : '') +
            (brightAnim ? '[brightness]\n' + brightAnim + '\n' : '')
        );
    }
}

// Get the last value of the animation string
function getLastAnimValue(animStr) {
    if (!animStr) return 0;
    const lastSeg = animStr.split('/').pop();
    const [, value] = lastSeg.split('-').map(Number);
    return isNaN(value) ? 0 : value;
}

// Calculate effective resting brightness percentage (0 - 100)
function getEffectiveRestingBrightness() {
    if (cache.BackgroundDim !== undefined && cache.BackgroundDim !== null && cache.BackgroundDim !== '') {
        const dim = Number(cache.BackgroundDim);
        if (!isNaN(dim)) {
            return Math.max(0, Math.min(100, 100 - dim));
        }
    }
    return getLastAnimValue(cache.BackgroundBrightnessAnimation || '100-35');
}

// Apply current blur and brightness filter to #bg and #bg-video immediately
function applyCurrentFilter() {
    const blurAnim = cache.BackgroundBlurAnimation || '0-30/80-0/100-0';
    const blurValue = getLastAnimValue(blurAnim);
    const brightValue = getEffectiveRestingBrightness();
    const filterStr = `blur(${blurValue}px) brightness(${brightValue}%)`;

    document.documentElement.style.setProperty('--bg-blur', `${blurValue}px`);
    document.documentElement.style.setProperty('--bg-brightness', `${brightValue}%`);

    const bg = document.getElementById('bg');
    if (bg) {
        bg.style.filter = filterStr;
    }
    const bgVideo = document.getElementById('bg-video');
    if (bgVideo) {
        bgVideo.style.filter = filterStr;
    }
}

// Merge animation strings into keyframes
function combineKeyframes(blurAnim, brightAnim) {
    const blurArr = blurAnim.split('/').map(seg => {
        const [percent, value] = seg.split('-').map(Number);
        return { percent, blur: value };
    });
    const brightArr = brightAnim.split('/').map(seg => {
        const [percent, value] = seg.split('-').map(Number);
        return { percent, bright: value };
    });
    const percents = Array.from(new Set([
        ...blurArr.map(b => b.percent),
        ...brightArr.map(b => b.percent)
    ])).sort((a, b) => a - b);

    const restingTarget = getEffectiveRestingBrightness();
    const lastAnimBright = brightArr.length > 0 ? brightArr[brightArr.length - 1].bright : restingTarget;

    function getValue(arr, percent, key) {
        for (let i = 0; i < arr.length - 1; i++) {
            if (percent >= arr[i].percent && percent <= arr[i + 1].percent) {
                const p1 = arr[i].percent, v1 = arr[i][key];
                const p2 = arr[i + 1].percent, v2 = arr[i + 1][key];
                if (p2 === p1) return v1;
                return v1 + (v2 - v1) * (percent - p1) / (p2 - p1);
            }
        }
        if (percent <= arr[0].percent) return arr[0][key];
        return arr[arr.length - 1][key];
    }

    return percents.map(percent => {
        const blur = getValue(blurArr, percent, 'blur');
        let bright = getValue(brightArr, percent, 'bright');
        if (restingTarget === 0) {
            bright = 0;
        } else if (lastAnimBright > 0) {
            bright = Math.round(bright * (restingTarget / lastAnimBright));
        }
        return `${percent}% { filter: blur(${blur}px) brightness(${bright}%); }`;
    }).join('\n');
}

// Dynamically generate combined animation
function setCombinedAnimation(blurAnim, brightAnim, duration) {
    const animName = 'bg-combined-custom';
    const styleId = 'bg-combined-style';
    const keyframes = combineKeyframes(blurAnim, brightAnim);

    const oldStyle = document.getElementById(styleId);
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `@keyframes ${animName} {\n${keyframes}\n}`;
    document.head.appendChild(style);

    const bg = document.getElementById('bg');
    if (bg) bg.style.animation = `${animName} ${duration}ms linear 1`;
    const bgVideo = document.getElementById('bg-video');
    if (bgVideo) bgVideo.style.animation = `${animName} ${duration}ms linear 1`;
}

let fadeSwitchTimeout = null;
let fadeEndTimeout = null;

// Fade in image and apply custom animation
function imageFade(imgElement, url) {
    if (fadeSwitchTimeout) clearTimeout(fadeSwitchTimeout);
    if (fadeEndTimeout) clearTimeout(fadeEndTimeout);

    if (!url) {
        imgElement.style.animation = '';
        imgElement.style.opacity = '0';
        imgElement.removeAttribute('src');
        return;
    }

    const blurAnim = cache.BackgroundBlurAnimation || '0-20/100-0';
    const brightAnim = cache.BackgroundBrightnessAnimation || '0-10/100-100';
    const duration = Number(cache.BackgroundAnimationDuration) || 600;

    let switchPercent = Number(cache.BackgroundSwitchTime);
    if (isNaN(switchPercent)) switchPercent = 50;
    switchPercent = Math.max(0, Math.min(100, switchPercent));
    const switchTime = duration * (switchPercent / 100);

    setCombinedAnimation(blurAnim, brightAnim, duration);

    fadeSwitchTimeout = setTimeout(() => {
        imgElement.src = url;
        imgElement.style.opacity = '1';
    }, switchTime);

    fadeEndTimeout = setTimeout(() => {
        applyCurrentFilter();
        imgElement.style.animation = '';
        const bgVideo = document.getElementById('bg-video');
        if (bgVideo) {
            bgVideo.style.animation = '';
        }
    }, duration);
}

let currentUpdateId = 0;

// Update background
function updateBackground(beatmapChecksum) {
    const background = document.querySelector('#bg');
    const updateId = ++currentUpdateId;
    const host = WS_HOST;

    if (!beatmapChecksum) {
        imageFade(background, '');
        return;
    }

    const bgUrl = `http://${host}/files/beatmap/background?v=${beatmapChecksum}`;
    urlFallback([bgUrl])
        .then(validUrl => {
            if (updateId !== currentUpdateId) return;
            imageFade(background, validUrl);
        });
}

////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////// VIDEO FUNCTIONS /////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

let currentVideoUpdateId = 0;
let activeVideoUrl = null;
let activeVideoOffset = 0;
let lastAttemptedChecksum = null;

// Parse [Events] section of .osu file to find Video
function extractVideoFromOsu(osuContent) {
    if (!osuContent || typeof osuContent !== 'string') return null;
    const lines = osuContent.split(/\r?\n/);
    let inEvents = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('[') && line.endsWith(']')) {
            if (line.toLowerCase() === '[events]') {
                inEvents = true;
                continue;
            } else if (inEvents) {
                break;
            }
        }
        if (!inEvents || !line || line.startsWith('//')) continue;

        const match = line.match(/^(?:Video|1)\s*,\s*(-?\d+)\s*,\s*"?([^",\r\n]+)"?/i);
        if (match) {
            const offset = parseInt(match[1], 10) || 0;
            const filename = match[2].trim();
            const ext = filename.split('.').pop().toLowerCase();
            if (['mp4', 'webm', 'm4v', 'ogv'].includes(ext)) {
                return { filename, offset };
            }
        }
    }
    return null;
}

let lastAudioTimeMs = null;
let lastAudioTimeChangedAt = 0;
let isAudioPaused = false;

// Stop and reset video
function stopVideo() {
    activeVideoUrl = null;
    activeVideoOffset = 0;
    lastAudioTimeMs = null;
    lastAudioTimeChangedAt = 0;
    isAudioPaused = false;
    const videoElement = document.getElementById('bg-video');
    if (videoElement) {
        videoElement.pause();
        videoElement.style.opacity = '0';
        videoElement.removeAttribute('src');
        videoElement.load();
    }
}

// Update beatmap video
async function updateVideo(beatmapFolder, beatmapFile, checksum) {
    const videoElement = document.getElementById('bg-video');
    if (!videoElement) return;

    if (!beatmapFolder || !beatmapFile || !checksum) {
        stopVideo();
        return;
    }

    // Skip osu! built-in theme song or maps marked no-video
    if (beatmapFolder === '.' || /nekodex/i.test(beatmapFile) || /\[no\s*video\]|\(no\s*video\)/i.test(beatmapFolder)) {
        stopVideo();
        return;
    }

    lastAttemptedChecksum = checksum;
    const updateId = ++currentVideoUpdateId;
    const host = WS_HOST;

    try {
        const osuUrl = `http://${host}/files/beatmap/${encodeURIComponent(beatmapFolder)}/${encodeURIComponent(beatmapFile)}`;
        const response = await fetch(osuUrl);
        if (!response.ok) {
            if (updateId === currentVideoUpdateId) stopVideo();
            return;
        }

        const text = await response.text();
        if (updateId !== currentVideoUpdateId) return;

        const videoInfo = extractVideoFromOsu(text);
        if (!videoInfo) {
            stopVideo();
            return;
        }

        const videoUrl = `http://${host}/files/beatmap/${encodeURIComponent(beatmapFolder)}/${encodeURIComponent(videoInfo.filename)}`;
        activeVideoUrl = videoUrl;
        activeVideoOffset = videoInfo.offset;
        lastAudioTimeMs = null;
        lastAudioTimeChangedAt = performance.now();
        isAudioPaused = false;

        videoElement.muted = true;
        videoElement.loop = true;
        videoElement.src = videoUrl;
        videoElement.load();

        videoElement.onloadeddata = () => {
            if (updateId !== currentVideoUpdateId) return;
            applyCurrentFilter();
            if (shouldShowVideoNow()) {
                videoElement.style.opacity = '1';
                if (typeof cache.songTimeLive === 'number') {
                    syncVideoTime(cache.songTimeLive);
                } else if (!isAudioPaused) {
                    videoElement.play().catch(() => {});
                }
            } else {
                videoElement.style.opacity = '0';
                videoElement.pause();
            }
        };

        videoElement.onerror = () => {
            if (updateId === currentVideoUpdateId) {
                stopVideo();
            }
        };
    } catch (err) {
        console.warn('Failed to load beatmap video:', err);
        if (updateId === currentVideoUpdateId) {
            stopVideo();
        }
    }
}

function isVideoFeatureEnabled() {
    return Boolean(cache.EnableBeatmapVideo || cache.VideoOnlyInMenu);
}

function shouldShowVideoNow() {
    if (!isVideoFeatureEnabled()) return false;
    if (!activeVideoUrl) return false;
    if (cache.VideoOnlyInMenu && cache.stateName === 'play') {
        return false;
    }
    return true;
}

function syncVideoTime(timeMs) {
    const videoElement = document.getElementById('bg-video');
    if (!videoElement || !activeVideoUrl || videoElement.readyState < 2) return;
    if (!shouldShowVideoNow()) {
        if (!videoElement.paused) videoElement.pause();
        videoElement.style.opacity = '0';
        return;
    }
    if (typeof timeMs !== 'number' || isNaN(timeMs)) return;

    const now = performance.now();

    if (lastAudioTimeMs !== null && Math.abs(timeMs - lastAudioTimeMs) > 0.5) {
        lastAudioTimeChangedAt = now;
        isAudioPaused = false;
    } else if (lastAudioTimeMs !== null) {
        if (now - lastAudioTimeChangedAt > 150) {
            isAudioPaused = true;
        }
    } else {
        lastAudioTimeChangedAt = now;
    }
    lastAudioTimeMs = timeMs;

    const targetSec = (timeMs - activeVideoOffset) / 1000;

    if (targetSec < 0) {
        if (!videoElement.paused) videoElement.pause();
        videoElement.currentTime = 0;
        return;
    }

    if (videoElement.duration && targetSec > videoElement.duration) {
        if (!videoElement.paused) videoElement.pause();
        return;
    }

    if (isAudioPaused) {
        if (!videoElement.paused) {
            videoElement.pause();
        }
        const pauseDiff = Math.abs(videoElement.currentTime - targetSec);
        if (pauseDiff > 0.08) {
            videoElement.currentTime = targetSec;
        }
        return;
    }

    const diff = Math.abs(videoElement.currentTime - targetSec);
    if (diff > 0.3) {
        videoElement.currentTime = targetSec;
    }

    if (videoElement.paused && cache.stateName !== 'resultScreen') {
        videoElement.play().catch(() => {});
    }
}

function handleStateChange(state) {
    cache.stateName = state;
    const videoElement = document.getElementById('bg-video');
    if (!videoElement || !activeVideoUrl) return;

    if (!shouldShowVideoNow()) {
        videoElement.pause();
        videoElement.style.opacity = '0';
        return;
    }

    if (state === 'resultScreen' || state === 'unknown' || state === 'exit') {
        videoElement.pause();
    } else {
        applyCurrentFilter();
        videoElement.style.opacity = '1';
        if (!isAudioPaused && videoElement.paused && videoElement.readyState >= 2) {
            videoElement.play().catch(() => {});
        }
    }
}
