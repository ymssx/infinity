// ============================================================
// AI Components — Shared Navigation
// ============================================================

/**
 * Render the top navigation bar and left sidebar.
 * @param {object} opts
 * @param {string} opts.currentPage - Current page id for active state
 * @param {string} opts.basePath   - Relative path prefix to demo root (e.g. '..' or '.')
 */
function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderNav({ currentPage = 'home', basePath = '.' } = {}) {
  // ---------- Top Nav ----------
  const nav = document.createElement('nav');
  nav.className = 'fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200/60 h-14 flex items-center px-6';
  nav.innerHTML = `
    <a href="${basePath}/index.html" class="flex items-center gap-3 text-inherit no-underline">
      <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">AI</div>
      <span class="font-bold text-base">AI Components</span>
      <span class="badge bg-indigo-50 text-indigo-600">v0.1.0</span>
    </a>
    <div class="hidden md:flex items-center gap-1 ml-8">
      <a href="${basePath}/index.html" class="nav-link ${currentPage === 'home' ? 'active' : ''}">首页</a>
      <a href="${basePath}/guide/install.html" class="nav-link ${['install', 'architecture'].includes(currentPage) ? 'active' : ''}">指南</a>
      <div class="nav-dropdown relative">
        <a href="${basePath}/components/ai-component.html" class="nav-link ${['ai-component','ai-data','ai-text','ai-markdown','ai-image','ai-canvas','ai-map','ai-music'].includes(currentPage) ? 'active' : ''}">组件 <span class="nav-arrow">▾</span></a>
        <div class="nav-dropdown-menu absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200/80 py-2 min-w-[200px] opacity-0 invisible transition-all duration-200">
          <a href="${basePath}/components/ai-component.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-component&gt;</code>
            <span class="badge text-[10px] bg-green-50 text-green-600 border border-green-200 ml-auto">可用</span>
          </a>
          <a href="${basePath}/components/ai-data.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-data&gt;</code>
            <span class="badge text-[10px] bg-blue-50 text-blue-600 border border-blue-200 ml-auto">核心</span>
          </a>
          <a href="${basePath}/components/ai-text.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-text&gt;</code>
            <span class="badge text-[10px] bg-green-50 text-green-600 border border-green-200 ml-auto">可用</span>
          </a>
          <a href="${basePath}/components/ai-markdown.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-markdown&gt;</code>
            <span class="badge text-[10px] bg-green-50 text-green-600 border border-green-200 ml-auto">可用</span>
          </a>
          <a href="${basePath}/components/ai-image.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-image&gt;</code>
            <span class="badge text-[10px] bg-green-50 text-green-600 border border-green-200 ml-auto">可用</span>
          </a>
          <a href="${basePath}/components/ai-canvas.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-canvas&gt;</code>
            <span class="badge text-[10px] bg-green-50 text-green-600 border border-green-200 ml-auto">可用</span>
          </a>
          <a href="${basePath}/components/ai-map.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-map&gt;</code>
            <span class="badge text-[10px] bg-green-50 text-green-600 border border-green-200 ml-auto">可用</span>
          </a>
          <a href="${basePath}/components/ai-music.html" class="nav-dropdown-item flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <code class="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">&lt;ai-music&gt;</code>
            <span class="badge text-[10px] bg-green-50 text-green-600 border border-green-200 ml-auto">可用</span>
          </a>
        </div>
      </div>
      <a href="${basePath}/api/index.html" class="nav-link ${currentPage === 'api' ? 'active' : ''}">API</a>
    </div>
    <div class="ml-auto flex items-center gap-4">
      <a href="https://github.com/nicepkg/infinity" target="_blank" class="text-gray-400 hover:text-gray-600 transition-colors text-sm">GitHub</a>
    </div>
  `;
  document.body.prepend(nav);

  // ---------- Left Sidebar ----------
  const SIDEBAR_ITEMS = {
    home: [
      { type: 'title', text: '开始' },
      { href: `${basePath}/index.html`, text: '介绍', page: 'home' },
      { href: `${basePath}/guide/install.html`, text: '安装', page: 'install' },
      { type: 'title', text: '核心概念' },
      { href: `${basePath}/guide/architecture.html`, text: '架构原理', page: 'architecture' },
      { type: 'title', text: '组件' },
      { href: `${basePath}/components/ai-component.html`, text: '<ai-component>', page: 'ai-component', code: true },
      { href: `${basePath}/components/ai-data.html`, text: '<ai-data>', page: 'ai-data', code: true },
      { href: `${basePath}/components/ai-image.html`, text: '<ai-image>', page: 'ai-image', code: true },
      { href: `${basePath}/components/ai-canvas.html`, text: '<ai-canvas>', page: 'ai-canvas', code: true },
      { href: `${basePath}/components/ai-map.html`, text: '<ai-map>', page: 'ai-map', code: true },
      { href: `${basePath}/components/ai-music.html`, text: '<ai-music>', page: 'ai-music', code: true },
      { type: 'title', text: 'API' },
      { href: `${basePath}/api/index.html`, text: 'API 参考', page: 'api' },
    ],
    install: 'home',
    architecture: 'home',
    'ai-component': 'componentSidebar',
    'ai-data': 'componentSidebar',
    'ai-image': 'componentSidebar',
    'ai-canvas': 'componentSidebar',
    'ai-map': 'componentSidebar',
    'ai-music': 'componentSidebar',
    componentSidebar: [
      { type: 'title', text: '组件' },
      { href: `${basePath}/components/ai-component.html`, text: '<ai-component>', page: 'ai-component', code: true },
      { href: `${basePath}/components/ai-data.html`, text: '<ai-data>', page: 'ai-data', code: true },
      { href: `${basePath}/components/ai-image.html`, text: '<ai-image>', page: 'ai-image', code: true },
      { href: `${basePath}/components/ai-canvas.html`, text: '<ai-canvas>', page: 'ai-canvas', code: true },
      { href: `${basePath}/components/ai-map.html`, text: '<ai-map>', page: 'ai-map', code: true },
      { href: `${basePath}/components/ai-music.html`, text: '<ai-music>', page: 'ai-music', code: true },
      { type: 'title', text: '页面内容' },
      { href: '#overview', text: '概览', hash: true },
      { href: '#props', text: '属性', hash: true },
      { href: '#lifecycle', text: '生命周期', hash: true },
      { href: '#nesting', text: '嵌套 & 深度感知', hash: true },
      { href: '#examples', text: '使用示例', hash: true },
      { href: '#playground', text: '🎮 Playground', hash: true },
    ],
    api: [
      { type: 'title', text: 'API 参考' },
      { href: '#api-configure', text: 'configure()', hash: true, code: true },
      { href: '#api-define', text: 'defineAIComponent()', hash: true, code: true },
      { href: '#api-stream', text: 'streamLLM()', hash: true, code: true },
      { href: '#api-dom-builder', text: 'IncrementalDOMBuilder', hash: true, code: true },
      { href: '#api-types', text: '类型定义', hash: true },
      { type: 'title', text: '进阶' },
      { href: '#system-prompt', text: '系统提示词', hash: true },
      { href: '#error-handling', text: '错误处理', hash: true },
      { href: '#bundle-size', text: '产物 & 体积', hash: true },
    ],
  };

  let items = SIDEBAR_ITEMS[currentPage] || SIDEBAR_ITEMS.home;
  // Follow alias
  if (typeof items === 'string') items = SIDEBAR_ITEMS[items];

  const aside = document.createElement('aside');
  aside.className = 'sidebar fixed left-0 top-14 bottom-0 w-56 border-r border-gray-200/60 bg-white/50 backdrop-blur-sm overflow-y-auto py-4 hidden lg:block';

  let html = '';
  for (const item of items) {
    if (item.type === 'title') {
      html += `<div class="section-title">${item.text}</div>`;
    } else if (item.disabled) {
      html += `<a class="!text-gray-400 !italic !cursor-default">${item.text}</a>`;
    } else {
      const isActive = item.hash
        ? false // Hash links get active via IntersectionObserver
        : item.page === currentPage;
      const label = item.code ? `<code>${escapeHTML(item.text)}</code>` : escapeHTML(item.text);
      html += `<a href="${item.href}" class="${isActive ? 'active' : ''}" ${item.hash ? `data-hash="${item.href}"` : ''}>${label}</a>`;
    }
  }
  aside.innerHTML = html;
  document.body.appendChild(aside);

  // ---------- IntersectionObserver for hash-based sidebar ----------
  const hashLinks = aside.querySelectorAll('a[data-hash]');
  if (hashLinks.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          hashLinks.forEach(a => a.classList.remove('active'));
          const link = aside.querySelector(`a[data-hash="#${entry.target.id}"]`);
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -60% 0px' });

    document.querySelectorAll('section[id]').forEach(sec => observer.observe(sec));
  }
}

/**
 * Copy code from a code block
 */
export function copyCode(btn) {
  const pre = btn.parentElement;
  const code = pre.textContent.replace('复制', '').trim();
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '已复制 ✓';
    setTimeout(() => btn.textContent = '复制', 1500);
  });
}

// Expose globally
window.copyCode = copyCode;
