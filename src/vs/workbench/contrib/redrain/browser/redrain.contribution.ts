/*---------------------------------------------------------------------------------------------
 *  Red Rain — workbench layer: settings schema, live background FX,
 *  accent variables, status bar toggle, customizer launcher.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { URI } from '../../../../base/common/uri.js';
import { encodeBase64 } from '../../../../base/common/buffer.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

//#region Settings schema

const BACKGROUND_EFFECTS = ['none', 'rain', 'particles', 'aurora', 'stars'] as const;
const SOUND_PACKS = ['rain', 'mechanical', 'typewriter', 'bubble', 'off'] as const;
const VISUAL_FX = ['none', 'sparks', 'rain', 'stars'] as const;

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
        id: 'redrain',
        order: 1,
        title: localize('redrain.title', "Red Rain"),
        type: 'object',
        properties: {
                'redrain.accent': {
                        type: 'string',
                        default: '#3bf58c',
                        markdownDescription: localize('redrain.accent', "The storm accent color used by Red Rain effects (typing FX, glows, background FX). Accepts any CSS color.")
                },
                'redrain.background.effect': {
                        type: 'string',
                        enum: [...BACKGROUND_EFFECTS],
                        enumDescriptions: [
                                localize('bg.none', "No animated background."),
                                localize('bg.rain', "Falling rain streaks."),
                                localize('bg.particles', "Floating dust particles."),
                                localize('bg.aurora', "Slow drifting aurora gradients."),
                                localize('bg.stars', "Twinkling stars.")
                        ],
                        default: 'none',
                        markdownDescription: localize('redrain.bgEffect', "Animated background rendered behind translucent surfaces. For best results set a translucent editor background via the Customization Center.")
                },
                'redrain.background.image': {
                        type: 'string',
                        default: '',
                        markdownDescription: localize('redrain.bgImage', "Optional local image path used as the editor backdrop (e.g. /path/to/wallpaper.jpg). Empty disables it.")
                },
                'redrain.background.opacity': {
                        type: 'number',
                        default: 45,
                        minimum: 0,
                        maximum: 100,
                        markdownDescription: localize('redrain.bgOpacity', "Opacity of the animated/image background in percent.")
                },
                'redrain.background.speed': {
                        type: 'number',
                        default: 5,
                        minimum: 1,
                        maximum: 10,
                        markdownDescription: localize('redrain.bgSpeed', "Animation speed of the background effect.")
                },
                'redrain.typing.soundPack': {
                        type: 'string',
                        enum: [...SOUND_PACKS],
                        enumDescriptions: [
                                localize('snd.rain', "Soft droplet plops. The signature Red Rain sound."),
                                localize('snd.mechanical', "Thocky mechanical switch clicks."),
                                localize('snd.typewriter', "Typewriter clacks with a ding on Enter."),
                                localize('snd.bubble', "Soft bubble pops."),
                                localize('snd.off', "No typing sounds.")
                        ],
                        default: 'rain',
                        markdownDescription: localize('redrain.soundPack', "Synthesized keystroke sound pack.")
                },
                'redrain.typing.volume': {
                        type: 'number',
                        default: 60,
                        minimum: 0,
                        maximum: 100,
                        markdownDescription: localize('redrain.volume', "Typing sound volume in percent.")
                },
                'redrain.typing.visualEffect': {
                        type: 'string',
                        enum: [...VISUAL_FX],
                        enumDescriptions: [
                                localize('vfx.none', "No keystroke visuals."),
                                localize('vfx.sparks', "Sparks burst upward from the caret."),
                                localize('vfx.rain', "Rain streaks drip from the caret."),
                                localize('vfx.stars', "Tiny stars twinkle around the caret.")
                        ],
                        default: 'rain',
                        markdownDescription: localize('redrain.vfx', "Keystroke visual effect at the caret.")
                },
        }
});

//#endregion

//#region Commands

registerAction2(class ToggleTypingSoundAction extends Action2 {
        constructor() {
                super({
                        id: 'redrain.toggleTypingSound',
                        title: { value: localize('redrain.toggleTypingSound', "Red Rain: Toggle Typing Sounds"), original: 'Red Rain: Toggle Typing Sounds' },
                        category: Categories.View,
                        f1: true,
                        keybinding: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR, weight: KeybindingWeight.WorkbenchContrib + 50 }
                });
        }
        run(accessor: ServicesAccessor) {
                const configurationService = accessor.get(IConfigurationService);
                const current = configurationService.getValue<string>('redrain.typing.soundPack');
                const next = current === 'off' ? 'rain' : 'off';
                configurationService.updateValue('redrain.typing.soundPack', next);
                return next;
        }
});

registerAction2(class OpenCustomizerAction extends Action2 {
        constructor() {
                super({
                        id: 'redrain.openCustomizationCenter',
                        title: { value: localize('redrain.openCustomizer', "Red Rain: Open Customization Center"), original: 'Red Rain: Open Customization Center' },
                        category: Categories.View,
                        f1: true,
                        keybinding: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyU, weight: KeybindingWeight.WorkbenchContrib + 50 }
                });
        }
        run(accessor: ServicesAccessor) {
                accessor.get(ICommandService).executeCommand('redrain.customizer.open');
        }
});

//#endregion

//#region Live background FX contribution

interface IBackdropParticle { x: number; y: number; vx: number; vy: number; r: number; a: number; phase: number; }

class RedRainBackgroundFx extends Disposable implements IWorkbenchContribution {
        static readonly ID = 'workbench.contrib.redRainBackgroundFx';

        private readonly _canvas: HTMLCanvasElement;
        private readonly _ctx2d: CanvasRenderingContext2D | null;
        private readonly _imageDiv: HTMLDivElement;
        private _effect: string = 'none';
        private _imageCss = '';
        private _opacity = 45;
        private _speed = 5;
        private _accent = '#3bf58c';
        private _running = false;
        private _raf = 0;
        private _lastFrame = 0;
        private _drops: IBackdropParticle[] = [];
        private _stars: IBackdropParticle[] = [];

        constructor(
                @IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
                @IConfigurationService private readonly _configurationService: IConfigurationService,
                @IFileService private readonly _fileService: IFileService,
        ) {
                super();

                this._canvas = mainWindow.document.createElement('canvas');
                this._canvas.id = 'redrain-background-canvas';
                this._canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
                this._ctx2d = this._canvas.getContext('2d');

                // image backdrop layer (below canvas)
                this._imageDiv = mainWindow.document.createElement('div');
                this._imageDiv.id = 'redrain-background-image';
                this._imageDiv.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;background-size:cover;background-position:center;';
                this._layoutService.mainContainer.insertBefore(this._imageDiv, this._layoutService.mainContainer.firstChild);
                this._layoutService.mainContainer.insertBefore(this._canvas, this._imageDiv.nextSibling);

                this._register(toDisposable(() => {
                        cancelAnimationFrame(this._raf);
                        this._canvas.remove();
                        this._imageDiv.remove();
                }));

                const onResize = () => this._resize();
                this._register(this._layoutService.onDidLayoutMainContainer(onResize));

                const read = () => {
                        this._effect = this._configurationService.getValue<string>('redrain.background.effect') || 'none';
                        this._opacity = Math.min(100, Math.max(0, this._configurationService.getValue<number>('redrain.background.opacity') ?? 45));
                        this._speed = Math.min(10, Math.max(1, this._configurationService.getValue<number>('redrain.background.speed') ?? 5));
                        this._accent = this._configurationService.getValue<string>('redrain.accent') || '#3bf58c';
                        const image = this._configurationService.getValue<string>('redrain.background.image') || '';
                        this._applyAccentVars();
                        this._loadImage(image);
                        this._sync();
                };
                read();
                this._register(this._configurationService.onDidChangeConfiguration(e => {
                        if (e.affectsConfiguration('redrain.background')
                                || e.affectsConfiguration('redrain.accent')
                                || e.affectsConfiguration('redrain.glass')) {
                                read();
                        }
                }));
        }

        private _applyAccentVars(): void {
                const el = this._layoutService.mainContainer;
                el.style.setProperty('--rr-accent', this._accent);
                el.style.setProperty('--rr-accent-soft', this._withAlpha(this._accent, 0.16));
                el.style.setProperty('--rr-glow', `0 0 12px ${this._withAlpha(this._accent, 0.28)}`);
        }

        private _withAlpha(color: string, alpha: number): string {
                const c = color.trim();
                if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
                        const r = c.length === 7 ? parseInt(c.slice(1, 3), 16) : parseInt(c[1] + c[1], 16);
                        const g = c.length === 7 ? parseInt(c.slice(3, 5), 16) : parseInt(c[2] + c[2], 16);
                        const b = c.length === 7 ? parseInt(c.slice(5, 7), 16) : parseInt(c[3] + c[3], 16);
                        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
                return c;
        }

        private async _loadImage(path: string): Promise<void> {
                if (!path) {
                        this._imageCss = '';
                        this._imageDiv.style.backgroundImage = '';
                        return;
                }
                try {
                        const buf = await this._fileService.readFile(URI.file(path));
                        const base64 = encodeBase64(buf.value);
                        this._imageCss = `url(data:image;base64,${base64})`;
                        this._imageDiv.style.backgroundImage = this._imageCss;
                } catch {
                        this._imageCss = '';
                        this._imageDiv.style.backgroundImage = '';
                }
        }

        private _resize(): void {
                const dim = this._layoutService.mainContainerDimension;
                this._canvas.width = Math.max(1, Math.floor(dim.width));
                this._canvas.height = Math.max(1, Math.floor(dim.height));
                this._seed();
        }

        private _seed(): void {
                const w = this._canvas.width, h = this._canvas.height;
                this._drops = [];
                const dropCount = Math.min(220, Math.floor(w / 8));
                for (let i = 0; i < dropCount; i++) {
                        this._drops.push({
                                x: Math.random() * w, y: Math.random() * h,
                                vx: 0, vy: 3 + Math.random() * 7,
                                r: 0, a: 0.06 + Math.random() * 0.20, phase: Math.random() * Math.PI * 2
                        });
                }
                this._stars = [];
                const starCount = Math.min(160, Math.floor(w / 12));
                for (let i = 0; i < starCount; i++) {
                        this._stars.push({
                                x: Math.random() * w, y: Math.random() * h,
                                vx: 0, vy: 0, r: 0.6 + Math.random() * 1.6,
                                a: 0.3 + Math.random() * 0.7, phase: Math.random() * Math.PI * 2
                        });
                }
        }

        private _sync(): void {
                if (this._effect === 'none' && !this._imageCss) {
                        this._canvas.style.display = 'none';
                        this._imageDiv.style.opacity = '0';
                        this._stop();
                        return;
                }
                this._canvas.style.display = this._effect === 'none' ? 'none' : 'block';
                this._imageDiv.style.opacity = this._imageCss ? String(this._opacity / 100) : '0';
                this._resize();
                if (this._effect === 'none') {
                        this._stop();
                } else {
                        this._start();
                }
        }

        private _start(): void {
                if (this._running) {
                        return;
                }
                this._running = true;
                const loop = (t: number) => {
                        if (!this._running) {
                                return;
                        }
                        if (!mainWindow.document.hidden && t - this._lastFrame > 33) { // ~30fps
                                this._lastFrame = t;
                                this._frame(t);
                        }
                        this._raf = mainWindow.requestAnimationFrame(loop);
                };
                this._raf = mainWindow.requestAnimationFrame(loop);
        }

        private _stop(): void {
                this._running = false;
                cancelAnimationFrame(this._raf);
                const ctx = this._ctx2d;
                if (ctx) {
                        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
                }
        }

        private _frame(t: number): void {
                const ctx = this._ctx2d;
                if (!ctx) {
                        return;
                }
                const w = this._canvas.width, h = this._canvas.height;
                const speed = this._speed / 5;
                ctx.clearRect(0, 0, w, h);
                const accent = this._withAlpha(this._accent, 1);

                if (this._effect === 'rain') {
                        ctx.strokeStyle = accent;
                        ctx.lineCap = 'round';
                        for (const d of this._drops) {
                                d.y += d.vy * speed;
                                if (d.y > h + 20) {
                                        d.y = -20;
                                        d.x = Math.random() * w;
                                        d.vy = 3 + Math.random() * 7;
                                }
                                ctx.globalAlpha = d.a * (this._opacity / 100);
                                ctx.lineWidth = 1.2;
                                ctx.beginPath();
                                ctx.moveTo(d.x, d.y - 10);
                                ctx.lineTo(d.x, d.y + 4);
                                ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                } else if (this._effect === 'particles') {
                        ctx.fillStyle = accent;
                        for (const p of this._drops) {
                                p.x += (Math.sin((t / 1000) + p.phase) * 0.4) * speed;
                                p.y -= (p.vy * 0.25) * speed;
                                if (p.y < -10) {
                                        p.y = h + 10;
                                        p.x = Math.random() * w;
                                }
                                if (p.x < -10 || p.x > w + 10) {
                                        p.x = Math.random() * w;
                                }
                                ctx.globalAlpha = p.a * (this._opacity / 100) * 0.8;
                                ctx.beginPath();
                                ctx.arc(p.x, p.y, 1 + (p.phase % 1.5), 0, Math.PI * 2);
                                ctx.fill();
                        }
                        ctx.globalAlpha = 1;
                } else if (this._effect === 'stars') {
                        ctx.fillStyle = accent;
                        for (const s of this._stars) {
                                const tw = 0.5 + 0.5 * Math.sin(t / 700 + s.phase);
                                ctx.globalAlpha = s.a * tw * (this._opacity / 100);
                                ctx.beginPath();
                                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                                ctx.fill();
                        }
                        ctx.globalAlpha = 1;
                } else if (this._effect === 'aurora') {
                        const alpha = (this._opacity / 100) * 0.55;
                        const blob = (cx: number, cy: number, radius: number, a: number) => {
                                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                                grad.addColorStop(0, this._withAlpha(this._accent, a * alpha));
                                grad.addColorStop(1, this._withAlpha(this._accent, 0));
                                ctx.fillStyle = grad;
                                ctx.fillRect(0, 0, w, h);
                        };
                        const t1 = t / 9000, t2 = t / 13000, t3 = t / 17000;
                        blob(w * (0.25 + 0.12 * Math.sin(t1)), h * (0.3 + 0.1 * Math.cos(t2)), Math.min(w, h) * 0.55, 0.16);
                        blob(w * (0.75 + 0.1 * Math.cos(t2)), h * (0.65 + 0.12 * Math.sin(t3)), Math.min(w, h) * 0.5, 0.12);
                        blob(w * (0.5 + 0.15 * Math.sin(t3)), h * (0.5 + 0.15 * Math.cos(t1)), Math.min(w, h) * 0.45, 0.10);
                }
        }
}

registerWorkbenchContribution2(RedRainBackgroundFx.ID, RedRainBackgroundFx, WorkbenchPhase.AfterRestored);

//#endregion

//#region Status bar sound toggle

export class RedRainStatusbarContribution extends Disposable implements IWorkbenchContribution {
        static readonly ID = 'workbench.contrib.redRainStatusbar';

        private _accessor: IStatusbarEntryAccessor | undefined;

        constructor(
                @IStatusbarService private readonly _statusbarService: IStatusbarService,
                @IConfigurationService private readonly _configurationService: IConfigurationService,
        ) {
                super();

                const update = () => {
                        const pack = this._configurationService.getValue<string>('redrain.typing.soundPack') || 'rain';
                        const entry = {
                                name: localize('redrain.statusbar.name', "Typing Sound"),
                                text: pack === 'off' ? '$(mute) Rain Off' : '$(pulse) Rain On',
                                ariaLabel: 'Typing sound: ' + pack,
                                tooltip: localize('redrain.statusbar.tooltip', "Click to toggle typing sounds (Ctrl+Alt+R)"),
                                command: { id: 'redrain.toggleTypingSound', title: localize('redrain.statusbar.toggle', "Toggle Typing Sounds") }
                        };
                        if (this._accessor) {
                                this._accessor.update(entry);
                        } else {
                                this._accessor = this._statusbarService.addEntry(entry, 'statusbar.redrain.sound', StatusbarAlignment.RIGHT, -2);
                        }
                };
                update();
                this._register(this._configurationService.onDidChangeConfiguration(e => {
                        if (e.affectsConfiguration('redrain.typing.soundPack')) {
                                update();
                        }
                }));
                this._register(toDisposable(() => this._accessor?.dispose()));
        }
}

registerWorkbenchContribution2(RedRainStatusbarContribution.ID, RedRainStatusbarContribution, WorkbenchPhase.AfterRestored);

//#endregion
