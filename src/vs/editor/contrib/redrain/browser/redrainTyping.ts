/*---------------------------------------------------------------------------------------------
 *  Red Rain — typing engine: synthesized keystroke sounds + keystroke FX.
 *  Pure WebAudio (no assets). Configured via redrain.* settings; UI lives in
 *  the Customization Center extension.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export type RrSoundPack = 'rain' | 'mechanical' | 'typewriter' | 'bubble' | 'off';
export type RrVisualFx = 'none' | 'sparks' | 'rain' | 'stars';

const MAX_PARTICLES = 48;
let liveParticles = 0;

class RrSoundEngine {
        private _ctx: AudioContext | null = null;
        private _noise: AudioBuffer | null = null;

        private ensureCtx(): AudioContext | null {
                try {
                        const Ctor = mainWindow.AudioContext;
                        if (!Ctor) {
                                return null;
                        }
                        if (!this._ctx) {
                                this._ctx = new Ctor();
                        }
                        if (this._ctx.state === 'suspended') {
                                this._ctx.resume().catch(() => { });
                        }
                        return this._ctx.state === 'closed' ? null : this._ctx;
                } catch {
                        return null;
                }
        }

        private noiseBuffer(ctx: AudioContext): AudioBuffer {
                if (!this._noise || this._noise.sampleRate !== ctx.sampleRate) {
                        const len = Math.floor(ctx.sampleRate * 0.12);
                        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                        const data = buf.getChannelData(0);
                        for (let i = 0; i < len; i++) {
                                data[i] = Math.random() * 2 - 1;
                        }
                        this._noise = buf;
                }
                return this._noise;
        }

        private burst(
                ctx: AudioContext,
                opts: { type: BiquadFilterType; freq: number; q?: number; dur: number; gain: number; sweepTo?: number }
        ): void {
                const now = ctx.currentTime;
                const src = ctx.createBufferSource();
                src.buffer = this.noiseBuffer(ctx);
                src.playbackRate.value = 0.9 + Math.random() * 0.25;
                const filter = ctx.createBiquadFilter();
                filter.type = opts.type;
                filter.frequency.setValueAtTime(opts.freq, now);
                if (opts.sweepTo) {
                        filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, now + opts.dur);
                }
                filter.Q.value = opts.q ?? 1;
                const g = ctx.createGain();
                g.gain.setValueAtTime(opts.gain, now);
                g.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);
                src.connect(filter).connect(g).connect(ctx.destination);
                src.start(now);
                src.stop(now + opts.dur + 0.02);
        }

        private tone(ctx: AudioContext, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
                const now = ctx.currentTime + delay;
                const osc = ctx.createOscillator();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, now);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, now);
                g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
                g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
                osc.connect(g).connect(ctx.destination);
                osc.start(now);
                osc.stop(now + dur + 0.02);
        }

        /**
         * Play one keystroke.
         * @param kind 'key' | 'enter' | 'backspace' | 'space'
         */
        public play(pack: RrSoundPack, volume: number, kind: string): void {
                if (pack === 'off' || volume <= 0 || mainWindow.document.hidden) {
                        return;
                }
                const ctx = this.ensureCtx();
                if (!ctx) {
                        return;
                }
                const vol = Math.max(0, Math.min(1, volume));
                const jitter = 0.85 + Math.random() * 0.3; // humanized pitch variance

                if (kind === 'enter' && pack === 'typewriter') {
                        this.burst(ctx, { type: 'highpass', freq: 2400, dur: 0.035, gain: 0.5 * vol });
                        this.tone(ctx, 1567 * jitter, 0.42, 0.22 * vol);
                        this.tone(ctx, 2093 * jitter, 0.30, 0.10 * vol);
                        return;
                }
                if (kind === 'enter' && pack === 'mechanical') {
                        this.burst(ctx, { type: 'lowpass', freq: 3800 * jitter, dur: 0.045, gain: 0.55 * vol });
                        this.burst(ctx, { type: 'bandpass', freq: 900 * jitter, q: 4, dur: 0.09, gain: 0.35 * vol });
                        return;
                }

                switch (pack) {
                        case 'rain': {
                                // soft droplet: short bandpassed noise with a quick downward sweep
                                const f = 650 + Math.random() * 1900;
                                this.burst(ctx, { type: 'bandpass', freq: f, q: 7, dur: 0.05 + Math.random() * 0.05, gain: (kind === 'space' ? 0.22 : 0.34) * vol, sweepTo: f * 0.55 });
                                if (Math.random() < 0.28) {
                                        // occasional secondary droplet for texture
                                        const f2 = 900 + Math.random() * 1800;
                                        this.burst(ctx, { type: 'bandpass', freq: f2, q: 9, dur: 0.04, gain: 0.14 * vol, sweepTo: f2 * 0.6 });
                                }
                                break;
                        }
                        case 'mechanical': {
                                this.burst(ctx, { type: 'lowpass', freq: 4200 * jitter, dur: 0.022, gain: (kind === 'space' ? 0.3 : 0.42) * vol });
                                this.burst(ctx, { type: 'bandpass', freq: 1400 * jitter, q: 3, dur: 0.03, gain: 0.2 * vol });
                                break;
                        }
                        case 'typewriter': {
                                this.burst(ctx, { type: 'highpass', freq: 2600 * jitter, dur: 0.02, gain: 0.45 * vol });
                                this.burst(ctx, { type: 'bandpass', freq: 700 * jitter, q: 2.5, dur: 0.035, gain: 0.28 * vol });
                                break;
                        }
                        case 'bubble': {
                                const base = (kind === 'space' ? 240 : 330) * jitter;
                                this.tone(ctx, base, 0.07, 0.18 * vol, 'sine');
                                this.tone(ctx, base * 2.4, 0.05, 0.10 * vol, 'sine', 0.004);
                                break;
                        }
                }
        }

        public dispose(): void {
                try { this._ctx?.close(); } catch { }
                this._ctx = null;
        }
}

export class RedRainTypingContribution extends Disposable implements IEditorContribution {
        public static readonly ID = 'editor.contrib.redRainTyping';

        private readonly _soundEngine = new RrSoundEngine();
        private _pack: RrSoundPack = 'rain';
        private _volume = 0.6;
        private _fx: RrVisualFx = 'rain';
        private _accent = '#3bf58c';

        constructor(
                private readonly _editor: ICodeEditor,
                @IConfigurationService configurationService: IConfigurationService,
        ) {
                super();

                const read = () => {
                        const s = configurationService.getValue<{ soundPack: RrSoundPack; volume: number; visualEffect: RrVisualFx }>('redrain.typing');
                        this._pack = s?.soundPack ?? 'rain';
                        this._volume = Math.min(1, Math.max(0, (s?.volume ?? 60) / 100));
                        this._fx = s?.visualEffect ?? 'rain';
                };
                const readAccent = () => {
                        const a = configurationService.getValue<{ accent?: string }>('redrain');
                        this._accent = a?.accent || '#3bf58c';
                };
                read();
                readAccent();
                this._register(configurationService.onDidChangeConfiguration(e => {
                        if (e.affectsConfiguration('redrain.typing') || e.affectsConfiguration('redrain.accent')) {
                                read();
                                readAccent();
                        }
                }));

                this._register(this._editor.onKeyDown(e => {
                        const ev = e.browserEvent;
                        if (e.ctrlKey || e.altKey || e.metaKey) {
                                return;
                        }
                        if (e.keyCode === KeyCode.Enter) {
                                this._soundEngine.play(this._pack, this._volume, 'enter');
                                this._spawnParticles(10);
                                return;
                        }
                        if (e.keyCode === KeyCode.Backspace || e.keyCode === KeyCode.Delete) {
                                this._soundEngine.play(this._pack, this._volume * 0.6, 'backspace');
                                return;
                        }
                        const key = ev.key;
                        if (key && key.length === 1) {
                                this._soundEngine.play(this._pack, this._volume, key === ' ' ? 'space' : 'key');
                                this._spawnParticles(4 + Math.floor(Math.random() * 3));
                        }
                }));
        }

        private _spawnParticles(count: number): void {
                if (this._fx === 'none' || liveParticles >= MAX_PARTICLES || mainWindow.document.hidden) {
                        return;
                }
                const editor = this._editor;
                const domNode = editor.getDomNode();
                if (!domNode) {
                        return;
                }
                const rect = domNode.getBoundingClientRect();
                if (rect.width === 0) {
                        return;
                }
                const selections = editor.getSelections() ?? [];
                for (const sel of selections.slice(0, 3)) {
                        const pos = editor.getScrolledVisiblePosition({ lineNumber: sel.positionLineNumber, column: sel.positionColumn });
                        if (!pos) {
                                continue;
                        }
                        const x = rect.left + pos.left;
                        const y = rect.top + pos.top;
                        for (let i = 0; i < count && liveParticles < MAX_PARTICLES; i++) {
                                this._particle(x, y);
                        }
                }
        }

        private _particle(x: number, y: number): void {
                const doc = mainWindow.document;
                const el = doc.createElement('div');
                el.style.cssText = 'position:fixed;pointer-events:none;z-index:1000;will-change:transform,opacity;';
                const style = this._fx;
                const hueShift = Math.floor(Math.random() * 24) - 12;

                if (style === 'rain') {
                        const len = 8 + Math.random() * 12;
                        el.style.width = '1.5px';
                        el.style.height = `${len}px`;
                        el.style.left = `${x + (Math.random() * 18 - 9)}px`;
                        el.style.top = `${y - len}px`;
                        el.style.background = `linear-gradient(180deg, transparent, ${this._accent})`;
                        el.style.borderRadius = '2px';
                        const fall = 16 + Math.random() * 22;
                        const anim = el.animate([
                                { transform: 'translateY(0)', opacity: 0.9 },
                                { transform: `translateY(${fall}px)`, opacity: 0 }
                        ], { duration: 320 + Math.random() * 180, easing: 'cubic-bezier(.3,.6,.6,1)' });
                        anim.onfinish = () => { el.remove(); liveParticles--; };
                } else if (style === 'sparks') {
                        const s = 2 + Math.random() * 3;
                        el.style.width = `${s}px`;
                        el.style.height = `${s}px`;
                        el.style.left = `${x}px`;
                        el.style.top = `${y}px`;
                        el.style.background = this._accent;
                        el.style.filter = `hue-rotate(${hueShift}deg)`;
                        el.style.borderRadius = '50%';
                        const dx = (Math.random() - 0.5) * 36;
                        const dy = -6 - Math.random() * 26;
                        const anim = el.animate([
                                { transform: 'translate(0,0) scale(1)', opacity: 1 },
                                { transform: `translate(${dx}px, ${dy - 8}px) scale(.4)`, opacity: 0.9, offset: 0.55 },
                                { transform: `translate(${dx * 1.35}px, ${dy + 20}px) scale(0)`, opacity: 0 }
                        ], { duration: 420 + Math.random() * 160, easing: 'ease-out' });
                        anim.onfinish = () => { el.remove(); liveParticles--; };
                } else { // stars
                        const s = 3 + Math.random() * 4;
                        el.style.width = `${s}px`;
                        el.style.height = `${s}px`;
                        el.style.left = `${x + (Math.random() * 26 - 13)}px`;
                        el.style.top = `${y + (Math.random() * 14 - 14)}px`;
                        el.style.background = this._accent;
                        el.style.filter = `hue-rotate(${hueShift}deg)`;
                        el.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
                        const anim = el.animate([
                                { transform: 'scale(0) rotate(0deg)', opacity: 0 },
                                { transform: 'scale(1) rotate(90deg)', opacity: 1, offset: 0.4 },
                                { transform: 'scale(0) rotate(180deg)', opacity: 0 }
                        ], { duration: 520 + Math.random() * 200, easing: 'ease-in-out' });
                        anim.onfinish = () => { el.remove(); liveParticles--; };
                }
                doc.body.appendChild(el);
                liveParticles++;
        }

        public override dispose(): void {
                this._soundEngine.dispose();
                super.dispose();
        }
}

registerEditorContribution(
        RedRainTypingContribution.ID,
        RedRainTypingContribution,
        EditorContributionInstantiation.Eager
);
