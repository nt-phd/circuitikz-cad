import type { CircuiTikZEmitter } from '../codegen/CircuiTikZEmitter';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { EventBus } from '../utils/events';

const RENDER_SERVER = 'http://127.0.0.1:3737/render';
const DEBOUNCE_MS = 800;

export class CodePanel {
  private codeElement: HTMLPreElement;
  private previewEl: HTMLDivElement;
  private statusEl: HTMLSpanElement;
  private activeTab: 'code' | 'preview' = 'code';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private serverAvailable: boolean | null = null;

  constructor(
    parent: HTMLElement,
    private emitter: CircuiTikZEmitter,
    private doc: CircuitDocument,
    private eventBus: EventBus,
  ) {
    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'code-tabbar';

    const codeTab = this.makeTab('LaTeX', 'code');
    const previewTab = this.makeTab('Preview LaTeX', 'preview');
    tabBar.appendChild(codeTab);
    tabBar.appendChild(previewTab);

    // Status indicator (shown in tab bar)
    this.statusEl = document.createElement('span');
    this.statusEl.className = 'render-status';
    tabBar.appendChild(this.statusEl);

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copia';
    copyBtn.addEventListener('click', () => this.onCopy());
    tabBar.appendChild(copyBtn);

    parent.appendChild(tabBar);

    // Code pane
    this.codeElement = document.createElement('pre');
    this.codeElement.className = 'code-pane active';
    parent.appendChild(this.codeElement);

    // Preview pane
    this.previewEl = document.createElement('div');
    this.previewEl.className = 'code-pane preview-pane';
    parent.appendChild(this.previewEl);

    this.eventBus.on('document-changed', () => this.onDocChanged());
    this.updateCode();
    this.checkServer();
  }

  private makeTab(label: string, id: 'code' | 'preview'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'code-tab' + (id === this.activeTab ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => this.switchTab(id));
    return btn;
  }

  private switchTab(tab: 'code' | 'preview'): void {
    this.activeTab = tab;
    const tabBar = this.codeElement.parentElement?.querySelector('.code-tabbar');
    tabBar?.querySelectorAll('.code-tab').forEach((btn, i) => {
      btn.classList.toggle('active', (i === 0 && tab === 'code') || (i === 1 && tab === 'preview'));
    });
    this.codeElement.classList.toggle('active', tab === 'code');
    this.previewEl.classList.toggle('active', tab === 'preview');
    if (tab === 'preview' && this.serverAvailable) this.triggerRender();
  }

  private onDocChanged(): void {
    this.updateCode();
    if (this.activeTab === 'preview' && this.serverAvailable) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.triggerRender(), DEBOUNCE_MS);
    }
  }

  private updateCode(): void {
    this.codeElement.textContent = this.emitter.emit(this.doc);
  }

  private async checkServer(): Promise<void> {
    try {
      const res = await fetch('http://127.0.0.1:3737/health', { signal: AbortSignal.timeout(2000) });
      this.serverAvailable = res.ok;
    } catch {
      this.serverAvailable = false;
    }
    this.updateStatus(this.serverAvailable ? 'online' : 'offline');
  }

  private async triggerRender(): Promise<void> {
    const latex = this.codeElement.textContent || '';
    if (!latex.trim()) { this.previewEl.innerHTML = '<p class="render-hint">Nessun contenuto.</p>'; return; }

    this.updateStatus('rendering');
    try {
      const res = await fetch(RENDER_SERVER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (data.svg) {
        this.previewEl.innerHTML = data.svg;
        // Make SVG fit the pane
        const svg = this.previewEl.querySelector('svg');
        if (svg) { svg.style.maxWidth = '100%'; svg.style.height = 'auto'; }
        this.updateStatus('online');
      } else {
        this.previewEl.innerHTML = `<pre class="render-error">${escapeHtml(data.error ?? 'Unknown error')}</pre>`;
        this.updateStatus('error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.previewEl.innerHTML = `<pre class="render-error">Server non raggiungibile:\n${escapeHtml(msg)}</pre>`;
      this.serverAvailable = false;
      this.updateStatus('offline');
    }
  }

  private updateStatus(state: 'online' | 'offline' | 'rendering' | 'error'): void {
    const labels: Record<string, string> = {
      online: '● online', offline: '○ offline', rendering: '⟳ rendering…', error: '✕ errore',
    };
    const colors: Record<string, string> = {
      online: '#4caf50', offline: '#aaa', rendering: '#ff9800', error: '#f44336',
    };
    this.statusEl.textContent = labels[state];
    this.statusEl.style.color = colors[state];
    if (state === 'offline') {
      this.previewEl.innerHTML = `<p class="render-hint">
        Server LaTeX non attivo.<br>
        Avvia con: <code>node render-server/server.mjs</code>
      </p>`;
    }
  }

  private onCopy(): void {
    const text = this.codeElement.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = this.codeElement.parentElement?.querySelector('.copy-btn') as HTMLButtonElement;
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copiato!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
