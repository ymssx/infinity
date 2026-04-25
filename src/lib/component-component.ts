"use client";

/**
 * Build the <inf-component> Web Component script to inject into iframes.
 *
 * Rendering: simple innerHTML full replacement on each rAF.
 * On done: final innerHTML with complete HTML triggers nested WC connectedCallback once.
 */
export function buildComponentScript(): string {
  return `
(function() {
  if (customElements.get('inf-component')) return;

  var _compId = 0;

  // Global registry
  window.__infComp = window.__infComp || { _cbs: {}, _active: 0 };
  window.__infComp.token = function(id, tk) {
    var cb = window.__infComp._cbs[id];
    if (cb) cb.onToken(tk);
  };
  window.__infComp.done = function(id, html) {
    var cb = window.__infComp._cbs[id];
    if (cb) {
      cb.onDone(html);
      delete window.__infComp._cbs[id];
      window.__infComp._active = Math.max(0, window.__infComp._active - 1);
      window.parent.postMessage({ type: 'inf-comp-finished', remaining: window.__infComp._active }, '*');
    }
  };
  window.__infComp.error = function(id) {
    var cb = window.__infComp._cbs[id];
    if (cb) {
      cb.onError();
      delete window.__infComp._cbs[id];
      window.__infComp._active = Math.max(0, window.__infComp._active - 1);
      window.parent.postMessage({ type: 'inf-comp-finished', remaining: window.__infComp._active }, '*');
    }
  };

  class InfComponent extends HTMLElement {
    connectedCallback() {
      var self = this;
      this._id = 'inf-comp-' + (++_compId);
      this._query = this.getAttribute('query') || '';
      this._compStyle = this.getAttribute('comp-style') || '';
      var aspect = this.getAttribute('aspect') || '';

      if (!this._query) return;

      this.style.display = 'block';
      this.style.width = this.style.width || '100%';
      this.style.minWidth = '0';
      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.style.minHeight = this.style.minHeight || '120px';
      if (aspect) this.style.aspectRatio = aspect;

      // Loading shimmer
      this.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:linear-gradient(135deg,rgba(99,102,241,0.05),rgba(168,85,247,0.05));border-radius:0.75rem;border:1px dashed rgba(99,102,241,0.2);padding:16px;">'
        + '<div style="width:24px;height:24px;border:2px solid rgba(99,102,241,0.2);border-top-color:rgba(99,102,241,0.6);border-radius:50%;animation:inf-comp-spin 0.8s linear infinite;"></div>'
        + '<div style="font-size:11px;color:rgba(99,102,241,0.5);max-width:90%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Generating: ' + this._query.slice(0, 60) + '</div>'
        + '</div>'
        + '<style>@keyframes inf-comp-spin{to{transform:rotate(360deg)}}</style>';

      var buffer = '';
      var started = false;
      var contentEl = null;
      var rafId = null;

      function scheduleRender() {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(function() {
          rafId = null;
          if (!contentEl) return;
          contentEl.innerHTML = buffer;
        });
      }

      window.__infComp._active++;

      window.__infComp._cbs[this._id] = {
        onToken: function(token) {
          buffer += token;
          if (!started) {
            var idx = buffer.indexOf('<');
            if (idx >= 0) {
              started = true;
              self.innerHTML = '';
              self.style.position = '';
              self.style.minHeight = '';
              contentEl = document.createElement('div');
              contentEl.style.cssText = 'width:100%;';
              self.appendChild(contentEl);
            }
          }
          if (started) scheduleRender();
        },
        onDone: function(html) {
          if (rafId !== null) cancelAnimationFrame(rafId);
          var final = html || buffer;
          // Write directly to self, removing the contentEl wrapper
          self.style.position = '';
          self.style.minHeight = '';
          self.style.overflow = '';
          self.innerHTML = final || '<div style="padding:12px;color:rgba(99,102,241,0.5);font-size:12px;text-align:center;">No content generated</div>';
          contentEl = null;
        },
        onError: function() {
          if (rafId !== null) cancelAnimationFrame(rafId);
          self.innerHTML = '<div style="padding:12px;color:rgba(239,68,68,0.7);font-size:12px;text-align:center;border:1px dashed rgba(239,68,68,0.3);border-radius:0.5rem;">Failed to generate component</div>';
        }
      };

      window.parent.postMessage({
        type: 'generate-component',
        compId: this._id,
        query: this._query,
        style: this._compStyle,
      }, '*');
    }

    disconnectedCallback() {
      if (this._id && window.__infComp && window.__infComp._cbs[this._id]) {
        delete window.__infComp._cbs[this._id];
        window.__infComp._active = Math.max(0, window.__infComp._active - 1);
      }
    }
  }

  customElements.define('inf-component', InfComponent);
})();
`;
}
