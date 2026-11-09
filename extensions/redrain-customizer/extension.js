/*---------------------------------------------------------------------------------------------
 *  Red Rain Customization Center — built-in extension.
 *  Opens a glass-styled webview that live-edits redrain.* settings,
 *  workbench.colorCustomizations and frosted-glass opacity, with
 *  profile export/import.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const vscode = require('vscode');

const ACCENT_PRESETS = [
	{ id: 'storm', label: 'Storm Green', color: '#3bf58c' },
	{ id: 'crimson', label: 'Crimson Rain', color: '#ff4757' },
	{ id: 'midnight', label: 'Midnight Violet', color: '#7c5cff' },
	{ id: 'ice', label: 'Ice Blue', color: '#57c7ff' },
	{ id: 'gold', label: 'Electric Gold', color: '#ffc14d' },
	{ id: 'pink', label: 'Neon Rose', color: '#ff5cc8' }
];

const EDITOR_BG_BASE = '#070B08'; // matches Red Rain Storm theme editor background

function withAlpha(hex, alphaPercent) {
	const p = Math.max(0, Math.min(100, Math.round(alphaPercent)));
	const a = Math.round((p / 100) * 255).toString(16).padStart(2, '0');
	return (hex + a).toLowerCase();
}

function rr(section) {
	return vscode.workspace.getConfiguration('redrain' + (section ? '.' + section : ''));
}

function rrValue(key, fallback) {
	const v = vscode.workspace.getConfiguration('redrain').get(key);
	return v === undefined ? fallback : v;
}

async function update(key, value, target) {
	try {
		await vscode.workspace.getConfiguration('redrain').update(key, value, target || vscode.ConfigurationTarget.Global);
	} catch (e) {
		vscode.window.showErrorMessage('Red Rain: failed to update ' + key + ' — ' + e.message);
	}
}

async function updateColorCustomization(key, value) {
	const config = vscode.workspace.getConfiguration('workbench');
	const current = config.get('colorCustomizations') || {};
	const next = Object.assign({}, current);
	if (value === undefined || value === null) {
		delete next[key];
	} else {
		next[key] = value;
	}
	await config.update('colorCustomizations', next, vscode.ConfigurationTarget.Global);
}

function getWebviewContent(webview, extensionUri) {
	const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
	const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';`;

	const state = {
		accent: rrValue('accent', '#3bf58c'),
		backgroundEffect: rrValue('background.effect', 'none'),
		backgroundOpacity: rrValue('background.opacity', 45),
		backgroundSpeed: rrValue('background.speed', 5),
		backgroundImage: rrValue('background.image', ''),
		soundPack: rrValue('typing.soundPack', 'rain'),
		volume: rrValue('typing.volume', 60),
		visualEffect: rrValue('typing.visualEffect', 'rain'),
		glass: vscode.workspace.getConfiguration('workbench').get('modernUIFrostedGlass', true),
		glassOpacity: vscode.workspace.getConfiguration('workbench').get('modernUIFrostedGlassOpacity', 90),
		editorBgAlpha: 100
	};
	const colorCust = vscode.workspace.getConfiguration('workbench').get('colorCustomizations') || {};
	const bg = colorCust['editor.background'];
	if (typeof bg === 'string' && bg.toLowerCase().startsWith(EDITOR_BG_BASE.toLowerCase()) && bg.length === 9) {
		state.editorBgAlpha = Math.round((parseInt(bg.slice(7), 16) / 255) * 100);
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Red Rain Customization Center</title>
<style>
:root {
	--accent: ${state.accent};
	--glass: rgba(14, 20, 16, 0.62);
	--stroke: rgba(255,255,255,0.09);
	--text: #d8e6dc;
	--muted: #86988b;
}
* { box-sizing: border-box; }
body {
	margin: 0; padding: 18px 20px 40px;
	font-family: "Segoe UI", -apple-system, sans-serif;
	color: var(--text);
	background:
		radial-gradient(900px 500px at 15% -10%, rgba(59,245,140,0.08), transparent 60%),
		radial-gradient(700px 400px at 85% 110%, rgba(59,245,140,0.06), transparent 60%);
}
h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
h1 .dot { width: 14px; height: 14px; border-radius: 4px; background: var(--accent); box-shadow: 0 0 12px var(--accent); display: inline-block; }
.sub { color: var(--muted); font-size: 12.5px; margin-bottom: 18px; }
.card {
	background: var(--glass);
	border: 1px solid var(--stroke);
	border-radius: 12px;
	padding: 14px 16px;
	margin-bottom: 14px;
	backdrop-filter: blur(14px);
}
.card h2 { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin: 0 0 12px; font-weight: 600; }
.row { display: flex; align-items: center; gap: 12px; margin: 10px 0; flex-wrap: wrap; }
.row label { min-width: 140px; font-size: 12.5px; color: var(--muted); }
.presets { display: flex; gap: 10px; flex-wrap: wrap; }
.preset {
	display: flex; align-items: center; gap: 8px;
	padding: 7px 12px; border-radius: 9px;
	background: rgba(255,255,255,0.04); border: 1px solid var(--stroke);
	color: var(--text); font-size: 12px; cursor: pointer; user-select: none;
}
.preset .sw { width: 14px; height: 14px; border-radius: 4px; }
.preset:hover { border-color: var(--accent); box-shadow: 0 0 10px rgba(59,245,140,0.25); }
.preset.active { border-color: var(--accent); background: rgba(59,245,140,0.10); }
input[type="range"] { flex: 1; accent-color: var(--accent); min-width: 160px; }
input[type="text"], select {
	background: rgba(0,0,0,0.35); color: var(--text);
	border: 1px solid var(--stroke); border-radius: 8px;
	padding: 7px 10px; font-size: 12.5px; outline: none; min-width: 200px;
}
input[type="text"]:focus, select:focus { border-color: var(--accent); }
.val { color: var(--accent); font-size: 12px; min-width: 44px; text-align: right; }
.btn {
	display: inline-flex; align-items: center; gap: 8px;
	background: rgba(255,255,255,0.05); color: var(--text);
	border: 1px solid var(--stroke); border-radius: 9px;
	padding: 8px 14px; font-size: 12.5px; cursor: pointer;
}
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); color: #04170b; font-weight: 600; border-color: transparent; }
.hint { color: var(--muted); font-size: 11.5px; margin-top: 6px; line-height: 1.5; }
.switch { position: relative; width: 40px; height: 22px; }
.switch input { display: none; }
.switch .track { position: absolute; inset: 0; border-radius: 12px; background: rgba(255,255,255,0.12); transition: 120ms; }
.switch .knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #cfd8d1; transition: 120ms; }
.switch input:checked + .track { background: var(--accent); }
.switch input:checked + .track .knob { left: 20px; background: #04170b; }
.actions { display: flex; gap: 10px; margin-top: 4px; }
</style>
</head>
<body>
	<h1><span class="dot"></span>Red Rain Customization Center</h1>
	<div class="sub">Every change applies live and persists globally. Profiles export the complete setup as JSON.</div>

	<div class="card">
		<h2>Accent</h2>
		<div class="presets" id="presets"></div>
		<div class="row" style="margin-top:12px">
			<label>Custom color</label>
			<input type="text" id="customAccent" value="${state.accent}" spellcheck="false">
			<button class="btn" id="applyAccent">Apply</button>
		</div>
	</div>

	<div class="card">
		<h2>Glass &amp; Frost</h2>
		<div class="row">
			<label>Frosted glass (popups &amp; menus)</label>
			<div class="switch"><input type="checkbox" id="glass" ${state.glass ? 'checked' : ''}><div class="track"><div class="knob"></div></div></div>
		</div>
		<div class="row">
			<label>Glass opacity</label>
			<input type="range" id="glassOpacity" min="50" max="100" step="1" value="${state.glassOpacity}">
			<span class="val" id="glassOpacityVal">${state.glassOpacity}%</span>
		</div>
		<div class="hint">Glass opacity controls how see-through the frosted Command Palette and menus are. Lower = more translucent.</div>
	</div>

	<div class="card">
		<h2>Live Background</h2>
		<div class="row">
			<label>Effect</label>
			<select id="bgEffect">
				<option value="none"${state.backgroundEffect === 'none' ? ' selected' : ''}>None</option>
				<option value="rain"${state.backgroundEffect === 'rain' ? ' selected' : ''}>Rain</option>
				<option value="particles"${state.backgroundEffect === 'particles' ? ' selected' : ''}>Particles</option>
				<option value="aurora"${state.backgroundEffect === 'aurora' ? ' selected' : ''}>Aurora</option>
				<option value="stars"${state.backgroundEffect === 'stars' ? ' selected' : ''}>Stars</option>
			</select>
		</div>
		<div class="row">
			<label>Opacity</label>
			<input type="range" id="bgOpacity" min="0" max="100" step="1" value="${state.backgroundOpacity}">
			<span class="val" id="bgOpacityVal">${state.backgroundOpacity}%</span>
		</div>
		<div class="row">
			<label>Speed</label>
			<input type="range" id="bgSpeed" min="1" max="10" step="1" value="${state.backgroundSpeed}">
			<span class="val" id="bgSpeedVal">${state.backgroundSpeed}</span>
		</div>
		<div class="row">
			<label>Editor translucency</label>
			<input type="range" id="bgAlpha" min="10" max="100" step="1" value="${state.editorBgAlpha}">
			<span class="val" id="bgAlphaVal">${state.editorBgAlpha}%</span>
		</div>
		<div class="row">
			<label>Wallpaper image</label>
			<input type="text" id="bgImage" value="${state.backgroundImage}" placeholder="/absolute/path/to/image.jpg" spellcheck="false">
			<button class="btn" id="pickImage">Browse…</button>
			<button class="btn" id="clearImage">Clear</button>
		</div>
		<div class="hint">Editor translucency lets the live background bleed through the editor surface. Keep it above ~60% for comfortable readability.</div>
	</div>

	<div class="card">
		<h2>Typing Effects</h2>
		<div class="row">
			<label>Sound pack</label>
			<select id="soundPack">
				<option value="rain"${state.soundPack === 'rain' ? ' selected' : ''}>Rain drops (signature)</option>
				<option value="mechanical"${state.soundPack === 'mechanical' ? ' selected' : ''}>Mechanical</option>
				<option value="typewriter"${state.soundPack === 'typewriter' ? ' selected' : ''}>Typewriter</option>
				<option value="bubble"${state.soundPack === 'bubble' ? ' selected' : ''}>Bubble</option>
				<option value="off"${state.soundPack === 'off' ? ' selected' : ''}>Silent</option>
			</select>
			<button class="btn" id="testSound">Test</button>
		</div>
		<div class="row">
			<label>Volume</label>
			<input type="range" id="volume" min="0" max="100" step="1" value="${state.volume}">
			<span class="val" id="volumeVal">${state.volume}%</span>
		</div>
		<div class="row">
			<label>Keystroke FX</label>
			<select id="visualEffect">
				<option value="rain"${state.visualEffect === 'rain' ? ' selected' : ''}>Rain streaks</option>
				<option value="sparks"${state.visualEffect === 'sparks' ? ' selected' : ''}>Sparks</option>
				<option value="stars"${state.visualEffect === 'stars' ? ' selected' : ''}>Stars</option>
				<option value="none"${state.visualEffect === 'none' ? ' selected' : ''}>None</option>
			</select>
		</div>
		<div class="hint">Toggle shortcut: <b>Ctrl+Alt+R</b>. Status bar shows Rain On/Off.</div>
	</div>

	<div class="card">
		<h2>Profiles</h2>
		<div class="actions">
			<button class="btn primary" id="exportProfile">Export profile…</button>
			<button class="btn" id="importProfile">Import profile…</button>
		</div>
		<div class="hint">A profile contains accent, glass, background and typing settings plus editor color customizations.</div>
	</div>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	const presets = ${JSON.stringify(ACCENT_PRESETS)};
	const currentAccent = ${JSON.stringify(state.accent)};

	const presetHost = document.getElementById('presets');
	presets.forEach(p => {
		const el = document.createElement('div');
		el.className = 'preset' + (p.color.toLowerCase() === currentAccent.toLowerCase() ? ' active' : '');
		el.innerHTML = '<span class="sw" style="background:' + p.color + '"></span>' + p.label;
		el.onclick = () => { vscode.postMessage({ type: 'accent', value: p.color }); };
		presetHost.appendChild(el);
	});

	document.getElementById('applyAccent').onclick = () => {
		const v = document.getElementById('customAccent').value.trim();
		if (v) { vscode.postMessage({ type: 'accent', value: v }); }
	};
	document.getElementById('glass').onchange = e => vscode.postMessage({ type: 'glass', value: e.target.checked });
	const glassOpacity = document.getElementById('glassOpacity');
	glassOpacity.oninput = e => { document.getElementById('glassOpacityVal').textContent = e.target.value + '%'; };
	glassOpacity.onchange = e => vscode.postMessage({ type: 'glassOpacity', value: Number(e.target.value) });
	document.getElementById('bgEffect').onchange = e => vscode.postMessage({ type: 'bgEffect', value: e.target.value });
	const bindSlider = (id, valId, msg) => {
		const el = document.getElementById(id);
		el.oninput = e => { document.getElementById(valId).textContent = (msg === 'bgSpeed' ? '' : e.target.value + '%'); };
		el.onchange = e => vscode.postMessage({ type: msg, value: Number(e.target.value) });
	};
	bindSlider('bgOpacity', 'bgOpacityVal', 'bgOpacity');
	bindSlider('bgSpeed', 'bgSpeedVal', 'bgSpeed');
	bindSlider('bgAlpha', 'bgAlphaVal', 'bgAlpha');
	bindSlider('volume', 'volumeVal', 'volume');
	document.getElementById('bgImage').onchange = e => vscode.postMessage({ type: 'bgImage', value: e.target.value.trim() });
	document.getElementById('pickImage').onclick = () => vscode.postMessage({ type: 'pickImage' });
	document.getElementById('clearImage').onclick = () => { document.getElementById('bgImage').value = ''; vscode.postMessage({ type: 'bgImage', value: '' }); };
	document.getElementById('soundPack').onchange = e => vscode.postMessage({ type: 'soundPack', value: e.target.value });
	document.getElementById('visualEffect').onchange = e => vscode.postMessage({ type: 'visualEffect', value: e.target.value });
	document.getElementById('testSound').onclick = () => vscode.postMessage({ type: 'testSound' });
	document.getElementById('exportProfile').onclick = () => vscode.postMessage({ type: 'exportProfile' });
	document.getElementById('importProfile').onclick = () => vscode.postMessage({ type: 'importProfile' });
<\/script>
</body>
</html>`;
}

function pickProfileFileUri(save, defaultName) {
	const filters = { 'Red Rain Profile': ['json'] };
	return save
		? vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultName || 'red-rain-profile.json'), filters })
		: vscode.window.showOpenDialog({ canSelectMany: false, filters });
}

async function exportProfile() {
	const uri = await pickProfileFileUri(true, 'red-rain-profile.json');
	if (!uri) { return; }
	const profile = {
		kind: 'red-rain-profile',
		version: 1,
		settings: {
			accent: rrValue('accent', '#3bf58c'),
			'background.effect': rrValue('background.effect', 'none'),
			'background.image': rrValue('background.image', ''),
			'background.opacity': rrValue('background.opacity', 45),
			'background.speed': rrValue('background.speed', 5),
			'typing.soundPack': rrValue('typing.soundPack', 'rain'),
			'typing.volume': rrValue('typing.volume', 60),
			'typing.visualEffect': rrValue('typing.visualEffect', 'rain')
		},
		workbench: {
			modernUIFrostedGlass: vscode.workspace.getConfiguration('workbench').get('modernUIFrostedGlass', true),
			modernUIFrostedGlassOpacity: vscode.workspace.getConfiguration('workbench').get('modernUIFrostedGlassOpacity', 90),
			colorCustomizations: (vscode.workspace.getConfiguration('workbench').get('colorCustomizations') || {})
		}
	};
	await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(profile, null, 4), 'utf8'));
	vscode.window.showInformationMessage('Red Rain: profile exported to ' + uri.fsPath);
}

async function importProfile() {
	const uris = await pickProfileFileUri(false);
	if (!uris || !uris[0]) { return; }
	try {
		const raw = await vscode.workspace.fs.readFile(uris[0]);
		const profile = JSON.parse(Buffer.from(raw).toString('utf8'));
		if (profile.kind !== 'red-rain-profile') {
			vscode.window.showErrorMessage('Red Rain: not a valid profile file.');
			return;
		}
		const s = profile.settings || {};
		await update('accent', s.accent);
		await update('background.effect', s['background.effect']);
		await update('background.image', s['background.image']);
		await update('background.opacity', s['background.opacity']);
		await update('background.speed', s['background.speed']);
		await update('typing.soundPack', s['typing.soundPack']);
		await update('typing.volume', s['typing.volume']);
		await update('typing.visualEffect', s['typing.visualEffect']);
		if (profile.workbench) {
			const wb = vscode.workspace.getConfiguration('workbench');
			await wb.update('modernUIFrostedGlass', profile.workbench.modernUIFrostedGlass, vscode.ConfigurationTarget.Global);
			await wb.update('modernUIFrostedGlassOpacity', profile.workbench.modernUIFrostedGlassOpacity, vscode.ConfigurationTarget.Global);
			if (profile.workbench.colorCustomizations !== undefined) {
				await wb.update('colorCustomizations', profile.workbench.colorCustomizations, vscode.ConfigurationTarget.Global);
			}
		}
		vscode.window.showInformationMessage('Red Rain: profile imported.');
	} catch (e) {
		vscode.window.showErrorMessage('Red Rain: import failed — ' + e.message);
	}
}

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('redrain.customizer.open', async () => {
		const panel = vscode.window.createWebviewPanel(
			'redrainCustomizer',
			'Customization Center',
			vscode.ViewColumn.Active,
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
		panel.webview.onDidReceiveMessage(async (msg) => {
			switch (msg.type) {
				case 'accent':
					await update('accent', msg.value);
					break;
				case 'glass':
					await vscode.workspace.getConfiguration('workbench').update('modernUIFrostedGlass', !!msg.value, vscode.ConfigurationTarget.Global);
					break;
				case 'glassOpacity':
					await vscode.workspace.getConfiguration('workbench').update('modernUIFrostedGlassOpacity', msg.value, vscode.ConfigurationTarget.Global);
					break;
				case 'bgEffect':
					await update('background.effect', msg.value);
					break;
				case 'bgOpacity':
					await update('background.opacity', msg.value);
					break;
				case 'bgSpeed':
					await update('background.speed', msg.value);
					break;
				case 'bgAlpha': {
					const alpha = msg.value;
					if (alpha >= 100) {
						await updateColorCustomization('editor.background', undefined);
					} else {
						await updateColorCustomization('editor.background', withAlpha(EDITOR_BG_BASE, alpha));
					}
					break;
				}
				case 'bgImage':
					await update('background.image', msg.value);
					break;
				case 'pickImage': {
					const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Images': ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] } });
					if (uris && uris[0]) {
						await update('background.image', uris[0].fsPath);
						panel.webview.postMessage({ type: 'bgImage', value: uris[0].fsPath });
					}
					break;
				}
				case 'soundPack':
					await update('typing.soundPack', msg.value);
					break;
				case 'visualEffect':
					await update('typing.visualEffect', msg.value);
					break;
				case 'volume':
					await update('typing.volume', msg.value);
					break;
				case 'testSound':
					await vscode.commands.executeCommand('redrain.toggleTypingSound').then(async () => {
						await vscode.commands.executeCommand('redrain.toggleTypingSound');
					});
					vscode.window.showInformationMessage('Red Rain: type anywhere to hear the pack.');
					break;
				case 'exportProfile':
					await exportProfile();
					break;
				case 'importProfile':
					await importProfile();
					break;
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('redrain.customizer.exportProfile', exportProfile));
	context.subscriptions.push(vscode.commands.registerCommand('redrain.customizer.importProfile', importProfile));
}

function deactivate() { }

module.exports = { activate, deactivate };
