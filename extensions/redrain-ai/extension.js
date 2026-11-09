/*---------------------------------------------------------------------------------------------
 *  Red Rain AI Workstation — built-in extension.
 *  Providers: OpenAI, Anthropic Claude, Google Gemini, Ollama (local),
 *  and any OpenAI-compatible endpoint (DeepSeek, Groq, LM Studio, ...).
 *  API keys are stored in VS Code SecretStorage, never in plain settings.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const vscode = require('vscode');

const PROVIDERS = {
        openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keySecret: 'openai', style: 'openai', defaultModel: 'gpt-4o-mini', needsKey: true },
        anthropic: { name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com', keySecret: 'anthropic', style: 'anthropic', defaultModel: 'claude-sonnet-4-5', needsKey: true },
        gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keySecret: 'gemini', style: 'gemini', defaultModel: 'gemini-2.5-flash', needsKey: true },
        ollama: { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', keySecret: null, style: 'openai', defaultModel: 'llama3.1', needsKey: false },
        custom: { name: 'Custom OpenAI-compatible', baseUrl: '', keySecret: 'custom', style: 'openai', defaultModel: 'deepseek-chat', needsKey: false }
};

const MODEL_SUGGESTIONS = {
        openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
        anthropic: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'],
        gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        ollama: ['llama3.1', 'qwen2.5-coder', 'deepseek-coder-v2', 'mistral'],
        custom: ['deepseek-chat', 'deepseek-reasoner', 'grok-3-mini', 'glm-4.6']
};

let context = undefined;
let _view = undefined;
let _history = [];            // [{role, content}]
let _pendingPrompt = undefined;
let _abort = undefined;
let _streaming = false;

//#region helpers

function cfg(key, fallback) {
        const v = vscode.workspace.getConfiguration('redrain.ai').get(key);
        return v === undefined ? fallback : v;
}

function providerInfo() {
        const id = cfg('provider', 'openai');
        return Object.assign({ id }, PROVIDERS[id] || PROVIDERS.openai);
}

function baseUrlOf(p) {
        const custom = String(cfg('baseUrl', '') || '').trim();
        if (custom && (p.id === 'custom' || p.id === 'ollama' || p.id === 'openai')) {
                return custom.replace(/\/+$/, '');
        }
        return p.baseUrl.replace(/\/+$/, '');
}

async function apiKeyOf(p) {
        if (!p.keySecret) {
                return '';
        }
        return await context.secrets.get('redrain.ai.key.' + p.keySecret) || '';
}

function truncate(s, n) {
        if (s.length <= n) {
                return s;
        }
        return s.slice(0, n) + `\n… [truncated ${s.length - n} chars]`;
}

function currentFileContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file' && editor.document.uri.scheme !== 'untitled') {
                return '';
        }
        const doc = editor.document;
        const sel = editor.selection;
        let content = doc.getText();
        let note = 'full file';
        if (!sel.isEmpty) {
                content = doc.getText(sel);
                note = 'selection';
        }
        return `\n\n[Attached context — ${note} of ${vscode.workspace.asRelativePath(doc.uri)} (language: ${doc.languageId})]\n\`\`\`${doc.languageId}\n${truncate(content, 8000)}\n\`\`\``;
}

function systemPrompt() {
        return String(cfg('systemPrompt', 'You are a helpful coding assistant.') || '');
}

//#endregion

//#region provider streaming

/**
 * Streams a chat completion. Calls onDelta(text) as tokens arrive.
 * Returns the full text.
 */
async function streamChat(userText, onDelta, includeContext) {
        const p = providerInfo();
        const base = baseUrlOf(p);
        const model = String(cfg('model', p.defaultModel) || p.defaultModel);
        const temperature = Number(cfg('temperature', 0.4));
        const maxTokens = Number(cfg('maxTokens', 2048));
        const key = await apiKeyOf(p);
        if (p.needsKey && !key) {
                throw new Error(`No API key set for ${p.name}. Open the ⚙ Settings in the AI Workstation and paste your key (stored securely).`);
        }

        const attached = includeContext && cfg('sendFileContext', true) ? currentFileContext() : '';
        const fullUser = userText + attached;

        const messages = _history.slice();
        messages.push({ role: 'user', content: fullUser });

        _abort = new AbortController();
        const signal = _abort.signal;

        let res;
        if (p.style === 'anthropic') {
                res = await fetch(`${base}/v1/messages`, {
                        method: 'POST',
                        signal,
                        headers: {
                                'content-type': 'application/json',
                                'x-api-key': key,
                                'anthropic-version': '2023-06-01'
                        },
                        body: JSON.stringify({
                                model, max_tokens: maxTokens, temperature, stream: true,
                                system: systemPrompt(),
                                messages: messages.map(m => ({ role: m.role, content: m.content }))
                        })
                });
        } else if (p.style === 'gemini') {
                res = await fetch(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
                        method: 'POST',
                        signal,
                        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
                        body: JSON.stringify({
                                systemInstruction: { parts: [{ text: systemPrompt() }] },
                                contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
                                generationConfig: { temperature, maxOutputTokens: maxTokens }
                        })
                });
        } else { // openai-compatible
                const payload = {
                        model, stream: true, temperature, max_tokens: maxTokens,
                        messages: [{ role: 'system', content: systemPrompt() }, ...messages]
                };
                const headers = { 'content-type': 'application/json' };
                if (key) {
                        headers['authorization'] = `Bearer ${key}`;
                }
                res = await fetch(`${base}/chat/completions`, { method: 'POST', signal, headers, body: JSON.stringify(payload) });
        }

        if (!res.ok) {
                let detail = '';
                try {
                        detail = (await res.text()).slice(0, 500);
                } catch { }
                throw new Error(`${p.name} error ${res.status}: ${detail || res.statusText}`);
        }

        let full = '';
        let buffer = '';
        const decoder = new TextDecoder();
        const reader = res.body.getReader();

        while (true) {
                const { value, done } = await reader.read();
                if (done) {
                        break;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const raw of lines) {
                        const line = raw.trim();
                        if (!line.startsWith('data:')) {
                                continue;
                        }
                        const data = line.slice(5).trim();
                        if (!data || data === '[DONE]') {
                                continue;
                        }
                        let json;
                        try {
                                json = JSON.parse(data);
                        } catch {
                                continue;
                        }
                        let delta = '';
                        if (p.style === 'anthropic') {
                                if (json.type === 'content_block_delta' && json.delta && typeof json.delta.text === 'string') {
                                        delta = json.delta.text;
                                }
                        } else if (p.style === 'gemini') {
                                const parts = json.candidates?.[0]?.content?.parts;
                                if (Array.isArray(parts)) {
                                        delta = parts.map(x => x.text || '').join('');
                                }
                        } else {
                                delta = json.choices?.[0]?.delta?.content || '';
                        }
                        if (delta) {
                                full += delta;
                                onDelta(delta);
                        }
                }
        }
        _abort = undefined;
        return full;
}

//#endregion

//#region webview

function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
        // minimal markdown: fenced code blocks + inline code + bold + line breaks
        const parts = [];
        const segments = String(text).split(/```/);
        for (let i = 0; i < segments.length; i++) {
                if (i % 2 === 1) {
                        const nl = segments[i].indexOf('\n');
                        const lang = nl > -1 ? segments[i].slice(0, nl).trim() : '';
                        const code = nl > -1 ? segments[i].slice(nl + 1) : segments[i];
                        parts.push(`<div class="codeblock" data-code="${escapeHtml(code)}"><div class="codehead"><span>${escapeHtml(lang || 'code')}</span><span class="codeactions"><button class="cbtn" data-act="insert">Insert</button><button class="cbtn" data-act="newfile">New file</button><button class="cbtn" data-act="copy">Copy</button></span></div><pre>${escapeHtml(code.replace(/\n$/, ''))}</pre></div>`);
                } else {
                        let t = escapeHtml(segments[i]);
                        t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
                        t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
                        parts.push(`<div class="mdtext">${t}</div>`);
                }
        }
        return parts.join('');
}

function getChatHtml(webview) {
        const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
        const p = providerInfo();
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
:root { --accent: #3bf58c; --glass: rgba(14,20,16,0.6); --stroke: rgba(255,255,255,0.09); --text: #d8e6dc; --muted: #86988b; }
* { box-sizing: border-box; }
body { margin:0; font-family:"Segoe UI",-apple-system,sans-serif; color:var(--text); background:transparent; display:flex; flex-direction:column; height:100vh; }
header { padding:10px 12px; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--stroke); background:var(--glass); }
header .brand { font-size:12.5px; font-weight:600; color:var(--accent); flex:1; }
.hbtn { background:rgba(255,255,255,0.05); color:var(--text); border:1px solid var(--stroke); border-radius:8px; padding:5px 10px; font-size:11.5px; cursor:pointer; }
.hbtn:hover { border-color:var(--accent); }
#messages { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
.msg { border-radius:11px; padding:9px 12px; font-size:12.5px; line-height:1.55; border:1px solid var(--stroke); background:var(--glass); max-width:100%; word-wrap:break-word; overflow-wrap:anywhere; }
.msg.user { border-color: rgba(59,245,140,0.35); background: rgba(59,245,140,0.07); }
.msg.error { border-color: rgba(255,80,95,0.5); background: rgba(255,80,95,0.08); color:#ffb9c0; }
.msg .who { font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
code { background:rgba(0,0,0,0.4); border-radius:4px; padding:1px 5px; font-family:Consolas,monospace; font-size:11.5px; }
.codeblock { background:rgba(0,0,0,0.45); border:1px solid var(--stroke); border-radius:9px; margin:8px 0; overflow:hidden; }
.codehead { display:flex; justify-content:space-between; align-items:center; padding:5px 9px; font-size:10.5px; color:var(--muted); background:rgba(255,255,255,0.03); }
.codeactions { display:flex; gap:6px; }
.cbtn { background:transparent; color:var(--accent); border:1px solid var(--stroke); border-radius:6px; font-size:10px; padding:2px 7px; cursor:pointer; }
.cbtn:hover { border-color:var(--accent); }
pre { margin:0; padding:9px; overflow-x:auto; font-family:Consolas,monospace; font-size:11.5px; color:#c9ead4; }
#composer { padding:10px; border-top:1px solid var(--stroke); background:var(--glass); }
#ctx { font-size:10.5px; color:var(--muted); margin-bottom:6px; min-height:13px; }
textarea { width:100%; background:rgba(0,0,0,0.4); color:var(--text); border:1px solid var(--stroke); border-radius:10px; padding:9px; font-size:12.5px; font-family:inherit; resize:none; outline:none; min-height:64px; }
textarea:focus { border-color:var(--accent); }
.row2 { display:flex; gap:8px; margin-top:8px; }
.send { flex:1; background:var(--accent); color:#04170b; border:none; border-radius:10px; padding:9px; font-weight:600; font-size:12.5px; cursor:pointer; }
.send:disabled { opacity:0.45; cursor:default; }
.stop { background:rgba(255,80,95,0.15); color:#ff9aa4; border:1px solid rgba(255,80,95,0.4); border-radius:10px; padding:9px 14px; font-size:12.5px; cursor:pointer; display:none; }
#settings { display:none; padding:12px; overflow-y:auto; border-bottom:1px solid var(--stroke); background:var(--glass); }
#settings.open { display:block; }
#settings label { display:block; font-size:10.5px; color:var(--muted); margin:9px 0 4px; text-transform:uppercase; letter-spacing:0.08em; }
#settings input, #settings select { width:100%; background:rgba(0,0,0,0.4); color:var(--text); border:1px solid var(--stroke); border-radius:8px; padding:7px 9px; font-size:12px; outline:none; }
#settings input:focus, #settings select:focus { border-color:var(--accent); }
.srow { display:flex; gap:8px; margin-top:12px; }
.hintline { font-size:10px; color:var(--muted); margin-top:8px; line-height:1.5; }
.typing { color:var(--muted); font-size:11px; padding:2px 4px; display:none; }
</style>
</head>
<body>
<header>
        <span class="brand">⚡ Red Rain AI Workstation</span>
        <button class="hbtn" id="newChat">New chat</button>
        <button class="hbtn" id="toggleSettings">⚙</button>
</header>
<div id="settings">
        <label>Provider</label>
        <select id="sProvider">
                ${Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}"${id === p.id || id === (cfg('provider', 'openai')) ? ' selected' : ''}>${p.name}</option>`).join('')}
        </select>
        <label>API key (stored securely)</label>
        <input type="password" id="sKey" placeholder="paste key — leave empty to keep current">
        <label>Model</label>
        <input type="text" id="sModel" list="modelList" value="${escapeHtml(String(cfg('model', p.defaultModel)))}">
        <datalist id="modelList">${(MODEL_SUGGESTIONS[cfg('provider', 'openai')] || []).map(m => `<option value="${m}">`).join('')}</datalist>
        <label>Base URL override (optional)</label>
        <input type="text" id="sBase" value="${escapeHtml(String(cfg('baseUrl', '')))}" placeholder="https://... /v1">
        <label>Temperature: <span id="tval">${cfg('temperature', 0.4)}</span></label>
        <input type="range" id="sTemp" min="0" max="2" step="0.05" value="${cfg('temperature', 0.4)}">
        <label>Max output tokens</label>
        <input type="number" id="sMax" value="${cfg('maxTokens', 2048)}" min="128">
        <label>System prompt</label>
        <textarea id="sSys" style="min-height:70px">${escapeHtml(String(cfg('systemPrompt', '')))}</textarea>
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0"><input type="checkbox" id="sCtx" ${cfg('sendFileContext', true) ? 'checked' : ''}> Send active file as context</label>
        <div class="srow">
                <button class="hbtn" id="saveSettings">Save</button>
                <button class="hbtn" id="testConn">Test connection</button>
        </div>
        <div class="hintline">Keys live in the OS keychain via SecretStorage. Local Ollama needs no key. "Custom" accepts any OpenAI-compatible URL (DeepSeek, Groq, LM Studio…).</div>
</div>
<div id="messages"></div>
<div id="composer">
        <div id="ctx"></div>
        <div class="typing" id="typing">thinking…</div>
        <textarea id="input" placeholder="Ask about your code… (Enter to send, Shift+Enter for newline)"></textarea>
        <div class="row2">
                <button class="send" id="send">Send</button>
                <button class="stop" id="stop">■ Stop</button>
        </div>
</div>
<script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const messages = document.getElementById('messages');
        const input = document.getElementById('input');
        const typing = document.getElementById('typing');

        function addMsg(cls, who, html) {
                const el = document.createElement('div');
                el.className = 'msg ' + cls;
                el.innerHTML = '<div class="who">' + who + '</div>' + (html || '');
                messages.appendChild(el);
                messages.scrollTop = messages.scrollHeight;
                return el;
        }

        function handleCodeClick(act, code) {
                vscode.postMessage({ type: act === 'insert' ? 'insertCode' : (act === 'newfile' ? 'newFile' : 'copyCode'), code });
        }

        messages.addEventListener('click', e => {
                const btn = e.target.closest('.cbtn');
                if (btn) {
                        const block = btn.closest('.codeblock');
                        handleCodeClick(btn.dataset.act, block ? block.dataset.code : '');
                        return;
                }
        });

        window.addEventListener('message', ev => {
                const m = ev.data;
                if (m.type === 'userMsg') {
                        addMsg('user', 'you', renderMarkdown(m.text));
                } else if (m.type === 'delta') {
                        let el = messages.querySelector('.msg.streaming');
                        if (!el) {
                                el = addMsg('streaming', 'ai', '');
                        }
                        const holder = document.createElement('div');
                        holder.innerHTML = renderMarkdown(m.accText);
                        el.innerHTML = '<div class="who">ai</div>' + holder.innerHTML;
                        messages.scrollTop = messages.scrollHeight;
                } else if (m.type === 'done') {
                        const el = messages.querySelector('.msg.streaming');
                        if (el) { el.classList.remove('streaming'); }
                        typing.style.display = 'none';
                        document.getElementById('send').disabled = false;
                        document.getElementById('stop').style.display = 'none';
                } else if (m.type === 'error') {
                        const el = messages.querySelector('.msg.streaming');
                        if (el) { el.remove(); }
                        addMsg('error', 'error', escapeHtml(m.text));
                        typing.style.display = 'none';
                        document.getElementById('send').disabled = false;
                        document.getElementById('stop').style.display = 'none';
                } else if (m.type === 'ctx') {
                        document.getElementById('ctx').textContent = m.text;
                } else if (m.type === 'clear') {
                        messages.innerHTML = '';
                        const el = messages.querySelector('.msg.streaming');
                        if (el) { el.remove(); }
                        typing.style.display = 'none';
                        document.getElementById('send').disabled = false;
                        document.getElementById('stop').style.display = 'none';
                } else if (m.type === 'settingsSaved') {
                        document.getElementById('settings').classList.remove('open');
                } else if (m.type === 'loadSettings') {
                        document.getElementById('settings').classList.add('open');
                }
        });

        const send = () => {
                const text = input.value.trim();
                if (!text) { return; }
                input.value = '';
                vscode.postMessage({ type: 'chat', text });
        };
        document.getElementById('send').onclick = send;
        document.getElementById('stop').onclick = () => vscode.postMessage({ type: 'stop' });
        document.getElementById('newChat').onclick = () => vscode.postMessage({ type: 'newChat' });
        document.getElementById('toggleSettings').onclick = () => vscode.postMessage({ type: 'openSettings' });
        document.getElementById('saveSettings').onclick = () => {
                vscode.postMessage({
                        type: 'saveSettings',
                        provider: document.getElementById('sProvider').value,
                        key: document.getElementById('sKey').value,
                        model: document.getElementById('sModel').value.trim(),
                        baseUrl: document.getElementById('sBase').value.trim(),
                        temperature: Number(document.getElementById('sTemp').value),
                        maxTokens: Number(document.getElementById('sMax').value) || 2048,
                        systemPrompt: document.getElementById('sSys').value,
                        sendFileContext: document.getElementById('sCtx').checked
                });
        };
        document.getElementById('testConn').onclick = () => vscode.postMessage({ type: 'testConnection' });
        document.getElementById('sProvider').onchange = () => vscode.postMessage({ type: 'providerChanged', value: document.getElementById('sProvider').value });
        document.getElementById('sTemp').oninput = e => { document.getElementById('tval').textContent = e.target.value; };
        input.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                }
        });
        vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

//#endregion

//#region chat pipeline

async function runChat(userText) {
        if (_streaming) {
                return;
        }
        _streaming = true;
        let acc = '';
        let lastPaint = 0;
        post({ type: 'userMsg', text: userText });
        post({ type: 'delta', accText: '' });
        try {
                await streamChat(userText, (delta) => {
                        acc += delta;
                        const now = Date.now();
                        if (now - lastPaint > 70) {
                                lastPaint = now;
                                post({ type: 'delta', accText: acc });
                        }
                }, true);
                _history.push({ role: 'user', content: userText });
                _history.push({ role: 'assistant', content: acc });
                if (_history.length > 24) {
                        _history = _history.slice(-24);
                }
                post({ type: 'delta', accText: acc });
                post({ type: 'done' });
        } catch (e) {
                if (String(e.name) === 'AbortError' || String(e.message).includes('abort')) {
                        post({ type: 'done' });
                } else {
                        post({ type: 'error', text: e.message || String(e) });
                }
        } finally {
                _streaming = false;
        }
}

function post(msg) {
        if (_view) {
                _view.webview.postMessage(msg);
        }
}

//#endregion

function activate(ctx) {
        context = ctx;

        ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('redrainAI.chat', {
                resolveWebviewView(webviewView) {
                        _view = webviewView;
                        webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
                        webviewView.webview.html = getChatHtml(webviewView.webview);
                        webviewView.onDidDispose(() => { if (_view === webviewView) { _view = undefined; } });

                        webviewView.webview.onDidReceiveMessage(async (m) => {
                                switch (m.type) {
                                        case 'ready':
                                                post({ type: 'ctx', text: cfg('provider', 'openai') + ' · ' + cfg('model', '') + (_history.length ? ' · ' + _history.filter(h => h.role === 'user').length + ' turns' : '') });
                                                if (_pendingPrompt) {
                                                        const p = _pendingPrompt;
                                                        _pendingPrompt = undefined;
                                                        await runChat(p);
                                                }
                                                break;
                                        case 'chat':
                                                await runChat(m.text);
                                                break;
                                        case 'stop':
                                                if (_abort) {
                                                        try { _abort.abort(); } catch { }
                                                }
                                                break;
                                        case 'newChat':
                                                _history = [];
                                                _view && _view.webview.postMessage({ type: 'clear' });
                                                break;
                                        case 'openSettings':
                                                post({ type: 'loadSettings' });
                                                break;
                                        case 'providerChanged': {
                                                const p = PROVIDERS[m.value];
                                                if (p) {
                                                        post({ type: 'loadSettings' });
                                                        const wv = _view && _view.webview;
                                                        if (wv) {
                                                                wv.postMessage({ type: 'ctx', text: m.value + ' · ' + String(cfg('model', p.defaultModel)) });
                                                        }
                                                }
                                                break;
                                        }
                                        case 'saveSettings': {
                                                try {
                                                        const c = vscode.workspace.getConfiguration('redrain.ai');
                                                        await c.update('provider', m.provider, vscode.ConfigurationTarget.Global);
                                                        await c.update('model', m.model, vscode.ConfigurationTarget.Global);
                                                        await c.update('baseUrl', m.baseUrl, vscode.ConfigurationTarget.Global);
                                                        await c.update('temperature', m.temperature, vscode.ConfigurationTarget.Global);
                                                        await c.update('maxTokens', m.maxTokens, vscode.ConfigurationTarget.Global);
                                                        await c.update('systemPrompt', m.systemPrompt, vscode.ConfigurationTarget.Global);
                                                        await c.update('sendFileContext', m.sendFileContext, vscode.ConfigurationTarget.Global);
                                                        if (m.key) {
                                                                const p = PROVIDERS[m.provider];
                                                                if (p && p.keySecret) {
                                                                        await context.secrets.store('redrain.ai.key.' + p.keySecret, m.key);
                                                                }
                                                        }
                                                        post({ type: 'settingsSaved' });
                                                        post({ type: 'ctx', text: m.provider + ' · ' + m.model });
                                                } catch (e) {
                                                        post({ type: 'error', text: 'Save failed: ' + e.message });
                                                }
                                                break;
                                        }
                                        case 'testConnection':
                                                try {
                                                        let acc = '';
                                                        await streamChat('Reply with exactly: ok', d => { acc += d; }, false);
                                                        post({ type: 'ctx', text: 'connection ok — model replied: ' + acc.slice(0, 60) });
                                                } catch (e) {
                                                        post({ type: 'error', text: e.message || String(e) });
                                                }
                                                break;
                                        case 'insertCode': {
                                                const editor = vscode.window.activeTextEditor;
                                                if (editor) {
                                                        await editor.edit(b => b.replace(editor.selection, m.code));
                                                } else {
                                                        vscode.window.showInformationMessage('Red Rain AI: open a file first.');
                                                }
                                                break;
                                        }
                                        case 'newFile': {
                                                const doc = await vscode.workspace.openTextDocument({ content: m.code });
                                                await vscode.window.showTextDocument(doc);
                                                break;
                                        }
                                        case 'copyCode':
                                                await vscode.env.clipboard.writeText(m.code);
                                                vscode.window.showInformationMessage('Red Rain AI: code copied.');
                                                break;
                                }
                        });
                }
        }, { webviewOptions: { retainContextWhenHidden: true } }));

        ctx.subscriptions.push(vscode.commands.registerCommand('redrain.ai.focus', async () => {
                await vscode.commands.executeCommand('redrainAI.chat.focus');
        }));

        const quickAction = (kind) => async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.selection.isEmpty) {
                        vscode.window.showInformationMessage('Red Rain AI: select some code first.');
                        return;
                }
                const prompts = {
                        explain: 'Explain the following code concisely, then list any issues you notice.',
                        refactor: 'Refactor the following code for clarity and quality. Output the complete refactored code in one fenced code block, then a short bullet list of what changed.',
                        comments: 'Add helpful comments to the following code. Output the complete commented code in one fenced code block only.',
                        tests: 'Write unit tests for the following code. Output complete test code in one fenced code block.'
                };
                await vscode.commands.executeCommand('redrainAI.chat.focus');
                const prompt = prompts[kind];
                _pendingPrompt = prompt;
                if (_view) {
                        await runChat(prompt);
                        _pendingPrompt = undefined;
                }
        };

        ctx.subscriptions.push(vscode.commands.registerCommand('redrain.ai.explain', quickAction('explain')));
        ctx.subscriptions.push(vscode.commands.registerCommand('redrain.ai.refactor', quickAction('refactor')));
        ctx.subscriptions.push(vscode.commands.registerCommand('redrain.ai.comments', quickAction('comments')));
        ctx.subscriptions.push(vscode.commands.registerCommand('redrain.ai.tests', quickAction('tests')));
}

function deactivate() {
        if (_abort) {
                try { _abort.abort(); } catch { }
        }
}

module.exports = { activate, deactivate };
